import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playMotionPreviewAction } from '../../src/ui/motion-preview';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function actor() {
  return {
    element: { style: { opacity: '' } } as HTMLCanvasElement,
    play: vi.fn(), dispose: vi.fn(),
  };
}

describe('動作展示的收尾與狀態', () => {
  it.each(['attack1', 'attack2', 'attack3', 'attack4', 'kick'] as const)('%s 播完接回持續呼吸', (action) => {
    const a = actor();
    playMotionPreviewAction(a, action, 520);
    expect(a.play).toHaveBeenLastCalledWith(action);
    vi.advanceTimersByTime(519);
    expect(a.play).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(a.play).toHaveBeenLastCalledWith('idle');
  });

  it.each(['poison', 'belly', 'puff', 'stealth'] as const)('%s 保留狀態演出，不被一般待機蓋掉', (action) => {
    const a = actor();
    playMotionPreviewAction(a, action, 1520);
    vi.advanceTimersByTime(20000);
    expect(a.play).toHaveBeenCalledExactlyOnceWith(action);
    expect(a.element.style.opacity).toBe(action === 'stealth' ? '.58' : '');
  });

  it('切到狀態時取消上一招收尾，不讓舊計時器蓋回普通待機', () => {
    const a = actor();
    const stop = playMotionPreviewAction(a, 'attack1', 500);
    vi.advanceTimersByTime(100);
    stop();
    playMotionPreviewAction(a, 'stealth', 1620);
    vi.advanceTimersByTime(3000);
    expect(a.play).toHaveBeenLastCalledWith('stealth');
    expect(a.play).toHaveBeenCalledTimes(2);
    playMotionPreviewAction(a, 'idle', 0);
    expect(a.element.style.opacity).toBe('');
  });
});
