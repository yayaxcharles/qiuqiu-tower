import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { relicById } from '../../src/content/relics';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import type { Hero } from '../../src/engine/hero';
import { Rng, seedFromString } from '../../src/engine/rng';
import {
  beginCombat, buyRemove, finishCombat, makeShop, makeShops, napHeal, newCoopRun, newRun, priceFor, rest, revivePartner, shopMulFor, takeRelic,
} from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import { napWorks } from '../../src/engine/smartbot';
import { getStatus } from '../../src/engine/statuses';
import type { CombatState, EnemyMove, RunState } from '../../src/engine/types';
import { combatFingerprint } from '../../src/net/hash';
import { inst } from '../helpers';

/**
 * 內容擴充第一批的 18 件秘寶（2026-09-23，提案第⑤節）：每一件都有一條「照牌面文字發動」的測試。
 * 連線那幾條（分食便當、同心結、不眠香爐、銅臭錢袋）走真的 `beginCombat`／`newCoopRun`，因為開場那一拍
 * 同伴還沒進場這件事只有整條路走一遍才測得到（`CombatState.pendingAllyRelics`）。
 */
const HIT = (n: number): EnemyMove => ({ intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: n }] });
const IDLE: EnemyMove = { intent: 'block', label: '硬撐', effects: [{ kind: 'block', amount: 1 }] };

let uid = 70_000;
function start(relics: string[], o: { encounterId?: string; hero?: Hero; deck?: string[] } = {}): CombatState {
  const deck = (o.deck ?? [...STARTER_DECK]).map((id) => inst(id, uid++));
  return startCombat({ hp: 70, maxHp: 70, deck, relics, potions: [], encounterId: o.encounterId ?? 'wood_dummy',
    rng: new Rng(seedFromString('batch1')), ...(o.hero ? { hero: o.hero } : {}) });
}
/** 把牌堆裡的一張指定牌抓到手上，回它的 uid（沒有就塞一張新的） */
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

/** 兩個人的局開一場戰鬥（走 `beginCombat` 整條路；遭遇指定成木樁人，不吃地圖格的修飾詞） */
function coopFight(setup: (run: RunState) => void, heroes: [Hero, Hero] = ['ninja', 'ninja']): { run: RunState; cs: CombatState } {
  const run = newCoopRun('batch1-coop', 1, heroes[0], heroes[1]);
  // 拿掉藍頭巾（2026-09-23 平衡 bal）：它改成開場 1 點爪力，同心結量的就是爪力，帶著它每個人都多 1
  for (const p of run.players) p.relics = p.relics.filter((id) => id !== 'blue_headband');
  setup(run);
  return { run, cs: beginCombat(run, 'wood_dummy') };
}

describe('菲菲那三件（毒）', () => {
  it('蛇牙墜：每打出一張攻擊牌，再給目標 1 層中毒', () => {
    const cs = start(['snake_fang']);
    const e = cs.enemies[0]!;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(getStatus(e, '中毒')).toBe(1);
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(getStatus(e, '中毒')).toBe(2);
    // 技能牌不算
    playCard(cs, toHand(cs, 'tanding'));
    expect(getStatus(e, '中毒')).toBe(2);
  });

  it('毒霧香囊：開場全體 2 層中毒；打倒中毒的魔物，剩下的毒其他每一隻都拿一份（三隻老鼠：6 層 → 另外兩隻各 6）', () => {
    const cs = start(['miasma_sachet'], { encounterId: 'rats3' });
    expect(cs.enemies.map((e) => getStatus(e, '中毒'))).toEqual([2, 2, 2]);
    const [a, b, c] = cs.enemies;
    a!.statuses['中毒'] = 6; a!.hp = 1; a!.block = 0;
    for (const e of [b!, c!]) { e.hp = 30; e.statuses = {}; }
    playCard(cs, toHand(cs, 'sanjo'), a!.uid);
    expect(a!.dead).toBe(true);
    expect([getStatus(b!, '中毒'), getStatus(c!, '中毒')]).toEqual([6, 6]);
  });

  it('毒霧香囊：沒帶的時候打倒中毒的魔物，毒不會散（對照組）', () => {
    const cs = start([], { encounterId: 'rats3' });
    const [a, b] = cs.enemies;
    a!.statuses['中毒'] = 6; a!.hp = 1; a!.block = 0;
    playCard(cs, toHand(cs, 'sanjo'), a!.uid);
    expect(getStatus(b!, '中毒')).toBe(0);
  });

  it('藥王鼎：每場戰鬥開始給全體魔物 5 層中毒', () => {
    const cs = start(['herb_cauldron'], { encounterId: 'rats3' });
    expect(cs.enemies.map((e) => getStatus(e, '中毒'))).toEqual([5, 5, 5]);
  });
});

