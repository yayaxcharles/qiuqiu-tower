// 疊層連點保護的純函式（序章／結局幻燈片與文字對白共用，稽核 2026-09-04 L-1～L-3）
import { describe, expect, it } from 'vitest';
import { GATE_IMAGE_MS, GATE_MOUNT_MS, GATE_STEP_MS, eventNow, gateAccept, newClickGate } from '../../src/ui/clickgate';

describe('疊層連點保護', () => {
  it('剛掛上的 700 毫秒內一律不吃；之後每下至少隔 220 毫秒', () => {
    const g = newClickGate(1000);
    expect(gateAccept(g, 1005)).toBe(false);
    expect(gateAccept(g, 1000 + GATE_MOUNT_MS - 1)).toBe(false);
    expect(gateAccept(g, 1000 + GATE_MOUNT_MS)).toBe(true);
    expect(gateAccept(g, 1000 + GATE_MOUNT_MS + 50)).toBe(false);          // 緊接著再點：吃掉
    expect(gateAccept(g, 1000 + GATE_MOUNT_MS + GATE_STEP_MS)).toBe(true);
  });
  it('狂點八下的事件時間戳都在掛上那一刻：即使處理得很晚也一下都不吃', () => {
    const g = newClickGate(5000);
    const stamps = Array.from({ length: 8 }, (_, k) => 5000 + 3 + k * 40);   // 真人狂點：事件已造好排隊
    expect(stamps.map((ts) => gateAccept(g, ts)).some(Boolean)).toBe(false);
    expect(gateAccept(g, 5000 + 900)).toBe(true);
  });
  it('會換整張圖的那一下要跟上次換圖隔 600 毫秒（圖淡入 0.6 秒）', () => {
    const g = newClickGate(0);
    expect(gateAccept(g, 800, true)).toBe(true);                             // 第一次換圖
    expect(gateAccept(g, 800 + GATE_STEP_MS + 10, false)).toBe(true);        // 同一張圖下一句：正常
    expect(gateAccept(g, 800 + GATE_STEP_MS * 2 + 20, true)).toBe(false);    // 又要換圖，離上次換圖不到 600
    expect(gateAccept(g, 800 + GATE_IMAGE_MS, true)).toBe(true);
  });
  it('事件時間戳與 performance.now() 同基準才用；紀元毫秒（13 位數）或缺值就退回 performance.now()', () => {
    const near = performance.now();
    expect(Math.abs(eventNow({ timeStamp: near + 5 }) - (near + 5))).toBeLessThan(1);
    expect(Math.abs(eventNow({ timeStamp: 1.7e12 }) - performance.now())).toBeLessThan(50);
    expect(Math.abs(eventNow(undefined) - performance.now())).toBeLessThan(50);
  });
});
