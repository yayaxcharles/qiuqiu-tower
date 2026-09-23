import { qiuqiuHasOwnMotion, qiuqiuImpactTimes, qiuqiuMotionDrawable, qiuqiuMotionDuration, type QiuqiuAction } from './qiuqiu-motion';
import { restStateAction, type RestStatePoses } from './rest-state-motion';
import {
  companionImpactDelay,
  companionImpactTimes,
  companionMotionDuration,
  type CompanionMotionKind,
  type CompanionMotionAction,
} from './companion-motion';
import { enemyMotionDuration, type EnemyMotionAction, type EnemyMotionKind } from './enemy-motion';
import { isFeifeiNeedleAction } from './feifei-needle-patterns';
import type { MotionMeleePlan } from './qiuqiu-melee';

export type QiuqiuCombatImpact = Readonly<{
  at: number;
  amount: number;
  pendingAfter: number;
}>;

export type CombatMotionTargetState = Readonly<{
  hp: number;
  dead: boolean;
  debuff: number;
}>;

export function resizeMotionMeleeTrip<Action extends string>(
  trip: { plan: MotionMeleePlan<Action>; origin: { x: number; y: number } } | undefined,
  strikeMs: number,
): { plan: MotionMeleePlan<Action>; origin: { x: number; y: number } } | undefined {
  if (!trip) return undefined;
  const duration = Number.isFinite(strikeMs) ? Math.max(0, strikeMs) : 0;
  return {
    ...trip,
    plan: {
      ...trip.plan,
      strikeMs: duration,
      totalMs: trip.plan.approachMs + duration + trip.plan.returnMs,
    },
  };
}

export function extendConfirmedMotionWaves(current: number, impactPlan: readonly unknown[]): number {
  return Math.max(Math.max(0, Math.floor(current)), impactPlan.length);
}

export type QiuqiuMotionBatchBoundary = Readonly<{
  hitStart: number;
  hitEnd: number;
  logStart: number;
  logEnd: number;
}>;

export type CombatMotionSource = 'qiuqiu' | CompanionMotionKind;
export type CombatMotionAction = QiuqiuAction | CompanionMotionAction;

export class LocalMotionPresentationQueue<Value> {
  private readonly pending = new Map<string, Value[]>();
  private inFlight: { key: string; value: Value } | undefined;

  record(key: string, value: Value): void {
    const queue = this.pending.get(key);
    if (queue) queue.push(value);
    else this.pending.set(key, [value]);
    this.inFlight = { key, value };
  }

  take(key: string): Value | undefined {
    const queue = this.pending.get(key);
    const value = queue?.shift();
    if (queue?.length === 0) this.pending.delete(key);
    if (value !== undefined && this.inFlight?.key === key && Object.is(this.inFlight.value, value)) {
      this.inFlight = undefined;
    }
    return value;
  }

  /** 會話拒絕本次送出時，只移除這一次入列的預演，不碰同鍵較早的確認。 */
  dropInFlight(): Value | undefined {
    const current = this.inFlight;
    this.inFlight = undefined;
    if (!current) return undefined;
    const queue = this.pending.get(current.key);
    const index = queue?.findIndex((value) => Object.is(value, current.value)) ?? -1;
    if (!queue || index < 0) return undefined;
    const [value] = queue.splice(index, 1);
    if (queue.length === 0) this.pending.delete(current.key);
    return value;
  }

  clear(): void {
    this.pending.clear();
    this.inFlight = undefined;
  }
}

export function combatMotionPresentationDuration(
  source: CombatMotionSource,
  action: CombatMotionAction,
  waves = 1,
): number {
  return source === 'qiuqiu'
    ? qiuqiuMotionDuration(action as QiuqiuAction, waves)
    : companionMotionDuration(source, action as CompanionMotionAction, waves);
}

export function combatMotionPresentationWait(
  source: CombatMotionSource,
  action: CombatMotionAction,
  waves: number,
  elapsed: number,
  tail = 30,
): number {
  return Math.max(0, combatMotionPresentationDuration(source, action, waves) - Math.max(0, elapsed)) + tail;
}

export function combatMotionPresentationWaitAt(
  source: CombatMotionSource,
  action: CombatMotionAction,
  waves: number,
  startedAt: number,
  now = Date.now(),
  tail = 30,
): number {
  return combatMotionPresentationWait(source, action, waves, Math.max(0, now - startedAt), tail);
}

export type DeferredCombatMotionPresentationWait = number | (() => number);

export function resolveCombatMotionPresentationWait(wait: DeferredCombatMotionPresentationWait): number {
  return typeof wait === 'function' ? wait() : wait;
}

