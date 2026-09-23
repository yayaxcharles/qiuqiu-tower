import { describe, expect, it } from 'vitest';
import { giveCards } from '../../src/engine/actions';
import { beginEnemyTurn, finishEnemyTurn, stepEnemyTurn } from '../../src/engine/combat';
import { beginCombat, newCoopRun, newRun } from '../../src/engine/run';
import type { RunState } from '../../src/engine/types';
import { combatFingerprint } from '../../src/net/hash';

/*
 * 魔物塞牌的戰報要寫塞給誰（2026-09-23 主控裁定）。
 *
 * 原本一律寫「塞進你的棄牌堆」。戰報兩台共用，塞牌又可能只落在一位身上（喊了「我來擋」、另一位倒下、
 * 打技能牌惹到詛咒的那位），另一台讀到的「你的」就是錯的對象。兩人時改寫名字，單機照舊。
 * 戰報不進連線指紋、畫面也不再讀這句（見 tests/ui/seat_feedback_0923.test.ts），改字不影響兩台的結算。
 */
function fight(run: RunState) {
  run.currentNode = run.map.nodes.find((n) => n.type === '戰鬥')!.id;
  return beginCombat(run, 'cucumber');
}

describe('塞牌的戰報寫對對象', () => {
  it('連線：塞給 1 號菲菲就寫菲菲，不寫「你的」', () => {
    const cs = fight(newCoopRun('curse-log-1', 1, 'ninja', 'feifei'));
    giveCards(cs, cs.enemies[0]!, 'slime_card', 1, 'discard', cs.players[1]);
    expect(cs.log.at(-1)).toMatch(/塞進菲菲的棄牌堆$/);
    giveCards(cs, cs.enemies[0]!, 'dazed_card', 2, 'draw', cs.players[0]);
    expect(cs.log.at(-1)).toMatch(/塞進球球的抽牌堆$/);
    expect(cs.log.some((l) => l.includes('塞進你的'))).toBe(false);
  });

  it('連線：魔物真的出手、只打喊了「我來擋」的 1 號，戰報寫的是 1 號', () => {
    const cs = fight(newCoopRun('curse-log-2', 1, 'ninja', 'feifei'));
    for (const e of cs.enemies) e.move = { intent: 'debuff', label: '測試黏液', effects: [{ kind: 'giveCard', cardId: 'slime_card', n: 1, to: 'discard' }] };
    expect(beginEnemyTurn(cs)).toBe(true);
    cs.players[1]!.taunt = true;
    while (stepEnemyTurn(cs)) { /* 一隻一隻 */ }
    finishEnemyTurn(cs);
    const lines = cs.log.filter((l) => l.includes('塞進'));
    expect(lines.length).toBe(cs.enemies.length);
    for (const l of lines) expect(l).toMatch(/塞進菲菲的棄牌堆$/);
  });

  it('單機照舊寫「你的」', () => {
    const cs = fight(newRun('curse-log-solo', 1, 'feifei'));
    giveCards(cs, cs.enemies[0]!, 'slime_card', 1, 'discard');
    expect(cs.log.at(-1)).toMatch(/塞進你的棄牌堆$/);
  });

  it('戰報文字不進連線指紋', () => {
    const cs = fight(newCoopRun('curse-log-fp', 1, 'ninja', 'feifei'));
    giveCards(cs, cs.enemies[0]!, 'slime_card', 1, 'discard', cs.players[1]);
    const fp = combatFingerprint(cs);
    cs.log[cs.log.length - 1] = '黃瓜怪把 1 張「黏液」塞進你的棄牌堆';
    expect(combatFingerprint(cs)).toBe(fp);
  });
});
