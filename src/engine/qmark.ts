import { encountersOfPool } from '../content/enemies';
import { eventById } from '../content/events';
import { relicById } from '../content/relics';
import { poolForFloor } from './map';
import { Rng, seedFromString } from './rng';
import type { MapNode, QmarkVariant, RunEffect, RunState } from './types';

/*
 * ===== 問號格變化（2026-09-23 內容擴充第三批 新G，設計稿 design3 第三節）=====
 *
 * 走進事件格的那一刻擲一次：事件偶爾換成伏擊、行腳商或路邊紙箱。
 * 機率刻意壓低（使用者「不喜歡被騙」）：起跳 5%、每走進一個正常事件格加 5%、最多 20%，變了就歸零。
 * 完整一局（約 7 個問號格）平均 0.9 次，三成的完整局一次都不會遇到。
 *
 * **全部用分支亂數**（設計稿〇-2）：`seed|q|關|格子|累積`，不推整局的 `run.rng`。
 * 兩台一定算得一樣、重新整理重進會算出同一個結果、沒遇到的局地圖與戰利品一格都不位移。
 */

/** 起跳、每次加多少、最多多少 */
export const QMARK_BASE = 0.05;
export const QMARK_STEP = 0.05;
export const QMARK_CAP = 0.2;
/** 變成哪一種的權重（設計稿 3-1） */
export const QMARK_WEIGHTS: readonly [QmarkVariant, number][] = [['伏擊', 40], ['行腳商', 35], ['路邊紙箱', 25]];
/** 伏擊①「迎戰」打贏多給的小魚乾、②「甩掉牠們」最多失去的生命（設計稿 3-2） */
export const AMBUSH_BONUS_FISH = 20;
export const AMBUSH_FLEE_DAMAGE = 6;
/** 三種的揭曉圖編號（圖鍵照事件圖的規矩：`bg/event_<編號>`、他版 `bg/event_<角色>_<編號>`） */
export const QMARK_ART: Readonly<Record<QmarkVariant, string>> = { 伏擊: 'q_ambush', 行腳商: 'q_merchant', 路邊紙箱: 'q_roadbox' };

/** 下一個問號格會變的機率 */
export function qmarkChance(run: RunState): number {
  return Math.min(QMARK_CAP, QMARK_BASE + QMARK_STEP * (run.qmark ?? 0));
}

/**
 * 秘寶掛鉤，照名字讀（平安繩 `qmarkNoAmbush`、探路杖 `qmarkEvery`，設計稿第七節）。
 * 那幾件秘寶的定義由另一條線（新秘寶 9 件）加；這裡只照設計稿的掛鉤名讀，還沒有那幾件時一律讀不到、什麼都不做。
 */
function relicHook(id: string, name: string): unknown {
  return (relicById[id]?.hooks as Readonly<Record<string, unknown>> | undefined)?.[name];
}

/**
 * 這一格不擲（設計稿 3-1 的「不擲的格子」2、3 條）：本來排的就是後集或鏈（有 `requiresFlag`）、稀有事件、5F 固定事件。
 * 稀有事件看事件定義上的 `rare`（另一條線加的欄位，設計稿 新L），不看代號清單。
 */
export function qmarkProtected(n: MapNode): boolean {
  const def = eventById[n.eventId ?? ''];
  if (!def) return true;
  return def.fixedFloor !== undefined || !!def.requiresFlag || !!(def as { rare?: unknown }).rare;
}

/** 這一格能出伏擊嗎：第一關 3F 以前（牌組還是起手牌）不出；有人帶平安繩也不出（同一格只有一個結果，看任一位） */
export function ambushAllowed(run: RunState, n: MapNode): boolean {
  if (run.act <= 1 && n.floor <= 3) return false;
  return !run.players.some((p) => p.relics.some((id) => !!relicHook(id, 'qmarkNoAmbush')));
}

/**
 * 探路杖（設計稿 7-2 第 4 件）：每走進一個「會擲」的問號格數一格，數到 n 的那位歸零，這一格直接指定成路邊紙箱（2026-09-24 b3int 從「行腳商或路邊紙箱」改）。
 * 計數各算各的、存在 `RunPlayer.counters`（跟撲滿同一欄，存檔與指紋都有）；任一位到了就觸發。
 */
