// 關主收場台詞與結局換句（2026-09-04）
import { describe, expect, it } from 'vitest';
import { bossPoolForAct } from '../../src/engine/run';
import { deckLeaning, dialogue, qiuqiuLineOk, victoryLinesFor } from '../../src/content/dialogue';
import { STARTER_DECK } from '../../src/content/cards';
import { enemyById } from '../../src/content/enemies';

describe('關主的故事線', () => {
  it('塔下、塔中每個關主都有開場與收場對白，收場裡球球句尾要有喵、魔物不叫「師父」', () => {
    for (const id of [...bossPoolForAct(1), ...bossPoolForAct(2)]) {
      expect(dialogue.bossIntroById[id], `${id} 開場`).toBeTruthy();
      const outro = dialogue.bossDefeatById[id];
      expect(outro, `${id} 收場`).toBeTruthy();
      for (const l of outro!) {
        if (l.speaker === '球球') expect(qiuqiuLineOk(l.text), l.text).toBe(true);
        if (l.speaker === '旁白') expect(qiuqiuLineOk(l.text), `旁白不可有喵：${l.text}`).toBe(false);
        if (l.speaker === '塔主') expect(l.text.includes('師父') && !l.text.includes('你師父'), `魔物不該叫他師父：${l.text}`).toBe(false);
      }
      expect(enemyById[id]).toBeTruthy();
    }
  });
  it('結局第二句依牌組傾向在貼圖標題裡換；起始牌組算「不明顯」；封口術（拆敵人爪力）不算爪力流', () => {
    const base = dialogue.victory.map((l) => l.text);
    expect(deckLeaning(STARTER_DECK), '起始牌組不該被判成任何一派').toBe('plain');
    const plain = victoryLinesFor([...STARTER_DECK], 1);
    expect(plain[1]!.text).toBe(dialogue.masterFirstWords.plain);
    expect(plain.length).toBe(base.length);
    expect(deckLeaning([...STARTER_DECK, 'fengkou', 'fengkou', 'fengkou', 'fengkou', 'fengkou', 'fengkou'])).not.toBe('strength');
    const strDeck = [...STARTER_DECK, ...Array<string>(8).fill('fengyin')];
    expect(deckLeaning(strDeck)).toBe('strength');
    const str = victoryLinesFor(strDeck, 1);
    expect(str[1]!.text).toBe(dialogue.masterFirstWords.strength);
    expect(str[2]!.speaker).toBe('旁白');
    expect(str.length).toBe(base.length + 1);
    const hard = victoryLinesFor([...STARTER_DECK], 4);
    expect(hard.length).toBe(base.length + 1);
    expect(hard[hard.length - 1]!.text).toBe(dialogue.hardModeEpilogue);
  });
});
