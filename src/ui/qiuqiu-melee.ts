import { qiuqiuImpactDelay, qiuqiuMotionDuration, type QiuqiuAction } from './qiuqiu-motion';

export type MeleePoint = { x: number; y: number };

export type MotionMeleePlan<Action extends string = QiuqiuAction> = {
  dx: number;
  dy: number;
  approachMs: number;
  strikeMs: number;
  returnMs: number;
  impactMs: number;
  totalMs: number;
  action: Action;
};

export type QiuqiuMeleePlan = MotionMeleePlan<QiuqiuAction>;

/** 近戰往魔物方向最多衝幾像素：比照舊版靜態演出的前衝幅度（往後縮 10、往前衝到 64，共約 74 像素）。 */
export const MELEE_LUNGE_PX = 74;
/** 衝出去最少花多久：動作沒有命中格（命中時點是 0）時，也不要一格就跳到最前面。 */
const LUNGE_MIN_OUT_MS = 30;

/**
 * 近戰原地出招（使用者 2026-09-22 裁定）：角色留在自己的位置，往魔物方向衝一小段再退回，
 * 不再一格瞬移到魔物身邊、演完再一格跳回來（連出幾張會來回閃）。
 * 衝多遠取「到魔物面前的接觸點」與 74 像素的較小者，魔物很近時也不會衝過頭；上下不動。
 */
export function motionMeleePlan<Action extends string>(
  from: MeleePoint,
  target: MeleePoint,
  targetWidth: number,
  action: Action,
  strikeMs: number,
  impactDelayMs: number,
): MotionMeleePlan<Action> {
  const destinationX = Math.max(0, target.x - (targetWidth * 0.25 + 100));
  const reach = destinationX - from.x;
  const dx = Math.sign(reach) * Math.min(MELEE_LUNGE_PX, Math.abs(reach));
  const dy = 0;
  const approachMs = 0;
  const returnMs = 0;
  const impactMs = approachMs + impactDelayMs;
  return {
    dx,
    dy,
    approachMs,
    strikeMs,
    returnMs,
    impactMs,
    totalMs: approachMs + strikeMs + returnMs,
    action,
  };
}

export function qiuqiuMeleePlan(
  from: MeleePoint,
  target: MeleePoint,
  targetWidth: number,
  action: QiuqiuAction,
): QiuqiuMeleePlan {
  return motionMeleePlan(from, target, targetWidth, action,
    qiuqiuMotionDuration(action), qiuqiuImpactDelay(action));
}

/**
 * 出招期間離原位多遠（像素）：快速衝出去、在最前面停一下、再平順退回。
 * 衝到最前面的那一刻對準動作自己的命中格；最後三成五的時間退回，收招時剛好回到原位。
 *
 * `fromX`：上一招還沒退回原位就被這一招接手時，角色當下的位移。從那裡接著往前衝，
 * 連出幾張牌時才不會先跳回原位再衝一次。
 */
export function motionMeleeSample<Action extends string>(
  plan: MotionMeleePlan<Action>,
  elapsedMs: number,
  fromX = 0,
): { x: number; y: number; action: Action | 'idle'; facing: 1 | -1; done: boolean } {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  if (elapsed < plan.strikeMs) {
    const outEnd = Math.min(plan.strikeMs * 0.45, Math.max(plan.impactMs, LUNGE_MIN_OUT_MS));
    const backStart = Math.max(outEnd, plan.strikeMs * 0.65);
    let x = plan.dx;
    if (elapsed < outEnd) {
      const start = Number.isFinite(fromX) ? fromX : 0;
      x = start + (plan.dx - start) * (1 - (1 - elapsed / outEnd) ** 2);
    } else if (elapsed >= backStart) {
      const p = Math.min(1, (elapsed - backStart) / Math.max(1, plan.strikeMs - backStart));
      x = plan.dx * (1 - p * p * (3 - 2 * p));
    }
    return { x, y: plan.dy, action: plan.action, facing: 1, done: false };
  }
  return { x: 0, y: 0, action: 'idle', facing: 1, done: true };
}

export function qiuqiuMeleeSample(
  plan: QiuqiuMeleePlan,
  elapsedMs: number,
): { x: number; y: number; action: QiuqiuAction; facing: 1 | -1; done: boolean } {
  return motionMeleeSample(plan, elapsedMs);
}
