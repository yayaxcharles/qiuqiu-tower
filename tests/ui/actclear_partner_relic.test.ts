import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newCoopRun, newRun, relicForPartnerOnly, rollActRelics } from '../../src/engine/run';
import SRC from '../../src/ui/screens/actclear.ts?raw';

// `.css?raw` 在 vitest 底下會被 CSS 處理換成空字串（見 node-fs.d.ts），樣式檔照 chest_beam_0923 那樣直接讀
const CSS = readFileSync('src/ui/styles/screens.css', 'utf8');

/**
 * 連線過關三選一：鎖住自己、只有同伴用得到的秘寶要標「同伴才用得到」（主控 2026-09-23 裁定）。
 *
 * 兩人一起挑的清單照「有一位用得到就留」開（`relicOk`），菲菲＋封封的局裡菲菲會看到封封的養氣葫蘆；
 * 畫面不講的話她點下去拿到一件自己用不到的東西。判斷放在引擎的純函式（`relicForPartnerOnly`），
 * 畫面只負責照它掛牌子——測試照這個專案的規矩：純函式測行為、讀原始碼測接線（不用 DOM）。
 */
describe('過關三選一的「同伴才用得到」', () => {
  it('混搭連線：鎖住這一位的標、同伴自己看不標；沒鎖的誰都不標', () => {
    const run = newCoopRun('partner-only', 1, 'feifei', 'fengfeng');
    expect(relicForPartnerOnly(run, 'qi_gourd', 0), '菲菲看封封的養氣葫蘆').toBe(true);
    expect(relicForPartnerOnly(run, 'qi_gourd', 1), '封封看自己的').toBe(false);
    expect(relicForPartnerOnly(run, 'master_hat', 0)).toBe(false);
    expect(relicForPartnerOnly(run, 'master_hat', 1)).toBe(false);
    const dd = newCoopRun('partner-only-dd', 1, 'fengfeng', 'dangdang');
    expect(relicForPartnerOnly(dd, 'iron_weight_belt', 0), '封封看噹噹的秤砣腰帶').toBe(true);
    expect(relicForPartnerOnly(dd, 'iron_weight_belt', 1)).toBe(false);
  });

  it('單機永遠不標（單機的清單本來就把鎖住的濾掉了）', () => {
    const run = newRun('partner-only-solo', 1, 'feifei');
    expect(relicForPartnerOnly(run, 'qi_gourd', 0)).toBe(false);
    for (let i = 0; i < 60; i++) {
      for (const id of rollActRelics(newRun(`partner-only-solo-${i}`, 1, 'feifei'))) expect(relicForPartnerOnly(run, id, 0), id).toBe(false);
    }
  });

  it('混搭局的三選一真的開得出要標的那件（標示不是擺好看的）', () => {
    let seen = false;
    for (let i = 0; i < 400 && !seen; i++) {
      const run = newCoopRun(`partner-only-roll-${i}`, 1, 'feifei', 'fengfeng');
      seen = rollActRelics(run).some((id) => relicForPartnerOnly(run, id, 0));
    }
    expect(seen).toBe(true);
  });

  it('過關畫面照它掛牌子：每一格都問 `relicForPartnerOnly`，寫「同伴才用得到」，樣式有定義', () => {
    const src = SRC.replace(/\r\n/g, '\n');
    expect(src).toContain('relicForPartnerOnly(run, id, seat)');
    expect(src).toContain("el('span', { class: 'pick-tile-note' }, '同伴才用得到')");
    expect(CSS.replace(/\r\n/g, '\n')).toMatch(/\.pick-tile \.pick-tile-note \{[^}]*font-size: 13px/);
  });
});
