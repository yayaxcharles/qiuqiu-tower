import { describe, expect, it } from 'vitest';
import { startCombat } from '../../src/engine/combat';
import type { Hero } from '../../src/engine/hero';
import { Rng, seedFromString } from '../../src/engine/rng';
import { smartSeatAct } from '../../src/engine/smartbot';
import type { CombatState, EnemyMove, PlayerCombat } from '../../src/engine/types';

/**
 * 內容擴充第一批 10 支忍具，機器人的喝法（2026-09-23，`smartbot.ts` 的 `maybePotion`）。
 *
 * 提案 ⑦ 的教訓：機器人不會用的東西拿到就佔一格到死，平衡報告會安靜地把整局量弱。
 * 每一支都寫「該喝」與「不該喝」各一個場面；把那一條規則拿掉，「該喝」那條就會紅。
 * 鐵布衫油、替身人偶、火雷珠有一部分是被既有規則接走的（蜷縮／隱身救命、反彈、全體傷害），也一起釘住。
 */
const QUIET: EnemyMove = { intent: 'block', label: '硬撐', effects: [{ kind: 'block', amount: 8 }] };
const hit = (n: number, times = 1): EnemyMove => ({ intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: n, times }] });

let uid = 82_000;
function setup(potions: string[], opt: { hand?: string[]; draw?: string[]; move?: EnemyMove; enemyHp?: number;
  energy?: number; encounterId?: string; hero?: Hero; hp?: number } = {}): { cs: CombatState; p: PlayerCombat } {
  const cs = startCombat({ hp: 80, maxHp: 80, deck: [], relics: [], potions: [], encounterId: opt.encounterId ?? 'wood_dummy',
    rng: new Rng(seedFromString('potion-b1')), hero: opt.hero ?? 'ninja' });
  const p = cs.player;
  p.hand = (opt.hand ?? []).map((cardId) => ({ uid: uid++, cardId, upgraded: false }));
  p.drawPile = (opt.draw ?? []).map((cardId) => ({ uid: uid++, cardId, upgraded: false }));
  p.discardPile = []; p.exhaustPile = [];
  p.energy = opt.energy ?? 3; p.block = 0; p.statuses = {}; p.qi = 0;
  p.hp = opt.hp ?? 80;
  p.potions = [...potions];
  for (const e of cs.enemies) { e.hp = e.maxHp = opt.enemyHp ?? 100; e.block = 0; e.statuses = {}; e.move = opt.move ?? QUIET; }
  return { cs, p };
}
const rng = (): Rng => new Rng(seedFromString('potion-b1-bot'));
function drank(cs: CombatState, p: PlayerCombat, id: string): boolean {
  smartSeatAct(cs, rng(), 0);
  return !p.potions.includes(id);
}

describe('提神茶、劍意符（蓄氣，封封）', () => {
  it('手上有吃蓄氣的平斬、蓄氣是空的 → 喝', () => {
    for (const id of ['qi_tea', 'sword_talisman']) {
      const { cs, p } = setup([id], { hero: 'fengfeng', hand: ['fengfeng_pingzhan'] });
      expect(drank(cs, p, id), id).toBe(true);
      expect(p.qi, id).toBeGreaterThanOrEqual(6);
    }
  });
  it('手上沒有吃蓄氣的牌（一般戰） → 不喝', () => {
    const { cs, p } = setup(['qi_tea'], { hero: 'fengfeng', hand: ['fengfeng_hushen'] });
    expect(drank(cs, p, 'qi_tea')).toBe(false);
  });
  it('蓄氣已經 9 點（灌下去一大半被上限吃掉） → 不喝', () => {
    const { cs, p } = setup(['sword_talisman'], { hero: 'fengfeng', hand: ['fengfeng_pingzhan'] });
    p.qi = 9;
    expect(drank(cs, p, 'sword_talisman')).toBe(false);
  });
});

describe('散毒粉', () => {
  it('三隻老鼠、其中一隻 6 層毒 → 對那一隻撒', () => {
    const { cs, p } = setup(['spread_powder'], { encounterId: 'rats3' });
    cs.enemies[1]!.statuses['中毒'] = 6;
    expect(drank(cs, p, 'spread_powder')).toBe(true);
    expect(cs.enemies.map((e) => e.statuses['中毒'] ?? 0)).toEqual([3, 6, 3]);
  });
  it('只有一隻（沒得分）→ 不撒', () => {
    const { cs, p } = setup(['spread_powder']);
    cs.enemies[0]!.statuses['中毒'] = 8;
    expect(drank(cs, p, 'spread_powder')).toBe(false);
  });
  it('大家都沒毒 → 不撒', () => {
    const { cs, p } = setup(['spread_powder'], { encounterId: 'rats3' });
    expect(drank(cs, p, 'spread_powder')).toBe(false);
  });
});

