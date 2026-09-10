import { encounterById } from '../content/enemies';
import { eventById } from '../content/events';
import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import { MAX_DIFFICULTY, clampDifficulty } from '../content/difficulty';
import { cardById } from '../content/cards';
import { ACTS } from './run';
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
  const { nodes, start } = map as { nodes?: unknown; start?: unknown };
  if (!Array.isArray(nodes) || nodes.length === 0) return false;
  const ids = new Set<string>();
  for (const n of nodes) {
    if (!n || typeof n !== 'object') return false;
    const id = (n as { id?: unknown }).id;
    if (typeof id !== 'string') return false;
    ids.add(id);
  }
  /**
   * `start` 與每個節點的 `next` 都要指得到東西（稽核 2026-09-10 中-3）。
   *
   * 原本只檢查「`nodes` 是陣列」跟「`currentNode` 找得到」，而且 `currentNode === null`
   * 直接放行——但**每次過關 `advanceAct` 都會把 `currentNode` 設成 null 再存檔**，
   * 所以「關卡交界」這個每一局都會經過的狀態，是完全不驗地圖的。
   * 實測放行後的下場：`start` 不見 → `nextChoices` 丟 TypeError；`start` 指到不存在的節點
   * → 「未知的節點」；某個 `next` 指到不存在的節點 → 走第一步才炸；`nodes` 空陣列 → 地圖一格都點不到。
   * 全部都是上面那段註解在防的「舞台整個空白」。
   */
  if (!Array.isArray(start) || start.length === 0) return false;
  if (!start.every((id) => typeof id === 'string' && ids.has(id))) return false;
  for (const n of nodes) {
    // **不能豁免 `undefined`**（稽核 2026-09-10 中-2）：地圖產生器最後一層給的是 `next: []` 不是
    // `undefined`（`map.ts` 一律給空陣列），所以「沒有這個欄位」只會是被改壞的檔——
    // 放行的話 `nextChoices` 會丟 TypeError，正是這條檢查要防的「舞台整個空白」。
    const next = (n as { next?: unknown }).next;
    if (!Array.isArray(next)) return false;
    if (!next.every((id) => typeof id === 'string' && ids.has(id))) return false;
  }
  if (currentNode === null || currentNode === undefined) return true;   // 還沒踏上第一個節點，合法
  if (typeof currentNode !== 'string') return false;
  return ids.has(currentNode);
}

/**
 * 一份解析出來的存檔能不能用；能用就順手把舊版缺的欄位補上，不能用回 null。
 *
 * **這裡不碰倉庫**。抽出來是因為局面碼（分享給別人的那串）也要走同一套檢查，
 * 但別人給的碼壞掉時只該拒收，不該把接收者自己的存檔清掉——原本的寫法是驗到一半就 `clearSave()`，
 * 直接拿去驗別人的碼會誤刪自己的進度。要不要清存檔由呼叫端決定。
 */
export function checkRun(run: Partial<RunState>): RunState | null {
  if (run.version !== 1 || !Array.isArray(run.deck) || !run.map || !run.rng) return null;
  // 牌組裡有牌表認不得的牌（或是壞掉的牌物件）就跟版本不符一樣處理：當作不相容
  if (!run.deck.every(knownCard)) return null;
  // 地圖沒有節點陣列、或站在一個地圖上不存在的節點上，一樣當作不相容
  if (!usableMap(run.map, run.currentNode)) return null;
  // 忍具、秘寶、統計缺了會在畫狀態列時炸掉（2026-09-02 稽核 L-1）：一樣當作不相容
  if (!Array.isArray(run.potions) || !Array.isArray(run.relics) || !run.stats || typeof run.stats !== 'object') return null;
  // 遭遇、事件、秘寶、忍具的 id 對不上（內容改名、拆併之後帶舊檔）也當不相容。原本只驗牌：
  // 遭遇 id 對不上要到開戰才丟「未知的遭遇」，例外從點擊事件冒出來，地圖點不動、沒任何訊息（全面體檢 2026-09-05 #4）
  if (!run.map.nodes.every((n) => (!n.encounterId || encounterById[n.encounterId]) && (!n.eventId || eventById[n.eventId]))) return null;
  if (!run.relics.every((id) => relicById[id]) || !run.potions.every((id) => potionById[id])) return null;
  // 舊存檔沒有 flags：補一個空的就好，不必升版本
  if (!run.flags || typeof run.flags !== 'object') run.flags = {};
  // 舊存檔沒有 trail（足跡紀錄之前存的）：從現在站的格子開始記，之前走過的路照暗
  run.trail ??= run.currentNode ? [run.currentNode] : [];
  // 舊存檔沒有 act（三關制之前存的）：當第一關。地圖照舊能走，打贏關主就接第二關
  if (typeof run.act !== 'number' || run.act < 1) run.act = 1;
  // 舊存檔沒有 difficulty（難度制之前存的）：當難度 1
  if (typeof run.difficulty !== 'number') run.difficulty = 1;
  // 局面碼是手改得動的（就是壓縮過的存檔），把 status 改成 lost、hp 改成 0 也能通過上面每一條，
  // 然後被寫進收方的存檔，之後每次「續玩」都是頂著 0 血在地圖上亂走（稽核 2026-09-07 低 3）。
  // 正常玩法產不出這種檔——陣亡與通關當下畫面已經被結算疊層接管，不會存到這個狀態
  if (run.status !== 'playing') return null;
  if (typeof run.hp !== 'number' || run.hp <= 0 || typeof run.maxHp !== 'number' || run.maxHp <= 0) return null;
  if (run.hero !== undefined && run.hero !== 'ninja' && run.hero !== 'samurai') return null;
  /**
   * 幾個「放行之後靜靜壞給你看」的欄位（稽核 2026-09-10 低-2、低-3）。實測放行的下場：
   * - `removeCost` 不見 → `pay(run, undefined)` 的比較永遠成立 → **放生變免費、`run.fish` 變 NaN**，之後整局的小魚乾都是 NaN
   * - `trail` 是字串 → `run.trail.push` 丟 TypeError
   * - `act = 9` → `finishCombat` 的 `run.act >= ACTS` 成立，打贏任何一個關主就直接判通關
   * - `rng` 的四個欄位型別壞掉 → `>>> 0` 全變 0 → 那一局的商店、獎勵、魔物血量全部退化成「永遠第一個」，玩家看不出哪裡怪
   */
  const finite = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
  if (!finite(run.removeCost) || !finite(run.nextUid) || !finite(run.fish) || run.fish! < 0) return null;
  if (!Array.isArray(run.trail)) return null;
  if (run.act > ACTS) return null;
  if (run.hp > run.maxHp) return null;
  const rs = run.rng as unknown as Record<string, unknown>;
  if (!['a', 'b', 'c', 'd'].every((k) => finite(rs[k]))) return null;
  // uid 撞號會讓「放生這一張」放掉別張（`deck.find` 只找得到第一個）
  if (new Set(run.deck.map((c) => c.uid)).size !== run.deck.length) return null;
  return run as RunState;
}

export function loadRun(): RunState | null {
  const raw = read(RUN_KEY);
  if (!raw) return null;
  try {
    const run = checkRun(JSON.parse(raw) as Partial<RunState>);
    if (!run) { clearSave(); return null; }
    return run;
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
/** 解鎖到第幾級難度。2026-09-03 使用者拍板：五級預設全開，讓玩家自己選；通關紀錄仍照舊寫（UNLOCK_KEY），只是不再拿來鎖 */
export function unlockedDifficulty(): number {
  return MAX_DIFFICULTY;
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
