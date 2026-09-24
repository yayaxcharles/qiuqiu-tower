import { potionCapacity } from '../../engine/run';
import { cardById, cardNameFor } from '../../content/cards';
import { relicById } from '../../content/relics';
import { castLineFor, coopBossLines, dialogue, lineFor, pick, storyFor } from '../../content/dialogue';
import { BOSS_ART, BOSS_HURT_ART, BOSS_MOVE_ART, encounterById, enemyById, enemyArtFor, BOSS_MOVE_ART_PHASE } from '../../content/enemies';
import { potionById } from '../../content/potions';
import { aliveEnemies, dazeTarget, isDazed, willRevive } from '../../engine/actions';
import { relicCounterKey } from '../../engine/counters';
import { rampageTurnFor, allReady, beginEnemyTurn, canPlay, endTurn, finishEnemyTurn, IDLE_FORCE_MS, playCard, potionBlockedReason, resolveChoice, stepEnemyTurn, usePotion, waitingFor } from '../../engine/combat';
import { previewHpLoss } from '../../engine/preview';
import { cardStats } from '../../engine/deck';
import { computeBlock, getStatus } from '../../engine/statuses';
import { previewEnemyHits } from '../../engine/intentpreview';
import { DEBUFFS } from '../../engine/types';
import type { CardDef, CombatState, EnemyCombat, EnemyDef, EnemyEffect, Intent, PendingChoice, PlayerCombat, RunPlayer, RunState, StatusName, Unit, CardInstance, EnemyMove, Effect } from '../../engine/types';
import { me } from '../../engine/runplayer';
import { registerScreen } from '../app';
import type { CoopSession } from '../../net/session';
import { applyAction, chooserOf } from '../../net/action';
import type { CoopAction } from '../../net/action';
import type { SequencedAction } from '../../net/lockstep';
import { attachCardDrag } from '../dragplay';
import { isTouchDevice } from '../cardpeek';
import { TUT_TOUCH_PEEK } from '../../content/tutorial';
import { COLLECT_FLY, collectTiming } from '../collect';
import { battleBgKey, battleBgStyle } from '../screenbg';
import { telegraphTarget, willAct } from '../telegraph';
import { seatFeedback, seatFeedbackSnap, type SeatFeedbackSnap } from '../seat-feedback';
import { BAD_STATUS, GOOD_STATUS, STATUS_ORDER } from '../status-kind';
import { heroName, heroOf, heroPronoun } from '../../engine/hero';
import type { Hero } from '../../engine/hero';
import { artUrl, decodeAll, hasMonsterPose, hasHeroSprite, heroArtUrl, monsterPhaseKey, monsterUrl, hasSprite, type DecodePool } from '../assets';
import { STATUS_UNIT, describeCard } from '../cardtext';
import { cardNode } from '../cardview';
import { matePlays } from '../mateplay';
import { showDeckPicker } from '../deckview';
import { bubbleOverUnit, heroSpeaker, toast } from '../dialogue';
import { clear, el, keepLoops, stageFrame } from '../dom';
import { play as sfx } from '../audio';
import { enemyLeft, nextLineup, playerLeft, speechBubbleAt } from '../enemylayout';
import { burst } from '../fx';
import { playAttackImpactAccent } from '../attack-impact-accent';
import { renderHud } from '../hud';
import { monsterPose } from '../monsterpose';
import { idlePoseKey } from '../heropose';
import { combatWarmPoses } from '../rest-state-motion';
import { createQiuqiuActor, preloadQiuqiuMotion, qiuqiuCardAction, qiuqiuPlayableAction, qiuqiuCombatMotionDecision, qiuqiuImpactDelay, qiuqiuIsMelee, qiuqiuMotionDuration, qiuqiuMotionEnabled, qiuqiuMotionReady, type QiuqiuAction, type QiuqiuActor } from '../qiuqiu-motion';
import {
  companionCardAction,
  companionPlayableAction,
  companionImpactDelay,
  companionIsMelee,
  companionMotionDuration,
  companionMotionReady,
  companionRestMotionAction,
  createCompanionMotionActor,
  preloadCompanionMotion,
  type CompanionMotionAction,
} from '../companion-motion';
import { EAT_POTIONS, THROW_POTIONS, potionMotionAction } from '../potion-motion';
import { meleeHandoffReturn, motionMeleePlan, motionMeleeSample, type MotionMeleePlan } from '../qiuqiu-melee';
import { playThrow, preloadProjectiles, throwElapsed } from '../projectile-flight';
import { cardProjectile, potionProjectile, resolveProjectileShot, shotAimsAt, shotUsedIn, type ProjectileShot } from '../projectile-kinds';
import { playFeifeiClone, playQiuqiuAfterimages, playQiuqiuEchoes } from '../qiuqiu-motion-effects';
import { createEnemyMotionActor, enemyMotionDuration, enemyMotionReady, preloadEnemyMotion, type EnemyMotionAction, type EnemyMotionKind } from '../enemy-motion';
import {
  buildCombatMotionImpactPlan,
  buildFeifeiStatusImpactPlan,
  combatMotionPresentationWait,
  combatMotionPresentationWaitAt,
  combatQiValue,
  extendConfirmedMotionWaves,
  LocalMotionPresentationQueue,
  motionPresentationMatches,
  motionStillPlaying,
  qiuqiuConsumedStealth,
  qiuqiuEnemyBlocked,
  qiuqiuEnemyMotionAllowed,
  qiuqiuEnemyMotionHold,
  qiuqiuEnemyMotionKind,
  qiuqiuMotionBatchBoundaries,
  qiuqiuRestMotionAction,
  qiuqiuShouldPlayHurt,
  qiuqiuVictoryLinger,
  resolveCombatMotionPresentationWait,
  resizeMotionMeleeTrip,
  shouldResumeConfirmedMotion,
  type CombatMotionAction,
  type CombatMotionSource,
  type DeferredCombatMotionPresentationWait,
} from '../qiuqiu-combat-motion';

const SVG_NS = 'http://www.w3.org/2000/svg';
import { overlayRoot } from '../overlay';
import { attachTextTooltip, attachTooltip, hideTooltip } from '../tooltip';

const STATUS_ICON: Record<StatusName, string> = {
  爪力: 'icon/status_claw', 貓步: 'icon/status_step', 翻肚: 'icon/status_belly',
  懶洋洋: 'icon/status_lazy', 炸毛: 'icon/status_puff', 中毒: 'icon/status_choke',
  隱身: 'icon/status_stealth', 定身: 'icon/status_stun', 反彈: 'icon/status_thorns',
  潛水: 'icon/status_stealth',
  鐵布衫: 'icon/status_iron',   // 不借鱗甲的鍵，免得兩邊撞到
  // 第二波魔物的五個狀態（2026-09-10 圖示補齊）
  縮殼: 'icon/status_curl', 飛行: 'icon/status_fly', 鱗甲: 'icon/status_plate', 不壞身: 'icon/status_iron_body',
  沉睡: 'icon/status_sleep', 消散: 'icon/status_fade',
  // 菁英擴充的虛化（2026-09-03；圖示 2026-09-10 補上）。
  // 虛化的意思就是「半透明」，但圖示不能真的畫半透明——綠幕會從身體裡透出來、去背後整張帶綠
  //（codex_gen.py 的坑 5）。改用「實心淡色本體＋錯位殘影」表達。
  虛化: 'icon/status_phase',
  // 迷魂（2026-09-23 第二批）：沒有另畫狀態圖示，借迷魂香那支忍具的圖（同一個 icons 分類，戰鬥中一定載好了）
  迷魂: 'codex/potion_daze_incense',
};
/**
 * 狀態牌子上要寫的字。引擎內部叫「潛水」，但那只是「下回合開始換成隱身」的暫存記號，
 * 規格 §2 的名詞表根本沒有這個詞、牌面也刻意不講（見 `cardtext.ts` 的 `isDive`），
 * 所以牌子跟著牌面的講法寫「下回合隱身」；其餘狀態的名字就是名詞表上的名字，不用改。
 */
const STATUS_LABEL: Partial<Record<StatusName, string>> = { 潛水: '下回合隱身', 鐵布衫: '下回合蜷縮' };
/** 意圖沒有圖示素材（美術清單只做了狀態圖示），用一個中文字當記號，字型一定有 */
const INTENT_GLYPH: Record<Intent, string> = { attack: '攻', block: '守', buff: '強', debuff: '弱', special: '？', summon: '召', idle: '…' };
const PENDING_TITLE: Record<PendingChoice['purpose'], string> = {
  exhaust: '挑要消耗的牌', retain: '挑要留到下回合的牌', discard: '挑要丟掉的牌',
  recover: '挑要拿回手上的牌', scryDiscard: '這是抽牌堆最上面的牌，挑要丟掉的',
  transform: '挑一張要換掉的牌（換成隨機一張升級牌）',
};
/**
 * 回合交接的節拍（毫秒）。按下「結束回合」之後畫面依序做三件事：
 *
 *   收牌（手上剩的牌飛向右下角的按鈕）→ 引擎結算、魔物出手 → 發牌（新手牌從左下角的牌堆飛出來）
 *
 * 原本這三件事之間**沒有任何過場**：按下去手牌瞬間消失、下一批瞬間出現，
 * 感覺不到「這一回合結束了」。
 *
 * `COLLECT_WAIT` 是「等多久再叫引擎」，故意比整段收牌短：牌是自己在飛的，
 * 不必等最後一張落地才讓魔物開始動作，不然一回合要拖快兩秒。
 * `DEAL_FLY` 要跟 `combat.css` 的 `card-deal` 同一個長度（那邊算什麼時候把手牌交還給玩家用）。
 */
// 收牌的三個數字（一張飛多久、每張錯開多久、引擎等多久）搬到 collect.ts：
// 引擎等多久要看手上有幾張牌（見那邊的說明），不再是固定值。
const DEAL_FLY = 440;          // 一張新牌從牌堆飛到定位要多久（＝ card-deal 的長度）

/**
 * 球球的姿勢。全部是專為這款遊戲畫的忍者裝立繪（`hero/*`），打包時放進同一張畫布
 * 底部對齊，換姿勢不會忽大忽小。`hero/ninja_guard`（抱胸格擋）目前沒排到位置，留著備用
 *（同樣沒排到位置的舊素材 `hero/idle`、`hero/armed` 2026-09-22 已刪）。
 */
const POSE = {
  idle: 'hero/ninja', attack: 'hero/ninja_attack', hit: 'hero/ninja_hit', dodge: 'hero/ninja_dodge',
  hungry: 'hero/ninja_hungry', win: 'hero/ninja_win', lose: 'hero/ninja_lose', curl: 'hero/ninja_curl',
  // 待機的兩個變化（2026-09-02，使用者：「腳色外觀是不是可以做點變化」）：血見底的掛彩、爪力堆高的氣勢
  power: 'hero/ninja_power', hurt: 'hero/ninja_hurt',
  // 2026-09-03 晚補的動態：施展忍術（打技能／能力牌時用；圖還沒生好就退回出招圖）
  skill: 'hero/ninja_skill',
  // 2026-09-10 補的待機狀態（使用者：「補足球球的動作跟狀態」）：這五個狀態掛在身上時
  // 本來都用同一張站姿，看不出自己中了什麼。隱身那張是實心的煙遮住下半身，
  // **不能畫半透明**（綠幕會從身體裡透出來、去背後整張帶綠，codex_gen.py 的坑 5）
  belly: 'hero/ninja_belly', lazy: 'hero/ninja_lazy', puff: 'hero/ninja_puff',
  stealth: 'hero/ninja_stealth', iron: 'hero/ninja_iron',
  // 擲手裡劍（2026-09-03 晚生的圖）：撒手鐧那張牌、手裡劍與針雨兩支忍具用；沒圖就退回出招圖
  throw: 'hero/ninja_throw',
  // 攻擊招式分家（2026-09-08，使用者：三十幾張攻擊牌全長一樣）：原本那張 attack 其實是掌推，
  // 新畫爪擊、踢技、頭槌衝撞、拳四種；多段攻擊時兩張輪流換。沒圖時 hasSprite 擋掉退回掌推
  claw: 'hero/ninja_claw', kick: 'hero/ninja_kick', dash: 'hero/ninja_dash', punch: 'hero/ninja_punch',
  // 吃喝（回血的牌、飯糰那類忍具）；抱胸格擋（早就畫好，被蜷縮整個擋下時用）
  eat: 'hero/ninja_eat', guard: 'hero/ninja_guard',
  // 第二批（2026-09-08）：中毒待機、被纏住待機、能力牌凝神、抽牌翻卷軸
  choke: 'hero/ninja_choke', dizzy: 'hero/ninja_dizzy', focus: 'hero/ninja_focus', scroll: 'hero/ninja_scroll',
  /**
   * 倒下（2026-09-11）：球球趴在地上、眼睛變叉、頭帶滑到一邊。
   *
   * 跟 26 隻大魔物與塔主的倒地圖同一套語彙——**牠們都有，球球自己反而沒有**，
   * 而一局只會死一次、那是整局情緒最重的一刻，原本卻是最空的（血歸零就直接切結算清單）。
   * `lose` 那張是站著垂頭的落敗圖，留給結算畫面用；這張是倒在戰場上的那一拍。
   */
  down: 'hero/ninja_down',
  /**
   * 招式再分家（2026-09-11，使用者指定「加開新家族——獅吼、太極、輕功」）。
   *
   * 前一批（2026-09-08）只分了攻擊牌，而 **36 張絕學裡有 21 張不是攻擊牌，全部共用同一張
   * `ninja_skill`**——太極、推手、卸勁、輕功、踏雪無痕、移形換影打出來的動作一模一樣。
   * 這三個家族各收一批性格相近的：吼（張嘴大吼、音波圈）、太極（圓轉化勁）、輕功（騰空點地）。
   * **刻意不放進 `ATTACK_POSES`**：那個集合是多段攻擊的兩格輪換名單，而輪換的搭檔寫死是爪擊，
   * 太極輪成撲抓會很怪。技能牌本來就進不了那個分支（它們的 `attack` 是 false），
   * 所以這個決定實際上只影響會用到新家族的**攻擊牌**——今天只有獅吼功（打全體、單段）
   * 與借力使力（單段），兩張都沒有多段可輪，不受影響。
   */
  roar: 'hero/ninja_roar', taiji: 'hero/ninja_taiji', qinggong: 'hero/ninja_qinggong',
};
type PoseKey = keyof typeof POSE;
// 出招圖名單：多段攻擊的兩格輪換只在這些圖之間換，勝利／落敗／蜷縮／挨打不輪換
const ATTACK_POSES = new Set<string>([POSE.attack, POSE.claw, POSE.kick, POSE.dash, POSE.punch, POSE.throw]);
/** 攻擊牌 → 招式家族。沒列的用原本那張掌推（鐵砂掌那類本來就是掌） */
const ATTACK_POSE: Readonly<Record<string, PoseKey>> = {
  sanjo: 'claw', dieda: 'claw', paozhao: 'claw', liandao: 'claw', roubao: 'claw', juye: 'claw', luoye: 'claw',
  ruying: 'claw', shengdong: 'claw', shunshou: 'claw', wozaizhe: 'claw', susu: 'claw', bunshin: 'claw', feifei_fenshen: 'claw',
  canying: 'claw', maoqiudan: 'claw', luanwu: 'claw', zhuiji: 'claw',
  huixuan: 'kick', lianhuan: 'kick', caiweiba: 'kick', dilie: 'kick',
  tietou: 'dash', wangming: 'dash', shunkan: 'dash', beici: 'dash',
  bengquan: 'punch', jiuweiquan: 'punch', shierlian: 'punch', qinna: 'punch', ehou: 'punch', zuiquan: 'punch', dianxue: 'punch',
  // 2026-09-11 新家族：獅吼功是張嘴吼不是掌推；借力使力是「借對方的力」，跟太極同一路
  //（它的效果本來就跟太極一樣是 `damageEqualBlock`）。
  // **沾衣十八跌刻意不改**（稽核 2026-09-11 低-1）：它是 `damage 5 × times 3` 的多段攻擊，
  // 而多段的兩格輪換只在 `ATTACK_POSES` 名單裡的圖之間換；改成 taiji 會讓它掉出名單、
  // 三段打起來變成一張圖定住。招式家族對一點點，不值得拿掉一個本來就有的演出。
  shihou: 'roar', jiedao: 'taiji',
};

/**
 * **非攻擊牌**的招式家族（2026-09-11）。攻擊牌走上面那張表，這張管技能與能力牌。
 *
 * 沒列進來的照舊：能力牌凝神、會抽牌的翻卷軸、其餘施術。這裡只挑「動作明顯不一樣、
 * 用同一張施術圖會很怪」的那幾張，不是每張都要分家——分太細等於沒分。
 */
const SKILL_POSE: Readonly<Record<string, PoseKey>> = {
  // 吼：喊出去的那幾張
  weihe: 'roar', chudashi: 'roar', youcike: 'roar', boming: 'roar',
  // 太極：圓轉、化勁、把對方的力還回去
  taiji: 'taiji', tuishou: 'taiji', jieli: 'taiji', yide: 'taiji', shuaiguo: 'taiji', fanzhua: 'taiji',
  // 輕功：騰空、閃身、走人
  qinggong: 'qinggong', taxue: 'qinggong', yixing: 'qinggong', zhanshu: 'qinggong', gaotui: 'qinggong', diaohu: 'qinggong',
};
/** 吃喝姿勢：食物牌與吃喝忍具；卷軸、符咒仍保留各自姿勢。 */
const EAT_CARDS: ReadonlySet<string> = new Set(['touchi', 'xianshuile', 'guixi', 'tianmao', 'jiuming', 'fanpu']);
// 吃喝、丟出去的忍具清單搬到 potion-motion.ts（逐格動作那邊也要看同一份，2026-09-22 晚）
/*
 * ===== 換角色（2026-09-12）=====
 * `POSE` 的值一律是**球球版**的鍵，那是「姿勢的身分證」——畫面到處拿它做相等比較。
 * 所以這張表不動，只在兩個出口翻譯：`hasHeroSprite`（她自己畫好了沒，嚴格、不走退路）
 * 與 `heroArtUrl`（鍵變成網址，寬鬆、找不到會退到她自己最接近的一張）。
 */
const posePick = (hero: Hero, k: PoseKey, fallback: string): string => (hasHeroSprite(hero, POSE[k]) ? POSE[k] : fallback);
/** 這一位看到的牌名（她的牌名跟球球分家，見 `cardNameFor`）。查不到牌就回牌號 */
const nameFor = (hero: string | undefined, id: string): string => {
  const d = cardById[id];
  return d ? cardNameFor(d, hero) : id;
};
/** 出牌時擺什麼姿勢 */
function cardPose(hero: Hero, def: CardDef, effects: readonly Effect[] = def.effects): { pose: string; attack: boolean } {
  const attack = def.type === '攻擊';
  if (THROW_CARDS.has(def.id)) return { pose: posePick(hero, 'throw', POSE.attack), attack };
  if (attack) { const fam = ATTACK_POSE[def.id]; return { pose: fam ? posePick(hero, fam, POSE.attack) : POSE.attack, attack: true }; }
  if (EAT_CARDS.has(def.id)) return { pose: posePick(hero, 'eat', posePick(hero, 'skill', POSE.attack)), attack: false };
  // 技能／能力牌的家族（太極、輕功、吼）排在能力牌與抽牌那兩條**前面**：
  // 馬步、運功是能力牌但沒列進 SKILL_POSE，照樣走凝神；輕功會抽兩張牌，
  // 排後面的話會被「會抽牌就翻卷軸」那條攔走、永遠輪不到輕功圖
  const skillFam = SKILL_POSE[def.id];
  if (skillFam) return { pose: posePick(hero, skillFam, posePick(hero, 'skill', POSE.attack)), attack: false };
  // 能力牌一律凝神（吸貓大法也是能力牌，打出當下不回血，不算吃）；會抽牌的技能牌翻卷軸；其餘施術
  if (def.type === '能力') return { pose: posePick(hero, 'focus', posePick(hero, 'skill', POSE.attack)), attack: false };
  if (effects.some((e) => e.kind === 'draw')) return { pose: posePick(hero, 'scroll', posePick(hero, 'skill', POSE.attack)), attack: false };   // 看實際效果：替身術＋、偷吃術＋升級才抽牌
  return { pose: posePick(hero, 'skill', POSE.attack), attack: false };
}
/** 用忍具時球球擺什麼姿勢：丟的擲、吃的吃、其餘施術（以前除了丟的都沒姿勢，站著不動） */
function potionPose(hero: Hero, id: string): { pose?: string; attack?: boolean } {
  if (THROW_POTIONS.has(id)) return hasHeroSprite(hero, POSE.throw) ? { pose: POSE.throw, attack: true } : {};
  if (EAT_POTIONS.has(id) && hasHeroSprite(hero, POSE.eat)) return { pose: POSE.eat };
  return hasHeroSprite(hero, POSE.skill) ? { pose: POSE.skill } : {};
}
/** 出手時該用擲手裡劍立繪的牌（忍具那份在 potion-motion.ts） */
const THROW_CARDS: ReadonlySet<string> = new Set(['sashoujian']);
// 塔主的姿勢對照表放在內容層（`enemies.ts`），跟招式定義擺在一起，加招時比較不會漏配。
const BOSS_IDLE = BOSS_ART.idle1;          // 第一階段
const BOSS_DEFEAT = BOSS_ART.defeat;       // 承讓
/** 各階段的待機圖：第三階段的圖還沒生好就先用第二階段的（走火入魔），不能是灰剪影 */
function bossIdle(phase: number): string {
  if (phase >= 2 && hasSprite(BOSS_ART.idle3)) return BOSS_ART.idle3;
  return phase >= 1 ? BOSS_ART.idle2 : BOSS_IDLE;
}
/** 出招圖：先找該階段自己的，沒有（或還沒生）就用第一階段共用的那張 */
function bossMovePose(phase: number, label: string): string | undefined {
  const own = BOSS_MOVE_ART_PHASE[phase - 1]?.[label];
  if (own && hasSprite(own)) return own;
  // 二、三階段沒有自己那張圖就回傳 undefined → 用該階段的待機圖。以前退回第一階段的出招圖，
  // 跨階段那一拍（血量在你的回合跨線，牠這回合出的還是上一階段宣告的招）會突然冒出戴斗笠的舊師父
  // ——使用者 2026-09-03：「都到第二第三階段換造型了，還是會突然出現調息的圖片」。
  if (phase >= 1) return undefined;
  return BOSS_MOVE_ART[label];
}

/** 這一拍剛出手的魔物：`attacked` 決定要不要換攻擊立繪與前撲，`label` 給塔主查招式姿勢 */
type Learned = NonNullable<EnemyMove['learned']>;
interface Acted { label: string; attacked: boolean; blocked: boolean; learned: Learned | undefined }   // learned＝照著學剛打的牌（亮牌面用）；blocked＝這一拍出的是防禦招

// 好狀態、壞狀態、狀態列順序三份清單從 status-kind.ts 那一張產生（2026-09-23 health H-8：原本這裡手寫三份）
const sumStatus = (u: Unit, names: readonly StatusName[]): number =>
  names.reduce((t, k) => t + getStatus(u, k), 0);
/**
 * 這下掉血是不是中毒造成的？中毒每結算一次就自己少 1，拿「少了剛好一層」當判準最準，
 * 比翻紀錄字串可靠。認錯了也只是換一種光，不會壞掉。
 */
const chokeTick = (now: number, was: number): boolean => was > 0 && now === was - 1;

/** 每一位玩家在快照裡的那幾個數字（`buff`／`debuff` 給同伴那一格判斷要不要換新節點用；其餘見 seat-feedback.ts） */
type SeatSnap = { hp: number; block: number; stealth: number; down: boolean; buff: number; debuff: number } & SeatFeedbackSnap;

/**
 * 同伴那一格這一步要不要換新節點（清理 2026-09-22）。
 *
 * 以前魔物回合每一步（0.7 秒一次）都把同伴那一格無條件整格重建。改成跟自己那一格同一套判準：
 * 血、蜷縮、隱身、增減益有變，倒下或舉手牌子該掛該拆，姿勢圖換了，或者還留著這一拍的動畫類別
 *（`hit`／`dodge`／`attack` 要靠換新節點收掉）才換。`wantSrc`＝照現在的狀態該畫哪一張。
 */
function mateUnitStale(was: SeatSnap | undefined, q: PlayerCombat, node: HTMLElement, many: boolean, wantSrc: string): boolean {
  return !was || was.hp !== q.hp || was.block !== q.block || was.down !== !!q.down
    || was.stealth !== getStatus(q, '隱身') || was.buff !== sumStatus(q, GOOD_STATUS) || was.debuff !== sumStatus(q, BAD_STATUS)
    || node.classList.contains('downed') !== !!q.down || node.classList.contains('ready') !== (!!q.ready && many)
    || node.querySelector<HTMLImageElement>('.sprite')?.getAttribute('src') !== wantSrc
    || node.classList.contains('hit') || node.classList.contains('dodge') || node.classList.contains('attack');
}

/**
 * 這一拍被魔物身上的刺反彈了多少（2026-09-23 polish，主控裁定）。引擎每刺一下寫一行「X的刺反彈了 N 點」，
 * 刺先扣蜷縮、緊接著那一行是「…蜷縮擋下了 M 點」（actions.ts 的 damagePlayer，direct＋throughBlock）。
 * 回傳刺的總量與其中被蜷縮擋掉的量：丟東西打到帶刺的魔物時，畫面拿它把「被刺那一下」延到東西飛到才演。
 */
/**
 * 還在飛的東西各自記一筆（推前審查 2026-09-23 低-1）：同一位 0.3 秒內連丟兩張、兩趟都還沒飛到時，
 * 原本第二趟直接蓋掉第一趟暫存的量——第一趟飛到時拿掉的是第二趟的、飄的卻是第一趟的數字，第二趟飛到時什麼都不演。
 * 改成每一趟記序號、照順序排在同一格裡，飛到時只拿掉自己那一筆。
 */
function pushPending<T extends { token: number }>(map: Map<number, T[]>, key: number, entry: T): void {
  const list = map.get(key);
  if (list) list.push(entry); else map.set(key, [entry]);
}
/** 拿掉某一趟那一筆；真的拿到了回 true（這一格空了就整格刪掉） */
function dropPending<T extends { token: number }>(map: Map<number, T[]>, key: number, token: number): boolean {
  const list = map.get(key);
  const i = list ? list.findIndex((x) => x.token === token) : -1;
  if (!list || i < 0) return false;
  list.splice(i, 1);
  if (!list.length) map.delete(key);
  return true;
}

/** 回魂香那塊牌子的字：點上了＝「回魂香」、拉住過一次這一輪打不倒＝「回魂香：打不倒」、都沒有＝空（重畫比對也用這支，2026-09-24 b3int） */
function guardChipText(p: Pick<PlayerCombat, 'guardLethal' | 'guardLethalHold'>): string {
  return p.guardLethalHold ? '回魂香：打不倒' : p.guardLethal ? '回魂香' : '';
}

function thornPricks(lines: readonly string[]): { total: number; blocked: number } {
  let total = 0;
  let blocked = 0;
  lines.forEach((line, i) => {
    const m = /的刺反彈了 (\d+) 點$/.exec(line);
    if (!m) return;
    total += Number(m[1]);
    const b = /蜷縮擋下了 (\d+) 點$/.exec(lines[i + 1] ?? '');
    if (b) blocked += Number(b[1]);
  });
  return { total, blocked };
}

/**
 * 狀態列（`hud.ts` 的 `renderHud`）畫的東西裡，戰鬥途中會變的那幾樣：小魚乾（含這場的增減）、
 * 血量、秘寶，順手連忍具與牌組張數。這串沒變就不必整條重建（清理 2026-09-22）。
 */
function hudKey(m: RunPlayer, fishDelta: number, counters = ''): string {
  // `counters`＝計數型秘寶右下角的數字（2026-09-23 第二批）：回合數、這回合打了幾張一變就要重畫那一列
  return [m.fish + fishDelta, m.hp, m.maxHp, m.relics.join(','), m.potions.join(','), m.deck.length, counters].join('|');
}

interface Snap {
  phase: CombatState['phase'];
  hp: number;
  block: number;
  buff: number;
  growth: number;   // 爪力＋貓步：「氣勁被拍散」只看這兩個——隱身被打掉一層不是被拍散（2026-09-02 實玩：閃過攻擊也會飄這行字）
  debuff: number;
  choke: number;
  stealth: number;   // 音效要分辨「拿到隱身」與「拿到其他增益」
  energyGain: number;   // 整場退回來的飯糰累計，用來認出「這一拍退了幾顆」（見 types.ts 的說明）
  players: Map<number, SeatSnap>;
  enemies: Map<number, { hp: number; dead: boolean; phase: number; secluding: boolean; intent: Intent; label: string; turnCount: number; noAct: boolean; debuff: number; choke: number; block: number; stealth: number; buff: number; charged: boolean; learned: Learned | undefined;
    /** 出手前的整組狀態：丟出去的狀態類忍具還在飛時照這組畫（2026-09-23 polish 第 3 條，見 motionPendingStatus） */
    statuses: Unit['statuses'] }>;
  logLen: number;
  hitsLen: number;
  handN: number;   // 手牌張數與飯糰：同伴讓我抽牌／分飯糰時，只換立繪那條路碰不到手牌與側欄，要退回整頁重畫
  energy: number;
  relicFiredLen: number;   // 這一拍哪幾件秘寶動了：跟 `cs.relicFired` 相減就知道（見 `flashRelics`）
}
/** `me`＝**這台機器的那一位**（座位 0 或 1）。快照是拿來比「我這邊變了什麼」的，不能固定看第一位 */
function snap(cs: CombatState, me: PlayerCombat): Snap {
  return {
    phase: cs.phase,
    hp: me.hp, block: me.block, logLen: cs.log.length, hitsLen: cs.hits.length, handN: me.hand.length, energy: me.energy,
    energyGain: cs.energyGain, relicFiredLen: cs.relicFired.length,
    buff: sumStatus(me, GOOD_STATUS), debuff: sumStatus(me, BAD_STATUS),
    growth: getStatus(me, '爪力') + getStatus(me, '貓步'),
    choke: getStatus(me, '中毒'), stealth: getStatus(me, '隱身'),
    players: new Map(cs.players.map((p) => [p.seat, {
      hp: p.hp, block: p.block, stealth: getStatus(p, '隱身'), down: !!p.down,
      buff: sumStatus(p, GOOD_STATUS), debuff: sumStatus(p, BAD_STATUS),
      ...seatFeedbackSnap(p),
    }])),
    enemies: new Map(cs.enemies.map((e) => [e.uid, {
      hp: e.hp, dead: e.dead, phase: e.phase, secluding: e.invulnIn > 0, intent: e.move.intent, block: e.block, stealth: getStatus(e, '隱身'), learned: e.move.learned,
      debuff: sumStatus(e, BAD_STATUS), choke: getStatus(e, '中毒'), buff: sumStatus(e, GOOD_STATUS), charged: e.charged,
      statuses: { ...e.statuses },
      // 招式名與回合數是拿來認「剛剛出的是哪一招」的：魔物行動完 `advanceMove` 就把 `move` 推到下一招，
      // 事後再讀 `e.move` 讀到的是「頭上意圖顯示的下一招」，不是剛剛做完的那一招
      label: e.move.label, turnCount: e.turnCount,
      // 被定身或睡著的那一拍不算出手（引擎在 endTurn 裡整段跳過），立繪與前撲都不該動。
      // 原本只認「攻擊被定身擋掉」，所以山賊的「搶劫」、招財貓的「招手」這種非攻擊招被定住時，
      // 畫面照演一次蓄勢，看起來像牠真的搶到了（使用者 2026-09-04 回報）
      noAct: !willAct(e),
    }])),
  };
}

/** 素材還沒生好時 artUrl 會回一張 data: 的灰剪影；有些位置寧可不放圖也不要放剪影 */
function isFallback(url: string): boolean { return url.startsWith('data:'); }

function has<K extends EnemyEffect['kind']>(kind: K) {
  return (f: EnemyEffect): f is Extract<EnemyEffect, { kind: K }> => f.kind === kind;
}

/**
 * 同伴那一格的姿勢。
 *
 * **不跟自己那一格共用那套動畫邏輯**：`pose` 是整個畫面的一個變數，
 * 由「我剛剛打了什麼牌、我剛剛挨了什麼打」一路推出來的，同伴的那些事件
 * 是從連線來的，跟本機的動畫時序對不上。硬共用會讓兩邊的姿勢互相蓋掉。
 * 所以同伴只看**現在的狀態**畫：倒下、縮著、或站著。
 * 之後要替同伴做動畫，該做的是把連線收到的動作排成他自己的時序，不是共用這個變數。
 */
function matePose(p: PlayerCombat): string {
  if (p.down) return POSE.lose;
  /*
   * 站著時用**跟自己那格一樣的待機判斷**（2026-09-14 夜間實機）：原本「有蜷縮就縮成一團」，
   * 而菲菲的攻擊牌每張都附蜷縮——兩個分頁對打時，球球那台看到的她整個回合都縮成一顆大球，
   * 她自己那台看到的卻是站著、頭上掛「蜷縮 2」。同一個人兩台畫面長得不一樣，
   * 而且同伴身上的中毒、定身、爪力堆高那些待機姿勢一個都看不到。蜷縮的量本來就寫在牌子上。
   */
  return idlePoseKey(p, POSE, (k) => hasHeroSprite(p.hero, k));
}

/**
 * 戰鬥台詞是哪一格在講（2026-09-22 晚，連線盤點問題 5）：回傳座位，泡泡就從那一格頭上冒；
 * 回 undefined＝不是玩家在講（關主那一句），泡泡改從魔物頭上冒。原本一律從座位 0 頭上冒。
 * `literal`＝搭檔專屬的整組台詞，名字就是本人（「噹噹」就是噹噹那一格）；其餘劇本寫的「球球」是本機這一位。
 */
function speakerSeat(speaker: string, literal: boolean, players: readonly PlayerCombat[], mySeat: number): number | undefined {
  if (!literal) return speaker === '球球' ? mySeat : undefined;
  return players.find((q) => heroName(q) === speaker)?.seat;
}

