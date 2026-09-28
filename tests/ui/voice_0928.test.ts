import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { assetHash } from '../../tools/vite-asset-hash';

/*
 * 日文配音接線（2026-09-28，`src/ui/voice.ts`）：
 * 1. 查表裡每一句都真的會出現在畫面上（重用 `tools/voice/dump_lines.ts` 的盤點）；
 * 2. 音效關掉＝配音沒聲音、語音開關也管得住；吐槽不疊播；
 * 3. 開場下載的東西（清單、預載、離線快取）裡沒有配音。
 */

type VoiceMap = Record<string, { file: string; dur: number }>;
const voiceMap = JSON.parse(readFileSync(resolve('public/voice/voice-map.json'), 'utf-8')) as VoiceMap;

describe('查表的每一句都走得到', () => {
  let shown: Set<string>;
  beforeAll(async () => {
    let out = '';
    // 盤點腳本一載入就把結果寫到標準輸出；這裡攔下來（這個專案的型別宣告沒有 node 的 process，從 globalThis 拿）
    const stdout = (globalThis as unknown as { process: { stdout: { write(s: string): boolean } } }).process.stdout;
    const spy = vi.spyOn(stdout, 'write').mockImplementation((s: string) => { out += s; return true; });
    try { await import('../../tools/voice/dump_lines'); } finally { spy.mockRestore(); }
    const dump = JSON.parse(out) as { lines: { speaker: string; text: string }[] };
    shown = new Set(dump.lines.map((l) => `${l.speaker}|${l.text}`));
  });

  it('voice-map.json 的鍵＝（聲音角色, 畫面上最終那句中文）都在盤點裡', () => {
    const unreachable = Object.keys(voiceMap).filter((k) => !shown.has(k));
    expect(unreachable).toEqual([]);
    expect(Object.keys(voiceMap).length).toBeGreaterThan(500);
  });

  it('查表指到的音檔都在', () => {
    const missing = Object.values(voiceMap).filter((c) => !existsSync(resolve('public', c.file)));
    expect(missing).toEqual([]);
  });

  it('遊戲端的說話者判斷跟盤點腳本一致', async () => {
    const { voiceGroup, heroVoice } = await import('../../src/ui/voice');
    expect(voiceGroup('旁白')).toBeNull();
    expect(voiceGroup('球球', { hero: 'feifei' })).toBe('feifei');
    expect(voiceGroup('球球', { hero: 'feifei', literal: true })).toBe('ninja');
    expect(voiceGroup('封封', { literal: true })).toBe('fengfeng');
    expect(voiceGroup('大俠貓')).toBe('daxia');
    expect(voiceGroup('村貓')).toBe('villager');
    expect(voiceGroup('黑貓忍者頭目')).toBe('ninja_boss');
    expect(voiceGroup('塔主')).toBe('daxia');
    expect(voiceGroup('塔主', { bossId: 'tower_master' })).toBe('daxia');
    expect(voiceGroup('塔主', { bossId: 'nekomata' })).toBe('nekomata');
    expect(heroVoice('噹噹')).toBe('dangdang');
    expect(heroVoice('行腳商')).toBeNull();
    // 查表用到的聲音角色，都是這支判斷回得出來的
    const groups = new Set(Object.keys(voiceMap).map((k) => k.split('|')[0]!));
    for (const g of groups) expect(existsSync(resolve('public/voice', g))).toBe(true);
  });
});

// ---- 播放 ----

vi.mock('../../src/ui/assets', () => ({ fileUrl: (path: string) => `/${path}` }));
const duck = vi.fn();
vi.mock('../../src/ui/bgm', () => ({ duckBgm: (k: number) => duck(k) }));

class TestAudioContext {
  static instances: TestAudioContext[] = [];
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {};
  sources: { buffer: unknown; connect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  decodeAudioData = vi.fn(async () => ({ length: 1 } as AudioBuffer));
  constructor() { TestAudioContext.instances.push(this); }
  createGain() { return { gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn((t: unknown) => t) }; }
  createBufferSource() {
    const node = { buffer: null as unknown, connect: vi.fn((t: unknown) => t), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
    this.sources.push(node);
    return node;
  }
}
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }

describe('配音播放', () => {
  const KEY_A = Object.keys(voiceMap)[0]!;
  const KEY_B = Object.keys(voiceMap)[1]!;
  const [GA, TA] = [KEY_A.split('|')[0]!, KEY_A.slice(KEY_A.indexOf('|') + 1)];
  const [GB, TB] = [KEY_B.split('|')[0]!, KEY_B.slice(KEY_B.indexOf('|') + 1)];
  let events: EventTarget;
  let store: Record<string, string>;
  let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    vi.resetModules();
    duck.mockClear();
    TestAudioContext.instances = [];
    events = new EventTarget();
    store = {};
    vi.stubGlobal('window', Object.assign(events, { localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    } }));
    vi.stubGlobal('AudioContext', TestAudioContext);
    fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => ({
      ok: true,
      json: async () => (String(url).endsWith('voice-map.json') ? voiceMap : {}),
      arrayBuffer: async () => new ArrayBuffer(1),
    } as Response));
    vi.stubGlobal('fetch', fetcher);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function setup() {
    const audio = await import('../../src/ui/audio');
    const voice = await import('../../src/ui/voice');
    audio.unlockOnFirstGesture();
    events.dispatchEvent(new Event('pointerdown'));
    await flush();
    return { audio, voice, ctx: TestAudioContext.instances[0]! };
  }
  const voiceFetches = () => fetcher.mock.calls.filter(([u]) => String(u).includes('/voice/'));

