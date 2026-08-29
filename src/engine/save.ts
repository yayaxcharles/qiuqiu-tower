import type { RunState } from './types';

export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const RUN_KEY = 'qiuqiu-tower/run';
const BEST_KEY = 'qiuqiu-tower/best';

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}
let store: KeyValueStore = (() => {
  try { if (typeof window !== 'undefined' && window.localStorage) return window.localStorage; } catch { /* 私密模式等 */ }
  return memoryStore();
})();
export function setStore(s: KeyValueStore): void { store = s; }

/** 倉庫可能整個壞掉（空間滿了、私密模式、瀏覽器擋站台資料），三個動作都要包起來，不能讓遊戲當掉 */
function write(key: string, value: string): void {
  try { store.setItem(key, value); } catch { /* 忽略 */ }
}
function read(key: string): string | null {
  try { return store.getItem(key); } catch { return null; }
}
function remove(key: string): void {
  try { store.removeItem(key); } catch { /* 忽略 */ }
}

export function saveRun(run: RunState): void { write(RUN_KEY, JSON.stringify(run)); }

export function loadRun(): RunState | null {
  const raw = read(RUN_KEY);
  if (!raw) return null;
  try {
    const run = JSON.parse(raw) as Partial<RunState>;
    if (run.version !== 1 || !Array.isArray(run.deck) || !run.map || !run.rng) { clearSave(); return null; }
    // 舊存檔沒有 flags：補一個空的就好，不必升版本
    if (!run.flags || typeof run.flags !== 'object') run.flags = {};
    return run as RunState;
  } catch { clearSave(); return null; }
}
export function hasSave(): boolean { return loadRun() !== null; }
export function clearSave(): void { remove(RUN_KEY); }

export interface BestRecord { floor: number; won: boolean; turns: number; date: string }
export function loadBest(): BestRecord | null {
  const raw = read(BEST_KEY);
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as Partial<BestRecord>;
    // 欄位對不上就當作壞掉：清掉重來，免得後面拿它去比較時算出怪東西
    if (typeof b.floor !== 'number' || typeof b.won !== 'boolean' || typeof b.turns !== 'number' || typeof b.date !== 'string') {
      remove(BEST_KEY);
      return null;
    }
    return b as BestRecord;
  } catch { remove(BEST_KEY); return null; }
}
function better(a: BestRecord, b: BestRecord): boolean {   // a 是否優於 b
  if (a.won !== b.won) return a.won;
  if (a.floor !== b.floor) return a.floor > b.floor;
  return a.turns < b.turns;
}
export function recordBest(run: RunState, date = new Date().toISOString().slice(0, 10)): BestRecord {
  const cur: BestRecord = { floor: run.floor, won: run.status === 'won', turns: run.stats.turns, date };
  const old = loadBest();
  const best = old && !better(cur, old) ? old : cur;
  write(BEST_KEY, JSON.stringify(best));
  return best;
}
