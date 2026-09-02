import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { endTurn, playCard, startCombat, usePotion } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { rollRewards } from '../../src/engine/rewards';
import { makeShop, napHeal, newRun, rest, takeRelic } from '../../src/engine/run';
import { getStatus } from '../../src/engine/statuses';
import type { CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

/** 2026-09-02 秘寶擴充到 60 件時加的掛鉤，一種一個例子 */
function start(relics: string[], encounterId = 'cucumber', potions: string[] = []): CombatState {
  return startCombat({ hp: 70, maxHp: 70, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics, potions, encounterId, rng: new Rng(seedFromString('hooks')) });
}
function toHand(cs: CombatState, cardId: string): number {
  const all = [...cs.player.hand, ...cs.player.drawPile, ...cs.player.discardPile];
  const c = all.find((x) => x.cardId === cardId)!;
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) { const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1); }
  cs.player.hand.unshift(c);
  return c.uid;
}

describe('秘寶新掛鉤', () => {
  it('貓抓板：每回合第一張攻擊牌之後 +3 蜷縮，第二張沒有', () => {
    const cs = start(['scratch_board']);
    const e = cs.enemies[0]!; e.hp = 999;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(cs.player.block).toBe(3);
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(cs.player.block).toBe(3);
  });
  it('黑曜爪、沙丁魚罐、銅錢劍：打倒魔物得爪力、回血、小魚乾', () => {
    const cs = start(['obsidian_claw', 'sardine_tin', 'coin_sword']);
    const e = cs.enemies[0]!; e.hp = 1; cs.player.hp = 50;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(e.dead).toBe(true);
    expect(getStatus(cs.player, '爪力')).toBe(1);
    expect(cs.player.hp).toBe(52);
    expect(cs.fishDelta).toBe(8);
  });
  it('舊毛巾：用忍具回 4；守護符：回合結束留 8 點蜷縮', () => {
    const cs = start(['old_towel', 'guard_charm'], 'cucumber', ['whetstone']);
    cs.player.hp = 40;
    expect(usePotion(cs, 'whetstone')).toBe(true);
    expect(cs.player.hp).toBe(44);
    cs.player.block = 20;
    cs.enemies[0]!.move = { intent: 'block', label: '躺', effects: [{ kind: 'block', amount: 1 }] };
    endTurn(cs);
    expect(cs.player.block).toBe(8);
  });
  it('鐵砂袋：每回合開始 +3 蜷縮；竹蜻蜓：第 4 張牌多 1 顆飯糰', () => {
    const cs = start(['sand_bag', 'bamboo_copter']);
    expect(cs.player.block).toBe(3);
    cs.player.energy = 10;
    for (let i = 0; i < 3; i++) playCard(cs, toHand(cs, 'tanding'));
    const before = cs.player.energy;
    playCard(cs, toHand(cs, 'tanding'));   // 第 4 張：花 1、竹蜻蜓補 1
    expect(cs.player.energy).toBe(before);
  });
  it('毛線手套：被打掉血得 1 爪力，每回合最多一次', () => {
    const cs = start(['yarn_gloves']);
    const e = cs.enemies[0]!;
    e.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 5, times: 2 }] };
    endTurn(cs);
    expect(getStatus(cs.player, '爪力')).toBe(1);
  });
  it('秘笈：第一次攻擊加倍', () => {
    const cs = start(['scroll']);
    const e = cs.enemies[0]!; e.hp = 999; e.block = 0;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(999 - e.hp).toBe(12);
  });
  it('貓草種子＋貓草：打盹回三成×2＋8；暖毯：下一場開戰 12 點蜷縮', () => {
    const r = newRun('rest-hooks'); r.hp = 10;
    takeRelic(r, 'catgrass'); takeRelic(r, 'catgrass_seed'); takeRelic(r, 'warm_blanket');
    expect(napHeal(r)).toBe(Math.floor(76 * 0.3 * 2) + 8);
    rest(r, '打盹');
    expect(r.restBlock).toBe(12);
  });
  it('零錢罐：罐頭鋪九折；掌門印：獎勵四張牌', () => {
    const r = newRun('shop-hooks'); takeRelic(r, 'coin_jar');
    const s = makeShop(r);
    const base: Record<string, number> = { 常見: 50, 罕見: 75, 稀有: 150 };
    for (const c of s.cards) expect(c.price).toBe(Math.round(base[c.def.rarity]! * 0.9));
    const rw = rollRewards(new Rng(seedFromString('rw')), '戰鬥', [], 0, false, { extraChoices: 1 });
    expect(rw.cards.length).toBe(4);
  });
});
