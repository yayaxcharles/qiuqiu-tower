import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dialogue, eventTextFor, feifeiDialogue, lineFor, storyFor } from '../../src/content/dialogue';
import { events } from '../../src/content/events';

/**
 * 劇情改寫（GPT 稿）之後，文字跟遊戲打架的幾處（總稽核 2026-09-16 丙）。
 * 句子本身之後還可能再改，這裡只釘「不能再說錯的事」，不釘字面。
 */
describe('劇情跟遊戲不能打架', () => {
  it('第二關的關主打倒後還活著講話（龍貓睡回去、老住持清醒），菲菲過關第一句不能說魔物化成煙', () => {
    expect(feifeiDialogue.actClear2[0]!.text).not.toMatch(/化成煙|化作煙|散成煙/);
  });

  it('31～45F 本來就叫塔頂、44F 是貓窩：貓窩獨白不能說「明天就到塔頂」', () => {
    const all = JSON.stringify(dialogue.restBeforeBossByAct);
    expect(all).not.toContain('明天就到塔頂');
    for (const l of dialogue.restBeforeBossByAct.flat()) {
      const t = typeof l === 'string' ? l : l.text;
      expect(lineFor('feifei', t)).not.toContain('明天就到塔頂');
    }
  });

  it('結算最後一句不說回家：難度 4 以上結局最後一句已經是回村之後的事', () => {
    for (const h of ['ninja', 'feifei']) expect(storyFor(h).victoryTeaser, h).not.toMatch(/回家|回去/);
  });

  it('共用事件換成菲菲的名字之後，不能出現她伸出爪子（她只用針）', () => {
    for (const e of events) {
      if (e.hero) continue;
      for (const t of [e.text, ...e.choices.map((c) => c.result ?? '')]) {
        expect(eventTextFor('feifei', t), e.id).not.toMatch(/菲菲(伸出|亮出)爪子/);
      }
    }
  });

  it('打贏關主不抽一般的打贏吐槽；飯糰吃完的吐槽一場只講一次', () => {
    const src = readFileSync('src/ui/screens/combat.ts', 'utf-8');
    expect(src).toMatch(/if \(cs\.phase === 'won' && !bossWon\) toast\(pick\(storyFor\(my\(\)\.hero\)\.battleWin\)/);
    expect(src).toMatch(/if \(!hungryTold\) \{ hungryTold = true; toast\(pick\(storyFor\(my\(\)\.hero\)\.hungry\)/);
  });
});
