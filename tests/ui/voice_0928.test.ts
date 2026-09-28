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
    const { voiceGroup, heroVoice } = await import('../../src/ui/voicegate');
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

vi.mock('../../src/ui/assets', () => ({ fileUrl: (path: string) => `/${path}`, BUILD: 'b1' }));
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
      json: async () => (String(url).includes('voice-map.json') ? voiceMap : {}),
      arrayBuffer: async () => new ArrayBuffer(1),
    } as Response));
    vi.stubGlobal('fetch', fetcher);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function setup() {
    const audio = await import('../../src/ui/audio');
    const voice = await import('../../src/ui/voice');
    const gate = await import('../../src/ui/voicegate');
    audio.unlockOnFirstGesture();
    events.dispatchEvent(new Event('pointerdown'));
    await flush();
    return { audio, voice, gate, ctx: TestAudioContext.instances[0]! };
  }
  const voiceFetches = () => fetcher.mock.calls.filter(([u]) => String(u).includes('/voice/'));

  it('沒互動前不出聲也不下載', async () => {
    const voice = await import('../../src/ui/voice');
    voice.speak(GA, TA);
    await flush();
    expect(fetcher.mock.calls.filter(([u]) => String(u).includes('/voice/') && !String(u).includes('voice-map.json'))).toHaveLength(0);
    expect(TestAudioContext.instances).toHaveLength(0);
  });

  it('講一句：抓查表與那一個音檔、播放、音樂壓低；講完還原', async () => {
    const { voice, ctx } = await setup();
    voice.speak(GA, TA);
    await flush();
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]!.start).toHaveBeenCalledOnce();
    expect(voiceFetches().map(([u]) => String(u))).toEqual(['/voice/voice-map.json?v=b1', `/${voiceMap[KEY_A]!.file}`]);   // 查表夾打包編號
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
    const { audio, gate, ctx } = await setup();
    gate.setVoiceOn(false);
    expect(store['qiuqiu.voice']).toBe('off');
    gate.say(GA, TA);
    await flush();
    expect(ctx.sources).toHaveLength(0);
    expect(audio.soundOn()).toBe(true);
    gate.setVoiceOn(true);
    gate.say(GA, TA);   // 經過按需載入也講得出來
    await flush();
    expect(ctx.sources).toHaveLength(1);
  });

  it('按需載入：播放本體還沒載好就叫停（換句、關對白框），那一句之後不會冒出來', async () => {
    const { gate, ctx } = await setup();
    gate.say(GA, TA);
    gate.hush();
    await flush();
    expect(ctx.sources).toHaveLength(0);
  });

  it('音檔還在下載時叫停：舊的那句下載完也不播', async () => {
    const { voice, ctx } = await setup();
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const base = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (u, ...r) => { if (String(u).endsWith('.mp3')) await hold; return base(u, ...r); });
    voice.speak(GA, TA);
    await flush();
    voice.stopVoice();
    release();
    await flush();
    expect(ctx.sources).toHaveLength(0);
    expect(duck).not.toHaveBeenCalledWith(0.5);
  });

  it('音檔 404 或解不開：安靜、音樂不留在壓低、吐槽的位置讓出來', async () => {
    const { voice, ctx } = await setup();
    const base = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (u, ...r) => (String(u).includes(voiceMap[KEY_A]!.file) ? { ok: false } as Response : base(u, ...r)));
    voice.speak(GA, TA, 'bark');
    await flush();
    expect(ctx.sources).toHaveLength(0);
    ctx.decodeAudioData.mockRejectedValueOnce(new Error('壞檔'));
    voice.speak(GB, TB, 'line');
    await flush();
    expect(ctx.sources).toHaveLength(0);
    expect(duck).not.toHaveBeenCalledWith(0.5);
    voice.speak(GB, TB, 'bark');   // 壞檔沒被快取住、位置也讓出來了：這次講得出來
    await flush();
    expect(ctx.sources).toHaveLength(1);
  });

  it('喚醒音訊環境卡住：等 1.5 秒就放棄這一句，之後照常', async () => {
    const { voice, ctx } = await setup();
    vi.useFakeTimers();
    try {
      ctx.state = 'suspended';
      ctx.resume.mockImplementation(() => new Promise(() => {}));
      voice.speak(GA, TA, 'bark');
      await flush();
      vi.advanceTimersByTime(1600);
      await flush();
      expect(ctx.sources).toHaveLength(0);
      ctx.state = 'running';
      voice.speak(GB, TB, 'bark');
      await flush();
      expect(ctx.sources).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  it('解碼好的音檔最多留 32 份：最舊的被擠掉要重抓，最近的不重抓', async () => {
    const { voice, ctx } = await setup();
    const keys = Object.keys(voiceMap).filter((k, i, all) => all.findIndex((x) => voiceMap[x]!.file === voiceMap[k]!.file) === i).slice(0, voice.KEEP + 1);
    const say = (k: string): void => voice.speak(k.split('|')[0]!, k.slice(k.indexOf('|') + 1));
    for (const k of keys) { say(k); await flush(); ctx.sources.at(-1)!.onended?.(); }
    const count = (k: string): number => fetcher.mock.calls.filter(([u]) => String(u) === `/${voiceMap[k]!.file}`).length;
    say(keys.at(-1)!); await flush();
    expect(count(keys.at(-1)!)).toBe(1);
    say(keys[0]!); await flush();
    expect(count(keys[0]!)).toBe(2);
    expect(ctx.sources).toHaveLength(keys.length + 2);
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

  it('關主換階段那一串排隊：關主講完主角才回；排隊時亂入的吐槽跳過；等超過 4 秒的丟掉', async () => {
    const { voice, ctx } = await setup();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const KEY_C = Object.keys(voiceMap)[2]!;
    const [GC, TC] = [KEY_C.split('|')[0]!, KEY_C.slice(KEY_C.indexOf('|') + 1)];
    voice.speak(GA, TA, 'queue');
    await flush();
    voice.speak(GB, TB, 'queue');          // 1.4 秒後主角回話：排著
    voice.speak(GC, TC, 'bark');           // 同時冒的一般吐槽：跳過
    await flush();
    expect(ctx.sources).toHaveLength(1);
    ctx.sources[0]!.onended?.();           // 關主講完
    await flush();
    expect(ctx.sources).toHaveLength(2);
    expect(duck).not.toHaveBeenLastCalledWith(1);   // 接著講，音樂不先彈回來
    // 過期：排了之後等超過 4 秒才輪到 → 不講
    voice.speak(GC, TC, 'queue');
    now += 4500;
    ctx.sources[1]!.onended?.();
    await flush();
    expect(ctx.sources).toHaveLength(2);
    expect(duck).toHaveBeenLastCalledWith(1);
    // 最多排兩句
    voice.speak(GA, TA, 'queue');
    await flush();
    for (const [g, t] of [[GB, TB], [GC, TC], [GA, TA]] as const) voice.speak(g, t, 'queue');
    ctx.sources[2]!.onended?.(); await flush();
    ctx.sources[3]!.onended?.(); await flush();
    ctx.sources[4]!.onended?.(); await flush();
    expect(ctx.sources).toHaveLength(5);
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
