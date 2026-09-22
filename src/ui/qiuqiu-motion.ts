import motionData from './qiuqiu-motion-data.json';
import extraMotionData from './qiuqiu-extra-motion-data.json';
import attackMotionData from './qiuqiu-attack-motion-data.json';
import { createFrameMotionSet, frameMotionDuration, type FrameMotion, type FrameMotionActor } from './frame-motion';
import { HIT_RECOIL_MOTIONS } from './hit-recoil-motion';
import { DEFERRED_REST_ACTIONS } from './rest-state-motion';
import {
  qiuqiuChoreographyDuration,
  qiuqiuChoreographyPose,
  type QiuqiuPoseAction,
} from './qiuqiu-choreography';
import { preloadQiuqiuShuriken, QIUQIU_SHURIKEN_RELEASE_MS, QIUQIU_SHURIKEN_FLIGHT_MS } from './qiuqiu-shuriken';
import { motionMs, speedUpMotions } from './motion-speed';
import './styles/qiuqiu-motion.css';

export type QiuqiuAction = QiuqiuPoseAction
  | 'clone_duo'
  | 'ultimate_clone'
  | 'ultimate_storm'
  | 'ultimate_rush';

type Motion = FrameMotion & Readonly<{ impactTimes?: readonly number[] }>;

export type QiuqiuActor = FrameMotionActor<QiuqiuAction>;

const NATIVE_IDLE_HEIGHT = 252;
// 載入時整份換成 1.5 倍速的時間（見 motion-speed.ts）；受擊是一張新畫風挨打立繪停 0.65 秒，比照舊版靜態演出不加速（見 hit-recoil-motion.ts）
const motions: Record<string, Motion> = {
  ...speedUpMotions({
    ...(motionData.actions as unknown as Record<string, Motion>),
    ...(extraMotionData.actions as unknown as Record<string, Motion>),
    ...(attackMotionData.actions as unknown as Record<string, Motion>),
  }),
  hurt: HIT_RECOIL_MOTIONS.qiuqiu,
};

const FALLBACK_POSES: Partial<Record<QiuqiuPoseAction, QiuqiuPoseAction>> = {
  hurt: 'idle',
  down: 'idle',
  walk: 'run',
  roll: 'run',
  jump: 'idle',
  land: 'idle',
  dash: 'run',
  clone: 'idle',
  attack_run: 'attack1',
  attack_air: 'attack1',
  seal: 'idle',
  storm: 'shuriken',
  rush: 'run',
  combo_kick: 'attack1',
  uppercut: 'attack4',
  flying_kick: 'kick',
  guard: 'idle',
  eat: 'idle',
  win: 'idle',
  poison: 'hurt',
  belly: 'idle',
  defeat: 'down',
  puff: 'idle',
  stealth: 'idle',
  // 2026-09-21 的待機狀態：素材缺了就退回一般待機（戰鬥畫面那邊另有把關，缺圖時根本不會叫到這些動作）
  wounded: 'idle',
  power: 'idle',
  hungry: 'idle',
  dizzy: 'idle',
  lazy: 'idle',
  iron: 'idle',
  curl: 'idle',
  // 2026-09-22 的出牌動作：素材缺了就退回最接近的舊動作（戰鬥畫面另有把關，圖沒到時根本不會叫到這些動作）
  taiji: 'seal',
  qinggong: 'jump',
  focus: 'seal',
  scroll: 'seal',
};

const CARD_ACTIONS: Readonly<Record<string, QiuqiuAction>> = {
  shengdong: 'attack2',
  shunshou: 'attack1',
  bangnidianyixia: 'attack3',
  wobangnishouwei: 'attack4',
  zhaonishuodeda: 'attack1',
  jienideliqi: 'attack4',
  wozaizhe: 'attack1',
  susu: 'attack3',
  huixuan: 'kick',
  lianhuan: 'combo_kick',
  bunshin: 'clone',
  ruying: 'clone_duo',
  tieshazhang: 'attack3',
  qinna: 'attack3',
  tietou: 'body_bash',
  shihou: 'roar',
  dianxue: 'attack1',
  zuiquan: 'attack2',
  roubao: 'palm_combo',
  luoye: 'attack4',
  paozhao: 'attack1',
  canying: 'dash',
  shunkan: 'dash',
  beici: 'dash',
  zhuiji: 'dash',
  sashoujian: 'shuriken',
  dieda: 'attack1',
  shibadie: 'palm_combo',
  bengquan: 'uppercut',
  caiweiba: 'flying_kick',
  liandao: 'ultimate_rush',
  jiedao: 'attack3',
  wangming: 'body_bash',
  shierlian: 'ultimate_clone',
  dilie: 'ground_slam',
  ehou: 'attack1',
  jiuweiquan: 'uppercut',
  kawarimi: 'seal',
  zhangyan: 'seal',
  yinshen: 'seal',
  huanying: 'seal',
  yingzi: 'seal',
  jingzhi: 'seal',
  duxin: 'seal',
  sanhua: 'seal',
  tanding: 'guard',
  tiebushan: 'guard',
  bianshen: 'guard',
  touchi: 'eat',
  xianshuile: 'eat',
  guixi: 'eat',
  tianmao: 'eat',
  jiuming: 'eat',
  fanpu: 'eat',
};

