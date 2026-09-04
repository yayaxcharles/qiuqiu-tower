// 遭遇修飾詞（使用者 2026-09-04 拍板）：地圖上就標出來、有得有失、一般怪與菁英同一張表
import { describe, expect, it } from 'vitest';

import { enemyById } from '../../src/content/enemies';
import { ENCOUNTER_MODIFIERS, modifierById } from '../../src/content/modifiers';
import { generateMap } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';
import { beginCombat, finishCombat, newRun } from '../../src/engine/run';
import { loadRun, saveRun, setStore } from '../../src/engine/save';
import { getStatus } from '../../src/engine/statuses';
import type { CombatState } from '../../src/engine/types';

/** 開一場帶指定修飾詞的一般戰鬥（同一個種子，所以有沒有修飾詞可以直接對照） */
function fight(modifier?: string): CombatState {
  const run = newRun('mods');
  const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
  node.modifier = modifier;
  run.currentNode = node.id;
  return beginCombat(run);
}

describe('修飾詞表', () => {
  it('七個修飾詞，每個都有名字與給玩家看的說明', () => {
    expect(ENCOUNTER_MODIFIERS).toHaveLength(7);
    for (const m of ENCOUNTER_MODIFIERS) {
      expect(m.label.length, m.id).toBeGreaterThan(1);
      expect(m.desc.length, m.id).toBeGreaterThan(4);
    }
  });

  it('名字都以「的」結尾：地圖上要直接接在怪名前面（「暴怒的老鼠群」）', () => {
    for (const m of ENCOUNTER_MODIFIERS) expect(m.label.endsWith('的'), m.label).toBe(true);
  });

  it('id 不重複，查得到', () => {
    for (const m of ENCOUNTER_MODIFIERS) expect(modifierById[m.id]).toBe(m);
    expect(Object.keys(modifierById)).toHaveLength(7);
  });
});

describe('修飾詞套用到整場的每一隻魔物', () => {
  it('沒有修飾詞就什麼都不變', () => {
    const cs = fight();
    for (const e of cs.enemies) expect(getStatus(e, '爪力')).toBe(0);
  });

  it('暴怒的：每隻爪力 +2、最大生命剩九成', () => {
    const base = fight(), cs = fight('furious');
    expect(cs.enemies).toHaveLength(base.enemies.length);
    cs.enemies.forEach((e, i) => {
      expect(getStatus(e, '爪力'), e.name).toBe(2);
      expect(e.maxHp, e.name).toBe(Math.round(base.enemies[i]!.maxHp * 0.9));
      expect(e.hp, `${e.name} 開場是滿血`).toBe(e.maxHp);
    });
  });

  it('打瞌睡的：每隻先睡兩回合（定身 2），但生命多兩成', () => {
    const base = fight(), cs = fight('dozing');
    cs.enemies.forEach((e, i) => {
      expect(getStatus(e, '定身'), e.name).toBe(2);
      expect(e.maxHp, e.name).toBe(Math.round(base.enemies[i]!.maxHp * 1.2));
    });
  });

  it('疲憊的：生命 −15%，但開場先架好 8 點防禦', () => {
    const base = fight(), cs = fight('weary');
    cs.enemies.forEach((e, i) => {
      expect(e.maxHp, e.name).toBe(Math.round(base.enemies[i]!.maxHp * 0.85));
      expect(e.block - base.enemies[i]!.block, e.name).toBe(8);
    });
  });

  it('查不到的修飾詞 id 當作沒有（舊存檔或改表之後不要炸）', () => {
    const base = fight(), cs = fight('沒有這個');
    cs.enemies.forEach((e, i) => expect(e.maxHp).toBe(base.enemies[i]!.maxHp));
  });
});

describe('地圖生成時就抽好修飾詞', () => {
  /** 跑 N 張地圖，統計某一關的戰鬥／菁英節點裡有修飾詞的比例 */
  function rate(act: number, n = 150): number {
    let total = 0, withMod = 0;
    for (let i = 0; i < n; i++) {
      const map = generateMap(new Rng(seedFromString(`m${act}-${i}`)), { act });
      for (const node of map.nodes) {
        if (node.type !== '戰鬥' && node.type !== '大魔物') continue;
        total++;
        if (node.modifier) withMod++;
      }
    }
    return withMod / total;
  }

  it('只有一般戰鬥與菁英會有；關主、事件、貓窩、罐頭鋪、紙箱都不會', () => {
    for (let i = 0; i < 40; i++) {
      for (const act of [1, 2, 3]) {
        const map = generateMap(new Rng(seedFromString(`clean${act}-${i}`)), { act });
        for (const node of map.nodes) {
          if (node.type === '戰鬥' || node.type === '大魔物') continue;
          expect(node.modifier, `${node.type} 不該有修飾詞`).toBeUndefined();
        }
      }
    }
  });

  it('抽到的一定是表裡有的 id', () => {
    for (let i = 0; i < 40; i++) {
      const map = generateMap(new Rng(seedFromString(`id${i}`)), { act: 3 });
      for (const node of map.nodes) {
        if (node.modifier) expect(modifierById[node.modifier], node.modifier).toBeDefined();
      }
    }
  });

  it('第一關 15%、第二關 25%、第三關 30%：越往上越不安定', () => {
    const [a1, a2, a3] = [rate(1), rate(2), rate(3)];
    expect(a1, `第一關 ${(a1 * 100).toFixed(1)}%`).toBeGreaterThan(0.10);
    expect(a1, `第一關 ${(a1 * 100).toFixed(1)}%`).toBeLessThan(0.21);
    expect(a2, `第二關 ${(a2 * 100).toFixed(1)}%`).toBeGreaterThan(0.19);
    expect(a2, `第二關 ${(a2 * 100).toFixed(1)}%`).toBeLessThan(0.31);
    expect(a3, `第三關 ${(a3 * 100).toFixed(1)}%`).toBeGreaterThan(0.24);
    expect(a3, `第三關 ${(a3 * 100).toFixed(1)}%`).toBeLessThan(0.36);
    expect(a1).toBeLessThan(a2);
    expect(a2).toBeLessThan(a3);
  });
});

