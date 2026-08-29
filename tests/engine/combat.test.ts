import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { canPlay, combatResult, endTurn, playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CardInstance, CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

function deck(ids: string[]): CardInstance[] { return ids.map((id, i) => inst(id, i + 1)); }
function start(encounterId: string, ids: string[] = STARTER_DECK, seed = 's', relics = ['blue_headband'], hp = 70): CombatState {
  return startCombat({ hp, maxHp: 70, deck: deck(ids), relics, potions: [], encounterId, rng: new Rng(seedFromString(seed)) });
}
/** 把指定牌放到手牌最前面（測試用） */
function toHand(cs: CombatState, cardId: string): number {
  const all = [...cs.player.hand, ...cs.player.drawPile, ...cs.player.discardPile];
  const c = all.find((x) => x.cardId === cardId)!;
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) {
    const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1);
  }
  cs.player.hand.unshift(c);
  return c.uid;
}

describe('開戰與回合開始', () => {
  it('魔物生命在區間內、同種第 k 隻從第 k 個動作開始', () => {
    const cs = start('rats3');
    expect(cs.enemies.length).toBe(3);
    for (const e of cs.enemies) { expect(e.hp).toBeGreaterThanOrEqual(12); expect(e.hp).toBeLessThanOrEqual(15); }
    expect(cs.enemies.map((e) => e.move.label)).toEqual(['啃', '啃', '躲']);
  });
  it('第一回合：3 顆飯糰、抽 5＋藍頭巾 1', () => {
    const cs = start('cucumber');
    expect(cs.turn).toBe(1);
    expect(cs.player.energy).toBe(3);
    expect(cs.player.hand.length).toBe(6);
    expect(cs.player.drawPile.length).toBe(4);
  });
  it('同種子同結果', () => {
    const a = start('rats2', STARTER_DECK, 'same'); const b = start('rats2', STARTER_DECK, 'same');
    expect(a.player.hand.map((c) => c.uid)).toEqual(b.player.hand.map((c) => c.uid));
    expect(a.enemies.map((e) => e.hp)).toEqual(b.enemies.map((e) => e.hp));
  });
});

describe('出牌', () => {
  it('參上打 6、扣飯糰、牌進棄牌堆', () => {
    const cs = start('cucumber');
    const uid = toHand(cs, 'sanjo');
    const e = cs.enemies[0]!; const hp = e.hp;
    expect(playCard(cs, uid, e.uid)).toBe(true);
    expect(e.hp).toBe(hp - 6);
    expect(cs.player.energy).toBe(2);
    expect(cs.player.discardPile.some((c) => c.uid === uid)).toBe(true);
    expect(cs.player.cardsPlayedThisTurn).toBe(1);
  });
  it('飯糰不夠不能出；0 費可以出', () => {
    const cs = start('cucumber');
    cs.player.energy = 0;
    const uid = toHand(cs, 'sanjo');
    expect(canPlay(cs, uid, cs.enemies[0]!.uid)).toEqual({ ok: false, reason: '餓扁了' });
    expect(playCard(cs, uid, cs.enemies[0]!.uid)).toBe(false);
    const k = toHand(cs, 'kawarimi');
    expect(playCard(cs, k)).toBe(true);
    expect(getStatus(cs.player, '隱身')).toBe(1);
  });
  it('淡定給蜷縮 5；蜷縮先扛魔物攻擊', () => {
    const cs = start('cucumber');
    playCard(cs, toHand(cs, 'tanding'));
    expect(cs.player.block).toBe(5);
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    endTurn(cs);
    expect(cs.player.hp).toBe(68);
  });
  it('能力牌與消耗牌進消耗堆', () => {
    const cs = start('cucumber', [...STARTER_DECK, 'jiejie', 'youcike']);
    cs.player.energy = 3;
    const j = toHand(cs, 'jiejie'); playCard(cs, j);
    const y = toHand(cs, 'youcike'); playCard(cs, y);
    expect(cs.player.exhaustPile.map((c) => c.uid).sort()).toEqual([j, y].sort());
    expect(cs.player.powers.length).toBe(1);
  });
  it('攻擊牌被戰術撤退鎖住', () => {
    const cs = start('cucumber', [...STARTER_DECK, 'zhanshu']);
    playCard(cs, toHand(cs, 'zhanshu'));
    expect(canPlay(cs, toHand(cs, 'sanjo'), cs.enemies[0]!.uid).ok).toBe(false);
  });
  it('分身術照連抓數打', () => {
    const cs = start('wood_dummy', [...STARTER_DECK, 'bunshin']);
    cs.player.energy = 5;
    playCard(cs, toHand(cs, 'kawarimi'));
    playCard(cs, toHand(cs, 'tanding'));
    const e = cs.enemies[0]!; e.block = 0; const hp = e.hp;
    playCard(cs, toHand(cs, 'bunshin'), e.uid);   // 連抓 2 → 3 次 × 3
    expect(e.hp).toBe(hp - 9);
  });
  it('擊倒最後一隻就勝利，飯糰怪回血', () => {
    const cs = start('onigiri_monster', STARTER_DECK, 's', [], 50);
    const e = cs.enemies[0]!; e.hp = 3;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(cs.phase).toBe('won');
    expect(cs.kills).toBe(1);
    expect(cs.player.hp).toBe(53);
    expect(combatResult(cs).kills).toBe(1);
  });
});

