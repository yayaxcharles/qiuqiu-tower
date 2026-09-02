import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { relicById, relics } from '../../src/content/relics';
import { endTurn, startCombat } from '../../src/engine/combat';
import { nextChoices, nodeById } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';
import { rollCardChoices, rollRelic, rollRewards } from '../../src/engine/rewards';
import { addCard, addPotion, advanceAct, applyRunEffects, beginCombat, buyCard, buyPotion, buyRelic, buyRemove, chooseNode, finishCombat, makeShop, newRun, openChest, removeCard, rest, rollActRelics, runRng, takeCardReward, takeRelic, upgradeCard } from '../../src/engine/run';
import type { RunState } from '../../src/engine/types';

function fresh(seed = 'run'): RunState { return newRun(seed); }
function goTo(run: RunState, type: string): void {   // 一路往上走到第一個指定類型的節點
  for (let guard = 0; guard < 20; guard++) {
    const choices = nextChoices(run.map, run.currentNode);
    const hit = choices.find((n) => n.type === type);
    chooseNode(run, (hit ?? choices[0]!).id);
    if (hit) return;
  }
  throw new Error(`找不到 ${type}`);
}

describe('新的一局', () => {
  it('起手狀態', () => {
    const run = fresh();
    expect(run.hp).toBe(76); expect(run.maxHp).toBe(76); expect(run.fish).toBe(50);
    expect(run.deck.length).toBe(10); expect(run.relics).toEqual(['blue_headband']);
    expect(run.potions).toEqual([]); expect(run.floor).toBe(0); expect(run.currentNode).toBeNull();
    expect(run.status).toBe('playing'); expect(run.removeCost).toBe(75);
  });
  it('同種子同一局；runRng 會把狀態寫回 run', () => {
    const a = fresh('x'), b = fresh('x');
    expect(a.map).toEqual(b.map);
    const before = JSON.stringify(a.rng);
    runRng(a).next();
    expect(JSON.stringify(a.rng)).not.toBe(before);
  });
  it('chooseNode 只接受可走的節點', () => {
    const run = fresh();
    expect(() => chooseNode(run, 'f3-l0')).toThrow();
    const n = chooseNode(run, run.map.start[1]!);
    expect(run.currentNode).toBe(n.id); expect(run.floor).toBe(1);
  });
});

