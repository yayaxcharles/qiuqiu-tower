import { readFileSync, existsSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/assets', () => ({ fileUrl: (path: string) => `/${path}` }));

/*
 * 2026-10-11 第二批新曲與新音效：檔案要在、選曲要接上、過場音樂壓低背景音樂不能被配音提早還原。
 */
const src = (p: string): string => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

it('新曲的檔案都在 public/bgm', () => {
  for (const n of ['title', 'boss2', 'elite2', 'elite3', 'battle2', 'battle3']) expect(existsSync(`public/bgm/${n}.mp3`), n).toBe(true);
});

it('選曲：標題放 title；第二關關主放 boss2；大魔物三關各一首', () => {
  const app = src('src/ui/app.ts');
  expect(app).toContain("case 'title': return 'title';");
  expect(app).toContain("(['elite', 'elite2', 'elite3'] as const)[actIdx]");
  expect(app).toContain("run.act >= ACTS ? 'finalboss' : run.act === 2 ? 'boss2' : 'boss'");
  expect(app).toContain("pool === '大魔物' ? eliteTrack : battleTrack");
});

it('拆出來的音效接在對的地方，過關與關主門前改放過場音樂', () => {
  expect(src('src/ui/screens/chest.ts')).not.toContain("play('relic')");
  expect(src('src/ui/screens/event.ts')).toContain("play('rare')");
  expect(src('src/ui/screens/event.ts')).toContain("play('reward')");
  expect(src('src/ui/screens/rest.ts')).toContain("play('purify')");
  expect(src('src/ui/screens/rest.ts'), '單人版清心香也要換（審查 中-1）').not.toContain("play('relic');\n        afterPurify");
  expect(src('src/ui/screens/actclear.ts')).toContain("play('fanfare')");
  expect(src('src/ui/screens/actclear.ts')).not.toContain("play('victory')");
  expect(src('src/ui/screens/bossdoor.ts')).toContain("play('bossdoor')");
});

class FakeAudio {
  paused = true; volume = 1; loop = false; src: string;
  constructor(s: string) { this.src = s; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

it('過場音樂壓著背景音樂時，配音講完傳 1 不會把它提早放大', async () => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  const events = new EventTarget();
  vi.stubGlobal('window', Object.assign(events, { setInterval, clearInterval, localStorage: { getItem: () => null, setItem: () => undefined } }));
  let made: FakeAudio | null = null;
  vi.stubGlobal('Audio', class extends FakeAudio { constructor(s: string) { super(s); made = this; } });
  const bgm = await import('../../src/ui/bgm');
  bgm.unlockBgmOnFirstGesture();
  events.dispatchEvent(new Event('pointerdown'));
  bgm.setBgm('title');
  await Promise.resolve(); await Promise.resolve();
  vi.advanceTimersByTime(1000);
  const a = made as unknown as FakeAudio;
  expect(a.src).toBe('/bgm/title.mp3');
  expect(a.volume).toBeCloseTo(0.15, 5);
  bgm.duckBgm(0.35, 'sting');
  bgm.duckBgm(0.5);                    // 配音開口
  vi.advanceTimersByTime(1000);
  expect(a.volume).toBeCloseTo(0.15 * 0.35, 5);
  bgm.duckBgm(1);                      // 配音講完
  vi.advanceTimersByTime(1000);
  expect(a.volume, '過場音樂還在放，維持壓低').toBeCloseTo(0.15 * 0.35, 5);
  bgm.duckBgm(1, 'sting');
  vi.advanceTimersByTime(1000);
  expect(a.volume).toBeCloseTo(0.15, 5);
});
