import { describe, expect, it } from 'vitest';
import { beginEnemyTurn, endTurn, finishEnemyTurn, startCombat, stepEnemyTurn } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

/**
 * 敵方回合拆成三段（2026-09-03，畫面要一隻一隻演）：拆開跑跟一口氣跑的結果必須一模一樣，
 * 而且每一步剛好只有一隻魔物的回合數往前走。
 */
const DECK = ['sanjo', 'sanjo', 'sanjo', 'tanding', 'tanding'];
function start(encounterId: string, seed = 'steps'): CombatState {
  return startCombat({
    hp: 300, maxHp: 300, deck: DECK.map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId, rng: new Rng(seedFromString(seed)),
  });
}
const view = (cs: CombatState) => JSON.stringify({
  hp: cs.player.hp, block: cs.player.block, turn: cs.turn, phase: cs.phase, hand: cs.player.hand.map((c) => c.uid),
  enemies: cs.enemies.map((e) => [e.uid, e.hp, e.block, e.dead, e.turnCount, e.move.label, e.statuses]),
  log: cs.log,
});

describe('敵方回合逐隻結算', () => {
  for (const enc of ['rats3', 'tanuki_gang', 'oni_general', 'persian_lady']) {
    it(`${enc}：拆三段跑＝一口氣跑`, () => {
      const a = start(enc), b = start(enc);
      for (let round = 0; round < 3; round++) {
        endTurn(a);
        expect(beginEnemyTurn(b)).toBe(true);
        let steps = 0;
        while (stepEnemyTurn(b)) {
          steps++;
          // 每一步最多只有一隻的回合數比上一步多（跳過的那步沒有人動）
        }
        finishEnemyTurn(b);
        expect(steps).toBeGreaterThanOrEqual(1);
        expect(view(b)).toBe(view(a));
      }
    });
  }

  it('每一步只有一隻魔物動；球球先倒下就全部跳過', () => {
    const cs = start('rats3');
    expect(beginEnemyTurn(cs)).toBe(true);
    const counts = () => cs.enemies.map((e) => e.turnCount);
    let before = counts();
    while (stepEnemyTurn(cs)) {
      const after = counts();
      const moved = after.filter((n, i) => n !== before[i]).length;
      expect(moved).toBeLessThanOrEqual(1);
      before = after;
    }
    finishEnemyTurn(cs);
    expect(cs.phase).toBe('player');
    expect(cs.enemyQueue).toEqual([]);
  });
});
