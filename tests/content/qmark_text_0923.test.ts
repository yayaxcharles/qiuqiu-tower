import { describe, expect, it } from 'vitest';
import { HEROES } from '../../src/engine/hero';
import { MERCHANT_LINES, QMARK_TEXT } from '../../src/content/qmark-text';

/*
 * 問號格變化的四份文字（2026-09-23 內容擴充第三批，設計稿 3-6）。口吻照 design2 第二節：
 * 球球句尾帶喵、旁白叫牠「牠」；菲菲是她、結巴先道歉；噹噹、封封是他、不講喵；封封講路與貨；噹噹身上不出現「忍術」。
 */
const NAME: Record<string, string> = { ninja: '球球', feifei: '菲菲', dangdang: '噹噹', fengfeng: '封封' };
const all = (h: string): string[] => {
  const t = QMARK_TEXT[h as keyof typeof QMARK_TEXT];
  return [t.ambush.text, ...t.ambush.results, t.merchant, t.roadbox];
};
/** 這一位講的話（「名字：「……」」裡面那一句） */
const quotes = (h: string): string[] => all(h).flatMap((s) => [...s.matchAll(new RegExp(`${NAME[h]}：「([^」]*)」`, 'gu'))].map((m) => m[1]!));

describe('問號格的四份文字', () => {
  it('四隻都有一份、每一段都是自己在場（不會混到別隻的名字）', () => {
    expect(Object.keys(QMARK_TEXT).sort()).toEqual([...HEROES].sort());
    for (const h of HEROES) {
      for (const s of all(h)) {
        expect(s, `${h}：${s.slice(0, 20)}`).toContain(NAME[h]);
        // 「叮叮噹噹的瓶子」是狀聲詞（設計稿球球那份），不是噹噹
        for (const other of HEROES) if (other !== h) expect(s.replace(/叮叮噹噹/g, ''), `${h} 那份混到 ${other}`).not.toContain(NAME[other]!);
      }
    }
  });

  it('只有球球講話帶喵，而且他每一句都帶；另外三隻一個喵都沒有', () => {
    for (const q of quotes('ninja')) expect(q.endsWith('喵！') || q.endsWith('喵。') || q.endsWith('喵') || /喵[。！？]?$/.test(q), q).toBe(true);
    for (const h of ['feifei', 'dangdang', 'fengfeng']) for (const s of all(h)) expect(s, `${h}：${s}`).not.toContain('喵');
  });

  it('旁白代名詞：菲菲是「她」、噹噹是「他」；噹噹那份沒有「忍術」', () => {
    expect(QMARK_TEXT.feifei.ambush.results[1]).toContain('她跑到');
    expect(QMARK_TEXT.dangdang.ambush.results[1]).toContain('他頭也不回');
    for (const s of all('dangdang')) expect(s).not.toContain('忍術');
  });

  it('行腳商自己的話不分角色、不加喵', () => {
    const lines = [...MERCHANT_LINES.enter, ...MERCHANT_LINES.bought, MERCHANT_LINES.left, MERCHANT_LINES.poor];
    expect(lines).toHaveLength(7);
    for (const l of lines) {
      expect(l).not.toContain('喵');
      for (const h of HEROES) expect(l).not.toContain(NAME[h]!);
    }
  });
});
