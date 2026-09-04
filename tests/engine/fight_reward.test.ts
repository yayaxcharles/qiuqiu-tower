// 事件「要打一場」附帶的獎勵：打贏才發、輸了清掉（使用者 2026-09-04 早：秘寶還沒打就先到手）
import { describe, expect, it } from 'vitest';
import { eventById } from '../../src/content/events';
import { applyRunEffects, newRun, resolvePendingAfterFight } from '../../src/engine/run';

describe('打一場的獎勵延後', () => {
  it('選項同時有秘寶與打一場：當下不給秘寶，改掛在 fight.afterWin；旗標照常記', () => {
    const run = newRun('fr');
    const ev = Object.values(eventById).find((e) => e.choices.some((c) => c.outcome.some((o) => o.kind === 'relic') && c.outcome.some((o) => o.kind === 'fight')))!;
    const choice = ev.choices.find((c) => c.outcome.some((o) => o.kind === 'relic'))!;
    const relicsBefore = run.relics.length; const notes: string[] = [];
    const out = applyRunEffects(run, choice.outcome, notes);
    expect(run.relics.length, '還沒打就不該拿到').toBe(relicsBefore);
    expect(out && 'fight' in out ? out.fight.afterWin?.length : 0).toBe(1);
    expect(notes).toContain('獎勵要打贏才拿得到');
    run.pendingAfterFight = out && 'fight' in out ? out.fight.afterWin : undefined;
    resolvePendingAfterFight(run, true);
    expect(run.relics.length).toBe(relicsBefore + 1);
    expect(run.pendingAfterFight).toBeUndefined();
  });
  it('輸了就清掉，什麼都不發；山賊那條的旗標仍然當下就記', () => {
    const run = newRun('fr2');
    const toll = eventById['toll']!;
    const fight = toll.choices[1]!;
    applyRunEffects(run, fight.outcome);
    expect(run.flags['toll_fought']).toBe(true);
    run.pendingAfterFight = [{ kind: 'fish', n: 70 }];
    const fish = run.fish;
    resolvePendingAfterFight(run, false);
    expect(run.fish).toBe(fish);
    expect(run.pendingAfterFight).toBeUndefined();
  });
});
