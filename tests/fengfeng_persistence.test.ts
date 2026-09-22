import { describe, expect, it } from 'vitest';
import { damagePlayer } from '../src/engine/actions';
import { playCard, startCombat } from '../src/engine/combat';
import { beginCombat, finishCombat, newCoopRun, newRun, revivePartner } from '../src/engine/run';
import { checkRun, loadRun, saveRun, setStore } from '../src/engine/save';
import { combatFingerprint } from '../src/net/hash';
import { Rng, seedFromString } from '../src/engine/rng';
import { inst } from './helpers';

describe('封封 FG-T18：生命週期、舊存檔與鎖步', () => {
  it('新戰鬥先歸零再由舊劍穗給 2 氣，正式倒下清零', () => {
    const cs = startCombat({ hp: 70, maxHp: 70, deck: [inst('fengfeng_hushen', 1)], relics: ['old_sword_tassel'], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('fengfeng-life')), hero: 'fengfeng' });
    const p = cs.player;
    expect(p.qi).toBe(2);
    p.qi = 12; p.hp = 1;
    damagePlayer(cs, cs.enemies[0]!, 5, { direct: true, victim: p });
    expect(p.down).toBe(true);
    expect(p.qi).toBe(0);
    p.down = false; p.hp = 10;
    expect(p.qi, '復起不重發舊劍穗').toBe(0);
  });

  it('最後一隻魔物倒下時立即清掉蓄氣與玩家階段準備', () => {
    const cs = startCombat({ hp: 70, maxHp: 70, deck: [inst('fengfeng_hushen', 1)], relics: [], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('fengfeng-win')), hero: 'fengfeng' });
    const p = cs.player; p.energy = 9; p.qi = 7; p.nextAttackBonus = 9; p.energyGainBlockedThisPhase = true;
    const card = inst('fengfeng_tanbu', 88_001); p.hand.push(card); cs.enemies[0]!.hp = 1;
    expect(playCard(cs, card.uid, cs.enemies[0]!.uid)).toBe(true);
    expect(cs.phase).toBe('won');
    expect([p.qi, p.nextAttackBonus, p.energyGainBlockedThisPhase]).toEqual([0, undefined, undefined]);
  });

  it('蓄氣、下一擊、能力觸發次數與飯糰封禁都進戰鬥指紋', () => {
    const make = () => startCombat({ hp: 70, maxHp: 70, deck: [inst('fengfeng_hushen', 1)], relics: [], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('fengfeng-fp')), hero: 'fengfeng' });
    const base = combatFingerprint(make());
    for (const mutate of [
      (p: ReturnType<typeof make>['player']) => { p.qi = 1; },
      (p: ReturnType<typeof make>['player']) => { p.nextAttackBonus = 5; },
      (p: ReturnType<typeof make>['player']) => { p.energyGainBlockedThisPhase = true; },
      (p: ReturnType<typeof make>['player']) => { p.powers.push({ trigger: 'afterCard', effects: [], cardId: 'fengfeng_xunxi', firedTurn: 1 }); },
    ]) {
      const cs = make(); mutate(cs.player); expect(combatFingerprint(cs)).not.toBe(base);
    }
  });

  it('封封整局可通過存檔驗證；舊存檔缺新戰鬥欄位仍以零為預設', () => {
    const run = newRun('fengfeng-save', 1, 'fengfeng');
    expect(checkRun(structuredClone(run))?.players[0]?.hero).toBe('fengfeng');
    const cs = startCombat({ hp: 70, maxHp: 70, deck: [inst('fengfeng_hushen', 1)], relics: [], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('old-combat')), hero: 'fengfeng' });
    delete cs.player.qi;
    expect(combatFingerprint(cs)).toBeTypeOf('string');
  });

  it('合作戰後倒下席可保存載回並在貓窩扶起，非法生命組合仍拒讀', () => {
    const memory = new Map<string, string>();
    setStore({
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => { memory.set(key, value); },
      removeItem: (key) => { memory.delete(key); },
    });
    const run = newCoopRun('fengfeng-downed-save', 1, 'fengfeng', 'fengfeng');
    const cs = beginCombat(run, 'wood_dummy');
    const downed = cs.players[1]!;
    downed.down = true;
    downed.hp = 0;
    cs.phase = 'won';
    for (const enemy of cs.enemies) { enemy.dead = true; enemy.hp = 0; }
    finishCombat(run, cs);

    saveRun(run);
    const loaded = loadRun();
    expect(loaded?.players).toHaveLength(2);
    expect(loaded?.players[1]).toMatchObject({ down: true, hp: 0 });
    expect(revivePartner(loaded!, 1)).toBe(true);
    expect(loaded?.players[1]?.down).toBe(false);
    expect(loaded?.players[1]?.hp).toBeGreaterThan(0);

    for (const state of [
      { down: true, hp: -1 },
      { down: false, hp: 0 },
      { down: true, hp: 1 },
    ]) {
      const bad = newCoopRun(`fengfeng-bad-save-${state.down}-${state.hp}`, 1, 'fengfeng', 'fengfeng');
      Object.assign(bad.players[1]!, state);
      expect(checkRun(bad), JSON.stringify(state)).toBeNull();
    }
  });
});