describe('戰鬥與獎勵', () => {
  it('打贏一般戰鬥：生命與小魚乾寫回、給 3 張忍術', () => {
    const run = fresh('fight');
    chooseNode(run, run.map.start[0]!);
    const cs = beginCombat(run);
    for (const e of cs.enemies) e.hp = 1;
    cs.player.hp = 40;
    // 直接把魔物打死：用最簡單的方式——把牠們標記死亡並設勝利
    for (const e of cs.enemies) { e.dead = true; } cs.phase = 'won'; cs.kills = cs.enemies.length; cs.fishDelta = 5;
    const r = finishCombat(run, cs)!;
    expect(r.kind).toBe('戰鬥');
    expect(r.cards.length).toBe(3);
    expect(r.cards.every((c) => c.pool === '忍術')).toBe(true);
    expect(r.fish).toBeGreaterThanOrEqual(15); expect(r.fish).toBeLessThanOrEqual(25);   // 2026-09-01 戰利品改成 15～25
    expect(run.hp).toBe(40); expect(run.fish).toBe(50 + 5 + r.fish); expect(run.stats.kills).toBe(cs.enemies.length);
    takeCardReward(run, r, r.cards[0]!.id);
    expect(run.deck.length).toBe(11);
  });
  it('大魔物獎勵含秘寶與一張絕學；塔主通關', () => {
    const rng = new Rng(seedFromString('elite'));
    const r = rollRewards(rng, '大魔物', ['blue_headband'], 0);
    expect(relicById[r.relic!]?.pool).toBe('大魔物');
    expect(r.cards.some((c) => c.pool === '絕學')).toBe(true);
    expect(r.fish).toBe(35);   // 2026-09-01 收入調升（商店原本形同虛設）
    const run = fresh('boss');
    run.currentNode = run.map.nodes.find((n) => n.type === '塔主')!.id; run.floor = 15;
    const cs = beginCombat(run);
    for (const e of cs.enemies) e.dead = true; cs.phase = 'won'; cs.kills = 1;
    const b = finishCombat(run, cs)!;
    expect(b.kind).toBe('塔主'); expect(b.relic).toBe('tower_token'); expect(b.fish).toBe(100);
    // 三關制：第一關的關主倒下不算通關，整局還在進行、等著進第二關
    expect(run.status).toBe('playing');
  });
  it('輸了就結束，但打倒過的魔物照樣算進統計', () => {
    const run = fresh('lose');
    chooseNode(run, run.map.start[0]!);
    const cs = beginCombat(run);
    cs.kills = 2; cs.turn = 4; cs.cardsPlayed = 7;
    cs.player.hp = 0; cs.phase = 'lost';
    expect(finishCombat(run, cs)).toBeNull();
    expect(run.status).toBe('lost'); expect(run.hp).toBe(0);
    expect(run.stats).toEqual({ kills: 2, turns: 4, cardsPlayed: 7 });
  });
  it('小魚乾罐：戰鬥勝利多拿 10 條', () => {
    const fight = (jar: boolean) => {
      const run = fresh('jar');
      if (jar) expect(takeRelic(run, 'fish_jar')).toBe(true);
      chooseNode(run, run.map.start[0]!);
      const cs = beginCombat(run);
      for (const e of cs.enemies) e.dead = true;
      cs.phase = 'won'; cs.kills = cs.enemies.length;
      return { run, r: finishCombat(run, cs)! };
    };
    const withJar = fight(true), without = fight(false);
    expect(without.r.fish).toBeGreaterThanOrEqual(10); expect(without.r.fish).toBeLessThanOrEqual(20);
    expect(withJar.r.fish).toBe(without.r.fish + 10);
    expect(withJar.r.fish).toBeGreaterThanOrEqual(20); expect(withJar.r.fish).toBeLessThanOrEqual(30);
    expect(withJar.run.fish).toBe(without.run.fish + 10);
  });
  it('戰鬥還沒結束不准收尾', () => {
    const run = fresh('guard');
    chooseNode(run, run.map.start[0]!);
    const hp = run.hp, fish = run.fish;
    const cs = beginCombat(run);
    expect(cs.phase).toBe('player');
    expect(() => finishCombat(run, cs)).toThrow();
    expect(run.hp).toBe(hp); expect(run.fish).toBe(fish);
  });
  it('rollCardChoices 不重複、依池；rollRelic 不給已擁有', () => {
    const rng = new Rng(seedFromString('roll'));
    const cs = rollCardChoices(rng, '絕學', 3);
    expect(new Set(cs.map((c) => c.id)).size).toBe(3);
    expect(cs.every((c) => c.pool === '絕學')).toBe(true);
    // 「全部都拿過了就給不出東西」。本來是寫死七個 id，秘寶一加就會壞——
    // 改成動態撈出整個池，之後再加秘寶也不用回來改這裡。
    const owned = relics.filter((r) => r.pool === '常見').map((r) => r.id);
    expect(rollRelic(rng, '常見', owned)).toBeNull();
    expect(relicById[rollRelic(rng, '常見', ['bell'])!]?.pool).toBe('常見');
  });
});

