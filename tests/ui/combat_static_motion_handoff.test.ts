import { describe, expect, it } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import { qiuqiuCombatMotionDecision, qiuqiuMotionDuration, type QiuqiuAction } from '../../src/ui/qiuqiu-motion';
import { companionCardAction, companionMotionDuration, type CompanionMotionAction } from '../../src/ui/companion-motion';

type Source = 'qiuqiu' | 'feifei' | 'dangdang' | 'fengfeng';
type Options = { pose?: string; motion?: string; motionAlreadyPlaying?: boolean; impactMotion?: string; impactSeat?: number };

function branch(start: string, end: string): string {
  const src = SRC.replace(/\r\n/g, '\n');
  const first = src.indexOf(start);
  const last = src.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`Missing combat branch: ${start}`);
  return src.slice(first, last);
}

async function fixture(source: Source) {
  let now = 0;
  let serial = 0;
  const frames = new Map<number, (time: number) => void>();
  const plays: string[] = [];
  const classes = new Set<string>();
  const box = {
    classList: {
      toggle(name: string, on: boolean) { if (on) classes.add(name); else classes.delete(name); },
      contains: (name: string) => classes.has(name),
    },
    closest: () => null, append() {},
  };
  const image = { src: 'idle' };
  const player = { seat: 0 };
  const cs = { phase: 'player', players: [player] };
  const state = {
    source, action: 'idle', active: false, reactive: false, away: false, raf: 0, endsAt: 0,
    actor: { play: (action: string) => plays.push(action), element: { remove() {} } },
    layer: { style: {}, remove() {} },
  };
  const code = [
    "let pose = 'idle'; const shownPose = () => pose;",
    branch('  const holdWin = (', '  if (motionEnabled && cs.players.some'),
    branch('  const refreshMotion = (', '  const motionFoot = ('),
    branch('  const playMotion = (', '  const motionForCard ='),
    'return { playMotion, apply(opts) {',
    'const comparedPhase = cs.phase; const posePref = opts.pose;',
    'if (posePref) pose = posePref;',
    branch('    const motionDecision = qiuqiuCombatMotionDecision(', '    const impactMotion ='),
    'image.src = pose; mountMotion(cs.players[0], box, pose);',
    '} };',
  ].join('\n');
  const bindings = {
    cs, app: { cs }, mySeat: 0, motionEnabled: true, box, image,
    motionSourceFor: () => source, motionState: () => state, motionActors: new Map([[0, state]]),
    root: { querySelector: (selector: string) => selector.includes('.sprite-box') ? box : image },
    MINE: '.mine', getStatus: () => 0, qiuqiuMotionReady: () => true, companionMotionReady: () => true,
    companionKind: (kind: Source) => kind,
    restMotionAction: (_player: unknown, displayedPose: string) => displayedPose === 'idle' ? 'idle' : undefined,
    idlePose: () => 'idle', heroArt: (_player: unknown, displayedPose: string) => displayedPose,
    qiuqiuCombatMotionDecision,
    motionDuration: (_source: Source, action: string) => source === 'qiuqiu'
      ? qiuqiuMotionDuration(action as QiuqiuAction)
      : companionMotionDuration(source, action as CompanionMotionAction),
    performance: { now: () => now },
    window: {
      requestAnimationFrame: (callback: (time: number) => void) => { frames.set(++serial, callback); return serial; },
      cancelAnimationFrame: (id: number) => frames.delete(id),
    },
  };
  const compiled = await transformWithOxc(code, 'combat-static-handoff.ts');
  const actual = new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as {
    playMotion(seat: number, action: string, trip?: undefined, elapsed?: number, reactive?: boolean): void;
    apply(opts: Options): void;
  };
  return {
    ...actual, state, image, plays,
    staticHidden: () => classes.has('has-qiuqiu-motion') || classes.has('has-companion-motion'),
    advance(time: number) {
      now = time;
      for (const [id, callback] of [...frames]) { frames.delete(id); callback(time); }
    },
  };
}

describe('逐格動作交還靜態出招', () => {
  it.each(['roar', 'skill'])('本人出靜態技能或忍具（%s）立即收掉舊動作，舊收尾不抹去新姿勢', async (pose) => {
    const screen = await fixture('feifei');
    screen.playMotion(0, 'seal');
    const previousEnd = screen.state.endsAt;
    screen.advance(100);
    const motion = companionCardAction('feifei', 'weihe', { poseFamily: 'roar', cardType: '技能' });
    expect(motion).toBeUndefined();
    screen.apply({ pose, motion });
    expect(screen.state.active).toBe(false);
    expect(screen.staticHidden()).toBe(false);
    expect(screen.image.src).toBe(pose);
    screen.advance(previousEnd);
    expect(screen.image.src).toBe(pose);
    expect(screen.staticHidden()).toBe(false);
  });

  it.each(['qiuqiu', 'feifei', 'dangdang', 'fengfeng'] as const)
    ('%s 一般更新與回合交接沒有明確出招時，仍保留完整受擊', async (source) => {
      const screen = await fixture(source);
      screen.playMotion(0, 'hurt', undefined, 0, true);
      screen.advance(100);
      screen.apply({});
      screen.advance(649);
      expect(screen.state.action).toBe('hurt');
      expect(screen.state.active).toBe(true);
      expect(screen.plays).toEqual(['hurt']);
      screen.advance(650);
      expect(screen.state.active).toBe(false);
      expect(screen.state.action).toBe('idle');
    });

  it('同伴出招的命中資訊不會停掉本人受擊', async () => {
    const screen = await fixture('dangdang');
    screen.playMotion(0, 'hurt', undefined, 0, true);
    screen.advance(100);
    screen.apply({ impactSeat: 1, impactMotion: 'attack1' });
    expect(screen.state.action).toBe('hurt');
    expect(screen.state.active).toBe(true);
    expect(screen.plays).toEqual(['hurt']);
  });

  it('延後收到確認時，保留已在播放的本人動作', async () => {
    const screen = await fixture('feifei');
    screen.playMotion(0, 'seal');
    screen.advance(100);
    screen.apply({ pose: 'skill', motionAlreadyPlaying: true });
    expect(screen.state.action).toBe('seal');
    expect(screen.state.active).toBe(true);
    expect(screen.plays).toEqual(['seal']);
    expect(screen.staticHidden()).toBe(true);
  });
});
