import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import motionData from '../../src/ui/enemy-motion-data.json';
import type {
  EnemyMotionAction,
  EnemyMotionKind,
} from '../../src/ui/enemy-motion';

type DrawCall = [CanvasImageSource, number, number, number, number, number, number, number, number];

class FakeContext {
  draws: DrawCall[] = [];
  clears = 0;
  transform: [number, number, number, number, number, number] | null = null;
  clearRect(): void { this.clears += 1; }
  setTransform(...args: [number, number, number, number, number, number]): void {
    this.transform = args;
  }
  drawImage(...args: DrawCall): void { this.draws.push(args); }
}

class FakeCanvas {
  width = 0;
  height = 0;
  className = '';
  ariaLabel = '';
  role = '';
  style = { width: '', height: '', transform: '', bottom: '' };
  readonly context = new FakeContext();
  getContext(kind: string): FakeContext | null { return kind === '2d' ? this.context : null; }
  setAttribute(name: string, value: string): void {
    if (name === 'aria-label') this.ariaLabel = value;
    if (name === 'role') this.role = value;
  }
}

class FakeImage {
  static sources: string[] = [];
  /** 呼叫過 decode() 的網址：逐格動作不該有——畫布用不到那份解碼（清理 2026-09-22） */
  static decoded: string[] = [];
  complete = true;
  private value = '';
  set src(value: string) { this.value = value; FakeImage.sources.push(value); }
  get src(): string { return this.value; }
  async decode(): Promise<void> { FakeImage.decoded.push(this.value); }
}

type EnemyMotionModule = typeof import('../../src/ui/enemy-motion');

let motion: EnemyMotionModule;
let nextRaf = 1;
let rafs = new Map<number, FrameRequestCallback>();
let cancelled: number[] = [];
let canvases: FakeCanvas[] = [];

function step(time: number): void {
  const pending = [...rafs.values()];
  rafs.clear();
  for (const callback of pending) callback(time);
}

function lastDraw(): DrawCall {
  const draw = canvases.at(-1)?.context.draws.at(-1);
  if (!draw) throw new Error('沒有畫布繪製紀錄');
  return draw;
}

beforeEach(async () => {
  vi.resetModules();
  FakeImage.sources = [];
  FakeImage.decoded = [];
  nextRaf = 1;
  rafs = new Map();
  cancelled = [];
  canvases = [];
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`未預期的元素：${tag}`);
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas;
    },
  });
  vi.stubGlobal('window', {
    devicePixelRatio: 3,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const id = nextRaf++;
      rafs.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => { cancelled.push(id); rafs.delete(id); },
  });
  motion = await import('../../src/ui/enemy-motion');
});

afterEach(() => vi.unstubAllGlobals());

describe('敵人逐格素材載入', () => {
  it('只載入本場敵人種類，同來源圖去重且分種類記錄就緒', async () => {
    expect(motion.enemyMotionReady('rat')).toBe(false);
    expect(motion.enemyMotionReady('ninja')).toBe(false);

    await motion.preloadEnemyMotion(['rat']);
    expect(FakeImage.sources).toHaveLength(3);
    expect(new Set(FakeImage.sources).size).toBe(3);
    expect(FakeImage.sources.every((source) => source.includes('assets/motion/enemies/'))).toBe(true);
    expect(FakeImage.sources.every((source) => source.includes('rat-'))).toBe(true);
    expect(motion.enemyMotionReady('rat')).toBe(true);
    expect(motion.enemyMotionReady('ninja')).toBe(false);

    await motion.preloadEnemyMotion(['rat', 'ninja']);
    expect(FakeImage.sources).toHaveLength(5);
    expect(new Set(FakeImage.sources).size).toBe(5);
    expect(motion.enemyMotionReady('ninja')).toBe(true);
    expect(FakeImage.decoded).toEqual([]);
  });

  it('保留來源影格時長，並回報完整動作總時長', () => {
    expect([
      motion.enemyMotionDuration('rat', 'idle'),
      motion.enemyMotionDuration('rat', 'attack'),
      motion.enemyMotionDuration('rat', 'hurt'),
      motion.enemyMotionDuration('rat', 'air_rise'),
      motion.enemyMotionDuration('rat', 'air_fall'),
      motion.enemyMotionDuration('rat', 'knockdown'),
      motion.enemyMotionDuration('rat', 'getup'),
    ]).toEqual([100, 820, 400, 240, 210, 200, 280]);
    expect([
      motion.enemyMotionDuration('ninja', 'idle'),
      motion.enemyMotionDuration('ninja', 'attack'),
      motion.enemyMotionDuration('ninja', 'hurt'),
    ]).toEqual([1000, 720, 400]);
  });
});

