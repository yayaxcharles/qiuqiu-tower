import { describe, expect, it } from 'vitest';
import { beginEnemyTurn, canPlay, playCard, startCombat, startPlayerTurn } from '../../src/engine/combat';
import { damagePlayer, drawCards, gainStealth, healPlayer, runEnemyEffects } from '../../src/engine/actions';
import { applyEffects } from '../../src/engine/effects';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { cardById } from '../../src/content/cards';
import type { CombatState, PlayerCombat } from '../../src/engine/types';
import { blankPlayer, inst } from '../helpers';

/*
 * 連線版第一步的驗收（2026-09-11）。
 *
 * 這一步只做「把一位玩家包成陣列、並讓每個效果認得出對象」，**不碰連線、不碰畫面**。
 * 單機行為要一模一樣，靠既有的六百多條測試證明；這一支專門證明**新接好的管線真的通**。
 *
 * 為什麼要多放一個假的第二位：只驗「`cs.player` 等於 `players[0]`」什麼都證明不了，
 * 改之前那條也會過。真正會抓到錯的驗法是**放第二個人進去，叫第二位做事，
 * 然後檢查第一位有沒有被動到**——改之前每一條都會紅，因為那時所有效果都寫死打在第一位身上。
 */

function combat(deck = [inst('tanding', 1)]): CombatState {
  const cs = startCombat({
    hp: 60, maxHp: 80, deck, relics: [], potions: [],
    encounterId: 'wood_dummy', rng: new Rng(seedFromString('coop1')),
  });
  cs.player.drawPile = []; cs.player.hand = [...deck]; cs.player.energy = 9;
  return cs;
}

/** 塞一位假的二號玩家進去。第一步還沒有任何東西會自己生出第二位，所以手動放。 */
function addSecond(cs: CombatState, deckIds: string[] = []): PlayerCombat {
  const p2 = blankPlayer(deckIds, 1);
  cs.players.push(p2);
  return p2;
}

describe('連線版第一步：玩家變陣列、效果認得出對象', () => {
  it('player 是算出來的別名，不是複製出來的欄位', () => {
    const cs = combat();
    expect(cs.players.length, '單機就一位').toBe(1);
    expect(cs.player).toBe(cs.players[0]);
    expect(cs.player.seat).toBe(0);

    // 換掉陣列第一格，別名要跟著換。存一份參考的寫法在這裡就會走鐘
    const stand = blankPlayer([], 0);
    cs.players[0] = stand;
    expect(cs.player, '別名永遠跟著 players[0]').toBe(stand);
  });

  it('二號玩家打的防禦牌，防禦加在二號身上，一號動都沒動', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.block = 0; p2.block = 0;

    const tanding = cardById['tanding'];
    expect(tanding).toBeDefined();
    applyEffects(cs, tanding!.effects, { self: p2, source: 'card' });

    expect(p2.block, '二號拿到 5 點蜷縮').toBe(5);
    expect(p1.block, '一號一點都不該有').toBe(0);
  });

  it('抽牌、回血、隱身都認得出是誰', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs, ['sanjo', 'sanjo', 'sanjo']);
    p1.hp = 40; p2.hp = 40; p2.maxHp = 80;
    const h1 = p1.hand.length;

    drawCards(cs, 2, p2);
    expect(p2.hand.length, '二號抽到兩張').toBe(2);
    expect(p1.hand.length, '一號的手牌沒被動').toBe(h1);

    healPlayer(cs, 10, p2);
    expect(p2.hp).toBe(50);
    expect(p1.hp, '一號沒跟著回血').toBe(40);

    gainStealth(cs, 3, p2);
    expect(getStatus(p2, '隱身')).toBe(3);
    expect(getStatus(p1, '隱身'), '一號沒跟著隱身').toBe(0);
    expect(p2.firstStealthGiven, '「這場第一次隱身」的旗標記在二號身上').toBe(true);
    expect(p1.firstStealthGiven, '一號的旗標沒被用掉').toBe(false);
  });

  it('魔物打得到指定的那一位', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 50; p2.hp = 50; p1.block = 0; p2.block = 0;
    const foe = cs.enemies[0]!;

    damagePlayer(cs, foe, 8, { victim: p2 });
    expect(p2.hp, '二號挨了這一下').toBe(42);
    expect(p1.hp, '一號沒事').toBe(50);

    // 不指定就退回第一位：舊呼叫點都走這條，所以單機行為不變
    damagePlayer(cs, foe, 8);
    expect(p1.hp).toBe(42);
  });

  it('二號的甲與蜷縮擋的是二號自己的傷害', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 50; p1.block = 30; p1.armour = 30;
    p2.hp = 50; p2.block = 5; p2.armour = 4;
    const foe = cs.enemies[0]!;

    // 12 點：二號自己的 5 蜷縮擋掉 5、4 甲吃掉 4，剩 3 扣血。
    // 改之前這一下會去啃一號那堆厚防禦，二號一滴血都不會掉
    damagePlayer(cs, foe, 12, { victim: p2 });
    expect(p2.block).toBe(0);
    expect(p2.armour).toBe(0);
    expect(p2.hp).toBe(47);
    expect(p1.block, '一號的蜷縮沒被借走').toBe(30);
    expect(p1.armour, '一號的甲沒被借走').toBe(30);
  });

  it('沒填對象就退回第一位：魔物招式那條舊路完全沒變', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.block = 0; p2.block = 0;

    applyEffects(cs, [{ kind: 'block', amount: 7 }], { source: 'power' });
    expect(p1.block, '沒指定就是第一位').toBe(7);
    expect(p2.block).toBe(0);
  });
});

