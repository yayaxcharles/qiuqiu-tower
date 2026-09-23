import { beforeEach, describe, expect, it } from 'vitest';
import { FIXED_EVENT_FLOOR_5, eventById, events, fixedEventFloor5 } from '../../src/content/events';
import { generateMap, nodesOnFloor, validateMap } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';
import { advanceAct, applyRunEffects, chooseNode, newCoopRun, newRun } from '../../src/engine/run';
import { loadRun, saveRun, setStore } from '../../src/engine/save';
import { eventValue } from '../../src/engine/smartbot';
import { me } from '../../src/engine/runplayer';
import { runFingerprint } from '../../src/net/hash';
import type { RunState } from '../../src/engine/types';

/*
 * 內容擴充第一批的事件（2026-09-23，提案第⑤節「事件 5 篇」、第⑥節「5F 秘笈三關三版」「角色專屬事件補齊」）：
 *   - 5F 一關一版：第一關 `daxia_teach`、第二關 `daxia_chest`、第三關 `daxia_lastpage`；
 *     **舊存檔**第二、三關地圖上的 5F 仍是 `daxia_teach`，要繼續合法、玩得下去；
 *   - 球球三篇專屬事件：只排給一個人玩的球球，連線局不排；
 *   - 屋頂上的影子：打鏡子走廊那一場（照關數換版），兩個選項都記 `chain:shadow_2`、各自再記 `_fought`／`_watched`，跟著存檔、收進整局指紋；
 *   - 機器人對每個新選項都估得出值（不然平衡報告會量歪）。
 */

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}
beforeEach(() => { setStore(memStore()); });

/** 從目前位置走到指定節點（廣度搜尋找路，一格一格 `chooseNode`） */
function walkTo(run: RunState, target: string): void {
  const byId = new Map(run.map.nodes.map((n) => [n.id, n]));
  const starts = run.currentNode ? byId.get(run.currentNode)!.next : run.map.start;
  const prev = new Map<string, string | null>(starts.map((id) => [id, null]));
  const queue = [...starts];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === target) break;
    for (const nx of byId.get(id)!.next) if (!prev.has(nx)) { prev.set(nx, id); queue.push(nx); }
  }
  const path: string[] = [];
  for (let at: string | null = target; at; at = prev.get(at) ?? null) path.unshift(at);
  for (const id of path) chooseNode(run, id);
}
const f5Of = (run: RunState) => nodesOnFloor(run.map, 5)[0]!;

describe('5F 一關一版', () => {
  it('三關各 60 張地圖：5F 都是那一關的版本，地圖照樣合法', () => {
    for (const act of [1, 2, 3]) {
      for (let i = 0; i < 60; i++) {
        const m = generateMap(new Rng(seedFromString(`f5-${act}-${i}`)), { act, flags: {} });
        expect(nodesOnFloor(m, 5).map((n) => n.eventId), `第 ${act} 關 f5-${act}-${i}`).toEqual([fixedEventFloor5(act)]);
        expect(validateMap(m, act), `第 ${act} 關 f5-${act}-${i}`).toEqual([]);
        // 5F 那幾篇不會被排進一般事件格
        expect(m.nodes.filter((n) => n.floor !== 5 && n.eventId && eventById[n.eventId]?.fixedFloor !== undefined)).toEqual([]);
      }
    }
  });

  it('照一局真的往上爬：第一關秘笈、第二關木箱、第三關最後一頁', () => {
    const run = newRun('f5-climb', 1, 'dangdang');
    expect(f5Of(run).eventId).toBe('daxia_teach');
    advanceAct(run);
    expect(f5Of(run).eventId).toBe('daxia_chest');
    advanceAct(run);
    expect(f5Of(run).eventId).toBe('daxia_lastpage');
  });

  it('換了版本不多抽亂數：同一顆種子的地圖除了 5F 那一格一模一樣', () => {
    // 對照組：同一顆亂數生第二關的地圖，把 5F 換回第一關那篇，應該跟「改版前」生出來的一樣
    const a = generateMap(new Rng(seedFromString('f5-rng')), { act: 2, flags: {} });
    const b = generateMap(new Rng(seedFromString('f5-rng')), { act: 2, flags: {} });
    f5Of({ map: b } as RunState).eventId = FIXED_EVENT_FLOOR_5;
    expect(a.nodes.map((n) => (n.floor === 5 ? '' : n.eventId ?? n.encounterId))).toEqual(b.nodes.map((n) => (n.floor === 5 ? '' : n.eventId ?? n.encounterId)));
  });

  it('第二關的地圖不接受第三關那一版、第一關不接受後兩版（驗證不是全開）', () => {
    const m = generateMap(new Rng(seedFromString('f5-wrong')), { act: 2, flags: {} });
    f5Of({ map: m } as RunState).eventId = 'daxia_lastpage';
    expect(validateMap(m, 2).some((s) => s.startsWith('5F'))).toBe(true);
    const m1 = generateMap(new Rng(seedFromString('f5-wrong1')), { act: 1, flags: {} });
    f5Of({ map: m1 } as RunState).eventId = 'daxia_chest';
    expect(validateMap(m1, 1).some((s) => s.startsWith('5F'))).toBe(true);
  });

  it('5F 那幾版不記「遇過」、不被後集換掉（三版都一樣）', () => {
    for (const act of [1, 2, 3]) {
      const run = newRun(`f5-sequel-${act}`, 1, 'ninja');
      for (let a = 1; a < act; a++) advanceAct(run);
      run.flags['sequel:toll_again_paid'] = true;   // 有一篇後集待出：走進第一個一般事件格就會換成它
      walkTo(run, f5Of(run).id);
      expect(f5Of(run).eventId).toBe(fixedEventFloor5(act));
      expect(run.flags[`event:${fixedEventFloor5(act)}`], `第 ${act} 關`).toBeUndefined();
    }
  });
});

