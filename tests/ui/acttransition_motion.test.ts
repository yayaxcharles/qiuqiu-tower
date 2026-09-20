import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCompanion: vi.fn(),
  dispose: vi.fn(),
}));

class FakeClassList {
  readonly values = new Set<string>();
  add(...names: string[]): void { for (const name of names) this.values.add(name); }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly style: Record<string, string> = {};
  readonly classList = new FakeClassList();
  removed = false;
  constructor(readonly tag = 'div') {}
  append(...nodes: FakeElement[]): void { this.children.push(...nodes); }
  addEventListener(): void {}
  remove(): void { this.removed = true; }
}

vi.mock('../../src/ui/assets', () => ({
  artUrl: () => '/assets/bg/next.webp',
  heroArtUrl: () => '/assets/sprites/hero/dangdang_walk.webp',
  localHero: () => 'dangdang',
}));
vi.mock('../../src/ui/audio', () => ({ play: vi.fn() }));
vi.mock('../../src/ui/screenbg', () => ({ tierBgKey: () => 'bg/tier2' }));
vi.mock('../../src/ui/qiuqiu-motion', () => ({
  qiuqiuMotionEnabled: () => true,
  preloadQiuqiuMotion: async () => undefined,
  createQiuqiuActor: vi.fn(),
}));
vi.mock('../../src/ui/companion-motion', () => ({
  companionMotionReady: (kind: string) => kind === 'dangdang',
  preloadCompanionMotion: async () => undefined,
  createCompanionMotionActor: mocks.createCompanion,
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

beforeEach(() => {
  vi.useFakeTimers();
  mocks.dispose.mockReset();
  mocks.createCompanion.mockReset().mockImplementation(() => ({
    element: new FakeElement('canvas'),
    foot: { x: 20, y: 90 },
    dispose: mocks.dispose,
  }));
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('location', { search: '?motion=1' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('噹噹上樓跑步轉場', () => {
  it('使用噹噹 run 畫布跨完整三秒，結束時釋放演員', async () => {
    const stage = new FakeElement() as unknown as HTMLElement;
    const done = vi.fn();

    actWalkTransition(stage, 16, done);
    await vi.dynamicImportSettled();

    expect(mocks.createCompanion).toHaveBeenCalledWith('dangdang', { height: 250, action: 'run' });
    expect((stage as unknown as FakeElement).children).toHaveLength(1);
    vi.advanceTimersByTime(2999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledOnce();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });
});
