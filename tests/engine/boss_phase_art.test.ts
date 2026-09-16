import { describe, expect, it } from 'vitest';
import { enemyById, enemies } from '../../src/content/enemies';
import { beginCombat, newRun } from '../../src/engine/run';
import { damageEnemy } from '../../src/engine/actions';
import manifest from '../../public/assets/manifest.json';

/**
 * 換階段那一刻，畫面真的換得到臉嗎（2026-09-16 使用者實測：「老住持說長出鱗甲，可是牠長得一模一樣」）。
 *
 * `tests/ui/monster_phase_art.test.ts` 釘的是查表與退回的規矩（純函式）。
 * 這一條補另外兩半，少了哪一半整件事都是白做的：
 *
 * 1. **引擎真的會把 `e.phase` 加上去**——畫面是靠它去查階段圖的。
 * 2. **十隻關主的 `_p2` 鍵在素材清單裡真的有檔案**——鍵拼錯的話會靜靜退回第一階段，
 *    畫面看起來就跟沒做一樣（正是使用者回報的那個症狀）。
 */
const M = manifest as { monsters: Record<string, Record<string, string>> };

describe('關主換階段換臉', () => {
  it('血打到門檻，引擎會把階段加上去', () => {
    const run = newRun('boss-phase', 1, 'ninja');
    const cs = beginCombat(run, 'hex_abbot');
    const boss = cs.enemies[0]!;
    const def = enemyById[boss.enemyId]!;
    const gate = def.phases?.[0]?.hpBelow;
    expect(gate, '詛咒老住持沒有門檻式的階段了？那這條要重寫').toBeGreaterThan(0);
    expect(boss.phase ?? 0, '一開始是第一階段').toBe(0);
    damageEnemy(cs, boss, boss.hp - (gate ?? 0), { direct: true });
    expect(boss.phase, '血打到門檻了，階段沒跟著加').toBe(1);
  });

  it('有階段的關主，第二階段那三張圖都在清單裡', () => {
    const missing: string[] = [];
    for (const def of enemies) {
      if (def.pool !== '塔主' && def.pool !== '大魔物') continue;
      if (!def.phases?.length) continue;
      if (def.art === 'daxia') continue;   // 師父走 sprites 那條路，不是這一套
      const key = `${def.art}_p2`;
      const set = M.monsters[key];
      if (!set) { missing.push(`${def.name}：清單裡沒有 ${key}`); continue; }
      for (const pose of ['idle', 'attack', 'down']) {
        if (!set[pose]) missing.push(`${def.name} 的 ${key} 少了 ${pose}`);
      }
    }
    expect(missing, `這幾隻換階段之後還是舊臉：\n${missing.join('\n')}`).toEqual([]);
  });
});
