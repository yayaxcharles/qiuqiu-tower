import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { makeShop, newCoopRun } from '../../src/engine/run';

/*
 * 2026-09-15 兩個審查代理抓到的「靜音卡死」：
 * ①整局動作比畫面早到（走格子後投的那位同步進店，先投的要等一個來回；這個空檔裡同伴按「逛好了」），
 *   沒人接的動作要存著、畫面掛上就補給它——不然我按下「逛好了」永遠灰著。
 * ②「沒算數」（drop）只認最新那一則：更早那則遲到的 drop 不能解鎖、不能把剛送出的選牌當成沒算數。
 */
function shopPair() {
  const a = newCoopRun('late', 1); const b = newCoopRun('late', 1);
  const link = new LoopbackPair();
  const host = new CoopSession(link.a, { isHost: true, seat: 0 });
  const guest = new CoopSession(link.b, { isHost: false, seat: 1 });
  host.useRun(a); host.attachShop(makeShop(a));
  guest.useRun(b); guest.attachShop(makeShop(b));
  return { host, guest, link };
}

describe('比畫面早到的整局動作', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('主機還沒掛畫面時同伴按了「逛好了」：畫面掛上就補給它', () => {
    const { host, guest } = shopPair();
    expect(guest.submitRun({ t: 'done', seat: 1 })).toBe(true);   // 主機這時沒有 onRunApplied → 存著
    const got: string[] = [];
    host.onRunApplied((applied) => { for (const o of applied) got.push(`${o.a.t}@${o.a.seat}`); });
    expect(got, '註冊當下不補（畫面還沒畫完）').toEqual([]);
    vi.advanceTimersByTime(0);
    expect(got).toEqual(['done@1']);
  });

  it('客戶端那一邊也一樣（主機發完號碼廣播回來時我還沒進店）', () => {
    const { host, guest } = shopPair();
    expect(host.submitRun({ t: 'done', seat: 0 })).toBe(true);
    const got: string[] = [];
    guest.onRunApplied((applied) => { for (const o of applied) got.push(`${o.a.t}@${o.a.seat}`); });
    vi.advanceTimersByTime(0);
    expect(got).toEqual(['done@0']);
  });

  it('回到地圖就清掉：上一格沒人接的動作不會補給下一格', () => {
    const { host, guest } = shopPair();
    guest.submitRun({ t: 'done', seat: 1 });
    host.clearScreenHooks('map');
    const got: unknown[] = [];
    host.onRunApplied((a) => got.push(a));
    vi.advanceTimersByTime(0);
    expect(got).toEqual([]);
  });

  it('有人在接的時候直接給，不存', () => {
    const { host, guest } = shopPair();
    const got: string[] = [];
    host.onRunApplied((applied) => { for (const o of applied) got.push(o.a.t); });
    guest.submitRun({ t: 'done', seat: 1 });
    expect(got).toEqual(['done']);
  });
});
