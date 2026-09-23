import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import { eventById } from '../../src/content/events';
import { HEROES } from '../../src/engine/hero';
import { newCoopRun, newRun } from '../../src/engine/run';
import { BASE, _setManifestForTest, setLocalHero, type Manifest } from '../../src/ui/assets';
import { eventResultUrls, preloadEventResults, warmResultArt } from '../../src/ui/preload';
import EVENT_RAW from '../../src/ui/screens/event.ts?raw';

/*
 * 事件結果圖先抓、選了才等（2026-09-23 內容擴充 0-2 補，主控裁定）。
 *
 * 結果圖原本是點了選項、結果畫面建出 `<img>` 那一刻才抓，慢網路下插圖那一塊先空著。
 * 現在進到事件畫面就在背景抓這個事件所有選項的結果圖（插隊、留著）；點選項時還沒到就先等（最多 6 秒、
 * 超過 0.4 秒補一行提示），好了才跑結果（`screens/event.ts` 的 `whenResultArtReady`）。
 */
const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
const EMPTY: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };
const EVENT = EVENT_RAW.replace(/\r\n/g, '\n');

beforeEach(() => { _setManifestForTest(MANIFEST); });
afterEach(() => { _setManifestForTest(EMPTY); setLocalHero('ninja'); vi.unstubAllGlobals(); vi.useRealTimers(); });

function fakeImages(decode: () => Promise<void> = async () => undefined) {
  const got: { src: string; priority: string | undefined }[] = [];
  class FakeImage {
    fetchPriority: string | undefined;
    set src(v: string) { got.push({ src: v, priority: this.fetchPriority }); }
    decode = decode;
  }
  vi.stubGlobal('Image', FakeImage);
  return got;
}

describe('這個事件的結果圖名單', () => {
  it('每個有結果圖的選項都在、是這一位自己的版本、沒有剪影；沒有結果圖的選項不列', () => {
    for (const hero of HEROES) {
      setLocalHero(hero);   // 事件畫面挑圖照本機這一位（`app.ts` 的 `adoptRun` 設的）
      const run = newRun(`result-art-${hero}`, 1, hero);
      for (const id of ['rescue', 'toll', 'sunbath', 'daxia_teach']) {
        const ev = eventById[id]!;
        const urls = eventResultUrls(run, id);
        const want = [...new Set(ev.choices.filter((c) => c.resultArt).map((c) => {
          const mine = `bg/event_${hero}_${c.resultArt}`;
          return `${BASE}${MANIFEST.bg[hero !== 'ninja' && MANIFEST.bg[mine] ? mine : `bg/event_${c.resultArt}`]}`;
        }))];
        expect(urls, `${hero} ${id}`).toEqual(want);
        expect(urls.some((u) => u.startsWith('data:') || u.includes('undefined')), `${hero} ${id}`).toBe(false);
        if (hero !== 'ninja' && urls.length) expect(urls.some((u) => u.includes(`/event_${hero}_`)), `${hero} ${id}`).toBe(true);
      }
    }
  });

  it('連線的鏡子走廊照座位 0 挑（跟主圖同一條規矩）', () => {
    setLocalHero('ninja');   // 坐 1 號的球球
    const run = newCoopRun('coop-mirror-result', 1, 'fengfeng', 'ninja');
    const urls = eventResultUrls(run, 'mirror_hall');
    const arts = eventById['mirror_hall']!.choices.map((c) => c.resultArt).filter(Boolean);
    expect(urls.length).toBe(new Set(arts).size);
    for (const u of urls) expect(u, u).toContain('/event_fengfeng_');
  });
});

