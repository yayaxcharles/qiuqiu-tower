import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { describeCard } from '../../src/ui/cardtext';

/**
 * 2026-08-30 全面改寫措辭：原本是「造成 6 傷」「蜷縮 5」「獲得 1 隱身」這種沒動詞也沒量詞的
 * 寫法，唸出來不像人話。現在一律補齊「N 點傷害」「N 點蜷縮」「N 層隱身」「N 張牌」。
 * 量詞的分法照規格 §2：撐幾回合的算層，數值型的算點。
 */
describe('牌面文字', () => {
  const t = (id: string, up = false) => describeCard(cardById[id]!, up);
  it('傷害、蜷縮、抽牌都帶量詞', () => {
    expect(t('sanjo')).toBe('造成 6 點傷害。');
    expect(t('sanjo', true)).toBe('造成 9 點傷害。');
    expect(t('zhuangsi')).toBe('獲得 5 點蜷縮，獲得 1 層隱身。消耗。');
    expect(t('susu')).toBe('對全體魔物造成 8 點傷害。');
    expect(t('taxue')).toBe('獲得 1 層隱身。消耗。');
    expect(t('taxue', true)).toBe('獲得 1 層隱身。');
    expect(t('fengkou')).toBe('移除目標的爪力、貓步與蜷縮。');
  });

  it('連抓與擊倒獎金講成人話，不用算式', () => {
    expect(t('bunshin')).toBe('造成 3 點傷害，打的次數是連抓再加 1（最多 5 次）。');
    expect(t('shunshou')).toBe('造成 6 點傷害；打倒牠就多拿 15 條小魚乾。');
  });

  it('能力牌的觸發子句', () => {
    expect(t('jiejie')).toBe('每回合開始時獲得 3 點蜷縮。');
    expect(t('renwuwancheng')).toBe('每打倒一隻魔物就回復 6 點生命。');
    expect(t('xianshuile')).toBe('回復 4 點生命，然後直接結束這回合。');
  });

  it('壞毛病牌', () => {
    expect(t('zhongji')).toBe('不能打出。');
    expect(t('shishou')).toBe('不能打出。回合結束時還在手上的話，受 1 點傷害。');
  });

  it('不漏引擎內部的狀態名（潛水）', () => {
    // 潛水是引擎拿來記「下回合開始換成隱身」的暫存狀態，牌面照規格寫成人話
    expect(t('qianshui')).toBe('獲得 1 層隱身；下回合開始時再獲得 1 層隱身。');
    expect(t('qianshui', true)).toBe('獲得 2 層隱身；下回合開始時再獲得 2 層隱身。');
  });

  it('定身不寫層數', () => {
    expect(t('dingshen')).toBe('給目標定身。');
    expect(t('dingshen', true)).toBe('給目標定身。');
    expect(t('dianxue')).toBe('造成 6 點傷害，給目標定身。');
    expect(t('dianxue', true)).toBe('造成 9 點傷害，給目標定身。');
  });

  it('全體的主詞只講一次', () => {
    expect(t('cuimian')).toBe('全體魔物獲得 2 層懶洋洋、2 層炸毛。');
    expect(t('cuimian', true)).toBe('全體魔物獲得 3 層懶洋洋、3 層炸毛。');
    expect(t('shihou')).toBe('對全體魔物造成 10 點傷害，再讓牠們獲得 1 層懶洋洋。');
    expect(t('shihou', true)).toBe('對全體魔物造成 13 點傷害，再讓牠們獲得 1 層懶洋洋。');
    // 單體維持統一的「給目標 N 層 X」，不跟著收
    expect(t('shengdong')).toBe('造成 5 點傷害，給目標 1 層懶洋洋。');
  });

  it('同時動到魔物的牌，回復要講清楚是誰回', () => {
    expect(t('yide')).toBe('全體魔物獲得 3 層懶洋洋，你回復 5 點生命。');
    expect(t('guixi')).toBe('回復 8 點生命。消耗。');
    expect(t('xianshuile', true)).toBe('回復 7 點生命，然後直接結束這回合。');
  });

  it('交出來先搶蜷縮再打，變身術留著玩笑話', () => {
    expect(t('jiaochulai')).toBe('把目標的蜷縮全部搶過來，再造成 4 點傷害。');
    expect(t('jiaochulai', true)).toBe('把目標的蜷縮全部搶過來，再造成 6 點傷害。');
    expect(t('bianshen')).toBe('獲得 9 點蜷縮（變成飯糰）。');
    expect(t('bianshen', true)).toBe('獲得 12 點蜷縮（變成飯糰）。');
  });
});
