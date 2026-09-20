import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFrameMotionSet, frameMotionDuration, type FrameMotion } from '../../src/ui/frame-motion';

vi.mock('../../src/ui/assets', () => ({ fileUrl: (path: string) => path }));

let draws: Array<{ image: HTMLImageElement; args: number[] }>;
let clear: ReturnType<typeof vi.fn>;
let rafs: Map<number, FrameRequestCallback>;
let nextRaf: number;
let images: Array<{ src: string; complete: boolean }>;

function step(time: number): void {
  const pending = [...rafs.values()];
  rafs.clear();
  for (const callback of pending) callback(time);
}

beforeEach(() => {
  draws = [];
  images = [];
  clear = vi.fn();
  rafs = new Map();
  nextRaf = 1;
  vi.stubGlobal('window', {
    devicePixelRatio: 2,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const id = nextRaf++;
      rafs.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => rafs.delete(id),
  });
  vi.stubGlobal('Image', class {
    src = '';
    complete = true;
    constructor() { images.push(this); }
  });
  vi.stubGlobal('document', { createElement: () => ({
    style: {}, setAttribute: vi.fn(), getContext: () => ({
      setTransform: vi.fn(), clearRect: clear,
      drawImage: (image: HTMLImageElement, ...args: number[]) => draws.push({ image, args }),
    }),
  }) });
});

afterEach(() => vi.unstubAllGlobals());

function motionSet() {
  const frames = [
    { rect: [0, 0, 100, 200] as const, pivot: [50, 200] as const, duration: .1 },
    { rect: [100, 0, 110, 190] as const, pivot: [55, 190] as const, duration: .16 },
    { rect: [210, 0, 120, 210] as const, pivot: [60, 210] as const, duration: .24 },
  ];
  return createFrameMotionSet<'attack' | 'run' | 'other'>({
    motions: {
      attack: { texture: 'attack.webp', scale: 1, loop: false, frames },
      run: { texture: 'run.webp', scale: 1, loop: true, frames },
      other: { texture: 'other.webp', scale: .8, loop: false, frames },
    },
    nativeHeight: 200, initialAction: 'attack', className: 'test', ariaLabel: 'test',
    resolve: (action, elapsed) => ({ key: action, elapsed }), duration: () => 500,
  });
}

describe('逐格畫布只繪製有變化的畫面', () => {
  it('非循環招式保留每個時間點的畫格與腳底，52 次重畫降為 3 次', () => {
    const actor = motionSet().createActor();
    for (let elapsed = 0; elapsed <= 500; elapsed += 10) {
      step(elapsed);
      const expectedX = elapsed < 100 ? 0 : elapsed < 260 ? 100 : 210;
      const draw = draws.at(-1)!.args;
      expect(draw[0]).toBe(expectedX);
      expect(draw[5]! + draw[7]!).toBe(actor.foot.y);
    }
    expect(draws).toHaveLength(3);
    expect(clear).toHaveBeenCalledTimes(3);
    expect(rafs.size).toBe(0);
    actor.dispose();
  });

  it('循環邊界仍回到首格，持續一秒只繪製 7 個不同畫面', () => {
    const actor = motionSet().createActor({ action: 'run' });
    for (let elapsed = 0; elapsed <= 1000; elapsed += 10) {
      step(elapsed);
      const phase = elapsed % 500;
      expect(draws.at(-1)!.args[0]).toBe(phase < 100 ? 0 : phase < 260 ? 100 : 210);
    }
    expect(draws).toHaveLength(7);
    expect(clear).toHaveBeenCalledTimes(7);
    expect(rafs.size).toBe(1);
    actor.dispose();
    expect(rafs.size).toBe(0);
  });

  it('切換相同裁切區但不同材質與尺寸時會重畫，重播仍從首格開始', () => {
    const actor = motionSet().createActor();
    actor.play('other');
    expect(draws.at(-1)!.image.src).toBe('other.webp');
    expect(draws.at(-1)!.args[6]).toBe(80);
    step(1000);
    step(1110);
    expect(draws.at(-1)!.args[0]).toBe(100);
    actor.play('other');
    expect(draws.at(-1)!.args[0]).toBe(0);
    step(2000);
    step(2099);
    expect(draws.at(-1)!.args[0]).toBe(0);
    step(2100);
    expect(draws.at(-1)!.args[0]).toBe(100);
    actor.dispose();
  });

  it('未載入的影像不記成已繪製，同一影格載入後仍會出現', () => {
    const set = motionSet();
    const first = set.createActor();
    first.dispose();
    images[0]!.complete = false;
    draws.length = 0;
    const actor = set.createActor();
    step(0);
    expect(draws).toHaveLength(0);
    images[0]!.complete = true;
    step(10);
    expect(draws).toHaveLength(1);
    expect(draws[0]!.args[0]).toBe(0);
    actor.dispose();
  });

  it('釋放後即使既有回呼抵達或再要求播放也不重畫', () => {
    const actor = motionSet().createActor();
    const pending = [...rafs.values()];
    actor.dispose();
    actor.play('other');
    for (const callback of pending) callback(1000);
    expect(draws).toHaveLength(1);
    expect(rafs.size).toBe(0);
  });

  it('重複查詢唯讀動作時長不再遍歷每格時長', () => {
    const duration = vi.fn(() => .033333);
    const motion: FrameMotion = {
      texture: 'fractional.webp', scale: 1, loop: false,
      frames: Array.from({ length: 3 }, () => ({
        rect: [0, 0, 10, 10] as const, pivot: [5, 10] as const,
        get duration() { return duration(); },
      })),
    };
    expect(frameMotionDuration(motion)).toBe(100);
    const reads = duration.mock.calls.length;
    for (let index = 0; index < 60; index++) expect(frameMotionDuration(motion)).toBe(100);
    expect(duration).toHaveBeenCalledTimes(reads);
  });
});
