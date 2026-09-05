import { describe, expect, it } from 'vitest';

import { STARTER_DECK, cardById } from '../../src/content/cards';
import { damageEnemy } from '../../src/engine/actions';
import { playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { CombatState } from '../../src/engine/types';
import { describeCard } from '../../src/ui/cardtext';
import { inst } from '../helpers';

/**
 * 2026-09-05 晚使用者回報的三件：
 * 1. 連環踢「造成 5 點傷害，連打 3 次」畫面卻只彈一個 −15——引擎要把每一段留下來（`cs.hits`），畫面才拆得成三下。
 * 2. 迴旋踢升級版改成 7 點 ×3（蜷縮 4 照舊）。
 * 3. 打贏巨型飯糰有沒有回血：`onDeathHealPlayer: 10`，這裡釘住它真的會回、而且不超過上限。
 * 對手一律木樁人（不出手），數字才好算。
 */
function start(extra: [string, boolean][], encounterId = 'wood_dummy', hp = 80): CombatState {
  const deck = [...STARTER_DECK.map((id, i) => inst(id, i + 1)), ...extra.map(([id, up], i) => inst(id, 100 + i, up))];
  const cs = startCombat({ hp, maxHp: hp, deck, relics: [], potions: [], encounterId, rng: new Rng(seedFromString('fixes-0905c')) });
  cs.player.energy = 9;
  return cs;
}
function toHand(cs: CombatState, uid: number): void {
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) {
    const i = pile.findIndex((c) => c.uid === uid);
    if (i >= 0) { const [c] = pile.splice(i, 1); cs.player.hand.unshift(c!); return; }
  }
  throw new Error('找不到牌 ' + uid);
}

describe('多段傷害每一段都留下紀錄（畫面拆成一下一下演）', () => {
  it('連環踢 5×3 對 7 點防禦：三段各記 0、3、5', () => {
    const cs = start([['lianhuan', false]]); toHand(cs, 100);
    const e = cs.enemies[0]!; e.block = 7;
    const hp0 = e.hp;
    playCard(cs, 100, e.uid);
    const mine = cs.hits.filter((h) => h.uid === e.uid).map((h) => h.amount);
    expect(mine).toEqual([0, 3, 5]);
    expect(hp0 - e.hp).toBe(8);
  });
  it('第二段就打倒：只記兩段，不再打第三下', () => {
    const cs = start([['lianhuan', false]]); toHand(cs, 100);
    const e = cs.enemies[0]!; e.hp = 7;
    playCard(cs, 100, e.uid);
    expect(cs.hits.filter((h) => h.uid === e.uid).map((h) => h.amount)).toEqual([5, 2]);
    expect(e.dead).toBe(true);
  });
  it('單段牌只記一段', () => {
    const cs = start([['sanjo', false]]); toHand(cs, 100);   // 指名一張貓抓，不靠起手牌組順序
    const e = cs.enemies[0]!;
    playCard(cs, 100, e.uid);
    expect(cs.hits.filter((h) => h.uid === e.uid)).toHaveLength(1);
  });
});

describe('迴旋踢升級版：7 點 ×3、蜷縮 4', () => {
  it('效果表', () => {
    expect(cardById['huixuan']!.upgrade!.effects).toEqual([{ kind: 'damage', amount: 7, times: 3 }, { kind: 'block', amount: 4 }]);
    expect(describeCard(cardById['huixuan']!, true)).toContain('造成 7 點傷害，連打 3 次');
  });
  it('實打木樁人：掉 21 血、球球得 4 蜷縮', () => {
    const cs = start([['huixuan', true]]); toHand(cs, 100);
    const e = cs.enemies[0]!; const hp0 = e.hp;
    playCard(cs, 100, e.uid);
    expect(hp0 - e.hp).toBe(21);
    expect(cs.player.block).toBe(4);
  });
});

describe('巨型飯糰：打倒回血 10', () => {
  it('40/70 打倒後 50；65/70 只補到 70', () => {
    let cs = start([], 'giant_onigiri', 70); cs.player.hp = 40;
    damageEnemy(cs, cs.enemies[0]!, 9999);
    expect(cs.enemies[0]!.dead).toBe(true);
    expect(cs.player.hp).toBe(50);
    cs = start([], 'giant_onigiri', 70); cs.player.hp = 65;
    damageEnemy(cs, cs.enemies[0]!, 9999);
    expect(cs.player.hp).toBe(70);
  });
});
