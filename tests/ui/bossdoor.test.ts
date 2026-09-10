import { describe, expect, it } from 'vitest';
import { _setManifestForTest } from '../../src/ui/assets';
import { bossDoorKey, hasBossDoor } from '../../src/ui/screenbg';

/**
 * 關主戰前那扇門（使用者 2026-09-10：「讓玩家有種必須得打開門、打過這隻 BOSS 才能往上」）。
 *
 * 這裡守的是**路由的判準**：`app.ts` 用 `hasBossDoor` 決定要不要先走門那個畫面。
 * 判錯的兩種後果都很嚴重——說沒有就永遠看不到門，說有卻沒圖就卡在一個空畫面進不了關主戰。
 */
function withDoors(...acts: number[]): void {
  const bg: Record<string, string> = {};
  for (const a of acts) bg[`bg/door_act${a}`] = `assets/bg/door_act${a}.webp`;
  _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, icons: {}, bg, review: [] });
}

describe('關主門', () => {
  it('三關各一扇，關數超出範圍夾回 1～3', () => {
    expect(bossDoorKey(1)).toBe('bg/door_act1');
    expect(bossDoorKey(2)).toBe('bg/door_act2');
    expect(bossDoorKey(3)).toBe('bg/door_act3');
    for (const a of [-1, 0, 4, 99]) {
      expect(bossDoorKey(a).includes('undefined')).toBe(false);
      expect(['bg/door_act1', 'bg/door_act3']).toContain(bossDoorKey(a));
    }
  });

  it('圖生好了才說有', () => {
    withDoors(1, 2, 3);
    expect(hasBossDoor(1)).toBe(true);
    expect(hasBossDoor(3)).toBe(true);
  });

  it('**圖沒生好就說沒有**：那條路要能整個跳過，直接開打', () => {
    withDoors();                       // 一扇都沒有
    expect(hasBossDoor(1)).toBe(false);
    expect(hasBossDoor(2)).toBe(false);
    expect(hasBossDoor(3)).toBe(false);
  });

  it('只生了一部分：有的那關走門、沒有的那關直接開打', () => {
    withDoors(1);
    expect(hasBossDoor(1)).toBe(true);
    expect(hasBossDoor(2)).toBe(false);
    expect(hasBossDoor(3)).toBe(false);
  });
});
