import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';

/*
 * 投票種類收成聯集型別（2026-09-23 health H-10）。拼錯字由 tsc 擋，這裡守的是**線上那一端**：
 * 訊息格式不變（`k` 還是字串，認得的種類照舊進票箱、通知畫面）；
 * 對面送來不認得的種類（兩台版本不同）記一行就丟，不進票箱——畫面本來就不理它，原本只是白白留在票箱裡。
 */
afterEach(() => { vi.restoreAllMocks(); });

describe('投票種類在線上那一端', () => {
  it('認得的照舊：主機投地圖，客戶端票箱有、畫面收到通知', () => {
    const link = new LoopbackPair();
    const host = new CoopSession(link.a, { isHost: true, seat: 0 });
    const guest = new CoopSession(link.b, { isHost: false, seat: 1 });
    const seen: string[] = [];
    guest.onPick((k) => { seen.push(k); });
    expect(host.pick('map', 'n1')).toBe(true);
    expect(seen).toEqual(['map']);
    expect(guest.picks('map', 2)).toEqual(['n1', null]);
  });

  it('不認得的種類：丟掉、記一行警告，不通知畫面', () => {
    const link = new LoopbackPair();
    new CoopSession(link.a, { isHost: true, seat: 0 });
    const guest = new CoopSession(link.b, { isHost: false, seat: 1 });
    const seen: string[] = [];
    guest.onPick((k) => { seen.push(k); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    link.a.send({ m: 'pick', seat: 0, k: 'evcrad', v: 'x' });   // 模擬對面送來拼錯的種類
    expect(seen).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('evcrad');
  });
});
