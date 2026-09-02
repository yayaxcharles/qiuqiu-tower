import { describe, expect, it } from 'vitest';
import { addStatus, computeAttack, computeBlock, decayTurnStatuses, getStatus, removeStatus, tickPoison } from '../../src/engine/statuses';
import { blankUnit } from '../helpers';

describe('狀態效果', () => {
  it('加減與歸零刪鍵', () => {
    const u = blankUnit();
    addStatus(u, '爪力', 2); expect(getStatus(u, '爪力')).toBe(2);
    addStatus(u, '爪力', -2); expect(u.statuses['爪力']).toBeUndefined();
    addStatus(u, '隱身', 1); removeStatus(u, '隱身'); expect(getStatus(u, '隱身')).toBe(0);
  });
  it('回合衰減只影響翻肚／懶洋洋／炸毛', () => {
    const u = blankUnit();
    addStatus(u, '翻肚', 2); addStatus(u, '懶洋洋', 1); addStatus(u, '炸毛', 1); addStatus(u, '爪力', 3); addStatus(u, '隱身', 2);
    decayTurnStatuses(u);
    expect(getStatus(u, '翻肚')).toBe(1); expect(getStatus(u, '懶洋洋')).toBe(0); expect(getStatus(u, '炸毛')).toBe(0);
    expect(getStatus(u, '爪力')).toBe(3); expect(getStatus(u, '隱身')).toBe(2);
  });
  it('噎到發作：回傳該掉的血、層數減一（扣血由呼叫端走 damageEnemy／damagePlayer，審查 #10）', () => {
    const u = blankUnit(20); u.block = 5; addStatus(u, '噎到', 3);
    expect(tickPoison(u)).toBe(3);
    expect(u.hp).toBe(20); expect(u.block).toBe(5); expect(getStatus(u, '噎到')).toBe(2);
    expect(tickPoison(blankUnit())).toBe(0);
  });
  it('攻擊公式：爪力→懶洋洋→翻肚→捨去', () => {
    const a = blankUnit(), d = blankUnit();
    expect(computeAttack(6, a, d)).toBe(6);
    addStatus(a, '爪力', 2); expect(computeAttack(6, a, d)).toBe(8);
    addStatus(a, '懶洋洋', 1); expect(computeAttack(6, a, d)).toBe(6);      // 8×0.75＝6
    addStatus(d, '翻肚', 1); expect(computeAttack(6, a, d)).toBe(9);        // 8×0.75×1.5＝9
    expect(computeAttack(6, a, d, { noStrength: true })).toBe(6);           // 6×0.75×1.5＝6.75→6
  });
  it('蜷縮公式：貓步→炸毛→捨去', () => {
    const u = blankUnit();
    addStatus(u, '貓步', 2); expect(computeBlock(5, u)).toBe(7);
    addStatus(u, '炸毛', 1); expect(computeBlock(5, u)).toBe(5);            // 7×0.75＝5.25→5
  });
});