function tickScoutStaff(run: RunState): boolean {
  let due = false;
  for (const p of run.players) {
    for (const id of p.relics) {
      const every = relicHook(id, 'qmarkEvery');
      if (typeof every !== 'number' || every < 1) continue;
      const counters = (p.counters ??= {});
      const now = (counters[id] ?? 0) + 1;
      if (now >= every) { counters[id] = 0; due = true; } else counters[id] = now;
    }
  }
  return due;
}

function pickWeighted(rng: Rng, table: readonly [QmarkVariant, number][]): QmarkVariant {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [v, w] of table) { r -= w; if (r < 0) return v; }
  return table[table.length - 1]![0];
}

/** 伏擊打哪一組：這一格所在樓層的一般戰鬥池，分支亂數挑一組（不會是大魔物、不抽修飾詞） */
function ambushEncounter(run: RunState, n: MapNode): string | undefined {
  const pool = encountersOfPool(poolForFloor(n.floor, run.act), run.act);
  if (!pool.length) return undefined;
  return new Rng(seedFromString(`${run.seed}|ambush|${run.act}|${n.id}`)).pick(pool).id;
}

/**
 * 走進事件格的那一刻：這一格要不要變（`run.ts` 的 `enterEvent` 叫；連線兩台、機器人都走這條）。回傳變成哪一種，沒變回 null。
 *
 * `rollable = false`＝這一格不擲（5F、剛換成待出的後集）：照樣算一次正常事件，累積 +1。
 * 變了就把結果寫在格子上（`variant`、伏擊的 `encounterId`），被換掉的事件不記「遇過」（呼叫端照回傳值決定）。
 * 格子上已經有結果的（除錯工具先指定的）不重擲，只補伏擊那一組。
 */
export function rollQmark(run: RunState, n: MapNode, rollable = true): QmarkVariant | null {
  if (n.variant) {
    if (n.variant === '伏擊' && !n.encounterId) n.encounterId = ambushEncounter(run, n);
    run.qmark = 0;
    return n.variant;
  }
  const plain = (): null => { run.qmark = (run.qmark ?? 0) + 1; return null; };
  if (!rollable || qmarkProtected(n)) return plain();
  let v: QmarkVariant | null = null;
  // 探路杖到點：不擲，直接指定成路邊紙箱。設計稿 3-1 把它列在「照樣算一次正常事件」那一組，所以累積照樣 +1。
  // 2026-09-24 b3int 量尺調整：原本「每 3 格、行腳商或路邊紙箱各一半」量到常見池墊底（+0.4 層），每 2 格仍各一半也只有 +0.9；
  // 行腳商要花錢、機器人多半逛不起，改成一定是路邊紙箱、每 2 格一次，量到 +2.0（常見池中段）
  const forced = tickScoutStaff(run);
  if (forced) v = '路邊紙箱';
  else {
    const rng = new Rng(seedFromString(`${run.seed}|q|${run.act}|${n.id}|${run.qmark ?? 0}`));
    if (rng.next() < qmarkChance(run)) {
      v = pickWeighted(rng, QMARK_WEIGHTS.filter(([k]) => k !== '伏擊' || ambushAllowed(run, n)));
    }
  }
  if (v === '伏擊') {
    const enc = ambushEncounter(run, n);
    if (!enc) v = null;   // 這一層的戰鬥池是空的（不會發生，保險）：當成正常事件
    else n.encounterId = enc;
  }
  if (!v) return plain();
  n.variant = v;
  run.qmark = forced ? (run.qmark ?? 0) + 1 : 0;
  return v;
}

/**
 * 伏擊的兩個選項的效果（照 `EventChoice.outcome` 的順序）：①迎戰＝打這一格的那一組、打贏多 20 條；②甩掉牠們＝最多失去 6 點生命。
 * 扣血照事件的規矩（難度 4 起 ×1.5、扣不死人，`applyRunEffects` 的 `damage`）。畫面與三支機器人共用這一份。
 */
export function ambushOutcomes(n: MapNode): [RunEffect[], RunEffect[]] {
  return [
    n.encounterId ? [{ kind: 'fight', encounterId: n.encounterId, bonusFish: AMBUSH_BONUS_FISH }] : [],
    [{ kind: 'damage', n: AMBUSH_FLEE_DAMAGE }],
  ];
}
