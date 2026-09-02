import { describe, expect, it } from 'vitest';
import { glossary } from '../../src/content/glossary';

const MUST: string[] = [
  '飽足', '飯糰', '蜷縮', '隱身', '連抓', '爪力', '貓步', '翻肚', '懶洋洋', '炸毛',
  '噎到', '反彈', '定身', '壞毛病', '小魚乾', '秘寶', '忍具', '罐頭鋪', '貓窩', '紙箱',
  '大魔物', '塔主', '消耗', '保留', '不可打出', '潛水',
  // 2026-09-02 第二波魔物的十個機制＋兩張戰鬥雜牌（隱藏規則一律掛牌可見，牌子的說明就從這裡來）
  '縮殼', '飛行', '鱗甲', '沉睡', '消散', '分裂', '詛咒', '憤怒', '自爆', '虛幻', '黏液', '眼冒金星',
];

describe('名詞表', () => {
  it('涵蓋所有規則名詞', () => {
    for (const t of MUST) expect(glossary[t], t).toBeTruthy();
  });
  it('說明是白話，不含「喵」', () => {
    for (const v of Object.values(glossary)) expect(v.endsWith('喵')).toBe(false);
  });
});
