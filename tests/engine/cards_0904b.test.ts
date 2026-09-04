import { describe, expect, it } from 'vitest';

import { STARTER_DECK, cardById } from '../../src/content/cards';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { CombatState, StatusName } from '../../src/engine/types';
import { describeCard } from '../../src/ui/cardtext';
import { inst } from '../helpers';

/**
 * 2026-09-04 牌池補牌帶進來的四個新機制（催噎 `doubleStatus`、背刺 `ifTargetDebuffed`、
 * 追擊 `energy.onKill`、抖毛 `cleanse.max`）與新狀態「鐵布衫」。
 * 對手一律木樁人（40 血、不出手），數字才好算。
 */
function start(extra: [string, boolean][], hp = 80): CombatState {
  const deck = [...STARTER_DECK.map((id, i) => inst(id, i + 1)), ...extra.map(([id, up], i) => inst(id, 100 + i, up))];
  const cs = startCombat({ hp, maxHp: hp, deck, relics: [], potions: [], encounterId: 'wood_dummy', rng: new Rng(seedFromString('cards-0904b')) });
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
const foe = (cs: CombatState, name: StatusName): number => cs.enemies[0]!.statuses[name] ?? 0;
const me = (cs: CombatState, name: StatusName): number => cs.player.statuses[name] ?? 0;

describe('2026-09-04 補牌的新機制', () => {
  it('催噎：基礎版對 0 層催不動（飯糰照扣）、4 層翻成 8；升級版 0 層加 2、4 層變 10', () => {
    let cs = start([['cuiye', false]]); toHand(cs, 100);
    playCard(cs, 100, cs.enemies[0]!.uid);
    expect(foe(cs, '噎到')).toBe(0);
    expect(cs.player.energy).toBe(8);

    cs = start([['cuiye', false]]); toHand(cs, 100); cs.enemies[0]!.statuses['噎到'] = 4;
    playCard(cs, 100, cs.enemies[0]!.uid);
    expect(foe(cs, '噎到')).toBe(8);

    cs = start([['cuiye', true]]); toHand(cs, 100);
    playCard(cs, 100, cs.enemies[0]!.uid);
    expect(foe(cs, '噎到')).toBe(2);

    cs = start([['cuiye', true]]); toHand(cs, 100); cs.enemies[0]!.statuses['噎到'] = 4;
    playCard(cs, 100, cs.enemies[0]!.uid);
    expect(foe(cs, '噎到')).toBe(10);
  });

  it('背刺：目標沒減益只打 6，有減益（懶洋洋）打 6＋6', () => {
    let cs = start([['beici', false]]); toHand(cs, 100);
    playCard(cs, 100, cs.enemies[0]!.uid);
    expect(cs.enemies[0]!.hp).toBe(40 - 6);

    cs = start([['beici', false]]); toHand(cs, 100); cs.enemies[0]!.statuses['懶洋洋'] = 1;
    playCard(cs, 100, cs.enemies[0]!.uid);
    expect(cs.enemies[0]!.hp).toBe(40 - 12);
  });

  it('追擊：打倒目標退 2 顆飯糰，沒打倒不退', () => {
    let cs = start([['zhuiji', false]]); toHand(cs, 100);
    playCard(cs, 100, cs.enemies[0]!.uid);
    expect(cs.enemies[0]!.dead).toBe(false);
    expect(cs.player.energy).toBe(7);

    cs = start([['zhuiji', false]]); toHand(cs, 100); cs.enemies[0]!.hp = 5;
    playCard(cs, 100, cs.enemies[0]!.uid);
    expect(cs.enemies[0]!.dead).toBe(true);
    expect(cs.player.energy).toBe(9);
  });

  it('抖毛：清掉 1 種減益（翻肚優先）並抽 1 張；升級清 2 種', () => {
    let cs = start([['doumao', false]]); toHand(cs, 100);
    cs.player.statuses['翻肚'] = 2; cs.player.statuses['噎到'] = 3;
    const hand = cs.player.hand.length;
    playCard(cs, 100);
    expect(me(cs, '翻肚')).toBe(0);
    expect(me(cs, '噎到')).toBe(3);
    expect(cs.player.hand.length, '打掉 1 張、抽回 1 張').toBe(hand);

    cs = start([['doumao', true]]); toHand(cs, 100);
    cs.player.statuses['翻肚'] = 2; cs.player.statuses['噎到'] = 3;
    playCard(cs, 100);
    expect(me(cs, '翻肚')).toBe(0);
    expect(me(cs, '噎到')).toBe(0);
  });

  it('鐵布衫：當回合 8 蜷縮（吃貓步），下回合開始再拿 4（也吃貓步）', () => {
    const cs = start([['tiebushan', false]]); toHand(cs, 100);
    cs.player.statuses['貓步'] = 2;
    playCard(cs, 100);
    expect(cs.player.block).toBe(10);
    expect(me(cs, '鐵布衫')).toBe(4);
    endTurn(cs);
    expect(me(cs, '鐵布衫')).toBe(0);
    expect(cs.player.block).toBe(6);
  });

  it('牌面文字', () => {
    const t = (id: string, up = false) => describeCard(cardById[id]!, up);
    expect(t('cuiye')).toBe('把目標身上的噎到翻倍（沒有就沒效果）。');
    expect(t('cuiye', true)).toBe('把目標身上的噎到翻倍，再加 2 層。');
    expect(t('zhuiji')).toBe('造成 10 點傷害；打倒牠就拿回 2 顆飯糰。');
    expect(t('beici')).toBe('造成 6 點傷害，目標身上有任何減益就再造成 6 點傷害。');
    expect(t('tiebushan')).toBe('獲得 8 點蜷縮，下回合開始時再獲得 4 點蜷縮。');
    expect(t('doumao')).toBe('清掉自己身上 1 種減益，抽 1 張牌。');
  });
});
