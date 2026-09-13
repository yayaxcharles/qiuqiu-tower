import { describe, expect, it } from 'vitest';
import { beginCombat, finishCombat, newCoopRun, newRun, takeCardReward } from '../../src/engine/run';
import { cardById } from '../../src/content/cards';
import { pickable } from '../../src/engine/hero';

/*
 * 兩個人時，**每個人各看各的三選一**（2026-09-13 使用者要求：
 * 「雙人各自獲得牌的話要能各自選擇拿到自己的牌」）。
 *
 * 原本整場只抽一份，而且是照**0 號座位的角色**抽的（`heroOf(me(run))` 沒帶座位）。
 * 混搭連線時球球坐 0 號、菲菲坐 1 號，菲菲看到的永遠是球球的牌池——
 * **她自己那 25 張專屬牌在連線裡一張都抽不到**，反而會拿到球球專屬的隱身牌。
 * 這件事完全靜音：畫面正常、牌也真的進了她的牌組，只是那副牌組不是她的。
 */
function winOnce(hero0: 'ninja' | 'feifei', hero1: 'ninja' | 'feifei', seed: string) {
  const run = newCoopRun(seed, 1, hero0, hero1);
  const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
  run.currentNode = node.id;
  const cs = beginCombat(run);
  for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
  cs.phase = 'won';
  return { run, r: finishCombat(run, cs)! };
}

describe('兩個人時各看各的三選一', () => {
  it('一人一份，而且份數等於人數', () => {
    const { r } = winOnce('ninja', 'feifei', 'per-seat-1');
    expect(r.cardsPerSeat, '兩個人時要有一人一份').toBeTruthy();
    expect(r.cardsPerSeat!.length).toBe(2);
    for (const set of r.cardsPerSeat!) expect(set.length, '每一份都要有牌').toBeGreaterThan(0);
  });

  it('菲菲那一份只會出現她拿得到的牌', () => {
    const { r } = winOnce('ninja', 'feifei', 'per-seat-2');
    for (const c of r.cardsPerSeat![1]!) {
      expect(pickable(c, 'feifei', 2), `${c.name} 菲菲根本拿不到，不該出現在她那一份`).toBe(true);
    }
  });

  it('球球那一份只會出現他拿得到的牌', () => {
    const { r } = winOnce('ninja', 'feifei', 'per-seat-3');
    for (const c of r.cardsPerSeat![0]!) {
      expect(pickable(c, 'ninja', 2), `${c.name} 球球拿不到`).toBe(true);
    }
  });

  /*
   * 這條是整件事的重點：她專屬的牌在連線裡**抽得到**。
   * 一局的樣本太小，所以跑三十局看整體——一張都沒出現就表示過濾還是照 0 號角色走。
   */
  it('連線時菲菲抽得到自己的專屬牌', () => {
    let hers = 0;
    for (let i = 0; i < 30; i++) {
      const { r } = winOnce('ninja', 'feifei', `per-seat-mix-${i}`);
      hers += r.cardsPerSeat![1]!.filter((c) => cardById[c.id]?.hero === 'feifei').length;
    }
    expect(hers, '三十局裡她那一份一張專屬牌都沒有——過濾還是照 0 號座位的角色走').toBeGreaterThan(0);
  });

  it('挑牌驗的是自己那一份：挑不到對方那份裡的牌', () => {
    const { run, r } = winOnce('ninja', 'feifei', 'per-seat-4');
    const hisOnly = r.cardsPerSeat![0]!.find((c) => !r.cardsPerSeat![1]!.some((d) => d.id === c.id));
    if (!hisOnly) return;                       // 兩份剛好一樣就沒得測，跳過
    const before = run.players[1]!.deck.length;
    takeCardReward(run, r, hisOnly.id, 1);      // 1 號想挑 0 號那份裡的牌
    expect(run.players[1]!.deck.length, '不該拿得到別人那份的牌').toBe(before);
  });

  it('挑自己那一份就拿得到', () => {
    const { run, r } = winOnce('feifei', 'feifei', 'per-seat-5');
    const mine = r.cardsPerSeat![1]![0]!;
    const before = run.players[1]!.deck.length;
    takeCardReward(run, r, mine.id, 1);
    expect(run.players[1]!.deck.length - before, '挑了就該進牌組').toBe(1);
    expect(run.players[1]!.deck.at(-1)!.cardId).toBe(mine.id);
  });

  it('單機不受影響：沒有一人一份，走原本那條路', () => {
    const run = newRun('per-seat-solo', 1, 'feifei');
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    run.currentNode = node.id;
    const cs = beginCombat(run);
    for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
    cs.phase = 'won';
    const r = finishCombat(run, cs)!;
    expect(r.cardsPerSeat, '單機不該有一人一份').toBeUndefined();
    expect(r.cards.length).toBeGreaterThan(0);
  });

  /** 鎖步：同一顆種子跑兩次要抽出一模一樣的兩份，不然兩台會分岔 */
  it('同一顆種子跑兩次，兩份都一模一樣', () => {
    const a = winOnce('ninja', 'feifei', 'per-seat-det');
    const b = winOnce('ninja', 'feifei', 'per-seat-det');
    expect(a.r.cardsPerSeat!.map((s) => s.map((c) => c.id)))
      .toEqual(b.r.cardsPerSeat!.map((s) => s.map((c) => c.id)));
  });
});
