import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetDecodedAtlasForTest, decodedAtlas, prepareDecodedAtlas } from '../../src/ui/decoded-atlas';
import { createFrameMotionSet } from '../../src/ui/frame-motion';

vi.mock('../../src/ui/assets', () => ({ fileUrl: (path: string) => path }));

/*
 * 動作圖集在背景解開成點陣圖（2026-09-21 實機追蹤：每張圖集第一次畫到畫布時，
 * 主執行緒同步解碼 12～18 毫秒，是出牌卡頓的主因；解碼快取只放得下四五張）。
 */

class FakeBitmap {
  closed = false;
  constructor(readonly width: number, readonly height: number) {}
  close(): void { this.closed = true; }
}

let serial = 0;
function fakeImage(width = 100, height = 50, complete = true): HTMLImageElement {
  return { src: `img-${++serial}`, complete, naturalWidth: complete ? width : 0, naturalHeight: height, width, height } as unknown as HTMLImageElement;
}

const flush = () => new Promise<void>((done) => setTimeout(done, 0));
let concurrent = 0;
let maxConcurrent = 0;
const fetched: string[] = [];

beforeEach(() => {
  _resetDecodedAtlasForTest();
  concurrent = 0;
  maxConcurrent = 0;
  fetched.length = 0;
  // 從圖檔資料解（blob），不是從 <img> 解：後者在 Chrome 是主執行緒同步解碼（實機追蹤 2026-09-21）
  vi.stubGlobal('fetch', (src: string) => {
    fetched.push(src);
    return Promise.resolve({ ok: true, blob: () => Promise.resolve({ width: 100, height: 50 }) });
  });
  vi.stubGlobal('createImageBitmap', async (blob: { width: number; height: number }) => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await flush();
    concurrent--;
    return new FakeBitmap(blob.width, blob.height);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('動作圖集的已解開快取', () => {
  it('解好之後拿得到點陣圖；沒載好、載入失敗的不解', async () => {
    const good = fakeImage();
    const loading = fakeImage(100, 50, false);
    const broken = { complete: true, naturalWidth: 0 } as unknown as HTMLImageElement;
    await Promise.all([prepareDecodedAtlas(good), prepareDecodedAtlas(loading), prepareDecodedAtlas(broken)]);
    expect(decodedAtlas(good)).toBeInstanceOf(FakeBitmap);
    expect(decodedAtlas(loading)).toBeUndefined();
    expect(decodedAtlas(broken)).toBeUndefined();
  });

  it('瀏覽器沒有 createImageBitmap 就什麼也不做，呼叫端照舊畫 <img>', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const image = fakeImage();
    await prepareDecodedAtlas(image);
    expect(decodedAtlas(image)).toBeUndefined();
  });

  it('都畫過時，超過上限放最久沒畫的；正要畫而排的那張當作剛用過', async () => {
    _resetDecodedAtlasForTest(2 * 100 * 50 * 4);   // 只放得下兩張
    const [a, b, c] = [fakeImage(), fakeImage(), fakeImage()];
    await prepareDecodedAtlas(a);
    await prepareDecodedAtlas(b);
    const bitmapA = decodedAtlas(a) as unknown as FakeBitmap;
    const bitmapB = decodedAtlas(b) as unknown as FakeBitmap;
    decodedAtlas(a);                     // 最久沒畫的變成 b
    await prepareDecodedAtlas(c, true);  // 畫 c 時發現沒解好才排的
    expect(decodedAtlas(b)).toBeUndefined();
    expect(bitmapB.closed).toBe(true);
    expect(decodedAtlas(a)).toBe(bitmapA as unknown as ImageBitmap);
    expect(bitmapA.closed).toBe(false);
    expect(decodedAtlas(c)).toBeInstanceOf(FakeBitmap);
  });

  it('預先解好還沒畫過的：後排進來的先放，保住排在前面的常用圖（4 GB 裝置連線實測）', async () => {
    _resetDecodedAtlasForTest(2 * 100 * 50 * 4);
    const [idle, claw, rare] = [fakeImage(), fakeImage(), fakeImage()];
    for (const image of [idle, claw, rare]) void prepareDecodedAtlas(image);
    await prepareDecodedAtlas(rare);
    expect(decodedAtlas(idle)).toBeInstanceOf(FakeBitmap);
    expect(decodedAtlas(claw)).toBeInstanceOf(FakeBitmap);
    expect(decodedAtlas(rare)).toBeUndefined();
  });

  it('從圖檔網址重新讀資料來解，而且一次只解一張', async () => {
    const images = [fakeImage(), fakeImage(), fakeImage()];
    await Promise.all(images.map((image) => prepareDecodedAtlas(image)));
    expect(fetched).toEqual(images.map((image) => image.src));
    expect(maxConcurrent).toBe(1);
    for (const image of images) expect(decodedAtlas(image)).toBeInstanceOf(FakeBitmap);
  });

  it('換角色開第二局：新角色預先解好的圖，比上一局沒再畫的舊圖優先保留', async () => {
    _resetDecodedAtlasForTest(3 * 100 * 50 * 4);
    const [oldIdle, oldClaw, newIdle, newClaw] = [fakeImage(), fakeImage(), fakeImage(), fakeImage()];
    await Promise.all([prepareDecodedAtlas(oldIdle), prepareDecodedAtlas(oldClaw)]);
    decodedAtlas(oldIdle);
    decodedAtlas(oldClaw);   // 上一局畫過，之後就沒再用
    await Promise.all([prepareDecodedAtlas(newIdle), prepareDecodedAtlas(newClaw)]);
    expect(decodedAtlas(oldIdle)).toBeUndefined();
    expect(decodedAtlas(newIdle)).toBeInstanceOf(FakeBitmap);
    expect(decodedAtlas(newClaw)).toBeInstanceOf(FakeBitmap);
  });

  it('正要畫的插隊到最前面；失敗過的不再重試', async () => {
    const [first, second, urgent, bad] = [fakeImage(), fakeImage(), fakeImage(), fakeImage()];
    void prepareDecodedAtlas(first);
    void prepareDecodedAtlas(second);
    await prepareDecodedAtlas(urgent, true);
    expect(fetched.slice(0, 2)).toEqual([first.src, urgent.src]);
    vi.stubGlobal('fetch', (src: string) => { fetched.push(src); return Promise.reject(new Error('offline')); });
    await prepareDecodedAtlas(bad);
    const tries = fetched.filter((src) => src === bad.src).length;
    await prepareDecodedAtlas(bad, true);
    expect(fetched.filter((src) => src === bad.src)).toHaveLength(tries);
  });

  it('讀檔失敗就不解、不丟例外，後面排隊的照解', async () => {
    const [bad, good] = [fakeImage(), fakeImage()];
    vi.stubGlobal('fetch', (src: string) => (src === bad.src
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({ ok: true, blob: () => Promise.resolve({ width: 100, height: 50 }) })));
    void prepareDecodedAtlas(bad);
    await prepareDecodedAtlas(good);
    expect(decodedAtlas(bad)).toBeUndefined();
    expect(decodedAtlas(good)).toBeInstanceOf(FakeBitmap);
  });
});

describe('逐格動作改畫背景解開的點陣圖', () => {
  class FakeCanvas {
    isConnected = true;
    width = 0;
    height = 0;
    style: Record<string, string> = {};
    draws: unknown[][] = [];
    setAttribute(): void {}
    getContext() {
      return { setTransform() {}, clearRect() {}, drawImage: (...args: unknown[]) => { this.draws.push(args); } };
    }
  }

  it('預載完後出手直接拿點陣圖畫，不再畫 <img>（那樣會在主執行緒當場解碼）', async () => {
    const images: HTMLImageElement[] = [];
    vi.stubGlobal('Image', class {
      src = ''; complete = true; naturalWidth = 400; naturalHeight = 200; width = 400; height = 200;
      constructor() { images.push(this as unknown as HTMLImageElement); }
      decode() { return Promise.resolve(); }
    });
    vi.stubGlobal('document', { createElement: () => new FakeCanvas() });
    vi.stubGlobal('window', { devicePixelRatio: 1, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
    const frame = { rect: [0, 0, 100, 100], pivot: [50, 100], duration: 0.1 };
    const set = createFrameMotionSet<'idle'>({
      motions: { idle: { texture: 'assets/motion/test/idle.webp', scale: 1, loop: true, frames: [frame] } },
      nativeHeight: 100,
      initialAction: 'idle',
      className: 'test-motion',
      ariaLabel: '測試',
      resolve: (action: 'idle', elapsed: number) => ({ key: action, elapsed }),
      duration: () => 100,
    } as unknown as Parameters<typeof createFrameMotionSet<'idle'>>[0]);
    await set.preload();
    for (let i = 0; i < 5; i++) await flush();   // 背景佇列：讀檔、解開
    const actor = set.createActor();
    const canvas = actor.element as unknown as FakeCanvas;
    expect(canvas.draws.at(-1)![0]).toBeInstanceOf(FakeBitmap);
    expect(images).toHaveLength(1);
    actor.dispose();
  });

  it('不解碼預載的狀態圖：下載好也排進背景解開', async () => {
    const images: Array<{ src: string; complete: boolean; listeners: Array<() => void> }> = [];
    vi.stubGlobal('Image', class {
      src = ''; complete = false; naturalWidth = 400; naturalHeight = 200; width = 400; height = 200;
      listeners: Array<() => void> = [];
      constructor() { images.push(this as unknown as (typeof images)[number]); }
      decode() { this.complete = true; return Promise.resolve(); }
      addEventListener(_type: string, listener: () => void) { this.listeners.push(listener); }
    });
    vi.stubGlobal('document', { createElement: () => new FakeCanvas() });
    vi.stubGlobal('window', { devicePixelRatio: 1, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
    const frame = { rect: [0, 0, 100, 100], pivot: [50, 100], duration: 0.1 };
    const set = createFrameMotionSet<'idle' | 'puff'>({
      motions: {
        idle: { texture: 'assets/motion/test/idle.webp', scale: 1, loop: true, frames: [frame] },
        puff: { texture: 'assets/motion/test/puff.webp', scale: 1, loop: false, frames: [frame] },
      },
      deferred: new Set(['puff']),
      nativeHeight: 100,
      initialAction: 'idle',
      className: 'test-motion',
      ariaLabel: '測試',
      resolve: (action: 'idle' | 'puff', elapsed: number) => ({ key: action, elapsed }),
      duration: () => 100,
    } as unknown as Parameters<typeof createFrameMotionSet<'idle' | 'puff'>>[0]);
    await set.preload();
    const puff = images.find((image) => image.src.endsWith('puff.webp'))!;
    expect(puff.listeners).toHaveLength(1);
    puff.complete = true;
    for (const listener of puff.listeners) listener();
    for (let i = 0; i < 5; i++) await flush();
    expect(fetched).toContain('assets/motion/test/puff.webp');
    expect(decodedAtlas(puff as unknown as HTMLImageElement)).toBeInstanceOf(FakeBitmap);
  });
});
