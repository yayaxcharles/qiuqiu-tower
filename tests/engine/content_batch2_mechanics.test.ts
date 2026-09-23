import { describe, expect, it } from 'vitest';
import { STARTER_DECK, starterDeckFor } from '../../src/content/cards';
import { relicById, relicLongText, relics, setCount } from '../../src/content/relics';
import { dazeTarget } from '../../src/engine/actions';
import { canUsePotion, endTurn, playCard, resolveChoice, startCombat, usePotion } from '../../src/engine/combat';
import type { Hero } from '../../src/engine/hero';
import { rollPotion, rollRelic, rollRelicChoices, rollRewards } from '../../src/engine/rewards';
import { Rng, seedFromString } from '../../src/engine/rng';
import {
  addPotion, beginCombat, buyCard, buyPotion, buyRelic, buyRemove, chooseNode, finishCombat, makeShop, makeShops, newCoopRun, newRun,
  openChest, openChestCoop, potionCapacity, priceFor, removePrice, reshuffleShop, rollActRelics, takeRelic, tickNodeCounters, type ShopStock,
} from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import { getStatus } from '../../src/engine/statuses';
import type { CombatState, EnemyMove, RunState } from '../../src/engine/types';
import { combatFingerprint, runFingerprint } from '../../src/net/hash';
import { inst } from '../helpers';

/**
 * 內容擴充第二批的新機制（2026-09-23，提案第⑤節第二批＋事件劇本第八節）：
 * 計數型（每 N 回合、每回合第 N 張、跨場計數）、角色的五個新時機、兩個限定池、師門套組、四支新忍具的效果。
 * 每一條都照牌面文字驗「真的發動」與「條件不到不發動」；跨場計數另有存檔與連線的那幾條在 `content_batch2_save.test.ts`。
 */
const HIT = (n: number, times = 1): EnemyMove => ({ intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: n, times }] });
const IDLE: EnemyMove = { intent: 'block', label: '硬撐', effects: [{ kind: 'block', amount: 1 }] };

let uid = 90_000;
function start(relicIds: string[], o: { encounterId?: string; hero?: Hero; deck?: string[]; counters?: Record<string, number>; potions?: string[] } = {}): CombatState {
  const deck = (o.deck ?? [...(o.hero ? starterDeckFor(o.hero) : STARTER_DECK)]).map((id) => inst(id, uid++));
  return startCombat({ hp: 70, maxHp: 70, deck, relics: relicIds, potions: o.potions ?? [], encounterId: o.encounterId ?? 'wood_dummy',
    rng: new Rng(seedFromString('batch2')), ...(o.hero ? { hero: o.hero } : {}), ...(o.counters ? { counters: o.counters } : {}) });
}
function toHand(cs: CombatState, cardId: string, seat = 0): number {
  const p = cs.players[seat]!;
  for (const pile of [p.hand, p.drawPile, p.discardPile]) {
    const i = pile.findIndex((c) => c.cardId === cardId);
    if (i >= 0) { const [c] = pile.splice(i, 1); p.hand.unshift(c!); return c!.uid; }
  }
  const c = inst(cardId, uid++);
  p.hand.unshift(c);
  return c.uid;
}
function quiet(cs: CombatState, move: EnemyMove = IDLE): void { for (const e of cs.enemies) e.move = move; }
/** 把魔物血量墊高、防禦清掉，量傷害用 */
function tank(cs: CombatState): void { for (const e of cs.enemies) { e.hp = e.maxHp = 500; e.block = 0; e.statuses = {}; } }

describe('計數型：木人樁（攻擊牌跨戰鬥累計，第 10 張加倍）', () => {
  it('前 9 張照常、第 10 張加倍、計數歸零', () => {
    const cs = start(['wooden_dummy']);
    tank(cs); quiet(cs);
    const e = cs.enemies[0]!;
    const p = cs.player;
    for (let i = 0; i < 9; i++) {
      p.energy = 3;
      const hp = e.hp;
      playCard(cs, toHand(cs, 'sanjo'), e.uid);
      expect(hp - e.hp, `第 ${i + 1} 張`).toBe(6);
    }
    expect(p.relicCounters?.['wooden_dummy']).toBe(9);
    p.energy = 3;
    const hp = e.hp;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(hp - e.hp, '第 10 張').toBe(12);
    expect(p.relicCounters?.['wooden_dummy']).toBe(0);
    expect(cs.relicFired).toContain('wooden_dummy');
  });

  it('技能牌不算；計數從整局接過來（上一場數到 9，這場第一張攻擊就加倍）', () => {
    const cs = start(['wooden_dummy'], { counters: { wooden_dummy: 9 } });
    tank(cs); quiet(cs);
    const e = cs.enemies[0]!;
    playCard(cs, toHand(cs, 'tanding'));
    expect(cs.player.relicCounters?.['wooden_dummy']).toBe(9);
    const hp = e.hp;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(hp - e.hp).toBe(12);
  });

  it('打完寫回整局：下一場接著數', () => {
    const run = newRun('dummy-carry', 1, 'ninja');
    takeRelic(run, 'wooden_dummy');
    const cs = beginCombat(run, 'wood_dummy');
    quiet(cs);
    const e = cs.enemies[0]!;
    for (let i = 0; i < 3; i++) { cs.player.energy = 3; playCard(cs, toHand(cs, 'sanjo'), e.uid); }
    e.hp = 0; e.dead = true; cs.phase = 'won';
    finishCombat(run, cs);
    expect(me(run).counters?.['wooden_dummy']).toBe(3);
    const cs2 = beginCombat(run, 'wood_dummy');
    expect(cs2.player.relicCounters?.['wooden_dummy']).toBe(3);
  });
});

