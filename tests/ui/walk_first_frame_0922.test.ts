import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 過關走路轉場一開頭的靜態圖（2026-09-22 複驗：球球、噹噹淡入時先露出舊畫風約 0.17 秒）。
 *
 * 修法：靜態圖 `hero/<代號>_walk` 換成轉場畫布一開始畫的那一格（`run` 第 1 格），
 * 照轉場的比例、落腳點畫進原本的畫布（`tools/build_walk_first_frame.py`，閘門不過整批不寫）；
 * 等動作的那一小段靜態圖不晃、不加影子（`.actwalk-await`），換上畫布時一模一樣。
 *
 * 這裡守：①線上的四張就是閘門量過的那一版；②那一版取的格、比例、落腳點跟**現在的**
 * 動作資料、轉場程式、樣式表對得上（誰改了其中一邊，這裡就紅，要重跑工具）。
 */
interface Entry {
  file: string; canvas: [number, number]; hero: string; action: string; frame: number;
  texture: string; textureSha256: string; rect: number[]; pivot: number[]; scale: number;
  canvasPerAtlasPx: number; pivotCanvas: [number, number]; stageIou: number; stageCentroidDiff: number; sha256: string;
}
const src = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const RECORD = JSON.parse(readFileSync('tools/motion-art-source/walk/record.json', 'utf8')) as Record<string, Entry>;
const HEROES = [
  { hero: 'qiuqiu', key: 'ninja', data: 'src/ui/qiuqiu-motion-data.json' },
  { hero: 'feifei', key: 'feifei', data: 'src/ui/feifei-motion-data.json' },
  { hero: 'dangdang', key: 'dangdang', data: 'src/ui/dangdang-motion-data.json' },
  { hero: 'fengfeng', key: 'fengfeng', data: 'src/ui/fengfeng-motion-data.json' },
] as const;
const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const canvasOf = (path: string): [number, number] => {
  const b = readFileSync(path);
  expect(new TextDecoder().decode(b.subarray(12, 16)), path).toBe('VP8X');
  const read24 = (at: number): number => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
  return [1 + read24(24), 1 + read24(27)];
};
const num = (re: RegExp, text: string, what: string): number => {
  const m = re.exec(text);
  expect(m, what).not.toBeNull();
  return Number(m![1]);
};

describe('走路轉場的靜態圖＝跑步動作第 1 格', () => {
  it('四張都是閘門量過的那一版（雜湊對得上、畫布大小照舊）', () => {
    for (const { key } of HEROES) {
      const e = RECORD[`public/assets/sprites/hero/${key}_walk.webp`]!;
      expect(e, key).toBeDefined();
      expect(sha(e.file), e.file).toBe(e.sha256);
      expect(canvasOf(e.file), e.file).toEqual(key === 'fengfeng' ? [560, 560] : [560, 547]);
      expect(e.stageIou, e.file).toBeGreaterThanOrEqual(0.97);
      expect(e.stageCentroidDiff, e.file).toBeLessThanOrEqual(0.35);
    }
    expect(Object.keys(RECORD)).toHaveLength(4);
  });

  it('取的就是現在動作資料裡 run 的第 1 格（圖集沒換過）', () => {
    for (const { key, data } of HEROES) {
      const e = RECORD[`public/assets/sprites/hero/${key}_walk.webp`]!;
      const run = (JSON.parse(src(data)) as { actions: Record<string, { texture: string; scale: number; frames: { rect: number[]; pivot: number[] }[] }> }).actions['run']!;
      expect([e.action, e.frame, e.texture, e.scale], key).toEqual(['run', 0, run.texture, run.scale]);
      expect(e.rect, key).toEqual(run.frames[0]!.rect);
      expect(e.pivot, key).toEqual(run.frames[0]!.pivot);
      expect(sha(`public/${run.texture}`), `${key} 的跑步圖集換過了，要重跑 tools/build_walk_first_frame.py`).toBe(e.textureSha256);
    }
  });

  it('同比例、同落腳點：靜態圖在舞台上的大小與腳底那一點＝轉場畫布的', () => {
    const ts = src('src/ui/acttransition.ts');
    const actorHeight = num(/createQiuqiuActor\(\{ height: (\d+), action: 'run' \}\)/, ts, '球球的轉場畫布高');
    expect(num(/createCompanionMotionActor\(hero, \{ height: (\d+), action: 'run' \}\)/, ts, '同伴的轉場畫布高')).toBe(actorHeight);
    const footX = num(/left = `\$\{(\d+) - actor\.foot\.x\}px`/, ts, '落腳點 x');
    const footY = num(/top = `\$\{(\d+) - actor\.foot\.y\}px`/, ts, '落腳點 y');
    const native = num(/const NATIVE_IDLE_HEIGHT = (\d+);/, src('src/ui/qiuqiu-motion.ts'), '球球的原生高');
    const css = src('src/ui/styles/base.css');
    const block = /\.actwalk-cat \{([^}]*)\}/.exec(css)![1]!;
    const left = num(/left: (\d+)px/, block, '.actwalk-cat left');
    const bottom = num(/bottom: (\d+)px/, block, '.actwalk-cat bottom');
    const width = num(/width: (\d+)px/, block, '.actwalk-cat width');
    for (const { key, data } of HEROES) {
      const e = RECORD[`public/assets/sprites/hero/${key}_walk.webp`]!;
      const nativeHeight = key === 'ninja' ? native : (JSON.parse(src(data)) as { nativeHeight: number }).nativeHeight;
      const [cw, ch] = e.canvas;
      const perCanvasPx = width / cw;                                   // 靜態圖：1 畫布像素＝幾舞台像素
      const actorScale = e.scale * actorHeight / nativeHeight;          // 轉場畫布：1 圖集像素＝幾舞台像素
      expect(e.canvasPerAtlasPx * perCanvasPx, `${key} 比例`).toBeCloseTo(actorScale, 5);
      // 靜態圖的落腳點換到舞台座標（圖貼底：底邊在 720 − bottom）
      const stageX = left + e.pivotCanvas[0] * perCanvasPx;
      const stageY = 720 - bottom - (ch - e.pivotCanvas[1]) * perCanvasPx;
      expect(stageX, `${key} 落腳點 x`).toBeCloseTo(footX, 2);
      expect(stageY, `${key} 落腳點 y`).toBeCloseTo(footY, 2);
    }
  });

  it('等動作的那一小段靜態圖不晃、不加影子（樣式表）', () => {
    const css = src('src/ui/styles/act-motion.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /\.actwalk-await \.actwalk-cat \{([^}]*)\}/.exec(css);
    expect(rule, '.actwalk-await .actwalk-cat').not.toBeNull();
    expect(rule![1]).toMatch(/animation: none/);
    expect(rule![1]).toMatch(/filter: none/);
  });
});

