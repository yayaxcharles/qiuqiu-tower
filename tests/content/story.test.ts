// 關主收場台詞與結局換句（2026-09-04）
import { describe, expect, it } from 'vitest';
import { bossPoolForAct } from '../../src/engine/run';
import { dialogue, victoryLinesFor } from '../../src/content/dialogue';
import { enemyById } from '../../src/content/enemies';

describe('關主的故事線', () => {
  it('塔下、塔中每個關主都有開場與收場對白，收場裡球球句尾要有喵、魔物不叫「師父」', () => {
    for (const id of [...bossPoolForAct(1), ...bossPoolForAct(2)]) {
      expect(dialogue.bossIntroById[id], `${id} 開場`).toBeTruthy();
      const outro = dialogue.bossDefeatById[id];
      expect(outro, `${id} 收場`).toBeTruthy();
      for (const l of outro!) {
        if (l.speaker === '球球') expect(l.text.endsWith('喵。') || l.text.endsWith('喵！') || l.text.endsWith('喵……') || l.text.includes('喵'), l.text).toBe(true);
        if (l.speaker === '塔主') expect(l.text.includes('師父') && !l.text.includes('你師父'), `魔物不該叫他師父：${l.text}`).toBe(false);
      }
      expect(enemyById[id]).toBeTruthy();
    }
  });
  it('結局第二句依牌組傾向換：爪力流、隱身流、蜷縮流、都不明顯', () => {
    const base = dialogue.victory.map((l) => l.text);
    const plain = victoryLinesFor(['tanding', 'sanjo', 'kawarimi'], 1);
    expect(plain[1]!.text).toBe(dialogue.masterFirstWords.plain);
    expect(plain.length).toBe(base.length);
    const str = victoryLinesFor(['fengyin', 'fengyin', 'fengyin', 'fengyin', 'fengyin'], 1);
    expect(str[1]!.text).toBe(dialogue.masterFirstWords.strength);
    const hard = victoryLinesFor(['tanding'], 4);
    expect(hard.length).toBe(base.length + 1);
    expect(hard[hard.length - 1]!.text).toBe(dialogue.hardModeEpilogue);
  });
});