const STATIC_ATTACK_CARDS = new Set(['juye', 'maoqiudan']);

// 原速（動作素材本身）的命中時點，載入時換成 1.5 倍速後的時間
const SOURCE_IMPACT_TIMES: Partial<Record<QiuqiuAction, readonly number[]>> = {
  attack1: [70],
  attack2: [90],
  attack3: [100],
  attack4: [160],
  kick: [200],
  dash: [60],
  clone: [180],
  clone_duo: [180, 420],
  combo_kick: [100, 270, 600],
  uppercut: [180],
  flying_kick: [100],
  ultimate_rush: [160, 400, 640],
  ultimate_clone: [420, 760, 1120],
  ultimate_storm: [470, 730],
};

const IMPACT_TIMES: Partial<Record<QiuqiuAction, readonly number[]>> = {
  ...Object.fromEntries(Object.entries(SOURCE_IMPACT_TIMES).map(([action, times]) => [action, times.map(motionMs)])),
  // 第一下＝手裏劍出手＋飛行，兩個常數在 qiuqiu-shuriken.ts 已經換算過，這裡不能再除一次
  shuriken: [QIUQIU_SHURIKEN_RELEASE_MS + QIUQIU_SHURIKEN_FLIGHT_MS, motionMs(490)],
};

const MELEE_ACTIONS = new Set<QiuqiuAction>([
  'attack1', 'attack2', 'attack3', 'attack4', 'attack_run', 'attack_air',
  'kick', 'combo_kick', 'dash', 'uppercut', 'flying_kick', 'ultimate_rush',
  'body_bash', 'palm_combo',
]);

// 肉球連擊素材的格子交界（原速 290／530／770 毫秒），跟素材一起換成 1.5 倍速
const PALM_COMBO_RECOVERY_START_MS = motionMs(770);
const PALM_COMBO_CONTACT_END_MS = [motionMs(290), motionMs(530), motionMs(770)] as const;
/** 素材只畫到第三下；要求更多下時，每多一下接在上一下後面（原速 150 毫秒）。 */
const EXTRA_IMPACT_GAP_MS = motionMs(150);

function qiuqiuWaveCount(waves: number | undefined): number {
  if (waves === undefined || !Number.isFinite(waves)) return 3;
  return Math.max(1, Math.min(3, Math.floor(waves)));
}

function qiuqiuMotionElapsed(action: QiuqiuAction, elapsed: number, waves: number | undefined): number {
  if (action !== 'palm_combo') return elapsed;
  const count = qiuqiuWaveCount(waves);
  const contactEnd = PALM_COMBO_CONTACT_END_MS[count - 1]!;
  return count < 3 && elapsed >= contactEnd
    ? PALM_COMBO_RECOVERY_START_MS + elapsed - contactEnd
    : elapsed;
}

/** 一般入口預設啟用新版動作；motion=0 保留靜態演出。 */
export function qiuqiuMotionEnabled(search = typeof location === 'undefined' ? '' : location.search): boolean {
  const params = new URLSearchParams(search);
  return params.has('motion-preview') || params.get('motion') !== '0';
}

/** 出牌規則要看的牌面資訊：牌型，以及這一次實際的效果（升級版可能多了抽牌或蜷縮）。 */
export type QiuqiuCardInfo = Readonly<{
  type?: string;
  effects?: readonly Readonly<{ kind: string }>[];
}>;

/** 技能牌的招式家族（`combat.ts` 的 `SKILL_POSE`）→ 自己的動作。2026-09-11 使用者要求分家的三路。 */
const SKILL_FAMILY_ACTIONS: Readonly<Record<string, QiuqiuAction>> = { roar: 'roar', taiji: 'taiji', qinggong: 'qinggong' };
const BLOCK_EFFECTS: ReadonlySet<string> = new Set(['block', 'blockAll', 'blockAlly', 'blockFromAllyBlock', 'blockIfPoisoned']);
const HEAL_EFFECTS: ReadonlySet<string> = new Set(['heal', 'healAlly']);

