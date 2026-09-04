import { describe, expect, it } from 'vitest';

import { encounterById } from '../../src/content/enemies';
import { events } from '../../src/content/events';
import { applyRunEffects, newRun } from '../../src/engine/run';

/**
 * 事件對手要跟著關數變強（使用者 2026-09-04：「事件怪有點爛」）。
 * 引擎在 `run.ts` 的 fight 會先找 `<遭遇>_a<關數>`，找不到才退回基本版；
 * 這裡釘住「第二三關會出現的事件，其對手都有 _a2／_a3 版本，而且一版比一版硬」。
 */
describe('事件對手照關數變強', () => {
  const fightIds = [...new Set(events.flatMap((e) => e.choices.flatMap((c) =>
    c.outcome.flatMap((o) => (o.kind === 'fight' ? [o.encounterId] : [])))))];

  it('每個事件對手都有第二關與第三關的版本', () => {
    for (const id of fightIds) {
      expect(encounterById[`${id}_a2`], `${id} 缺第二關版本`).toBeTruthy();
      expect(encounterById[`${id}_a3`], `${id} 缺第三關版本`).toBeTruthy();
    }
  });

  it('關數越後面越硬（血量倍率與魔氣都不會倒退）', () => {
    for (const id of fightIds) {
      const a2 = encounterById[`${id}_a2`]!;
      const a3 = encounterById[`${id}_a3`]!;
      const bulk = (e: typeof a2) => (e.hpScale ?? 1) * e.enemies.length;
      expect(bulk(a3), `${id}：第三關該比第二關更有份量`).toBeGreaterThanOrEqual(bulk(a2));
      expect(a3.strength ?? 0, `${id}：第三關魔氣該更高`).toBeGreaterThan(a2.strength ?? 0);
    }
  });

  it('事件專用版本不會混進隨機池（acts 空）', () => {
    for (const id of fightIds) for (const suffix of ['_a2', '_a3']) {
      const enc = encounterById[`${id}${suffix}`]!;
      expect(enc.acts ?? [], `${id}${suffix} 不該進隨機池`).toEqual([]);
    }
  });

  it('第二關打事件戰，實際接到的是第二關版本', () => {
    const run = newRun('eventfight'); run.act = 2;
    const out = applyRunEffects(run, [{ kind: 'fight', encounterId: 'white_duelist', bonusFish: 0 }]);
    expect(out && 'fight' in out ? out.fight.encounterId : '').toBe('white_duelist_a2');
  });
});