describe('敵人逐格畫布', () => {
  it.each((['rat', 'ninja'] as const).flatMap((kind) =>
    (['idle', 'attack', 'hurt', 'air_rise', 'air_fall', 'knockdown', 'getup'] as const)
      .map((action) => ({ kind, action }))))('$kind $action 在 60 Hz 下保持原始時間軸，每個來源影格只重畫一次', ({ kind, action }) => {
    const actor = motion.createEnemyMotionActor(kind, { action });
    const context = canvases.at(-1)!.context;
    const data = motionData.kinds[kind].actions[action];
    const durations = data.frames.map((frame) => frame.duration * 1000);
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    for (let index = 0; index <= 60; index++) {
      const elapsed = index * 1000 / 60;
      step(elapsed);
      let remaining = data.loop ? elapsed % total : Math.min(elapsed, total);
      let frameIndex = 0;
      while (frameIndex < data.frames.length - 1 && remaining >= durations[frameIndex]!) {
        remaining -= durations[frameIndex]!;
        frameIndex += 1;
      }
      expect(lastDraw().slice(1, 5)).toEqual(data.frames[frameIndex]!.rect);
    }
    expect(context.draws).toHaveLength(data.frames.length);
    expect(context.clears).toBe(data.frames.length);
    expect(rafs.size).toBe(data.loop ? 1 : 0);
    actor.dispose();
  });

  it('攻擊重播會重新計時，不受上一輪繪製紀錄影響', () => {
    const actor = motion.createEnemyMotionActor('rat', { action: 'attack' });
    step(0);
    step(110);
    expect(lastDraw().slice(1, 5)).toEqual(motionData.kinds.rat.actions.attack.frames[1]!.rect);
    actor.play('attack');
    step(200);
    step(299);
    expect(lastDraw().slice(1, 5)).toEqual(motionData.kinds.rat.actions.attack.frames[0]!.rect);
    step(300);
    expect(lastDraw().slice(1, 5)).toEqual(motionData.kinds.rat.actions.attack.frames[1]!.rect);
    actor.dispose();
  });

  it('依來源時長換格，非循環動作停在最後一格', () => {
    const actor = motion.createEnemyMotionActor('rat', { action: 'attack' });
    step(1000);
    expect(lastDraw().slice(1, 5)).toEqual([32, 26, 340, 395]);
    step(1099);
    expect(lastDraw().slice(1, 5)).toEqual([32, 26, 340, 395]);
    step(1100);
    expect(lastDraw().slice(1, 5)).toEqual([476, 31, 346, 390]);
    step(2000);
    expect(lastDraw().slice(1, 5)).toEqual([1362, 469, 340, 396]);
    expect(rafs.size).toBe(0);
    actor.dispose();
  });

  it('所有動作維持同一腳底定位點，切換動作不改畫布位置', () => {
    const actions: EnemyMotionAction[] = ['idle', 'attack', 'hurt', 'air_rise', 'air_fall', 'knockdown', 'getup'];
    for (const kind of ['rat', 'ninja'] as EnemyMotionKind[]) {
      const actor = motion.createEnemyMotionActor(kind);
      const canvas = canvases.at(-1)!;
      const initial = { foot: actor.foot, transform: canvas.style.transform, bottom: canvas.style.bottom };
      expect(Object.isFrozen(actor.foot)).toBe(true);
      for (const action of actions) {
        actor.play(action);
        step(100);
        const [, , , , , dx, dy, width, height] = lastDraw();
        expect(dx).toBeGreaterThanOrEqual(-0.001);
        expect(dy).toBeGreaterThanOrEqual(-0.001);
        expect(dx + width).toBeLessThanOrEqual(Number.parseFloat(canvas.style.width) + 0.001);
        expect(dy + height).toBeLessThanOrEqual(Number.parseFloat(canvas.style.height) + 0.001);
        expect(actor.foot).toBe(initial.foot);
        expect(canvas.style.transform).toBe(initial.transform);
        expect(canvas.style.bottom).toBe(initial.bottom);
      }
      actor.dispose();
    }
  });

  it('依各角色待機可見高度正規化，預設老鼠 150、忍者 210', () => {
    const rat = motion.createEnemyMotionActor('rat');
    const ratIdleHeight = lastDraw()[8];
    expect(ratIdleHeight).toBeCloseTo(468 * 0.5 * 150 / 231, 6);
    rat.dispose();

    const ninja = motion.createEnemyMotionActor('ninja');
    const ninjaIdleHeight = lastDraw()[8];
    expect(ninjaIdleHeight).toBeCloseTo(285 * 0.81 * 210 / 231, 6);
    ninja.dispose();
  });

  it('依原圖朝向逐動作面向左側，換待機、攻擊、受擊時腳底不跳位', () => {
    for (const kind of ['rat', 'ninja'] as EnemyMotionKind[]) {
      const actor = motion.createEnemyMotionActor(kind);
      const canvas = canvases.at(-1)!;
      const initialTransform = canvas.style.transform;
      const actions: EnemyMotionAction[] = ['idle', 'attack', 'hurt', 'air_rise', 'air_fall', 'knockdown', 'getup', 'idle'];
      for (const action of actions) {
        actor.play(action);
        const mirrored = kind !== 'rat' || (action !== 'idle' && action !== 'hurt');
        const transform = canvas.context.transform!;
        expect(transform[0]).toBe(mirrored ? -2 : 2);
        expect(transform[3]).toBe(2);
        expect(transform[4]).toBe(mirrored ? canvas.width : 0);
        const kindData = motionData.kinds[kind];
        const actionData = kindData.actions[action];
        const pivotX = actionData.frames[0]!.pivot[0]!;
        const drawnPivotX = lastDraw()[5] + pivotX * actionData.scale * kindData.default_height / kindData.native_height;
        expect((transform[0] * drawnPivotX + transform[4]) / 2).toBeCloseTo(actor.foot.x, 6);
        expect(canvas.style.transform).toBe(initialTransform);
      }
      actor.dispose();
    }
  });

  it('建立後持續請求影格，釋放後取消且不再繪製', () => {
    const actor = motion.createEnemyMotionActor('ninja', { action: 'idle' });
    const canvas = canvases.at(-1)!;
    expect(actor.element.className).toBe('enemy-motion');
    expect(actor.element.role).toBe('img');
    expect(rafs.size).toBe(1);
    step(10);
    const before = canvas.context.draws.length;
    actor.dispose();
    expect(cancelled).toHaveLength(1);
    step(20);
    expect(canvas.context.draws.length).toBe(before);
  });
});
