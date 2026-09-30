import type { RunState } from '../engine/types';
import { t } from '../i18n';
import { el } from './dom';
import { NODE_ICON, follow, preloadHeroArt, relatedIds, urlsFor, type Progress } from './preload';
import { preloadSfx } from './audio';
import { actVariantKey } from './screenbg';
import { warmVoice } from './voicegate';

/*
 * 慢網路修正（2026-09-30，量測報告 `docs/量測_慢網路聲音與卡頓_20260930.md` 第 4～6 節）——留在首載的那一小塊：
 * 開局送出「最低可玩完成度」（實際清單與順序在按需載入的 `netload-run.ts`）、記這一局的進度給地圖前的門檻看，
 * 以及兩個條件式進度條共用的時機（`gateProgress`）與畫面（`progressBar`）。
 */

type RunWarm = { run: RunState; pr: Progress; ready: Promise<void>; over: boolean };
let cur: RunWarm | null = null;

/** 第一次進大地圖前最多等 A 層多久（報告：0.8 Mbps 在爭搶下最慢 7 秒）；到了照樣進去、背景繼續抓 */
export const MAP_GATE_MS = 8000;

/**
 * 進入一局（`App.adoptRun`）：叫 `netload-run.ts` 送出 A 層與原本的背景那批。那一塊封面圖到齊後就先抓了（`main.ts`），平常不多等一趟；
 * 萬一載不到，照原本直接叫 `preloadHeroArt`（只少了插隊，不會少抓）。
 */
export function warmRun(run: RunState, seat: number): void {
  const pr: Progress = { done: 0, total: 0 };
  const w: RunWarm = { run, pr, ready: Promise.resolve(), over: false };
  // 首載那幾支用傳的、不讓那一塊直接引用（一引用，打包就把它們拆到另一個檔，首載程式反而變大）
  w.ready = import('./netload-run').then((m) => m.startRun(run, seat, pr, { NODE_ICON, follow, preloadHeroArt, relatedIds, urlsFor, preloadSfx, actVariantKey, warmVoice }), () => { void preloadHeroArt(run.players.map((p) => p.hero), run.act); })
    .finally(() => { w.over = true; });
  cur = w;
}

/** 這一局的 A 層進度（地圖前的門檻用）；不是這一局回 null。`over`＝A 層到齊了 */
export function runProgress(run: RunState): RunWarm | null {
  return cur?.run === run ? cur : null;
}

/**
 * 條件式進度條的時機（只管時間，畫面由 `show` 決定）：`ready` 在 `graceMs` 內好了就**完全不出現**（快網路一閃都不要）；
 * 沒好、而且 `slow()` 說是慢網路，才叫 `show`（回傳收掉的函式）；`ready` 好了或到 `maxMs`（0＝不設上限）就先收掉、再結束
 *（接在回傳值後面的換畫面一定在進度條收掉之後）。
 */
export function gateProgress(ready: Promise<unknown>, show: () => () => void, maxMs = 0, graceMs = 250,
  slow: () => Promise<boolean> = () => Promise.resolve(true)): Promise<void> {
  return new Promise<void>((done) => {
    let hide: (() => void) | undefined;
    let over = false;
    const finish = (): void => {
      if (over) return;
      over = true;
      clearTimeout(grace);
      clearTimeout(cap);
      hide?.();
      done();
    };
    const grace = setTimeout(() => { void slow().then((s) => { if (!over && s) hide = show(); }); }, graceMs);
    const cap = maxMs > 0 ? setTimeout(finish, maxMs) : undefined;
    void ready.then(finish, finish);
  });
}

/** 進度條：一行標題、一條進度、「準備中 x/y」（樣式 `.net-progress`，沿用旋轉提示那張卡的配色） */
export function progressBar(host: HTMLElement, label: string, pr: Progress): () => void {
  const fill = el('i');
  const count = el('small');
  const box = el('div', { class: 'net-progress' }, el('b', {}, label), el('span', { class: 'net-bar' }, fill), count);
  const draw = (): void => {
    fill.style.width = `${pr.total ? Math.round((pr.done / pr.total) * 100) : 0}%`;
    count.textContent = t('準備中 {done}/{total}', { done: pr.done, total: pr.total });
  };
  const prev = pr.on;
  pr.on = () => { prev?.(); draw(); };
  draw();
  host.append(box);
  return () => { pr.on = prev; box.remove(); };
}