describe('計數型：每 N 回合（沙漏、線香）', () => {
  it('沙漏：第 3、6 回合開始多 1 顆飯糰，其他回合沒有', () => {
    const cs = start(['hourglass']);
    quiet(cs);
    const got: number[] = [cs.player.energy];
    for (let t = 2; t <= 6; t++) { endTurn(cs); got.push(cs.player.energy); }
    expect(got).toEqual([3, 3, 4, 3, 3, 4]);
  });
  it('線香：第 4 回合開始獲得 1 層隱身', () => {
    const cs = start(['incense_stick']);
    quiet(cs);
    const got: number[] = [getStatus(cs.player, '隱身')];
    for (let t = 2; t <= 4; t++) { endTurn(cs); got.push(getStatus(cs.player, '隱身')); }
    expect(got).toEqual([0, 0, 0, 1]);
    expect(cs.relicFired.filter((x) => x === 'incense_stick')).toHaveLength(1);
  });
});

describe('計數型：暗器匣（每回合第 3 張牌打完，對隨機一隻 5 點）', () => {
  it('第 3 張之後才打、而且不吃爪力；第 4 張不再打', () => {
    const cs = start(['dart_case']);
    tank(cs); quiet(cs);
    const e = cs.enemies[0]!;
    cs.player.statuses['爪力'] = 5;
    cs.player.energy = 9;
    playCard(cs, toHand(cs, 'tanding'));
    playCard(cs, toHand(cs, 'tanding'));
    expect(e.hp).toBe(500);
    playCard(cs, toHand(cs, 'tanding'));
    expect(500 - e.hp).toBe(5);
    playCard(cs, toHand(cs, 'tanding'));
    expect(500 - e.hp).toBe(5);
    expect(cs.relicFired.filter((x) => x === 'dart_case')).toHaveLength(1);
  });
});

describe('計數型：撲滿（走進 3 個不是戰鬥的格子得 40 條，跨關）', () => {
  it('三格才給、給完歸零；戰鬥格不算', () => {
    const run = newRun('piggy', 1, 'ninja');
    takeRelic(run, 'piggy_bank');
    const fish = me(run).fish;
    tickNodeCounters(run); tickNodeCounters(run);
    expect(me(run).counters?.['piggy_bank']).toBe(2);
    expect(me(run).fish).toBe(fish);
    tickNodeCounters(run);
    expect(me(run).counters?.['piggy_bank']).toBe(0);
    expect(me(run).fish).toBe(fish + 40);
  });
  it('`chooseNode` 走進事件、罐頭鋪、貓窩、紙箱才數，戰鬥格不數', () => {
    const run = newRun('piggy-walk', 1, 'ninja');
    takeRelic(run, 'piggy_bank');
    let counted = 0; let fights = 0;
    for (let step = 0; step < 15 && run.status === 'playing'; step++) {
      const n = (run.currentNode ? run.map.nodes.find((x) => x.id === run.currentNode)!.next : run.map.start)
        .map((id) => run.map.nodes.find((x) => x.id === id)!)[0]!;
      const before = me(run).counters?.['piggy_bank'] ?? 0;
      chooseNode(run, n.id);
      const after = me(run).counters?.['piggy_bank'] ?? 0;
      if (n.type === '戰鬥' || n.type === '大魔物' || n.type === '塔主') { fights += 1; expect(after, n.type).toBe(before); }
      else { counted += 1; expect(after, n.type).toBe((before + 1) % 3); }
    }
    expect(counted, '樣本裡要真的走過不是戰鬥的格子').toBeGreaterThan(0);
    expect(fights).toBeGreaterThan(0);
  });
});

