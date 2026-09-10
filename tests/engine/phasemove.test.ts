import { describe, expect, it } from 'vitest';
import { endTurn, startCombat } from '../../src/engine/combat';
import { addStatus } from '../../src/engine/statuses';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { CombatState } from '../../src/engine/types';

function start(encounterId: string): CombatState {
  const cs = startCombat({ hp: 9999, maxHp: 9999, deck: [], relics: [], potions: [],
    encounterId, rng: new Rng(seedFromString('phase')) });
  cs.player.drawPile = []; cs.player.hand = [];
  return cs;
}

/**
 * 換階段那一拍排好的招不能被回合尾端的排招蓋掉。
 * 這一組守的是稽核 2026-09-10 高-1：師父被反彈打完一條血時，「蹲下調息」被換成下一階段的第一招，
 * 玩家白賺的那個回合整個消失。原本**沒有任何測試碰血條式（hpBar）換血條**，所以那個洞掉下去沒人喊。
 */
describe('換階段那一拍排好的招', () => {
  it('師父出招時被反彈打完一條血：頭上留著「蹲下調息」，不會被下一階段的招蓋掉', () => {
    const cs = start('tower_master');
    const m = cs.enemies[0]!;
    addStatus(cs.player, '反彈', 99);   // 反彈流：牠一出手就被打完剩下的血
    m.block = 0; m.hp = 3;
    cs.player.block = 0;
    const phase = m.phase;
    endTurn(cs);
    expect(m.phase, '打完一條血要進下一階段').toBe(phase + 1);
    expect(m.move.label, '蹲下調息不能被排招蓋掉').toBe('蹲下調息');
  });

  it('但牠真的演完調息之後，下一招照排（不能一直卡在調息）', () => {
    const cs = start('tower_master');
    const m = cs.enemies[0]!;
    m.block = 0; m.hp = 3; m.invulnIn = 0;
    // 玩家回合中途打完一條血：這時 phaseAtAct 還沒開始算，牠這一拍就是調息
    addStatus(cs.player, '反彈', 99);
    cs.player.block = 0;
    endTurn(cs);
    expect(m.move.label).toBe('蹲下調息');
    cs.player.block = 999;
    endTurn(cs);                        // 這一拍牠演調息
    expect(m.move.label, '演完就該換下一招').not.toBe('蹲下調息');
  });
});
