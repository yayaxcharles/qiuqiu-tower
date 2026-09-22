import { describe, expect, it } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import { companionMotionDuration } from '../../src/ui/companion-motion';
import { qiuqiuMotionDuration } from '../../src/ui/qiuqiu-motion';
import {
  motionPresentationMatches,
  qiuqiuShouldPlayHurt,
  resizeMotionMeleeTrip,
  shouldResumeConfirmedMotion,
} from '../../src/ui/qiuqiu-combat-motion';
import { motionMeleeSample } from '../../src/ui/qiuqiu-melee';
import { motionMs } from '../../src/ui/motion-speed';

// Execute the screen's actual branches; the screen-local functions are not public APIs.
function sourceBetween(start: string, end: string): string {
  const normalized = SRC.replace(/\r\n/g, '\n');
  const first = normalized.indexOf(start);
  const last = normalized.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`Missing combat branch: ${start}`);
  return normalized.slice(first, last);
}

async function execute(source: string, bindings: Record<string, unknown>): Promise<void> {
  const result = await transformWithOxc(source, 'combat-motion-flow.ts');
  new Function(...Object.keys(bindings), result.code)(...Object.values(bindings));
}

const playMotion = sourceBetween('  const playMotion = (', '  const motionForCard =');
const holdWinSource = sourceBetween('  const holdWin = (', '  const mountMotion = (');

describe('combat motion confirmation and victory flow', () => {
  it.each([0, 1])('keeps downed seat %i down while the survivor celebrates', async (downSeat) => {
    const players = [0, 1].map((seat) => ({ seat, hero: 'dangdang', hp: seat === downSeat ? 0 : 20, down: seat === downSeat }));
    const states = new Map(players.map((q) => [q.seat, {
      source: 'dangdang', action: q.down ? 'defeat' : 'idle', active: false, away: false,
      raf: 0, endsAt: 0, actor: { play() {} }, layer: { style: {}, remove() {} },
    }]));
    const timers: Array<() => void> = [];
    const cs = { phase: 'won', players, encounterId: 'normal' };
    await execute(playMotion + sourceBetween('  function checkOver(): void', '  function phaseBurst(') + '\ncheckOver();', {
      cs, app: { cs, afterCombat() {} }, ended: false, session: { attach() {} },
      encounterById: { normal: { pool: 'normal' } }, my: () => players[1 - downSeat], mySeat: 1 - downSeat,
      storyFor: () => ({ battleWin: [] }), toast() {}, pick() {}, heroSpeaker() {}, mySpeech() {},
      motionActors: states, motionEnabled: true, motionState: (q: { seat: number }) => states.get(q.seat),
      motionSourceFor: () => 'dangdang', motionDuration: () => 500,
      qiuqiuCombatMotionDecision: () => 'play', qiuqiuVictoryLinger: () => 500, heroOf: () => 'dangdang',
      refreshMotion() {}, render() {}, performance: { now: () => 0 }, bonusFish: 0, bonusUpgrades: 0,
      window: { cancelAnimationFrame() {}, requestAnimationFrame: () => 1, setTimeout: (fn: () => void) => timers.push(fn) },
    });
    timers.shift()!();
    expect(states.get(downSeat)?.action).toBe('defeat');
    expect(states.get(downSeat)?.active).toBe(false);
    expect(states.get(1 - downSeat)?.action).toBe('win');
    expect(states.get(1 - downSeat)?.active).toBe(true);
  });

  // 時間是 1.5 倍速後的毫秒（見 motion-speed.ts）：確認在原速 600 毫秒時到達，兩段連拳原速 760 毫秒
  it('resumes a single delayed melee confirmation beside its original target after preview cleanup', async () => {
    const trip = { origin: { x: 100, y: 200 }, plan: {
      dx: 300, dy: 0, approachMs: 0, strikeMs: 520, returnMs: 0,
      impactMs: 220, totalMs: 520, action: 'rapid_combo',
    } };
    const local = { action: 'rapid_combo', at: 1000, token: 7, trip };
    const state = {
      source: 'dangdang', action: 'rapid_combo', active: true, away: true, raf: 1, endsAt: 520,
      trip: trip as typeof trip | undefined, presentationToken: 7,
      actor: { play() {} }, layer: { style: {}, remove() {} },
    };
    const card = { uid: 42, cardId: 'roubao' };
    const cs = { phase: 'player', players: [{ seat: 0, hero: 'dangdang', hp: 20, down: false }] };
    let confirmation: { motionTrip?: typeof trip; impactElapsed?: number } = {};
    const bindings = {
      cs, app: { cs }, mySeat: 0, my: () => cs.players[0], motionActors: new Map([[0, state]]),
      shownPose: () => 'idle', restMotionAction: () => 'idle', refreshMotion() {},
      motionState: () => state, motionSourceFor: () => 'dangdang', motionEnabled: true,
      qiuqiuCombatMotionDecision: () => 'play',
      motionDuration: (_source: string, action: Parameters<typeof companionMotionDuration>[1], waves = 1) =>
        companionMotionDuration('dangdang', action, waves),
      window: { cancelAnimationFrame() {}, requestAnimationFrame: () => 1 }, performance: { now: () => 1000 + motionMs(600) },
      applied: [{ a: { t: 'card', seat: 0, u: 42, g: 99 } }], handsBefore: [[card]],
      locallyPlayedMotion: { take: () => local }, localCardMotionKey: (uid: number) => `card:${uid}`,
      alreadyShown: false, mine: true, remoteBefore: {}, Date: { now: () => 1000 + motionMs(600) },
      cardStats: () => ({ def: { type: '攻擊' }, effects: [] }), heroOf: () => 'dangdang', cardPose: () => ({ attack: true }),
      // 2026-09-22 批次 proj：連線單張那條也要帶丟出去的是什麼（近身連拳什麼都不飛）
      projectileForCard: () => undefined, projectileForPotion: () => undefined,
      settle: (_before: unknown, opts: typeof confirmation) => { confirmation = opts; }, render() {}, finishApplied() {},
      motionPresentationMatches, resizeMotionMeleeTrip, shouldResumeConfirmedMotion, motionMeleeSample,
      impactSource: 'dangdang', impactMotion: 'rapid_combo', confirmedMotionWaves: 2,
      impactElapsed: motionMs(600), impactPresentationToken: 7,
    };
    await execute(holdWinSource + sourceBetween('  const idleMotion = (', '  const motionFoot =') + '\nidleMotion(0);' +
      sourceBetween('      let ownCard: CardInstance | undefined;', '      finishApplied();'), bindings);
    expect(state.trip).toBeUndefined();
    expect(confirmation.impactElapsed).toBe(motionMs(600));
    await execute(playMotion + sourceBetween('    if (impactSource && impactMotion && confirmedMotionWaves > 0)',
      '    // 多段攻擊時球球'), { ...bindings, opts: confirmation });
    expect(state.active).toBe(true);
    expect(state.away).toBe(true);
    expect(state.trip?.origin).toEqual({ x: 100, y: 200 });
    expect(state.trip?.plan).toMatchObject({ dx: 300, dy: 0, strikeMs: motionMs(760), totalMs: motionMs(760) });
  });
});


