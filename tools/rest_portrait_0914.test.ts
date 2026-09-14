import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

/*
 * 貓窩立繪對位（2026-09-14 使用者：「第一關再更左邊一點、第二關窩在左邊、第三關偏右一點點」）。
 * 坐得準不準只能開畫面看（除錯頁「場景」→「跳進畫面」）；這裡守兩件看原始碼就驗得到的：
 *   1. 貓窩畫面有把「這次用哪張底圖」標到舞台上，樣式表才分得出同一關的三張
 *   2. 樣式表點名的底圖真的存在——底圖改名的話那條規則會靜靜失效，球球又坐回地板上
 */
describe('貓窩：球球的位置照底圖分', () => {
  it('畫面把底圖名稱標在舞台的 data-restbg', () => {
    expect(readFileSync('src/ui/screens/rest.ts', 'utf-8')).toMatch(/dataset\['restbg'\]\s*=/);
  });

  it('樣式表點名的每一張底圖都在', () => {
    const css = readFileSync('src/ui/styles/screens.css', 'utf-8');
    const named = [...css.matchAll(/data-restbg="([a-z_]+)"/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(0);
    for (const n of named) expect(existsSync(`public/assets/bg/${n}.webp`), `${n}.webp 不在`).toBe(true);
  });
});
