import { describe, expect, it } from 'vitest';
import SRC from '../../src/ui/screens/event.ts?raw';

/*
 * 事件「三選一學招」的連線投票順序（使用者 2026-09-15 跟朋友實測：加入的人每次都卡在「等同伴挑完」）。
 *
 * 後投的那一位一 `pick` 就會當場結算、票箱清空；如果 `pick` 之後才去看票箱決定畫不畫等待畫面，
 * 看到的是空箱，就把結果蓋掉。規矩：**先畫等待畫面（`waiting: true`）、再 `pick`**，跟丟牌那條路一樣。
 * 這支跟 mate_sprite.test.ts 一樣讀原始碼盯順序：整個事件畫面要架 DOM 才走得到那一行。
 */
describe('事件學招：先畫等待畫面、再投票', () => {
  const learn = SRC.slice(SRC.indexOf('const learn = (cardId: string)'), SRC.indexOf("coop.pick('evlearn', cardId)") + 40);
  it('learn 裡 chooseCard(..., true) 排在 coop.pick 之前', () => {
    const draw = learn.indexOf('chooseCard(resultText, defs, gains, upgradedCard, outcomes, true)');
    const vote = learn.indexOf("coop.pick('evlearn', cardId)");
    expect(draw, '要先畫等待畫面').toBeGreaterThan(-1);
    expect(vote).toBeGreaterThan(draw);
  });
  it('pick 之後不再回頭看票箱重畫', () => {
    const from = SRC.indexOf("coop.pick('evlearn', cardId)");
    const end = SRC.indexOf('};', from);   // learn 這支箭頭函式的結尾
    expect(SRC.slice(from, end)).not.toMatch(/coop\.picks\('evlearn'/);
  });
  it('自己挑的那張找不到時也要收尾，不能靜靜 return', () => {
    const tl = SRC.slice(SRC.indexOf('function takeLearn('), SRC.indexOf('function chooseCard('));
    expect(tl).toMatch(/if \(resultText !== null\) finish\(/);
  });
});
