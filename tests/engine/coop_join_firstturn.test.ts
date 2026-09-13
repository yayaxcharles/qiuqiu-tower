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

/*
 * **「每場戰鬥開始」那組也要跑**（2026-09-13 第三輪稽核 高-2）。
 *
 * 上面那批只補了「每回合開始」的掛鉤，掛 `combatStart` 的十七件秘寶
 *（斗笠、鐵項圈、龜甲、爪鞘、無聲鈴、墨玉、塔頂之月…）與秘笈的
 * 「第一次攻擊傷害加倍」在加入的那一位身上還是整場不發動。
 * 花 190 條買的東西一次都沒作用，而且照樣不報錯、測試照樣綠。
 */
describe('加入的那一位的開場秘寶', () => {
  const fight = (setup: (run: ReturnType<typeof newCoopRun>) => void, seed: string) => {
    const run = newCoopRun(seed, 1, 'ninja', 'ninja');
    setup(run);
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    run.currentNode = node.id;
    return beginCombat(run);
  };

  it('斗笠：加入方開戰要有 4 點蜷縮', () => {
    const cs = fight((run) => takeRelic(run, 'straw_hat', 1), 'cs-hat');
    expect(cs.players[1]!.block, '加入方的斗笠沒發動').toBeGreaterThanOrEqual(4);
  });

  it('鐵項圈：加入方開戰要有 10 點蜷縮', () => {
    const cs = fight((run) => takeRelic(run, 'iron_collar', 1), 'cs-collar');
    expect(cs.players[1]!.block, '加入方的鐵項圈沒發動').toBeGreaterThanOrEqual(10);
  });

  it('墨玉：加入方帶的話，全體魔物開戰就掛 2 層懶洋洋', () => {
    const cs = fight((run) => takeRelic(run, 'ink_jade', 1), 'cs-jade');
    for (const e of cs.enemies) {
      expect(getStatus(e, '懶洋洋'), '加入方的墨玉沒發動').toBeGreaterThanOrEqual(2);
    }
  });

  it('秘笈：加入方的第一次攻擊加倍旗標要立起來', () => {
    const cs = fight((run) => takeRelic(run, 'scroll', 1), 'cs-scroll');
    expect(cs.players[1]!.firstAttackDouble, '加入方的秘笈沒掛上').toBe(true);
  });

  it('開房那位帶的不會誤跑到加入方身上', () => {
    const cs = fight((run) => takeRelic(run, 'iron_collar', 0), 'cs-owner');
    expect(cs.players[0]!.block, '開房那位本來就該有').toBeGreaterThanOrEqual(10);
    expect(cs.players[1]!.block, '加入方沒買，不該憑空多出蜷縮').toBe(0);
  });
});
