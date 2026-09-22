import feifeiMotionData from './feifei-motion-data.json';
import feifeiNeedleMotionData from './feifei-needle-motion-data.json';
import dangdangMotionData from './dangdang-motion-data.json';
import dangdangAttackMotionData from './dangdang-attack-motion-data.json';
import fengfengMotionData from './fengfeng-motion-data.json';
import fengfengAttackMotionData from './fengfeng-attack-motion-data.json';
import { HIT_RECOIL_MOTIONS } from './hit-recoil-motion';
import {
  FEIFEI_NEEDLE_CARD_ACTION,
  feifeiNeedleFlightMs,
  feifeiNeedleGapMs,
  feifeiNeedleReleaseTimes,
  isFeifeiNeedleAction,
  type FeifeiNeedleAction,
} from './feifei-needle-patterns';
import {
  createFrameMotionSet,
  frameMotionDuration,
  type FrameMotion,
  type FrameMotionActor,
  type FrameMotionPlayOptions,
} from './frame-motion';
import { DEFERRED_COMPANION_REST_ACTIONS, restStateAction, type RestStateAction, type RestStatePoses } from './rest-state-motion';
import { motionMs, speedUpMotions } from './motion-speed';
import './styles/companion-motion.css';

export type CompanionMotionKind = 'feifei' | 'dangdang' | 'fengfeng';

/**
 * 2026-09-21 補的待機狀態動作（三隻同伴共用同一組名字，對照表在 `rest-state-motion.ts`）。
 * 掛彩叫 wounded，因為 hurt 已經是「挨打那一下」的反應動作。
 */
export type CompanionRestStateAction = Exclude<RestStateAction, 'poison'>;

export type FeifeiMotionAction =
  | 'idle' | 'hurt' | 'run' | 'roll'
  | 'attack1' | 'kick' | 'seal'
  | 'guard' | 'eat' | 'win' | 'defeat' | 'poison'
  | 'clone'
  // 2026-09-22 補的出牌動作：吼（含獅吼功）、太極
  | 'roar' | 'taiji'
  | CompanionRestStateAction
  | FeifeiNeedleAction;

export type DangdangMotionAction =
  | 'idle' | 'hurt' | 'run' | 'dodge'
  | 'punch' | 'palm' | 'palm_throw' | 'kick' | 'shoulder' | 'counter' | 'ground_slam'
  | 'rapid_combo' | 'heavy_palm' | 'sweep_combo' | 'reckless_bash'
  | 'guard' | 'focus' | 'eat' | 'win' | 'defeat' | 'poison'
  | CompanionRestStateAction;

export type FengfengMotionAction =
  | 'idle' | 'hurt' | 'run' | 'dodge'
  | 'slash' | 'sweep' | 'heavy_slash' | 'thrust' | 'thrust_throw' | 'double_slash'
  | 'sword_combo' | 'qi_cleave' | 'earth_split' | 'retreat_thrust'
  | 'guard' | 'focus' | 'sheath' | 'eat' | 'win' | 'defeat' | 'poison'
  // 2026-09-22 補的出牌動作：吼（含獅吼功）、太極，劍都不出鞘
  | 'roar' | 'taiji'
  | CompanionRestStateAction;

export type CompanionMotionAction = FeifeiMotionAction | DangdangMotionAction | FengfengMotionAction;
export type CompanionMotionActor = FrameMotionActor<CompanionMotionAction>;

export type CompanionCardMotionOptions = Readonly<{
  poseFamily?: string;
  cardType?: string;
  hasBlock?: boolean;
  hasHeal?: boolean;
}>;

type TimedFrameMotion = FrameMotion & Readonly<{ impactTimes?: readonly number[] }>;

const NATIVE_HEIGHT = 252;
// 以下都是跟動作對拍的時間：motionMs() 括號裡是原速毫秒，跟動作資料一起換成 1.5 倍速（見 motion-speed.ts）
const EXTRA_WAVE_MS = motionMs(140);
const CLONE_APPEAR_MS = motionMs(180);
const CLONE_ATTACK_MS = motionMs(350);
const CLONE_IMPACT_MS = motionMs(690);
const CLONE_FADE_MS = motionMs(140);
const CLONE_SEAL_HOLD_MS = motionMs(170);
const FENGFENG_SHEATH_SKIP_MS = motionMs(120);

