// 螢幕座標換算成 1280 寬舞台座標（清理 2026-09-22 B5：七處同樣的換算收成一支）
import { describe, expect, it } from 'vitest';
import { stageFrame } from '../../src/ui/dom';

const fakeStage = (left: number, top: number, width: number) =>
  ({ getBoundingClientRect: () => ({ left, top, width, height: width * 720 / 1280 }) }) as unknown as Element;

describe('stageFrame', () => {
  it('縮成一半的舞台：倍率 2，原點是舞台左上角', () => {
    expect(stageFrame(fakeStage(100, 40, 640))).toEqual({ left: 100, top: 40, k: 2 });
  });
  it('放大 1.5 倍的舞台：螢幕 1920 寬換回 1280', () => {
    const f = stageFrame(fakeStage(0, 0, 1920));
    expect((1920 - f.left) * f.k).toBeCloseTo(1280);
  });
  it('量不到寬度（還沒排版）時倍率退回 1，不會變成無限大', () => {
    expect(stageFrame(fakeStage(0, 0, 0)).k).toBe(1);
  });
});
