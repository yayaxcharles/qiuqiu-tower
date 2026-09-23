import { describe, expect, it } from 'vitest';
import { startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { smartSeatAct } from '../../src/engine/smartbot';
import type { CombatState, EnemyMove, PlayerCombat } from '../../src/engine/types';

/**
 * 機器人喝忍具的規則補洞（2026-09-23 內容擴充第〇批 0-3）。
 *
 * 量尺的忍具使用率報表（`docs/忍具使用率.md`）抓到四支喝掉率低於兩成：
 * 鮪魚 0%、鏡片 0%（兩支都**沒有任何規則**）、溫牛奶 8%、破甲錐 13%（規則太窄）。
 * 機器人不會用的忍具拿到就佔一格到死，平衡報告會安靜地把整局量弱。
 * 每一條都寫「修之前不喝、修之後會喝」的場面：把 `maybePotion` 那條規則拿掉就會變紅。
 */

const QUIET: EnemyMove = { intent: 'block', label: '硬撐', effects: [{ kind: 'block', amount: 8 }] };
const hit = (n: number, times = 1): EnemyMove => ({ intent: 'attack', label: '揮臂', effects: [{ kind: 'damage', amount: n, times }] });

let uid = 81_000;
function setup(potions: string[], opt: { hand?: string[]; draw?: string[]; move?: EnemyMove; enemyHp?: number; enemyBlock?: number;
  energy?: number; encounterId?: string } = {}): { cs: CombatState; p: PlayerCombat } {
  const cs = startCombat({ hp: 80, maxHp: 80, deck: [], relics: [], potions: [], encounterId: opt.encounterId ?? 'wood_dummy',
    rng: new Rng(seedFromString('potion0923')), hero: 'ninja' });
  const p = cs.player;
  p.hand = (opt.hand ?? []).map((cardId) => ({ uid: uid++, cardId, upgraded: false }));
  p.drawPile = (opt.draw ?? []).map((cardId) => ({ uid: uid++, cardId, upgraded: false }));
  p.discardPile = []; p.exhaustPile = [];
  p.energy = opt.energy ?? 3; p.block = 0; p.statuses = {};
  p.potions = [...potions];
  for (const e of cs.enemies) { e.hp = e.maxHp = opt.enemyHp ?? 100; e.block = opt.enemyBlock ?? 0; e.move = opt.move ?? QUIET; }
  return { cs, p };
}
const rng = (): Rng => new Rng(seedFromString('potion0923-bot'));
/** 機器人走一步之後，這支忍具還在不在袋子裡 */
function drank(cs: CombatState, p: PlayerCombat, id: string): boolean {
  smartSeatAct(cs, rng(), 0);
  return !p.potions.includes(id);
}

describe('鮪魚（抽 3 張）：原本沒有規則，0%', () => {
  it('飯糰還有兩顆、手上沒牌可打、牌堆有牌 → 喝', () => {
    const { cs, p } = setup(['tuna'], { hand: [], draw: ['sanjo', 'sanjo', 'tanding', 'tanding'], energy: 2 });
    expect(drank(cs, p, 'tuna')).toBe(true);
    expect(p.hand.length).toBe(3);
  });
  it('手上還有好幾張打得出去的 → 不喝（留著）', () => {
    const { cs, p } = setup(['tuna'], { hand: ['sanjo', 'sanjo', 'tanding'], draw: ['sanjo', 'sanjo'], energy: 3 });
    expect(drank(cs, p, 'tuna')).toBe(false);
  });
  it('牌堆空了 → 不喝（抽不到東西）', () => {
    const { cs, p } = setup(['tuna'], { hand: [], draw: [], energy: 3 });
    expect(drank(cs, p, 'tuna')).toBe(false);
  });
});

describe('鏡片（反彈 5）：原本沒有規則，0%', () => {
  it('這一拍要挨三下 → 喝', () => {
    const { cs, p } = setup(['mirror_shard'], { hand: [], move: hit(3, 3) });
    expect(drank(cs, p, 'mirror_shard')).toBe(true);
    expect(p.statuses['反彈']).toBe(5);
  });
  it('一般戰只挨一下 → 不喝', () => {
    const { cs, p } = setup(['mirror_shard'], { hand: [], move: hit(6) });
    expect(drank(cs, p, 'mirror_shard')).toBe(false);
  });
  it('關主戰挨一下就喝', () => {
    const { cs, p } = setup(['mirror_shard'], { hand: [], move: hit(6), encounterId: 'tower_master' });
    expect(drank(cs, p, 'mirror_shard')).toBe(true);
  });
});

describe('溫牛奶：原本只看中毒 4 層，8%', () => {
  it('翻肚撐過回合末、這一拍要挨 10 點以上 → 喝', () => {
    const { cs, p } = setup(['milk'], { hand: [], move: hit(10) });
    p.statuses['翻肚'] = 2;
    expect(drank(cs, p, 'milk')).toBe(true);
    expect(p.statuses['翻肚'] ?? 0).toBe(0);
  });
  it('被定身、手上兩張攻擊牌 → 喝', () => {
    const { cs, p } = setup(['milk'], { hand: ['sanjo', 'sanjo'], move: QUIET });
    p.statuses['定身'] = 1;
    expect(drank(cs, p, 'milk')).toBe(true);
  });
  it('只有一層懶洋洋、魔物不打人 → 不喝', () => {
    const { cs, p } = setup(['milk'], { hand: [], move: QUIET });
    p.statuses['懶洋洋'] = 1;
    expect(drank(cs, p, 'milk')).toBe(false);
  });
});

describe('破甲錐：原本要「防禦 12 以上又打得死」，13%', () => {
  it('沒防禦、血 10 的魔物（12 點打得死）→ 喝', () => {
    const { cs, p } = setup(['armor_pick'], { hand: [], enemyHp: 10, enemyBlock: 0 });
    expect(drank(cs, p, 'armor_pick')).toBe(true);
    expect(cs.enemies[0]!.dead).toBe(true);
  });
  it('血 30 打不死 → 不喝', () => {
    const { cs, p } = setup(['armor_pick'], { hand: [], enemyHp: 30, enemyBlock: 20 });
    expect(drank(cs, p, 'armor_pick')).toBe(false);
  });
});
