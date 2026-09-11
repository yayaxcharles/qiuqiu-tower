import { describe, expect, it } from 'vitest';
import { bytesToCode, codeToBytes, packSignal, unpackSignal } from '../../src/net/code';

/*
 * 連線碼：把 WebRTC 的連線資訊壓成一串可以用 LINE 傳的字。
 *
 * WebRTC 本身測不到（測試環境沒有），但**這一段測得到**，
 * 而且它正是玩家最容易出錯的地方——貼到一半、被聊天室加了換行、
 * 兩邊開的是不同版的網頁。這幾種都要好好拒絕，不能丟一個看不懂的例外。
 */

/** 一段像樣的 SDP（真的 SDP 有一兩千字，這裡取個頭尾夠用了） */
const SDP = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:abcd',
  'a=ice-pwd:0123456789abcdef0123456789',
  'a=fingerprint:sha-256 AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
].join('\r\n') + '\r\n';

describe('連線碼', () => {
  it('壓下去再解回來，一個字都不差', async () => {
    const code = await packSignal('offer', SDP);
    const back = await unpackSignal(code);
    expect(back.kind).toBe('offer');
    expect(back.sdp).toBe(SDP);
  });

  it('壓完只剩下貼到哪裡都不會壞的字元', async () => {
    const code = await packSignal('answer', SDP);
    expect(code).toMatch(/^Q1A:[A-Za-z0-9_-]+$/);
    expect(code.length, '要真的有壓縮到，不能比原文還長').toBeLessThan(SDP.length);
  });

  it('邀請碼與回應碼分得出來（貼錯那一張是最常見的錯）', async () => {
    expect((await unpackSignal(await packSignal('offer', SDP))).kind).toBe('offer');
    expect((await unpackSignal(await packSignal('answer', SDP))).kind).toBe('answer');
  });

  it('**聊天室塞進來的換行與空白要吃得下**', async () => {
    const code = await packSignal('offer', SDP);
    const messy = `  ${code.slice(0, 20)}\n${code.slice(20, 50)}\r\n ${code.slice(50)}  `;
    expect((await unpackSignal(messy)).sdp).toBe(SDP);
  });

  it('貼錯、貼一半、版本不對，**都要講人話**', async () => {
    const code = await packSignal('offer', SDP);
    await expect(unpackSignal('隨便打的東西')).rejects.toThrow('不像連線碼');
    await expect(unpackSignal('Q9O:abcd')).rejects.toThrow('版本對不上');
    await expect(unpackSignal('Q1X:abcd')).rejects.toThrow('不像連線碼');
    await expect(unpackSignal(code.slice(0, code.length - 20)), '貼到一半').rejects.toThrow(/壞掉|內容不對/);
  });

  it('錯誤訊息不可以是原始的例外文字（玩家看不懂 InvalidCharacterError）', async () => {
    try {
      await unpackSignal('Q1O:!!!!not-base64!!!!');
      expect.unreachable('應該要丟錯');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/重貼|重傳/);
      expect(msg, '不該冒出英文的原始例外').not.toMatch(/[A-Za-z]{6,}Error/);
    }
  });

  it('位元組與碼互轉不會掉資料（含 0 與 255 這種邊界）', () => {
    const b = new Uint8Array(256);
    for (let i = 0; i < 256; i++) b[i] = i;
    expect([...codeToBytes(bytesToCode(b))]).toEqual([...b]);
  });
});
