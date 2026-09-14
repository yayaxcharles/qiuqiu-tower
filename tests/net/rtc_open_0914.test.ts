import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { untilOpen } from '../../src/net/rtc';

/*
 * 總稽核 2026-09-14 B 高-1：連不起來時大廳永遠停在「正在接上…」。
 * 原本只等通道的 `open`／`error`，ICE 談判失敗根本不會走到通道那層，承諾永遠沒有結果。
 * 這裡用假的連線物件（只要有事件與狀態欄位）驗三條路：開了、失敗了、等太久。
 */
class FakePc extends EventTarget { connectionState = 'connecting'; }
class FakeCh extends EventTarget { readyState = 'connecting'; }
const asPc = (p: FakePc): RTCPeerConnection => p as unknown as RTCPeerConnection;
const asCh = (c: FakeCh): RTCDataChannel => c as unknown as RTCDataChannel;

describe('等通道開好（untilOpen）', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('通道開了就解出那條通道', async () => {
    const pc = new FakePc(); const ch = new FakeCh();
    const p = untilOpen(asPc(pc), asCh(ch), 20_000, '太久');
    ch.readyState = 'open'; ch.dispatchEvent(new Event('open'));
    await expect(p).resolves.toBe(ch);
  });

  it('連線狀態變 failed 就拒絕（以前這條路永遠沒有結果）', async () => {
    const pc = new FakePc(); const ch = new FakeCh();
    const p = untilOpen(asPc(pc), asCh(ch), 20_000, '太久');
    pc.connectionState = 'failed'; pc.dispatchEvent(new Event('connectionstatechange'));
    await expect(p).rejects.toThrow('連不上對方');
  });

  it('等太久就拒絕，訊息照呼叫端給的', async () => {
    const pc = new FakePc(); const ch = new FakeCh();
    const p = untilOpen(asPc(pc), asCh(ch), 20_000, '等了 20 秒都沒接上');
    const check = expect(p).rejects.toThrow('等了 20 秒都沒接上');
    await vi.advanceTimersByTimeAsync(20_000);
    await check;
  });

  it('加入的那一方：通道還沒拿到（Promise）也一樣等得到', async () => {
    const pc = new FakePc(); const ch = new FakeCh();
    let give: (c: RTCDataChannel) => void = () => {};
    const got = new Promise<RTCDataChannel>((r) => { give = r; });
    const p = untilOpen(asPc(pc), got, 60_000, '太久');
    give(asCh(ch));
    await Promise.resolve();
    ch.readyState = 'open'; ch.dispatchEvent(new Event('open'));
    await expect(p).resolves.toBe(ch);
  });
});
