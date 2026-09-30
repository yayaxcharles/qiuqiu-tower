import { sfxFor } from './sfxhero';
import { fileUrl } from './assets';

/**
 * 音效。
 *
 * 用 Web Audio 而不是 `<audio>` 元素：同一個音效可能連續觸發好幾次（三連擊、
 * 一次抽五張牌），`<audio>` 同時間只播得動一份，後面那幾下會被吃掉。
 * Web Audio 每次播放都是一個獨立的節點，疊幾層都沒問題。
 *
 * 瀏覽器規定「使用者還沒動過畫面之前不准出聲」，所以音訊環境是**第一次點擊才建立**
 * （見 `unlockOnFirstGesture`）。在那之前呼叫 `play()` 一律靜靜跳過，不要丟例外——
 * 開場動畫那種還沒互動就想出聲的情形，寧可沒聲音也不要整頁掛掉。
 */

/** 音效檔名。加新音效時這裡跟 `tools/make_sfx.py` 的 `SAMPLES` 要同步。 */
export type Sfx =
  | 'claw' | 'hit' | 'hit_heavy' | 'hurt' | 'block' | 'blocked' | 'enemy_down'
  | 'dodge' | 'thorns' | 'poison' | 'stealth' | 'buff' | 'debuff' | 'heal'
  | 'draw' | 'click' | 'turn_end' | 'turn_start' | 'fish' | 'buy' | 'potion'
  | 'upgrade' | 'relic' | 'victory' | 'defeat' | 'step'
  // 角色專屬版本（`sfxhero.ts` 決定什麼時候用它們）
  | 'hurt_feifei' | 'victory_feifei';

/** 每個音效的相對音量。合成出來的響度不一，這裡拉平，不要在合成端硬調峰值。 */
const GAIN: Partial<Record<Sfx, number>> = {
  claw: 0.7, hit: 0.65, hit_heavy: 0.8, hurt: 0.7, blocked: 0.5, thorns: 0.45,
  draw: 0.35, click: 0.4, step: 0.3, turn_end: 0.5, turn_start: 0.5,
  fish: 0.45, buy: 0.5, victory: 0.7, defeat: 0.7,
  hurt_feifei: 0.7, victory_feifei: 0.7,
};

const STORE_KEY = 'qiuqiu.sound';

/** 這一局本機玩的是誰：受傷、勝利那類貓叫照角色換檔（`app.ts` 跟 `setLocalHero` 一起設） */
let sfxHero = 'ninja';
export function setSfxHero(hero: string | undefined): void { sfxHero = hero ?? 'ninja'; }

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<Sfx, AudioBuffer>();
const pending = new Map<Sfx, Promise<AudioBuffer | undefined>>();
let resuming: Promise<void> | null = null;
let playbackEpoch = 0;
// 慢網路或背景分頁恢復後，不要一口氣補播早已過去的動作。
const MAX_START_DELAY_MS = 500;

/**
 * 開關記在瀏覽器裡，換一局也不會忘。讀取包在 try 裡：無痕視窗或擋了網站資料的
 * 瀏覽器，光是碰 `localStorage` 就會丟例外，不能讓整個畫面陪葬。
 */
function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORE_KEY) !== 'off';
  } catch {
    return true;
  }
}

let enabled = readEnabled();

export function soundOn(): boolean { return enabled; }

export function setSoundOn(on: boolean): void {
  if (!on) { playbackEpoch++; soundOffHook?.(); }
  enabled = on;
  try { window.localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch { /* 存不了就算了 */ }
  if (master && ctx) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.01);
}

/** 聲音被關掉時要順便做的事（`voice.ts` 用來當場停掉正在講的那句、還回背景音樂音量） */
let soundOffHook: (() => void) | null = null;
export function onSoundOff(fn: () => void): void { soundOffHook = fn; }

/**
 * 給配音（`voice.ts`）用的出口：同一個音訊環境、接在總音量後面——**音效關掉，配音就跟著沒聲音**（使用者規則）。
 * 還沒解鎖（第一次點擊前）或音效關著就回 null；手機上環境被暫停時先喚醒再回。
 */
export async function audioOut(): Promise<{ ctx: AudioContext; out: GainNode } | null> {
  const audio = ctx;
  const output = master;
  if (!enabled || !audio || !output || audio.state === 'closed') return null;
  await resume(audio);
  return audio.state === 'running' && ctx === audio ? { ctx: audio, out: output } : null;
}

/** 切換並回傳切換後的狀態，給按鈕用。 */
export function toggleSound(): boolean {
  setSoundOn(!enabled);
  return enabled;
}

function load(name: Sfx): Promise<AudioBuffer | undefined> {
  const audio = ctx;
  if (!audio) return Promise.resolve(undefined);
  const cached = buffers.get(name);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(name);
  if (existing) return existing;
  const task = (async () => {
    try {
      const res = await fetch(fileUrl(`assets/sfx/${name}.mp3`));
      if (!res.ok) return;                     // 檔案沒生好就當作這個音效不存在，不要吵
      const buffer = await audio.decodeAudioData(await res.arrayBuffer());
      if (ctx !== audio || audio.state === 'closed') return;
      buffers.set(name, buffer);
      return buffer;
    } catch {
      /* 抓不到或解不開就放棄這一個，其餘照常 */
    }
  })().finally(() => { pending.delete(name); });
  pending.set(name, task);
  return task;
}

