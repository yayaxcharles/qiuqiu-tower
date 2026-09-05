// 遭遇修飾詞（使用者 2026-09-04 拍板）：地圖上就標出來、有得有失、一般怪與菁英同一張表
import { describe, expect, it } from 'vitest';

import { enemyById } from '../../src/content/enemies';
import { ENCOUNTER_MODIFIERS, modifierById } from '../../src/content/modifiers';
import { generateMap } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';
import { endTurn } from '../../src/engine/combat';
import { beginCombat, finishCombat, newRun, takeRelic } from '../../src/engine/run';
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
    expect(cs.enemies.length).toBeGreaterThan(0);
    for (const e of cs.enemies) {
      const def = enemyById[e.enemyId]!;
      expect(e.name, '名字').toBe(def.name);
      expect(getStatus(e, '爪力'), '爪力').toBe(0);
      expect(getStatus(e, '鱗甲'), '鱗甲').toBe(0);
      expect(getStatus(e, '定身'), '定身').toBe(0);
      expect(e.hp, '滿血').toBe(e.maxHp);
    }
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

  it('打瞌睡的：每隻先睡一回合（定身 1，下一輪平衡 2026-09-05 從 2 改），但生命多兩成', () => {
    const base = fight(), cs = fight('dozing');
    cs.enemies.forEach((e, i) => {
      expect(getStatus(e, '定身'), e.name).toBe(1);
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
      const map = generateMap(new Rng(seedFromString(`m${act}-${i}`)), { act, difficulty: 2 });
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
        const map = generateMap(new Rng(seedFromString(`clean${act}-${i}`)), { act, difficulty: 2 });
        for (const node of map.nodes) {
          if (node.type === '戰鬥' || node.type === '大魔物') continue;
          expect(node.modifier, `${node.type} 不該有修飾詞`).toBeUndefined();
        }
      }
    }
  });

  it('抽到的一定是表裡有的 id', () => {
    for (let i = 0; i < 40; i++) {
      const map = generateMap(new Rng(seedFromString(`id${i}`)), { act: 3, difficulty: 2 });
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

  it('肥美的：小魚乾多 40 條（下一輪平衡 2026-09-05 從加倍改固定）', () => {
    expect(loot('plump').fish).toBe(loot().fish + 40);
  });

  it('餓扁了的：小魚乾少 15 條（從砍半改固定）', () => {
    expect(loot('starved').fish).toBe(Math.max(0, loot().fish - 15));
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
    // 這一條才是重點：有人為了新欄位順手升版本，loadRun 會把玩家進行中的局整個清掉
    expect(back!.version, '加可選欄位不可以升存檔版本').toBe(1);
    expect(back!.map.nodes.every((n) => n.modifier === undefined)).toBe(true);
  });
});

describe('修飾詞會改魔物的名字（使用者 2026-09-04）', () => {
  /** 指定遭遇開打，節點的修飾詞照樣生效 */
  function fightEnc(modifier: string | undefined, encounterId: string): CombatState {
    const run = newRun('rename');
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    node.modifier = modifier;
    node.encounterId = encounterId;   // 護欄會擋「節點標的跟實際打的不是同一場」，這裡要對齊
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
    expect(cs.log.some((l) => l.includes('小魚乾多 40 條'))).toBe(true);
  });
});

describe('小魚乾固定加減，秘寶承諾的加成一條不少（稽核 2026-09-04 夜 M-2；2026-09-05 改固定值後仍要成立）', () => {
  /** 帶著兩件加小魚乾的秘寶（+10、+20）打贏一場 */
  function lootWithRelics(modifier?: string) {
    const run = newRun('relic-mul');
    takeRelic(run, 'fish_jar');    // 打贏 +10
    takeRelic(run, 'lucky_coin');  // 打贏 +20
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    node.modifier = modifier;
    node.encounterId = 'rats3';
    run.currentNode = node.id;
    const cs = beginCombat(run, 'rats3');
    for (const e of cs.enemies) { e.hp = 0; e.dead = true; }
    cs.phase = 'won';
    return finishCombat(run, cs)!;
  }

  it('餓扁了的：少 15 條，但秘寶承諾的 30 條一條不少', () => {
    const base = lootWithRelics(), cut = lootWithRelics('starved');
    expect(cut.fish).toBe(base.fish - 15);
    expect(cut.fish, '秘寶的 30 條不該被砍').toBeGreaterThanOrEqual(30);
  });

  it('肥美的：多 40 條，秘寶的 30 條不會跟著變', () => {
    const base = lootWithRelics(), fat = lootWithRelics('plump');
    expect(fat.fish).toBe(base.fish + 40);
  });
});

