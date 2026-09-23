/**
 * 網站小圖示的正式圖（2026-09-23，批次 favicon，`tools/gen_favicon.py`）。
 *
 * 分頁上最大顯示 32 像素，高解析螢幕要兩倍，所以守「64×64、帶透明的 PNG、10 KB 以內」：
 * 生圖端回來的是 1254×1254，忘了裁縮直接放進 public/ 就是一張幾百 KB 的圖，而首載預算已經用到 97%。
 * 讀檔用 latin1（一個字元＝一個位元組），不另外宣告 Buffer 的型別（雲端沒有 @types/node）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const bytes = readFileSync('public/favicon.png', 'latin1');
const u32 = (at: number): number => ((bytes.charCodeAt(at) << 24) | (bytes.charCodeAt(at + 1) << 16)
  | (bytes.charCodeAt(at + 2) << 8) | bytes.charCodeAt(at + 3)) >>> 0;

describe('網站小圖示', () => {
  it('是 64×64、帶透明通道的 PNG', () => {
    expect(bytes.slice(1, 4)).toBe('PNG');
    expect(bytes.slice(12, 16)).toBe('IHDR');
    expect([u32(16), u32(20)]).toEqual([64, 64]);
    expect(bytes.charCodeAt(25)).toBe(6);   // 色彩型態 6＝RGBA
  });

  it('檔案夠小（首載預算）', () => {
    expect(bytes.length).toBeLessThan(10 * 1024);
  });

  it('選定紀錄對得上（哪一次生圖、裁成多大）', () => {
    const picks = JSON.parse(readFileSync('tools/motion-art-source/favicon/picks.json', 'utf-8')) as { favicon: { size: number; bytes: number } };
    expect(picks.favicon.size).toBe(64);
    expect(picks.favicon.bytes).toBe(bytes.length);
  });
});
