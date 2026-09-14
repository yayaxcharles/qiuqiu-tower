import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { relics } from '../../src/content/relics';
import { damagePlayer } from '../../src/engine/actions';
import { playCard } from '../../src/engine/combat';
import { beginCombat, newRun } from '../../src/engine/run';
import { getStatus } from '../../src/engine/statuses';
import { describeCard } from '../../src/ui/cardtext';

/**
 * 後退閃躲＝**獲得隱身**（使用者 2026-09-14 深夜裁定：「後退閃躲就是獲得隱身」，說明寫「跟師兄學來的招式」）。
 *
 * 起因：第三關的穿透（地藏石偶、虛無貓、面具舞者，加上七隻關主與塔主）蜷縮擋不住，
 * 只有隱身、定身、整回合免傷接得住；她整套防禦原本全是蜷縮，碰到穿透等於零防禦。
 * 這是她唯一的閃避：1 費（一開始 0 費，使用者說拿隱身 0 費不合理）、常見，球球的隱身牌她照樣拿不到，所以不會像忍者那樣整副疊隱身。
 * 順帶：紙袋、影披風對她有用了，鎖拿掉（tests/content/feifei_relic.test.ts）。
 */
function setup() {
  const run = newRun('lakai', 1, 'feifei');
  run.currentNode = run.map.nodes.find((n) => n.type === '戰鬥')!.id;
  const cs = beginCombat(run);
  const p = cs.players[0]!;
  p.energy = 99; p.hand.length = 0; p.hp = 70; p.maxHp = 70;
  return { cs, p, e: cs.enemies[0]! };
}

describe('後退閃躲：她跟師兄學來的閃避', () => {
  it('1 費（使用者：0 費拿隱身不合理）、基本版 1 層隱身、升級版 2 層', () => {
    const d = cardById['feifei_lakai']!;
    expect(d.cost).toBe(1);
    expect(d.upgrade.cost, '升級版不降費，只多 1 層').toBeUndefined();
    expect(d.effects).toEqual([{ kind: 'status', name: '隱身', amount: 1, target: 'self' }]);
    expect(d.upgrade.effects).toEqual([{ kind: 'status', name: '隱身', amount: 2, target: 'self' }]);
  });

  it('打出去拿到 1 層隱身；穿透那一下閃掉、不掉血', () => {
    const { cs, p, e } = setup();
    p.hand.push({ uid: 900, cardId: 'feifei_lakai', upgraded: false });
    playCard(cs, 900);
    expect(getStatus(p, '隱身')).toBe(1);
    damagePlayer(cs, e, 24, { pierce: true });   // 地藏石偶那一下
    expect(p.hp, '穿透被閃掉').toBe(70);
    expect(getStatus(p, '隱身')).toBe(0);
    damagePlayer(cs, e, 24, { pierce: true });
    expect(p.hp, '沒隱身就整下進血').toBe(46);
  });

  it('紙袋對她有用了：每回合第一次拿隱身多 1 層', () => {
    const { cs, p } = setup();
    p.relics.push('paper_bag');
    p.hand.push({ uid: 900, cardId: 'feifei_lakai', upgraded: false });
    playCard(cs, 900);
    expect(getStatus(p, '隱身')).toBe(2);
  });

  it('牌面：獲得 1 層隱身，最後一句寫來歷', () => {
    const d = cardById['feifei_lakai']!;
    expect(describeCard(d, false)).toContain('1 層隱身');
    expect(describeCard(d, false).endsWith('。跟師兄學來的招式。')).toBe(true);
    expect(describeCard(d, true)).toContain('2 層隱身');
  });

  it('紙袋與影披風不再鎖她', () => {
    for (const id of ['paper_bag', 'shadow_cloak']) expect(relics.find((r) => r.id === id)!.notFor ?? []).toEqual([]);
  });
});