describe('角色的新時機', () => {
  // 門檻 10（主控 2026-09-23 從 12 降下來）
  it('滿月劍意：蓄氣蓄到 10 點以上的那一刻，這回合下一張攻擊加倍（每回合一次、已經在 10 以上的不算）', () => {
    const cs = start(['full_moon_sword'], { hero: 'fengfeng' });
    tank(cs); quiet(cs);
    const p = cs.player;
    p.qi = 6; p.energy = 9;
    playCard(cs, toHand(cs, 'fengfeng_tuna'));   // 6 → 9：還沒到
    expect(p.doubleNext).toBe(0);
    playCard(cs, toHand(cs, 'fengfeng_tuna'));   // 9 → 12：跨過 10
    expect(p.doubleNext).toBe(1);
    expect(cs.relicFired).toContain('full_moon_sword');
    // 同一回合再跨一次不再發（每回合一次）
    p.qi = 7; p.doubleNext = 0;
    playCard(cs, toHand(cs, 'fengfeng_tuna'));
    expect(p.doubleNext).toBe(0);
    // 下一回合：已經在 10 以上再加不算
    endTurn(cs);
    p.qi = 10; p.energy = 3;
    playCard(cs, toHand(cs, 'fengfeng_tuna'));
    expect(p.doubleNext).toBe(0);
    // 下一回合：7 → 10 剛好到門檻就算
    endTurn(cs);
    p.qi = 7; p.energy = 3;
    playCard(cs, toHand(cs, 'fengfeng_tuna'));
    expect(p.qi).toBe(10);
    expect(p.doubleNext).toBe(1);
  });

  it('收鞘墜：這場每花掉 6 點蓄氣得 1 顆飯糰（零頭留著）', () => {
    const cs = start(['sheath_pendant'], { hero: 'fengfeng' });
    tank(cs); quiet(cs);
    const p = cs.player;
    const e = cs.enemies[0]!;
    p.qi = 12; p.energy = 9;
    playCard(cs, toHand(cs, 'fengfeng_pingzhan'), e.uid);   // 花 2
    playCard(cs, toHand(cs, 'fengfeng_pingzhan'), e.uid);   // 花 2（累計 4）
    expect(p.energy).toBe(7);
    expect(p.qiSpentAcc).toBe(4);
    playCard(cs, toHand(cs, 'fengfeng_pingzhan'), e.uid);   // 花 2（累計 6）→ +1
    expect(p.energy).toBe(7);   // 花 1 顆、拿回 1 顆
    expect(p.qiSpentAcc).toBe(0);
    expect(cs.relicFired).toContain('sheath_pendant');
  });

  it('五毒譜：你下的毒每回合多扣 2 點；沒帶就照層數', () => {
    for (const [relicIds, want] of [[['five_poison_manual'], 7], [[], 5]] as const) {
      const cs = start([...relicIds]);
      tank(cs); quiet(cs);
      const e = cs.enemies[0]!;
      e.statuses['中毒'] = 5; e.poisonedBy = 0;
      endTurn(cs);
      expect(500 - e.hp, relicIds.join() || '沒帶').toBe(want);
    }
  });

  it('五毒譜在連線時看「下毒的那一位」帶不帶', () => {
    const run = newCoopRun('five-poison', 1, 'ninja', 'feifei');
    takeRelic(run, 'five_poison_manual', 1);
    const cs = beginCombat(run, 'wood_dummy');
    tank(cs); quiet(cs);
    const e = cs.enemies[0]!;
    e.statuses['中毒'] = 5; e.poisonedBy = 0;
    for (const p of cs.players) p.ready = true;
    endTurn(cs);
    expect(500 - e.hp, '座位 0 下的毒，座位 1 的秘寶不加').toBe(5);
    e.statuses['中毒'] = 5; e.poisonedBy = 1; e.hp = 500;
    endTurn(cs);
    expect(500 - e.hp, '座位 1 下的毒').toBe(7);
  });

  it('鐵壁：回合結束蜷縮超過 15 的部分每 2 點換 1 點反彈，蜷縮不減；15 以下不發', () => {
    const cs = start(['iron_wall'], { hero: 'dangdang' });
    quiet(cs);
    cs.player.block = 25;
    cs.player.statuses = {};
    endTurn(cs);
    expect(getStatus(cs.player, '反彈')).toBe(5);
    const cs2 = start(['iron_wall'], { hero: 'dangdang' });
    quiet(cs2);
    cs2.player.block = 15; cs2.player.statuses = {};
    endTurn(cs2);
    expect(getStatus(cs2.player, '反彈')).toBe(0);
  });

  it('鐵壁：量的是回合結束那一刻（魔物還沒打），蜷縮本身一點都沒少', () => {
    const cs = start(['iron_wall', 'guard_charm'], { hero: 'dangdang' });
    quiet(cs);
    cs.player.block = 21; cs.player.statuses = {};
    endTurn(cs);
    expect(getStatus(cs.player, '反彈')).toBe(3);
    expect(cs.player.block, '守護符留 8 點＝沒被鐵壁吃掉').toBe(8);
  });

  it('影分身卷軸：每閃過一下，下回合多抽 1 張、多 1 顆飯糰', () => {
    const cs = start(['clone_scroll']);
    quiet(cs, HIT(10, 2));
    cs.player.statuses['隱身'] = 2; cs.player.block = 0;
    endTurn(cs);
    expect(cs.player.hand).toHaveLength(7);
    expect(cs.player.energy).toBe(5);
    expect(cs.relicFired.filter((x) => x === 'clone_scroll')).toHaveLength(2);
    // 對照：沒帶就是 5 張
    const plain = start([]);
    quiet(plain, HIT(10, 2));
    plain.player.statuses['隱身'] = 2; plain.player.block = 0;
    endTurn(plain);
    expect(plain.player.hand).toHaveLength(5);
  });
});