describe('牌組、秘寶、忍具', () => {
  it('加牌、升級、移除', () => {
    const run = fresh();
    const c = addCard(run, 'bunshin');
    expect(upgradeCard(run, c.uid)).toBe(true);
    expect(run.deck.find((x) => x.uid === c.uid)?.upgraded).toBe(true);
    expect(upgradeCard(run, c.uid)).toBe(false);
    expect(removeCard(run, c.uid)).toBe(true); expect(run.deck.length).toBe(10);
    expect(removeCard(run, 999)).toBe(false);
  });
  it('秘寶：不重複、鮪魚罐頭 +10 最大生命、塔主令牌 −10', () => {
    const run = fresh();
    expect(takeRelic(run, 'tuna_can')).toBe(true);
    expect(run.maxHp).toBe(86); expect(run.hp).toBe(86);
    expect(takeRelic(run, 'tuna_can')).toBe(false);
    expect(takeRelic(run, 'tower_token')).toBe(true);
    expect(run.maxHp).toBe(76); expect(run.hp).toBe(76);
  });
  it('忍具最多 3 個', () => {
    const run = fresh();
    expect(addPotion(run, 'tuna')).toBe(true); addPotion(run, 'tuna'); addPotion(run, 'tuna');
    expect(addPotion(run, 'rope')).toBe(false); expect(run.potions.length).toBe(3);
  });
});

describe('貓窩、紙箱、罐頭鋪', () => {
  it('打盹回 30%，貓草加倍；磨爪升級', () => {
    const run = fresh(); run.hp = 20;
    expect(rest(run, '打盹')).toBe(true); expect(run.hp).toBe(42);
    run.hp = 20; takeRelic(run, 'catgrass');
    rest(run, '打盹'); expect(run.hp).toBe(65);
    const uid = run.deck[0]!.uid;
    expect(rest(run, '磨爪', uid)).toBe(true); expect(run.deck[0]!.upgraded).toBe(true);
  });
  it('紙箱給一件沒有的常見秘寶', () => {
    const run = fresh();
    const id = openChest(run)!;
    expect(relicById[id]?.pool).toBe('常見'); expect(run.relics).toContain(id);
  });
  it('罐頭鋪：5 張牌（3 忍術 2 絕學）、2 秘寶、3 忍具；買牌扣錢；放生漲價', () => {
    const run = fresh('shop'); run.fish = 500;
    const shop = makeShop(run);
    expect(shop.cards.length).toBe(5);
    expect(shop.cards.filter((c) => c.def.pool === '忍術').length).toBe(3);
    expect(shop.cards.filter((c) => c.def.pool === '絕學').length).toBe(2);
    expect(shop.relics.length).toBe(2); expect(shop.potions.length).toBe(3);
    const price = shop.cards[0]!.price;
    expect(buyCard(run, shop, 0)).toBe(true); expect(run.fish).toBe(500 - price); expect(shop.cards[0]!.sold).toBe(true);
    expect(buyCard(run, shop, 0)).toBe(false);
    const uid = run.deck[0]!.uid;
    expect(buyRemove(run, uid)).toBe(true); expect(run.removeCost).toBe(100); expect(run.deck.some((c) => c.uid === uid)).toBe(false);
    run.fish = 0; expect(buyRemove(run, run.deck[0]!.uid)).toBe(false);
  });
  it('買秘寶：扣錢入袋；同一件、已擁有、錢不夠都不賣，狀態不動', () => {
    const run = fresh('shopR'); run.fish = 500;
    const shop = makeShop(run);
    const a = shop.relics[0]!, b = shop.relics[1]!;
    expect(buyRelic(run, shop, 0)).toBe(true);
    expect(run.fish).toBe(500 - a.price); expect(a.sold).toBe(true); expect(run.relics).toContain(a.id);
    expect(buyRelic(run, shop, 0)).toBe(false);            // 同一格不能買兩次
    expect(run.fish).toBe(500 - a.price);

    takeRelic(run, b.id);                                  // 從別處先拿到了同一件
    const fish = run.fish, n = run.relics.length;
    expect(buyRelic(run, shop, 1)).toBe(false);
    expect(run.fish).toBe(fish); expect(run.relics.length).toBe(n); expect(b.sold).toBe(false);

    const poor = fresh('shopR'); const shop2 = makeShop(poor);
    poor.fish = shop2.relics[0]!.price - 1;                // 差 1 條小魚乾（分級定價後照標價算）
    expect(buyRelic(poor, shop2, 0)).toBe(false);
    expect(poor.fish).toBe(shop2.relics[0]!.price - 1); expect(poor.relics).toEqual(['blue_headband']); expect(shop2.relics[0]!.sold).toBe(false);
  });
  it('買忍具：扣錢入袋；同一格、帶滿 3 個、錢不夠都不賣，狀態不動', () => {
    const run = fresh('shopP'); run.fish = 500;
    const shop = makeShop(run);
    const first = shop.potions[0]!.id;
    const paid = 500 - shop.potions[0]!.price;
    expect(buyPotion(run, shop, 0)).toBe(true);
    expect(run.fish).toBe(paid); expect(run.potions).toEqual([first]); expect(shop.potions[0]!.sold).toBe(true);
    expect(buyPotion(run, shop, 0)).toBe(false);           // 同一格不能買兩次
    expect(run.fish).toBe(paid);

    addPotion(run, 'tuna'); addPotion(run, 'tuna');
    expect(run.potions.length).toBe(3);
    const fish = run.fish;
    expect(buyPotion(run, shop, 1)).toBe(false);           // 帶滿了
    expect(run.fish).toBe(fish); expect(run.potions.length).toBe(3); expect(shop.potions[1]!.sold).toBe(false);

    const poor = fresh('shopP'); const shop2 = makeShop(poor);
    poor.fish = shop2.potions[0]!.price - 1;               // 差 1 條小魚乾（分級定價後照標價算）
    expect(buyPotion(poor, shop2, 0)).toBe(false);
    expect(poor.fish).toBe(shop2.potions[0]!.price - 1); expect(poor.potions).toEqual([]); expect(shop2.potions[0]!.sold).toBe(false);
  });
});

