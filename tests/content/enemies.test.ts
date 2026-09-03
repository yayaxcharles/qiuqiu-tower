import { describe, expect, it } from 'vitest';
import { encounterById, encounters, encountersOfPool, enemies, enemyById } from '../../src/content/enemies';

describe('魔物資料', () => {
  it('數量：一般 58、大魔物 14、塔主 11、召喚 12', () => {
    const n = (p: string) => enemies.filter((e) => e.pool === p).length;
    // 2026-09-01 三關制內容包：塔中 7＋塔頂 5 進一般池、影球球進大魔物、
    // 關主 3→7（橘皮大王＋第二關三選一）、召喚加執事貓與女僕貓
    // 一般 46＝2026-09-02 補怪：塔中唐傘小僧、河童、豆腐小僧；塔頂烏天狗、白狐巫女、空鎧武者
    // 一般 46→58、塔主 7→11、召喚 8→10＝2026-09-02 第二波怪（docs/怪物擴充_第二波_設計稿.md）：
    // 塔下 4 隻、塔中 4 隻、塔頂 4 隻；關主蛙大名、犰狳王、沉睡的龍貓、詛咒老住持；召喚小團子、蝌蚪兵
    // 大魔物 5→14、召喚 10→12＝2026-09-03 菁英擴充（docs/菁英擴充_設計稿.md）：
    // 每關 3 隻新菁英（塔下山豬頭目、紙老虎、太鼓狸；塔中鐵羅漢、織影蜘蛛、醉拳狗；
    // 塔頂鬼將、鏡仙、虛無貓），召喚加小鬼與鏡影
    expect(n('弱') + n('中') + n('強')).toBe(58);
    expect(n('大魔物')).toBe(14); expect(n('塔主')).toBe(11); expect(n('召喚')).toBe(12);
    expect(new Set(enemies.map((e) => e.id)).size).toBe(enemies.length);
  });
  it('生命區間合法、至少一個動作、有台詞與圖', () => {
    for (const e of enemies) {
      expect(e.hp[0], e.name).toBeGreaterThan(0);
      expect(e.hp[1], e.name).toBeGreaterThanOrEqual(e.hp[0]);
      expect(e.moves.length, e.name).toBeGreaterThan(0);
      expect(e.line.length, e.name).toBeGreaterThan(0);
      expect(e.art, e.name).toMatch(/^(codex\/monster_[a-z_]+|daxia)$/);
    }
  });
  it('召喚與遭遇引用的魔物都存在，池一致', () => {
    for (const e of enemies) for (const m of e.moves) for (const fx of m.effects)
      if (fx.kind === 'summon') expect(enemyById[fx.enemyId], `${e.name} 召喚`).toBeTruthy();
    // 遭遇的池可以比成員高：兩隻全規格中型怪同場（ninja_can、vacuum_claw）
    // 實測是強怪等級的戰鬥，放中池會在 6F 把人打死（勝率 2%）；
    // 也有「一隻大的配一隻小的當添頭」的組合（bear_pup＝冬眠熊＋犰狳寶寶、rat_general＝鼠大將＋兩隻小老鼠兵），
    // 那種一次差兩階也是刻意的。**低於**成員的池仍然抓（把強怪塞進弱遭遇一定是手滑）。
    const order = ['弱', '中', '強'];
    for (const enc of encounters) {
      expect(encounterById[enc.id]).toBe(enc);
      for (const id of enc.enemies) {
        expect(enemyById[id], enc.id).toBeTruthy();
        const mp = enemyById[id]!.pool;
        if (mp === enc.pool) continue;
        // 帶隨從上場的例外：波斯大小姐開場就帶執事貓與女僕貓（僕從護體要有僕從可打）、
        // 鬼將開場就帶兩隻小鬼（一起死才算，2026-09-03 菁英擴充）
        if ((enc.pool === '塔主' || enc.pool === '大魔物') && mp === '召喚') continue;
        const ok = order.indexOf(enc.pool) - order.indexOf(mp) >= 1;
        expect(ok, `${enc.id}：成員 ${id}（${mp}）不該出現在 ${enc.pool} 遭遇`).toBe(true);
      }
    }
  });
  it('每個池都有遭遇；召喚物不在遭遇裡', () => {
    for (const p of ['弱', '中', '強', '大魔物', '塔主'] as const) expect(encountersOfPool(p).length, p).toBeGreaterThan(0);
    expect(encounters.some((enc) => enc.enemies.includes('black_kitten'))).toBe(false);
  });
  it('塔主三條血：120／240／300，血條式變身', () => {
    const boss = enemyById['tower_master']!;
    expect(boss.hp).toEqual([120, 120]);
    expect(boss.phases?.length).toBe(2);
    expect(boss.phases?.[0]?.hpBar).toBe(240);
    // 師父 3.0（2026-09-02）：每回合 +1 爪力，二階段震散你 1／1、三階段 2／2，全程不蓄力
    expect(boss.phases?.[0]?.strengthPerTurn).toBe(1);
    expect(boss.phases?.[0]?.drainPlayerPerTurn).toEqual({ 爪力: 1, 貓步: 1 });
    expect(boss.phases?.[1]?.hpBar).toBe(300);
    expect(boss.phases?.[1]?.strengthPerTurn).toBe(2);   // 第三條血每回合 +2（2026-09-03 壓到三成）
    expect(boss.phases?.[1]?.drainPlayerPerTurn).toEqual({ 爪力: 2, 貓步: 2 });
    const allMoves = [...boss.moves, ...(boss.phases ?? []).flatMap((ph) => ph.moves)];
    expect(allMoves.some((m) => m.effects.some((fx) => fx.kind === 'chargeNext'))).toBe(false);
    // 第一條血：招招都是攻擊帶防禦
    for (const m of boss.moves) {
      expect(m.effects.some((fx) => fx.kind === 'damage'), m.label).toBe(true);
      expect(m.effects.some((fx) => fx.kind === 'block'), m.label).toBe(true);
    }
  });
});