describe('魔物回合', () => {
  it('意圖循環前進；隱身閃掉一段', () => {
    const cs = start('rats2');
    addStatus(cs.player, '隱身', 1);
    const hp = cs.player.hp;
    endTurn(cs);
    expect(cs.turn).toBe(2);
    expect(cs.player.hp).toBe(hp - 4);                       // 第一隻被閃掉，第二隻打中 4
    expect(cs.enemies.map((e) => e.move.label)).toEqual(['啃', '躲']);
  });
  it('定身跳過攻擊並消耗', () => {
    const cs = start('cucumber');
    const e = cs.enemies[0]!;
    e.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    addStatus(e, '定身', 1);
    const hp = cs.player.hp;
    endTurn(cs);
    expect(cs.player.hp).toBe(hp);
    expect(getStatus(e, '定身')).toBe(0);
  });
  it('蓄力讓下一次攻擊加倍', () => {
    const cs = start('tower_master');
    const e = cs.enemies[0]!;
    expect(e.move.label).toBe('蓄力');
    endTurn(cs);                       // 蓄力
    expect(e.charged).toBe(true);
    const hp = cs.player.hp;
    endTurn(cs);                       // 鐵頭功 12×2
    expect(cs.player.hp).toBe(hp - 24);
    expect(e.charged).toBe(false);
  });
  it('塔主掉到 80 以下進第二階段：蜷縮 20、每回合 +1 爪力', () => {
    const cs = start('tower_master');
    const e = cs.enemies[0]!;
    e.hp = 82; cs.player.energy = 3;
    addStatus(cs.player, '爪力', 10);
    playCard(cs, toHand(cs, 'sanjo'), e.uid);   // 16 傷 → 66
    expect(e.phase).toBe(1);
    expect(e.block).toBe(20);
    expect(e.move.label).toBe('醉拳');
    endTurn(cs);
    expect(getStatus(e, '爪力')).toBe(1);
  });
  it('召喚小黑貓；木樁人每 3 回合 +1 爪力', () => {
    const cs = start('ninja_boss');
    const e = cs.enemies[0]!;
    e.move = e.move.label === '分身' ? e.move : { intent: 'summon', label: '分身', effects: [{ kind: 'summon', enemyId: 'black_kitten', n: 2 }] };
    endTurn(cs);
    expect(cs.enemies.filter((x) => x.enemyId === 'black_kitten' && !x.dead).length).toBe(2);
    const d = start('wood_dummy');
    for (let i = 0; i < 3; i++) endTurn(d);
    expect(getStatus(d.enemies[0]!, '爪力')).toBe(1);
  });
  it('噎到在魔物回合開始扣血、能殺死魔物', () => {
    const cs = start('rats2');
    const e = cs.enemies[0]!; e.hp = 2; addStatus(e, '噎到', 3);
    endTurn(cs);
    expect(e.dead).toBe(true);
    expect(cs.kills).toBe(1);
  });
  it('山賊逃走：偷走的不退、不算擊倒、剩下沒魔物就結束', () => {
    const cs = start('orange_bandit');
    const e = cs.enemies[0]!;
    for (let i = 0; i < 5 && cs.phase === 'player'; i++) { cs.player.block = 99; endTurn(cs); }
    expect(e.escaped).toBe(true);
    expect(cs.phase).toBe('won');
    expect(cs.kills).toBe(0);
    expect(combatResult(cs).fishDelta).toBe(-20);
  });
  it('生命歸零就輸；木樁擋一次致命傷', () => {
    const cs = start('cucumber', STARTER_DECK, 's', ['wood_post'], 5);
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    endTurn(cs);
    expect(cs.player.hp).toBe(1); expect(cs.phase).toBe('player');
    cs.enemies[0]!.move = { intent: 'attack', label: '彈起', effects: [{ kind: 'damage', amount: 7 }] };
    endTurn(cs);
    expect(cs.phase).toBe('lost');
  });
});