describe('事件結果', () => {
  it('各種整局效果', () => {
    const run = fresh('ev'); run.hp = 30; run.fish = 40;
    expect(applyRunEffects(run, [{ kind: 'heal', n: 20 }])).toBeNull(); expect(run.hp).toBe(50);
    applyRunEffects(run, [{ kind: 'damage', n: 6 }]); expect(run.hp).toBe(44);
    applyRunEffects(run, [{ kind: 'fishHalve' }]); expect(run.fish).toBe(20);
    applyRunEffects(run, [{ kind: 'maxHp', n: 5 }]); expect(run.maxHp).toBe(81); expect(run.hp).toBe(49);
    applyRunEffects(run, [{ kind: 'addCard', cardId: 'zhongji' }]); expect(run.deck.some((c) => c.cardId === 'zhongji')).toBe(true);
    applyRunEffects(run, [{ kind: 'addRandomCard', pool: '忍術', rarity: '罕見' }]);
    expect(cardById[run.deck.at(-1)!.cardId]?.rarity).toBe('罕見');
    applyRunEffects(run, [{ kind: 'potions', n: 2 }]); expect(run.potions.length).toBe(2);
    expect(applyRunEffects(run, [{ kind: 'removeCard' }])).toEqual({ needs: 'removeCard', n: 1 });
    expect(applyRunEffects(run, [{ kind: 'upgradeCard' }])).toEqual({ needs: 'upgradeCard', n: 1 });
    // 寫兩次就是要挑兩張——「升級兩張牌」的事件本來只升到一張
    expect(applyRunEffects(run, [{ kind: 'upgradeCard' }, { kind: 'upgradeCard' }])).toEqual({ needs: 'upgradeCard', n: 2 });
    expect(applyRunEffects(run, [{ kind: 'fight', encounterId: 'orange_bandit', bonusFish: 40 }])).toEqual({ fight: { encounterId: 'orange_bandit', bonusFish: 40 } });
    const pick = applyRunEffects(run, [{ kind: 'chooseCard', pool: '絕學', n: 3 }]);
    expect('chooseCard' in pick! && pick.chooseCard.length).toBe(3);
    applyRunEffects(run, [{ kind: 'relic', pool: '常見' }]); expect(run.relics.length).toBe(2);
  });
  it('賭注照種子決定', () => {
    const a = fresh('g'), b = fresh('g');
    const fx = [{ kind: 'gamble' as const, p: 0.5, win: [{ kind: 'maxHp' as const, n: 5 }], lose: [{ kind: 'addCard' as const, cardId: 'shishou' }] }];
    applyRunEffects(a, fx); applyRunEffects(b, fx);
    expect(a.maxHp).toBe(b.maxHp); expect(a.deck.length).toBe(b.deck.length);
  });
  it('事件戰鬥的獎金加在勝利上', () => {
    const run = fresh('bonus');
    chooseNode(run, run.map.start[0]!);
    const cs = beginCombat(run, 'orange_bandit');
    for (const e of cs.enemies) e.dead = true; cs.phase = 'won'; cs.kills = 1;
    const r = finishCombat(run, cs, 40)!;
    expect(run.fish).toBe(50 + r.fish + 40);
  });
});

