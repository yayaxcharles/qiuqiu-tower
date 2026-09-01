import { describe, expect, it } from 'vitest';

import { STAGE_W, UNIT_W, enemyLeft } from '../../src/ui/enemylayout';

describe('魔物在戰場上的位置', () => {
  it('一到五隻都要整排待在畫面裡', () => {
    for (let n = 1; n <= 5; n++) {
      for (let i = 0; i < n; i++) {
        const left = enemyLeft(i, n);
        expect(left, `${n} 隻的第 ${i + 1} 隻左緣`).toBeGreaterThanOrEqual(0);
        expect(left + UNIT_W, `${n} 隻的第 ${i + 1} 隻右緣`).toBeLessThanOrEqual(STAGE_W);
      }
    }
  });

  it('不會壓到左邊的球球（球球佔到 270）', () => {
    for (let n = 1; n <= 5; n++) expect(enemyLeft(0, n)).toBeGreaterThan(270);
  });

  it('由左到右依序排開、不重疊', () => {
    for (let n = 2; n <= 5; n++) {
      for (let i = 1; i < n; i++) {
        expect(enemyLeft(i, n) - enemyLeft(i - 1, n), `${n} 隻的間距`).toBeGreaterThanOrEqual(150);
      }
    }
  });

  it('整排是置中的', () => {
    for (let n = 1; n <= 5; n++) {
      const mid = (enemyLeft(0, n) + enemyLeft(n - 1, n) + UNIT_W) / 2;
      expect(Math.abs(mid - 875), `${n} 隻的中心`).toBeLessThanOrEqual(1);
    }
  });

  // 這是真的踩過的坑：塔主召喚第三批時，倒下的魔物還佔著位子，
  // 索引 8 算出來是 1380，整隻在畫面外。倒下的一律傳 -1，就不會再參與排位。
  it('倒下的（-1）擺在中央，不會算出畫面外的座標', () => {
    expect(enemyLeft(-1, 5)).toBe(780);
    expect(enemyLeft(-1, 1) + UNIT_W).toBeLessThanOrEqual(STAGE_W);
  });
});
