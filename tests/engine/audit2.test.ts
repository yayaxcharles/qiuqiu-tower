import { describe, expect, it } from 'vitest';
import { STARTER_DECK } from '../../src/content/cards';
import { endTurn, startCombat } from '../../src/engine/combat';
import { Rng, seedFromString } from '../../src/engine/rng';
import { applyRunEffects, newRun, type RunGain } from '../../src/engine/run';
import { loadRun, saveRun, setStore } from '../../src/engine/save';
import { relics } from '../../src/content/relics';
import type { CombatState } from '../../src/engine/types';
import { inst } from '../helpers';

/** 2026-09-02 晚間稽核（獨立子代理）修掉的四條，各釘一個回歸 */
function start(encounterId: string, mods?: { hpMul?: number; strength?: number }): CombatState {
  return startCombat({ hp: 76, maxHp: 76, deck: STARTER_DECK.map((id, i) => inst(id, i + 1)), relics: [], potions: [], encounterId, rng: new Rng(seedFromString('audit2')), mods });
}
const SUMMON = { intent: 'summon' as const, label: '叫幫手', effects: [{ kind: 'summon' as const, enemyId: 'black_kitten', n: 1 }] };

describe('稽核修正（第二輪）', () => {
  it('M-2 敵方回合召出來的小怪：當回合不動、意圖照表、下一個敵方回合就出手', () => {
    const cs = start('wood_dummy');
    const dummy = cs.enemies[0]!;
    dummy.move = SUMMON;
    endTurn(cs);
    const kit = cs.enemies.find((e) => e.enemyId === 'black_kitten')!;
    expect(kit).toBeDefined();
    expect(kit.turnCount).toBe(0);
    expect(kit.move.label).not.toBe('剛冒出來');
    dummy.move = { intent: 'block', label: '躺', effects: [{ kind: 'block', amount: 1 }] };
    endTurn(cs);
    expect(kit.turnCount).toBe(1);   // 第二個敵方回合就照表行動，不會多發呆一回合
    expect(cs.enemyActing).toBeFalsy();
  });
  it('L-2 召喚出來的吃到遭遇的血量倍率（塔頂黑貓頭目的小黑貓 10→15）', () => {
    const cs = start('ninja_boss_top');
    const boss = cs.enemies[0]!;
    boss.move = SUMMON;
    endTurn(cs);
    const kit = cs.enemies.find((e) => e.enemyId === 'black_kitten')!;
    expect(kit.maxHp).toBe(15);
  });
  it('L-1 存檔缺忍具／秘寶／統計欄位就當不相容，不會讀進來炸畫面', () => {
    const mem = new Map<string, string>();
    setStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); }, removeItem: (k) => { mem.delete(k); } });
    const r = newRun('save-guard');
    saveRun(r);
    const key = [...mem.keys()].find((k) => k.includes('run'))!;
    const raw = JSON.parse(mem.get(key)!) as Record<string, unknown>;
    delete raw['potions'];
    mem.set(key, JSON.stringify(raw));
    expect(loadRun()).toBeNull();
  });
  it('L-4 秘寶池抽乾時要交代一句', () => {
    const r = newRun('relic-dry');
    r.relics = relics.filter((x) => x.pool === '大魔物').map((x) => x.id);
    const notes: string[] = []; const gains: RunGain[] = [];
    applyRunEffects(r, [{ kind: 'relic', pool: '大魔物' }], notes, gains);
    expect(gains).toEqual([]);
    expect(notes.some((n) => n.includes('拿過了'))).toBe(true);
  });
});

describe('師父的看破（2026-09-03 玩家回報：隱身十幾層沒觸發就被打死→使用者改成拍掉一半）', () => {
  it('拆招先把隱身拍掉一半（12→6）再打 8×2：剩下的隱身照閃，最後留 4', () => {
    const cs = start('tower_master');
    const boss = cs.enemies[0]!;
    cs.player.statuses['隱身'] = 12;
    boss.move = { intent: 'attack', label: '拆招', effects: [{ kind: 'stripPlayer', names: ['隱身', '潛水'] }, { kind: 'damage', amount: 8, times: 2 }] };
    const hp = cs.player.hp;
    endTurn(cs);
    expect(cs.player.statuses['隱身'] ?? 0).toBe(4);
    expect(cs.player.hp).toBe(hp);
    expect(cs.log.some((l) => l.includes('看穿了球球的身法'))).toBe(true);
  });
  it('拍掉一半是向下取整保留：3 層剩 1、1 層剩 0', () => {
    for (const [before, after] of [[3, 1], [2, 1], [1, 0]] as const) {
      const cs = start('tower_master');
      cs.player.statuses['隱身'] = before; cs.player.block = 99;
      cs.enemies[0]!.move = { intent: 'attack', label: '看破', effects: [{ kind: 'stripPlayer', names: ['隱身', '潛水'] }] };
      endTurn(cs);
      expect(cs.player.statuses['隱身'] ?? 0, `${before} 層`).toBe(after);
    }
  });
  it('穿心掌那種穿透攻擊，隱身還是閃得掉（沒有看破的招才靠隱身）', () => {
    const cs = start('tower_master');
    const boss = cs.enemies[0]!;
    cs.player.statuses['隱身'] = 2;
    boss.move = { intent: 'attack', label: '穿心掌', effects: [{ kind: 'damage', amount: 20, pierce: true }] };
    const hp = cs.player.hp;
    endTurn(cs);
    expect(cs.player.hp).toBe(hp);
    expect(cs.player.statuses['隱身']).toBe(1);
  });
});