describe('舊存檔：第二、三關的 5F 還是 daxia_teach', () => {
  /** 改版前存的局：第 `act` 關的地圖 5F 排的是第一關那篇 */
  function legacyRun(act: number): RunState {
    const run = newRun(`legacy-${act}`, 1, 'feifei');
    for (let a = 1; a < act; a++) advanceAct(run);
    f5Of(run).eventId = FIXED_EVENT_FLOOR_5;
    return run;
  }

  it.each([2, 3])('第 %i 關：讀得回來、地圖合法', (act) => {
    const run = legacyRun(act);
    saveRun(run);
    const back = loadRun();
    expect(back, '舊存檔被當成壞檔清掉了').not.toBeNull();
    expect(f5Of(back!).eventId).toBe('daxia_teach');
    expect(validateMap(back!.map, act)).toEqual([]);
  });

  it.each([2, 3])('第 %i 關：走得進 5F、照樣是秘笈那篇、不被後集換掉，選項照常結算', (act) => {
    const run = legacyRun(act);
    saveRun(run);
    const back = loadRun()!;
    back.flags['sequel:toll_again_paid'] = true;
    walkTo(back, f5Of(back).id);
    expect(back.currentNode).toBe(f5Of(back).id);
    expect(f5Of(back).eventId, '舊存檔的 5F 被換成別的事件').toBe('daxia_teach');
    expect(back.flags['event:daxia_teach']).toBeUndefined();
    const out = applyRunEffects(back, eventById['daxia_teach']!.choices[0]!.outcome);
    expect(out && 'chooseCard' in out && out.chooseCard.length).toBe(3);
  });
});

