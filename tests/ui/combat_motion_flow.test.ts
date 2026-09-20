import { describe, expect, it } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import { companionMotionDuration } from '../../src/ui/companion-motion';
import {
  motionPresentationMatches,
  resizeMotionMeleeTrip,
  shouldResumeConfirmedMotion,
} from '../../src/ui/qiuqiu-combat-motion';

// Execute the screen's actual branches; the screen-local functions are not public APIs.
function sourceBetween(start: string, end: string): string {
  const first = SRC.indexOf(start);
  const last = SRC.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`Missing combat branch: ${start}`);
  return SRC.slice(first, last);
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
