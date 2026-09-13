import { describe, expect, it } from 'vitest';
import { cards } from '../../src/content/cards';
import { pickable } from '../../src/engine/hero';

/*
 * 連線牌（2026-09-11）：九張只有雙人局才抽得到的牌。
 *
 * 這三件事一起盯：**張數**（漏了一張不會有人發現）、**都要有升級效果**
 *（使用者明示「升級效果也得規畫上去，邏輯跟之前的牌都一樣」）、
 * 以及**單機絕對抽不到**——後者是最要緊的，抽到了就等於單機多出九張
 * 效果全部落空的廢牌（它們的作用對象是「同伴」）。
 */
describe('連線牌', () => {
  /*
   * 2026-09-13 加了第一批支援牌六張（交辦單那 20 張的 A 批），所以總數從 9 變 15。
   * 新的六張帶著 `hidden`＝牌面圖還沒生，**先不進任何池子**，所以
   * 「兩個人抽得到」那條只對已經有圖的生效——這是刻意的退路，不是壞掉。
   */
  it('十五張、都可以升級、單機一律抽不到', () => {
    const coop = cards.filter((c) => c.coop);
    expect(coop.length).toBe(15);
    for (const c of coop) {
      expect(c.upgrade, `${c.name} 要有升級效果`).toBeTruthy();
      expect(pickable(c, c.hero ?? 'ninja', 1), `${c.name} 單機不該抽得到`).toBe(false);
    }
  });

  it('有圖的那幾張，兩個人要抽得到', () => {
    const ready = cards.filter((c) => c.coop && !c.hidden);
    expect(ready.length, '一張有圖的連線牌都沒有？').toBeGreaterThanOrEqual(9);
    for (const c of ready) {
      expect(pickable(c, c.hero ?? 'ninja', 2), `${c.name} 兩個人要抽得到`).toBe(true);
    }
  });

  /*
   * **待圖的牌不可以永遠待著**。`hidden` 是個很好用的暫存旗標，也正因為好用，
   * 很容易忘了拿掉——拿掉的時機是「圖生好進 manifest」，而那件事沒有人會提醒你。
   * 這條把「還在等圖的有哪幾張」印出來，數字只准往下。
   */
  it('還在等圖的連線牌，張數只准變少', () => {
    const waiting = cards.filter((c) => c.coop && c.hidden).map((c) => c.name);
    // eslint-disable-next-line no-console
    console.log(`  連線牌還在等圖的 ${waiting.length} 張：${waiting.join('、') || '無'}`);
    expect(waiting.length, '等圖的變多了？新加牌記得排生圖').toBeLessThanOrEqual(6);
  });
});