function resume(audio: AudioContext): Promise<void> {
  if (audio.state === 'running' || audio.state === 'closed') return Promise.resolve();
  if (!resuming) {
    resuming = audio.resume().catch(() => { /* 解鎖失敗，等下次互動再試 */ })
      .finally(() => { resuming = null; });
  }
  return resuming;
}

/** 全部音效（`Sfx` 的每一個）；慢網路最常被跳過的四個排前面 */
const ALL_SFX: Sfx[] = ['step', 'enemy_down', 'blocked', 'poison', 'claw', 'hit', 'hit_heavy', 'hurt', 'block', 'dodge', 'thorns',
  'stealth', 'buff', 'debuff', 'heal', 'draw', 'click', 'turn_end', 'turn_start', 'fish', 'buy', 'potion', 'upgrade', 'relic',
  'victory', 'defeat', 'hurt_feifei', 'victory_feifei'];

/**
 * 進入一局就把全部音效先抓好（慢網路修正 2026-09-30）：原本只預載十個，其餘第一次用到才抓，
 * 500 毫秒沒到就整個不播——慢網路下第一次點地圖格子（`step`）幾乎必無聲。
 * 回傳每一個的「抓完（或失敗）」給進度用；音效關著就不抓。
 * 還沒解鎖（重新整理接回連線局，還沒點過畫面）只先下載進瀏覽器快取，解鎖後 `load` 再拿（`decodeAudioData` 會吃掉那份位元組，不能先留）。
 */
export function preloadSfx(): Promise<unknown>[] {
  if (!enabled) return [];
  return ALL_SFX.filter((n) => !buffers.has(n)).map((n) => (ctx ? load(n)
    : fetch(fileUrl(`assets/sfx/${n}.mp3`)).then((r) => r.arrayBuffer()).catch(() => undefined)));
}

/**
 * 第一次點擊時才建立音訊環境並開始預載。
 *
 * 瀏覽器的自動播放限制：使用者互動之前建立的 `AudioContext` 會是 suspended 狀態，
 * 之後第一個音效常常會被吞掉。掛在按下去的那一刻而不是 `click`：按下去就算互動，
 * 比放開早，剛好趕得上那一下的按鈕音。
 *
 * 四種事件都聽：`pointerdown` 是主力，但**不是每個環境都會送**——瀏覽器自動化
 * 只送滑鼠事件不送指標事件，某些嵌在別的頁面裡的情形也一樣。少聽一種就整套沒聲音，
 * 多聽三種的成本只是幾個一次性的監聽器。
 */
const GESTURES = ['pointerdown', 'mousedown', 'touchstart', 'keydown'] as const;

export function unlockOnFirstGesture(): void {
  if (ctx) return;
  const start = (): void => {
    for (const g of GESTURES) window.removeEventListener(g, start);
    if (ctx) return;
    try {
      const audio = new AudioContext();
      const output = audio.createGain();
      output.gain.value = enabled ? 1 : 0;
      output.connect(audio.destination);
      ctx = audio;
      master = output;
    } catch {
      return;                                   // 不支援 Web Audio 就整套靜音，遊戲照玩
    }
    void resume(ctx);
    // 常用的先載，其餘等用到再載。開場就把 26 個一起抓會跟素材搶頻寬。
    // 菲菲的受傷叫聲也先載（各 9 KB）：這一刻還不知道玩家要選誰，原本只載球球那顆，
    // 玩菲菲時第一次被打才去抓、那一下沒聲音（總稽核 2026-09-16 丁 低-1）
    // 紙箱第一次開啟就要有秘寶音，這顆也先載（約 10 KB）。
    for (const n of ['click', 'draw', 'claw', 'hit', 'block', 'hurt', 'hurt_feifei', 'turn_end', 'turn_start', 'relic'] as Sfx[]) {
      void load(n);
    }
  };
  for (const g of GESTURES) window.addEventListener(g, start, { once: true });
}

/**
 * 播一個音效。還沒解鎖、關掉聲音、或那個檔案載不到，都是靜靜跳過。
 * `rate` 可以微調音高：連續同一個音效（三連擊）錯開一點才不會像壞掉的複讀機。
 */
export function play(name: Sfx, rate = 1): void {
  if (!enabled || !ctx || !master || ctx.state === 'closed') return;
  name = sfxFor(name, sfxHero);   // 角色專屬版本（菲菲的貓叫）
  const audio = ctx;
  const output = master;
  const epoch = playbackEpoch;
  const requestedAt = performance.now();
  const start = (buffer: AudioBuffer | undefined): void => {
    if (!buffer || !enabled || epoch !== playbackEpoch || ctx !== audio || master !== output
      || audio.state !== 'running' || performance.now() - requestedAt > MAX_START_DELAY_MS) return;
    const src = audio.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = audio.createGain();
    g.gain.value = GAIN[name] ?? 0.6;
    src.connect(g).connect(output);
    src.start();
  };
  const buf = buffers.get(name);
  if (buf && audio.state === 'running') { start(buf); return; }
  // 預載中或第一次用到都等同一份解碼；每次呼叫仍保有自己的播放節點。
  void Promise.all([load(name), resume(audio)]).then(([buffer]) => start(buffer));
}