describe('噹噹那三件（反彈、蜷縮當彈藥）', () => {
  it('鐵砧：開場 2 點反彈；被打時回敬 2＋1＝3 點', () => {
    const cs = start(['anvil']);
    expect(getStatus(cs.player, '反彈')).toBe(2);
    const e = cs.enemies[0]!;
    const hp = e.hp;
    quiet(cs, HIT(5));
    endTurn(cs);
    expect(hp - e.hp).toBe(3);
  });

  it('順勢護膝：每次反彈回敬，獲得 3 點蜷縮（配銅鏡的反彈）', () => {
    const cs = start(['knee_guard', 'bronze_mirror']);
    quiet(cs, HIT(5));
    endTurn(cs);
    expect(cs.log.some((l) => l.includes('順著力道穩住，多了 3 點蜷縮'))).toBe(true);
    // 沒有反彈就不會回敬、也就不會長蜷縮
    const cs2 = start(['knee_guard']);
    quiet(cs2, HIT(5));
    endTurn(cs2);
    expect(cs2.log.some((l) => l.includes('順著力道穩住'))).toBe(false);
  });

  it('秤砣腰帶：回合結束最多留 8 點蜷縮（主控 2026-09-23 調強；改名避開噹噹的牌「千斤墜」）', () => {
    const cs = start(['iron_weight_belt'], { hero: 'dangdang', deck: ['dangdang_jiapan', 'dangdang_jiapan', 'dangdang_jiapan', 'dangdang_jiapan', 'dangdang_jiapan'] });
    expect(relicById['iron_weight_belt']!.name).toBe('秤砣腰帶');
    cs.player.block = 20;
    quiet(cs);
    endTurn(cs);
    expect(cs.player.block).toBe(8);
  });

  it('秤砣腰帶：卸掉蜷縮的牌只卸一半（卸力掌 6 點：蜷縮 10 → 7，照打 6）', () => {
    const cs = start(['iron_weight_belt'], { hero: 'dangdang', deck: ['dangdang_xieli', 'dangdang_jiapan', 'dangdang_jiapan', 'dangdang_jiapan', 'dangdang_jiapan'] });
    expect(cs.player.halfSpendBlock).toBe(true);
    const e = cs.enemies[0]!;
    cs.player.block = 10;
    const hp = e.hp;
    playCard(cs, toHand(cs, 'dangdang_xieli'), e.uid);
    expect(cs.player.block).toBe(7);
    expect(hp - e.hp).toBe(6);
  });
});

describe('封封那三件（蓄氣）', () => {
  it('磨劍石：開場 3 點蓄氣', () => {
    const cs = start(['whet_stone'], { hero: 'fengfeng' });
    expect(cs.player.qi).toBe(3);
  });

  it('劍穗結：每回合第一張攻擊牌之後 2 點蓄氣，第二張沒有；下回合再一次', () => {
    const cs = start(['tassel_knot'], { hero: 'fengfeng' });
    const e = cs.enemies[0]!; e.hp = 999;
    quiet(cs);
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(cs.player.qi).toBe(2);
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(cs.player.qi).toBe(2);
    endTurn(cs);
    cs.player.energy = 3;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(cs.player.qi).toBe(4);
  });

  it('養氣葫蘆：每回合開始 2 點蓄氣', () => {
    const cs = start(['qi_gourd'], { hero: 'fengfeng' });
    expect(cs.player.qi).toBe(2);
    quiet(cs);
    endTurn(cs);
    expect(cs.player.qi).toBe(4);
  });
});

