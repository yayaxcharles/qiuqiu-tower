import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playFeifeiNeedles } from '../../src/ui/feifei-needles';
import { feifeiNeedleFlightMs, feifeiNeedleGapMs, feifeiNeedleReleaseTimes, type FeifeiNeedleAction } from '../../src/ui/feifei-needle-patterns';

// 出手、飛行、額外波間隔都取自招式資料：那裡已經是 1.5 倍速後的時間（素材原速見 feifei-needle-patterns.ts，換算見 motion-speed.ts）
const release = (action: FeifeiNeedleAction, wave = 0): number => feifeiNeedleReleaseTimes(action)[wave]!;
const hit = (action: FeifeiNeedleAction, wave = 0): number => release(action, wave) + feifeiNeedleFlightMs(action);

class FakeContext {
  readonly strokes: string[] = [];
  readonly fills: string[] = [];
  strokeStyle = '';
  fillStyle = '';
  lineWidth = 0;
  globalAlpha = 1;
  lineCap = '';
  lineJoin = '';
  save(): void {}
  restore(): void {}
  translate(): void {}
  rotate(): void {}
  scale(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  quadraticCurveTo(): void {}
  bezierCurveTo(): void {}
  closePath(): void {}
  arc(): void {}
  clearRect(): void {}
  stroke(): void { this.strokes.push(String(this.strokeStyle)); }
  fill(): void { this.fills.push(String(this.fillStyle)); }
}

class FakeCanvas {
  width = 0;
  height = 0;
  className = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  parent: FakeStage | null = null;
  readonly context = new FakeContext();
  getContext(kind: string): FakeContext | null { return kind === '2d' ? this.context : null; }
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
}

class FakeStage {
  children: FakeCanvas[] = [];
  append(canvas: FakeCanvas): void { canvas.parent = this; this.children.push(canvas); }
  appendChild(canvas: FakeCanvas): FakeCanvas { this.append(canvas); return canvas; }
}

let clock = 0;
let nextRaf = 1;
let rafs = new Map<number, FrameRequestCallback>();
let cancelled: number[] = [];
let created: FakeCanvas[] = [];

function step(time: number): void {
  clock = time;
  const pending = [...rafs.values()];
  rafs.clear();
  for (const callback of pending) callback(time);
}

function stage(): FakeStage { return new FakeStage(); }

beforeEach(() => {
  clock = 0;
  nextRaf = 1;
  rafs = new Map();
  cancelled = [];
  created = [];
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`);
      const canvas = new FakeCanvas();
      created.push(canvas);
      return canvas;
    },
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextRaf++;
    rafs.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { cancelled.push(id); rafs.delete(id); });
});

afterEach(() => vi.unstubAllGlobals());

describe('菲菲飛針投射物', () => {
  it('飛針在資料指定的時點離手（原速 285 毫秒）並沿單一直線抵達真實命中時點', () => {
    const target = stage();
    const impact = vi.fn();
    const done = vi.fn();
    playFeifeiNeedles(target as unknown as HTMLElement, { x: 100, y: 200 }, { x: 800, y: 240 }, {
      action: 'shuriken', waves: 1, impactTimes: [hit('shuriken')], onImpact: impact, onDone: done,
    });

    step(release('shuriken') - 1);
    expect(target.children).toHaveLength(0);
    step(release('shuriken'));
    expect(target.children).toHaveLength(1);
    expect(target.children[0]!.dataset).toMatchObject({
      pattern: 'shuriken', wave: '0', route: 'straight', phase: 'flight', needleCount: '1',
    });
    expect(target.children[0]!.context.strokes).toEqual(expect.arrayContaining(['#d9d8eb', '#74469d']));
    expect(target.children[0]!.style.transform).toContain('translate(73px, 191px)');
    step(hit('shuriken'));
    expect(impact.mock.calls).toEqual([[0]]);
    expect(done).toHaveBeenCalledOnce();
    expect(target.children).toHaveLength(0);
    expect(rafs.size).toBe(0);
  });

  it('舊針雨保留兩次離手節奏並讓每波三枚裝飾針同時命中', () => {
    const target = stage();
    const impact = vi.fn();
    playFeifeiNeedles(target as unknown as HTMLElement, { x: 100, y: 200 }, { x: 800, y: 240 }, {
      action: 'storm', waves: 2, impactTimes: [hit('storm', 0), hit('storm', 1)], onImpact: impact, onDone: vi.fn(),
    });

    step(release('storm', 0));
    expect(target.children).toHaveLength(1);
    expect(target.children[0]!.dataset).toMatchObject({ pattern: 'storm', wave: '0', needleCount: '3' });
    step(release('storm', 1));
    expect(target.children.map((canvas) => canvas.dataset.wave)).toEqual(['0', '1']);
    step(hit('storm', 1));
    expect(impact.mock.calls).toEqual([[0], [1]]);
  });

  it('連針依真實兩段或三段交替左右手起點', () => {
    const target = stage();
    const third = release('needle_combo', 1) + feifeiNeedleGapMs('needle_combo');
    playFeifeiNeedles(target as unknown as HTMLElement, { x: 100, y: 200 }, { x: 800, y: 240 }, {
      action: 'needle_combo', waves: 3,
      impactTimes: [hit('needle_combo', 0), hit('needle_combo', 1), third + feifeiNeedleFlightMs('needle_combo')],
      onImpact: vi.fn(), onDone: vi.fn(),
    });
    const wave = (n: number) => target.children.find((canvas) => canvas.dataset.wave === String(n));

    step(release('needle_combo', 0));
    expect(wave(0)!.dataset.hand).toBe('front');
    expect(wave(0)!.style.transform).toContain('translate(73px, 179px)');
    step(release('needle_combo', 1));
    expect(wave(1)!.dataset.hand).toBe('back');
    expect(wave(1)!.style.transform).toContain('translate(73px, 203px)');
    step(third);
    expect(target.children.map((canvas) => canvas.dataset.hand)).toContain('front');
  });

  it('反手拋出走低弧線，針雨由頭頂上方離手、明顯上拋再陡落', () => {
    const backhandStage = stage();
    playFeifeiNeedles(backhandStage as unknown as HTMLElement, { x: 100, y: 300 }, { x: 800, y: 300 }, {
      action: 'needle_backhand', waves: 1, impactTimes: [hit('needle_backhand')], onImpact: vi.fn(), onDone: vi.fn(),
    });
    step(release('needle_backhand') + feifeiNeedleFlightMs('needle_backhand') / 2);
    expect(backhandStage.children[0]!.dataset.route).toBe('low-arc');
    const backhandY = Number(backhandStage.children[0]!.dataset.y);
    expect(backhandY).toBeGreaterThan(300);

    const rainStage = stage();
    const rainStartedAt = clock;
    playFeifeiNeedles(rainStage as unknown as HTMLElement, { x: 100, y: 300 }, { x: 800, y: 400 }, {
      action: 'needle_rain', waves: 1, impactTimes: [hit('needle_rain')], onImpact: vi.fn(), onDone: vi.fn(),
    });
    step(rainStartedAt + release('needle_rain'));
    expect(rainStage.children[0]!.dataset).toMatchObject({ x: '55', y: '190', hands: 'overhead' });
    step(rainStartedAt + release('needle_rain') + feifeiNeedleFlightMs('needle_rain') / 2);
    expect(rainStage.children[0]!.dataset.route).toBe('up-then-drop');
    const rainY = Number(rainStage.children[0]!.dataset.y);
    expect(rainY).toBeLessThan(100);
  });

  it('見血封喉命中後短暫顯示毒花收束爆散，清乾淨才結束', () => {
    const target = stage();
    const impact = vi.fn();
    const done = vi.fn();
    playFeifeiNeedles(target as unknown as HTMLElement, { x: 100, y: 200 }, { x: 800, y: 240 }, {
      action: 'needle_venom', waves: 1, impactTimes: [570], onImpact: impact, onDone: done,
    });

    step(570);
    expect(impact).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
    expect(target.children).toHaveLength(1);
    expect(target.children[0]!.dataset).toMatchObject({
      pattern: 'needle_venom', wave: '0', phase: 'impact', effect: 'poison-flower',
    });
    step(709);
    expect(target.children).toHaveLength(1);
    step(710);
    expect(target.children).toHaveLength(0);
    expect(done).toHaveBeenCalledOnce();
  });

  it('一針斃命是唯一高速長軌跡，零真實波數不發射也不命中', () => {
    const target = stage();
    const impact = vi.fn();
    const done = vi.fn();
    playFeifeiNeedles(target as unknown as HTMLElement, { x: 100, y: 200 }, { x: 800, y: 240 }, {
      action: 'needle_pierce', waves: 0, impactTimes: [], onImpact: impact, onDone: done,
    });
    step(0);
    expect(created).toHaveLength(0);
    expect(impact).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledOnce();

    playFeifeiNeedles(target as unknown as HTMLElement, { x: 100, y: 200 }, { x: 800, y: 240 }, {
      action: 'needle_pierce', waves: 1, impactTimes: [hit('needle_pierce')], onImpact: vi.fn(), onDone: vi.fn(),
    });
    step(release('needle_pierce'));
    expect(target.children[0]!.dataset).toMatchObject({
      pattern: 'needle_pierce', route: 'piercing-line', trail: 'long', needleCount: '1',
    });
  });

  it('驚慌扇、水平扇面與雙手針網具有不同數量與路線', () => {
    const cases = [
      ['needle_retreat', 7, 'panic-converge', 'front'],
      ['needle_fan', 5, 'horizontal-fan', 'front'],
      ['needle_barrage', 12, 'wide-net', 'front-back'],
    ] as const;
    for (const [action, count, route, hands] of cases) {
      const startedAt = clock;
      const target = stage();
      playFeifeiNeedles(target as unknown as HTMLElement, { x: 100, y: 200 }, { x: 800, y: 240 }, {
        action, waves: 1, impactTimes: [hit(action)],
        onImpact: vi.fn(), onDone: vi.fn(),
      });
      step(startedAt + release(action));
      expect(target.children[0]!.dataset).toMatchObject({
        pattern: action, needleCount: String(count), route, hands,
      });
      if (action === 'needle_retreat') {
        expect(target.children[0]!.dataset).toMatchObject({ x: '75', y: '200' });
      }
    }
  });

  it('低幀率跨越多波時每波只命中一次且不建立過期畫布', () => {
    const target = stage();
    const impact = vi.fn();
    const done = vi.fn();
    playFeifeiNeedles(target as unknown as HTMLElement, { x: 100, y: 200 }, { x: 800, y: 240 }, {
      action: 'needle_combo', waves: 3, elapsed: 900, impactTimes: [380, 540, 680],
      onImpact: impact, onDone: done,
    });
    step(0);
    expect(impact.mock.calls).toEqual([[0], [1], [2]]);
    expect(done).toHaveBeenCalledOnce();
    expect(created).toHaveLength(0);
    step(1000);
    expect(impact).toHaveBeenCalledTimes(3);
  });

  it('取消可重複呼叫，移除飛行與殘餘效果後不再回呼', () => {
    const target = stage();
    const impact = vi.fn();
    const done = vi.fn();
    const cancel = playFeifeiNeedles(target as unknown as HTMLElement, { x: 100, y: 200 }, { x: 800, y: 240 }, {
      action: 'needle_venom', waves: 1, impactTimes: [570], onImpact: impact, onDone: done,
    });
    step(570);
    expect(target.children[0]!.dataset.phase).toBe('impact');
    cancel();
    cancel();
    expect(target.children).toHaveLength(0);
    expect(cancelled).toHaveLength(1);
    step(1000);
    expect(impact).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
  });

  it('同時兩張牌互不取消，並各自使用傳入舞台座標', () => {
    const target = stage();
    const firstImpact = vi.fn();
    const secondImpact = vi.fn();
    const cancelFirst = playFeifeiNeedles(target as unknown as HTMLElement, { x: 100, y: 200 }, { x: 800, y: 240 }, {
      action: 'shuriken', waves: 1, impactTimes: [hit('shuriken')], onImpact: firstImpact, onDone: vi.fn(),
    });
    step(100);
    playFeifeiNeedles(target as unknown as HTMLElement, { x: 300, y: 400 }, { x: 900, y: 500 }, {
      action: 'shuriken', waves: 1, impactTimes: [hit('shuriken')], onImpact: secondImpact, onDone: vi.fn(),
    });
    step(release('shuriken'));
    expect(target.children[0]!.style.transform).toContain('translate(73px, 191px)');
    step(100 + release('shuriken'));
    expect(target.children).toHaveLength(2);
    expect(target.children[1]!.style.transform).toContain('translate(273px, 391px)');
    cancelFirst();
    step(100 + hit('shuriken'));
    expect(firstImpact).not.toHaveBeenCalled();
    expect(secondImpact).toHaveBeenCalledOnce();
  });
});
