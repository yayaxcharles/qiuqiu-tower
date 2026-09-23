import { describe, expect, it } from 'vitest';
import HUD_RAW from '../../src/ui/hud.ts?raw';
import COMBAT_RAW from '../../src/ui/screens/combat.ts?raw';
import SHOP_RAW from '../../src/ui/screens/shop.ts?raw';
import { relicCounter, relicCounterKey } from '../../src/engine/counters';
import { blankPlayer } from '../helpers';
import type { RunPlayer } from '../../src/engine/types';

/**
 * 計數型秘寶的數字（2026-09-23 內容擴充第二批）：圖示右下角疊數字，算法在引擎（`engine/counters.ts`），
 * 狀態列把它疊上去；戰鬥畫面要把這一場的回合數與「我」那一位傳進狀態列，數字才照戰鬥裡的算。
 */
const rp = (counters?: Record<string, number>): RunPlayer => ({ hp: 50, maxHp: 50, fish: 0, deck: [], relics: [], potions: [], removeCost: 75, ...(counters ? { counters } : {}) });

describe('每一件要疊什麼數字', () => {
  it('木人樁：地圖上看整局那一份、戰鬥中看這一場那一份（沒數過是 0）', () => {
    expect(relicCounter('wooden_dummy', rp())).toBe(0);
    expect(relicCounter('wooden_dummy', rp({ wooden_dummy: 7 }))).toBe(7);
    const p = blankPlayer();
    p.relicCounters = { wooden_dummy: 9 };
    expect(relicCounter('wooden_dummy', rp({ wooden_dummy: 7 }), { turn: 1, p })).toBe(9);
  });
  it('撲滿：只看整局那一份', () => {
    expect(relicCounter('piggy_bank', rp({ piggy_bank: 2 }))).toBe(2);
    expect(relicCounter('piggy_bank', rp({ piggy_bank: 2 }), { turn: 5, p: blankPlayer() })).toBe(2);
  });
  it('沙漏、線香：只有戰鬥中有，回合數除以 N 的餘數', () => {
    expect(relicCounter('hourglass', rp())).toBeNull();
    expect([1, 2, 3, 4].map((turn) => relicCounter('hourglass', rp(), { turn, p: blankPlayer() }))).toEqual([1, 2, 0, 1]);
    expect(relicCounter('incense_stick', rp(), { turn: 4, p: blankPlayer() })).toBe(0);
  });
  it('暗器匣：這回合打了幾張，到 3 就停在 3', () => {
    const p = blankPlayer();
    expect(relicCounter('dart_case', rp())).toBeNull();
    p.cardsPlayedThisTurn = 2;
    expect(relicCounter('dart_case', rp(), { turn: 1, p })).toBe(2);
    p.cardsPlayedThisTurn = 5;
    expect(relicCounter('dart_case', rp(), { turn: 1, p })).toBe(3);
  });
  it('不是計數型的回 null（不疊）；一串秘寶的字串只收有數字的', () => {
    expect(relicCounter('tuna_can', rp())).toBeNull();
    expect(relicCounter('counting_beads', rp(), { turn: 1, p: blankPlayer() })).toBeNull();
    expect(relicCounterKey(['tuna_can', 'piggy_bank', 'hourglass'], rp({ piggy_bank: 1 }), { turn: 2, p: blankPlayer() })).toBe('1,2');
  });
});

describe('畫面接線', () => {
  const hud = HUD_RAW.replace(/\r\n/g, '\n');
  const combat = COMBAT_RAW.replace(/\r\n/g, '\n');
  it('狀態列把數字疊在秘寶那一格（`.relic-count`），戰鬥畫面兩條重畫的路都傳這一場的回合數與我那一位', () => {
    expect(hud).toContain("const count = relicCounter(id, me(run, seat), combat);");
    expect(hud).toContain("node.append(el('span', { class: 'relic-count' }, String(count)))");
    expect(combat.match(/renderHud\(app, box, my\(\)\.fishDelta, \{ turn: cs\.turn, p: my\(\) \}\)/g) ?? []).toHaveLength(2);
    expect(combat.match(/hudKey\(me\(run, app\.seat\), my\(\)\.fishDelta, hudCounters\(\)\)/g) ?? []).toHaveLength(2);
  });
  it('套組湊成那一刻跳提示、撲滿倒錢跳提示（兩個都在狀態列，任何畫面拿到秘寶都蓋得到）', () => {
    expect(hud).toMatch(/notice\(`\$\{set\}套組湊成了：\$\{RELIC_SETS\[set\]\.text\}`\)/);
    expect(hud).toContain('piggyNow < lastPiggy.n');
  });
  it('罐頭鋪：私藏那一格掛牌子、欠條進門講一句、價錢照這間店算（帶貨架）', () => {
    const shop = SHOP_RAW.replace(/\r\n/g, '\n');
    expect(shop).toContain("'店長私藏'");
    expect(shop).toContain('if (shop.entryFee) notice(');
    expect(shop).not.toMatch(/priceFor\(run, it, seat\)/);
  });
});