describe('師門套組（集到任兩件：每場戰鬥第一回合多 1 顆飯糰）', () => {
  it('一件沒有、兩件有、三件不再加', () => {
    expect(start(['master_hat']).player.energy).toBe(3);
    expect(start(['master_hat', 'master_gourd']).player.energy).toBe(4);
    expect(start(['master_hat', 'master_gourd', 'master_wooden_sword']).player.energy).toBe(4);
    expect(start(['master_wooden_sword', 'master_gourd']).player.energy).toBe(4);
  });
  it('只有第一回合；說明寫得出集到幾件', () => {
    const cs = start(['master_hat', 'master_wooden_sword']);
    quiet(cs);
    endTurn(cs);
    expect(cs.player.energy).toBe(3);
    const hat = relicById['master_hat']!;
    expect(relicLongText(hat, ['master_hat'])).toContain('【師門 1／3】');
    expect(relicLongText(hat, ['master_hat', 'master_gourd'])).toContain('【師門 2／3】');
    expect(relicLongText(relicById['tuna_can']!, ['master_hat'])).toBe(relicById['tuna_can']!.text);
    expect(setCount('師門', ['master_hat', 'master_wooden_sword', 'tuna_can'])).toBe(2);
  });
});

describe('兩個限定池不進一般抽法', () => {
  const LIMITED = relics.filter((r) => r.pool === '罐頭鋪' || r.pool === '事件').map((r) => r.id);
  it('限定池各 3 件', () => {
    expect(relics.filter((r) => r.pool === '罐頭鋪').map((r) => r.id).sort()).toEqual(['bulk_crate', 'member_card', 'shop_ledger']);
    expect(relics.filter((r) => r.pool === '事件').map((r) => r.id).sort()).toEqual(['bandit_iou', 'master_wooden_sword', 'miasma_shard']);
  });
  it('紙箱、戰利品、過關三選一、罐頭鋪一般貨架抽 400 次都抽不到', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const rng = new Rng(seedFromString(`limited-${i}`));
      for (const pool of ['常見', '大魔物', '塔主'] as const) {
        const id = rollRelic(rng, pool, [], ['ninja']); if (id) seen.add(id);
        for (const x of rollRelicChoices(rng, pool, [[], []], 2, ['ninja', 'feifei'])) seen.add(x);
      }
      const r = rollRewards(rng, '大魔物', [], 0); if (r.relic) seen.add(r.relic);
      const run = newRun(`limited-run-${i}`, 1, 'ninja');
      const chest = openChest(run); if (chest) seen.add(chest);
      for (const x of rollActRelics(run)) seen.add(x);
      if (i < 40) for (const it of makeShop(run).relics) if (!it.limited) seen.add(it.id);
    }
    expect(LIMITED.filter((id) => seen.has(id))).toEqual([]);
    const coop = newCoopRun('limited-coop', 1, 'ninja', 'feifei');
    for (let i = 0; i < 40; i++) for (const x of openChestCoop(coop)) expect(LIMITED).not.toContain(x);
  });
  it('事件限定的三件連店長私藏都不會擺', () => {
    for (let i = 0; i < 80; i++) {
      const run = newRun(`shop-ev-${i}`, 1, 'ninja');
      for (const it of makeShop(run).relics) expect(relicById[it.id]?.pool, it.id).not.toBe('事件');
    }
  });
});

