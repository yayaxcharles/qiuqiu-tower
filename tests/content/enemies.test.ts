import { describe, expect, it } from 'vitest';
import { encounterById, encounters, encountersOfPool, enemies, enemyById } from '../../src/content/enemies';

describe('魔物資料', () => {
  it('數量：一般 40、大魔物 5、塔主 7、召喚 7', () => {
    const n = (p: string) => enemies.filter((e) => e.pool === p).length;
    // 2026-09-01 三關制內容包：塔中 7＋塔頂 5 進一般池、影球球進大魔物、
    // 關主 3→7（橘皮大王＋第二關三選一）、召喚加執事貓與女僕貓
    expect(n('弱') + n('中') + n('強')).toBe(40);
    expect(n('大魔物')).toBe(5); expect(n('塔主')).toBe(7); expect(n('召喚')).toBe(7);
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
    // 遭遇的池可以比成員高一階：兩隻全規格中型怪同場（ninja_can、vacuum_claw）
    // 實測是強怪等級的戰鬥，放中池會在 6F 把人打死（勝率 2%）。
    // 低於成員的池仍然抓（把強怪塞進弱遭遇一定是手滑）。
    const order = ['弱', '中', '強'];
    for (const enc of encounters) {
      expect(encounterById[enc.id]).toBe(enc);
      for (const id of enc.enemies) {
        expect(enemyById[id], enc.id).toBeTruthy();
        const mp = enemyById[id]!.pool;
        if (mp === enc.pool) continue;
        // 塔主的隨從例外：波斯大小姐開場就帶執事貓與女僕貓（僕從護體要有僕從可打）
        if (enc.pool === '塔主' && mp === '召喚') continue;
        const ok = order.indexOf(enc.pool) - order.indexOf(mp) === 1;
        expect(ok, `${enc.id}：成員 ${id}（${mp}）不該出現在 ${enc.pool} 遭遇`).toBe(true);
      }
    }
  });
  it('每個池都有遭遇；召喚物不在遭遇裡', () => {
    for (const p of ['弱', '中', '強', '大魔物', '塔主'] as const) expect(encountersOfPool(p).length, p).toBeGreaterThan(0);
    expect(encounters.some((enc) => enc.enemies.includes('black_kitten'))).toBe(false);
  });
  it('塔主三階段', () => {
    const boss = enemyById['tower_master']!;
    expect(boss.phases?.length).toBe(2);
    expect(boss.phases?.[0]?.hpBelow).toBe(170);
    expect(boss.phases?.[0]?.strengthPerTurn).toBe(2);
    expect(boss.phases?.[1]?.strengthPerTurn).toBe(3);
    expect(boss.phases?.[1]?.hpBelow).toBe(85);
  });
});
