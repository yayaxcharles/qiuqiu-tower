import { describe, expect, it } from 'vitest';
import { starterDeckFor } from '../../src/content/cards';
import { endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { inst } from '../helpers';

/*
 * 滿月劍意 × 回合開始的能力（2026-09-23 推前審查四 中-1）。
 * 藏鋒這類「回合開始給蓄氣」的能力把氣推過 10 時，劍意會設好加倍、寫「下一張攻擊牌傷害加倍」；
 * 原本回合開始清蓄力那一行排在能力之後，加倍當場被清掉，紀錄卻說有。
 */
describe('滿月劍意被回合開始的能力灌滿時，加倍留到這回合', () => {
  it('能力自己把蓄氣從 8 推過 10：紀錄寫蓄足，這回合的下一張攻擊加倍', () => {
    let uid = 1;
    const deck = starterDeckFor('fengfeng').map((id) => inst(id, uid++));
    const cs = startCombat({ hp: 70, maxHp: 70, deck, relics: ['full_moon_sword'], potions: [], encounterId: 'wood_dummy',
      rng: new Rng(seedFromString('fullmoon-power')), hero: 'fengfeng' });
    const p = cs.players[0]!;
    p.powers.push({ trigger: 'turnStart', effects: [{ kind: 'gainQi', n: 2 }], cardId: 'test_power' } as never);
    p.qi = 8; p.doubleNext = 0; p.fullMoonTurn = undefined;
    const before = cs.log.length;
    endTurn(cs);
    expect(cs.log.slice(before).some((l) => l.includes('蓄足')), '劍意有發動').toBe(true);
    expect(p.doubleNext, '紀錄說加倍，實際也要加倍').toBe(1);
  });
});
