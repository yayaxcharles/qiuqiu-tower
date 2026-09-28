/**
 * 缺譯掃描（多語系第一片，2026-09-29）。
 *
 * 範圍＝第一片要翻的：畫面上所有 `t('…')`、牌名、秘寶、忍具、魔物名與招式、狀態與關鍵字、名詞說明。
 * 劇情、事件、戰鬥紀錄還沒包 `t()`，照舊退回中文，不在這裡數。
 * 中文原句一改，舊譯文就對不上——這裡會紅，照著補譯就好。
 */
import { describe, expect, it } from 'vitest';
import { contentSource, lineSource, uiKeys } from './source';
import linesZh from '../../tools/i18n/source/lines.zh.json';
import enLines from '../../src/i18n/en/lines.json';
import jaLines from '../../src/i18n/ja/lines.json';
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

describe('台詞：繁中一字不差', () => {
  /*
   * 英日的台詞是照「畫面上最後那句中文」（每位角色換過之後的整句）查的，繁中照舊由 `lineFor`／`castLineFor` 產生。
   * 這裡把四位角色會看到的每一句中文跟存底（`tools/i18n/source/lines.zh.json`）比對：劇本或改寫規則一動，這條就紅，
   * 看完差異確定是要改的，再跑 `I18N_EXTRACT=1 npx vitest run tools/i18n_extract.test.ts` 更新存底並補譯。
   */
  it('四位角色看到的每一句中文跟存底一樣', () => {
    const now = [...lineSource()].sort();
    const saved = Object.keys(linesZh).sort();
    expect(now.filter((s) => !saved.includes(s)), '存底沒有的新句子').toEqual([]);
    expect(saved.filter((s) => !now.includes(s)), '存底有、現在沒有的句子').toEqual([]);
  });
});

for (const lang of ['en', 'ja'] as const) {
  describe(`${lang} 台詞`, () => {
    const lines = (lang === 'en' ? enLines : jaLines) as Record<string, string>;
    it('每一句都有譯文、沒有過期的鍵', () => {
      const src = lineSource();
      const missing = src.filter((k) => !lines[k]);
      expect(missing.length, `缺 ${missing.length} 句，例如：${missing.slice(0, 3).join(' / ')}`).toBe(0);
      const live = new Set(src);
      expect(Object.keys(lines).filter((k) => !live.has(k)), '過期的鍵').toEqual([]);
    });
    it('字形與參數', () => {
      const bad: string[] = [];
      for (const [k, v] of Object.entries(lines)) {
        if (lang === 'en' && CJK.test(v)) bad.push(`${k} → ${v}`);
        // 「這」在日文有正當用法（這う＝爬）；只擋沒接送假名的繁體字形
        if (lang === 'ja' && ZH_ONLY.test(v.replace(/這[うっいえ]/g, ''))) bad.push(`${k} → ${v}`);
        if ([...params(k)].some((p) => !params(v).has(p))) bad.push(`參數：${k} → ${v}`);
      }
      expect(bad).toEqual([]);
    });
  });
}

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
