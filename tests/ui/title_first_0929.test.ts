import { afterEach, describe, expect, it, vi } from 'vitest';
import ASSETS_RAW from '../../src/ui/assets.ts?raw';
import TITLE_RAW from '../../src/ui/screens/title.ts?raw';
import { _setManifestForTest, type Manifest } from '../../src/ui/assets';
import { titleArtUrls, whenTitleArtReady } from '../../src/ui/titleart';
import { _setPackForTest, type LangPack } from '../../src/i18n';
import { bootHints } from '../../tools/vite-boot-hints';

/*
 * 封面早一點出來（2026-09-29 效能）。慢網路（1.6 Mbps、來回 150 毫秒、處理器慢 4 倍）量到封面 2.4 秒出現、四隻貓 4.3 秒才到齊：
 * - 清單與繁中底子要等主程式跑起來才開始抓 → `index.html` 先抓（`tools/vite-boot-hints.ts`）；
 * - 封面一出來背景就一次抓六張、跟四隻貓搶頻寬 → 封面圖到齊才開始背景（`titleart.ts`、`main.ts`）。
 */

const EMPTY: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };
const A = (p: string): string => `assets/${p}.webp`;
const U = (p: string): string => `/assets/${p}.webp`;

function stubImages(decode: () => Promise<void> = () => Promise.resolve()) {
  const sources: string[] = [];
  const priorities: (string | undefined)[] = [];
  vi.stubGlobal('Image', class {
    fetchPriority: string | undefined;
    private v = '';
    set src(v: string) { this.v = v; sources.push(v); priorities.push(this.fetchPriority); }
    get src(): string { return this.v; }
    decode(): Promise<void> { return decode(); }
  });
  return { sources, priorities };
}

afterEach(() => {
  _setManifestForTest(EMPTY);
  _setPackForTest('zh', null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('封面圖', () => {
  const covers = (): Manifest => ({
    ...EMPTY,
    sprites: {
      'hero/cover': A('hero/cover'), 'hero/cover_en': A('hero/cover_en'),
      'hero/feifei_cover': A('hero/feifei_cover'), 'hero/feifei_cover_ja': A('hero/feifei_cover_ja'),
      'hero/fengfeng_cover': A('hero/fengfeng_cover'),
      'hero/dangdang_win': A('hero/dangdang_win'),
    },
    bg: { 'bg/screen_title': A('bg/screen_title') },
  });

  it('等的是目前語言那一套（沒有那一版用中文原圖；沒進倉的照畫面退回同一張）', () => {
    _setManifestForTest(covers());
    expect(titleArtUrls()).toEqual([U('bg/screen_title'), U('hero/feifei_cover'), U('hero/cover'), U('hero/dangdang_win'), U('hero/fengfeng_cover')]);
    _setPackForTest('en', {} as LangPack);
    expect(titleArtUrls()).toEqual([U('bg/screen_title'), U('hero/feifei_cover'), U('hero/cover_en'), U('hero/dangdang_win'), U('hero/fengfeng_cover')]);
  });

  it('插隊抓、最多等 capMs（網路卡住也不會讓背景預載永遠不開始）', async () => {
    vi.useFakeTimers();
    const { sources, priorities } = stubImages(() => new Promise<void>(() => undefined));
    _setManifestForTest(covers());
    let done = false;
    void whenTitleArtReady(6000).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(5999);
    expect(done).toBe(false);
    expect(new Set(sources)).toEqual(new Set(titleArtUrls()));
    expect(priorities.every((p) => p === 'high')).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('封面畫面與「先等封面圖」用同一支挑語言版本，不各寫一份', () => {
    const title = TITLE_RAW.replace(/\r\n/g, '\n');
    expect(title).toContain("from '../titleart'");
    expect(title).not.toMatch(/function coverKey\(/);
    // 換語言：先把新那套抓好再重畫（不然四隻貓先空白再冒出來）
    expect(title).toContain('whenTitleArtReady(3000)');
  });
});

describe('index.html 先抓清單與繁中底子', () => {
  const run = (bundle: Record<string, unknown>, filename = 'F:/x/index.html') => {
    const p = bootHints('abc123');
    (p.configResolved as unknown as (c: { base: string }) => void)({ base: '/qiuqiu-tower/' });
    const hook = p.transformIndexHtml as unknown as { handler: (html: string, ctx: unknown) => { tags: { tag: string; attrs: Record<string, unknown> }[] } | string };
    return hook.handler('<link rel="modulepreload" crossorigin href="/qiuqiu-tower/assets/types-x.js">', { filename, bundle });
  };

  it('清單的網址跟 loadManifest 一字不差、帶 crossorigin（對不上會抓兩次）', () => {
    const out = run({}) as { tags: { attrs: Record<string, unknown> }[] };
    expect(out.tags[0]!.attrs).toEqual({ rel: 'preload', as: 'fetch', crossorigin: true, href: '/qiuqiu-tower/assets/manifest.json?v=abc123' });
    expect(ASSETS_RAW).toContain('fetch(`${BASE}assets/manifest.json${BUILD ? `?v=${BUILD}` : \'\'}`)');
  });

  it('zh 那一塊與它引用的分塊一起先抓；主程式本來就先抓的不重寫；連線測試頁不動', () => {
    const bundle = {
      'assets/zh-A.js': { type: 'chunk', fileName: 'assets/zh-A.js', facadeModuleId: 'F:/x/src/i18n/zh.ts', imports: ['assets/cardtext-B.js', 'assets/types-x.js'] },
      'assets/main-C.js': { type: 'chunk', fileName: 'assets/main-C.js', facadeModuleId: 'F:/x/index.html', imports: [] },
    };
    const out = run(bundle) as { tags: { attrs: Record<string, unknown> }[] };
    expect(out.tags.slice(1).map((t) => t.attrs['href'])).toEqual(['/qiuqiu-tower/assets/zh-A.js', '/qiuqiu-tower/assets/cardtext-B.js']);
    expect(out.tags.slice(1).every((t) => t.attrs['rel'] === 'modulepreload')).toBe(true);
    expect(run(bundle, 'F:/x/nettest.html')).toBe('<link rel="modulepreload" crossorigin href="/qiuqiu-tower/assets/types-x.js">');
  });
});
