import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * 立繪鍵有沒有對到真的檔案。
 *
 * 牌面插圖早就有這條把關（`cards.test.ts`），立繪一直沒有。少一條的後果很安靜：
 * `POSE` 裡打錯一個字（`hero/ninja_bely`）→ `hasSprite` 回 false → `idlePoseKey` 往下一條退 →
 * 測試全過、線上不報錯、那個狀態永遠顯示站姿，沒有人會發現（稽核 2026-09-10 低-4）。
 */
const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8')) as {
  sprites: Record<string, string>;
};

/** `combat.ts` 的 POSE 表。改那邊要改這邊——這條測試的用途就是逼你想起來 */
const POSE_KEYS = [
  'hero/ninja', 'hero/ninja_attack', 'hero/ninja_hit', 'hero/ninja_dodge',
  'hero/ninja_hungry', 'hero/ninja_win', 'hero/ninja_lose', 'hero/ninja_curl',
  'hero/ninja_power', 'hero/ninja_hurt', 'hero/ninja_skill', 'hero/ninja_throw',
  'hero/ninja_claw', 'hero/ninja_kick', 'hero/ninja_dash', 'hero/ninja_punch',
  'hero/ninja_guard', 'hero/ninja_eat', 'hero/ninja_choke', 'hero/ninja_dizzy',
  'hero/ninja_focus', 'hero/ninja_scroll',
  'hero/ninja_belly', 'hero/ninja_lazy', 'hero/ninja_puff', 'hero/ninja_stealth', 'hero/ninja_iron',
];

describe('立繪清單', () => {
  it('每一個姿勢鍵都在 manifest 裡，而且檔案真的存在', () => {
    const missingKey = POSE_KEYS.filter((k) => manifest.sprites[k] === undefined);
    expect(missingKey).toEqual([]);
    const missingFile = POSE_KEYS.filter((k) => !existsSync(`public/${manifest.sprites[k]}`));
    expect(missingFile).toEqual([]);
  });

  it('manifest 裡的立繪檔案沒有一個是空的', () => {
    const bad = Object.entries(manifest.sprites).filter(([, rel]) => !existsSync(`public/${rel}`));
    expect(bad).toEqual([]);
  });
});
