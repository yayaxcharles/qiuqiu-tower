import { afterEach, describe, expect, it } from 'vitest';
import {
  coopBossLines, defeatLastWord, dialogue, feifeiDialogue, feifeiLineOk, hasCoopScene, qiuqiuLineOk,
  setCoopStory, storyFor, victoryLinesFor, type DialogueLine,
} from '../../src/content/dialogue';

/**
 * 球球＋菲菲的共用場景（2026-09-22 連線盤點 問題 6）。
 *
 * 原本這一組沒有整段場景，兩人各播各的單人序章：他那邊「沒聽見師妹在身後叫他」、
 * 她那邊「三天了，師兄也沒回來」——兩個人明明一起從 1F 進塔。
 */
afterEach(() => setCoopStory(null));

const asNinja = () => { setCoopStory({ partner: 'feifei', mirror: 'ninja' }); return storyFor('ninja'); };
const asFeifei = () => { setCoopStory({ partner: 'ninja', mirror: 'ninja' }); return storyFor('feifei'); };
const PARTS = ['prologue', 'actClear1', 'actClear2', 'victory', 'defeat'] as const;
const bossAll = (hero: string): DialogueLine[] => (['intro', 'phase2', 'phase3'] as const).flatMap((st) => coopBossLines('tower_master', st, hero) ?? []);
const MASTER_TITLES = new Set(['難逢敵手。', '退隱江湖。', '走火入魔。', '深藏不露。', '承讓。', '在下不才。']);

describe('師兄妹一起爬', () => {
  it('兩台機器演的是同一段戲（兩邊都認得這一組）', () => {
    const a = asNinja(); const aBoss = bossAll('ninja');
    expect(hasCoopScene('ninja')).toBe(true);
    const b = asFeifei(); const bBoss = bossAll('feifei');
    expect(hasCoopScene('feifei')).toBe(true);
    for (const k of PARTS) expect(a[k].map((l) => l.text), k).toEqual(b[k].map((l) => l.text));
    expect(aBoss.map((l) => l.text)).toEqual(bBoss.map((l) => l.text));
  });

  it('序章不再互相矛盾：兩人當晚一起進塔，不是一個沒聽見、一個等了三天', () => {
    const pro = asFeifei().prologue.map((l) => l.text).join('');
    expect(pro).not.toMatch(/三天|沒聽見師妹在身後叫他|師兄也沒回來/);
    const who = new Set(asFeifei().prologue.map((l) => l.speaker));
    expect(who.has('球球') && who.has('菲菲'), '兩位都要開口').toBe(true);
  });

  it('每一段兩位都有台詞（序章、兩段過關、結局、落敗、師父開場）', () => {
    const s = asNinja();
    for (const k of PARTS) {
      const who = new Set(s[k].map((l) => l.speaker));
      expect(who.has('球球') && who.has('菲菲'), k).toBe(true);
    }
    const intro = coopBossLines('tower_master', 'intro', 'ninja')!;
    expect(new Set(intro.map((l) => l.speaker))).toEqual(new Set(['旁白', '球球', '菲菲', '塔主']));
    expect(intro.map((l) => l.text).join(''), '推門見到大俠貓那一段接在開場最前面').toContain('門後的大俠貓');
  });

  it('口氣守得住：他每句都有喵、她一句都沒有、她叫他「師兄」、他叫她「師妹」', () => {
    const all = [...PARTS.flatMap((k) => asNinja()[k]), ...bossAll('ninja')];
    const his = all.filter((l) => l.speaker === '球球');
    const hers = all.filter((l) => l.speaker === '菲菲');
    expect(his.length).toBeGreaterThan(8);
    expect(hers.length).toBeGreaterThan(8);
    for (const l of his) expect(qiuqiuLineOk(l.text), l.text).toBe(true);
    for (const l of hers) expect(feifeiLineOk(l.text), l.text).toBe(true);
    expect(hers.some((l) => l.text.includes('師兄'))).toBe(true);
    expect(his.some((l) => l.text.includes('師妹'))).toBe(true);
  });

  it('師父只講大俠貼圖標題；結局第二句照打法換成師父醒來的第一句', () => {
    const all = [...PARTS.flatMap((k) => asNinja()[k]), ...bossAll('ninja')];
    // 結局裡醒來那句的說話者是「大俠貓」（2026-09-25），一起算進來，不然結局那句會漏檢
    const masterLines = all.filter((x) => x.speaker === '塔主' || x.speaker === '大俠貓');
    expect(masterLines.some((l) => l.speaker === '大俠貓'), '結局醒來那句沒被檢查到').toBe(true);
    for (const l of masterLines) expect(MASTER_TITLES.has(l.text), l.text).toBe(true);
    setCoopStory({ partner: 'feifei', mirror: 'ninja' });
    const vic = victoryLinesFor([], 1, 'ninja');
    // 2026-09-25：醒來之後的說話者改叫「大俠貓」（劇情草稿第 3 節），開場、換階段那些還沒醒的仍是「塔主」
    expect(vic[1]).toEqual({ speaker: '大俠貓', text: dialogue.masterFirstWords.plain });
    expect(vic.filter((l) => l.slideBreak).length, '相擁那張的切點').toBe(1);
  });

  it('結算畫面的遺言：兩位各拿到自己講的最後一句', () => {
    asFeifei();
    expect(defeatLastWord('feifei')).toBe('傷口好了，我們就再上去。');
    asNinja();
    expect(defeatLastWord('ninja')).toBe('師父呢？他回來了沒有喵？');
  });

  it('使用者看過的那幾句混搭改句原樣收進場景', () => {
    const s = asFeifei();
    const text = PARTS.flatMap((k) => s[k]).map((l) => l.text);
    for (const t of ['師兄，你的頭巾又勾破了……回去我再幫你補。', '師父，您再撐一下……師兄，你也聽見了吧？',
      '師父，這又不是切磋……您剛才連我都不認得了。我跟師兄喊了您一路呢。', '還沒……把師父帶回來……']) {
      expect(text, t).toContain(t);
    }
  });

  it('一個人玩完全不受影響', () => {
    setCoopStory(null);
    expect(storyFor('feifei').prologue).toBe(feifeiDialogue.prologue);
    expect(storyFor('ninja').prologue).toBe(dialogue.prologue);
    expect(coopBossLines('tower_master', 'intro', 'ninja')).toBeNull();
  });
});
