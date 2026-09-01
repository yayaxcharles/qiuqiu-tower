import { describe, expect, it } from 'vitest';

import { STARTER_DECK } from '../../src/content/cards';
import { damageEnemy } from '../../src/engine/actions';
import { endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { CardInstance } from '../../src/engine/types';
import { inst } from '../helpers';

describe('魔物的蜷縮', () => {
  const deck = (ids: readonly string[]): CardInstance[] => ids.map((id, i) => inst(id, i + 1));
  const start = (encounterId: string, seed = 'blk') => startCombat({
    hp: 70, maxHp: 70, deck: deck(STARTER_DECK), relics: [], potions: [], encounterId,
    rng: new Rng(seedFromString(seed)),
  });

  it('魔物出防禦招之後，蜷縮要留到球球的回合並擋下傷害', () => {
    const cs = start('rats2');
    // 把兩隻都推到「躲」那一招（小老鼠兵第三招是躲，5 點蜷縮）
    for (let i = 0; i < 6; i++) {
      endTurn(cs);
      const e = cs.enemies.find((x) => !x.dead)!;
      if (e.block > 0) {
        const before = e.hp;
        const got = e.block;
        damageEnemy(cs, e, 3);       // 打 3，應該全部被蜷縮吃掉
        expect(e.hp, '蜷縮該擋住這一下').toBe(before);
        expect(e.block).toBe(got - 3);
        damageEnemy(cs, e, 99);      // 打爆蜷縮，剩下的要進血量
        expect(e.hp).toBeLessThan(before);
        return;
      }
    }
    throw new Error('六個回合內沒有任何魔物拿到蜷縮');
  });
});
