import { describe, expect, it } from 'vitest';
import { matePlays } from '../../src/ui/mateplay';
import SRC from '../../src/ui/screens/combat.ts?raw';

/*
 * 同伴剛打出的牌要掛在他頭上（使用者 2026-09-15）。
 * 對照的是**套用之前**的手牌快照：套用之後那張牌可能在棄牌堆、消耗堆，能力牌甚至哪裡都不在。
 */
const c = (uid: number, cardId: string) => ({ uid, cardId, upgraded: false });

describe('同伴打出的牌', () => {
  const hands = [[c(1, 'sanjo'), c(2, 'tanding')], [c(7, 'feifei_feizhen'), c(8, 'feifei_cuidu')]];

  it('同伴的出牌動作 → 從他套用前的手牌找出那張', () => {
    const got = matePlays([{ a: { t: 'card', seat: 1, u: 8, g: 3 } }], 0, hands, 4);
    expect(got).toEqual([{ seat: 1, card: c(8, 'feifei_cuidu'), turn: 4 }]);
  });

  it('自己的動作、非出牌的動作、找不到的 uid 都不算', () => {
    expect(matePlays([{ a: { t: 'card', seat: 0, u: 1 } }], 0, hands, 4)).toEqual([]);
    expect(matePlays([{ a: { t: 'ready', seat: 1, on: true } }], 0, hands, 4)).toEqual([]);
    expect(matePlays([{ a: { t: 'card', seat: 1, u: 99 } }], 0, hands, 4)).toEqual([]);
    expect(matePlays([{ a: { t: 'card', seat: 1, u: 7 } }], 0, [hands[0], undefined], 4)).toEqual([]);
  });

  it('戰鬥畫面：套用前抄手牌、套用後掛牌、只掛同伴那一格', () => {
    expect(SRC).toMatch(/handsBefore = cs\.players\.map\(\(p\) => p\.hand\.slice\(\)\)/);
    expect(SRC).toMatch(/matePlays\(applied, mySeat, handsBefore/);
    expect(SRC).toMatch(/class: `mate-play\$\{fresh \? ' in' : ''\}`/);   // 新的一張才播淡入（審查 中-4）
    expect(SRC).toMatch(/const mp = mine \? undefined : matePlay\.get\(q\.seat\)/);
  });

  it('「考慮中」：換瞄準一律走 setTargeting（會順便送提示）、收到提示只重畫同伴那格、打出就撤', () => {
    expect(SRC).not.toMatch(/(?<![\w.])targeting = (?!t;)/);   // 除了 setTargeting 自己那一行，不准直接賦值（行內的 `{ targeting = null; }` 也抓）
    expect(SRC).toMatch(/session\.onHint\(\(seat, u\) =>/);
    expect(SRC).toMatch(/class: 'mate-play hint'/);
    expect(SRC).toMatch(/mateHint\.delete\(a\.seat\)/);
  });
});
