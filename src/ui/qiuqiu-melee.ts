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

export function motionMeleePlan<Action extends string>(
  from: MeleePoint,
  target: MeleePoint,
  targetWidth: number,
  action: Action,
  strikeMs: number,
  impactDelayMs: number,
): MotionMeleePlan<Action> {
  const destinationX = Math.max(0, target.x - (targetWidth * 0.25 + 100));
  const dx = destinationX - from.x;
  const dy = target.y - from.y;
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

export function motionMeleeSample<Action extends string>(
  plan: MotionMeleePlan<Action>,
  elapsedMs: number,
): { x: number; y: number; action: Action | 'idle'; facing: 1 | -1; done: boolean } {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  if (elapsed < plan.strikeMs) {
    return { x: plan.dx, y: plan.dy, action: plan.action, facing: 1, done: false };
  }
  return { x: 0, y: 0, action: 'idle', facing: 1, done: true };
}

export function qiuqiuMeleeSample(
  plan: QiuqiuMeleePlan,
  elapsedMs: number,
): { x: number; y: number; action: QiuqiuAction; facing: 1 | -1; done: boolean } {
  return motionMeleeSample(plan, elapsedMs);
}
