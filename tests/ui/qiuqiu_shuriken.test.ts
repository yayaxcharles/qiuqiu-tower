import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  playQiuqiuShuriken,
  preloadQiuqiuShuriken,
} from '../../src/ui/qiuqiu-shuriken';

type DrawCall = [CanvasImageSource, number, number, number, number, number, number, number, number];

class FakeContext {
  draws: DrawCall[] = [];
  drawImage(...args: DrawCall): void { this.draws.push(args); }
}

class FakeCanvas {
  width = 0;
  height = 0;
  style: Record<string, string> = {};
  readonly context = new FakeContext();
  parent: FakeStage | null = null;

  getContext(kind: string): FakeContext | null { return kind === '2d' ? this.context : null; }
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
}

class FakeStage {
  children: FakeCanvas[] = [];
  appendChild(canvas: FakeCanvas): FakeCanvas {
    canvas.parent = this;
    this.children.push(canvas);
    return canvas;
  }
}

class FakeImage {
  static sources: string[] = [];
  src = '';
  async decode(): Promise<void> { FakeImage.sources.push(this.src); }
}

let clock = 0;
let nextRaf = 1;
let rafs = new Map<number, FrameRequestCallback>();
let cancelled: number[] = [];
let canvases: FakeCanvas[] = [];

function step(time: number): void {
  clock = time;
  const pending = [...rafs.values()];
  rafs.clear();
  for (const callback of pending) callback(time);
}

function stage(): FakeStage {
  return new FakeStage();
}

