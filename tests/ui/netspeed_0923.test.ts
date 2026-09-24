import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * 慢網路才讓路（2026-09-23 主控裁定）：一般寬頻照原本的做法（逐格動作不能比以前晚到），量到慢才讓大圖集與音樂讓路。
 * 量法：開場那一批一開抓就計時，2.5 秒內收到 1 MB 就是快（`src/ui/netspeed.ts`）。
 */

type Entry = { responseEnd: number; encodedBodySize: number; transferSize: number };
let observerCb: ((list: { getEntries(): Entry[] }) => void) | null = null;
let disconnected = 0;
class FakeObserver {
  constructor(cb: (list: { getEntries(): Entry[] }) => void) { observerCb = cb; }
  observe(): void {}
  disconnect(): void { disconnected += 1; }
}
const feed = (...entries: Entry[]): void => observerCb!({ getEntries: () => entries });
const kb = (n: number, at = 10): Entry => ({ responseEnd: at, encodedBodySize: n * 1000, transferSize: 0 });

describe('量速度', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    observerCb = null; disconnected = 0;
    vi.stubGlobal('PerformanceObserver', FakeObserver);
    vi.stubGlobal('performance', { now: () => 5 });
    vi.stubGlobal('navigator', {});
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('2.5 秒內收到 1 MB：快，當場就知道（不必等滿 2.5 秒）', async () => {
    const { probeNetSpeed, knownNetSpeed } = await import('../../src/ui/netspeed');
    const v = probeNetSpeed();
    expect(knownNetSpeed()).toBeNull();
    feed(kb(600), kb(300));
    expect(knownNetSpeed()).toBeNull();
    feed(kb(100));
    expect(knownNetSpeed()).toBe('fast');
    await expect(v).resolves.toBe('fast');
    expect(disconnected).toBe(1);
  });

  it('2.5 秒到了還不到 1 MB：慢（1.6 Mbps 在這段時間只收得到一半左右）', async () => {
    const { probeNetSpeed } = await import('../../src/ui/netspeed');
    let got = '';
    void probeNetSpeed().then((s) => { got = s; });
    feed(kb(500));
    await vi.advanceTimersByTimeAsync(2499);
    expect(got).toBe('');
    await vi.advanceTimersByTimeAsync(1);
    expect(got).toBe('slow');
  });

  it('開機前就收完的（程式本身）不算；快取裡的（傳輸 0、內容有大小）算', async () => {
    const { probeNetSpeed, knownNetSpeed } = await import('../../src/ui/netspeed');
    void probeNetSpeed();
    feed({ responseEnd: 1, encodedBodySize: 5_000_000, transferSize: 5_000_000 });
    expect(knownNetSpeed()).toBeNull();
    feed({ responseEnd: 9, encodedBodySize: 1_200_000, transferSize: 0 });
    expect(knownNetSpeed()).toBe('fast');
  });

  it('瀏覽器說在省流量或是 3G：直接當慢；量不了：當快（照原本）', async () => {
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    let m = await import('../../src/ui/netspeed');
    await expect(m.probeNetSpeed()).resolves.toBe('slow');
    vi.resetModules();
    vi.stubGlobal('navigator', { connection: { effectiveType: '3g' } });
    m = await import('../../src/ui/netspeed');
    await expect(m.probeNetSpeed()).resolves.toBe('slow');
    vi.resetModules();
    vi.stubGlobal('navigator', { connection: { effectiveType: '4g' } });
    vi.stubGlobal('PerformanceObserver', undefined);
    m = await import('../../src/ui/netspeed');
    await expect(m.probeNetSpeed()).resolves.toBe('fast');
  });

  it('沒開始量（測試、動作試玩頁）：當快', async () => {
    const { netSpeed, knownNetSpeed } = await import('../../src/ui/netspeed');
    expect(knownNetSpeed()).toBe('fast');
    await expect(netSpeed()).resolves.toBe('fast');
  });
});

describe('背景音樂延後', () => {
  const made: string[] = [];
  beforeEach(() => {
    vi.resetModules();
    made.length = 0;
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal('window', {
      localStorage: { getItem: () => null, setItem: () => {} },
      addEventListener: (t: string, fn: () => void) => { listeners[t] = fn; },
      removeEventListener: () => {},
      setInterval: () => 1, clearInterval: () => {},
      __listeners: listeners,
    });
    vi.stubGlobal('Audio', class {
      loop = false; volume = 0; paused = true; src: string;
      constructor(src: string) { this.src = src; made.push(src); }
      play(): Promise<void> { this.paused = false; return Promise.resolve(); }
      pause(): void { this.paused = true; }
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('等的時候點了畫面、換了曲子都不放；等完放「現在該放的那一首」', async () => {
    const bgm = await import('../../src/ui/bgm');
    let release!: () => void;
    bgm.deferBgm(new Promise<void>((r) => { release = r; }));
    bgm.unlockBgmOnFirstGesture();
    bgm.setBgm('leisure');
    (window as unknown as { __listeners: Record<string, () => void> }).__listeners['pointerdown']!();
    bgm.setBgm('act1');
    expect(made).toEqual([]);
    release();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(made.map((s) => s.replace(/^.*\//, ''))).toEqual(['act1.mp3']);
  });

  it('沒叫 deferBgm（快網路）：照原本，一點下去就放', async () => {
    const bgm = await import('../../src/ui/bgm');
    bgm.unlockBgmOnFirstGesture();
    bgm.setBgm('leisure');
    (window as unknown as { __listeners: Record<string, () => void> }).__listeners['pointerdown']!();
    expect(made.map((s) => s.replace(/^.*\//, ''))).toEqual(['leisure.mp3']);
  });
});
