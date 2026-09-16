import { describe, expect, it } from 'vitest';
import { defeatLastWord, storyFor } from '../../src/content/dialogue';

/**
 * 落敗結算畫面顯示的那句話（總稽核 丙 低-18）。
 *
 * 落敗那一段最後一張已經是「醒來在村裡、傷口換了新繃帶」，結算畫面接在它之後；
 * 本來挑段落裡的第一句，於是菲菲看到的是倒下當下的「還沒……找到他們……」，時間倒回去了。
 */
describe('落敗結算的最後一句', () => {
  for (const hero of ['ninja', 'feifei'] as const) {
    it(`${hero}：挑的是主角自己講的最後一句，不是第一句`, () => {
      const mine = storyFor(hero).defeat.filter((l) => l.speaker === '球球' || l.speaker === '菲菲');
      expect(mine.length, '落敗段落至少要有一句主角自己講的').toBeGreaterThan(0);
      expect(defeatLastWord(hero)).toBe(mine[mine.length - 1]!.text);
    });
  }

  it('菲菲顯示的是醒來以後那句，不是倒下當下那句', () => {
    expect(defeatLastWord('feifei')).toBe('傷口好了，我就回去。');
    expect(defeatLastWord('feifei')).not.toBe('還沒……找到他們……');
  });

  it('沒給角色時當球球，句子不是空的', () => {
    expect(defeatLastWord(undefined)).toBe(defeatLastWord('ninja'));
    expect(defeatLastWord(undefined).length).toBeGreaterThan(0);
  });
});
