import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// 封面「介紹影片」（2026-09-29）：按鈕在、三種語言都有字、檔案在而且不會大到慢網路打不開。
// 實機播放檢查在 tools/trailer/check_title_trailer.mjs（點下去真的在播、關掉疊層收乾淨）。
const src = (p: string): string => readFileSync(resolve(p), 'utf8').replace(/\r\n/g, '\n');

describe('封面介紹影片', () => {
  it('封面圖鑑那一排第一顆就是介紹影片，點了叫 playTrailer', () => {
    const title = src('src/ui/screens/title.ts');
    expect(title).toMatch(/el\('div', \{ class: 'title-books' \},\n(?:\s*\/\/[^\n]*\n)*\s*el\('button', \{ class: 'btn small', onclick: \(\) => playTrailer\(\) \}, t\('🎬 介紹影片'\)\)/);
  });

  it('英文、日文都有翻譯', () => {
    for (const lang of ['en', 'ja']) {
      const ui = JSON.parse(src(`src/i18n/${lang}/ui.json`)) as Record<string, string>;
      expect(ui['🎬 介紹影片'], lang).toBeTruthy();
      expect(ui['🎬 介紹影片'], lang).not.toMatch(lang === 'en' ? /[一-鿿]/ : /介紹影片/);
    }
  });

  it('影片檔在、720p 版不超過 15 MB（點了才下載，但慢網路也要開得起來）', () => {
    const f = resolve('public/video/trailer.mp4');
    expect(existsSync(f)).toBe(true);
    expect(statSync(f).size).toBeLessThan(15 * 1024 * 1024);
  });

  it('關掉時連下載一起停、音樂接回來', () => {
    const v = src('src/ui/video.ts');
    const body = v.slice(v.indexOf('export function playTrailer'));
    expect(body).toContain("v.removeAttribute('src'); v.load();");
    expect(body).toContain('resumeBgm()');
    expect(body).toContain("preload: 'auto'");
  });
});
