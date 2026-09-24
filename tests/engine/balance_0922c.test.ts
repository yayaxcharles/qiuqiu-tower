import { describe, expect, it } from 'vitest';
import { encounters, enemyById } from '../../src/content/enemies';
import { glossary } from '../../src/content/glossary';
import { damageEnemy, runEnemyEffects } from '../../src/engine/actions';
import { startCombat } from '../../src/engine/combat';
import { applyTuning } from '../../src/engine/coopbot';
import { coopHpMul } from '../../src/engine/coopscale';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CombatState, EnemyMove } from '../../src/engine/types';
import { blankPlayer, inst } from '../helpers';

/**
 * 2026-09-22 第三批平衡（使用者拍板的兩件；量測數字寫在 coopscale.ts 與 enemies.ts 的註解）：
 * 1. 兩人打師父太難 → 師父的連線倍率照遭遇覆寫成 2.4（其他關主、魔物照池的表不動）
 * 2. 鐵爪機關貓的卡住：3 層炸毛對全穿透的牠沒作用 → 換成看破（隱身、潛水拍掉一半），少抽 2 張一起拿掉；
 *    名詞說明的「看破」不再寫死「再打過來」（卡住不打人）
 * 改回舊寫法會變紅。
 */

let uid = 90_000;

function begin(encounterId: string, players: number): CombatState {
  return startCombat({ hp: 70, maxHp: 70, deck: [inst('tanding', uid++)], relics: [], potions: [], encounterId,
    rng: new Rng(seedFromString(`balance0922c-${encounterId}`)), players });
}

describe('師父的連線倍率：照遭遇覆寫成 2.4，其他關主照舊 3.0', () => {
  it('查表：只有師父換，單人一律 1，不給遭遇 id 就照池', () => {
    expect(coopHpMul('塔主', 2, 'tower_master')).toBe(2.4);
    expect(coopHpMul('塔主', 1, 'tower_master')).toBe(1);
    const others = encounters.filter((e) => e.pool === '塔主' && e.id !== 'tower_master');
    expect(others.length).toBeGreaterThanOrEqual(9);
    for (const e of others) expect(coopHpMul(e.pool, 2, e.id), e.id).toBe(3.0);
    expect(coopHpMul('塔主', 2)).toBe(3.0);
  });

  it('實際開戰：兩人打師父第一條 288（120 × 2.4），打鐵爪照舊 339（113 × 3.0），單人不變', () => {
    expect(begin('tower_master', 2).enemies[0]!.maxHp).toBe(288);
    expect(begin('tower_master', 1).enemies[0]!.maxHp).toBe(120);
    expect(begin('iron_claw', 2).enemies[0]!.maxHp).toBe(339);
  });

  it('機器人的倍率覆寫也照遭遇 id 算：填 2.4 不會再縮一次；填 3.0 回到 360，換血條跟著同一個倍率', () => {
    // applyTuning 是拿「想要的倍率 ÷ 引擎用的倍率」去乘；分母沒照遭遇查的話，填 2.4 會被當成 3.0 → 2.4 再縮一次
    const same = begin('tower_master', 2);
    applyTuning(same, 2, { hpMul: { '塔主': 2.4 } });
    expect(same.enemies[0]!.maxHp).toBe(288);

    const old = begin('tower_master', 2);
    applyTuning(old, 2, { hpMul: { '塔主': 3.0 } });
    const m = old.enemies[0]!;
    expect(m.maxHp).toBe(360);
    m.block = 0; m.invulnIn = 0;
    damageEnemy(old, m, m.hp, { direct: true });
    expect(m.hp, '第二條血也照 3.0 放大（240 × 3.0）').toBe(720);
  });
});

describe('鐵爪機關貓的卡住：炸毛換成看破（隱身、潛水拍掉一半），少抽拿掉', () => {
  const kazhu = (): EnemyMove => enemyById['iron_claw']!.phases![0]!.moves.find((mv) => mv.label === '卡住')!;

  it('資料：只剩看破', () => {
    expect(kazhu().intent).toBe('debuff');
    expect(kazhu().effects).toEqual([{ kind: 'stripPlayer', names: ['隱身', '潛水'] }]);
  });

  it('實際挨一次：隱身 3→1、潛水 2→1；不給炸毛、下回合照常抽', () => {
    const cs = begin('iron_claw', 1);
    const p = cs.player; const e = cs.enemies[0]!;
    addStatus(p, '隱身', 3); addStatus(p, '潛水', 2);
    const draw = p.drawNextTurn;
    runEnemyEffects(cs, e, kazhu().effects, false);
    expect(getStatus(p, '隱身')).toBe(1);
    expect(getStatus(p, '潛水')).toBe(1);
    expect(getStatus(p, '炸毛')).toBe(0);
    expect(p.drawNextTurn).toBe(draw);
  });

  it('滑上去的名詞說明不會說「再打過來」：卡住只看破、不打人', () => {
    expect(kazhu().effects.some((f) => f.kind === 'damage')).toBe(false);
    expect(glossary['看破']).toContain('拍掉一半');
    expect(glossary['看破']).not.toContain('再打過來');
  });

  it('兩人連線：兩個人身上的隱身各拍掉一半', () => {
    const cs = begin('iron_claw', 2);
    const p2 = blankPlayer([], 1);
    cs.players.push(p2);
    addStatus(cs.player, '隱身', 4); addStatus(p2, '隱身', 2);
    runEnemyEffects(cs, cs.enemies[0]!, kazhu().effects, false);
    expect(getStatus(cs.player, '隱身')).toBe(2);
    expect(getStatus(p2, '隱身')).toBe(1);
  });
});
