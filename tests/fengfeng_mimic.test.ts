import { describe, expect, it } from 'vitest';
import { cardById, cards } from '../src/content/cards';
import { learnCard } from '../src/engine/mimic';
import type { CardDef, EnemyEffect } from '../src/engine/types';
import { inst } from './helpers';

const HERS = cards.filter((c) => c.hero === 'fengfeng').map((c) => c.id);

/*
 * 照牌面上限學成固定值（基礎＋每氣係數×上限）。2026-09-22 平衡調整之後每氣係數各 +1，
 * 下面的數字照新數值（平斬 5＋3×2＝11、踏步重劈 8＋3×5＝23、破陣 12＋3×6＝30…）。
 * 用光全部蓄氣的兩張絕學（斷流、開山）照舊不學。
 */
const EXPECT: Record<string, EnemyEffect[] | null> = {
  // 2026-09-24 憋氣乙版：上限 +2、純蜷縮 +2 跟著變；鏡子照舊學「花滿上限」的固定值、不套 ×1.3（實測封封打鏡中對手勝率 89～100%，跟改前差不多）
  // 2026-09-29「守著蓄氣，出劍花氣」：探步劍 5＋3×2、挑開 5＋3×3 改成花氣；防禦改蜷縮＋蓄氣，鏡子只學到蜷縮那段（蓄氣照舊略過），
  // 所以退步守勢 25→8、劍鞘架擋 26→6、振袖收劍 22→7——鏡中封封的防禦明顯變薄，是這次改版連帶的結果
  fengfeng_pingzhan: [{ kind: 'damage', amount: 17 }],
  fengfeng_hushen: [{ kind: 'block', amount: 6 }],
  fengfeng_tuna: null,
  fengfeng_tanbu: [{ kind: 'damage', amount: 11 }],
  fengfeng_hengsao: [{ kind: 'damage', amount: 11 }],
  fengfeng_tabu: [{ kind: 'damage', amount: 29 }],
  fengfeng_tiaokai: [{ kind: 'damage', amount: 14 }],
  fengfeng_tuibu: [{ kind: 'block', amount: 8 }],
  fengfeng_zhengxi: null,
  fengfeng_wenwan: null,
  fengfeng_huanshou: [{ kind: 'block', amount: 4 }],
  fengfeng_jianqiao: [{ kind: 'block', amount: 6 }],
  fengfeng_huibu: [{ kind: 'damage', amount: 16 }],
  // 2026-09-25 補的三張：順手一劍 2＋3×3、連環三劍 (2＋1×4)×3；一口氣用光全部蓄氣，跟斷流、開山一樣不學
  fengfeng_shunjian: [{ kind: 'damage', amount: 11 }],
  fengfeng_sanlian: [{ kind: 'damage', amount: 6, times: 3 }],
  fengfeng_yikouqi: null,
  fengfeng_chuantang: [{ kind: 'damage', amount: 26, pierce: true }],
  fengfeng_shuangduan: [{ kind: 'damage', amount: 11, times: 2 }],
  fengfeng_huzhou: [{ kind: 'damage', amount: 20 }],
  fengfeng_zhuanshen: [{ kind: 'block', amount: 7 }],
  fengfeng_changxi: null,
  fengfeng_zhenshou: [{ kind: 'block', amount: 7 }],
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
  fengfeng_pozhen: [{ kind: 'damage', amount: 36 }],
  fengfeng_yiqichushou: null,
  // 2026-09-29 新牌：用盡蓄氣，跟斷流、開山、一口氣一樣不學
  fengfeng_guanhong: null,
};

describe('鏡中影子學封封的牌', () => {
  it('36 張逐張都有明確轉譯或明確略過', () => {
    expect(HERS).toHaveLength(36);
    expect(Object.keys(EXPECT).sort()).toEqual([...HERS].sort());
    for (const id of HERS) expect(learnCard(inst(id, 1)), id).toEqual(EXPECT[id]);
  });

  it('蓄氣傷害以牌面上限固定，保留多段與穿透；蜷縮＋蓄氣只學蜷縮那段', () => {
    // 2026-09-29 升級改加每點：平斬＋ 5＋4×4、穿堂劍＋ 8＋4×6、雙段劍＋ 上限 6：3＋2×6
    expect(learnCard(inst('fengfeng_pingzhan', 1, true))).toEqual([{ kind: 'damage', amount: 21 }]);
    expect(learnCard(inst('fengfeng_chuantang', 1, true))).toEqual([{ kind: 'damage', amount: 32, pierce: true }]);
    expect(learnCard(inst('fengfeng_shuangduan', 1, true))).toEqual([{ kind: 'damage', amount: 15, times: 2 }]);
    expect(learnCard(inst('fengfeng_zhenshou', 1, true))).toEqual([{ kind: 'block', amount: 10 }]);
    expect(learnCard(inst('fengfeng_husong', 1)), '幫同伴擋沒有鏡子可用的受益者、自己的蓄氣也不學').toBeNull();
  });

  /*
   * 花氣架擋（`blockSpendQi`）2026-09-29 起沒有牌在用，引擎與鏡子的轉譯都留著（以後的牌可能再用）。
   * 用一張臨時的測試牌釘住「自用版照上限學成固定蜷縮、給同伴的不學」，免得那段轉譯沒人看著走鐘。
   */
  it('花氣架擋的轉譯規則（臨時測試牌）：自用照上限學成蜷縮，給同伴的不學', () => {
    const base = cardById['fengfeng_tuibu']!;
    const self: CardDef = { ...base, id: 'zz_test_block_spend_self', effects: [{ kind: 'blockSpendQi', amount: 7, perQi: 3, maxQi: 6 }], upgrade: {} };
    const mate: CardDef = { ...base, id: 'zz_test_block_spend_ally', effects: [{ kind: 'blockSpendQi', amount: 7, perQi: 3, maxQi: 5, recipient: 'ally' }], upgrade: {} };
    cardById[self.id] = self; cardById[mate.id] = mate;
    try {
      expect(learnCard(inst(self.id, 1))).toEqual([{ kind: 'block', amount: 25 }]);
      expect(learnCard(inst(mate.id, 1))).toBeNull();
    } finally {
      delete cardById[self.id]; delete cardById[mate.id];
    }
  });

  it('消耗全部蓄氣的絕學比照噹噹的卸光不學（使用者 2026-09-21）；有上限的照上限學', () => {
    expect(learnCard(inst('fengfeng_duanliu', 1, true))).toBeNull();
    expect(learnCard(inst('fengfeng_kaishan', 1, true))).toBeNull();
    expect(learnCard(inst('fengfeng_guanhong', 1, true))).toBeNull();
    // 破陣＋ 2026-09-29 改成 12＋4×8
    expect(learnCard(inst('fengfeng_pozhen', 1, true))).toEqual([{ kind: 'damage', amount: 44 }]);
  });
});
