import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import SRC from '../../src/ui/app.ts?raw';

/**
 * **過場影片照角色挑檔名，沒片子的角色不能看到別人的**（2026-09-14 使用者：
 *「菲菲打完師傅後還是出現球球的動畫，菲菲過關的話動畫得先移除，等以後做好再補上」）。
 *
 * 開頭：球球 `opening.mp4`（使用者自製）、菲菲 `opening_feifei.mp4`
 *（2026-09-15 用 Remotion 拿遊戲立繪拼的，原始檔在 `tools/video/feifei_opening/`）；
 * 鐵爪機關貓沒有，直接進幻燈片。對照表是 `app.ts` 的 `OPENING_CLIP`。
 * 結尾：目前只有球球那支，她打完師父還是不能放（那支從頭到尾是他撲進師父懷裡）。
 *
 * 為什麼用讀原始碼的方式測：`playVideo` 要真的有 `<video>` 跟影片檔才走得完，
 * 在測試環境架起來的成本遠高於它擋住的東西。這條盯的是**規矩**——
 * `playVideo` 的每個呼叫點都要在判斷角色之後。
 */
describe('過場影片要看角色', () => {
  it('每個 playVideo 都被角色判斷包著', () => {
    const bad: string[] = [];
    SRC.split('\n').forEach((line, i) => {
      if (!/playVideo\(/.test(line)) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;          // 註解不算
      if (/import .*playVideo/.test(line)) return;          // 匯入那一行不算
      // 開頭：檔名從對照表查出來、查不到就不播（同一行要看得到 `clip ?`）
      if (/clip \? playVideo\(clip,/.test(line)) return;
      // 結尾：仍寫成只給球球的三元式
      if (/=== 'ninja'/.test(line)) return;
      bad.push(`${i + 1}: ${line.trim().slice(0, 110)}`);
    });
    expect(bad, `這幾行不管玩誰都會播影片：\n${bad.join('\n')}`).toEqual([]);
  });

  it('開頭影片對照表：球球與菲菲各一支、鐵爪機關貓沒有；結尾那支還在', () => {
    expect(SRC).toMatch(/OPENING_CLIP[^\n]*=\s*\{[^}]*ninja: 'opening'[^}]*feifei: 'opening_feifei'/);
    expect(SRC).not.toMatch(/samurai: 'opening/);
    expect(SRC).toContain("playVideo('ending'");
  });

  it('菲菲的開頭影片檔真的在（對照表寫了就要有檔，不然她的開場會少一段而沒人發現）', () => {
    expect(existsSync(new URL('../../public/video/opening_feifei.mp4', import.meta.url))).toBe(true);
  });
});
