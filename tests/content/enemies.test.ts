import { describe, expect, it } from 'vitest';
import { encounterById, encounters, encountersOfPool, enemies, enemyById } from '../../src/content/enemies';

describe('魔物資料', () => {
  it('數量：一般 28、大魔物 4、塔主 3、召喚 5', () => {
    const n = (p: string) => enemies.filter((e) => e.pool === p).length;
    // 2026-08-31 補 14 隻：中後段本來只有 4＋3 組遭遇，一直重複同一場仗
    expect(n('弱') + n('中') + n('強')).toBe(28);
    // 召喚 5：2026-09-01 加了切磋的白貓（只有事件會遇到——之前偷懶借黑貓忍者當對手）
    expect(n('大魔物')).toBe(4); expect(n('塔主')).toBe(3); expect(n('召喚')).toBe(5);
    expect(new Set(enemies.map((e) => e.id)).size).toBe(enemies.length);
  });
  it('生命區間合法、至少一個動作、有台詞與圖', () => {
    for (const e of enemies) {
      expect(e.hp[0], e.name).toBeGreaterThan(0);
      expect(e.hp[1], e.name).toBeGreaterThanOrEqual(e.hp[0]);
      expect(e.moves.length, e.name).toBeGreaterThan(0);
      expect(e.line.length, e.name).toBeGreaterThan(0);
      expect(e.art, e.name).toMatch(/^(codex\/monster_[a-z_]+|daxia)$/);
    }
  });
  it('召喚與遭遇引用的魔物都存在，池一致', () => {
    for (const e of enemies) for (const m of e.moves) for (const fx of m.effects)
      if (fx.kind === 'summon') expect(enemyById[fx.enemyId], `${e.name} 召喚`).toBeTruthy();
    for (const enc of encounters) {
      expect(encounterById[enc.id]).toBe(enc);
      for (const id of enc.enemies) {
        expect(enemyById[id], enc.id).toBeTruthy();
        expect(enemyById[id]?.pool, enc.id).toBe(enc.pool);
      }
    }
  });
  it('每個池都有遭遇；召喚物不在遭遇裡', () => {
    for (const p of ['弱', '中', '強', '大魔物', '塔主'] as const) expect(encountersOfPool(p).length, p).toBeGreaterThan(0);
    expect(encounters.some((enc) => enc.enemies.includes('black_kitten'))).toBe(false);
  });
  it('塔主兩階段', () => {
    const boss = enemyById['tower_master']!;
    expect(boss.phases?.length).toBe(1);
    expect(boss.phases?.[0]?.hpBelow).toBe(80);
    expect(boss.phases?.[0]?.strengthPerTurn).toBe(1);
  });
});