registerScreen('combat', (app, root, props) => {
  if (!app.run || !app.cs) { app.show('map'); return; }   // 沒有戰鬥可打就退回地圖，不要留一片白
  // 收斂成不可為 null 的區域常數：型別窄化不會跟著進到下面那一堆內部函式裡
  const run: RunState = app.run;
  const cs: CombatState = app.cs;
  /**
   * **我是第幾位**（連線版 2026-09-11）。單機永遠是 0。
   *
   * 畫面上兩個人都看得到，但「手牌、飯糰、結束回合鈕」那一整套只屬於這一位——
   * 另一位的手牌不該被我看到（那是他的資訊），他的按鈕也不該被我按到。
   */
  const mySeat = (props as { seat?: number } | null)?.seat ?? app.seat;
  /**
   * 連線用的會話（單機是 null）。
   *
   * **有它的時候，所有會改變遊戲狀態的動作都要先過它**——不能再直接呼叫引擎。
   * 直接呼叫的話，只有自己這一台會動，對面完全不知道發生了什麼事，
   * 下一次對帳就會發現分岔、整場停掉。
   *
   * 動畫不走這條：牌飛出去、姿勢變化都還是當場演，狀態等動作繞回來才套。
   * 主機那一圈是本機的（等於沒有延遲），客戶端要等一個來回（約 0.1～0.2 秒）。
   */
  const session = (props as { session?: CoopSession } | null)?.session ?? app.coop;
  /**
   * **我這一位**。畫面上凡是「我的東西」都要走這支，不能用 `cs.player`。
   *
   * `cs.player` 是第一位（座位 0）。在客戶端那一台我是座位 1，
   * 用 `cs.player` 的話手牌、飯糰、狀態全部會顯示成**對方的**——
   * 而且點下去還會通過 `canPlay`（那張牌確實在座位 0 手上），
   * 一路到連線層才被擋掉。實測就是這樣：客戶端的手牌是主機的牌，
   * 按下去主控台噴「canPlay 放行後仍失敗」。
   *
   * 座位不存在時退回第一位（單機、或畫面比引擎早一步的那一拍）。
   */
  const my = (): PlayerCombat => cs.players[mySeat] ?? cs.player;
  /** 計數型秘寶此刻的數字串（狀態列的 `hudKey` 用：數字一變就重畫那一列，2026-09-23 第二批） */
  const hudCounters = (): string => relicCounterKey(my().relics, me(run, app.seat), { turn: cs.turn, p: my() });
  /**
   * **我那一格的選擇器**（2026-09-13 開兩個分頁玩出來的）。
   *
   * 動畫那幾段本來寫 `root.querySelector('.unit.player …')`——沒帶座位，
   * `querySelector` 拿的永遠是**畫面上第一格**，也就是 0 號座位。
   * 然後那幾行又往裡面寫 `heroArtUrl(my().hero, …)`，等於**把我的立繪蓋到同伴身上**。
   *
   * 玩家看到的：球球開房、菲菲加入時，菲菲那台畫面上兩隻都是菲菲，
   * 只有名牌還寫著「球球（同伴）」。球球那台完全正常——因為他就是 0 號，
   * 第一格剛好是他自己。所以一個人玩不會出事、開房那位也不會出事，
   * **只有加入的那一位看得到**，而且不報錯、不破圖，測試也照樣綠。
   */
  const MINE = `.unit.player[data-seat="${mySeat}"]`;
  /** 本機這一位講話時泡泡擺哪：從自己那一格冒出來（2026-09-22 晚；原本寫死在座位 0 頭上） */
  const mySpeech = (): ReturnType<typeof speechBubbleAt> => speechBubbleAt(mySeat, cs.players.length);
  const motionEnabled = qiuqiuMotionEnabled();
  type MotionActor = {
    element: HTMLCanvasElement;
    readonly foot: Readonly<{ x: number; y: number }>;
    play(action: CombatMotionAction, options?: { elapsed?: number; waves?: number }): void;
    dispose(): void;
  };
  type CombatMotion = { source: CombatMotionSource; actor: MotionActor; layer: HTMLElement; action: CombatMotionAction; active: boolean; reactive: boolean; away: boolean; raf: number; endsAt: number; trip?: MeleeTrip; presentationToken?: number; winAt?: number;
    /** 近戰前衝當下的位移（像素）與這一招從哪個位移接著衝：上一招還沒退回就被接手時，不先跳回原位（見 motionMeleeSample） */
    lungeX?: number; lungeFrom?: number;
    /** 這一招的衝刺殘影收掉的方法：下一招接手時連殘影一起收（2026-09-23 稽核 ui 低-1） */
    afterimages?: () => void };
  type MeleeTrip = { plan: MotionMeleePlan<CombatMotionAction>; origin: { x: number; y: number } };
  type EnemyMotionState = { kind: EnemyMotionKind; actor: ReturnType<typeof createEnemyMotionActor>; action: EnemyMotionAction; busyUntil: number };
  const motionActors = new Map<number, CombatMotion>();
  // 全場最後一個出手動作收掉的時間；收場用它判斷勝利動作是不是太早就開始（見 checkOver 的 finish）
  let lastMotionEndAt = 0;
  const enemyMotionActors = new Map<number, EnemyMotionState>();
  const motionImpactTimers = new Set<number>();
  const motionPendingDamage = new Map<number, number>();
  /**
   * 丟出去的東西還在飛的魔物 → 出手前的狀態與防禦（2026-09-23 polish 第 3 條）。
   * 引擎一出手就把定身、中毒掛上去了，戰場一重畫狀態牌子與「被定住了」就先亮，繩子才剛從手上飛出去；
   * 照血條等命中才扣（motionPendingDamage）的做法，飛到那一刻（landStatus）才換成真的狀態。
   * 一開始只管狀態類忍具（麻繩、定身釘、貓薄荷球）；主控裁定擴到所有丟出去的牌（毒砂、絆索、點穴手、毛球彈、各種飛針）：
   * 帶傷害的牌打中還會扣防禦、打掉飛行，所以防禦也一起記，飛在天上的也等打到才掉下來。
   * 每一趟一筆、照出手順序排（推前審查 低-1，見 pushPending）：畫的是最早那一趟出手前的樣子，一趟飛到就往後推一步。
   */
  const motionPendingStatus = new Map<number, Array<Pick<Unit, 'statuses' | 'block'> & { token: number }>>();
  /**
   * 丟東西打到身上帶刺（反彈）的魔物、被刺回來的那一位 → 還沒演的那一下扣了多少血與蜷縮（2026-09-23 polish，主控裁定）。
   * 引擎出手當下就把刺結算完了，畫面照舊會在東西還在飛時就扣血、飄數字；照 motionPendingStatus 的做法，
   * 血條與蜷縮先照被刺之前畫，東西飛到那一刻（最後一個帶刺的目標被打到）才扣、才飄。只改演出時機，引擎結算不動。
   * 每一趟一筆（推前審查 低-1）：還沒飛到的每一趟都加回去，飛到的只扣、只飄自己那一份。
   */
  const motionPendingPlayer = new Map<number, Array<{ token: number; hp: number; block: number }>>();
  /** 上面兩張表每一趟的序號 */
  let pendingSeq = 0;
  const motionProjectiles = new Set<() => void>();
  type LocalMotionPresentation = { action: CombatMotionAction; at: number; token: number; trip?: MeleeTrip };
  const locallyPlayedMotion = new LocalMotionPresentationQueue<LocalMotionPresentation>();
  const localCardMotionKey = (uid: number): string => `card:${uid}`;
  const localPotionMotionKey = (seat: number, id: string): string => `potion:${seat}:${id}`;
  let nextMotionPresentationToken = 0;
  let clawMotionIndex = 0;

  const motionSourceFor = (q: PlayerCombat): CombatMotionSource | undefined => {
    const hero = heroOf(q);
    if (hero === 'ninja') return 'qiuqiu';
    if (hero === 'feifei') return 'feifei';
    if (hero === 'dangdang') return 'dangdang';
    if (hero === 'fengfeng') return 'fengfeng';
    return undefined;
  };

  const motionDuration = (source: CombatMotionSource, action: CombatMotionAction, waves = 1): number =>
    source === 'qiuqiu'
      ? qiuqiuMotionDuration(action as QiuqiuAction, waves)
      : companionMotionDuration(source, action as CompanionMotionAction, waves);

  const motionImpactDelay = (source: CombatMotionSource, action: CombatMotionAction): number =>
    source === 'qiuqiu'
      ? qiuqiuImpactDelay(action as QiuqiuAction)
      : companionImpactDelay(source, action as CompanionMotionAction);

  const motionState = (q: PlayerCombat): CombatMotion | undefined => {
    const source = motionSourceFor(q);
    if (!source || (source === 'qiuqiu' ? !qiuqiuMotionReady() : !companionMotionReady(source))) return undefined;
    let state = motionActors.get(q.seat);
    if (!state || state.source !== source) {
      if (state) {
        window.cancelAnimationFrame(state.raf);
        state.actor.dispose();
        state.actor.element.remove();
        state.layer.remove();
      }
      const actor = (source === 'qiuqiu'
        ? createQiuqiuActor()
        : createCompanionMotionActor(source)) as unknown as MotionActor;
      state = { source, actor, layer: el('div', { class: 'qiuqiu-melee' },
        el('div', { class: 'qiuqiu-melee-shadow' })), action: 'idle', active: false, reactive: false, away: false, raf: 0, endsAt: 0 };
      motionActors.set(q.seat, state);
    }
    return state;
  };

  const shownPose = (q: PlayerCombat): string => q.seat === mySeat ? pose : matePose(q);

  /*
   * 待機狀態立繪 → 逐格動作的對照（2026-09-21 補齊掛彩、氣勢、肚子餓、定身、懶洋洋、鐵布衫、蜷縮，
   * 同伴另外補翻肚、隱身、炸毛）。原本同伴只接待機與中毒、球球少了七種，
   * 那些狀態一出現就退回舊版靜態立繪，同一場戰鬥畫風跳來跳去。
   * 四隻貓傳同一張表；哪隻缺哪張圖由兩邊的 `*RestMotionAction` 各自把關（缺圖就交還立繪）。
   */
  const REST_STATE_POSES = {
    idle: POSE.idle,
    poison: POSE.choke,
    belly: POSE.belly,
    puff: POSE.puff,
    stealth: POSE.stealth,
    hurt: POSE.hurt,
    power: POSE.power,
    hungry: POSE.hungry,
    dizzy: POSE.dizzy,
    lazy: POSE.lazy,
    iron: POSE.iron,
    curl: POSE.curl,
  } as const;

  const restMotionAction = (q: PlayerCombat, displayedPose: string): CombatMotionAction | undefined => {
    const source = motionSourceFor(q);
    if (source === 'qiuqiu') return qiuqiuRestMotionAction(displayedPose, REST_STATE_POSES, cs.phase, !!q.down);
    if (source === 'feifei' || source === 'dangdang' || source === 'fengfeng') {
      return companionRestMotionAction(source, displayedPose, REST_STATE_POSES, cs.phase, !!q.down);
    }
    return undefined;
  };

  /**
   * 別的座位還在出手或做反應時，先不切勝利、維持待機（實機 2026-09-21：連線時同伴補最後一刀，
   * 或敵方回合被反彈打死、兩隻的受擊反應長短不同，沒出手的那隻會先慶祝一整遍、收場再播一遍）。
   * 最後一個動作收掉時由 `idleMotion` 放行，兩隻一起開始慶祝。
   */
  const holdWin = (seat: number, action: CombatMotionAction | undefined): CombatMotionAction | undefined =>
    action === 'win'
      // 只看「還在出手或反應」的座位；別人也在播勝利不算（兩隻同時從頭播、長短不同時，
      // 先播完的不能被壓回待機再重播）。同伴連出兩張、第二張補刀時，我已切到勝利也要壓回來，
      // 等牠收招一起慶祝（審查 2026-09-21 晚 中-2）
      && [...motionActors].some(([other, state]) => other !== seat && state.active && state.action !== 'win') ? 'idle' : action;

  const mountMotion = (q: PlayerCombat, box: HTMLElement, displayedPose: string): void => {
    const source = motionSourceFor(q);
    if (!motionEnabled || !source
      || (source === 'qiuqiu' ? !qiuqiuMotionReady() : !companionMotionReady(source))) {
      box.classList.remove('has-qiuqiu-motion', 'has-companion-motion', 'qiuqiu-stealth-idle', 'qiuqiu-melee-away');
      motionActors.get(q.seat)?.actor.element.remove();
      return;
    }
    const state = motionState(q);
    if (!state) return;
    const resting = holdWin(q.seat, restMotionAction(q, displayedPose));
    if (!state.active && resting && state.action !== resting) {
      state.action = resting;
      state.actor.play(resting);
      if (resting === 'win') state.winAt = performance.now();
    }
    const visible = state.active || resting !== undefined;
    // 隱身待機半透明：2026-09-21 同伴也有了隱身逐格圖，比照球球一起變淡（樣式在兩支 motion css）
    box.classList.toggle('qiuqiu-stealth-idle', visible
      && ((!state.active && resting === 'stealth') || (state.reactive && getStatus(q, '隱身') > 0)));
    box.classList.toggle('has-qiuqiu-motion', source === 'qiuqiu' && visible);
    box.classList.toggle('has-companion-motion', source !== 'qiuqiu' && visible);
    box.classList.toggle('qiuqiu-melee-away', visible && state.active && state.away);
    box.closest('.unit')?.classList.toggle('qiuqiu-melee-front', visible && state.active && state.away);
    if (visible) {
      if (state.active && state.away) { state.layer.append(state.actor.element); box.append(state.layer); }
      else { state.layer.remove(); box.append(state.actor.element); }
    }
  };

  if (motionEnabled && cs.players.some((q) => heroOf(q) === 'ninja') && !qiuqiuMotionReady()) {
    void preloadQiuqiuMotion().then(() => {
      if (app.cs === cs && !ended) render();
    }).catch((error) => console.error('球球動作素材載入失敗', error));
  }
  if (motionEnabled && cs.players.some((q) => heroOf(q) === 'feifei') && !companionMotionReady('feifei')) {
    void preloadCompanionMotion('feifei').then(() => {
      if (app.cs === cs && !ended) render();
    }).catch((error) => console.error('菲菲動作素材載入失敗', error));
  }
  if (motionEnabled && cs.players.some((q) => heroOf(q) === 'dangdang') && !companionMotionReady('dangdang')) {
    void preloadCompanionMotion('dangdang').then(() => {
      if (app.cs === cs && !ended) render();
    }).catch((error) => console.error('噹噹動作素材載入失敗', error));
  }
  if (motionEnabled && cs.players.some((q) => heroOf(q) === 'fengfeng') && !companionMotionReady('fengfeng')) {
    void preloadCompanionMotion('fengfeng').then(() => {
      if (app.cs === cs && !ended) render();
    }).catch((error) => console.error('封封動作素材載入失敗', error));
  }
  // 丟出去的東西的圖（每張幾 KB，連線時同伴丟的也要有，所以全部先載）
  if (motionEnabled) preloadProjectiles();
  if (qiuqiuEnemyMotionAllowed(motionEnabled, cs.players.map((q) => heroOf(q)))) {
    const requested = [...new Set(cs.enemies
      .map((enemy) => qiuqiuEnemyMotionKind(enemy.enemyId))
      .filter((kind): kind is EnemyMotionKind => kind !== undefined))];
    if (requested.some((kind) => !enemyMotionReady(kind))) {
      void preloadEnemyMotion(requested).then(() => {
        if (app.cs === cs && !ended) render();
      }).catch((error) => console.error('敵人動作素材載入失敗', error));
    }
  }

  const refreshMotion = (q: PlayerCombat): void => {
    const box = root.querySelector<HTMLElement>(`.unit.player[data-seat="${q.seat}"] .sprite-box`);
    if (!box) return;
    mountMotion(q, box, shownPose(q));
    if (!box.classList.contains('has-qiuqiu-motion') && !box.classList.contains('has-companion-motion')) {
      motionActors.get(q.seat)?.actor.element.remove();
    }
  };

  const idleMotion = (seat: number): void => {
    const state = motionActors.get(seat);
    if (!state) return;
    const wasActive = state.active;
    if (wasActive) lastMotionEndAt = performance.now();
    window.cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.endsAt = 0;
    state.trip = undefined;
    state.layer.remove();
    state.active = false;
    state.reactive = false;
    state.away = false;
    const q = cs.players[seat];
    if (q) {
      const resting = holdWin(seat, restMotionAction(q, shownPose(q))) ?? 'idle';
      // 行程結束與通用收姿勢都會進來；已經待機時保留呼吸進度。
      // 勝利動作演完就停在收勢，不要因為「剛剛在演」又從頭再播一次（稽核 2026-09-21 第 10 點）。
      if ((wasActive && resting !== 'win') || state.action !== resting) {
        state.action = resting;
        state.actor.play(resting);
        if (resting === 'win') state.winAt = performance.now();
      }
      refreshMotion(q);
    }
    // 全場最後一個動作收掉：先前被 holdWin 壓住的座位現在一起切到勝利。
    if (![...motionActors.values()].some((other) => other.active)) {
      for (const [otherSeat, other] of motionActors) {
        const p = cs.players[otherSeat];
        if (otherSeat === seat || !p || other.action === 'win' || restMotionAction(p, shownPose(p)) !== 'win') continue;
        other.action = 'win';
        other.actor.play('win');
        other.winAt = performance.now();
      }
    }
  };

  // 舞台會隨視窗縮放，所有行程都先換回 1280 × 720 的座標。
  const motionFoot = (node: HTMLElement): { x: number; y: number } => {
    const stage = stageFrame(app.stage);
    const box = node.getBoundingClientRect();
    return { x: (box.left + box.width / 2 - stage.left) * stage.k, y: (box.bottom - stage.top) * stage.k };
  };

  const prepareMelee = (seat: number, action: CombatMotionAction, targetUid?: number, attack = true): MeleeTrip | undefined => {
    const q = cs.players[seat];
    const source = q ? motionSourceFor(q) : undefined;
    const melee = source === 'qiuqiu'
      ? qiuqiuIsMelee(action as QiuqiuAction)
      : source !== undefined && companionIsMelee(source, action as CompanionMotionAction);
    if (!q || !source || !attack || !melee) return undefined;
    const home = root.querySelector<HTMLElement>(`.unit.player[data-seat="${seat}"] .sprite-box`);
    // 全體爪擊沒有指定目標，就以最近一隻仍站著的魔物為接近位置。
    const uid = targetUid ?? cs.enemies.find((e) => !e.dead)?.uid;
    const enemy = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${uid}"] .sprite-box`);
    if (!home || !enemy) return undefined;
    const origin = motionFoot(home);
    const width = enemy.querySelector<HTMLElement>('.sprite')?.offsetWidth ?? enemy.offsetWidth;
    return { origin, plan: motionMeleePlan(origin, motionFoot(enemy), width, action,
      motionDuration(source, action), motionImpactDelay(source, action)) };
  };

  const playMotion = (seat: number, action: CombatMotionAction, trip?: MeleeTrip, elapsed = 0,
    reactive = false, presentationToken?: number): void => {
    const q = cs.players[seat];
    const source = q ? motionSourceFor(q) : undefined;
    if (!motionEnabled || !q || !source
      || (!reactive && qiuqiuCombatMotionDecision(cs.phase, true, false) !== 'play')) return;
    const state = motionState(q);
    if (!state) return;
    window.cancelAnimationFrame(state.raf);
    // 上一招的衝刺殘影跟著收掉（2026-09-23 稽核 ui 低-1）：原本只取消逐格排程，殘影照上一招的前衝位移
    // 繼續每 50 毫秒冒一張，本人已經在演下一招（實機：連刀接淡定，殘影多冒 0.7 秒）；下一張也衝刺就兩條疊在一起
    if (state.afterimages) { motionProjectiles.delete(state.afterimages); state.afterimages(); state.afterimages = undefined; }
    const caughtUp = Math.max(0, elapsed);
    const startedAt = performance.now() - caughtUp;
    // 受擊、閃避與格擋至少保留原演出的 650ms，短片段播完後停在收勢。
    state.endsAt = startedAt + Math.max(reactive ? 650 : 0,
      trip?.plan.totalMs ?? motionDuration(source, action));
    // 上一招還在前衝、沒退回原位就被這一招接手：這一招是近戰就從當下位移接著衝，不先跳回原位；
    // 不是近戰就從當下位移平順退回原位（2026-09-23 polish 第 4 條：原本一格跳回 74 像素）。
    // 「還在前衝」也包含上一個非近戰動作正在退回的那 140 毫秒（state.away 還開著）
    const carried = state.active && (state.trip || state.away) ? state.lungeX ?? 0 : 0;
    state.lungeFrom = trip ? carried : 0;
    const handoffFrom = trip ? 0 : carried;
    const handoffAt = performance.now();
    state.trip = trip;
    state.action = action;
    state.active = true;
    state.reactive = reactive;
    state.away = !!trip || handoffFrom !== 0;
    state.presentationToken = presentationToken;
    const lunge = trip ? motionMeleeSample(trip.plan, caughtUp, state.lungeFrom) : undefined;
    state.lungeX = lunge?.x ?? handoffFrom;
    state.layer.style.transform = lunge ? `translate(${lunge.x}px, ${lunge.y}px)` : handoffFrom ? `translate(${handoffFrom}px, 0px)` : '';
    state.actor.play(state.action, { elapsed: caughtUp });
    refreshMotion(q);
    if (source === 'qiuqiu' && trip && (action === 'dash' || action === 'ultimate_rush')) {
      let cancel: () => void = () => undefined;
      const lungeFrom = state.lungeFrom;
      cancel = playQiuqiuAfterimages(app.stage, state.actor as unknown as QiuqiuActor, {
        x: trip.origin.x,
        y: trip.origin.y + trip.plan.dy,
      }, {
        duration: trip.plan.totalMs,
        elapsed: caughtUp,
        offsetAt: (elapsed) => motionMeleeSample(trip.plan, elapsed, lungeFrom).x,
        onDone: () => { motionProjectiles.delete(cancel); if (state.afterimages === cancel) state.afterimages = undefined; },
      });
      motionProjectiles.add(cancel);
      state.afterimages = cancel;
    }
    let anchor: { x: number; y: number } | null = null;
    let anchorMeasuredAt = 0;
    let anchorParent: HTMLElement | null = null;
    const tick = (now: number): void => {
      if (app.cs !== cs || !state.active) return;
      const elapsed = now - startedAt;
      const activeTrip = state.trip;
      const sample = activeTrip ? motionMeleeSample(activeTrip.plan, elapsed, state.lungeFrom) : null;
      if (sample?.done || (!activeTrip && now >= state.endsAt)) {
        if (seat === mySeat && cs.phase === 'player') {
          pose = idlePose();
          const image = root.querySelector<HTMLImageElement>(`${MINE} .sprite`);
          if (image) image.src = heroArtUrl(q.hero, pose);
        }
        // 只就地收姿勢；整頁重畫會重建手牌，並截斷飄字與其他單位的動作。
        idleMotion(seat);
        return;
      }
      if (sample && activeTrip) {
        // 狀態列可能在出牌後變高；出手期間前衝仍以出手當下的腳底位置為準。
        // 但量測不能每幀做：querySelector + getBoundingClientRect 之後又在同一幀寫 transform，
        // 讀寫交錯會逼瀏覽器每幀重算一次版面，出手那 0.4～1.8 秒整個畫面掉幀（稽核 2026-09-21 第 1 點）。
        // 狀態列變高是離散事件，每 200 毫秒補量一次就足夠。
        // 結算重畫會把整格換掉、圖層搬進新的外框；外框一換就立刻重量，不等 200 毫秒。
        const parent = state.layer.parentElement;
        if (anchor === null || parent !== anchorParent || now - anchorMeasuredAt >= 200) {
          const home = root.querySelector<HTMLElement>(`.unit.player[data-seat="${seat}"] .sprite-box`);
          anchor = home ? motionFoot(home) : activeTrip.origin;
          anchorMeasuredAt = now;
          anchorParent = parent;
        }
        const x = sample.x + activeTrip.origin.x - anchor.x;
        const y = sample.y + activeTrip.origin.y - anchor.y;
        state.lungeX = sample.x;
        state.layer.style.transform = `translate(${x}px, ${y}px) scaleX(${sample.facing})`;
        if (state.action !== sample.action) { state.action = sample.action; state.actor.play(sample.action); }
      } else if (handoffFrom !== 0 && state.away) {
        // 非近戰動作接手近戰：邊演新動作邊退回原位，退到了就把畫布放回自己那一格（見上面的 handoffFrom）
        const x = meleeHandoffReturn(handoffFrom, now - handoffAt);
        state.lungeX = x;
        state.layer.style.transform = x ? `translate(${x}px, 0px)` : '';
        if (x === 0) { state.away = false; refreshMotion(q); }
      }
      state.raf = window.requestAnimationFrame(tick);
    };
    state.raf = window.requestAnimationFrame(tick);
  };

  const motionForCard = (q: PlayerCombat, card: CardInstance): CombatMotionAction | undefined => {
    if (!motionEnabled) return undefined;
    const source = motionSourceFor(q);
    if (!source) return undefined;
    const stats = cardStats(card);
    const def = stats.def;
    // 2026-09-22：技能、能力牌照規則選動作（家族、牌型、這次實際的效果），原本球球 70 張、菲菲 28 張、封封 18 張
    // 選不到動作，出牌時動作畫布收起來、舊版靜態立繪亮 0.65 秒，畫風跳一下（盤點 docs/審查報告/缺動作的牌_2026-09-21.md）。
    // 新補的出牌動作圖是延後下載的：還沒到（或壞了）就先播預載好的替身（2026-09-22 晚，原本交還靜態立繪、露出舊畫風），
    // 不能讓畫布停在上一個動作的最後一格；圖到了下一張牌就用新動作（比照待機狀態的 drawable）。
    if (source === 'qiuqiu') {
      const action = qiuqiuCardAction(def.id, ATTACK_POSE[def.id] ?? SKILL_POSE[def.id], clawMotionIndex, card.upgraded,
        { type: def.type, effects: stats.effects });
      if (action?.startsWith('attack')) clawMotionIndex += 1;
      return action ? qiuqiuPlayableAction(action) : undefined;
    }
    const action = companionCardAction(source, def.id, {
      poseFamily: ATTACK_POSE[def.id] ?? SKILL_POSE[def.id],
      cardType: def.type,
      hasBlock: stats.effects.some((effect) => effect.kind === 'block' || effect.kind === 'blockIfPoisoned'),
      hasHeal: stats.effects.some((effect) => effect.kind === 'heal'),
    });
    return action ? companionPlayableAction(source, action) : undefined;
  };

  /** 用忍具時演哪個逐格動作（2026-09-22 晚：原本只有吃的有，其餘忍具露出舊立繪 0.7 秒；規則在 potion-motion.ts） */
  const motionForPotion = (q: PlayerCombat, id: string): CombatMotionAction | undefined => {
    const source = motionEnabled ? motionSourceFor(q) : undefined;
    const def = potionById[id];
    return source && def ? potionMotionAction(source, def) : undefined;
  };

  /** 這張牌丟出去的是什麼：聚葉成刀飛葉片、毛球彈飛毛球⋯⋯（2026-09-22 批次 proj，表在 projectile-kinds.ts） */
  const projectileForCard = (q: PlayerCombat, card: CardInstance, action: CombatMotionAction | undefined): ProjectileShot | undefined => {
    const source = motionSourceFor(q);
    return source && action ? cardProjectile(source, cardStats(card).def.id, action) : undefined;
  };
  /** 這支忍具丟出去的是什麼、丟向誰（鞭炮全體、麻繩單體、煙霧彈丟在自己腳邊） */
  const projectileForPotion = (id: string, targetUid: number | undefined): ProjectileShot | undefined => {
    const def = potionById[id];
    return def ? potionProjectile(def, targetUid) : undefined;
  };

  const scheduleMotionImpact = (source: CombatMotionSource, action: CombatMotionAction, callback: () => void, elapsed = 0, approachMs = 0): void => {
    scheduleMotionImpactAt(motionImpactDelay(source, action), callback, elapsed, approachMs);
  };

  const scheduleMotionImpactAt = (impactAt: number, callback: () => void, elapsed = 0, approachMs = 0): void => {
    const timer = window.setTimeout(() => {
      motionImpactTimers.delete(timer);
      if (app.cs === cs) callback();
    }, Math.max(0, approachMs + impactAt - elapsed));
    motionImpactTimers.add(timer);
  };

  const disposeEnemyMotion = (uid: number): void => {
    const state = enemyMotionActors.get(uid);
    if (!state) return;
    state.actor.dispose();
    state.actor.element.remove();
    enemyMotionActors.delete(uid);
    root.querySelector(`.unit.enemy[data-uid="${uid}"] .sprite-box`)?.classList.remove('has-enemy-motion');
  };

  const playEnemyMotion = (uid: number, action: EnemyMotionAction): void => {
    const state = enemyMotionActors.get(uid);
    if (!state) return;
    state.action = action;
    state.busyUntil = action === 'attack' ? performance.now() + qiuqiuEnemyMotionHold(state.kind, action, 0) : 0;
    state.actor.play(action);
    if (action === 'attack') {
      const expectedEnd = state.busyUntil;
      const timer = window.setTimeout(() => {
        motionImpactTimers.delete(timer);
        const live = enemyMotionActors.get(uid);
        if (app.cs === cs && live === state && live.action === 'attack' && live.busyUntil === expectedEnd) playEnemyMotion(uid, 'idle');
      }, Math.max(0, expectedEnd - performance.now()));
      motionImpactTimers.add(timer);
    }
  };

  const finishEnemyMotion = (uid: number): void => {
    const state = enemyMotionActors.get(uid);
    if (!state) return;
    playEnemyMotion(uid, 'knockdown');
    const timer = window.setTimeout(() => {
      motionImpactTimers.delete(timer);
      if (app.cs === cs) disposeEnemyMotion(uid);
      // 倒地畫布要留到整隻溶解完（combat.css 的 `.unit.dead` 溶解 0.8 秒）：擊倒動作只有 0.2 秒，
      // 太早收掉的話，溶解期間底下的靜態站姿立繪會冒出來邊淡邊消失（稽核 2026-09-21 晚 中-2）
    }, Math.max(enemyMotionDuration(state.kind, 'knockdown'), 800) + 160);
    motionImpactTimers.add(timer);
  };

  const mountEnemyMotion = (e: EnemyCombat, box: HTMLElement): void => {
    if (!qiuqiuEnemyMotionAllowed(motionEnabled, cs.players.map((q) => heroOf(q)))) {
      disposeEnemyMotion(e.uid);
      box.classList.remove('has-enemy-motion');
      return;
    }
    const kind = qiuqiuEnemyMotionKind(e.enemyId);
    if (!kind || !enemyMotionReady(kind)) {
      disposeEnemyMotion(e.uid);
      box.classList.remove('has-enemy-motion');
      return;
    }
    let state = enemyMotionActors.get(e.uid);
    if (!state && e.dead && !fallingUids.has(e.uid) && !(e.reviveIn > 0 && willRevive(cs, e))) return;
    if (!state || state.kind !== kind) {
      disposeEnemyMotion(e.uid);
      const action: EnemyMotionAction = e.dead ? 'knockdown' : 'idle';
      state = { kind, actor: createEnemyMotionActor(kind), action, busyUntil: 0 };
      enemyMotionActors.set(e.uid, state);
    }
    const action: EnemyMotionAction = e.dead && !fallingUids.has(e.uid) ? 'knockdown'
      : hurtSet.has(e.uid) ? 'hurt'
        : acting.get(e.uid)?.attacked ? 'attack' : 'idle';
    const keepAttack = action === 'idle' && state.action === 'attack' && state.busyUntil > performance.now();
    if (!keepAttack && state.action !== action) playEnemyMotion(e.uid, action);
    box.classList.add('has-enemy-motion');
    box.append(state.actor.element);
  };

  app.disposers.push(() => {
    for (const timer of motionImpactTimers) window.clearTimeout(timer);
    motionImpactTimers.clear();
    for (const cancel of motionProjectiles) cancel();
    motionProjectiles.clear();
    // 只停、不拔：畫布與近戰層都在這個畫面層裡，跟著畫面層一起走。
    // 換場時舊畫面會墊在底下淡出 220 毫秒（M-2，見 screenswap.ts），這裡先拔掉的話那段時間貓和魔物整隻不見
    for (const state of motionActors.values()) {
      window.cancelAnimationFrame(state.raf);
      state.actor.dispose();
    }
    motionActors.clear();
    motionPendingDamage.clear();
    motionPendingStatus.clear();
    motionPendingPlayer.clear();
    locallyPlayedMotion.clear();
    for (const state of enemyMotionActors.values()) state.actor.dispose();
    enemyMotionActors.clear();
  });
  /** 同伴的動作套用**之前**那一刻的快照，`settle` 拿它比對出要演什麼 */
  let remoteBefore: Snap | null = null;
  /** 缺號補齊時會一次套多張；保留整份引擎前態，才能重建每張牌自己的前後快照。 */
  let remoteCombatBefore: CombatState | null = null;
  /** 套用前每一位的手牌（同伴剛打出哪一張要靠這份回頭找，見 `mateplay.ts`） */
  let handsBefore: CardInstance[][] = [];
  /** 同伴這回合最後打出的那張：掛在他頭上，下一張換掉、換回合消失（使用者 2026-09-15） */
  const matePlay = new Map<number, { card: CardInstance; turn: number }>();
  /** 上次畫出來的是哪張（uid）：同一張重畫不重播淡入動畫，不然魔物回合每段演出都閃一次（審查 中-4） */
  const matePlayShown = new Map<number, number>();
  /*
   * 同伴上一次動作是多久以前——「等太久了，替他收回合」那顆按鈕靠這個決定要不要亮。
   *
   * **只有畫面這一層看時間**（理由寫在 `engine/combat.ts` 的 `forceReady`）：
   * 引擎裡一旦出現「現在幾點」，兩台機器的秒差就會讓鎖步悄悄分岔。
   * 這裡量出來的只是「要不要亮一顆按鈕」，真正收回合是按下去才送出的一個明確動作。
   *
   * 換回合自動歸零：`mateIdleMs()` 每秒被問一次，順手比對回合數，
   * 所以不必在收回合那條路上另外記得清一次（那種「另一個地方也要記得改」最容易漏）。
   */
  let mateActAt = Date.now();
  let mateTurnSeen = -1;
  function mateIdleMs(): number {
    if (mateTurnSeen !== cs.turn) { mateTurnSeen = cs.turn; mateActAt = Date.now(); }
    // 同伴還沒進到這一場的戰鬥畫面（塔頂段落、關主開場還在讀）不算閒置：從他進場那一刻才起算（2026-09-23 稽核 中-1）。
    // 原本從我這邊建好戰鬥畫面就開始數，劇情長短不同的混搭，他一進場第一回合就被我收掉
    // 他掛著一直不進來、滿三分鐘的長上限（`mayForce`，推前審查 低-2）之後就不再歸零：從那一刻起照常再數一分鐘
    if (session && !session.mateHere && !session.mayForce) mateActAt = Date.now();
    return Date.now() - mateActAt;
  }
  /** 有連線時，把動作送出去；沒有就在本機做掉。回傳 false＝這個動作現在做不出來 */
  const sendOrDo = (a: CoopAction, local: () => boolean): boolean => {
    if (!session) return local();
    /*
     * **只有客戶端要上鎖。**
     *
     * 主機的 `submit` 是同步套用的：`onApplied`（裡面會 `unlockSend()`）在這一行**之前**
     * 就跑完了，之後才上鎖就再也沒有人解得開，只剩三秒的保險絲。
     * 實測的結果是主機出一張牌要乾等三秒才出得了下一張，整場都這樣——等於主機沒辦法玩。
     * （這正是「主機同步套用」那個坑的第二次現形。）
     */
    const ok = session.submit(a);
    if (ok && !session.isHost) lockSend();
    return ok;
  };
  /** 這一位的血與蜷縮照這組畫：丟東西被刺回來、東西還在飛時，把還沒演的那一下加回去（見 motionPendingPlayer） */
  const shownPlayer = (q: PlayerCombat): PlayerCombat => {
    const held = motionPendingPlayer.get(q.seat);
    if (!held) return q;
    // 還沒飛到的每一趟都加回去（連丟兩張時兩趟都還在飛）
    let hp = q.hp, block = q.block;
    for (const h of held) { hp += h.hp; block += h.block; }
    return { ...q, hp, block };
  };
  /** 只換這一位的血條與狀態牌子（被刺那一下扣下去／先加回去時用；整格重建會打斷受擊演出） */
  const refreshPlayerStatus = (seat: number): void => {
    const q = cs.players[seat];
    const node = root.querySelector<HTMLElement>(`.unit.player[data-seat="${seat}"]`);
    if (!q || !node) return;
    const shown = shownPlayer(q);
    node.querySelector(':scope > .hpbar')?.replaceWith(hpBar(`p${seat}`, shown.hp, q.maxHp));
    node.querySelector(':scope > .chips')?.replaceWith(statusRow(shown, true, `p${seat}`));
  };
  /**
   * 畫一位玩家。兩個人時靠 `playerLeft` 排位、`data-seat` 認人。
   *
   * 自己那一格掛 `mine`，讓樣式標出來——兩隻一模一樣的球球站在一起，
   * 沒有標記的話玩家會分不出哪隻是自己（實際玩起來這是最容易搞混的地方）。
   */
  const playerUnit = (q: PlayerCombat): HTMLElement => {
    const mine = q.seat === mySeat;
    const n = cs.players.length;
    const displayedPose = mine ? pose : matePose(q);
    const picture = spriteBox(heroArtUrl(q.hero, displayedPose), heroName(q));
    const node = el('div', {
      class: `unit player${mine ? ' mine' : ''}${q.down ? ' downed' : ''}${q.ready && n > 1 ? ' ready' : ''}`,
      'data-seat': String(q.seat),
      style: `left:${playerLeft(q.seat, n)}px`,
    },
      picture,
      el('div', { class: 'name' }, n > 1 ? `${heroName(q)}（${mine ? '你' : '同伴'}）` : heroName(q)),
      // 動畫記憶的鍵要帶座位（連線稽核 中-1）：兩位共用 'player' 的話，每次整頁重畫兩條血條都從
      // 對方的比例滑到自己的，低的那條每次拖一條「剛掉血」的殘影，狀態牌子也每次彈一下。單機只有座位 0
      // 血與蜷縮照 shownPlayer：被刺的那一下還沒演（東西還在飛）時照被刺之前畫（見 motionPendingPlayer）
      hpBar(`p${q.seat}`, shownPlayer(q).hp, q.maxHp),
      statusRow(shownPlayer(q), true, `p${q.seat}`));
    mountMotion(q, picture, displayedPose);
    // 舉手了就在頭上掛一張牌子：對方在等你，這件事一定要看得見
    if (q.ready && n > 1) node.append(el('div', { class: 'ready-tag' }, q.down ? '倒下了' : '已結束回合'));
    else if (q.down && n > 1) node.append(el('div', { class: 'ready-tag down' }, '倒下了'));
    // 同伴剛打出的牌：縮小、半透明掛在他頭上，下一張換掉、換回合消失（使用者 2026-09-15：「完全不知道隊友做了什麼」）
    // 同伴點選還沒打的那張（虛線、更淡、標「考慮中」）優先於他上一張打出的
    const considering = mine ? undefined : mateHint.get(q.seat);
    const hintCard = considering === undefined ? undefined : q.hand.find((c) => c.uid === considering);
    const mp = mine ? undefined : matePlay.get(q.seat);
    // 分出勝負就不掛（2026-09-22 晚，連線盤點問題 8）：原本只有換回合才消失，打贏了還掛在他頭上。
    // 條件也寫進 mateSig，勝負一分出來那一格就會換成沒有牌的新節點
    if (hintCard && cs.phase === 'player') {
      node.append(el('div', { class: 'mate-play hint' }, cardNode(hintCard, { small: true, hero: heroOf(q), partnerHero: heroOf(my()) }), el('div', { class: 'hint-tag' }, '考慮中')));
    } else if (mp && mp.turn === cs.turn && cs.phase === 'player') {
      const fresh = matePlayShown.get(q.seat) !== mp.card.uid;   // 新的一張才播淡入；重畫同一張不動
      matePlayShown.set(q.seat, mp.card.uid);
      // 牌名與圖照**同伴**的角色：忍者那位的 hero 欄位刻意不寫，直接傳 q.hero 會退成本機角色（審查 中-3）
      node.append(el('div', { class: `mate-play${fresh ? ' in' : ''}` }, cardNode(mp.card, { small: true, hero: heroOf(q), partnerHero: heroOf(my()) })));
    }
    if (!mine) node.dataset.mateSig = mateSig(q);
    return node;
  };
  const bonusFish = (props as { bonusFish?: number } | null)?.bonusFish ?? 0;
  const bonusUpgrades = (props as { bonusUpgrades?: number } | null)?.bonusUpgrades ?? 0;
  // 關主戰用專屬戰場（boss1/2/3 依關數）；圖還沒生好就照舊用該關色調。
  // 算法搬到 `screenbg.ts` 的 `battleBgKey` 給關主門共用（稽核 2026-09-10 中-2，順便修掉少 `bg/` 前綴那個老 bug）
  const bgKey = battleBgKey(run.act, run.floor, encounterById[cs.encounterId]?.pool === '塔主');

  type Targeting = { kind: 'card'; uid: number } | { kind: 'potion'; id: string } | null;
  let targeting: Targeting = null;
  /**
   * 換瞄準狀態一律走這裡：連線時順便告訴同伴「我點了哪張」（純提示、不進鎖步；使用者 2026-09-15：
   * 像 Spire 2 那樣看得到隊友想打哪張）。點選：只有要瞄準的攻擊牌才有「點了還沒打」這個狀態，
   * 技能牌點下去就打出去了，由打出的那張（`matePlay`）來顯示。拖曳：拖起來那一刻就送、放開就撤
   *（使用者 2026-09-15：用拖的也要看得到）。同一個值不重送。
   */
  let hintSent: number | null = null;
  let hintTimer: ReturnType<typeof setTimeout> | null = null;
  /** 現在想讓同伴看到的那張（點選瞄準中的、或正拖著的）；null＝沒有 */
  let hintWanted: number | null = null;
  const scheduleHint = (u: number | null): void => {
    hintWanted = u;
    if (!session) return;
    // 合併 120 毫秒內的變化只送最後一個值：狂點同一張牌不會變成每秒二十則（中繼免費額度是全帳號共用的；審查 中-3）
    if (hintTimer !== null) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      hintTimer = null;
      if (hintWanted !== hintSent) { hintSent = hintWanted; session.hint(hintWanted); }
    }, 120);
  };
  const setTargeting = (t: Targeting): void => {
    targeting = t;
    scheduleHint(t?.kind === 'card' ? t.uid : null);
    damagePreview(null);   // 換牌或取消瞄準：舊的扣血預覽收掉，等箭頭再吸附到魔物才重算
  };
  app.disposers.push(() => { if (hintTimer !== null) clearTimeout(hintTimer); });
  /**
   * 同伴現在點選著哪張（他手上的牌在我這台也同步著，直接拿來畫）。
   * 不用回合號蓋章（審查 中-1）：兩台回合推進的時間不同，蓋錯就整回合看不到；改成「那張還在他手上才畫」——
   * 打出、棄掉、換回合牌離開手牌就自然消失，取消或打出時對方也會送 null。
   */
  const mateHint = new Map<number, number>();
  /**
   * 同伴那一格上會變、但快照（SeatSnap）沒記的東西：考慮中的牌、這回合剛打出的牌、蓄氣、針上的毒。
   * 同伴出一張只打魔物的牌時血量、蜷縮、狀態都沒變，只比快照的話頭上那張牌與封封的蓄氣都不會換
   *（推前審查 2026-09-22 高-1）。畫的時候記在節點上，逐步修補時比一下。
   */
  const mateSig = (q: PlayerCombat): string => {
    const mp = matePlay.get(q.seat);
    return [mateHint.get(q.seat) ?? '', mp && mp.turn === cs.turn ? mp.card.uid : '', q.qi ?? '', q.poisonNextAttack?.amount ?? '', cs.phase,
      q.energyNextTurn ?? '', q.guardLethalHold ? 2 : q.guardLethal ? 1 : ''].join('|');   // 便當、回魂香的牌子（2026-09-23 第二批）
  };
  /** 待機姿勢隨狀態換：血剩三成以下就掛彩、爪力堆到 5 就氣勢；圖還沒生好就退回一般待機 */
  // 判斷與理由都在 `heropose.ts`（純函式，有測試釘著）
  const idlePose = (): string => idlePoseKey(my(), POSE, (k) => hasHeroSprite(my().hero, k));
  let pose = idlePose();
  /**
   * 這一拍出手的魔物（uid → 牠剛使出的招式）。跟球球的姿勢同一個節奏：`settle` 重算、
   * 650 毫秒後跟著還原成待機。魔物只在 `endTurn` 裡行動，所以出牌那幾次結算這張表一定是空的。
   */
  let acting = new Map<number, Acted>();
  /** 這一拍被打到的魔物：有挨打圖的換挨打圖（2026-09-03 晚補的動態） */
  let hurtSet = new Set<number>();
  /** 動作尚未打到前，死亡狀態已同步結算；暫存上一張立繪，重畫也不能提前露出倒地圖。 */
  const motionHeldSprites = new Map<number, string>();
  /** 在「這一擊打贏」那一拍倒下的關主：只有這些才演白閃慢倒；早就倒了的（波斯先倒、僕從後倒）維持消散、不會復活再倒一次（稽核 2026-09-04 高 2） */
  const bossFallUids = new Set<number>();
  /**
   * 正在等最後一段演完才補 `dead` 的那幾隻（多段攻擊打死時）。
   * **記在這裡不記在節點上**：`falling` 本來是加在當下那顆節點，接著出第二張牌就整頁重畫、
   * 新節點只有 `gone` 沒有 `falling`，那隻怪會直接消失、不演溶解（稽核 2026-09-10 低-6）。
   */
  const fallingUids = new Set<number>();
  let hint = '';
  /**
   * 三步教學（-1＝不顯示）。只在第一關 1F、這台瀏覽器沒看完過教學時出現：
   * 出第一張牌進第 2 步、按結束回合進第 3 步、再結束一回合就收工寫進瀏覽器。
   * 寫 localStorage 一律 try/catch——無痕視窗會炸，炸了就當看過。
   */
  let tutStep = -1;
  try { if (run.act === 1 && run.floor === 1 && window.localStorage.getItem('qiuqiu.tutorial') !== 'done') tutStep = 0; } catch { /* 讀不到就不教 */ }
  const TUT_TEXT = [
    '先點一張牌：攻擊牌要再點一隻魔物才會出招，其他牌點了就生效',
    '魔物頭上的圖示＝牠下一回合要做的事（滑鼠移上去有說明）；飯糰用完就按「結束回合」',
    '蜷縮（藍色盾）幫你擋攻擊，撐到你下回合開始；打倒全部魔物就贏了',
  ];
  function tutDone(): void {
    tutStep = -1;
    try { window.localStorage.setItem('qiuqiu.tutorial', 'done'); } catch { /* 存不了就每局都教 */ }
  }
  let hungryTurn = -1;
  let hungryTold = false;
  let lowHpTold = false;
  let ended = false;
  let picker: HTMLElement | null = null;
  /** `picker` 是替哪一個待選開的（連線時同一格可能從「等同伴挑牌」換成輪到我） */
  let pickerFor: CombatState['pending'] = null;
  /** 我選好、已經送出去的那一個待選（客戶端要等繞回來，這段期間不重開視窗，稽核 2026-09-14 高-4） */
  let chooseSent: CombatState['pending'] = null;
  // 換畫面時把疊層上的視窗或「等同伴挑牌」收掉：疊層不隨畫面清空，斷線回標題時會留在標題上
  app.disposers.push(() => { picker?.remove(); picker = null; });
  let seq = 0;   // 每次結算 +1，讓過期的計時器認出自己已經不是最新的一次
  const lastHpPct = new Map<string, number>();   // 生命條上一次畫到哪，重畫後才滑得動
  /**
   * 狀態牌子上一次是幾層（鍵＝`<誰>|<狀態名>`）。新掛上、或層數變多的那一個彈一下。
   *
   * 本來狀態牌子完全沒有動靜：中了翻肚、被疊爪力，牌子就這樣憑空出現在那一排，
   * 玩家很容易整場都沒發現自己身上多了什麼。跟生命條的 `lastHpPct` 同一套做法——
   * 只在**值真的變了**的時候演，重畫幾十次也不會一直閃。
   */
  const lastChips = new Map<string, number>();
  /**
   * 第一次重畫先把現況灌進 `lastChips` 再畫，不然開場就自帶飛行、鱗甲、或被修飾詞加了爪力的魔物，
   * 整排牌子會在開場白正在冒泡泡的時候一起蹦（稽核 2026-09-10 低-5）。
   * 跟飯糰那條 `lastEnergy < 0` 同一個做法。
   */
  let chipsSeeded = false;
  /**
   * 每隻魔物上一次頭上寫的是什麼。換了就翻一下——牠下一步要幹嘛是這遊戲最該讀懂的資訊，
   * 但換招時牌子只是**默默換字**，一整排怪的時候誰換了根本看不出來。
   */
  const lastIntent = new Map<number, string>();
  let shownCards = new Set<number>();            // 上一次畫的手牌，認出哪幾張是新抽的
  let dealDelay = 0;                             // 新手牌進場前要等多久（結束回合那一拍會等）
  let lineup: number[] = cs.enemies.map((e) => e.uid);   // 魔物的排位名單（見 render 裡的說明）
  let hudShown = '';                             // 狀態列上一次畫的是什麼（`hudKey`）：沒變就不重建
  /**
   * 開戰先把這場會用到的立繪解碼好（使用者 2026-09-03：「第一次攻擊動作有點 LAG，下一次就正常」）：
   * 出手圖是換 src 的那一拍才第一次載入＋解碼，第一次前撲就會頓一下。這裡用 Image.decode() 先熱身，
   * 物件留在這一場自己的 `warmPool` 裡免得被回收（跟著畫面一起放掉）；召喚出新魔物時（render 裡）再補熱。
   * 解碼迴圈跟開場／分關預載共用 `assets.ts` 的 `decodeAll`。
   */
  const warmPool: DecodePool = { seen: new Set(), keep: new Map() };
  const asked = new Set<string>();   // 送出去過的（還在解的也算）：重畫時不重送
  const warm = (urls: readonly string[]): void => {
    const fresh = [...new Set(urls)].filter((u) => u && !asked.has(u));
    for (const u of fresh) asked.add(u);
    // 一次全部送出、不排隊（跟以前一張一張各自 decode 一樣）；解不開就算了，畫面照常
    if (fresh.length) void decodeAll(fresh, fresh.length, true, warmPool);
  };
  /*
   * 角色姿勢一位只暖一次（開戰那一刻；連線途中才出現的那位在下一次重畫補上），
   * 魔物照「哪一隻、現在用哪一組立繪」記一次：重畫時只補新召喚的、或換了階段立繪的（清理 2026-09-22）。
   * 以前每次整頁重畫都把兩位共六十幾個姿勢鍵、塔主四十幾張圖整份重算一遍，只為了挑出沒暖過的。
   */
  const warmedHeroes = new Set<string>();
  const warmedEnemies = new Set<string>();
  /**
   * 逐格動作好了之後還可能露出來的靜態立繪（2026-09-23 稽核 ui 低-4，判準見 `combatWarmPoses`）：
   * 待機狀態那批一定要；挨打、閃、擋、勝、敗、倒下的逐格動作不是延後下載的，照理不會露出靜態圖，
   * 但那幾條交還路線沒有測試釘著，一位才六張，保守起見照暖——那一刻空白比多占幾 MB 糟。
   */
  const motionFallbackPoses: ReadonlySet<string> = new Set([...Object.values(REST_STATE_POSES),
    POSE.hit, POSE.dodge, POSE.guard, POSE.win, POSE.lose, POSE.down]);
  const warmHeroes = (): void => {
    const urls: string[] = [];
    // 每一位都暖一次：連線時同伴可能是另一個角色，只暖自己的話同伴整場都在等圖下載
    for (const q of cs.players) {
      const who = `${q.seat}:${q.hero ?? ''}`;
      if (warmedHeroes.has(who)) continue;
      warmedHeroes.add(who);
      // 逐格動作已經載好就只暖退路會用到的；還沒載好（冷快取的第一場）或 `?motion=0` 照舊全套
      const source = motionEnabled ? motionSourceFor(q) : undefined;
      const motionReady = !!source && (source === 'qiuqiu' ? qiuqiuMotionReady() : companionMotionReady(source));
      for (const key of combatWarmPoses(Object.values(POSE), motionFallbackPoses, motionReady)) urls.push(heroArtUrl(q.hero, key));
    }
    warm(urls);
  };
  const warmEnemies = (): void => {
    const urls: string[] = [];
    for (const e of cs.enemies) {
      const def = enemyById[e.enemyId];
      if (!def) continue;
      const which = `${e.uid}:${def.art === 'daxia' ? 'daxia' : artOfEnemy(e)}`;
      if (warmedEnemies.has(which)) continue;
      warmedEnemies.add(which);
      if (def.art === 'daxia') {
        for (const key of [...Object.values(BOSS_ART), ...BOSS_HURT_ART, ...Object.values(BOSS_MOVE_ART), ...BOSS_MOVE_ART_PHASE.flatMap((t) => Object.values(t))]) if (hasSprite(key)) urls.push(artUrl('sprites', key));
      } else {
        const art = artOfEnemy(e);
        urls.push(monsterUrl(art, 'idle'), monsterUrl(art, 'attack'));
        if (hasMonsterPose(art, 'hurt')) urls.push(monsterUrl(art, 'hurt'));
        if (hasMonsterPose(art, 'block')) urls.push(monsterUrl(art, 'block'));
        // 倒地圖（大魔物與塔主才有）：打死那一刻才現抓的話，牠會先變空白再冒出來
        if (hasMonsterPose(art, 'down')) urls.push(monsterUrl(art, 'down'));
      }
    }
    warm(urls);
  };
  warmHeroes();
  warmEnemies();
  // 開場那一次畫完才開閘，之後的變化才演（低-5）
  window.setTimeout(() => { chipsSeeded = true; }, 0);
  /**
   * 收牌動畫進行中：按下「結束回合」之後、引擎真的跑 `endTurn` 之前的那幾百毫秒。
   *
   * 這段時間畫面上的手牌正往右下角的按鈕飛，但**引擎還停在上一回合**——
   * 這時候讓玩家出牌，牌會從已經飛走的那疊裡被打出來，畫面與引擎就對不上了。
   * 所以 `canAct()` 一律回 false，出牌、忍具、再按一次結束回合全部擋掉。
   */
  let collecting = false;
  /**
   * 上一次畫的飯糰數。出牌是整場最常做的動作，但飯糰原本只是**默默少一顆**，
   * 一整排都沒動靜。這裡認出剛被吃掉的是哪幾顆，讓它們消下去。
   * −1 代表這場還沒畫過，第一次畫不演。
   */
  let lastEnergy = -1;
  /** 這一拍退回來幾顆飯糰（`settle` 算好、下一次畫側欄時消耗掉）。出牌是一次結算完才重畫，
   *  光比前後的顆數看不出「花了又退回來」，所以要靠引擎累計的 `energyGain` 相減 */
  let energyRefund = 0;

  /** 可以操作嗎：分出勝負、還在等玩家選牌、收牌動畫還在跑的時候，出牌／忍具／結束回合都不受理 */
  let enemyTurnRunning = false;   // 魔物正在一隻一隻出手：這段期間不收玩家的操作
  /*
   * **送出去還沒繞回來的那一下**（連線版 2026-09-11）。
   *
   * 客戶端的動作要等主機編號才真的生效，這中間畫面上的狀態還是舊的——
   * 於是「連點兩張牌」會用同一份舊狀態送出兩個動作，第二個到主機時
   * 可能已經不合法（魔物被第一張打倒了、回合收掉了）。
   * 主機那邊現在會回一則「沒算數」而不是判分岔，但玩家看到的是
   * 「我明明點了，牌卻還在手上」。乾脆一次只讓一個動作在路上。
   *
   * 主機自己不受影響：它的動作是同步套用的，`onApplied` 在 `submit` 裡就回來了，
   * 這個鎖等於沒上過。所以不用另外判斷是不是主機。
   */
  let inflight = false;
  /** 保險絲：訊息掉了的話不能讓玩家永遠按不動（正常一個來回 0.1～0.2 秒） */
  let inflightTimer = 0;
  function lockSend(): void {
    inflight = true;
    window.clearTimeout(inflightTimer);
    inflightTimer = window.setTimeout(() => { inflight = false; render(); }, 3000);
  }
  function unlockSend(): void {
    inflight = false;
    window.clearTimeout(inflightTimer);
  }
  app.disposers.push(() => window.clearTimeout(inflightTimer));
  // 連線停了（分岔、斷線）就什麼都不能按：不然點牌會飛出去再彈回來，還把畫面裡那行紅字洗掉（審查 中-3）
  function canAct(): boolean { return !ended && !collecting && !enemyTurnRunning && !inflight && cs.phase === 'player' && !cs.pending && !session?.stopped && !session?.suspended; }

  // ===== 元件 =====

  /**
   * 立繪連同腳下的接地陰影。陰影是一片橢圓漸層，貼在立繪框的底邊——
   * 少了它，去背的角色貼在背景上就是「浮著」，跟站在地上差很多。
   */
  /**
   * 立繪框的尺寸，跟 `combat.css` 的 `.unit.size-* .sprite` 必須一致。
   * 這裡重複一份是刻意的：算「頭頂空多少」不需要量 DOM，用常數算最準——
   * 量 DOM 的版本試過兩次都抓錯時機（節點還沒進畫面、或體型樣式還沒套上），
   * 黃瓜怪量出 136 而正確值是 162。
   */
  const SPRITE_BOX: Record<string, [number, number]> = {
    small: [130, 150], medium: [180, 210], large: [230, 280], player: [270, 300],
    // 師父三個階段的框（跟 combat.css 的 .unit.enemy.master 三條一致，改要一起改）
    master: [320, 320], master1: [340, 340], master2: [350, 350],
    // 個別放寬的框（跟 combat.css 的 [data-id=…] 那條一致）：犰狳寶寶是橫躺的方圖，小框顯得扁、中框又太高
    pup: [150, 150],
    // 鏡中球球要跟主角一樣高（使用者 2026-09-08）：影球球的圖 460×460 主體佔滿，262 的方框畫出來 259 高＝主角站姿
    mirror: [290, 262],   // 框比圖寬 28：圖在框裡往右挪 14 像素（見 combat.css 那條的說明）
  };
  const SPRITE_SIZE_OVERRIDE: Record<string, keyof typeof SPRITE_BOX> = { armadillo_pup: 'pup', mirror_qiuqiu: 'mirror' };

  /**
   * 立繪框是固定高度、圖用 `object-fit: contain` 貼在底部，
   * 所以很扁的魔物（黃瓜怪那種）上面會空一大截，頭上的意圖牌子就飄在半空、
   * 那條短繩根本接不到牠。這裡算出空掉的高度寫成 `--head-gap`，
   * 樣式表用負的 margin 把牌子往下拉，牌子才會真的掛在頭上。
   */
  function spriteBox(src: string, alt: string, size: keyof typeof SPRITE_BOX = 'player',
                     over?: HTMLElement | string): HTMLElement {
    const img = el('img', { class: 'sprite', src, alt }) as HTMLImageElement;
    const [bw, bh] = SPRITE_BOX[size] ?? SPRITE_BOX['medium']!;
    const box = el('div', { class: 'sprite-box' },
      el('div', { class: 'ground-shadow' }),
      img);
    if (over) box.append(over);
    // `--drawn-h`＝圖畫實際佔的高度。圖是貼在框底部的，所以「圖畫頂端」就在這個高度上，
    // 意圖牌子用它當 bottom 就會剛好掛在頭上。算的是常數不是量 DOM：
    // 量 DOM 試過兩次都抓錯時機（節點還沒進畫面、體型樣式還沒套上）。
    const fit = (): void => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const drawn = Math.min(bh, bw * img.naturalHeight / img.naturalWidth);
      box.style.setProperty('--drawn-h', `${Math.round(drawn)}px`);
    };
    // 圖已經在快取裡就直接算（開場會把所有圖預載完，多數情況都是這條）
    if (img.complete) fit(); else img.addEventListener('load', fit, { once: true });
    return box;
  }


  function chip(term: string, iconKey: string | null, value: string, extra = '', bump = false): HTMLElement {
    const node = el('div', { class: `chip ${extra}${bump ? ' up' : ''}`.trim() });
    const url = iconKey ? artUrl('icons', iconKey) : '';
    // 圖示還沒生好就寫名字：一排灰剪影根本認不出誰是誰
    if (url && !isFallback(url)) node.append(el('img', { src: url, alt: term }));
    else node.append(el('b', {}, term));
    if (value) node.append(el('span', {}, value));   // 純標記的牌子（同生共死）沒有數字欄
    attachTooltip(node, term);
    return node;
  }

  /** 飄起來的傷害數字。飄完自己移除，免得留在 DOM 裡等下一次重畫才被掃掉 */

  /** 多段攻擊一下一下演：每段隔 150 毫秒重掛一次挨打動畫、飄那一段的數字、放一聲。被擋成 0 的那段只閃不飄（「擋住 N」另外飄） */
  function stageHits(node: HTMLElement, amounts: number[]): void {
    amounts.forEach((amt, i) => {
      window.setTimeout(() => {
        if (app.cs !== cs || !node.isConnected) return;   // 這期間換了戰鬥或畫面重畫過了，節點已經不在舞台上
        node.classList.remove('hit');
        void node.offsetWidth;   // 強制重排，動畫才會從頭再播一次
        node.classList.add('hit');
        if (amt > 0) {
          // 三個數字都落在同一點會糊成一團（稽核 2026-09-05 夜 中-1）：照序號左右錯開
          const num = floatNum(`-${amt}`);
          num.style.marginLeft = `${Math.round((i - (amounts.length - 1) / 2) * 28)}px`;
          node.append(num);
        }
        burst(node, 'slash');
        sfx(amt >= 12 ? 'hit_heavy' : 'claw', 0.94 + Math.random() * 0.12);
      }, i * 150);
    });
  }
  function floatNum(text: string, cls = ''): HTMLElement {
    const node = el('div', { class: `num${cls ? ' ' + cls : ''}` }, text);
    node.addEventListener('animationend', () => node.remove());
    return node;
  }

  /**
   * 一排狀態牌子。`mine` 是「這排是球球自己的」。
   *
   * 擋傷害這件事兩邊都有，但講法不一樣：球球是「蜷縮」（縮成一球），
   * 魔物就直接叫「防禦」——蜷縮是球球專屬的用詞，套到木樁人身上很怪。
   * 好狀態與壞狀態各給一個底色，一眼看得出這一個是在幫你還是在害你。
   */
  function statusRow(u: Unit, mine = false, who = 'player'): HTMLElement {
    const row = el('div', { class: 'chips' });
    const qi = combatQiValue((u as Partial<PlayerCombat>).hero ?? '', (u as Partial<PlayerCombat>).qi);
    if (qi !== undefined) {
      const node = el('div', { class: 'chip good qi' }, el('b', {}, '蓄氣'), el('span', {}, `${qi}/12`));
      // 「一次花 4 點以上 ×1.3」不再每張牌重寫（使用者 2026-09-24 晚），滑到這個牌子看名詞表那一條
      attachTooltip(node, '蓄氣');
      row.append(node);
    }
    if (u.block > 0) row.append(chip(mine ? '蜷縮' : '防禦', null, String(u.block), 'block'));
    for (const name of STATUS_ORDER) {
      const key = `${who}|${name}`;
      const v = getStatus(u, name);
      if (v <= 0) { lastChips.delete(key); continue; }   // 掉光了就忘掉，下次再掛上算「新的」
      const before = lastChips.get(key);
      const bump = chipsSeeded && (before === undefined || v > before);
      lastChips.set(key, v);
      const tone = GOOD_STATUS.includes(name) ? 'good' : BAD_STATUS.includes(name) ? 'bad' : '';
      // 虛化只有「有／沒有」兩種狀態，層數永遠是 1，寫個 1 出來反而讓人以為還能疊——照「無敵」那樣只寫名字
      // 球球身上的減益（魔物放的翻肚、懶洋洋、炸毛、中毒）用名字寫出來、淺紅底，跟能力牌的牌子一樣看得懂
      //（使用者 2026-09-04：只有小圖示認不出是什麼、也看不出是壞的）
      const textOnly = mine && tone === 'bad';
      row.append(chip(STATUS_LABEL[name] ?? name, textOnly ? null : STATUS_ICON[name], name === '虛化' ? '' : String(v), tone, bump));
    }
    // 「別碰針尖喔」補在針上的毒（`poisonNextAttack`，下一擊命中多給幾層中毒、只到本回合）。
    // 它不是狀態名也沒走 `markPassive`，原本自己那排、同伴那排都沒畫（使用者 2026-09-15：「隊友的下方沒出現這個 BUFF」）。
    // 直接照資料畫：用掉或回合結束資料一清，牌子就跟著掉
    const pna = (u as Partial<PlayerCombat>).poisonNextAttack;
    if (pna) {
      const node = el('div', { class: 'chip good power' }, el('b', {}, '針上有毒'), el('span', {}, String(pna.amount)));
      attachTextTooltip(node, '針上有毒（只到本回合）', `下一次攻擊命中時多給 ${pna.amount} 層中毒${pna.anyDamage ? '（任何造成傷害的招都算）' : ''}，用掉或回合結束就沒了`);
      row.append(node);
    }
    // 便當、回魂香（2026-09-23 第二批）：喝下去當下什麼數字都沒動，要掛牌子才看得出「還在等著」。跟上面那個一樣照資料畫
    const pc = u as Partial<PlayerCombat>;
    if (pc.energyNextTurn) {
      // 便當與影分身卷軸（閃過之後）共用這一個牌子，所以寫結果「下回合飯糰」，不寫是誰給的
      const node = el('div', { class: 'chip good power chip-bento' }, el('b', {}, '下回合飯糰'), el('span', {}, `+${pc.energyNextTurn}`));
      attachTextTooltip(node, '下回合飯糰', `下回合開始時多 ${pc.energyNextTurn} 顆飯糰（便當、影分身卷軸給的）`);
      row.append(node);
    }
    if (pc.guardLethal || pc.guardLethalHold) {
      // 拉住過一次之後換成「打不倒」：這一輪魔物剩下的攻擊都打不死（2026-09-24 b3int），牌子要看得出來，不然會以為香已經沒了
      const node = el('div', { class: 'chip good power chip-guard' }, el('b', {}, guardChipText(pc)));
      attachTextTooltip(node, '回魂香', pc.guardLethalHold ? '這一輪魔物剩下的攻擊都打不死你（最低留 1 點生命）'
        : '這場戰鬥接下來第一次會被打倒時，留下 1 點生命；這個魔物回合剩下的攻擊也打不死你（最低留 1 點）');
      row.append(node);
    }
    // 球球身上生效中的能力牌（封印解除、結界……）：一張一個牌子，疊了幾張寫數字，滑上去看那張牌的效果
    // （使用者 2026-09-03：「爪力的確有加，但我不知道是哪張牌的效果」）
    const powers = mine ? (u as Partial<CombatState['player']>).powers ?? [] : [];
    if (powers.length) {
      // 升級版與基本版分開掛（說明要念對版本，稽核 2026-09-04 H-2）
      const counts = new Map<string, number>();
      for (const pw of powers) if (pw.cardId) { const k = `${pw.cardId}|${pw.upgraded ? 1 : 0}`; counts.set(k, (counts.get(k) ?? 0) + 1); }
      for (const [key, n] of counts) {
        const [cardId, up] = key.split('|');
        const def = cardById[cardId!];
        if (!def) continue;
        const upgraded = up === '1';
        // 牌名照**這排的主人**的角色（連線稽核 中-6）：原本用 `my()`，同伴那格的能力牌照本機角色命名
        const owner = (u as PlayerCombat).hero;
        const name = cardNameFor(def, owner).replace(/^忍術·/, '') + (upgraded ? '＋' : '');
        const node = el('div', { class: 'chip good power' }, el('b', {}, name));
        if (n > 1) node.append(el('span', {}, String(n)));
        attachTextTooltip(node, `${cardNameFor(def, owner)}${upgraded ? '＋' : ''}（能力，這場戰鬥持續生效）`, describeCard(def, upgraded));
        row.append(node);
      }
    }
    // 牌子太多（一堆增益＋一堆能力牌）會疊到四五排、把整隻貓往上頂到頭被切掉（使用者 2026-09-04 要求測的情境）：
    // 超過八個就縮小字與間距、排寬一點，十六個也壓得進三排
    if (mine && row.children.length > 8) row.classList.add('many');
    return row;
  }

  /**
   * 生命條。CSS 上本來就寫了 width 的過場，但每次動作整個畫面重畫、條也是新生的，
   * 新元素的初始值不會觸發過場，所以血量一直是用跳的。
   * 這裡自己記住上一次畫的長度，再用 animate() 從舊值播到新值。
   *
   * 用 animate() 而不是「先設舊值、下一幀改新值」：後者要靠 requestAnimationFrame 補上新值，
   * 分頁切到背景時瀏覽器會把 rAF 停掉，血條就卡在舊值＝顯示錯的血量。
   * animate() 是把元素本身的正確值當底、動畫疊在上面播，動畫被節流也不會顯示錯的數字。
   */
  function hpBar(key: string, hp: number, maxHp: number): HTMLElement {
    const pct = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
    const prev = lastHpPct.get(key) ?? pct;
    lastHpPct.set(key, pct);
    const fill = el('div', { class: 'hpbar-fill', style: `width:${pct}%` });
    if (prev !== pct && typeof fill.animate === 'function') {
      fill.animate([{ width: `${prev}%` }, { width: `${pct}%` }], { duration: 380, easing: 'ease-out' });
    }
    // 掉血時在後面留一條淺色殘影，慢半拍才追上來——一眼看得出「剛剛掉了這麼多」。
    // 只有掉血才留（回血不需要），而且是額外一層，血條本身的數值照舊。
    const ghost = prev > pct
      ? el('div', { class: 'hpbar-ghost', style: `width:${pct}%` })
      : '';
    if (ghost && typeof ghost.animate === 'function') {
      // 前 40% 的時間停在舊長度（讓玩家看清楚掉了多少），之後才追上來
      ghost.animate([
        { width: `${prev}%`, offset: 0 },
        { width: `${prev}%`, offset: 0.4 },
        { width: `${pct}%`, offset: 1 },
      ], { duration: 900, easing: 'ease-in' });
    }
    return el('div', { class: 'hpbar' }, ghost, fill, el('span', {}, `${hp}/${maxHp}`));
  }

  /** 魔物頭上的意圖：攻擊直接算進爪力／懶洋洋／翻肚與蓄力，玩家看到的就是真的會挨幾下 */
  function intentChip(e: EnemyCombat): HTMLElement {
    const m = e.move;
    // 數字照引擎出招的順序預演（總稽核 2026-09-16 乙 中-1）：蓄力只加倍第一下、同一招前面給你的毒／翻肚與給自己的爪力先算進去、
    // 身上沒那個狀態就是撲空（0）。原本各自拿「現在的狀態」算，鏡貓一招學兩張時牌子寫 5、實際打 12
    const pv = previewEnemyHits(e, m.effects, my());
    const dmgOf = (fx: EnemyEffect): number => pv.find((h) => h.fx === fx)?.dmg ?? 0;
    const maxOf = (fx: EnemyEffect): number => pv.find((h) => h.fx === fx)?.dmgMax ?? 0;
    const hits = m.effects.filter(has('damage'));
    const rnd = m.effects.find(has('damageRandom'));
    // 照你身上的毒打（鏡中球球學來的見血封喉那類）：牌子上要寫**算完的數字**，
    // 不然玩家看到「攻 ?」不知道該先解毒還是先疊蜷縮
    const byStatus = m.effects.filter(has('damageByPlayerStatus'));
    const blk = m.effects.find(has('block'));
    const blkAll = m.effects.find(has('blockAllies'));
    const buffAll = m.effects.find(has('statusAllies'));
    const boom = m.effects.find(has('selfDestruct'));
    let text = `${INTENT_GLYPH[m.intent]} ${m.label}`;
    if (getStatus(e, '沉睡') > 0) text = '呼呼大睡';   // 睡著的什麼都不做（2026-09-02 第二波）
    else if (getStatus(e, '定身') > 0) text = '被定住了';   // 定身擋整個動作（2026-09-02）
    else if (boom) text = `攻 ${dmgOf(boom)}（爆）`;
    else if (hits.length) text = `攻 ${hits.map((d) => `${dmgOf(d)}${(d.times ?? 1) > 1 ? `×${d.times}` : ''}${d.pierce ? '（穿透）' : ''}`).join('＋')}`;
    else if (byStatus.length) text = `攻 ${byStatus.map(dmgOf).join('＋')}（照你的${byStatus[0]!.name}）`;
    else if (rnd) text = `攻 ${dmgOf(rnd)}～${maxOf(rnd)}`;
    else if (blk) text = `守 ${computeBlock(blk.amount, e)}`;
    // 盾陣／號令這種給全體的：牌子上也要有數字（使用者 2026-09-03：「有格檔但沒看到格檔值」）
    else if (blkAll) text = `守 ${computeBlock(blkAll.amount, e)}（全體）`;
    else if (buffAll) text = `${INTENT_GLYPH[m.intent]} 全體 +${buffAll.amount} ${buffAll.name}`;
    // 召喚要寫清楚**會來幾隻**（2026-09-11）：只寫「喚小弟」看不出是一隻還兩隻，
    // 而那正是玩家要不要先清場、要不要囤防禦的判準
    else {
      const sum = m.effects.find(has('summon'));
      if (sum) text = `${INTENT_GLYPH[m.intent]} ${m.label}${sum.n > 1 ? ` ${sum.n} 隻` : ''}`;
    }
    // 傷害那一行不能把同一招的其他事吃掉（審查 2026-09-15 中-1／中-2／低-8）：黑貓頭目的「分身」是 8 傷＋召 2 隻、
    // 河童的「拽走小魚乾」是 7 傷＋偷 20、「頂皿蓄水」是守 10＋回 10——牌子只寫「攻 8」「守 10」玩家會誤判
    if (getStatus(e, '沉睡') === 0 && getStatus(e, '定身') === 0) {
      const sum = m.effects.find(has('summon'));
      if (sum && !text.includes('隻')) text += `＋召 ${sum.n} 隻`;
      const steal = m.effects.find(has('stealFish'));
      if (steal) text += `＋偷 ${steal.n}`;
      const heal = m.effects.find(has('heal'));
      if (heal && (hits.length || rnd || blk)) text += `＋回 ${heal.percent ? Math.round(e.maxHp * heal.percent / 100) : heal.n}`;
      // 照著學一動兩張時（二三關），普攻那張會把「照你的毒打」那張蓋掉——兩段都要寫出來
      if (byStatus.length && (hits.length || rnd)) {
        text += `＋${byStatus.map(dmgOf).join('＋')}（照你的${byStatus[0]!.name}）`;
      }
      // 只有「照層數打」＋守（鏡貓學到見血封喉）：主分支只寫了攻，守要補上（推前審查 2026-09-15 中-1）
      if (byStatus.length && blk && !hits.length && !rnd) text += `＋守 ${computeBlock(blk.amount, e)}`;
    }
    if (e.charged && m.intent === 'attack') text += '（蓄力）';
    // 照著學的招：牌子上先寫是哪張牌（回合開始就預告，玩家能應對——使用者 2026-09-08）
    if (m.learned && getStatus(e, '沉睡') === 0 && getStatus(e, '定身') === 0 && !text.includes(m.label)) text = `${m.label}｜${text}`;
    // 看破／破功要寫在牌子上：使用者的朋友囤了十幾層隱身，看牌子只寫「攻 8×2」以為閃得掉，
    // 結果先被拍掉隱身再挨打（2026-09-03 回報）。牌子上先講，滑上去的提示再講細節
    if (getStatus(e, '定身') === 0) {
      if (m.effects.some(has('stripPlayer'))) text += '（看破）';
      if (m.effects.some(has('purgePlayer'))) text += '（破功）';
      // 迷魂香（2026-09-23 第二批）：牌子上的數字照舊（那是牠這一下的力道），但要講明這一下不是打你
      if (isDazed(e) && getStatus(e, '沉睡') === 0 && (hits.length || rnd || boom || byStatus.length)) text += '（迷魂：打同伴）';
    }
    // 換招才翻牌子（第一次看到這隻不算換：開場整排一起翻很吵，而且那時本來就在看牠們的開場白）
    const before = lastIntent.get(e.uid);
    const flip = before !== undefined && before !== text;
    lastIntent.set(e.uid, text);
    const node = el('div', { class: `intent i-${m.intent}${flip ? ' changed' : ''}` });
    /*
     * **「穿透」要標出來**（2026-09-14 使用者以為虛無貓有 bug：「她的攻擊都會無視我的蜷縮」）。
     *
     * 那不是 bug——虛無貓的「吞噬」資料裡就寫著 `pierce`，而且滑上去的說明也講了
     *「穿透：蜷縮擋不住，隱身閃得掉」。問題是**打架的時候沒人會去滑**，
     * 而牌子上原本只縮寫成「（穿）」，跟旁邊的數字同一個顏色同一個大小，一眼看過去就漏掉了。
     * 玩家照常疊蜷縮，然後一次吃滿 44 點，當然覺得是 bug。
     * 改成寫全「（穿透）」（也才對得上詞彙表的條目），再標紅。
     */
    for (const part of text.split(/(（穿透）)/)) {
      if (!part) continue;
      node.append(part === '（穿透）' ? el('span', { class: 'pierce' }, part) : part);
    }
    // 牌子上只寫得下「攻 4」這種短標籤，滑上去才講得完牠這一下實際會做什麼
    attachTextTooltip(node, m.label, describeMove(e));
    return node;
  }

  /**
   * 魔物這一拍要做什麼，寫成一句話給提示框用。
   * 數字跟牌子上一樣是**算完的**（吃過爪力、懶洋洋、你的翻肚與蓄力），玩家看到的就是真的會挨幾下。
   */
  function describeMove(e: EnemyCombat): string {
    const m = e.move;
    if (getStatus(e, '沉睡') > 0) return `睡著了，這回合什麼都不會做。再睡 ${getStatus(e, '沉睡')} 回合；打痛牠會提早醒，而且醒來會很生氣。`;
    if (getStatus(e, '定身') > 0) return '被定住了，這回合什麼都做不了。';
    // 數字跟牌子同一份預演（`previewEnemyHits`，總稽核 2026-09-16 乙 中-1）
    const pv = previewEnemyHits(e, m.effects, my());
    const hitOf = (f: EnemyEffect) => pv.find((h) => h.fx === f);
    const parts: string[] = [];
    for (const fx of m.effects) {
      switch (fx.kind) {
        case 'damage': {
          const n = hitOf(fx)?.dmg ?? 0;
          parts.push(((fx.times ?? 1) > 1 ? `造成 ${n} 點傷害，連打 ${fx.times} 次` : `造成 ${n} 點傷害`) + (fx.pierce ? '（穿透：蜷縮擋不住，隱身閃得掉）' : ''));
          break;
        }
        case 'damageRandom':
          parts.push(`造成 ${hitOf(fx)?.dmg ?? 0}～${hitOf(fx)?.dmgMax ?? 0} 點傷害`);
          break;
        case 'damageByPlayerStatus': {
          // 數字是**算完的**（出手那一刻的層數 × 倍率再吃爪力／懶洋洋／翻肚與蓄力；同一招前面先給你的毒也算進去），跟牌子上那個一樣
          const h = hitOf(fx);
          const n = h?.stacks ?? 0;
          parts.push(n > 0
            ? `照你身上的${fx.name}層數打：出手時 ${n} 層${(fx.mul ?? 1) > 1 ? ` × ${fx.mul} 倍` : ''}＝造成 ${h?.dmg ?? 0} 點傷害`
              + (fx.consume ? `，打完把你的${fx.name}清掉` : '')
            : `照你身上的${fx.name}層數打：你身上沒有${fx.name}，打你這一下會撲空`);
          break;
        }
        case 'block': parts.push(`自己獲得 ${computeBlock(fx.amount, e)} 點防禦`); break;
        case 'statusPlayer':
          // 定身沒有量詞（「給你 1 定身」讀不通）：直接講後果
          if (fx.name === '定身') parts.push('把你定住：這回合打不出攻擊牌');
          else parts.push(`給你 ${fx.amount} ${STATUS_UNIT[fx.name] ?? ''}${fx.name}`);
          break;
        case 'statusSelf': parts.push(`自己獲得 ${fx.amount} ${STATUS_UNIT[fx.name] ?? ''}${fx.name}`); break;
        case 'chargeNext': parts.push('蓄力：下一次攻擊傷害加倍'); break;
        case 'copyPlayerStatus': parts.push(`照著學：把你身上的${fx.names.join('、')}抄一份過去`); break;
        case 'stripPlayer': parts.push(`看破：把你身上的${fx.names.join('、')}拍掉一半`); break;
        case 'purgePlayer': parts.push(`破功：把你身上的${fx.names.join('、')}各拍散一半`); break;
        case 'summon': parts.push('叫來幫手'); break;
        case 'heal': parts.push(`自己回復 ${fx.n} 點生命`); break;
        case 'stealFish': parts.push(`偷走你 ${fx.n} 條小魚乾`); break;
        case 'discardRandomHand': parts.push(`讓你下回合少抽 ${fx.n} 張牌`); break;
        case 'escape': parts.push('逃走'); break;
        // ---- 2026-09-02 第二波魔物的四個新效果 ----
        case 'selfDestruct': parts.push(`自爆：造成 ${hitOf(fx)?.dmg ?? 0} 點傷害，然後牠自己也倒下`); break;
        case 'statusAllies': parts.push(`全體魔物獲得 ${fx.amount} ${STATUS_UNIT[fx.name] ?? '點'}${fx.name}`); break;
        case 'blockAllies': parts.push(`全體魔物獲得 ${fx.amount} 點防禦`); break;
        case 'giveCard': parts.push(`把 ${fx.n} 張「${nameFor(my().hero, fx.cardId)}」塞進你的${fx.to === 'discard' ? '棄牌堆' : '抽牌堆'}`); break;
        case 'nothing': parts.push('發呆，什麼都不做'); break;
        // 漏接新的 EnemyEffect 種類會在型別檢查就爆——魔物做得到的事，提示框一定要講得出來
        default: { const _never: never = fx; void _never; break; }
      }
    }
    const body = parts.length ? parts.join('，') : '看不出來要做什麼';
    // 迷魂香（2026-09-23 第二批）：上面那些數字是牠這一下的力道，但這一輪會打在牠旁邊的同伴身上
    const daze = isDazed(e) ? `迷魂了：這一輪的攻擊改打${dazeTarget(cs, e)?.name ?? '空氣（旁邊沒有同伴）'}，不打你。` : '';
    return daze + (e.charged && m.intent === 'attack' ? `${body}（已蓄力，傷害已經算進去了）。` : `${body}。`);
  }

  /**
   * 魔物的立繪。塔主的 art 是沒有編號的 'daxia'，九種姿勢各自一張（戰敗＞剛使出的招式＞該階段待機）；
   * 其餘魔物只有待機與攻擊兩張，出手的那一拍換成攻擊圖。
   */
  function enemySprite(e: EnemyCombat, def: EnemyDef | undefined): string {
    const held = motionHeldSprites.get(e.uid);
    if (held) return held;
    const act = acting.get(e.uid);
    if (def?.art === 'daxia') {
      // 倒下：第三階段（他實際上都是這時倒的）用真面目跪倒、鬼火熄滅那張；沒生好時退回第一階段的承讓
      if (e.dead) return artUrl('sprites', e.phase >= 2 && hasSprite(BOSS_ART.defeat3) ? BOSS_ART.defeat3 : BOSS_DEFEAT);
      // 調息中（血條打光那一刻就開始，無敵一回合）就畫打坐圖。原本只有「他自己出招那一拍」才查招式圖，
      // 結果血一打光他站著換成新階段的待機圖、牌子跟紀錄卻都說他蹲下了，要等你結束回合輪到他才真的蹲
      //（使用者 2026-09-08：「換階段調息時他還是站著」）。引擎的 invulnIn 就是「調息中」，直接看它
      if (e.invulnIn > 0) return artUrl('sprites', bossMovePose(e.phase, '蹲下調息') ?? bossIdle(e.phase));
      // 出招圖排在挨打圖前面，跟一般魔物同一個順序（稽核 2026-09-08 中 1）：他出招那一拍常常同時掉血——
      // 回合開頭的中毒結算、球球的反彈都在同一步扣他的血——挨打圖若優先，中毒流打他每回合都是
      // 「挨打的表情往前撲」，招式圖全看不到
      if (act) return artUrl('sprites', bossMovePose(e.phase, act.label) ?? bossIdle(e.phase));
      // 挨打圖（2026-09-08）：一般魔物早就有，師父以前只有紅閃
      const hurt = BOSS_HURT_ART[Math.min(e.phase, 2)];
      if (hurtSet.has(e.uid) && hurt && hasSprite(hurt)) return artUrl('sprites', hurt);
      return artUrl('sprites', bossIdle(e.phase));
    }
    if (!def) return monsterUrl('', 'idle');
    const art = artOfEnemy(e);
    // 順序（出招 → 挨打 → 防禦 → 待機）與理由都在 `monsterpose.ts`，那邊有測試釘著
    return monsterUrl(art, monsterPose({
      attacking: !!act?.attacked, hurt: hurtSet.has(e.uid), dead: e.dead, block: e.block,
      /**
       * 這一拍的防禦是不是**被動長出來的**（稽核 2026-09-10 中-1 的修正）。
       *
       * 第一版寫成「身上有鱗甲或不壞身就一律不畫」，太寬了——鱗甲怪很多同時有主動的防禦招
       *（鎧甲獨角仙的磨甲、鐵羅漢的金剛立、守護石像的石化凝視⋯⋯九隻，其中三隻是塔主），
       * 而且塔主前綴「披甲的」會給任何塔主鱗甲 2，中了那場的防禦圖整場都看不到。
       * 改成看**這一拍出的是不是防禦招**：牠真的擋了就畫，只是被動長的就不畫。
       */
      passiveBlock: !acting.get(e.uid)?.blocked && (getStatus(e, '鱗甲') > 0 || getStatus(e, '不壞身') > 0),
      has: (pose) => hasMonsterPose(art, pose),
    }));
  }

  /**
   * 這隻魔物要用哪一組立繪。**鏡子照的是誰就長誰的樣子**（2026-09-15）：
   * 玩菲菲時，鏡中球球那隻換成影菲菲那組（名字與開場白在引擎那邊換，見 `content/enemies.ts`）。
   * 看的是座位 0 的角色（鏡子抄的就是那一位的牌組），不是本機這一位。
   */
  /** 這一隻現在該用哪組立繪：先照角色變裝（鏡中球球），再照牠打到第幾階段（見 `monsterPhaseKey`） */
  function artOfEnemy(e: EnemyCombat): string {
    return monsterPhaseKey(enemyArtFor(e.enemyId, cs.player.hero), e.phase ?? 0);
  }

  /** 狀態牌子、意圖牌、飛在天上照這組畫：丟出去的東西還在飛時是出手前的狀態與防禦（2026-09-23 polish 第 3 條，見 motionPendingStatus） */
  function shownEnemy(e: EnemyCombat): EnemyCombat {
    // 最早那一趟出手前的樣子（連丟兩張時第一趟還沒到，第二趟的效果更不能先亮）
    const pending = motionPendingStatus.get(e.uid)?.[0];
    return pending ? { ...e, statuses: pending.statuses, block: pending.block } : e;
  }

  /** 魔物腳下那一排牌子（狀態＋引擎裡看不到的被動）。抽出來是為了東西飛到時只換這一排（見 refreshEnemyStatus） */
  function enemyChips(e: EnemyCombat, def: EnemyDef | undefined, reviving: boolean): HTMLElement {
    const row = statusRow(shownEnemy(e), false, `e${e.uid}`);
    // 引擎裡玩家看不到的狀態，全部做成牌子掛出來（滑上去有白話說明）——
    // 「機制是對的但畫面沒講」已經連續中招三次：隱身閃避、蜷縮延遲、影子復活
    if (!e.dead) {
      if (def?.onDeathHealPlayer) row.prepend(chip('打倒回血', null, String(def.onDeathHealPlayer), 'good'));
      if (def?.strengthEveryNTurns) {
        const left = def.strengthEveryNTurns - (e.turnCount % def.strengthEveryNTurns);
        row.prepend(chip('越戰越勇', null, String(left), 'bad'));
      }
      if (e.stolen > 0) row.prepend(chip('叼著小魚乾', null, String(e.stolen), 'bad'));
      if (e.charged) row.prepend(chip('蓄力', null, '', 'bad'));
      if (e.invulnIn > 0) row.prepend(chip('無敵', null, '', 'bad'));
      if (def?.reviveGroup && !def.neverRevive) row.prepend(chip('同生共死', null, '', 'bad'));   // 蛙大名自己倒了就倒了，不掛這塊牌
      // 僕從護體（波斯大小姐）：還有同伴站著就打不動她——照慣例把隱藏規則掛成牌子
      if (def?.guardedByAllies && cs.enemies.some((o) => o !== e && !o.dead)) row.prepend(chip('僕從護體', null, '', 'bad'));
      // 第二波魔物的三個被動（2026-09-02）。狀態型的（縮殼、飛行、鱗甲、沉睡、消散）自己就是狀態牌子，
      // 這三個沒有層數可掛，所以照「僕從護體」那一套做成小牌
      if (def?.splitInto && !e.split) row.prepend(chip('分裂', null, '', 'bad'));
      if (def?.hexOnSkill) row.prepend(chip('詛咒', null, '', 'bad'));
      if (def?.angerOnSkill) row.prepend(chip('憤怒', null, String(def.angerOnSkill), 'bad'));
    }
    if (reviving) row.prepend(chip('重生中', null, String(e.reviveIn), 'bad'));
    // 魔氣暴走：第 10 回合（關主戰第 15 回合）起掛在每隻魔物身上，提醒拖下去每回合都會更痛
    if (!e.dead && cs.turn >= rampageTurnFor(cs)) row.prepend(chip('魔氣暴走', null, '', 'bad'));
    return row;
  }

  /** 只換這一隻的狀態牌子、意圖牌、飛在天上（整隻重建會把受擊、倒下那些演出一起打斷） */
  function refreshEnemyStatus(node: HTMLElement, e: EnemyCombat): void {
    const reviving = e.dead && e.reviveIn > 0 && willRevive(cs, e);
    const shown = shownEnemy(e);
    node.querySelector(':scope > .chips')?.replaceWith(enemyChips(e, enemyById[e.enemyId], reviving));
    if (!reviving) node.querySelector('.sprite-box > .intent')?.replaceWith(intentChip(shown));
    // 打掉飛行的那一下：東西打到才掉下來（跟 enemyUnit 同一個判準）。虛化只在魔物自己的回合變，不用跟
    node.classList.toggle('airborne', !e.dead && getStatus(shown, '飛行') > 0);
  }

  function enemyUnit(e: EnemyCombat, i: number, n: number): HTMLElement {
    const def = enemyById[e.enemyId];
    const left = enemyLeft(i, n);   // 算式在 `enemylayout.ts`，有測試釘著（曾經算到畫面外）
    const cls = ['unit', 'enemy', `size-${def?.size ?? 'medium'}`];
    // 關主的待機呼吸慢一點、睡著的冒 Zzz（使用者 2026-09-04：待機差異只做關主）
    const bossUnit = def?.pool === '塔主' && encounterById[cs.encounterId]?.pool === '塔主';
    if (bossUnit) cls.push('boss');
    if (bossUnit && getStatus(e, '沉睡') > 0) cls.push('asleep');
    // 「重生中」的不藏起來：倒下但同伴還在，畫成半透明的殘影＋倒數牌子，
    // 玩家才知道牠會爬回來、還剩幾回合可以清場（本來直接隱形，看起來像打完了）
    const reviving = e.dead && e.reviveIn > 0 && willRevive(cs, e);   // 判準與引擎共用，不再自己抄一份
    // 關主被打倒：不是直接消失，而是慢慢倒下（收尾節奏，使用者 2026-09-04）
    if (e.dead && !reviving) {
      cls.push(bossFallUids.has(e.uid) ? 'boss-fall' : 'gone');
      if (fallingUids.has(e.uid)) cls.push('falling');   // 還在等倒下：這段期間要看得見（低-6）
      /**
       * 這一隻有倒地圖（趴平、眼睛變叉）——16 隻大魔物與 10 隻塔主有，一般小怪沒有。
       * `monsterpose.ts` 已經把圖換過去了，這個類別是給**動畫**看的：
       * `boss-fall` 原本是「站著往前傾倒」（往下 46 像素、轉 −16 度），
       * 套在一張已經趴著的圖上會變成屍體躺在地上打轉。見 combat.css。
       */
      if (def && hasMonsterPose(artOfEnemy(e), 'down')) cls.push('downed');
    }
    /**
     * 重生中的殘影也掛 `downed`（稽核 2026-09-11 低-1）：`monsterPose` 只看 `dead`，
     * 所以殘影早就在用倒地圖了，但影子與意圖牌子那幾條規則靠這個類別才吃得到——
     * 不掛的話會是「趴著的半透明身體＋一團縮在肚子底下的窄影子＋飄在半空的意圖牌」。
     * **只掛類別、不掛 `dead`**：`dissolve-down` 要 `.downed.dead` 才觸發，殘影不該被溶掉。
     * 這是真的會遇到的畫面——鬼將（大魔物，有倒地圖）帶 `reviveGroup`，小鬼還活著時牠會爬起來。
     */
    if (reviving && def && hasMonsterPose(artOfEnemy(e), 'down')) cls.push('downed');
    if (reviving) cls.push('reviving');
    // 師父換了條血，整隻套上該階段的光暈（走火入魔紅、真面目紫），跟立繪一起讓人一眼看出換階段了
    // 師父本人（art 'daxia'）掛 master：框開得比球球大（使用者 2026-09-02：「師傅體型比球球小」），換血條再放大
    if (def?.art === 'daxia') { cls.push('master'); if (e.phase > 0) cls.push(`phase-${e.phase}`); if (!e.dead && e.invulnIn > 0) cls.push('secluding'); }
    // 飛在天上的魔物離地浮起來（使用者 2026-09-07：「讓他能上來一點才有飛行感」）。
    // 看的是**當下的飛行層數**不是牌表上的初始值：打中幾下把牠打下來時，畫面會跟著落地，
    // 玩家一眼看得出「打下來了」，跟「攻擊只打得到一半」那條機制對得上
    // 丟出去的東西還在飛時照出手前的層數（shownEnemy）：不然東西還沒打到，牠就先掉下來了（2026-09-23 polish 第 3 條）
    if (!e.dead && getStatus(shownEnemy(e), '飛行') > 0) cls.push('airborne');
    // 虛化的本體半透明（使用者 2026-09-14 深夜：「第三層有虛化的怪物不明顯」）。
    // 原本只有狀態列一顆小圖示，立繪一點都沒變，玩家看不出這回合打下去每下只扣 1。
    // 看的是**當下**的虛化層數：牠實體化那一拍類別拿掉、立繪立刻變回實心，輸出窗口一眼看得到
    if (!e.dead && getStatus(e, '虛化') > 0) cls.push('phased');
    if (targeting && !e.dead) cls.push('targetable');
    // 意圖牌子放進立繪框裡（不是當它的兄弟節點）：框裡才有「圖畫實際佔多高」這個座標，
    // 牌子用絕對定位掛在圖畫頂端，扁的魔物才不會讓牌子飄在半空。
    // 放在外面用負邊界試過兩次都不準——那個排版下負邊界只挪了 15 像素而不是 130。
    const row = enemyChips(e, def, reviving);
    const node = el('div', { class: cls.join(' '), 'data-uid': String(e.uid), 'data-id': e.enemyId, style: `left:${left}px` },
      spriteBox(enemySprite(e, def), e.name,
        def?.art === 'daxia' ? (e.phase >= 2 ? 'master2' : e.phase === 1 ? 'master1' : 'master') : (SPRITE_SIZE_OVERRIDE[e.enemyId] ?? def?.size ?? 'medium'),
        reviving ? undefined : intentChip(shownEnemy(e))),
      el('div', { class: 'name' }, e.name),
      hpBar(`e${e.uid}`, e.hp + (motionPendingDamage.get(e.uid) ?? 0), e.maxHp),
      row);
    // 照著學的那一拍（鏡中球球）：他身旁亮出剛打的那幾張牌面，讓玩家看到「他打了哪張」（使用者 2026-09-08）。
    // 跟出招同一拍亮、收姿勢那一拍一起拿掉（見 hold），不另外加時間
    const learned = acting.get(e.uid)?.learned;
    if (learned?.length) {
      const cardsEl = el('div', { class: 'learned' });
      /*
       * 用牌的實例畫（帶升級旗標），亮出來的才是他真的打的那個版本（稽核 2026-09-08 中-2）。
       * 圖與牌名用**鏡子照的那一位**（座位 0）的版本（2026-09-15，跟牌子上那行標籤同一條規矩）：
       * 連線時我是球球、對面是菲菲的話，鏡子抄的是她的牌，牌子上寫「絕學·連珠針」，
       * 亮出來的牌面卻會是球球的畫與「絕學·貓爪抓」——同一張牌兩個名字，正是 2026-09-12 修過的那個毛病。
       */
      for (const c of learned) if (cardById[c.cardId]) cardsEl.append(cardNode({ uid: 0, cardId: c.cardId, upgraded: c.upgraded }, { small: true, ...(cs.player.hero ? { hero: cs.player.hero } : {}) }));
      node.querySelector('.sprite-box')?.append(cardsEl);
    }
    const picture = node.querySelector<HTMLElement>('.sprite-box');
    if (picture) mountEnemyMotion(e, picture);
    // 點的當下才看在不在選目標：選目標改成就地修補（`patchTargeting` 只換 `targetable` 類別），
    // 節點不會為了開始選目標而重建，監聽得先掛好（2026-09-23 效能）
    node.addEventListener('click', () => { if (targeting && !e.dead) pickTarget(e.uid); });
    return node;
  }

  function sidePanel(): HTMLElement {
    const p = my();
    const energy = el('div', { class: 'energy' });
    for (let i = 0; i < Math.max(p.maxEnergy, p.energy); i++) {
      const url = artUrl('icons', i < p.energy ? 'icon/onigiri_full' : 'icon/onigiri_empty');
      // 剛被吃掉的那幾顆（在新的顆數之後、舊的顆數之內）縮一下再變空的
      const eaten = lastEnergy > p.energy && i >= p.energy && i < lastEnergy ? ' eaten' : '';
      /**
       * 剛**補回來**的那幾顆（在舊的顆數之後、新的顆數之內）跳回來、亮一下。
       *
       * 本來只演「吃掉」不演「回來」，所以追擊打死怪退兩顆飯糰是無聲補上的——
       * 使用者 2026-09-10 就是因為看不到才回報「追擊沒退飯糰，有 BUG」（引擎其實是對的）。
       * 回合開始整排補滿也走這條，等於多一個「新回合」的節拍；一顆差 60 毫秒，不是整排一起跳。
       * `lastEnergy < 0` 是「這場的第一次重畫」，那時不能演，不然開場三顆會無緣無故跳一次。
       */
      // 兩種都算「補回來」：①顆數真的變多（回合開始補滿）②這一拍退過飯糰（追擊打死怪，顆數可能沒變）
      const grew = lastEnergy >= 0 && lastEnergy < p.energy && i >= lastEnergy && i < p.energy;
      const back = energyRefund > 0 && i >= p.energy - energyRefund && i < p.energy;
      const refill = grew || back ? ' refill' : '';
      // 飯糰圖還沒生好就畫一顆圓點，至少數得出來剩幾顆
      const pip = isFallback(url)
        ? el('div', { class: `pip${i < p.energy ? ' full' : ''}${eaten}${refill}` })
        : el('img', { class: `onigiri${eaten}${refill}`, src: url, alt: '' });
      if (refill) pip.style.animationDelay = `${Math.max(0, i - (back ? p.energy - energyRefund : lastEnergy)) * 60}ms`;
      energy.append(pip);
    }
    lastEnergy = p.energy;
    energyRefund = 0;   // 演過就清掉，下次重畫不會再演一次
    energy.append(el('span', {}, `${p.energy}/${p.maxEnergy}`));
    attachTooltip(energy, '飯糰');

    const potions = el('div', { class: 'potions' });
    // 格數隨難度與忍具袋變；跟狀態列同一套：至少畫 3 格，宗師起少掉的那格畫成鎖住（稽核 2026-09-06 介面 中-2）
    // 格數與內容都是**我這一位**的（稽核 2026-09-14 高-3）：原本讀 `cs.potions`＝座位 0，客戶端看到、點到的都是主機的忍具
    const cap = potionCapacity(run, mySeat);
    for (let i = 0; i < Math.max(cap, 3); i++) {
      const locked = i >= cap;
      const id = locked ? undefined : p.potions[i];
      const def = id ? potionById[id] : undefined;
      const slot = el('div', { class: `potion${def ? '' : locked ? ' locked' : ' empty'}` }, locked ? '🔒' : '');
      if (locked) attachTextTooltip(slot, '這一格鎖住了', '宗師以上只能帶兩支忍具；拿到忍具袋或九命鈴會多出格子。');
      // 提示只掛在有忍具或鎖住的格子上：空格跳出一個沒內容的框，反而讓人以為那格有東西。
      if (id && def) {
        const url = artUrl('icons', def.art);
        slot.append(isFallback(url) ? el('b', {}, def.name) : el('img', { src: url, alt: def.name }));
        // 這格是戰鬥中唯一能查忍具做什麼的地方，用瀏覽器原生的 `title` 要停住一秒才跳、
        // 長相又跟旁邊的飯糰、連抓提示不同款，玩家等不到就以為沒說明。改掛遊戲自己的提示框。
        /**
         * 有使用條件的（起死回生丹：生命低於三成才准用）要**看得出來為什麼用不了**。
         * 條件本身寫在忍具資料上、引擎與畫面共用同一支（`potionBlockedReason`，內含 `PotionDef.usable`）——
         * 兩邊各寫一套遲早會走鐘，罐頭鋪的「買不起」踩過這個坑。
         * 點下去沒反應是最糟的：格子變灰、說明多一行原因，玩家才知道是「還不能用」不是「壞了」。
         * 集中精神之後的飯糰類忍具也走這裡（2026-09-23 稽核 引擎 低-1）。
         */
        const blocked = potionBlockedReason(p, def);
        const ready = blocked === null;
        attachTextTooltip(slot, def.name, ready ? def.text : `${def.text}
（${blocked}）`);
        if (!ready) slot.classList.add('not-ready');
        // 連線舉手等對方時不能用（引擎擋著）：不掛「可點」，免得點下去沒反應（夜間審查 低-5）
        if (canAct() && ready && !p.ready) { slot.classList.add('usable'); slot.addEventListener('click', () => onPotion(id)); }
      }
      potions.append(slot);
    }

    const combo = el('span', {}, `連抓 ${p.cardsPlayedThisTurn}`);
    attachTooltip(combo, '連抓');
    const piles = el('div', { class: 'piles' },
      el('span', {}, `第 ${cs.turn} 回合`),
      // 這一行同時是「牌堆在哪」的座標：新發的牌就是從這裡飛出來的（見 dealFrom）
      // 三個牌堆都點得開（使用者 2026-09-03：「戰鬥中我看不到我的抽牌堆跟棄牌堆」）：
      // 抽牌堆照名字排序，不洩漏真正的順序；棄牌堆、消耗堆照丟進去的順序
      // 排序用的名字也要過 `cardNameFor`：不然菲菲看到的排列跟她看到的牌名對不起來
      pileBtn('pile-draw', `抽牌 ${p.drawPile.length}`, '抽牌堆',
        () => [...p.drawPile].sort((x, y) => nameFor(p.hero, x.cardId).localeCompare(nameFor(p.hero, y.cardId), 'zh-Hant'))),
      pileBtn('pile-discard', `棄牌 ${p.discardPile.length}`, '棄牌堆', () => p.discardPile),
      pileBtn('pile-exhaust', `消耗 ${p.exhaustPile.length}`, '消耗堆', () => p.exhaustPile),
      combo);
    return el('div', { class: 'side' }, energy, potions, piles);
  }

  /** 牌堆計數器：點一下翻開來看（只是看看，不能挑） */
  function pileBtn(cls: string, label: string, title: string, cards: () => CardInstance[]): HTMLElement {
    const node = el('span', { class: `${cls} pile-btn`, title: `點一下看${title}` }, label);
    node.addEventListener('click', () => {
      const list = cards();
      showDeckPicker({ title: `${title}（${list.length} 張）`, cards: list, pickable: false, cancellable: true, onPick: () => { /* 只是看看 */ } });
    });
    return node;
  }

  /** 手牌那支「拿在手上會晃」的循環動畫（`card-idle`）。找不到回 undefined */
  function idleAnimOf(node: HTMLElement): Animation | undefined {
    if (typeof node.getAnimations !== 'function') return undefined;
    return node.getAnimations().find((a) => (a as Animation & { animationName?: string }).animationName === 'card-idle');
  }
  /** 晃動動畫現在跑到第幾毫秒；量不到就回 null（拿它當「不用還原」的訊號） */
  function idleTimeOf(node: HTMLElement): number | null {
    const t = idleAnimOf(node)?.currentTime;
    return typeof t === 'number' ? t : null;
  }

  /**
   * 重畫前每張手牌（依 uid）的版面位置、行內扇形、起伏跑到週期的哪裡（扣掉自己的延遲）；給 `slideHand` 接。
   * 還在滑的牌（上一次重畫才不到 180 毫秒：連出兩張、出完牌同伴馬上動作）記它**現在看起來**的樣子
   *（補間中的 `transform`，含還沒滑完的那段位移），不記終點——不然它先跳到終點再滑一次（推前稽核 2026-09-24 低-4）
   */
  type HandWas = Map<string, { x: number; y: number; tf: string; idle: number | null; sliding: boolean }>;
  function handSnap(): HandWas {
    const was: HandWas = new Map();
    for (const n of root.querySelectorAll<HTMLElement>('.hand .card[data-uid]')) {
      const t = idleTimeOf(n);
      const sliding = n.classList.contains('sliding');
      was.set(n.dataset['uid']!, { x: n.offsetLeft, y: n.offsetTop, tf: sliding ? getComputedStyle(n).transform : n.style.transform,
        idle: t === null ? null : t - Number(idleAnimOf(n)?.effect?.getTiming().delay ?? 0), sliding });
    }
    return was;
  }
  /**
   * 整頁重畫之後，還在手上的牌**從舊位置滑到新位置**、起伏接著晃（畫面抖動稽核 2026-09-24 第 3 項）。
   *
   * 出一張牌整手重建，剩下的牌原本一格就跳到新的扇形位置（最多 111 像素），起伏也從頭晃。
   * 位置差用 `offsetLeft`／`offsetTop`（版面座標，不吃 transform 與舞台縮放）。補間動的是 `transform`：
   * 起點＝「平移那段差＋舊的扇形」、終點＝「平移 0＋新的扇形」，兩端函式清單一樣，角度與下沉跟著轉過去；
   * 終點就是行內那個值，播完交還行內樣式不會跳。起伏（`card-idle`）動的是獨立屬性 `translate`／`rotate`，
   * 跟 `transform` 疊加、不打架；滑過去那條（`:hover` 的 `!important`）照樣蓋過補間。
   * 起伏的進度加回新節點自己的延遲再接：重畫後排第幾張變了，`nth-child` 錯開的延遲也跟著變。
   */
  function slideHand(was: HandWas): void {
    // 先把每張牌的新位置全部量完、再一起寫：量一張寫一張會逼瀏覽器每張都重算一次樣式（程式碼稽核 2026-09-24 低-2）
    const nodes = [...root.querySelectorAll<HTMLElement>('.hand .card[data-uid]')];
    // 同一批牌、同一個順序、也沒有還在滑的（敵人回合、同伴動作的重畫）：扇形位置只看第幾張、共幾張，一定沒動，
    // 不去量位置，省掉一次逼瀏覽器當場排版，只接回起伏（推前稽核 2026-09-24 低-5）
    const before = [...was.keys()];
    const same = nodes.length === before.length && nodes.every((n, i) => n.dataset['uid'] === before[i])
      && ![...was.values()].some((w) => w.sliding);
    const todo = nodes.flatMap((n) => {
      const w = was.get(n.dataset['uid']!);
      if (!w) return [];
      return [same ? { n, w, dx: 0, dy: 0, tf: n.style.transform } : { n, w, dx: w.x - n.offsetLeft, dy: w.y - n.offsetTop, tf: n.style.transform }];
    });
    // 作業系統設了「減少動態效果」就不滑，直接定位（同 `@media (prefers-reduced-motion: reduce)` 那幾塊）
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const { n, w, dx, dy, tf } of todo) {
      const idle = idleAnimOf(n);
      if (idle && w.idle !== null) idle.currentTime = w.idle + Number(idle.effect?.getTiming().delay ?? 0);
      if (!still && (dx || dy || w.tf !== tf) && typeof n.animate === 'function') {
        const a = n.animate([{ transform: `translate(${dx}px, ${dy}px) ${w.tf}` }, { transform: `translate(0px, 0px) ${tf}` }], { duration: 180, easing: 'ease-out' });
        // 滑的這 180 毫秒不套「滑過抬起」：那條是 `!important`，會蓋掉補間，游標底下那張一格就跳到終點抬起來（畫面稽核重量 2026-09-24）。
        // 滑完拿掉，抬起照原本 0.12 秒的過渡走
        n.classList.add('sliding');
        a.onfinish = a.oncancel = () => n.classList.remove('sliding');
      }
    }
  }

  function handRow(): HTMLElement {
    const p = my();
    const n = p.hand.length;
    const hand = el('div', { class: 'hand' });
    // 手牌越多疊越緊：145 是一張小牌的實寬，860 是手牌區的寬
    const step = n > 1 ? Math.min(152, (860 - 145) / (n - 1)) : 152;
    const mid = (n - 1) / 2;
    // 扇形的角度與下沉量也要跟著收：滿手 10 張還照 3.2 度散開的話，最外側兩張的下緣會掉出舞台
    const spread = n > 7 ? 2.2 : 3.2;
    const lift = n > 7 ? 3 : 5;
    p.hand.forEach((c, i) => {
      const st = cardStats(c);
      // 要指定目標的牌先拿第一隻活著的魔物去問，不然一定會卡在「要選一隻魔物」
      const chk = canPlay(cs, c.uid, st.def.target === 'enemy' ? aliveEnemies(cs)[0]?.uid : undefined, mySeat);
      const node = cardNode(c, {
        small: true,
        plays: cs.cardPlays?.[c.uid] ?? 0,
        selected: targeting?.kind === 'card' && targeting.uid === c.uid,
        disabled: !canAct() || !chk.ok,
        onClick: () => onCard(c.uid),
      });
      node.style.transform = `rotate(${((i - mid) * spread).toFixed(2)}deg) translateY(${(Math.abs(i - mid) * lift).toFixed(0)}px)`;
      node.style.margin = `0 ${((step - 145) / 2).toFixed(1)}px`;
      node.style.zIndex = String(i + 1);
      // 不用指定目標的牌（範圍攻擊、打全體）：滑到牌上就先標出每一隻會扣多少，移開收掉（`damagePreview`）。
      // 要瞄準的牌等箭頭吸附到魔物才算；正在瞄準別張時不搶
      if (chk.ok && canAct() && st.def.target !== 'enemy') {
        node.addEventListener('mouseenter', () => { if (!targeting) damagePreview(c.uid); });
        node.addEventListener('mouseleave', () => { if (!targeting) damagePreview(null); });
      }
      // 打不出來的原因直接用引擎給的字串，畫面不要自己再寫一套。
      // 用遊戲自己的說明框而不是瀏覽器原生的 `title`：原生的要停一秒才出現、樣式也不同
      if (!chk.ok) {
        attachTextTooltip(node, '這張打不出來', chk.reason);
        // 點下去除了顯示原因，牌本身也抖一下：只有一行小字，玩家常常沒發現自己點了。
        // 動畫要加在**重畫之後**的那張牌上——render() 會把手牌整個重生，
        // 加在這個 node 上會連同它一起被丟掉，動畫根本不會播。
        node.addEventListener('click', () => {
          hint = chk.reason;
          render();
          root.querySelector(`.hand .card[data-uid="${c.uid}"]`)?.classList.add('nope');
        });
      }
      // 只有這次才出現在手上的牌才播進場動畫：每次重畫都播的話，光是選個目標整手牌就會抖一次。
      // 一張一張錯開 45 毫秒出發，整排才不會像同一塊板子被推上來。
      if (!shownCards.has(c.uid)) {
        node.classList.add('dealt');
        node.style.animationDelay = `${dealDelay + i * 45}ms`;
        /**
         * **只有換回合那一批才鎖**（`dealDelay > 0`，稽核 2026-09-10 中-1）。
         *
         * 舊的整排鎖也是這個條件；改成逐張時如果不加這個判斷，鎖的範圍會**變大**：
         * 開場第一手（`dealDelay` 是 0）第五張要等 620 毫秒才點得動，
         * 回合中途抽牌（替身術那類）滿手時最久 845 毫秒——而且那兩種情形
         * 「結束回合」的按鈕是活的，變成按鈕能點、牌不能點，正是這次要修的那種手感。
         */
        if (dealDelay > 0) {
          /**
           * 飛行中的那張不吃滑鼠，**但一飛到定位就立刻交還**（使用者 2026-09-10：
           * 「每回合抽完牌後，選牌打牌會 LAG 一下、點了會稍微沒反應」）。
           *
           * 原本是整排掛 `.dealing`、等**最後一張**落地才一起解鎖，可是每張各自錯開 45 毫秒出發，
           * 於是第一張早就停在定位、卻還要再等 225 毫秒（滿手十張時 450 毫秒）才點得動——
           * 牌明明就在那裡、點下去沒反應，那正是「卡頓」的體感來源，而且完全不是效能問題。
           * 改成一張一張自己解鎖：`card-deal` 播完就把 `no-touch` 拿掉。
           * 只動這個類別、不動 `dealt`：`dealt` 那條規則同時掛著起伏動畫，一拿掉起伏會從頭重播、
           * 整排牌會各自跳一下（見 combat.css 的說明）。
           */
          node.classList.add('no-touch');
          /**
           * **`animationcancel` 一定要一起聽**（稽核 2026-09-10 中-2）。
           *
           * 動畫被 `animation: none` 撤掉時瀏覽器送的是 `animationcancel`，不是 `animationend`。
           * 撤得掉這支的規則有三條：`:hover`／`.nope` 排在 `.dealt` 前面、蓋不過它；
           * `.dragging` 排在後面、真的撤得掉，但 `no-touch` 期間 `pointer-events: none`、牌根本抓不起來，
           * 所以今天三條都走不到（稽核 2026-09-10 低-4 更正：原本這裡只寫了前兩條）；
           * 但那是**純粹的順序巧合**——哪天有人在後面補一條
           *（最像的候選是 `@media (prefers-reduced-motion: reduce)` 關掉發牌動畫，這專案已經有三塊），
           * `no-touch` 就永遠留著、那張牌整場點不動，而且 jsdom 不跑 CSS 動畫、單元測試看不出來。
           * 失手的代價太大，兩行就補起來。
           */
          const free = (ev: AnimationEvent): void => {
            if (ev.animationName === 'card-deal') node.classList.remove('no-touch');
          };
          node.addEventListener('animationend', free);
          node.addEventListener('animationcancel', free);
          /**
           * 兜底：時間到就無條件解鎖（稽核 2026-09-10 低-7）。
           *
           * 兩種情形三個事件一個都不會發：①哪天有人在 `.dealt` 後面補一條 `animation: none`，
           * `card-deal` 從頭就不在動畫清單裡；②分頁切到背景時 CSS 動畫被凍住，
           * 而 `unlockEndTurn` 的計時器照跑——會出現「結束回合能按、牌還鎖著」。
           * 這一行讓最壞情況只是「晚一點解鎖」，不會變成「那張牌整場點不動」。
           */
          window.setTimeout(() => node.classList.remove('no-touch'), dealDelay + i * 45 + DEAL_FLY + 250);
        }
      }
      // 拖出去打（使用者 2026-09-07）：加一條路，點擊那兩種照舊。打不出來的牌不掛，
      // 維持「點下去抖一下＋說明」的行為。規則與座標換算見 dragplay.ts
      if (canAct() && chk.ok) {
        let idleAt: number | null = null;
        attachCardDrag(node, {
          needsTarget: st.def.target === 'enemy',
          scale: () => { const w = app.stage.getBoundingClientRect().width; return w > 0 ? w / 1280 : 1; },
          enemyAt: (x, y) => {
            // 查底下壓到誰之前先把這張牌藏起來：拖著的牌就在游標底下，不藏的話查到的永遠是它自己
            const keep = node.style.visibility;
            node.style.visibility = 'hidden';
            const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('.unit.enemy');
            node.style.visibility = keep;
            const raw = hit?.dataset['uid'];
            const uid = raw === undefined ? null : Number(raw);
            return uid !== null && cs.enemies.some((e) => e.uid === uid && !e.dead) ? uid : null;
          },
          leftHand: (y) => {
            const r = root.querySelector('.hand')?.getBoundingClientRect();
            return !r || y < r.top;
          },
          onStart: () => {
            hideTooltip();
            // 拖曳期間會把動畫整個停掉（不然晃動的位移會蓋過拖曳的位移），放開時那條規則一撤，
            // 瀏覽器把動畫當成新的重播一次——而這張牌身上還掛著「剛發到手」的標記，
            // 它的進場動畫起點是左下角的牌堆，於是牌先瞬移到牌堆再飛回來，看起來像重抽了一張
            //（使用者 2026-09-07 回報，實測放開瞬間 x 從 433 跳到 197）。
            // 這張牌早就發過了，標記拿掉；晃動的進度先記著，放開再接回去，連那點跳動都省掉
            idleAt = idleTimeOf(node);
            node.classList.remove('dealt');
            scheduleHint(c.uid);   // 拖著的牌同伴也看得到「考慮中」（使用者 2026-09-15）
          },
          onEnd: () => {
            scheduleHint(targeting?.kind === 'card' ? targeting.uid : null);   // 放開（打出或退回）就恢復成點選的狀態
            // 動畫要等 class 撤掉、瀏覽器重新建立之後才接得回去，所以排到下一個畫格
            const back = idleAt;
            idleAt = null;
            if (back === null || typeof window.requestAnimationFrame !== 'function') return;
            window.requestAnimationFrame(() => {
              const idle = idleAnimOf(node);
              if (idle) idle.currentTime = back;
            });
          },
          onHover: (uid) => {
            // 拖著的牌會蓋住底下的魔物，不高亮的話多怪時看不出這一下會打誰。
            // 直接動 class 不重畫：重畫會把正在拖的那張牌換成新節點，拖曳當場斷掉
            for (const u of root.querySelectorAll('.unit.enemy.drag-over')) u.classList.remove('drag-over');
            if (uid !== null) root.querySelector(`.unit.enemy[data-uid="${uid}"]`)?.classList.add('drag-over');
            damagePreview(uid === null ? null : c.uid, uid ?? undefined);   // 拖到哪一隻，就先標出會扣多少
          },
          // 點擊那兩條路都先過 canAct()，拖曳這條原本沒有——撒手鐧那類牌打完到自動結束回合之間
          // 有 650 毫秒的空窗，在那時候抓起另一張牌拖到魔物回合再放開，就會繞過那道關
          //（目前靠手牌已被清空撿到安全，但那是巧合）。稽核 2026-09-07 低 3
          onPlay: (targetUid) => { if (canAct()) { setTargeting(null); play(c.uid, targetUid); } },   // 拖出去打的正是點選中的那張：箭頭、攔截層一起撤（審查 2026-09-15 低-3）
          // 退回不需要重畫：reset() 已經把行內位移與層級清乾淨，牌自己會彈回扇形位置。
          // 重畫反而會在魔物演出中途砍斷動畫與飄字（同上，低 3 的後半）
        });
      }
      hand.append(node);
    });
    // 「還沒飛到定位的牌不吃滑鼠」現在是**每張自己管**（見上面掛 `no-touch` 那段）。
    // 原本在這裡替整排掛 `.dealing`、等最後一張落地才一起解開，那讓先落地的牌白等 225～450 毫秒。
    // `unlockEndTurn` 留著：它還要負責在發牌演完之後把「結束回合」的按鈕解灰。
    shownCards = new Set(p.hand.map((c) => c.uid));
    return hand;
  }

  /**
   * 新發到的牌從哪裡飛出來：左下角的牌堆（側邊欄的「抽牌 N」那一行）。
   *
   * 每張牌各算一次「牌堆中心 → 自己在扇形上的定位」的差，寫成 `--deal-dx`／`--deal-dy`，
   * `combat.css` 的 `card-deal` 就照這個位移把牌從牌堆拉回來。要等節點真的進到文件裡
   * 才量得到位置，所以這件事排在 `root.append(box)` 之後。
   *
   * **量的是 `offsetLeft`／`offsetTop`（版面座標），不是 `getBoundingClientRect()`**：
   * 那時候 `card-deal` 的 backwards 填充已經把牌縮小、轉開、推到牌堆上了，量外框會量到
   * 動畫中的位置，算出來的起點會再偏一次。版面座標不吃 transform，量到的永遠是定位點。
   */
  function dealFrom(box: HTMLElement): void {
    const cards = box.querySelectorAll<HTMLElement>('.hand .card.dealt');
    const hand = box.querySelector<HTMLElement>('.hand');
    const pile = box.querySelector('.pile-draw') ?? box.querySelector('.piles');
    if (!cards.length || !hand || !pile) return;
    // 舞台整個被 transform: scale() 縮過，量到的螢幕座標要除以縮放比才是舞台座標
    const { k } = stageFrame(app.stage);
    const hr = hand.getBoundingClientRect();     // 手牌區沒有 transform，外框就是它的版面位置
    const pr = pile.getBoundingClientRect();
    const ax = (pr.left + pr.width / 2 - hr.left) * k;   // 牌堆中心，換算成「相對於手牌區」
    const ay = (pr.top + pr.height / 2 - hr.top) * k;
    // 先把每張的定位點全部量完、再一次寫（清理 2026-09-22）：量一張寫一張的話，
    // 每寫一次樣式，下一張一量瀏覽器就得把樣式與版面重算一遍
    const spots = [...cards].map((node) => ({ node, x: node.offsetLeft + node.offsetWidth / 2, y: node.offsetTop + node.offsetHeight / 2 }));
    for (const { node, x, y } of spots) {
      node.style.setProperty('--deal-dx', `${(ax - x).toFixed(0)}px`);
      node.style.setProperty('--deal-dy', `${(ay - y).toFixed(0)}px`);
    }
  }

  /**
   * 發牌動畫跑完，把手牌與「結束回合」交還給玩家。
   *
   * 只動 class 與 disabled、**不重畫**：這一拍畫面上還有飄著的傷害數字（1 秒）與倒地動畫，
   * `render()` 會把它們砍在半路（跟 settle 收姿勢那段同一個道理）。
   * 中途要是重畫過，這裡拿到的是已經被丟掉的節點，動它不會有任何影響，正好。
   */
  function unlockEndTurn(box: HTMLElement, wait: number): void {
    const btn = box.querySelector<HTMLElement>('.end-turn');
    window.setTimeout(() => {
      if (app.cs === cs && canAct()) btn?.removeAttribute('disabled');
    }, wait);
  }

  /**
   * 就地修補戰場（敵方回合逐隻演出用）：只把「這一步有變」的單位換成新節點，其餘節點原封不動，
   * 呼吸動畫才不會每一步重來。回 false＝這一步換不了（節點不齊、有新召喚的），呼叫端改整頁重畫。
   */
  function patchField(before: Snap): boolean {
    const box = root.querySelector<HTMLElement>('.combat');
    const field = box?.querySelector<HTMLElement>('.field');
    if (!box || !field) return false;
    if (before.handN !== my().hand.length || before.energy !== my().energy) return false;   // 手牌或飯糰變了（同伴的「你也抽一張」「飯糰分你」）：退回整頁重畫（審查 中-1）
    if (cs.enemies.some((e) => !e.dead && !lineup.includes(e.uid))) return false;
    for (const e of cs.enemies) {
      const old = field.querySelector<HTMLElement>(`.unit.enemy[data-uid="${e.uid}"]`);
      if (!old) return false;
      const b = before.enemies.get(e.uid);
      const changed = !b || b.hp !== e.hp || b.block !== e.block || b.dead !== e.dead || b.phase !== e.phase || b.secluding !== (e.invulnIn > 0)
        || b.turnCount !== e.turnCount || b.label !== e.move.label || b.intent !== e.move.intent
        || b.debuff !== sumStatus(e, BAD_STATUS) || b.stealth !== getStatus(e, '隱身') || b.choke !== getStatus(e, '中毒')
        || acting.has(e.uid) || old.classList.contains('attack') || old.classList.contains('hit');
      if (changed) old.replaceWith(enemyUnit(e, lineup.indexOf(e.uid), lineup.length));
    }
    const pNode = field.querySelector<HTMLElement>(MINE);
    if (!pNode) return false;
    const p = my();
    const pChanged = before.hp !== p.hp || before.block !== p.block || before.buff !== sumStatus(p, GOOD_STATUS)
      || before.debuff !== sumStatus(p, BAD_STATUS) || before.stealth !== getStatus(p, '隱身')
      || pNode.querySelector<HTMLImageElement>('.sprite')?.getAttribute('src') !== heroArtUrl(p.hero, pose)
      || pNode.classList.contains('hit') || pNode.classList.contains('dodge') || pNode.classList.contains('attack')
      // 便當、回魂香的牌子（2026-09-23 第二批）：喝下去時血、蜷縮、狀態都沒變，不比這兩個的話牌子要等下一次重畫才冒出來
      || (pNode.querySelector('.chip-bento')?.textContent ?? '') !== (p.energyNextTurn ? `下回合飯糰+${p.energyNextTurn}` : '')
      || (pNode.querySelector('.chip-guard')?.textContent ?? '') !== guardChipText(p);
    if (pChanged) pNode.replaceWith(playerUnit(p));
    // 同伴那一格：他的變化來自連線，不會經過這裡的動畫旗標，所以單純比對狀態，有變才換（見 `mateUnitStale`）
    for (const q of cs.players) {
      if (q.seat === mySeat) continue;
      const node = field.querySelector<HTMLElement>(`.unit.player[data-seat="${q.seat}"]`);
      if (node && (mateUnitStale(before.players.get(q.seat), q, node, cs.players.length > 1, heroArtUrl(q.hero, matePose(q)))
        || node.dataset.mateSig !== mateSig(q))) {
        node.replaceWith(playerUnit(q));
      }
    }
    box.querySelector('.log')?.replaceWith(el('div', { class: 'log' }, ...cs.log.slice(-4).map((l) => el('div', {}, l))));
    // 狀態列只在它畫的東西變了才重建（見 `hudKey`）
    const hudNow = hudKey(me(run, app.seat), my().fishDelta, hudCounters());
    if (hudNow !== hudShown || !box.querySelector('.hud')) {
      box.querySelector('.hud')?.remove();
      renderHud(app, box, my().fishDelta, { turn: cs.turn, p: my() });
      hudShown = hudNow;
      paintFlashes(performance.now());   // 狀態列剛重建，還在演的秘寶要補回去（稽核 2026-09-10 複核 中-1）
    }
    const endBtn = box.querySelector<HTMLElement>('.end-turn');
    if (endBtn) { if (!canAct() || dealDelay > 0 || my().ready || my().down) endBtn.setAttribute('disabled', 'disabled'); else endBtn.removeAttribute('disabled'); }   // 舉手了／倒下了照整頁重畫的判準留灰（審查 中-2）
    // 逐步修補換掉的那幾隻，呼吸也照整頁重畫釘回開場的起點：不釘的話自己從頭起跑，下一次整頁重畫釘回去那一下會縮一下（畫面抖動稽核 2026-09-24 第 3 項）
    keepLoops(box, app.loopT0, 'card-idle');
    return true;
  }

  /** 選目標時鋪的接盤子：點空白處＝取消（整頁重畫與 `patchTargeting` 共用） */
  const targetCatcher = (): HTMLElement =>
    el('div', { class: 'target-catcher', onclick: () => { setTargeting(null); if (!patchTargeting()) render(); } });
  /** 教學那一條（整頁重畫與 `patchTargeting` 共用） */
  const tutBar = (): HTMLElement => el('div', { class: 'tut-bar' },
    el('span', { class: 'tut-step' }, `教學 ${tutStep + 1}/3`),
    // 手機、平板第一步多一句「按住牌放大看」（2026-09-23 polish，主控裁定三；最後一輪平板也開按住放大，一起教）：
    // 桌機用滑鼠滑過去就看得到，不出現
    el('span', {}, TUT_TEXT[tutStep] ?? '', tutStep === 0 && isTouchDevice() ? el('span', { class: 'tut-touch' }, TUT_TOUCH_PEEK) : ''),
    el('button', { class: 'tut-close', onclick: () => { tutDone(); render(); } }, '✕'));
  /** 下方那一行提示：選目標中講怎麼選，沒在選就講「這張為什麼打不出來」；都沒有回 null */
  const targetHint = (): HTMLElement | null => targeting
    ? el('div', { class: 'target-hint' }, targeting.kind === 'card' ? '把箭頭移到魔物身上，點一下打牠（Esc 或點空白處取消）' : '把箭頭移到魔物身上，點一下用忍具（Esc 或點空白處取消）')
    : hint ? el('div', { class: 'target-hint warn' }, hint) : null;
  /** 箭頭掛在 box 上的滑鼠監聽：box 不再每次選目標都換新的，收箭頭時要一起拆（見 `patchTargeting`） */
  let arrowOff: AbortController | null = null;

  /**
   * 選目標、取消選目標：只動跟它有關的那幾樣，不整頁重畫（2026-09-23 效能）。
   *
   * 量過（CPU 降速 4 倍，球球點「貓抓」）：這一下原本要 31 毫秒——整頁重建之後，箭頭量那張牌的位置，
   * 逼瀏覽器當場把整個戰鬥畫面的樣式與版面從頭算一遍；接著點魔物出牌又整頁重建一次。
   * 選目標真正會變的只有：接盤子、選中的那張牌、魔物能不能點、下方那行提示、教學條、箭頭。
   * 順序照 `render()` 擺（接盤子在戰場前面、教學條與提示在狀態列前面、箭頭最後），疊法才一樣。
   * 回 false＝畫面還沒畫好（或已經換掉），呼叫端退回整頁重畫。
   */
  function patchTargeting(): boolean {
    const box = root.querySelector<HTMLElement>('.combat');
    const field = box?.querySelector<HTMLElement>('.field');
    const hud = box?.querySelector<HTMLElement>('.hud');
    if (!box || !field || !hud) return false;
    hideTooltip();   // 跟整頁重畫一樣先關：點下去那張牌的提示不該黏著箭頭
    arrowOff?.abort();
    arrowOff = null;
    for (const stale of box.querySelectorAll('.target-catcher, .target-arrow, .target-hint, .tut-bar')) stale.remove();
    const picked = targeting?.kind === 'card' ? String(targeting.uid) : null;
    for (const c of box.querySelectorAll<HTMLElement>('.hand .card')) c.classList.toggle('selected', c.dataset['uid'] === picked);
    for (const e of cs.enemies) field.querySelector(`.unit.enemy[data-uid="${e.uid}"]`)?.classList.toggle('targetable', !!targeting && !e.dead);
    if (targeting) field.before(targetCatcher());
    if (tutStep >= 0) hud.before(tutBar());
    const note = targetHint();
    if (note) hud.before(note);
    if (targeting) mountArrow(box);
    return true;
  }

  function render(): void {
    // 只補沒暖過的：新召喚的魔物（或換了階段立繪的）、連線途中才出現的那位；角色姿勢一位只暖一次
    warmHeroes();
    warmEnemies();
    hideTooltip();   // 掛著提示的節點馬上要被換掉，不先關會留一個孤兒黏在畫面上
    arrowOff?.abort();   // 舊的 box 連同箭頭一起丟掉，監聽也拆掉
    arrowOff = null;
    previewFor = null;   // 血條整排重建，扣血預覽跟著沒了；記號歸零，箭頭再吸附時才會重畫（見 `damagePreview`）
    const handWas = handSnap();   // 清掉之前先記下手牌在哪（見 `slideHand`）
    clear(root);
    const box = el('div', { class: 'combat' });
    // 鋪法（圖＋放大率＋貼齊下緣）交給 `battleBgStyle` 一支管：關主門的門後景也叫同一支，
    // 兩邊就不可能再分岔（稽核 2026-09-11 中-1：門一開跟進戰鬥的背景差 27%）。
    // 放大率各張不同（見 tierBgZoom）：讓畫上的牆腳對到角色的腳底
    const bg = el('div', { class: 'battle-bg', style: battleBgStyle(bgKey) });
    // 空氣裡的浮塵。畫面靜止時總得有東西在動，不然看起來像一張截圖
    // （量過：不操作的時候整個戰鬥畫面只有立繪的呼吸在跑）。三層各自飄，樣式在 combat.css。
    box.append(bg, el('div', { class: 'motes' }, el('i'), el('i'), el('i')));
    // 選目標時鋪一層透明的接盤子：點空白處＝取消。魔物與手牌都疊在它上面，照樣點得到
    if (targeting) box.append(targetCatcher());

    const field = el('div', { class: 'field' }, ...cs.players.map((q) => playerUnit(q)));
    // 排位置只算**活著的**。倒下的魔物還留在 `cs.enemies` 裡（要放倒地動畫），
    // 但牠們不該再佔位子——之前是拿整個陣列來排，塔主召喚第二、第三批之後
    // 總數一路變大、新小怪的索引也一路往後，算出來的 left 直接超出舞台 1280
    // （第三批會落在 1380）。倒下的排在 -1，反正牠們是隱形的。
    const alive = cs.enemies.filter((e) => !e.dead);
    // 位子排好就不動（倒下的照樣佔位），只有召喚新魔物上場才重排——見 enemylayout.ts 的 nextLineup
    lineup = nextLineup(lineup, alive.map((e) => e.uid));
    // 四隻以上時欄距（150）比單位窄（190），狀態牌子會互相壓到——整場掛 crowd 讓牌子縮小
    box.classList.toggle('crowd', lineup.length >= 4);
    cs.enemies.forEach((e) => field.append(enemyUnit(e, lineup.indexOf(e.uid), lineup.length)));
    const enemyUids = new Set(cs.enemies.map((e) => e.uid));
    for (const uid of enemyMotionActors.keys()) if (!enemyUids.has(uid)) disposeEnemyMotion(uid);
    box.append(field, sidePanel(), handRow());

    /*
     * 連線版：按下去只是**舉手**，所以舉手之後這顆要換一張臉（使用者 2026-09-11：
     * 「兩個人都點下結束另一人會知道嗎」）。
     *
     * 原本只有頭上那張「已結束回合」的牌子，可是那張牌子掛在**立繪**上，
     * 而按鈕在右下角——玩家的眼睛在按鈕這邊，按完看到的還是一顆亮著的「結束回合」，
     * 只會再按一次。按鈕自己要講「我已經舉手了，在等對方」。
     */
    /*
     * **自己倒下的時候，按鈕要講實話**（規則四：倒下的人繼續看同伴打）。
     *
     * 引擎本來就擋著（`setReady` 看到 `down` 直接回 false），可是畫面照樣擺一顆亮著的
     * 「結束回合」——按下去毫無反應，玩家只會以為當掉了。跟貓窩那邊同一個道理。
     */
    const iDown = !!session && !!my().down;
    const iReady = !!session && !!my().ready;
    const endBtn = el('button', { class: 'btn primary end-turn', onclick: () => onEndTurn() },
      iDown ? '倒下了…看同伴打' : iReady ? '等對方…' : '結束回合');
    // 發牌動畫還在跑的那一拍也一起反灰（跟手牌同一個道理，見 handRow 掛 `no-touch` 那段）
    if (!canAct() || dealDelay > 0 || iReady || iDown) endBtn.setAttribute('disabled', 'disabled');
    if (iReady && !iDown) {
      /*
       * 舉手要收得回來。引擎本來就收 `ready: false`（`setReady` 的第三個參數），
       * 缺的只是一個按得到的地方——不給的話「手滑按到」等於整個回合報銷，
       * 而兩個人玩的時候那個回合連對方一起賠進去。
       */
      box.append(el('button', { class: 'btn end-undo', onclick: () => onUnready() }, '再想想'));
      /*
       * 對方走開了：等超過一分鐘就亮出來（使用者 2026-09-11：
       * 「超過一分鐘沒動作，另一人可以強制收回合」）。
       *
       * **刻意不做成時間到自動收**：兩邊的計時器不會同時響，自動收就變成
       * 一邊已經進魔物回合、另一邊還在等——那是最難查的一種分岔。按下去才送動作。
       * 先放進畫面再用 hidden 藏起來，是為了讓每秒的檢查只要開關一個屬性，
       * 不必整頁重畫（重畫會把正在演的動畫全部打斷）。
       */
      // 對面坐的是菲菲就要寫「她」（2026-09-13 稽核 中-3）：同一個畫面上她的名字就在旁邊
      const mate = cs.players.find((q) => q !== my());
      const force = el('button', { class: 'btn end-force', onclick: () => onForce() }, `替${heroPronoun(mate)}結束這回合`);
      force.hidden = true;
      box.append(force);
    }
    // 紀錄只留四行：六行時最後兩行會壓到球球的頭（2026-09-02 截圖檢查）
    box.append(endBtn, el('div', { class: 'log' }, ...cs.log.slice(-4).map((l) => el('div', {}, l))));
    if (tutStep >= 0) box.append(tutBar());
    const note = targetHint();
    if (note) box.append(note);
    renderHud(app, box, my().fishDelta, { turn: cs.turn, p: my() });   // 偷走／賺到的當下就要在狀態列看得到
    hudShown = hudKey(me(run, app.seat), my().fishDelta, hudCounters());
    root.append(box);
    paintFlashes(performance.now());   // 同 patchField：整頁重畫也要把還在演的秘寶補回去（稽核 2026-09-10 複核 中-1）
    // 這兩件都要量元素位置，得等節點真的進到文件裡才量得到，所以放在 append 之後。
    // dealFrom 排在同一拍（不是下一幀）：動畫要到下一幀才開始播，這時候補上位移還來得及。
    dealFrom(box);
    if (dealDelay > 0) {
      unlockEndTurn(box, dealDelay + DEAL_FLY + my().hand.length * 45);
      // 抽牌聲跟著畫面上的飛入逐張響，音高每張微調，不然像複讀機
      sfx('turn_start');
      my().hand.forEach((_, i) => window.setTimeout(
        () => sfx('draw', 0.95 + i * 0.05), dealDelay + i * 45));
    }
    // 箭頭要量元素位置，得等節點真的進到文件裡才量得到，所以放在 append 之後
    if (targeting) mountArrow(box);
    /*
     * 整頁重建之後：背景火光與暖光、三層浮塵、魔物呼吸、意圖牌這些循環動畫接回原進度（`keepLoops`），
     * 還在手上的牌從舊位置滑過去、起伏接著晃（`slideHand`；它自己接起伏，所以 `keepLoops` 跳過 `card-idle`——
     * 剛發到手的牌那支起伏跟著發牌的延遲起跑，釘到開場時間的話發牌一落地會抖一下）。畫面抖動稽核 2026-09-24 第 3 項
     */
    keepLoops(root, app.loopT0, 'card-idle');
    slideHand(handWas);
    // `dealDelay` 是**一次性**的：settle 設好、緊接著那一次重畫用掉就歸零。
    // 不歸零的話，換完回合之後每一次重畫（點一張要選目標的牌、按 Esc 取消）
    // 都會以為自己還在發牌，把整排手牌與「結束回合」再鎖一秒多。
    dealDelay = 0;
  }

  /**
   * 瞄準時先標出這一下會打掉多少血（使用者 2026-09-24 晚：「指上去但還沒打出去時，就先顯示怪物會扣的血量……
   * 7 是紅色（跟現在一樣），5 是紫色或藍色，這樣玩家用肉眼看顏色就知道」）。
   *
   * 血條上從「打完剩下」到「現在」那一段蓋一層紫色，數字寫成「剩下＋會扣／上限」（例：7+5/12，+5 是紫色）。
   * 範圍攻擊會同時標出每一隻。傷害怎麼算交給引擎在複本上試打（`previewHpLoss`），這裡不自己算。
   * 三條路都叫這支：點選瞄準時箭頭吸附到魔物（`mountArrow`）、拖著牌經過魔物（`onHover`）、
   * 滑到不用指定目標的牌上（範圍攻擊）。同一張牌對同一隻不重算；`cardUid` 是 null 就收掉。
   * 只動 class 與文字、不重畫（重畫會把正在拖的牌換掉，拖曳當場斷掉）；整頁重畫時血條本來就重建，`render` 把記號歸零。
   */
  let previewFor: string | null = null;
  function damagePreview(cardUid: number | null, foeUid?: number): void {
    const key = cardUid === null ? null : `${cardUid}>${foeUid ?? '-'}`;
    if (key === previewFor) return;
    previewFor = key;
    for (const n of root.querySelectorAll('.hpbar-preview')) n.remove();
    for (const s of root.querySelectorAll<HTMLElement>('.hpbar > span[data-plain]')) {
      s.textContent = s.dataset['plain'] ?? '';
      delete s.dataset['plain'];
    }
    if (cardUid === null) return;
    for (const [uid, lost] of previewHpLoss(cs, cardUid, foeUid, mySeat)) {
      const e = cs.enemies.find((x) => x.uid === uid);
      const bar = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${uid}"] .hpbar`);
      const label = bar?.querySelector<HTMLElement>(':scope > span');
      if (!e || !bar || !label || e.maxHp <= 0) continue;
      const shown = e.hp + (motionPendingDamage.get(uid) ?? 0);   // 血條畫的是這個（命中動畫還沒演完的那段先不扣）
      const after = Math.max(0, shown - lost);
      const pct = (n: number): string => `${Math.max(0, Math.min(100, (n / e.maxHp) * 100)).toFixed(2)}%`;
      label.before(el('div', { class: 'hpbar-preview', style: `left:${pct(after)};width:${pct(shown - after)}` }));
      label.dataset['plain'] = label.textContent ?? '';
      label.replaceChildren(String(after), el('b', { class: 'hp-loss' }, `+${shown - after}`), `/${e.maxHp}`);
    }
  }

  /**
   * 選目標時從牌拉一條弧線到滑鼠（類殺戮尖塔）。
   *
   * 出牌仍然是「點牌再點魔物」，這條線只是指引——原本選了牌之後畫面沒有任何連線，
   * 玩家不知道自己正牽著什麼、要往哪放。
   *
   * 兩個控制點都拉到終點上方，線就會從牌往上翹、再從上面落到目標，箭頭固定朝下
   * （終點的切線恆為正 y，所以不用算角度）。滑到魔物身上會吸附到牠身上並轉亮。
   */
  function mountArrow(box: HTMLElement): void {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'target-arrow');
    svg.setAttribute('viewBox', '0 0 1280 720');
    // 線分三層（2026-09-02 使用者：「線條太難看」）：深色描邊墊底、金色虛線在上（虛線會往目標流動）、
    // 箭頭帶缺口、吸附時目標腳下多一圈脈動的光環
    const outline = document.createElementNS(SVG_NS, 'path');
    outline.setAttribute('class', 'arrow-outline');
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('class', 'arrow-line');
    const head = document.createElementNS(SVG_NS, 'path');
    head.setAttribute('class', 'arrow-head');
    const tip = document.createElementNS(SVG_NS, 'circle');
    tip.setAttribute('class', 'arrow-tip');
    tip.setAttribute('r', '22');
    svg.append(outline, line, tip, head);
    box.append(svg);

    /**
     * 舞台整個被 `transform: scale()` 縮過，滑鼠的座標得換算回 1280×720 的舞台座標。
     *
     * **框要在用的當下現查，不能開頭量一次存起來**（稽核 2026-09-10 中-3）：選目標的時候
     * 把視窗放大縮小（或按最大化），舊的倍率就對不上了——實測把縮放從 1.121 改成 0.6，
     * 同一個版面位置畫出來橫向差 205、縱向差 134，箭頭指在別的地方，而且要按 Esc 重選才會修正。
     * 吸附判定走 `elementFromPoint`（即時座標）所以還是打得到滑鼠底下那隻，但玩家會以為自己選錯。
     * 專案裡 `tooltip.ts`、`dragplay.ts`、`dragscroll.ts` 都是現查，這裡是唯一的例外。
     */
    const toStage = (cx: number, cy: number): { x: number; y: number } => {
      const stage = stageFrame(app.stage);
      return { x: (cx - stage.left) * stage.k, y: (cy - stage.top) * stage.k };
    };
    const centreOf = (n: Element, yFrac: number): { x: number; y: number } => {
      const r = n.getBoundingClientRect();
      return toStage(r.left + r.width / 2, r.top + r.height * yFrac);
    };

    // 起點：選中的那張牌的上緣中央；忍具沒有選中樣式，退回球球身上
    const src = box.querySelector('.card.selected') ?? box.querySelector(`${MINE} .sprite`);
    const from = src ? centreOf(src, 0.08) : { x: 640, y: 620 };

    const draw = (to: { x: number; y: number }, snapped: boolean): void => {
      const lift = Math.min(240, 90 + Math.hypot(to.x - from.x, to.y - from.y) * 0.35);
      const d = `M ${from.x} ${from.y} C ${from.x} ${from.y - lift}, ${to.x} ${to.y - lift}, ${to.x} ${to.y - 14}`;
      outline.setAttribute('d', d);
      line.setAttribute('d', d);
      // 帶缺口的箭頭（尾端凹進去），比實心三角形有「箭」的樣子
      head.setAttribute('d',
        `M ${to.x} ${to.y} L ${to.x - 14} ${to.y - 24} L ${to.x} ${to.y - 16} L ${to.x + 14} ${to.y - 24} Z`);
      tip.setAttribute('cx', String(to.x)); tip.setAttribute('cy', String(to.y + 6));
      svg.classList.toggle('snap', snapped);
    };

    // 還沒動滑鼠時先指著第一隻活著的魔物，不要留一條長度是零的線在原地
    const first = box.querySelector('.unit.enemy.targetable');
    draw(first ? centreOf(first, 0.45) : { x: 900, y: 300 }, false);

    // 監聽掛在 box 上。選目標改成就地修補之後 box 不一定會換（2026-09-23 效能），
    // 所以綁在 `arrowOff` 上：收箭頭（`patchTargeting`）或整頁重畫時一起拆，不然每選一次就多疊一個監聽。
    // 滑鼠一格裡可能送好幾次 mousemove：每一格最多處理一次、用最後那次的座標（清理 2026-09-22）；
    // 排到的那一格如果箭頭已經被收掉（或 box 被重畫換掉）就不做
    let aimAt: { x: number; y: number } | null = null;
    let aimRaf = 0;
    arrowOff?.abort();
    arrowOff = new AbortController();
    box.addEventListener('mousemove', (ev) => {
      aimAt = { x: ev.clientX, y: ev.clientY };
      if (aimRaf) return;
      aimRaf = window.requestAnimationFrame(() => {
        aimRaf = 0;
        if (!aimAt || !box.isConnected || !svg.isConnected) return;
        const { x, y } = aimAt;
        const foe = document.elementFromPoint(x, y)?.closest<HTMLElement>('.unit.enemy.targetable');
        draw(foe ? centreOf(foe, 0.45) : toStage(x, y), !!foe);
        // 吸附到哪一隻就先標出這一下會扣多少（`damagePreview`）；沒吸附就收掉
        damagePreview(foe && targeting?.kind === 'card' ? targeting.uid : null, foe ? Number(foe.dataset['uid']) : undefined);
      });
    }, { signal: arrowOff.signal });
  }

  // ===== 操作 =====

  function onCard(uid: number): void {
    if (!canAct()) return;
    const card = my().hand.find((c) => c.uid === uid);
    if (!card) return;
    hint = '';
    if (cardStats(card).def.target === 'enemy') {
      const already = targeting?.kind === 'card' && targeting.uid === uid;
      const alive = aliveEnemies(cs);
      // 場上只剩一隻的時候，連點兩下就直接打牠——反正也沒別的可以選，
      // 還要移到魔物身上再點一次很囉嗦。兩隻以上照舊：要自己挑目標。
      if (already && alive.length === 1) { setTargeting(null); play(uid, alive[0]!.uid); return; }
      // 再點一次同一張＝取消；點另一張＝改選那一張（就地修補，見 `patchTargeting`）
      setTargeting(already ? null : { kind: 'card', uid });
      if (!patchTargeting()) render();
      return;
    }
    play(uid, undefined);
  }

  function pickTarget(enemyUid: number): void {
    const t = targeting;
    setTargeting(null);
    if (!t || !canAct()) { render(); return; }
    if (t.kind === 'card') play(t.uid, enemyUid);
    else drinkPotion(t.id, enemyUid);
  }

  /**
   * 用一瓶忍具。**連線時要走會話**（稽核 2026-09-14 高-3）：原本直接呼叫引擎、也沒帶座位，
   * 於是只有自己這台生效（對面不知道，回合結束對帳必定對不上），客戶端還會喝掉主機袋子裡的那瓶。
   */
  function drinkPotion(id: string, enemyUid: number | undefined): void {
    const motion = motionForPotion(my(), id);
    const motionToken = motion && session ? ++nextMotionPresentationToken : undefined;
    if (motion && motionToken !== undefined) {
      locallyPlayedMotion.record(localPotionMotionKey(mySeat, id), {
        action: motion,
        at: Date.now(),
        token: motionToken,
      });
    }
    act(() => {
      const ok = sendOrDo({ t: 'potion', seat: mySeat, id, g: enemyUid }, () => usePotion(cs, id, enemyUid, mySeat));
      if (!ok) {
        locallyPlayedMotion.dropInFlight();
        console.error(`usePotion 失敗：${id}`);
      }
    }, { ...potionPose(heroOf(my()), id), motion, motionToken, impactProjectile: projectileForPotion(id, enemyUid) });
  }

  /**
   * 打出去的牌飛向目標。
   *
   * 原本牌是**直接消失**的——按下去手牌就少一張，中間沒有任何過程，
   * 這是整場戰鬥最「卡」的地方。這裡把那張牌複製一份丟到疊層，讓它飛過去再淡掉。
   *
   * 複製到疊層而不是動原本那張：出牌會整個重畫手牌，原本那張連同動畫一起被丟掉；
   * 疊層不隨畫面重畫，所以飛行過程才播得完。
   */
  function flyCard(uid: number, targetUid: number | undefined): void {
    const layer = overlayRoot();
    const from = root.querySelector<HTMLElement>(`.hand .card[data-uid="${uid}"]`);
    if (!layer || !from || typeof from.animate !== 'function') return;
    const stage = stageFrame(app.stage);
    const { k } = stage;
    const r = from.getBoundingClientRect();
    const dest = targetUid === undefined
      ? root.querySelector(`${MINE} .sprite`)
      : root.querySelector(`.unit.enemy[data-uid="${targetUid}"] .sprite`);
    const dr = dest?.getBoundingClientRect();

    const ghost = from.cloneNode(true) as HTMLElement;
    ghost.classList.add('flying');
    ghost.style.left = `${(r.left - stage.left) * k}px`;
    ghost.style.top = `${(r.top - stage.top) * k}px`;
    ghost.style.width = `${r.width * k}px`;
    ghost.style.height = `${r.height * k}px`;
    layer.append(ghost);

    const dx = dr ? (dr.left + dr.width / 2 - (r.left + r.width / 2)) * k : 0;
    const dy = dr ? (dr.top + dr.height / 2 - (r.top + r.height / 2)) * k : -160;
    ghost.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(.85)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 0 },
    ], { duration: 340, easing: 'cubic-bezier(.4,0,.6,1)' }).addEventListener('finish', () => ghost.remove());
    // animate() 保險：動畫被節流沒跑完也要把它收掉，不然疊層會留一堆殘影
    window.setTimeout(() => ghost.remove(), 1200);
  }

  function play(uid: number, targetUid: number | undefined): void {
    if (!canAct()) return;
    const card = my().hand.find((c) => c.uid === uid);
    if (!card) return;
    const st = cardStats(card);
    const chk = canPlay(cs, uid, targetUid, mySeat);
    if (!chk.ok) { hint = chk.reason; render(); return; }
    const motion = motionForCard(my(), card);
    const motionTrip = motion ? prepareMelee(mySeat, motion, targetUid, st.def.type === '攻擊') : undefined;
    const motionToken = motion && session ? ++nextMotionPresentationToken : undefined;
    if (motion && motionToken !== undefined) {
      locallyPlayedMotion.record(localCardMotionKey(uid), {
        action: motion,
        at: Date.now(),
        token: motionToken,
        trip: motionTrip,
      });
    }
    flyCard(uid, targetUid);
    sfx('draw', 1.15);   // 牌離手的紙聲，比抽牌高一點才分得出是哪個動作
    // 出招一律用「參上」。以前是照牌面貼圖換姿勢，但牌面已經換成專畫的插圖（`card/*`），
    // 那批不是球球的立繪、也沒有對應的姿勢，所以那條規則已經沒有意義了。
    act(() => {
      // canPlay 剛放行卻打不出來＝引擎跟畫面對不上，出聲，不要靜靜吞掉
      const ok = sendOrDo({ t: 'card', seat: mySeat, u: uid, g: targetUid },
        () => playCard(cs, uid, targetUid, mySeat));
      if (!ok) {
        locallyPlayedMotion.dropInFlight();
        console.error(`playCard 在 canPlay 放行後仍失敗：${st.name}（uid ${uid}）`);
      }
    }, { ...cardPose(heroOf(my()), st.def, st.effects), motion, motionTrip, motionToken,
      impactProjectile: projectileForCard(my(), card, motion) });
    if (tutStep === 0) tutStep = 1;
    // 撒手鐧、先睡了這類「打完直接結束回合」的牌：效果只掛旗，
    // 這裡走跟按「結束回合」一模一樣的流程（收牌動畫→敵人動作→發新牌）。
    // 稍等 650 毫秒讓這張牌的傷害數字與姿勢先播完，不然出招跟收牌疊在同一拍。
    // 這裡只知道一段的長度：連環踢這類多段牌的真正段數要等結算才算出來，屆時會把 endsAt 延長，
    // 所以到點後再看一次動作還沒演完就補等，不然招式演到一半就被魔物回合切掉（稽核 2026-09-21 第 7 點）。
    const endWhenMotionDone = (): void => {
      if (app.cs !== cs || !allReady(cs) || cs.phase !== 'player') return;
      const state = motionActors.get(mySeat);
      const left = state?.active ? state.endsAt - performance.now() : 0;
      if (left > 0) { window.setTimeout(endWhenMotionDone, left + 30); return; }
      onEndTurn();
    };
    if (allReady(cs)) window.setTimeout(endWhenMotionDone, Math.max(650, motionTrip?.plan.totalMs
      ?? (motion && motionSourceFor(my()) ? motionDuration(motionSourceFor(my())!, motion) : 0)) + 30);
  }

  function onPotion(id: string): void {
    if (!canAct()) return;
    const def = potionById[id];
    if (!def) return;
    hint = '';
    // 只有打魔物的忍具要選目標（手裡劍、麻繩）；全體與自己用的直接用掉
    if (def.target === 'enemy') { setTargeting({ kind: 'potion', id }); if (!patchTargeting()) render(); return; }
    drinkPotion(id, undefined);
  }

  /**
   * 收牌：手上剩下的牌往右下角的「結束回合」飛過去，縮小、轉開、淡掉，像被收回牌堆。
   *
   * **動的是原本那幾張牌，不是複製到疊層的分身**（出牌的 `flyCard` 才需要分身）：
   * 這一段從頭到尾不重畫，所以牌不會被丟掉，動畫播得完；而且分身是照外框
   * （`getBoundingClientRect`）定位的，扇形轉開的牌外框比牌本身大一圈，複製過去會被拉扁。
   *
   * **動的是 `translate`／`rotate`／`scale` 三個獨立屬性，不是 `transform`**：
   * 扇形的角度是渲染時用行內 `transform` 寫上去的，動 `transform` 會把整個扇形抹平。
   * 獨立屬性跟 `transform` 是相乘疊加的，扇形留著、飛行疊在上面。
   *
   * 回傳「等多久再叫引擎」；沒有牌可收（或這個瀏覽器沒有 `animate`）就回 0，呼叫端照舊直接結算。
   */
  function collectHand(): number {
    const hand = root.querySelector<HTMLElement>('.hand');
    const btn = root.querySelector<HTMLElement>('.end-turn');
    const cards = [...root.querySelectorAll<HTMLElement>('.hand .card')];
    if (!hand || !btn || !cards.length || typeof cards[0]!.animate !== 'function') return 0;
    // 舞台整個被 transform: scale() 縮過，量到的螢幕座標要除以縮放比才是舞台座標
    const { k } = stageFrame(app.stage);
    const br = btn.getBoundingClientRect();
    const bx = br.left + br.width / 2;
    const by = br.top + br.height / 2;
    // 牌多就把出發間隔壓縮、引擎多等一點：固定 38×i 配固定 330 的話，第八張起重畫時還沒出發，
    // 看起來就是「別的牌飛走了、這幾張留在原地」（使用者 2026-09-02 回報）
    const { stagger, wait } = collectTiming(cards.length);
    // 先量完每一張的位置再一起起飛（清理 2026-09-22）：量一張、掛一段動畫、再量下一張的話，
    // 每掛一段動畫，下一次量瀏覽器就得把樣式與版面重算一遍
    const rects = cards.map((node) => node.getBoundingClientRect());
    cards.forEach((node, i) => {
      const r = rects[i]!;
      const dx = (bx - r.left - r.width / 2) * k;
      const dy = (by - r.top - r.height / 2) * k;
      // 一張往左轉、一張往右轉，越後面轉越多：整排一起轉同一邊會像一塊板子在倒
      const spin = (i % 2 ? 1 : -1) * (16 + i * 4);
      node.animate([
        { translate: '0 0', rotate: '0deg', scale: 1, opacity: 1 },
        { translate: `${(dx * 0.42).toFixed(0)}px ${(dy * 0.42).toFixed(0)}px`,
          rotate: `${(spin * 0.45).toFixed(0)}deg`, scale: 0.78, opacity: 1, offset: 0.5 },
        { translate: `${dx.toFixed(0)}px ${dy.toFixed(0)}px`, rotate: `${spin}deg`, scale: 0.12, opacity: 0 },
      ], {
        duration: COLLECT_FLY,
        delay: Math.round(i * stagger),
        easing: 'cubic-bezier(.5, 0, .8, .35)',   // 慢慢起步、越飛越快，像被吸進去
        // both＝出發前先定住（不讓手牌的起伏動畫繼續晃）、飛完之後停在按鈕上不要彈回來。
        // 引擎比最後一張牌早跑完，沒有 forwards 的話前面幾張會先跳回原位再被重畫掉。
        fill: 'both',
      });
    });
    // 飛走的牌不要再吃滑鼠：滑過去會被 :hover 拉起來，整段動畫就爛了
    hand.classList.add('collecting');
    btn.setAttribute('disabled', 'disabled');
    return wait;
  }

  function onEndTurn(): void {
    if (!canAct()) return;
    // 選著目標的時候按結束回合：先重畫一次把指引箭頭與選起來的那張牌收掉，再開始收牌。
    // 收牌那段刻意不重畫，箭頭留著就會指著一張已經飛走的牌。
    const wasTargeting = targeting !== null;
    setTargeting(null);
    // **「這張打不出來」的提示要在換回合時清掉**（使用者 2026-09-10：「都換回合了、3 飯糰都出來了，
    // 畫面上還卡死『餓扁了』」）。`hint` 本來只在 `act()`（出牌、用忍具）開頭清，
    // 結束回合這條路沒清——所以飯糰空了點一張牌之後，那行紅字會一路掛到你下一次出牌為止。
    //
    // **變數清掉還不夠，畫面上那顆節點要自己拔**（稽核 2026-09-10 中-1）：沒在選目標的時候
    // 底下的 `render()` 不會跑，接著走的是 `collectHand()`→`runEnemyTurn()`→`settle(…{ light: true })`，
    // 而 `patchField()` 只換魔物、球球、紀錄與狀態列，碰不到 `.target-hint`。
    // 要一路等到回合收尾那次整頁重畫才會消失——中間整個魔物回合（一排怪可以演好幾秒）紅字都還掛著。
    hint = '';
    root.querySelector('.target-hint.warn')?.remove();
    if (tutStep === 1) tutStep = 2;
    else if (tutStep === 2) tutDone();
    hideTooltip();
    /*
     * 連線版：按「結束回合」只是**舉手**，要兩邊都舉手才真的收（見 `combat.ts` 的 `setReady`）。
     * 所以這裡送出去就回，收牌與魔物回合交給 `session.onApplied` 裡的 `finishApplied`（看 `allReady(cs)`）——
     * 最後一個人舉手的那一下套用時，在兩台機器上各自跑一次（引擎是決定性的，跑出來一模一樣）。
     */
    if (session) {
      sendOrDo({ t: 'ready', seat: mySeat, on: true }, () => true);
      // 主機是最後一個舉手的：上面那一行已經同步開始收牌，這時整頁重畫會把飛到一半的手牌打回原位
      if (!collecting && !enemyTurnRunning) render();
      return;
    }
    if (wasTargeting) render();
    sfx('turn_end');
    const wait = collectHand();
    if (wait <= 0) { runEnemyTurn(); return; }
    // 這段時間引擎還停在上一回合，畫面上的數字（飽足、抽牌數）跟引擎仍然是一致的——
    // 因為根本還沒有人動過它。收完牌才真的換回合，那時候整個畫面一起重畫。
    collecting = true;
    window.setTimeout(() => {
      if (app.cs !== cs || !collecting) return;   // 這場已經被接手就算了
      collecting = false;
      runEnemyTurn();
    }, wait);
  }

  /** 收回舉手：我還想再打一張牌 */
  function onUnready(): void {
    if (!session || !my().ready || cs.phase !== 'player' || collecting || enemyTurnRunning) return;
    sendOrDo({ t: 'ready', seat: mySeat, on: false }, () => true);
  }

  /**
   * 替走開的那位收回合。按得到的時候一定只剩他還沒舉手（按鈕的顯示條件就是這個），
   * 所以送出去之後兩邊都舉手了，收回合走的是跟平常一模一樣的那條路。
   */
  function onForce(): void {
    if (!session || cs.phase !== 'player') return;
    const w = waitingFor(cs);
    if (w.length !== 1 || w[0] === mySeat) return;
    sendOrDo({ t: 'force', seat: mySeat, w: w[0] as number }, () => true);
  }

  /**
   * 敵方回合逐隻演出（使用者 2026-09-03：「所有怪物一次打完所有動作，看不出來怪物有動作」）：
   * 前半（詛咒、棄牌、復活）先畫一拍，然後一隻出手、畫一拍、停 720 毫秒，再換下一隻；
   * 全部動完才收尾發新手牌。中途畫面被接手（app.cs 換了）就整個放掉。
   */
  /** 預告亮多久。這 0.32 秒是從兩隻之間那 720 毫秒的乾等裡借的，不是外加上去的。 */
  const TELEGRAPH_MS = 320;
  /** 收掉蹲低的姿勢：那隻要真的出手了，得先彈回來才接得上前撲。 */
  function clearTelegraph(): void {
    root.querySelector<HTMLElement>('.unit.enemy.telegraph')?.classList.remove('telegraph');
  }
  /**
   * 亮出下一個要出手的那隻。該不該亮的判斷在 `ui/telegraph.ts`（純函式、只讀不寫、有測試釘著），
   * 這裡只負責掛 class。回傳有沒有真的亮，呼叫端才知道要不要等這 0.32 秒。
   */
  function telegraphNext(): boolean {
    const uid = telegraphTarget(cs);   // 該不該亮的條件全在那支純函式裡（有測試釘著它不碰引擎）
    if (uid === undefined) return false;
    const node = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${uid}"]`);
    if (!node) return false;
    node.classList.add('telegraph');
    return true;
  }

  function runEnemyTurn(): void { guardEnemyTurn(startEnemyTurn)(); }
  function startEnemyTurn(): void {
    const before = snap(cs, my());
    // 連線：收回合那一刻會話被 `hold()` 住了，演完（或根本沒得演）都要放開，同伴下一回合的牌才套得進來（稽核 2026-09-14 高-7）
    if (!beginEnemyTurn(cs)) { settle(before, { deal: true }); session?.release(); return; }
    // 旗標要在 settle 之前設：預告加了延遲之後，settle 畫出來的「結束回合」鈕會亮著閃 0.32 秒
    // （點了仍被 canAct 擋住，但看起來像可以點）——稽核 2026-09-04 夜 L-2
    enemyTurnRunning = true;
    settle(before, { light: true });
    const step = guardEnemyTurn((): void => {
      if (app.cs !== cs) { enemyTurnRunning = false; return; }
      clearTelegraph();
      const b = snap(cs, my());
      const more = stepEnemyTurn(cs);
      if (!more) {
        finishEnemyTurn(cs);
        enemyTurnRunning = false;
        settle(b, { deal: true });
        session?.release();
        return;
      }
      // 這一步有沒有東西可看：有魔物真的動了（回合數推進）或紀錄多了行
      const acted = cs.log.length !== b.logLen
        || cs.enemies.some((e) => (b.enemies.get(e.uid)?.turnCount ?? e.turnCount) !== e.turnCount);
      if (!acted) { step(); return; }
      settle(b, { light: true });
      const gap = cs.phase === 'player' ? 720 : 400;
      // 前 0.4 秒看上一隻的結果，剩下 0.32 秒亮下一隻：兩段加起來還是原本的 720，節奏不變
      if (cs.phase === 'player') {
        window.setTimeout(() => { if (app.cs === cs) telegraphNext(); }, gap - TELEGRAPH_MS);
      }
      window.setTimeout(step, gap);
    });
    // 整個回合的第一隻沒有「上一隻的結果」可以借時間，這 0.32 秒是真的多花的（一回合一次）
    if (telegraphNext()) window.setTimeout(step, TELEGRAPH_MS);
    else step();
  }

  /*
   * 魔物回合演到一半丟例外的退路（2026-09-23，接稽核 低-2 的「沒做的」）。
   *
   * 收牌之後，魔物回合的開頭與每一步都在計時器裡跑，`onApplied` 外層那道防護接不到：
   * 任何一支演出（`settle`、出招預告）丟一個例外，這一步之後就沒人排下一步，
   * `release()` 永遠等不到——同伴下一回合的牌全在這邊排隊，兩台互等（單機則是停在魔物回合、按鈕全灰）。
   * 跟低-2 同一套：記一行、照常收尾，連收尾都壞就直接放開。
   * 「照常收尾」＝引擎那一半照常走完、只是不演（跟 `endTurn` 同一個走法；兩台都要走到同一個地方，鎖步才對得上），
   * 畫面重畫回真實的狀態、照常判勝負。
   */
  function guardEnemyTurn(fn: () => void): () => void {
    return () => { try { fn(); } catch (error) { rescueEnemyTurn(error); } };
  }
  function rescueEnemyTurn(error: unknown): void {
    console.error('魔物回合演出失敗，照常收尾', error);
    enemyTurnRunning = false;
    try {
      if (cs.enemyActing) { while (stepEnemyTurn(cs)) { /* 一隻一隻 */ } finishEnemyTurn(cs); }
      else if (turnWaiting()) endTurn(cs);   // 例外丟在魔物回合開始之前：照 endTurn 補跑一次（見 `turnWaiting`）
      recoverPresentation();
      checkOver();
      syncPicker();
    } catch (again) {
      console.error('魔物回合收尾也失敗，直接放開會話', again);
    } finally {
      session?.release();
    }
  }
  /*
   * 都舉手了、魔物回合卻還沒開始（2026-09-23 推前審查 低-4）。
   *
   * 例外丟在魔物回合開始之前——`startEnemyTurn` 開頭那一次快照、`onApplied` 算出「這回合收完了」之前那幾行——
   * 原本兩條退路都只放開：這台一直不跑魔物回合，同伴那台早就跑完了，兩台分岔、跳紅色橫幅。
   * 這個判斷只看引擎狀態，兩台一致；照 `endTurn` 補跑一次，兩台就停在同一個地方。
   * 正在收牌（`collecting`）的不算：計時器等一下自己會開魔物回合。單機沒有舉手旗標，永遠不成立。
   */
  function turnWaiting(): boolean {
    return cs.phase === 'player' && !cs.pending && !cs.enemyActing && !collecting && allReady(cs);
  }

  // ===== 結算與動畫 =====

  /** 跑一個引擎動作，然後照「前後差異」放姿勢、動畫與台詞 */
  type ActOptions = {
    pose?: string;
    attack?: boolean;
    deal?: boolean;
    light?: boolean;
    motion?: CombatMotionAction;
    motionTrip?: MeleeTrip;
    motionToken?: number;
    motionAlreadyPlaying?: boolean;
    impactMotion?: CombatMotionAction;
    impactPresentationToken?: number;
    impactElapsed?: number;
    impactApproach?: number;
    impactSeat?: number;
    impactAttack?: boolean;
    /** 這一拍丟出去的是什麼（牌、忍具決定；沒帶就照動作的預設：球球手裏劍、菲菲飛針） */
    impactProjectile?: ProjectileShot;
    comparison?: Snap;
    freshLog?: readonly string[];
    impactHits?: readonly Readonly<{ uid: number; amount: number }>[];
    pendingPrepared?: boolean;
    deferOver?: boolean;
  };

  type RemotePresentationItem =
    | { kind: 'step'; play: () => void; wait: DeferredCombatMotionPresentationWait }
    | { kind: 'done'; run: () => void };
  const remotePresentationQueue: RemotePresentationItem[] = [];
  let remotePresentationRunning = false;

  /**
   * 演出丟例外後回到真實狀態：排隊時先記下的「還沒打到的傷害」「等著倒下」「暫留的立繪」
   * 永遠等不到擊中計時器扣回去，不清的話血條一直偏高、死掉的怪一直站著（審查 2026-09-21 晚 低-4）。
   */
  const recoverPresentation = (): void => {
    motionPendingDamage.clear();
    motionPendingStatus.clear();
    motionPendingPlayer.clear();
    fallingUids.clear();
    motionHeldSprites.clear();
    if (app.cs === cs && !ended) render();
  };

  const pumpRemotePresentation = (): void => {
    const item = remotePresentationQueue.shift();
    if (!item || app.cs !== cs) { remotePresentationRunning = false; return; }
    remotePresentationRunning = true;
    if (item.kind === 'done') {
      // 後面又收到一批時，只讓整條展示佇列最後一個收尾；否則前一批會提早收回合。
      if (!remotePresentationQueue.some((queued) => queued.kind === 'step')) {
        try { item.run(); } catch (error) { console.error('連線演出收尾失敗', error); }
      }
      pumpRemotePresentation();
      return;
    }
    // 演出只是畫面，丟例外也要接著演下一項：不然佇列永遠停在「演出中」，
    // 同伴之後的動作與收回合都不會再演，這位玩家整場卡住（稽核 2026-09-21 晚 中-4）
    // 算這一項要等多久也包進來（2026-09-23 稽核 低-2）：它會去查動作長度，資料不齊一樣會丟，丟了佇列同樣永遠停住、收尾那一項輪不到
    let wait: number;
    try {
      item.play();
      wait = resolveCombatMotionPresentationWait(item.wait);
    } catch (error) {
      console.error('連線演出失敗，跳過這一項', error);
      recoverPresentation();
      pumpRemotePresentation();
      return;
    }
    if (wait <= 0) { pumpRemotePresentation(); return; }
    const timer = window.setTimeout(() => {
      motionImpactTimers.delete(timer);
      pumpRemotePresentation();
    }, wait);
    motionImpactTimers.add(timer);
  };

  const enqueueRemotePresentation = (...items: RemotePresentationItem[]): void => {
    remotePresentationQueue.push(...items);
    if (!remotePresentationRunning) pumpRemotePresentation();
  };

  app.disposers.push(() => {
    remotePresentationQueue.length = 0;
    remotePresentationRunning = false;
  });

  function act(fn: () => void, opts: ActOptions = {}): void {
    const before = snap(cs, my());
    hint = '';
    fn();
    settle(before, opts);
  }

  /**
   * 這一拍發動過的秘寶：狀態列那一格閃一下金光，名字往下浮一下。
   *
   * 為什麼要做：秘寶的效果都是靜悄悄套上去的，玩家看到的只有「數字變了」，
   * 不知道是誰做的，久了就以為那件秘寶沒作用（使用者 2026-09-10 指定要補）。
   *
   * **演出要撐得過重畫，所以狀態記在這裡、節點每次重新掛**（稽核 2026-09-10 高-1）。
   * 原本是掛完就走，但 `patchField`／`render` 都會把整條 `.hud` 拆掉重建，而一般小怪沒有出招預告
   *（`telegraphNext()` 只對大魔物與塔主回真），`runEnemyTurn` 的下一個 `step()` 是**同步**接著跑的——
   * 名牌從掛上去到被丟掉全在同一個工作裡，瀏覽器連一次都還沒重繪。受害的正好是
   * 「這回合沒出攻擊牌」那五件（尾巴鈴、止水碗、羽毛玩具、木魚、風鈴），本來就最沒手感的那批。
   * 改成：`flashing` 記著「還在演的是哪幾件、從什麼時候開始演」，每次 `flashRelics` 被叫到
   *（它本來就排在每一次重畫之後）就照現在的狀態列重掛一次，並用**負的 `animation-delay`**
   * 讓動畫從該有的進度接著演，而不是每次都從頭開始。
   */
  const FLASH_MS = 1050;
  /** 還在演的秘寶：`row` 是它在名牌那一疊的第幾行，重掛時要維持住才不會上下跳 */
  const flashing: { id: string; start: number; row: number }[] = [];
  let flashTimer: number | undefined;
  app.disposers.push(() => { if (flashTimer !== undefined) window.clearTimeout(flashTimer); });

  /** 這件秘寶是「代價」不是「好處」嗎：開場扣血或給自己減益的（鐵砂衣、魔氣護符、黑貓面具） */
  function isCostRelic(id: string): boolean {
    const fx = relicById[id]?.hooks.combatStart;
    if (!fx) return false;
    return fx.some((e) => e.kind === 'selfDamage'
      || (e.kind === 'status' && e.target === 'self' && DEBUFFS.includes(e.name)));
  }

  /**
   * 把還在演的全部照現在的狀態列重掛一次。`now` 決定每一張要從動畫的哪一格接著演。
   *
   * **每一條重畫的路徑最後都要叫它**（稽核 2026-09-10 複核 中-1），不能只掛在結算那條：
   * `render()` 另外有十個不經過 `settle` 的呼叫點（點牌選目標、Esc 取消、關教學、右鍵…），
   * 每一個都會 `clear(root)` 把整條狀態列連同名牌丟掉。回合開始的秘寶正在演的那 0.3 秒裡
   * 玩家點一張要選目標的牌，金光就當場消失、而且不會再回來。
   */
  function paintFlashes(now: number): void {
    const hud = root.querySelector<HTMLElement>('.hud');
    if (!hud) return;
    for (const stale of hud.querySelectorAll('.relic-pop')) stale.remove();
    const more = hud.querySelector<HTMLElement>('.hud-relic-more');
    const live = new Set<HTMLElement>();
    for (const f of flashing) {
      const def = relicById[f.id];
      /*
       * **同伴的秘寶不要演在我的狀態列上**（2026-09-13 稽核 低-5）。
       *
       * `cs.relicFired` 是整場共用的，加入方的 `combatStart` 補上之後，裡面就多了
       * 同伴那十幾件。我身上沒有的那幾件查不到格子，就會退回下面的「+N」——
       * 於是我帶滿九件（有「+N」那顆）時，同伴的斗笠、鐵項圈會在我的「+N」上浮出名牌，
       * 看起來像我身上有那些東西。八件以內是靜靜跳過，所以平常看不出來。
       */
      if (!my().relics.includes(f.id)) continue;
      // 滿八件之後其餘收成一顆「+N」，找不到自己的格子就閃那顆（使用者 2026-09-10：
      // 「秘寶現在上面超過會堆疊起來，會不會 HUD 看不到？」）
      const slot = hud.querySelector<HTMLElement>(`.hud-relic[data-relic="${f.id}"]`) ?? more;
      if (!def || !slot) continue;
      const elapsed = now - f.start;
      const delay = f.row * 90 - elapsed;
      /**
       * 格子的金光**只有在這個節點還沒開始演的時候才設**（稽核 2026-09-10 複核 低-1、低-3）。
       * 重畫過的節點是全新的，動畫從零開始，負延遲正好把它推到該有的進度；
       * 但 `tickFlashes` 那條路沒有人重畫，同一個工作裡把 `.fired` 拿掉再加回去不會重啟動畫，
       * 再寫一次延遲等於把進度往前跳。用 `data-fired-at` 認節點：對得上就別碰。
       * 好幾件都落在同一顆「+N」上時也只由**第一筆**負責，不然最後一件會把延遲蓋掉。
       */
      if (!live.has(slot)) {
        live.add(slot);
        if (slot.dataset['firedAt'] !== String(f.start)) {
          slot.dataset['firedAt'] = String(f.start);
          slot.style.animationDelay = `${delay}ms`;
          slot.classList.add('fired');
        }
      }
      const pop = el('span', { class: `relic-pop${isCostRelic(f.id) ? ' cost' : ''}` }, def.name);
      /**
       * 一次好幾件時要**排成一疊**，不能只錯開時間。兩種撞法都真的會發生：
       * ①收在「+N」裡的好幾件同時發動，名牌會疊在同一顆鈕底下；
       * ②開場秘寶有 17 件帶 `combatStart`，帶三五件時各自的格子只隔 44 像素，
       * 但名牌是照字寬長的（「沙丁魚罐」比格子寬得多），左右一定會咬到。
       * 照 `row` 一行一行往下掛就都解決了，每行 22 像素。
       *
       * 金光跟名牌用**同一個延遲**（稽核 2026-09-10 低-12）：原本金光一律不延遲、名牌才錯開，
       * 帶六件開場秘寶時第六個名字浮出來的當下，那一格的光早就滅了。
       */
      pop.style.animationDelay = `${delay}ms`;
      if (f.row > 0) pop.style.marginTop = `${4 + f.row * 22}px`;
      slot.append(pop);
    }
    // 已經演完的把類別與行內樣式一起清掉，別留在節點上（稽核 2026-09-10 複核 低-3）
    for (const lit of hud.querySelectorAll<HTMLElement>('.fired')) {
      if (live.has(lit)) continue;
      lit.classList.remove('fired');
      lit.style.removeProperty('animation-delay');
      delete lit.dataset['firedAt'];
    }
  }

  /** 到期的清掉、重畫一次；還有在演的就再約下一次 */
  function tickFlashes(): void {
    flashTimer = undefined;
    if (app.cs !== cs) return;   // 畫面已經換掉：這一場的演出不用再管了
    const now = performance.now();
    for (let i = flashing.length - 1; i >= 0; i--) if (now - flashing[i]!.start >= FLASH_MS + flashing[i]!.row * 90) flashing.splice(i, 1);
    paintFlashes(now);
    scheduleFlashTick(now);
  }

  function scheduleFlashTick(now: number): void {
    if (flashTimer !== undefined || !flashing.length) return;
    const next = Math.min(...flashing.map((f) => f.start + FLASH_MS + f.row * 90 - now));
    flashTimer = window.setTimeout(tickFlashes, Math.max(16, next));
  }

  function flashRelics(before: { relicFiredLen: number }): void {
    const now = performance.now();
    for (let i = flashing.length - 1; i >= 0; i--) if (now - flashing[i]!.start >= FLASH_MS + flashing[i]!.row * 90) flashing.splice(i, 1);
    // 同一拍同一件發動兩次只演一次：閃兩次看起來像畫面在抖
    for (const id of new Set(cs.relicFired.slice(before.relicFiredLen))) {
      if (!relicById[id]) continue;
      // 上一拍才演過、還沒收尾的就**接續**，不要再推一筆（稽核 2026-09-10 複核 低-4）：
      // 影披風連打兩張隱身牌、貓抓板連續出攻擊牌，一秒內兩次就會看到同一個名字上下排兩行
      const again = flashing.find((f) => f.id === id);
      if (again) { again.start = now; continue; }
      // 行號取「目前沒人佔的最小一行」，這樣先到期的空出來的位置會被接著用，不會愈疊愈長
      const used = new Set(flashing.map((f) => f.row));
      let row = 0; while (used.has(row)) row += 1;
      flashing.push({ id, start: now, row });
    }
    paintFlashes(now);
    scheduleFlashTick(now);
  }

  function settle(before: Snap, opts: ActOptions = {}): void {
    const comparison = opts.comparison;
    const comparedPhase = comparison?.phase ?? cs.phase;
    // 結束回合那一拍，魔物出手與新手牌是同一次重畫。手牌立刻滑進來會跟魔物前撲擠在一起，
    // 所以那一拍讓手牌晚 460 毫秒再進場：先看牠們打完，再看自己摸到什麼。
    // 打完了就不要再演發牌（稽核 2026-09-10 低-3）：`runEnemyTurn` 收尾一律傳 `deal: true`，
    // 不看勝負，於是球球倒下的那一拍照樣放一聲「新回合開始」的提示音，跟畫面完全對不上。
    dealDelay = opts.deal && cs.phase === 'player' ? 460 : 0;
    // 新回合的手牌全部當成新抽的：上一手沒打完的牌丟進棄牌堆後洗回來、或被拖字訣留下的那張，
    // 編號跟上一手一樣，會被當成「已經在手上」直接出現在定位，其他牌卻還在從牌堆飛——
    // 使用者 2026-09-02：「最後一張牌已經出現，其他牌才從左邊飛出來」
    if (opts.deal) shownCards.clear();
    const posePref = opts.pose;
    const p = my();
    // 這一拍退了幾顆飯糰（追擊）。側欄下一次畫的時候會把那幾顆演成「跳回來」
    energyRefund = Math.max(0, (comparison?.energyGain ?? cs.energyGain) - before.energyGain);
    const fresh = opts.freshLog ? [...opts.freshLog] : cs.log.slice(before.logLen);
    const comparedPlayer = comparison?.players.get(mySeat);
    const comparedHp = comparedPlayer?.hp ?? p.hp;
    const comparedBlock = comparedPlayer?.block ?? p.block;
    const hurt = comparedHp < before.hp;
    /*
     * 魔物對每一位做了什麼（擋下、閃過、塞牌、看破、吹散）照**座位**看數字，不讀戰報句子（2026-09-23 health H-1）：
     * 句子 09-15 多了名字之後，連線時自己擋下的演出整個不見；兩位同角色時「球球閃過了」也分不出是誰。
     * 判斷在 seat-feedback.ts（純函式、用引擎實跑測過）。連線重播那條走 `comparison`，跟上面的血與蜷縮同一套
     */
    const feedbackOf = (q: PlayerCombat) => seatFeedback(before.players.get(q.seat),
      comparison?.players.get(q.seat) ?? seatFeedbackSnap(q));
    const myFeedback = feedbackOf(p);
    const dodged = myFeedback.dodged;
    const hungry = cs.phase === 'player' && p.energy === 0 && hungryTurn !== cs.turn
      && p.hand.some((c) => cardStats(c).cost > 0);
    // 姿勢優先序：分出勝負 ＞ 挨打 ＞ 閃過 ＞ 蜷縮 ＞ 這張牌 ＞ 餓扁 ＞ 待機。先決定再畫，姿勢才看得到。
    // 蜷縮排在牌姿勢前面：擋下傷害這件事比「剛剛打的是哪張牌」更該讓玩家看到。
    // 攻擊牌例外（交出來會奪走蜷縮），那種時候還是要看到出招的姿勢。
    const enemyActed = cs.enemies.some((e) => { const b = before.enemies.get(e.uid); const a = comparison?.enemies.get(e.uid); return !!b && (a?.turnCount ?? e.turnCount) !== b.turnCount; });
    if (comparedPhase === 'won') pose = POSE.win;
    else if (comparedPhase === 'lost') pose = posePick(heroOf(my()), 'down', POSE.lose);   // 圖沒生好就退回站著垂頭的落敗圖
    // 自己出手那一拍（posePref 有值）牌的姿勢優先：鐵頭功、亡命這些自傷牌不然永遠看不到頭槌圖，
    // 自傷本身靠球球身上的紅閃與飄數字表現就夠了（2026-09-08）。魔物打過來的挨打照舊排最前面
    else if (hurt && !posePref) pose = POSE.hit;
    else if (dodged) pose = POSE.dodge;
    // 敵人打過來被蜷縮整個擋掉：切抱胸格擋——這張早就畫好卻沒人用（2026-09-08）。
    // 只認「這一拍有魔物出手、血沒掉、我擋下了點數」；自己回合疊蜷縮走下一條的 curl
    else if (enemyActed && myFeedback.blocked > 0 && hasHeroSprite(my().hero, POSE.guard)) pose = POSE.guard;
    else if (comparedBlock > before.block && !opts.attack) pose = POSE.curl;
    else if (posePref) pose = posePref;
    else if (hungry) pose = POSE.hungry;
    const motionDecision = qiuqiuCombatMotionDecision(comparedPhase, !!opts.motion, !!opts.motionAlreadyPlaying);
    if (motionDecision === 'play' && opts.motion) {
      playMotion(mySeat, opts.motion, opts.motionTrip, 0, false, opts.motionToken);
    }
    // 本人改出靜態招式時交還立繪；一般更新與已播放動作的確認保留原演出。
    else if (motionDecision === 'stop'
      || (posePref !== undefined && !opts.motion && !opts.motionAlreadyPlaying)) idleMotion(mySeat);
    const impactMotion = opts.impactMotion ?? opts.motion;
    const impactPlayer = cs.players[opts.impactSeat ?? mySeat];
    const impactSource = impactPlayer ? motionSourceFor(impactPlayer) : undefined;
    const impactElapsed = opts.impactElapsed ?? 0;
    const impactPresentationToken = opts.impactPresentationToken ?? opts.motionToken;
    const impactApproach = opts.impactApproach ?? opts.motionTrip?.plan.approachMs ?? 0;
    const delayedImpact = impactMotion !== undefined && impactSource !== undefined
      && motionImpactDelay(impactSource, impactMotion) > 0;
    if (delayedImpact && !opts.pendingPrepared) for (const e of cs.enemies) {
      const b = before.enemies.get(e.uid);
      const a = comparison?.enemies.get(e.uid);
      const afterHp = a?.hp ?? e.hp;
      const afterDead = a?.dead ?? e.dead;
      if (b && b.hp > afterHp) motionPendingDamage.set(e.uid, (motionPendingDamage.get(e.uid) ?? 0) + b.hp - afterHp);
      if (!b?.dead && afterDead) {
        const src = root.querySelector<HTMLImageElement>(`.unit.enemy[data-uid="${e.uid}"] .sprite`)?.src;
        if (src) motionHeldSprites.set(e.uid, src);
        fallingUids.add(e.uid);
      }
    }
    // 魔物的姿勢也要在畫之前決定。「這一拍有沒有出手」看回合數有沒有往前走：
    // 挨打與閃避（`hurt || dodged`）認不出「攻擊被蜷縮整個擋掉」與「裝死術免疫」那兩種也確實出手的情形。
    acting = new Map();
    hurtSet = new Set();
    for (const e of cs.enemies) {
      const b = before.enemies.get(e.uid);
      const a = comparison?.enemies.get(e.uid);
      const afterHp = a?.hp ?? e.hp;
      const afterDead = a?.dead ?? e.dead;
      const afterTurnCount = a?.turnCount ?? e.turnCount;
      if (b && afterHp < b.hp && !delayedImpact) hurtSet.add(e.uid);
      if (b && !b.dead && afterDead && !delayedImpact && comparedPhase === 'won' && enemyById[e.enemyId]?.pool === '塔主' && encounterById[cs.encounterId]?.pool === '塔主') bossFallUids.add(e.uid);
      if (!b || afterDead || afterTurnCount === b.turnCount || b.noAct) continue;
      // 調息中的那一拍不算出手：中毒在他回合開頭把血條打光，回合數照樣推進、他卻沒出招，
      // 前撲掛上去會變成盤腿打坐的人往前滑一下（稽核 2026-09-08 低 2）
      acting.set(e.uid, { label: b.label, attacked: b.intent === 'attack' && e.invulnIn === 0, blocked: b.intent === 'block' && e.invulnIn === 0, learned: b.learned });
    }
    // 逐隻演出的每一步只換有變動的單位（light）：整頁重畫會把所有立繪的呼吸動畫重來、背景重貼，
    // 每 0.7 秒抖一下就是使用者說的「嚴重卡頓感」（2026-09-03 晚）。換不了（有新召喚的）才整頁重畫。
    if (!(opts.light && patchField(before))) render();
    flashRelics(before);
    for (const q of cs.players) {
      const source = motionSourceFor(q);
      if (!source) continue;
      const was = before.players.get(q.seat);
      const after = comparison?.players.get(q.seat);
      if (!was) continue;
      const afterHp = after?.hp ?? q.hp;
      const afterBlock = after?.block ?? q.block;
      const afterStealth = after?.stealth ?? getStatus(q, '隱身');
      const afterDown = after?.down ?? q.down;
      if (afterDown || comparedPhase === 'lost') { idleMotion(q.seat); continue; }
      let reaction: CombatMotionAction | undefined;
      if (qiuqiuShouldPlayHurt({
        reactionSeat: q.seat,
        beforeHp: was.hp,
        afterHp,
        outgoingSeat: opts.impactSeat ?? mySeat,
        hasOutgoingMotion: impactMotion !== undefined || opts.pose !== undefined || opts.impactSeat !== undefined,
      })) reaction = 'hurt';
      else if (afterStealth < was.stealth) reaction = source === 'qiuqiu' || source === 'feifei' ? 'roll' : 'dodge';
      // 擋下的點數照座位記，同伴那格也認得（原本只有自己認得出、而且連線時連自己都認不出，health H-1）
      else if (enemyActed && afterHp === was.hp && (afterBlock < was.block
        || feedbackOf(q).blocked > 0)) reaction = 'guard';
      // 本張牌／忍具已選好演出；回血只是效果，不能把太極或反擊改成吃飯。
      // 自己正在出招（不是反應動作）時，同伴幫忙回血也不能把招式切成吃飯、人瞬間回原位（稽核 2026-09-21 晚 低-7）
      else if (afterHp > was.hp && !(q.seat === (opts.impactSeat ?? mySeat)
        && (opts.pose !== undefined || impactMotion !== undefined || opts.impactSeat !== undefined))
        && !(motionActors.get(q.seat)?.active && !motionActors.get(q.seat)?.reactive)) reaction = 'eat';
      const state = motionActors.get(q.seat);
      if (reaction) playMotion(q.seat, reaction, undefined, 0, true);
      else if (comparedPhase === 'won' && !state?.active) idleMotion(q.seat);
    }
    // 丟出去的東西（2026-09-22 批次 proj）：原本只有球球的手裏劍、菲菲的飛針，噹噹、封封丟東西什麼都不飛。
    // 牌與忍具決定飛什麼（`opts.impactProjectile`）；沒帶的沿用動作預設。飛法與起點在 projectile-flight.ts
    const shot = resolveProjectileShot(impactSource, impactMotion, opts.impactProjectile);
    // 忍具要在紀錄裡真的「用了」才飛：連線客戶端送出那一拍狀態還沒變，要等主機套用那一拍（狀態類忍具沒有傷害紀錄可認）
    const shotUsed = shotUsedIn(shot, fresh, (id) => potionById[id]?.name);
    const throwing = shot !== undefined;
    const echoing = impactSource === 'feifei'
      ? impactMotion === 'clone'
      : impactMotion === 'clone' || impactMotion === 'clone_duo' || impactMotion === 'ultimate_clone';
    const throwHome = throwing ? root.querySelector<HTMLElement>(`.unit.player[data-seat="${opts.impactSeat ?? mySeat}"] .sprite-box`) : null;
    const throwFoot = throwHome ? motionFoot(throwHome) : undefined;

    // 畫完才把動畫類別與浮動數字掛到剛生出來的節點上
    let stagedMax = 0;   // 本拍最多分幾段：收姿勢與倒下的演出都要排在最後一段之後
    let lastMotionImpact = 0;
    let confirmedMotionWaves = 0;
    // 丟東西打到帶刺的魔物（2026-09-23 polish，主控裁定）：還有幾個帶刺的目標沒被打到；最後一個打到時才演「被刺」（revealThorns，迴圈後面才決定）
    let thornFlights = 0;
    let revealThorns: (() => void) | undefined;
    for (const e of cs.enemies) {
      const b = before.enemies.get(e.uid);
      const a = comparison?.enemies.get(e.uid);
      const node = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${e.uid}"]`);
      if (!b || !node) continue;
      // 攻擊牌打出多段（連環踢 5×3）：照引擎記下來的每一段，一下一下演——原本只彈一個總數，
      // 玩家看到的是「直接扣 15」而不是三下（使用者 2026-09-05）。丟擲類忍具也帶 attack（針雨 4×3 一樣分段）；
      // 單段、反彈、中毒那些照舊走下面
      const allImpactHits = opts.impactHits ?? cs.hits.slice(before.hitsLen);
      const enemyHits = allImpactHits.filter((h) => h.uid === e.uid);
      const afterHp = a?.hp ?? e.hp;
      const afterDead = a?.dead ?? e.dead;
      const afterBlock = a?.block ?? e.block;
      const afterStealth = a?.stealth ?? getStatus(e, '隱身');
      const afterChoke = a?.choke ?? getStatus(e, '中毒');
      const hpDamage = Math.max(0, b.hp - afterHp);
      const killed = !b.dead && afterDead;
      const enemySurvived = !afterDead;
      const poisoned = hpDamage > 0 && chokeTick(afterChoke, b.choke);
      const heavy = hpDamage >= 12;
      // 同名魔物共用文字紀錄；只有本次確實被命中的那隻才演格擋（全擋成 0 也有命中紀錄）。
      const guarded = qiuqiuEnemyBlocked(b.block, afterBlock, enemyHits.length);
      const evaded = enemySurvived && afterStealth < b.stealth && hpDamage === 0;
      // 閃避不會寫入 hits；每一層實際消耗的隱身都要補回原來節拍。
      const leadingMisses = qiuqiuConsumedStealth(b.stealth, afterStealth);
      const motionAttack = impactMotion !== undefined && ((opts.impactAttack ?? opts.attack ?? false) || throwing || echoing);
      let impactPlan = impactMotion && impactSource && motionAttack
        ? buildCombatMotionImpactPlan(impactSource, impactMotion, allImpactHits, e.uid, leadingMisses)
        : [];
      // 麻繩、定身釘、貓薄荷球沒有傷害紀錄，照忍具丟向誰排一波（2026-09-22 批次 proj）：原本沒有命中計畫就不飛
      if (impactPlan.length === 0 && shotAimsAt(shot, e.uid) && shotUsed && impactSource && impactMotion && !b.dead) {
        impactPlan = [{ at: motionImpactDelay(impactSource, impactMotion), amount: hpDamage, pendingAfter: 0 }];
      }
      if (impactPlan.length === 0 && impactSource === 'feifei' && impactMotion) {
        impactPlan = buildFeifeiStatusImpactPlan(impactMotion as CompanionMotionAction, {
          hp: b.hp, dead: b.dead, debuff: b.debuff,
        }, {
          hp: e.hp, dead: e.dead, debuff: sumStatus(e, BAD_STATUS),
        }, a ? {
          hp: a.hp, dead: a.dead, debuff: a.debuff,
        } : undefined);
      }
      confirmedMotionWaves = extendConfirmedMotionWaves(confirmedMotionWaves, impactPlan);
      const staged = impactPlan.length > 0
        ? impactPlan.map((impact) => impact.amount)
        : opts.attack || throwing ? enemyHits.map((hit) => hit.amount) : [];
      if (staged.length > 1) stagedMax = Math.max(stagedMax, staged.length);
      const finalImpactAt = impactPlan.at(-1)?.at ?? 0;
      if (finalImpactAt > 0) lastMotionImpact = Math.max(lastMotionImpact,
        Math.max(0, impactApproach + finalImpactAt - impactElapsed));
      const bossDeath = killed && comparedPhase === 'won' && enemyById[e.enemyId]?.pool === '塔主' && encounterById[cs.encounterId]?.pool === '塔主';
      let impactSprite: string | undefined;
      if (hpDamage > 0) {
        const held = motionHeldSprites.get(e.uid);
        if (held) motionHeldSprites.delete(e.uid);
        hurtSet.add(e.uid);
        impactSprite = enemySprite(e, enemyById[e.enemyId]);
        if (delayedImpact) hurtSet.delete(e.uid);
        if (held) motionHeldSprites.set(e.uid, held);
      }
      const showImpact = (target: HTMLElement, amount = hpDamage, wave?: number): void => {
        if (amount > 0) {
          if (delayedImpact) {
            const pending = Math.max(0, (motionPendingDamage.get(e.uid) ?? 0) - amount);
            if (pending) motionPendingDamage.set(e.uid, pending); else motionPendingDamage.delete(e.uid);
            target.querySelector('.hpbar')?.replaceWith(hpBar(`e${e.uid}`, e.hp + pending, e.maxHp));
          }
          const keepStanding = e.dead && (motionPendingDamage.get(e.uid) ?? 0) > 0;
          if (!keepStanding) motionHeldSprites.delete(e.uid);
          hurtSet.add(e.uid);
          playEnemyMotion(e.uid, 'hurt');
          const img = target.querySelector<HTMLImageElement>('.sprite');
          if (img && impactSprite && !keepStanding) img.src = impactSprite;
          if (!delayedImpact && wave === undefined && staged.length > 1) stageHits(target, staged);
          else {
            target.classList.remove('hit');
            void target.offsetWidth;
            target.classList.add('hit');
            const num = floatNum(`-${amount}`);
            if (wave !== undefined) num.style.marginLeft = `${(wave - (staged.length - 1) / 2) * 28}px`;
            target.append(num);
            if (!impactMotion || !playAttackImpactAccent(target, impactMotion, wave ?? 0)) {
              burst(target, poisoned ? 'poison' : opts.attack || throwing ? 'slash' : 'hit');
            }
            sfx(poisoned ? 'poison' : throwing ? 'hit' : opts.attack ? (heavy ? 'hit_heavy' : 'claw') : 'hit',
              poisoned ? 1 : 0.94 + Math.random() * 0.12);
          }
        } else if (impactSource === 'feifei' && impactMotion === 'clone' && wave !== undefined) {
          target.classList.remove('hit');
          void target.offsetWidth;
          target.classList.add('hit');
          burst(target, 'poison');
          sfx('poison');
        }
        if (enemySurvived && guarded > 0 && (wave === undefined || wave === 0)) {
          target.append(floatNum(`擋住 ${guarded}`, 'blocked'));
          burst(target, 'block');
          if (hpDamage === 0) sfx('blocked');
        }
        if (throwing && wave !== undefined && wave > 0 && amount === 0 && guarded > 0) { burst(target, 'block'); sfx('blocked'); }
        if (wave !== undefined ? wave < leadingMisses : evaded) target.append(floatNum('閃過！'));
      };
      const throwBox = node.querySelector<HTMLElement>('.sprite-box');
      const throwFlight = throwing && throwFoot && throwBox && !b.dead && impactPlan.length > 0;
      // 掙脫定身、上了減益：丟出去的東西（忍具與牌）要等東西飛到才演，其餘照舊當場演
      const brokeFree = fresh.some((l) => l === `${e.name}掙脫了定身`);
      let statusToken = 0;   // 這一趟在 motionPendingStatus 裡那一筆的序號（下面決定要不要記）
      const landStatus = (target: HTMLElement): void => {
        // 飛到了才換上真的狀態牌子（定身、懶洋洋⋯⋯）與「被定住了」（2026-09-23 polish 第 3 條，見 motionPendingStatus）；
        // 只拿掉這一趟自己那一筆，連丟兩張時第二趟的還留著（推前審查 低-1）
        if (statusToken && dropPending(motionPendingStatus, e.uid, statusToken)) refreshEnemyStatus(target, cs.enemies.find((x) => x.uid === e.uid) ?? e);
        if (brokeFree) {
          target.append(floatNum('掙脫！'));
          burst(target, 'smoke');
          sfx('dodge');
        }
        if ((a?.debuff ?? sumStatus(e, BAD_STATUS)) > b.debuff) burst(target, 'debuff');
      };
      // 原本只有忍具（帶 aim）才等；主控 2026-09-23 裁定丟出去的牌也一樣（毒砂的中毒、絆索的炸毛、點穴手的定身）
      const statusByFlight = !!throwFlight;
      // 狀態牌子也等東西飛到：剛才那次重畫已經照引擎掛上定身、中毒、扣了防禦，先換回出手前的樣子，landStatus 再換回來
      if (statusByFlight && (b.block !== e.block || STATUS_ORDER.some((name) => (b.statuses[name] ?? 0) !== getStatus(e, name)))) {
        statusToken = ++pendingSeq;
        pushPending(motionPendingStatus, e.uid, { token: statusToken, statuses: b.statuses, block: b.block });
        // 剛才那次重畫已經把「被定住了」記成上一次的牌面，換回去會被當成換招、繩子飛行中翻一次牌（實機膠卷）；
        // 忘掉它，飛到那一刻才翻
        lastIntent.delete(e.uid);
        refreshEnemyStatus(node, e);
      }
      let throwFall: (() => void) | undefined;
      if (throwFlight && shot && throwFoot && throwBox && impactSource && impactMotion) {
        const foot = motionFoot(throwBox);
        const width = throwBox.querySelector<HTMLElement>('.sprite')?.offsetWidth ?? 130;
        const waves = impactPlan.length;
        // 收姿勢要等最後一波真的打到（2026-09-23 稽核 ui 低-2）：連線加入方丟的東西被 joinElapsed 拉回第一波出手那一刻飛，
        // 命中比上面用 impactElapsed 算的晚 0.1～0.3 秒；照舊算的話最後一兩波還在飛，魔物就先被換回待機
        lastMotionImpact = Math.max(lastMotionImpact, finalImpactAt
          - throwElapsed(impactSource, impactMotion, impactElapsed, impactPlan.map((impact) => impact.at)));
        // 這隻身上帶刺、這一拍又被打中：出手的那一位會被刺回來，等這一趟飛到才演（見 revealThorns）
        const pricks = (b.statuses['反彈'] ?? 0) > 0 && enemyHits.length > 0;
        if (pricks) thornFlights += 1;
        const onImpact = (wave: number): void => {
          if (app.cs !== cs) return;
          const live = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${e.uid}"]`);
          if (live) showImpact(live, impactPlan[wave]?.amount ?? 0, wave);
          if (live && statusByFlight && wave === waves - 1) landStatus(live);
          if (wave === waves - 1) throwFall?.();
          if (pricks && wave === waves - 1 && --thornFlights === 0) revealThorns?.();
        };
        let cancel: () => void = () => undefined;
        cancel = playThrow(app.stage, impactSource, impactMotion, shot, throwFoot, { x: foot.x, y: foot.y - width * 0.55 }, {
          waves,
          elapsed: impactElapsed,
          impactTimes: impactPlan.map((impact) => impact.at),
          onImpact,
          onDone: () => { motionProjectiles.delete(cancel); },
        });
        motionProjectiles.add(cancel);
      } else if (delayedImpact && impactMotion && impactPlan.length > 0) {
        impactPlan.forEach((impact, wave) => scheduleMotionImpactAt(impact.at, () => {
          const live = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${e.uid}"]`);
          if (live) showImpact(live, impact.amount, wave);
        }, impactElapsed, impactApproach));
      } else if (delayedImpact && impactMotion && (hpDamage > 0 || guarded > 0 || evaded)) {
        scheduleMotionImpact(impactSource!, impactMotion, () => {
          const live = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${e.uid}"]`);
          if (live) showImpact(live);
        }, impactElapsed, impactApproach);
      } else showImpact(node);
      if (echoing && impactMotion && impactPlan.length > 0 && throwBox && !b.dead) {
        const foot = motionFoot(throwBox);
        const width = throwBox.querySelector<HTMLElement>('.sprite')?.offsetWidth ?? throwBox.offsetWidth;
        let cancel: () => void = () => undefined;
        cancel = impactSource === 'feifei'
          ? playFeifeiClone(app.stage, { x: foot.x, y: foot.y, width }, {
              elapsed: impactElapsed,
              onDone: () => { motionProjectiles.delete(cancel); },
            })
          : playQiuqiuEchoes(app.stage, impactMotion as QiuqiuAction, { x: foot.x, y: foot.y, width }, {
              impactTimes: impactPlan.map((impact) => impact.at),
              elapsed: impactElapsed,
              onDone: () => { motionProjectiles.delete(cancel); },
            });
        motionProjectiles.add(cancel);
      }
      // 反彈回敬的那幾下：飄「反彈！」＋刺一聲，被反彈打死的才看得出是怎麼死的
      if (fresh.some((l) => l.startsWith(`反彈回敬了${e.name} `))) {
        node.append(floatNum('反彈！', 'thorn'));
        sfx('thorns');
      }
      if (!statusByFlight) landStatus(node);
      if (!brokeFree && afterHp > b.hp) burst(node, 'heal');
      // 倒下的一團煙晚 160 毫秒放：讓最後那下的斬擊先看完，再看牠化成煙
      // 關主的白閃慢倒不放小怪化煙的煙與音效（調性不合，稽核 2026-09-04 低 22）
      // 分段演出時倒下要等最後一段打完再演，不然溶解跟煙會插在三段中間、最後那下的數字反而看不到（稽核 2026-09-05 夜 高-1）
      if (killed) {
        const beginFall = (): void => {
          motionHeldSprites.delete(e.uid);
          const target = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${e.uid}"]`);
          if (!target) { fallingUids.delete(e.uid); disposeEnemyMotion(e.uid); return; }
          if (bossDeath) { bossFallUids.add(e.uid); target.classList.remove('gone'); target.classList.add('boss-fall'); }
          const fall = (live: HTMLElement): void => {
            fallingUids.delete(e.uid);
            live.classList.remove('falling');
            if (bossFallUids.has(e.uid)) sfx('enemy_down');
            else { live.classList.add('dead'); burst(live, 'smoke', 160); sfx('enemy_down'); }
            finishEnemyMotion(e.uid);
          };
          const after = !delayedImpact && !throwFlight && staged.length > 1 ? (staged.length - 1) * 150 : 0;
          if (after <= 0) { fall(target); return; }
          fallingUids.add(e.uid);
          target.classList.add('falling');
          scheduleMotionImpactAt(after, () => {
            if (app.cs !== cs) return;
            const live = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${e.uid}"]`);
            fallingUids.delete(e.uid);
            if (live) fall(live);
          });
        };
        if (throwFlight) throwFall = beginFall;
        else if (delayedImpact && finalImpactAt > 0) scheduleMotionImpactAt(finalImpactAt, beginFall, impactElapsed, impactApproach);
        else if (delayedImpact && impactMotion && impactSource) scheduleMotionImpact(impactSource, impactMotion, beginFall, impactElapsed, impactApproach);
        else beginFall();
      }
      // 前撲跟著立繪一起換：兩邊都認同一張 `acting` 表，不會出現「圖換了卻沒動」或反過來
      else if (acting.get(e.uid)?.attacked) {
        node.classList.add('attack');
        // 一整排同時前撲很像機器人；照排列位置各差 110 毫秒，看起來才像各打各的
        const sp = node.querySelector<HTMLElement>('.sprite');
        if (sp) sp.style.animationDelay = enemyTurnRunning ? '0ms' : `${cs.enemies.indexOf(e) * 110}ms`;
      }
      else if (acting.has(e.uid)) node.classList.add('cast');   // 非攻擊招：原地蓄勢一下（樣式在 combat.css），不然看起來像沒動
      // 出招的結果各疊一團光（使用者 2026-09-03：「怪物放特效或格擋完全看不出動作」）：
      // 格擋、增益、蓄力在牠身上；減益、詛咒塞牌、看破在球球身上；召喚的煙在新冒出來的那隻身上
      if (acting.has(e.uid) && !afterDead) {
        if (afterBlock > b.block) burst(node, 'block');
        if ((a?.buff ?? sumStatus(e, GOOD_STATUS)) > b.buff) burst(node, 'buff');
        if ((a?.charged ?? e.charged) && !b.charged) burst(node, 'charge');
      }
      const afterEnemyPhase = a?.phase ?? e.phase;
      if (afterEnemyPhase > b.phase) { bossPhaseTalk(e.enemyId, afterEnemyPhase); phaseBurst(node); }
    }
    /** 挨打那一下：紅閃、邊緣紅暈、飄數字、音效，重的再震一下（被刺那一下延到東西飛到時也走這支） */
    const playerHurtFx = (cat: HTMLElement, amount: number, maxHp: number, poisoned: boolean): void => {
      cat.classList.remove('hit');
      void cat.offsetWidth;
      cat.classList.add('hit');
      // 邊緣紅暈：挨打的訊號要大到用餘光就看得到（受擊姿勢＋抖動一直都有，但視線常在手牌）
      const box = root.querySelector('.combat');
      box?.classList.add('player-hurt');
      window.setTimeout(() => { box?.classList.remove('player-hurt'); }, 500);
      cat.append(floatNum(`-${amount}`));
      burst(cat, poisoned ? 'poison' : 'hit');
      sfx(poisoned ? 'poison' : 'hurt');
      // 挨重擊整個戰場震一下。門檻設在最大生命的 8%，小刮傷不震——
      // 每一下都震反而會麻痺，變成背景雜訊。震的是 .combat 不是舞台：
      // 舞台身上有 transform: scale()，在那裡加動畫會把縮放蓋掉。
      if (amount >= maxHp * 0.08) {
        const shakeBox = root.querySelector<HTMLElement>('.combat');
        shakeBox?.classList.add('shaken');
        window.setTimeout(() => shakeBox?.classList.remove('shaken'), 300);
      }
    };
    /** 蜷縮擋下的部分也要看得到：飄「擋住 N」＋盾牌閃一下＋「鏘」（球球比照魔物） */
    const playerGuardFx = (cat: HTMLElement, amount: number): void => {
      cat.append(floatNum(`擋住 ${amount}`, 'blocked'));
      burst(cat, 'block');
      sfx('blocked');
    };
    // 丟東西打到帶刺的魔物（2026-09-23 polish，主控裁定）：被刺那一下（扣蜷縮、扣血、飄字、紅閃）延到最後一個帶刺的目標被打到。
    // 剛才那次重畫已經照引擎扣掉了，先把血與蜷縮加回去畫；只改演出時機，引擎結算不動，連線兩台各自照這一拍的紀錄演
    const thornSeat = opts.impactSeat ?? mySeat;
    let thornHeld: { seat: number; hp: number; block: number } | undefined;
    if (thornFlights > 0) {
      const pricked = thornPricks(fresh);
      const thrower = cs.players[thornSeat];
      const was = before.players.get(thornSeat);
      const afterHp = comparison?.players.get(thornSeat)?.hp ?? thrower?.hp ?? 0;
      const hp = was ? Math.min(Math.max(0, pricked.total - pricked.blocked), Math.max(0, was.hp - afterHp)) : 0;
      const block = pricked.blocked;
      // 被刺到倒下就不延：倒下的演出（落敗、蜷縮成一團）當場就要走
      if (thrower && !thrower.down && (hp > 0 || block > 0)) {
        thornHeld = { seat: thornSeat, hp, block };
        // 每一趟一筆（推前審查 低-1）：前一張還在飛時又丟一張，兩趟各記各的，不互相蓋掉
        const thornToken = ++pendingSeq;
        pushPending(motionPendingPlayer, thornSeat, { token: thornToken, hp, block });
        lastHpPct.delete(`p${thornSeat}`);   // 剛才那次重畫記的是扣過的長度，不刪的話加回去那一下血條會往上長
        refreshPlayerStatus(thornSeat);
        revealThorns = (): void => {
          // 只拿掉、只演這一趟自己那一份：飄的數字與紅閃跟這一趟被刺的量對得上
          if (app.cs !== cs || !dropPending(motionPendingPlayer, thornSeat, thornToken)) return;
          refreshPlayerStatus(thornSeat);   // 血條從被刺之前滑到之後，淺色殘影照常留一下
          const live = root.querySelector<HTMLElement>(`.unit.player[data-seat="${thornSeat}"]`);
          if (!live || thornSeat !== mySeat) return;   // 同伴那一格平常挨打也只換血條，照舊
          if (block > 0) playerGuardFx(live, block);
          if (hp > 0) playerHurtFx(live, hp, thrower.maxHp, false);
        };
      }
    }
    // 全體攻擊的各目標可能因死亡或隱身而有不同波數；整身動作採全場最大值，不能被最後一隻覆短。
    // 煙霧彈丟在自己腳邊（2026-09-22 批次 proj）：從出手那隻手拋到腳前，落地才冒煙
    if (shot?.aim === 'self' && shotUsed && throwFoot && impactSource && impactMotion) {
      const seat = opts.impactSeat ?? mySeat;
      let cancel: () => void = () => undefined;
      // 落點在出手那隻手的正下方稍微前面（手在腳底往前 110～132）：往下摔在腳前，不是往後丟
      cancel = playThrow(app.stage, impactSource, impactMotion, shot, throwFoot, { x: throwFoot.x + 140, y: throwFoot.y - 6 }, {
        waves: 1,
        elapsed: impactElapsed,
        impactTimes: [motionImpactDelay(impactSource, impactMotion)],
        onImpact: () => {
          if (app.cs !== cs) return;
          const live = root.querySelector<HTMLElement>(`.unit.player[data-seat="${seat}"]`);
          if (live) { burst(live, 'smoke'); sfx('dodge'); }
        },
        onDone: () => { motionProjectiles.delete(cancel); },
      });
      motionProjectiles.add(cancel);
    }
    if (impactSource && impactMotion && confirmedMotionWaves > 0) {
      const impactSeat = opts.impactSeat ?? mySeat;
      const totalDuration = motionDuration(impactSource, impactMotion, confirmedMotionWaves);
      let state = motionActors.get(impactSeat);
      const matchingPresentation = motionPresentationMatches(
        !!opts.motionAlreadyPlaying,
        impactPresentationToken,
        state?.presentationToken,
      );
      if (shouldResumeConfirmedMotion({
        playedHere: !!opts.motionAlreadyPlaying,
        active: !!state?.active,
        elapsed: impactElapsed,
        duration: totalDuration,
        presentationToken: impactPresentationToken,
        activePresentationToken: state?.presentationToken,
      })) {
        const trip = resizeMotionMeleeTrip(opts.motionTrip ?? state?.trip, totalDuration);
        playMotion(impactSeat, impactMotion, trip, impactElapsed, true, impactPresentationToken);
        state = motionActors.get(impactSeat);
      }
      if (matchingPresentation && state?.active && state.action === impactMotion) {
        state.trip = resizeMotionMeleeTrip(opts.motionTrip ?? state.trip, totalDuration);
        state.actor.play(impactMotion, { elapsed: impactElapsed, waves: confirmedMotionWaves });
        state.endsAt = performance.now() - impactElapsed + (state.trip?.plan.totalMs ?? totalDuration);
      }
    }
    // 多段攻擊時球球的出招圖兩張輪流換（2026-09-08）：跟 stageHits 同一個 150 毫秒節拍，一毫秒都不多花。
    // 第二格用爪擊；這張牌本身就是爪擊的話換成掌推。收姿勢排在最後一段之後（見 hold），不會撞到。
    // 只有出招圖才輪換：最後一段打死最後一隻時 pose 已經是勝利圖，換成爪擊會把勝利圖蓋掉（稽核 2026-09-08 中-1）；
    // 計時器認序號，0.3 秒內連出兩張牌時舊的那組不會把新姿勢改掉（低-1）
    const mine = ++seq;
    // 逐格動作正在演就不換（2026-09-22 晚）：換的是底下被蓋住的靜態立繪，白換；動作收掉後若待機交還靜態立繪，還會把舊出招圖翻出來
    if (opts.attack && stagedMax > 1 && ATTACK_POSES.has(pose) && !motionActors.get(mySeat)?.active) {
      const alt = pose === POSE.claw ? POSE.attack : POSE.claw;
      if (hasHeroSprite(my().hero, alt) && hasHeroSprite(my().hero, pose)) {
        const first = heroArtUrl(my().hero, pose);
        const second = heroArtUrl(my().hero, alt);
        for (let i = 1; i < stagedMax; i++) {
          window.setTimeout(() => {
            if (seq !== mine || app.cs !== cs) return;
            const img = root.querySelector<HTMLImageElement>(`${MINE} .sprite`);
            if (img) img.src = i % 2 ? second : first;
          }, i * 150);
        }
      }
    }
    // 蜷縮加上去的當下讓那個牌子彈一下：光換姿勢還是容易漏看「這回合擋了多少」
    if (comparedBlock > before.block) root.querySelector(`${MINE} .chip.block`)?.classList.add('gain');
    const cat = root.querySelector<HTMLElement>(MINE);
    // 魔物對球球做的事也要在球球身上看得到：被塞牌／被減益／被看破
    if (cat && acting.size > 0 && sumStatus(p, BAD_STATUS) > before.debuff) burst(cat, 'debuff');
    // 被塞牌、被看破打在**中招的那一位**身上（health H-1）：原本比對戰報句子、一律打在自己這格，連線時同伴中招也亮在我身上
    if (acting.size > 0) for (const q of cs.players) {
      const node = root.querySelector<HTMLElement>(`.unit.player[data-seat="${q.seat}"]`);
      const got = feedbackOf(q);
      if (node && got.cursed) burst(node, 'curse');
      if (node && got.stripped) burst(node, 'strip');
    }
    // 剛被召喚出來的：煙
    for (const e of cs.enemies) if (!before.enemies.has(e.uid) && !e.dead) { const n = root.querySelector<HTMLElement>(`.unit.enemy[data-uid="${e.uid}"]`); if (n) burst(n, 'smoke'); }
    // 伏兵是在敵方回合開頭冒出來的，那一拍還沒有人出手，所以不能放在上面那個「有人出招」的區塊裡（稽核 2026-09-04 高 3）
    if (fresh.some((l) => l.startsWith('伏兵'))) toast(lineFor(my().hero, '有伏兵跳出來了喵！'), heroSpeaker(), mySpeech());
    if (cat) {
      // 回血也飄數字：打倒巨型飯糰回 10 只有綠光、看起來像沒回（使用者 2026-09-05）
      if (comparedHp > before.hp) { cat.append(floatNum(`+${comparedHp - before.hp}`, 'heal')); burst(cat, 'heal'); sfx('heal'); }
      if (comparedBlock > before.block) {
        // 逐格踢擊保留蜷縮數字；整面盾牌會遮住轉身與腿部。
        if (impactMotion && impactSource) scheduleMotionImpact(impactSource, impactMotion, () => sfx('block'), impactElapsed, impactApproach);
        else { burst(cat, 'block'); sfx('block'); }
      }
      if (sumStatus(p, GOOD_STATUS) > before.buff) {
        burst(cat, 'buff');
        // 隱身有專屬的一團煙，跟一般增益的亮音分開
        sfx(getStatus(p, '隱身') > before.stealth ? 'stealth' : 'buff');
      }
      if (sumStatus(p, BAD_STATUS) > before.debuff) { burst(cat, 'debuff'); sfx('debuff'); }
      // 破功：疊好的成長被拍散——數字默默變小很容易漏看，飄字＋紫光講清楚
      if (getStatus(p, '爪力') + getStatus(p, '貓步') < before.growth && p.hp === before.hp) {
        cat.append(floatNum('氣勁被拍散！'));
        burst(cat, 'debuff'); sfx('debuff', 0.8);
      }
      // 被吹散手牌（下回合少抽）：飄一句在球球身上，紀錄框裡也有。
      // 看自己的「下回合抽幾張」少了沒（health H-1）：原本找紀錄裡的句子，連線時同伴被吹散也飄在我身上。
      // 只認魔物出手那一拍：回合開始這個數字會歸零，不擋的話上回合多抽一張的也會被當成吹散
      const blown = acting.size > 0 ? myFeedback.blown : 0;
      if (blown > 0) {
        cat.append(floatNum(`下回合少抽 ${blown} 張`, 'bad'));
        burst(cat, 'debuff');
        sfx('debuff', 0.8);
      }
      // 蜷縮擋下的量看引擎記的數字（health H-1：原本比對戰報句首，連線時句子帶名字就認不到）；
      // 被刺那一下延到東西飛到才演（見 thornHeld）：這裡只演扣掉那一下之後剩下的
      const heldHere = thornHeld?.seat === mySeat ? thornHeld : undefined;
      const guarded = myFeedback.blocked - (heldHere?.block ?? 0);
      if (guarded > 0) playerGuardFx(cat, guarded);
      const lost = before.hp - comparedHp - (heldHere?.hp ?? 0);
      if (hurt && lost > 0) playerHurtFx(cat, lost, p.maxHp, chokeTick(getStatus(p, '中毒'), before.choke));
      else if (dodged) cat.classList.add('dodge');
      // 前撲只給攻擊牌（規格 §8.4）：看 opts.attack，不能看有沒有指定姿勢——每張出的牌都會指定姿勢，
      // 拿它當條件的話「淡定」這種防禦牌也會蜷成球又往前撲
      else if (opts.attack) cat.classList.add('attack');
    }

    // 姿勢每回合照舊換；吐槽一場只講一次（總稽核 2026-09-16 丙 中-7：飯糰幾乎每回合都會用完，原本每回合冒一句）
    if (hungry) { hungryTurn = cs.turn; if (!hungryTold) { hungryTold = true; toast(pick(storyFor(my().hero).hungry), heroSpeaker(), mySpeech()); } }
    if (!lowHpTold && p.hp > 0 && p.hp < p.maxHp * 0.3) { lowHpTold = true; toast(pick(storyFor(my().hero).lowHp), heroSpeaker(), mySpeech()); }

    // 姿勢停留時間：一般 650 毫秒看得清楚，但蜷縮例外——它是「縮成一顆球」的靜態姿勢，
    // 沒有前撲、沒有閃紅，650 毫秒閃一下根本來不及看到牠縮起來，拉到 1200。
    // 一排魔物的前撲各錯開 110 毫秒（見下方 animationDelay），停留時間要算進最後一隻撲完的時間，
    // 不然第三隻起會撲到一半被切回待機（稽核 2026-09-03）
    const stagger = Math.max(0, cs.enemies.length - 1) * 110;
    // 蜷縮本來停 1200：使用者 2026-09-03 晚「有點太長，有時候會拖到下一回合」→ 縮到 700，仍比一般姿勢多停一點
    // 分段演出：最後一段在 (段數−1)×150 毫秒掛上、抖 400 毫秒，收姿勢要等它抖完（稽核 2026-09-05 夜 低-3）
    const hold = Math.max(pose === POSE.curl ? 700 : 650, stagger + 560,
      stagedMax > 1 ? (stagedMax - 1) * 150 + 460 : 0,
      lastMotionImpact + 460,
      ...[...motionActors.values()].map((state) => state.endsAt - performance.now() + 30));
    window.setTimeout(() => {
      if (seq !== mine || app.cs !== cs || ended || cs.phase !== 'player') return;
      pose = idlePose();
      acting = new Map();   // 魔物也一起收回待機，出手的立繪只亮這一拍
      hurtSet = new Set();
      // 動畫類別也要一起收。這裡刻意不重畫，`attack`／`hit`／`dodge` 就會留在節點上，
      // 立繪的 animation 停在前撲／抖動跑完的那一格，待機的呼吸動畫回不來——
      // 使用者 2026-09-03：「球球跟師父換動作後不會上下飄動了，定在原地不動」。
      for (const n of root.querySelectorAll('.unit .learned')) n.remove();   // 照著學亮出的牌面跟出招圖同一拍收
      for (const u of root.querySelectorAll<HTMLElement>('.unit.attack, .unit.hit, .unit.dodge, .unit.cast')) {
        u.classList.remove('attack', 'hit', 'dodge', 'cast');
        const sp = u.querySelector<HTMLElement>('.sprite');
        if (sp) sp.style.animationDelay = '';
        // 呼吸回來時就釘在開場的起點（`keepLoops`）：自己從頭起跑的話，下一次整頁重畫釘回去那一下會縮一下（畫面抖動稽核 2026-09-24）
        keepLoops(u, app.loopT0);
      }
      // **就地換圖，不要 render()**：這一拍畫面沒有任何資料變動，只是姿勢收回待機。
      // 呼叫 render() 會把整個戰場重生一次，正在飄的傷害數字（1 秒）會被砍在半路、
      // 倒地與生命條的動畫也一起中斷——「動畫不順」的根就在這裡。
      const cat = root.querySelector<HTMLImageElement>(`${MINE} .sprite`);
      if (cat) cat.src = heroArtUrl(my().hero, pose);
      for (const q of cs.players) if (!motionActors.get(q.seat)?.active) idleMotion(q.seat);
      for (const e of cs.enemies) {
        const img = root.querySelector<HTMLImageElement>(`.unit.enemy[data-uid="${e.uid}"] .sprite`);
        if (img) img.src = enemySprite(e, enemyById[e.enemyId]);
        const enemyMotion = enemyMotionActors.get(e.uid);
        if (!e.dead && (!enemyMotion || enemyMotion.busyUntil <= performance.now())) playEnemyMotion(e.uid, 'idle');
      }
    }, hold);

    if (!opts.deferOver) checkOver();
    syncPicker();
  }

  /**
   * 分出勝負了就收場：吐一句槽、站一下，然後交棒給戰利品畫面。
   *
   * **獨立成一支，而且每個會改到狀態的路徑都要叫**（連線版 2026-09-11 修）。
   * 原本這段埋在 `settle()` 裡面，而客戶端打出最後一張牌時根本走不到：
   * 客戶端的 `act()` 只負責「把動作送出去」，狀態要等主機編號繞回來才真的變，
   * 那時 `settle()` 早就跑完了（那一刻魔物還活著）。繞回來的路徑是 `onApplied`，
   * 它對「自己的動作」只呼叫 `render()`——而 `render()` 沒有這一段。
   * 實測：客戶端補上最後一刀，主機進了戰利品畫面，客戶端卡在一場打完的戰鬥裡，
   * 手牌還在、結束回合是灰的，兩個人就這樣各自等對方。
   *
   * `ended` 擋著，所以重複呼叫沒有副作用。
   */
  function checkOver(): void {
    if (cs.phase === 'player' || ended) return;
    ended = true;
    // 連線：這一場打完了。之後才到的這一場的請求一律當成來不及，不可以留到下一場套（見 `CoopSession.attach`）
    session?.attach(null);
    // 關主戰打贏：白閃一下、關主慢慢倒下，多站一秒再交棒（收尾節奏，使用者 2026-09-04）
    const bossWon = cs.phase === 'won' && encounterById[cs.encounterId]?.pool === '塔主';
    // 一般的打贏吐槽只給一般戰鬥：關主打完接的是收場對白，最終戰更是剛救回師父——
    // 抽到「這下知道厲害了喵」「有沒有掉小魚乾喵？」會整個出戲（總稽核 2026-09-16 丙 中-2）
    if (cs.phase === 'won' && !bossWon) toast(pick(storyFor(my().hero).battleWin), heroSpeaker(), mySpeech());
    if (bossWon) { const flash = el('div', { class: 'boss-flash' }); root.append(flash); window.setTimeout(() => flash.remove(), 900); }
    // 讓勝負的姿勢與吐槽站一下再交棒；app.cs 換人就表示這場已經被接手，不要再叫一次
    let victoryMotionStarted = false;
    const finish = (): void => {
      if (app.cs !== cs) return;
      // 主機可能先判勝負才開始演最後一擊，換場前再看一次實際行程。
      // 不能只看 `active`：分頁在背景時畫面刷新回呼不跑、永遠收不掉（2026-09-23 稽核 低-1，規則見 `motionStillPlaying`）
      if (motionStillPlaying(motionActors.values(), performance.now())) { window.setTimeout(finish, 80); return; }
      const linger = cs.phase === 'won'
        ? qiuqiuVictoryLinger(motionEnabled, cs.players.map((q) => heroOf(q)))
        : 0;
      if (linger > 0 && !victoryMotionStarted) {
        victoryMotionStarted = true;
        // 結算時待機已經換成勝利動作的座位，不要再從頭播一次（稽核 2026-09-21 第 10 點：勝利動作連播兩三次）。
        // 但比全場最後一個出手動作還早開始的要重播：連線時同伴補最後一刀，我這邊一結算就切到勝利，
        // 那時同伴才剛衝上去，不重播的話我這隻早就慶祝完、定格等換場。
        // 已經在播的只等它剩下的時間，不再多等一整遍（使用者 2026-09-22：最後一刀到獎勵畫面拖到 2.5 秒）；
        // 走到這裡已經等過 1300 毫秒（塔主戰 2400），所以整段收尾＝這段等待與勝利動作播完兩者取較晚的。
        const now = performance.now();
        let wait = 0;
        for (const q of cs.players) {
          if (q.down || !motionSourceFor(q)) continue;
          const shown = motionActors.get(q.seat);
          if (shown?.action === 'win' && (shown.winAt ?? 0) >= lastMotionEndAt) {
            wait = Math.max(wait, (shown.winAt ?? now) + linger - now);
            continue;
          }
          playMotion(q.seat, 'win', undefined, 0, true);
          wait = Math.max(wait, linger);
        }
        if (wait > 0) { window.setTimeout(finish, wait + 30); return; }
      }
      app.afterCombat(bonusFish, bonusUpgrades);
    };
    window.setTimeout(finish, bossWon ? 2400 : 1300);
  }

  /**
   * 塔主進第二階段的兩句：吐槽是同一個位置，錯開時間放才不會疊在一起。
   * 第二句晚 1.4 秒才放，比交棒的 1300 毫秒還久，所以要跟其他延遲回呼一樣先確認這場還在
   * （`app.cs === cs`）——不然階段一換就把塔主打死的話，這句會飄到結算畫面上（吐槽住在疊層，換畫面不會被清掉）。
   */
  /**
   * 變身那一拍的演出：全場閃白、鏡頭震一下、變身那隻的立繪脹大再回來。
   * 類別 950 毫秒後拆掉——這幾個都是一次性動畫，留著的話下次加不回去（動畫不重播）。
   */
  function phaseBurst(node: HTMLElement): void {
    const box = root.querySelector('.combat');
    box?.classList.add('phase-flash', 'shaken');
    node.classList.add('phase-pulse');
    sfx('hit_heavy', 0.62);   // 沒有專屬吼聲，拿重擊音壓低半檔當「氣勢炸開」
    window.setTimeout(() => {
      if (app.cs !== cs) return;
      box?.classList.remove('phase-flash', 'shaken');
      node.classList.remove('phase-pulse');
    }, 950);
  }

  function bossPhaseTalk(bossId: string, phase: number): void {
    /*
     * 搭檔專屬的整組接話（2026-09-17）：拿得到就**照字面播**，
     * 底下那兩支換口氣、換名牌的就整個跳過——連線時「球球：……喵」是球球本人在講。
     */
    const coop = coopBossLines(bossId, phase >= 2 ? 'phase3' : 'phase2', my().hero);
    const lines = coop ?? (phase >= 2
      ? (dialogue.bossPhase3ById[bossId] ?? dialogue.bossPhase3Generic)
      : (dialogue.bossPhase2ById[bossId] ?? dialogue.bossPhase2Generic));
    // 「塔主」木牌只留給師父本人；其他關主的吐槽掛自己的名字（貓又婆婆等）
    const name = (sp: string): string =>
      sp === '塔主' && bossId !== 'tower_master' ? (enemyById[bossId]?.name ?? sp) : sp === '球球' && !coop ? heroSpeaker() : sp;
    /*
     * 原始碼裡寫的是球球的句子，玩菲菲時要過 `lineFor` 換成她那一版（連線稽核 中-3）。
     * 她那一份早就寫好了（`FEIFEI_BOSS_LINES`），但只有走 `playDialogue` 的才會換，
     * 這裡走 `toast`，於是玩菲菲換階段時會冒出「球球：……喵！」。單機也中。
     */
    // 塔主講到主角的也要換（波斯大小姐「收拾他」，夜間稽核 中-3）
    const text = (l: { speaker: string; text: string }): string => (coop ? l.text
      : l.speaker === '球球' ? lineFor(my().hero, l.text) : castLineFor(my().hero, l.text));
    /*
     * 誰講的就從誰頭上冒（2026-09-22 晚，連線盤點問題 5）：原本一律從座位 0 頭上冒，
     * 「塔主：走火入魔。」的尾巴指著左邊的貓。關主那句改從牠頭上冒（跟開場台詞同一套、避開頭上的意圖牌），
     * 找不到牠的立繪才退回原本的位置。
     */
    const speak = (l: { speaker: string; text: string }): void => {
      // 收場對白已經開了（換階段後幾秒就打倒關主）：剩下的吐槽不要冒在對白上（推前審查 2026-09-22 低-2）
      if (document.querySelector('.dialogue-overlay')) return;
      // 旁白不是誰在講：照舊從原本的位置冒，不要從關主嘴裡出來（狸大人第二階段第一句，推前審查 中-1）
      if (l.speaker === '旁白') { toast(text(l), name(l.speaker)); return; }
      const seat = speakerSeat(l.speaker, !!coop, cs.players, mySeat);
      if (seat !== undefined) { toast(text(l), name(l.speaker), speechBubbleAt(seat, cs.players.length)); return; }
      if (!bubbleOverUnit(app.stage, root.querySelector(`.unit.enemy[data-id="${bossId}"]`), text(l), name(l.speaker))) toast(text(l), name(l.speaker));
    };
    // 潤飾版有三句的組（狸大人）：整串照 1.4 秒一句輪播，跟原本兩句的節奏一致
    lines.forEach((l, i) => {
      if (i === 0) { speak(l); return; }
      window.setTimeout(() => { if (app.cs === cs) speak(l); }, 1400 * i);
    });
  }

  // ===== 待選牌 =====

  /** `cs.pending` 一出現就開視窗、一消失就收；視窗掛在疊層，重畫畫面不會把它掃掉 */
  function syncPicker(): void {
    if (!cs.pending) { picker?.remove(); picker = null; pickerFor = null; chooseSent = null; return; }
    const pd = cs.pending;
    if (picker && pickerFor === pd) return;
    // 換了一個待選（接連的第二次選牌、或「等同伴」換成輪到我）：舊的那個先收掉再照現在的畫
    picker?.remove(); picker = null; pickerFor = null;
    if (chooseSent === pd) return;   // 選好送出去了、還沒繞回來：不要再跳一次
    const layer = overlayRoot();
    if (!layer) return;
    pickerFor = pd;
    /*
     * **選牌的是同伴就不開視窗**（稽核 2026-09-14 高-4）。出牌動作有走連線，所以兩台的 `cs.pending`
     * 都會被設起來：原本兩台都跳視窗，我這台攤開的是**他的手牌**，兩人各按各的、各自在本機結算就分岔。
     * 我這台只掛一行字，不擋畫面也不吃滑鼠；他選完、動作繞回來 `pending` 清掉，這行字跟著收。
     */
    if (chooserOf(cs) !== mySeat) {
      const mate = cs.players[chooserOf(cs)];
      picker = el('div', { class: 'pick-wait' }, `${mate ? heroName(mate) : '同伴'}正在挑牌，等一下`);
      layer.append(picker);
      return;
    }
    const chosen: number[] = [];
    const okBtn = el('button', { class: 'btn primary' }, '確定');
    const count = el('div', { class: 'pick-count' });
    const refresh = (): void => {
      const bad = chosen.length < pd.min || chosen.length > pd.max;
      okBtn.toggleAttribute('disabled', bad);
      count.textContent = `已選 ${chosen.length} 張`;
    };
    const grid = el('div', { class: 'deck-grid' });
    for (const c of pd.cards) {
      const node = cardNode(c, {
        small: true,
        onClick: () => {
          const at = chosen.indexOf(c.uid);
          if (at >= 0) chosen.splice(at, 1);
          else if (chosen.length < pd.max) chosen.push(c.uid);
          else if (pd.max === 1) chosen.splice(0, 1, c.uid);   // 只能選一張時，點另一張＝改選
          else return;
          for (const n of grid.children) n.classList.toggle('selected', chosen.includes(Number((n as HTMLElement).dataset['uid'])));
          refresh();
        },
      });
      grid.append(node);
    }
    okBtn.addEventListener('click', () => {
      const before = snap(cs, my());
      const u = [...chosen];
      // 連線要走會話（高-4）；客戶端要等主機編號繞回來才真的選定，這段期間 `chooseSent` 擋住視窗重開
      if (!sendOrDo({ t: 'choose', seat: mySeat, u }, () => resolveChoice(cs, u))) { console.error(`resolveChoice 失敗：${pd.purpose} ${chosen.join(',')}`); return; }
      if (cs.pending === pd) chooseSent = pd;
      picker?.remove(); picker = null; pickerFor = null;
      hideTooltip();
      settle(before);   // 選完之後這張牌剩下的效果才會跑，所以照樣要結算一次
    });
    refresh();
    const range = pd.min === pd.max ? `${pd.min} 張` : `${pd.min}～${pd.max} 張`;
    picker = el('div', { class: 'modal-overlay' },
      el('div', { class: 'modal' },
        el('h2', { class: 'modal-title' }, `${PENDING_TITLE[pd.purpose]}（${range}）`),
        grid,
        el('div', { class: 'modal-foot' }, count, okBtn)));
    layer.append(picker);
  }

  // Esc 取消選目標。這場戰鬥換人（app.cs 變了）時聽眾自己退場，免得一直堆著
  const onKey = (ev: KeyboardEvent): void => {
    if (app.cs !== cs) { window.removeEventListener('keydown', onKey); return; }
    if (ev.key === 'Escape' && targeting) { setTargeting(null); if (!patchTargeting()) render(); }
  };
  window.addEventListener('keydown', onKey);
  app.disposers.push(() => window.removeEventListener('keydown', onKey));   // 換畫面就拆，不用等下一次按鍵（2026-09-02 稽核 L-8）
  // 右鍵也能取消選目標（使用者 2026-09-06：有人建議，跟 Esc、點空白處同一件事）。只在選目標中才攔，平常右鍵照開瀏覽器選單
  const onContext = (ev: MouseEvent): void => {
    if (app.cs !== cs) { window.removeEventListener('contextmenu', onContext); return; }
    if (targeting) { ev.preventDefault(); setTargeting(null); if (!patchTargeting()) render(); }
  };
  window.addEventListener('contextmenu', onContext);
  app.disposers.push(() => window.removeEventListener('contextmenu', onContext));

  /*
   * 連線：收到套進去的動作就重畫；兩邊都舉手就收回合。
   *
   * 收回合**兩台機器各自跑一次**，不傳結果——引擎是決定性的，同一個狀態跑出來一模一樣
   *（那正是鎖步的整個前提）。傳結果反而會多一份可能對不上的東西。
   */
  if (session) {
    // `session.attach(cs)` 刻意放在這支的最後面（稽核 2026-09-14 高-6）：理由見檔尾那一行
    /*
     * 每秒問一次「同伴閒置多久了」，到了就把那顆按鈕亮出來。
     *
     * 只改一個 `hidden` 屬性、不重畫：這支在整場戰鬥都醒著，重畫會把
     * 正在演的傷害數字與姿勢動畫全部打斷，一秒一次等於整場都在抖。
     * 畫面被接手（換節點、離開戰鬥）就自己停掉，所以也掛進 `disposers`。
     */
    const tick = window.setInterval(() => {
      if (app.cs !== cs) { window.clearInterval(tick); return; }
      const force = root.querySelector<HTMLButtonElement>('.end-force');
      if (!force) return;
      const w = waitingFor(cs);
      force.hidden = !(w.length === 1 && w[0] !== mySeat && mateIdleMs() >= IDLE_FORCE_MS);
    }, 1000);
    app.disposers.push(() => window.clearInterval(tick));
    /*
     * **同伴的動作也要演出來**，不能只是把數字換掉（使用者 2026-09-11：
     * 「另外一人要看到自己做了哪些事情、怪物有哪些變化」）。
     *
     * 用的是既有的 `settle()`——那支本來就是「拿一份動作前的快照，比對現在，
     * 把差出來的東西演成傷害數字、魔物後仰、狀態圖示跳動」。
     * 自己出牌走的也是它，所以同伴的動作跟自己的動作看起來是同一套語言，
     * 不會變成「我的牌有演出、他的牌只是數字跳」。
     *
     * 為什麼不另外寫一套：那等於把同一件事（狀態差 → 畫面表現）寫兩遍，
     * 遲早會有一邊漏掉某種效果，而且漏掉的那一種只在連線時才看得出來。
     *
     * 快照要在**套用之前**拿——`ingest` 是同步的，所以這裡的 `before`
     * 必須由 session 在套用前先存好（見下面的 `beforeApply`）。
     */
    session.beforeApply(() => {
      remoteBefore = snap(cs, my());
      handsBefore = cs.players.map((p) => p.hand.slice());
      // 深複製整份戰鬥狀態，但日誌只帶最後一行。
      // `cs.log` 整場從不修剪，而這裡每收到一個連線動作就複製一次，打越久頓越明顯
      // （稽核 2026-09-21 第 4 點）。可以砍掉前面是因為兩邊都只需要最後一行：
      //   1. 引擎只讀 `cs.log[cs.log.length - 1]`（`engine/actions.ts:79` 的秘寶摺行），
      //      留著最後一行，摺行行為就跟真實狀態一模一樣。
      //   2. 重播取日誌用 `replay.log.slice(logStart, logEnd)`，而 logStart/logEnd 來自
      //      `snap(replay, …)` 記的 `logLen`——量的是複本自己的長度，不是真實狀態的。
      const fullLog = cs.log;
      cs.log = fullLog.length > 1 ? fullLog.slice(-1) : fullLog;
      try {
        remoteCombatBefore = structuredClone(cs);
        remoteCombatBefore.rng = cs.rng.clone();
      } catch (error) {
        // 複本只給「一次補多張」的重播用；拿不到就走單張演出，不能讓例外中斷套用這一號動作（稽核 2026-09-21 晚 低-14）
        console.warn('連線重播複本建立失敗，改走單張演出', error);
        remoteCombatBefore = null;
      } finally {
        cs.log = fullLog;
      }
    });
    // 我那一下沒算數（主機已經來不及了）：把手放開，畫面重畫回真實的狀態
    // 選牌那一下沒算數的話，視窗要能再開（見 `chooseSent`）
    session.onDropped(() => {
      locallyPlayedMotion.dropInFlight();
      unlockSend();
      chooseSent = null;
      if (app.cs === cs) { render(); syncPicker(); }
    });
    // 同伴點選了哪張：只重畫他那一格，不動整頁（跟 patchField 對同伴那格的做法一樣）
    session.onHint((seat, u) => {
      if (app.cs !== cs) return;
      if (u === null) mateHint.delete(seat); else mateHint.set(seat, u);
      const q = cs.players[seat];
      const node = root.querySelector<HTMLElement>(`.unit.player[data-seat="${seat}"]`);
      if (q && node) node.replaceWith(playerUnit(q));
    });
    /** 這一批動作的收尾交接（見下面外層的例外防護）：`finish`＝收尾那一支、`started`＝已經開始收了 */
    type AppliedTurn = { finish?: (clearRemote?: boolean) => void; started?: boolean; sealed?: boolean };
    const onApplied = (applied: SequencedAction[], turn: AppliedTurn): void => {
      if (!applied.length || app.cs !== cs) return;
      unlockSend();   // 有東西套進去了＝路上那一下回來了
      const mine = applied.every((a) => 'seat' in a.a && a.a.seat === mySeat);
      if (!mine) { mateActAt = Date.now(); mateTurnSeen = cs.turn; }   // 他動了，一分鐘重頭算
      const found = matePlays(applied, mySeat, handsBefore, cs.turn);
      for (const mp of found) matePlay.set(mp.seat, { card: mp.card, turn: mp.turn });
      // 同一批裡先抽再打的那張快照裡沒有：與其掛著上一張騙人，不如不掛（審查 低-1）
      for (const { a } of applied) if (a.t === 'card' && a.seat !== mySeat && !found.some((m) => m.seat === a.seat)) matePlay.delete(a.seat);
      for (const { a } of applied) if (a.t === 'card' && a.seat !== mySeat && mateHint.get(a.seat) === a.u) mateHint.delete(a.seat);   // 打出的正是考慮中那張才撤（審查 中-2：打別張時他那邊還選著）
      if (applied.some(({ a }) => a.t === 'force' && a.w === mySeat)) setTargeting(null);   // 被同伴強制收回合：我點著的牌撤掉、也告訴他（審查 低-2）
      /*
       * **主機自己的動作在這之前就演過了**（`submit` 是同步套用的，`act()` 裡的
       * `settle` 已經比對過前後），所以只要重畫；其餘都要演。
       *
       * 客戶端自己的動作也算「要演」：它送出去的當下狀態沒有變，
       * 真正改變是在這裡發生的——不演的話，客戶端出的牌只有數字會跳，
       * 傷害數字、魔物後仰、姿勢全部沒有（而且分出勝負也不會被發現，見 `checkOver`）。
       *
       * `light` 只給**同伴的**動作：那不重排手牌（他的牌不在我手上，重排會讓我的手牌無故抖一下）；
       * 自己的動作手牌真的少了一張，要照常重排。
      */
      const alreadyShown = mine && !!session.isHost;
      // 引擎已完成最後舉手就立即封住本回合；視覺排演可以慢，下一回合的牌不可提前套用。
      const completedTurn = allReady(cs) && !cs.pending ? cs.turn : null;
      if (completedTurn !== null) {
        session.endOfTurn();
        session.hold();
        turn.sealed = true;   // 對過帳、暫停了：外層退路不要再做一次（推前審查 低-4）
        root.querySelector('.end-undo')?.setAttribute('disabled', 'disabled');
      }
      const finishApplied = (clearRemote = true): void => {
        if (turn.started) return;   // 只收一次：外層例外防護的退路可能再叫一次（見下面 `session.onApplied`）
        turn.started = true;
        if (clearRemote) {
          remoteBefore = null;
          remoteCombatBefore = null;
        }
        checkOver();   // 最後一刀是誰補的都一樣，分出勝負就要收場
        if (app.cs === cs) syncPicker();   // 主機自己的動作走 render 不走 settle，選牌視窗要在這裡跟上（審查 中-5）
        /*
         * **還有人在選牌就先不收**（夜間審查 中-1）：舉手齊了但 `pending` 還在時，引擎的 `beginEnemyTurn`
         * 會回 false、舉手旗標也不清，等選完那一下再進來一次——原本兩次都記對帳單，
         * 第二張蓋掉還沒配到對的第一張，兩台狀態一樣也判成分岔。
         */
        // 只有包含最後舉手的那批演完才收牌；較早批次的收尾不能搶先結束回合。
        if (app.cs === cs && cs.turn === completedTurn && allReady(cs) && !cs.pending) {
          sfx('turn_end');
          const wait = collectHand();
          if (wait <= 0) { runEnemyTurn(); return; }
          collecting = true;
          window.setTimeout(() => {
            if (app.cs !== cs || !collecting) return;
            collecting = false;
            runEnemyTurn();
          }, wait);
        }
      };
      turn.finish = finishApplied;   // 交給外層：下面準備演出時丟例外，外層照常收尾（2026-09-23 稽核 低-2）

      /*
       * 缺號補齊時 `ActionQueue` 會一次交回多張。引擎已經在真狀態全部算完，畫面不能把
       * 所有命中都塞給最後一張；用套用前的複本重播，重建每張自己的快照、命中與紀錄範圍，
       * 再依動作長度逐張排演。複本只供畫面讀取，不會寫回鎖步狀態。
       */
      if (!alreadyShown && (applied.length > 1 || remotePresentationRunning) && remoteCombatBefore) {
        const replay = remoteCombatBefore;
        const points: Snap[] = [snap(replay, replay.players[mySeat] ?? replay.player)];
        const frames: Array<{
          a: CoopAction;
          before: Snap;
          after: Snap;
          card?: CardInstance;
          player?: PlayerCombat;
        }> = [];
        let replayOk = true;
        for (const { a } of applied) {
          const before = points.at(-1)!;
          const player = replay.players[a.seat];
          const card = a.t === 'card' ? player?.hand.find((one) => one.uid === a.u) : undefined;
          // 引擎在複本上丟例外會直接竄出 session.onApplied，把整條連線流程卡死；
          // 接起來退回單張 settle 的原路（稽核 2026-09-21 第 8 點）。
          try {
            if (!applyAction(replay, a)) { replayOk = false; break; }
          } catch (error) {
            console.warn('連線重播：複本套用失敗，改回單張演出', a, error);
            replayOk = false;
            break;
          }
          const after = snap(replay, replay.players[mySeat] ?? replay.player);
          frames.push({ a, before, after, card, player });
          points.push(after);
        }
        if (replayOk && frames.length === applied.length) {
          const boundaries = qiuqiuMotionBatchBoundaries(points);
          const items: RemotePresentationItem[] = [];
          const preparedDamage = new Map<number, number>();

          frames.forEach((frame, index) => {
            const boundary = boundaries[index]!;
            const freshLog = replay.log.slice(boundary.logStart, boundary.logEnd);
            const impactHits = replay.hits.slice(boundary.hitStart, boundary.hitEnd);
            const seat = frame.a.seat;
            const localMotion = seat === mySeat
              ? frame.a.t === 'card'
                ? locallyPlayedMotion.take(localCardMotionKey(frame.a.u))
                : frame.a.t === 'potion'
                  ? locallyPlayedMotion.take(localPotionMotionKey(seat, frame.a.id))
                  : undefined
              : undefined;
            const playedHere = localMotion !== undefined;
            let action: CombatMotionAction | undefined = localMotion?.action;
            let attack = false;
            let trip = localMotion?.trip;

            if (frame.a.t === 'potion' && frame.player) {
              // 丟出去的忍具跟本機那條一樣算出手（`potionPose` 的 attack）：傷害才會排到打中的那一拍
              attack = !!potionPose(heroOf(frame.player), frame.a.id).attack;
              action ??= motionForPotion(frame.player, frame.a.id);
            }
            if (frame.a.t === 'card' && frame.card && frame.player) {
              attack = cardStats(frame.card).def.type === '攻擊';
              action ??= motionForCard(frame.player, frame.card);
              if (action && !trip) trip = prepareMelee(seat, action, frame.a.g, attack);
            }

            const source = frame.player ? motionSourceFor(frame.player) : undefined;
            let presentationWaves = 1;
            if (action && source && attack) {
              for (const [uid, beforeEnemy] of frame.before.enemies) {
                const afterEnemy = frame.after.enemies.get(uid);
                if (!afterEnemy) continue;
                const leadingMisses = qiuqiuConsumedStealth(beforeEnemy.stealth, afterEnemy.stealth);
                presentationWaves = Math.max(presentationWaves,
                  buildCombatMotionImpactPlan(source, action, impactHits, uid, leadingMisses).length);
              }
            }
            const expectedDuration = action && source ? motionDuration(source, action, presentationWaves) : 0;
            if (trip && expectedDuration > trip.plan.totalMs) trip = {
              ...trip,
              plan: { ...trip.plan, strikeMs: expectedDuration, totalMs: expectedDuration },
            };
            if (action && source && attack && motionImpactDelay(source, action) > 0) {
              for (const [uid, beforeEnemy] of frame.before.enemies) {
                const afterEnemy = frame.after.enemies.get(uid);
                if (!afterEnemy || beforeEnemy.hp <= afterEnemy.hp) continue;
                preparedDamage.set(uid, (preparedDamage.get(uid) ?? 0) + beforeEnemy.hp - afterEnemy.hp);
                if (!beforeEnemy.dead && afterEnemy.dead) {
                  const src = root.querySelector<HTMLImageElement>(`.unit.enemy[data-uid="${uid}"] .sprite`)?.src;
                  if (src) motionHeldSprites.set(uid, src);
                  fallingUids.add(uid);
                }
              }
            }

            items.push({
              kind: 'step',
              wait: action && source
                ? localMotion
                  ? () => combatMotionPresentationWaitAt(source, action!, presentationWaves, localMotion.at)
                  : combatMotionPresentationWait(source, action, presentationWaves, 0)
                : 0,
              play: () => {
                const elapsed = localMotion ? Math.max(0, Date.now() - localMotion.at) : 0;
                if (action && seat !== mySeat && !playedHere) playMotion(seat, action, trip, elapsed);
                const ownOpts = frame.card && seat === mySeat
                  ? cardPose(heroOf(my()), cardStats(frame.card).def, cardStats(frame.card).effects)
                  : {};
                settle(frame.before, {
                  ...ownOpts,
                  light: seat !== mySeat,
                  motion: action && seat === mySeat && !playedHere ? action : undefined,
                  motionTrip: action && seat === mySeat ? trip : undefined,
                  motionAlreadyPlaying: playedHere,
                  impactMotion: action,
                  impactPresentationToken: localMotion?.token,
                  impactElapsed: elapsed,
                  impactApproach: trip?.plan.approachMs ?? 0,
                  impactSeat: seat,
                  impactAttack: attack,
                  impactProjectile: frame.a.t === 'potion'
                    ? projectileForPotion(frame.a.id, frame.a.g)
                    : frame.card && frame.player ? projectileForCard(frame.player, frame.card, action) : undefined,
                  comparison: frame.after,
                  freshLog,
                  impactHits,
                  pendingPrepared: true,
                  deferOver: true,
                });
              },
            });
          });

          for (const [uid, amount] of preparedDamage) {
            motionPendingDamage.set(uid, (motionPendingDamage.get(uid) ?? 0) + amount);
          }
          items.push({ kind: 'done', run: () => finishApplied(false) });
          enqueueRemotePresentation(...items);
          remoteBefore = null;
          remoteCombatBefore = null;
          return;
        }
      }

      let ownCard: CardInstance | undefined;
      let ownMotionAlreadyPlaying = false;
      let ownImpactMotion: CombatMotionAction | undefined;
      let ownImpactPresentationToken: number | undefined;
      let ownImpactElapsed = 0;
      let ownImpactApproach = 0;
      let ownMotionTrip: MeleeTrip | undefined;
      let ownImpactProjectile: ProjectileShot | undefined;
      let incomingMotion: { seat: number; action: CombatMotionAction; trip?: MeleeTrip; attack: boolean; projectile?: ProjectileShot } | undefined;
      for (const { a } of applied) {
        if (a.t === 'potion') {
          const q = cs.players.find((one) => one.seat === a.seat);
          const localMotion = a.seat === mySeat
            ? locallyPlayedMotion.take(localPotionMotionKey(a.seat, a.id))
            : undefined;
          if (localMotion) {
            ownMotionAlreadyPlaying = true;
            ownImpactMotion = localMotion.action;
            ownImpactPresentationToken = localMotion.token;
            ownImpactElapsed = Date.now() - localMotion.at;
            ownImpactProjectile = projectileForPotion(a.id, a.g);
          } else if (a.seat !== mySeat && q) {
            const action = motionForPotion(q, a.id);
            if (action) incomingMotion = { seat: a.seat, action, attack: !!potionPose(heroOf(q), a.id).attack,
              projectile: projectileForPotion(a.id, a.g) };
          }
          continue;
        }
        if (a.t !== 'card') continue;
        const card = handsBefore[a.seat]?.find((one) => one.uid === a.u);
        const localMotion = a.seat === mySeat
          ? locallyPlayedMotion.take(localCardMotionKey(a.u))
          : undefined;
        const playedHere = localMotion !== undefined;
        if (a.seat === mySeat) {
          ownCard = card ?? ownCard;
          ownMotionAlreadyPlaying ||= playedHere;
          if (localMotion) {
            ownImpactMotion = localMotion.action;
            ownImpactPresentationToken = localMotion.token;
            ownImpactElapsed = Date.now() - localMotion.at;
            ownImpactApproach = localMotion.trip?.plan.approachMs ?? 0;
            ownMotionTrip = localMotion.trip;
            const me = cs.players.find((one) => one.seat === a.seat);
            ownImpactProjectile = card && me ? projectileForCard(me, card, localMotion.action) : undefined;
          }
        }
        if (alreadyShown || playedHere || !card) continue;
        const q = cs.players.find((one) => one.seat === a.seat);
        const action = q ? motionForCard(q, card) : undefined;
        if (action) incomingMotion = {
          seat: a.seat,
          action,
          attack: cardStats(card).def.type === '攻擊',
          trip: prepareMelee(a.seat, action, a.g, cardStats(card).def.type === '攻擊'),
          projectile: q ? projectileForCard(q, card, action) : undefined,
        };
      }
      const ownOpts = ownCard
        ? {
            ...cardPose(heroOf(my()), cardStats(ownCard).def, cardStats(ownCard).effects),
            motion: incomingMotion?.seat === mySeat ? incomingMotion.action : undefined,
            motionTrip: incomingMotion?.seat === mySeat ? incomingMotion.trip : ownMotionTrip,
            motionAlreadyPlaying: ownMotionAlreadyPlaying,
          }
        : ownMotionAlreadyPlaying ? { motionAlreadyPlaying: true, motionTrip: ownMotionTrip } : {};
      // 狀態已經套用；演出失敗只影響畫面，收尾（勝負、收回合、放開會話）一定要跑，否則整場卡住（稽核 2026-09-21 晚 中-4）
      try {
        if (incomingMotion && incomingMotion.seat !== mySeat) playMotion(incomingMotion.seat, incomingMotion.action, incomingMotion.trip);
        if (!alreadyShown && remoteBefore) settle(remoteBefore, {
          ...ownOpts,
          light: !mine,
          impactMotion: incomingMotion?.action ?? ownImpactMotion,
          impactPresentationToken: incomingMotion ? undefined : ownImpactPresentationToken,
          impactElapsed: ownImpactElapsed,
          impactApproach: incomingMotion?.trip?.plan.approachMs ?? ownImpactApproach,
          impactSeat: incomingMotion?.seat ?? mySeat,
          impactAttack: incomingMotion?.attack ?? (ownCard ? cardStats(ownCard).def.type === '攻擊' : false),
          impactProjectile: incomingMotion ? incomingMotion.projectile : ownImpactProjectile,
        });
        // 主機自己出的動作會在外層 act → settle 重畫；先畫會讓血條提前扣血再回升。
        else if (!alreadyShown || !ownMotionAlreadyPlaying) render();
      } catch (error) {
        console.error('連線演出失敗，照常收尾', error);
        recoverPresentation();
      }
      finishApplied();
    };
    /*
     * 外面再包一道例外防護（2026-09-23 稽核 低-2）。
     *
     * 舉手齊了的那一刻，上面當場 `hold()` 住會話，要等 `finishApplied()` 收牌、演完魔物回合才 `release()`；
     * 而中間準備演出參數的那一大段（`matePlays`、`motionForCard`、`prepareMelee`、`projectileForCard`、
     * 批次重播的 `buildCombatMotionImpactPlan`…）原本只有最後幾行在 `try` 裡。缺圖、資料不齊丟一個例外，
     * 這台就停在 held、不跑魔物回合，同伴下一回合的牌全在這邊排隊，兩台互等。
     * 跟 2026-09-21 晚 中-4 同一套：狀態已經套進引擎了，演出只是畫面——記一行、收掉演出、照常收尾。
     * 收尾本身壞了（或還沒走到定義收尾那一行）就直接放開：寧可同伴下一手在這邊套不進去、兩邊跳出紅色橫幅，也不要無聲互等。
     */
    session.onApplied((applied) => {
      const turn: AppliedTurn = {};
      try {
        onApplied(applied, turn);
      } catch (error) {
        console.error('連線演出準備失敗，照常收尾', error);
        recoverPresentation();
        const finish = turn.started ? undefined : turn.finish;
        try {
          if (finish) finish();
          else if (turnWaiting()) {
            // 都舉手了、魔物回合還沒開始（例外丟在收尾接手之前，或收尾自己丟在開魔物回合之前；推前審查 低-4）：
            // 照常收這一回合，魔物回合演完自己會放開。只放開的話這台不跑魔物回合，兩台分岔
            if (!turn.sealed) { session.endOfTurn(); session.hold(); }
            runEnemyTurn();
          } else session.release();   // 收尾本身丟的例外，或還沒走到定義收尾那一行：沒辦法照常收，直接放開
        } catch (again) {
          console.error('連線收尾失敗，直接放開會話', again);
          session.release();
        }
      }
    });
    session.onTrouble((why) => {
      // 分岔或斷線：**當場停下來講清楚**，不要讓兩個人繼續玩兩份不一樣的遊戲
      mateHint.clear(); matePlay.clear();   // 同伴頭上的牌撤掉，不然像他還在動（審查 低-1）
      hint = why;
      render();
    });
    // 自己的線路斷了／接回來了：手牌與按鈕跟著 `canAct()` 變灰、變回來（橫幅由大廳掛）。魔物演出中不重畫，演完 settle 會補
    session.onLink((s) => {
      if (app.cs !== cs || (s !== 'away' && s !== 'back')) return;
      if (!collecting && !enemyTurnRunning) render();
    });
  }

  render();
  syncPicker();
  /**
   * 開戰就發動的那幾件（`combatStart` 有 17 件，加上飯糰上限、第一回合多抽多吃那幾件）也要演。
   *
   * 那批是在 `startCombat` 裡跑完的，比這個畫面誕生還早，任何一次 `settle` 的快照都追不到，
   * 不補這一段的話「開場秘寶」會是唯一永遠看不到回饋的一類——偏偏那類最多。
   * `relicFiredLen: 0` ＝把目前為止的全部演一次；此時清單裡也就只有開場那批。
   *
   * **關主戰要等 VS 閃卡收掉才演**（稽核 2026-09-10 中-5）：那張閃卡的底是 82% 的黑幕、
   * 層級 60（狀態列只有 10），1.1 秒才開始淡出、1.4 秒收乾淨，而名牌整段只有 1 秒——
   * 原本整段生命週期都埋在黑幕底下，等閃卡收掉時早就沒東西可看了。
   * 這是純粹把畫面回饋往後挪，不擋玩家輸入，不算「拉長節奏」。
   */
  const openingFlash = (): void => flashRelics({ relicFiredLen: 0 } as Snap);
  let vsShown = false;

  // ===== 關主戰的 VS 開場閃卡：兩張立繪對衝＋名字橫幅，1.4 秒自動收、點一下也收 =====
  // 疊在第一次畫面上面；素材還沒生好（灰剪影）就整個不放，寧缺勿醜。
  const bossDef = encounterById[cs.encounterId]?.pool === '塔主'
    ? cs.enemies.map((e) => enemyById[e.enemyId]).find((d) => d?.pool === '塔主')
    : undefined;
  if (bossDef) {
    const heroUrl = heroArtUrl(my().hero, POSE.idle);
    const bossUrl = bossDef.art === 'daxia' ? artUrl('sprites', BOSS_IDLE) : monsterUrl(bossDef.art, 'idle');
    if (!isFallback(heroUrl) && !isFallback(bossUrl)) {
      const ov = el('div', { class: 'vs-overlay' },
        el('img', { class: 'vs-left', src: heroUrl, alt: heroName(my()) }),
        el('div', { class: 'vs-mark' }, 'VS'),
        el('img', { class: 'vs-right', src: bossUrl, alt: bossDef.name }),
        el('div', { class: 'vs-banner' },
          el('span', { class: 'vs-name' }, heroName(my())),
          // 名字用場上那隻的（可能已冠上「暴怒的」前綴），跟頭上的名牌一致
          el('span', { class: 'vs-boss' }, cs.enemies.find((u) => enemyById[u.enemyId]?.pool === '塔主')?.name ?? bossDef.name)));
      root.append(ov);
      sfx('hit_heavy', 0.5);
      // 閃卡收掉才演開場秘寶（見上面 `openingFlash` 的說明）。點掉閃卡的話立刻接上，不用乾等
      let flashed = false;
      const runFlash = (): void => { if (!flashed && app.cs === cs) { flashed = true; openingFlash(); } };
      const off = window.setTimeout(() => { ov.remove(); runFlash(); }, 1400);
      const offFlash = window.setTimeout(runFlash, 1500);   // 閃卡被別的路徑拿掉時的保險
      app.disposers.push(() => { window.clearTimeout(off); window.clearTimeout(offFlash); });
      ov.addEventListener('pointerdown', () => { window.clearTimeout(off); ov.remove(); runFlash(); });
      vsShown = true;
    }
  }
  if (!vsShown) openingFlash();
  /*
   * **最後才掛上會話**（2026-09-14 夜間稽核 高-6）。
   *
   * 兩台進場的時間差好幾秒（對白、關主門、事件的「開打」各點各的，一般戰也要等圖解碼），
   * 先進場的那台已經出過牌了。那些動作在會話裡排著隊，`attach` 的這一刻才一口氣套下去——
   * 所以回呼要先全部掛好、第一次畫面也要先畫好，不然套下去沒人演，
   * 「兩個人都舉手了」也沒有人收回合。
   */
  session?.attach(cs);
});
