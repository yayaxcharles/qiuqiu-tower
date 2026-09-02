import { it } from 'vitest';
import { cards } from '../src/content/cards';
import type { Effect } from '../src/engine/types';

/**
 * 牌費規格化的量表（使用者 2026-09-02：「假設隱身 1 分、攻擊 10 點以下 1 分、蜷縮 10 點以下 1 分…把牌全部鋪出來」）。
 * 只印表不改牌。看：`npx vitest run --reporter=verbose tests/cards.value.report.test.ts`
 * 計分（一張牌的「價值分」）：
 *   傷害：每 6 點 1 分（多段乘段數；打全體 ×1.5；無視防禦 ×1.2）｜蜷縮：每 5 點 1 分｜隱身：每層 1 分｜潛水：每層 0.8 分
 *   爪力：每點 1.5 分｜貓步：每點 1.2 分｜反彈：每點 0.5 分｜抽牌：每張 0.8 分｜飯糰：每顆 1.2 分｜回血：每 4 點 1 分
 *   給魔物減益：每層 0.6 分（全體 ×1.5）｜定身：1.5 分（全體 ×2）｜能力（每回合觸發）：內容分 ×2.5｜消耗：−0.5｜不可打出：0
 * 基準：1 費 ≈ 2 分、2 費 ≈ 4 分、3 費 ≈ 6 分、0 費 ≈ 1 分。比值＝分數 ÷ 基準，>1.35 偏強、<0.7 偏弱。
 */
function score(effects: Effect[], all = false): number {
  let s = 0;
  const mult = (target?: string): number => (target === 'all' ? 1.5 : 1);
  for (const fx of effects) {
    switch (fx.kind) {
      case 'damage': s += (fx.amount * (fx.times ?? 1)) / 6 * mult(fx.target) * (fx.ignoreBlock ? 1.2 : 1); break;
      case 'damageRandom': s += ((fx.min + fx.max) / 2) / 6; break;
      case 'damageEqualBlock': s += 2.5; break;
      case 'block': s += fx.amount / 5; break;
      case 'status': {
        const good: Record<string, number> = { 隱身: 1, 潛水: 0.8, 爪力: 1.5, 貓步: 1.2, 反彈: 0.5 };
        if (fx.target === 'self') s += (good[fx.name] ?? 0.5) * fx.amount;
        else if (fx.name === '定身') s += 1.5 * (fx.target === 'all' ? 2 : 1);
        else s += 0.6 * fx.amount * mult(fx.target);
        break;
      }
      case 'draw': s += fx.n * 0.8; break;
      case 'drawNextTurn': s += fx.n * 0.6; break;
      case 'energy': s += fx.n * 1.2; break;
      case 'heal': s += fx.n / 4; break;
      case 'power': s += score(fx.effects) * (fx.thisTurn ? 1 : 2.5); break;
      case 'doubleNextAttack': s += 2; break;
      case 'removeStatuses': s += 1.5; break;
      case 'cleanse': s += 1.2; break;
      case 'transferDebuffs': s += 1.5; break;
      case 'scry': s += 0.5; break;
      case 'stealBlock': s += 1.5; break;
      case 'selfDamage': s -= fx.amount / 6; break;
      default: s += 0.8;   // 其他特殊效果先給個保底
    }
  }
  return s;
}
it('牌價值表', () => {
  const base = (cost: number): number => (cost === 0 ? 1 : cost * 2);
  const rows = cards.filter((c) => c.pool !== '壞毛病').map((c) => {
    const s = score(c.effects) - (c.keywords?.includes('消耗') ? 0.5 : 0);
    const up = { ...c, ...c.upgrade };
    const s2 = score(up.effects ?? c.effects) - ((up.keywords ?? c.keywords)?.includes('消耗') ? 0.5 : 0);
    return { id: c.id, name: c.name, pool: c.pool, rarity: c.rarity, cost: c.cost, s: +s.toFixed(1), ratio: +(s / base(c.cost)).toFixed(2), cost2: up.cost ?? c.cost, s2: +s2.toFixed(1), ratio2: +(s2 / base(up.cost ?? c.cost)).toFixed(2) };
  });
  rows.sort((a, b) => b.ratio - a.ratio);
  console.log('CARDVALUE ' + JSON.stringify(rows));
});
