import { describe, expect, it } from 'vitest';
import { beginCombat, newCoopRun, takeRelic } from '../../src/engine/run';
import { getStatus } from '../../src/engine/statuses';

/*
 * **加入的那一位，第一回合要跑跟開房那位一樣的開場**（2026-09-13 實機測出來的）。
 *
 * `beginCombat` 幫加入的人手動發了五張牌、給滿飯糰，卻**漏掉秘寶那一段**：
 * 每回合開始的掛鉤（毒針袋、鐵砂袋、靈貓鈴）與第一回合限定的掛鉤
 *（藍頭巾多抽一張、飯糰袋多一顆）在他身上一次都不會跑。
 *
 * 為什麼測試以前抓不到：單機只有一位、開房那位走 `startCombat` 的正常路，
 * 兩條都沒事；只有**座位 1 以上的第一回合**踩得到。
 * 而且它完全靜音——畫面正常、紀錄不會少一行錯的，只是數字比該有的少。
 * 是開兩個分頁實際玩才看到「魔物身上沒有毒」。
 */
function coopFight(hero0: 'ninja' | 'feifei', hero1: 'ninja' | 'feifei', seed = 'join-1') {
  const run = newCoopRun(seed, 1, hero0, hero1);
  const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
  run.currentNode = node.id;
  return { run, cs: beginCombat(run) };
}

describe('加入的那一位的第一回合', () => {
  it('菲菲當加入方：毒針袋第一回合就要上毒', () => {
    const { cs } = coopFight('ninja', 'feifei');
    expect(cs.players[1]!.relics, '她該帶著毒針袋').toContain('backstep');
    for (const e of cs.enemies) {
      expect(getStatus(e, '中毒'), '加入方的毒針袋第一回合沒發動').toBeGreaterThanOrEqual(1);
    }
  });

  it('球球當加入方：藍頭巾第一回合要多抽一張', () => {
    const { cs } = coopFight('feifei', 'ninja', 'join-2');
    expect(cs.players[1]!.relics).toContain('blue_headband');
    expect(cs.players[1]!.hand.length, '基本 5 張 ＋ 藍頭巾那 1 張').toBe(6);
  });

  it('每回合開始的秘寶也算：鐵砂袋給加入方 3 點蜷縮', () => {
    const run = newCoopRun('join-3', 1, 'ninja', 'ninja');
    takeRelic(run, 'sand_bag', 1);
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    run.currentNode = node.id;
    const cs = beginCombat(run);
    expect(cs.players[1]!.block, '加入方的鐵砂袋第一回合沒發動').toBeGreaterThanOrEqual(3);
  });

  it('開房那位不受影響（本來就是對的）', () => {
    const { cs } = coopFight('feifei', 'ninja', 'join-4');
    expect(cs.players[0]!.hand.length, '菲菲沒有加抽的秘寶，就是 5 張').toBe(5);
    for (const e of cs.enemies) expect(getStatus(e, '中毒'), '開房的菲菲毒針袋本來就會發動').toBeGreaterThanOrEqual(1);
  });

  it('兩個人的飯糰都是滿的', () => {
    const { cs } = coopFight('ninja', 'feifei', 'join-5');
    for (const p of cs.players) expect(p.energy, '每個人第一回合都該是滿的').toBe(p.maxEnergy);
  });
});
