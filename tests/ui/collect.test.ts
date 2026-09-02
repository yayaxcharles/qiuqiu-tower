import { describe, expect, it } from 'vitest';
import { COLLECT_FLY, COLLECT_MIN_WAIT, collectTiming } from '../../src/ui/collect';

describe('收牌節拍', () => {
  it('不管幾張牌，重畫時最後一張都已經飛了八成五以上', () => {
    for (let n = 1; n <= 10; n++) {
      const { stagger, wait } = collectTiming(n);
      const lastStart = (n - 1) * stagger;
      const progress = (wait - lastStart) / COLLECT_FLY;
      expect(progress, `${n} 張時最後一張的進度`).toBeGreaterThanOrEqual(0.85);
    }
  });
  it('六張以內照原本的節奏（間隔 38、至少等 330）；十張時整排出發攤在 190 毫秒內、不會拖到六百', () => {
    expect(collectTiming(5)).toEqual({ stagger: 38, wait: Math.max(COLLECT_MIN_WAIT, Math.round(4 * 38 + COLLECT_FLY * 0.85)) });
    expect(collectTiming(6).stagger).toBe(38);
    const ten = collectTiming(10);
    expect(ten.stagger * 9).toBeLessThanOrEqual(190);
    expect(ten.wait).toBeLessThan(600);
  });
  it('沒有牌就不用等', () => {
    expect(collectTiming(0)).toEqual({ stagger: 0, wait: 0 });
  });
});