describe('連線版第一步：回合流程對每一位玩家各跑一次', () => {
  it('回合開始：兩個人各自抽自己的牌、各自補飽足', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs, Array.from({ length: 10 }, () => 'sanjo'));
    p1.drawPile = Array.from({ length: 10 }, (_, i) => inst('sanjo', 900 + i));
    p1.hand = []; p1.energy = 0; p2.energy = 0;

    const before = cs.turn;
    startPlayerTurn(cs);

    expect(cs.turn, '回合數是整場一份的，不會因為兩個人就跳兩次').toBe(before + 1);
    expect(p1.hand.length, '一號抽五張').toBe(5);
    expect(p2.hand.length, '二號也抽五張，抽的是自己的牌堆').toBe(5);
    expect(p1.energy).toBe(p1.maxEnergy);
    expect(p2.energy).toBe(p2.maxEnergy);
  });

  it('回合結束：兩個人各自丟自己的手牌、各自衰減自己的減益', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs, []);
    p1.hand = [inst('sanjo', 901)];
    p2.hand = [inst('sanjo', 902), inst('sanjo', 903)];
    addStatus(p1, '翻肚', 3);
    addStatus(p2, '翻肚', 5);

    beginEnemyTurn(cs);

    expect(p1.hand.length, '一號的手牌丟掉了').toBe(0);
    expect(p2.hand.length, '二號的手牌也丟掉了').toBe(0);
    expect(p2.discardPile.length).toBe(2);
    expect(getStatus(p1, '翻肚'), '各減各的').toBe(2);
    expect(getStatus(p2, '翻肚')).toBe(4);
  });

  it('魔物的招式打得到指定的那一位，減益與塞牌都跟著找對人', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.hp = 50; p2.hp = 50;
    const foe = cs.enemies[0]!;

    runEnemyEffects(cs, foe, [
      { kind: 'damage', amount: 6 },
      { kind: 'statusPlayer', name: '翻肚', amount: 2 },
    ], false, p2);

    expect(p2.hp, '二號挨打').toBe(44);
    expect(getStatus(p2, '翻肚'), '減益也掛在二號身上').toBe(2);
    expect(p1.hp, '一號沒事').toBe(50);
    expect(getStatus(p1, '翻肚')).toBe(0);
  });
});

describe('連線版第一步：打牌的入口認座位', () => {
  it('二號座位打自己手上的防禦牌：費用扣二號的、防禦加二號的、一號完全沒動', () => {
    const cs = combat();
    const p1 = cs.players[0] as PlayerCombat;
    const p2 = addSecond(cs);
    p1.block = 0; p1.energy = 3;
    p2.hand = [inst('tanding', 777)]; p2.energy = 3; p2.block = 0;

    expect(playCard(cs, 777, undefined, 1), '二號打得出來').toBe(true);

    expect(p2.block, '防禦加在二號身上').toBe(5);
    expect(p2.energy, '扣的是二號的飯糰').toBe(2);
    expect(p2.discardPile.some((c) => c.uid === 777), '牌進二號的棄牌堆').toBe(true);
    expect(p1.block, '一號沒拿到防禦').toBe(0);
    expect(p1.energy, '一號的飯糰沒被扣').toBe(3);
    expect(p1.hand.some((c) => c.uid === 777), '牌從來就不在一號手上').toBe(false);
  });

  it('打不是自己手上的牌會被擋下來', () => {
    const cs = combat();
    const p2 = addSecond(cs);
    p2.hand = [inst('tanding', 777)]; p2.energy = 3;

    // 一號手上是 uid 1 的淡定，二號手上是 uid 777。互相拿對方的牌都不行
    expect(playCard(cs, 777, undefined, 0), '一號打不了二號的牌').toBe(false);
    expect(playCard(cs, 1, undefined, 1), '二號也打不了一號的牌').toBe(false);
    expect(canPlay(cs, 777, undefined, 9).ok, '沒有的座位直接擋掉').toBe(false);
  });

  it('餓扁了看的是那個座位自己的飯糰', () => {
    const cs = combat();
    const p2 = addSecond(cs);
    p2.hand = [inst('tanding', 778)]; p2.energy = 0;
    (cs.players[0] as PlayerCombat).energy = 9;   // 一號很飽，但借不到給二號

    const r = canPlay(cs, 778, undefined, 1);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('餓扁了');
  });
});
