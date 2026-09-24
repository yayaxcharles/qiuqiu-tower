import { describe, expect, it } from 'vitest';
import { canPlay, endTurn, playCard, startCombat } from '../src/engine/combat';
import { Rng, seedFromString } from '../src/engine/rng';
import { addStatus } from '../src/engine/statuses';
import type { CombatState, PlayerCombat } from '../src/engine/types';
import { blankPlayer, inst } from './helpers';

let uid = 100_000;
function setup(mate = true) {
  const cs = startCombat({ hp: 80, maxHp: 80, deck: [inst('fengfeng_hushen', 1)], relics: [], potions: [],
    encounterId: 'wood_dummy', rng: new Rng(seedFromString('fengfeng-coop')), hero: 'fengfeng' });
  const p = cs.player; p.hand = []; p.drawPile = []; p.energy = 99; p.qi = 0;
  let q = p;
  if (mate) { q = blankPlayer([], 1); q.hero = 'fengfeng'; q.energy = 99; q.hand = []; q.drawPile = []; q.qi = 0; cs.players.push(q); }
  cs.enemies[0]!.hp = cs.enemies[0]!.maxHp = 500;
  return { cs, p, q };
}
function add(p: PlayerCombat, id: string, upgraded = false): number {
  const u = uid++; p.hand.push({ uid: u, cardId: id, upgraded }); return u;
}
function play(cs: CombatState, p: PlayerCombat, id: string, target?: number, upgraded = false): boolean {
  return playCard(cs, add(p, id, upgraded), target, p.seat);
}

/*
 * 2026-09-22 平衡調整：封封所有花蓄氣的牌每點蓄氣多 1 點（見 `cards.ts` 封封那一段的檔頭）。
 * 這一檔的加成數字照新數值：你從右邊上＝3＋3×氣（原本 3＋2×氣）、現在一起上＝2＋2×氣（原本 2＋1×氣）、
 * 我護著你走＝7＋3×氣（原本 7＋2×氣）。測的規則（取大、拒收、分席、只加一次）一條都沒變。
 */
