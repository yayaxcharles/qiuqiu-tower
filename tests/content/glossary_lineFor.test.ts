import { describe, expect, it } from 'vitest';
import { glossary } from '../../src/content/glossary';
import { eventTextFor, lineFor } from '../../src/content/dialogue';

/**
 * 2026-09-12 使用者實測抓到的兩個「換角色沒換乾淨」（都不是菲菲專屬，球球那邊也看得到）。
 */
describe('系統說明不指名角色', () => {
  it('詞彙表裡不可以出現「球球」', () => {
    const bad = Object.entries(glossary).filter(([, v]) => v.includes('球球')).map(([k]) => k);
    expect(bad, `這幾條還寫著球球：${bad.join('、')}——玩菲菲時會看到說明在講另一隻貓`).toEqual([]);
  });

  it('蜷縮的說明講的是動作不是誰', () => {
    expect(glossary['蜷縮']).toContain('縮成一顆球');
    expect(glossary['蜷縮']).not.toContain('球球');
  });
});

describe('句尾的「喵」要拿乾淨', () => {
  it('喵後面還有收尾引號時也算句尾', () => {
    // 事件文案長這樣：菲菲：「…再決定學哪招喵。」——原本的字元集只有標點沒有 」，整句不匹配
    expect(lineFor('feifei', '球球：「師父的字好醜喵。」')).toBe('球球：「師父的字好醜。」');
    expect(lineFor('feifei', '他說「快走喵！」')).toBe('他說「快走！」');
    expect(lineFor('feifei', '好了喵。')).toBe('好了。');
    expect(lineFor('feifei', '好了喵')).toBe('好了');
  });

  it('句子中間的喵不動（那是別的字）', () => {
    expect(lineFor('feifei', '喵喵叫個不停')).toBe('喵喵叫個不停');
  });

  it('球球那邊一個字都沒改', () => {
    for (const t of ['球球：「師父的字好醜喵。」', '好了喵。', '喵喵叫個不停']) {
      expect(lineFor('ninja', t)).toBe(t);
      expect(lineFor(undefined, t)).toBe(t);
    }
  });

  it('事件文案：名字換掉、喵也拿掉', () => {
    expect(eventTextFor('feifei', '球球攤開秘笈。球球：「學哪招喵。」'))
      .toBe('菲菲攤開秘笈。菲菲：「學哪招。」');
  });
});
