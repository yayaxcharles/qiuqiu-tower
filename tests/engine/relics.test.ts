import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { getStatus } from '../../src/engine/statuses';
import type { CardInstance, CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

function deck(ids: string[]): CardInstance[] { return ids.map((id, i) => inst(id, i + 1)); }
function start(relics: string[], encounterId = 'cucumber', hp = 60, extra: string[] = []): CombatState {
  return startCombat({ hp, maxHp: 70, deck: deck([...STARTER_DECK, ...extra]), relics, potions: [], encounterId, rng: new Rng(seedFromString('relic')) });
}
function toHand(cs: CombatState, cardId: string): number {
  const all = [...cs.player.hand, ...cs.player.drawPile, ...cs.player.discardPile];
  const c = all.find((x) => x.cardId === cardId)!;
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) { const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1); }
  cs.player.hand.unshift(c);
  return c.uid;
}
function attackNext(cs: CombatState, amount: number): void {
  cs.enemies[0]!.move = { intent: 'attack', label: '打', effects: [{ kind: 'damage', amount }] };
}

describe('秘寶（戰鬥端）', () => {
  it('藍頭巾：第一回合多抽 1；沒有就 5', () => {
    expect(start(['blue_headband']).player.hand.length).toBe(6);
    expect(start([]).player.hand.length).toBe(5);
  });
  it('飯糰袋：第一回合 4 顆，第二回合 3 顆', () => {
    const cs = start(['onigiri_bag']);
    expect(cs.player.energy).toBe(4);
    endTurn(cs);
    expect(cs.player.energy).toBe(3);
  });
  it('塔主令牌：每回合 4 顆', () => {
    const cs = start(['tower_token']);
    expect(cs.player.energy).toBe(4); endTurn(cs); expect(cs.player.energy).toBe(4);
  });
  it('鈴鐺、秘笈、銅鏡、貓薄荷：開戰效果', () => {
    const cs = start(['bell', 'scroll', 'bronze_mirror', 'catnip']);
    expect(getStatus(cs.player, '隱身')).toBe(1);
    expect(getStatus(cs.player, '爪力')).toBe(1);
    expect(getStatus(cs.player, '反彈')).toBe(2);
    expect(cs.player.hp).toBe(63);
  });
  it('銅鏡的反彈會回敬攻擊者', () => {
    const cs = start(['bronze_mirror']);
    const e = cs.enemies[0]!; const hp = e.hp;
    attackNext(cs, 7); endTurn(cs);
    expect(e.hp).toBe(hp - 2);
  });
  it('尾巴鈴：沒打攻擊牌就給 4 蜷縮', () => {
    const cs = start(['tail_bell']);
    attackNext(cs, 7); endTurn(cs);
    expect(cs.player.hp).toBe(57);          // 7 − 4
  });
  it('毛線球：每回合第一張便宜 1', () => {
    const cs = start(['yarn_ball']);
    const e = cs.enemies[0]!.uid;
    playCard(cs, toHand(cs, 'sanjo'), e); expect(cs.player.energy).toBe(3);
    playCard(cs, toHand(cs, 'sanjo'), e); expect(cs.player.energy).toBe(2);
  });
  it('逗貓棒：第 3 張牌抽 1', () => {
    const cs = start(['cat_teaser'], 'wood_dummy');
    const e = cs.enemies[0]!.uid;
    cs.player.energy = 9;
    // toHand 會把不在手上的參上撈進手牌，所以每張都要「撈完之後」才量手牌張數
    const u1 = toHand(cs, 'sanjo'); const n1 = cs.player.hand.length;
    playCard(cs, u1, e);
    expect(cs.player.hand.length).toBe(n1 - 1);   // 第 1 張：只是打出去
    const u2 = toHand(cs, 'sanjo'); const n2 = cs.player.hand.length;
    playCard(cs, u2, e);
    expect(cs.player.hand.length).toBe(n2 - 1);   // 第 2 張：只是打出去
    const u3 = toHand(cs, 'sanjo'); const n3 = cs.player.hand.length;
    playCard(cs, u3, e);
    expect(cs.player.cardsPlayedThisTurn).toBe(3);
    expect(cs.player.hand.length).toBe(n3);       // 第 3 張：−1 ＋1
  });
  it('紙袋：每回合第一次隱身多 1 層', () => {
    const cs = start(['paper_bag'], 'wood_dummy', 60, ['kawarimi']);
    playCard(cs, toHand(cs, 'kawarimi')); expect(getStatus(cs.player, '隱身')).toBe(2);
    playCard(cs, toHand(cs, 'kawarimi')); expect(getStatus(cs.player, '隱身')).toBe(3);
  });
});