describe('封封 FG-T13～FG-T17、FG-T21', () => {
  it('FG-T13：兩種支援取大；不能提高時出牌前拒絕且不支付', () => {
    const { cs, p, q } = setup();
    p.qi = 4; play(cs, p, 'fengfeng_yiqichushou');
    expect([p.nextAttackBonus, q.nextAttackBonus]).toEqual([10, 10]);
    p.qi = 3; play(cs, p, 'fengfeng_youbian');
    expect(q.nextAttackBonus).toBe(12);
    p.qi = 4; const e0 = p.energy; const u = add(p, 'fengfeng_yiqichushou');
    expect(canPlay(cs, u, undefined, p.seat).ok).toBe(false);
    expect(playCard(cs, u, undefined, p.seat)).toBe(false);
    expect([p.qi, p.energy, p.hand.some((c) => c.uid === u)]).toEqual([4, e0, true]);
  });

  it('支援牌被影子分身重播時，不能提高的那次不再支付蓄氣', () => {
    const { cs, p, q } = setup();
    p.echoFirst = 1;
    p.qi = 6;
    play(cs, p, 'fengfeng_youbian');
    expect(q.nextAttackBonus).toBe(12);
    expect(p.qi).toBe(3);
  });

  it('FG-T14：雙封封各付各的蓄氣，加成分席保存', () => {
    const { cs, p, q } = setup();
    p.qi = 3; q.qi = 2;
    play(cs, p, 'fengfeng_youbian');
    play(cs, q, 'fengfeng_youbian');
    expect([p.qi, q.qi]).toEqual([0, 0]);
    expect([p.nextAttackBonus, q.nextAttackBonus]).toEqual([9, 12]);
  });

  it('FG-T15：單人取得四張連線牌時都依自用規則，雙人加成不會複製', () => {
    const { cs, p } = setup(false);
    p.qi = 3; play(cs, p, 'fengfeng_youbian'); expect(p.nextAttackBonus).toBe(12);
    p.nextAttackBonus = undefined; p.block = 8; p.qi = 0; play(cs, p, 'fengfeng_jiewo'); expect(p.qi).toBe(5);
    p.block = 0; p.qi = 3; play(cs, p, 'fengfeng_husong'); expect(p.block).toBe(16);
    p.qi = 4; play(cs, p, 'fengfeng_yiqichushou'); expect(p.nextAttackBonus).toBe(10);
  });

  it('FG-T16：已結束拒收、倒下改自用、存活席位仍是隊友', () => {
    const ready = setup(); ready.q.ready = true; ready.p.qi = 3;
    const e0 = ready.p.energy; const u = add(ready.p, 'fengfeng_youbian');
    expect(canPlay(ready.cs, u, undefined, ready.p.seat)).toEqual({
      ok: false, reason: '同伴已結束回合，請等下一回合',
    });
    expect(playCard(ready.cs, u, undefined, ready.p.seat)).toBe(false);
    expect([ready.p.qi, ready.p.energy, ready.q.nextAttackBonus]).toEqual([3, e0, undefined]);

    const down = setup(); down.q.down = true; down.p.qi = 3;
    play(down.cs, down.p, 'fengfeng_youbian'); expect(down.p.nextAttackBonus).toBe(12);

    const alive = setup(); alive.p.qi = 3;
    play(alive.cs, alive.p, 'fengfeng_youbian'); expect(alive.q.nextAttackBonus).toBe(12);
    expect(alive.p.nextAttackBonus).toBeUndefined();
  });

  it('FG-T17：集中精神擋隊友送飯糰，下一本人回合恢復自然補滿', () => {
    const { cs, p, q } = setup(); p.energy = 2; q.energy = 3;
    play(cs, p, 'fengfeng_jizhong');
    const before = p.energy;
    play(cs, q, 'fantuanfenni');
    expect(p.energy).toBe(before);
    expect(p.energyGainBlockedThisPhase).toBe(true);
    endTurn(cs);
    expect(p.energyGainBlockedThisPhase).toBeUndefined();
    expect(p.energy).toBe(p.maxEnergy);
  });

  it('FG-T21：噹噹卸蜷縮攻擊只加一次支援，不重新吃爪力', () => {
    const { cs, p, q } = setup(); q.hero = 'dangdang';
    p.qi = 3; play(cs, p, 'fengfeng_youbian');
    q.block = 6; addStatus(q, '爪力', 2); const e = cs.enemies[0]!; const hp = e.hp;
    play(cs, q, 'dangdang_jielidali', e.uid);
    expect(hp - e.hp).toBe(18);   // 卸 6 點＋支援 12，爪力不吃
    expect(q.block).toBe(0);
    expect(q.nextAttackBonus).toBeUndefined();
  });

  it('封封支援接零蜷縮的借力打力：消耗加成但不強造傷害事件', () => {
    const { cs, p, q } = setup(); q.hero = 'dangdang';
    p.qi = 3; expect(play(cs, p, 'fengfeng_youbian')).toBe(true);
    expect(q.nextAttackBonus).toBe(12);
    q.block = 0;
    const enemy = cs.enemies[0]!;
    const hp = enemy.hp;
    const hits = cs.hits.length;

    expect(play(cs, q, 'dangdang_jielidali', enemy.uid)).toBe(true);
    expect(enemy.hp).toBe(hp);
    expect(cs.hits).toHaveLength(hits);
    expect(q.nextAttackBonus).toBeUndefined();
  });

  it.each([0, 2])('原樣奉還有 %i 點反彈時，支援只加入原牌已有的傷害', (thorns) => {
    const { cs, p, q } = setup(); q.hero = 'dangdang';
    p.qi = 3; expect(play(cs, p, 'fengfeng_youbian')).toBe(true);
    if (thorns > 0) addStatus(q, '反彈', thorns);
    const enemy = cs.enemies[0]!;
    const hp = enemy.hp;
    const hits = cs.hits.length;

    expect(play(cs, q, 'dangdang_yibi', enemy.uid)).toBe(true);
    expect(hp - enemy.hp).toBe(thorns > 0 ? thorns * 2 + 12 : 0);
    expect(cs.hits).toHaveLength(hits + (thorns > 0 ? 1 : 0));
    expect(q.nextAttackBonus).toBeUndefined();
  });

  it('封封支援菲菲見血封喉：加成與毒傷一起倍增，仍無視蜷縮及爪力且不清毒', () => {
    const { cs, p, q } = setup(); q.hero = 'feifei';
    p.qi = 3; expect(play(cs, p, 'fengfeng_youbian')).toBe(true);
    const enemy = cs.enemies[0]!;
    enemy.block = 50;
    addStatus(enemy, '中毒', 3);
    addStatus(q, '爪力', 20);
    q.doubleNext = 1;
    const hp = enemy.hp;

    expect(play(cs, q, 'feifei_jianxue', enemy.uid)).toBe(true);
    expect(hp - enemy.hp).toBe((3 + 12) * 2);
    expect(enemy.block).toBe(50);
    expect(enemy.statuses['中毒']).toBe(3);
    expect(q.nextAttackBonus).toBeUndefined();
  });

  it('封封支援菲菲見血封喉：無毒時消耗加成但不強造傷害事件', () => {
    const { cs, p, q } = setup(); q.hero = 'feifei';
    p.qi = 3; expect(play(cs, p, 'fengfeng_youbian')).toBe(true);
    const enemy = cs.enemies[0]!;
    const hp = enemy.hp;
    const hits = cs.hits.length;

    expect(play(cs, q, 'feifei_jianxue', enemy.uid)).toBe(true);
    expect(enemy.hp).toBe(hp);
    expect(cs.hits).toHaveLength(hits);
    expect(q.nextAttackBonus).toBeUndefined();
  });
});
