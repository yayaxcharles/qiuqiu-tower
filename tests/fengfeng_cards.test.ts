import { describe, expect, it } from 'vitest';
import { cardById, starterDeckFor } from '../src/content/cards';
import { relicById } from '../src/content/relics';
import { HEROES, cardsForHero, pickable, startRelicFor } from '../src/engine/hero';

const IDS = [
  'fengfeng_pingzhan', 'fengfeng_hushen', 'fengfeng_tuna', 'fengfeng_tanbu',
  'fengfeng_hengsao', 'fengfeng_tabu', 'fengfeng_tiaokai', 'fengfeng_tuibu',
  'fengfeng_zhengxi', 'fengfeng_wenwan', 'fengfeng_huanshou', 'fengfeng_jianqiao',
  'fengfeng_huibu', 'fengfeng_chuantang', 'fengfeng_shuangduan', 'fengfeng_huzhou',
  'fengfeng_zhuanshen', 'fengfeng_changxi', 'fengfeng_zhenshou', 'fengfeng_xunxi',
  'fengfeng_shoushi', 'fengfeng_kanshi', 'fengfeng_youbian', 'fengfeng_jiewo',
  'fengfeng_husong', 'fengfeng_duanliu', 'fengfeng_kaishan', 'fengfeng_cunfeng',
  'fengfeng_lianxi', 'fengfeng_jizhong', 'fengfeng_pozhen', 'fengfeng_yiqichushou',
] as const;