describe('罐頭鋪限定：店長私藏那一格', () => {
  it('大約一半的店有、擺在秘寶最右邊、是罐頭鋪限定池的', () => {
    let have = 0; const N = 200;
    for (let i = 0; i < N; i++) {
      const shop = makeShop(newRun(`limited-shelf-${i}`, 1, 'ninja'));
      const lim = shop.relics.filter((r) => r.limited);
      expect(lim.length).toBeLessThanOrEqual(1);
      if (!lim.length) continue;
      have += 1;
      expect(shop.relics[shop.relics.length - 1]!.limited).toBe(true);
      expect(relicById[lim[0]!.id]!.pool).toBe('罐頭鋪');
    }
    expect(have / N).toBeGreaterThan(0.38);
    expect(have / N).toBeLessThan(0.62);
  });
  it('身上有的、這一局在罐頭鋪買過的不再擺；三件都拿了就不擺、也不擲骰', () => {
    const run = newRun('limited-bought', 1, 'ninja');
    me(run).fish = 9999;
    const seen = new Set<string>();
    let shop: ShopStock | undefined;
    for (let i = 0; i < 60; i++) {
      shop = makeShop(run);
      const k = shop.relics.findIndex((r) => r.limited);
      if (k < 0) continue;
      const id = shop.relics[k]!.id;
      expect(seen.has(id), `${id} 買過了又擺出來`).toBe(false);
      expect(buyRelic(run, shop, k)).toBe(true);
      seen.add(id);
      // 被拿走（事件交出秘寶）也不再擺
      me(run).relics = me(run).relics.filter((x) => x !== id);
    }
    expect([...seen].sort()).toEqual(['bulk_crate', 'member_card', 'shop_ledger']);
    const rngBefore = { ...run.rng };
    const a = makeShop(run);
    expect(a.relics.some((r) => r.limited)).toBe(false);
    void rngBefore;
  });
  it('重整貨架：私藏那一格照舊從限定池換、還是私藏', () => {
    for (let i = 0; i < 60; i++) {
      const run = newRun(`limited-shuffle-${i}`, 1, 'ninja');
      me(run).fish = 999;
      const shop = makeShop(run);
      const k = shop.relics.findIndex((r) => r.limited);
      if (k < 0) continue;
      expect(reshuffleShop(run, shop)).toBe(true);
      expect(shop.relics[k]!.limited).toBe(true);
      expect(relicById[shop.relics[k]!.id]!.pool).toBe('罐頭鋪');
      return;
    }
    throw new Error('樣本裡沒有私藏');
  });
});

describe('罐頭鋪限定三件的效果', () => {
  function shopWith(relicIds: string[], seed = 'lim-fx'): { run: RunState; shop: ShopStock } {
    const run = newRun(seed, 1, 'ninja');
    for (const id of relicIds) takeRelic(run, id);
    me(run).fish = 999;
    return { run, shop: makeShop(run) };
  }
  it('會員卡：放生一律 40 條、不再漲；卡被拿走就照原本的數接著漲', () => {
    const { run } = shopWith(['member_card']);
    const cost = me(run).removeCost;
    expect(removePrice(run)).toBe(40);
    const fish = me(run).fish;
    expect(buyRemove(run, me(run).deck[0]!.uid)).toBe(true);
    expect(buyRemove(run, me(run).deck[0]!.uid)).toBe(true);
    expect(fish - me(run).fish).toBe(80);
    expect(me(run).removeCost).toBe(cost);
    me(run).relics = me(run).relics.filter((id) => id !== 'member_card');
    expect(removePrice(run)).toBe(cost);
    const plain = newRun('lim-fx', 1, 'ninja');
    me(plain).fish = 999;
    buyRemove(plain, me(plain).deck[0]!.uid);
    expect(me(plain).removeCost).toBe(cost + 25);
  });
  it('店主的帳本：每間店買的第一件半價（牌、秘寶、忍具都算），買過之後恢復原價；下一間店又有一次', () => {
    const { run, shop } = shopWith(['shop_ledger']);
    const card = shop.cards[1]!;
    const full = Math.round(card.base * (card.sale ?? 1));
    expect(priceFor(run, card, 0, shop)).toBe(Math.round(card.base * 0.5 * (card.sale ?? 1)));
    const fish = me(run).fish;
    expect(buyCard(run, shop, 1)).toBe(true);
    expect(fish - me(run).fish).toBe(Math.round(card.base * 0.5 * (card.sale ?? 1)));
    expect(shop.anyBought).toBe(true);
    const pot = shop.potions[0]!;
    expect(priceFor(run, pot, 0, shop)).toBe(Math.round(pot.base * (pot.sale ?? 1)));
    expect(pot.price, '買過之後整間店重標').toBe(Math.round(pot.base * (pot.sale ?? 1)));
    void full;
    const next = makeShop(run);
    expect(priceFor(run, next.potions[0]!, 0, next)).toBe(Math.round(next.potions[0]!.base * 0.5 * (next.potions[0]!.sale ?? 1)));
  });
  it('店主的帳本：放生不算第一件、也不打折', () => {
    const { run, shop } = shopWith(['shop_ledger']);
    const cost = me(run).removeCost;
    const fish = me(run).fish;
    buyRemove(run, me(run).deck[0]!.uid);
    expect(fish - me(run).fish).toBe(cost);
    expect(shop.anyBought).toBeFalsy();
  });
  it('批發箱：忍具多帶 2 支、罐頭鋪的忍具半價（牌與秘寶不折）', () => {
    const { run, shop } = shopWith(['bulk_crate']);
    expect(potionCapacity(run)).toBe(5);
    for (const it of shop.potions) expect(priceFor(run, it, 0, shop)).toBe(Math.round(it.base * 0.5 * (it.sale ?? 1)));
    for (const it of shop.cards) expect(priceFor(run, it, 0, shop)).toBe(Math.round(it.base * (it.sale ?? 1)));
    const fish = me(run).fish;
    const it = shop.potions[0]!;
    const price = priceFor(run, it, 0, shop);
    expect(buyPotion(run, shop, 0)).toBe(true);
    expect(fish - me(run).fish).toBe(price);
  });
  it('帳本＋批發箱＋零錢罐相乘、只四捨五入一次', () => {
    const { run, shop } = shopWith(['shop_ledger', 'bulk_crate', 'coin_jar']);
    const it = shop.potions[0]!;
    expect(priceFor(run, it, 0, shop)).toBe(Math.round(it.base * 0.8 * 0.5 * 0.5 * (it.sale ?? 1)));
  });
});

