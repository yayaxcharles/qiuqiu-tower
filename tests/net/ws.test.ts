import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostRoom, joinRoom, makeCode, relayUrl, PING_MS } from '../../src/net/ws';

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
  });

  it('連上之後每 25 秒送一次 ping；關掉就不送了', async () => {
    const f = factory();
    const p = hostRoom({ ws: f.ws, rng: seq(0.5) });
    await Promise.resolve(); hosting(f.made[0]!);
    const r = await p; opened(f.made[0]!);
    const tx = await r.ready;
    await vi.advanceTimersByTimeAsync(PING_MS * 2 + 10);
    expect(f.made[0]!.sent.filter((s) => s === 'ping').length).toBe(2);
    tx.close();
    await vi.advanceTimersByTimeAsync(PING_MS * 2);
    expect(f.made[0]!.sent.filter((s) => s === 'ping').length).toBe(2);
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
