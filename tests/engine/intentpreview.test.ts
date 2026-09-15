import { describe, expect, it } from 'vitest';
import { previewEnemyHits } from '../../src/engine/intentpreview';
import { damageEnemy, runEnemyEffects } from '../../src/engine/actions';
import { startCombat, startPlayerTurn } from '../../src/engine/combat';
import { addStatus, getStatus } from '../../src/engine/statuses';
import { Rng, seedFromString } from '../../src/engine/rng';
import { newCoopRun, beginCombat } from '../../src/engine/run';
import { inst } from '../helpers';
import type { CombatState, EnemyEffect, RunState } from '../../src/engine/types';
import COMBAT_UI from '../../src/ui/screens/combat.ts?raw';

/**
 * 意圖牌子的數字＝引擎真的打出來的數字（總稽核 2026-09-16 乙 中-1）。
 *
 * 原本牌子各自拿「現在的狀態」算：鏡貓一招學兩張（淬毒·改→見血封喉）時，你身上 2 層牌子寫 5、實際打 12；
 * 0 層卻寫「攻 3」（加了爪力），實際撲空；蓄力每一下都乘二，引擎只加倍第一下。
 * 這裡每一組都**真的讓引擎打一次**，拿扣掉的血跟預演的總和比。
 */
function table(seed: string): CombatState {
  const cs = startCombat({
    hp: 200, maxHp: 200,
    deck: ['sanjo', 'tanding', 'sanjo', 'tanding', 'sanjo', 'tanding'].map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId: 'rats3', rng: new Rng(seedFromString(seed)),
  });
  cs.player.block = 0;
  return cs;
}

const cases: { name: string; fx: EnemyEffect[]; charged?: boolean; prep?: (cs: CombatState) => void; want?: number }[] = [
  { name: '蓄力只加倍第一下', charged: true, fx: [{ kind: 'damage', amount: 5 }, { kind: 'damage', amount: 4 }] },
  { name: '同一招先上毒再照層數打（鏡貓學淬毒·改→見血封喉）', fx: [{ kind: 'statusPlayer', name: '中毒', amount: 2 }, { kind: 'damageByPlayerStatus', name: '中毒' }],
    prep: (cs) => addStatus(cs.player, '中毒', 3) },
  { name: '身上沒毒：撲空是 0，不加爪力', fx: [{ kind: 'damageByPlayerStatus', name: '中毒' }],
    prep: (cs) => addStatus(cs.enemies[0]!, '爪力', 3), want: 0 },
  { name: '先給自己爪力再打', fx: [{ kind: 'statusSelf', name: '爪力', amount: 2 }, { kind: 'damage', amount: 6 }] },
  { name: '先給你翻肚再打（盯上你了→貓抓）', fx: [{ kind: 'statusPlayer', name: '翻肚', amount: 1 }, { kind: 'damage', amount: 6 }] },
  { name: '蓄力＋上毒＋兩倍照層數打', charged: true,
    fx: [{ kind: 'statusPlayer', name: '中毒', amount: 2 }, { kind: 'damageByPlayerStatus', name: '中毒', mul: 2 }],
    prep: (cs) => addStatus(cs.player, '中毒', 1) },
];

describe('意圖預演跟引擎一致', () => {
  for (const c of cases) {
    it(c.name, () => {
      const cs = table(`preview-${c.name}`);
      c.prep?.(cs);
      const e = cs.enemies[0]!;
      const pv = previewEnemyHits(e, c.fx, cs.player, !!c.charged);
      const predicted = pv.reduce((sum, h) => sum + h.dmg * (h.fx.kind === 'damage' ? (h.fx.times ?? 1) : 1), 0);
      const before = cs.player.hp;
      runEnemyEffects(cs, e, c.fx, !!c.charged, cs.player);
      const lost = before - cs.player.hp;
      expect(predicted, `預演 ${JSON.stringify(pv.map((h) => h.dmg))}、引擎扣了 ${lost}`).toBe(lost);
      if (c.want !== undefined) expect(predicted).toBe(c.want);
    });
  }

  it('戰鬥畫面的牌子與提示框都拿預演的數字，不再自己用 computeAttack 算', () => {
    expect(COMBAT_UI.match(/previewEnemyHits\(e, m\.effects, my\(\)\)/g)?.length, '牌子與提示框各一次').toBe(2);
    expect(COMBAT_UI).not.toMatch(/computeAttack\(/);
  });

  it('預演只讀不寫：雙方的狀態原封不動', () => {
    const cs = table('preview-pure');
    addStatus(cs.player, '中毒', 3);
    const e = cs.enemies[0]!;
    previewEnemyHits(e, [{ kind: 'statusPlayer', name: '中毒', amount: 2 }, { kind: 'statusSelf', name: '爪力', amount: 2 },
      { kind: 'damageByPlayerStatus', name: '中毒', consume: true }], cs.player, true);
    expect(getStatus(cs.player, '中毒')).toBe(3);
    expect(getStatus(e, '爪力')).toBe(0);
  });
});

describe('新塔主秘寶的邊角（總稽核 2026-09-16 乙 低-5／低-6）', () => {
  function coop(seed: string): CombatState {
    const run: RunState = newCoopRun(seed, 1, 'ninja', 'feifei');
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    run.currentNode = node.id;
    return beginCombat(run);
  }

  it('擊倒者已經倒下：虎爪不發動，躺著的人不會回血、不加爪力', () => {
    const cs = coop('tiger-down');
    const p1 = cs.players[1]!;
    p1.relics.push('tiger_claws');
    p1.down = true; p1.hp = 0;
    const e = cs.enemies[0]!;
    damageEnemy(cs, e, e.hp, { direct: true, by: p1 });
    expect(p1.hp).toBe(0);
    expect(getStatus(p1, '爪力')).toBe(0);
    expect(cs.relicFired).not.toContain('tiger_claws');
  });

  it('擊倒者已經倒下：「打倒時」的能力也不發（推前審查 2026-09-16 低-2）', () => {
    const cs = coop('onkill-down');
    const p1 = cs.players[1]!;
    p1.powers.push({ trigger: 'onKill', effects: [{ kind: 'heal', n: 3 }] });
    p1.down = true; p1.hp = 0;
    const e = cs.enemies[0]!;
    damageEnemy(cs, e, e.hp, { direct: true, by: p1 });
    expect(p1.hp).toBe(0);
  });

  it('塔主的茶碗：滿血不發動（不閃、不佔紀錄），掉血了才回 2', () => {
    const cs = table('teacup');
    cs.player.relics.push('master_teacup');
    cs.relicFired.length = 0;
    startPlayerTurn(cs);
    expect(cs.relicFired).not.toContain('master_teacup');
    cs.player.hp -= 10;
    startPlayerTurn(cs);
    expect(cs.relicFired).toContain('master_teacup');
    expect(cs.player.hp).toBe(192);
  });

  it('座位 1 的秘寶照樣發在座位 1（對照組：沒倒下時虎爪有發動）', () => {
    const cs = coop('tiger-up');
    const p1 = cs.players[1]!;
    p1.relics.push('tiger_claws');
    p1.hp = p1.maxHp - 10;
    const e = cs.enemies[0]!;
    damageEnemy(cs, e, e.hp, { direct: true, by: p1 });
    expect(p1.hp).toBe(p1.maxHp - 7);
    expect(getStatus(p1, '爪力')).toBe(1);
  });
});