describe('受擊反應的播放與收尾', () => {
  it.each(['qiuqiu', 'feifei', 'dangdang', 'fengfeng'] as const)
    ('%s 受擊完整停留，收姿勢時不清掉尚在播放的傷害提示', async (source) => {
      const state = {
        source, action: 'idle', active: false, away: false, raf: 0, endsAt: 0,
        actor: { play() {} }, layer: { style: {}, remove() {} },
      };
      const cs = { phase: 'player', players: [{ seat: 0, hp: 40 }] };
      const effects = new Set(['damage-number', 'hurt-vignette']);
      let nextFrame: (now: number) => void = () => {};
      await execute(playMotion + "\nplayMotion(0, 'hurt', undefined, 0, true);", {
        cs, app: { cs }, mySeat: 0, motionEnabled: true, motionState: () => state,
        root: { querySelector: () => null }, MINE: '.mine',
        motionSourceFor: () => source, motionDuration: (_source: string, action: 'hurt') =>
          source === 'qiuqiu' ? qiuqiuMotionDuration(action) : companionMotionDuration(source, action),
        refreshMotion() {}, performance: { now: () => 0 }, ended: false, pose: 'hit',
        idlePose: () => 'idle', idleMotion: () => { state.active = false; state.action = 'idle'; },
        render: () => effects.clear(),
        window: { cancelAnimationFrame() {}, requestAnimationFrame: (fn: (now: number) => void) => { nextFrame = fn; return 1; } },
      });
      nextFrame(500);
      expect(state.active).toBe(true);
      expect(state.action).toBe('hurt');
      nextFrame(649);
      expect(state.active).toBe(true);
      nextFrame(650);
      expect(state.active).toBe(false);
      expect(state.action).toBe('idle');
      expect([...effects]).toEqual(['damage-number', 'hurt-vignette']);
    });
});


