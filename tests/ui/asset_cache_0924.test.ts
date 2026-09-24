import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { _setManifestForTest, manifestImagePaths } from '../../src/ui/assets';
import MAIN_RAW from '../../src/main.ts?raw';
import CACHE_RAW from '../../src/ui/assetcache.ts?raw';

/*
 * 圖片離線快取（`public/sw.js`，2026-09-24 使用者：「我想優化載入的速度」「都做」）。
 * 在假的瀏覽器環境裡把 sw.js 跑起來：帶雜湊的圖本機有就用本機、沒有才抓並存一份；
 * 沒雜湊的、聲音、分段請求、別的網站都不碰；清單名單傳過來會刪掉舊版的圖，名單太短不刪。
 */
type Handler = (e: Record<string, unknown>) => void;
function loadSw() {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, string>();
  const cache = {
    match: vi.fn(async (req: { url: string }) => (store.has(req.url) ? { from: 'cache', url: req.url } : undefined)),
    put: vi.fn(async (req: { url: string }) => { store.set(req.url, 'x'); }),
    keys: vi.fn(async () => [...store.keys()].map((url) => ({ url }))),
    delete: vi.fn(async (req: { url: string }) => store.delete(req.url)),
  };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ['qiuqiu-img-v0', 'qiuqiu-img-v1', 'other']), delete: vi.fn(async () => true) };
  const fetchFn = vi.fn(async (req: { url: string }) => ({ status: 200, type: 'basic', url: req.url, clone() { return this; } }));
  const self = {
    location: { origin: 'https://x.github.io' },
    addEventListener: (t: string, h: Handler) => { handlers[t] = h; },
    skipWaiting: vi.fn(), clients: { claim: vi.fn(async () => undefined) },
  };
  new Function('self', 'caches', 'fetch', 'URL', readFileSync('public/sw.js', 'utf8'))(self, caches, fetchFn, URL);
  const fire = async (url: string, opts: { method?: string; range?: boolean } = {}) => {
    let responded: Promise<unknown> | null = null;
    handlers['fetch']!({ request: { url, method: opts.method ?? 'GET', headers: { has: (h: string) => h === 'range' && !!opts.range } },
      respondWith: (p: Promise<unknown>) => { responded = p; } });
    return responded ? await responded : null;
  };
  return { handlers, store, cache, caches, fetchFn, fire };
}

const IMG = 'https://x.github.io/qiuqiu-tower-coop/assets/bg/fengfeng_story_ep01-7WQhIcB8.webp';

describe('sw.js：帶雜湊的圖本機有就用本機', () => {
  it('第一次去網路抓、存一份；第二次直接用本機的，不再上網', async () => {
    const s = loadSw();
    expect(await s.fire(IMG)).toMatchObject({ status: 200 });
    expect(s.fetchFn).toHaveBeenCalledTimes(1);
    expect(s.store.has(IMG)).toBe(true);
    expect(await s.fire(IMG)).toMatchObject({ from: 'cache' });
    expect(s.fetchFn).toHaveBeenCalledTimes(1);
  });

  it('不碰：沒雜湊的、清單（帶 ?v=）、聲音影片、分段請求、別的網站、不是 GET', async () => {
    const s = loadSw();
    for (const [url, opts] of [
      ['https://x.github.io/qiuqiu-tower-coop/index.html', {}],
      ['https://x.github.io/qiuqiu-tower-coop/assets/manifest.json?v=abc', {}],
      ['https://x.github.io/qiuqiu-tower-coop/bgm/act1-AbCdEfGh.mp3', {}],
      ['https://x.github.io/qiuqiu-tower-coop/video/opening-AbCdEfGh.mp4', {}],
      [IMG, { range: true }],
      ['https://other.site/assets/bg/a-AbCdEfGh.webp', {}],
      [IMG, { method: 'POST' }],
      ['https://x.github.io/qiuqiu-tower-coop/assets/main-Tqfeexpc.js', {}],
    ] as const) {
      expect(await s.fire(url, opts), url).toBeNull();
    }
    expect(s.fetchFn).not.toHaveBeenCalled();
  });

  it('換版：舊名字的快取丟掉，只留這一版的', async () => {
    const s = loadSw();
    let done: Promise<unknown> | null = null;
    s.handlers['activate']!({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    expect(s.caches.delete).toHaveBeenCalledWith('qiuqiu-img-v0');
    expect(s.caches.delete).not.toHaveBeenCalledWith('qiuqiu-img-v1');
    expect(s.caches.delete).not.toHaveBeenCalledWith('other');
  });

  it('清單名單傳過來：不在名單上的圖（舊版換掉的）刪掉；名單太短（清單沒載到）不刪', async () => {
    const s = loadSw();
    const old = 'https://x.github.io/qiuqiu-tower-coop/assets/bg/old-ZZZZZZZZ.webp';
    s.store.set(IMG, 'x'); s.store.set(old, 'x');
    const keep = ['/qiuqiu-tower-coop/assets/bg/fengfeng_story_ep01-7WQhIcB8.webp',
      ...Array.from({ length: 600 }, (_, i) => `/qiuqiu-tower-coop/assets/x/${i}-AAAAAAAA.webp`)];
    let done: Promise<unknown> | null = null;
    s.handlers['message']!({ data: { type: 'keep', paths: keep.slice(0, 10) }, waitUntil: (p: Promise<unknown>) => { done = p; } });
    expect(done, '名單太短：不動').toBeNull();
    s.handlers['message']!({ data: { type: 'keep', paths: keep }, waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    expect(s.store.has(IMG)).toBe(true);
    expect(s.store.has(old)).toBe(false);
  });
});

describe('掛上去的地方', () => {
  it('manifestImagePaths：整棵清單往下收，只收圖、含 files 表', () => {
    _setManifestForTest({ cards: { 'card/a': 'assets/cards/a-AAAAAAAA.webp' }, sprites: {}, monsters: { m: { idle: 'assets/monsters/m-BBBBBBBB.webp' } },
      icons: {}, bg: {}, review: [], files: { 'assets/motion/x.webp': 'assets/motion/x-CCCCCCCC.webp', 'bgm/a.mp3': 'bgm/a-DDDDDDDD.mp3' } } as never);
    expect(manifestImagePaths().sort()).toEqual(['assets/cards/a-AAAAAAAA.webp', 'assets/monsters/m-BBBBBBBB.webp', 'assets/motion/x-CCCCCCCC.webp']);
  });
  it('只在打包版掛、讀完清單之後掛', () => {
    const main = MAIN_RAW.replace(/\r\n/g, '\n');
    expect(main.indexOf('registerAssetCache();')).toBeGreaterThan(main.indexOf('await loadManifest();'));
    expect(CACHE_RAW).toContain("if (dev || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;");
    expect(CACHE_RAW).toContain('navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE })');
  });
});
