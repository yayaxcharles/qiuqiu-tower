import { describe, expect, it } from 'vitest';
import { cardNameFor, cards, inHeroCollection } from '../../src/content/cards';
import { events } from '../../src/content/events';
import { DANGDANG_EVENT_TEXT, eventTextFor } from '../../src/content/dialogue';
import { poolNameFor } from '../../src/ui/compendium';

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

  it('圖鑑的分區標題也照角色換，但 pool 這個鍵一個字都沒變', () => {
    // 標題是給人看的，`pool` 是規則用的鍵（獎勵、罐頭鋪、機率都照它抽），兩件事不可以混
    expect(poolNameFor('忍術', 'dangdang')).toBe('拳腳');
    expect(poolNameFor('忍術', 'ninja')).toBe('忍術');
    expect(poolNameFor('忍術', 'feifei')).toBe('暗器');   // 2026-09-23 主控裁定：比照噹噹、封封改名（原本還寫「忍術」）
    expect(poolNameFor('絕學', 'feifei')).toBe('絕學');
    expect(poolNameFor('絕學', 'dangdang')).toBe('絕學');
    expect(cards.some((c) => c.pool === '忍術')).toBe(true);
    expect(cards.some((c) => (c.pool as string) === '拳腳')).toBe(false);
  });

  it('整句換掉的表，每個鍵都還對得到事件裡的原句（改了球球的字會靜靜失效，所以要盯著）', () => {
    // 抄菲菲那條（`feifei_event_text.test.ts`）。他那份有 121 個鍵，一條守門都沒有：
    // 球球的原句一改，`eventTextFor` 查不到就靜靜退回球球版本，畫面不會錯、測試也不會紅
    const originals = new Set(events.flatMap((e) => [e.text, ...e.choices.flatMap((c) => [c.label, c.result])]));
    for (const k of Object.keys(DANGDANG_EVENT_TEXT)) expect(originals.has(k), k).toBe(true);
  });

  it('他讀到的事件文字裡，他自己學的東西不叫忍術', () => {
    const bad: string[] = [];
    for (const ev of events) {
      if (ev.hero && ev.hero !== 'dangdang') continue;
      // **選項標籤也要收**（審查 2026-09-17 中-1）：`event.ts` 那邊標籤一樣過 `eventTextFor`，
      // 只掃正文與結果的話，「隨機獲得 1 張罕見忍術牌」這種按鈕文字整批漏掉。
      // 菲菲那條對照（`feifei_event_text.test.ts`）本來就收標籤，我抄的時候漏了。
      const texts = [ev.text, ...ev.choices.flatMap((c) => [c.label, c.result])];
      for (const raw of texts) {
        const t = eventTextFor('dangdang', raw);
        // 「忍者頭巾」是小黑貓的裝扮，塔裡本來就都是忍者——那不是在講他
        if (t.includes('忍術')) bad.push(t.slice(0, 40));
      }
    }
    expect(bad).toEqual([]);
  });
});
