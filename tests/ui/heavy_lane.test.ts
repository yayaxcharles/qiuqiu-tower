import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MAIN_RAW from '../../src/main.ts?raw';
import FRAME_RAW from '../../src/ui/frame-motion.ts?raw';
import ENEMY_RAW from '../../src/ui/enemy-motion.ts?raw';
import { _heavyLaneStateForTest, _resetHeavyLaneForTest, armHeavyLane, holdHeavyLane, loadHeavy } from '../../src/ui/heavy-lane';
import { createFrameMotionSet } from '../../src/ui/frame-motion';
import { _setNetSpeedForTest } from '../../src/ui/netspeed';

/*
 * 大檔讓路（2026-09-23，`src/ui/heavy-lane.ts`）。
 *
 * 慢網路實測：逐格動作的大圖集在開新局那一刻全部同時開抓，本機預覽的 6 條連線全被佔住，
 * 之後要的小圖（事件主圖、結果圖、牌面）排了約 12 秒。改成同時最多兩張、開場那一批小圖抓完才開始。
 */
const MAIN = MAIN_RAW.replace(/\r\n/g, '\n');

type Img = { src: string; fetchPriority?: string; complete: boolean; naturalWidth: number;
  listeners: Record<string, (() => void)[]>; addEventListener(t: string, fn: () => void): void };
/** 跟瀏覽器一樣：還沒設網址的 <img> 的 `complete` 是真的、寬是 0（拿去驗會被當成壞圖） */
function fakeImage(): Img {
  let done = false;
  const img = {
    src: '', naturalWidth: 0, listeners: {} as Img['listeners'],
    get complete(): boolean { return img.src === '' || done; },
    set complete(v: boolean) { done = v; },
    addEventListener(t: string, fn: () => void) { (img.listeners[t] ??= []).push(fn); },
  };
  return img as Img;
}
const finish = (img: Img, ok = true): void => {
  img.complete = true; img.naturalWidth = ok ? 100 : 0;
  for (const fn of img.listeners[ok ? 'load' : 'error'] ?? []) fn();
};
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const load = (img: Img, url: string, urgent = false): Promise<void> => loadHeavy(img as unknown as HTMLImageElement, url, urgent);

