import { describe, expect, it } from 'vitest';

import { STARTER_DECK } from '../../src/content/cards';
import { gainStealth } from '../../src/engine/actions';
import { endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { getStatus } from '../../src/engine/statuses';
import type { CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

/** 三花貓武僧的破式（使用者 2026-09-04）：每三回合把球球的隱身與潛水各砍一半。 */
function start(): CombatState {
  return startCombat({
    hp: 300, maxHp: 300, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [],
    encounterId: 'calico_monk', rng: new Rng(seedFromString('monk')),
  });
}

describe('三花貓武僧・破式', () => {
  it('第三回合出破式，隱身與潛水各砍一半（向下取整）', () => {
    const cs = start();
    const e = cs.enemies[0]!;
    expect(e.move.label, '第一回合不是破式').not.toBe('破式');
    endTurn(cs);
    endTurn(cs);
    expect(e.move.label, '第三回合輪到破式').toBe('破式');
    gainStealth(cs, 5);
    cs.player.statuses['潛水'] = 3;
    cs.player.block = 99;
    endTurn(cs);
    // 破式先砍：隱身 5→2、潛水 3→1；接著換球球的回合，剩下的潛水 1 照常換成 1 層隱身 → 2＋1＝3
    expect(getStatus(cs.player, '隱身'), '砍完再加上潛水換來的那層').toBe(3);
    expect(getStatus(cs.player, '潛水'), '潛水在回合開始換成隱身，歸零').toBe(0);
  });

  it('沒有隱身時破式照樣打人，不會空轉', () => {
    const cs = start();
    const e = cs.enemies[0]!;
    endTurn(cs); endTurn(cs);
    expect(e.move.label).toBe('破式');
    const hp = cs.player.hp;
    cs.player.block = 0;
    endTurn(cs);
    expect(cs.player.hp, '破式本身有 10 點傷害').toBeLessThan(hp);
  });
});
