import { describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import RAW from '../../src/ui/screens/combat.ts?raw';
import { allReady, beginEnemyTurn, endTurn, finishEnemyTurn, stepEnemyTurn } from '../../src/engine/combat';
import { beginCombat, newCoopRun } from '../../src/engine/run';
import { cardStats } from '../../src/engine/deck';
import { applyAction } from '../../src/net/action';
import { CoopSession } from '../../src/net/session';
import { LoopbackPair } from '../../src/net/transport';
import { combatFingerprint } from '../../src/net/hash';
import type { CombatState } from '../../src/engine/types';

/*
 * 2026-09-23 連線稽核 低-2：舉手齊了那一刻戰鬥畫面當場 `hold()` 住會話，要等 `finishApplied()` 收牌、
 * 演完魔物回合才 `release()`。中間準備演出參數的那一大段原本在 `try` 外面：任何一支丟例外，
 * 這台就停在 held，同伴下一回合的牌全在這邊排隊，兩台互等。
 *
 * 照 combat_batch_hold 的做法，把戰鬥畫面真正的那幾段切出來、接上兩台真的會話跑。
 */
const SRC = RAW.replace(/\r\n/g, '\n');
function sourceBetween(start: string, end: string): string {
  const first = SRC.indexOf(start);
  const last = SRC.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`找不到這一段：${start}`);
  return SRC.slice(first, last);
}
/** 外層那一道（註冊到會話上的那一支） */
const WRAPPER = sourceBetween('    session.onApplied((applied) => {\n      const turn: AppliedTurn = {};', '    session.onTrouble(');

function snapshot(cs: CombatState) {
  return {
    enemies: new Map(cs.enemies.map((enemy) => [enemy.uid, { hp: enemy.hp, dead: enemy.dead, stealth: 0 }])),
    logN: cs.log.length, hitN: cs.hits.length,
  };
}

