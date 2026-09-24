import { describe, expect, it } from 'vitest';
import { cardById } from '../src/content/cards';
import { playCard, startCombat } from '../src/engine/combat';
import { qiAmount } from '../src/engine/effects';
import { Rng, seedFromString } from '../src/engine/rng';
import type { CombatState, PlayerCombat } from '../src/engine/types';
import { describeCard } from '../src/ui/cardtext';
import { inst } from './helpers';

/*
 * 封封「憋氣」乙版（2026-09-24 使用者拍板）：一張牌一次花 4 點以上蓄氣，那一招的傷害或蜷縮 ×1.3（無條件捨去）。
 * 攻擊（平斬等）的實際傷害在 `fengfeng_engine.test.ts` FG-T01 驗；這裡驗門檻本身、花氣架擋、牌面文字。
 */
let uid = 95_000;
function setup(): { cs: CombatState; p: PlayerCombat } {
  const cs = startCombat({ hp: 80, maxHp: 80, deck: [inst('fengfeng_hushen', 1)], relics: [], potions: [], encounterId: 'wood_dummy',
    rng: new Rng(seedFromString('fengfeng-burst')), hero: 'fengfeng' });
  const p = cs.player;
  p.hand = []; p.drawPile = []; p.discardPile = []; p.exhaustPile = []; p.energy = 99; p.block = 0; p.qi = 0;
  return { cs, p };
}
function play(cs: CombatState, p: PlayerCombat, id: string): boolean {
  const u = uid++;
  p.hand.push({ uid: u, cardId: id, upgraded: false });
  return playCard(cs, u, undefined, p.seat);
}

describe('憋氣：一次花 4 點以上 ×1.3', () => {
  it('門檻是 4：3 點照原樣，4 點起 ×1.3 無條件捨去', () => {
    const fx = { amount: 5, perQi: 3 };
    expect(qiAmount(fx, 3)).toBe(14);
    expect(qiAmount(fx, 4)).toBe(22);   // 17×1.3＝22.1
    expect(qiAmount({ amount: 10, perQi: 4 }, 12)).toBe(75);   // 斷流灌滿：58×1.3＝75.4
  });

  it('花氣架擋也套：劍鞘架擋 3 氣 17 點、6 氣 33 點蜷縮', () => {
    const a = setup(); a.p.qi = 3;
    expect(play(a.cs, a.p, 'fengfeng_jianqiao')).toBe(true);
    expect(a.p.block).toBe(17);
    expect(a.p.qi).toBe(0);
    const b = setup(); b.p.qi = 8;
    expect(play(b.cs, b.p, 'fengfeng_jianqiao')).toBe(true);
    expect(b.p.block).toBe(33);   // (8＋3×6)×1.3＝33.8
    expect(b.p.qi).toBe(2);
  });

  it('牌面寫出門檻；花不到 4 點的牌（下一擊準備）不寫', () => {
    expect(describeCard(cardById['fengfeng_pingzhan']!, false)).toBe('最多花 4 點蓄氣，造成 5 點傷害，每點蓄氣多 3 點，花 4 點以上再 ×1.3。');
    expect(describeCard(cardById['fengfeng_duanliu']!, false)).toContain('用盡蓄氣，造成 10 點傷害，每點蓄氣多 4 點，花 4 點以上再 ×1.3');
    expect(describeCard(cardById['fengfeng_youbian']!, false)).not.toContain('×1.3');
  });
});
