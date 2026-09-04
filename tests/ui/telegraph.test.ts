import { describe, expect, it } from 'vitest';

import { enemies, enemyById, showsTelegraph } from '../../src/content/enemies';
import { beginEnemyTurn, endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus } from '../../src/engine/statuses';
import type { CombatState, EnemyCombat } from '../../src/engine/types';
import { telegraphTarget, willAct } from '../../src/ui/telegraph';
import { inst } from '../helpers';

/**
 * 出招預告（2026-09-04 拍板）：魔物動手前先亮半拍，讓人讀得懂下一拍要發生什麼。
 * 使用者裁決「只給關主與菁英」——小怪維持現在的節奏，會蹲下去的那隻才是重點。
 */
describe('出招預告的適用範圍', () => {
  it('關主（塔主）與菁英（大魔物）會亮', () => {
    let n = 0;
    for (const e of enemies) {
      if (e.pool === '塔主' || e.pool === '大魔物') {
        expect(showsTelegraph(e.id), `${e.name}（${e.pool}）`).toBe(true);
        n++;
      }
    }
    expect(n, '池名改過就會變成空迴圈＝這條測試等於沒測').toBeGreaterThan(10);
  });

  it('弱、中、強、召喚池的怪不會亮', () => {
    let n = 0;
    for (const e of enemies) {
      if (e.pool !== '塔主' && e.pool !== '大魔物') {
        expect(showsTelegraph(e.id), `${e.name}（${e.pool}）`).toBe(false);
        n++;
      }
    }
    expect(n, '池名改過就會變成空迴圈＝這條測試等於沒測').toBeGreaterThan(10);
  });

  it('查不到的魔物 id 不會亮（不要因為打錯字就整場閃）', () => {
    expect(showsTelegraph('沒有這隻')).toBe(false);
  });
});

/** 開一場鬼將（菁英）＋兩隻小鬼（召喚）的戰鬥，一場裡兩種池都有 */
function oni(): CombatState {
  return startCombat({
    hp: 300, maxHp: 300, deck: ['sanjo', 'tanding'].map((id, i) => inst(id, i + 1)),
    relics: [], potions: [], encounterId: 'oni_general', rng: new Rng(seedFromString('tg')),
  });
}
const boss = (cs: CombatState) => cs.enemies.find((e) => showsTelegraph(e.enemyId))!;
const minion = (cs: CombatState) => cs.enemies.find((e) => !showsTelegraph(e.enemyId))!;

describe('下一個該亮預告的是誰', () => {
  it('下一個出手的是菁英就回傳牠', () => {
    const cs = oni();
    beginEnemyTurn(cs);
    cs.enemyQueue = [boss(cs).uid];
    expect(telegraphTarget(cs)).toBe(boss(cs).uid);
  });

  it('下一個是小怪就不亮', () => {
    const cs = oni();
    beginEnemyTurn(cs);
    cs.enemyQueue = [minion(cs).uid];
    expect(telegraphTarget(cs)).toBeUndefined();
  });

  it('被定身的不亮：亮了也不會出手，等於演一場假的', () => {
    const cs = oni();
    beginEnemyTurn(cs);
    const b = boss(cs);
    addStatus(b, '定身', 2);
    cs.enemyQueue = [b.uid];
    expect(telegraphTarget(cs)).toBeUndefined();
  });

  it('睡著的不亮（「打瞌睡的」修飾詞與冬眠熊都會踩到）', () => {
    const cs = oni();
    beginEnemyTurn(cs);
    const b = boss(cs);
    addStatus(b, '沉睡', 2);
    cs.enemyQueue = [b.uid];
    expect(telegraphTarget(cs)).toBeUndefined();
  });

  it('倒下的、剛爬起來這拍不出招的都不亮', () => {
    for (const set of [(e: { dead: boolean }) => { e.dead = true; }, (e: { justRevived?: boolean }) => { e.justRevived = true; }]) {
      const cs = oni();
      beginEnemyTurn(cs);
      const b = boss(cs);
      set(b);
      cs.enemyQueue = [b.uid];
      expect(telegraphTarget(cs)).toBeUndefined();
    }
  });

  it('佇列空的、戰鬥已經結束的都不亮', () => {
    const cs = oni();
    beginEnemyTurn(cs);
    cs.enemyQueue = [];
    expect(telegraphTarget(cs)).toBeUndefined();
    cs.enemyQueue = [boss(cs).uid];
    cs.phase = 'won';
    expect(telegraphTarget(cs)).toBeUndefined();
  });

  it('只偷看不動手：呼叫前後整個戰鬥狀態一個位元都沒變（預告是演出層，不准碰引擎）', () => {
    const cs = oni();
    beginEnemyTurn(cs);
    const before = JSON.stringify(cs);
    telegraphTarget(cs);
    telegraphTarget(cs);
    expect(JSON.stringify(cs)).toBe(before);
  });
});

describe('這一拍到底會不會出手（畫面與引擎要同一套判準）', () => {
  it('正常的怪會出手', () => {
    const cs = oni();
    expect(willAct(boss(cs))).toBe(true);
  });

  it('被定身、睡著、倒下、剛爬起來的都不會出手', () => {
    for (const set of [
      (e: EnemyCombat) => addStatus(e, '定身', 1),
      (e: EnemyCombat) => addStatus(e, '沉睡', 1),
      (e: EnemyCombat) => { e.dead = true; },
      (e: EnemyCombat) => { e.justRevived = true; },
    ]) {
      const cs = oni();
      const b = boss(cs);
      set(b);
      expect(willAct(b)).toBe(false);
    }
  });

  it('定身擋的是整個動作，不只攻擊：山賊被定住就搶不走小魚乾', () => {
    const cs = startCombat({
      hp: 300, maxHp: 300, deck: ['sanjo', 'tanding'].map((id, i) => inst(id, i + 1)),
      relics: [], potions: [], encounterId: 'orange_bandit', rng: new Rng(seedFromString('rob')),
    });
    const bandit = cs.enemies[0]!;
    // 把牠頭上那招換成「搶劫」（特殊招，不是攻擊——這正是畫面判準漏掉的那一格）
    const rob = enemyById['orange_bandit']!.moves.find((m) => m.effects.some((f) => f.kind === 'stealFish'))!;
    bandit.move = rob;
    expect(rob.intent, '前提：搶劫不是攻擊招').not.toBe('attack');
    addStatus(bandit, '定身', 2);
    const before = cs.stolenFish;
    cs.player.block = 999;
    endTurn(cs);
    expect(cs.stolenFish, '被定住就搶不走').toBe(before);
    expect(willAct(bandit), '畫面也要知道牠沒出手').toBe(false);
  });
});