describe('修飾詞掛在獎勵上', () => {
  /** 開一場帶修飾詞的戰鬥、直接判贏，拿到戰利品 */
  function loot(modifier?: string) {
    const run = newRun('rew');
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    node.modifier = modifier;
    run.currentNode = node.id;
    const cs = beginCombat(run);
    for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
    cs.phase = 'won';
    return finishCombat(run, cs)!;
  }

  it('肥美的：小魚乾加倍', () => {
    expect(loot('plump').fish).toBe(loot().fish * 2);
  });

  it('餓扁了的：小魚乾剩一半', () => {
    expect(loot('starved').fish).toBe(Math.round(loot().fish * 0.5));
  });

  it('中了魔氣的：可以挑的牌多一張', () => {
    expect(loot('miasmic').cards.length).toBe(loot().cards.length + 1);
  });

  it('暴怒的沒有掛獎勵：戰利品跟沒修飾詞時一樣', () => {
    const a = loot('furious'), b = loot();
    expect(a.fish).toBe(b.fish);
    expect(a.cards.length).toBe(b.cards.length);
  });
});

describe('舊存檔相容', () => {
  it('存檔的節點沒有 modifier 這一欄照樣讀得起來，讀回來就是沒有修飾詞', () => {
    const m = new Map<string, string>();
    setStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } });
    const run = newRun('old-save');
    // 模擬修飾詞上線前存下來的檔：整張地圖都沒有這一欄
    for (const n of run.map.nodes) delete n.modifier;
    saveRun(run);
    expect(m.get('qiuqiu-tower/run')).not.toContain('modifier');
    const back = loadRun();
    expect(back, '舊存檔不該被判定為壞檔清掉').not.toBeNull();
    expect(back!.map.nodes.every((n) => n.modifier === undefined)).toBe(true);
  });
});

describe('修飾詞會改魔物的名字（使用者 2026-09-04）', () => {
  /** 指定遭遇開打，節點的修飾詞照樣生效 */
  function fightEnc(modifier: string | undefined, encounterId: string): CombatState {
    const run = newRun('rename');
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    node.modifier = modifier;
    run.currentNode = node.id;
    return beginCombat(run, encounterId);
  }

  it('整場每一隻都冠上修飾詞（「暴怒的老鼠」）', () => {
    const base = fightEnc(undefined, 'rats3'), cs = fightEnc('furious', 'rats3');
    expect(cs.enemies.length).toBeGreaterThan(1);
    cs.enemies.forEach((e, i) => expect(e.name).toBe('暴怒的' + base.enemies[i]!.name));
  });

  it('開場白已經用舊名字印過的要一起改寫：紀錄裡不會同一隻兩個名字', () => {
    const base = fightEnc(undefined, 'rats3'), cs = fightEnc('miasmic', 'rats3');
    const oldNames = [...new Set(base.enemies.map((e) => e.name))];
    // 開場白確實有印（不然這條測試等於沒測到東西）
    expect(base.log.some((l) => oldNames.some((n) => l.startsWith(n + '：')))).toBe(true);
    for (const l of cs.log) {
      for (const n of oldNames) expect(l.startsWith(n + '：'), `紀錄還留著舊名字：${l}`).toBe(false);
    }
    expect(cs.log.some((l) => l.startsWith('中了魔氣的' + oldNames[0] + '：'))).toBe(true);
  });

  it('沒有修飾詞就不改名', () => {
    const cs = fightEnc(undefined, 'rats3');
    for (const e of cs.enemies) expect(e.name).toBe(enemyById[e.enemyId]!.name);
  });

  it('紀錄裡講一句這個修飾詞在做什麼', () => {
    const cs = fightEnc('plump', 'rats3');
    expect(cs.log.some((l) => l.includes('小魚乾加倍'))).toBe(true);
  });
});
