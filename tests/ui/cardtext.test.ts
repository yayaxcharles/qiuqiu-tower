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

  it('不漏引擎內部的狀態名（潛水）', () => {
    // 潛水是引擎拿來記「下回合開始換成隱身」的暫存狀態，牌面照規格寫成人話
    expect(t('qianshui')).toBe('獲得 1 隱身；下回合開始再獲得 1 隱身。');
    expect(t('qianshui', true)).toBe('獲得 2 隱身；下回合開始再獲得 2 隱身。');
  });

  it('定身不寫層數', () => {
    expect(t('dingshen')).toBe('給目標定身。');
    expect(t('dingshen', true)).toBe('給目標定身。');
    expect(t('dianxue')).toBe('造成 6 傷，給目標定身。');
    expect(t('dianxue', true)).toBe('造成 9 傷，給目標定身。');
  });

  it('全體的主詞只講一次', () => {
    expect(t('cuimian')).toBe('全體魔物獲得 2 懶洋洋、2 炸毛。');
    expect(t('cuimian', true)).toBe('全體魔物獲得 3 懶洋洋、3 炸毛。');
    expect(t('shihou')).toBe('對全體魔物造成 10 傷，給 1 懶洋洋。');
    expect(t('shihou', true)).toBe('對全體魔物造成 13 傷，給 1 懶洋洋。');
    // 單體維持統一的「給目標 N X」，不跟著收
    expect(t('shengdong')).toBe('造成 5 傷，給目標 1 懶洋洋。');
  });

  it('同時動到魔物的牌，回復要講清楚是誰回', () => {
    expect(t('yide')).toBe('全體魔物獲得 3 懶洋洋，你回復 5 生命。');
    expect(t('guixi')).toBe('回復 8 生命。消耗。');
    expect(t('xianshuile', true)).toBe('回復 7 生命，然後立刻結束回合。');
  });

  it('交出來先搶蜷縮再打，變身術留著玩笑話', () => {
    expect(t('jiaochulai')).toBe('奪走目標全部蜷縮變成你的，再造成 4 傷。');
    expect(t('jiaochulai', true)).toBe('奪走目標全部蜷縮變成你的，再造成 6 傷。');
    expect(t('bianshen')).toBe('蜷縮 9（變成飯糰）。');
    expect(t('bianshen', true)).toBe('蜷縮 12（變成飯糰）。');
  });
});