export function motionPresentationMatches(
  playedHere: boolean,
  presentationToken: number | undefined,
  activePresentationToken: number | undefined,
): boolean {
  return !playedHere || presentationToken === undefined || presentationToken === activePresentationToken;
}

export function shouldResumeConfirmedMotion(options: Readonly<{
  playedHere: boolean;
  active: boolean;
  elapsed: number;
  duration: number;
  presentationToken?: number;
  activePresentationToken?: number;
}>): boolean {
  return options.playedHere
    && motionPresentationMatches(true, options.presentationToken, options.activePresentationToken)
    && !options.active
    && options.elapsed < options.duration;
}

export function combatQiValue(hero: string, qi: number | undefined): number | undefined {
  if (hero !== 'fengfeng') return undefined;
  const value = Number.isFinite(qi) ? Math.trunc(qi!) : 0;
  return Math.max(0, Math.min(12, value));
}

/**
 * 敵人逐格跟著動作模式（網址沒寫 `?motion=0`）啟用，不看隊伍裡是誰（2026-09-23 health H-7）。
 *
 * 原本還要「隊伍裡有已接入逐格的角色」，四隻都接入之後那條對現有角色永遠成立，
 * 反而是個反向陷阱：加第五隻貓時他一個人玩，魔物的逐格動作會整個關掉、不報錯。
 * 第二個參數沒在用，留著只是這一輪不動 `combat.ts` 的呼叫端（其中一處在預載那段）；之後可以改成直接看 `motionEnabled`。
 */
export function qiuqiuEnemyMotionAllowed(enabled: boolean, _heroes?: readonly string[]): boolean {
  return enabled;
}

/** 一次引擎動作真正消耗了幾層目標隱身。 */
export function qiuqiuConsumedStealth(before: number, after: number): number {
  return Math.max(0, Math.trunc(before) - Math.trunc(after));
}

/** 自己出招時的反彈只顯示紅閃與數字，不拿受傷動作蓋掉本張出招。 */
export function qiuqiuShouldPlayHurt(options: Readonly<{
  reactionSeat: number;
  beforeHp: number;
  afterHp: number;
  outgoingSeat?: number;
  hasOutgoingMotion: boolean;
}>): boolean {
  if (options.afterHp >= options.beforeHp) return false;
  return !(options.hasOutgoingMotion && options.outgoingSeat === options.reactionSeat);
}

/** 格擋量來自該 UID 自己的 block 差；沒有命中紀錄就不顯示。 */
export function qiuqiuEnemyBlocked(beforeBlock: number, afterBlock: number, hitCount: number): number {
  return hitCount > 0 ? Math.max(0, beforeBlock - afterBlock) : 0;
}

/** 勝利動作的完整長度：收場時要重播勝利的座位等這麼久，已經在播的只等剩下的（見 combat.ts 的 checkOver）。 */
export function qiuqiuVictoryLinger(enabled: boolean, heroes: readonly string[]): number {
  if (!enabled) return 0;
  return Math.max(
    heroes.includes('ninja') ? qiuqiuMotionDuration('win') : 0,
    heroes.includes('feifei') ? companionMotionDuration('feifei', 'win') : 0,
    heroes.includes('dangdang') ? companionMotionDuration('dangdang', 'win') : 0,
    heroes.includes('fengfeng') ? companionMotionDuration('fengfeng', 'win') : 0,
  );
}

/**
 * 收場前「還有逐格動作在演嗎」（2026-09-23 稽核 低-1）。
 *
 * 動作的 `active` 只在畫面刷新回呼（rAF）裡收掉，而**分頁在背景時瀏覽器不給畫面刷新**：
 * 同伴補最後一刀時我這台在背景，那一刀的動作永遠收不掉，收場每 80 毫秒重排一次、一直停在打完的戰鬥畫面，
 * 同伴早就在戰利品頁等我挑牌（切回前景才接上）。
 * 所以不能只看 `active`：背景分頁一律當演完（反正看不到）；前景時超過預定結束（`endsAt`）一段還沒收的也當演完。
 * 刷新回呼正常時，結束那一刻十幾毫秒內就會收掉，所以前景的正常演出不會被這條提早切掉。
 */
export const MOTION_OVERRUN_MS = 500;
export function motionStillPlaying(states: Iterable<Readonly<{ active: boolean; endsAt: number }>>, now: number,
  hidden = typeof document !== 'undefined' && document.hidden === true): boolean {
  if (hidden) return false;
  for (const state of states) if (state.active && now < state.endsAt + MOTION_OVERRUN_MS) return true;
  return false;
}

