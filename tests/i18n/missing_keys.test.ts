/**
 * 缺譯掃描（多語系第一片，2026-09-29）。
 *
 * 範圍＝第一片要翻的：畫面上所有 `t('…')`、牌名、秘寶、忍具、魔物名與招式、狀態與關鍵字、名詞說明。
 * 劇情、事件、戰鬥紀錄還沒包 `t()`，照舊退回中文，不在這裡數。
 * 中文原句一改，舊譯文就對不上——這裡會紅，照著補譯就好。
 */
import { describe, expect, it } from 'vitest';
import { contentSource, uiKeys } from './source';
import { format, t, _setPackForTest, term } from '../../src/i18n';
import enUi from '../../src/i18n/en/ui.json';
import enContent from '../../src/i18n/en/content.json';
import jaUi from '../../src/i18n/ja/ui.json';
import jaContent from '../../src/i18n/ja/content.json';

type Pack = { ui: Record<string, string>; content: Record<string, Record<string, unknown>> };
const PACKS: Record<'en' | 'ja', Pack> = {
  en: { ui: enUi as Record<string, string>, content: enContent as unknown as Pack['content'] },
  ja: { ui: jaUi as Record<string, string>, content: jaContent as unknown as Pack['content'] },
};

const CJK = /[㐀-鿿]/;
/** 日文裡不該出現的台灣繁體字形（日文用新字體） */
const ZH_ONLY = /[貓鋪寶獲彈數體們這點層雙對從與闆噹糰]/;
const params = (s: string): Set<string> => new Set([...s.matchAll(/\{(\w+)(?:\|[^}]*)?\}/g)].map((m) => m[1]!));

describe('t() 與 format', () => {
  it('繁中：鍵就是原句，參數照填', () => {
    _setPackForTest('zh', null);
    expect(t('新的一局')).toBe('新的一局');
    expect(t('難度 {n} 還沒有成績', { n: 3 })).toBe('難度 3 還沒有成績');
    expect(term('爪力')).toBe('爪力');
  });
  it('英文單複數', () => {
    expect(format('Draw {n} {n|card|cards}', { n: 1 })).toBe('Draw 1 card');
    expect(format('Draw {n} {n|card|cards}', { n: 3 })).toBe('Draw 3 cards');
  });
});

for (const lang of ['en', 'ja'] as const) {
  describe(`${lang} 語言包`, () => {
    const pack = PACKS[lang];
    it('畫面文字：每個 t() 的鍵都有譯文，參數對得上', () => {
      const missing: string[] = [];
      const bad: string[] = [];
      for (const k of uiKeys()) {
        const v = pack.ui[k];
        if (!v) { missing.push(k); continue; }
        const need = [...params(k)].filter((p) => p !== 'unit');
        const got = params(v);
        if (need.some((p) => !got.has(p)) || [...got].some((p) => !params(k).has(p))) bad.push(`${k} → ${v}`);
        if (lang === 'en' && CJK.test(v)) bad.push(`中文沒翻完：${k} → ${v}`);
        if (lang === 'ja' && ZH_ONLY.test(v)) bad.push(`日文用了繁體字形：${k} → ${v}`);
      }
      expect(missing, `缺 ${missing.length} 條`).toEqual([]);
      expect(bad).toEqual([]);
    });
    it('畫面文字：語言包裡沒有過期的鍵（原始碼的中文原句改了、包裡還留著舊句）', () => {
      const live = new Set(uiKeys());
      const stale = Object.keys(pack.ui).filter((k) => !live.has(k));
      expect(stale, `過期 ${stale.length} 條：原句改了的話，把譯文搬到新鍵上`).toEqual([]);
    });
    it('內容：沒有過期的鍵（牌、秘寶等刪了或改了代號）', () => {
      const src = contentSource() as unknown as Record<string, Record<string, unknown>>;
      const stale: string[] = [];
      for (const [sec, entries] of Object.entries(pack.content)) {
        for (const k of Object.keys(entries)) if (!(k in (src[sec] ?? {}))) stale.push(`${sec}.${k}`);
      }
      expect(stale).toEqual([]);
    });
    it('內容：牌、秘寶、忍具、魔物、招式、名詞都有譯文', () => {
      const src = contentSource() as unknown as Record<string, Record<string, unknown>>;
      const missing: string[] = [];
      const bad: string[] = [];
      for (const [sec, entries] of Object.entries(src)) {
        for (const k of Object.keys(entries)) {
          const v = pack.content[sec]?.[k];
          if (v === undefined || v === '' || (Array.isArray(v) && v.some((x) => !x))) { missing.push(`${sec}.${k}`); continue; }
          const s = Array.isArray(v) ? v.join(' ') : String(v);
          if (lang === 'en' && CJK.test(s)) bad.push(`${sec}.${k} → ${s}`);
          if (lang === 'ja' && ZH_ONLY.test(s)) bad.push(`${sec}.${k} → ${s}`);
        }
      }
      expect(missing, `缺 ${missing.length} 條`).toEqual([]);
      expect(bad).toEqual([]);
    });
  });
}