describe('低-2：收回合那一刻 hold() 之後準備演出丟例外，照常收尾、會話一定放開', () => {
  it('批次重播算撞擊計畫時丟例外：照常收牌跑魔物回合、放開會話，同伴下一回合的牌套得進來', async () => {
    // 本體：從 `alreadyShown` 到批次重播那一段（含收尾 finishApplied），後面接回單張那條的收尾
    const inner = 'const onApplied = (applied, turn) => {\nconst mine = false;\n'
      + sourceBetween('      const alreadyShown =', '      let ownCard: CardInstance | undefined;')
      + '\nfinishApplied();\n};\n';
    const js = (await transformWithOxc(inner + WRAPPER, 'applied-guard.ts')).code;
    const link = new LoopbackPair();
    const hostCs = beginCombat(newCoopRun('applied-guard-0923'), 'rats2');
    const guestCs = beginCombat(newCoopRun('applied-guard-0923'), 'rats2');
    for (const cs of [hostCs, guestCs]) for (const enemy of cs.enemies) { enemy.hp = 9999; enemy.maxHp = 9999; }
    const failures: string[] = [];
    const host = new CoopSession(link.a, { isHost: true, seat: 0, onDesync: (why) => failures.push(why) });
    const guest = new CoopSession(link.b, { isHost: false, seat: 1, onDesync: (why) => failures.push(why) });
    host.attach(hostCs);
    guest.attach(guestCs);
    let before = snapshot(guestCs);
    let replay = structuredClone(guestCs); replay.rng = guestCs.rng.clone();
    guest.beforeApply(() => { before = snapshot(guestCs); replay = structuredClone(guestCs); replay.rng = guestCs.rng.clone(); });
    host.onApplied(() => { if (allReady(hostCs) && !hostCs.pending) { host.endOfTurn(); host.hold(); } });
    const errors: unknown[] = [];
    const recovered = vi.fn();
    guest.onApplied((applied) => {
      // 畫面拿到的會話：hold／release 都轉給真的那一台；外層註冊的那一支當場用這一批叫
      const proxy = {
        isHost: false, endOfTurn: () => guest.endOfTurn(), hold: () => guest.hold(), release: () => guest.release(),
        onApplied: (fn: (a: typeof applied) => void) => fn(applied),
      };
      const bindings = {
        session: proxy, cs: guestCs, app: { cs: guestCs }, mySeat: 1, my: () => guestCs.players[1],
        remoteBefore: before, remoteCombatBefore: replay,
        remotePresentationRunning: false, allReady, checkOver() {}, syncPicker() {},
        root: { querySelector: () => undefined }, sfx() {}, collectHand: () => 0,
        runEnemyTurn: () => { endTurn(guestCs); guest.release(); }, collecting: false,
        snap: snapshot, applyAction, cardStats, locallyPlayedMotion: { take: () => undefined },
        motionForCard: () => 'attack1', motionSourceFor: () => 'qiuqiu', prepareMelee: () => undefined,
        qiuqiuMotionBatchBoundaries: (points: ReturnType<typeof snapshot>[]) => points.slice(1).map((point, index) => ({
          logStart: points[index]!.logN, logEnd: point.logN, hitStart: points[index]!.hitN, hitEnd: point.hitN,
        })),
        qiuqiuConsumedStealth: () => 0,
        buildCombatMotionImpactPlan: () => { throw new Error('缺圖：撞擊計畫算不出來'); },
        motionDuration: () => 650, motionImpactDelay: () => 200, combatMotionPresentationWait: () => 650,
        motionHeldSprites: new Map(), fallingUids: new Set(), motionPendingDamage: new Map(),
        enqueueRemotePresentation: () => { throw new Error('走不到這裡：批次那條在算撞擊計畫時就丟了'); },
        recoverPresentation: recovered, console: { error: (...args: unknown[]) => errors.push(args) },
      };
      new Function(...Object.keys(bindings), js)(...Object.values(bindings));
    });

    // 主機出一張攻擊牌、舉手、替客戶端收回合：客戶端那邊一次補齊三號，走批次重播那條
    link.hold = true;
    const first = hostCs.players[0]!.hand.find((card) => cardStats(card).def.type === '攻擊')!;
    expect(host.submit({ t: 'card', seat: 0, u: first.uid, g: hostCs.enemies[0]!.uid })).toBe(true);
    expect(host.submit({ t: 'ready', seat: 0, on: true })).toBe(true);
    expect(host.submit({ t: 'force', seat: 0, w: 1 })).toBe(true);
    try { link.flush({ reverse: true }); } catch { /* 沒有防護時例外會一路竄出會話；下面看的是它留下的後果 */ }
    expect(errors.length, '例外要照連線演出防護的風格記一行').toBeGreaterThan(0);
    expect(recovered, '收掉排到一半的演出').toHaveBeenCalled();

    // 主機演完、下一回合出牌：客戶端沒有停在 held，這張當場套得進來
    endTurn(hostCs); host.release();
    expect(guestCs.turn, '客戶端照常收了這一回合').toBe(hostCs.turn);
    link.hold = false;
    const next = hostCs.players[0]!.hand.find((card) => cardStats(card).def.type === '攻擊')!;
    expect(host.submit({ t: 'card', seat: 0, u: next.uid, g: hostCs.enemies[0]!.uid })).toBe(true);
    expect(combatFingerprint(guestCs), '兩台互等：客戶端還停在 held，這張在排隊').toBe(combatFingerprint(hostCs));
    expect(failures).toEqual([]);
  });

  it('推前審查 低-4：最後舉手那一批在算出「這回合收完了」之前就丟例外：照常收這一回合，兩台不分岔', async () => {
    // 在本體最前面（`matePlays` 那一帶，比 `completedTurn` 早）丟一次例外；退路用戰鬥畫面真正的 `turnWaiting`
    const inner = 'const onApplied = (applied, turn) => {\nconst mine = false;\nmatePlays();\n'
      + sourceBetween('      const alreadyShown =', '      let ownCard: CardInstance | undefined;')
      + '\nfinishApplied();\n};\n'
      + sourceBetween('  function turnWaiting(): boolean {', '  // ===== 結算與動畫 =====');
    const js = (await transformWithOxc(inner + WRAPPER, 'applied-guard-early.ts')).code;
    const link = new LoopbackPair();
    const hostCs = beginCombat(newCoopRun('applied-guard-early-0923'), 'rats2');
    const guestCs = beginCombat(newCoopRun('applied-guard-early-0923'), 'rats2');
    for (const cs of [hostCs, guestCs]) for (const enemy of cs.enemies) { enemy.hp = 9999; enemy.maxHp = 9999; }
    const failures: string[] = [];
    const host = new CoopSession(link.a, { isHost: true, seat: 0, onDesync: (why) => failures.push(why) });
    const guest = new CoopSession(link.b, { isHost: false, seat: 1, onDesync: (why) => failures.push(why) });
    host.attach(hostCs);
    guest.attach(guestCs);
    host.onApplied(() => { if (allReady(hostCs) && !hostCs.pending) { host.endOfTurn(); host.hold(); } });
    let armed = true;
    const errors: unknown[] = [];
    guest.onApplied((applied) => {
      const proxy = {
        isHost: false, endOfTurn: () => guest.endOfTurn(), hold: () => guest.hold(), release: () => guest.release(),
        onApplied: (fn: (a: typeof applied) => void) => fn(applied),
      };
      const bindings = {
        session: proxy, cs: guestCs, app: { cs: guestCs }, mySeat: 1, my: () => guestCs.players[1],
        matePlays: () => { if (armed) { armed = false; throw new Error('matePlays 壞了'); } },
        remoteBefore: null, remoteCombatBefore: null, remotePresentationRunning: false,
        allReady, collecting: false, checkOver() {}, syncPicker() {}, root: { querySelector: () => undefined }, sfx() {},
        collectHand: () => 0, runEnemyTurn: () => { endTurn(guestCs); guest.release(); },
        recoverPresentation: () => {}, console: { error: (...args: unknown[]) => errors.push(args) },
      };
      new Function(...Object.keys(bindings), js)(...Object.values(bindings));
    });

    link.hold = true;
    expect(host.submit({ t: 'ready', seat: 0, on: true })).toBe(true);
    expect(host.submit({ t: 'force', seat: 0, w: 1 })).toBe(true);
    try { link.flush({ reverse: true }); } catch { /* 沒有防護時例外會一路竄出會話 */ }
    expect(errors.length).toBeGreaterThan(0);
    endTurn(hostCs); host.release();
    expect(guestCs.turn, '客戶端只放開、沒跑魔物回合，就停在上一回合').toBe(hostCs.turn);
    link.hold = false;
    const next = hostCs.players[0]!.hand.find((card) => cardStats(card).def.type === '攻擊')!;
    expect(host.submit({ t: 'card', seat: 0, u: next.uid, g: hostCs.enemies[0]!.uid })).toBe(true);
    expect(failures, '兩台分岔、跳紅色橫幅').toEqual([]);
    expect(combatFingerprint(guestCs)).toBe(combatFingerprint(hostCs));
  });

  describe('外層那一道的退路', () => {
    type Turn = { finish?: () => void; started?: boolean; sealed?: boolean };
    async function run(inner: (applied: unknown[], turn: Turn) => void, waiting = false) {
      const js = (await transformWithOxc(WRAPPER, 'applied-wrapper.ts')).code;
      let handler: ((a: unknown[]) => void) | null = null;
      const calls: string[] = [];
      const session = {
        onApplied: (fn: (a: unknown[]) => void) => { handler = fn; }, release: vi.fn(),
        endOfTurn: () => { calls.push('check'); }, hold: () => { calls.push('hold'); },
      };
      const errors: unknown[] = [];
      new Function('session', 'onApplied', 'recoverPresentation', 'console', 'turnWaiting', 'runEnemyTurn', js)(
        session, inner, () => {}, { error: (...args: unknown[]) => errors.push(args) },
        () => waiting, () => { calls.push('enemy'); });
      handler!([{}]);
      return { release: session.release, errors, calls };
    }

    // 推前審查 低-4：例外丟在「這回合收完了」之前，而兩個人其實都舉手了——只放開的話這台不跑魔物回合，兩台分岔
    it('都舉手了、收尾還沒接手就丟：對帳、暫停、照常開魔物回合（魔物回合演完自己放開）', async () => {
      const r = await run(() => { throw new Error('matePlays 壞了'); }, true);
      expect(r.calls).toEqual(['check', 'hold', 'enemy']);
      expect(r.release).not.toHaveBeenCalled();
    });

    it('已經對帳暫停過、收尾自己丟在開魔物回合之前：不再對帳一次，照常開魔物回合', async () => {
      const r = await run((_a, turn) => { turn.sealed = true; turn.finish = () => {}; turn.started = true; throw new Error('checkOver 壞了'); }, true);
      expect(r.calls).toEqual(['enemy']);
      expect(r.release).not.toHaveBeenCalled();
    });

    it('收尾還沒開始就丟例外：照常收尾一次（收尾自己會放開），不另外放開', async () => {
      const finish = vi.fn();
      const r = await run((_a, turn) => { turn.finish = finish; throw new Error('準備演出失敗'); });
      expect(finish).toHaveBeenCalledTimes(1);
      expect(r.release).not.toHaveBeenCalled();
    });

    it('還沒走到定義收尾那一行就丟：直接放開', async () => {
      const r = await run(() => { throw new Error('一開頭就壞'); });
      expect(r.release).toHaveBeenCalledTimes(1);
    });

    it('收尾自己丟例外：不再叫第二次收尾（會多跑一次魔物回合），直接放開', async () => {
      const finish = vi.fn();
      const r = await run((_a, turn) => { turn.finish = finish; turn.started = true; throw new Error('收尾壞了'); });
      expect(finish).not.toHaveBeenCalled();
      expect(r.release).toHaveBeenCalledTimes(1);
    });

    it('退路的收尾也丟例外：放開，並多記一行', async () => {
      const r = await run((_a, turn) => { turn.finish = () => { throw new Error('再壞一次'); }; throw new Error('先壞'); });
      expect(r.release).toHaveBeenCalledTimes(1);
      expect(r.errors).toHaveLength(2);
    });
  });
});

