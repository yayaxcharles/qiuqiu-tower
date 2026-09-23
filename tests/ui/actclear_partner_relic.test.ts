import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { relics } from '../../src/content/relics';
import { makeShops, newCoopRun, newRun, openChest, openChestCoop, relicForPartnerOnly, rollActRelics } from '../../src/engine/run';
import ACTCLEAR from '../../src/ui/screens/actclear.ts?raw';
import CHEST from '../../src/ui/screens/chest.ts?raw';
import REWARD from '../../src/ui/screens/reward.ts?raw';

// `.css?raw` 在 vitest 底下會被 CSS 處理換成空字串（見 node-fs.d.ts），樣式檔照 chest_beam_0923 那樣直接讀
const CSS = readFileSync('src/ui/styles/screens.css', 'utf8').replace(/\r\n/g, '\n');

/**
 * 連線時鎖住自己、只有同伴用得到的秘寶要標「同伴才用得到」（主控 2026-09-23 裁定；推前審查 中-1 補到紙箱與戰利品）。
 *
 * 兩人一起挑的清單照「有一位用得到就留」開（`relicOk`），菲菲＋封封的局裡菲菲會看到封封的養氣葫蘆；
 * 畫面不講的話她點下去拿到一件自己用不到的東西。判斷放在引擎的純函式（`relicForPartnerOnly`），
 * 畫面只負責照它掛牌子——測試照這個專案的規矩：純函式測行為、讀原始碼測接線（不用 DOM）。
 */
describe('「同伴才用得到」', () => {
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

  it('混搭局的過關三選一、連線紙箱真的開得出要標的那件（標示不是擺好看的）', () => {
    let act = false; let chest = false;
    for (let i = 0; i < 400 && !(act && chest); i++) {
      const run = newCoopRun(`partner-only-roll-${i}`, 1, 'feifei', 'fengfeng');
      if (rollActRelics(run).some((id) => relicForPartnerOnly(run, id, 0))) act = true;
      if (openChestCoop(run).some((id) => relicForPartnerOnly(run, id, 0))) chest = true;
    }
    expect(act, '過關三選一').toBe(true);
    expect(chest, '連線紙箱（常見池的磨劍石）').toBe(true);
  });

  it('三個讓兩人挑秘寶的畫面都照它掛同一個牌子（過關三選一、連線紙箱、大魔物戰利品二選一）', () => {
    for (const [name, raw] of [['actclear', ACTCLEAR], ['chest', CHEST], ['reward', REWARD]] as const) {
      const src = raw.replace(/\r\n/g, '\n');
      expect(src, name).toContain('relicForPartnerOnly(run, id, seat)');
      expect(src, name).toContain("el('span', { class: 'pick-tile-note' }, '同伴才用得到')");
    }
    // 牌子的樣式不綁在過關方塊底下（紙箱、戰利品的格子也要吃得到）
    expect(CSS).toMatch(/\n\.pick-tile-note \{[^}]*font-size: 13px/);
  });

  /*
   * 其他會給秘寶的地方都**只照那一位**抽，本來就開不出鎖他的，所以不用標：
   * 罐頭鋪（一人一份貨架）、事件（直接塞給那一位，feifei_relic.test 有測）、單人紙箱。
   * 單人紙箱原本傳 `heroesIn(run)`：今天只有單人會叫、結果正確，但萬一連線哪天也叫它，就會開出鎖這一位的（推前審查 資訊-2），一併改成只看那一位。
   */
  it('連線的罐頭鋪：每一位的貨架照自己的角色，混搭時球球那一份不會擺封封的秘寶', () => {
    const banned = relics.filter((r) => r.notFor?.includes('ninja')).map((r) => r.id);
    for (let i = 0; i < 200; i++) {
      const run = newCoopRun(`partner-shop-${i}`, 1, 'fengfeng', 'ninja');
      run.act = 2;
      for (const it of makeShops(run)[1]!.relics) expect(banned, `${i}: ${it.id}`).not.toContain(it.id);
    }
  });

  it('單人紙箱只看開箱的那一位：混搭局裡替球球那一位開，不會開出封封的磨劍石', () => {
    const banned = relics.filter((r) => r.notFor?.includes('ninja')).map((r) => r.id);
    for (let i = 0; i < 300; i++) {
      const run = newCoopRun(`partner-chest-${i}`, 1, 'fengfeng', 'ninja');
      const id = openChest(run, 1);
      expect(banned, `${i}: ${id}`).not.toContain(id);
    }
  });
});