// 載入時整份換成 1.5 倍速的時間；受擊是一張新畫風挨打立繪停 0.65 秒，比照舊版靜態演出不加速（見 hit-recoil-motion.ts）
const feifeiMotions = {
  ...speedUpMotions({
    ...feifeiMotionData.actions,
    ...feifeiNeedleMotionData.actions,
  } as unknown as Record<string, TimedFrameMotion>),
  hurt: HIT_RECOIL_MOTIONS.feifei,
} as Record<string, TimedFrameMotion>;
/**
 * 噹噹、封封沒有投擲動作，丟東西（丟出去的忍具、聚葉成刀、撒手鐧、毛球彈⋯⋯）借用原地推掌、原地一刺（2026-09-22，批次 proj）。
 * 借用的是同一套圖，但**不衝上前**（東西是丟出去的），而且命中時點要讓飛行物從手上出去再飛到：
 * 出手＝推掌那隻手伸出去那一格（第 4 格，原速 290 毫秒）、封封空著的左手往前推那一格（第 3 格，原速 150 毫秒）；
 * 命中＝出手＋飛行（噹噹 170 毫秒跟球球的手裏劍一樣；封封沿用突刺原本的命中點 300 毫秒，飛 150 毫秒）。
 * 近身推掌的命中點（340）是手掌碰到魔物那一格，丟東西時用那個，東西只飛 30 毫秒、看起來像瞬間移動。
 */
const COMPANION_THROW_SOURCE: Readonly<Record<'dangdang' | 'fengfeng', Readonly<Record<string, { from: string; release: number; impact: number }>>>> = {
  dangdang: { palm_throw: { from: 'palm', release: 290, impact: 460 } },
  fengfeng: { thrust_throw: { from: 'thrust', release: 150, impact: 300 } },
};
const throwAliases = (kind: 'dangdang' | 'fengfeng', actions: Readonly<Record<string, TimedFrameMotion>>) =>
  Object.fromEntries(Object.entries(COMPANION_THROW_SOURCE[kind]).map(([alias, { from, impact }]) => [
    alias, { ...actions[from]!, impactTimes: [impact] },
  ]));
/** 丟東西的動作在第幾毫秒出手（已換成 1.5 倍速）；不是丟東西的動作回 undefined */
export function companionThrowRelease(kind: CompanionMotionKind, action: string): number | undefined {
  if (kind === 'feifei') return undefined;
  const entry = COMPANION_THROW_SOURCE[kind][action];
  return entry ? motionMs(entry.release) : undefined;
}

const dangdangMotions = {
  ...speedUpMotions({
    ...dangdangMotionData.actions,
    ...dangdangAttackMotionData.actions,
    ...throwAliases('dangdang', dangdangMotionData.actions as unknown as Record<string, TimedFrameMotion>),
  } as unknown as Record<string, TimedFrameMotion>),
  hurt: HIT_RECOIL_MOTIONS.dangdang,
} as Record<string, TimedFrameMotion>;
const fengfengMotions = {
  ...speedUpMotions({
    ...fengfengMotionData.actions,
    ...fengfengAttackMotionData.actions,
    ...throwAliases('fengfeng', fengfengMotionData.actions as unknown as Record<string, TimedFrameMotion>),
  } as unknown as Record<string, TimedFrameMotion>),
  hurt: HIT_RECOIL_MOTIONS.fengfeng,
} as Record<string, TimedFrameMotion>;
const FEIFEI_DIRECT_ACTIONS = new Set<CompanionMotionAction>(Object.keys(feifeiMotions) as CompanionMotionAction[]);
const DANGDANG_DIRECT_ACTIONS = new Set<CompanionMotionAction>(Object.keys(dangdangMotions) as CompanionMotionAction[]);
const FENGFENG_DIRECT_ACTIONS = new Set<CompanionMotionAction>(Object.keys(fengfengMotions) as CompanionMotionAction[]);
const FEIFEI_GUARD_CARDS = new Set([
  'feifei_tuikai', 'feifei_tieqiang', 'feifei_tanlu',
  'feifei_suoshou', 'feifei_taoshengsuo',
]);
/** 共用牌在菲菲手上已改成針術；沿用針牌整身動作，但命中波數仍由戰鬥結算決定。 */
const FEIFEI_SHARED_NEEDLE_CARD_ACTION: Readonly<Record<string, FeifeiNeedleAction>> = {
  paozhao: 'shuriken',
  roubao: 'needle_combo',
  lianhuan: 'needle_combo',
  huixuan: 'needle_fan',
  dieda: 'needle_barrage',
  bengquan: 'needle_pierce',
  jiuweiquan: 'needle_barrage',
  zuiquan: 'needle_fan',
  caiweiba: 'needle_venom',
  ehou: 'needle_venom',
  // 2026-09-22 補（原本選不到動作）：點穴是一針扎穴、十二連環打全體三段跟「全撒了」同一路、
  // 撒手鐧是一記飛出去的暗器（球球這張也是手裡劍）。這三張招式本身明確，所以逐張指定。
  dianxue: 'needle_pierce',
  shierlian: 'needle_barrage',
  sashoujian: 'shuriken',
  // 2026-09-22 晚：這三張原本刻意只演卡圖（毒丸、毒砂、繩索不是針），出牌時露出舊立繪。
  // 改成配最像的出手：毒丸彈一彈、毒砂一把撒出去、絆索反手甩出去（飛出去的東西見 projectile-kinds.ts）
  maoqiudan: 'shuriken',
  tieshazhang: 'needle_fan',
  qinna: 'needle_backhand',
  // 2026-09-22（批次 proj）：這兩張原本是近身爪擊（衝上去抓一下），但牌面畫的是她把葉片、手裏劍撒出去。
  // 聚葉成刀打全體兩輪、用撒針那一套一把撒出去；手裏劍亂舞打全體兩輪、用連撒兩次的那一套
  juye: 'needle_fan',
  luanwu: 'storm',
};
const EAT_CARDS = new Set(['touchi', 'xianshuile', 'guixi', 'tianmao', 'jiuming', 'fanpu']);

