import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { endTurn, playCard, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { newRun, rollActRelics } from '../../src/engine/run';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { relicById } from '../../src/content/relics';
import type { CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

/** 2026-09-02 審查代理找到的規則漏洞，一條一個回歸測試 */
function start(relics: string[], encounterId = 'cucumber', mods?: { hpMul?: number; strength?: number }): CombatState {
  return startCombat({ hp: 70, maxHp: 70, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics, potions: [], encounterId, rng: new Rng(seedFromString('audit')), mods });
}
function toHand(cs: CombatState, cardId: string): number {
  const all = [...cs.player.hand, ...cs.player.drawPile, ...cs.player.discardPile];
  const c = all.find((x) => x.cardId === cardId)!;
  for (const pile of [cs.player.hand, cs.player.drawPile, cs.player.discardPile]) { const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1); }
  cs.player.hand.unshift(c);
  return c.uid;
}

describe('審查修正', () => {
  it('#1 開戰拿到的蜷縮留到第一回合（斗笠 4）；回合結束才歸零，守護符留 8', () => {
    const cs = start(['straw_hat']);
    expect(cs.player.block).toBe(4);
    const cs2 = start(['guard_charm']);
    cs2.player.block = 20; cs2.enemies[0]!.move = { intent: 'block', label: '躺', effects: [{ kind: 'block', amount: 1 }] };
    endTurn(cs2);
    expect(cs2.player.block).toBe(8);
  });
  it('#2 過關三選一抽塔主池', () => {
    const r = newRun('act-relics');
    const ids = rollActRelics(r);
    expect(ids.length).toBe(3);
    for (const id of ids) expect(relicById[id]?.pool).toBe('塔主');
  });
  it('#5 魔物身上兩層定身定兩回合', () => {
    const cs = start([], 'wood_dummy');
    const e = cs.enemies[0]!;
    e.move = { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 5 }] };
    addStatus(e, '定身', 2);
    const hp = cs.player.hp;
    endTurn(cs); e.move = { intent: 'attack', label: '撞', effects: [{ kind: 'damage', amount: 5 }] };
    expect(getStatus(e, '定身')).toBe(1);
    endTurn(cs);
    expect(cs.player.hp).toBe(hp);
    expect(getStatus(e, '定身')).toBe(0);
  });
  it('#8 秘笈的第一擊加倍不會因為第一回合沒攻擊就消失；蓄力照舊只撐一回合', () => {
    const cs = start(['scroll']);
    const e = cs.enemies[0]!; e.hp = 999; e.block = 0;
    cs.enemies[0]!.move = { intent: 'block', label: '躺', effects: [{ kind: 'block', amount: 0 }] };
    endTurn(cs);
    e.block = 0;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(999 - e.hp).toBe(12);
  });
  it('#9 召喚出來的也吃難度的血量倍率與爪力', () => {
    const cs = start([], 'ninja_boss', { hpMul: 1.5, strength: 2 });
    const boss = cs.enemies[0]!;
    boss.move = { intent: 'summon', label: '分身', effects: [{ kind: 'summon', enemyId: 'black_kitten', n: 2 }] };
    cs.player.block = 99; endTurn(cs);
    const kittens = cs.enemies.filter((e) => e.enemyId === 'black_kitten');
    expect(kittens.length).toBe(2);
    for (const k of kittens) { expect(k.maxHp).toBe(15); expect(getStatus(k, '爪力')).toBe(2); }
  });
  it('#10 噎到打不穿僕從護體', () => {
    const cs = start([], 'persian_lady');
    const lady = cs.enemies.find((e) => e.enemyId === 'persian_lady')!;
    addStatus(lady, '噎到', 5);
    const hp = lady.hp; cs.player.block = 99;
    endTurn(cs);
    expect(lady.hp).toBe(hp);
  });
  it('#11 同生共死的影子小貓倒下不發擊倒獎勵', () => {
    const cs = start(['sardine_tin'], 'shadow_kittens');
    const a = cs.enemies[0]!; a.hp = 1; cs.player.hp = 50;
    playCard(cs, toHand(cs, 'sanjo'), a.uid);
    expect(a.dead).toBe(true);
    expect(cs.player.hp).toBe(50);
  });
  it('魔物身上的反彈會刺到球球（刺蝟師傅）', () => {
    const cs = start([], 'hedgehog');
    const e = cs.enemies[0]!; addStatus(e, '反彈', 4);
    const hp = cs.player.hp;
    playCard(cs, toHand(cs, 'sanjo'), e.uid);
    expect(hp - cs.player.hp).toBe(4);
  });
  it('#6 影披風每次獲得隱身都多 1；#7 破卷軸整場只有第一張牌打折', () => {
    const cs = start(['shadow_cloak', 'worn_scroll']);
    cs.player.energy = 9;
    playCard(cs, toHand(cs, 'kawarimi'));   // 替身術：隱身 1 → 2；2 費第一張打折成 1
    expect(getStatus(cs.player, '隱身')).toBe(2);
    expect(cs.player.energy).toBe(8);
    playCard(cs, toHand(cs, 'kawarimi'));
    expect(getStatus(cs.player, '隱身')).toBe(4);
    expect(cs.player.energy).toBe(6);
  });
});