describe('低-2：演出佇列算「這一項要等多久」丟例外，也要接著演、輪到收尾', () => {
  it('等待時間算不出來的那一項跳過，後面的收尾照常', async () => {
    const played: string[] = [];
    const queue = [
      { kind: 'step', wait: () => { throw new Error('動作長度查不到'); }, play: () => { played.push('bad'); } },
      { kind: 'done', run: () => { played.push('done'); } },
    ];
    const cs = {};
    const body = sourceBetween('  const pumpRemotePresentation = (): void => {', '  const enqueueRemotePresentation');
    const js = (await transformWithOxc(`let remotePresentationRunning = false;\n${body}\npumpRemotePresentation();`, 'pump.ts')).code;
    new Function('remotePresentationQueue', 'app', 'cs', 'resolveCombatMotionPresentationWait', 'motionImpactTimers', 'window', 'console', 'recoverPresentation', js)(
      queue, { cs }, cs, (w: number | (() => number)) => (typeof w === 'function' ? w() : w), new Set(),
      { setTimeout: () => 0 }, { error: () => {} }, () => { played.push('recover'); });
    expect(played, '收尾那一項輪不到，這台就停在 held').toEqual(['bad', 'recover', 'done']);
  });
});

/*
 * 2026-09-23 追加（低-2 的「沒做的」）：收牌之後魔物回合的每一步都在計時器裡跑，外層那道防護接不到。
 * 用真的引擎（開頭、一步一步、收尾）跑戰鬥畫面真正的 `runEnemyTurn`，演出在第 N 次 `settle` 丟例外。
 */