/**
 * 沒有逐張指定的技能與能力牌，照規則選動作（2026-09-22，盤點見 `docs/審查報告/缺動作的牌_2026-09-21.md`）。
 * 原本這些牌一律回 null，出牌時動作畫布收起來、舊版靜態立繪亮 0.65 秒——球球 126 張牌裡有 70 張是這樣。
 * 順序有意義：家族最優先（太極牌也有蜷縮，但它是太極）；能力牌一律運氣；
 * 有蜷縮的擺架式（跟淡定、鐵布衫同一套）；回血的吃（三隻同伴也是這條）；會抽牌的翻卷軸；其餘結印（跟替身術同一套）。
 */
function qiuqiuRuleAction(poseFamily: string | undefined, card: QiuqiuCardInfo | undefined): QiuqiuAction | null {
  if (!card?.type || card.type === '攻擊') return null;
  const family = poseFamily === undefined ? undefined : SKILL_FAMILY_ACTIONS[poseFamily];
  if (family) return family;
  if (card.type === '能力') return 'focus';
  const kinds = (card.effects ?? []).map((effect) => effect.kind);
  if (kinds.some((kind) => BLOCK_EFFECTS.has(kind))) return 'guard';
  if (kinds.some((kind) => HEAL_EFFECTS.has(kind))) return 'eat';
  if (kinds.includes('draw')) return 'scroll';
  return 'seal';
}

/**
 * 卡牌規則不在此處；本函式只決定視覺動作。
 * `card` 沒給時維持舊行為（只認逐張指定與爪擊），給了才套技能／能力牌的規則。
 */
export function qiuqiuCardAction(
  cardId: string,
  poseFamily: string | undefined,
  clawIndex: number,
  upgraded = false,
  card?: QiuqiuCardInfo,
): QiuqiuAction | null {
  if (cardId === 'luanwu') return upgraded ? 'ultimate_storm' : 'shuriken';
  if (STATIC_ATTACK_CARDS.has(cardId)) return null;
  const mapped = CARD_ACTIONS[cardId];
  if (mapped) return mapped;
  if (poseFamily === 'claw') {
    const variants: readonly QiuqiuAction[] = ['attack1', 'attack2', 'attack3', 'attack4'];
    return variants[((clawIndex % variants.length) + variants.length) % variants.length] ?? 'attack1';
  }
  return qiuqiuRuleAction(poseFamily, card);
}

export function qiuqiuIsMelee(action: QiuqiuAction): boolean {
  return MELEE_ACTIONS.has(action);
}

export function qiuqiuImpactTimes(action: QiuqiuAction, count: number): number[] {
  const wanted = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const base = IMPACT_TIMES[action] ?? motions[action]?.impactTimes;
  if (!base?.length || wanted === 0) return [];
  const result = base.slice(0, wanted);
  while (result.length < wanted) result.push(result.at(-1)! + EXTRA_IMPACT_GAP_MS);
  return result;
}

/** 保留舊有單次命中 API，取第一個真正命中時間。 */
export function qiuqiuImpactDelay(action: QiuqiuAction): number {
  return qiuqiuImpactTimes(action, 1)[0] ?? 0;
}

/** 這個動作有沒有自己的逐格素材（不算退路）。待機狀態缺圖時要交還舊立繪，不能退成一般站姿。 */
export function qiuqiuHasOwnMotion(action: QiuqiuPoseAction): boolean {
  return Object.hasOwn(motions, action);
}

function motionForPose(action: QiuqiuPoseAction): Motion {
  const direct = motions[action];
  if (direct) return direct;
  const fallback = FALLBACK_POSES[action];
  if (fallback && motions[fallback]) return motions[fallback]!;
  return motions.idle!;
}

export function qiuqiuMotionDuration(action: QiuqiuAction, waves?: number): number {
  const compositeDuration = qiuqiuChoreographyDuration(action);
  if (compositeDuration !== null) return compositeDuration;
  const motion = motionForPose(action as QiuqiuPoseAction);
  // 用有快取的那一支：非循環動作播放時每一格都會問一次總長（清理 2026-09-22）
  const fullDuration = frameMotionDuration(motion);
  if (action !== 'palm_combo') return fullDuration;
  const contactEnd = PALM_COMBO_CONTACT_END_MS[qiuqiuWaveCount(waves) - 1]!;
  return contactEnd + fullDuration - PALM_COMBO_RECOVERY_START_MS;
}

