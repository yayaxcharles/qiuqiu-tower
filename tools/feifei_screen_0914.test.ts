import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * 2026-09-14 夜間稽核（菲菲那一份）裡要讀原始碼才驗得到的兩條。
 * 行為本身在 `tests/engine/feifei_night_0914.test.ts` 測；這裡只確認畫面真的有走那一層。
 */
describe('中-3：塔主與旁白的句子，兩條上畫面的路都有換', () => {
  it('播對白（playDialogue）與換階段吐槽（bossPhaseTalk）都過 castLineFor', () => {
    expect(readFileSync('src/ui/dialogue.ts', 'utf-8')).toContain('castLineFor(localHero(), l.text)');
    expect(readFileSync('src/ui/screens/combat.ts', 'utf-8')).toContain('castLineFor(my().hero, l.text)');
  });
});

describe('低-7：升級反而變貴的牌要看得出來', () => {
  it('費用代幣有自己的顏色（見血封喉＋ 3→4）', () => {
    expect(readFileSync('src/ui/cardview.ts', 'utf-8')).toMatch(/costUp \? 'card-cost cost-up'/);
    expect(readFileSync('src/ui/styles/components.css', 'utf-8')).toMatch(/\.card-cost\.cost-up\s*\{/);
  });
});
