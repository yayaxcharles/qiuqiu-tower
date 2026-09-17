import { describe, expect, it } from 'vitest';
import {
  dangdangDialogue, deckLeaning, defeatLastWord, dialogue, feifeiLineOk,
  firstMeetLine, storyFor, victoryLinesFor,
} from '../../src/content/dialogue';
import { prologueSlides } from '../../src/ui/storyslides';
import { enemyById } from '../../src/content/enemies';

/**
 * 噹噹的劇本（2026-09-17 回填）。
 *
 * 這一份盯的是「他真的有自己的一份」——不是共用球球那份、不是只把句尾的「喵」拿掉。
 * 這個專案踩過同型的問題兩次（菲菲的 111 句初遇、塔主那 37 句），所以每一條都驗到底。
 */
describe('噹噹的劇本', () => {
  it('storyFor 回的是他自己的，不是球球那份', () => {
    const his = storyFor('dangdang');
    expect(his.prologue, '序章跟球球的一樣＝根本沒接上').not.toEqual(dialogue.prologue);
    expect(his.battleStart).toEqual(dangdangDialogue.battleStart);
    expect(his.firstMeet).toBe(dialogue.firstMeetDangdang);
  });

  it('句尾不加「喵」——那是球球的招牌', () => {
    const story = storyFor('dangdang');
    const groups = [story.battleStart, story.battleWin, story.hungry, story.lowHp,
      story.chestLines, story.restNapLines, story.restSharpenLines, story.reviveLines,
      Object.values(story.firstMeet)];
    for (const g of groups) for (const line of g) expect(feifeiLineOk(line), line).toBe(true);
    // 劇情裡球球本人講的話照樣有「喵」，只驗他自己那幾句
    for (const l of [...story.prologue, ...story.actClear1, ...story.actClear2,
      ...story.defeat, ...story.victory]) {
      if (l.speaker === '噹噹') expect(feifeiLineOk(l.text), l.text).toBe(true);
    }
  });

  it('111 句初遇：每一句都對得到真的魔物，而且球球有的他都有', () => {
    const his = dialogue.firstMeetDangdang;
    expect(Object.keys(his).length).toBe(111);
    for (const id of Object.keys(his)) expect(enemyById[id], `${id} 不是真的魔物`).toBeTruthy();
    for (const id of Object.keys(dialogue.firstMeet)) {
      expect(his[id], `${id} 少了他的版本，會掉回球球那句（句尾有喵）`).toBeTruthy();
    }
    expect(firstMeetLine('dangdang', 'wild_boar')).toBe(his['wild_boar']);
  });

  it('序章十八句分成四段，每一張圖都有話講', () => {
    const slides = prologueSlides('dangdang');
    expect(slides.length).toBe(4);
    for (const s of slides) expect(s.lines.length, `${s.img} 這張圖沒有台詞`).toBeGreaterThan(0);
    // 全部十八句都要演到，一句都不能掉
    expect(slides.reduce((n, s) => n + s.lines.length, 0)).toBe(storyFor('dangdang').prologue.length);
    // 球球與菲菲照舊：他們的序章沒標切點，走的還是「一張圖一句、最後一張吃剩下的」
    for (const hero of ['ninja', 'feifei']) {
      const old = prologueSlides(hero);
      expect(old.length).toBe(4);
      expect(old[0]!.lines.length, `${hero} 的序章第一張變了`).toBe(1);
    }
  });

  it('結局：反彈流、蜷縮流、沒有明顯傾向各有各的旁白', () => {
    // 迴力鏢 2026-09-17 被橋接牌換掉了，改用順勢頂上（它也是反彈流的牌）
    // 起手那十張不算（`deckLeaning` 會排掉），所以這裡一張起手牌都不能放——
    // 回敬是起手牌，2026-09-17 換成順勢與以身作盾
    const thorns = ['dangdang_shunshi', 'dangdang_yishenzuodun', 'dangdang_tiaoxin',
      'dangdang_huxin', 'dangdang_qianjin', 'dangdang_yishang'];
    expect(deckLeaning(thorns, 'dangdang')).toBe('thorns');
    const blocky = ['dangdang_huben', 'dangdang_yingkang', 'dangdang_wenzhu', 'dangdang_tiesha', 'dangdang_jiapan'];
    expect(deckLeaning(blocky, 'dangdang')).toBe('block');
    // 起手那十張不算：整副只有起手牌的話不該被判成蜷縮流
    expect(deckLeaning(['dangdang_zhengquan', 'dangdang_jiapan', 'dangdang_jiapan'], 'dangdang')).toBe('plain');

    const texts = (ids: string[]) => victoryLinesFor(ids, 1, 'dangdang').map((l) => l.text);
    expect(texts(thorns)).toContain(dangdangDialogue.victoryNarration.thorns);
    expect(texts(blocky)).toContain(dangdangDialogue.victoryNarration.block);
    // 沒有明顯傾向本來一律不插旁白，他那份稿子連這一格都寫了
    expect(texts(['sanjo'])).toContain(dangdangDialogue.victoryNarration.plain);
  });

  it('球球與菲菲的結局旁白沒有被「plain 也能有一句」牽動', () => {
    for (const hero of ['ninja', 'feifei']) {
      const lines = victoryLinesFor(['sanjo'], 1, hero);
      expect(lines[1]!.text, `${hero} 的第二句該是師父那句`).toBe(dialogue.masterFirstWords.plain);
      expect(lines[2]!.speaker, `${hero} 沒有牌組傾向卻多插了一句旁白`).not.toBe('旁白');
    }
  });

  it('落敗結算畫面挑的是他自己最後講的那一句', () => {
    expect(defeatLastWord('dangdang')).toBe('有他們的消息，就叫我。');
  });
});