export type QiuqiuCombatMotionDecision = 'play' | 'keep' | 'stop';

export function qiuqiuCombatMotionDecision(
  phase: string,
  requested: boolean,
  alreadyPlaying: boolean,
): QiuqiuCombatMotionDecision {
  if (phase === 'lost') return 'stop';
  if (requested && (phase === 'player' || phase === 'won')) return 'play';
  if (alreadyPlaying && (phase === 'player' || phase === 'won')) return 'keep';
  return phase === 'player' ? 'keep' : 'stop';
}

function loops(action: QiuqiuAction, motion: Motion): boolean {
  if (action === 'idle' || action === 'poison') return true;
  if (action === 'down' || action === 'defeat' || action === 'guard') return false;
  return qiuqiuChoreographyDuration(action) === null && motion.loop;
}

function motionKeyForPose(action: QiuqiuPoseAction): string {
  if (motions[action]) return action;
  const fallback = FALLBACK_POSES[action];
  if (fallback && motions[fallback]) return fallback;
  return 'idle';
}

/**
 * 2026-09-22 補的出牌動作（太極、輕功、運氣、翻卷軸）。比照待機狀態圖：不解碼預載，
 * 預載完才在背景下載並排進背景解開——一場戰鬥不一定用得到，全部解碼預載會把常用的爪擊圖擠出快取。
 */
export const DEFERRED_QIUQIU_CARD_ACTIONS: ReadonlySet<string> = new Set(['taiji', 'qinggong', 'focus', 'scroll']);
export const DEFERRED_QIUQIU_ACTIONS: ReadonlySet<string> = new Set([...DEFERRED_REST_ACTIONS, ...DEFERRED_QIUQIU_CARD_ACTIONS]);

const qiuqiuFrameMotions = createFrameMotionSet<QiuqiuAction>({
  motions,
  deferred: DEFERRED_QIUQIU_ACTIONS,
  nativeHeight: NATIVE_IDLE_HEIGHT,
  initialAction: 'idle',
  // 2026-09-21 的待機狀態比照翻肚：前 7 格是從一般待機轉進狀態的過場，播完停在第 8 格慢慢呼吸
  restFrames: {
    poison: 3, puff: 0, stealth: 0, belly: 7,
    wounded: 7, power: 7, hungry: 7, dizzy: 7, lazy: 7, iron: 7, curl: 7,
  },
  className: 'qiuqiu-motion',
  ariaLabel: '\u7403\u7403',
  resolve: (action, elapsed, options) => {
    const planned = qiuqiuChoreographyPose(action, elapsed);
    const poseAction = (planned?.action ?? action) as QiuqiuPoseAction;
    const motion = motionForPose(poseAction);
    return {
      key: motionKeyForPose(poseAction),
      elapsed: planned?.elapsed ?? qiuqiuMotionElapsed(action, elapsed, options.waves),
      loop: planned ? motion.loop : loops(action, motion),
    };
  },
  duration: (action, options) => qiuqiuMotionDuration(action, options.waves),
});

/** 每個貼圖網址只建立一個影像，並一併預載額外動作素材。 */
export async function preloadQiuqiuMotion(): Promise<void> {
  await Promise.all([qiuqiuFrameMotions.preload(), preloadQiuqiuShuriken()]);
}

/** 延後下載的待機狀態圖還沒到（或壞了）時回 false，戰鬥畫面就先交還靜態立繪。 */
export function qiuqiuMotionDrawable(action: QiuqiuAction): boolean {
  return qiuqiuFrameMotions.drawable(action);
}

/**
 * 出牌時這個動作能不能播。延後下載的出牌動作圖還沒到（或壞了）就回 false，
 * 戰鬥畫面退回「選不到動作」的舊行為（靜態立繪），不能停在上一個動作的最後一格；圖到了下一張牌就用新動作。
 * 其他動作（預載的、組合動作）照舊一律可播。
 */
export function qiuqiuCardMotionPlayable(action: QiuqiuAction): boolean {
  return !DEFERRED_QIUQIU_CARD_ACTIONS.has(action) || qiuqiuFrameMotions.drawable(action);
}

export function qiuqiuMotionReady(): boolean {
  return qiuqiuFrameMotions.ready();
}

export function createQiuqiuActor(options: { height?: number; action?: QiuqiuAction } = {}): QiuqiuActor {
  return qiuqiuFrameMotions.createActor(options);
}