describe('事件限定三件', () => {
  it('山賊的欠條：每間罐頭鋪走進去先付 10 條（不夠付到 0）；打贏多拿 25 條', () => {
    const run = newRun('iou', 1, 'ninja');
    takeRelic(run, 'bandit_iou');
    me(run).fish = 50;
    const shop = makeShop(run);
    expect(me(run).fish).toBe(40);
    expect(shop.entryFee).toBe(10);
    me(run).fish = 4;
    expect(makeShop(run).entryFee).toBe(4);
    expect(me(run).fish).toBe(0);
    expect(relicById['bandit_iou']!.hooks.winGold).toBe(25);
    const plain = newRun('iou', 1, 'ninja');
    me(plain).fish = 50;
    expect(makeShop(plain).entryFee).toBeUndefined();
    expect(me(plain).fish).toBe(50);
  });
  it('連線：各付各的（每一位的貨架各算）', () => {
    const run = newCoopRun('iou-coop', 1, 'ninja', 'feifei');
    takeRelic(run, 'bandit_iou', 1);
    const fish = run.players.map((p) => p.fish);
    const shops = makeShops(run);
    expect(run.players.map((p, i) => fish[i]! - p.fish)).toEqual([0, 10]);
    expect(shops.map((s) => s.entryFee ?? 0)).toEqual([0, 10]);
  });
  it('魔氣殘片：最大生命 +15、開場 1 層炸毛；師父的舊木劍：開場 1 點爪力與 4 點蜷縮', () => {
    const run = newRun('shard', 1, 'ninja');
    const max = me(run).maxHp;
    takeRelic(run, 'miasma_shard');
    expect(me(run).maxHp).toBe(max + 15);
    expect(getStatus(start(['miasma_shard']).player, '炸毛')).toBe(1);
    // 分開量：炸毛會讓拿到的蜷縮少一截，兩件一起帶時木劍那 4 點只剩 3
    const cs = start(['master_wooden_sword']);
    expect(getStatus(cs.player, '爪力')).toBe(1);
    expect(cs.player.block).toBe(4);
  });
});