describe('三關制', () => {
  it('第一二關的關主不是大俠貓；第三關固定是他', () => {
    for (const seed of ['a1', 'a2', 'a3']) {
      const run = newRun(seed);
      const boss = run.map.nodes.find((n) => n.type === '塔主')!;
      expect(['nekomata', 'iron_claw', 'orange_king']).toContain(boss.encounterId);
      advanceAct(run);
      const boss2 = run.map.nodes.find((n) => n.type === '塔主')!;
      expect(['cowcat_boss', 'tanuki_lord', 'persian_lady']).toContain(boss2.encounterId);
      advanceAct(run);
      const boss3 = run.map.nodes.find((n) => n.type === '塔主')!;
      expect(boss3.encounterId).toBe('tower_master');
    }
  });

  it('advanceAct：回滿血、換新地圖、樓層累計、第三關封頂', () => {
    const run = newRun('acts');
    run.hp = 12;
    const oldMap = run.map;
    advanceAct(run);
    expect(run.act).toBe(2);
    expect(run.hp).toBe(run.maxHp);          // 回滿血（使用者拍板）
    expect(run.map).not.toBe(oldMap);        // 新地圖
    expect(run.currentNode).toBeNull();
    expect(run.floor).toBe(15);              // 第二關從 16F 起跳，基底 15
    const n2 = chooseNode(run, run.map.start[0]!);
    expect(run.floor).toBe(15 + n2.floor);   // 顯示樓層累計
    advanceAct(run);
    expect(run.act).toBe(3);
    advanceAct(run);                          // 第三關再叫一次要原地不動
    expect(run.act).toBe(3);
  });

  it('第三關的關主倒下才算通關', () => {
    const run = newRun('final');
    advanceAct(run); advanceAct(run);
    expect(run.act).toBe(3);
    run.currentNode = run.map.nodes.find((n) => n.type === '塔主')!.id;
    const cs = beginCombat(run);
    expect(cs.enemies[0]!.enemyId).toBe('tower_master');
    for (const e of cs.enemies) e.dead = true; cs.phase = 'won'; cs.kills = 1;
    finishCombat(run, cs);
    expect(run.status).toBe('won');
  });

  it('過關秘寶三選一：都是塔主池（審查 #2 之前一直抽錯池）、不重複、不含已有的', () => {
    const run = newRun('relics');
    const picks = rollActRelics(run);
    expect(picks.length).toBe(3);
    expect(new Set(picks).size).toBe(3);
    for (const id of picks) {
      expect(relicById[id]?.pool).toBe('塔主');
      expect(run.relics).not.toContain(id);
    }
  });
});

