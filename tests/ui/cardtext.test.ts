import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { BOSS_MOVE_ART, enemies } from '../../src/content/enemies';
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
    expect(t('zhuangsi')).toBe('獲得 6 點蜷縮，獲得 1 層隱身。消耗。');
    expect(t('susu')).toBe('對全體魔物造成 9 點傷害。');
    expect(t('taxue')).toBe('獲得 1 層隱身。消耗。');
    expect(t('taxue', true)).toBe('獲得 1 層隱身。');
    expect(t('fengkou')).toBe('移除目標最多 5 點爪力、貓步與 5 點防禦。');
  });

  it('連抓與擊倒獎金講成人話，不用算式', () => {
    expect(t('bunshin')).toBe('造成 3 點傷害，打的次數是連抓再加 1（最多 5 次）。');
    expect(t('shunshou')).toBe('造成 7 點傷害；打倒牠就多拿 15 條小魚乾。');
  });

  it('能力牌的觸發子句', () => {
    expect(t('jiejie')).toBe('每回合開始時獲得 3 點蜷縮。');
    // 只限本回合的能力要講出來，不然玩家會當成永久的
    expect(t('renwuwancheng')).toBe('這回合內，每打倒一隻魔物就回復 4 點生命。');
    expect(t('xianshuile')).toBe('回復 4 點生命，然後直接結束這回合。');
  });

  it('壞毛病牌', () => {
    expect(t('zhongji')).toBe('不能打出。');
    expect(t('shishou')).toBe('不能打出。回合結束時還在手上的話，受 1 點傷害。');
  });

  it('魔物塞給你的戰鬥雜牌（2026-09-02 第二波）', () => {
    // 黏液打得出來卻什麼都不做——那句話一定要寫出來，不然牌面只剩「消耗。」，玩家會以為漏了什麼
    expect(t('slime_card')).toBe('打出去什麼事都不會發生。消耗。');
    expect(t('dazed_card')).toBe('不能打出。回合結束還在手上就消失。');
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
    expect(t('shengdong')).toBe('造成 6 點傷害，給目標 1 層懶洋洋。');
  });

  it('同時動到魔物的牌，回復要講清楚是誰回', () => {
    expect(t('yide')).toBe('全體魔物獲得 3 層懶洋洋，你回復 5 點生命。');
    expect(t('guixi')).toBe('回復 10 點生命。消耗。');
    expect(t('xianshuile', true)).toBe('回復 7 點生命，然後直接結束這回合。');
  });

  it('牌面只講規則：交出來先搶再打，變身術不留玩笑話', () => {
    expect(t('jiaochulai')).toBe('把目標的防禦全部搶過來，再造成 5 點傷害。');
    expect(t('jiaochulai', true)).toBe('把目標的防禦全部搶過來，再造成 7 點傷害。');
    // 變身術本來寫「獲得 9 點蜷縮（變成飯糰）」，有玩家問「變成飯糰是不是多拿一顆飯糰」——
    // 飯糰是飽足的單位，這句玩笑話剛好撞到規則名詞，整句拿掉。玩笑話交給圖去講。
    expect(t('bianshen')).toBe('獲得 10 點蜷縮。');
    expect(t('bianshen', true)).toBe('獲得 13 點蜷縮。');
    // 鐵頭功先打人再自傷，「也」有對象；拼命只有自傷，寫「也」會害玩家去找那個不存在的前一下
    expect(t('tietou')).toBe('造成 16 點傷害，自己也受 2 點傷害。');
    expect(t('boming')).toBe('自己受 3 點傷害，獲得 2 顆飯糰。消耗。');
    // 前半句自己就含逗號，後面再用逗號接會黏成一長串，看不出那 6 點是另一件事
    expect(t('jiedao')).toBe('造成的傷害等於你現在的蜷縮，而且蜷縮不會因此減少；獲得 6 點蜷縮。');
  });
});

describe('塔主姿勢對照', () => {
  it('三個階段的每一招都配得到專屬立繪，也沒有多餘的姿勢', () => {
    // 招式名同時是姿勢表的鍵。加了新招卻忘了配圖，畫面會靜靜退回待機圖、看不出來，所以在這裡擋。
    const boss = enemies.find((e) => e.art === 'daxia');
    expect(boss, '找不到塔主').toBeTruthy();
    const labels = new Set([
      ...boss!.moves.map((m) => m.label),
      ...(boss!.phases ?? []).flatMap((p) => (p.moves ?? []).map((m) => m.label)),
    ]);
    // 蹲下調息是血條式變身時引擎現生的過場招，不在招式表裡，但要有姿勢
    const posed = new Set(Object.keys(BOSS_MOVE_ART).filter((k) => k !== '蹲下調息'));
    expect(BOSS_MOVE_ART['蹲下調息']).toBeTruthy();
    expect([...labels].filter((l) => !posed.has(l)), '這些招式沒有專屬姿勢').toEqual([]);
    expect([...posed].filter((p) => !labels.has(p)), '這些姿勢沒有招式在用').toEqual([]);
  });
});
