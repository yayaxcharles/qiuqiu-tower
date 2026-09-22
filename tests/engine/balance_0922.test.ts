import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { relicById } from '../../src/content/relics';
import { canPlay, endTurn, playCard, startCombat } from '../../src/engine/combat';
import { cardStats } from '../../src/engine/deck';
import type { Hero } from '../../src/engine/hero';
import { Rng, seedFromString } from '../../src/engine/rng';
import type { CombatState, PlayerCombat } from '../../src/engine/types';
import { inst } from '../helpers';

/**
 * 2026-09-22 平衡調整（使用者裁定：封封「方案三」、噹噹修銅牆鐵壁）。
 *
 * 修好量測機器人之後，封封 600 局平均只爬到 17.9 層（球球 22.4）；
 * 噹噹的銅牆鐵壁是「拿了反而變弱」的陷阱稀有牌。這一檔把新數值釘住，
 * 改回舊數值會變紅。量測數字見提交訊息。
 */

let uid = 60_000;
function setup(hero: Hero, relics: string[] = []): { cs: CombatState; p: PlayerCombat } {
  const cs = startCombat({ hp: 80, maxHp: 80, deck: [inst('fengfeng_hushen', uid++)], relics, potions: [], encounterId: 'wood_dummy',
    rng: new Rng(seedFromString(`balance0922-${hero}`)), hero });
  const p = cs.player;
  p.hand = []; p.drawPile = []; p.discardPile = []; p.energy = 3; p.block = 0;
  const e = cs.enemies[0]!; e.hp = e.maxHp = 300; e.block = 0;
  return { cs, p };
}
function play(cs: CombatState, p: PlayerCombat, id: string, target?: number, upgraded = false): boolean {
  const u = uid++;
  p.hand.push({ uid: u, cardId: id, upgraded });
  return playCard(cs, u, target, p.seat);
}

describe('封封：吐納 1 費 → 0 費', () => {
  it('沒升級、升級都是 0 費；升級仍多 2 點氣（3 → 5）', () => {
    expect(cardStats(inst('fengfeng_tuna', 1)).cost).toBe(0);
    expect(cardStats(inst('fengfeng_tuna', 1, true)).cost).toBe(0);
    expect(cardStats(inst('fengfeng_tuna', 1)).effects).toEqual([{ kind: 'gainQi', n: 3 }]);
    expect(cardStats(inst('fengfeng_tuna', 1, true)).effects).toEqual([{ kind: 'gainQi', n: 5 }]);
  });
  it('飯糰吃光了照樣打得出來', () => {
    const { cs, p } = setup('fengfeng'); p.energy = 0; p.qi = 0;
    const u = uid++; p.hand.push({ uid: u, cardId: 'fengfeng_tuna', upgraded: false });
    expect(canPlay(cs, u, undefined, 0).ok).toBe(true);
    expect(playCard(cs, u, undefined, 0)).toBe(true);
    expect(p.qi).toBe(3);
  });
});

/*
 * 舊劍穗試過多給「每回合開始 1 點蓄氣」，機器人學會挑封封的好牌之後量出來偏強
 *（600 局平均 24.2 層、球球 22.4），使用者裁定拿掉。這一段盯住「只在開場給 2 點」，
 * 以免哪天有人照舊方案又加回去卻沒重量。
 */
describe('封封：舊劍穗維持開場 2 點蓄氣（每回合 +1 試過、拿掉）', () => {
  it('只有開場那一條；之後的回合不再自己長氣', () => {
    expect(relicById['old_sword_tassel']!.hooks).toEqual({ combatStart: [{ kind: 'gainQi', n: 2 }] });
    const cs = startCombat({ hp: 80, maxHp: 80, deck: [inst('fengfeng_hushen', uid++)], relics: ['old_sword_tassel'], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('balance0922-tassel')), hero: 'fengfeng' });
    expect(cs.player.qi).toBe(2);
    endTurn(cs);
    expect(cs.player.qi, '蓄氣跨回合保留，但不會再加').toBe(2);
  });
  it('說明文字跟效果一致（秘寶說明是手寫的，不會自動跟著效果變）', () => {
    expect(relicById['old_sword_tassel']!.text).toBe('每場戰鬥開始時獲得 2 點蓄氣。');
  });
});

describe('封封：花蓄氣的牌每點蓄氣多 1 點效果', () => {
  // 牌 → 新的每氣係數（原本各少 1）。升級版的係數跟沒升級一樣
  const PER_QI: Record<string, number> = {
    fengfeng_pingzhan: 3, fengfeng_hengsao: 2, fengfeng_tabu: 3, fengfeng_huibu: 3, fengfeng_chuantang: 3,
    fengfeng_shuangduan: 2, fengfeng_huzhou: 3, fengfeng_zhenshou: 3, fengfeng_youbian: 3, fengfeng_husong: 3,
    fengfeng_duanliu: 4, fengfeng_kaishan: 3, fengfeng_pozhen: 3, fengfeng_yiqichushou: 2,
  };
  it('14 張（含連線專用三張）逐張、升級前後都是新係數，沒有漏掉任何一張花氣牌', () => {
    const spenders = Object.values(cardById).filter((d) => d.effects.some((e) =>
      e.kind === 'damageSpendQi' || e.kind === 'blockSpendQi' || e.kind === 'nextAttackBonusSpendQi')).map((d) => d.id);
    expect(spenders.sort()).toEqual(Object.keys(PER_QI).sort());
    for (const [id, k] of Object.entries(PER_QI)) for (const up of [false, true]) {
      const fx = cardStats(inst(id, 1, up)).effects.find((e) =>
        e.kind === 'damageSpendQi' || e.kind === 'blockSpendQi' || e.kind === 'nextAttackBonusSpendQi');
      expect((fx as { perQi: number }).perQi, `${id}${up ? '＋' : ''}`).toBe(k);
    }
  });
  it('實際打出來：平斬 2 氣打 11、斷流 5 氣打 30、振袖收劍 3 氣給 16 點蜷縮', () => {
    const a = setup('fengfeng'); const ea = a.cs.enemies[0]!;
    a.p.qi = 2; play(a.cs, a.p, 'fengfeng_pingzhan', ea.uid);
    expect(300 - ea.hp).toBe(11);
    const b = setup('fengfeng'); const eb = b.cs.enemies[0]!;
    b.p.qi = 5; play(b.cs, b.p, 'fengfeng_duanliu', eb.uid);
    expect(300 - eb.hp).toBe(30);
    const c = setup('fengfeng');
    c.p.qi = 3; play(c.cs, c.p, 'fengfeng_zhenshou');
    expect(c.p.block).toBe(16);
  });
});

describe('噹噹：銅牆鐵壁 3 費（升級 2）→ 2 費（升級 1），打出時先給 8 點蜷縮', () => {
  it('費用', () => {
    expect(cardStats(inst('dangdang_tongqiang', 1)).cost).toBe(2);
    expect(cardStats(inst('dangdang_tongqiang', 1, true)).cost).toBe(1);
  });
  it('打出去：先拿 8 點蜷縮，之後卸蜷縮只卸一半的效果照舊', () => {
    const { cs, p } = setup('dangdang');
    expect(play(cs, p, 'dangdang_tongqiang')).toBe(true);
    expect(p.energy).toBe(1);
    expect(p.block).toBe(8);
    expect(p.halfSpendBlock).toBe(true);
    // 卸力掌：卸掉 3 點（6 的一半）打出 6 點
    const e = cs.enemies[0]!;
    play(cs, p, 'dangdang_xieli', e.uid);
    expect(300 - e.hp).toBe(6);
    expect(p.block).toBe(5);
  });
});
