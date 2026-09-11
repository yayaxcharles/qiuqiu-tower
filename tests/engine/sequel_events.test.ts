// 事件前後集、關主前綴、代價秘寶（2026-09-04）
import { describe, expect, it } from 'vitest';
import { eventById, events } from '../../src/content/events';
import { relicById } from '../../src/content/relics';
import { applyEffects } from '../../src/engine/effects';
import { startCombat } from '../../src/engine/combat';
import { generateMap } from '../../src/engine/map';
import { applyRunEffects, beginCombat, newRun, takeRelic, BOSS_PREFIXES } from '../../src/engine/run';
import { Rng, seedFromString } from '../../src/engine/rng';
import { getStatus } from '../../src/engine/statuses';

describe('事件前後集', () => {
  it('後集要有前集旗標才排進地圖，而且只在二三關', () => {
    const sequels = events.filter((e) => e.requiresFlag);
    expect(sequels.length).toBe(5);
    for (const s of sequels) expect(s.acts).toEqual([2, 3]);
    const ids = (flags: Record<string, boolean>, act: number) => {
      const set = new Set<string>();
      for (let i = 0; i < 40; i++) for (const n of generateMap(new Rng(seedFromString(`sq${i}`)), { act, flags }).nodes) if (n.eventId) set.add(n.eventId);
      return set;
    };
    const none = ids({}, 2);
    for (const s of sequels) expect(none.has(s.id), `${s.id} 沒旗標不該出現`).toBe(false);
    const paid = ids({ toll_paid: true }, 2);
    expect(paid.has('toll_again_paid')).toBe(true);
    expect(paid.has('toll_again_fought')).toBe(false);
    const act1 = ids({ toll_paid: true, robin_shared: true }, 1);
    for (const s of sequels) expect(act1.has(s.id), `${s.id} 第一關不該出現`).toBe(false);
  });
  it('前集選項會記旗標；flag 效果寫進 run.flags', () => {
    const run = newRun('flag');
    const toll = eventById['toll']!;
    applyRunEffects(run, toll.choices[0]!.outcome);
    expect(run.flags['toll_paid']).toBe(true);
    const rescue = eventById['rescue']!;
    applyRunEffects(run, rescue.choices[1]!.outcome);
    expect(run.flags['rescue_took_fish']).toBe(true);
    expect(run.fish).toBeGreaterThan(0);
  });
});

describe('關主隨機前綴', () => {
  it('塔下關主約三成五抽到前綴、名字換掉、數值照前綴改；第三關師父不抽', () => {
    let prefixed = 0; const N = 200;
    for (let i = 0; i < N; i++) {
      const run = newRun(`pf${i}`);
      const cs = beginCombat(run, 'orange_king');
      const boss = cs.enemies[0]!;
      const p = BOSS_PREFIXES.find((x) => boss.name.startsWith(x.label));
      if (!p) { expect(boss.name).toBe('橘皮大王'); continue; }
      prefixed++;
      if (p.label === '暴怒的') expect(getStatus(boss, '爪力')).toBeGreaterThanOrEqual(2);
      if (p.label === '疲憊的') expect(boss.block).toBeGreaterThanOrEqual(8);
      if (p.label === '披甲的') expect(getStatus(boss, '鱗甲')).toBe(2);
      expect(boss.hp).toBe(boss.maxHp);
      expect(cs.log.some((l) => l.startsWith(boss.name))).toBe(true);
    }
    expect(prefixed / N).toBeGreaterThan(0.2); expect(prefixed / N).toBeLessThan(0.5);
    for (let i = 0; i < 30; i++) {
      const run = newRun(`pf3-${i}`); run.act = 3;
      const cs = beginCombat(run, 'tower_master');
      expect(cs.enemies[0]!.name).toBe('走火入魔的大俠貓');
    }
  });
});

describe('代價秘寶', () => {
  /*
   * 「秘寶的代價不會把球球打死」這道護欄（稽核 2026-09-04 高 1）。
   *
   * 2026-09-11 起**沒有任何秘寶在用開戰扣血**——鐵砂衣的那筆被拿掉了
   *（使用者：「不該扣血，只有好處就好」）。但護欄要留著：`selfDamage` 這個效果
   * 還在，下一件有代價的秘寶會再走同一條路。
   * 所以測試從「用鐵砂衣走一遍」改成**直接驗效果本身**，不然這條會變成
   * 「測一件不存在的東西」，哪天護欄被拿掉也沒人發現。
   */
  it('秘寶來源的自傷至少留 1 血，而且留一行紀錄（稽核 2026-09-04 高 1）', () => {
    const cs = startCombat({ hp: 3, maxHp: 70, deck: [], relics: [], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('cost')) });
    applyEffects(cs, [{ kind: 'selfDamage', amount: 4 }], { source: 'relic' });
    expect(cs.player.hp, '扣不死').toBe(1);
    expect(cs.phase, '也不會判成敗北').toBe('player');
    expect(cs.log.some((l) => l.includes('秘寶的代價')), '代價要講清楚').toBe(true);

    // 只剩 1 滴血時完全不扣（`amount <= 0` 就直接返回），也不該多印一行
    const cs2 = startCombat({ hp: 1, maxHp: 70, deck: [], relics: [], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('cost2')) });
    const before = cs2.log.length;
    applyEffects(cs2, [{ kind: 'selfDamage', amount: 4 }], { source: 'relic' });
    expect(cs2.player.hp).toBe(1);
    expect(cs2.log.length, '什麼都沒發生就不要印').toBe(before);
  });

  it('**牌**打出來的自傷照扣（護欄只保護秘寶的代價，不是萬用免死金牌）', () => {
    const cs = startCombat({ hp: 3, maxHp: 70, deck: [], relics: [], potions: [],
      encounterId: 'wood_dummy', rng: new Rng(seedFromString('cardcost')) });
    applyEffects(cs, [{ kind: 'selfDamage', amount: 4 }], { source: 'card' });
    expect(cs.player.hp, '鐵頭功那種自己打自己的，該死就是會死').toBe(0);
  });

  it('鐵砂衣只剩好處：留 6 點蜷縮，沒有任何代價', () => {
    const vest = relicById['iron_sand_vest'];
    expect(vest?.hooks.blockKeep).toBe(6);
    expect(vest?.hooks.combatStart, '開戰不該再有任何代價').toBeUndefined();
    expect(vest?.text).not.toContain('失去');
  });
  it('血契短刀：開戰 +3 爪力、最大生命 −12；貪吃錢袋：店價漲三成', () => {
    const run = newRun('costly');
    const hp0 = run.maxHp;
    takeRelic(run, 'blood_dagger');
    expect(run.maxHp).toBe(hp0 - 12);
    expect(run.hp).toBeLessThanOrEqual(run.maxHp);
    const cs = beginCombat(run, 'wood_dummy');
    expect(getStatus(cs.player, '爪力')).toBe(3);
    expect(relicById['glutton_purse']!.hooks.shopDiscount).toBe(1.3);
  });
});
