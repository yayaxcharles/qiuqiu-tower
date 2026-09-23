import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';

/*
 * 事件畫面改成按需載入之後（2026-09-23 內容擴充 0-1），兩台進事件畫面的時間會差一截：
 * 快的那台已經在投票，慢的那台還停在地圖上等畫面模組（`app.ts` 的 `enterEvent`）。
 *
 * 要守的兩件事：
 *  ①慢的那台**不能漏票**：同伴在這段時間投的事件票，事件畫面掛上時要補給它（`onPick` 的晚到補跑）。
 *  ②慢的那台**不能被地圖票帶走**：我倒下時同伴一個人決定、按完「繼續」回到地圖又投了下一格，
 *    那一張地圖票要是被還掛著的地圖處理函式接到，我就在還沒跑事件結果之前走進下一格。
 *    所以 `enterEvent` 一開始就 `clearScreenHooks('event')`，把地圖那支拆掉。
 */
function pair() {
  const link = new LoopbackPair();
  const fast = new CoopSession(link.a, { isHost: true, seat: 0 });
  const slow = new CoopSession(link.b, { isHost: false, seat: 1 });
  return { fast, slow };
}

describe('慢的那台還在下載事件畫面時', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('拆掉地圖的處理之後：同伴的事件票與下一格的地圖票都先存著，地圖那支一張都接不到', () => {
    const { fast, slow } = pair();
    const mapSaw: string[] = [];
    slow.onPick((k) => { mapSaw.push(k); });   // 地圖畫面掛的那一支
    vi.advanceTimersByTime(0);
    slow.clearScreenHooks('event');           // `enterEvent` 第一件事
    fast.pick('event', '1');
    fast.pick('map', 'n7');
    expect(mapSaw, '地圖處理函式不該再收到任何一票').toEqual([]);
    expect(slow.picks('event', 2)).toEqual(['1', null]);
    expect(slow.picks('map', 2)).toEqual(['n7', null]);
  });

  it('事件畫面掛上時補跑：事件票一定送到，不用等下一張票進來', () => {
    const { fast, slow } = pair();
    slow.onPick(() => undefined);
    vi.advanceTimersByTime(0);
    slow.clearScreenHooks('event');
    fast.pick('event', '1');
    // 畫面模組到了：`show('event')` 會再清一次（同一個畫面），接著事件畫面掛上自己的處理函式
    slow.clearScreenHooks('event');
    const eventSaw: string[] = [];
    slow.onPick((k) => { eventSaw.push(k); });
    expect(eventSaw, '註冊當下不補（畫面還沒畫完）').toEqual([]);
    vi.advanceTimersByTime(0);
    expect(eventSaw).toEqual(['event']);
  });

  it('反例：不拆的話，地圖那支會接到同伴下一格的地圖票（這就是 `enterEvent` 要先拆的原因）', () => {
    const { fast, slow } = pair();
    const mapSaw: string[] = [];
    slow.onPick((k) => { mapSaw.push(k); });
    fast.pick('event', '1');
    fast.pick('map', 'n7');
    expect(mapSaw).toEqual(['event', 'map']);
  });
});
