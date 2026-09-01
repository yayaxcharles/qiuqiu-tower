import { BASE } from './assets';

/**
 * 背景音樂。跟音效（`audio.ts`）分開的三個理由：
 * 1. 開關要分開——有人想聽音效不想聽音樂，反過來也有；
 * 2. 音樂用 `<audio>` 元素串流播放，不像音效整檔解碼進記憶體——
 *    一首三分鐘的曲子解碼完是幾十 MB，八首全解會把手機吃垮；
 * 3. 音樂檔不算進素材預算（7.5 MB），開場不載、用到哪首載哪首，
 *    載入中遊戲照常玩，曲子好了才淡入。
 */

export type BgmName = 'leisure' | 'act1' | 'act2' | 'act3' | 'battle' | 'boss' | 'shop' | 'rest';

const STORE_KEY = 'qiuqiu.music';
const VOLUME = 0.4;          // 音樂墊在音效底下，不能搶
const FADE_MS = 450;

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
    a.play().then(() => fade(a, VOLUME)).catch(() => { /* 沒聲音就沒聲音 */ });
  };
  if (el && !el.paused) fade(el, 0, swap);   // 前一首淡出再接，不要硬切
  else swap();
}

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
