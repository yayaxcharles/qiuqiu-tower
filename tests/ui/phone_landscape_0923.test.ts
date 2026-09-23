import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import CARDVIEW_RAW from '../../src/ui/cardview.ts?raw';
import MAIN_RAW from '../../src/main.ts?raw';
import { PEEK_HOLD_MS, PEEK_MOVE_PX, peekLayout, shouldPeek } from '../../src/ui/cardpeek';

/*
 * 2026-09-23 polish 第 8 條：手機橫拿讀得清楚（字級、按鈕、按住手牌放大），桌機一個像素都不動。
 * 實機量測與修前修後截圖在派工報告；這裡釘住「放大後夠大、擺得對」「只在手機生效」兩件事。
 */
const CARDVIEW = CARDVIEW_RAW.replace(/\r\n/g, '\n');
const MAIN = MAIN_RAW.replace(/\r\n/g, '\n');
// 樣式檔用 fs 讀（vitest 對 `.css?raw` 會先過自己的 CSS 處理）
const css = (name: string): string => readFileSync(`src/ui/styles/${name}`, 'utf8').replace(/\r\n/g, '\n');

function sourceBetween(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`找不到這一段：${start}`);
  return src.slice(a, b);
}

describe('第 8 條：手機橫拿讀得清楚，桌機不動', () => {
  it('按住放大：三種手機縮放（0.50／0.52／0.54）下，小牌（13）與大牌（15）的說明放大後都至少 11 像素，而且不出舞台、不蓋住原本那張', () => {
    for (const k of [0.5, 0.521, 0.542]) {
      for (const [w, h, text] of [[145, 213, 13], [170, 250, 15], [145, 213, 10]] as const) {
        for (const x of [260, 600, 900]) {
          const card = { x, y: 476, w, h };
          const p = peekLayout(card, k, text);
          if (text >= 13) expect(text * p.scale * k).toBeGreaterThanOrEqual(11);
          expect(p.left).toBeGreaterThanOrEqual(0);
          expect(p.top).toBeGreaterThanOrEqual(0);
          expect(p.left + w * p.scale).toBeLessThanOrEqual(1280);
          expect(p.top + h * p.scale).toBeLessThanOrEqual(720);
          const overlapX = Math.min(p.left + w * p.scale, card.x + w) - Math.max(p.left, card.x);
          expect(overlapX).toBeLessThanOrEqual(0);   // 擺在牌的另一側：手指按在牌上，不擋放大的那張
        }
      }
    }
  });

  it('只有手機的手指按住夠久、沒移動才放大；滑鼠、平板、桌機一律不放大', () => {
    expect(shouldPeek(PEEK_HOLD_MS, 0, 'touch', 'phone')).toBe(true);
    expect(shouldPeek(PEEK_HOLD_MS - 1, 0, 'touch', 'phone')).toBe(false);
    expect(shouldPeek(PEEK_HOLD_MS, PEEK_MOVE_PX + 1, 'touch', 'phone')).toBe(false);
    expect(shouldPeek(PEEK_HOLD_MS, 0, 'mouse', 'phone')).toBe(false);
    expect(shouldPeek(PEEK_HOLD_MS, 0, 'touch', 'tablet')).toBe(false);
    expect(shouldPeek(PEEK_HOLD_MS, 0, 'touch', 'desktop')).toBe(false);
  });

  it('每張牌都掛按住放大（打不出來的牌也要讀得到）；手機樣式最後載入', () => {
    expect(sourceBetween(CARDVIEW, 'export function cardNode(', 'function fitCardText(')).toContain('attachCardPeek(node);');
    const imports = [...MAIN.matchAll(/^import '\.\/ui\/styles\/([\w-]+\.css)';/gm)].map((m) => m[1]);
    expect(imports.at(-1)).toBe('phone.css');
  });

  it('phone.css 每一條規則都只在手機生效（html[data-device="phone"]…），放大那張的外框除外（只有手機會生出來）', () => {
    const text = css('phone.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...text.matchAll(/([^{}]+)\{[^}]*\}/g)].flatMap((m) => m[1]!.split(',').map((s) => s.trim())).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(10);
    for (const s of selectors) {
      if (s.startsWith('.card-peek')) continue;
      expect(s).toMatch(/^html\[data-device="phone"\]/);
    }
    // 直拿照舊只有「請橫過來」，這份不碰直拿
    expect(text).not.toContain('data-orient="portrait"');
  });
});
