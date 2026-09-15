import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BYE, GRACE_MS, hostRoom, joinRoom, makeCode, relayUrl, PING_MS } from '../../src/net/ws';
import type { LinkStatus, NetMessage } from '../../src/net/transport';

/*
 * 房號中繼的瀏覽器端（`src/net/ws.ts`）。中繼本身（`worker/`）跑在 Cloudflare 上，這裡用假的 WebSocket
 * 走完三條路：連上了、被中繼帶原因拒絕、等太久。真的兩台對連要用 `tools/relay_e2e.mjs` 對著線上中繼跑。
 */
class FakeWs extends EventTarget {
  readyState = 0;
  sent: string[] = [];
  closedWith: [number | undefined, string | undefined] | null = null;
  constructor(public url: string) { super(); }
  send(s: string): void { this.sent.push(s); }
  close(code?: number, reason?: string): void { this.readyState = 3; this.closedWith = [code, reason]; }
  /** 中繼說話／對方的遊戲訊息（`raw` 直接給字串，例如 pong） */
  msg(v: unknown, raw = false): void { this.dispatchEvent(new MessageEvent('message', { data: raw ? String(v) : JSON.stringify(v) })); }
  /** 中繼帶原因關掉（拒絕），或連不上 */
  serverClose(code: number, reason = ''): void {
    this.readyState = 3;
    const e = new Event('close') as Event & { code: number; reason: string };
    Object.assign(e, { code, reason });
    this.dispatchEvent(e);
  }
}
const factory = () => {
  const made: FakeWs[] = [];
  const ws = (url: string): WebSocket => { const w = new FakeWs(url); made.push(w); return w as unknown as WebSocket; };
  return { made, ws };
};
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++] ?? 0.5; };
const hosting = (w: FakeWs) => { w.readyState = 1; w.msg({ m: 'relay', s: 'hosting' }); };
const opened = (w: FakeWs) => { w.readyState = 1; w.msg({ m: 'relay', s: 'open' }); };

describe('房號', () => {
  it('六位數字，不夠補零', () => {
    expect(makeCode(() => 0.000001)).toBe('000001');
    expect(makeCode(() => 0.999999)).toBe('999999');
    expect(makeCode(() => 0.5)).toMatch(/^\d{6}$/);
  });
  it('中繼網址沒有結尾斜線', () => { expect(relayUrl().endsWith('/')).toBe(false); });
});

