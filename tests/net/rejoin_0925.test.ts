import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { clearRejoin, noteRejoinRecv, readRejoin, REJOIN_MS, touchRejoin, writeRejoin } from '../../src/net/rejoin';
import { BYE, resumeRoom } from '../../src/net/ws';
import { startCombat } from '../../src/engine/combat';
import { newCoopRun } from '../../src/engine/run';
import { Rng, seedFromString } from '../../src/engine/rng';
import { blankPlayer, inst } from '../helpers';
import type { CombatState, PlayerCombat, RunState } from '../../src/engine/types';

/*
 * 重新整理之後接回連線局（2026-09-25 使用者：「兩件都做」——重新同步與重新整理後接回）。
 * 三層：分頁裡記的東西（`net/rejoin.ts`）、中繼那條線怎麼接回（`net/ws.ts` 的 `resumeRoom`）、
 * 會話怎麼接回（`CoopSession` 的 `resume`＋`rejoin`：兩台一起回到主機最近一次的地圖）。
 */

function twoPlayerCombat(seed: string): CombatState {
  const cs = startCombat({
    hp: 70, maxHp: 70,
    deck: ['sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding'].map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId: 'rats3', rng: new Rng(seedFromString(seed)),
  });
  const p2 = blankPlayer(['sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding'], 1);
  p2.energy = 3;
  p2.hand = p2.drawPile.splice(0, 5);
  cs.players.push(p2);
  return cs;
}

interface Side { s: CoopSession; resynced: string[]; desync: string[]; saved: { run: string | null; gen: number }[] }
function side(tx: LoopbackPair['a'], isHost: boolean, resume?: { gen: number; checkpoint: string | null }): Side {
  const me: Side = { s: null as unknown as CoopSession, resynced: [], desync: [], saved: [] };
  me.s = new CoopSession(tx, {
    isHost, seat: isHost ? 0 : 1, resume,
    onDesync: (w) => me.desync.push(w),
    onResync: (run) => { me.resynced.push(run); me.s.useRun(JSON.parse(run) as RunState); },
    onCheckpoint: (run, gen) => me.saved.push({ run, gen }),
  });
  return me;
}
const settle = (): void => { vi.advanceTimersByTime(1); };

/** 兩台開好、都回到過地圖一次（有存檔點） */
function table() {
  const link = new LoopbackPair();
  const host = side(link.a, true);
  const guest = side(link.b, false);
  const hostRun = newCoopRun('rejoin', 1, 'ninja', 'feifei');
  const guestRun = newCoopRun('rejoin', 1, 'ninja', 'feifei');
  hostRun.players[0]!.fish = 321;   // 主機那份才有的記號
  host.s.useRun(hostRun); guest.s.useRun(guestRun);
  host.s.checkpoint(hostRun); guest.s.checkpoint(guestRun);
  return { link, host, guest };
}

