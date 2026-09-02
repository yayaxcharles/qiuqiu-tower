import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addPotion, buyPotion, finishCombat, makeShop, newRun, potionCapacity, replacePotion, takeRelic } from '../../src/engine/run';
import { inst } from '../helpers';

/** 忍具格（2026-09-02）：忍具袋多一格；帶滿時新拿到的可以換掉舊的；罐頭鋪帶滿要先選要換哪支才付錢 */
describe('忍具格', () => {
  it('預設三格，忍具袋多一格', () => {
    const r = newRun('pot');
    expect(potionCapacity(r)).toBe(3);
    takeRelic(r, 'potion_bag');
    expect(potionCapacity(r)).toBe(4);
    for (let i = 0; i < 4; i++) expect(addPotion(r, 'whetstone')).toBe(true);
    expect(addPotion(r, 'whetstone')).toBe(false);
  });
  it('換掉第 index 支', () => {
    const r = newRun('swap');
    addPotion(r, 'whetstone'); addPotion(r, 'whetstone'); addPotion(r, 'whetstone');
    expect(replacePotion(r, 1, 'claw_oil')).toBe(true);
    expect(r.potions).toEqual(['whetstone', 'claw_oil', 'whetstone']);
    expect(replacePotion(r, 5, 'claw_oil')).toBe(false);
    expect(replacePotion(r, 0, 'no_such')).toBe(false);
  });
  it('罐頭鋪帶滿：沒指定要換哪支就不賣也不扣錢；指定了才換', () => {
    const r = newRun('shop-pot'); r.fish = 500;
    addPotion(r, 'whetstone'); addPotion(r, 'whetstone'); addPotion(r, 'whetstone');
    const shop = makeShop(r);
    const fish = r.fish;
    expect(buyPotion(r, shop, 0)).toBe(false);
    expect(r.fish).toBe(fish);
    expect(buyPotion(r, shop, 0, 2)).toBe(true);
    expect(r.fish).toBe(fish - shop.potions[0]!.price);
    expect(r.potions[2]).toBe(shop.potions[0]!.id);
    expect(shop.potions[0]!.sold).toBe(true);
  });
  it('戰鬥獎勵帶滿：收不下的那支記在 potionMissed', () => {
    const r = newRun('reward-pot');
    addPotion(r, 'whetstone'); addPotion(r, 'whetstone'); addPotion(r, 'whetstone');
    r.map.nodes[0]!.encounterId = 'cucumber'; r.currentNode = r.map.nodes[0]!.id;
    const cs = startCombat({ hp: 70, maxHp: 70, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [...r.potions], encounterId: 'cucumber', rng: new Rng(seedFromString('x')) });
    cs.enemies.forEach((e) => { e.hp = 0; e.dead = true; }); cs.phase = 'won';
    let rewards = null;
    for (let i = 0; i < 40 && !rewards?.potionMissed; i++) { r.rng = new Rng(seedFromString(`p${i}`)).state; rewards = finishCombat(r, cs); }
    expect(rewards?.potionMissed ?? null).not.toBeNull();
    expect(rewards?.potion).toBeNull();
  });
});
