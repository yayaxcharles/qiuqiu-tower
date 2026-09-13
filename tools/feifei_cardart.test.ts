import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { _setManifestForTest, cardArtKey, setLocalHero } from '../src/ui/assets';
import { cards } from '../src/content/cards';

/**
 * 菲菲的牌面圖涵蓋率（2026-09-12）。
 *
 * 使用者要的是「牌完全分家」：同樣的效果、她自己的圖。`cardArtKey` 沒有她的就
 * **靜靜退回球球那張**——這個退路是對的（生圖要好幾個小時，中途不能讓遊戲開天窗），
 * 但也表示「生完了沒」從畫面上看不出來，只能一張一張翻。
 *
 * 兩條把關：
 *   1. 她看得到的每一張都要解得出圖（不能是破圖）——這條是硬的。
 *   2. 涵蓋率印出來，而且**不准倒退**：`FLOOR` 是目前進度，生圖補進來就往上調。
 *      寫成下限而不是「必須 100%」，是因為圖還在生，釘死會讓整套測試一直紅。
 */
const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8')) as {
  cards: Record<string, string>; sprites: Record<string, string>;
  monsters: Record<string, string>; icons: Record<string, string>;
  bg: Record<string, string>; review: string[];
};
_setManifestForTest(manifest);

/** 目前生到哪。生圖補進來就往上調，**只准往上**（2026-09-12 14:35 是 46） */
const FLOOR = 46;

describe('菲菲的牌面圖', () => {
  /*
   * **`hidden` 的牌不算**（2026-09-13）：那是「牌面圖還沒生，先不進任何池子」的暫存旗標，
   * 玩家根本抽不到，所以它沒有圖是正確狀態，不是破圖。
   * 不排掉的話，每次新加一批待圖的牌這條就會紅，而紅的原因跟她無關——
   * 下一個人會學會忽略它（`art_rules.py` 第九個雷）。
   */
  const hers = cards.filter((c) => (!c.hero || c.hero === 'feifei') && !c.hidden);

  it('她看得到的每一張都解得出圖', () => {
    setLocalHero('feifei');
    const broken = hers.filter((c) => manifest.cards[cardArtKey(c.art)] === undefined)
      .map((c) => `${c.name}（${c.id}）→ ${c.art}`);
    expect(broken, `\n  ${broken.join('\n  ')}\n`).toEqual([]);
  });

  it(`用她自己的圖不少於 ${FLOOR} 張`, () => {
    setLocalHero('feifei');
    const own = hers.filter((c) => cardArtKey(c.art).includes('feifei_'));
    // eslint-disable-next-line no-console
    console.log(`  她自己的牌面 ${own.length}/${hers.length}　還在用球球的 ${hers.length - own.length} 張`);
    expect(own.length, '倒退了——是不是有圖被刪掉或改名？').toBeGreaterThanOrEqual(FLOOR);
  });

  it('球球看到的還是原本那張', () => {
    setLocalHero('ninja');
    for (const c of cards.slice(0, 40)) expect(cardArtKey(c.art)).toBe(c.art);
  });
});
