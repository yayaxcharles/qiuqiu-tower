import { beforeEach, describe, expect, it } from 'vitest';
import { playCard } from '../../src/engine/combat';
import { beginCombat, chooseNode, finishCombat, newCoopRun, newRun, takeRelic, tickNodeCounters } from '../../src/engine/run';
import { me } from '../../src/engine/runplayer';
import { checkRun, loadRun, saveRun, setStore } from '../../src/engine/save';
import type { CombatState, RunState } from '../../src/engine/types';
import { runFingerprint } from '../../src/net/hash';

/**
 * 跨場計數器（2026-09-23 內容擴充第二批：木人樁數攻擊牌、撲滿數非戰鬥格）存在 `RunPlayer.counters`。
 * 派工單點名的三條：舊存檔讀得回來、重整續玩計數沒掉、連線兩台一致。
 */
function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}
beforeEach(() => { setStore(memStore()); });

/** 照同一套動作走一段：走進前 n 格、戰鬥格用貓抓打三下再判贏（兩台連線各跑一次，應該一模一樣） */
function walk(run: RunState, steps: number): void {
  for (let s = 0; s < steps && run.status === 'playing'; s++) {
    const nextIds = run.currentNode ? run.map.nodes.find((x) => x.id === run.currentNode)!.next : run.map.start;
    const node = chooseNode(run, nextIds[0]!);
    if ((node.type === '戰鬥' || node.type === '大魔物') && node.encounterId) {
      const cs: CombatState = beginCombat(run, node.encounterId);
      for (const p of cs.players) {
        for (const c of p.hand.filter((x) => x.cardId === 'sanjo').slice(0, 2)) {
          const t = cs.enemies.find((e) => !e.dead);
          if (t) playCard(cs, c.uid, t.uid, p.seat);
        }
      }
      for (const e of cs.enemies) { e.dead = true; e.hp = 0; }
      cs.kills = cs.enemies.length;
      cs.phase = 'won';
      finishCombat(run, cs);
    }
  }
}

describe('舊存檔讀回（沒有 counters 那一欄）', () => {
  it('讀得進來、計數從 0 算，木人樁與撲滿照常運作', () => {
    const run = newRun('old-save', 1, 'ninja');
    takeRelic(run, 'wooden_dummy'); takeRelic(run, 'piggy_bank');
    const json = JSON.parse(JSON.stringify(run)) as RunState;
    expect('counters' in json.players[0]!, '前提：舊格式裡沒有這一欄').toBe(false);
    const back = checkRun(json)!;
    expect(back).not.toBeNull();
    expect(me(back).counters).toBeUndefined();
    tickNodeCounters(back);
    expect(me(back).counters).toEqual({ piggy_bank: 1 });
    const cs = beginCombat(back, 'wood_dummy');
    cs.player.energy = 3;
    playCard(cs, cs.player.hand.find((c) => c.cardId === 'sanjo')?.uid ?? -1, cs.enemies[0]!.uid);
    expect(cs.player.relicCounters?.['wooden_dummy']).toBe(1);
  });

  it('壞掉的計數只丟那幾格，不整份判壞檔', () => {
    const run = newRun('bad-counter', 1, 'ninja');
    const json = JSON.parse(JSON.stringify(run)) as { players: { counters?: unknown }[] };
    json.players[0]!.counters = { wooden_dummy: 'x', piggy_bank: -1, nope: 3, hourglass: 2, dart_case: 1.5 };
    const back = checkRun(json as unknown as RunState)!;
    expect(back).not.toBeNull();
    expect(me(back).counters).toEqual({ hourglass: 2 });
    json.players[0]!.counters = [1, 2];
    expect(me(checkRun(json as unknown as RunState)!).counters).toBeUndefined();
  });
});

describe('重整續玩：計數跟著存檔走', () => {
  it('存進去讀回來一樣；接著走，撲滿照樣在第三格倒錢', () => {
    const run = newRun('refresh', 1, 'ninja');
    takeRelic(run, 'piggy_bank'); takeRelic(run, 'wooden_dummy');
    me(run).counters = { piggy_bank: 2, wooden_dummy: 7 };
    saveRun(run);
    const back = loadRun()!;
    expect(me(back).counters).toEqual({ piggy_bank: 2, wooden_dummy: 7 });
    const fish = me(back).fish;
    tickNodeCounters(back);
    expect(me(back).fish).toBe(fish + 40);
    const cs = beginCombat(back, 'wood_dummy');
    expect(cs.player.relicCounters?.['wooden_dummy']).toBe(7);
  });
  it('戰鬥打到一半重整（戰鬥不存檔）：回到進場前的數，不會多數也不會少數', () => {
    const run = newRun('refresh-mid', 1, 'ninja');
    takeRelic(run, 'wooden_dummy');
    me(run).counters = { wooden_dummy: 4 };
    saveRun(run);
    const cs = beginCombat(run, 'wood_dummy');
    cs.player.energy = 3;
    playCard(cs, cs.player.hand.find((c) => c.cardId === 'sanjo')?.uid ?? -1, cs.enemies[0]!.uid);
    expect(cs.player.relicCounters?.['wooden_dummy']).toBe(5);
    expect(me(loadRun()!).counters).toEqual({ wooden_dummy: 4 });
  });
});

describe('連線兩台一致', () => {
  it('同一顆種子、同一串動作：兩台的計數與整局指紋一模一樣；計數走岔一格，指紋當場不一樣', () => {
    const make = (): RunState => {
      const run = newCoopRun('coop-counter', 1, 'ninja', 'feifei');
      takeRelic(run, 'piggy_bank', 0); takeRelic(run, 'wooden_dummy', 0);
      takeRelic(run, 'piggy_bank', 1); takeRelic(run, 'wooden_dummy', 1);
      return run;
    };
    const a = make(); const b = make();
    walk(a, 8); walk(b, 8);
    expect(a.players.map((p) => p.counters)).toEqual(b.players.map((p) => p.counters));
    // 數到 10 會歸零，所以看「有沒有這一格」而不是大於 0
    expect(a.players.some((p) => p.counters?.['wooden_dummy'] !== undefined), '樣本裡木人樁要真的數過').toBe(true);
    expect(a.players.some((p) => p.counters?.['piggy_bank'] !== undefined), '樣本裡撲滿要真的數過').toBe(true);
    expect(runFingerprint(a)).toBe(runFingerprint(b));
    b.players[1]!.counters = { ...b.players[1]!.counters, piggy_bank: ((b.players[1]!.counters?.['piggy_bank'] ?? 0) + 1) % 3 };
    expect(runFingerprint(a)).not.toBe(runFingerprint(b));
  });
});