/* ---------- 轉場本身：等動作時掛 actwalk-await、載不到就拿掉（照舊晃著走） ---------- */
const mocks = vi.hoisted(() => ({ preload: vi.fn(), create: vi.fn() }));

class FakeClassList {
  readonly values = new Set<string>();
  add(...names: string[]): void { for (const name of names) this.values.add(name); }
  remove(...names: string[]): void { for (const name of names) this.values.delete(name); }
}
class FakeElement {
  readonly children: FakeElement[] = [];
  readonly style: Record<string, string> = {};
  readonly classList = new FakeClassList();
  constructor(readonly tag = 'div') {}
  append(...nodes: FakeElement[]): void { this.children.push(...nodes); }
  addEventListener(): void {}
  remove(): void {}
}

vi.mock('../../src/ui/assets', () => ({
  artUrl: () => '/assets/bg/next.webp',
  heroArtUrl: () => '/assets/sprites/hero/dangdang_walk.webp',
  localHero: () => 'dangdang',
}));
vi.mock('../../src/ui/audio', () => ({ play: vi.fn() }));
vi.mock('../../src/ui/screenbg', () => ({ tierBgKey: () => 'bg/tier2' }));
vi.mock('../../src/ui/companion-motion', () => ({
  preloadCompanionMotion: mocks.preload,
  createCompanionMotionActor: mocks.create,
}));
vi.mock('../../src/ui/dom', () => ({
  el: (tag: string, attrs: Record<string, unknown> = {}, ...children: FakeElement[]) => {
    const node = new FakeElement(tag);
    if (typeof attrs.class === 'string') node.classList.add(...attrs.class.split(/\s+/));
    node.append(...children.filter((child) => child instanceof FakeElement));
    return node;
  },
}));

import { actWalkTransition } from '../../src/ui/acttransition';

describe('走路轉場：等動作時靜態圖先定住', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.preload.mockReset().mockResolvedValue(undefined);
    mocks.create.mockReset().mockImplementation(() => ({ element: new FakeElement('canvas'), foot: { x: 20, y: 90 }, dispose: vi.fn() }));
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('location', { search: '' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const overlayOf = (stage: FakeElement): FakeElement => stage.children[0]!;

  it('要播動作：一開始就掛 actwalk-await（靜態圖不晃）', () => {
    const stage = new FakeElement();
    actWalkTransition(stage as unknown as HTMLElement, 16, () => {});
    expect(overlayOf(stage).classList.values.has('actwalk-await')).toBe(true);
  });

  it('動作載不到：拿掉 actwalk-await，照舊晃著走', async () => {
    mocks.preload.mockRejectedValue(new Error('404'));
    const stage = new FakeElement();
    actWalkTransition(stage as unknown as HTMLElement, 16, () => {});
    await vi.dynamicImportSettled();
    await Promise.resolve();
    expect(overlayOf(stage).classList.values.has('actwalk-await')).toBe(false);
    expect(overlayOf(stage).classList.values.has('actwalk-motion')).toBe(false);
  });

  it('關掉動作（?motion=0）：一開始就不掛', () => {
    vi.stubGlobal('location', { search: '?motion=0' });
    const stage = new FakeElement();
    actWalkTransition(stage as unknown as HTMLElement, 16, () => {});
    expect(overlayOf(stage).classList.values.has('actwalk-await')).toBe(false);
  });
});