describe('封封角色與 32 張牌資料', () => {
  it('角色、起手牌與舊劍穗固定', () => {
    expect(HEROES).toContain('fengfeng');
    expect(starterDeckFor('fengfeng')).toEqual([
      'fengfeng_pingzhan', 'fengfeng_pingzhan', 'fengfeng_pingzhan', 'fengfeng_pingzhan',
      'fengfeng_hushen', 'fengfeng_hushen', 'fengfeng_hushen', 'fengfeng_hushen',
      'fengfeng_tuna', 'fengfeng_tuna',
    ]);
    expect(startRelicFor('fengfeng')).toBe('old_sword_tassel');
    expect(relicById['old_sword_tassel']).toMatchObject({ name: '舊劍穗', pool: '起始' });
    expect(relicById['old_sword_tassel']!.hooks.combatStart).toEqual([{ kind: 'gainQi', n: 2 }]);
    // 2026-09-22 平衡調整：多一條每回合開始 1 點蓄氣（開場那 2 點照留）
    expect(relicById['old_sword_tassel']!.hooks.turnStart).toEqual([{ kind: 'gainQi', n: 1 }]);
  });

  it('只有 32 張封封專屬牌，圖鍵與取得條件一致', () => {
    const own = cardsForHero('fengfeng').filter((c) => c.hero === 'fengfeng');
    expect(own.map((c) => c.id)).toEqual(IDS);
    for (const id of IDS) {
      const d = cardById[id]!;
      expect(d, id).toBeTruthy();
      expect(d.hero, id).toBe('fengfeng');
      expect(d.art, id).toBe(`card/${id}`);
    }
  });

  it('FG-T19：起手牌不進獎勵，四張連線牌不進單人池', () => {
    const coop = new Set(['fengfeng_youbian', 'fengfeng_jiewo', 'fengfeng_husong', 'fengfeng_yiqichushou']);
    for (const id of IDS) {
      const d = cardById[id]!;
      if (d.pool === '起手') expect(pickable(d, 'fengfeng', 2), id).toBe(false);
      else if (coop.has(id)) {
        expect(d.coop, id).toBe(true);
        expect(pickable(d, 'fengfeng', 1), id).toBe(false);
        expect(pickable(d, 'fengfeng', 2), id).toBe(true);
      } else expect(pickable(d, 'fengfeng', 1), id).toBe(true);
      expect(pickable(d, 'ninja', 2), id).toBe(false);
    }
  });

  it('費用、牌型、稀有度與牌池完全對應契約', () => {
    const rows: [string, string, number, number | undefined, string, string, boolean?][] = [
      ['pingzhan', '平斬', 1, undefined, '攻擊', '常見'], ['hushen', '護身', 1, undefined, '技能', '常見'],
      ['tuna', '吐納', 0, undefined, '技能', '常見'],   // 2026-09-22 平衡調整：1 費 → 0 費 ['tanbu', '探步劍', 1, undefined, '攻擊', '常見'],
      ['hengsao', '橫掃', 1, undefined, '攻擊', '常見'], ['tabu', '踏步重劈', 2, undefined, '攻擊', '常見'],
      ['tiaokai', '挑開', 1, undefined, '攻擊', '常見'], ['tuibu', '退步守勢', 1, undefined, '技能', '常見'],
      ['zhengxi', '整理呼吸', 1, undefined, '技能', '常見'], ['wenwan', '穩住手腕', 0, undefined, '技能', '常見'],
      ['huanshou', '換手握劍', 0, undefined, '技能', '常見'], ['jianqiao', '劍鞘架擋', 1, undefined, '技能', '常見'],
      ['huibu', '回步刺', 1, undefined, '攻擊', '常見'], ['chuantang', '穿堂劍', 2, undefined, '攻擊', '罕見'],
      ['shuangduan', '雙段劍', 1, undefined, '攻擊', '罕見'], ['huzhou', '回劍護肘', 1, undefined, '攻擊', '罕見'],
      ['zhuanshen', '轉身蓄勁', 1, undefined, '技能', '罕見'], ['changxi', '長息', 2, undefined, '技能', '罕見'],
      ['zhenshou', '振袖收劍', 1, undefined, '技能', '罕見'], ['xunxi', '循息', 1, undefined, '能力', '罕見'],
      ['shoushi', '收勢', 1, undefined, '能力', '罕見'], ['kanshi', '看準劍路', 1, 0, '技能', '罕見'],
      ['youbian', '你從右邊上', 1, undefined, '技能', '罕見', true], ['jiewo', '借我擋一下', 1, undefined, '技能', '罕見', true],
      ['husong', '我護著你走', 1, undefined, '技能', '罕見', true], ['duanliu', '絕學·斷流', 2, undefined, '攻擊', '稀有'],
      ['kaishan', '絕學·開山', 3, 2, '攻擊', '稀有'], ['cunfeng', '絕學·藏鋒', 2, 1, '能力', '稀有'],
      ['lianxi', '絕學·連息', 1, undefined, '能力', '稀有'], ['jizhong', '集中精神', 0, undefined, '技能', '稀有'],
      ['pozhen', '絕學·破陣', 2, undefined, '攻擊', '稀有'], ['yiqichushou', '現在一起上', 2, 1, '技能', '稀有', true],
    ];
    for (const [suffix, name, cost, upCost, type, rarity, coop] of rows) {
      const d = cardById[`fengfeng_${suffix}`]!;
      expect([d.name, d.cost, d.upgrade.cost, d.type, d.rarity, !!d.coop], suffix)
        .toEqual([name, cost, upCost, type, rarity, !!coop]);
      expect(d.pool, suffix).toBe(['pingzhan', 'hushen', 'tuna'].includes(suffix)
        ? '起手' : rarity === '稀有' ? '絕學' : '忍術');
    }
  });

  it('32 張普通與升級效果逐欄固定，C17 明確先蜷縮後蓄氣', () => {
    // 2026-09-22 平衡調整：花蓄氣的牌每點蓄氣多 1 點，下面的 `perQi` 全部是新數值（契約表是改之前的）
    const fx = (id: string, up = false) => up
      ? (cardById[id]!.upgrade.effects ?? cardById[id]!.effects)
      : cardById[id]!.effects;
    expect(fx('fengfeng_pingzhan')).toEqual([{ kind: 'damageSpendQi', amount: 5, perQi: 3, maxQi: 2 }]);
    expect(fx('fengfeng_pingzhan', true)).toEqual([{ kind: 'damageSpendQi', amount: 8, perQi: 3, maxQi: 2 }]);
    expect(fx('fengfeng_hushen')).toEqual([{ kind: 'block', amount: 5 }]);
    expect(fx('fengfeng_hushen', true)).toEqual([{ kind: 'block', amount: 8 }]);
    expect(fx('fengfeng_tuna')).toEqual([{ kind: 'gainQi', n: 3 }]);
    expect(fx('fengfeng_tuna', true)).toEqual([{ kind: 'gainQi', n: 5 }]);
    expect(fx('fengfeng_tanbu')).toEqual([{ kind: 'damage', amount: 5 }, { kind: 'gainQi', n: 1 }]);
    expect(fx('fengfeng_tanbu', true)).toEqual([{ kind: 'damage', amount: 7 }, { kind: 'gainQi', n: 2 }]);
    expect(fx('fengfeng_hengsao')).toEqual([{ kind: 'damageSpendQi', amount: 3, perQi: 2, maxQi: 2, target: 'all' }]);
    expect(fx('fengfeng_tabu')).toEqual([{ kind: 'damageSpendQi', amount: 8, perQi: 3, maxQi: 5 }]);
    expect(fx('fengfeng_tabu', true)).toEqual([{ kind: 'damageSpendQi', amount: 10, perQi: 3, maxQi: 6 }]);
    expect(fx('fengfeng_tiaokai')).toEqual([{ kind: 'damage', amount: 7 }]);
    expect(fx('fengfeng_tiaokai', true)).toEqual([{ kind: 'damage', amount: 9 }, { kind: 'draw', n: 1 }]);
    expect(fx('fengfeng_tuibu')).toEqual([{ kind: 'block', amount: 8 }, { kind: 'ifQiAtPlay', min: 3, then: [{ kind: 'block', amount: 3 }] }]);
    expect(fx('fengfeng_zhengxi')).toEqual([{ kind: 'gainQi', n: 2 }, { kind: 'draw', n: 1 }]);
    expect(fx('fengfeng_wenwan')).toEqual([{ kind: 'gainQi', n: 2 }]);
    expect(fx('fengfeng_huanshou')).toEqual([{ kind: 'block', amount: 3 }]);
    expect(fx('fengfeng_jianqiao')).toEqual([{ kind: 'block', amount: 10 }]);
    expect(fx('fengfeng_huibu')).toEqual([{ kind: 'damageSpendQi', amount: 4, perQi: 3, maxQi: 2 }, { kind: 'ifSpentQiAtLeast', min: 2, then: [{ kind: 'draw', n: 1 }] }]);
    expect(fx('fengfeng_chuantang')).toEqual([{ kind: 'damageSpendQi', amount: 8, perQi: 3, maxQi: 4, ignoreBlock: true }]);
    expect(fx('fengfeng_shuangduan')).toEqual([{ kind: 'damageSpendQi', amount: 3, perQi: 2, maxQi: 2, times: 2 }]);
    expect(fx('fengfeng_huzhou')).toEqual([{ kind: 'damageSpendQi', amount: 5, perQi: 3, maxQi: 3 }, { kind: 'ifSpentQiAtLeast', min: 3, then: [{ kind: 'block', amount: 5 }] }]);
    expect(fx('fengfeng_zhuanshen')).toEqual([{ kind: 'block', amount: 5 }, { kind: 'gainQi', n: 2 }]);
    expect(fx('fengfeng_changxi')).toEqual([{ kind: 'gainQi', n: 7 }]);
    expect(fx('fengfeng_zhenshou')).toEqual([{ kind: 'blockSpendQi', amount: 7, perQi: 3, maxQi: 3 }]);
    expect(fx('fengfeng_kanshi')).toEqual([{ kind: 'draw', n: 2 }, { kind: 'ifQiAtPlay', min: 4, then: [{ kind: 'draw', n: 1 }] }]);
    expect(fx('fengfeng_youbian')).toEqual([{ kind: 'nextAttackBonusSpendQi', amount: 3, perQi: 3, maxQi: 3, recipients: 'ally' }]);
    expect(fx('fengfeng_jiewo')).toEqual([{ kind: 'gainQi', n: 3 }, { kind: 'ifAllyBlockAtPlay', min: 8, then: [{ kind: 'gainQi', n: 2 }] }]);
    expect(fx('fengfeng_husong')).toEqual([{ kind: 'blockSpendQi', amount: 7, perQi: 3, maxQi: 3, recipient: 'ally' }]);
    expect(fx('fengfeng_duanliu')).toEqual([{ kind: 'damageSpendQi', amount: 10, perQi: 4, allQi: true }]);
    expect(fx('fengfeng_kaishan')).toEqual([{ kind: 'damageSpendQi', amount: 8, perQi: 3, allQi: true, target: 'all' }]);
    expect(fx('fengfeng_jizhong')).toEqual([{ kind: 'gainQi', n: 6 }, { kind: 'preventEnergyGainThisPhase' }]);
    expect(fx('fengfeng_pozhen')).toEqual([{ kind: 'damageSpendQi', amount: 12, perQi: 3, maxQi: 6 }, { kind: 'ifSpentQiAtLeast', min: 6, then: [{ kind: 'draw', n: 2 }] }]);
    expect(fx('fengfeng_yiqichushou')).toEqual([{ kind: 'nextAttackBonusSpendQi', amount: 2, perQi: 2, maxQi: 4, recipients: 'selfAndAlly' }]);
  });
});
