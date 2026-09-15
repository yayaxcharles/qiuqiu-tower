import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { makeShops, newCoopRun } from '../../src/engine/run';
import type { RunState } from '../../src/engine/types';

/*
 * 罐頭鋪的動作比貨架早到（審查 2026-09-15 高-2）。
 * 一個人倒下時最常見：站著的那位一票就定案、當場進店、買了東西、按了「逛好了」；
 * 倒下的那位還停在上一頁，他的票要等我回到地圖補跑才結算、才走進去掛貨架。
 * 以前那幾則買賣到了就判「做不出來」→ 整場停；「逛好了」也在回到地圖時被清掉 → 我按下去永遠等他。
 */
const print = (run: RunState): string => run.players.map((p) => `${p.fish}|${p.deck.map((c) => c.cardId).join(',')}`).join(' / ');

function pair() {
  const a = newCoopRun('early', 1); const b = newCoopRun('early', 1);
  for (const r of [a, b]) for (const p of r.players) p.fish = 999;
  const link = new LoopbackPair();
  const bad: string[] = [];
  const host = new CoopSession(link.a, { isHost: true, seat: 0, onDesync: (w) => bad.push(w) });
  const guest = new CoopSession(link.b, { isHost: false, seat: 1, onDesync: (w) => bad.push(w) });
  host.useRun(a); guest.useRun(b);
  return { a, b, host, guest, link, bad };
}

describe('罐頭鋪的動作比貨架早到', () => {
  it('主機先進店買東西，客戶端還沒走到那一格：先留著，貨架掛上就補套，不判分岔', () => {
    const { a, b, host, guest, bad } = pair();
    host.attachShop(makeShops(a));   // 主機進店了
    expect(host.submitRun({ t: 'buy', seat: 0, k: 'card', i: 0 })).toBe(true);
    expect(bad, '客戶端沒有貨架也不能停局').toEqual([]);
    expect(guest.stopped).toBe(false);
    expect(b.players[0]!.deck.length, '還沒套（貨架還沒掛）').toBe(10);
    guest.attachShop(makeShops(b));   // 客戶端走到那一格
    expect(b.players[0]!.deck.length, '掛上就補套').toBe(11);
    expect(print(a)).toBe(print(b));
  });

  it('反過來：客戶端先進店買、主機還沒到：主機照樣發號碼、留著等貨架', () => {
    const { a, b, host, guest, bad } = pair();
    guest.attachShop(makeShops(b));
    expect(guest.submitRun({ t: 'buy', seat: 1, k: 'card', i: 2 })).toBe(true);
    expect(b.players[1]!.deck.length, '主機發了號碼、客戶端套了').toBe(11);
    expect(a.players[1]!.deck.length, '主機先留著').toBe(10);
    host.attachShop(makeShops(a));
    expect(a.players[1]!.deck.length).toBe(11);
    expect(print(a)).toBe(print(b));
    expect(bad).toEqual([]);
  });

  it('留著的那幾則掛上貨架時做不出來（兩邊真的對不上）：照樣停下來講清楚', () => {
    const { a, b, host, guest, bad } = pair();
    host.attachShop(makeShops(a));
    host.submitRun({ t: 'buy', seat: 0, k: 'card', i: 0 });
    b.players[0]!.fish = 0;   // 客戶端這邊錢對不上
    guest.attachShop(makeShops(b));
    expect(bad.length).toBe(1);
    expect(guest.stopped).toBe(true);
  });

  it('沒有貨架的地方收到買東西、之後也沒有進店：不會憑空套用（留著的在下一次掛貨架才動）', () => {
    const { a, b, host, guest } = pair();
    host.attachShop(makeShops(a));
    host.submitRun({ t: 'buy', seat: 0, k: 'card', i: 0 });
    guest.attachShop(null);
    expect(b.players[0]!.deck.length).toBe(10);
  });
});

describe('沒人接的整局動作：回到地圖只清「上一次走格子之前」的', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('同伴一票定案進店按了「逛好了」，我這時才回到地圖：那一則要留給下一格', () => {
    const { a, b, host, guest } = pair();
    a.players[1]!.down = true; b.players[1]!.down = true;   // 我（客戶端）倒下，只有主機的票算數
    host.pick('map', 'n1');                                  // 他這一票就定案、他進店了
    host.attachShop(makeShops(a));
    host.submitRun({ t: 'done', seat: 0 });                  // 他逛好了；我還停在上一頁，沒人接
    guest.clearScreenHooks('map');                           // 我這時才回到地圖
    guest.syncRun(b, 'n1');                                  // 補跑那一票、走進去
    guest.attachShop(makeShops(b));
    const got: string[] = [];
    guest.onRunApplied((applied) => { for (const o of applied) got.push(`${o.a.t}@${o.a.seat}`); });
    vi.advanceTimersByTime(0);
    expect(got, '「逛好了」要補給罐頭鋪畫面，不然我按下去會永遠等他').toEqual(['done@0']);
  });

  it('上一格的動作（走格子投票之前到的）回到地圖照樣清掉', () => {
    const { a, b, host, guest } = pair();
    host.attachShop(makeShops(a)); guest.attachShop(makeShops(b));
    host.pick('map', 'n0'); guest.pick('map', 'n0');          // 走進上一格
    host.syncRun(a, 'n0'); guest.syncRun(b, 'n0');
    host.submitRun({ t: 'done', seat: 0 });                  // 上一格裡沒人接的
    guest.clearScreenHooks('map');
    const got: unknown[] = [];
    guest.onRunApplied((x) => got.push(x));
    vi.advanceTimersByTime(0);
    expect(got).toEqual([]);
  });
});
