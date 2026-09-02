import { MAX_DIFFICULTY, clampDifficulty } from '../content/difficulty';
import { cardById } from '../content/cards';
import type { RunState } from './types';

export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const RUN_KEY = 'qiuqiu-tower/run';
const BEST_KEY = 'qiuqiu-tower/best';
const UNLOCK_KEY = 'qiuqiu-tower/difficulty-unlocked';
const SELECT_KEY = 'qiuqiu-tower/difficulty';

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

/**
 * 這一張牌，牌表現在還認不認得。
 *
 * 牌表改過（改 id、砍牌、換命名）之後，之前存下來的 `cardId` 就變成孤兒。光看 `version`
 * 是看不出來的：存檔照樣載得進來，等到有人要把那張牌畫出來，`cardStats` 才丟「未知的牌」——
 * 那時候已經在渲染中途，畫面會停在半殘的狀態。與其讓它晚一步炸，不如在這裡就當作不相容。
 * 掉一份過期的存檔，遠比按下去整個卡住好。
 */
function knownCard(c: unknown): boolean {
  if (!c || typeof c !== 'object') return false;
  const { uid, cardId } = c as { uid?: unknown; cardId?: unknown };
  return typeof uid === 'number' && typeof cardId === 'string' && cardById[cardId] !== undefined;
}

/**
 * 地圖與「現在站在哪個節點」對不對得起來。
 *
 * 跟上面那張牌的檢查是同一個形狀的洞，但失效模式更糟：牌那條是清掉存檔、玩家看得到標題畫面；
 * 節點這條是 `nodeById` 在畫面函式的第一行就丟「未知的節點」，而 `App.show()` 已經先把畫面層
 * 清空了——**舞台整個空白**，只剩重整；重整後按「續玩」再白一次，等於「續玩」被下毒。
 * 動了地圖產生器（樓層數、lane 編號、id 格式）卻忘了升 `version` 就是這個情境。
 */
function usableMap(map: unknown, currentNode: unknown): boolean {
  if (!map || typeof map !== 'object') return false;
  const { nodes } = map as { nodes?: unknown };
  if (!Array.isArray(nodes)) return false;
  if (currentNode === null || currentNode === undefined) return true;   // 還沒踏上第一個節點，合法
  if (typeof currentNode !== 'string') return false;
  return nodes.some((n) => !!n && typeof n === 'object' && (n as { id?: unknown }).id === currentNode);
}

export function loadRun(): RunState | null {
  const raw = read(RUN_KEY);
  if (!raw) return null;
  try {
    const run = JSON.parse(raw) as Partial<RunState>;
    if (run.version !== 1 || !Array.isArray(run.deck) || !run.map || !run.rng) { clearSave(); return null; }
    // 牌組裡有牌表認不得的牌（或是壞掉的牌物件）就跟版本不符一樣處理：清掉、當作沒有存檔
    if (!run.deck.every(knownCard)) { clearSave(); return null; }
    // 地圖沒有節點陣列、或站在一個地圖上不存在的節點上，一樣當作不相容
    if (!usableMap(run.map, run.currentNode)) { clearSave(); return null; }
    // 舊存檔沒有 flags：補一個空的就好，不必升版本
    if (!run.flags || typeof run.flags !== 'object') run.flags = {};
    // 舊存檔沒有 trail（足跡紀錄之前存的）：從現在站的格子開始記，之前走過的路照暗
    run.trail ??= run.currentNode ? [run.currentNode] : [];
    // 舊存檔沒有 act（三關制之前存的）：當第一關。地圖照舊能走，打贏關主就接第二關
    if (typeof run.act !== 'number' || run.act < 1) run.act = 1;
    // 舊存檔沒有 difficulty（難度制之前存的）：當難度 1
    if (typeof run.difficulty !== 'number') run.difficulty = 1;
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
/** 某個難度的最佳成績（跟總成績分開記；標題畫面選到哪級就顯示哪級） */
export function loadBestFor(level: number): BestRecord | null {
  const raw = read(`${BEST_KEY}/${clampDifficulty(level)}`);
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as Partial<BestRecord>;
    if (typeof b.floor !== 'number' || typeof b.won !== 'boolean' || typeof b.turns !== 'number' || typeof b.date !== 'string') return null;
    return b as BestRecord;
  } catch { return null; }
}
/** 解鎖到第幾級難度（通關第 n 級就開第 n＋1 級）；沒記錄＝1 */
export function unlockedDifficulty(): number {
  const v = Number(read(UNLOCK_KEY) ?? '1');
  return Number.isFinite(v) ? clampDifficulty(v) : 1;
}
export function selectedDifficulty(): number {
  const v = Number(read(SELECT_KEY) ?? '1');
  return Math.min(unlockedDifficulty(), Number.isFinite(v) ? clampDifficulty(v) : 1);
}
export function setSelectedDifficulty(level: number): void { write(SELECT_KEY, String(clampDifficulty(level))); }
export function recordBest(run: RunState, date = new Date().toISOString().slice(0, 10)): BestRecord {
  const cur: BestRecord = { floor: run.floor, won: run.status === 'won', turns: run.stats.turns, date };
  const old = loadBest();
  const best = old && !better(cur, old) ? old : cur;
  write(BEST_KEY, JSON.stringify(best));
  // 分難度再記一份；通關就解鎖下一級
  const level = clampDifficulty(run.difficulty ?? 1);
  const oldL = loadBestFor(level);
  write(`${BEST_KEY}/${level}`, JSON.stringify(oldL && !better(cur, oldL) ? oldL : cur));
  if (cur.won && level < MAX_DIFFICULTY && unlockedDifficulty() <= level) write(UNLOCK_KEY, String(level + 1));
  return best;
}
