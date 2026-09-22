import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { encounters, enemyById } from '../../src/content/enemies';
import { runEnemyEffects } from '../../src/engine/actions';
import { playCard, startCombat } from '../../src/engine/combat';
import { cardStats } from '../../src/engine/deck';
import { previewEnemyHits } from '../../src/engine/intentpreview';
import { Rng, seedFromString } from '../../src/engine/rng';
import { addStatus, getStatus } from '../../src/engine/statuses';
import type { CombatState, EnemyEffect, EnemyMove } from '../../src/engine/types';
import { inst } from '../helpers';

/**
 * 2026-09-22 第二批平衡（三個難度問題，機器人量測挑方案；數字見提交訊息與各處註解）：
 * 1. 菲菲第一關太好過 → 飛針蜷縮 2→1、淬毒 4→3（升級版都不動）
 * 2. 鐵爪機關貓太好打（靠蜷縮的角色九成以上）→ 四招攻擊全部穿透；絞刃、全開改一記 12；爪暴 5 下改 4 下
 * 3. 第三關是一道牆 → 中池魔氣 8→4；強池魔氣各少 4、血打八折
 * 這一檔把新數值釘住，改回舊數值會變紅。
 */

let uid = 70_000;

describe('菲菲的起手：飛針蜷縮 2→1、淬毒 4→3（升級版不動）', () => {
  it('數值', () => {
    expect(cardStats(inst('feifei_feizhen', 1)).effects).toEqual([
      { kind: 'damage', amount: 3 }, { kind: 'status', name: '中毒', amount: 1, target: 'enemy' }, { kind: 'blockIfPoisoned', amount: 1 }]);
    expect(cardStats(inst('feifei_feizhen', 1, true)).effects).toEqual([
      { kind: 'damage', amount: 5 }, { kind: 'status', name: '中毒', amount: 2, target: 'enemy' }, { kind: 'blockIfPoisoned', amount: 3 }]);
    expect(cardStats(inst('feifei_cuidu', 1)).effects).toEqual([{ kind: 'status', name: '中毒', amount: 3, target: 'enemy' }]);
    expect(cardStats(inst('feifei_cuidu', 1, true)).effects).toEqual([{ kind: 'status', name: '中毒', amount: 6, target: 'enemy' }]);
    expect(cardById['feifei_feizhen']!.cost).toBe(1);
    expect(cardById['feifei_cuidu']!.cost).toBe(1);
  });
  it('實際打出來：飛針打中毒的目標只多 1 點蜷縮；淬毒上 3 層', () => {
    const cs = startCombat({ hp: 70, maxHp: 70, deck: [inst('feifei_tuikai', uid++)], relics: [], potions: [], encounterId: 'wood_dummy',
      rng: new Rng(seedFromString('balance0922b-feifei')), hero: 'feifei' });
    const p = cs.player; const e = cs.enemies[0]!;
    p.hand = []; p.energy = 3; p.block = 0; e.hp = e.maxHp = 300; e.block = 0;
    const play = (id: string): void => { const u = uid++; p.hand.push({ uid: u, cardId: id, upgraded: false }); expect(playCard(cs, u, e.uid, p.seat)).toBe(true); };
    play('feifei_cuidu');
    expect(getStatus(e, '中毒')).toBe(3);
    play('feifei_feizhen');
    expect(p.block, '目標原本就中毒：1 點').toBe(1);
  });
});

