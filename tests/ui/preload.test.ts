// 分關預載的名單（src/ui/preload.ts）：第一關不該抓第二關的關主，召喚物要跟著主人一起算
import { describe, expect, it, vi } from 'vitest';
import { _setManifestForTest, preloadArt, warmed } from '../../src/ui/assets';
import { enemyIdsForAct, monsterArtKeysForAct, preloadAct, warmEncounter } from '../../src/ui/preload';

describe('魔物立繪分關預載', () => {
  it('第一關：塔下五關主與牠們的召喚物都在，第二關關主不在', () => {
    const a1 = enemyIdsForAct(1);
    for (const id of ['nekomata', 'nekomata_tail', 'frog_daimyo', 'tadpole', 'orange_king', 'iron_claw', 'armadillo_king']) expect(a1.has(id), id).toBe(true);
    for (const id of ['cowcat_boss', 'persian_lady', 'butler_cat', 'tower_master']) expect(a1.has(id), id).toBe(false);
  });
  it('第二關：塔中關主與僕從在，第三關只有師父當關主', () => {
    const a2 = enemyIdsForAct(2);
    for (const id of ['cowcat_boss', 'persian_lady', 'butler_cat', 'maid_cat', 'dragon_cat', 'hex_abbot', 'tanuki_lord']) expect(a2.has(id), id).toBe(true);
    expect(a2.has('orange_king')).toBe(false);
    const a3 = enemyIdsForAct(3);
    expect(a3.has('tower_master')).toBe(true);
    expect(a3.has('cowcat_boss')).toBe(false);
  });
  it('立繪鍵不含師父（他的立繪組在 sprites），且三關合起來涵蓋所有一般遭遇', () => {
    expect(monsterArtKeysForAct(3).includes('daxia')).toBe(false);
    expect(monsterArtKeysForAct(1)).toContain('codex/monster_nekomata_p2');
    expect(monsterArtKeysForAct(1)).toContain('codex/monster_orange_king_p2');
    const all = new Set([1, 2, 3].flatMap((a) => monsterArtKeysForAct(a)));
    expect(all.size).toBeGreaterThan(60);
  });
  it('沒有瀏覽器時 warmEncounter 立刻結束', async () => {
    await expect(warmEncounter('nekomata', 100)).resolves.toBeUndefined();
  });
  it.each([true, false])('圖片載入失敗不標成已預載，遭遇預熱可重試（decode=%s）', async (hasDecode) => {
    let attempts = 0;
    class FlakyImage {
      onload?: () => void;
      onerror?: () => void;
      decode = hasDecode ? async () => { if (attempts <= 2) throw new Error('暫時載入失敗'); } : undefined;
      set src(_value: string) {
        attempts++;
        if (!hasDecode) queueMicrotask(() => attempts <= 2 ? this.onerror?.() : this.onload?.());
      }
    }
    const url = '/assets/sprites/hero/ninja.webp';
    vi.stubGlobal('Image', FlakyImage);
    _setManifestForTest({ cards: {}, sprites: { 'hero/ninja': url.slice(1) }, monsters: {}, icons: {}, bg: {}, review: [] });
    warmed.clear();
    try {
      await preloadArt();
      expect(warmed.has(url)).toBe(false);
      await warmEncounter('wood_dummy', 1000, [url]);
      expect(warmed.has(url)).toBe(false);
      await warmEncounter('wood_dummy', 1000, [url]);
      expect(warmed.has(url)).toBe(true);
      expect(attempts).toBe(3);
    } finally {
      warmed.clear();
      _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] });
      vi.unstubAllGlobals();
    }
  });
  it('進關只預載關主基礎姿勢，確定遭遇後才預熱全部階段姿勢', async () => {
    const sources: string[] = [];
    class FakeImage {
      set src(value: string) { sources.push(value); }
      async decode(): Promise<void> { /* 測試只記錄請求 */ }
    }
    vi.stubGlobal('Image', FakeImage);
    const base = Object.fromEntries(['idle', 'attack', 'hurt', 'block', 'down']
      .map((pose) => [pose, `assets/monsters/nekomata_${pose}.webp`]));
    const phase = Object.fromEntries(['idle', 'attack', 'hurt', 'block', 'down']
      .map((pose) => [pose, `assets/monsters/nekomata_p2_${pose}.webp`]));
    _setManifestForTest({
      cards: {}, sprites: {}, icons: {}, bg: {}, review: [],
      monsters: {
        'codex/monster_nekomata': base,
        'codex/monster_nekomata_p2': phase,
      },
    });
    warmed.clear();
    try {
      await preloadAct(1, 'ninja');
      expect(sources).toEqual(expect.arrayContaining(Object.values(base).map((p) => `/${p}`)));
      expect(sources.some((source) => source.includes('nekomata_p2_'))).toBe(false);

      sources.length = 0;
      await warmEncounter('nekomata', 1000, [], 'ninja');
      expect(sources).toEqual(expect.arrayContaining(Object.values(phase).map((p) => `/${p}`)));
    } finally {
      warmed.clear();
      _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] });
      vi.unstubAllGlobals();
    }
  });
});