describe('敵方連續出手的反應銜接', () => {
  const reactions = sourceBetween('    for (const q of cs.players) {\n      const source = motionSourceFor(q);', '    // 丟出去的東西（2026-09-22 批次 proj）');
  it.each([1, 0])('閃避時依剩餘 %i 層隱身維持正確透明度', async (stealth) => {
    const classes = new Set<string>();
    const box = {
      classList: { toggle: (name: string, on: boolean) => { if (on) classes.add(name); else classes.delete(name); } },
      closest: () => null, append() {},
    };
    const state = { action: 'roll', active: true, reactive: true, away: false,
      actor: { element: {}, play() {} }, layer: { remove() {} } };
    await execute(sourceBetween('  const holdWin = (', '  if (motionEnabled && cs.players.some')
      + '\nmountMotion({ seat: 0 }, box, "hit");', {
      box, motionEnabled: true, motionSourceFor: () => 'qiuqiu', qiuqiuMotionReady: () => true,
      motionState: () => state, restMotionAction: () => undefined, getStatus: () => stealth,
    });
    expect(classes.has('has-qiuqiu-motion')).toBe(true);
    expect(classes.has('qiuqiu-stealth-idle')).toBe(stealth > 0);
  });

  it('球球消耗隱身時播放存在的翻滾動作，不退回待機', async () => {
    let chosen = '';
    const q = { seat: 0, hp: 40, block: 0, down: false };
    await execute(reactions, {
      cs: { players: [q] }, motionSourceFor: () => 'qiuqiu', comparison: undefined,
      before: { players: new Map([[0, { hp: 40, block: 0, stealth: 2 }]]) },
      getStatus: () => 1, comparedPhase: 'player', opts: {}, mySeat: 0, impactMotion: undefined,
      qiuqiuShouldPlayHurt, enemyActed: true, fresh: [], motionActors: new Map(),
      playMotion: (_seat: number, action: string) => { chosen = action; }, idleMotion() {},
    });
    expect(chosen).toBe('roll');
  });
  it('下一擊來到時重新播放受擊，不能沿用快結束的上一擊', async () => {
    let reactionsPlayed = 0;
    const q = { seat: 0, hp: 36, block: 0, down: false };
    await execute(reactions, {
      cs: { players: [q] }, motionSourceFor: () => 'qiuqiu', comparison: undefined,
      before: { players: new Map([[0, { hp: 40, block: 0, stealth: 0 }]]) },
      getStatus: () => 0, comparedPhase: 'player', opts: {}, mySeat: 0, impactMotion: undefined,
      qiuqiuShouldPlayHurt, enemyActed: true, fresh: [],
      motionActors: new Map([[0, { active: true, action: 'hurt' }]]),
      playMotion: () => { reactionsPlayed++; }, idleMotion() {},
    });
    expect(reactionsPlayed).toBe(1);
  });
  it.each(['roll', 'attack1'] as const)('%s 收尾不重建手牌和整個戰場', async (action) => {
    const state = { source: 'qiuqiu', action: 'idle', active: false, away: false, raf: 0, endsAt: 0,
      actor: { play() {} }, layer: { style: {}, remove() {} } };
    const cs = { phase: 'player', players: [{ seat: 0, hp: 40 }] };
    let sceneRebuilds = 0;
    let nextFrame: (now: number) => void = () => {};
    await execute(playMotion + `\nplayMotion(0, '${action}', undefined, 0, ${action === 'roll'});`, {
      cs, app: { cs }, mySeat: 0, motionEnabled: true, motionState: () => state,
      root: { querySelector: () => null }, MINE: '.mine',
      motionSourceFor: () => 'qiuqiu', motionDuration: (_source: string, a: typeof action) => qiuqiuMotionDuration(a),
      qiuqiuCombatMotionDecision: () => 'play', refreshMotion() {}, performance: { now: () => 0 },
      ended: false, pose: 'hit', idlePose: () => 'idle', idleMotion: () => { state.active = false; },
      render: () => { sceneRebuilds++; },
      window: { cancelAnimationFrame() {}, requestAnimationFrame: (fn: (now: number) => void) => { nextFrame = fn; return 1; } },
    });
    nextFrame(Math.max(650, qiuqiuMotionDuration(action)));
    expect(state.active).toBe(false);
    expect(sceneRebuilds).toBe(0);
  });
});

