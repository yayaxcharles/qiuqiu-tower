import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { clearRejoin, readRejoin, REJOIN_MS, writeRejoin } from '../../src/net/rejoin';
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
    writeRejoin({ code: '123456', role: 'join', seat: 1, recv: 40 });
    const r = readRejoin()!;
    expect(r).toMatchObject({ code: '123456', role: 'join', seat: 1, checkpoint: '{"x":1}', gen: 2, recv: 40 });
    clearRejoin();
    expect(readRejoin()).toBeNull();
  });

  it('換了一間房：從頭記，上一間的存檔點不帶過來', () => {
    writeRejoin({ code: '111111', role: 'host', seat: 0, checkpoint: '{"old":1}', gen: 3, recv: 9 });
    writeRejoin({ code: '222222', role: 'host', seat: 0, recv: 1 });
    expect(readRejoin()).toMatchObject({ code: '222222', checkpoint: null, gen: 0, recv: 1 });
  });

  it(`超過 ${REJOIN_MS / 1000} 秒（中繼不等了）或內容壞掉：當成沒有`, () => {
    writeRejoin({ code: '123456', role: 'join', seat: 1 });
    expect(readRejoin(Date.now() + REJOIN_MS + 1)).toBeNull();
    box.set([...box.keys()][0]!, '{壞掉');
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
