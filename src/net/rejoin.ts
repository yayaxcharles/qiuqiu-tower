/**
 * 重新整理後接回連線局要記的東西（2026-09-25 使用者：「兩件都做」——重新同步與重新整理後接回）。
 *
 * 存在 `sessionStorage`（這個分頁專屬）：重新整理留著、關掉分頁就沒了，另一個分頁也看不到（兩個分頁開兩個身分不會打架）。
 * 記：房號、身分（開房／加入）、座位、第幾輪、最近的存檔點（回到地圖時的整局狀態）、收到對方幾則、最後一次更新的時間。
 * 超過中繼等人的時間（兩分鐘）就當成接不回去、不理。
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
const store = (): Storage | null => {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
};

export function readRejoin(now = Date.now()): RejoinRecord | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY());
    if (!raw) return null;
    const r = JSON.parse(raw) as RejoinRecord;
    if (!r || !/^\d{6}$/.test(r.code) || (r.role !== 'host' && r.role !== 'join') || now - r.at > REJOIN_MS) return null;
    return r;
  } catch {
    return null;
  }
}

export function writeRejoin(patch: Partial<RejoinRecord> & Pick<RejoinRecord, 'code' | 'role' | 'seat'>): void {
  const s = store();
  if (!s) return;
  try {
    const prev = readRejoin() ?? { gen: 0, checkpoint: null, recv: 0 };
    const same = 'code' in prev && (prev as RejoinRecord).code === patch.code && (prev as RejoinRecord).role === patch.role;
    const base = same ? prev : { gen: 0, checkpoint: null, recv: 0 };
    s.setItem(KEY(), JSON.stringify({ ...base, ...patch, at: Date.now() }));
  } catch { /* 存不進去（隱私模式、空間滿了）：重新整理就接不回來而已 */ }
}

export function clearRejoin(): void {
  try { store()?.removeItem(KEY()); } catch { /* 同上 */ }
}
