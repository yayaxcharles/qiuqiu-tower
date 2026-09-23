import { beforeEach, describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { potionById, potions } from '../../src/content/potions';
import { relics } from '../../src/content/relics';
import { endTurn, playCard, startCombat, usePotion } from '../../src/engine/combat';
import type { Hero } from '../../src/engine/hero';
import { POTION_RARITY_ODDS, potionOk, rollPotion, rollRewards } from '../../src/engine/rewards';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addPotion, applyRunEffects, beginCombat, makeShop, newCoopRun, newRun, reshuffleShop } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import { checkRun, loadRun, saveRun, setStore } from '../../src/engine/save';
import { getStatus } from '../../src/engine/statuses';
import type { CombatState, EnemyMove, Rarity, RunState } from '../../src/engine/types';
import { inst } from '../helpers';

/**
 * 內容擴充第一批的 10 支忍具＋稀有度（2026-09-23，提案第⑤節）。
 * 每一支一條「照說明發動」；稀有度抽法用大樣本看比例；角色鎖走每一個給忍具的入口；舊存檔讀得回來。
 */
const HIT = (n: number): EnemyMove => ({ intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: n }] });
const IDLE: EnemyMove = { intent: 'block', label: '硬撐', effects: [{ kind: 'block', amount: 1 }] };

let uid = 90_000;
function start(potionIds: string[], o: { encounterId?: string; hero?: Hero } = {}): CombatState {
  return startCombat({ hp: 70, maxHp: 70, deck: STARTER_DECK.map((id) => inst(id, uid++)), relics: [], potions: potionIds,
    encounterId: o.encounterId ?? 'wood_dummy', rng: new Rng(seedFromString('batch1-potion')), ...(o.hero ? { hero: o.hero } : {}) });
}
function toHand(cs: CombatState, cardId: string): number {
  const p = cs.player;
  for (const pile of [p.hand, p.drawPile, p.discardPile]) {
    const i = pile.findIndex((c) => c.cardId === cardId);
    if (i >= 0) { const [c] = pile.splice(i, 1); p.hand.unshift(c!); return c!.uid; }
  }
  const c = inst(cardId, uid++); p.hand.unshift(c); return c.uid;
}

