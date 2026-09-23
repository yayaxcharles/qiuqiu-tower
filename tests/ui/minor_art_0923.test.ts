/**
 * 2026-09-23 批次 statics 的兩件小的（美術盤點 D2、D3）：
 *  - 石獅子第二階段補挨打、防禦（`tools/gen_stone_lion_p2.py`）：原本清單沒有這兩個姿勢，
 *    `monsterUrl` 退回第二階段待機，被打、擋下來都沒反應；
 *  - 噹噹的對白頭像改從選角那張新畫風待機圖裁（`tools/make_dialogue_portraits.py dangdang`）：
 *    原本裁自待機圖集，只有 167×240，框高 290 要放大 1.2 倍、看起來偏軟。
 * webp 的畫布大小直接讀檔頭（VP8X 區塊：寬、高各 3 個位元組、存的是減一），不另外裝解碼器。
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import manifest from '../../public/assets/manifest.json';
import packed from '../../tools/motion-art-source/minor/stone_lion_p2_packed.json';

function webpSize(path: string): [number, number] {
  const b = readFileSync(path, 'latin1');
  expect(b.slice(0, 4) + b.slice(8, 12), path).toBe('RIFFWEBP');
  expect(b.slice(12, 16), `${path} 要是帶透明度的延伸格式`).toBe('VP8X');
  const u24 = (at: number): number => b.charCodeAt(at) | (b.charCodeAt(at + 1) << 8) | (b.charCodeAt(at + 2) << 16);
  return [u24(24) + 1, u24(27) + 1];
}

describe('石獅子第二階段', () => {
  it('挨打、防禦有自己的圖，而且跟第一階段同一個畫布（換階段不會忽大忽小）', () => {
    const entry = (manifest.monsters as Record<string, Record<string, string>>)['codex/monster_stone_lion_p2']!;
    expect(Object.keys(entry).sort()).toEqual(['attack', 'block', 'hurt', 'idle']);
    const base = webpSize('public/assets/monsters/stone_lion_idle.webp');
    for (const row of packed as { pose: string; sha256: string }[]) {
      const file = `public/${entry[row.pose]}`;
      expect(createHash('sha256').update(readFileSync(file)).digest('hex'), row.pose).toBe(row.sha256);
      expect(webpSize(file), row.pose).toEqual(base);
    }
  });
});

describe('噹噹的對白頭像', () => {
  it('夠大，對白框（高 290）裡不用放大', () => {
    const [, height] = webpSize('public/assets/sprites/hero/dangdang_portrait.webp');
    expect(height).toBeGreaterThanOrEqual(300);
  });
});
