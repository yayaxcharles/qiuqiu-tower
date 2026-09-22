import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actWalkTransition } from '../../src/ui/acttransition';

const mocks = vi.hoisted(() => ({
  dispose: vi.fn(), then: vi.fn(), step: vi.fn(), companion: vi.fn(),
  preloadCompanion: vi.fn<() => Promise<void>>(), hero: 'ninja',
}));
vi.mock('../../src/ui/assets', () => ({
  artUrl: () => '/scene.webp', heroArtUrl: () => '/cat.webp', localHero: () => mocks.hero,
}));
vi.mock('../../src/ui/screenbg', () => ({ tierBgKey: () => 'bg/mid' }));
vi.mock('../../src/ui/audio', () => ({ play: mocks.step }));
vi.mock('../../src/ui/qiuqiu-motion', () => ({
  qiuqiuMotionEnabled: () => true,
  preloadQiuqiuMotion: async () => undefined,
  createQiuqiuActor: () => ({ element: { style: {} }, foot: { x: 145, y: 269 }, dispose: mocks.dispose }),
}));
vi.mock('../../src/ui/companion-motion', () => ({
  companionMotionReady: () => true,
  preloadCompanionMotion: mocks.preloadCompanion,
  createCompanionMotionActor: (...args: unknown[]) => {
    mocks.companion(...args);
    return { element: { style: {} }, foot: { x: 145, y: 269 }, dispose: mocks.dispose };
  },
}));
vi.mock('../../src/ui/dom', () => ({
  el: (_tag: string, attrs: Record<string, string>, ...children: unknown[]) => ({
    attrs, children, classList: { add: vi.fn(), remove: vi.fn() }, remove: vi.fn(),   // remove：載不到時拿掉 actwalk-await
    handlers: {} as Record<string, () => void>,
    append(this: { children: unknown[] }, ...nodes: unknown[]) { this.children.push(...nodes); },
    addEventListener(this: { handlers: Record<string, () => void> }, type: string, fn: () => void) { this.handlers[type] = fn; },
  }),
}));

describe('逐格跑步轉場的收尾', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('location', { search: '?motion=1' });
    mocks.preloadCompanion.mockResolvedValue(undefined);
    mocks.hero = 'ninja';
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function start() {
    let overlay: { handlers: Record<string, () => void>; remove: ReturnType<typeof vi.fn> };
    const stage = { append: (node: typeof overlay) => { overlay = node; } } as unknown as HTMLElement;
    const cancel = actWalkTransition(stage, 16, mocks.then);
    return { cancel, overlay: overlay! };
  }

  it('三秒後才換場，停止動畫與腳步，淡出後移除遮罩', async () => {
    const { overlay } = start();
    await vi.dynamicImportSettled();
    vi.advanceTimersByTime(2999);
    expect(mocks.then).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mocks.then).toHaveBeenCalledTimes(1);
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
    const steps = mocks.step.mock.calls.length;
    vi.runAllTimers();
    expect(mocks.step).toHaveBeenCalledTimes(steps);
    expect(overlay.remove).toHaveBeenCalledTimes(1);
  });

  it('連點跳過只換場一次，也不留延遲腳步', async () => {
    const { overlay } = start();
    await vi.dynamicImportSettled();
    overlay.handlers['pointerdown']!();
    overlay.handlers['pointerdown']!();
    vi.runAllTimers();
    expect(mocks.then).toHaveBeenCalledTimes(1);
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.step).not.toHaveBeenCalled();
  });

  it('離開或重開試打可取消轉場，不再呼叫舊的換頁動作', async () => {
    const { cancel, overlay } = start();
    cancel();
    await vi.dynamicImportSettled();
    vi.runAllTimers();
    expect(mocks.then).not.toHaveBeenCalled();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
    expect(overlay.remove).toHaveBeenCalledTimes(1);
    expect(mocks.step).not.toHaveBeenCalled();
  });

  it('菲菲換場使用她自己的 run 逐格，不借球球演員', async () => {
    mocks.hero = 'feifei';
    const { cancel } = start();
    await vi.dynamicImportSettled();
    expect(mocks.companion).toHaveBeenCalledWith('feifei', { height: 250, action: 'run' });
    cancel();
  });

  it('封封換場使用她自己的 run 逐格', async () => {
    mocks.hero = 'fengfeng';
    const { cancel } = start();
    await vi.dynamicImportSettled();
    expect(mocks.companion).toHaveBeenCalledWith('fengfeng', { height: 250, action: 'run' });
    cancel();
  });

  it('逐格素材載入失敗時保留靜態轉場，三秒後仍只換場一次', async () => {
    mocks.hero = 'feifei';
    mocks.preloadCompanion.mockRejectedValueOnce(new Error('decode failed'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { overlay } = start();
    await vi.dynamicImportSettled();
    await Promise.resolve();

    vi.advanceTimersByTime(3000);
    expect(mocks.then).toHaveBeenCalledTimes(1);
    expect(mocks.dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(460);
    expect(overlay.remove).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});
