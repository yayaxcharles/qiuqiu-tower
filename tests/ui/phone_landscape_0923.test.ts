import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CARDVIEW_RAW from '../../src/ui/cardview.ts?raw';
import MAIN_RAW from '../../src/main.ts?raw';
import COMBAT_RAW from '../../src/ui/screens/combat.ts?raw';
import SHOP_RAW from '../../src/ui/screens/shop.ts?raw';
import PEEK_RAW from '../../src/ui/cardpeek.ts?raw';
import { PEEK_HOLD_MS, PEEK_MOVE_PX, isTouchDevice, peekLayout, shouldPeek } from '../../src/ui/cardpeek';
import { TUT_TOUCH_PEEK } from '../../src/content/tutorial';

/*
 * 2026-09-23 polish 第 8 條：手機橫拿讀得清楚（字級、按鈕、按住手牌放大），桌機一個像素都不動。
 * 實機量測與修前修後截圖在派工報告；這裡釘住「放大後夠大、擺得對」「只在手機生效」兩件事。
 */
const CARDVIEW = CARDVIEW_RAW.replace(/\r\n/g, '\n');
const MAIN = MAIN_RAW.replace(/\r\n/g, '\n');
const COMBAT = COMBAT_RAW.replace(/\r\n/g, '\n');
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

  it('手指（觸控、觸控筆）按住夠久、沒移動才放大，不看裝置與螢幕寬（主控最後一輪：平板也開）；滑鼠一律不放大', () => {
    expect(shouldPeek(PEEK_HOLD_MS, 0, 'touch')).toBe(true);
    expect(shouldPeek(PEEK_HOLD_MS, 0, 'pen')).toBe(true);
    expect(shouldPeek(PEEK_HOLD_MS - 1, 0, 'touch')).toBe(false);
    expect(shouldPeek(PEEK_HOLD_MS, PEEK_MOVE_PX + 1, 'touch')).toBe(false);
    expect(shouldPeek(PEEK_HOLD_MS, 0, 'mouse')).toBe(false);
    // 掛上去的那支也只看這一下是不是手指，不再看 html 是不是 phone
    const attach = PEEK_RAW.replace(/\r\n/g, '\n');
    const body = attach.slice(attach.indexOf('export function attachCardPeek('));
    expect(body).toContain("touched = ev.pointerType !== 'mouse';\n    if (!touched) return;");
    expect(body).not.toMatch(/dataset\['device'\]/);
  });

  it('每張牌都掛按住放大（打不出來的牌也要讀得到）；手機樣式最後載入', () => {
    expect(sourceBetween(CARDVIEW, 'export function cardNode(', 'function fitCardText(')).toContain('attachCardPeek(node);');
    const imports = [...MAIN.matchAll(/^import '\.\/ui\/styles\/([\w-]+\.css)';/gm)].map((m) => m[1]);
    expect(imports.at(-1)).toBe('phone.css');
  });

  it('phone.css 每一條規則都只在觸控裝置生效（html[data-device="phone"／"tablet"]…），放大那張的外框除外（只有手指按住才生出來）', () => {
    const text = css('phone.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...text.matchAll(/([^{}]+)\{[^}]*\}/g)].flatMap((m) => m[1]!.split(',').map((s) => s.trim())).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(10);
    for (const s of selectors) {
      if (s.startsWith('.card-peek')) continue;
      expect(s).toMatch(/^html\[data-device="(phone|tablet)"\]/);
    }
    // 直拿照舊只有「請橫過來」，這份不碰直拿
    expect(text).not.toContain('data-orient="portrait"');
  });
});

