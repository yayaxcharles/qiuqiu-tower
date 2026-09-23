import { afterEach, describe, expect, it } from 'vitest';
import { coopBossLines, dialogue, eventTextFor, firstMeetLine, setCoopStory, storyFor } from '../../src/content/dialogue';
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
    // 球球＋菲菲這一組**沒有整段場景**，走的還是「換掉某幾句」那條路。
    // 她跟球球一起時，第二關那句換成「你也聽見了吧」（師兄就在旁邊）
    const orig = '師父，您再撐一下……師兄，你到底在哪裡？';
    setCoopStory(null);
    expect(storyFor('feifei').actClear2.map((l) => l.text), '一個人玩時是原句').toContain(orig);
    setCoopStory({ partner: 'ninja', mirror: 'feifei' });
    expect(storyFor('feifei').actClear2.map((l) => l.text)).not.toContain(orig);
  });

  it('有整段場景的搭檔，兩個人看到的是同一段戲', () => {
    /*
     * 稿子把噹噹的連線寫成**兩個人共用的一整段場景**（兩位都有台詞、互相接話），
     * 不是「把我的某幾句換掉」。所以這一組的兩台機器要演同一段。
     */
    setCoopStory({ partner: 'dangdang', mirror: 'ninja' });
    const asNinja = storyFor('ninja').prologue.map((l) => l.text);
    setCoopStory({ partner: 'ninja', mirror: 'ninja' });
    const asDangdang = storyFor('dangdang').prologue.map((l) => l.text);
    expect(asNinja, '兩邊演的不是同一段').toEqual(asDangdang);
    expect(asNinja.join(''), '這一組的序章應該是「村口的門剛關上」那一段').toContain('球球往魔塔跑');
    // 兩位都有台詞才叫共用場景
    setCoopStory({ partner: 'dangdang', mirror: 'ninja' });
    const who = new Set(storyFor('ninja').prologue.map((l) => l.speaker));
    expect(who.has('球球') && who.has('噹噹'), '共用場景裡兩位都要開口').toBe(true);
  });

  it('六組搭檔都有整段場景；一個人玩照舊走單人劇本', () => {
    // 球球＋菲菲 2026-09-22 補上之後，四隻貓兩兩配對的六組都有共用場景（原本這條拿球球＋菲菲當「沒寫的」那一組）
    setCoopStory(null);
    const solo = storyFor('ninja').prologue.map((l) => l.text);
    expect(solo.join(''), '單人序章').toContain('沒聽見師妹在身後叫他');
    const heroes = ['ninja', 'feifei', 'dangdang', 'fengfeng'];
    const own = Object.fromEntries(heroes.map((h) => [h, storyFor(h).prologue.map((l) => l.text)]));
    for (const a of heroes) for (const b of heroes) {
      if (a === b) continue;
      setCoopStory({ partner: b, mirror: a });
      expect(storyFor(a).prologue.map((l) => l.text), `${a}+${b} 還在播單人序章`).not.toEqual(own[a]);
    }
  });

  it('鏡子照的是誰，第一次看到牠就講誰', () => {
    setCoopStory({ partner: 'dangdang', mirror: 'ninja' });
    expect(firstMeetLine('dangdang', 'mirror_qiuqiu')).toContain('球球');
    setCoopStory({ partner: 'dangdang', mirror: 'feifei' });
    expect(firstMeetLine('dangdang', 'mirror_qiuqiu')).toContain('菲菲');
    // 2026-09-23 十二組補齊：球球看到的鏡中噹噹也講噹噹了（原本這一組沒寫、退回「鏡子裡的我」）
    setCoopStory({ partner: 'ninja', mirror: 'dangdang' });
    expect(firstMeetLine('ninja', 'mirror_qiuqiu')).toContain('噹噹');
    expect(firstMeetLine('ninja', 'mirror_qiuqiu')).not.toContain('師妹');
    // 沒有對應句子時（表裡沒有的角色）仍退回自己那句「鏡子裡的我」——講錯人比講得不精準糟
    setCoopStory({ partner: 'ninja', mirror: 'nobody' });
    expect(firstMeetLine('ninja', 'mirror_qiuqiu')).toBe(storyFor('ninja').firstMeet['mirror_qiuqiu']);
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

/**
 * 搭檔一起打大俠貓時的整組接話（稿子 DD-CB-01～20）。
 *
 * 這一組**不能再過換口氣那一層**：連線時「球球：……喵」是球球本人在講，
 * 不是「我」講的話。過了的話他那句會被改成我的口氣、木牌還會寫我的名字。
 */
describe('搭檔一起打大俠貓', () => {
  it('只有大俠貓有專屬接話，其他關主照舊', () => {
    setCoopStory({ partner: 'dangdang', mirror: 'ninja' });
    expect(coopBossLines('tower_master', 'intro', 'ninja')).toBeTruthy();
    expect(coopBossLines('nekomata', 'intro', 'ninja'), '貓又婆婆不該有專屬版').toBeNull();
  });

  it('一個人玩、或沒寫過的搭檔，一律回 null（照舊走共用那份）', () => {
    setCoopStory(null);
    expect(coopBossLines('tower_master', 'intro', 'ninja')).toBeNull();
    setCoopStory({ partner: 'feifei', mirror: 'ninja' });
    expect(coopBossLines('tower_master', 'intro', 'ninja'), '球球＋菲菲 2026-09-22 補上了').toBeTruthy();
    setCoopStory({ partner: 'ninja', mirror: 'ninja' });
    expect(coopBossLines('tower_master', 'intro', 'ninja'), '兩位同角色不算搭檔').toBeNull();
  });

  it('兩位都有台詞，而且兩台機器拿到同一組', () => {
    for (const stage of ['intro', 'phase2', 'phase3'] as const) {
      setCoopStory({ partner: 'dangdang', mirror: 'ninja' });
      const a = coopBossLines('tower_master', stage, 'ninja')!;
      setCoopStory({ partner: 'ninja', mirror: 'ninja' });
      const b = coopBossLines('tower_master', stage, 'dangdang')!;
      expect(a.map((l) => l.text), `${stage} 兩邊拿到的不一樣`).toEqual(b.map((l) => l.text));
      const who = new Set(a.map((l) => l.speaker));
      expect(who.has('噹噹'), `${stage} 噹噹沒開口`).toBe(true);
    }
  });

  it('球球那幾句原封不動留著「喵」——那是他本人在講', () => {
    setCoopStory({ partner: 'dangdang', mirror: 'ninja' });
    const all = (['intro', 'phase2', 'phase3'] as const)
      .flatMap((st) => coopBossLines('tower_master', st, 'ninja')!)
      .filter((l) => l.speaker === '球球');
    expect(all.length).toBeGreaterThan(2);
    expect(all.every((l) => l.text.includes('喵')), '球球的句子被拿掉喵了').toBe(true);
  });
});