describe('先抓、選了才等', () => {
  it('進畫面就抓：插隊、留著、還在路上的同一張不重送', async () => {
    const got = fakeImages(() => new Promise<void>(() => undefined));   // 慢網路：送出去之後一直還在路上
    const run = newRun('result-preload', 1, 'feifei');
    const want = eventResultUrls(run, 'rescue');
    expect(want.length).toBeGreaterThan(0);
    void preloadEventResults(run, 'rescue');
    await Promise.resolve();
    expect(got.map((g) => g.src)).toEqual(want);
    expect(got.every((g) => g.priority === 'high')).toBe(true);
    got.length = 0;
    void preloadEventResults(run, 'rescue');
    await Promise.resolve();
    expect(got, '連線每投一票就重畫一次：不重送').toEqual([]);
  });

  it('選了才等：還沒到就等，最多 6 秒；沒有結果圖的選項立刻好、不發請求', async () => {
    vi.useFakeTimers();
    const got = fakeImages(() => new Promise<void>(() => undefined));
    const run = newRun('result-warm', 1);
    const ev = eventById['rescue']!;
    const withArt = ev.choices.findIndex((c) => c.resultArt);
    let done = false;
    void warmResultArt(run, 'rescue', withArt).then(() => { done = true; });
    expect(got).toHaveLength(1);
    expect(got[0]!.priority).toBe('high');
    await vi.advanceTimersByTimeAsync(5999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);

    const noArt = Object.values(eventById).map((e) => ({ e, i: e.choices.findIndex((c) => !c.resultArt) })).find((x) => x.i >= 0)!;
    got.length = 0;
    let quick = false;
    void warmResultArt(run, noArt.e.id, noArt.i).then(() => { quick = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(quick).toBe(true);
    expect(got).toEqual([]);
  });
});

/*
 * `whenResultArtReady` 是事件畫面閉包裡的函式，照 `adopt_run_0923` 的作法原封不動切出來跑，
 * 用到的閉包變數（app、run、ev、root、el）換成手上控制得到的替身。
 */
function inner(start: string): string {
  const a = EVENT.indexOf(start);
  if (a < 0) throw new Error(`找不到這一段：${start}`);
  return EVENT.slice(a, EVENT.indexOf('\n  }\n', a) + 4);
}

async function harness(opts: { resultArt: boolean; warm: Promise<void> }) {
  const body = inner('  function whenResultArtReady(index: number, go: () => void): void {');
  const js = (await transformWithOxc(`let resolving = false;\n${body}\nreturn { whenResultArtReady, busy: () => resolving };`, 'wait.ts')).code;
  const cls = new Set<string>();
  const appended: { text: string; removed: boolean }[] = [];
  const box = { append: (n: { text: string; removed: boolean }) => { appended.push(n); } };
  const root = {
    querySelector: (s: string) => (s === '.scene-box' ? box : s === '.event-wait' ? (appended.find((n) => !n.removed) ? { remove: () => { for (const n of appended) n.removed = true; } } : null) : null),
  };
  const run = { id: 'run' };
  const app = { run: run as unknown, stage: { classList: { add: (c: string) => cls.add(c), remove: (c: string) => cls.delete(c) } } };
  const ev = { id: 'rescue', choices: [{ resultArt: opts.resultArt ? 'rescue_r0' : undefined }] };
  const warmCalls: unknown[][] = [];
  const api = new Function('app', 'run', 'ev', 'root', 'el', 'warmResultArt', 'window', js)(
    app, run, ev, root,
    (_tag: string, _attrs: unknown, text: string) => ({ text, removed: false }),
    (...a: unknown[]) => { warmCalls.push(a); return opts.warm; },
    { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t) },
  ) as { whenResultArtReady(i: number, go: () => void): void; busy(): boolean };
  return { api, app, cls, appended, warmCalls };
}

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('事件畫面：點了選項等結果圖', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('還沒到：鎖住舞台、不跑結果；0.4 秒後補提示；到了才解鎖、拿掉提示、跑結果', async () => {
    let release!: () => void;
    const h = await harness({ resultArt: true, warm: new Promise<void>((r) => { release = r; }) });
    const go = vi.fn();
    h.api.whenResultArtReady(0, go);
    expect(h.warmCalls[0]!.slice(1)).toEqual(['rescue', 0]);
    expect(h.cls.has('fight-pending')).toBe(true);
    expect(h.api.busy(), '鍵盤再按一次也不收').toBe(true);
    expect(go).not.toHaveBeenCalled();
    vi.advanceTimersByTime(399);
    expect(h.appended).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(h.appended.map((n) => n.text)).toEqual(['正在準備……']);
    release(); await flush();
    expect(go).toHaveBeenCalledOnce();
    expect(h.cls.has('fight-pending')).toBe(false);
    expect(h.api.busy()).toBe(false);
    expect(h.appended.every((n) => n.removed), '提示拿掉').toBe(true);
  });

  it('沒有結果圖的選項：直接跑，不鎖、不等', async () => {
    const h = await harness({ resultArt: false, warm: new Promise<void>(() => undefined) });
    const go = vi.fn();
    h.api.whenResultArtReady(0, go);
    expect(go).toHaveBeenCalledOnce();
    expect(h.warmCalls).toEqual([]);
    expect(h.cls.has('fight-pending')).toBe(false);
  });

  it('很快就到的：不出提示', async () => {
    const h = await harness({ resultArt: true, warm: Promise.resolve() });
    const go = vi.fn();
    h.api.whenResultArtReady(0, go);
    await flush();
    vi.advanceTimersByTime(1000);
    expect(go).toHaveBeenCalledOnce();
    expect(h.appended).toEqual([]);
  });

  it('等的時候這一局丟了（斷線回標題）：不跑結果', async () => {
    let release!: () => void;
    const h = await harness({ resultArt: true, warm: new Promise<void>((r) => { release = r; }) });
    const go = vi.fn();
    h.api.whenResultArtReady(0, go);
    h.app.run = null;
    release(); await flush();
    expect(go).not.toHaveBeenCalled();
    expect(h.cls.has('fight-pending')).toBe(false);
  });
});

