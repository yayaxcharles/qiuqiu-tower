// 判定順序：蜷縮先擋、擋不完才用隱身閃（2026-09-04，使用者：隱身比蜷縮強太多又判定在前）
import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { damagePlayer, gainStealth } from '../../src/engine/actions';
import { startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { getStatus } from '../../src/engine/statuses';
import { inst } from '../helpers';

function fresh() {
  return startCombat({ hp: 70, maxHp: 70, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [], encounterId: 'wood_dummy', rng: new Rng(seedFromString('order')) });
}
describe('蜷縮先擋、隱身後閃', () => {
  it('蜷縮擋得住的那一下不耗隱身', () => {
    const cs = fresh(); const p = cs.player; const e = cs.enemies[0]!;
    p.block = 10; gainStealth(cs, 2);
    damagePlayer(cs, e, 8);
    expect(p.hp).toBe(70); expect(p.block).toBe(2); expect(getStatus(p, '隱身')).toBe(2);
  });
  it('蜷縮擋不完：先扣掉能擋的，剩下那一下用一層隱身閃掉、不掉血', () => {
    const cs = fresh(); const p = cs.player; const e = cs.enemies[0]!;
    p.block = 10; gainStealth(cs, 2);
    damagePlayer(cs, e, 15);
    expect(p.hp).toBe(70); expect(p.block).toBe(0); expect(getStatus(p, '隱身')).toBe(1);
    expect(cs.log.some((l) => l === '球球閃過了')).toBe(true);
  });
  it('穿透招不看蜷縮，直接耗一層隱身閃掉；沒隱身就整下進血', () => {
    const cs = fresh(); const p = cs.player; const e = cs.enemies[0]!;
    p.block = 20; gainStealth(cs, 1);
    damagePlayer(cs, e, 12, { pierce: true });
    expect(p.hp).toBe(70); expect(p.block).toBe(20); expect(getStatus(p, '隱身')).toBe(0);
    damagePlayer(cs, e, 12, { pierce: true });
    expect(p.hp).toBe(58);
  });
});
