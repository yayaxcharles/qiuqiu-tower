/**
 * 重新整理後接回連線局要記的東西（2026-09-25 使用者：「兩件都做」——重新同步與重新整理後接回）。
 *
 * 存在 `sessionStorage`（這個分頁專屬）：重新整理留著、關掉分頁就沒了，另一個分頁也看不到（兩個分頁開兩個身分不會打架）。
 * 記：房號、身分（開房／加入）、座位、第幾輪、最近的存檔點（回到地圖時的整局狀態）、收到對方幾則、離開頁面的時間。
 * 離開頁面超過中繼等人的時間（兩分鐘）就當成接不回去、不理。
 */
export interface RejoinRecord {
  code: string;
  role: 'host' | 'join';
  seat: number;
  gen: number;
  checkpoint: string | null;
  recv: number;
  at: number;
}

/** 中繼等斷線的人回來的時間（`ws.ts` 的 `GRACE_MS`、中繼的 `GRACE_MS`）；超過就接不回去了 */
export const REJOIN_MS = 120_000;

const KEY = (): string => {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `qiuqiu-rejoin:${base}`;   // 單機版與連線版兩個網站同網域：照網址路徑分開
};
/*
 * 「收到幾則」另存一個鍵、只寫一個數字（推前稽核 2026-09-25 低-3）：每收到一則就要記，
 * 跟整份記錄（含整局存檔點，後期好幾 KB）放一起的話，每一則都要整份讀出來、解析、再寫回去
 */
const RECV_KEY = (): string => `${KEY()}:recv`;
const store = (): Storage | null => {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
};

/** 原始記錄，不看有效期（合併時用：有效期只在開機決定要不要接回時才看） */
function readRaw(s: Storage): RejoinRecord | null {
  const raw = s.getItem(KEY());
  if (!raw) return null;
  const r = JSON.parse(raw) as RejoinRecord;
  if (!r || !/^\d{6}$/.test(r.code) || (r.role !== 'host' && r.role !== 'join')) return null;
  return { ...r, recv: Number(s.getItem(RECV_KEY()) ?? 0) || 0 };
}

/**
 * 開機時讀：有記錄、而且**離開頁面**（`touchRejoin`）還不到兩分鐘才算數。
 * 從離開那一刻算，才跟中繼的等法一致（推前稽核 中-1）：兩個人在地圖上討論五分鐘再重新整理，照樣接得回去
 */
export function readRejoin(now = Date.now()): RejoinRecord | null {
  const s = store();
  if (!s) return null;
  try {
    const r = readRaw(s);
    return r && now - r.at <= REJOIN_MS ? r : null;
  } catch {
    return null;
  }
}

/** 補寫一部分（存檔點、第幾輪）：同一間房、同一個身分就接著舊的寫；換了房間從頭記 */
export function writeRejoin(patch: Partial<Omit<RejoinRecord, 'recv'>> & Pick<RejoinRecord, 'code' | 'role' | 'seat'>): void {
  const s = store();
  if (!s) return;
  try {
    let prev: RejoinRecord | null = null;
    try { prev = readRaw(s); } catch { prev = null; }
    const same = prev && prev.code === patch.code && prev.role === patch.role;
    if (!same) s.removeItem(RECV_KEY());
    const base = same ? { gen: prev!.gen, checkpoint: prev!.checkpoint } : { gen: 0, checkpoint: null };
    s.setItem(KEY(), JSON.stringify({ ...base, ...patch, at: Date.now() }));
  } catch { /* 存不進去（隱私模式、空間滿了）：重新整理就接不回來而已 */ }
}

/** 收到對方幾則（每收到一則就叫；只寫一個數字） */
export function noteRejoinRecv(recv: number): void {
  try { store()?.setItem(RECV_KEY(), String(recv)); } catch { /* 同上 */ }
}

/** 離開頁面（重新整理、關分頁）的那一刻：把時間記成現在，有效期從這裡起算 */
export function touchRejoin(): void {
  const s = store();
  if (!s) return;
  try {
    const raw = s.getItem(KEY());
    if (raw) s.setItem(KEY(), JSON.stringify({ ...(JSON.parse(raw) as object), at: Date.now() }));
  } catch { /* 同上 */ }
}

export function clearRejoin(): void {
  try { store()?.removeItem(KEY()); store()?.removeItem(RECV_KEY()); } catch { /* 同上 */ }
}
