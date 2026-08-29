import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { describeCard } from '../../src/ui/cardtext';

describe('牌面文字', () => {
  const t = (id: string, up = false) => describeCard(cardById[id]!, up);
  it('照規格措辭', () => {
    expect(t('sanjo')).toBe('造成 6 傷。');
    expect(t('sanjo', true)).toBe('造成 9 傷。');
    expect(t('bunshin')).toBe('造成 3 傷，次數＝連抓＋1（上限 5 次）。');
    expect(t('shunshou')).toBe('造成 6 傷；擊倒目標則 +15 小魚乾。');
    expect(t('zhuangsi')).toBe('蜷縮 5，獲得 1 隱身。消耗。');
    expect(t('susu')).toBe('對全體魔物造成 8 傷。');
    expect(t('jiejie')).toBe('每回合開始獲得 3 蜷縮。');
    expect(t('renwuwancheng')).toBe('每擊倒一隻魔物回復 6 生命。');
    expect(t('xianshuile')).toBe('回復 4 生命，然後立刻結束回合。');
    expect(t('zhongji')).toBe('不能打出。');
    expect(t('shishou')).toBe('不能打出。回合結束時若在手牌，受 1 傷。');
    expect(t('taxue')).toBe('獲得 1 隱身。消耗。');
    expect(t('taxue', true)).toBe('獲得 1 隱身。');
    expect(t('fengkou')).toBe('移除目標的爪力、貓步與蜷縮。');
  });
});
