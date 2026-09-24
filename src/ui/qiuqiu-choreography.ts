import { motionMs } from './motion-speed';

export type QiuqiuPoseAction =
  | 'idle' | 'hurt' | 'down' | 'walk' | 'run' | 'roll' | 'jump' | 'land'
  | 'attack1' | 'attack2' | 'attack3' | 'dash' | 'clone' | 'attack4'
  | 'attack_run' | 'attack_air' | 'shuriken' | 'kick' | 'seal' | 'storm'
  | 'rush' | 'combo_kick' | 'uppercut' | 'flying_kick'
  | 'roar' | 'ground_slam' | 'body_bash' | 'palm_combo'
  | 'guard' | 'eat' | 'win' | 'poison' | 'belly' | 'defeat' | 'puff' | 'stealth'
  // 2026-09-21 補的待機狀態（原本這幾個狀態會退回舊版靜態立繪）。掛彩叫 wounded，
  // 因為 hurt 已經是「挨打的那一下」反應動作。
  | 'wounded' | 'power' | 'hungry' | 'dizzy' | 'lazy' | 'iron' | 'curl'
  // 2026-09-22 補的出牌動作：太極、輕功、能力牌（運氣）、抽牌（翻卷軸）。原本這些牌選不到動作，
  // 出牌時動作畫布收起來、舊版靜態立繪亮 0.65 秒，畫風跳一下。
  | 'taiji' | 'qinggong' | 'focus' | 'scroll'
  // 2026-09-23 補的空手擲出：丟葉片、苦無、毛球、飛爪與丟出去的忍具（原本借擲手裏劍，出手前手上是一枚手裏劍）
  | 'toss';

type Segment = {
  action: QiuqiuPoseAction;
  until: number;
  elapsed?: number;
  rate?: number;
  wrap?: number;
};

// 原速的分段時間；載入時換成 1.5 倍速（見 motion-speed.ts）：until、elapsed、wrap 都是毫秒要換算，rate 是比例不動
const SOURCE_CHOREOGRAPHIES = {
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

export type QiuqiuChoreographedAction = keyof typeof SOURCE_CHOREOGRAPHIES;

const CHOREOGRAPHIES: Readonly<Record<string, readonly Segment[]>> = Object.fromEntries(Object.entries(SOURCE_CHOREOGRAPHIES).map(([action, segments]) => [
  action,
  (segments as readonly Segment[]).map((segment): Segment => ({
    ...segment,
    until: motionMs(segment.until),
    ...(segment.elapsed !== undefined ? { elapsed: motionMs(segment.elapsed) } : {}),
    ...(segment.wrap !== undefined ? { wrap: motionMs(segment.wrap) } : {}),
  })),
]));

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
