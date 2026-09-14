// 關主收場台詞與結局換句（2026-09-04）
import { describe, expect, it } from 'vitest';
import { bossPoolForAct } from '../../src/engine/run';
import { deckLeaning, dialogue, feifeiDialogue, feifeiLineOk, lineFor, qiuqiuLineOk, storyFor, victoryLinesFor } from '../../src/content/dialogue';
import { FEIFEI_STARTER_DECK, STARTER_DECK } from '../../src/content/cards';
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

  /*
   * ===== 菲菲的劇本（2026-09-12）=====
   *
   * 守的是「她沒有變成球球」：說話者是她自己、句尾不加喵、故事分家了。
   * 台詞改壞最難察覺——不會有任何測試失敗、也不會報錯，只是某一天玩家發現
   * 兩隻貓講一模一樣的話。
   */
  it('她的五段故事都在，說話者是她自己，而且句尾不加喵', () => {
    const st = storyFor('feifei');
    expect(st.prologue.length, '序章四句配四張圖').toBe(4);
    expect(st.victory.length).toBeGreaterThanOrEqual(4);
    for (const seg of [st.prologue, st.actClear1, st.actClear2, st.defeat, st.victory]) {
      expect(seg.length).toBeGreaterThan(0);
      for (const l of seg) {
        expect(l.speaker, `不該有球球在講話：${l.text}`).not.toBe('球球');
        if (l.speaker === '菲菲') expect(feifeiLineOk(l.text), `她不加喵：${l.text}`).toBe(true);
        if (l.speaker === '旁白') expect(qiuqiuLineOk(l.text), `旁白不可有喵：${l.text}`).toBe(false);
      }
      expect(seg.some((l) => l.speaker === '菲菲' || l.speaker === '旁白')).toBe(true);
    }
    expect(feifeiLineOk(st.victoryTeaser)).toBe(true);
  });

  it('她跟球球的故事**真的不一樣**（不是複製一份改幾個字）', () => {
    const mine = storyFor('feifei');
    const his = storyFor('ninja');
    for (const k of ['prologue', 'actClear1', 'actClear2', 'defeat', 'victory'] as const) {
      const a = mine[k].map((l) => l.text).join('');
      const b = his[k].map((l) => l.text).join('');
      expect(a, `${k} 兩邊一樣`).not.toBe(b);
    }
    expect(mine.victoryTeaser).not.toBe(his.victoryTeaser);
    for (const k of ['battleStart', 'battleWin', 'hungry', 'lowHp', 'chestLines'] as const) {
      expect(mine[k].join('|'), `${k} 兩邊一樣`).not.toBe(his[k].join('|'));
      for (const t of mine[k]) expect(feifeiLineOk(t), `她不加喵：${t}`).toBe(true);
    }
  });

  /*
   * 魔物的初見吐槽 2026-09-12 分家了：本來共用球球那份、只拿掉句尾的「喵」，
   * 使用者否決（「不建議只把句尾的喵拿掉」），改成她自己一份 111 句。
   */
  it('每隻魔物她都有自己的一句，一句都不能漏、一句都不能有喵', () => {
    const his = Object.keys(dialogue.firstMeet);
    const hers = storyFor('feifei').firstMeet;
    expect(Object.keys(hers).length, '兩邊要一樣多').toBe(his.length);
    for (const id of his) {
      const t = hers[id];
      expect(t, `${id} 沒有她的版本`).toBeTruthy();
      expect(feifeiLineOk(t!), `${id} 句尾有喵：${t}`).toBe(true);
      expect(t, `${id} 跟球球那句一模一樣`).not.toBe(dialogue.firstMeet[id]);
    }
    expect(storyFor('ninja').firstMeet, '球球那邊原樣不動').toBe(dialogue.firstMeet);
  });

  it('`lineFor` 還在服役：塔主那批共用台詞靠它換口氣', () => {
    expect(lineFor('ninja', '領教了，師父喵。'), '球球那邊一個字都不該動').toBe('領教了，師父喵。');
    expect(lineFor('feifei', '領教了，師父喵。')).toBe('領教了，師父。');
    // 句子中間的喵不該被動到（只有句尾那個是語尾助詞）
    expect(lineFor('feifei', '牠喵了一聲就衝過來了。')).toBe('牠喵了一聲就衝過來了。');
  });

  it('她的結局第二句照打法換、難度 4 以上多一句，跟球球同一套規矩', () => {
    const base = feifeiDialogue.victory.length;
    const plain = victoryLinesFor(['feifei_feizhen'], 1, 'feifei');
    expect(plain.length).toBe(base);
    expect(plain[1]!.text).toBe(dialogue.masterFirstWords.plain);
    // 起手的「退開」也給蜷縮，但那是起手牌、不算她這一路挑的（見 deckLeaning）
    expect(deckLeaning([...FEIFEI_STARTER_DECK]), '她的起手牌組也不該被判成任何一派').toBe('plain');
    const blockDeck = [...FEIFEI_STARTER_DECK, ...Array<string>(8).fill('feifei_tieqiang')];
    expect(deckLeaning(blockDeck, 'feifei')).toBe('block');
    const lean = victoryLinesFor(blockDeck, 5, 'feifei');
    expect(lean.length).toBe(base + 2);          // 個人化旁白 ＋ 難度 4 以上那句
    expect(lean[2]!.speaker).toBe('旁白');
    expect(lean[lean.length - 1]!.text).toBe(feifeiDialogue.hardModeEpilogue);
    expect(lean[lean.length - 1]!.text).not.toBe(dialogue.hardModeEpilogue);
  });

  /*
   * 使用者 2026-09-14 裁定：她沒有隱身流，第二派換成毒流。
   * 裁定不靠「她沒有隱身牌」撐（2026-09-14 深夜「後退閃躲」已改成獲得隱身）：她的第二派就是毒，
   * 而 `victoryNarration` 沒有 stealth 鍵，改回去那句旁白會靜靜消失。
   */
  it('她的第二派是毒流：下毒的牌拿得多，結局那句旁白講毒；師父沿用「深藏不露」', () => {
    const poisonDeck = [...FEIFEI_STARTER_DECK, 'feifei_qianzhen', 'feifei_qianzhen', 'feifei_yudu', 'feifei_yudu', 'feifei_tianzhen', 'feifei_tianzhen', 'feifei_yizhen'];
    expect(deckLeaning(poisonDeck, 'feifei')).toBe('poison');
    const lines = victoryLinesFor(poisonDeck, 1, 'feifei');
    expect(lines[1]!.text).toBe(dialogue.masterFirstWords.poison);
    expect(lines[2]!.text).toBe(feifeiDialogue.victoryNarration.poison);
    expect(feifeiDialogue.victoryNarration.stealth, '她那份不再有隱身流那句').toBeUndefined();
  });

  it('球球照舊：隱身牌多還是隱身流，毒不算一派', () => {
    const stealthDeck = [...STARTER_DECK, ...Array<string>(6).fill('yinshen')];
    expect(deckLeaning(stealthDeck)).toBe('stealth');
    expect(deckLeaning(stealthDeck, 'ninja')).toBe('stealth');
    const poisonDeck = [...STARTER_DECK, 'feifei_qianzhen', 'feifei_qianzhen', 'feifei_yudu', 'feifei_yudu', 'feifei_tianzhen', 'feifei_tianzhen'];
    expect(deckLeaning(poisonDeck, 'ninja'), '球球不會被判成毒流').not.toBe('poison');
  });
});
