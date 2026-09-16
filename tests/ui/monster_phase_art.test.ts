import { describe, expect, it } from 'vitest';
import { _setManifestForTest, monsterPhaseKey } from '../../src/ui/assets';
import type { Manifest } from '../../src/ui/assets';

/**
 * 關主換階段要換張臉（2026-09-16 使用者實測回報）。
 *
 * 原話：「打詛咒老住持，菲菲說牠長出鱗甲，可是牠長得一模一樣。」
 * 十隻關主裡只有師父換階段會換立繪，其餘九隻三個階段共用同一張。
 *
 * 這條盯的是**退回的規矩**：還沒生的階段圖要退回前一階段，不能變成灰剪影——
 * 沒有這條，「先生一批、之後再補」就不成立（生到一半推上線會有一堆沒臉的關主）。
 */
describe('關主分階段的立繪鍵', () => {
  const five = { idle: 'a.webp', attack: 'b.webp', hurt: 'c.webp', block: 'd.webp', down: 'e.webp' };
  const set = (m: { monsters: Manifest['monsters'] }): void =>
    _setManifestForTest({ cards: {}, sprites: {}, icons: {}, bg: {}, review: [], ...m });

  it('第一階段一律回原鍵，沒有階段的魔物完全不受影響', () => {
    set({ monsters: { 'codex/monster_rat': five } });
    expect(monsterPhaseKey('codex/monster_rat', 0)).toBe('codex/monster_rat');
    // 清單裡根本沒有這個鍵也照樣原樣回（後面由 monsterUrl 退成剪影，那是既有行為）
    expect(monsterPhaseKey('codex/monster_nobody', 0)).toBe('codex/monster_nobody');
  });

  it('生好了就用那一階段的', () => {
    set({ monsters: { 'boss/x': five, 'boss/x_p2': five, 'boss/x_p3': five } });
    expect(monsterPhaseKey('boss/x', 1)).toBe('boss/x_p2');
    expect(monsterPhaseKey('boss/x', 2)).toBe('boss/x_p3');
  });

  it('沒生的往前退一階，最後退回原鍵（不會變剪影）', () => {
    set({ monsters: { 'boss/x': five, 'boss/x_p2': five } });
    expect(monsterPhaseKey('boss/x', 2), '第三階段沒生，退回第二階段').toBe('boss/x_p2');
    set({ monsters: { 'boss/x': five } });
    expect(monsterPhaseKey('boss/x', 1), '一張都沒生，退回原鍵').toBe('boss/x');
    expect(monsterPhaseKey('boss/x', 2)).toBe('boss/x');
  });
});