describe('稽核 2026-09-21：多段牌自動結束回合與勝利動作', () => {
  it('打完直接結束回合的牌，要等結算延長後的動作演完才交給魔物', async () => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    let now = 0;
    let ended = 0;
    const cs = { phase: 'player' };
    const state = { active: true, endsAt: 1400 };
    const body = sourceBetween('    const endWhenMotionDone = ', '    if (allReady(cs)) window.setTimeout(endWhenMotionDone');
    await execute(body + '\nendWhenMotionDone();', {
      app: { cs }, cs, allReady: () => true, mySeat: 0, motionActors: new Map([[0, state]]),
      performance: { now: () => now }, onEndTurn: () => { ended++; },
      window: { setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }) },
    });
    // 第一次到點（只算一段）時第二段還在演：不能結束，要補等剩下的時間。
    expect(ended).toBe(0);
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(1430);
    now = 1430;
    state.active = false;
    timers.shift()!.fn();
    expect(ended).toBe(1);
  });

  async function finishVictory(winAt: number | undefined, lastMotionEndAt: number) {
    const players = [{ seat: 0, hero: 'ninja', hp: 20, down: false }];
    let plays = 0;
    const states = new Map([[0, {
      source: 'qiuqiu', action: 'win', active: false, away: false, winAt,
      raf: 0, endsAt: 0, actor: { play() { plays++; } }, layer: { style: {}, remove() {} },
    }]]);
    const timers: Array<() => void> = [];
    const cs = { phase: 'won', players, encounterId: 'normal' };
    await execute(playMotion + sourceBetween('  function checkOver(): void', '  function phaseBurst(') + '\ncheckOver();', {
      cs, app: { cs, afterCombat() {} }, ended: false, session: { attach() {} },
      encounterById: { normal: { pool: 'normal' } }, my: () => players[0], mySeat: 0,
      storyFor: () => ({ battleWin: [] }), toast() {}, pick() {}, heroSpeaker() {}, mySpeech() {},
      motionActors: states, motionEnabled: true, motionState: (q: { seat: number }) => states.get(q.seat),
      motionSourceFor: () => 'qiuqiu', motionDuration: () => 500, lastMotionEndAt,
      qiuqiuCombatMotionDecision: () => 'play', qiuqiuVictoryLinger: () => 500, heroOf: () => 'ninja',
      refreshMotion() {}, render() {}, performance: { now: () => 0 }, bonusFish: 0, bonusUpgrades: 0,
      window: { cancelAnimationFrame() {}, requestAnimationFrame: () => 1, setTimeout: (fn: () => void) => timers.push(fn) },
    });
    timers.shift()!();
    return { plays, active: states.get(0)?.active };
  }

  it('結算時已經換上勝利待機的座位，收場不再從頭播一次', async () => {
    expect(await finishVictory(800, 800)).toEqual({ plays: 0, active: false });
  });

  it('連線時同伴補最後一刀：我這邊太早開始的勝利動作，等同伴收招後要重播一次', async () => {
    // 我這隻在 100 毫秒就切到勝利，同伴的出手到 500 毫秒才收掉
    expect(await finishVictory(100, 500)).toEqual({ plays: 1, active: true });
  });

  it('勝利動作演完收勢時不重播', async () => {
    let plays = 0;
    const state = { action: 'win', active: true, reactive: true, away: false, raf: 3, endsAt: 900, trip: undefined,
      actor: { play() { plays++; } }, layer: { remove() {} } };
    const body = holdWinSource + sourceBetween('  const idleMotion = (', '  // 舞台會隨視窗縮放');
    await execute(body + '\nidleMotion(0);', {
      motionActors: new Map([[0, state]]), cs: { phase: 'won', players: [{ seat: 0 }] },
      restMotionAction: () => 'win', shownPose: () => 'win', refreshMotion() {},
      lastMotionEndAt: 0, performance: { now: () => 900 },
      window: { cancelAnimationFrame() {} },
    });
    expect(plays).toBe(0);
    expect(state.active).toBe(false);
  });
  function seatState(action: string, active: boolean, log: string[], seat: number) {
    return { action, active, reactive: active, away: false, raf: 0, endsAt: 0, trip: undefined, winAt: undefined as number | undefined,
      actor: { play(next: string) { log.push(`${seat}:${next}`); } }, layer: { remove() {} } };
  }
  const idleMotionSource = (): string => holdWinSource + sourceBetween('  const idleMotion = (', '  // 舞台會隨視窗縮放');

  it('同伴還在出手或反應時，我這隻收招先回待機，不提早慶祝', async () => {
    const log: string[] = [];
    const states = new Map([[0, seatState('roll', true, log, 0)], [1, seatState('hurt', true, log, 1)]]);
    await execute(idleMotionSource() + '\nidleMotion(0);', {
      motionActors: states, cs: { phase: 'won', players: [{ seat: 0 }, { seat: 1 }] },
      restMotionAction: () => 'win', shownPose: () => 'win', refreshMotion() {},
      lastMotionEndAt: 0, performance: { now: () => 1306 }, window: { cancelAnimationFrame() {} },
    });
    expect(log).toEqual(['0:idle']);
  });

  it('最後一個動作收掉時，兩隻一起開始慶祝，收場不再重播', async () => {
    const log: string[] = [];
    const states = new Map([[0, seatState('idle', false, log, 0)], [1, seatState('hurt', true, log, 1)]]);
    await execute(idleMotionSource() + '\nidleMotion(1);', {
      motionActors: states, cs: { phase: 'won', players: [{ seat: 0 }, { seat: 1 }] },
      restMotionAction: () => 'win', shownPose: () => 'win', refreshMotion() {},
      lastMotionEndAt: 0, performance: { now: () => 1556 }, window: { cancelAnimationFrame() {} },
    });
    expect(log.sort()).toEqual(['0:win', '1:win']);
    expect(states.get(0)!.winAt).toBe(1556);
    expect(states.get(1)!.winAt).toBe(1556);
  });

  it('兩隻同時從頭播勝利、長短不同：先播完的停在收勢，不被壓回待機、也不被重播', async () => {
    const log: string[] = [];
    const states = new Map([[0, seatState('win', true, log, 0)], [1, seatState('win', true, log, 1)]]);
    const bindings = {
      motionActors: states, cs: { phase: 'won', players: [{ seat: 0 }, { seat: 1 }] },
      restMotionAction: () => 'win', shownPose: () => 'win', refreshMotion() {},
      lastMotionEndAt: 0, performance: { now: () => 1200 }, window: { cancelAnimationFrame() {} },
    };
    await execute(idleMotionSource() + '\nidleMotion(0);', bindings);
    expect(log).toEqual([]);
    expect(states.get(0)!.action).toBe('win');
    await execute(idleMotionSource() + '\nidleMotion(1);', { ...bindings, performance: { now: () => 1400 } });
    expect(log).toEqual([]);
  });

  it('連線演出某一項丟例外，佇列照樣接著演下一項與收尾', async () => {
    const played: string[] = [];
    const errors: unknown[] = [];
    const queue = [
      { kind: 'step', wait: 0, play: () => { played.push('bad'); throw new Error('boom'); } },
      { kind: 'step', wait: 0, play: () => { played.push('next'); } },
      { kind: 'done', run: () => { played.push('done'); } },
    ];
    const cs = {};
    const body = sourceBetween('  const pumpRemotePresentation = (): void => {', '  const enqueueRemotePresentation');
    await execute('let remotePresentationRunning = false;\n' + body + '\npumpRemotePresentation();', {
      remotePresentationQueue: queue, app: { cs }, cs,
      resolveCombatMotionPresentationWait: () => 0, motionImpactTimers: new Set(),
      window: { setTimeout: () => 0 }, console: { error: (...args: unknown[]) => errors.push(args) },
      recoverPresentation: () => { played.push('recover'); },
    });
    expect(played).toEqual(['bad', 'recover', 'next', 'done']);
    expect(errors).toHaveLength(1);
  });

  it('同伴連出兩張、第二張補刀：我已切到勝利也要壓回待機，等牠收招一起慶祝', async () => {
    const out: { value?: string } = {};
    const states = new Map([[0, { action: 'win', active: false }], [1, { action: 'attack1', active: true }]]);
    await execute(holdWinSource + '\nout.value = holdWin(0, "win");', { motionActors: states, out });
    expect(out.value).toBe('idle');
    // 別人也在播勝利（兩隻同時從頭播）就不壓
    states.set(1, { action: 'win', active: true });
    await execute(holdWinSource + '\nout.value = holdWin(0, "win");', { motionActors: states, out });
    expect(out.value).toBe('win');
  });
});

