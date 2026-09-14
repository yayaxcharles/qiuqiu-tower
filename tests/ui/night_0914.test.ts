import { beforeEach, describe, expect, it } from 'vitest';
import { newRun } from '../../src/engine/run';
import { loadRun, saveRun, setStore } from '../../src/engine/save';
import { App, type ScreenName } from '../../src/ui/app';
import { actClearSlides, endingSlides, prologueSlides } from '../../src/ui/storyslides';
import { storyFor, victoryLinesFor } from '../../src/content/dialogue';
import { cardById, cards, inHeroCollection, starterDeckFor } from '../../src/content/cards';
import { describeCard } from '../../src/ui/cardtext';

/*
 * 2026-09-14 夜間稽核（今天的提交＋菲菲＋除錯模式）抓到、而且測試抓得到的那幾條。
 * 每一條都照「把修正改回去要紅」寫。
 */

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}
beforeEach(() => { setStore(memStore()); });

describe('高-1：除錯模式跳進畫面開的臨時局，不可以蓋掉真正的存檔', () => {
  it('臨時局照常按「打盹／繼續／離開」（都走 backToMap），存檔不變、回除錯頁', () => {
    const real = newRun('my-real-run', 3, 'feifei');
    real.floor = 23;
    saveRun(real);

    // 照 debug.ts 跳進畫面的步驟：臨時局、標沙盒
    const app = Object.create(App.prototype) as App;
    const shown: ScreenName[] = [];
    app.show = (name: ScreenName): void => { shown.push(name); };
    const temp = newRun('debug', 1, 'feifei');
    temp.act = 2;
    app.sandbox = true;
    app.run = temp;

    app.backToMap();
    const loaded = loadRun();
    expect(loaded?.seed, '臨時局把真正的存檔蓋掉了').toBe('my-real-run');
    expect(loaded?.floor).toBe(23);
    expect(shown, '沙盒收尾要回除錯頁，不是地圖').toEqual(['debug']);
    expect(app.sandbox).toBe(false);
    expect(app.run).toBeNull();
  });

  it('不是沙盒的一般局照舊存檔（不能為了擋臨時局把正常存檔也擋掉）', () => {
    const app = Object.create(App.prototype) as App;
    app.show = (): void => {};
    app.run = newRun('normal-save', 1, 'ninja');
    app.backToMap();
    expect(loadRun()?.seed).toBe('normal-save');
  });
});

describe('劇情幻燈片：遊戲與除錯頁同一份切法，一句都不能掉', () => {
  const count = (slides: { lines: unknown[] }[]): number => slides.reduce((s, x) => s + x.lines.length, 0);

  for (const hero of ['ninja', 'feifei'] as const) {
    it(`${hero}：序章每一句都配到圖上（球球第五句從 9/12 起就沒演過）`, () => {
      expect(count(prologueSlides(hero))).toBe(storyFor(hero).prologue.length);
    });
    it(`${hero}：兩關過關每一句都配到圖上`, () => {
      expect(count(actClearSlides(hero, 1))).toBe(storyFor(hero).actClear1.length);
      expect(count(actClearSlides(hero, 2))).toBe(storyFor(hero).actClear2.length);
    });
    it(`${hero}：結局兩張的台詞加起來就是整段結局`, () => {
      const deck = [...starterDeckFor(hero)];
      expect(count(endingSlides(hero, deck, 4))).toBe(victoryLinesFor(deck, 4, hero).length);
    });
  }
});

describe('中-2：圖鑑切到菲菲，起手區不可以混進球球的貓抓與淡定', () => {
  it('菲菲的起手區剛好是她起手十張裡的牌，球球的也一樣', () => {
    for (const hero of ['ninja', 'feifei'] as const) {
      const shown = cards.filter((c) => c.pool === '起手' && inHeroCollection(c, hero)).map((c) => c.id).sort();
      expect(shown, `${hero} 的起手區`).toEqual([...new Set(starterDeckFor(hero))].sort());
    }
  });
  it('共用的忍術牌兩個人都看得到（不能為了起手區把一般規則弄壞）', () => {
    const shared = cards.find((c) => c.pool === '忍術' && !c.hero)!;
    expect(inHeroCollection(shared, 'feifei')).toBe(true);
    expect(inHeroCollection(shared, 'ninja')).toBe(true);
  });
});

describe('中-3：見血封喉升級版的牌面寫成人話', () => {
  it('升級版：「造成目標中毒層數兩倍的傷害」，不是「層數2 倍」', () => {
    const def = cardById['feifei_jianxue']!;
    const up = describeCard(def, true);
    expect(up).toContain('造成目標中毒層數兩倍的傷害');
    expect(up).not.toMatch(/層數\d/);
    expect(describeCard(def, false)).toContain('造成等同目標中毒層數的傷害');
  });
});