describe('10 支新忍具：照說明發動', () => {
  it('提神茶：6 點蓄氣（封封）', () => {
    const cs = start(['qi_tea'], { hero: 'fengfeng' });
    expect(usePotion(cs, 'qi_tea')).toBe(true);
    expect(cs.player.qi).toBe(6);
  });

  it('劍意符：蓄氣直接灌滿 12（已經有 5 點也是滿到 12，不會超過）', () => {
    const cs = start(['sword_talisman'], { hero: 'fengfeng' });
    cs.player.qi = 5;
    expect(usePotion(cs, 'sword_talisman')).toBe(true);
    expect(cs.player.qi).toBe(12);
  });

  it('散毒粉：目標的毒分一半給其他每一隻，目標自己的不變', () => {
    const cs = start(['spread_powder'], { encounterId: 'rats3' });
    const [a, b, c] = cs.enemies;
    a!.statuses['中毒'] = 6;
    expect(usePotion(cs, 'spread_powder', a!.uid)).toBe(true);
    expect([getStatus(a!, '中毒'), getStatus(b!, '中毒'), getStatus(c!, '中毒')]).toEqual([6, 3, 3]);
  });

  it('千針膏：之後每打出一張攻擊牌，再給目標 2 層中毒（技能牌不算）', () => {
    const cs = start(['needle_salve']);
    const e = cs.enemies[0]!; e.hp = 999;
    expect(usePotion(cs, 'needle_salve')).toBe(true);
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(getStatus(e, '中毒')).toBe(2);
    playCard(cs, toHand(cs, 'tanding'));
    expect(getStatus(e, '中毒')).toBe(2);
  });

  it('鐵布衫油：10 點蜷縮與 3 點反彈', () => {
    const cs = start(['iron_oil']);
    expect(usePotion(cs, 'iron_oil')).toBe(true);
    expect(cs.player.block).toBe(10);
    expect(getStatus(cs.player, '反彈')).toBe(3);
  });

  it('以牙還牙粉：反彈回敬多打 4 點（身上 2 點反彈 → 回敬 6）；沒有反彈就不會憑空打人', () => {
    const cs = start(['payback_powder']);
    cs.player.statuses['反彈'] = 2;
    expect(usePotion(cs, 'payback_powder')).toBe(true);
    const e = cs.enemies[0]!;
    const hp = e.hp;
    for (const x of cs.enemies) x.move = HIT(5);
    endTurn(cs);
    expect(hp - e.hp).toBe(6);
    const cs2 = start(['payback_powder']);
    usePotion(cs2, 'payback_powder');
    const hp2 = cs2.enemies[0]!.hp;
    for (const x of cs2.enemies) x.move = HIT(5);
    endTurn(cs2);
    expect(cs2.enemies[0]!.hp).toBe(hp2);
  });

  it('潛水竹管：2 層潛水，下回合開始變成 2 層隱身', () => {
    const cs = start(['dive_straw']);
    expect(usePotion(cs, 'dive_straw')).toBe(true);
    expect(getStatus(cs.player, '潛水')).toBe(2);
    for (const e of cs.enemies) e.move = IDLE;
    endTurn(cs);
    expect(getStatus(cs.player, '隱身')).toBe(2);
    expect(getStatus(cs.player, '潛水')).toBe(0);
  });

  it('替身人偶：1 層隱身並抽 2 張', () => {
    const cs = start(['decoy_doll']);
    const hand = cs.player.hand.length;
    expect(usePotion(cs, 'decoy_doll')).toBe(true);
    expect(getStatus(cs.player, '隱身')).toBe(1);
    expect(cs.player.hand.length).toBe(hand + 2);
  });

  it('火雷珠：全體 14 點（忍具不吃爪力：身上 5 點爪力照樣是 14）', () => {
    const cs = start(['thunder_bead'], { encounterId: 'rats3' });
    for (const e of cs.enemies) { e.hp = e.maxHp = 50; e.block = 0; e.statuses = {}; }
    cs.player.statuses['爪力'] = 5;
    expect(usePotion(cs, 'thunder_bead')).toBe(true);
    expect(cs.enemies.map((e) => e.hp)).toEqual([36, 36, 36]);
  });

  it('對半包子（單人）：自己 8 點蜷縮', () => {
    const cs = start(['share_half']);
    expect(usePotion(cs, 'share_half')).toBe(true);
    expect(cs.player.block).toBe(8);
  });

  it('對半包子（連線）：喝的人與同伴各 8 點', () => {
    const run = newCoopRun('bun-coop', 1, 'ninja', 'dangdang');
    addPotion(run, 'share_half', 1);
    const cs = beginCombat(run, 'wood_dummy');
    const before = cs.players.map((p) => p.block);
    expect(usePotion(cs, 'share_half', undefined, 1)).toBe(true);
    expect(cs.players.map((p, i) => p.block - before[i]!)).toEqual([8, 8]);
  });
});