const DANGDANG_CARD_ACTION: Readonly<Record<string, DangdangMotionAction>> = {
  taiji: 'counter',
  dangdang_zhengquan: 'punch', dangdang_jiapan: 'guard', dangdang_huijing: 'guard',
  dangdang_xieli: 'palm', dangdang_huben: 'guard', dangdang_yingpeng: 'punch',
  dangdang_tiesha: 'guard', dangdang_tiaoxin: 'guard', dangdang_fanshou: 'rapid_combo',
  dangdang_wenzhu: 'guard', dangdang_jieliqi: 'focus', dangdang_bengshan: 'heavy_palm',
  dangdang_jiahou: 'focus', dangdang_yibi: 'counter', dangdang_zhendang: 'ground_slam',
  dangdang_jianzhao: 'guard', dangdang_yingkang: 'guard', dangdang_zhanzhuang: 'focus',
  dangdang_jieshi: 'guard', dangdang_jielidali: 'counter', dangdang_shunshi: 'focus',
  dangdang_fanzhen: 'guard', dangdang_yishenzuodun: 'focus', dangdang_tongqiang: 'focus',
  dangdang_tieshan: 'shoulder', dangdang_hubigong: 'focus', dangdang_huima: 'counter',
  dangdang_qianjin: 'ground_slam', dangdang_yishang: 'focus', dangdang_sheshen: 'reckless_bash',
};

const DANGDANG_SHARED_GROUPS: Readonly<Record<DangdangMotionAction, readonly string[]>> = {
  idle: [], hurt: [], run: [], poison: [], win: [], defeat: [],
  // 待機狀態不是出牌動作，沒有牌對應過來
  wounded: [], power: [], hungry: [], dizzy: [], belly: [], stealth: [], lazy: [], puff: [], iron: [], curl: [],
  palm: [
    'shengdong', 'shunshou', 'bangnidianyixia', 'wobangnishouwei', 'zhaonishuodeda',
    'jienideliqi', 'wozaizhe', 'susu', 'tieshazhang', 'luoye',
    'paozhao', 'dieda', 'liandao', 'zhuiji',
  ],
  // 丟出去的三張（2026-09-22，批次 proj）：原本跟著近身推掌衝上去拍一下，牌面畫的卻是葉片、木桶、毛球飛出去。
  // 改成原地推掌、東西從手上飛出去（見 COMPANION_THROW_SOURCE）
  palm_throw: ['juye', 'sashoujian', 'maoqiudan'],
  punch: ['qinna', 'dianxue', 'zuiquan', 'bengquan', 'ehou', 'jiuweiquan'],
  kick: ['caiweiba', 'huixuan'],
  shoulder: ['shunkan', 'beici'],
  rapid_combo: ['roubao', 'shierlian'],
  sweep_combo: ['luanwu', 'lianhuan'],
  reckless_bash: ['wangming'],
  heavy_palm: [],
  counter: ['jiedao', 'jiaochulai', 'shuaiguo', 'yide', 'fanzhua', 'tuishou', 'jieli'],
  ground_slam: ['shihou', 'weihe', 'chudashi', 'youcike', 'boming'],
  guard: [
    'fenyiban', 'ninaqudang', 'wolaidang', 'huannieduochoudian', 'kaoniyixia',
    'chenxianzaichushou', 'xianbangniliuzhe', 'bianshen', 'meikandao', 'jinzhong',
    'suoyituan', 'hujin', 'tiebushan',
  ],
  dodge: ['zhanshu', 'gaotui', 'yixing', 'diaohu'],
  eat: ['xianshuile', 'guixi', 'tianmao', 'jiuming', 'fanpu'],
  focus: [
    'bangnisheme', 'jienicailiangbu', 'niyechouyizhang', 'wobangnipaidiao',
    'fantuanfenni', 'shoujiewoyixia', 'yuganjijiu', 'yiqichuankou',
    'huannimangyixia', 'zhexienixianchi', 'biezhanzaishenshang', 'duxin',
    'qianliyan', 'shunfenger', 'dingshang', 'tuozi', 'dingshen', 'cuimian',
    'fengkou', 'touchi', 'xuli', 'gekong', 'liangzhua', 'sanhua', 'jingzhi',
    'doumao', 'qianglafen', 'cuiye', 'nimangwobuwei', 'fantuanliuyikou',
    'jiejie', 'fantan', 'renwuwancheng', 'fengyin', 'mabu', 'yungong',
    'wanhua', 'wufeng', 'tiexin', 'huxin',
  ],
};