describe('鐵爪機關貓：四招攻擊全部穿透，絞刃、全開一記 12，爪暴 4 下', () => {
  const def = enemyById['iron_claw']!;
  const dmgOf = (m: EnemyMove): EnemyEffect[] => m.effects.filter((f) => f.kind === 'damage');
  it('招式數值（血量 113 不動）', () => {
    expect(def.hp).toEqual([113, 113]);
    const byLabel = (ms: readonly EnemyMove[], label: string): EnemyMove => ms.find((m) => m.label === label)!;
    expect(dmgOf(byLabel(def.moves, '四連爪'))).toEqual([{ kind: 'damage', amount: 4, times: 3, pierce: true }]);
    expect(dmgOf(byLabel(def.moves, '絞刃'))).toEqual([{ kind: 'damage', amount: 12, pierce: true }]);
    expect(dmgOf(byLabel(def.phases![0]!.moves, '爪暴'))).toEqual([{ kind: 'damage', amount: 4, times: 4, pierce: true }]);
    expect(dmgOf(byLabel(def.phases![0]!.moves, '全開'))).toEqual([{ kind: 'damage', amount: 12, pierce: true }]);
    // 沒有漏網的：牠每一個打人的效果都穿透
    for (const m of [...def.moves, ...def.phases!.flatMap((ph) => ph.moves)]) for (const f of dmgOf(m)) expect(f, m.label).toMatchObject({ pierce: true });
  });

  function claw(): CombatState {
    const cs = startCombat({ hp: 70, maxHp: 70, deck: [inst('tanding', uid++)], relics: [], potions: [], encounterId: 'iron_claw',
      rng: new Rng(seedFromString('balance0922b-claw')) });
    cs.player.hp = 70; cs.player.block = 0;
    return cs;
  }
  const jiaoren = (): EnemyEffect[] => def.moves.find((m) => m.label === '絞刃')!.effects;
  it('蜷縮擋不住：30 點蜷縮挨絞刃，血照扣 12、蜷縮一點都沒少', () => {
    const cs = claw(); const p = cs.player; const e = cs.enemies[0]!;
    p.block = 30;
    runEnemyEffects(cs, e, jiaoren(), false);
    expect(70 - p.hp).toBe(12);
    expect(p.block).toBe(30);
  });
  it('隱身一層就閃掉整記絞刃（原本三下小刀要三層）', () => {
    const cs = claw(); const p = cs.player; const e = cs.enemies[0]!;
    addStatus(p, '隱身', 1);
    runEnemyEffects(cs, e, jiaoren(), false);
    expect(p.hp).toBe(70);
    expect(getStatus(p, '隱身')).toBe(0);
  });
  it('意圖預告的數字跟實際一樣，預演資料帶著穿透（有爪力時也對）', () => {
    const cs = claw(); const p = cs.player; const e = cs.enemies[0]!;
    addStatus(e, '爪力', 2);
    const hits = previewEnemyHits(e, jiaoren(), p);
    expect(hits.map((h) => h.dmg)).toEqual([14]);
    expect(hits[0]!.fx).toMatchObject({ pierce: true });
    runEnemyEffects(cs, e, jiaoren(), false);
    expect(70 - p.hp).toBe(14);
  });
});

describe('第三關放軟：中池魔氣 8→4；強池魔氣各少 4、血打八折', () => {
  const a3 = encounters.filter((e) => e.acts?.includes(3) && (e.pool === '中' || e.pool === '強'));
  it('每一組的數字', () => {
    expect(a3.length).toBe(31);
    for (const e of a3) {
      const want = e.pool === '中' ? { hpScale: 1.6, strength: 4 }
        : e.id === 'rat_general' ? { hpScale: 1.0, strength: 2 }
        : e.enemies.length === 1 ? { hpScale: 1.3, strength: 4 } : { hpScale: 0.8, strength: 2 };
      expect({ hpScale: e.hpScale, strength: e.strength }, e.id).toEqual(want);
    }
  });
  it('只動了第三關：塔頂大魔物與師父不在這次裡', () => {
    const elite = (id: string) => encounters.find((e) => e.id === id)!;
    expect(elite('mirror_sage')).toMatchObject({ hpScale: 1.2, strength: 10 });
    expect(elite('guardian_statue')).toMatchObject({ strength: 6 });
    expect(enemyById['tower_master']!.hp).toEqual([120, 120]);
  });
  it('雙人時血量倍率照樣疊上去（雙怪組 0.8 × 連線的 2.6），魔氣兩邊一樣', () => {
    const begin = (players: number): CombatState => startCombat({ hp: 70, maxHp: 70, deck: [inst('tanding', uid++)], relics: [], potions: [],
      encounterId: 'wraith_armor', rng: new Rng(seedFromString('balance0922b-coop')), players });
    const solo = begin(1); const duo = begin(2);
    for (const [i, e] of solo.enemies.entries()) {
      const [lo, hi] = enemyById[e.enemyId]!.hp;
      expect(e.maxHp).toBeGreaterThanOrEqual(Math.round(lo * 0.8));
      expect(e.maxHp).toBeLessThanOrEqual(Math.round(hi * 0.8));
      const d = duo.enemies[i]!;
      expect(d.maxHp).toBeGreaterThanOrEqual(Math.round(lo * 0.8 * 2.6));
      expect(d.maxHp).toBeLessThanOrEqual(Math.round(hi * 0.8 * 2.6));
      expect(getStatus(e, '爪力')).toBe(2);
      expect(getStatus(d, '爪力')).toBe(2);
    }
  });
});