describe('護欄與邊界（稽核 2026-09-04 夜）', () => {
  it('節點標的跟實際打的不是同一場，修飾詞不生效（事件戰、前哨戰這類覆寫遭遇的路徑）', () => {
    const run = newRun('guard');
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    node.modifier = 'furious';
    node.encounterId = 'rats3';
    run.currentNode = node.id;
    const cs = beginCombat(run, 'tanuki_gang');   // 事件戰那樣覆寫掉遭遇
    for (const e of cs.enemies) {
      expect(getStatus(e, '爪力'), e.name).toBe(0);
      expect(e.name).toBe(enemyById[e.enemyId]!.name);
    }
  });

  it('伏兵是戰鬥中才冒出來的：不冠名、也不吃修飾詞的效果', () => {
    const run = newRun('ambush-mod');
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    node.modifier = 'furious';
    node.encounterId = 'kappa';
    run.currentNode = node.id;
    const cs = beginCombat(run, 'kappa');
    expect(cs.enemies[0]!.name).toBe('暴怒的' + enemyById['kappa']!.name);
    for (let i = 0; i < 3; i++) { cs.player.block = 999; endTurn(cs); }
    const tadpoles = cs.enemies.filter((e) => e.enemyId === 'tadpole');
    expect(tadpoles.length, '第 3 回合的伏兵該來了').toBe(2);
    for (const t of tadpoles) {
      expect(t.name, '半路加入的不冠名').toBe(enemyById['tadpole']!.name);
      expect(getStatus(t, '爪力'), '半路加入的不吃效果').toBe(0);
    }
  });

  it('被竄改的存檔寫進物件原型上的字（constructor、__proto__）不會當成修飾詞', () => {
    for (const bad of ['constructor', '__proto__', 'toString']) {
      const run = newRun('proto');
      const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
      node.modifier = bad;
      run.currentNode = node.id;
      const cs = beginCombat(run);
      for (const e of cs.enemies) expect(e.name, bad).toBe(enemyById[e.enemyId]!.name);
      expect(cs.log.some((l) => l.includes('undefined')), bad).toBe(false);
    }
  });
});

describe('修飾詞撞上既有機制不可以反轉成純加強（稽核 2026-09-04 夜 L-3、L-4）', () => {
  function one(modifier: string | undefined, encounterId: string) {
    const run = newRun('clash');
    const node = run.map.nodes.find((n) => n.type === '戰鬥')!;
    node.modifier = modifier;
    node.encounterId = encounterId;
    run.currentNode = node.id;
    return beginCombat(run, encounterId).enemies[0]!;
  }

  it('鐵羅漢帶「不壞身」（防禦不歸零）：疲憊的那 8 點防禦不能給，不然變永久護盾', () => {
    const base = one(undefined, 'iron_arhat'), weary = one('weary', 'iron_arhat');
    expect(getStatus(base, '不壞身'), '前提：鐵羅漢真的帶不壞身').toBeGreaterThan(0);
    expect(weary.block, '不能白送永久防禦').toBe(base.block);
    expect(weary.maxHp, '生命照樣 −15%').toBe(Math.round(base.maxHp * 0.85));
  });

  it('鐵羅漢帶「不壞身」：披甲的鱗甲不能給，不然每回合長 18 點防禦一路疊', () => {
    const base = one(undefined, 'iron_arhat'), plated = one('plated', 'iron_arhat');
    expect(getStatus(plated, '鱗甲'), '不能疊在不壞身上').toBe(getStatus(base, '鱗甲'));
    expect(plated.maxHp).toBe(Math.round(base.maxHp * 0.95));
  });

  it('冬眠熊本來就睡著：打瞌睡的不能再加定身，不然白拿五回合', () => {
    const base = one(undefined, 'hibernating_bear'), dozing = one('dozing', 'hibernating_bear');
    expect(getStatus(base, '沉睡'), '前提：冬眠熊開場真的在睡').toBeGreaterThan(0);
    expect(getStatus(dozing, '定身'), '睡著的不再加定身').toBe(0);
    expect(dozing.maxHp, '生命照樣 +20%').toBe(Math.round(base.maxHp * 1.2));
  });

  it('一般魔物不受影響：打瞌睡的照樣定身 1、疲憊的照樣 8 點防禦', () => {
    const base = one(undefined, 'rats3');
    expect(getStatus(one('dozing', 'rats3'), '定身')).toBe(1);
    expect(one('weary', 'rats3').block - base.block).toBe(8);
    expect(getStatus(one('plated', 'rats3'), '鱗甲')).toBe(2);
  });
});
