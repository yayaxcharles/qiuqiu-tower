import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQiuqiuActor, qiuqiuMotionDuration } from '../../src/ui/qiuqiu-motion';
import { companionMotionDuration, createCompanionMotionActor } from '../../src/ui/companion-motion';

vi.mock('../../src/ui/assets', () => ({ fileUrl: (path: string) => path }));

type DrawCall = [HTMLImageElement, number, number, number, number, number, number, number, number];
class FakeCanvas {
  isConnected = true;
  width = 0;
  height = 0;
  style: Record<string, string> = {};
  draws: DrawCall[] = [];
  setAttribute(): void {}
  getContext() {
    return {
      setTransform: vi.fn(), clearRect: vi.fn(),
      drawImage: (...args: DrawCall) => this.draws.push(args),
    };
  }
}

let rafs: Map<number, FrameRequestCallback>;
let nextRaf: number;
function step(time: number): void {
  const callbacks = [...rafs.values()];
  rafs.clear();
  for (const callback of callbacks) callback(time);
}
beforeEach(() => {
  rafs = new Map(); nextRaf = 1;
  vi.stubGlobal('Image', class { src = ''; complete = true; });
  vi.stubGlobal('document', { createElement: () => new FakeCanvas() });
  vi.stubGlobal('window', { devicePixelRatio: 2,
    requestAnimationFrame: (callback: FrameRequestCallback) => { const id = nextRaf++; rafs.set(id, callback); return id; },
    cancelAnimationFrame: (id: number) => rafs.delete(id),
  });
});
afterEach(() => vi.unstubAllGlobals());

// 舊圖實際尺寸與 alpha > 16 的可見上下界，不從動作資料反推期望值。
it.each([
  { kind: 'qiuqiu', file: 'ninja', imageHeight: 547, top: 16, foot: 541 },
  { kind: 'feifei', file: 'feifei', imageHeight: 547, top: 5, foot: 543 },
  { kind: 'dangdang', file: 'dangdang', imageHeight: 547, top: 5, foot: 543 },
  { kind: 'fengfeng', file: 'fengfeng', imageHeight: 560, top: 22, foot: 539 },
] as const)('$kind 的舊受擊表情保持完整 650 毫秒，尺寸與腳底不漂移', ({ kind, file, imageHeight, top, foot }) => {
  expect(kind === 'qiuqiu' ? qiuqiuMotionDuration('hurt') : companionMotionDuration(kind, 'hurt')).toBe(650);
  for (const height of [252, 126]) {
    const actor = kind === 'qiuqiu' ? createQiuqiuActor({ height }) : createCompanionMotionActor(kind, { height });
    const canvas = actor.element as unknown as FakeCanvas;
    actor.play('idle', { elapsed: 3100 });
    expect(actor.element.style.scale).not.toBe('1');
    const placement = actor.element.style.transform;
    actor.play('hurt');
    const drawnAtHit = canvas.draws.length;
    for (const elapsed of [0, 200, 500, 649]) {
      step(elapsed);
      const [image, sx, sy, sw, sh, dx, dy, dw, dh] = canvas.draws.at(-1)!;
      expect(image.src).toBe(`assets/sprites/hero/${file}_hit.webp`);
      expect([sx, sy, sw, sh]).toEqual([0, 0, 560, imageHeight]);
      const scale = height / (foot - top);
      expect(dw).toBeCloseTo(560 * scale, 8);
      expect(dh).toBeCloseTo(imageHeight * scale, 8);
      expect(dx + 280 * scale).toBeCloseTo(actor.foot.x, 8);
      expect(dy + foot * scale).toBeCloseTo(actor.foot.y, 8);
      expect((foot - top) * dh / imageHeight).toBeCloseTo(height, 8);
      expect(actor.element.style.scale).toBe('1');
      expect(actor.element.style.transform).toBe(placement);
      expect(rafs.size).toBe(1);
    }
    expect(canvas.draws).toHaveLength(drawnAtHit);
    step(650);
    expect(rafs.size).toBe(0);
    expect(canvas.draws).toHaveLength(drawnAtHit);
    actor.play('idle');
    expect(canvas.draws.at(-1)![0].src).not.toContain('_hit.webp');
    actor.dispose();
    expect(rafs.size).toBe(0);
  }
});
