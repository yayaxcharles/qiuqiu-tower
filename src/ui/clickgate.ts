/**
 * 疊層的連點保護（序章／結局幻燈片、文字對白）。
 * 起因：開頭影片的「跳過」鈕一收，玩家狂點的後幾下會直接落在剛掛上的疊層上，把台詞一口氣點光（使用者 2026-09-03）。
 * 規則：掛上 700 毫秒內不吃點擊；兩下至少隔 220 毫秒；會換整張圖的那一下要跟上次換圖隔 600 毫秒（圖淡入要 0.6 秒）。
 * 一律用事件自己的時間戳（滑鼠真正點下去的時刻）：畫面一忙，連點會擠在一起延後處理，處理當下的時間會看起來隔很久。
 * 極少數環境的 timeStamp 是紀元毫秒（13 位數），跟 performance.now() 不同基準，遇到就退回處理當下的時間（稽核 2026-09-04 L-2）。
 */
export const GATE_MOUNT_MS = 700;
export const GATE_STEP_MS = 220;
export const GATE_IMAGE_MS = 600;

export function eventNow(ev?: { timeStamp?: number }): number {
  const ts = ev?.timeStamp ?? 0;
  return ts > 0 && ts < 1e12 ? ts : performance.now();
}

export interface ClickGate { mountedAt: number; lastAdvance: number; lastImage: number }

export function newClickGate(now = performance.now()): ClickGate {
  return { mountedAt: now, lastAdvance: 0, lastImage: now };
}

/** 這一下該不該吃？該吃就順手記下時間並回 true；`changesImage`＝這一下會換整張圖 */
export function gateAccept(g: ClickGate, now: number, changesImage = false): boolean {
  if (now - g.mountedAt < GATE_MOUNT_MS) return false;
  if (now - g.lastAdvance < GATE_STEP_MS) return false;
  if (changesImage && now - g.lastImage < GATE_IMAGE_MS) return false;
  g.lastAdvance = now;
  if (changesImage) g.lastImage = now;
  return true;
}
