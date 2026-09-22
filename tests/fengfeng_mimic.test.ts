import { describe, expect, it } from 'vitest';
import { cards } from '../src/content/cards';
import { learnCard } from '../src/engine/mimic';
import type { EnemyEffect } from '../src/engine/types';
import { inst } from './helpers';

const HERS = cards.filter((c) => c.hero === 'fengfeng').map((c) => c.id);

/*
 * 照牌面上限學成固定值（基礎＋每氣係數×上限）。2026-09-22 平衡調整之後每氣係數各 +1，
 * 下面的數字照新數值（平斬 5＋3×2＝11、踏步重劈 8＋3×5＝23、破陣 12＋3×6＝30…）。
 * 用光全部蓄氣的兩張絕學（斷流、開山）照舊不學。
 */
const EXPECT: Record<string, EnemyEffect[] | null> = {
  fengfeng_pingzhan: [{ kind: 'damage', amount: 11 }],
  fengfeng_hushen: [{ kind: 'block', amount: 5 }],
  fengfeng_tuna: null,
  fengfeng_tanbu: [{ kind: 'damage', amount: 5 }],
  fengfeng_hengsao: [{ kind: 'damage', amount: 7 }],
  fengfeng_tabu: [{ kind: 'damage', amount: 23 }],
  fengfeng_tiaokai: [{ kind: 'damage', amount: 7 }],
  fengfeng_tuibu: [{ kind: 'block', amount: 8 }],
  fengfeng_zhengxi: null,
  fengfeng_wenwan: null,
  fengfeng_huanshou: [{ kind: 'block', amount: 3 }],
  fengfeng_jianqiao: [{ kind: 'block', amount: 10 }],
  fengfeng_huibu: [{ kind: 'damage', amount: 10 }],
  fengfeng_chuantang: [{ kind: 'damage', amount: 20, pierce: true }],
  fengfeng_shuangduan: [{ kind: 'damage', amount: 7, times: 2 }],
  fengfeng_huzhou: [{ kind: 'damage', amount: 14 }],
  fengfeng_zhuanshen: [{ kind: 'block', amount: 5 }],
  fengfeng_changxi: null,
  fengfeng_zhenshou: [{ kind: 'block', amount: 16 }],
  fengfeng_xunxi: null,
  fengfeng_shoushi: null,
  fengfeng_kanshi: null,
  fengfeng_youbian: null,
  fengfeng_jiewo: null,
  fengfeng_husong: null,
  fengfeng_duanliu: null,
  fengfeng_kaishan: null,
  fengfeng_cunfeng: null,
  fengfeng_lianxi: null,
  fengfeng_jizhong: null,
  fengfeng_pozhen: [{ kind: 'damage', amount: 30 }],
  fengfeng_yiqichushou: null,
};

describe('鏡中影子學封封的牌', () => {
  it('32 張逐張都有明確轉譯或明確略過', () => {
    expect(HERS).toHaveLength(32);
    expect(Object.keys(EXPECT).sort()).toEqual([...HERS].sort());
    for (const id of HERS) expect(learnCard(inst(id, 1)), id).toEqual(EXPECT[id]);
  });

  it('蓄氣傷害以牌面上限固定，保留多段與穿透；耗氣蜷縮只學自用版', () => {
    expect(learnCard(inst('fengfeng_pingzhan', 1, true))).toEqual([{ kind: 'damage', amount: 14 }]);
    expect(learnCard(inst('fengfeng_chuantang', 1, true))).toEqual([{ kind: 'damage', amount: 23, pierce: true }]);
    expect(learnCard(inst('fengfeng_shuangduan', 1, true))).toEqual([{ kind: 'damage', amount: 8, times: 2 }]);
    expect(learnCard(inst('fengfeng_zhenshou', 1, true))).toEqual([{ kind: 'block', amount: 19 }]);
    expect(learnCard(inst('fengfeng_husong', 1)), '幫同伴擋沒有鏡子可用的受益者').toBeNull();
  });

  it('消耗全部蓄氣的絕學比照噹噹的卸光不學（使用者 2026-09-21）；有上限的照上限學', () => {
    expect(learnCard(inst('fengfeng_duanliu', 1, true))).toBeNull();
    expect(learnCard(inst('fengfeng_kaishan', 1, true))).toBeNull();
    expect(learnCard(inst('fengfeng_pozhen', 1, true))).toEqual([{ kind: 'damage', amount: 33 }]);
  });
});
