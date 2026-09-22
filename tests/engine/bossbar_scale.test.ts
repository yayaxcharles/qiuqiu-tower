import { describe, expect, it } from 'vitest';
import { startCombat } from '../../src/engine/combat';
import { damageEnemy } from '../../src/engine/actions';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { CombatState } from '../../src/engine/types';

function start(opts: { players?: number; hpMul?: number } = {}): CombatState {
  return startCombat({ hp: 9999, maxHp: 9999, deck: [], relics: [], potions: [],
    encounterId: 'tower_master', rng: new Rng(seedFromString('bossbar')),
    players: opts.players, mods: opts.hpMul ? { hpMul: opts.hpMul } : undefined });
}

/** 把師父這一條血打完，回傳換上來的那一條 */
function nextBar(cs: CombatState): number {
  const m = cs.enemies[0]!;
  m.block = 0; m.invulnIn = 0;
  damageEnemy(cs, m, m.hp, { direct: true });
  return m.hp;
}

/**
 * 師父後兩條血也要照這場的血量倍率放大（2026-09-22 平衡量測發現：
 * 連線時只有第一條是三倍，後兩條還是單人的 240／300，連線打師父八成會贏；使用者拍板修）。
 */
describe('師父的血條跟著連線、難度放大', () => {
  it('單人：240、300 照表', () => {
    const cs = start();
    expect(cs.enemies[0]!.hp).toBe(120);
    expect(nextBar(cs)).toBe(240);
    cs.enemies[0]!.invulnIn = 0;
    expect(nextBar(cs)).toBe(300);
  });

  // 師父的連線倍率 2026-09-22 照遭遇覆寫成 2.4（見 coopscale.ts 的 COOP_HP_BY_ENCOUNTER），三條都乘同一個數
  it('兩人連線：三條都是 2.4 倍（288／576／720），上限跟著換', () => {
    const cs = start({ players: 2 });
    const m = cs.enemies[0]!;
    expect(m.hp).toBe(288);
    expect(nextBar(cs)).toBe(576);
    expect(m.maxHp).toBe(576);
    m.invulnIn = 0;
    expect(nextBar(cs)).toBe(720);
    expect(m.maxHp).toBe(720);
  });

  it('難度的血量倍率也吃得到', () => {
    const cs = start({ hpMul: 1.15 });
    expect(cs.enemies[0]!.hp).toBe(138);
    expect(nextBar(cs)).toBe(276);
  });

  it('連線加難度一起乘，只乘一次（331／662）', () => {
    const cs = start({ players: 2, hpMul: 1.15 });
    expect(cs.enemies[0]!.hp).toBe(331);
    expect(nextBar(cs)).toBe(662);
  });
});
