import { describe, expect, it } from 'vitest';

import { STARTER_DECK } from '../../src/content/cards';
import { damageEnemy } from '../../src/engine/actions';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { CardInstance } from '../../src/engine/types';
import { inst } from '../helpers';

/**
 * 「一起死才算數」（`reviveGroup`）。這是為了做出使用者要的
 * 「三隻怪要兩回合內全部一起死亡不然會復活」而加的引擎機制，
 * 影子小貓三隻就是靠它，所以要有回歸測試釘住。
 */
describe('一起死才算數', () => {
  const deck = (ids: readonly string[]): CardInstance[] => ids.map((id, i) => inst(id, i + 1));

  it('同伴還活著就會爬起來；三隻一起清光才算贏', () => {
    const cs = startCombat({
      hp: 70, maxHp: 70, deck: deck(STARTER_DECK), relics: [], potions: [],
      encounterId: 'shadow_kittens', rng: new Rng(seedFromString('rev')),
    });
    expect(cs.enemies.length).toBe(3);

    // 只打倒一隻：同伴還站著，所以還不算贏
    damageEnemy(cs, cs.enemies[0]!, 999, { direct: true });
    expect(cs.enemies[0]!.dead).toBe(true);
    expect(cs.phase).toBe('player');

    // 回合開始時爬起來，血量回到 reviveHp
    endTurn(cs);
    expect(cs.enemies[0]!.dead).toBe(false);
    expect(cs.enemies[0]!.hp).toBe(8);

    // 同一回合把三隻一起清光才算贏
    for (const e of cs.enemies) damageEnemy(cs, e, 999, { direct: true });
    expect(cs.phase).toBe('won');
  });

  it('只限本回合的能力，回合結束就過期', () => {
    // 吸貓大法的基礎版是 `thisTurn` 的能力：本回合每打倒一隻魔物回 4 血，回合一過就沒了
    const cs = startCombat({
      hp: 40, maxHp: 70, deck: deck([...STARTER_DECK, 'renwuwancheng']), relics: [], potions: [],
      encounterId: 'rats2', rng: new Rng(seedFromString('pw')),
    });
    cs.player.energy = 9;
    const c = [...cs.player.hand, ...cs.player.drawPile].find((x) => x.cardId === 'renwuwancheng')!;
    cs.player.drawPile.splice(cs.player.drawPile.indexOf(c), 1);
    cs.player.hand.unshift(c);
    playCard(cs, c.uid);
    expect(cs.player.powers.length).toBe(1);

    // 本回合打倒魔物有回血
    const before = cs.player.hp;
    damageEnemy(cs, cs.enemies[0]!, 999, { direct: true });
    expect(cs.player.hp).toBe(before + 4);

    // 回合結束後能力消失，再打倒就不回血了
    endTurn(cs);
    expect(cs.player.powers.length).toBe(0);
  });
});
