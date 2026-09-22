import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const motionMock = vi.hoisted(() => ({
  heights: [] as Array<number | undefined>,
  actors: [] as Array<{
    element: HTMLCanvasElement;
    foot: Readonly<{ x: number; y: number }>;
    width: number;
    height: number;
    play: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('../../src/ui/qiuqiu-motion', () => ({
  createQiuqiuActor: vi.fn((options?: { height?: number }) => {
    motionMock.heights.push(options?.height);
    const element = document.createElement('canvas');
    element.width = 240;
    element.height = 200;
    element.style.transform = 'translateX(-18px)';
    const actor = {
      element,
      foot: { x: 18, y: 90 },
      width: 120,
      height: 100,
      play: vi.fn(),
      dispose: vi.fn(),
    };
    motionMock.actors.push(actor);
    return actor;
  }),
  qiuqiuImpactDelay: vi.fn((action: string) => ({ attack1: 70, kick: 200, attack4: 160 }[action] ?? 0)),
  qiuqiuMotionDuration: vi.fn((action: string) => ({ attack1: 300, kick: 580, attack4: 520 }[action] ?? 300)),
}));

vi.mock('../../src/ui/companion-motion', () => ({
  FEIFEI_CLONE_TIMING: { appear: 180, begin: 350, impact: 690, end: 1240 },
  createCompanionMotionActor: vi.fn((_kind: string, options?: { height?: number }) => {
    motionMock.heights.push(options?.height);
    const element = document.createElement('canvas');
    element.width = 240;
    element.height = 200;
    element.style.transform = 'translateX(-18px)';
    const actor = {
      element,
      foot: { x: 18, y: 90 },
      width: 120,
      height: 100,
      play: vi.fn(),
      dispose: vi.fn(),
    };
    motionMock.actors.push(actor);
    return actor;
  }),
}));

import { playFeifeiClone, playQiuqiuAfterimages, playQiuqiuEchoes } from '../../src/ui/qiuqiu-motion-effects';

class FakeElement {
  className = '';
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  parentElement: FakeElement | null = null;

  constructor(readonly tagName: string) {}

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }

  remove(): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    const matches: FakeElement[] = [];
    for (const child of this.children) {
      if (className && child.className.split(/\s+/).includes(className)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }
}

class FakeContext {
  readonly sources: FakeCanvas[] = [];

  constructor(private readonly owner: FakeCanvas) {}

  drawImage(source: FakeCanvas): void {
    this.sources.push(source);
    this.owner.bitmap = source.bitmap;
  }
}

class FakeCanvas extends FakeElement {
  width = 0;
  height = 0;
  bitmap = '';
  readonly context = new FakeContext(this);

  constructor() { super('canvas'); }

  getContext(kind: string): FakeContext | null {
    return kind === '2d' ? this.context : null;
  }
}

let clock = 0;
let nextRaf = 1;
let rafs = new Map<number, FrameRequestCallback>();

function step(time: number): void {
  clock = time;
  const pending = [...rafs.values()];
  rafs.clear();
  for (const callback of pending) callback(time);
}

function stage(): HTMLElement {
  return new FakeElement('div') as unknown as HTMLElement;
}

function echoes(root: HTMLElement): FakeElement[] {
  return (root as unknown as FakeElement).querySelectorAll('.qiuqiu-echo');
}

function afterimages(root: HTMLElement): FakeCanvas[] {
  return (root as unknown as FakeElement).querySelectorAll('.qiuqiu-afterimage') as FakeCanvas[];
}

function sourceActor(bitmap = '前一張完整姿勢') {
  const element = new FakeCanvas();
  element.width = 240;
  element.height = 200;
  element.bitmap = bitmap;
  return {
    element: element as unknown as HTMLCanvasElement,
    foot: { x: 18, y: 90 },
    width: 120,
    height: 100,
    play: vi.fn(),
    dispose: vi.fn(),
  };
}

beforeEach(() => {
  clock = 0;
  nextRaf = 1;
  rafs = new Map();
  motionMock.heights.length = 0;
  motionMock.actors.length = 0;
  vi.stubGlobal('document', {
    createElement: (tag: string) => tag === 'canvas' ? new FakeCanvas() : new FakeElement(tag),
  });
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextRaf++;
    rafs.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafs.delete(id); });
});

afterEach(() => vi.unstubAllGlobals());

describe('球球分身效果', () => {
  it('依真實命中點提前播放三種姿勢，左右分身的可見腳底錨點對稱', () => {
    const root = stage();
    const done = vi.fn();
    playQiuqiuEchoes(root, 'ultimate_clone', { x: 500, y: 300, width: 200 }, {
      impactTimes: [420, 760, 1120],
      onDone: done,
    });

    step(349);
    expect(echoes(root)).toHaveLength(1);
    expect(motionMock.actors[0]!.play).not.toHaveBeenCalled();
    step(350);
    expect(motionMock.actors[0]!.play).toHaveBeenCalledWith('attack1', { elapsed: 0 });
    expect(echoes(root).map((layer) => layer.style.left)).toEqual(['350px']);

    step(559);
    expect(echoes(root).map((layer) => layer.style.left)).toEqual(['350px', '650px']);
    expect(motionMock.actors[1]!.play).not.toHaveBeenCalled();
    step(560);
    expect(motionMock.actors[1]!.play).toHaveBeenCalledWith('kick', { elapsed: 0 });
    expect(echoes(root).map((layer) => layer.style.left)).toEqual(['350px', '650px']);
    expect(echoes(root).every((layer) => Number(layer.style.opacity) > 0)).toBe(true);
    expect(motionMock.actors[1]!.element.style.transform).toBe('translateX(-18px)');

    step(959);
    expect(motionMock.actors[2]!.play).not.toHaveBeenCalled();
    step(960);
    expect(motionMock.actors[2]!.play).toHaveBeenCalledWith('attack4', { elapsed: 0 });
    step(10_000);
    expect(echoes(root)).toHaveLength(0);
    expect(motionMock.actors.every((actor) => actor.dispose.mock.calls.length >= 1)).toBe(true);
    expect(done).toHaveBeenCalledOnce();
    expect(rafs.size).toBe(0);
  });

  it('兩張牌的分身同時存在，清掉第一張不會取消第二張', () => {
    const root = stage();
    const firstDone = vi.fn();
    const secondDone = vi.fn();
    const stopFirst = playQiuqiuEchoes(root, 'clone_duo', { x: 400, y: 300, width: 160 }, {
      impactTimes: [100], onDone: firstDone,
    });
    playQiuqiuEchoes(root, 'clone_duo', { x: 700, y: 300, width: 160 }, {
      impactTimes: [100], onDone: secondDone,
    });

    step(30);
    expect(echoes(root)).toHaveLength(2);
    expect(rafs.size).toBe(2);
    stopFirst();
    expect(echoes(root)).toHaveLength(1);
    expect(rafs.size).toBe(1);
    step(1000);
    expect(echoes(root)).toHaveLength(0);
    expect(firstDone).not.toHaveBeenCalled();
    expect(secondDone).toHaveBeenCalledOnce();
  });

  it('展示用高度會傳給分身演員，清理後不留下可見節點', () => {
    const root = stage();
    const dispose = playQiuqiuEchoes(root, 'clone_duo', { x: 400, y: 300, width: 160 }, {
      impactTimes: [100], height: 84, onDone: vi.fn(),
    });

    step(0);
    expect(motionMock.heights).toEqual([84]);
    expect(echoes(root)).toHaveLength(1);
    dispose();
    expect(echoes(root)).toHaveLength(0);
    expect(rafs.size).toBe(0);
  });

  it('主動清理會移除全部分身與排程，之後不誤觸完成回呼', () => {
    const root = stage();
    const done = vi.fn();
    const dispose = playQiuqiuEchoes(root, 'clone_duo', { x: 500, y: 300, width: 200 }, {
      impactTimes: [100, 100], onDone: done,
    });

    step(30);
    expect(echoes(root)).toHaveLength(2);
    dispose();
    expect(echoes(root)).toHaveLength(0);
    expect(motionMock.actors.every((actor) => actor.dispose.mock.calls.length === 1)).toBe(true);
    expect(rafs.size).toBe(0);
    step(2000);
    expect(done).not.toHaveBeenCalled();
  });

  it('帶入已經過時間時只建立仍在演出的分身，不重演已結束者', () => {
    clock = 1000;
    const root = stage();
    const done = vi.fn();
    const dispose = playQiuqiuEchoes(root, 'ultimate_clone', { x: 500, y: 300, width: 200 }, {
      impactTimes: [420, 760, 1120], elapsed: 800, onDone: done,
    });

    step(1000);
    const playing = motionMock.actors.filter((actor) => actor.play.mock.calls.length > 0);
    expect(playing).toHaveLength(1);
    expect(playing[0]!.play).toHaveBeenCalledWith('kick', { elapsed: 240 });
    expect(motionMock.actors.flatMap((actor) => actor.play.mock.calls).map((call) => call[0]))
      .not.toContain('attack1');
    expect(echoes(root).length).toBeGreaterThanOrEqual(1);
    expect(done).not.toHaveBeenCalled();
    dispose();
  });
});

describe('菲菲毒分身效果', () => {
  it('180 毫秒顯現、350 毫秒用菲菲爪擊，完整收尾後才清理', () => {
    const root = stage();
    const done = vi.fn();
    playFeifeiClone(root, { x: 500, y: 300, width: 200 }, { height: 84, onDone: done });

    step(179);
    expect((root as unknown as FakeElement).querySelectorAll('.feifei-clone')).toHaveLength(0);
    step(180);
    expect((root as unknown as FakeElement).querySelectorAll('.feifei-clone')).toHaveLength(1);
    expect(motionMock.heights).toEqual([84]);
    expect(motionMock.actors[0]!.play).not.toHaveBeenCalled();
    step(350);
    expect(motionMock.actors[0]!.play).toHaveBeenCalledWith('attack1', { elapsed: 0 });
    step(1239);
    expect(done).not.toHaveBeenCalled();
    step(1240);
    expect((root as unknown as FakeElement).querySelectorAll('.feifei-clone')).toHaveLength(0);
    expect(motionMock.actors[0]!.dispose).toHaveBeenCalled();
    expect(done).toHaveBeenCalledOnce();
    expect(rafs.size).toBe(0);
  });
});

describe('球球殘影效果', () => {
  it('本體換姿勢後仍沿用啟動當下的完整快照，並在期限內全部清除', () => {
    const root = stage();
    const actor = sourceActor();
    const done = vi.fn();
    playQiuqiuAfterimages(root, actor, { x: 500, y: 300 }, { duration: 120, onDone: done });

    step(0);
    expect(afterimages(root).map((canvas) => canvas.bitmap)).toEqual(['前一張完整姿勢']);
    (actor.element as unknown as FakeCanvas).bitmap = '下一張姿勢';
    step(50);
    step(100);
    expect(afterimages(root).map((canvas) => canvas.bitmap))
      .toEqual(['前一張完整姿勢', '前一張完整姿勢', '前一張完整姿勢']);

    step(269);
    expect(afterimages(root)).toHaveLength(0);
    expect(done).toHaveBeenCalledOnce();
    expect(rafs.size).toBe(0);
    step(500);
    expect(done).toHaveBeenCalledOnce();
  });

  it('殘影冒在角色當下的位置（原地前衝時跟著前進、退回），不是固定在衝最遠那一點', () => {
    const root = stage();
    // 假裝 0 毫秒在原位、50 毫秒往前 40 像素、100 毫秒退回 10 像素
    const offsets: Record<number, number> = { 0: 0, 50: 40, 100: 10 };
    playQiuqiuAfterimages(root, sourceActor(), { x: 500, y: 300 }, {
      duration: 120, offsetAt: (elapsed) => offsets[Math.round(elapsed)] ?? 0, onDone: () => undefined,
    });
    step(0);
    step(50);
    step(100);
    const lefts = afterimages(root).map((canvas) => Number.parseFloat(canvas.style.left!));
    expect(lefts[1]! - lefts[0]!).toBeCloseTo(40, 6);
    expect(lefts[2]! - lefts[0]!).toBeCloseTo(10, 6);
  });

  it('主動清理會移除所有殘影與排程，之後不誤觸完成回呼', () => {
    const root = stage();
    const done = vi.fn();
    const dispose = playQiuqiuAfterimages(root, sourceActor(), { x: 500, y: 300 }, {
      duration: 500, onDone: done,
    });

    step(0);
    step(50);
    expect(afterimages(root)).toHaveLength(2);
    dispose();
    expect(afterimages(root)).toHaveLength(0);
    expect(rafs.size).toBe(0);
    step(1000);
    expect(done).not.toHaveBeenCalled();
  });
});
