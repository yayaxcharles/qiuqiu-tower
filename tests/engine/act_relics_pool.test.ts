import { describe, expect, it } from 'vitest';
import { newRun, rollActRelics } from '../../src/engine/run';
import { relics, relicById } from '../../src/content/relics';

/**
 * 塔主池加料＋過關三選一同一局不重複（使用者 2026-09-15：「塔主池只有 9 件必須多做一點，不然重複率好高」）。
 */
describe('過關三選一的塔主池', () => {
  const tower = relics.filter((r) => r.pool === '塔主' && r.id !== 'tower_token');

  it('塔主池（不含必給的令牌）至少 18 件，每件都有價錢與掛鉤', () => {
    expect(tower.length).toBeGreaterThanOrEqual(18);
    for (const r of tower) {
      expect(r.price, r.name).toBeGreaterThanOrEqual(220);
      expect(Object.keys(r.hooks).length, r.name).toBeGreaterThan(0);
    }
  });

  it('同一局兩次三選一不會開到同一件；開過的記在 run.flags', () => {
    for (let s = 0; s < 40; s++) {
      const run = newRun(`pool-${s}`, 1);
      const first = rollActRelics(run);
      const second = rollActRelics(run);
      expect(first.length).toBe(3);
      expect(second.length).toBe(3);
      for (const id of second) expect(first, `第二次又開到 ${relicById[id]?.name}`).not.toContain(id);
      for (const id of [...first, ...second]) expect(run.flags[`relic_seen:${id}`]).toBe(true);
    }
  });

  it('身上已經有的不會再開（跟以前一樣）', () => {
    const run = newRun('pool-owned', 1);
    run.players[0]!.relics.push('master_seal', 'tower_moon', 'gold_claws');
    for (let i = 0; i < 5; i++) for (const id of rollActRelics(run)) expect(['master_seal', 'tower_moon', 'gold_claws']).not.toContain(id);
  });
});
