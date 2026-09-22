import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import record from '../../docs/screen-art-assets.json';

/**
 * 標題「參上」貼圖的貓放大（2026-09-22，批次 proj，`tools/gen_cover_art.py`）。
 *
 * 下午換新畫風那版（批次 screens）貓比舊貼圖矮一截（約八到九成）、題字底線和煙塵之間空 30～60 像素。
 * 這一批把貓和煙塵分開生，貓的外框高度照舊貼圖裡貓的外框（人眼在 10 像素格線上量）、腳底對齊，
 * 煙塵補到題字底線下方。
 *
 * 守三件事（把四張換回下午那版，這裡整段紅；遊戲裡的檔＝紀錄那張由 `screen_art.test.ts` 的雜湊守）：
 *  1. 四張都是這一批做的，遊戲裡的檔就是紀錄那張；
 *  2. 貓的外框高度＝舊貼圖貓的外框高度（±3 像素），四隻身高差 12% 以內，腳底線跟舊圖一樣；
 *  3. 煙塵頂離題字底線 40 像素以內、本體（貓＋煙塵）頂端不比舊圖低 20 像素以上。
 */
type Cover = {
  file: string; sha256: string; batch?: string; catBox?: number[]; oldCatBox?: number[]; soleLine: number;
  gapToTitle?: number; bodyGap?: number; oldBodyGap?: number;
};
const FILES = record.files as unknown as Record<string, Cover>;
// 舊貼圖（換圖前 a4e6d19）裡貓的外框高度：耳尖／頭髮頂到腳底，直接抄量測結果，不從紀錄讀
const OLD_CAT_HEIGHT = { qiuqiu: 359, feifei: 389, dangdang: 402, fengfeng: 400 } as const;
const OLD_SOLE = { qiuqiu: 533, feifei: 536, dangdang: 536, fengfeng: 531 } as const;
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('標題「參上」貼圖：貓跟舊貼圖一樣大、題字下不再空一截', () => {
  it('四張都是批次 proj 做的，遊戲裡的檔就是紀錄那張', () => {
    for (const hero of Object.keys(OLD_CAT_HEIGHT)) {
      const e = FILES[`${hero}/cover`]!;
      expect(e.batch, hero).toBe('proj');
      expect(sha(e.file), hero).toBe(e.sha256);
    }
  });

  it('貓的外框高度＝舊貼圖貓的高度，四隻一致，腳底線不變', () => {
    const heights: number[] = [];
    for (const [hero, want] of Object.entries(OLD_CAT_HEIGHT)) {
      const e = FILES[`${hero}/cover`]!;
      const [, y0, , y1] = e.catBox as [number, number, number, number];
      expect(Math.abs(y1 - y0 - want), `${hero} 貓高 ${y1 - y0}（舊 ${want}）`).toBeLessThanOrEqual(3);
      expect(Math.abs(y1 - OLD_SOLE[hero as keyof typeof OLD_SOLE]), `${hero} 腳底 ${y1}`).toBeLessThanOrEqual(3);
      expect(e.soleLine, hero).toBe(OLD_SOLE[hero as keyof typeof OLD_SOLE]);
      heights.push(y1 - y0);
    }
    expect(Math.max(...heights) / Math.min(...heights) - 1).toBeLessThanOrEqual(0.12);
  });

  it('煙塵補到題字底線下，本體頂端跟舊圖差不多高', () => {
    for (const hero of Object.keys(OLD_CAT_HEIGHT)) {
      const e = FILES[`${hero}/cover`]!;
      expect(e.gapToTitle!, `${hero} 煙塵頂離底線`).toBeLessThanOrEqual(40);
      expect(e.bodyGap! - e.oldBodyGap!, `${hero} 本體頂端比舊圖低`).toBeLessThanOrEqual(20);
    }
  });
});
