import type { FrameMotion } from './frame-motion';

/**
 * 四隻貓（球球、菲菲、噹噹、封封）逐格動作的播放倍速。
 * 使用者 2026-09-22 裁定：換成逐格動作後節奏變拖，角色動作整體加快 1.5 倍。
 *
 * 做法是在「資料載入時」就把時間換好：每格時長、命中時點、出手時點，
 * 以及散在各處、跟動作對拍的寫死毫秒數，一律經過 `motionMs()` 除以倍速。
 * 播放、傷害數字、飛針、手裏劍、分身拿的都是同一套已換算的時間，彼此自然對得上。
 * **每個數字只換算一次**：已經換算過的常數拿去相加（例如手裏劍的出手＋飛行）不可以再除一次。
 *
 * 不加速的：敵人（老鼠、黑忍者）的逐格動作、待機呼吸（frame-motion 的 6200 毫秒週期）、
 * 舊版靜態演出（`?motion=0`；受擊那張挨打立繪的 650 毫秒也算，見 `hit-recoil-motion.ts`）、
 * 發牌收牌、敵方回合步距、對白這些介面節奏。
 */
export const MOTION_SPEED = 1.5;

/**
 * 待機與走路、跑步的循環不加速：待機本來就停在固定一格只做呼吸縮放；
 * 走路、跑步只出現在過關那三秒的走路轉場，腳步聲照原本每 240 毫秒一步跟跑步循環對拍。
 */
const UNSCALED_ACTIONS: ReadonlySet<string> = new Set(['idle', 'walk', 'run']);

/**
 * 原速毫秒 → 加速後毫秒，四捨五入到整數毫秒。
 * 同一個單調的換算套在格子交界與命中點上，原本剛好落在交界的命中點（例如 220 毫秒）換算後仍在同一個交界。
 */
export function motionMs(ms: number): number {
  return Math.round(ms / MOTION_SPEED);
}

type TimedMotion = FrameMotion & Readonly<{ impactTimes?: readonly number[]; releaseTimes?: readonly number[] }>;

/**
 * 一個動作整份換成加速後的時間。每格時長從「累積到這格結束」的時間換算再相減，
 * 不逐格各自四捨五入——那樣誤差會一格一格累積，交界就對不上命中點。
 */
export function speedUpMotion<T extends TimedMotion>(motion: T): T {
  let sourceEnd = 0;
  let scaledEnd = 0;
  const frames = motion.frames.map((frame) => {
    sourceEnd += frame.duration * 1000;
    const end = motionMs(sourceEnd);
    const duration = (end - scaledEnd) / 1000;
    scaledEnd = end;
    return { ...frame, duration };
  });
  return {
    ...motion,
    frames,
    ...(motion.impactTimes ? { impactTimes: motion.impactTimes.map(motionMs) } : {}),
    ...(motion.releaseTimes ? { releaseTimes: motion.releaseTimes.map(motionMs) } : {}),
  };
}

/** 一整組動作在載入時換成加速後的時間（待機、走路、跑步照原速）。 */
export function speedUpMotions<T extends TimedMotion>(motions: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(motions).map(([action, motion]) => [
    action,
    UNSCALED_ACTIONS.has(action) ? motion : speedUpMotion(motion),
  ]));
}