describe('球球的三篇專屬事件', () => {
  const MINE = ['ninja_blue_headband', 'ninja_target', 'ninja_roof_shadow'];
  const idsOn = (opts: { hero?: string | null }, act: number): Set<string> => {
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const m = generateMap(new Rng(seedFromString(`nj-${String(opts.hero)}-${act}-${i}`)), { act, flags: {}, ...opts });
      for (const n of m.nodes) if (n.eventId) seen.add(n.eventId);
    }
    return seen;
  };

  it('三篇都在、只給球球、照提案限關（藍頭巾與木靶第一二關、影子第二三關）', () => {
    for (const id of MINE) expect(eventById[id]?.hero, id).toBe('ninja');
    expect(eventById['ninja_blue_headband']!.acts).toEqual([1, 2]);
    expect(eventById['ninja_target']!.acts).toEqual([1, 2]);
    expect(eventById['ninja_roof_shadow']!.acts).toEqual([2, 3]);
    expect(events.filter((e) => e.hero === 'ninja').map((e) => e.id)).toEqual(MINE);
  });

  it('一個人玩球球排得到；別的貓排不到；連線（hero: null）整批不排', () => {
    for (const act of [1, 2, 3]) {
      const solo = idsOn({ hero: 'ninja' }, act);
      for (const id of MINE) {
        const inAct = eventById[id]!.acts!.includes(act);
        expect(solo.has(id), `第 ${act} 關 ${id}`).toBe(inAct);
        for (const hero of ['feifei', 'dangdang', 'fengfeng']) expect(idsOn({ hero }, act).has(id), `${hero} 第 ${act} 關排到 ${id}`).toBe(false);
        expect(idsOn({ hero: null }, act).has(id), `連線第 ${act} 關排到 ${id}`).toBe(false);
      }
    }
  });

  it('兩個球球一起玩的連線局也不排（`newCoopRun` 傳的是 null，不是看角色）', () => {
    for (let i = 0; i < 30; i++) {
      const run = newCoopRun(`nj-coop-${i}`, 1, 'ninja', 'ninja');
      advanceAct(run);
      for (const n of run.map.nodes) expect(MINE.includes(n.eventId ?? ''), `${run.seed} ${n.id}`).toBe(false);
    }
  });

  it('屋頂上的影子：打鏡子走廊那一場、照關數換版、贏了多 30 條與升級 1 張', () => {
    for (const act of [2, 3]) {
      const run = newRun(`roof-${act}`, 1, 'ninja');
      for (let a = 1; a < act; a++) advanceAct(run);
      const out = applyRunEffects(run, eventById['ninja_roof_shadow']!.choices[0]!.outcome);
      expect(out && 'fight' in out ? out.fight : null).toEqual({ encounterId: `mirror_duel_a${act}`, bonusFish: 30, bonusUpgrades: 1 });
    }
  });

  /*
   * 影子鏈的三個旗標（主控 2026-09-23 追加，第二批接「影子的真面目」要用）：
   * 兩個選項都記 `chain:shadow_2`；追上去另記 `_fought`、躲著看另記 `_watched`，兩條互斥。
   * 追上去那條的旗標是**當場記**的（不是打贏才記）：`applyRunEffects` 把打一場之外的獎勵延到打贏才發，旗標不在延後之列。
   */
  it('影子鏈的旗標：兩個選項都記 shadow_2，各自再記 fought／watched', () => {
    const pick = (i: number): RunState => {
      const run = newRun(`roof-flag-${i}`, 1, 'ninja');
      advanceAct(run);
      applyRunEffects(run, eventById['ninja_roof_shadow']!.choices[i]!.outcome);
      return run;
    };
    const fought = pick(0);
    expect(fought.flags['chain:shadow_2']).toBe(true);
    expect(fought.flags['chain:shadow_2_fought']).toBe(true);
    expect(fought.flags['chain:shadow_2_watched']).toBeUndefined();
    const again = newRun('roof-flag-defer', 1, 'ninja');
    advanceAct(again);
    const out = applyRunEffects(again, eventById['ninja_roof_shadow']!.choices[0]!.outcome);
    expect(out && 'fight' in out ? out.fight.afterWin ?? [] : null, '旗標不可以被延到打贏才記').toEqual([]);
    const watched = pick(1);
    expect(watched.flags['chain:shadow_2']).toBe(true);
    expect(watched.flags['chain:shadow_2_watched']).toBe(true);
    expect(watched.flags['chain:shadow_2_fought']).toBeUndefined();
  });

  it('影子鏈的旗標跟著存檔走（存了再讀回來還在）', () => {
    for (const i of [0, 1]) {
      const run = newRun(`roof-save-${i}`, 1, 'ninja');
      advanceAct(run);
      applyRunEffects(run, eventById['ninja_roof_shadow']!.choices[i]!.outcome);
      saveRun(run);
      const back = loadRun()!;
      expect(back.flags['chain:shadow_2']).toBe(true);
      expect(back.flags[i === 0 ? 'chain:shadow_2_fought' : 'chain:shadow_2_watched']).toBe(true);
    }
  });

  it('鏈的旗標收進整局指紋（兩台記得不一樣要在走下一格就抓到）', () => {
    for (const flag of ['chain:shadow_2', 'chain:shadow_2_fought', 'chain:shadow_2_watched']) {
      const a = newRun('roof-hash', 1, 'ninja');
      const b = newRun('roof-hash', 1, 'ninja');
      expect(runFingerprint(a)).toBe(runFingerprint(b));
      a.flags[flag] = true;
      expect(runFingerprint(a), flag).not.toBe(runFingerprint(b));
    }
  });
});

describe('機器人估得出每個新選項的值', () => {
  const NEW = ['daxia_chest', 'daxia_lastpage', 'ninja_blue_headband', 'ninja_target', 'ninja_roof_shadow'];

  it('有發生事的選項估值不是 0、也不是付不起的 −999；什麼都不做的是 0', () => {
    const run = newRun('ev-value', 1, 'ninja');
    me(run).hp = Math.floor(me(run).maxHp * 0.7);   // 血在中間：回血、扣血、打一場都有值
    for (const id of NEW) {
      for (const [i, c] of eventById[id]!.choices.entries()) {
        const v = eventValue(run, c.outcome, c.costFish ?? 0);
        expect(Number.isFinite(v), `${id} 第 ${i + 1} 個`).toBe(true);
        expect(v, `${id} 第 ${i + 1} 個`).toBeGreaterThan(-999);
        const happens = c.outcome.some((o) => o.kind !== 'flag');
        if (happens) expect(v, `${id} 第 ${i + 1} 個估成 0＝機器人當它沒效果`).not.toBe(0);
        else expect(Math.abs(v), `${id} 第 ${i + 1} 個`).toBe(0);   // 不花錢時是 −0（`-costFish * 0.35`），比絕對值
      }
    }
  });

  it('5F 兩版：拿東西的選項一定比「什麼都不做」好（機器人不會一直選蓋回去）', () => {
    const run = newRun('ev-value-5f', 1, 'feifei');
    for (const id of ['daxia_chest', 'daxia_lastpage']) {
      const vs = eventById[id]!.choices.map((c) => eventValue(run, c.outcome, c.costFish ?? 0));
      const best = vs.indexOf(Math.max(...vs));
      expect(eventById[id]!.choices[best]!.outcome.length, id).toBeGreaterThan(0);
    }
  });
});
