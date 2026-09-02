import { describe, expect, it } from 'vitest';
import { encounterById } from '../../src/content/enemies';
import { applyRunEffects, newRun } from '../../src/engine/run';

/**
 * 鏡子走廊（使用者 2026-09-02：「我以為會有一個影球球是敵人跟我對打」）：
 * 事件寫 `mirror_duel`，引擎要依關數接成 `_a1／_a2／_a3`，結果要帶「贏了升級兩張」。
 */
describe('鏡子走廊的鏡中球球', () => {
  it('基本版加二、三關版，越高關越硬', () => {
    expect(encounterById['mirror_duel']?.enemies).toEqual(['mirror_qiuqiu']);
    expect(encounterById['mirror_duel_a2']?.strength).toBe(3);
    expect(encounterById['mirror_duel_a3']?.hpScale).toBeGreaterThan(encounterById['mirror_duel_a2']?.hpScale ?? 0);
  });
  it('fight 效果依關數換成該關的遭遇，並帶 bonusUpgrades', () => {
    const run = newRun('mirror');
    run.act = 2;
    const out = applyRunEffects(run, [{ kind: 'fight', encounterId: 'mirror_duel', bonusFish: 0, bonusUpgrades: 2 }]);
    expect(out).toEqual({ fight: { encounterId: 'mirror_duel_a2', bonusFish: 0, bonusUpgrades: 2 } });
  });
  it('沒有關數版本的遭遇照原樣打（睡著的守衛還是 orange_bandit）', () => {
    const run = newRun('mirror2');
    const out = applyRunEffects(run, [{ kind: 'fight', encounterId: 'orange_bandit', bonusFish: 0 }]);
    expect(out && 'fight' in out ? out.fight.encounterId : null).toBe('orange_bandit');
  });
});