describe('開房', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('連中繼帶房號、角色與打包編號；中繼回 hosting 才給房號；對方到了才有 Transport', async () => {
    const f = factory();
    const p = hostRoom({ ws: f.ws, rng: seq(0.123456) });
    await Promise.resolve();
    expect(f.made[0]!.url).toMatch(/^wss?:\/\/.+\/room\/123456\?role=host&build=/);
    let got: string | null = null;
    void p.then((r) => { got = r.code; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(got, 'hosting 還沒來就不該給房號').toBeNull();
    hosting(f.made[0]!);
    const r = await p;
    expect(r.code).toBe('123456');
    opened(f.made[0]!);
    const tx = await r.ready;
    const seen: unknown[] = [];
    tx.onMessage((m) => seen.push(m));
    f.made[0]!.msg({ m: 'sync', turn: 3, fp: 'x' });
    expect(seen).toEqual([{ m: 'sync', turn: 3, fp: 'x' }]);
    tx.send({ m: 'drop', n: 1 });
    expect(f.made[0]!.sent).toEqual([JSON.stringify({ m: 'drop', n: 1 })]);
  });

  it('監聽器掛上之前到的遊戲訊息先收著，掛上就補跑（開局訊息不會無聲消失）', async () => {
    const f = factory();
    const p = hostRoom({ ws: f.ws, rng: seq(0.5) });
    await Promise.resolve(); hosting(f.made[0]!);
    const r = await p; opened(f.made[0]!);
    const tx = await r.ready;
    f.made[0]!.msg({ m: 'start', seed: 's', diff: 1, enc: '' });
    const seen: unknown[] = [];
    tx.onMessage((m) => seen.push(m));
    expect(seen).toEqual([{ m: 'start', seed: 's', diff: 1, enc: '' }]);
  });

  it('中繼的話與 pong 不交給遊戲；對方走了就收到 onClose', async () => {
    const f = factory();
    const p = hostRoom({ ws: f.ws, rng: seq(0.5) });
    await Promise.resolve(); hosting(f.made[0]!);
    const r = await p; opened(f.made[0]!);
    const tx = await r.ready;
    const seen: unknown[] = []; let why = '';
    tx.onMessage((m) => seen.push(m)); tx.onClose((w) => { why = w; });
    f.made[0]!.msg('pong', true);
    f.made[0]!.msg({ m: 'relay', s: 'closed' });
    expect(seen).toEqual([]);
    expect(why).toBe('對方離開了');
    const g = factory();
    const q = hostRoom({ ws: g.ws, rng: seq(0.5) });
    await Promise.resolve(); hosting(g.made[0]!);
    const r2 = await q; opened(g.made[0]!);
    let why2 = '';
    (await r2.ready).onClose((w) => { why2 = w; });
    g.made[0]!.msg({ m: 'relay', s: 'closed', why: '對方斷線太久，沒有回來' });
    expect(why2, 'closed 附的原因要照抄（審查 低-4）').toBe('對方斷線太久，沒有回來');
  });

  it('連上中繼就每 25 秒送一次 ping（開房等人那段也要送，不然三分鐘就被當殭屍踢掉）；關掉就不送了', async () => {
    const f = factory();
    const p = hostRoom({ ws: f.ws, rng: seq(0.5) });
    await Promise.resolve(); hosting(f.made[0]!);
    const r = await p;
    await vi.advanceTimersByTimeAsync(PING_MS * 2 + 10);
    expect(f.made[0]!.sent.filter((s) => s === 'ping').length, '對方還沒加入也要送').toBe(2);
    opened(f.made[0]!);
    const tx = await r.ready;
    await vi.advanceTimersByTimeAsync(PING_MS + 10);
    expect(f.made[0]!.sent.filter((s) => s === 'ping').length).toBe(3);
    tx.close();
    await vi.advanceTimersByTimeAsync(PING_MS * 2);
    expect(f.made[0]!.sent.filter((s) => s === 'ping').length).toBe(3);
  });

  it('cancel 之後也不再送 ping', async () => {
    const f = factory();
    const p = hostRoom({ ws: f.ws, rng: seq(0.5) });
    await Promise.resolve(); hosting(f.made[0]!);
    (await p).cancel();
    await vi.advanceTimersByTimeAsync(PING_MS * 2);
    expect(f.made[0]!.sent.filter((s) => s === 'ping').length).toBe(0);
  });

  it('房號撞到別人正在用的（4409）：換一個再開', async () => {
    const f = factory();
    const p = hostRoom({ ws: f.ws, rng: seq(0.111111, 0.222222) });
    await Promise.resolve();
    f.made[0]!.serverClose(4409, '這個房號已經有人在用');
    await vi.advanceTimersByTimeAsync(10);
    hosting(f.made[1]!);
    const r = await p;
    expect(r.code).toBe('222222');
    expect(f.made.length).toBe(2);
  });

  it('連中繼都連不上（沒原因就關掉）：講人話', async () => {
    const f = factory();
    const p = hostRoom({ ws: f.ws, rng: seq(0.5) });
    await Promise.resolve();
    f.made[0]!.serverClose(1006);
    await expect(p).rejects.toThrow('連不上中繼伺服器');
  });

  it('中繼 15 秒沒回 hosting 就放棄', async () => {
    const f = factory();
    const p = hostRoom({ ws: f.ws, rng: seq(0.5) });
    const check = expect(p).rejects.toThrow('等了 15 秒');
    await vi.advanceTimersByTimeAsync(15_000);
    await check;
  });

  it('等了十分鐘沒人加入：ready 拒絕、socket 關掉；cancel 也會關掉', async () => {
    const f = factory();
    const p = hostRoom({ ws: f.ws, rng: seq(0.5) });
    await Promise.resolve(); hosting(f.made[0]!);
    const r = await p;
    const check = expect(r.ready).rejects.toThrow('等了十分鐘');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await check;
    expect(f.made[0]!.closedWith).not.toBeNull();
    const g = factory();
    const q = hostRoom({ ws: g.ws, rng: seq(0.5) });
    await Promise.resolve(); hosting(g.made[0]!);
    (await q).cancel();
    expect(g.made[0]!.closedWith).not.toBeNull();
  });
});

describe('加入', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('房號不是六位數字就直接擋', async () => {
    await expect(joinRoom('12', {}).ready).rejects.toThrow('六位數字');
  });

  it('連上就有 Transport（房號裡的空白與破折號自動清掉）', async () => {
    const f = factory();
    const j = joinRoom(' 12-34 56 ', { ws: f.ws });
    expect(f.made[0]!.url).toMatch(/\/room\/123456\?role=join&build=/);
    opened(f.made[0]!);
    const tx = await j.ready;
    tx.send({ m: 'drop', n: 2 });
    expect(f.made[0]!.sent.length).toBe(1);
  });

  it('中繼帶原因拒絕（找不到房號、版本不同）：原因照抄給玩家', async () => {
    for (const [code, why] of [[4404, '找不到這個房號：對方還沒開房，或房號打錯了'], [4400, '版本不一樣（有一邊的頁面比較舊）']] as const) {
      const f = factory();
      const j = joinRoom('123456', { ws: f.ws });
      f.made[0]!.serverClose(code, why);
      await expect(j.ready).rejects.toThrow(why);
    }
  });

  it('15 秒中繼沒回話就放棄；cancel 會關掉 socket', async () => {
    const f = factory();
    const j = joinRoom('123456', { ws: f.ws });
    const check = expect(j.ready).rejects.toThrow('等了 15 秒');
    await vi.advanceTimersByTimeAsync(15_000);
    await check;
    const g = factory();
    const k = joinRoom('123456', { ws: g.ws });
    k.cancel();
    expect(g.made[0]!.closedWith).not.toBeNull();
  });
});