describe('球球那三件（隱身、潛水）', () => {
  it('竹筒：開場 1 層潛水，第一回合**不**換；第二回合開始才變成 1 層隱身', () => {
    const cs = start(['bamboo_tube']);
    expect(getStatus(cs.player, '潛水')).toBe(1);
    expect(getStatus(cs.player, '隱身')).toBe(0);
    quiet(cs);
    endTurn(cs);
    expect(getStatus(cs.player, '潛水')).toBe(0);
    expect(getStatus(cs.player, '隱身')).toBe(1);
  });

  it('驚弓鈴：被打掉血時 1 層潛水（下回合開始變成隱身）；每回合最多一次', () => {
    // 2026-09-23 平衡（bal）：原本當下給隱身（第二下就閃掉），改成潛水——這一輪兩下都挨、下回合才閃得掉
    const cs = start(['startle_bell'], { encounterId: 'rats2' });
    quiet(cs, HIT(5));
    const hp = cs.player.hp;
    endTurn(cs);
    expect(hp - cs.player.hp, '這一輪兩下都挨（潛水還不是隱身）').toBe(10);
    expect(cs.log.some((l) => l.includes('閃過了'))).toBe(false);
    // 兩下都掉血，但每回合只發一次：一層
    expect(getStatus(cs.player, '潛水') + getStatus(cs.player, '隱身')).toBe(1);
    expect(getStatus(cs.player, '隱身'), '下回合開始換成隱身').toBe(1);
    // 下一輪第一下就閃掉
    quiet(cs, HIT(5));
    const hp2 = cs.player.hp;
    endTurn(cs);
    expect(cs.log.some((l) => l.includes('閃過了'))).toBe(true);
    expect(hp2 - cs.player.hp).toBe(5);
    // 沒被打掉血（蜷縮擋住）就不發
    const cs2 = start(['startle_bell']);
    quiet(cs2, HIT(5));
    cs2.player.block = 10;
    endTurn(cs2);
    expect(getStatus(cs2.player, '潛水') + getStatus(cs2.player, '隱身')).toBe(0);
  });

  /*
   * 提案寫「每回合開始 1 層隱身」並註明「太強就改成每兩回合」：量尺實測 +17～21 層（全遊戲最強，師父的斗笠 +13），
   * 改成「沒有隱身才給 1 層潛水」——潛水下回合才變隱身，所以每次用掉之後要隔一回合才補上，等於每兩回合一次，
   * 用的全是現成的效果（`ifSelfStatus`＋潛水），不必等第二批的計數器。量到 +10～11 層。
   */
  it('影忍頭帶：沒有隱身才給 1 層潛水——用掉之後隔一回合才補上（每兩回合一次）', () => {
    const cs = start(['shadow_band']);
    // 第一回合：沒隱身 → 拿到潛水（這一拍還沒變）
    expect(getStatus(cs.player, '潛水')).toBe(1);
    expect(getStatus(cs.player, '隱身')).toBe(0);
    quiet(cs);
    endTurn(cs);
    // 第二回合：潛水變隱身；身上有隱身了，這回合不再給，也不閃「發動」
    expect(getStatus(cs.player, '隱身')).toBe(1);
    expect(getStatus(cs.player, '潛水')).toBe(0);
    expect(cs.relicFired.filter((id) => id === 'shadow_band')).toHaveLength(1);
    // 第二回合挨打用掉隱身 → 第三回合開始沒隱身，再給潛水
    quiet(cs, HIT(5));
    endTurn(cs);
    expect(getStatus(cs.player, '隱身')).toBe(0);
    expect(getStatus(cs.player, '潛水')).toBe(1);
  });
});