describe('千針膏', () => {
  it('大魔物戰第一回合 → 喝', () => {
    const { cs, p } = setup(['needle_salve'], { encounterId: 'giant_onigiri' });
    expect(drank(cs, p, 'needle_salve')).toBe(true);
  });
  it('一般戰、魔物血厚、手上兩張攻擊牌 → 喝', () => {
    const { cs, p } = setup(['needle_salve'], { hand: ['sanjo', 'sanjo'], enemyHp: 60 });
    expect(drank(cs, p, 'needle_salve')).toBe(true);
  });
  it('一般戰、魔物快死了 → 不喝', () => {
    const { cs, p } = setup(['needle_salve'], { hand: ['sanjo', 'sanjo'], enemyHp: 20 });
    expect(drank(cs, p, 'needle_salve')).toBe(false);
  });
});

describe('鐵布衫油（被既有的反彈、蜷縮救命兩條接走）', () => {
  it('關主戰挨一下 → 喝（反彈那條）', () => {
    const { cs, p } = setup(['iron_oil'], { encounterId: 'tower_master', move: hit(6) });
    expect(drank(cs, p, 'iron_oil')).toBe(true);
    expect(p.block).toBe(10);
  });
  it('一般戰、魔物不打人 → 不喝', () => {
    const { cs, p } = setup(['iron_oil']);
    expect(drank(cs, p, 'iron_oil')).toBe(false);
  });
});

describe('以牙還牙粉', () => {
  it('身上有反彈、這一拍要挨兩下 → 喝', () => {
    const { cs, p } = setup(['payback_powder'], { move: hit(3, 2) });
    p.statuses['反彈'] = 3;
    expect(drank(cs, p, 'payback_powder')).toBe(true);
    expect(p.thornsBonus).toBe(4);
  });
  it('身上沒有反彈 → 不喝（喝了也不會回敬）', () => {
    const { cs, p } = setup(['payback_powder'], { move: hit(3, 2) });
    expect(drank(cs, p, 'payback_powder')).toBe(false);
  });
});

describe('潛水竹管', () => {
  it('關主戰第一回合 → 先喝囤著', () => {
    const { cs, p } = setup(['dive_straw'], { encounterId: 'tower_master' });
    expect(drank(cs, p, 'dive_straw')).toBe(true);
  });
  it('一般戰、血掉到一半以下、這一拍要挨打 → 喝', () => {
    const { cs, p } = setup(['dive_straw'], { hp: 30, move: hit(5) });
    expect(drank(cs, p, 'dive_straw')).toBe(true);
  });
  it('一般戰、滿血 → 不喝', () => {
    const { cs, p } = setup(['dive_straw'], { move: hit(5) });
    expect(drank(cs, p, 'dive_straw')).toBe(false);
  });
});

describe('替身人偶（被既有的隱身救命、抽牌兩條接走）', () => {
  it('快被打死 → 喝', () => {
    const { cs, p } = setup(['decoy_doll'], { hp: 20, move: hit(15) });
    expect(drank(cs, p, 'decoy_doll')).toBe(true);
    expect(p.statuses['隱身']).toBe(1);
  });
  it('滿血、手上有牌可打 → 不喝', () => {
    const { cs, p } = setup(['decoy_doll'], { hand: ['sanjo', 'tanding', 'sanjo'], draw: ['sanjo', 'sanjo'] });
    expect(drank(cs, p, 'decoy_doll')).toBe(false);
  });
});

describe('火雷珠', () => {
  it('關主戰 → 丟', () => {
    const { cs, p } = setup(['thunder_bead'], { encounterId: 'tower_master' });
    expect(drank(cs, p, 'thunder_bead')).toBe(true);
  });
  it('一般戰三隻 → 丟', () => {
    const { cs, p } = setup(['thunder_bead'], { encounterId: 'rats3' });
    expect(drank(cs, p, 'thunder_bead')).toBe(true);
  });
  it('一般戰一隻、血厚 → 留著', () => {
    const { cs, p } = setup(['thunder_bead']);
    expect(drank(cs, p, 'thunder_bead')).toBe(false);
  });
  it('鞭炮（6 點）不吃這條新規則：一般戰三隻、血都厚 → 照舊不丟', () => {
    const { cs, p } = setup(['firecracker'], { encounterId: 'rats3' });
    expect(drank(cs, p, 'firecracker')).toBe(false);
  });
});

describe('對半包子', () => {
  it('擋不住的有 20 點、挨下去掉到一半以下 → 喝', () => {
    const { cs, p } = setup(['share_half'], { hp: 30, move: hit(20) });
    expect(drank(cs, p, 'share_half')).toBe(true);
    expect(p.block).toBe(8);
  });
  it('魔物不打人 → 不喝', () => {
    const { cs, p } = setup(['share_half']);
    expect(drank(cs, p, 'share_half')).toBe(false);
  });
});
