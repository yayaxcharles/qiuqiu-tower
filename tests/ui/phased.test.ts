import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import SRC from '../../src/ui/screens/combat.ts?raw';

// 樣式檔用 fs 讀：vitest 對 `.css?raw` 會先過自己的 CSS 處理，拿回來的不是原文
const CSS = readFileSync(new URL('../../src/ui/styles/combat.css', import.meta.url), 'utf-8');

/*
 * 虛化的魔物本體要半透明（使用者 2026-09-14 深夜：「第三層有虛化的怪物不明顯，感覺要做點效果，
 * 讓玩家知道它們只會扣一滴血」；三個提案裡選了「本體半透明」）。
 *
 * 原本只有狀態列一顆小圖示與戰報一句「變得半透明」，立繪本身一點都沒變。
 * 做法跟飛行一樣：`enemyUnit` 照**當下**的虛化層數掛 `phased` 類別，樣式把立繪淡下去；
 * 實體化那一拍類別拿掉，立繪立刻變回實心，玩家看得到輸出窗口開了。
 * 這支跟 mate_sprite.test.ts 一樣讀原始碼盯規矩：整個戰鬥畫面要架起來才走得到那一行，成本太高。
 */
describe('虛化的魔物本體半透明', () => {
  it('enemyUnit 照當下的虛化層數掛 phased 類別（死了不掛）', () => {
    expect(SRC).toMatch(/if \(!e\.dead && getStatus\(e, '虛化'\) > 0\) cls\.push\('phased'\);/);
  });

  it('樣式把 phased 的立繪淡到一半以下、影子也淡', () => {
    const sprite = CSS.match(/\.combat \.unit\.enemy\.phased \.sprite \{([^}]*)\}/);
    expect(sprite, '缺 .combat .unit.enemy.phased .sprite 規則').not.toBeNull();
    const op = Number(/opacity:\s*([\d.]+)/.exec(sprite![1]!)?.[1]);
    expect(op).toBeGreaterThan(0);
    expect(op, '要淡到一眼看得出來').toBeLessThanOrEqual(0.5);
    expect(CSS).toMatch(/\.combat \.unit\.enemy\.phased \.ground-shadow \{[^}]*opacity:/);
  });

  it('不用 filter 做半透明：受擊的紅閃是用 filter 寫的，會被更長的選擇器蓋掉', () => {
    const sprite = CSS.match(/\.combat \.unit\.enemy\.phased \.sprite \{([^}]*)\}/);
    expect(sprite![1]!).not.toMatch(/filter:/);
  });
});