const DANGDANG_SHARED_ACTION = new Map<string, DangdangMotionAction>();
for (const [action, cards] of Object.entries(DANGDANG_SHARED_GROUPS)) {
  for (const card of cards) DANGDANG_SHARED_ACTION.set(card, action as DangdangMotionAction);
}
// 壞毛病都不可打出，打不出去就不會走到這裡；黏液、眼冒金星打得出去，2026-09-22 晚起照下面的規則配動作
const DANGDANG_NO_MOTION = new Set([
  'zhongji', 'shishou', 'zouhuo', 'neili', 'shibai',
  'maoqiu', 'zuiyang', 'fanwei',
]);
/** 沒逐張列到的攻擊牌照招式家族配（跟共用牌分組同一個意思：爪與掌推一路、拳、踢、衝撞用肩撞） */
const DANGDANG_ATTACK_FAMILY: Readonly<Record<string, DangdangMotionAction>> = {
  claw: 'palm', punch: 'punch', kick: 'kick', dash: 'shoulder', roar: 'ground_slam', taiji: 'counter',
};
const DANGDANG_MELEE = new Set<DangdangMotionAction>([
  'punch', 'palm', 'kick', 'shoulder', 'counter',
  'rapid_combo', 'heavy_palm', 'sweep_combo', 'reckless_bash',
]);
const FEIFEI_MELEE = new Set<FeifeiMotionAction>(['attack1', 'kick']);
/**
 * 2026-09-22 補的出牌動作（吼、太極）。比照待機狀態圖：不解碼預載，預載完才在背景下載並排進背景解開。
 * 吼、太極都是原地演出，不列近戰（菲菲的 `FEIFEI_MELEE`、封封的 `FENGFENG_ATTACKS` 都沒有它們）。
 */
export const DEFERRED_COMPANION_CARD_ACTIONS: ReadonlySet<string> = new Set(['roar', 'taiji']);
export const DEFERRED_COMPANION_ACTIONS: ReadonlySet<string> = new Set([...DEFERRED_COMPANION_REST_ACTIONS, ...DEFERRED_COMPANION_CARD_ACTIONS]);
const DANGDANG_WAVE_CROPPED_ACTIONS = new Set<string>(['rapid_combo', 'sweep_combo']);
const FENGFENG_WAVE_CROPPED_ACTIONS = new Set<string>(['sword_combo']);

const FENGFENG_CARD_ACTION: Readonly<Record<string, FengfengMotionAction>> = {
  fengfeng_pingzhan: 'slash', fengfeng_hushen: 'guard', fengfeng_tuna: 'focus',
  fengfeng_tanbu: 'slash', fengfeng_hengsao: 'sweep', fengfeng_tabu: 'heavy_slash',
  fengfeng_tiaokai: 'slash', fengfeng_tuibu: 'guard', fengfeng_zhengxi: 'focus',
  fengfeng_wenwan: 'focus', fengfeng_huanshou: 'guard', fengfeng_jianqiao: 'guard',
  fengfeng_huibu: 'retreat_thrust', fengfeng_chuantang: 'thrust', fengfeng_shuangduan: 'double_slash',
  fengfeng_huzhou: 'slash', fengfeng_zhuanshen: 'focus', fengfeng_changxi: 'focus',
  fengfeng_zhenshou: 'sheath', fengfeng_xunxi: 'focus', fengfeng_shoushi: 'sheath',
  fengfeng_kanshi: 'focus', fengfeng_youbian: 'focus', fengfeng_jiewo: 'focus',
  fengfeng_husong: 'guard', fengfeng_duanliu: 'qi_cleave', fengfeng_kaishan: 'earth_split',
  fengfeng_cunfeng: 'sheath', fengfeng_lianxi: 'focus', fengfeng_jizhong: 'focus',
  fengfeng_pozhen: 'qi_cleave', fengfeng_yiqichushou: 'focus',
};
const FENGFENG_SHARED_CARD_ACTION: Readonly<Record<string, FengfengMotionAction>> = {
  liandao: 'sword_combo',
  // 2026-09-22 晚：這三張原本刻意只演卡圖（手裏劍、毛球、木桶都是丟出去的），出牌時露出舊立繪，
  // 當晚先配了橫掃、開山、吼。2026-09-22（批次 proj）飛行物接上之後改成：左手把東西丟出去、右手的劍接著刺
  // （跟他丟忍具同一套，原地出手、不衝上前）。橫掃是衝上去掃，東西飛不出去；開山、吼的出手格沒有手伸出去。
  // 聚葉成刀原本照攻擊牌規則衝上去平斬，牌面畫的是葉片飛出去，一起改。
  luanwu: 'thrust_throw',
  sashoujian: 'thrust_throw',
  maoqiudan: 'thrust_throw',
  juye: 'thrust_throw',
};
const FENGFENG_ATTACKS = new Set<FengfengMotionAction>([
  'slash', 'sweep', 'heavy_slash', 'thrust', 'thrust_throw', 'double_slash',
  'sword_combo', 'qi_cleave', 'earth_split', 'retreat_thrust',
]);

