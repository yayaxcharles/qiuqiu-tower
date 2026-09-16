import { afterEach, describe, expect, it } from 'vitest';
import { dialogue, eventTextFor, firstMeetLine, setCoopStory, storyFor } from '../../src/content/dialogue';
import { events } from '../../src/content/events';

/**
 * 連線敘事的三張改口表本來寫死「只有兩個角色」（2026-09-17 加噹噹時抓到）。
 *
 * 原本外層只有「我是誰」，因為那時候「對方」不必寫也只可能是另外那一位。
 * 加了第三隻之後那個假設就不成立：球球跟噹噹一起爬會讀到
 *「身形跟師妹一模一樣」這種指名道姓的句子，而師妹根本不在場。
 * 這種錯不報錯、測試也照樣綠，只有玩家看得出來——所以要一條專門盯它的。
 */
afterEach(() => setCoopStory(null));

describe('三隻貓的連線敘事不會叫錯人', () => {
  it('每一組搭檔各有各的改口表，不會共用', () => {
    const line = dialogue.hardModeEpilogue;
    setCoopStory({ partner: 'feifei', mirror: 'ninja' });
    const withFeifei = storyFor('ninja').hardModeEpilogue;
    setCoopStory({ partner: 'dangdang', mirror: 'ninja' });
    const withDangdang = storyFor('ninja').hardModeEpilogue;
    expect(withFeifei, '跟菲菲一起時沒有改口').not.toBe(line);
    expect(withDangdang, '跟噹噹一起時沒有改口').not.toBe(line);
    expect(withDangdang, '兩組搭檔讀到同一句＝又共用同一張表了').not.toBe(withFeifei);
    expect(withDangdang).toContain('噹噹');
  });

  it('沒寫改口的那一句照舊，不會被別組的蓋掉', () => {
    // 她跟噹噹一起時「師兄，你到底在哪裡？」要維持原樣——師兄這一局真的不在場，那句問得合理；
    // 跟球球一起才換成「你也聽見了吧」
    const orig = '師父，您再撐一下……師兄，你到底在哪裡？';
    setCoopStory({ partner: 'dangdang', mirror: 'feifei' });
    expect(storyFor('feifei').actClear2.map((l) => l.text)).toContain(orig);
    setCoopStory({ partner: 'ninja', mirror: 'feifei' });
    expect(storyFor('feifei').actClear2.map((l) => l.text)).not.toContain(orig);
  });

  it('鏡子照的是誰，第一次看到牠就講誰', () => {
    setCoopStory({ partner: 'dangdang', mirror: 'ninja' });
    expect(firstMeetLine('dangdang', 'mirror_qiuqiu')).toContain('球球');
    setCoopStory({ partner: 'dangdang', mirror: 'feifei' });
    expect(firstMeetLine('dangdang', 'mirror_qiuqiu')).toContain('菲菲');
    // 沒有對應句子時退回自己那句「鏡子裡的我」——講錯人比講得不精準糟
    setCoopStory({ partner: 'ninja', mirror: 'dangdang' });
    expect(firstMeetLine('ninja', 'mirror_qiuqiu')).toBe(storyFor('ninja').firstMeet['mirror_qiuqiu']);
    expect(firstMeetLine('ninja', 'mirror_qiuqiu')).not.toContain('師妹');
  });

  it('鏡子走廊的事件文案同理：照的是噹噹就不會寫成師妹', () => {
    const hall = events.find((e) => e.id === 'mirror_hall')!;
    setCoopStory({ partner: 'dangdang', mirror: 'dangdang' });
    expect(eventTextFor('ninja', hall.text), '鏡子照的是噹噹，文案卻寫師妹').not.toContain('師妹');
    // 照的是菲菲時，原本那句照舊
    setCoopStory({ partner: 'feifei', mirror: 'feifei' });
    expect(eventTextFor('ninja', hall.text)).toContain('師妹');
  });

  it('一個人玩的時候三張表完全不參與', () => {
    setCoopStory(null);
    for (const hero of ['ninja', 'feifei', 'dangdang']) {
      expect(storyFor(hero).prologue.length, hero).toBeGreaterThan(0);
    }
    expect(storyFor('ninja').hardModeEpilogue).toBe(dialogue.hardModeEpilogue);
    expect(firstMeetLine('ninja', 'mirror_qiuqiu')).toBe(storyFor('ninja').firstMeet['mirror_qiuqiu']);
  });
});
