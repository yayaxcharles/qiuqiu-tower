import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

/** 封口術本來把爪力、貓步、防禦整個拆光（使用者 2026-09-02：太強），改成最多各 5 點 */
function toHand(cs: CombatState, cardId: string): number {
  const all = [...cs.player.hand, ...cs.player.drawPile, ...cs.player.discardPile];
  const c = all.find((x) => x.cardId === cardId);
  if (!c) throw new Error(`牌組裡沒有 ${cardId}`);
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) {
    const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1);
  }
  cs.player.hand.unshift(c);
  return c.uid;
}

describe('封口術的上限', () => {
  it('爪力 9、貓步 3、防禦 12 → 4、0、7', () => {
    const cs = startCombat({
      hp: 70, maxHp: 70, deck: [...STARTER_DECK, 'fengkou'].map((id, i) => inst(id, i + 1)), relics: [], potions: [],
      encounterId: 'cucumber', rng: new Rng(seedFromString('fengkou')),
    });
    const e = cs.enemies[0]!;
    addStatus(e, '爪力', 9); addStatus(e, '貓步', 3); e.block = 12;
    cs.player.energy = 3;
    playCard(cs, toHand(cs, 'fengkou'), e.uid);
    expect(getStatus(e, '爪力')).toBe(4);
    expect(getStatus(e, '貓步')).toBe(0);
    expect(e.block).toBe(7);
  });
});