describe('四支新忍具', () => {
  it('便當：下回合開始多 2 顆飯糰；喝兩個疊成 4', () => {
    const cs = start([], { potions: ['bento', 'bento'] });
    quiet(cs);
    expect(usePotion(cs, 'bento')).toBe(true);
    expect(cs.player.energy).toBe(3);
    expect(cs.player.energyNextTurn).toBe(2);
    endTurn(cs);
    expect(cs.player.energy).toBe(5);
    expect(cs.player.energyNextTurn).toBeUndefined();
    endTurn(cs);
    expect(cs.player.energy).toBe(3);
    usePotion(cs, 'bento');
    const cs2 = start([], { potions: ['bento', 'bento'] });
    quiet(cs2);
    usePotion(cs2, 'bento'); usePotion(cs2, 'bento');
    endTurn(cs2);
    expect(cs2.player.energy).toBe(7);
  });

  it('回魂香：這場第一次會被打倒時留 1 血，第二次就倒；跟最後一口氣各算一次（秘寶先用）', () => {
    const cs = start([], { potions: ['revive_incense'] });
    quiet(cs, HIT(200));
    usePotion(cs, 'revive_incense');
    expect(cs.player.guardLethal).toBe(true);
    endTurn(cs);
    expect(cs.player.hp).toBe(1);
    expect(cs.phase).toBe('player');
    expect(cs.player.guardLethal).toBeFalsy();
    endTurn(cs);
    expect(cs.phase).toBe('lost');

    const both = start(['last_breath'], { potions: ['revive_incense'] });
    quiet(both, HIT(200));
    usePotion(both, 'revive_incense');
    endTurn(both);
    expect(both.player.hp).toBe(1);
    expect(both.player.guardLethal, '秘寶那一次先用，香還留著').toBe(true);
    endTurn(both);
    expect(both.player.hp).toBe(1);
    expect(both.phase).toBe('player');
  });

  it('照妖鏡：拔掉全體魔物的隱身、潛水與虛化', () => {
    const cs = start([], { encounterId: 'rats3', potions: ['demon_mirror'] });
    for (const e of cs.enemies) { e.statuses['隱身'] = 2; e.statuses['虛化'] = 1; e.statuses['潛水'] = 1; e.statuses['爪力'] = 2; }
    expect(usePotion(cs, 'demon_mirror')).toBe(true);
    for (const e of cs.enemies) {
      expect([getStatus(e, '隱身'), getStatus(e, '潛水'), getStatus(e, '虛化')]).toEqual([0, 0, 0]);
      expect(getStatus(e, '爪力'), '別的狀態不動').toBe(2);
    }
  });

  it('傳功丹：一個人時自己抽 2、多 1 顆飯糰；兩個人時同伴抽 2', () => {
    const cs = start([], { potions: ['transfer_pill'] });
    const hand = cs.player.hand.length;
    usePotion(cs, 'transfer_pill');
    expect(cs.player.hand.length).toBe(hand + 2);
    expect(cs.player.energy).toBe(4);
    const run = newCoopRun('pill-coop', 1, 'ninja', 'dangdang');
    addPotion(run, 'transfer_pill', 0);
    const c2 = beginCombat(run, 'wood_dummy');
    const [a, b] = c2.players;
    const ha = a!.hand.length, hb = b!.hand.length;
    expect(usePotion(c2, 'transfer_pill', undefined, 0)).toBe(true);
    expect([a!.hand.length - ha, b!.hand.length - hb, a!.energy]).toEqual([0, 2, 4]);
  });

  it('替換符：挑一張手牌，換成一張隨機的升級忍術牌（新編號、這場戰鬥有效）；手上沒牌喝不下去', () => {
    const cs = start([], { potions: ['swap_talisman'] });
    const target = cs.player.hand[0]!;
    const n = cs.player.hand.length;
    expect(usePotion(cs, 'swap_talisman')).toBe(true);
    expect(cs.pending?.purpose).toBe('transform');
    expect(resolveChoice(cs, [target.uid])).toBe(true);
    expect(cs.player.hand).toHaveLength(n);
    const fresh = cs.player.hand[0]!;
    expect(fresh.uid).not.toBe(target.uid);
    expect(fresh.upgraded).toBe(true);
    expect(fresh.cardId).not.toBe(target.cardId);
    expect(cs.player.hand.some((c) => c.uid === target.uid)).toBe(false);
    const empty = start([], { potions: ['swap_talisman'] });
    empty.player.hand = [];
    expect(canUsePotion(empty, 'swap_talisman')).toBe(false);
  });

  it('替換符：兩台用同一顆種子換出同一張（戰鬥亂數）', () => {
    const pick = (): string => {
      const cs = start([], { potions: ['swap_talisman'] });
      usePotion(cs, 'swap_talisman');
      resolveChoice(cs, [cs.player.hand[0]!.uid]);
      return cs.player.hand[0]!.cardId;
    };
    expect(pick()).toBe(pick());
  });
});

