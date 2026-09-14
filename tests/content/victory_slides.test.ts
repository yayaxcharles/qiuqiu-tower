import { describe, expect, it } from 'vitest';
import { victoryLinesFor } from '../../src/content/dialogue';
import { HEROES } from '../../src/engine/hero';

/**
 * 通關幻燈片的切點（2026-09-12 稽核 中-1）。
 *
 * 原本是拿內文比對（`includes('撲進')`）。那兩個字只出現在球球的結局裡，
 * 菲菲那六句沒有，於是切點被夾成 1、她的相擁畫面被配到「回家路」那張圖上。
 * 現在改成 `DialogueLine.slideBreak` 旗標，這條測試盯著**每個角色都標了一個、而且只標一個**。
 */
describe('通關幻燈片的切點', () => {
  const cases = HEROES.flatMap((hero) =>
    [1, 4].flatMap((diff) =>
      [['sanjo'], ['feifei_cuidu', 'feifei_cuidu'], ['tanding', 'tanding', 'tanding']]
        .map((deck) => ({ hero, diff, deck }))));

  it('每位角色、每種牌組傾向、每個難度都剛好一個切點', () => {
    for (const { hero, diff, deck } of cases) {
      const lines = victoryLinesFor(deck, diff, hero);
      const marks = lines.filter((l) => l.slideBreak).length;
      expect(marks, `${hero}／難度 ${diff}／${deck.join('+')} 有 ${marks} 個切點`).toBe(1);
    }
  });

  it('切點不在第一句、也不在最後一句（兩張圖都要有話講）', () => {
    for (const { hero, diff, deck } of cases) {
      const lines = victoryLinesFor(deck, diff, hero);
      const i = lines.findIndex((l) => l.slideBreak);
      expect(i, `${hero} 的切點在第一句`).toBeGreaterThan(0);
      expect(i, `${hero} 的切點在最後一句，第二張圖沒台詞`).toBeLessThan(lines.length - 1);
    }
  });

  it('插進去的個人化旁白與難度旁白不會把切點弄丟', () => {
    // 個人化那句插在 index 2、難度那句 push 到最後，都不可以蓋掉旗標
    for (const hero of HEROES) {
      const plain = victoryLinesFor(['sanjo'], 1, hero);
      const fancy = victoryLinesFor(['tanding', 'tanding', 'tanding'], 5, hero);
      expect(fancy.length).toBeGreaterThan(plain.length);
      expect(fancy.filter((l) => l.slideBreak).length).toBe(1);
    }
  });
});