/** 敵人逐格不能被通用 650ms 收姿勢計時提早截斷。 */
export function qiuqiuEnemyMotionHold(kind: EnemyMotionKind, action: EnemyMotionAction, baseMs: number): number {
  return Math.max(baseMs, enemyMotionDuration(kind, action));
}

/** 將連線批次的累積游標轉成逐張牌互不重疊的命中／紀錄區間。 */
export function qiuqiuMotionBatchBoundaries(
  points: readonly Readonly<{ hitsLen: number; logLen: number }>[],
): QiuqiuMotionBatchBoundary[] {
  const result: QiuqiuMotionBatchBoundary[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1]!;
    const after = points[index]!;
    result.push({
      hitStart: before.hitsLen,
      hitEnd: after.hitsLen,
      logStart: before.logLen,
      logEnd: after.logLen,
    });
  }
  return result;
}

/** 把引擎已確認的指定目標命中，對齊球球動作的逐段節拍。 */
export function buildQiuqiuCombatImpactPlan(
  action: QiuqiuAction,
  hits: readonly Readonly<{ uid: number; amount: number }>[],
  targetUid: number,
  leadingMisses = 0,
): QiuqiuCombatImpact[] {
  const amounts = [
    ...Array.from({ length: Math.max(0, Math.trunc(leadingMisses)) }, () => 0),
    ...hits.filter((hit) => hit.uid === targetUid).map((hit) => hit.amount),
  ];
  const times = qiuqiuImpactTimes(action, amounts.length);
  let pending = amounts.reduce((sum, amount) => sum + amount, 0);
  return amounts.map((amount, index) => {
    pending -= amount;
    return { at: times[index] ?? 0, amount, pendingAfter: pending };
  });
}

export function buildCombatMotionImpactPlan(
  source: CombatMotionSource,
  action: CombatMotionAction,
  hits: readonly Readonly<{ uid: number; amount: number }>[],
  targetUid: number,
  leadingMisses = 0,
): QiuqiuCombatImpact[] {
  if (source === 'qiuqiu') {
    return buildQiuqiuCombatImpactPlan(action as QiuqiuAction, hits, targetUid, leadingMisses);
  }
  const amounts = [
    ...Array.from({ length: Math.max(0, Math.trunc(leadingMisses)) }, () => 0),
    ...hits.filter((hit) => hit.uid === targetUid).map((hit) => hit.amount),
  ];
  const times = companionImpactTimes(source, action as CompanionMotionAction, amounts.length);
  let pending = amounts.reduce((sum, amount) => sum + amount, 0);
  return amounts.map((amount, index) => {
    pending -= amount;
    return { at: times[index] ?? 0, amount, pendingAfter: pending };
  });
}

/** 沒有傷害紀錄的菲菲毒招仍要依狀態差，在真正命中時點播放完整視覺。 */
export function buildFeifeiStatusImpactPlan(
  action: CompanionMotionAction,
  before: CombatMotionTargetState,
  current: CombatMotionTargetState,
  comparison?: CombatMotionTargetState,
): QiuqiuCombatImpact[] {
  if (action !== 'clone' && !isFeifeiNeedleAction(action)) return [];
  const after = comparison ?? current;
  const hpDamage = Math.max(0, before.hp - after.hp);
  if (after.debuff <= before.debuff && hpDamage === 0 && after.dead === before.dead) return [];
  return [{
    at: companionImpactDelay('feifei', action),
    amount: action === 'clone' ? 0 : hpDamage,
    pendingAfter: 0,
  }];
}

/** 只把有同源逐格素材的普通怪交給敵人動作層。 */
export function qiuqiuEnemyMotionKind(enemyId: string): EnemyMotionKind | undefined {
  if (enemyId === 'rat' || enemyId === 'rat_guard') return 'rat';
  if (enemyId === 'black_ninja' || enemyId === 'black_ninja_elite' || enemyId === 'sparring_partner') return 'ninja';
  return undefined;
}

/**
 * 沒有逐格素材的狀態回交既有立繪，避免動作畫布把狀態外觀蓋掉。
 * 狀態 → 動作的對照在 `rest-state-motion.ts`（四隻貓共用）。
 */
export function qiuqiuRestMotionAction(
  displayedPose: string,
  poses: RestStatePoses,
  phase: string,
  down: boolean,
): QiuqiuAction | undefined {
  if (down || phase === 'lost') return 'defeat';
  if (phase === 'won') return 'win';
  // 圖還沒下載好（或載入失敗）就交還靜態立繪，不要停在上一個動作的最後一格（審查 2026-09-21 中-2）
  return restStateAction(displayedPose, poses, (action) => qiuqiuHasOwnMotion(action) && qiuqiuMotionDrawable(action));
}
