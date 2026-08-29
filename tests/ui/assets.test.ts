import { describe, expect, it } from 'vitest';
import { _setManifestForTest, artUrl, monsterUrl } from '../../src/ui/assets';

describe('素材查表', () => {
  it('有圖給路徑，缺圖給剪影', () => {
    _setManifestForTest({
      cards: { 'ninja/01': 'assets/cards/ninja/01.webp' },
      sprites: {},
      monsters: { 'codex/monster_rat': { idle: 'assets/monsters/rat_idle.webp' } },
      icons: {},
      bg: {},
      review: [],
    });
    expect(artUrl('cards', 'ninja/01')).toContain('assets/cards/ninja/01.webp');
    expect(artUrl('cards', 'ninja/99').startsWith('data:image/svg+xml')).toBe(true);
    expect(monsterUrl('codex/monster_rat', 'idle')).toContain('rat_idle');
    expect(monsterUrl('codex/monster_rat', 'attack')).toContain('rat_idle');   // 沒有攻擊圖就退回待機圖
    expect(monsterUrl('codex/monster_none', 'idle').startsWith('data:')).toBe(true);
  });
});
