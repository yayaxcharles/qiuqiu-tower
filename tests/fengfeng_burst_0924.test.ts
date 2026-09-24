import { describe, expect, it } from 'vitest';
import { cardById } from '../src/content/cards';
import { playCard, startCombat } from '../src/engine/combat';
import { qiAmount } from '../src/engine/effects';
import { Rng, seedFromString } from '../src/engine/rng';
import { QI_BURST_MIN, type CombatState, type PlayerCombat } from '../src/engine/types';
import { describeCard } from '../src/ui/cardtext';
import { glossary } from '../src/content/glossary';
import HERO_RAW from '../src/ui/screens/heroselect.ts?raw';
import COMBAT_RAW from '../src/ui/screens/combat.ts?raw';
import { inst } from './helpers';

// 這台的原始碼是 CRLF，比對多行片段前先換成 LF
const HERO = HERO_RAW.replace(/\r\n/g, '\n'), COMBAT = COMBAT_RAW.replace(/\r\n/g, '\n');
function between(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`找不到片段：${start}`);
  return src.slice(a, b);
}

/*
 * 封封「憋氣」乙版（2026-09-24 使用者拍板）：一張牌一次花 4 點以上蓄氣，那一招的傷害或蜷縮 ×1.3（無條件捨去）。
 * 攻擊（平斬等）的實際傷害在 `fengfeng_engine.test.ts` FG-T01 驗；這裡驗門檻本身、花氣架擋、牌面文字。
 */
let uid = 95_000;
function setup(): { cs: CombatState; p: PlayerCombat } {
  const cs = startCombat({ hp: 80, maxHp: 80, deck: [inst('fengfeng_hushen', 1)], relics: [], potions: [], encounterId: 'wood_dummy',
    rng: new Rng(seedFromString('fengfeng-burst')), hero: 'fengfeng' });
  const p = cs.player;
  p.hand = []; p.drawPile = []; p.discardPile = []; p.exhaustPile = []; p.energy = 99; p.block = 0; p.qi = 0;
  return { cs, p };
}
function play(cs: CombatState, p: PlayerCombat, id: string): boolean {
  const u = uid++;
  p.hand.push({ uid: u, cardId: id, upgraded: false });
  return playCard(cs, u, undefined, p.seat);
}

describe('憋氣：一次花 4 點以上 ×1.3', () => {
  it('門檻是 4：3 點照原樣，4 點起 ×1.3 無條件捨去', () => {
    const fx = { amount: 5, perQi: 3 };
    expect(qiAmount(fx, 3)).toBe(14);
    expect(qiAmount(fx, 4)).toBe(22);   // 17×1.3＝22.1
    expect(qiAmount({ amount: 10, perQi: 4 }, 12)).toBe(75);   // 斷流灌滿：58×1.3＝75.4
  });

  it('花氣架擋也套：劍鞘架擋 3 氣 17 點、6 氣 33 點蜷縮', () => {
    const a = setup(); a.p.qi = 3;
    expect(play(a.cs, a.p, 'fengfeng_jianqiao')).toBe(true);
    expect(a.p.block).toBe(17);
    expect(a.p.qi).toBe(0);
    const b = setup(); b.p.qi = 8;
    expect(play(b.cs, b.p, 'fengfeng_jianqiao')).toBe(true);
    expect(b.p.block).toBe(33);   // (8＋3×6)×1.3＝33.8
    expect(b.p.qi).toBe(2);
  });

  // 使用者 2026-09-24 晚：「每張牌都寫上花四點以上 ×1.3 太累了……在角色說明之類的地方寫清楚」
  it('牌面不再每張寫門檻；規則寫在名詞表「蓄氣」，選角畫面與戰鬥的蓄氣牌子都引用那一條', () => {
    expect(describeCard(cardById['fengfeng_pingzhan']!, false)).toBe('最多花 4 點蓄氣，造成 5 點傷害，每點蓄氣多 3 點。');
    expect(describeCard(cardById['fengfeng_duanliu']!, false)).toContain('用盡蓄氣，造成 10 點傷害，每點蓄氣多 4 點');
    for (const c of Object.values(cardById)) expect(describeCard(c, false), c.id).not.toContain('×1.3');
    // 門檻引用引擎常數：哪天改成 5，說明沒跟上會紅（推前稽核 低-4）
    expect(glossary['蓄氣']).toContain(`出招或架擋的牌一次花 ${QI_BURST_MIN} 點以上，那一招的傷害或蜷縮再 ×1.3`);
    // 下一擊準備類不套 ×1.3（effects.ts）：有這種牌花得到門檻，名詞表就要講例外（推前稽核 中-1：「現在一起上」最多花 4 點）
    const prep = Object.values(cardById).filter((c) => [...c.effects, ...(c.upgrade?.effects ?? [])]
      .some((e) => e.kind === 'nextAttackBonusSpendQi' && e.maxQi >= QI_BURST_MIN));
    expect(prep.map((c) => c.id)).toContain('fengfeng_yiqichushou');
    expect(glossary['蓄氣']).toContain('讓下一擊變強的牌不算）');
    // 使用者 2026-09-24 晚：「最多 4 點」又「4 點以上 ×1.3」讀起來像自打嘴巴 → 寫明上限 4 點的牌花滿就算
    expect(glossary['蓄氣']).toContain(`（上限剛好 ${QI_BURST_MIN} 點的牌，花滿就算；`);
    const pick = between(HERO, "hero: 'fengfeng', name: '封封'", '},');
    expect(pick).toContain("rule: '蓄氣',");
    expect(HERO).toContain("p.rule && glossary[p.rule] ? el('div', { class: 'hero-kit-row' }, el('b', {}, p.rule), el('span', {}, glossary[p.rule]!)) : '',");
    expect(COMBAT).toContain("const node = el('div', { class: 'chip good qi' }, el('b', {}, '蓄氣'), el('span', {}, `${qi}/12`));");
    expect(between(COMBAT, "const node = el('div', { class: 'chip good qi' }", 'row.append(node);')).toContain("attachTooltip(node, '蓄氣');");
  });
});
