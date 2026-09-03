import { describe, expect, it } from 'vitest';
import { generateMap } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { GameMap, MapNode } from '../../src/engine/types';

/**
 * 地圖優化 1～3（2026-09-03 使用者：「有時候不管怎樣只剩一條路可以選，都通到菁英怪或戰鬥」）。
 * 三關各 200 顆種子、難度 1 與 2 都驗。
 */
const CONVERGED = new Set([5, 8, 14, 15]);
const isFight = (t: string): boolean => t === '戰鬥' || t === '大魔物';

function maps(act: number, eliteMul: number, n = 200): GameMap[] {
  return Array.from({ length: n }, (_, i) => generateMap(new Rng(seedFromString(`choice-${act}-${eliteMul}-${i}`)), { act, eliteMul }));
}
function byId(m: GameMap): Map<string, MapNode> { return new Map(m.nodes.map((x) => [x.id, x])); }

for (const act of [1, 2, 3]) for (const eliteMul of [1, 1.6]) {
  describe(`第 ${act} 關・大魔物倍率 ${eliteMul}`, () => {
    const ms = maps(act, eliteMul);

    it('2～13F 的非匯合層每層至少兩格', () => {
      for (const m of ms) for (let f = 2; f <= 13; f++) {
        if (CONVERGED.has(f)) continue;
        expect(m.nodes.filter((n) => n.floor === f).length, `${f}F`).toBeGreaterThanOrEqual(2);
      }
    });

    it('大魔物一定避得開：每個能走到它的格子都還有別條不是大魔物的路', () => {
      for (const m of ms) {
        const ids = byId(m);
        for (const n of m.nodes) {
          const elites = n.next.filter((id) => ids.get(id)!.type === '大魔物');
          if (!elites.length) continue;
          if (n.next.length >= 2) expect(n.next.some((id) => ids.get(id)!.type !== '大魔物'), `${n.id} 只能走到大魔物`).toBe(true);
        }
        expect(m.nodes.filter((n) => n.type === '大魔物').length, '整關至少一個大魔物').toBeGreaterThanOrEqual(1);
      }
    });

    it('分岔是真的選擇：兩條以上出路不會全是戰鬥', () => {
      for (const m of ms) {
        const ids = byId(m);
        for (const n of m.nodes) {
          const kids = n.next.map((id) => ids.get(id)!).filter((k) => !CONVERGED.has(k.floor));
          if (kids.length < 2) continue;
          expect(kids.every((k) => isFight(k.type)), `${n.id} 的分岔全是戰鬥`).toBe(false);
        }
      }
    });

    it('沒有一條路連續四場戰鬥（含大魔物）', () => {
      for (const m of ms) {
        const ids = byId(m);
        const walk = (n: MapNode, streak: number): void => {
          const s = isFight(n.type) && n.floor >= 2 ? streak + 1 : 0;   // 1F 規定是戰鬥，不算
          expect(s, `${n.id} 前面已經連打`).toBeLessThan(4);
          for (const id of n.next) walk(ids.get(id)!, s);
        };
        for (const id of m.start) walk(ids.get(id)!, 0);
      }
    });
  });
}
