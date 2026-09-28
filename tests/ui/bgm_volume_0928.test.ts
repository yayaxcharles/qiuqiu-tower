import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/assets', () => ({ fileUrl: (path: string) => `/${path}` }));

/*
 * 換曲淡出途中拉音量拉桿（2026-09-28 審查 低）：原本會砍掉淡出的計時器，連同「淡完接下一首」那一步一起不見，
 * 新曲永遠不會開始。拉桿這時不插手，新曲淡入照新音量。講話壓低音樂（`duckBgm`）同一條規矩。
 */
class FakeAudio {
  static made: FakeAudio[] = [];
  paused = true; volume = 1; loop = false; src: string;
  constructor(src: string) { this.src = src; FakeAudio.made.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('換曲淡出時拉音量：下一首照樣開始，音量是拉桿的新值', async () => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  const events = new EventTarget();
  const store: Record<string, string> = {};
  vi.stubGlobal('window', Object.assign(events, {
    setInterval, clearInterval,
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
  }));
  vi.stubGlobal('Audio', FakeAudio);
  const bgm = await import('../../src/ui/bgm');
  bgm.unlockBgmOnFirstGesture();
  events.dispatchEvent(new Event('pointerdown'));
  bgm.setBgm('act1');
  await Promise.resolve(); await Promise.resolve();
  vi.advanceTimersByTime(1000);
  bgm.setBgm('act2');                 // 開始淡出 act1
  vi.advanceTimersByTime(120);
  bgm.setMusicVolume(40);             // 淡出途中拉桿
  bgm.duckBgm(0.5);                   // 同時有人開口
  vi.advanceTimersByTime(1000);
  await Promise.resolve(); await Promise.resolve();
  vi.advanceTimersByTime(1000);
  const act2 = FakeAudio.made.find((a) => a.src.includes('act2'));
  expect(act2, '下一首要開始').toBeDefined();
  expect(act2!.paused).toBe(false);
  expect(act2!.volume).toBeCloseTo(0.4 * 0.5, 5);
  bgm.duckBgm(1);
  vi.advanceTimersByTime(1000);
  expect(act2!.volume).toBeCloseTo(0.4, 5);
});
