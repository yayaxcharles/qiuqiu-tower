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
    // 實作把呼吸值量化到千分位再比對，避免每幀都寫一次行內樣式（稽核 2026-09-21 第 2 點）。
    const breath = Math.round((1 + .025 * Math.sin(Math.PI * elapsed / 6200) ** 2) * 1000) / 1000;
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
  expect(visible[3]).toBeCloseTo(first[7]! * (Math.round((1 + .025 * Math.sin(Math.PI * (9310 % 6200) / 6200) ** 2) * 1000) / 1000), 8);
  expect(canvas.draws).toHaveLength(1);
  actor.dispose();
  expect(rafs.size).toBe(0);
});

/**
 * 停在代表畫格上呼吸時不再每一拍都醒（2026-09-23 效能）：用有到期時間的假計時器跑一整個 6.2 秒的呼吸週期（240 Hz），
 * 每一拍看到的縮放都要跟原本每一拍都醒時一模一樣，但真的被叫醒的次數要少很多。
 * 把 frame-motion.ts 的 `quietFor` 改回一律回 0（每一拍醒）→ 醒來次數那條會紅。
 */
it.each(['qiuqiu', 'feifei', 'dangdang', 'fengfeng'] as const)('%s 呼吸時睡到下一次變化才醒，每一拍看到的縮放不變', kind => {
  let clock = 0;
  let nextTimer = 1;
  const timers = new Map<number, { due: number; callback: () => void }>();
  vi.stubGlobal('window', { ...window,
    setTimeout: (callback: () => void, ms = 0) => { const id = nextTimer++; timers.set(id, { due: clock + ms, callback }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  let wakes = 0;
  const at = (time: number): void => {
    clock = time;
    for (const [id, t] of [...timers]) if (t.due <= time) { timers.delete(id); t.callback(); }
    if (rafs.size) wakes++;
    step(time);
  };
  const actor = kind === 'qiuqiu' ? createQiuqiuActor() : createCompanionMotionActor(kind);
  const canvas = actor.element as unknown as FakeCanvas;
  const first = canvas.draws[0]!;
  at(0);
  const frames = 1488;
  for (let frame = 1; frame <= frames; frame++) {
    const elapsed = frame * 6200 / frames;
    at(elapsed);
    const breath = Math.round((1 + .025 * Math.sin(Math.PI * elapsed / 6200) ** 2) * 1000) / 1000;
    const visible = visibleCanvasRect(actor.element, [first[4]!, first[5]!, first[6]!, first[7]!]);
    expect(visible[3], `第 ${frame} 拍（${elapsed.toFixed(1)} 毫秒）`).toBeCloseTo(first[7]! * breath, 8);
  }
  expect(canvas.draws).toHaveLength(1);
  // 一個週期 50 次呼吸變化：每次最多醒兩三拍，外加每 250 毫秒保底醒一次；原本是每一拍都醒（1488 次）
  expect(wakes).toBeLessThan(frames / 6);
  // 換動作要立刻反應：不能等上一個呼吸的計時器
  actor.play('hurt' as never);
  expect(rafs.size).toBe(1);
  expect(timers.size).toBe(0);
  actor.dispose();
  expect(rafs.size + timers.size).toBe(0);
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

it('畫布拔掉超過 60 幀就改成慢速檢查，沒呼叫 play() 就掛回也會繼續呼吸', () => {
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  vi.stubGlobal('window', { ...window,
    setTimeout: (callback: () => void) => { const id = nextTimer++; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const actor = createQiuqiuActor();
  const canvas = actor.element as unknown as FakeCanvas;
  step(0);
  canvas.isConnected = false;
  for (let frame = 1; frame <= 61; frame++) step(frame * 16);
  // 久未掛入：不再每幀要下一格，只排一個慢速檢查。
  expect(rafs.size).toBe(0);
  expect(timers.size).toBe(1);
  // 戰鬥畫面把同一塊畫布掛回去；待機姿勢沒變，所以不會呼叫 play()。
  canvas.isConnected = true;
  const scaleBefore = actor.element.style.scale;
  for (const callback of [...timers.values()]) { timers.clear(); callback(); }
  expect(rafs.size).toBe(1);
  step(3100);
  expect(actor.element.style.scale, '掛回後停在原地不呼吸').not.toBe(scaleBefore);
  actor.dispose();
  expect(rafs.size + timers.size).toBe(0);
});
