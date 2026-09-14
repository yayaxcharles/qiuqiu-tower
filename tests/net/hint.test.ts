import { describe, expect, it } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';

/*
 * 「考慮中」提示（使用者 2026-09-15：像 Spire 2 那樣看得到隊友想打哪張）。
 * 純提示：不進鎖步、不進對帳、不碰任何狀態，只是把「我點了哪張」轉給對方的畫面。
 */
function pair() {
  const link = new LoopbackPair();
  const host = new CoopSession(link.a, { isHost: true, seat: 0 });
  const guest = new CoopSession(link.b, { isHost: false, seat: 1 });
  return { host, guest };
}

describe('隊友點選了哪張牌', () => {
  it('客戶端點選 → 主機的畫面收到座位與 uid；取消送 null', () => {
    const { host, guest } = pair();
    const got: [number, number | null][] = [];
    host.onHint((seat, u) => got.push([seat, u]));
    guest.hint(42);
    guest.hint(null);
    expect(got).toEqual([[1, 42], [1, null]]);
  });

  it('主機點選 → 客戶端收到；自己送的不會回到自己', () => {
    const { host, guest } = pair();
    const hostGot: unknown[] = []; const guestGot: unknown[] = [];
    host.onHint((s, u) => hostGot.push([s, u]));
    guest.onHint((s, u) => guestGot.push([s, u]));
    host.hint(7);
    expect(guestGot).toEqual([[0, 7]]);
    expect(hostGot).toEqual([]);
  });

  it('換畫面就不再通知（跟其他畫面級回呼一樣被清掉）', () => {
    const { host, guest } = pair();
    const got: unknown[] = [];
    host.onHint((s, u) => got.push([s, u]));
    host.clearScreenHooks('map');
    guest.hint(3);
    expect(got).toEqual([]);
  });
});