beforeEach(() => {
  clock = 0;
  nextRaf = 1;
  rafs = new Map();
  cancelled = [];
  canvases = [];
  FakeImage.sources = [];
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`);
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas;
    },
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextRaf++;
    rafs.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelled.push(id);
    rafs.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('qiuqiu shuriken flight', () => {
  it('preloads and caches the cropped shuriken image', async () => {
    await preloadQiuqiuShuriken();
    await preloadQiuqiuShuriken();

    expect(FakeImage.sources).toEqual(['/assets/motion/qiuqiu/shuriken.webp']);
  });

  it('uses storm choreography timings without adding damage waves', async () => {
    await preloadQiuqiuShuriken();
    const target = stage();
    const impact = vi.fn();
    const done = vi.fn();
    playQiuqiuShuriken(target as unknown as HTMLElement, { x: 100, y: 200 }, { x: 900, y: 200 },
      { waves: 2, impactTimes: [470, 730], onImpact: impact, onDone: done });
    step(299);
    expect(target.children).toHaveLength(0);
    step(300);
    expect(target.children).toHaveLength(1);
    step(469);
    expect(impact).not.toHaveBeenCalled();
    step(470);
    expect(impact.mock.calls).toEqual([[0]]);
    step(560);
    expect(target.children).toHaveLength(1);
    step(730);
    expect(impact.mock.calls).toEqual([[0], [1]]);
    expect(done).toHaveBeenCalledTimes(1);
    expect(target.children).toHaveLength(0);
  });

  it('releases and impacts both waves at the specified times', async () => {
    await preloadQiuqiuShuriken();
    const target = stage();
    const impacts: number[] = [];
    const done = vi.fn();

    playQiuqiuShuriken(
      target as unknown as HTMLElement,
      { x: 100, y: 200 },
      { x: 900, y: 400 },
      { waves: 2, onImpact: (wave) => impacts.push(wave), onDone: done },
    );

    expect(target.children).toHaveLength(0);
    step(179);
    expect(target.children).toHaveLength(0);
    step(180);
    expect(target.children).toHaveLength(1);
    expect(target.children[0]?.context.draws[0]?.slice(1)).toEqual([137, 112, 979, 1001, 0, 0, 40, 41]);
    expect(target.children[0]?.style['pointerEvents']).toBe('none');
    expect(target.children[0]?.style['zIndex']).toBe('20');
    expect(target.children[0]?.style['transform']).toContain('translate(80px, 179.5px)');
    step(319);
    expect(target.children).toHaveLength(1);
    step(320);
    expect(target.children).toHaveLength(2);
    step(349);
    expect(impacts).toEqual([]);
    step(350);
    expect(impacts).toEqual([0]);
    expect(target.children).toHaveLength(1);
    step(489);
    expect(impacts).toEqual([0]);
    step(490);
    expect(impacts).toEqual([0, 1]);
    expect(target.children).toHaveLength(0);
    expect(done).toHaveBeenCalledTimes(1);
    expect(rafs).toHaveLength(0);
  });

  it('catches up expired impacts on the next frame without drawing or repeating them', async () => {
    await preloadQiuqiuShuriken();
    const target = stage();
    const impacts: number[] = [];
    const done = vi.fn();

    playQiuqiuShuriken(
      target as unknown as HTMLElement,
      { x: 100, y: 200 },
      { x: 900, y: 400 },
      { waves: 2, elapsed: 600, onImpact: (wave) => impacts.push(wave), onDone: done },
    );

    expect(impacts).toEqual([]);
    expect(done).not.toHaveBeenCalled();
    step(0);
    expect(impacts).toEqual([0, 1]);
    expect(done).toHaveBeenCalledTimes(1);
    expect(target.children).toHaveLength(0);
    expect(canvases).toHaveLength(0);
    step(1000);
    expect(impacts).toEqual([0, 1]);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('dispose removes canvases and prevents all later callbacks', async () => {
    await preloadQiuqiuShuriken();
    const target = stage();
    const impact = vi.fn();
    const done = vi.fn();
    const dispose = playQiuqiuShuriken(
      target as unknown as HTMLElement,
      { x: 100, y: 200 },
      { x: 900, y: 400 },
      { waves: 2, onImpact: impact, onDone: done },
    );

    step(180);
    expect(target.children).toHaveLength(1);
    dispose();
    dispose();
    expect(target.children).toHaveLength(0);
    expect(cancelled).toHaveLength(1);
    expect(rafs).toHaveLength(0);
    step(1000);
    expect(impact).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
  });

  it('keeps simultaneous throws independent when one is disposed', async () => {
    await preloadQiuqiuShuriken();
    const firstStage = stage();
    const secondStage = stage();
    const firstImpact = vi.fn();
    const firstDone = vi.fn();
    const secondImpact = vi.fn();
    const secondDone = vi.fn();
    const disposeFirst = playQiuqiuShuriken(
      firstStage as unknown as HTMLElement,
      { x: 100, y: 200 },
      { x: 900, y: 400 },
      { waves: 1, onImpact: firstImpact, onDone: firstDone },
    );
    playQiuqiuShuriken(
      secondStage as unknown as HTMLElement,
      { x: 200, y: 300 },
      { x: 800, y: 350 },
      { waves: 1, onImpact: secondImpact, onDone: secondDone },
    );

    step(180);
    expect(firstStage.children).toHaveLength(1);
    expect(secondStage.children).toHaveLength(1);
    disposeFirst();
    expect(firstStage.children).toHaveLength(0);
    expect(secondStage.children).toHaveLength(1);
    expect(rafs).toHaveLength(1);
    step(350);
    expect(firstImpact).not.toHaveBeenCalled();
    expect(firstDone).not.toHaveBeenCalled();
    expect(secondImpact).toHaveBeenCalledWith(0);
    expect(secondDone).toHaveBeenCalledTimes(1);
  });

  it.each([273, 350])('升級風暴在飛行前或飛行中接下一張牌仍完成兩波，接牌=%i 毫秒', async (nextAt) => {
    await preloadQiuqiuShuriken();
    const target = stage();
    const stormImpact = vi.fn();
    const nextImpact = vi.fn();
    playQiuqiuShuriken(target as unknown as HTMLElement, { x: 100, y: 200 }, { x: 900, y: 200 }, {
      waves: 2,
      impactTimes: [470, 730],
      onImpact: stormImpact,
      onDone: vi.fn(),
    });
    step(nextAt);
    playQiuqiuShuriken(target as unknown as HTMLElement, { x: 120, y: 210 }, { x: 820, y: 210 }, {
      waves: 1,
      impactTimes: [400],
      onImpact: nextImpact,
      onDone: vi.fn(),
    });
    step(Math.max(300, nextAt + 1));
    expect(target.children.length).toBeGreaterThan(0);
    step(470);
    expect(stormImpact).toHaveBeenCalledWith(0);
    step(730);
    expect(stormImpact.mock.calls).toEqual([[0], [1]]);
    step(nextAt + 400);
    expect(nextImpact).toHaveBeenCalledOnce();
  });

});
