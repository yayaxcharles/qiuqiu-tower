// 同一隻怪的冷卻（2026-09-04）：前後兩層（任何路線）不該撞到同一隻怪；菁英節點同關不重複
import { describe, expect, it } from 'vitest';
import { encounterById } from '../../src/content/enemies';
import { generateMap } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';

describe('地圖怪物不重複', () => {
  it('三關各 200 張圖：相鄰兩層的戰鬥節點共用同一隻怪的比例低於 3%', () => {
    for (const act of [1, 2, 3]) {
      let pairs = 0, clashes = 0;
      for (let i = 0; i < 200; i++) {
        const map = generateMap(new Rng(seedFromString(`var${act}-${i}`)), { act, flags: {} });
        const byFloor = new Map<number, Set<string>>();
        for (const n of map.nodes) {
          if (n.type !== '戰鬥' || !n.encounterId) continue;
          const set = byFloor.get(n.floor) ?? new Set<string>();
          for (const id of encounterById[n.encounterId]!.enemies) set.add(id);
          byFloor.set(n.floor, set);
        }
        for (let f = 1; f < 15; f++) {
          const a = byFloor.get(f), b = byFloor.get(f + 1);
          if (!a || !b) continue;
          pairs++;
          if ([...a].some((id) => b.has(id))) clashes++;
        }
      }
      expect(clashes / pairs, `第 ${act} 關相鄰層撞怪率 ${(clashes / pairs * 100).toFixed(1)}%`).toBeLessThan(0.03);
    }
  });
  it('同一關的兩個菁英節點不會是同一隻', () => {
    let both = 0, same = 0;
    for (let i = 0; i < 300; i++) {
      const map = generateMap(new Rng(seedFromString(`elite${i}`)), { act: 2, flags: {}, eliteMul: 1.6 });
      const ids = map.nodes.filter((n) => n.type === '大魔物').map((n) => n.encounterId);
      if (ids.length >= 2) { both++; if (new Set(ids).size < ids.length) same++; }
    }
    expect(both).toBeGreaterThan(50);
    expect(same).toBe(0);
  });
});