describe('低-2 追加：魔物回合交給計時器之後演出丟例外，照常收尾、會話一定放開', () => {
  const BODY = sourceBetween('  function runEnemyTurn(): void {', '  // ===== 結算與動畫 =====') + '\nrunEnemyTurn();';

  async function enemyTurn(opts: { settleThrowsAt?: number; recoverThrows?: boolean; snapThrowsFirst?: boolean } = {}) {
    const js = (await transformWithOxc(BODY, 'enemy-turn-guard.ts')).code;
    const cs = beginCombat(newCoopRun('enemy-guard-0923'), 'rats2');
    for (const p of cs.players) p.ready = true;
    // 對照組：引擎一口氣收完這一回合（兩台只要走到同一個地方，鎖步就對得上）
    const expected = structuredClone(cs); expected.rng = cs.rng.clone();
    endTurn(expected);
    const timers: Array<() => void> = [];
    let settles = 0;
    const release = vi.fn();
    const errors: unknown[] = [];
    const calls: string[] = [];
    let snaps = 0;
    const bindings = {
      cs, app: { cs }, my: () => cs.players[0],
      snap: (c: CombatState) => {
        snaps += 1;
        if (opts.snapThrowsFirst && snaps === 1) throw new Error('快照壞了：魔物回合還沒開始');
        return { logLen: c.log.length, enemies: new Map(c.enemies.map((e) => [e.uid, { turnCount: e.turnCount }])) };
      },
      beginEnemyTurn, stepEnemyTurn, finishEnemyTurn, endTurn, allReady, collecting: false,
      settle: () => { settles += 1; if (settles === opts.settleThrowsAt) throw new Error('演出壞了：缺圖'); },
      session: { release }, enemyTurnRunning: false, clearTelegraph() {},
      telegraphNext: () => true, TELEGRAPH_MS: 320,   // 有預告：第一步就排進計時器，整段都在計時器裡跑
      window: { setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; } },
      recoverPresentation: () => { calls.push('recover'); if (opts.recoverThrows) throw new Error('收尾也壞了'); },
      checkOver: () => { calls.push('checkOver'); }, syncPicker: () => { calls.push('syncPicker'); },
      console: { error: (...args: unknown[]) => errors.push(args) },
    };
    new Function(...Object.keys(bindings), js)(...Object.values(bindings));
    for (let guard = 0; timers.length && guard < 200; guard++) {
      try { timers.shift()!(); } catch { /* 沒有防護時例外從計時器竄出去就沒了；下面看它留下的後果 */ }
    }
    return { cs, expected, release, errors, calls, settles };
  }

  it('沒出錯時照原本的路：放開一次，跟一口氣收完的結果一樣', async () => {
    const r = await enemyTurn();
    expect(r.release).toHaveBeenCalledTimes(1);
    expect(r.errors).toEqual([]);
    expect(combatFingerprint(r.cs)).toBe(combatFingerprint(r.expected));
  });

  it('第一隻出完手、計時器裡那一步的演出丟例外：引擎照常走完這一回合、判勝負、放開會話', async () => {
    const r = await enemyTurn({ settleThrowsAt: 2 });
    expect(r.errors.length, '照連線演出防護的風格記一行').toBe(1);
    expect(r.release, '沒放開：同伴下一回合的牌全在這邊排隊，兩台互等').toHaveBeenCalledTimes(1);
    expect(r.cs.enemyActing, '魔物回合停在一半').toBeFalsy();
    expect(combatFingerprint(r.cs), '沒演的那幾隻也要照常出手，不然兩台分岔').toBe(combatFingerprint(r.expected));
    expect(r.calls).toEqual(['recover', 'checkOver', 'syncPicker']);
  });

  it('推前審查 低-4：魔物回合還沒開始就丟例外（開頭的快照）：照 endTurn 補跑一次，兩台停在同一個地方', async () => {
    const r = await enemyTurn({ snapThrowsFirst: true });
    expect(r.errors).toHaveLength(1);
    expect(r.release).toHaveBeenCalledTimes(1);
    expect(combatFingerprint(r.cs), '只放開不補跑：這台停在上一回合，同伴早就跑完了').toBe(combatFingerprint(r.expected));
  });

  it('連收尾都壞了：直接放開，並多記一行', async () => {
    const r = await enemyTurn({ settleThrowsAt: 2, recoverThrows: true });
    expect(r.release).toHaveBeenCalledTimes(1);
    expect(r.errors).toHaveLength(2);
  });
});
