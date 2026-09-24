/*
 * 連線貓窩：同伴的動作套進來、我這一格還沒做完時，畫面要怎麼重畫（2026-09-24 推前審查五 高-1）。
 *
 * 原本一律重畫選單（`show()`）：帶夢枕的人睡完正在挑牌（`pillow`），同伴這時候做完事，
 * 他的三張牌就被選單蓋掉，選單的按鈕又因為「這一格已經用過」全部按不動——挑不到牌就一直算沒做完，兩個人一起卡在貓窩。
 * 已經做完、在等同伴的（`after`）也一樣會被選單蓋掉，看到一排按不動的鈕。
 * 純邏輯，畫面（`ui/screens/rest.ts`）與測試共用同一份。
 */

/** 貓窩畫面現在停在哪：選單（還沒做事）、夢枕挑牌、做完在等 */
export type RestPhase = 'menu' | 'pillow' | 'after';

/** 同伴做了一件事、我還沒做完：選單照舊重畫（按鈕跟著變）；挑牌的重畫挑牌那一頁；做完在等的不動 */
export function restRedrawOnMate(phase: RestPhase): 'menu' | 'pillow' | 'keep' {
  if (phase === 'pillow') return 'pillow';
  if (phase === 'after') return 'keep';
  return 'menu';
}
