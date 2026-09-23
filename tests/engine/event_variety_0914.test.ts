import { describe, expect, it } from 'vitest';
import { advanceAct, chooseNode, newCoopRun, newRun } from '../../src/engine/run';
import { FIXED_EVENT_FLOOR_5, fixedEventFloor5 } from '../../src/content/events';
import { runFingerprint } from '../../src/net/hash';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import type { MapNode, RunState } from '../../src/engine/types';

/*
 * 事件的兩條規則（使用者 2026-09-14）：
 *   1. 前集留下的旗標，換到下一關之後第一次走進事件格就換成後集（原本一局只有 0.1%～1% 遇得到）
 *   2. 同一局前面關卡遇過的事件，後面關卡的地圖不再排
 */

/** 從目前位置一格一格走到指定節點（地圖是由下往上的有向圖，用廣度搜尋找路） */
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
  if (!prev.has(target)) throw new Error(`走不到 ${target}`);
  const path: string[] = [];
  for (let at: string | null = target; at; at = prev.get(at) ?? null) path.unshift(at);
  for (const id of path) chooseNode(run, id);
}

const eventNodes = (run: RunState): MapNode[] =>
  run.map.nodes.filter((n) => n.type === '事件' && n.floor !== 5).sort((a, b) => a.floor - b.floor);

/** 從目前位置往上走得到的第一個事件格（不含 5F 那格） */
function nextReachableEvent(run: RunState): MapNode | undefined {
  const byId = new Map(run.map.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const queue = [...(run.currentNode ? byId.get(run.currentNode)!.next : run.map.start)];
  const found: MapNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = byId.get(id)!;
    if (n.type === '事件' && n.floor !== 5) found.push(n);
    queue.push(...n.next);
  }
  return found.sort((a, b) => a.floor - b.floor)[0];
}

