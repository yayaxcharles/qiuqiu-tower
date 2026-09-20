export type QiuqiuPoseAction =
  | 'idle' | 'hurt' | 'down' | 'walk' | 'run' | 'roll' | 'jump' | 'land'
  | 'attack1' | 'attack2' | 'attack3' | 'dash' | 'clone' | 'attack4'
  | 'attack_run' | 'attack_air' | 'shuriken' | 'kick' | 'seal' | 'storm'
  | 'rush' | 'combo_kick' | 'uppercut' | 'flying_kick'
  | 'roar' | 'ground_slam' | 'body_bash' | 'palm_combo'
  | 'guard' | 'eat' | 'win' | 'poison' | 'belly' | 'defeat' | 'puff' | 'stealth';

type Segment = {
  action: QiuqiuPoseAction;
  until: number;
  elapsed?: number;
  rate?: number;
  wrap?: number;
};

const CHOREOGRAPHIES = {
  clone: [
    { action: 'seal', until: 420, rate: 480 / 420 },
    { action: 'idle', until: 560, elapsed: 0, rate: 0 },
  ],
  clone_duo: [
    { action: 'seal', until: 480 },
    { action: 'idle', until: 560, elapsed: 0, rate: 0 },
  ],
  combo_kick: [
    { action: 'combo_kick', until: 400 },
    { action: 'kick', until: 980 },
  ],
  ultimate_clone: [
    { action: 'seal', until: 280 },
    { action: 'seal', until: 1500, elapsed: 280, rate: 0 },
    { action: 'seal', until: 1700, elapsed: 280 },
    { action: 'idle', until: 1800, elapsed: 0, rate: 0 },
  ],
  ultimate_storm: [
    { action: 'seal', until: 300 },
    { action: 'storm', until: 940 },
    { action: 'shuriken', until: 1050, elapsed: 690, rate: 0 },
  ],
  ultimate_rush: [
    { action: 'rush', until: 160 },
    { action: 'rush', until: 880, wrap: 480 },
    { action: 'attack4', until: 1450 },
  ],
} as const satisfies Record<string, readonly Segment[]>;

export type QiuqiuChoreographedAction = keyof typeof CHOREOGRAPHIES;

function choreography(action: string): readonly Segment[] | undefined {
  return CHOREOGRAPHIES[action as QiuqiuChoreographedAction];
}

export function qiuqiuChoreographyDuration(action: string): number | null {
  const segments = choreography(action);
  return segments?.at(-1)?.until ?? null;
}

export function qiuqiuChoreographyPose(
  action: string,
  elapsedMs: number,
): { action: QiuqiuPoseAction; elapsed: number } | null {
  const segments = choreography(action);
  if (!segments?.length) return null;

  const duration = segments.at(-1)!.until;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, Math.min(elapsedMs, duration)) : 0;
  let startedAt = 0;
  let segment: Segment = segments.at(-1)!;
  for (let index = 0; index < segments.length; index += 1) {
    const candidate = segments[index]!;
    segment = candidate;
    if (elapsed < candidate.until || index === segments.length - 1) break;
    startedAt = candidate.until;
  }

  const rate = segment.rate ?? 1;
  let poseElapsed = (segment.elapsed ?? 0) + (elapsed - startedAt) * rate;
  if (segment.wrap && segment.wrap > 0) poseElapsed %= segment.wrap;
  return { action: segment.action, elapsed: poseElapsed };
}
