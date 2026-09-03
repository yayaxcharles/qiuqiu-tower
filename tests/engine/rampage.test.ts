// 魔氣暴走（2026-09-04）：第 RAMPAGE_TURN（10）回合起每個敵方回合全體魔物 +1 爪力；之前不加
import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { RAMPAGE_TURN, endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { getStatus } from '../../src/engine/statuses';
import { inst } from '../helpers';

describe('魔氣暴走', () => {
  it('暴走回合（第 10 回合）起每個敵方回合全體 +1 爪力，之前不加', () => {
    const cs = startCombat({ hp: 999, maxHp: 999, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [], encounterId: 'wood_dummy', rng: new Rng(seedFromString('r')) });
    const e = cs.enemies[0]!;
    const base = getStatus(e, '爪力');
    while (cs.turn < RAMPAGE_TURN) { cs.player.block = 999; endTurn(cs); }
    // 木樁人自己每 3 回合 +1 爪力（第 3、6、9 回合），九個敵方回合共 +3；暴走在這之前不該多加
    expect(getStatus(e, '爪力'), '暴走回合之前只有牠自己的成長').toBe(base + 3);
    expect(cs.log.some((l) => l.includes('魔氣'))).toBe(false);
    cs.player.block = 999; endTurn(cs);            // 第 10 回合結束＝第一次暴走（牠第 10 個回合，不是 3 的倍數）
    expect(getStatus(e, '爪力')).toBe(base + 4);
    expect(cs.log.some((l) => l.includes('魔氣開始暴走'))).toBe(true);
    cs.player.block = 999; endTurn(cs);            // 第 11 回合：再暴走 +1
    expect(getStatus(e, '爪力')).toBe(base + 5);
  });
});