describe('稀有度', () => {
  it('45 支分級：常見 22、罕見 16、稀有 7；稀有照提案那 6 支＋火雷珠', () => {
    const n = (r: Rarity): number => potions.filter((p) => p.rarity === r).length;
    expect([n('常見'), n('罕見'), n('稀有')]).toEqual([22, 16, 7]);
    expect(potions.filter((p) => p.rarity === '稀有').map((p) => p.id).sort())
      .toEqual(['clone_oil', 'first_incense', 'iron_salve', 'nine_lives', 'revive_pill', 'secret_scroll', 'thunder_bead']);
  });

  it('殺戮尖塔的慣例「越稀有越貴」照樣成立：三級的平均標價由低到高（我們不另外乘倍率，理由見 POTION_RARITY_ODDS）', () => {
    const avg = (r: Rarity): number => { const ps = potions.filter((p) => p.rarity === r); return ps.reduce((s, p) => s + (p.price ?? 45), 0) / ps.length; };
    expect(avg('常見')).toBeLessThan(avg('罕見'));
    expect(avg('罕見')).toBeLessThan(avg('稀有'));
  });

  it('權重 65／27／8：抽四萬次，每一級的比例落在一個百分點內', () => {
    expect(POTION_RARITY_ODDS).toEqual([['常見', 65], ['罕見', 27], ['稀有', 8]]);
    for (const hero of ['ninja', 'fengfeng'] as const) {
      const rng = new Rng(seedFromString(`rarity-${hero}`));
      const count: Record<Rarity, number> = { 常見: 0, 罕見: 0, 稀有: 0 };
      const N = 40_000;
      for (let i = 0; i < N; i++) count[potionById[rollPotion(rng, [hero])]!.rarity] += 1;
      expect(Math.abs(count['常見'] / N - 0.65), `${hero} 常見 ${count['常見'] / N}`).toBeLessThan(0.01);
      expect(Math.abs(count['罕見'] / N - 0.27), `${hero} 罕見 ${count['罕見'] / N}`).toBeLessThan(0.01);
      expect(Math.abs(count['稀有'] / N - 0.08), `${hero} 稀有 ${count['稀有'] / N}`).toBeLessThan(0.01);
    }
  });

  it('同一級裡平均抽：稀有 7 支每一支都在「8%÷7」附近（不是某一支獨佔）', () => {
    const rng = new Rng(seedFromString('rarity-even'));
    const count = new Map<string, number>();
    const N = 40_000;
    for (let i = 0; i < N; i++) { const id = rollPotion(rng, ['ninja']); count.set(id, (count.get(id) ?? 0) + 1); }
    for (const p of potions.filter((x) => x.rarity === '稀有')) {
      expect(Math.abs((count.get(p.id) ?? 0) / N - 0.08 / 7), p.id).toBeLessThan(0.004);
    }
  });
});