describe('主控裁定四：罐頭鋪秘寶／忍具格、戰鬥紀錄、牌堆計數、狀態列小鈕在手機橫拿也放大', () => {
  const phone = (): string => css('phone.css');
  const rule = (selector: string): string | null => {
    const text = phone();
    const i = text.indexOf(`${selector} {`);
    return i < 0 ? null : text.slice(text.indexOf('{', i) + 1, text.indexOf('}', i));
  };
  const P = 'html[data-device="phone"][data-orient="landscape"]';

  it('牌堆計數改三欄兩列（高度不增）、字放大；戰鬥紀錄放大、框高剛好三行（切線落在兩行中間）', () => {
    expect(rule(`${P} .combat .piles`)).toMatch(/grid-template-columns: repeat\(3, auto\);[^}]*font-size: 18px;/);
    expect(rule(`${P} .combat .piles span:first-child`)).toContain('grid-column: 1 / 3;');
    expect(rule(`${P} .combat .piles > :last-child`)).toContain('grid-row: 1; grid-column: 3;');
    const log = rule(`${P} .combat .log`)!;
    const lh = Number(/line-height: (\d+)px/.exec(log)?.[1]);
    const maxH = Number(/max-height: (\d+)px/.exec(log)?.[1]);
    expect(Number(/font-size: (\d+)px/.exec(log)?.[1])).toBeGreaterThanOrEqual(18);
    expect(log).toContain('padding-top: 0;');
    expect((maxH - 6) % lh).toBe(0);   // 扣掉下內距 6 是行高的整數倍
  });

  it('狀態列小鈕放大、血條保底，擠的時候另外收（量過秘寶 1～9 件都不出舞台）', () => {
    expect(rule(`${P} .hud .btn.small`)).toMatch(/font-size: 17px;/);
    expect(rule(`${P} .hud .hud-hp`)).toContain('min-width: 150px;');
    expect(rule(`${P} .hud.crowded .hud-vol`)).toContain('width: 36px;');
  });

  it('罐頭鋪：名字、價錢放大；每一格貨（秘寶、忍具）都掛按住放大，放大時讀得到說明（.small）', () => {
    expect(rule(`${P} .shop-item .shop-name`)).toMatch(/font-size: 19px;/);
    expect(rule(`${P} .shop-item .price`)).toMatch(/font-size: 19px;/);
    const stall = SHOP_RAW.replace(/\r\n/g, '\n');
    const body = stall.slice(stall.indexOf('  function stall('), stall.indexOf('  /** 一個掛著木牌標籤的貨架'));
    expect(body).toContain('attachCardPeek(node);');
    expect(PEEK_RAW).toContain("node.querySelector<HTMLElement>('.card-text, .small')");
    // 放大的那一格一律從左上角放大（貨架格不是 .card，第一版只寫 .card，放大後會偏離外框）
    expect(css('phone.css')).toMatch(/\.card-peek > \* \{[^}]*transform-origin: 0 0;/);
  });
});

describe('主控裁定三：手機教學條多一句「按住牌可以放大看」，桌機不出現', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('那一句放在 content（畫面層不寫台詞），不帶喵、夠短（教學條要維持一行）', () => {
    expect(TUT_TOUCH_PEEK).toContain('按住牌可以放大看');
    expect(TUT_TOUCH_PEEK).not.toContain('喵');
    expect([...TUT_TOUCH_PEEK].length).toBeLessThanOrEqual(10);
  });

  it('手機、平板都算觸控裝置（教學條那一句看這支，跟按住放大一起開）；桌機不是', () => {
    for (const [device, want] of [['phone', true], ['tablet', true], ['desktop', false], [undefined, false]] as const) {
      vi.stubGlobal('document', { documentElement: { dataset: device ? { device } : {} } });
      expect(isTouchDevice(), String(device)).toBe(want);
    }
  });

  it('教學條第一步只在觸控裝置接上那一句；手機、平板的教學條寬度照內容維持一行', () => {
    // 教學條同日被效能批次抽成 `tutBar()`（整頁重畫與就地修補共用），從那支切
    const bar = COMBAT.slice(COMBAT.indexOf("const tutBar = (): HTMLElement => el('div', { class: 'tut-bar' },"), COMBAT.indexOf("el('button', { class: 'tut-close'"));
    expect(bar.length, '切得到 tutBar').toBeGreaterThan(50);
    expect(bar).toContain("tutStep === 0 && isTouchDevice() ? el('span', { class: 'tut-touch' }, TUT_TOUCH_PEEK) : ''");
    const phone = css('phone.css');
    expect(phone).toMatch(/html\[data-device="phone"\]\[data-orient="landscape"\] \.tut-bar \{[^}]*width: max-content;[^}]*font-size: 20px;/);
    expect(phone).toMatch(/html\[data-device="tablet"\] \.tut-bar \{[^}]*width: max-content;/);
  });
});
