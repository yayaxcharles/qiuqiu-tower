import { BASE } from './assets';

/**
 * 背景音樂。跟音效（`audio.ts`）分開的三個理由：
 * 1. 開關要分開——有人想聽音效不想聽音樂，反過來也有；
 * 2. 音樂用 `<audio>` 元素串流播放，不像音效整檔解碼進記憶體——
 *    一首三分鐘的曲子解碼完是幾十 MB，八首全解會把手機吃垮；
 * 3. 音樂檔不算進素材預算（7.5 MB），開場不載、用到哪首載哪首，
 *    載入中遊戲照常玩，曲子好了才淡入。
 */

export type BgmName =
  | 'leisure' | 'act1' | 'act2' | 'act3' | 'battle' | 'boss' | 'shop' | 'rest'
  | 'elite'      // 大魔物（精英）戰
  | 'finalboss'  // 第三關的走火入魔大俠貓
  | 'shadow'     // 影球球鏡像戰（遭遇 id 是 shadow_cat 時）
  | 'ending'     // 通關的結算
  | 'defeat';    // 陣亡的結算

const STORE_KEY = 'qiuqiu.music';
const VOL_KEY = 'qiuqiu.music.vol';
/** 預設 15／100。使用者實聽的結論：0.4 太大聲，音樂要墊在音效底下 */
const DEFAULT_VOL = 15;
const FADE_MS = 450;

function readVolume(): number {
  try {
    const v = Number(window.localStorage.getItem(VOL_KEY));
    if (Number.isFinite(v) && v >= 0 && v <= 100 && window.localStorage.getItem(VOL_KEY) !== null) return v;
  } catch { /* 讀不到就用預設 */ }
  return DEFAULT_VOL;
}

let volume = readVolume();

export function musicVolume(): number { return volume; }

/** 音量拉桿直接叫這個：立即生效、記進瀏覽器。拖動中不重畫任何東西。 */
export function setMusicVolume(v: number): void {
  volume = Math.max(0, Math.min(100, Math.round(v)));
  try { window.localStorage.setItem(VOL_KEY, String(volume)); } catch { /* 存不了就算了 */ }
  // 正在淡入淡出就把過場砍掉直接設定——使用者在拉的時候要立刻聽到差別
  if (el && !el.paused) { window.clearInterval(fadeTimer); el.volume = volume / 100; }
}

function readEnabled(): boolean {
  try { return window.localStorage.getItem(STORE_KEY) !== 'off'; } catch { return true; }
}

let enabled = readEnabled();
let unlocked = false;        // 瀏覽器規定：使用者互動前不准出聲
let current: BgmName | null = null;      // 現在「應該」放哪首（未解鎖時也記著，解鎖後補播）
let el: HTMLAudioElement | null = null;
let fadeTimer = 0;

export function musicOn(): boolean { return enabled; }

export function setMusicOn(on: boolean): void {
  enabled = on;
  try { window.localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch { /* 存不了就算了 */ }
  if (!on) stopNow();
  else if (current) startPlaying(current);
}

export function toggleMusic(): boolean { setMusicOn(!enabled); return enabled; }

function stopNow(): void {
  window.clearInterval(fadeTimer);
  if (el) { el.pause(); el.src = ''; el = null; }
}

/** 每 40 毫秒推一步音量。不用 Web Audio 的排程——這裡只有一個 <audio>，簡單的就好 */
function fade(a: HTMLAudioElement, to: number, then?: () => void): void {
  window.clearInterval(fadeTimer);
  const from = a.volume;
  const t0 = performance.now();
  fadeTimer = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / FADE_MS);
    a.volume = from + (to - from) * k;
    if (k >= 1) { window.clearInterval(fadeTimer); then?.(); }
  }, 40);
}

function startPlaying(name: BgmName): void {
  if (!enabled || !unlocked) return;
  const swap = (): void => {
    stopNow();
    const a = new Audio(`${BASE}bgm/${name}.mp3`);
    a.loop = true;
    a.volume = 0;
    el = a;
    // play() 可能被瀏覽器拒絕（理論上解鎖後不會，但拒絕就靜靜算了，不能讓畫面炸掉）
    a.play().then(() => fade(a, volume / 100)).catch(() => { /* 沒聲音就沒聲音 */ });
  };
  if (el && !el.paused) fade(el, 0, swap);   // 前一首淡出再接，不要硬切
  else swap();
}

/** 過場影片播放中先把音樂停住（影片有自己的聲音），播完 resumeBgm 接回同一首 */
export function pauseBgm(): void { el?.pause(); }
export function resumeBgm(): void { if (el && enabled) void el.play().catch(() => { /* 沒聲音就沒聲音 */ }); }

/**
 * 換到某首曲子。同一首正在放就不動它——每次換畫面都會呼叫，
 * 地圖→事件→地圖這種同曲切換不能讓音樂重頭來。
 */
export function setBgm(name: BgmName): void {
  if (current === name) return;
  current = name;
  startPlaying(name);
}

/** 跟音效同一套解鎖：第一次互動才建播放器（見 audio.ts 的說明，含自動化只送滑鼠事件的坑） */
const GESTURES = ['pointerdown', 'mousedown', 'touchstart', 'keydown'] as const;
export function unlockBgmOnFirstGesture(): void {
  const start = (): void => {
    for (const g of GESTURES) window.removeEventListener(g, start);
    unlocked = true;
    if (current) startPlaying(current);
  };
  for (const g of GESTURES) window.addEventListener(g, start, { once: true });
}
