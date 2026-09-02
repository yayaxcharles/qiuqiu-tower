import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { inst } from '../helpers';

/**
 * 「被擋下來」要留紀錄：畫面靠戰鬥紀錄才知道這一下是被蜷縮／防禦吃掉的，
 * 才能飄「擋住 N」跟盾牌動畫（使用者 2026-09-02：「怪物如果格擋完全沒回饋，以為遊戲壞掉」）。
 */
function start(encounterId: string) {
  return startCombat({
    hp: 70, maxHp: 70, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [],
    encounterId, rng: new Rng(seedFromString('blocklog')),
  });
}

describe('擋下傷害的紀錄', () => {
  it('球球的蜷縮擋下魔物的攻擊時，紀錄寫「蜷縮擋下了 N 點」', () => {
    const cs = start('cucumber');
    const e = cs.enemies[0]!;
    e.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    cs.player.block = 5;
    endTurn(cs);
    expect(cs.log.some((l) => l === '蜷縮擋下了 5 點')).toBe(true);
  });
  it('魔物的防禦擋下球球的攻擊時，紀錄寫「<名字>的防禦擋下了 N 點」', () => {
    const cs = start('cucumber');
    const e = cs.enemies[0]!;
    e.block = 10;
    const card = cs.player.hand.find((c) => c.cardId === 'sanjo') ?? cs.player.hand[0]!;
    cs.player.hand = [card];
    playCard(cs, card.uid, e.uid);   // 貓抓 6 點，全被 10 點防禦吃掉
    expect(cs.log.some((l) => l === `${e.name}的防禦擋下了 6 點`)).toBe(true);
    expect(e.hp).toBe(e.maxHp);
  });
  it('反彈回敬魔物時，紀錄寫「反彈回敬了<名字> N 點」', () => {
    const cs = start('cucumber');
    const e = cs.enemies[0]!;
    e.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    cs.player.statuses['反彈'] = 4;
    const hp = e.hp;
    endTurn(cs);
    expect(cs.log.some((l) => l === `${e.name}：反彈回敬了` || l === `反彈回敬了${e.name} 4 點`)).toBe(true);
    expect(e.hp).toBe(hp - 4);
  });
});
