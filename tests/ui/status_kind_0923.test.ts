import { describe, expect, it } from 'vitest';
import COMBAT_RAW from '../../src/ui/screens/combat.ts?raw';
import { BAD_STATUS, GOOD_STATUS, STATUS_ORDER } from '../../src/ui/status-kind';

/*
 * 狀態的好壞與排列順序收成一張 `Record<StatusName, 'good' | 'bad'>`（2026-09-23 health H-8）。
 * 產生出來的三份清單要跟原本 `combat.ts` 手寫的一模一樣（順序就是狀態列的順序）；改掉任何一格這裡就紅。
 * 漏了新狀態由 tsc 擋（那張表的鍵是 StatusName）。
 */
describe('狀態清單從一張表產生', () => {
  it('好狀態、壞狀態、狀態列順序跟原本寫死的一模一樣', () => {
    expect(GOOD_STATUS).toEqual(['爪力', '貓步', '隱身', '潛水', '鐵布衫', '反彈', '不壞身', '縮殼', '飛行', '鱗甲', '虛化']);
    expect(BAD_STATUS).toEqual(['定身', '沉睡', '消散', '翻肚', '懶洋洋', '炸毛', '中毒']);
    expect(STATUS_ORDER).toEqual(['爪力', '貓步', '隱身', '潛水', '鐵布衫', '反彈', '不壞身', '縮殼', '飛行', '鱗甲', '虛化',
      '定身', '沉睡', '消散', '翻肚', '懶洋洋', '炸毛', '中毒']);
    expect(new Set(STATUS_ORDER).size).toBe(STATUS_ORDER.length);
  });

  it('戰鬥畫面不再自己手寫一份', () => {
    const src = COMBAT_RAW.replace(/\r\n/g, '\n');
    expect(src).toContain("import { BAD_STATUS, GOOD_STATUS, STATUS_ORDER } from '../status-kind';");
    expect(src).not.toMatch(/const (STATUS_ORDER|GOOD_STATUS|BAD_STATUS)\b/);
  });
});
