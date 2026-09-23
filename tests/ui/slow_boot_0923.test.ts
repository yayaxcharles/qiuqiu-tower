import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * 主程式開機的接線：照 `main_motion_boot.test.ts` 的作法把畫面、素材都換成替身，量速度的結果手上控制，
 * 看大檔那一條（真的那支）與音樂延後拿到什麼。
 */
const boot = vi.hoisted(() => ({
  speed: null as null | ((v: 'fast' | 'slow') => void),
  opening: null as null | (() => void),
  deferred: [] as Promise<unknown>[],
}));
vi.mock('../../src/ui/app', () => ({ App: class { show = vi.fn(); } }));
vi.mock('../../src/ui/lazy-screen', () => ({ registerLazyScreen: vi.fn() }));
vi.mock('../../src/ui/assets', () => ({
  loadManifest: () => Promise.resolve(),
  preloadArt: () => new Promise<void>((r) => { boot.opening = r; }),
}));
vi.mock('../../src/ui/preload', () => ({ preloadAct: () => Promise.resolve() }));
vi.mock('../../src/ui/audio', () => ({ unlockOnFirstGesture: vi.fn() }));
vi.mock('../../src/ui/bgm', () => ({ unlockBgmOnFirstGesture: vi.fn(), deferBgm: (p: Promise<unknown>) => { boot.deferred.push(p); } }));
vi.mock('../../src/ui/netspeed', () => ({ probeNetSpeed: () => new Promise((r) => { boot.speed = r; }) }));
vi.mock('../../src/ui/screenbg', () => ({ applyArtVars: vi.fn() }));
for (const s of ['actclear', 'chest', 'bossdoor', 'map', 'rest', 'result', 'reward', 'shop', 'title', 'heroselect']) {
  vi.doMock(`../../src/ui/screens/${s}`, () => ({}));
}

describe('主程式開機：快照原本、慢才讓路', () => {
  beforeEach(() => {
    vi.resetModules();
    boot.speed = null; boot.opening = null; boot.deferred = [];
    vi.stubGlobal('document', { getElementById: () => ({}) });
    vi.stubGlobal('window', { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) });
    vi.stubGlobal('location', { search: '' });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  async function start() {
    await import('../../src/main');
    await vi.waitFor(() => expect(boot.speed).not.toBeNull());
    const lane = await import('../../src/ui/heavy-lane');
    return lane;
  }
  const settle = async (p: Promise<unknown>): Promise<boolean> => {
    let done = false; void p.then(() => { done = true; });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    return done;
  };

  it('量速度的那一下先掛著；量到快：放行、不設上限，音樂不等', async () => {
    const lane = await start();
    expect(lane._heavyLaneStateForTest().holds).toBe(1);
    boot.speed!('fast');
    await vi.waitFor(() => expect(lane._heavyLaneStateForTest().holds).toBe(0));
    expect(lane._heavyLaneStateForTest().limit).toBe(Infinity);
    expect(boot.deferred).toHaveLength(1);
    expect(await settle(boot.deferred[0]!), '快網路音樂不等開場那一批').toBe(true);
  });

  it('量到慢：同時兩張、開場那一批抓完才放行；音樂也等那一批', async () => {
    const lane = await start();
    boot.speed!('slow');
    await vi.waitFor(() => expect(lane._heavyLaneStateForTest().limit).toBe(2));
    expect(lane._heavyLaneStateForTest().holds).toBe(1);
    expect(await settle(boot.deferred[0]!)).toBe(false);
    boot.opening!();
    await vi.waitFor(() => expect(lane._heavyLaneStateForTest().holds).toBe(0));
    expect(await settle(boot.deferred[0]!)).toBe(true);
  });
});