beforeEach(() => { _resetHeavyLaneForTest(); });
afterEach(() => { _resetHeavyLaneForTest(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('大檔那一條', () => {
  it('沒設（測試、動作試玩頁）：跟原本一樣，網址當場設好、全部一起抓', () => {
    const imgs = [fakeImage(), fakeImage(), fakeImage()];
    imgs.forEach((img, i) => { void load(img, `/a${i}.webp`); });
    expect(imgs.map((i) => i.src)).toEqual(['/a0.webp', '/a1.webp', '/a2.webp']);
  });

  it('設成 2：同時只有兩張在抓、優先權低；一張載完（或失敗）下一張才開始', async () => {
    armHeavyLane(2);
    const imgs = [fakeImage(), fakeImage(), fakeImage(), fakeImage()];
    const done = imgs.map((img, i) => load(img, `/a${i}.webp`));
    expect(imgs.map((i) => i.src)).toEqual(['/a0.webp', '/a1.webp', '', '']);
    expect(imgs[0]!.fetchPriority).toBe('low');
    finish(imgs[0]!);
    await done[0];
    expect(imgs[2]!.src).toBe('/a2.webp');
    expect(imgs[3]!.src).toBe('');
    finish(imgs[1]!, false);   // 失敗也要讓出位子
    expect(imgs[3]!.src).toBe('/a3.webp');
    expect(_heavyLaneStateForTest().active).toBe(2);
  });

  it('掛著（開場那一批還沒抓完）：一張都不開始；放行才照上限開始；叫第二次沒作用', () => {
    armHeavyLane(2);
    const release = holdHeavyLane();
    const imgs = [fakeImage(), fakeImage(), fakeImage()];
    imgs.forEach((img, i) => { void load(img, `/a${i}.webp`); });
    expect(imgs.map((i) => i.src)).toEqual(['', '', '']);
    release();
    release();
    expect(imgs.map((i) => i.src)).toEqual(['/a0.webp', '/a1.webp', '']);
    expect(_heavyLaneStateForTest().holds).toBe(0);
  });

  it('保險：掛著最多 90 秒，時間到自己放行（開場那一批有哪張一直不結束時，大圖集也不能永遠不抓）', () => {
    vi.useFakeTimers();
    armHeavyLane(2);
    holdHeavyLane();
    const img = fakeImage();
    void load(img, '/a.webp');
    vi.advanceTimersByTime(89_999);
    expect(img.src).toBe('');
    vi.advanceTimersByTime(1);
    expect(img.src).toBe('/a.webp');
  });

  it('卡住的一張最多佔位 90 秒，時間到讓出位子（那張照樣繼續下載）', () => {
    vi.useFakeTimers();
    armHeavyLane(1);
    const [a, b] = [fakeImage(), fakeImage()];
    void load(a, '/a.webp'); void load(b, '/b.webp');
    expect(b.src).toBe('');
    vi.advanceTimersByTime(90_000);
    expect(b.src).toBe('/b.webp');
  });

  it('正要畫的插隊；同一張叫兩次不重排、共用同一個結果', async () => {
    armHeavyLane(1);
    const [a, b, c] = [fakeImage(), fakeImage(), fakeImage()];
    void load(a, '/a.webp'); void load(b, '/b.webp');
    const first = load(c, '/c.webp');
    const again = load(c, '/c.webp', true);   // 戰鬥裡第一次播到它
    expect(_heavyLaneStateForTest().waiting).toEqual(['/c.webp', '/b.webp']);
    finish(a);
    expect(c.src).toBe('/c.webp');
    expect(b.src).toBe('');
    finish(c);
    await flush();
    let both = 0;
    void first.then(() => { both += 1; }); void again.then(() => { both += 1; });
    await flush();
    expect(both).toBe(2);
  });
});

describe('逐格動作走這一條', () => {
  const frame = { rect: [0, 0, 100, 100], pivot: [50, 100], duration: 0.1 };
  function motionSet() {
    return createFrameMotionSet<'idle' | 'claw' | 'kick' | 'puff'>({
      motions: {
        idle: { texture: 'assets/motion/t/idle.webp', scale: 1, loop: true, frames: [frame] },
        claw: { texture: 'assets/motion/t/claw.webp', scale: 1, loop: false, frames: [frame] },
        kick: { texture: 'assets/motion/t/kick.webp', scale: 1, loop: false, frames: [frame] },
        puff: { texture: 'assets/motion/t/puff.webp', scale: 1, loop: false, frames: [frame] },
      },
      deferred: new Set(['puff']),
      nativeHeight: 100, initialAction: 'idle', className: 'test-motion', ariaLabel: '測試',
      resolve: (action: string, elapsed: number) => ({ key: action, elapsed }),
      duration: () => 100,
    } as unknown as Parameters<typeof createFrameMotionSet<'idle' | 'claw' | 'kick' | 'puff'>>[0]);
  }

  it('預載：同時只抓上限那幾張，照資料的順序（待機先）；全部載好才算好；延後的那張排最後', async () => {
    const made: Img[] = [];
    vi.stubGlobal('Image', class { constructor() { const i = fakeImage(); made.push(i); return i as unknown as object; } });
    armHeavyLane(1);
    const set = motionSet();
    let ready = false;
    void set.preload().then(() => { ready = true; });
    await flush();
    const src = (): string[] => made.map((i) => i.src.replace(/^.*\//, ''));
    expect(src().filter(Boolean)).toEqual(['idle.webp']);
    finish(made.find((i) => i.src.endsWith('idle.webp'))!); await flush();
    expect(src().filter(Boolean)).toEqual(['idle.webp', 'claw.webp']);
    expect(ready).toBe(false);
    finish(made.find((i) => i.src.endsWith('claw.webp'))!); await flush();
    finish(made.find((i) => i.src.endsWith('kick.webp'))!); await flush();
    expect(ready, '主要動作都載好才算好').toBe(true);
    expect(set.ready()).toBe(true);
    // 延後的那張在主要動作之後才開始抓
    expect(src().at(-1)).toBe('puff.webp');
    expect(set.drawable('puff')).toBe(false);
    finish(made.find((i) => i.src.endsWith('puff.webp'))!); await flush();
    expect(set.drawable('puff')).toBe(true);
  });

  it('掛著的時候預載就等著，不會把還沒排到的圖當成壞圖', async () => {
    const made: Img[] = [];
    vi.stubGlobal('Image', class { constructor() { const i = fakeImage(); made.push(i); return i as unknown as object; } });
    armHeavyLane(2);
    const release = holdHeavyLane();
    const set = motionSet();
    let outcome = '';
    void set.preload().then(() => { outcome = 'ok'; }, () => { outcome = 'fail'; });
    await flush();
    expect(made.every((i) => i.src === '')).toBe(true);
    expect(outcome, '還在排隊不是壞圖').toBe('');
    release();
    for (const name of ['idle', 'claw', 'kick']) {
      await flush();
      const img = made.find((i) => i.src.endsWith(`${name}.webp`));
      if (img) finish(img);
      await flush();
      for (const i of made) if (i.src && !i.complete && !i.src.endsWith('puff.webp')) finish(i);
    }
    await flush();
    expect(outcome).toBe('ok');
  });
});

describe('小圖先到', () => {
  afterEach(() => { _setNetSpeedForTest('fast'); });

  it.each([['slow', true], ['fast', false]] as const)('網路 %s：這一位的靜態圖抓完才開始抓逐格動作？%s（快網路照原本一起抓）', async (speed, waits) => {
    // 每一種都要全新的模組：動作那一組預載過一次就記著「好了」，第二次不會再發請求
    vi.resetModules();
    (await import('../../src/ui/netspeed'))._setNetSpeedForTest(speed);
    const sources: string[] = [];
    let releaseArt!: () => void;
    const artDone = new Promise<void>((r) => { releaseArt = r; });
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('Image', class {
      value = '';
      set src(v: string) { this.value = v; sources.push(v); }
      get src(): string { return this.value; }
      decode(): Promise<void> { return artDone; }   // 靜態圖（`decodeAll` 走 decode）卡著
      addEventListener(type: string, fn: () => void): void { if (type === 'load') queueMicrotask(fn); }
    });
    const { _setManifestForTest } = await import('../../src/ui/assets');
    _setManifestForTest({ cards: {}, monsters: {}, icons: {}, bg: {}, review: [],
      sprites: { 'hero/feifei_idle': 'assets/sprites/hero/feifei_idle.webp' } });
    const { preloadHeroArt } = await import('../../src/ui/preload');
    await import('../../src/ui/companion-motion');   // 先載進來：底下那段 `import()` 才會馬上好，等得到「動作有沒有搶先開抓」
    const all = preloadHeroArt(['feifei']);
    for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 20)); await flush(); }
    if (waits) expect(sources).toEqual(['/assets/sprites/hero/feifei_idle.webp']);
    else expect(sources.some((s) => s.includes('/motion/feifei/')), '快網路：靜態圖還沒好，動作也已經在抓').toBe(true);
    releaseArt();
    await all;
    expect(sources.some((s) => s.includes('/motion/feifei/')), '靜態圖好了才抓動作').toBe(true);
    _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] });
  });

  it('魔物的逐格動作也走這一條，而且插隊（這一場就要畫）', async () => {
    const made: Img[] = [];
    vi.stubGlobal('Image', class { constructor() { const i = fakeImage(); made.push(i); return i as unknown as object; } });
    // 魔物動作那支跟這裡要拿同一份大檔那一條（上一條測試換過一輪模組）
    vi.resetModules();
    const lane = await import('../../src/ui/heavy-lane');
    lane.armHeavyLane(1);
    void lane.loadHeavy(fakeImage() as unknown as HTMLImageElement, '/busy.webp');
    void lane.loadHeavy(fakeImage() as unknown as HTMLImageElement, '/queued.webp');
    const { preloadEnemyMotion } = await import('../../src/ui/enemy-motion');
    void preloadEnemyMotion(['rat']);
    await flush();
    const waiting = lane._heavyLaneStateForTest().waiting;
    expect(waiting.length).toBeGreaterThan(1);
    expect(waiting[0], '魔物那幾張排在前面').toContain('/motion/');
    expect(waiting.at(-1)).toBe('/queued.webp');
    expect(made.every((i) => i.src === ''), '上限佔滿時不開抓').toBe(true);
  });
});

describe('接線', () => {
  it('主程式開機的量速度、讓路、音樂延後：行為在 `netspeed_0923.test.ts`；這裡只確認動作試玩頁不掛（那一頁只看動作）', () => {
    expect(MAIN.indexOf('probeNetSpeed()')).toBeGreaterThan(MAIN.indexOf("has('motion-preview')"));
    expect(MAIN.indexOf('holdHeavyLane()')).toBeGreaterThan(MAIN.indexOf("has('motion-preview')"));
  });

  it('逐格動作畫到還沒抓的那張時插隊；圖集的網址一律交給這一條設，不自己設', () => {
    const fm = FRAME_RAW.replace(/\r\n/g, '\n');
    expect(fm).toContain('const image = imageFor(motion, true);');
    expect(fm).not.toMatch(/image\.src = /);
    const em = ENEMY_RAW.replace(/\r\n/g, '\n');
    expect(em).toContain('void loadHeavy(image, fileUrl(texture), true);');
    expect(em).not.toMatch(/image\.src = /);
  });
});