/**
 * 待機狀態的代表畫格：前 7 格是從一般待機轉進狀態的過場，播完停在第 8 格慢慢呼吸（比照球球的翻肚）。
 * 中毒沿用原本的第 4 格。
 */
const REST_FRAMES = {
  poison: 3,
  wounded: 7, power: 7, hungry: 7, dizzy: 7, belly: 7, stealth: 7, lazy: 7, puff: 7, iron: 7, curl: 7,
} as const satisfies Partial<Record<CompanionMotionAction, number>>;

const directDuration = (motions: Readonly<Record<string, TimedFrameMotion>>, action: CompanionMotionAction): number =>
  frameMotionDuration(motions[action] ?? motions.idle!);

const cloneDuration = (): number => CLONE_ATTACK_MS + directDuration(feifeiMotions, 'attack1') + CLONE_FADE_MS;

function waveCount(options: FrameMotionPlayOptions): number {
  return Math.max(1, Math.floor(options.waves ?? 1));
}

function repeatedThrowElapsed(action: FeifeiNeedleAction, elapsed: number, waves: number): number {
  const releases = feifeiNeedleReleaseTimes(action);
  const usedReleases = Math.min(waves, releases.length);
  const usedLastRelease = releases[usedReleases - 1]!;
  const sourceRelease = releases.at(-1)!;
  if (waves < releases.length && elapsed > usedLastRelease) {
    return sourceRelease + elapsed - usedLastRelease;
  }
  if (waves <= releases.length || elapsed <= sourceRelease) return elapsed;
  const gap = feifeiNeedleGapMs(action);
  const firstExtraRelease = sourceRelease + gap;
  const lastRelease = sourceRelease + (waves - releases.length) * gap;
  if (elapsed > lastRelease) return sourceRelease + elapsed - lastRelease;
  const releaseAt = firstExtraRelease
    + Math.floor(Math.max(0, elapsed - firstExtraRelease) / gap) * gap;
  const cycleStart = releaseAt - gap;
  const sourceStart = Math.max(0, sourceRelease - gap);
  return sourceStart + elapsed - cycleStart;
}

function repeatedImpactElapsed(motion: TimedFrameMotion, elapsed: number, waves: number, crop: boolean): number {
  const impactTimes = motion.impactTimes ?? [];
  if (crop && impactTimes.length > 1 && waves < impactTimes.length) {
    const usedEnd = impactFrameEnd(motion, impactTimes[Math.max(0, waves - 1)]!);
    const finalEnd = impactFrameEnd(motion, impactTimes.at(-1)!);
    return elapsed >= usedEnd ? finalEnd + elapsed - usedEnd : elapsed;
  }
  const impact = impactTimes.at(-1);
  const extraWaves = waves - impactTimes.length;
  if (impact === undefined || extraWaves <= 0 || elapsed <= impact) return elapsed;
  const lastImpact = impact + extraWaves * EXTRA_WAVE_MS;
  if (elapsed >= lastImpact) return impact + elapsed - lastImpact;
  const offset = Math.max(0, elapsed - impact - 1) % EXTRA_WAVE_MS;
  return Math.max(0, impact - EXTRA_WAVE_MS + 1 + offset);
}

function impactFrameEnd(motion: TimedFrameMotion, impactAt: number): number {
  let end = 0;
  for (const frame of motion.frames) {
    end += Math.round(frame.duration * 1000);
    if (end > impactAt) return end;
  }
  return frameMotionDuration(motion);
}

function waveAdjustedDuration(motion: TimedFrameMotion, waves: number, crop: boolean): number {
  const base = frameMotionDuration(motion);
  const impactTimes = motion.impactTimes ?? [];
  if (impactTimes.length === 0) return base;
  if (crop && waves < impactTimes.length) {
    const usedEnd = impactFrameEnd(motion, impactTimes[Math.max(0, waves - 1)]!);
    const finalEnd = impactFrameEnd(motion, impactTimes.at(-1)!);
    return base - (finalEnd - usedEnd);
  }
  return base + Math.max(0, waves - impactTimes.length) * EXTRA_WAVE_MS;
}

