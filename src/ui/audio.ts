import { BASE } from './assets';

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
  | 'upgrade' | 'relic' | 'victory' | 'defeat' | 'step';

/** 每個音效的相對音量。合成出來的響度不一，這裡拉平，不要在合成端硬調峰值。 */
const GAIN: Partial<Record<Sfx, number>> = {
  claw: 0.7, hit: 0.65, hit_heavy: 0.8, hurt: 0.7, blocked: 0.5, thorns: 0.45,
  draw: 0.35, click: 0.4, step: 0.3, turn_end: 0.5, turn_start: 0.5,
  fish: 0.45, buy: 0.5, victory: 0.7, defeat: 0.7,
};

const STORE_KEY = 'qiuqiu.sound';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<Sfx, AudioBuffer>();
const pending = new Set<Sfx>();

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
  enabled = on;
  try { window.localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch { /* 存不了就算了 */ }
  if (master && ctx) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.01);
}

/** 切換並回傳切換後的狀態，給按鈕用。 */
export function toggleSound(): boolean {
  setSoundOn(!enabled);
  return enabled;
}

async function load(name: Sfx): Promise<void> {
  if (!ctx || buffers.has(name) || pending.has(name)) return;
  pending.add(name);
  try {
    const res = await fetch(`${BASE}assets/sfx/${name}.mp3`);
    if (!res.ok) return;                       // 檔案沒生好就當作這個音效不存在，不要吵
    buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
  } catch {
    /* 抓不到或解不開就放棄這一個，其餘照常 */
  } finally {
    pending.delete(name);
  }
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
  const start = (): void => {
    for (const g of GESTURES) window.removeEventListener(g, start);
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = enabled ? 1 : 0;
      master.connect(ctx.destination);
    } catch {
      return;                                   // 不支援 Web Audio 就整套靜音，遊戲照玩
    }
    void ctx.resume();
    // 常用的先載，其餘等用到再載。開場就把 26 個一起抓會跟素材搶頻寬。
    for (const n of ['click', 'draw', 'claw', 'hit', 'block', 'hurt', 'turn_end', 'turn_start'] as Sfx[]) {
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
  if (!enabled || !ctx || !master) return;
  const buf = buffers.get(name);
  if (!buf) { void load(name); return; }        // 第一次用到才載，這一下就沒聲音，之後都有
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = GAIN[name] ?? 0.6;
  src.connect(g).connect(master);
  src.start();
}
