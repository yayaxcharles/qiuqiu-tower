import { describe, expect, it } from 'vitest';
import { cardNameFor, cards, inHeroCollection } from '../../src/content/cards';
import { events } from '../../src/content/events';
import { eventTextFor } from '../../src/content/dialogue';

/**
 * 噹噹身上不准出現「忍術」（2026-09-17 使用者：「噹噹的卡牌也得把所有的忍術字眼移除」）。
 *
 * 他不是忍者，是練外家功夫的。拳、掌、踢、爪照用——要擋的只有「忍術」這兩個字
 * 跟指名忍者器械的牌名。守著這條的理由跟菲菲那條一樣：忍術牌有四十幾張，
 * 以後加新牌很容易又帶著前綴進來，而漏掉的那一張看起來就像 bug。
 */
describe('噹噹不是忍者', () => {
  const his = cards.filter((c) => inHeroCollection(c, 'dangdang'));

  it('他拿得到的牌，名字都沒有「忍術」', () => {
    const bad = his.filter((c) => cardNameFor(c, 'dangdang').includes('忍術'));
    expect(bad.map((c) => `${c.id}＝${cardNameFor(c, 'dangdang')}`)).toEqual([]);
  });

  it('也沒有指名忍者器械的牌名', () => {
    // 手裏劍、苦無那些他不帶。鐵蒺藜與卷軸是中土本來就有的東西，不在此列
    const gear = ['手裏劍', '苦無', '忍者', '忍具'];
    const bad = his.filter((c) => gear.some((g) => cardNameFor(c, 'dangdang').includes(g)));
    expect(bad.map((c) => `${c.id}＝${cardNameFor(c, 'dangdang')}`)).toEqual([]);
  });

  it('球球那邊照舊叫忍術（改的是他，不是把全遊戲的忍術拿掉）', () => {
    const luanwu = cards.find((c) => c.id === 'luanwu')!;
    expect(cardNameFor(luanwu, 'ninja')).toBe('忍術·手裏劍亂舞');
    expect(cardNameFor(luanwu, 'dangdang')).toBe('橫掃千軍');
    expect(cardNameFor(luanwu, 'feifei')).toBe('手裏劍亂舞');   // 她丟暗器，只拿掉前綴
  });

  it('他讀到的事件文字裡，他自己學的東西不叫忍術', () => {
    const bad: string[] = [];
    for (const ev of events) {
      if (ev.hero && ev.hero !== 'dangdang') continue;
      const texts = [ev.text, ...ev.choices.map((c) => c.result)];
      for (const raw of texts) {
        const t = eventTextFor('dangdang', raw);
        // 「忍者頭巾」是小黑貓的裝扮，塔裡本來就都是忍者——那不是在講他
        if (t.includes('忍術')) bad.push(t.slice(0, 40));
      }
    }
    expect(bad).toEqual([]);
  });
});