function resolveFeifei(action: CompanionMotionAction, elapsed: number, options: FrameMotionPlayOptions) {
  if (action === 'clone') {
    const sealDuration = directDuration(feifeiMotions, 'seal');
    const resumeAt = cloneDuration() - (sealDuration - CLONE_SEAL_HOLD_MS);
    const sealElapsed = elapsed <= CLONE_SEAL_HOLD_MS ? elapsed
      : elapsed < resumeAt ? CLONE_SEAL_HOLD_MS
        : CLONE_SEAL_HOLD_MS + elapsed - resumeAt;
    return { key: 'seal', elapsed: sealElapsed, loop: false };
  }
  if (isFeifeiNeedleAction(action)) {
    return { key: action, elapsed: repeatedThrowElapsed(action, elapsed, waveCount(options)), loop: false };
  }
  const key = FEIFEI_DIRECT_ACTIONS.has(action) ? action : 'idle';
  return { key, elapsed, loop: action === 'idle' || action === 'poison' || action === 'run' };
}

function resolveDangdang(action: CompanionMotionAction, elapsed: number, options: FrameMotionPlayOptions) {
  const key = DANGDANG_DIRECT_ACTIONS.has(action) ? action : 'idle';
  const motion = dangdangMotions[key] ?? dangdangMotions.idle!;
  return { key, elapsed: repeatedImpactElapsed(motion, elapsed, waveCount(options),
    DANGDANG_WAVE_CROPPED_ACTIONS.has(key)), loop: motion.loop };
}

function resolveFengfeng(action: CompanionMotionAction, elapsed: number, options: FrameMotionPlayOptions) {
  const requested = FENGFENG_DIRECT_ACTIONS.has(action) ? action : 'idle';
  const motion = fengfengMotions[requested] ?? fengfengMotions.idle!;
  const waves = waveCount(options);
  const crop = FENGFENG_WAVE_CROPPED_ACTIONS.has(requested);
  if (FENGFENG_ATTACKS.has(requested as FengfengMotionAction)) {
    const attackDuration = waveAdjustedDuration(motion, waves, crop);
    if (elapsed >= attackDuration) {
      return { key: 'sheath', elapsed: FENGFENG_SHEATH_SKIP_MS + elapsed - attackDuration, loop: false };
    }
  }
  return { key: requested, elapsed: repeatedImpactElapsed(motion, elapsed, waves, crop), loop: motion.loop };
}

const feifeiFrameMotions = createFrameMotionSet<CompanionMotionAction>({
  restFrames: REST_FRAMES,
  deferred: DEFERRED_COMPANION_ACTIONS,
  motions: feifeiMotions,
  nativeHeight: NATIVE_HEIGHT,
  defaultHeight: NATIVE_HEIGHT,
  initialAction: 'idle',
  className: 'companion-motion companion-motion-feifei',
  ariaLabel: '菲菲',
  resolve: resolveFeifei,
  duration: (action, options) => companionMotionDuration('feifei', action, waveCount(options)),
});

const dangdangFrameMotions = createFrameMotionSet<CompanionMotionAction>({
  restFrames: REST_FRAMES,
  deferred: DEFERRED_COMPANION_ACTIONS,
  motions: dangdangMotions,
  nativeHeight: dangdangMotionData.nativeHeight,
  defaultHeight: dangdangMotionData.nativeHeight,
  initialAction: 'idle',
  className: 'companion-motion companion-motion-dangdang',
  ariaLabel: '噹噹',
  resolve: resolveDangdang,
  duration: (action, options) => companionMotionDuration('dangdang', action, waveCount(options)),
});

const fengfengFrameMotions = createFrameMotionSet<CompanionMotionAction>({
  restFrames: REST_FRAMES,
  deferred: DEFERRED_COMPANION_ACTIONS,
  motions: fengfengMotions,
  nativeHeight: fengfengMotionData.nativeHeight,
  defaultHeight: fengfengMotionData.nativeHeight,
  initialAction: 'idle',
  className: 'companion-motion companion-motion-fengfeng',
  ariaLabel: '封封',
  resolve: resolveFengfeng,
  duration: (action, options) => companionMotionDuration('fengfeng', action, waveCount(options)),
});

const frameSets = {
  feifei: feifeiFrameMotions,
  dangdang: dangdangFrameMotions,
  fengfeng: fengfengFrameMotions,
} as const;

const frameSet = (kind: CompanionMotionKind) => frameSets[kind];

export async function preloadCompanionMotion(kind: CompanionMotionKind): Promise<void> {
  await frameSet(kind).preload();
}

/** 延後下載的待機狀態圖還沒到（或壞了）時回 false，戰鬥畫面就先交還靜態立繪。 */
export function companionMotionDrawable(kind: CompanionMotionKind, action: CompanionMotionAction): boolean {
  return frameSet(kind).drawable(action);
}

/**
 * 出牌時這個動作能不能播。延後下載的出牌動作圖還沒到（或壞了）就回 false，
 * 戰鬥畫面改播 `companionPlayableAction` 的替身，不能停在上一個動作的最後一格；圖到了下一張牌就用新動作。
 * 其他動作（預載的、菲菲的分身這種組合演出）照舊一律可播。
 */
export function companionCardMotionPlayable(kind: CompanionMotionKind, action: CompanionMotionAction): boolean {
  return !DEFERRED_COMPANION_CARD_ACTIONS.has(action) || frameSet(kind).drawable(action);
}