/*
 * 等滿 6 秒結果圖還沒解好：先用主圖頂著、解好再換上（慢網路實測：本機預覽 HTTP/1.1 的 6 條連線被大檔佔滿時，
 * 結果圖排了十幾秒）。`eventArt` 是事件畫面檔裡的模組層函式，同樣切出來跑。
 */
async function artHarness(ready: Set<string>) {
  const a = EVENT.indexOf('function eventArt(');
  const body = EVENT.slice(a, EVENT.indexOf('\n}\n', a) + 3);
  const js = (await transformWithOxc(`${body}\nreturn eventArt;`, 'art.ts')).code;
  let release!: () => void;
  const decoded = new Promise<void>((r) => { release = r; });
  const asked: string[] = [];
  const eventArt = new Function('el', 'artUrl', 'eventArtKey', 'eventArtCast', 'eventArtReady', 'whenEventArtDecoded', js)(
    (_t: string, attrs: Record<string, string>) => ({ src: attrs['src'], dataset: { artCast: attrs['data-art-cast'] } }),
    (_g: string, key: string) => `/${key}.webp`,
    (id: string) => `bg/event_${id}`,
    (key: string) => (key.endsWith('_r0') ? ['r0'] : ['main']),
    (_run: unknown, url: string) => ready.has(url),
    (_run: unknown, url: string) => { asked.push(url); return decoded; },
  ) as (id: string, hero?: string, fb?: { run: unknown; id: string }) => { src: string; dataset: { artCast: string } };
  return { eventArt, release, asked };
}

describe('結果圖等滿 6 秒還沒到：先用主圖頂著，不露空白', () => {
  it('結果圖已經解好：直接畫結果圖', async () => {
    const h = await artHarness(new Set(['/bg/event_rescue_r0.webp']));
    const img = h.eventArt('rescue_r0', undefined, { run: {}, id: 'rescue' });
    expect(img.src).toBe('/bg/event_rescue_r0.webp');
    expect(h.asked).toEqual([]);
  });

  it('還沒解好：先畫主圖（插圖裡畫了誰也照主圖標），解好才換成結果圖', async () => {
    const ready = new Set<string>();
    const h = await artHarness(ready);
    const img = h.eventArt('rescue_r0', undefined, { run: {}, id: 'rescue' });
    expect(img.src).toBe('/bg/event_rescue.webp');
    expect(img.dataset.artCast).toBe('main');
    expect(h.asked).toEqual(['/bg/event_rescue_r0.webp']);
    ready.add('/bg/event_rescue_r0.webp');
    h.release(); await flush();
    expect(img.src).toBe('/bg/event_rescue_r0.webp');
    expect(img.dataset.artCast).toBe('r0');
  });

  it('怎麼抓都抓不到：一直用主圖，不換成破圖', async () => {
    const h = await artHarness(new Set());
    const img = h.eventArt('rescue_r0', undefined, { run: {}, id: 'rescue' });
    h.release(); await flush();
    expect(img.src).toBe('/bg/event_rescue.webp');
  });

  it('沒給頂替（事件開頭那張主圖）：照舊直接畫', async () => {
    const h = await artHarness(new Set());
    expect(h.eventArt('rescue').src).toBe('/bg/event_rescue.webp');
    expect(h.asked).toEqual([]);
  });

  it('解好了沒：看這張地圖那一組、也認整頁共用那一組', async () => {
    const run = newRun('result-ready', 1);
    const url = eventResultUrls(run, 'rescue')[0]!;
    const { eventArtReady, whenEventArtDecoded } = await import('../../src/ui/preload');
    expect(eventArtReady(run, url)).toBe(false);
    fakeImages();
    await whenEventArtDecoded(run, url);
    expect(eventArtReady(run, url)).toBe(true);
  });

  it('結果畫面有結果圖時才帶頂替', () => {
    expect(EVENT).toContain('eventArt(art ?? ev.id, artHero, art ? { run, id: ev.id } : undefined)');
  });
});

