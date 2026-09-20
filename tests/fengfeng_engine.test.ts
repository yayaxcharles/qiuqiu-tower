import { describe, expect, it } from 'vitest';
import { damagePlayer } from '../src/engine/actions';
import { canPlay, endTurn, playCard, startCombat } from '../src/engine/combat';
import { Rng, seedFromString } from '../src/engine/rng';
import { addStatus } from '../src/engine/statuses';
import type { CombatState, PlayerCombat } from '../src/engine/types';
import { blankPlayer, inst } from './helpers';

let uid = 90_000;
function setup(encounterId = 'wood_dummy', mate = false): { cs: CombatState; p: PlayerCombat; mate?: PlayerCombat } {
  const cs = startCombat({ hp: 80, maxHp: 80, deck: [inst('fengfeng_hushen', 1)], relics: [], potions: [], encounterId,
    rng: new Rng(seedFromString(`fengfeng-${encounterId}`)), hero: 'fengfeng' });
  const p = cs.player;
  p.hand = []; p.drawPile = []; p.discardPile = []; p.exhaustPile = []; p.energy = 99; p.block = 0; p.qi = 0;
  if (!mate) return { cs, p };
  const q = blankPlayer([], 1);
  q.hero = 'fengfeng'; q.energy = 99; q.hand = []; q.drawPile = []; q.qi = 0;
  cs.players.push(q);
  return { cs, p, mate: q };
}

function play(cs: CombatState, p: PlayerCombat, id: string, target?: number, upgraded = false): boolean {
  const u = uid++;
  p.hand.push({ uid: u, cardId: id, upgraded });
  return playCard(cs, u, target, p.seat);
}

describe('封封 FG-T01～FG-T10', () => {
  it('FG-T01～03：平斬依出牌前蓄氣最多支付 2', () => {
    for (const [qi, spent, damage] of [[0, 0, 5], [1, 1, 7], [5, 2, 9]] as const) {
      const { cs, p } = setup(); const e = cs.enemies[0]!; e.hp = e.maxHp = 100;
      p.qi = qi; const hp = e.hp; const energy = p.energy;
      expect(play(cs, p, 'fengfeng_pingzhan', e.uid)).toBe(true);
      expect(p.energy).toBe(energy - 1);
      expect(p.qi).toBe(qi - spent);
      expect(hp - e.hp).toBe(damage);
    }
  });

  it('FG-T04：蓄氣上限 12，只記實得量', () => {
    const { cs, p } = setup(); p.qi = 11;
    play(cs, p, 'fengfeng_tuna');
    expect(p.qi).toBe(12);
  });

  it('FG-T05：蓄氣跨回合保留，蜷縮照原規則收尾', () => {
    const { cs, p } = setup(); p.qi = 7; p.block = 20;
    endTurn(cs);
    expect(p.qi).toBe(7);
    expect(p.block).toBeLessThan(20);
  });

  it('FG-T06：雙段只付一次蓄氣，兩段各自吃爪力', () => {
    const { cs, p } = setup(); const e = cs.enemies[0]!; e.hp = e.maxHp = 100;
    p.qi = 2; addStatus(p, '爪力', 2); const hp = e.hp;
    play(cs, p, 'fengfeng_shuangduan', e.uid);
    expect(p.qi).toBe(0);
    expect(hp - e.hp).toBe(14);
    expect(cs.hits.slice(-2).map((h) => h.amount)).toEqual([7, 7]);
  });

  it('FG-T07：橫掃三個目標共用一次支付', () => {
    const { cs, p } = setup('rats3');
    for (const e of cs.enemies) e.hp = e.maxHp = 100;
    p.qi = 2; const hp = cs.enemies.map((e) => e.hp);
    play(cs, p, 'fengfeng_hengsao');
    expect(p.qi).toBe(0);
    expect(cs.enemies.map((e, i) => hp[i]! - e.hp)).toEqual([5, 5, 5]);
  });

  it('FG-T08：非法目標與飯糰不足不動蓄氣、能力或下一擊', () => {
    const { cs, p } = setup(); p.qi = 5; p.nextAttackBonus = 9;
    const u = uid++; p.hand.push({ uid: u, cardId: 'fengfeng_pingzhan', upgraded: false });
    expect(canPlay(cs, u, 999_999, p.seat).ok).toBe(false);
    expect(playCard(cs, u, 999_999, p.seat)).toBe(false);
    expect([p.qi, p.nextAttackBonus, p.hand.some((c) => c.uid === u)]).toEqual([5, 9, true]);
    p.energy = 0;
    expect(playCard(cs, u, cs.enemies[0]!.uid, p.seat)).toBe(false);
    expect([p.qi, p.nextAttackBonus]).toEqual([5, 9]);
  });

  it('FG-T09：反彈致倒下時已扣氣，且不執行後續抽牌或回氣', () => {
    const a = setup(); const ea = a.cs.enemies[0]!; a.p.hp = 1; a.p.qi = 2; addStatus(ea, '反彈', 5);
    const hand = a.p.hand.length;
    play(a.cs, a.p, 'fengfeng_huibu', ea.uid);
    expect(a.p.down).toBe(true); expect(a.p.qi ?? 0).toBe(0); expect(a.p.hand.length).toBe(hand);

    const b = setup(); const eb = b.cs.enemies[0]!; b.p.hp = 1; addStatus(eb, '反彈', 5);
    play(b.cs, b.p, 'fengfeng_tanbu', eb.uid);
    expect(b.p.down).toBe(true); expect(b.p.qi ?? 0).toBe(0);
  });

  it('FG-T10：收勢每回合一次，與回劍護肘自己的蜷縮相加', () => {
    const { cs, p } = setup(); const e = cs.enemies[0]!; e.hp = e.maxHp = 200;
    play(cs, p, 'fengfeng_shoushi');
    p.qi = 3; play(cs, p, 'fengfeng_huzhou', e.uid);
    expect(p.block).toBe(9);
    p.qi = 3; play(cs, p, 'fengfeng_huzhou', e.uid);
    expect(p.block).toBe(14);
  });
});