describe('中途斷線接回（2026-09-15）', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  /** 開好房、對方也到了，回 Transport 與兩張表 */
  async function connected(f = factory()) {
    const p = hostRoom({ ws: f.ws, rng: seq(0.5) });
    await Promise.resolve(); hosting(f.made[0]!);
    const r = await p; opened(f.made[0]!);
    const tx = await r.ready;
    const seen: NetMessage[] = []; const st: LinkStatus[] = []; const closed: string[] = [];
    tx.onMessage((m) => seen.push(m)); tx.onStatus!((s) => st.push(s)); tx.onClose((w) => closed.push(w));
    const game = (w: FakeWs) => w.sent.filter((s) => s !== 'ping');
    return { f, tx, seen, st, closed, game };
  }

  it('線路斷了（1006）：馬上用同一房號接回，帶「我收到幾則」；中繼補漏的、附「它收到我幾則」，我補送它沒收到的', async () => {
    const { f, tx, seen, st, game } = await connected();
    tx.send({ m: 'sync', turn: 1, fp: 'a' }); tx.send({ m: 'sync', turn: 2, fp: 'b' });
    f.made[0]!.msg({ m: 'sync', turn: 1, fp: 'x' });   // 收到 1 則
    f.made[0]!.serverClose(1006);
    expect(st).toEqual(['away']);
    expect(f.made.length, '馬上開新的一條').toBe(2);
    expect(f.made[1]!.url).toMatch(/\/room\/500000\?role=host&build=.*&resume=1&got=1$/);
    f.made[1]!.readyState = 1;
    f.made[1]!.msg({ m: 'sync', turn: 2, fp: 'y' }); f.made[1]!.msg({ m: 'sync', turn: 3, fp: 'z' });   // 中繼先補漏掉的
    f.made[1]!.msg({ m: 'relay', s: 'open', got: 1 });                                                  // 它只收到我第 1 則
    tx.send({ m: 'sync', turn: 9, fp: 'late' });                                                        // open 到了、補送還沒跑完：這一則也要排在後面
    await vi.advanceTimersByTimeAsync(10);
    expect(seen.map((m) => (m as { turn: number }).turn), '補的兩則照順序交給遊戲').toEqual([1, 2, 3]);
    expect(game(f.made[1]!), '只補送第 2 則，補送期間送的排在後面').toEqual([JSON.stringify({ m: 'sync', turn: 2, fp: 'b' }), JSON.stringify({ m: 'sync', turn: 9, fp: 'late' })]);
    expect(st).toEqual(['away', 'back']);
    tx.send({ m: 'sync', turn: 3, fp: 'c' });
    expect(game(f.made[1]!).length, '接回之後照常從新的那條送').toBe(3);
    await vi.advanceTimersByTimeAsync(PING_MS + 10);
    expect(f.made[1]!.sent.filter((s) => s === 'ping').length, '心跳換到新的那條').toBe(1);
  });

  it('斷線期間按的操作先排隊，接回就補送；中繼的 open 沒帶 got 就當它全收到了', async () => {
    const { f, tx, game } = await connected();
    tx.send({ m: 'sync', turn: 1, fp: 'a' });
    f.made[0]!.serverClose(1006);
    tx.send({ m: 'sync', turn: 2, fp: 'b' }); tx.send({ m: 'sync', turn: 3, fp: 'c' });
    expect(f.made[1]!.sent, '斷線中不會往舊的送').toEqual([]);
    f.made[1]!.readyState = 1;
    f.made[1]!.msg({ m: 'relay', s: 'open', got: 1 });
    await vi.advanceTimersByTimeAsync(10);
    expect(game(f.made[1]!).map((s) => (JSON.parse(s) as { turn: number }).turn)).toEqual([2, 3]);
  });

  it('連不上就照 1、2、4、8 秒退著再試，兩分鐘後放棄：onClose 講人話', async () => {
    const { f, closed, st } = await connected();
    f.made[0]!.serverClose(1006);
    const made = [f.made.length];
    for (let i = 0; i < 40 && !closed.length; i++) { f.made[f.made.length - 1]!.serverClose(1006); await vi.advanceTimersByTimeAsync(8000); made.push(f.made.length); }
    expect(closed[0]).toMatch(/重新連線失敗/);
    expect(f.made.length, '兩分鐘內大約試十幾次，不是每秒一次').toBeGreaterThan(5);
    expect(f.made.length).toBeLessThan(40);
    expect(st, '放棄之前一直是 away，沒有假的 back').toEqual(['away']);
    const n = f.made.length;
    await vi.advanceTimersByTimeAsync(GRACE_MS);
    expect(f.made.length, '放棄之後不再開新的連線').toBe(n);
  });

  it('中繼拒絕接回（4410 房間已經關了）：不再試，原因照抄給 onClose', async () => {
    const { f, closed } = await connected();
    f.made[0]!.serverClose(1006);
    f.made[1]!.serverClose(4410, '斷線太久，房間已經關了。兩邊回標題重新開房');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(closed).toEqual(['斷線太久，房間已經關了。兩邊回標題重新開房']);
    expect(f.made.length).toBe(2);
  });

  it('對方斷線／回來：peerAway／peerBack，自己照常可以送', async () => {
    const { f, tx, st, game } = await connected();
    f.made[0]!.msg({ m: 'relay', s: 'away' });
    tx.send({ m: 'sync', turn: 1, fp: 'a' });
    f.made[0]!.msg({ m: 'relay', s: 'back' });
    expect(st).toEqual(['peerAway', 'peerBack']);
    expect(game(f.made[0]!).length).toBe(1);
  });

  it('自己關掉：先跟中繼說 bye，之後線路關掉也不會去接回；對方走了（closed）也不接回', async () => {
    const a = await connected();
    a.tx.close();
    expect(a.f.made[0]!.sent).toContain(BYE);
    a.f.made[0]!.serverClose(1006);
    await vi.advanceTimersByTimeAsync(5000);
    expect(a.f.made.length, '自己關掉的不接回').toBe(1);
    expect(a.closed).toEqual(['自己關掉了']);
    const b = await connected();
    b.f.made[0]!.msg({ m: 'relay', s: 'closed' });
    b.f.made[0]!.serverClose(4000, '對方離開了');
    await vi.advanceTimersByTimeAsync(5000);
    expect(b.f.made.length).toBe(1);
    expect(b.closed).toEqual(['對方離開了']);
  });
});