/**
 * 延後下載的出牌動作圖（吼、太極）還沒到時，先用哪個預載好的動作頂著（2026-09-22 晚）。
 * 原本這時交還靜態立繪，網路慢一點就會露出舊畫風。菲菲用結印、封封用運氣（劍都不出鞘）；噹噹沒有延後的出牌動作。
 */
const DEFERRED_CARD_STAND_IN: Readonly<Record<CompanionMotionKind, Readonly<Record<string, CompanionMotionAction>>>> = {
  feifei: { roar: 'seal', taiji: 'seal' },
  dangdang: {},
  fengfeng: { roar: 'focus', taiji: 'focus' },
};

/** 出牌、用忍具時實際要播的動作：播得了就是它，延後下載的圖還沒到就換成替身。 */
export function companionPlayableAction(kind: CompanionMotionKind, action: CompanionMotionAction): CompanionMotionAction {
  return companionCardMotionPlayable(kind, action) ? action : DEFERRED_CARD_STAND_IN[kind][action] ?? 'idle';
}

export function companionMotionReady(kind: CompanionMotionKind): boolean {
  return frameSet(kind).ready();
}

export function createCompanionMotionActor(
  kind: CompanionMotionKind,
  options: { height?: number; action?: CompanionMotionAction } = {},
): CompanionMotionActor {
  return frameSet(kind).createActor(options);
}

export function companionMotionDuration(
  kind: CompanionMotionKind,
  action: CompanionMotionAction,
  waves = 1,
): number {
  if (kind === 'feifei') {
    if (action === 'clone') return cloneDuration();
    const base = directDuration(feifeiMotions, action);
    const count = Math.max(1, Math.floor(waves));
    if (isFeifeiNeedleAction(action)) {
      const releases = feifeiNeedleReleaseTimes(action);
      if (count < releases.length) return base - (releases.at(-1)! - releases[count - 1]!);
      return base + (count - releases.length) * feifeiNeedleGapMs(action);
    }
    return base;
  }
  const motions = kind === 'dangdang' ? dangdangMotions : fengfengMotions;
  const count = Math.max(1, Math.floor(waves));
  const motion = motions[action] ?? motions.idle!;
  const crop = kind === 'dangdang'
    ? DANGDANG_WAVE_CROPPED_ACTIONS.has(action)
    : FENGFENG_WAVE_CROPPED_ACTIONS.has(action);
  const adjusted = waveAdjustedDuration(motion, count, crop);
  if (kind === 'fengfeng' && FENGFENG_ATTACKS.has(action as FengfengMotionAction)) {
    return adjusted + directDuration(fengfengMotions, 'sheath') - FENGFENG_SHEATH_SKIP_MS;
  }
  return adjusted;
}

export function companionImpactTimes(
  kind: CompanionMotionKind,
  action: CompanionMotionAction,
  count: number,
): number[] {
  const wanted = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (wanted === 0) return [];
  let base: readonly number[] | undefined;
  if (kind === 'feifei') {
    base = action === 'attack1' ? [motionMs(340)]
      : action === 'kick' ? [motionMs(300)]
        : isFeifeiNeedleAction(action)
          ? feifeiNeedleReleaseTimes(action).map((release) => release + feifeiNeedleFlightMs(action))
          : action === 'clone' ? [CLONE_IMPACT_MS]
            // 其餘讀動作資料（2026-09-22 的吼：獅吼功命中在吼出來那一拍）
            : feifeiMotions[action]?.impactTimes;
  } else {
    const motions = kind === 'dangdang' ? dangdangMotions : fengfengMotions;
    base = motions[action]?.impactTimes;
  }
  if (!base?.length) return [];
  const result = base.slice(0, wanted);
  const gap = kind === 'feifei' && isFeifeiNeedleAction(action)
    ? feifeiNeedleGapMs(action)
    : EXTRA_WAVE_MS;
  while (result.length < wanted) result.push(result.at(-1)! + gap);
  return result;
}

export function companionImpactDelay(kind: CompanionMotionKind, action: CompanionMotionAction): number {
  return companionImpactTimes(kind, action, 1)[0] ?? 0;
}

export function companionIsMelee(kind: CompanionMotionKind, action: CompanionMotionAction): boolean {
  if (kind === 'feifei') return FEIFEI_MELEE.has(action as FeifeiMotionAction);
  if (kind === 'dangdang') return DANGDANG_MELEE.has(action as DangdangMotionAction);
  // 開山是原地劈地；丟東西那一刺也是原地（東西是丟出去的），兩個都不衝上前
  return action !== 'earth_split' && action !== 'thrust_throw' && FENGFENG_ATTACKS.has(action as FengfengMotionAction);
}