describe('後集：前集做過，下一關第一次走進事件格就遇到', () => {
  it('第一關選了「付買路財」→ 第二關第一個事件格換成「山賊再現」，地圖上別格原本排的那個跟它互換', () => {
    const run = newRun('sequel-toll', 1, 'ninja');
    run.flags['toll_paid'] = true;   // 等於第一關在「留下買路財」選了付錢
    advanceAct(run);
    expect(run.flags['sequel:toll_again_paid'], '換關時標成可以出現').toBe(true);
    const first = eventNodes(run)[0]!;
    const original = first.eventId;
    const elsewhere = run.map.nodes.some((n) => n !== first && n.eventId === 'toll_again_paid');
    walkTo(run, first.id);
    expect(first.eventId, '原本一局只有 1% 遇得到').toBe('toll_again_paid');
    expect(run.flags['event:toll_again_paid']).toBe(true);
    const dupes = run.map.nodes.filter((n) => n.eventId === 'toll_again_paid');
    expect(dupes.length, '地圖上不會再有第二格是它').toBe(1);
    // 別格本來就排了這個後集的話，那格改排這一格原本的事件（沒排的話，原本那個這一關就不出現，之後的關卡照樣排得到）
    if (elsewhere) expect(run.map.nodes.some((n) => n.eventId === original), '互換之後原本那個事件還在地圖上').toBe(true);
  });

  it('地圖上別格本來就排了這個後集：兩格互換（400 顆種子裡找得到這種情況就驗）', () => {
    let checked = 0;
    for (let i = 0; i < 400 && checked < 5; i++) {
      const run = newRun(`sequel-swap-${i}`, 1, 'ninja');
      run.flags['toll_paid'] = true;
      advanceAct(run);
      const first = eventNodes(run)[0]!;
      const other = run.map.nodes.find((n) => n !== first && n.eventId === 'toll_again_paid');
      if (!other || first.eventId === 'toll_again_paid') continue;
      const original = first.eventId;
      walkTo(run, first.id);
      expect(first.eventId).toBe('toll_again_paid');
      expect(other.eventId, '那格改排這一格原本的事件').toBe(original);
      checked += 1;
    }
    expect(checked, '400 顆種子裡一次都沒遇到可以驗的情況').toBeGreaterThan(0);
  });

  it('沒做過前集就不換；第一關也不換（前集的結果要到下一關才看得到）', () => {
    const run = newRun('sequel-none', 1, 'ninja');
    run.flags['toll_paid'] = true;
    const first = eventNodes(run)[0]!;
    const before = first.eventId;
    walkTo(run, first.id);
    expect(first.eventId, '第一關還沒換關，不算數').toBe(before);
    const plain = newRun('sequel-none-2', 1, 'ninja');
    advanceAct(plain);
    const f2 = eventNodes(plain)[0]!;
    const b2 = f2.eventId;
    walkTo(plain, f2.id);
    expect(f2.eventId).toBe(b2);
  });

  it('遇過的後集不會再換一次；固定在 5F 的秘笈不被換掉', () => {
    const run = newRun('sequel-once', 1, 'ninja');
    run.flags['robin_shared'] = true;
    advanceAct(run);
    const a = eventNodes(run)[0]!;
    walkTo(run, a.id);
    expect(a.eventId).toBe('robin_feast');
    const b = nextReachableEvent(run);
    if (b) {
      const before = b.eventId;
      walkTo(run, b.id);
      expect(b.eventId, '第二個事件格照原本的排').toBe(before);
    }
    const run2 = newRun('sequel-f5', 1, 'ninja');
    run2.flags['toll_fought'] = true;
    advanceAct(run2);
    const f5 = run2.map.nodes.find((n) => n.floor === 5)!;
    walkTo(run2, f5.id);
    // 5F 一關一版（2026-09-23）：第二關是木箱那一版，照樣不被後集換掉
    expect(f5.eventId).toBe(fixedEventFloor5(2));
    expect(f5.eventId).not.toBe(FIXED_EVENT_FLOOR_5);
  });

  it('這一格墊的是「遇過的後集」時照樣換（審查 中-1：原本只要是後集就不換，真正該出的那個被擋掉）', () => {
    const run = newRun('sequel-filler', 1, 'ninja');
    run.flags['toll_paid'] = true;
    advanceAct(run);
    const first = eventNodes(run)[0]!;
    // 沒遇過的事件不夠排時，地圖會拿遇過的墊檔；墊到的剛好是第一關遇過的後集
    first.eventId = 'robin_feast';
    run.flags['event:robin_feast'] = true;
    walkTo(run, first.id);
    expect(first.eventId).toBe('toll_again_paid');
  });

  it('這一格是「還沒遇過的後集」就不換，兩個後集都留著', () => {
    const run = newRun('sequel-both', 1, 'ninja');
    run.flags['toll_paid'] = true;
    advanceAct(run);
    const first = eventNodes(run)[0]!;
    first.eventId = 'robin_feast';
    walkTo(run, first.id);
    expect(first.eventId).toBe('robin_feast');
    expect(run.flags['event:toll_again_paid'], '山賊再現留到下一個事件格').toBeUndefined();
  });

  it('連線兩台照同一套規則換：同一顆種子、同一條路，兩台換出來一模一樣', () => {
    const mk = (): RunState => {
      const r = newCoopRun('sequel-coop', 1, 'ninja', 'feifei');
      r.flags['rescue_took_fish'] = true;
      advanceAct(r);
      walkTo(r, eventNodes(r)[0]!.id);
      return r;
    };
    const x = mk(); const y = mk();
    expect(x.map.nodes.map((n) => n.eventId ?? '')).toEqual(y.map.nodes.map((n) => n.eventId ?? ''));
    expect(eventNodes(x)[0]!.eventId).toBe('rescue_return_fish');
    expect(runFingerprint(x), '走格子的對帳對得上').toBe(runFingerprint(y));
  });

  it('走真的連線會話：兩台一格一格走進會換成後集的事件格，每一步都對帳，不會誤報斷線；旗標不同當場抓到', () => {
    const play = (extraFlagOnGuest: boolean): { bad: string[]; events: string[] } => {
      const mk = (): RunState => {
        const r = newCoopRun('coop-sequel-sync', 1, 'ninja', 'feifei');
        r.flags['toll_paid'] = true;
        advanceAct(r);
        return r;
      };
      const a = mk(); const b = mk();
      if (extraFlagOnGuest) b.flags['event:blocked'] = true;
      const pair = new LoopbackPair();
      const bad: string[] = [];
      const host = new CoopSession(pair.a, { isHost: true, seat: 0, onDesync: (w) => bad.push(w) });
      const guest = new CoopSession(pair.b, { isHost: false, seat: 1, onDesync: (w) => bad.push(w) });
      host.useRun(a); guest.useRun(b);
      // 跟畫面一樣：先 chooseNode 再 syncRun（`app.ts` 走格子那段）
      const target = eventNodes(a)[0]!.id;
      const probe = newCoopRun('coop-sequel-sync', 1, 'ninja', 'feifei');
      probe.flags['toll_paid'] = true;
      advanceAct(probe);
      walkTo(probe, target);
      for (const id of probe.trail) {
        chooseNode(a, id); host.syncRun(a, id);
        chooseNode(b, id); guest.syncRun(b, id);
      }
      return { bad, events: [eventNodes(a)[0]!.eventId!, eventNodes(b)[0]!.eventId!] };
    };
    const ok = play(false);
    expect(ok.bad, '同一套規則換出來的，每一步都對得上').toEqual([]);
    expect(ok.events).toEqual(['toll_again_paid', 'toll_again_paid']);
    const diverged = play(true);
    expect(diverged.bad.length, '一台多一個「遇過」的旗標，第一步就發現').toBe(1);
    expect(diverged.bad[0]).toContain('整局的狀態對不上');
  });

  it('整局指紋有算事件（審查 中-2）：兩台旗標或排的事件不一樣要對得出來；畫面寫的旗標不算', () => {
    const mk = (): RunState => {
      const r = newCoopRun('fp-events', 1, 'ninja', 'feifei');
      r.flags['rescue_took_fish'] = true;
      advanceAct(r);
      return r;
    };
    const base = runFingerprint(mk());
    const seenEvent = mk(); seenEvent.flags['event:blocked'] = true;
    expect(runFingerprint(seenEvent), '一台多記了遇過的事件').not.toBe(base);
    const noSequel = mk(); delete noSequel.flags['sequel:rescue_return_fish'];
    expect(runFingerprint(noSequel), '一台少了後集').not.toBe(base);
    const swapped = mk(); const [a, b] = eventNodes(swapped);
    [a!.eventId, b!.eventId] = [b!.eventId, a!.eventId];
    expect(runFingerprint(swapped), '兩台地圖排的事件不同').not.toBe(base);
    const uiOnly = mk(); uiOnly.flags['prologue'] = true; uiOnly.flags['seen:rat'] = true;
    expect(runFingerprint(uiOnly), '序章、看過的魔物是畫面寫的，不能讓它誤報斷線').toBe(base);
  });
});

describe('同一局不重複遇到同一個事件', () => {
  it('第一關走進過的事件，第二關的地圖一格都不排（100 顆種子）', () => {
    for (let i = 0; i < 100; i++) {
      const run = newRun(`norepeat-${i}`, 1, i % 2 ? 'feifei' : 'ninja');
      const seen: string[] = [];
      for (const n of eventNodes(run).slice(0, 3)) {
        try { walkTo(run, n.id); seen.push(n.eventId!); } catch { /* 走不到（已經走過那一層）就換下一個 */ }
      }
      expect(seen.length, `種子 ${i} 一個事件都沒走到`).toBeGreaterThan(0);
      advanceAct(run);
      const again = eventNodes(run).map((n) => n.eventId).filter((id) => seen.includes(id!));
      expect(again, `種子 ${i}：第二關又排了第一關遇過的`).toEqual([]);
    }
  });
});