/** 重新同步之後照樣玩得下去：新的一場，主機出一張牌兩邊都套上、回合對帳對得上 */
function playsOn(host: Side, guest: Side): void {
  const a = twoPlayerCombat('after'); const b = twoPlayerCombat('after');
  host.s.attach(a); guest.s.attach(b);
  const uid = (a.players[0] as PlayerCombat).hand[0]!.uid;
  expect(host.s.submit({ t: 'card', seat: 0, u: uid, g: a.enemies[0]!.uid })).toBe(true);
  expect((b.players[0] as PlayerCombat).hand.some((c) => c.uid === uid), '客戶端也套上了').toBe(false);
  host.s.endOfTurn(); guest.s.endOfTurn();
  settle();
  expect(host.desync).toEqual([]); expect(guest.desync).toEqual([]);
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('會話：重新整理的那台接回來，兩台一起回到主機最近一次的地圖', () => {
  it('客戶端重新整理：請主機重新同步，兩台都載入主機那一份，之後照樣玩', () => {
    const t = table();
    const a = twoPlayerCombat('mid'); t.host.s.attach(a);   // 主機打到一半
    // 客戶端重新整理：舊的會話沒了，同一條線（中繼接回）上開一個新的、帶著分頁記的第幾輪
    const guest = side(t.link.b, false, { gen: 0, checkpoint: null });
    guest.s.rejoin();
    settle();
    expect(t.host.resynced).toHaveLength(1);
    expect(guest.resynced).toHaveLength(1);
    expect(guest.resynced[0]).toBe(t.host.resynced[0]);
    expect((JSON.parse(guest.resynced[0]!) as RunState).players[0]!.fish).toBe(321);
    expect(guest.saved.at(-1)!.gen, '新的一輪記進分頁').toBe(1);
    expect(t.host.s.stopped || guest.s.stopped).toBe(false);
    playsOn(t.host, guest);
  });

  it('主機重新整理：拿分頁存的存檔點直接重新同步，客戶端跟著回到那一份', () => {
    const t = table();
    const saved = t.host.saved.at(-1)!;
    const host = side(t.link.a, true, { gen: saved.gen, checkpoint: saved.run });
    host.s.rejoin();
    expect(host.resynced, '排到下一拍才換').toHaveLength(0);
    settle();
    expect(host.resynced).toHaveLength(1);
    expect(t.guest.resynced).toHaveLength(1);
    expect((JSON.parse(t.guest.resynced[0]!) as RunState).players[0]!.fish).toBe(321);
    playsOn(host, t.guest);
  });

  it('主機重新整理前還沒回到過地圖（沒有存檔點）：接不回來，照舊停下', () => {
    const link = new LoopbackPair();
    const host = side(link.a, true, { gen: 0, checkpoint: null });
    host.s.rejoin();
    expect(host.desync[0]).toContain('接不回');
  });

  it('客戶端重新整理、主機還沒回到過地圖：主機停下（對方會看到斷線）', () => {
    const link = new LoopbackPair();
    const host = side(link.a, true);
    const guest = side(link.b, false, { gen: 0, checkpoint: null });
    guest.s.rejoin();
    expect(host.desync[0]).toContain('接不回');
  });

  it('叫 rejoin 之前中繼補過來的存檔點與舊訊息一律不理（畫面的回呼還沒接好）；rejoin 之後再要一份新的', () => {
    const t = table();
    // 客戶端重新整理的途中，主機剛好重新同步過一次：那幾段存檔點會在新會話建起來的當下補過來
    t.link.hold = true;
    const a = twoPlayerCombat('x'); const b = twoPlayerCombat('x');
    t.host.s.attach(a); t.guest.s.attach(b); b.enemies[0]!.hp -= 1;
    t.guest.s.endOfTurn(); t.link.flush();   // 客戶端的對帳到主機
    t.host.s.endOfTurn(); settle();           // 主機發現對不上、重新同步（存檔點卡在路上）
    const guest = side(t.link.b, false, { gen: 0, checkpoint: null });
    t.link.flush();                           // 補過來了，可是還沒 rejoin
    t.link.hold = false;
    expect(guest.resynced).toHaveLength(0);
    guest.s.rejoin();
    settle();
    expect(guest.resynced).toHaveLength(1);
    expect(guest.saved.at(-1)!.gen).toBe(2);
    playsOn(t.host, guest);
  });
});

describe('打完之後、次數、輪次（推前稽核 2026-09-25 中-2、低-2、低-4）', () => {
  it('這一局打完了：對方重新整理來要，不再重新同步（不然兩個人被拉回最後一戰之前＝悔棋）', () => {
    const t = table();
    t.host.s.runOver();
    const guest = side(t.link.b, false, { gen: 0, checkpoint: null });
    guest.s.rejoin();
    settle();
    expect(t.host.resynced).toHaveLength(0);
    expect(t.host.desync[0]).toContain('打完');
  });

  it('打完之後才判到對不上（最後一回合的對帳晚到）：不重新同步、也不停下（稽核第三輪 低-3）', () => {
    const t = table();
    const a = twoPlayerCombat('late'); const b = twoPlayerCombat('late');
    t.host.s.attach(a); t.guest.s.attach(b); b.enemies[0]!.hp -= 1;
    t.host.s.runOver(); t.guest.s.runOver();
    t.host.s.endOfTurn(); t.guest.s.endOfTurn(); settle();
    expect(t.host.resynced).toHaveLength(0); expect(t.guest.resynced).toHaveLength(0);
    expect(t.host.desync).toEqual([]); expect(t.guest.desync).toEqual([]);
  });

  it('我這邊打完了、主機卻判對不上送來存檔點（兩台結局不同）：停下關線，主機馬上知道（第四輪 低-1）', () => {
    const t = table();
    const a = twoPlayerCombat('end'); const b = twoPlayerCombat('end');
    t.host.s.attach(a); t.guest.s.attach(b); b.enemies[0]!.hp -= 1;
    t.guest.s.runOver();                       // 客戶端判打完了，主機還沒
    t.guest.s.endOfTurn(); t.host.s.endOfTurn(); settle();
    expect(t.guest.resynced).toHaveLength(0);
    expect(t.guest.desync[0]).toContain('結果不一樣');
    expect(t.host.s.stopped, '主機那條線也跟著斷了').toBe(true);
  });

  it('打完之後回到地圖也不再記存檔點', () => {
    const t = table();
    const before = t.host.saved.length;
    t.host.s.runOver();
    t.host.s.checkpoint(newCoopRun('rejoin', 1, 'ninja', 'feifei'));
    expect(t.host.saved).toHaveLength(before);
  });

  it('客戶端收到重新整理接回的存檔點不算次數：接回幾次之後，真的對不上照樣能重新同步', () => {
    const t = table();
    let host = t.host;
    for (let i = 0; i < 4; i++) {
      const saved = host.saved.at(-1)!;
      host = side(t.link.a, true, { gen: saved.gen, checkpoint: saved.run });
      host.s.rejoin(); settle();
    }
    expect(t.guest.resynced).toHaveLength(4);
    host.s.useRun(JSON.parse(host.saved.at(-1)!.run!) as RunState); host.s.checkpoint(JSON.parse(host.saved.at(-1)!.run!) as RunState);
    const a = twoPlayerCombat('d'); const b = twoPlayerCombat('d');
    host.s.attach(a); t.guest.s.attach(b); b.enemies[0]!.hp -= 1;
    host.s.endOfTurn(); t.guest.s.endOfTurn(); settle();
    expect(t.guest.desync, '沒有因為次數用完而停下').toEqual([]);
    expect(t.guest.resynced).toHaveLength(5);
  });

  it('主機分頁記的輪次落後（寫入失敗）：接回的存檔點輪次比客戶端舊，客戶端照樣收下、改用它的輪次', () => {
    const t = table();
    diverge2(t);   // 兩台都到第 1 輪
    const host = side(t.link.a, true, { gen: 0, checkpoint: t.host.saved[0]!.run });   // 分頁只記到第 0 輪
    host.s.rejoin(); settle();
    expect(t.guest.resynced).toHaveLength(2);
    playsOn(host, t.guest);
  });
});

/** 對不上一次：兩台一起到第 1 輪 */
function diverge2(t: ReturnType<typeof table>): void {
  const a = twoPlayerCombat('d2'); const b = twoPlayerCombat('d2');
  t.host.s.attach(a); t.guest.s.attach(b); b.enemies[0]!.hp -= 1;
  t.host.s.endOfTurn(); t.guest.s.endOfTurn(); settle();
}

describe('分頁裡記的東西', () => {
  let box: Map<string, string>;
  beforeEach(() => {
    box = new Map();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => box.get(k) ?? null,
      setItem: (k: string, v: string) => { box.set(k, v); },
      removeItem: (k: string) => { box.delete(k); },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('記下、讀回；同一間房同一個身分是補寫（不會把存檔點洗掉）；清掉就沒了', () => {
    writeRejoin({ code: '123456', role: 'join', seat: 1, checkpoint: '{"x":1}', gen: 2 });
    noteRejoinRecv(40);
    writeRejoin({ code: '123456', role: 'join', seat: 1, gen: 3 });
    expect(readRejoin()).toMatchObject({ code: '123456', role: 'join', seat: 1, checkpoint: '{"x":1}', gen: 3, recv: 40 });
    clearRejoin();
    expect(readRejoin()).toBeNull();
    expect(box.size, '收到幾則那個鍵也一起清掉').toBe(0);
  });

  it('收到幾則只寫一個數字，不動整份記錄（每一則都要寫，整份讀寫太重）', () => {
    writeRejoin({ code: '123456', role: 'join', seat: 1, checkpoint: 'x'.repeat(5000) });
    const main = [...box.entries()].find(([k]) => !k.endsWith(':recv'))!;
    noteRejoinRecv(7);
    expect(box.get(main[0])).toBe(main[1]);
    expect(readRejoin()!.recv).toBe(7);
  });

  it('第一次寫記錄（還沒有舊的）不會把已經數好的「收到幾則」清掉（稽核第三輪 低-2）', () => {
    noteRejoinRecv(12);
    writeRejoin({ code: '123456', role: 'host', seat: 0, checkpoint: '{}', gen: 0 });
    expect(readRejoin()!.recv).toBe(12);
  });

  it('換了一間房：從頭記，上一間的存檔點與收到幾則不帶過來', () => {
    writeRejoin({ code: '111111', role: 'host', seat: 0, checkpoint: '{"old":1}', gen: 3 });
    noteRejoinRecv(9);
    writeRejoin({ code: '222222', role: 'host', seat: 0 });
    expect(readRejoin()).toMatchObject({ code: '222222', checkpoint: null, gen: 0, recv: 0 });
  });

  it(`有效期從離開頁面算（推前稽核 中-1）：在地圖上待了五分鐘才重新整理照樣接得回；離開超過 ${REJOIN_MS / 1000} 秒就不算`, () => {
    vi.setSystemTime(0);
    writeRejoin({ code: '123456', role: 'join', seat: 1, checkpoint: '{"cp":1}', gen: 1 });
    vi.setSystemTime(5 * 60_000);   // 五分鐘沒有任何訊息
    expect(readRejoin(), '還沒離開頁面：開機讀的話算過期').toBeNull();
    writeRejoin({ code: '123456', role: 'join', seat: 1, gen: 2 });
    expect(readRejoin(), '閒置之後的補寫不會把存檔點洗掉').toMatchObject({ checkpoint: '{"cp":1}', gen: 2 });
    vi.setSystemTime(9 * 60_000);
    touchRejoin();                  // 重新整理（離開頁面）
    vi.setSystemTime(9 * 60_000 + 5_000);
    expect(readRejoin()).toMatchObject({ checkpoint: '{"cp":1}' });
    expect(readRejoin(9 * 60_000 + REJOIN_MS + 1)).toBeNull();
  });

  it('內容壞掉：當成沒有', () => {
    writeRejoin({ code: '123456', role: 'join', seat: 1 });
    box.set([...box.keys()].find((k) => !k.endsWith(':recv'))!, '{壞掉');
    expect(readRejoin()).toBeNull();
  });
});

describe('中繼那條線：重新整理後接回同一間房', () => {
  class FakeWs extends EventTarget {
    readyState = 0;
    sent: string[] = [];
    constructor(public url: string) { super(); }
    send(s: string): void { this.sent.push(s); }
    close(): void { this.readyState = 3; }
    msg(v: unknown): void { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(v) })); }
  }
  let listeners: Map<string, () => void>;
  beforeEach(() => {
    listeners = new Map();
    vi.stubGlobal('window', { addEventListener: (k: string, fn: () => void) => { listeners.set(k, fn); }, removeEventListener: () => undefined });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('帶「收到幾則」接回；中繼先補的先收著、交給遊戲；之後送的從中繼說的數字接著編', async () => {
    const made: FakeWs[] = [];
    const j = resumeRoom('654321', 'join', 7, { ws: (u) => { const w = new FakeWs(u); made.push(w); return w as unknown as WebSocket; } });
    expect(made[0]!.url).toMatch(/\/room\/654321\?role=join&build=.*&resume=1&got=7$/);
    made[0]!.readyState = 1;
    made[0]!.msg({ m: 'sync', turn: 1, fp: 'a' });           // 中繼補漏掉的
    made[0]!.msg({ m: 'relay', s: 'open', got: 12 });
    const tx = await j.ready;
    const seen: unknown[] = []; const progress: number[] = [];
    tx.onMessage((m) => seen.push(m));
    tx.onProgress!((n) => progress.push(n));
    expect(seen).toEqual([{ m: 'sync', turn: 1, fp: 'a' }]);
    expect(progress, '收到幾則從分頁存的數字接著數').toEqual([8]);
    expect(tx.link).toEqual({ code: '654321', role: 'join' });
  });

  it('連線局進行中重新整理不說 bye（中繼才會等兩分鐘）；按離開照舊說', async () => {
    const made: FakeWs[] = [];
    const j = resumeRoom('654321', 'host', 0, { ws: (u) => { const w = new FakeWs(u); made.push(w); return w as unknown as WebSocket; } });
    made[0]!.readyState = 1;
    made[0]!.msg({ m: 'relay', s: 'open', got: 0 });
    const tx = await j.ready;
    tx.stayOnReload!(true);
    listeners.get('pagehide')!();
    expect(made[0]!.sent).not.toContain(BYE);
    tx.close();
    expect(made[0]!.sent).toContain(BYE);
  });
});
