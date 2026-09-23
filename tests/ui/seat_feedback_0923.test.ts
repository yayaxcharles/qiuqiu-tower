import { describe, expect, it } from 'vitest';
import SRC from '../../src/ui/screens/combat.ts?raw';
import { giveCards, runEnemyEffects } from '../../src/engine/actions';
import { beginEnemyTurn, finishEnemyTurn, stepEnemyTurn } from '../../src/engine/combat';
import type { Hero } from '../../src/engine/hero';
import { beginCombat, newCoopRun } from '../../src/engine/run';
import type { CombatState, EnemyEffect } from '../../src/engine/types';
import { combatFingerprint } from '../../src/net/hash';
import { seatFeedback, seatFeedbackSnap, type SeatFeedback } from '../../src/ui/seat-feedback';

/*
 * 魔物對**哪一位**做了什麼（2026-09-23 health H-1）。
 *
 * 畫面原本拿戰報句子判斷：`startsWith('蜷縮擋下了')` 飄「擋住 N」、`includes('塞進你的')` 放塞牌光、
 * `includes(`${名字}閃過了`)` 擺閃避姿勢。09-15 連線時擋下那行多了名字（「球球的蜷縮擋下了」），
 * 從那天起**連線時自己擋下攻擊，飄字、盾牌光、鏘聲整個不見**；塞牌、看破的光一律打在自己這格；
 * 兩位同角色時「球球閃過了」分不出是誰。單機的測試全綠，因為單機的句子沒變。
 *
 * 這裡用引擎**真的跑兩人戰鬥**，確認畫面用的判斷（`seatFeedback`）照座位拿得到數字；
 * 最後一段釘住 `combat.ts` 真的改用它、沒有退回比對句子。
 */
function coopFight(h1: Hero, h2: Hero, seed: string): CombatState {
  const run = newCoopRun(seed, 1, h1, h2);
  run.currentNode = run.map.nodes.find((n) => n.type === '戰鬥')!.id;
  const cs = beginCombat(run, 'cucumber');
  expect(cs.players.length, '要是兩人局，不然這條在測單機').toBe(2);
  for (const q of cs.players) { q.block = 0; q.statuses = {}; }
  return cs;
}

/** 照戰鬥畫面 `startEnemyTurn` 的走法：收回合、每一隻出手前後各拍一次、收尾。回傳每一位整輪的差 */
function enemyRound(cs: CombatState, effects: EnemyEffect[], setup: (cs: CombatState) => void): SeatFeedback[] {
  for (const e of cs.enemies) e.move = { intent: 'attack', label: '測試', effects };
  expect(beginEnemyTurn(cs), '魔物回合要開得起來').toBe(true);
  setup(cs);   // 收回合會清掉一些東西，出手前才擺好
  const before = cs.players.map(seatFeedbackSnap);
  while (stepEnemyTurn(cs)) { /* 一隻一隻 */ }
  const after = cs.players.map(seatFeedbackSnap);
  finishEnemyTurn(cs);
  return cs.players.map((_, i) => seatFeedback(before[i], after[i]!));
}

