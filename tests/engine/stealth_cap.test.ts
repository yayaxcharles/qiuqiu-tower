// 隱身上限 5 層（2026-09-04）：多的散掉、潛水轉過來也受限；看破拍一半後還剩 2
import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { STEALTH_CAP, gainStealth } from '../../src/engine/actions';
import { endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { inst } from '../helpers';

describe('隱身上限', () => {
  it('疊到 5 就停，多的散掉並留紀錄', () => {
    const cs = startCombat({ hp: 70, maxHp: 70, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [], encounterId: 'wood_dummy', rng: new Rng(seedFromString('cap')) });
    gainStealth(cs, 3); gainStealth(cs, 3);
    expect(getStatus(cs.player, '隱身')).toBe(STEALTH_CAP);
    expect(cs.log.some((l) => l.includes('最多只能疊'))).toBe(true);
    gainStealth(cs, 2);
    expect(getStatus(cs.player, '隱身')).toBe(5);
  });
  it('潛水轉隱身也吃上限', () => {
    const cs = startCombat({ hp: 70, maxHp: 70, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [], encounterId: 'wood_dummy', rng: new Rng(seedFromString('cap2')) });
    gainStealth(cs, 4); addStatus(cs.player, '潛水', 3);
    cs.player.block = 99; endTurn(cs);
    expect(getStatus(cs.player, '隱身')).toBeLessThanOrEqual(5);
    expect(getStatus(cs.player, '潛水')).toBe(0);
  });
});
