import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQiuqiuActor } from '../../src/ui/qiuqiu-motion';
import { createCompanionMotionActor } from '../../src/ui/companion-motion';
import { visibleCanvasRect } from './motion_test_geometry';

vi.mock('../../src/ui/assets', () => ({ fileUrl: (path: string) => path }));

class FakeCanvas {
  isConnected = true;
  width = 0;
  height = 0;
  style: Record<string, string> = {};
  clears = 0;
  draws: number[][] = [];
  setAttribute(): void {}
  getContext() {
    return {
      setTransform: vi.fn(),
      clearRect: () => { this.clears++; },
      drawImage: (_image: unknown, ...args: number[]) => this.draws.push(args),
    };
  }
}

let rafs: Map<number, FrameRequestCallback>;
let nextRaf: number;
function step(time: number): void {
  const pending = [...rafs.values()];
  rafs.clear();
  for (const callback of pending) callback(time);
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

it.each(['qiuqiu', 'feifei', 'dangdang', 'fengfeng'] as const)('%s 在 240 Hz 持續呼吸，腳底與原曲線相同但只畫一次', kind => {
  const actor = kind === 'qiuqiu' ? createQiuqiuActor() : createCompanionMotionActor(kind);
  const canvas = actor.element as unknown as FakeCanvas;
  const first = canvas.draws[0]!;
  const placement = actor.element.style.transform;
  step(0);
  for (let frame = 1; frame <= 1488; frame++) {
    const elapsed = frame * 6200 / 1488;
    step(elapsed);
    const draw = canvas.draws.at(-1)!;
    const visible = visibleCanvasRect(actor.element, [draw[4]!, draw[5]!, draw[6]!, draw[7]!]);
    const breath = 1 + .025 * Math.sin(Math.PI * elapsed / 6200) ** 2;
    expect(visible[0]).toBe(first[4]);
    expect(visible[1]).toBeCloseTo(actor.foot.y + (first[5]! - actor.foot.y) * breath, 8);
    expect(visible[2]).toBe(first[6]);
    expect(visible[3]).toBeCloseTo(first[7]! * breath, 8);
    const pivotFraction = (actor.foot.y - first[5]!) / first[7]!;
    expect(visible[1] + visible[3] * pivotFraction).toBeCloseTo(actor.foot.y, 8);
    expect(actor.element.style.transform).toBe(placement);
    expect(draw.slice(0, 4)).toEqual(first.slice(0, 4));
  }
  expect(canvas.draws).toHaveLength(1);
  expect(canvas.clears).toBe(1);
  expect(actor.element.style.transformOrigin).toBe(`${actor.foot.x}px ${actor.foot.y}px`);
  const hiddenScale = actor.element.style.scale;
  canvas.isConnected = false;
  step(9300);
  expect(actor.element.style.scale).toBe(hiddenScale);
  expect(canvas.draws).toHaveLength(1);
  canvas.isConnected = true;
  step(9310);
  const visible = visibleCanvasRect(actor.element, [first[4]!, first[5]!, first[6]!, first[7]!]);
  expect(visible[3]).toBeCloseTo(first[7]! * (1 + .025 * Math.sin(Math.PI * (9310 % 6200) / 6200) ** 2), 8);
  expect(canvas.draws).toHaveLength(1);
  actor.dispose();
  expect(rafs.size).toBe(0);
});

it('呼吸中切換衝刺或追擊時立即恢復原尺寸，殘影可直接複製同一畫布', () => {
  const actor = createQiuqiuActor();
  for (const action of ['dash', 'ultimate_rush'] as const) {
    for (const elapsed of [0, 160, 500, 880, 1449]) {
      const reference = createQiuqiuActor({ action });
      reference.play(action, { elapsed });
      const expectedDraw = (reference.element as unknown as FakeCanvas).draws.at(-1)!;
      reference.dispose();
      actor.play('idle', { elapsed: 3100 });
      expect(actor.element.style.scale).not.toBe('1');
      // 戰鬥流程可先在未掛入的畫布切換動作，再掛回並立即拍殘影。
      (actor.element as unknown as FakeCanvas).isConnected = false;
      actor.play(action, { elapsed });
      const canvas = actor.element as unknown as FakeCanvas;
      const draw = canvas.draws.at(-1)!;
      expect(draw).toEqual(expectedDraw);
      expect(visibleCanvasRect(actor.element, [draw[4]!, draw[5]!, draw[6]!, draw[7]!]))
        .toEqual([draw[4], draw[5], draw[6], draw[7]]);
      expect(actor.element.style.scale).toBe('1');
      canvas.isConnected = true;
    }
  }
  actor.dispose();
});