describe('迷魂香（目標這一輪的攻擊改打牠旁邊的同伴）', () => {
  it('三隻老鼠：中間那隻的攻擊打到右手邊那一隻，你一點血都沒掉；下一輪就散了', () => {
    const cs = start([], { encounterId: 'rats3', potions: ['daze_incense'] });
    const [a, b, c] = cs.enemies;
    for (const e of cs.enemies) { e.hp = e.maxHp = 50; e.block = 0; e.statuses = {}; e.move = IDLE; }
    b!.move = HIT(9);
    cs.player.block = 0;
    const hp = cs.player.hp;
    expect(usePotion(cs, 'daze_incense', b!.uid)).toBe(true);
    expect(getStatus(b!, '迷魂')).toBe(1);
    expect(dazeTarget(cs, b!)).toBe(c);
    endTurn(cs);
    expect(cs.player.hp).toBe(hp);
    expect(50 - c!.hp).toBe(9);
    expect(a!.hp).toBe(50);
    expect(getStatus(b!, '迷魂'), '只撐這一輪').toBe(0);
    expect(b!.dazedBy).toBeUndefined();
  });
  it('最右邊那隻打左手邊最近的；右邊的倒了就往左找', () => {
    const cs = start([], { encounterId: 'rats3' });
    const [a, b, c] = cs.enemies;
    expect(dazeTarget(cs, c!)).toBe(b);
    b!.dead = true;
    expect(dazeTarget(cs, c!)).toBe(a);
    expect(dazeTarget(cs, a!)).toBe(c);
  });
  it('沒有同伴就打空：你照樣不掉血', () => {
    const cs = start([], { potions: ['daze_incense'] });
    const e = cs.enemies[0]!;
    e.move = HIT(12, 2);
    cs.player.block = 0;
    const hp = cs.player.hp;
    usePotion(cs, 'daze_incense', e.uid);
    endTurn(cs);
    expect(cs.player.hp).toBe(hp);
    expect(cs.log.some((l) => l.includes('打空了'))).toBe(true);
  });
  it('攻擊以外的效果（給你減益）照樣落在你身上', () => {
    const cs = start([], { encounterId: 'rats3', potions: ['daze_incense'] });
    const b = cs.enemies[1]!;
    for (const e of cs.enemies) e.move = IDLE;
    b.move = { intent: 'attack', label: '咬', effects: [{ kind: 'damage', amount: 5 }, { kind: 'statusPlayer', name: '翻肚', amount: 1 }] };
    usePotion(cs, 'daze_incense', b.uid);
    endTurn(cs);
    expect(getStatus(cs.player, '翻肚')).toBeGreaterThan(0);
  });
  it('連線：打倒同伴時擊倒獎勵算下香的那一位（座位 1）', () => {
    const run = newCoopRun('daze-coop', 1, 'ninja', 'feifei');
    takeRelic(run, 'coin_sword', 1);   // 打倒一隻多拿 8 條：看是誰拿到
    addPotion(run, 'daze_incense', 1);
    const cs = beginCombat(run, 'rats3');
    const [, b, c] = cs.enemies;
    for (const e of cs.enemies) { e.move = IDLE; e.block = 0; e.statuses = {}; }
    b!.move = HIT(30); c!.hp = 3;
    expect(usePotion(cs, 'daze_incense', b!.uid, 1)).toBe(true);
    expect(b!.dazedBy).toBe(1);
    for (const p of cs.players) p.ready = true;
    const fish = cs.players.map((p) => p.fishDelta);
    endTurn(cs);
    expect(c!.dead).toBe(true);
    expect(cs.players.map((p, i) => p.fishDelta - fish[i]!)).toEqual([0, 8]);
  });
});

describe('連線指紋收進新的戰鬥狀態（有才串）', () => {
  it('便當、回魂香、木人樁計數、收鞘墜零頭、滿月劍意、迷魂香的座位：改一個就換指紋', () => {
    const cs = start([]);
    const base = combatFingerprint(cs);
    const p = cs.player;
    const probes: [string, () => void, () => void][] = [
      ['便當', () => { p.energyNextTurn = 2; }, () => { p.energyNextTurn = undefined; }],
      ['回魂香', () => { p.guardLethal = true; }, () => { p.guardLethal = undefined; }],
      ['木人樁', () => { p.relicCounters = { wooden_dummy: 3 }; }, () => { delete p.relicCounters; }],
      ['收鞘墜', () => { p.qiSpentAcc = 4; }, () => { p.qiSpentAcc = undefined; }],
      ['滿月劍意', () => { p.fullMoonTurn = 1; }, () => { p.fullMoonTurn = undefined; }],
      ['迷魂香', () => { cs.enemies[0]!.dazedBy = 1; }, () => { delete cs.enemies[0]!.dazedBy; }],
      ['迷魂狀態', () => { cs.enemies[0]!.statuses['迷魂'] = 1; }, () => { delete cs.enemies[0]!.statuses['迷魂']; }],
    ];
    for (const [name, on, off] of probes) {
      on();
      expect(combatFingerprint(cs), name).not.toBe(base);
      off();
      expect(combatFingerprint(cs), `${name} 拿掉之後回到原樣`).toBe(base);
    }
  });
  it('整局指紋收跨場計數與店長私藏買過的旗標；空的計數表不改指紋', () => {
    const run = newRun('fp-run', 1, 'ninja');
    const base = runFingerprint(run);
    me(run).counters = {};
    expect(runFingerprint(run)).toBe(base);
    me(run).counters = { piggy_bank: 1 };
    expect(runFingerprint(run)).not.toBe(base);
    delete me(run).counters;
    run.flags['shop_bought:0:member_card'] = true;
    expect(runFingerprint(run)).not.toBe(base);
  });
});

describe('新忍具都抽得到、照稀有度分級', () => {
  it('抽四萬次，六支都出現過', () => {
    const rng = new Rng(seedFromString('batch2-potions'));
    const seen = new Set<string>();
    for (let i = 0; i < 40_000; i++) seen.add(rollPotion(rng, ['ninja']));
    for (const id of ['revive_incense', 'bento', 'demon_mirror', 'transfer_pill', 'swap_talisman', 'daze_incense']) expect(seen.has(id), id).toBe(true);
  });
});
