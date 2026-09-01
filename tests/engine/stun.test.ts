import { describe, expect, it } from 'vitest';

import { STARTER_DECK } from '../../src/content/cards';
import { canPlay, endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CardInstance } from '../../src/engine/types';
import { inst } from '../helpers';

/**
 * 球球被定身：這回合攻擊牌打不出、技能照打，回合結束消掉。
 * 這一側漏了很久——毛線球怪的「纏住」一直是空包彈（使用者實玩抓到）。
 */
describe('球球被定身', () => {
  const deck = (): CardInstance[] => STARTER_DECK.map((id, i) => inst(id, i + 1));

  it('攻擊牌鎖住、技能牌照打、下回合解除', () => {
    const cs = startCombat({
      hp: 70, maxHp: 70, deck: deck(), relics: [], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('stun')),
    });
    addStatus(cs.player, '定身', 1);
    const atk = cs.player.hand.find((c) => c.cardId === 'sanjo');
    const skl = cs.player.hand.find((c) => c.cardId === 'tanding');
    if (atk) {
      const chk = canPlay(cs, atk.uid, cs.enemies[0]!.uid);
      expect(chk.ok).toBe(false);
      if (!chk.ok) expect(chk.reason).toContain('纏住');
    }
    if (skl) expect(canPlay(cs, skl.uid).ok).toBe(true);
    expect(atk || skl, '起手至少要抽到一張貓抓或淡定').toBeTruthy();

    endTurn(cs);
    expect(getStatus(cs.player, '定身')).toBe(0);   // 回合結束衰減掉
  });
});