describe('塔主池的代價型四件', () => {
  it('不眠香爐：每回合 4 顆飯糰；打盹一點都不回（連貓草種子那 8 點也不回）；44F 照樣回滿', () => {
    const cs = start(['sleepless_censer']);
    expect(cs.player.maxEnergy).toBe(4);
    const run = newRun('censer', 1);
    takeRelic(run, 'sleepless_censer');
    takeRelic(run, 'catgrass_seed');
    me(run).hp = 20;
    expect(napHeal(run)).toBe(0);
    expect(rest(run, '打盹')).toBe(true);
    expect(me(run).hp).toBe(20);
    run.act = 3; run.floor = 44;
    expect(napHeal(run)).toBe(me(run).maxHp);
  });

  it('不眠香爐：機器人知道睡了不回（`napWorks`）——缺血時改去磨爪，不會照舊衝貓窩白睡；44F 照樣睡', () => {
    const run = newRun('censer-bot', 1);
    me(run).hp = 20;
    expect(napWorks(run)).toBe(true);
    takeRelic(run, 'sleepless_censer');
    expect(napWorks(run)).toBe(false);
    run.act = 3; run.floor = 44;
    expect(napWorks(run)).toBe(true);
  });

  it('不眠香爐（連線）：帶的人睡了不回，同伴照常回；扶人起來不受影響', () => {
    const run = newCoopRun('censer-coop', 1, 'ninja', 'feifei');
    takeRelic(run, 'sleepless_censer', 0);
    for (const p of run.players) p.hp = 20;
    expect(napHeal(run, 0)).toBe(0);
    expect(napHeal(run, 1)).toBeGreaterThan(0);
    run.players[1]!.down = true; run.players[1]!.hp = 0;
    expect(revivePartner(run, 1)).toBe(true);
    expect(run.players[1]!.hp).toBe(Math.floor(run.players[1]!.maxHp * 0.3));
  });

  it('銅臭錢袋：每回合 4 顆飯糰；罐頭鋪貴五成（跟零錢罐相乘成 1.2）；放生照原價', () => {
    const cs = start(['greedy_pouch']);
    expect(cs.player.maxEnergy).toBe(4);
    const run = newRun('pouch', 1);
    const plain = makeShop(newRun('pouch', 1));
    takeRelic(run, 'greedy_pouch');
    expect(shopMulFor(run)).toBeCloseTo(1.5);
    const shop = makeShop(run);
    const it0 = shop.potions.find((x) => !x.sale)!;
    expect(it0.price).toBe(Math.round(it0.base * 1.5));
    expect(plain.potions.length).toBe(shop.potions.length);
    takeRelic(run, 'coin_jar');
    expect(shopMulFor(run)).toBeCloseTo(1.2);
    me(run).fish = 500;
    const cost = me(run).removeCost;
    expect(buyRemove(run, me(run).deck[0]!.uid)).toBe(true);
    expect(me(run).fish).toBe(500 - cost);
  });

  it('銅臭錢袋（連線）：貨架一人一份，價錢各算各的——帶的人貴五成，同伴照原價', () => {
    const run = newCoopRun('pouch-coop', 1, 'ninja', 'dangdang');
    takeRelic(run, 'greedy_pouch', 1);
    const shops = makeShops(run);
    for (const it of shops[0]!.potions) expect(priceFor(run, it, 0)).toBe(Math.round(it.base * (it.sale ?? 1)));
    for (const it of shops[1]!.potions) expect(priceFor(run, it, 1)).toBe(Math.round(it.base * 1.5 * (it.sale ?? 1)));
  });

  /** 打贏一場一般戰（走 `finishCombat`）的戰利品 */
  function winAt(run: RunState, type: '戰鬥' | '大魔物') {
    const node = run.map.nodes.find((n) => n.type === type)!;
    run.currentNode = node.id;
    const cs = beginCombat(run);
    for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
    cs.phase = 'won';
    return finishCombat(run, cs)!;
  }

  it('斷念珠：每回合多抽 1 張；戰鬥獎勵的牌少一張可選（負值照算，跟掌門印相加）', () => {
    const cs = start(['renounce_beads']);
    expect(cs.player.hand.length).toBe(6);
    const run = newRun('beads-plain', 1);
    takeRelic(run, 'renounce_beads');
    expect(winAt(run, '戰鬥').cards.length).toBe(2);
    const elite = newRun('beads-elite', 1);
    takeRelic(elite, 'renounce_beads');
    expect(winAt(elite, '大魔物').cards.length).toBe(2);
    const both = newRun('beads-seal', 1);
    takeRelic(both, 'renounce_beads'); takeRelic(both, 'master_seal');
    expect(winAt(both, '戰鬥').cards.length).toBe(3);
  });

  it('斷念珠（連線）：少一張的是帶的那一位，同伴那份照舊三張', () => {
    const run = newCoopRun('beads-coop', 1, 'ninja', 'ninja');
    takeRelic(run, 'renounce_beads', 1);
    const r = winAt(run, '戰鬥');
    expect(r.cardsPerSeat!.map((c) => c.length)).toEqual([3, 2]);
  });

  it('狂刀鞘：開場 4 點爪力與 2 層翻肚', () => {
    const cs = start(['mad_sheath']);
    expect(getStatus(cs.player, '爪力')).toBe(4);
    expect(getStatus(cs.player, '翻肚')).toBe(2);
  });
});

