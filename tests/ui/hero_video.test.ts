import { describe, expect, it } from 'vitest';
import SRC from '../../src/ui/app.ts?raw';

/**
 * **自製影片只有球球有，不能放給菲菲看**（2026-09-14 使用者：
 *「菲菲打完師傅後還是出現球球的動畫，菲菲過關的話動畫得先移除，等以後做好再補上」）。
 *
 * 兩支影片（開頭、結尾）從頭到尾都是他的故事。開頭那支 2026-09-12 就擋了，
 * **結尾那支漏掉**——玩菲菲打完師父，畫面直接放球球撲進師父懷裡的片子。
 * 比沒有過場更糟，跟結局插圖那批同一類問題（見 `app.ts` 的 `stillKey`）。
 *
 * 為什麼用讀原始碼的方式測：`playVideo` 要真的有 `<video>` 跟影片檔才走得完，
 * 在測試環境架起來的成本遠高於它擋住的東西。這條盯的是**規矩**——
 * `playVideo` 的每個呼叫點都要在判斷角色之後。以後生了她的片子，
 * 把判斷改成照角色挑檔名，這條也會跟著紅、提醒你順手改掉它。
 */
describe('自製影片要看角色', () => {
  it('每個 playVideo 都被角色判斷包著', () => {
    const bad: string[] = [];
    SRC.split('\n').forEach((line, i) => {
      if (!/playVideo\(/.test(line)) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;          // 註解不算
      if (/import .*playVideo/.test(line)) return;          // 匯入那一行不算
      // 同一行裡要看得到角色判斷（現在兩處都寫成三元式）
      if (/=== 'ninja'/.test(line)) return;
      bad.push(`${i + 1}: ${line.trim().slice(0, 110)}`);
    });
    expect(bad, `這幾行不管玩誰都會播影片：\n${bad.join('\n')}`).toEqual([]);
  });

  it('兩支都在（不是整個被刪掉才變綠的）', () => {
    expect(SRC).toContain("playVideo('opening'");
    expect(SRC).toContain("playVideo('ending'");
  });
});
