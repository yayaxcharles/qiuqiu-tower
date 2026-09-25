import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { _setManifestForTest, artUrl, monsterUrl, setLocalHero, type Manifest } from '../../src/ui/assets';
import { portraitOf } from '../../src/ui/dialogue';
import qiuqiuMotionData from '../../src/ui/qiuqiu-motion-data.json';
import feifeiMotionData from '../../src/ui/feifei-motion-data.json';
import dangdangMotionData from '../../src/ui/dangdang-motion-data.json';
import fengfengMotionData from '../../src/ui/fengfeng-motion-data.json';

/**
 * 對白頭像換成新畫風（2026-09-22）：四隻貓講話時，左上方那隻換成新版待機第 1 格裁出來的圖
 *（`hero/<代號>_portrait`）。舊寫法用的是舊版靜態立繪 `hero/ninja`／`hero/<代號>_idle`，這裡會失敗。
 * 連線的 `literal` 規則（說話者就是本人）與塔主、黑貓忍者頭目的立繪不動。
 */
const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
const HEROES = [
  { hero: 'ninja', speaker: '球球', idle: qiuqiuMotionData },
  { hero: 'feifei', speaker: '菲菲', idle: feifeiMotionData },
  { hero: 'dangdang', speaker: '噹噹', idle: dangdangMotionData },
  { hero: 'fengfeng', speaker: '封封', idle: fengfengMotionData },
] as const;
const portrait = (hero: string): string => `/assets/sprites/hero/${hero}_portrait.webp`;

afterEach(() => { _setManifestForTest(MANIFEST); setLocalHero(undefined); });

describe('對白頭像', () => {
  it.each(HEROES)('$speaker 講話時用新版待機裁出來的頭像', ({ hero, speaker }) => {
    _setManifestForTest(MANIFEST);
    setLocalHero('ninja');
    expect(portraitOf(speaker)).toBe(portrait(hero));
    // 劇本寫「球球」＝這一局本機那一位在講（換角色時臉跟著換）
    setLocalHero(hero);
    expect(portraitOf('球球')).toBe(portrait(hero));
  });

  it('連線 literal：「球球」就是球球本人，不換成本機那一位的臉', () => {
    _setManifestForTest(MANIFEST);
    setLocalHero('feifei');
    expect(portraitOf('球球', true)).toBe(portrait('ninja'));
    expect(portraitOf('菲菲', true)).toBe(portrait('feifei'));
  });

  it.each(HEROES)('$hero 的頭像就是新版待機第 1 格（外圍多留 6 像素透明邊）', ({ hero, idle }) => {
    const bytes = readFileSync(`public/assets/sprites/hero/${hero}_portrait.webp`);
    expect(new TextDecoder().decode(bytes.subarray(12, 16))).toBe('VP8X');
    const read24 = (at: number): number => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
    const size = [1 + read24(24), 1 + read24(27)];
    if (hero === 'dangdang') {
      // 2026-09-23：他的待機圖集太小（第 1 格 167×240，框高 290 要放大、偏軟），改從選角那張新畫風待機靜態圖裁
      //（同一個架式，tools/make_dialogue_portraits.py 的 STATIC_SOURCE），比框還高、不用放大
      expect(size[1]).toBeGreaterThanOrEqual(300);
      return;
    }
    const [, , w, h] = (idle.actions.idle as { frames: { rect: number[] }[] }).frames[0]!.rect;
    expect(size).toEqual([w! + 12, h! + 12]);
  });

  it('其他說話者不動：塔主、黑貓忍者頭目照舊，旁白與村貓沒有臉', () => {
    _setManifestForTest(MANIFEST);
    expect(portraitOf('塔主')).toBe(artUrl('sprites', 'boss/idle1'));
    // 結局醒來之後的師父（2026-09-25）：承讓躬身那張，不是戰鬥造型的待機圖
    expect(portraitOf('大俠貓')).toBe(artUrl('sprites', 'boss/defeat'));
    expect(portraitOf('大俠貓')).not.toBe(portraitOf('塔主'));
    expect(portraitOf('黑貓忍者頭目')).toBe(monsterUrl('codex/monster_ninja_boss', 'idle'));
    expect(portraitOf('旁白')).toBeNull();
    expect(portraitOf('村貓')).toBeNull();
  });

  it('清單裡還沒有頭像（舊清單）就退回舊立繪，不變灰剪影', () => {
    const sprites = Object.fromEntries(Object.entries(MANIFEST.sprites).filter(([key]) => !key.endsWith('_portrait')));
    _setManifestForTest({ ...MANIFEST, sprites });
    expect(portraitOf('球球')).toBe('/assets/sprites/hero/ninja.webp');
    expect(portraitOf('菲菲')).toBe('/assets/sprites/hero/feifei_idle.webp');
    expect(portraitOf('封封')).toBe('/assets/sprites/hero/fengfeng_idle.webp');
  });
});