describe('連線互助兩件（一個人時退化成給自己）', () => {
  // 2026-09-23 平衡（bal）：每回合 2 → 1 點
  it('分食便當（單人）：每回合開始自己拿 1 點蜷縮', () => {
    const cs = start(['shared_bento']);
    expect(cs.player.block).toBe(1);
  });

  it('分食便當（連線）：座位 0 帶的，第一回合就給座位 1——不是開場那一拍同伴還沒到就退回給自己', () => {
    const { cs } = coopFight((run) => { takeRelic(run, 'shared_bento', 0); });
    expect(cs.players[1]!.block).toBe(1);
    expect(cs.players[0]!.block).toBe(0);
    expect(cs.pendingAllyRelics).toBeUndefined();
    for (const e of cs.enemies) e.move = IDLE;
    endTurn(cs);
    expect(cs.players.map((p) => p.block)).toEqual([0, 1]);
  });

  it('同心結（單人）：開場自己 2 點爪力', () => {
    const cs = start(['bond_knot']);
    expect(getStatus(cs.player, '爪力')).toBe(2);
  });

  it('同心結（連線）：誰帶都一樣是兩人各 1 點；帶的人上一場倒下就不發', () => {
    for (const seat of [0, 1]) {
      const { cs } = coopFight((run) => { takeRelic(run, 'bond_knot', seat); });
      expect(cs.players.map((p) => getStatus(p, '爪力')), `座位 ${seat} 帶`).toEqual([1, 1]);
      expect(cs.pendingAllyRelics).toBeUndefined();
    }
    const { cs } = coopFight((run) => { takeRelic(run, 'bond_knot', 0); run.players[0]!.down = true; run.players[0]!.hp = 0; });
    expect(getStatus(cs.players[1]!, '爪力')).toBe(0);
  });

  it('同伴倒著進場時，座位 0 的同心結退回給自己（跟單人一樣拿 2 點）', () => {
    const { cs } = coopFight((run) => { takeRelic(run, 'bond_knot', 0); run.players[1]!.down = true; run.players[1]!.hp = 0; });
    expect(getStatus(cs.players[0]!, '爪力')).toBe(2);
  });

  it('指紋：開場還沒發的「給同伴」會進指紋；平常是空的、指紋跟以前同一套算法', () => {
    const { cs } = coopFight((run) => { takeRelic(run, 'bond_knot', 0); });
    const clean = combatFingerprint(cs);
    cs.pendingAllyRelics = [{ seat: 0, effects: relicById['bond_knot']!.hooks.combatStart!.slice(1) }];
    expect(combatFingerprint(cs)).not.toBe(clean);
    delete cs.pendingAllyRelics;
    expect(combatFingerprint(cs)).toBe(clean);
  });
});

describe('18 件的資料', () => {
  it('每一件都在、圖示鍵照規則、池與鎖照提案', () => {
    const want: Record<string, [string, string[] | undefined]> = {
      snake_fang: ['常見', undefined], miasma_sachet: ['大魔物', undefined], herb_cauldron: ['塔主', undefined],
      anvil: ['常見', undefined], knee_guard: ['大魔物', undefined], iron_weight_belt: ['塔主', ['feifei', 'fengfeng', 'ninja']],
      whet_stone: ['常見', ['dangdang', 'feifei', 'ninja']], tassel_knot: ['大魔物', ['dangdang', 'feifei', 'ninja']], qi_gourd: ['塔主', ['dangdang', 'feifei', 'ninja']],
      bamboo_tube: ['常見', undefined], startle_bell: ['大魔物', undefined], shadow_band: ['塔主', undefined],
      sleepless_censer: ['塔主', undefined], greedy_pouch: ['塔主', undefined], renounce_beads: ['塔主', undefined], mad_sheath: ['塔主', undefined],
      shared_bento: ['常見', undefined], bond_knot: ['大魔物', undefined],
    };
    for (const [id, [pool, notFor]] of Object.entries(want)) {
      const r = relicById[id];
      expect(r, id).toBeDefined();
      expect(r!.pool, id).toBe(pool);
      expect(r!.art, id).toBe(`codex/relic_${id}`);
      expect(r!.notFor ? [...r!.notFor].sort() : undefined, id).toEqual(notFor);
    }
  });
});
