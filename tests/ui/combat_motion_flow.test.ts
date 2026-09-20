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
      storyFor: () => ({ battleWin: [] }), toast() {}, pick() {}, heroSpeaker() {},
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
      window: { cancelAnimationFrame() {}, requestAnimationFrame: () => 1 }, performance: { now: () => 1600 },
      applied: [{ a: { t: 'card', seat: 0, u: 42, g: 99 } }], handsBefore: [[card]],
      locallyPlayedMotion: { take: () => local }, localCardMotionKey: (uid: number) => `card:${uid}`,
      alreadyShown: false, mine: true, remoteBefore: {}, Date: { now: () => 1600 },
      cardStats: () => ({ def: { type: '攻擊' }, effects: [] }), heroOf: () => 'dangdang', cardPose: () => ({ attack: true }),
      settle: (_before: unknown, opts: typeof confirmation) => { confirmation = opts; }, render() {}, finishApplied() {},
      motionPresentationMatches, resizeMotionMeleeTrip, shouldResumeConfirmedMotion,
      impactSource: 'dangdang', impactMotion: 'rapid_combo', confirmedMotionWaves: 2,
      impactElapsed: 600, impactPresentationToken: 7,
    };
    await execute(sourceBetween('  const idleMotion = (', '  const motionFoot =') + '\nidleMotion(0);' +
      sourceBetween('      let ownCard: CardInstance | undefined;', '      finishApplied();'), bindings);
    expect(state.trip).toBeUndefined();
    expect(confirmation.impactElapsed).toBe(600);
    await execute(playMotion + sourceBetween('    if (impactSource && impactMotion && confirmedMotionWaves > 0)',
      '    // 多段攻擊時球球'), { ...bindings, opts: confirmation });
    expect(state.active).toBe(true);
    expect(state.away).toBe(true);
    expect(state.trip?.origin).toEqual({ x: 100, y: 200 });
    expect(state.trip?.plan).toMatchObject({ dx: 300, dy: 0, strikeMs: 760, totalMs: 760 });
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
  const reactions = sourceBetween('    for (const q of cs.players) {\n      const source = motionSourceFor(q);', '    const feifeiNeedleAction');
  it.each([1, 0])('閃避時依剩餘 %i 層隱身維持正確透明度', async (stealth) => {
    const classes = new Set<string>();
    const box = {
      classList: { toggle: (name: string, on: boolean) => { if (on) classes.add(name); else classes.delete(name); } },
      closest: () => null, append() {},
    };
    const state = { action: 'roll', active: true, reactive: true, away: false,
      actor: { element: {}, play() {} }, layer: { remove() {} } };
    await execute(sourceBetween('  const mountMotion = (', '  if (motionEnabled && cs.players.some')
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