export function companionCardAction(
  kind: CompanionMotionKind,
  cardId: string,
  options: CompanionCardMotionOptions = {},
): CompanionMotionAction | undefined {
  if (kind === 'dangdang') {
    if (DANGDANG_NO_MOTION.has(cardId)) return undefined;
    const listed = DANGDANG_CARD_ACTION[cardId] ?? DANGDANG_SHARED_ACTION.get(cardId);
    if (listed) return listed;
    // 沒列到的（打得出去的戰鬥雜牌、以後新加的牌）照規則配，不再退回靜態立繪（2026-09-22 晚）
    if (options.cardType === '攻擊') return DANGDANG_ATTACK_FAMILY[options.poseFamily ?? ''] ?? 'palm';
    if (options.poseFamily === 'qinggong') return 'dodge';
    if (options.hasBlock) return 'guard';
    if (EAT_CARDS.has(cardId) || options.hasHeal) return 'eat';
    return options.cardType ? 'focus' : undefined;
  }
  if (kind === 'fengfeng') {
    const own = FENGFENG_CARD_ACTION[cardId] ?? FENGFENG_SHARED_CARD_ACTION[cardId];
    if (own) return own;
    // 吼、太極、輕功三個招式家族（2026-09-11 使用者要求分家）：2026-09-22 起有自己的動作，不再退回靜態立繪。
    // 吼（含獅吼功）、太極是新畫的、劍不出鞘；輕功沿用閃身；借力使力（攻擊牌裡的太極）沿用回步刺。
    if (options.poseFamily === 'roar') return 'roar';
    if (options.poseFamily === 'qinggong') return 'dodge';
    if (options.poseFamily === 'taiji') return options.cardType === '攻擊' ? 'retreat_thrust' : 'taiji';
    if (options.cardType === '攻擊') {
      if (options.poseFamily === 'dash') return 'thrust';
      if (options.poseFamily === 'kick') return 'sweep';
      if (options.poseFamily === 'punch') return 'heavy_slash';
      return 'slash';
    }
    if (options.hasBlock) return 'guard';
    if (EAT_CARDS.has(cardId) || options.hasHeal) return 'eat';
    if (options.cardType) return 'focus';
    return undefined;
  }
  const needle = FEIFEI_NEEDLE_CARD_ACTION[cardId] ?? FEIFEI_SHARED_NEEDLE_CARD_ACTION[cardId];
  if (needle) return needle;
  if (cardId === 'feifei_fenshen') return 'clone';
  if (cardId === 'feifei_lakai') return 'roll';
  // 吼、太極、輕功三個招式家族（2026-09-11 使用者要求分家）：2026-09-22 起有自己的動作，不再退回靜態立繪。
  // 吼（含獅吼功）、太極是新畫的；輕功沿用後退閃躲。
  if (options.poseFamily === 'roar') return 'roar';
  if (options.poseFamily === 'qinggong') return 'roll';
  if (options.cardType === '攻擊') {
    // 借力使力（攻擊牌裡的太極）與踢技一樣收一記踢；其餘（爪、衝撞、拳、沒有家族的連線支援牌）一律爪擊
    // （2026-09-22 前衝撞、拳與連線支援牌選不到動作，出牌時退回靜態立繪）
    if (options.poseFamily === 'kick' || options.poseFamily === 'taiji') return 'kick';
    return 'attack1';
  }
  if (options.poseFamily === 'taiji') return 'taiji';
  if (FEIFEI_GUARD_CARDS.has(cardId) || options.hasBlock) return 'guard';
  if (EAT_CARDS.has(cardId) || options.hasHeal) return 'eat';
  if (options.cardType) return 'seal';
  return undefined;
}

/** 這位同伴有沒有這個動作自己的逐格素材（不算退路）。 */
export function companionHasOwnMotion(kind: CompanionMotionKind, action: CompanionMotionAction): boolean {
  const motions = kind === 'feifei' ? feifeiMotions : kind === 'dangdang' ? dangdangMotions : fengfengMotions;
  return Object.hasOwn(motions, action);
}

/**
 * 待機時擺什麼逐格動作。狀態 → 動作的對照在 `rest-state-motion.ts`（四隻貓共用）；
 * 這位同伴沒有那個動作的素材就回傳 undefined，交還既有立繪。
 */
export function companionRestMotionAction(
  kind: CompanionMotionKind,
  displayedPose: string,
  poses: RestStatePoses,
  phase: string,
  down: boolean,
): CompanionMotionAction | undefined {
  if (down || phase === 'lost') return 'defeat';
  if (phase === 'won') return 'win';
  // 圖還沒下載好（或載入失敗）就交還靜態立繪，不要停在上一個動作的最後一格（審查 2026-09-21 中-2）
  return restStateAction(displayedPose, poses, (action) => companionHasOwnMotion(kind, action) && companionMotionDrawable(kind, action));
}

export const FEIFEI_CLONE_TIMING = Object.freeze({
  appear: CLONE_APPEAR_MS,
  begin: CLONE_ATTACK_MS,
  impact: CLONE_IMPACT_MS,
  end: cloneDuration(),
});
