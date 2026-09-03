import { describe, expect, it } from 'vitest';
import { potionById, potions } from '../../src/content/potions';
import { relicById, relics } from '../../src/content/relics';

describe('秘寶', () => {
  it('35 件、池數正確、id 不重複', () => {
    expect(relics.length).toBe(65);   // 60＝2026-09-02 擴充（36 → 60）；65＝2026-09-04 五件代價秘寶
    const n = (p: string) => relics.filter((r) => r.pool === p).length;
    expect(n('起始')).toBe(1); expect(n('常見')).toBe(30); expect(n('大魔物')).toBe(24); expect(n('塔主')).toBe(10);   // 2026-09-04 代價秘寶：常見 +2、大魔物 +3
    expect(new Set(relics.map((r) => r.id)).size).toBe(65);
    expect(relicById['blue_headband']?.hooks.firstTurnDraw).toBe(1);
  });
  it('每件至少一個掛鉤且有說明', () => {
    for (const r of relics) {
      expect(Object.keys(r.hooks).length, r.name).toBeGreaterThan(0);
      expect(r.text.length, r.name).toBeGreaterThan(3);
      expect(r.art, r.name).toMatch(/^codex\/relic_[a-z_]+$/);
    }
  });
});

describe('忍具', () => {
  it('20 種、id 不重複、目標與效果一致', () => {
    expect(potions.length).toBe(20);
    expect(new Set(potions.map((p) => p.id)).size).toBe(20);
    for (const p of potions) {
      expect(potionById[p.id]).toBe(p);
      const hitsAll = p.effects.some((e) => 'target' in e && e.target === 'all');
      const hitsOne = p.effects.some((e) => (e.kind === 'damage' && e.target !== 'all') || (e.kind === 'status' && e.target === 'enemy'));
      expect(p.target, p.name).toBe(hitsAll ? 'all' : hitsOne ? 'enemy' : 'self');
      expect(p.art, p.name).toMatch(/^codex\/potion_[a-z_]+$/);
    }
  });
});