/**
 * 勝利收尾（使用者 2026-09-22）：最後一刀到離開戰鬥回到約 1.3 秒。
 * 舊寫法先等 1300 毫秒、再「從頭」等一整遍勝利動作，最後一刀到獎勵畫面拖到 2.5 秒；
 * 勝利動作已經在播的，現在只等它剩下的時間（與 1300 毫秒取較晚的）。
 */
describe('勝利收尾只等勝利動作剩下的時間', () => {
  const WIN = motionMs(1180);   // 球球勝利動作 1.5 倍速後的長度

  /** 照 combat.ts 真正的 checkOver／finish 跑一遍，時鐘跟著計時器往前走，回傳離開戰鬥的時間與重播次數。 */
  async function wrapUp(options: { winAt?: number; lastMotionEndAt: number; boss?: boolean; seats?: number }) {
    let now = 0;
    let leftAt: number | null = null;
    let plays = 0;
    const timers: Array<{ at: number; fn: () => void }> = [];
    const players = Array.from({ length: options.seats ?? 1 }, (_, seat) => ({ seat, hero: 'ninja', hp: 20, down: false }));
    const states = new Map(players.map((q) => [q.seat, {
      source: 'qiuqiu', action: options.winAt === undefined ? 'idle' : 'win', active: false, away: false,
      winAt: options.winAt, raf: 0, endsAt: 0, actor: { play() { plays++; } }, layer: { style: {}, remove() {} },
    }]));
    const pool = options.boss ? '塔主' : 'normal';
    const cs = { phase: 'won', players, encounterId: 'fight' };
    const app = { cs, afterCombat() { leftAt = now; } };
    await execute(playMotion + sourceBetween('  function checkOver(): void', '  function phaseBurst(') + '\ncheckOver();', {
      cs, app, ended: false, session: { attach() {} },
      encounterById: { fight: { pool } }, my: () => players[0], mySeat: 0,
      storyFor: () => ({ battleWin: [] }), toast() {}, pick() {}, heroSpeaker() {}, mySpeech() {},
      el: () => ({ remove() {} }), root: { append() {} },
      motionActors: states, motionEnabled: true, motionState: (q: { seat: number }) => states.get(q.seat),
      motionSourceFor: () => 'qiuqiu', motionDuration: () => WIN, lastMotionEndAt: options.lastMotionEndAt,
      qiuqiuCombatMotionDecision: () => 'play', qiuqiuVictoryLinger: () => WIN, heroOf: () => 'ninja',
      refreshMotion() {}, render() {}, performance: { now: () => now }, bonusFish: 0, bonusUpgrades: 0,
      window: {
        cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
        setTimeout: (fn: () => void, ms: number) => { timers.push({ at: now + ms, fn }); return timers.length; },
      },
    });
    // 沒有真的畫面更新：到了收招時間就當作收掉（idleMotion 的效果），免得收場一直等下去
    for (let guard = 0; leftAt === null && timers.length > 0 && guard < 200; guard++) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers.shift()!;
      now = next.at;
      for (const state of states.values()) if (state.active && now >= state.endsAt) state.active = false;
      next.fn();
    }
    return { leftAt, plays };
  }

  it('最後一刀收招後已經在慶祝：1300 毫秒到就離開，不再多等一整遍勝利動作', async () => {
    // 貓抓 1.5 倍速後 200 毫秒收招，收招當下切到勝利
    expect(await wrapUp({ winAt: 200, lastMotionEndAt: 200 })).toEqual({ leftAt: 1300, plays: 0 });
  });

  it('勝利動作比較晚才開始（最後一招很長）：等它播完再離開，取兩者較晚的', async () => {
    expect(await wrapUp({ winAt: 900, lastMotionEndAt: 900 })).toEqual({ leftAt: 900 + WIN + 30, plays: 0 });
  });

  it('連線時勝利動作太早開始要重播一次：這時才等完整的一遍（既有行為）', async () => {
    expect(await wrapUp({ winAt: 100, lastMotionEndAt: 500 })).toEqual({ leftAt: 1300 + WIN + 30, plays: 1 });
  });

  it('兩隻一起慶祝時照最晚播完的那隻算，只播一次', async () => {
    expect(await wrapUp({ winAt: 300, lastMotionEndAt: 300, seats: 2 })).toEqual({ leftAt: 1300, plays: 0 });
  });

  it('塔主戰照舊多站白閃慢倒的時間（2400 毫秒），不再疊一整遍勝利動作', async () => {
    expect(await wrapUp({ winAt: 200, lastMotionEndAt: 200, boss: true })).toEqual({ leftAt: 2400, plays: 0 });
  });
});