describe('封封 FG-T11、FG-T12、FG-T20', () => {
  it('FG-T11：同名能力取高，升級取代不重置本回合已用次數', () => {
    const { cs, p } = setup(); const e = cs.enemies[0]!; e.hp = e.maxHp = 300;
    expect(play(cs, p, 'fengfeng_shoushi')).toBe(true);
    p.qi = 3; play(cs, p, 'fengfeng_huzhou', e.uid);
    expect(p.block).toBe(9);

    const sameBase = inst('fengfeng_shoushi', uid++);
    p.hand.push(sameBase);
    const beforeBaseReject = { energy: p.energy, hand: p.hand.slice(), powers: structuredClone(p.powers) };
    expect(canPlay(cs, sameBase.uid, undefined, p.seat)).toMatchObject({ ok: false });
    expect(playCard(cs, sameBase.uid, undefined, p.seat)).toBe(false);
    expect({ energy: p.energy, hand: p.hand, powers: p.powers }).toEqual(beforeBaseReject);

    const upgrade = { ...inst('fengfeng_shoushi', uid++), upgraded: true };
    p.hand.push(upgrade);
    expect(canPlay(cs, upgrade.uid, undefined, p.seat)).toMatchObject({ ok: true });
    expect(playCard(cs, upgrade.uid, undefined, p.seat)).toBe(true);
    expect(p.powers.filter((pw) => pw.cardId === 'fengfeng_shoushi')).toHaveLength(1);
    expect(p.powers.find((pw) => pw.cardId === 'fengfeng_shoushi')).toMatchObject({ upgraded: true, firedTurn: cs.turn });

    for (const card of [
      { ...inst('fengfeng_shoushi', uid++), upgraded: true },
      inst('fengfeng_shoushi', uid++),
    ]) {
      p.hand.push(card);
      const beforeReject = { energy: p.energy, hand: p.hand.slice(), powers: structuredClone(p.powers) };
      expect(canPlay(cs, card.uid, undefined, p.seat)).toMatchObject({ ok: false });
      expect(playCard(cs, card.uid, undefined, p.seat)).toBe(false);
      expect({ energy: p.energy, hand: p.hand, powers: p.powers }).toEqual(beforeReject);
    }

    p.qi = 3; play(cs, p, 'fengfeng_huzhou', e.uid);
    expect(p.block).toBe(14);
    cs.turn += 1;
    p.qi = 3; play(cs, p, 'fengfeng_huzhou', e.uid);
    expect(p.block).toBe(25);
  });

  it('FG-T12：下一擊只強化多段的第一段、群攻的第一個目標', () => {
    const a = setup('wood_dummy', true); const q = a.mate!; const e = a.cs.enemies[0]!; e.hp = e.maxHp = 200;
    a.p.qi = 3; play(a.cs, a.p, 'fengfeng_youbian');
    q.qi = 2; const hp = e.hp; play(a.cs, q, 'fengfeng_shuangduan', e.uid);
    expect(hp - e.hp).toBe(19); // (5+9) + 5
    expect(q.nextAttackBonus).toBeUndefined();

    const b = setup('rats3', true); const qb = b.mate!;
    for (const t of b.cs.enemies) t.hp = t.maxHp = 100;
    b.p.qi = 3; play(b.cs, b.p, 'fengfeng_youbian');
    qb.qi = 2; const before = b.cs.enemies.map((t) => t.hp); play(b.cs, qb, 'fengfeng_hengsao');
    expect(b.cs.enemies.map((t, i) => before[i]! - t.hp)).toEqual([14, 5, 5]);
  });

  it('FG-T20：影子分身的追加施放重新取得並支付當時蓄氣', () => {
    const { cs, p } = setup(); const e = cs.enemies[0]!; e.hp = e.maxHp = 200;
    p.echoFirst = 1; p.qi = 3; const hp = e.hp;
    play(cs, p, 'fengfeng_pingzhan', e.uid);
    expect(p.qi).toBe(0);
    expect(hp - e.hp).toBe(16); // 第一次 S=2 打 9，重播 S=1 打 7
    expect(p.discardPile.filter((c) => c.cardId === 'fengfeng_pingzhan')).toHaveLength(1);
  });

  it('循息、藏鋒、連息依本人回合各觸發一次且不遞迴', () => {
    const a = setup(); const ea = a.cs.enemies[0]!; ea.hp = ea.maxHp = 500;
    play(a.cs, a.p, 'fengfeng_xunxi');
    play(a.cs, a.p, 'fengfeng_tuna');
    expect(a.p.qi).toBe(4);
    play(a.cs, a.p, 'fengfeng_zhengxi');
    expect(a.p.qi).toBe(6);

    const b = setup(); const eb = b.cs.enemies[0]!; eb.hp = eb.maxHp = 500;
    play(b.cs, b.p, 'fengfeng_cunfeng');
    expect(b.p.qi).toBe(0);
    endTurn(b.cs);
    expect(b.p.qi).toBe(2);

    const c = setup(); const ec = c.cs.enemies[0]!; ec.hp = ec.maxHp = 500;
    play(c.cs, c.p, 'fengfeng_lianxi');
    c.p.drawPile = [inst('fengfeng_hushen', uid++)];
    c.p.qi = 4; play(c.cs, c.p, 'fengfeng_tabu', ec.uid);
    expect(c.p.drawPile).toHaveLength(0);
    c.p.drawPile = [inst('fengfeng_hushen', uid++)];
    c.p.qi = 4; play(c.cs, c.p, 'fengfeng_tabu', ec.uid);
    expect(c.p.drawPile).toHaveLength(1);
  });
});