describe('連線時擋下的點數照座位拿得到（health H-1）', () => {
  it('球球＋菲菲：0 號擋下 5 點，畫面判斷對 0 號回 5、對 1 號回 0', () => {
    const cs = coopFight('ninja', 'feifei', 'seatfb-block');
    const got = enemyRound(cs, [{ kind: 'damage', amount: 7 }], (c) => { c.players[0]!.block = 5; });
    expect(got[0]!.blocked).toBe(5);
    expect(got[1]!.blocked).toBe(0);
    // 這就是舊寫法踩到的：連線的句子開頭是名字，`startsWith('蜷縮擋下了')` 一行都找不到
    expect(cs.log).toContain('球球的蜷縮擋下了 5 點');
    expect(cs.log.some((l) => l.startsWith('蜷縮擋下了'))).toBe(false);
  });

  it('兩位都是球球：擋下與閃過分得出是哪一位（句子一模一樣，只能靠座位）', () => {
    const cs = coopFight('ninja', 'ninja', 'seatfb-same');
    const got = enemyRound(cs, [{ kind: 'damage', amount: 7 }], (c) => {
      c.players[1]!.block = 5;
      c.players[0]!.statuses['隱身'] = 1;
      c.players[0]!.block = 3;   // 蜷縮先擋 3，剩下的那一下用隱身閃掉
    });
    expect(got[0]).toMatchObject({ blocked: 3, dodged: true, stripped: false });
    expect(got[1]).toMatchObject({ blocked: 5, dodged: false });
    // 兩位的句子分不出誰是誰：舊寫法 1 號那台看到「球球閃過了」也會擺閃避姿勢
    expect(cs.log.filter((l) => l === '球球的蜷縮擋下了 5 點' || l === '球球的蜷縮擋下了 3 點')).toHaveLength(2);
    expect(cs.log).toContain('球球閃過了');
  });

  it('塞牌打在被塞的那一位：句子寫「塞進你的」，畫面卻要亮在 1 號', () => {
    const cs = coopFight('ninja', 'feifei', 'seatfb-curse');
    const before = cs.players.map(seatFeedbackSnap);
    giveCards(cs, cs.enemies[0]!, 'slime_card', 1, 'discard', cs.players[1]);
    const got = cs.players.map((q, i) => seatFeedback(before[i], seatFeedbackSnap(q)));
    expect(got[0]!.cursed).toBe(false);
    expect(got[1]!.cursed).toBe(true);
    expect(cs.log.at(-1)).toContain('塞進你的');   // 舊寫法照這句把光打在自己這格
  });

  it('看破打在隱身被拆的那一位；閃過自己用掉的那一層不算被看破', () => {
    const cs = coopFight('ninja', 'feifei', 'seatfb-strip');
    cs.players[1]!.statuses['隱身'] = 2;
    let before = cs.players.map(seatFeedbackSnap);
    runEnemyEffects(cs, cs.enemies[0]!, [{ kind: 'stripPlayer', names: ['隱身', '潛水'] }], false);
    let got = cs.players.map((q, i) => seatFeedback(before[i], seatFeedbackSnap(q)));
    expect(got[0]!.stripped).toBe(false);
    expect(got[1]!.stripped).toBe(true);
    // 只閃過一下：隱身少一層是自己用掉的
    const dodge = coopFight('ninja', 'feifei', 'seatfb-dodge');
    const d = enemyRound(dodge, [{ kind: 'damage', amount: 7 }], (c) => { c.players[0]!.statuses['隱身'] = 1; });
    expect(d[0]).toMatchObject({ dodged: true, stripped: false });
    // 破功拆成長也算
    cs.players[0]!.statuses['爪力'] = 4;
    before = cs.players.map(seatFeedbackSnap);
    runEnemyEffects(cs, cs.enemies[0]!, [{ kind: 'purgePlayer', names: ['爪力', '貓步'] }], false);
    got = cs.players.map((q, i) => seatFeedback(before[i], seatFeedbackSnap(q)));
    expect(got[0]!.stripped).toBe(true);
    expect(got[1]!.stripped).toBe(false);
  });

  it('吹散手牌看自己下回合少抽幾張', () => {
    const cs = coopFight('ninja', 'feifei', 'seatfb-blown');
    cs.players[0]!.drawNextTurn = -4;   // 已經只剩 1 張可抽：吹不掉，這一位沒事
    const before = cs.players.map(seatFeedbackSnap);
    runEnemyEffects(cs, cs.enemies[0]!, [{ kind: 'discardRandomHand', n: 2 }], false);
    const got = cs.players.map((q, i) => seatFeedback(before[i], seatFeedbackSnap(q)));
    expect(got[0]!.blown).toBe(0);
    expect(got[1]!.blown).toBe(2);
  });
});

describe('替畫面記的累計不影響兩台的結算', () => {
  it('不進連線指紋', () => {
    const cs = coopFight('ninja', 'feifei', 'seatfb-hash');
    const fp = combatFingerprint(cs);
    cs.players[0]!.blockedTotal = 999;
    cs.players[1]!.dodgedTotal = 42;
    expect(combatFingerprint(cs)).toBe(fp);
  });

  it('引擎不讀它：同一場先塞亂七八糟的值，打完的指紋照樣一樣', () => {
    const play = (dirty: boolean): string => {
      const cs = coopFight('ninja', 'ninja', 'seatfb-lockstep');
      if (dirty) for (const q of cs.players) { q.blockedTotal = 77; q.dodgedTotal = 5; }
      for (let round = 0; round < 3 && cs.phase === 'player'; round++) {
        enemyRound(cs, [{ kind: 'damage', amount: 9, times: 2 }], (c) => {
          c.players[0]!.block = 6; c.players[1]!.statuses['隱身'] = 1;
        });
      }
      return combatFingerprint(cs);
    };
    expect(play(true)).toBe(play(false));
  });
});

describe('戰鬥畫面改用座位判斷、不再比對句子（改回舊寫法這裡會紅）', () => {
  const src = SRC.replace(/\r\n/g, '\n');
  const settle = src.slice(src.indexOf('  function settle('), src.indexOf('  function checkOver('));

  it('擋下、閃過、塞牌、看破、吹散都不讀句子', () => {
    expect(settle.length).toBeGreaterThan(1000);
    expect(settle).not.toContain("startsWith('蜷縮擋下了')");
    expect(settle).not.toContain("includes('塞進你的')");
    expect(settle).not.toContain("includes('的身法')");
    expect(settle).not.toContain('閃過了`');
    expect(settle).not.toContain("includes('下回合少抽')");
    expect(src).not.toContain('function blockedAmount(');
  });

  it('每一處都接到 seatFeedback', () => {
    expect(src).toContain('...seatFeedbackSnap(p),');   // 快照每一位都要帶，連線重播的 comparison 才有
    expect(settle).toContain('comparison?.players.get(q.seat) ?? seatFeedbackSnap(q)');
    expect(settle).toContain('const dodged = myFeedback.dodged;');
    expect(settle).toContain('else if (enemyActed && myFeedback.blocked > 0 && hasHeroSprite(my().hero, POSE.guard)) pose = POSE.guard;');
    expect(settle).toContain('|| feedbackOf(q).blocked > 0)) reaction = \'guard\';');
    expect(settle).toContain('const guarded = myFeedback.blocked;');
    // 塞牌、看破打在中招那一位的格子，不是固定打在自己（MINE）
    expect(settle).toContain('const node = root.querySelector<HTMLElement>(`.unit.player[data-seat="${q.seat}"]`);');
    expect(settle).toContain("if (node && got.cursed) burst(node, 'curse');");
    expect(settle).toContain("if (node && got.stripped) burst(node, 'strip');");
  });
});