/*
 * 推前審查 高-1（2026-09-23）：**效果當場套、只有畫面等圖**。
 * 原本連線時連 `take()` 都等圖才跑：圖先到的那台先套效果，同伴在換忍具視窗送出的 swap 到了慢的那台，
 * 那一格還不存在——加入方整局停掉、主機悄悄丟掉。`paint`／`holdPaintForResultArt` 同樣切出來跑。
 */
async function paintHarness(warm: Promise<void>) {
  const wait = inner('  function whenResultArtReady(index: number, go: () => void): void {');
  const a = EVENT.indexOf('  let heldPaint:');
  const hold = EVENT.slice(a, EVENT.indexOf('\n  }\n', EVENT.indexOf('  function holdPaintForResultArt(', a)) + 4);
  const js = (await transformWithOxc(`let resolving = false;\n${wait}\n${hold}\nreturn { paint, holdPaintForResultArt };`, 'paint.ts')).code;
  const run = { id: 'run' };
  const app = { run: run as unknown, stage: { classList: { add() {}, remove() {} } } };
  const ev = { id: 'toll', choices: [{ resultArt: 'toll_r0' }, { resultArt: undefined }] };
  return {
    app,
    api: new Function('app', 'run', 'ev', 'root', 'el', 'warmResultArt', 'window', js)(
      app, run, ev, { querySelector: () => null }, () => ({}), () => warm,
      { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t) },
    ) as { paint(fn: () => void): void; holdPaintForResultArt(i: number): void },
  };
}

describe('效果當場套、只有畫面等圖（推前審查 高-1）', () => {
  it('有結果圖：扣住的期間要畫的只記最後一筆，圖到了畫那一筆、只畫一次；之後直接畫', async () => {
    let release!: () => void;
    const h = await paintHarness(new Promise<void>((r) => { release = r; }));
    const drawn: string[] = [];
    h.api.holdPaintForResultArt(0);
    h.api.paint(() => drawn.push('第一次結果'));
    h.api.paint(() => drawn.push('同伴挑完之後的重畫'));
    expect(drawn).toEqual([]);
    release(); await flush();
    expect(drawn).toEqual(['同伴挑完之後的重畫']);
    h.api.paint(() => drawn.push('之後'));
    expect(drawn.at(-1)).toBe('之後');
  });

  it('沒有結果圖的選項：不扣，直接畫', async () => {
    const h = await paintHarness(new Promise<void>(() => undefined));
    const drawn: string[] = [];
    h.api.holdPaintForResultArt(1);
    h.api.paint(() => drawn.push('結果'));
    expect(drawn).toEqual(['結果']);
  });

  it('等的時候這一局丟了：不畫', async () => {
    let release!: () => void;
    const h = await paintHarness(new Promise<void>((r) => { release = r; }));
    const drawn: string[] = [];
    h.api.holdPaintForResultArt(0);
    h.api.paint(() => drawn.push('結果'));
    h.app.run = null;
    release(); await flush();
    expect(drawn).toEqual([]);
  });

  it('接線：單人點選項、連線票結算都當場 `take()`；`take()` 先套效果、再扣畫面；結果畫面走 `paint`', () => {
    expect(EVENT).toContain('      take(index);   // 效果當場套');
    expect(EVENT).toContain('      take(chosen);\n    });');
    expect(EVENT).not.toContain('whenResultArtReady(index, () => take(index))');
    expect(EVENT).not.toContain('() => take(pickIndex)');
    const take = EVENT.slice(EVENT.indexOf('  function take(index: number): void {'));
    const effects = take.indexOf('outcomes[i] = applyRunEffects(');
    const hold = take.indexOf('holdPaintForResultArt(index);');
    expect(effects).toBeGreaterThan(0);
    expect(hold, '先套效果、再扣畫面').toBeGreaterThan(effects);
    expect(take).toContain('const showResult = (): void => { paint(() => settle(');
  });
});

describe('接線', () => {
  it('進畫面就先抓；選項的點擊一進來先看是不是還在等', () => {
    expect(EVENT).toContain('void preloadEventResults(run, ev.id);');
    const click = EVENT.slice(EVENT.indexOf("else btn.addEventListener('click', () => {"));
    expect(click.slice(0, 200)).toContain('if (resolving) return;');
  });
});
