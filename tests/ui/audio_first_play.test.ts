import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/assets', () => ({ fileUrl: (path: string) => `/${path}` }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function gain() {
  return { gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn((target: unknown) => target) };
}

class TestAudioContext {
  static instances: TestAudioContext[] = [];
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {};
  gains: ReturnType<typeof gain>[] = [];
  sources: { buffer: AudioBuffer | null; playbackRate: { value: number }; connect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> }[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  decodeAudioData = vi.fn(async (_data: ArrayBuffer) => ({ length: 1 } as AudioBuffer));
  constructor() { TestAudioContext.instances.push(this); }
  createGain() { const node = gain(); this.gains.push(node); return node; }
  createBufferSource() {
    const node = { buffer: null as AudioBuffer | null, playbackRate: { value: 1 }, connect: vi.fn((target: unknown) => target), start: vi.fn() };
    this.sources.push(node);
    return node;
  }
}

const response = (ok = true) => ({ ok, arrayBuffer: async () => new ArrayBuffer(1) } as Response);
// 音檔下載、陣列轉換、解碼、播放都有非同步邊界；排空它們，不依賴真實計時。
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

describe('第一次播放音效的載入與解鎖', () => {
  let events: EventTarget;
  let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
  let stored: string | null;
  let now: number;

  beforeEach(() => {
    vi.resetModules();
    TestAudioContext.instances = [];
    events = new EventTarget();
    stored = null;
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('window', Object.assign(events, { localStorage: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; },
    } }));
    vi.stubGlobal('AudioContext', TestAudioContext);
    fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetcher);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function unlock() {
    const audio = await import('../../src/ui/audio');
    audio.unlockOnFirstGesture();
    events.dispatchEvent(new Event('pointerdown'));
    await flush();
    return { audio, context: TestAudioContext.instances[0]! };
  }

  it('第一次按開箱時，等正在預載的秘寶音解碼完就播放', async () => {
    const download = deferred<Response>();
    fetcher.mockImplementation(async (url) => String(url).includes('/relic.mp3') ? download.promise : response());
    const { audio, context } = await unlock();
    const preloaded = fetcher.mock.calls.filter(([url]) => String(url).includes('/relic.mp3')).length;
    audio.play('relic');
    expect(context.sources).toHaveLength(0);
    download.resolve(response());
    await flush();
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]!.start).toHaveBeenCalledOnce();
    expect(preloaded).toBe(1);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/relic.mp3'))).toHaveLength(1);
  });

  it('未預載的音效第一次也會播放，連續呼叫共用下載但各播一聲', async () => {
    const { audio, context } = await unlock();
    const download = deferred<Response>();
    fetcher.mockReturnValue(download.promise);
    audio.play('upgrade', 0.9);
    audio.play('upgrade', 1.1);
    expect(context.sources).toHaveLength(0);
    download.resolve(response());
    await flush();
    expect(context.sources.map((source) => source.playbackRate.value)).toEqual([0.9, 1.1]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/upgrade.mp3'))).toHaveLength(1);
  });

  it('第一次手勢的按鈕音會等待已開始的預載', async () => {
    const download = deferred<Response>();
    fetcher.mockReturnValue(download.promise);
    const { audio, context } = await unlock();
    audio.play('click');
    download.resolve(response());
    await flush();
    expect(context.sources).toHaveLength(1);
  });

  it('已載好而且正在運作時當場播放，保留音量與播放速度', async () => {
    const { audio, context } = await unlock();
    audio.play('click', 1.2);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]!.playbackRate.value).toBe(1.2);
    expect(context.gains[1]!.gain.value).toBe(0.4);
    expect(context.gains[0]!.gain.value).toBe(1);
  });

  it('等待下載期間關閉再開啟聲音，不補播關閉前的舊音效', async () => {
    const { audio, context } = await unlock();
    const download = deferred<Response>();
    fetcher.mockReturnValue(download.promise);
    audio.play('upgrade');
    audio.setSoundOn(false);
    audio.setSoundOn(true);
    download.resolve(response());
    await flush();
    expect(context.sources).toHaveLength(0);
    audio.play('upgrade');
    expect(context.sources).toHaveLength(1);
  });

  it('下載超過半秒不補播舊事件，但快取仍可供下一次立即使用', async () => {
    const { audio, context } = await unlock();
    const download = deferred<Response>();
    fetcher.mockReturnValue(download.promise);
    audio.play('upgrade');
    now = 501;
    download.resolve(response());
    await flush();
    expect(context.sources).toHaveLength(0);
    audio.play('upgrade');
    expect(context.sources).toHaveLength(1);
  });

  it('暫停中的音訊環境先恢復，不把音效留在暫停環境累積', async () => {
    const { audio, context } = await unlock();
    const resumed = deferred<void>();
    context.state = 'suspended';
    context.resume.mockImplementation(() => resumed.promise.then(() => { context.state = 'running'; }));
    audio.play('click');
    expect(context.sources).toHaveLength(0);
    resumed.resolve();
    await flush();
    expect(context.sources).toHaveLength(1);
  });

  it('恢復失敗不丟未處理拒絕，下次互動還能重新恢復並播放', async () => {
    const { audio, context } = await unlock();
    context.state = 'suspended';
    context.resume.mockRejectedValueOnce(new Error('blocked'));
    audio.play('click');
    await flush();
    expect(context.sources).toHaveLength(0);
    audio.play('click');
    await flush();
    expect(context.state).toBe('running');
    expect(context.sources).toHaveLength(1);
  });

  it('首次手勢恢復被拒絕也不留下未處理錯誤，後續按鈕可重試', async () => {
    vi.stubGlobal('AudioContext', class extends TestAudioContext {
      constructor() {
        super();
        this.state = 'suspended';
        this.resume.mockRejectedValueOnce(new Error('gesture rejected'));
      }
    });
    const { audio, context } = await unlock();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.state).toBe('suspended');
    audio.play('click');
    await flush();
    expect(context.sources).toHaveLength(1);
    expect(context.resume).toHaveBeenCalledTimes(2);
  });

  it.each(['下載', '解碼', '檔案不存在'] as const)('%s 失敗後不鎖死該音效，下一次會重試', async (failure) => {
    const { audio, context } = await unlock();
    if (failure === '下載') fetcher.mockRejectedValueOnce(new Error('offline'));
    else if (failure === '解碼') context.decodeAudioData.mockRejectedValueOnce(new Error('invalid audio'));
    else fetcher.mockResolvedValueOnce(response(false));
    audio.play('upgrade');
    await flush();
    expect(context.sources).toHaveLength(0);
    audio.play('upgrade');
    await flush();
    expect(context.sources).toHaveLength(1);
  });

  it('已關閉的音訊環境不建立播放節點', async () => {
    const { audio, context } = await unlock();
    context.state = 'closed';
    audio.play('click');
    await flush();
    expect(context.sources).toHaveLength(0);
  });

  it('等待解碼時環境已關閉，不把載完的音效接回失效環境', async () => {
    const { audio, context } = await unlock();
    const decoded = deferred<AudioBuffer>();
    context.decodeAudioData.mockReturnValueOnce(decoded.promise);
    audio.play('upgrade');
    await flush();
    context.state = 'closed';
    decoded.resolve({ length: 1 } as AudioBuffer);
    await flush();
    expect(context.sources).toHaveLength(0);
  });

  it('保留已儲存的靜音，解鎖與預載不會自行開啟聲音', async () => {
    stored = 'off';
    const { audio, context } = await unlock();
    audio.play('relic');
    await flush();
    expect(audio.soundOn()).toBe(false);
    expect(stored).toBe('off');
    expect(context.gains[0]!.gain.value).toBe(0);
    expect(context.sources).toHaveLength(0);
  });

  it('解鎖註冊重複呼叫仍只建立一個環境，解鎖之前不播放', async () => {
    const audio = await import('../../src/ui/audio');
    audio.play('relic');
    expect(fetcher).not.toHaveBeenCalled();
    audio.unlockOnFirstGesture();
    audio.unlockOnFirstGesture();
    events.dispatchEvent(new Event('pointerdown'));
    audio.unlockOnFirstGesture();
    events.dispatchEvent(new Event('mousedown'));
    await flush();
    expect(TestAudioContext.instances).toHaveLength(1);
  });
});