  it('沒互動前不出聲也不下載', async () => {
    const voice = await import('../../src/ui/voice');
    voice.speak(GA, TA);
    await flush();
    expect(fetcher.mock.calls.filter(([u]) => String(u).includes('/voice/') && !String(u).endsWith('voice-map.json'))).toHaveLength(0);
    expect(TestAudioContext.instances).toHaveLength(0);
  });

  it('講一句：抓查表與那一個音檔、播放、音樂壓低；講完還原', async () => {
    const { voice, ctx } = await setup();
    voice.speak(GA, TA);
    await flush();
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]!.start).toHaveBeenCalledOnce();
    expect(voiceFetches().map(([u]) => String(u))).toEqual(['/voice/voice-map.json', `/${voiceMap[KEY_A]!.file}`]);
    expect(duck).toHaveBeenLastCalledWith(0.5);
    ctx.sources[0]!.onended?.();
    expect(duck).toHaveBeenLastCalledWith(1);
  });

  it('音效關掉＝配音不出聲；講到一半關音效會當場停', async () => {
    const { audio, voice, ctx } = await setup();
    voice.speak(GA, TA);
    await flush();
    audio.setSoundOn(false);
    expect(ctx.sources[0]!.stop).toHaveBeenCalled();
    expect(duck).toHaveBeenLastCalledWith(1);
    voice.speak(GB, TB);
    await flush();
    expect(ctx.sources).toHaveLength(1);
  });

  it('語音開關關掉也不出聲，音效照常', async () => {
    const { audio, voice, ctx } = await setup();
    voice.setVoiceOn(false);
    expect(store['qiuqiu.voice']).toBe('off');
    voice.speak(GA, TA);
    await flush();
    expect(ctx.sources).toHaveLength(0);
    expect(audio.soundOn()).toBe(true);
  });

  it('查不到的句子安靜、不下載音檔', async () => {
    const { voice, ctx } = await setup();
    voice.speak('ninja', '這句沒有配音喵');
    voice.speak(null, '旁白');
    await flush();
    expect(ctx.sources).toHaveLength(0);
    expect(voiceFetches().filter(([u]) => String(u).endsWith('.mp3'))).toHaveLength(0);
  });

  it('吐槽不疊播：一句在講時下一句跳過；主線那句會蓋掉前一句', async () => {
    const { voice, ctx } = await setup();
    voice.speak(GA, TA, 'bark');
    voice.speak(GB, TB, 'bark');
    await flush();
    expect(ctx.sources).toHaveLength(1);
    voice.speak(GB, TB, 'line');
    await flush();
    expect(ctx.sources[0]!.stop).toHaveBeenCalled();
    expect(ctx.sources).toHaveLength(2);
  });
});

// ---- 首載不含配音 ----

describe('開場下載的東西裡沒有配音', () => {
  it('素材清單、預載程式、離線快取規則都不碰 voice/', () => {
    expect(readFileSync(resolve('public/assets/manifest.json'), 'utf-8')).not.toContain('voice/');
    expect(readFileSync(resolve('index.html'), 'utf-8')).not.toContain('voice/');
    for (const f of ['src/ui/preload.ts', 'src/ui/assets.ts', 'src/ui/assetcache.ts', 'src/main.ts']) {
      expect(readFileSync(resolve(f), 'utf-8'), f).not.toMatch(/voice\//);
    }
    const sw = readFileSync(resolve('public/sw.js'), 'utf-8');
    const re = new RegExp(/const HASHED_IMAGE = \/(.+)\/;/.exec(sw)![1]!);
    expect(re.test('/qiuqiu-tower/voice/ninja/ninja_0493ee80-AbCdEf12.mp3')).toBe(false);
    expect(re.test('/qiuqiu-tower/voice/voice-map.json')).toBe(false);
  });

  const root = mkdtempSync(join(tmpdir(), 'qiuqiu-voice-'));
  const outDir = join(root, 'dist');
  afterAll(() => {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes('qiuqiu-voice-')) throw new Error('測試暫存目錄不在預期範圍');
    rmSync(root, { recursive: true, force: true });
  });

  it('打包後：音檔加雜湊、查表改寫成新名字，清單的 files 平表不收配音', () => {
    mkdirSync(join(outDir, 'assets'), { recursive: true });
    mkdirSync(join(outDir, 'voice/ninja'), { recursive: true });
    writeFileSync(join(outDir, 'assets/manifest.json'), JSON.stringify({ cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] }));
    writeFileSync(join(outDir, 'voice/ninja/a.mp3'), 'mp3-a');
    writeFileSync(join(outDir, 'voice/voice-map.json'), JSON.stringify({ 'ninja|甲': { file: 'voice/ninja/a.mp3', dur: 1 } }));
    const plugin = assetHash() as unknown as {
      configResolved(config: { root: string; build: { outDir: string } }): void;
      closeBundle(): void;
    };
    plugin.configResolved({ root, build: { outDir: 'dist' } });
    plugin.closeBundle();
    const manifest = readFileSync(join(outDir, 'assets/manifest.json'), 'utf-8');
    expect(manifest).not.toContain('voice/');
    const map = JSON.parse(readFileSync(join(outDir, 'voice/voice-map.json'), 'utf-8')) as VoiceMap;
    const file = map['ninja|甲']!.file;
    expect(file).toMatch(/^voice\/ninja\/a-[A-Za-z0-9_-]{8}\.mp3$/);
    expect(readdirSync(join(outDir, 'voice/ninja'))).toEqual([file.split('/').pop()]);
  });
});
