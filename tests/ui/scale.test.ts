import { describe, expect, it } from 'vitest';
import { computeScale } from '../../src/ui/assets';

describe('縮放', () => {
  it('取寬高比例較小者', () => {
    expect(computeScale(1280, 720)).toBe(1);
    expect(computeScale(2560, 1440)).toBe(2);
    expect(computeScale(1920, 720)).toBe(1);
    expect(computeScale(640, 720)).toBe(0.5);
  });
});