describe('角色鎖：每一個給忍具的入口都濾', () => {
  const QI = ['qi_tea', 'sword_talisman'];

  it('rollPotion：球球抽不到蓄氣忍具，封封抽得到', () => {
    const got = (hero: string): Set<string> => {
      const rng = new Rng(seedFromString(`lock-${hero}`));
      const s = new Set<string>();
      for (let i = 0; i < 4000; i++) s.add(rollPotion(rng, [hero]));
      return s;
    };
    const ninja = got('ninja');
    for (const id of QI) expect(ninja.has(id), id).toBe(false);
    const feng = got('fengfeng');
    for (const id of QI) expect(feng.has(id), id).toBe(true);
    // 沒傳＝忍者（單機舊呼叫端）
    expect(rollPotion(new Rng(seedFromString('same')))).toBe(rollPotion(new Rng(seedFromString('same')), ['ninja']));
  });

  it('戰利品的忍具：兩位**都**用得到才開（每一位各發一支同樣的）——混搭球球＋封封開不出蓄氣忍具，兩位封封開得出', () => {
    expect(potionOk(potionById['qi_tea']!, ['fengfeng', 'ninja'])).toBe(false);
    expect(potionOk(potionById['qi_tea']!, ['fengfeng', 'fengfeng'])).toBe(true);
    const seen = (heroes: Hero[]): Set<string> => {
      const s = new Set<string>();
      for (let i = 0; i < 3000; i++) {
        const r = rollRewards(new Rng(seedFromString(`rw-${i}`)), '大魔物', [], 0, false, { hero: heroes[0], heroes });
        if (r.potion) s.add(r.potion);
      }
      return s;
    };
    const mixed = seen(['fengfeng', 'ninja']);
    for (const id of QI) expect(mixed.has(id), `混搭開出了 ${id}`).toBe(false);
    const both = seen(['fengfeng', 'fengfeng']);
    expect(QI.some((id) => both.has(id))).toBe(true);
  });

  it('戰利品走整條路（finishCombat）：混搭局兩位拿到的忍具都用得到', async () => {
    const { beginCombat: bc, finishCombat } = await import('../../src/engine/run');
    const bad: string[] = [];
    let got = 0;
    for (let i = 0; i < 400; i++) {
      const run = newCoopRun(`mix-pot-${i}`, 1, 'fengfeng', 'ninja');
      const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
      run.currentNode = node.id;
      const cs = bc(run);
      for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
      cs.phase = 'won';
      finishCombat(run, cs);
      for (const id of run.players[1]!.potions) { got += 1; if (QI.includes(id)) bad.push(`${i}: ${id}`); }
    }
    expect(got).toBeGreaterThan(50);
    expect(bad).toEqual([]);
  });

  it('罐頭鋪（開店與重整）：照這一位的角色擺', () => {
    const bad: string[] = [];
    let fengSeen = false;
    for (let i = 0; i < 300; i++) {
      const run = newRun(`shop-pot-${i}`, 1, 'ninja');
      run.players[0]!.fish = 9999;
      const shop = makeShop(run);
      for (const it of shop.potions) if (QI.includes(it.id)) bad.push(`開店 ${i}: ${it.id}`);
      reshuffleShop(run, shop);
      for (const it of shop.potions) if (QI.includes(it.id)) bad.push(`重整 ${i}: ${it.id}`);
      if (makeShop(newRun(`shop-pot-f-${i}`, 1, 'fengfeng')).potions.some((it) => QI.includes(it.id))) fengSeen = true;
    }
    expect(bad).toEqual([]);
    expect(fengSeen, '封封的罐頭鋪一次都沒擺過蓄氣忍具——濾網整個擋掉了').toBe(true);
  });

  it('事件給的忍具：只看拿到的那一位（混搭時同伴是封封也不放行）', () => {
    const bad: string[] = [];
    for (let i = 0; i < 400; i++) {
      const run = newCoopRun(`ev-pot-${i}`, 1, 'fengfeng', 'ninja');
      applyRunEffects(run, [{ kind: 'potions', n: 3 }], [], [], 1);
      for (const id of run.players[1]!.potions) if (QI.includes(id)) bad.push(`${i}: ${id}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('存檔相容', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    setStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } });
  });

  /**
   * 第一批**沒有加任何存檔欄位**：稀有度、角色鎖寫在忍具的資料定義上，存檔只記忍具代號；
   * 新秘寶的狀態全在戰鬥裡（戰鬥不存檔）。所以「舊存檔」就是一份只有舊代號、沒有任何新東西的存檔——
   * 這裡手工造一份（JSON 字串，照 2026-09-23 之前的樣子），讀回來要能照常開店、抽忍具、進戰鬥。
   */
  function oldSave(): string {
    const run = newRun('old-save-0922', 1, 'feifei');
    me(run).relics = ['backstep', 'tuna_can', 'coin_jar', 'master_seal'];
    me(run).potions = ['smoke_bomb', 'revive_pill', 'your_way'];
    me(run).fish = 321;
    const json = JSON.stringify(run);
    // 前提：舊存檔裡找不到任何這一批的東西
    for (const id of [...relics.slice(-18).map((r) => r.id), ...potions.slice(-10).map((p) => p.id), 'rarity', 'pendingAllyRelics']) {
      expect(json.includes(`"${id}"`), `舊存檔裡不該出現 ${id}`).toBe(false);
    }
    return json;
  }

  it('舊存檔讀得回來，忍具照資料定義補上稀有度，之後照常抽新東西', () => {
    const back = checkRun(JSON.parse(oldSave()) as Partial<RunState>);
    expect(back, '舊存檔被判成壞檔').not.toBeNull();
    const p = me(back!);
    expect(p.potions).toEqual(['smoke_bomb', 'revive_pill', 'your_way']);
    expect(p.potions.map((id) => potionById[id]!.rarity)).toEqual(['常見', '稀有', '罕見']);
    expect(p.relics).toEqual(['backstep', 'tuna_can', 'coin_jar', 'master_seal']);
    // 讀回來之後照常開店（新忍具、稀有度抽法都接得上）、照常進戰鬥
    expect(makeShop(back!).potions).toHaveLength(3);
    const cs = beginCombat(back!, 'wood_dummy');
    expect(cs.players[0]!.potions).toEqual(['smoke_bomb', 'revive_pill', 'your_way']);
  });

  it('帶著新秘寶、新忍具存檔再讀回來，一個都不少', () => {
    const run = newRun('new-save-0923', 1, 'fengfeng');
    me(run).relics.push('whet_stone', 'sleepless_censer', 'bond_knot');
    me(run).potions = ['qi_tea', 'thunder_bead'];
    saveRun(run);
    const back = loadRun();
    expect(back).not.toBeNull();
    expect(me(back!).relics).toContain('sleepless_censer');
    expect(me(back!).potions).toEqual(['qi_tea', 'thunder_bead']);
  });
});
