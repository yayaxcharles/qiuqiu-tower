import { describe, expect, it } from 'vitest';
import { difficultyMods, clampDifficulty, DIFFICULTY_NAMES, DIFFICULTY_TEXT, MAX_DIFFICULTY } from '../../src/content/difficulty';
import { STARTER_DECK } from '../../src/content/cards';
import { encounterById } from '../../src/content/enemies';
import { startCombat } from '../../src/engine/combat';
import { generateMap } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addPotion, advanceAct, applyRunEffects, makeShop, newRun } from '../../src/engine/run';
import { loadBestFor, recordBest, setStore, unlockedDifficulty } from '../../src/engine/save';
import { getStatus } from '../../src/engine/statuses';
import { inst } from '../helpers';

/** 難度 1～5（2026-09-02）：每級累積，數字全在 content/difficulty.ts */
describe('難度表', () => {
  it('五級都有名字與說明，難度 1 什麼都不加、越高越狠', () => {
    expect(DIFFICULTY_NAMES.length).toBe(MAX_DIFFICULTY);
    expect(DIFFICULTY_TEXT.length).toBe(MAX_DIFFICULTY);
    const m1 = difficultyMods(1);
    expect(m1).toEqual({ eliteMul: 1, enemyStrength: 0, hpMul: 1, actHeal: 1, startCurse: null, potionSlots: 3, shopMul: 1, unlucky: false, maxHp: 76, topEliteStrength: 0, finalPrefight: false });
    for (let d = 2; d <= MAX_DIFFICULTY; d++) {
      const a = difficultyMods(d - 1), b = difficultyMods(d);
      expect(b.eliteMul).toBeGreaterThanOrEqual(a.eliteMul);
      expect(b.hpMul).toBeGreaterThanOrEqual(a.hpMul);
      expect(b.enemyStrength + b.topEliteStrength).toBeGreaterThanOrEqual(a.enemyStrength + a.topEliteStrength);
      expect(b.maxHp).toBeLessThanOrEqual(a.maxHp);
      expect(b.potionSlots).toBeLessThanOrEqual(a.potionSlots);
    }
    expect(clampDifficulty(0)).toBe(1); expect(clampDifficulty(9)).toBe(MAX_DIFFICULTY); expect(clampDifficulty(NaN)).toBe(1);
  });
  it('開局：難度 4 多一張中計了、難度 5 最大生命 64、忍具格兩支', () => {
    const r1 = newRun('d1', 1), r4 = newRun('d4', 4), r5 = newRun('d5', 5);
    expect(r1.deck.length).toBe(STARTER_DECK.length);
    expect(r4.deck.filter((c) => c.cardId === 'zhongji').length).toBe(1);
    expect(r5.maxHp).toBe(70); expect(r5.hp).toBe(70); expect(r5.difficulty).toBe(5);
    expect(addPotion(r4, 'whetstone')).toBe(true); expect(addPotion(r4, 'whetstone')).toBe(true);
    expect(addPotion(r4, 'whetstone')).toBe(false);   // 第三支塞不進去
    expect(addPotion(r1, 'whetstone') && addPotion(r1, 'whetstone') && addPotion(r1, 'whetstone')).toBe(true);
  });
  it('戰鬥：難度 2 所有魔物帶 1 點爪力、難度 3 血量乘 1.15', () => {
    const base = { hp: 70, maxHp: 70, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [], encounterId: 'cucumber' };
    const a = startCombat({ ...base, rng: new Rng(seedFromString('x')) });
    const b = startCombat({ ...base, rng: new Rng(seedFromString('x')), mods: { hpMul: 1.15, strength: 1 } });
    expect(getStatus(a.enemies[0]!, '爪力')).toBe(0);
    expect(getStatus(b.enemies[0]!, '爪力')).toBe(1);
    expect(b.enemies[0]!.maxHp).toBe(Math.round(a.enemies[0]!.maxHp * 1.15));
  });
  it('過關回血：難度 3 只補回缺血的七成五', () => {
    const r = newRun('heal', 3);
    r.hp = 30; r.maxHp = 70;
    advanceAct(r);
    expect(r.hp).toBe(60);
    const r1 = newRun('heal1', 1); r1.hp = 30; advanceAct(r1); expect(r1.hp).toBe(76);
  });
  it('罐頭鋪：難度 4 貴一成；壞事件掉血乘 1.5', () => {
    const r = newRun('shop', 4); const r1 = newRun('shop', 1);
    const s = makeShop(r), s1 = makeShop(r1);
    const base: Record<string, number> = { 常見: 50, 罕見: 75, 稀有: 150 };
    for (const c of s.cards) expect(c.price).toBe(Math.round(base[c.def.rarity]! * 1.1 * (c.sale ?? 1)));   // 特價格再乘折數（2026-09-04）
    for (const c of s1.cards) expect(c.price).toBe(Math.round(base[c.def.rarity]! * (c.sale ?? 1)));
    applyRunEffects(r, [{ kind: 'damage', n: 10 }]); applyRunEffects(r1, [{ kind: 'damage', n: 10 }]);
    expect(r.hp).toBe(76 - 15); expect(r1.hp).toBe(76 - 10);
  });
  it('地圖：難度 2 起大魔物節點更多（100 張圖平均）', () => {
    const count = (mul: number): number => {
      let n = 0;
      for (let i = 0; i < 100; i++) n += generateMap(new Rng(seedFromString(`m${i}`)), { act: 2, eliteMul: mul }).nodes.filter((x) => x.type === '大魔物').length;
      return n;
    };
    const plain = count(1), hard = count(1.6);
    expect(hard).toBeGreaterThan(plain * 1.4);
    // 第一關（2026-09-03 菁英擴充後也有大魔物）：難度 1 就有，難度 2 起更多
    let a1 = 0, a1h = 0;
    for (let i = 0; i < 60; i++) {
      a1 += generateMap(new Rng(seedFromString(`a${i}`)), { act: 1 }).nodes.filter((x) => x.type === '大魔物').length;
      a1h += generateMap(new Rng(seedFromString(`a${i}`)), { act: 1, eliteMul: 1.6 }).nodes.filter((x) => x.type === '大魔物').length;
    }
    expect(a1).toBeGreaterThan(0); expect(a1h).toBeGreaterThan(a1);
    expect(encounterById['shadow_cat']).toBeTruthy();   // 難度 5 的前哨戰用
  });
  it('成績分難度記；五級預設全開（2026-09-03 拍板）', () => {
    const mem = new Map<string, string>();
    setStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); }, removeItem: (k) => { mem.delete(k); } });
    expect(unlockedDifficulty()).toBe(5);
    const r = newRun('win', 1); r.status = 'won'; r.floor = 45;
    recordBest(r, '2026-09-02');
    expect(unlockedDifficulty()).toBe(5);
    expect(loadBestFor(1)?.won).toBe(true);
    expect(loadBestFor(2)).toBeNull();
    const r3 = newRun('lose', 2); r3.status = 'lost'; r3.floor = 12;
    recordBest(r3, '2026-09-02');
    expect(unlockedDifficulty()).toBe(5);   // 全開，跟通關無關
    expect(loadBestFor(2)?.floor).toBe(12);
  });
});
