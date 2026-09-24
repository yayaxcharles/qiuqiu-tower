import { DEBUFFS, TURN_DECAY } from './types';
import { heroOf, type Hero } from './hero';
import { cardById } from '../content/cards';
import { encounterById, enemyById } from '../content/enemies';
import { eventById, events } from '../content/events';
import { potionById } from '../content/potions';
import { MIASMA_PURE, relicById, relics, RELIC_SETS, setCount } from '../content/relics';
import { relicOk } from './rewards';
import RELIC_RATINGS from './relic-ratings.json';
import BLESS_RATINGS from './bless-ratings.json';
import { aliveEnemies, attackable, dazeTarget, isDazed } from './actions';
import { allReady, canPlay, canUsePotion, endTurn, playCard, potionBlockedReason, resolveChoice, usePotion, willAct } from './combat';
import { cardStats } from './deck';
import { qiAmount } from './effects';
import { choiceEffectsFor, visibleChoices } from './eventcond';
import { nextChoices } from './map';
import { Rng, seedFromString } from './rng';
import { computeAttack, computeBlock, getStatus } from './statuses';
import {
  ACTS, addCard, advanceAct, applyRunEffects, beginCombat, buyCard, buyPotion, buyRelic, buyRemove, chooseNode,
  finishCombat, makeShop, miasmaRelicsOf, napHeal, newRun, openChest, purifyRelic, removeCard, removePrice, rest, restCardChoices, rollActCards, rollActRelics,
  stampWanted, takeCardReward, closeCardReward, takeRelic, takeRestCard,
  upgradeCard, type RunEffectOutcome, resolvePendingAfterFight, makeMerchant, openRoadsideBox,
  buySwap, keeperOf, potionCapacity, priceFor, purifyAtShop, type ShopStock } from './run';
import { ambushOutcomes } from './qmark';
import type { CardInstance, CombatState, Effect, EnemyCombat, MapNode, PlayerCombat, RelicPool, RunEffect, RunState, Unit } from './types';
import { me } from './runplayer';
import { blessingById, type BlessingDef } from '../content/blessings';
import { blessChoices, blessPickable, blessPickCount, rollBlessings, takeBlessing, type BlessPick } from './blessing';

/**
 * 會算傷害的機器人（2026-09-02）。
 *
 * `bot.ts` 的隨機機器人只拿來抓引擎例外，勝率遠低於真人，關主一律 0 勝，數字只能看相對。
 * 這隻照真人的思路出牌：先看魔物這回合會打多少、擋得住就擋、擋不住就閃或殺；
 * 有殺傷力的牌打最矮的魔物；能力牌趁早放；忍具留到快死或能收頭的時候用。
 * 地圖、獎勵、商店、貓窩、事件也都照一套簡單的判斷走（見各 pick*）。
 *
 * 用途只有一個：**量平衡**。勝率的絕對值仍然比不上熟練玩家，但比亂打貼近太多，
 * 至少看得出「哪一關、哪一場、哪隻關主」是牆。數字看 `tests/smart.report.test.ts`。
 */

export interface SmartStats {
  seed: string;
  won: boolean;
  floor: number;
  act: number;
  deckSize: number;
  /** 收局時的牌組與秘寶（看爪力從哪裡來用） */
  deckIds: string[];
  relicIds: string[];
  upgraded: number;
  relics: number;
  /** 陣亡的那場遭遇（打贏就是 null） */
  diedTo: string | null;
  /** 每一場關主戰：進場血量與結果 */
  bosses: { id: string; act: number; hpIn: number; maxHp: number; won: boolean; turns: number }[];
  /** 每一場戰鬥：遭遇、掉了多少血、回合數 */
  fights: { id: string; floor: number; act: number; hpLost: number; turns: number; won: boolean; str: number }[];
}

// ===== 牌的靜態評分（挑獎勵、商店、升級、放生用）。10 最想要、0 不要 =====
const RATING: Record<string, number> = {
  // 起手（菲菲的三張照球球的對應牌評：飛針＝貓抓、退開＝淡定、淬毒＝替身術。
  // 沒列的話會照稀有度預設 4，她的起手牌就永遠不算廢牌、一輩子不會被放生，牌組會比球球多帶三張基本牌）
  sanjo: 2, tanding: 2, kawarimi: 3, feifei_feizhen: 2, feifei_tuikai: 2, feifei_cuidu: 3,
  // 噹噹的三張同理：正拳＝貓抓、架盤＝淡定、回敬＝替身術那一格
  dangdang_zhengquan: 2, dangdang_jiapan: 2, dangdang_huijing: 3,
  // 封封的三張同理：平斬＝貓抓、護身＝淡定、吐納＝替身術那一格（2026-09-22 量測修正：
  // 原本漏列，照稀有度被當成 4 分，起手牌一輩子不會被放生，收局時十張全留著）
  fengfeng_pingzhan: 2, fengfeng_hushen: 2, fengfeng_tuna: 3,
  /*
   * 封封的專屬牌（2026-09-22 量測工具，平衡調整「方案三」之後量的）。沒列的話一律照稀有度給 4／5／7，
   * 機器人分不出好壞：回劍護肘（實測最好的兩張之一）只有 5 分、長息（實測最差）也是 5 分，
   * 而共用牌大多手動評過 6～8 分——於是他的好牌幾乎撿不到，後段被量得太弱。
   *
   * **分數的來源**：起手十張多塞一張這張牌、整局跑 600 局，看平均到達樓層多幾層，
   * 兩批種子（smart-0～599、smartB-0～599）取平均，再照固定級距換成分數：
   *   多 2 層以上 → 8、多 1～2 層 → 7、多 0.4～1 層 → 6、多 0～0.4 層 → 5、少 0～0.5 層 → 4、少 0.5 層以上 → 3。
   * 括號裡是那個平均。**不給 2 分以下**：那是「放生名單」（`deckJunk`）的門檻，量出來偏弱不等於該刪掉。
   * 四張連線專用牌（你從右邊上、借我擋一下、我護著你走、現在一起上）單人量不到，照舊用預設。
   * 改了這幾張的數值就要重量一次，不然分數會跟著過期。
   * 註：量的時候吐納是 0 費，定案改回 1 費（舊劍穗的每回合 1 氣兩邊都有）；
   * 牌與牌之間的高低應該不受影響，要精準的話照上面的方法重量一次。
   */
  fengfeng_duanliu: 8,     // 絕學·斷流（+3.8）
  fengfeng_huzhou: 8,      // 回劍護肘（+3.4）
  fengfeng_pozhen: 8,      // 絕學·破陣（+2.4）
  fengfeng_shuangduan: 7,  // 雙段劍（+1.7）
  fengfeng_zhenshou: 7,    // 振袖收劍（+1.4）
  fengfeng_kaishan: 7,     // 絕學·開山（+1.1）
  fengfeng_chuantang: 6,   // 穿堂劍（+0.7）
  fengfeng_tabu: 6,        // 踏步重劈（+0.7）
  fengfeng_tuibu: 6,       // 退步守勢（+0.6）
  fengfeng_jianqiao: 6,    // 劍鞘架擋（+0.6）
  fengfeng_huibu: 6,       // 回步刺（+0.6）
  fengfeng_huanshou: 6,    // 換手握劍（+0.5）
  fengfeng_hengsao: 6,     // 橫掃（+0.4）
  fengfeng_tiaokai: 4,     // 挑開（−0.0）
  fengfeng_tanbu: 4,       // 探步劍（−0.0）
  fengfeng_zhuanshen: 4,   // 轉身蓄勁（−0.2）
  fengfeng_wenwan: 4,      // 穩住手腕（−0.3）
  fengfeng_jizhong: 3,     // 集中精神（−0.5）
  fengfeng_kanshi: 3,      // 看準劍路（−0.6）
  fengfeng_zhengxi: 3,     // 整理呼吸（−0.7）
  fengfeng_xunxi: 3,       // 循息（−0.9）
  fengfeng_shoushi: 3,     // 收勢（−1.4）
  fengfeng_lianxi: 3,      // 絕學·連息（−1.7）
  fengfeng_cunfeng: 3,     // 絕學·藏鋒（−1.8）
  fengfeng_changxi: 3,     // 長息（−2.1）
  // 忍術 常見
  shunkan: 7, shengdong: 6, shunshou: 5, wozaizhe: 4, jiaochulai: 4, susu: 5, zhangyan: 5, yinshen: 4,
  bianshen: 7, zhuangsi: 4, duxin: 3, qianliyan: 5, shunfenger: 4, dingshang: 6, chudashi: 4, youcike: 5,
  zhanshu: 4, tuozi: 3, roubao: 5, liangzhua: 6, suoyituan: 5, weihe: 5, paozhao: 3, tianmao: 4,
  // 忍術 罕見
  bunshin: 7, feifei_fenshen: 6, ruying: 7, shuaiguo: 3, dingshen: 6, cuimian: 5, fengkou: 4, qianshui: 5, touchi: 5, xianshuile: 2,
  gaotui: 4, jiejie: 7, fantan: 5, luoye: 5, canying: 4, caiweiba: 6, diaohu: 5, sashoujian: 5, jiuming: 5, fanzhua: 4,
  // 忍術 稀有
  meikandao: 6, renwuwancheng: 4, fengyin: 8, wanhua: 8, yingzi: 6, feifei_yingzi: 6, huanying: 8, wufeng: 4, sanhua: 8, jingzhi: 6,
  // 絕學
  tieshazhang: 7, qinna: 6, juye: 5, jinzhong: 8, qinggong: 4, taxue: 5, xuli: 5, tietou: 7, shihou: 7, dianxue: 7,
  zuiquan: 5, yixing: 5, gekong: 4, guixi: 5, taiji: 4, mabu: 7, yungong: 8, yide: 6, tuishou: 5, dieda: 5, shibadie: 6,
  hujin: 6, boming: 6, liandao: 8, jiedao: 6, wangming: 7, tiexin: 9, fanpu: 5, shierlian: 7, huxin: 8, jiuweiquan: 8,
};
/** 這張牌有沒有手動評分（沒有＝照稀有度的預設）。給測試盯「新加的牌有沒有漏評」用 */
export function handRated(cardId: string): boolean {
  return cardId in RATING;
}
export function rating(cardId: string): number {
  const def = cardById[cardId];
  if (!def) return 0;
  if (def.pool === '壞毛病') return -10;
  return RATING[cardId] ?? (def.rarity === '稀有' ? 7 : def.rarity === '罕見' ? 5 : 4);
}

/*
 * ===== 秘寶的分數：實測的量尺（2026-09-23 內容擴充第〇批 0-3）=====
 *
 * 原本是手填的一張表：77 件只評了 34 件、其餘一律 5 分，事件裡的秘寶一律算 24（常見）／34（大魔物）分，
 * 而且四隻貓共用一份——同一件隱身放大器對球球跟對噹噹當然不一樣值。機器人挑秘寶跟丟骰差不多，
 * 新秘寶放進池子也量不出強弱。
 *
 * 現在讀 `relic-ratings.json`（`tools/relic_ruler.test.ts` 產生）：開局塞這一件、這隻跑 600 局、
 * 跟同一批種子逐局相減看平均多爬幾層。**每隻一份**。
 *   - `score`＝5＋平均多爬幾層（最低 0、不封頂）：過關三選一挑最高的、罐頭鋪 6 分以上才買
 *   - `ev`＝事件估值用的分數：一層換幾分是拿「只加最大生命」那幾件當錨，跟 `eventValue` 的最大生命同一把尺
 * 表上沒有的（新加、還沒量的）照舊：分數 5、事件分照池子給 24／34。**改了秘寶或機器人規則就要重量**，
 * `tools/relic_ruler.test.ts` 會擋「池子裡有秘寶沒量過」。
 *
 * 這一支只有量測在讀（正式遊戲不載入 smartbot），所以資料檔多大都不吃首載預算。
 */
interface RelicRatingTable { relics: Record<string, Partial<Record<Hero, { score: number; ev: number }>>> }
let relicTable: RelicRatingTable = RELIC_RATINGS as RelicRatingTable;
/** 換一份分數表（測試、量尺比對用）；傳 `null` 換回資料檔那一份 */
export function setRelicRatings(t: RelicRatingTable | null): void {
  relicTable = t ?? (RELIC_RATINGS as RelicRatingTable);
}
export function relicRating(id: string, hero: Hero = 'ninja'): number {
  return relicTable.relics[id]?.[hero]?.score ?? 5;
}
/** 拿到這一件，照事件估值的單位值多少 */
export function relicEventValue(id: string, hero: Hero = 'ninja'): number {
  return relicTable.relics[id]?.[hero]?.ev ?? (relicById[id]?.pool === '大魔物' ? 34 : 24);
}
/**
 * 拿到這一件就湊成套組的話，套組加成值幾分（2026-09-23 第二批，師門：集到兩件每場第一回合多 1 顆飯糰）。
 *
 * 量尺是一件一件量的，量不到「湊成一套」那份——機器人不會為了湊兩件去挑斗笠（事件劇本第八節的提醒）。
 * 師門的加成跟**飯糰袋一模一樣**（每場第一回合多 1 顆飯糰），所以直接借飯糰袋量出來的層差當這份加成的分數，不另外手填。
 * 不傳 `owned`＝不看套組（舊呼叫端照舊）。
 */
export function setBonusScore(id: string, hero: Hero, owned?: readonly string[]): number {
  const set = relicById[id]?.set;
  if (!set || !owned || owned.includes(id) || setCount(set, owned) !== RELIC_SETS[set].need - 1) return 0;
  return Math.max(0, relicRating('onigiri_bag', hero) - 5) * RELIC_SETS[set].firstTurnEnergy;
}

/** 幾件裡挑一件（過關三選一、兩個人的秘寶獎勵）：分數最高的；同分照原本的順序。`owned` 給了就把湊成套組的加成算進去 */
export function bestRelic(ids: readonly string[], hero: Hero, owned?: readonly string[]): string | undefined {
  const score = (id: string): number => relicRating(id, hero) + setBonusScore(id, hero, owned);
  return ids.slice().sort((a, b) => score(b) - score(a))[0];
}
/**
 * 事件說「隨機獲得一件某池的秘寶」值多少：**這一位抽得到的那幾件的平均**。
 * 候選跟 `applyRunEffects` 的 `relic` 那一支同一套（這一池、身上沒有的、這一位的角色沒被鎖的），
 * 所以收齊一池之後是 0（引擎那時什麼都不給）。
 */
export function relicPoolValue(run: RunState, pool: RelicPool, seat = 0): number {
  const hero = heroOf(me(run, seat));
  const owned = me(run, seat).relics;
  const cands = relics.filter((r) => r.pool === pool && !owned.includes(r.id) && relicOk(r, [hero]));
  return cands.length ? cands.reduce((s, r) => s + relicEventValue(r.id, hero), 0) / cands.length : 0;
}

/**
 * 淨化這一件值多少（2026-09-23 第三批，design3 6-4）：量尺上「淨化版 − 原件」，`ev` 是事件分（事件估值用）、`floors` 是層差（貓窩、罐頭鋪的門檻用）。
 * 淨化版跟原件都要量過（`RULER_ONLY`），不然退回池子的預設分、收益算不準。
 */
export function purifyGain(id: string, hero: Hero): { ev: number; floors: number } {
  const pure = MIASMA_PURE[id];
  if (!pure) return { ev: 0, floors: 0 };
  return { ev: relicEventValue(pure, hero) - relicEventValue(id, hero), floors: relicRating(pure, hero) - relicRating(id, hero) };
}
/** 幾件裡挑一件淨化：淨化後分數多最多的那件（design3 6-2：機器人的挑法）；同分照身上的順序 */
export function bestPurify(ids: readonly string[], hero: Hero): string | undefined {
  return ids.slice().sort((a, b) => purifyGain(b, hero).ev - purifyGain(a, hero).ev)[0];
}
/**
 * 貓窩要不要點清心香（design3 6-4）：收益 ≥ 1.5 層、血 ≥ 六成、而且不是 44F（那一格打盹回滿）才淨化，回要淨化哪一件；不然回 undefined，照原本的打盹／磨爪。
 */
export function restPurifyPick(run: RunState, seat = 0): string | undefined {
  const p = me(run, seat);
  if (run.floor === 44 || p.hp < p.maxHp * 0.6) return undefined;
  const hero = heroOf(p);
  const id = bestPurify(miasmaRelicsOf(run, seat), hero);
  return id && purifyGain(id, hero).floors >= 1.5 ? id : undefined;
}
/** 夢枕：打盹之後照 `pickCard` 挑（三張都是升級版，每張 +1；不到門檻就不拿） */
export function takePillowCard(run: RunState, seat = 0): void {
  const picks = restCardChoices(run, seat);
  if (picks.length) takeRestCard(run, pickCard(run, picks, seat, 1) ?? '', seat);
}
/**
 * 帶夢枕的貓窩要不要改成打盹（2026-09-24 b3int）：三張裡挑得到一張夠好的升級版牌，睡下去＝回血＋一張新的升級牌，
 * 比磨爪（升一張舊牌）划算，就睡。三張是這一格的分支亂數算的（`restCardChoices`），先看不會推整局亂數。
 * 原本只在缺血時打盹，夢枕量出來約 0 層（大多數貓窩都去磨爪，根本沒看到那三張）。
 */
export function pillowWorthNap(run: RunState, seat = 0): boolean {
  const picks = restCardChoices(run, seat);
  return picks.length > 0 && pickCard(run, picks, seat, 1) !== null;
}

/**
 * 量尺的觀察點（2026-09-23 第〇批 0-3，`tools/relic_ruler.test.ts` 用）。
 *
 * 平常是 `null`，每一處都寫成 `probe?.x?.(…)`：**不改任何一個決策**，平衡報告的數字一個位元都不動。
 * 量尺要做三件 `smartRun` 本身不做的事——開局塞一件秘寶（或拿掉起始那件）、數秘寶在戰鬥裡發動幾次、
 * 記每一支忍具什麼時候拿到、什麼時候喝掉——所以在這裡開幾個洞，而不是在工具裡再抄一份 `smartRun`
 *（盤點時的 `sim.ts` 就是抄一份，抄的那份跟正本會慢慢走鐘，量出來的就不是機器人真正的樣子）。
 */
export interface SmartProbe {
  /** 開局之後、走第一格之前 */
  setup?(run: RunState): void;
  /** 每一格走完（戰鬥、事件、罐頭鋪……結算完）之後 */
  node?(run: RunState, node: MapNode): void;
  /** 每一場戰鬥打完、還沒結算獎勵之前 */
  combatEnd?(cs: CombatState): void;
  /** 機器人**確定喝得下去**、正要喝一支忍具（喝之前叫，看得到喝之前的血量與回合） */
  potion?(cs: CombatState, potionId: string, seat: number): void;
  /**
   * 開局祝福要拿哪一樣（祝福量尺用，2026-09-23 第三批）：回代號＝**強制拿這一樣**（不管包袱裡有沒有）、
   * 回 `null`＝什麼都不拿（量尺的基準）、不給或回 `undefined`＝照機器人自己挑
   */
  blessing?(run: RunState, seat: number): string | null | undefined;
}
let probe: SmartProbe | null = null;
/** 掛著觀察點跑一段（跑完一定拆掉，例外也一樣） */
export function withSmartProbe<T>(p: SmartProbe, fn: () => T): T {
  const prev = probe;
  probe = p;
  try { return fn(); } finally { probe = prev; }
}

// ===== 戰鬥 =====

/**
 * 玩家在「回合結束的減益衰減跑完之後」的樣子。只用來估傷害，不動真的狀態。
 *
 * 收的是**哪一位**（2026-09-16 量雙人時加的參數）：兩個人一起打時每個座位身上的
 * 翻肚層數不一樣，估錯人等於估錯這一拍會挨多少。不傳就是座位 0，單機完全沒變。
 */
function decayedDefender(p: PlayerCombat): Unit {
  const statuses = { ...p.statuses };
  for (const name of TURN_DECAY) {
    const fresh = p.freshDebuffs[name] ?? 0;
    const have = statuses[name] ?? 0;
    if (have > fresh) statuses[name] = have - 1;
  }
  return { hp: p.hp, maxHp: p.maxHp, block: p.block, statuses };
}

/** 這隻魔物這一拍會打出來的每一下（已算爪力、蓄力、你的翻肚），沒攻擊就是空陣列。`who`＝算在誰身上 */
function incomingHits(cs: CombatState, e: EnemyCombat, who: PlayerCombat = cs.player): number[] {
  return incomingHitList(cs, e, who).map((h) => h.dmg);
}
/** 同上，但帶著「這一下穿不穿蜷縮」 */
function incomingHitList(cs: CombatState, e: EnemyCombat, who: PlayerCombat = cs.player): { dmg: number; pierce: boolean }[] {
  if (e.dead) return [];
  const m = e.move;
  if (!willAct(e)) return [];   // 定身擋整個動作、沉睡什麼都不做——跟引擎與畫面同一支判準
  if (isDazed(e)) return [];    // 迷魂香（2026-09-23 第二批）：這一輪牠的攻擊打牠的同伴，不打你
  const x = e.charged ? 2 : 1;
  // 翻肚（受傷 ×1.5）要照**衰減之後**的層數算（稽核 2026-09-10 低-5）：
  // 引擎在魔物出手之前就先把玩家的減益減一層（`endTurn` 裡那段），所以身上剛好 1 層翻肚時
  // 魔物實際打過來是不吃加成的，機器人卻按 1.5 倍估、於是多擋少打。這只影響平衡報告的數字，
  // 但平衡就是靠這支量的。自己這回合疊上去的那幾層不衰減，判準跟引擎那邊一致。
  const player = decayedDefender(who);
  const hits: { dmg: number; pierce: boolean }[] = [];
  for (const fx of m.effects) {
    // 蓄力不加倍穿透招（跟引擎同一條規則，不然機器人會高估那一下、無謂地多擋）
    if (fx.kind === 'damage') for (let i = 0; i < (fx.times ?? 1); i++) hits.push({ dmg: computeAttack(fx.amount * (fx.pierce ? 1 : x), e, player), pierce: !!fx.pierce });
    else if (fx.kind === 'damageRandom') hits.push({ dmg: computeAttack(Math.round((fx.min + fx.max) / 2) * x, e, player), pierce: false });
    // 自爆那一下照樣要擋（河豚精的 28 點是整場最痛的單發之一）
    else if (fx.kind === 'selfDestruct') hits.push({ dmg: computeAttack(fx.amount * x, e, player), pierce: false });
    // 照你身上的毒打（鏡中球球學菲菲的見血封喉，2026-09-15）：不估的話機器人會低估這一拍、少擋——
    // 毒流的層數常常比魔物的普攻還痛，而平衡報告就是靠這支量的
    else if (fx.kind === 'damageByPlayerStatus') hits.push({ dmg: computeAttack(getStatus(player, fx.name) * (fx.mul ?? 1) * x, e, player), pierce: false });
  }
  return hits;
}

/**
 * 這回合還會吃到多少：照引擎的順序模擬——每一下先由蜷縮擋，擋不完的那一下才耗一層隱身閃掉；穿透不看蜷縮（2026-09-04 判定順序改了）。
 *
 * `who`＝算誰的（2026-09-16）。兩個人一起打時**一招打全部站著的人、每個人各吃完整一份**
 *（`actions.ts` 的 `ENEMY_HITS_EVERYONE`），所以每一位都照整份清單算，差別只在各自的蜷縮與隱身。
 */
function expectedIncoming(cs: CombatState, who: PlayerCombat = cs.player, blockOverride?: number): number {
  const p = who;
  if (p.immune) return 0;
  const all = aliveEnemies(cs).flatMap((e) => incomingHitList(cs, e, who));
  /*
   * `blockOverride`＝「身上的蜷縮換成這個數之後會吃多少」（2026-09-22 量測修正）。
   * 噹噹的卸蜷縮牌要問「卸完之後多吃幾點」，而 `evaluate` 拿到的 `incoming`
   * 已經是**扣過現有蜷縮**的淨值——拿淨值再去夾蜷縮等於同一份蜷縮算兩次。
   * 傳 0 就是「完全不擋會吃多少」，兩者相減＝現有蜷縮真正擋掉的量。
   */
  let block = blockOverride ?? p.block; let stealth = getStatus(p, '隱身'); let taken = 0;
  for (const h of all) {
    const absorbed = h.pierce ? 0 : Math.min(block, h.dmg);
    const rest = h.dmg - absorbed;
    if (rest > 0 && stealth > 0) { stealth -= 1; block -= absorbed; continue; }
    block -= absorbed; taken += rest;
  }
  return taken;
}
function incomingHitCount(cs: CombatState): number {
  return aliveEnemies(cs).reduce((s, e) => s + incomingHits(cs, e).length, 0);
}

/** 這張牌打在這隻魔物身上大概能扣多少血（吃過爪力、翻肚、防禦、隱身） */
/**
 * `noStrength`：**忍具的傷害不吃爪力**（`effects.ts` 的 `noStrength: ctx.source === 'potion'`）。
 * 不傳的話估出來是「傷害＋爪力」，實際只有傷害——球球爪力 6、魔物血 18 防禦 20 時
 * 會估成「18 打得死」而開掉一支 45 條的忍具，實際只進 12 點、魔物活著剩 6 血
 *（稽核 2026-09-11 中-2）。牌的呼叫端不傳，維持原本行為。
 */
function damageTo(cs: CombatState, effects: Effect[], e: EnemyCombat, combo: number, doubled: boolean, plays = 0, noStrength = false,
                  who: PlayerCombat = cs.player): number {
  if (!attackable(cs, e)) return 0;
  if (getStatus(e, '隱身') > 0) return 0;
  let block = e.block;
  let total = 0;
  const p = who;   // 出手的是哪一位（2026-09-16 量雙人時加的；不傳就是座位 0，單機一個位元都沒變）
  // 飛行（燈蛾、月蛾后）：每一下先減半，扣到血就掉一層，掉到 0 之後才打得到全額
  let flying = getStatus(e, '飛行');
  // 同一張牌裡前面的效果已經卸掉多少蜷縮（噹噹的消耗牌，2026-09-17）
  let spent = 0;
  // 虛化（虛無貓，2026-09-03）：每一段最多只扣 1 點血。防禦照原本的量扣掉，只有進血條的那幾點被壓成 1
  const phasing = getStatus(e, '虛化') > 0;
  const swing = (raw: number, ignoreBlock = false): void => {
    const dmg = flying > 0 ? Math.floor(raw / 2) : raw;
    const ab = ignoreBlock ? 0 : Math.min(block, dmg);
    block -= ab; total += phasing ? Math.min(1, dmg - ab) : dmg - ab;
    if (flying > 0 && dmg - ab > 0) flying -= 1;
  };
  for (const fx of effects) {
    if (fx.kind === 'damage') {
      const times = fx.scaleWithCombo ? Math.min(combo + 1, fx.comboCap ?? 99) : (fx.times ?? 1);
      for (let i = 0; i < times; i++) swing(computeAttack(fx.amount * (doubled ? 2 : 1), p, e, { noStrength }), fx.ignoreBlock);
    } else if (fx.kind === 'damageSpendQi') {
      const spentQi = fx.allQi ? (p.qi ?? 0) : Math.min(p.qi ?? 0, fx.maxQi ?? (p.qi ?? 0));
      const raw = qiAmount(fx, spentQi) * (doubled ? 2 : 1);
      for (let i = 0; i < (fx.times ?? 1); i++) swing(computeAttack(raw, p, e), fx.ignoreBlock);
    } else if (fx.kind === 'damageRamp') {
      // 分身術：這場這張已打過幾次就加幾段（plays 由呼叫端查 cs.cardPlays）
      swing(computeAttack((fx.amount + fx.step * plays) * (doubled ? 2 : 1), p, e, { noStrength }));
    } else if (fx.kind === 'damageRandom') {
      swing(computeAttack(Math.round((fx.min + fx.max) / 2) * (doubled ? 2 : 1), p, e, { noStrength }));
    } else if (fx.kind === 'damageEqualBlock') {
      // 這裡也要乘加倍，跟 `effects.ts` 同步（稽核 2026-09-10 中-3）：
      // 同一支函式的 damage／damageRamp／damageRandom 三個分支都乘了，只有這個漏掉，
      // 蓄力／秘笈在手時「絕學·借力使力」的價值被低估一半，機器人不會挑它、牌價值表也偏低
      swing(computeAttack(p.block * (doubled ? 2 : 1), p, e, { noStrength: true }));
    } else if (fx.kind === 'damageByStatus') {
      // 見血封喉：把毒一次引爆。引擎走 `direct`，蜷縮擋不住，所以這裡也要 ignoreBlock。
      // 倍率要算進去（升級版兩倍），不然機器人會低估那張牌、永遠不挑它
      // 加倍也要乘，跟 `effects.ts` 同步（夜間稽核 高-1）
      swing(getStatus(e, fx.name) * (fx.mul ?? 1) * (doubled ? 2 : 1), true);
    } else if (fx.kind === 'execByStatus') {
      // 一針斃命：毒夠多就直接了結，不夠就什麼都沒發生
      if (getStatus(e, fx.name) >= e.hp) swing(e.hp, true);
    } else if (fx.kind === 'damageSpendBlock') {
      /*
       * 噹噹：卸掉蜷縮打出去。**照實模擬「吃多少打多少」**，不要假設蜷縮夠——
       * 這支是量平衡用的尺，把卸力掌當成固定 6 點的話，會量不出他真正的難處
       *（蜷縮不夠時這些牌就是廢牌，而那正是這一套設計的取捨所在）。
       *
       * `spent` 只用來模擬「同一張牌裡先卸掉的那些，後面的牌就沒得卸了」。
       */
      const pool = Math.max(0, p.block - spent);
      const want = fx.all ? pool : (fx.max ?? 0);
      const hit = Math.min(want, p.halfSpendBlock ? pool * 2 : pool);
      spent += p.halfSpendBlock ? Math.ceil(hit / 2) : hit;
      const plus = fx.plusOwnStatus ? getStatus(p, fx.plusOwnStatus) : 0;
      swing(computeAttack((Math.floor(hit * (fx.mul ?? 1)) + plus) * (doubled ? 2 : 1), p, e, { noStrength: true }), fx.ignoreBlock);
    } else if (fx.kind === 'damageByOwnStatus') {
      // 以彼之道：照**自己**的反彈打。反彈是自己身上的，跟目標無關，所以每一隻的估值都一樣
      swing(computeAttack(getStatus(p, fx.name) * (fx.mul ?? 1) * (doubled ? 2 : 1), p, e, { noStrength: true }));
    } else if (fx.kind === 'ifBlock') {
      // 條件成立才算：門檻沒到就整條不發生，估成一定會發生的話連環撞會被高估一倍
      if (p.block >= fx.min) for (const sub of fx.then) total += damageTo(cs, [sub], e, combo, doubled, plays, noStrength, p);
    } else if (fx.kind === 'ifEnemyIntent') {
      // `then` 裡目前只有加反彈，打不到人；留這一支是為了以後塞攻擊進去時不會靜默漏算
      if (cs.enemies.some((x) => !x.dead && x.move.intent === fx.intent)) {
        for (const sub of fx.then) total += damageTo(cs, [sub], e, combo, doubled, plays, noStrength, p);
      }
    }
  }
  return total;
}

interface Plan { uid: number; target?: number; value: number; cost: number; endsTurn: boolean }

/**
 * 幫每一張打得出的牌估一個「現在打出去值多少」。
 *
 * `seat`＝現在輪到誰在挑牌（2026-09-16 量雙人時加的）。不傳就是座位 0，單機那條路一個字都沒動；
 * 連線量測時兩個座位各叫一次，估的是各自的手牌、飯糰、蜷縮與身上的狀態。
 */
/**
 * **憋氣**（2026-09-24）：手上的一點氣「留著以後花」值多少。
 * 看整副牌裡花氣的招式，花滿上限時每點氣平均打幾點，打五折（晚點才用得到、不一定抽得到；
 * 0.5～0.7 量出來最好，0.85 以上存太兇反而變差）。這場快打完時氣會清掉，留著不值錢。
 * 拿它當「氣的價錢」：產氣的牌照這個價加分、花氣的牌照這個價扣回來。
 * 沒有這條，機器人一律「有氣就花」，憋氣規則（`qiAmount`）量不出來、會把封封量弱。
 */
function qiHoldValue(p: PlayerCombat, enemies: EnemyCombat[], rest: number): number {
  if (rest <= 1) return 0;
  let best = 0;
  for (const c of [...p.hand, ...p.drawPile, ...p.discardPile]) {
    for (const fx of cardStats(c).effects) {
      if (fx.kind !== 'damageSpendQi') continue;
      const q = fx.allQi ? 12 : Math.min(12, fx.maxQi ?? 12);
      if (q <= 0) continue;
      const rate = (qiAmount(fx, q) - qiAmount(fx, 0)) / q
        * (fx.times ?? 1) * (fx.target === 'all' ? Math.max(1, enemies.length) : 1);
      best = Math.max(best, rate);
    }
  }
  return 0.5 * best;
}

function evaluate(cs: CombatState, c: CardInstance, incoming: number, hits: number, seat = 0): Plan | null {
  const p = (cs.players[seat] ?? cs.player) as PlayerCombat;
  const st = cardStats(c);
  const def = st.def;
  const enemies = aliveEnemies(cs);
  const target0 = def.target === 'enemy' ? enemies.find((e) => attackable(cs, e)) ?? enemies[0] : undefined;
  const chk = canPlay(cs, c.uid, target0?.uid, seat);
  if (!chk.ok) return null;
  const lowHp = p.hp - incoming <= 0;          // 不擋就死
  const danger = p.hp - incoming < p.maxHp * 0.35;
  const totalEnemyHp = enemies.reduce((s, e) => s + (attackable(cs, e) ? e.hp + e.block : 0), 0);
  let value = 0;
  let endsTurn = false;
  let target: number | undefined;
  const combo = p.cardsPlayedThisTurn;
  const plays = cs.cardPlays?.[c.uid] ?? 0;   // 分身術這場已打過幾次
  /** 粗估這一場還要打幾回合（長效旗標要乘它；跟 `power` 那條同一個算法） */
  const rest = Math.max(1, Math.min(8, Math.ceil(totalEnemyHp / 14)));
  // 憋氣（2026-09-24）：氣的價錢，只有碰到蓄氣的牌才算（其他三隻一個位元都不會變）
  const usesQi = st.effects.some((fx) => fx.kind === 'gainQi' || fx.kind === 'damageSpendQi' || fx.kind === 'blockSpendQi' || fx.kind === 'nextAttackBonusSpendQi');
  const hold = usesQi ? qiHoldValue(p, enemies, rest) : 0;
  /*
   * 這張牌會不會打人——**決定要不要進挑目標那一段**，而挑不到目標的指定牌會被
   * `if (def.target === 'enemy' && !target) return null` 整張丟掉。
   *
   * 2026-09-12 補上菲菲那三種（遠射、見血封喉、一針斃命）：漏掉的話機器人
   * **一輩子都打不出那三張**，而且完全不會報錯——量平衡時會安靜地少掉她三張主力。
   * 加新的傷害種類記得回頭補這一行，跟 `damageTo` 是一對。
   */
  const DMG_KINDS: ReadonlySet<Effect['kind']> = new Set(
    ['damage', 'damageSpendQi', 'damageRamp', 'damageRandom', 'damageEqualBlock', 'damageByStatus', 'execByStatus',
     // 2026-09-17 噹噹的兩種。漏掉的時候他六張主力牌（卸力掌、崩山掌、震盪波、鐵山靠、
     // 原樣奉還、捨身撞）的分數只剩負的出牌成本，永遠過不了 0.5 的門檻——
     // 第一次量出來的平衡數字就是這樣來的，而且一聲都沒響
     'damageSpendBlock', 'damageByOwnStatus']);
  const hasDamage = st.effects.some((fx) => DMG_KINDS.has(fx.kind));

  if (hasDamage) {
    // 挑目標：能打死的優先（少一隻就少挨一份），否則打最矮的能打的那隻
    let best: { e: EnemyCombat; v: number } | null = null;
    for (const e of enemies) {
      if (!attackable(cs, e)) continue;
      const dmg = damageTo(cs, st.effects, e, combo, p.doubleNext > 0, plays, false, p);
      // 牠有隱身：這一下會落空，但不打掉那層永遠打不到牠——便宜的攻擊牌照樣值得丟
      let v = dmg > 0 ? dmg : getStatus(e, '隱身') > 0 ? 3 / Math.max(1, st.cost) : 0;
      if (dmg >= e.hp) v += 8 + incomingHits(cs, e, p).reduce((s, h) => s + h, 0);   // 收頭：牠這回合的傷害也一起省掉
      else v += e.hp < 20 ? 2 : 0;
      // 牠身上有反彈：每打一下就被刺一下（2026-09-02 反彈才真的生效），多段牌撞上去很痛
      const hits = st.effects.reduce((n, fx) => n + (fx.kind === 'damage' ? (fx.times ?? 1)
        : fx.kind === 'damageSpendQi' ? (fx.times ?? 1)
        : fx.kind === 'damageRandom' || fx.kind === 'damageEqualBlock' || fx.kind === 'damageRamp'
          || fx.kind === 'damageSpendBlock' || fx.kind === 'damageByOwnStatus' ? 1 : 0), 0);
      if (getStatus(e, '反彈') > 0 && dmg < e.hp) v -= getStatus(e, '反彈') * hits * (lowHp ? 4 : 1.5);
      if (!best || v > best.v) best = { e, v };
    }
    /*
     * **靠身上資源打人的牌，算出來 0 傷就不打**（2026-09-22 量測修正）。
     * 噹噹的卸蜷縮牌（卸力掌、崩山掌、震盪波、鐵山靠、捨身撞）與照反彈打的原樣奉還，
     * 身上沒蜷縮／沒反彈時整張撲空（引擎只印「身上沒有蜷縮可卸」），
     * 可是上面那條「目標血少於 20 加 2 分」不管打不打得到都給，淨值 1.4 過了 0.5 的門檻——
     * 原本 600 局裡 21.8% 的卸蜷縮出招是撲空的。只管這兩種：其他牌 0 傷多半是目標有隱身，
     * 那邊本來就有「打掉那層隱身」的估法，不動它。
     */
    if (st.effects.some((fx) => fx.kind === 'damageSpendBlock' || fx.kind === 'damageByOwnStatus')) {
      const total = def.target === 'all'
        ? enemies.reduce((s, e) => s + damageTo(cs, st.effects, e, combo, p.doubleNext > 0, plays, false, p), 0)
        : best ? damageTo(cs, st.effects, best.e, combo, p.doubleNext > 0, plays, false, p) : 0;
      if (total <= 0) return null;
    }
    if (def.target === 'all') {
      value += enemies.reduce((s, e) => s + damageTo(cs, st.effects, e, combo, p.doubleNext > 0, plays, false, p), 0);
      if (best) value += best.v - damageTo(cs, st.effects, best.e, combo, p.doubleNext > 0, plays, false, p);
    } else if (best) { value += best.v; target = best.e.uid; }
    if (def.target === 'enemy' && !target) return null;
    // 全場快清光了就別留手
    if (totalEnemyHp <= 12) value += 3;
  }
  for (const fx of st.effects) {
    switch (fx.kind) {
      case 'block': {
        // 拒馬（`blockBonus`）要一起算：引擎是 `computeBlock(base + blockBonus, u)`
        //（見 `actions.ts` 的 `gainBlock`）。漏掉的話，拿到拒馬之後**每一張**防禦牌、
        // 每一張自帶蜷縮的攻擊牌都被低估 2～3 點，機器人會傾向不打它們，
        // 而這支是量平衡用的尺，於是拒馬流的數字整個偏低（2026-09-12 稽核 中-3）
        const b = computeBlock(fx.amount + (p.blockBonus ?? 0), p);
        const useful = Math.min(b, incoming);
        value += useful * (lowHp ? 3 : danger ? 1.6 : 1.1) + (b - useful) * 0.12;
        /*
         * **先存蜷縮、再卸出去**（2026-09-22 量測修正，策略性的）。手上還有卸蜷縮的牌、飯糰也夠
         * 兩張一起打時，擋不到攻擊的那幾點其實是下一張的彈藥，照 0.8 算（原本只給 0.12，
         * 機器人不會為了卸力掌先疊蜷縮，21.8% 的卸蜷縮出招是撲空的）。
         * 只有噹噹有卸蜷縮的牌（`damageSpendBlock`），其他三隻的出牌一個位元都不會變。
         */
        if (b > useful) {
          const fuel = p.hand.filter((h) => h.uid !== c.uid && cardStats(h).cost + st.cost <= p.energy)
            .map((h) => cardStats(h).effects.find((x) => x.kind === 'damageSpendBlock'))
            .filter((x): x is Extract<Effect, { kind: 'damageSpendBlock' }> => x?.kind === 'damageSpendBlock');
          if (fuel.length) {
            const cap = Math.max(...fuel.map((x) => (x.all ? 40 : (x.max ?? 0)) * (x.mul ?? 1)));
            const surplusNow = Math.max(0, p.block - (expectedIncoming(cs, p, 0) - incoming));   // 現有蜷縮裡本來就擋不到的
            value += Math.max(0, Math.min(b - useful, cap - surplusNow)) * 0.8;
          }
        }
        break;
      }
      case 'blockIfPoisoned': {
        /*
         * 跟 `block` 同一條算式，但**目標原本沒中毒就一點都拿不到**
         * （2026-09-16：她的攻擊牌不再無條件送蜷縮）。
         *
         * 打全體的牌沒有指定目標，跟引擎同一個規矩：看場上最高的那一層。
         * 這裡照實算而不是打個折，因為這支是量平衡用的尺——估錯的話
         * 「先下毒再打」這個新的出牌順序就量不出來。
         */
        const t = target === undefined ? undefined : enemies.find((e) => e.uid === target);
        const poisoned = t ? getStatus(t, '中毒')
          : Math.max(0, ...enemies.filter((e) => attackable(cs, e)).map((e) => getStatus(e, '中毒')));
        if (poisoned > 0) {
          const b2 = computeBlock(fx.amount + (p.blockBonus ?? 0), p);
          const useful2 = Math.min(b2, incoming);
          value += useful2 * (lowHp ? 3 : danger ? 1.6 : 1.1) + (b2 - useful2) * 0.12;
        }
        break;
      }
      case 'status':
        if (fx.target === 'self') {
          if (fx.name === '隱身') {
            // 隱身排在蜷縮後面：照引擎順序把蜷縮一路吃掉，留下「擋不完的那幾下」（穿透不看蜷縮），由大到小估前幾層閃掉的價值（八成）（稽核 2026-09-04 低 7）
            let pool = p.block;
            const passing: number[] = [];
            for (const h of enemies.flatMap((e) => incomingHitList(cs, e, p))) {
              const ab = h.pierce ? 0 : Math.min(pool, h.dmg); pool -= ab;
              if (h.dmg - ab > 0) passing.push(h.dmg - ab);
            }
            const all = passing.sort((a, b) => b - a);
            const cur = getStatus(p, '隱身');
            const gain = all.slice(cur, cur + fx.amount).reduce((s, h) => s + h, 0) * 0.8;
            value += gain * (lowHp ? 3 : danger ? 1.6 : 1.1) + (fx.amount - Math.min(fx.amount, Math.max(0, all.length - cur))) * 1.5;
          } else if (fx.name === '爪力') value += fx.amount * 4 * Math.min(1, totalEnemyHp / 40);
          else if (fx.name === '貓步') value += fx.amount * 3;
          /*
           * 反彈**整場不會消失**（不在 `TURN_DECAY` 裡），所以照「這一場還剩幾回合 × 每回合至少挨一下」估，
           * 打六折（2026-09-22 量測修正）。原本只看「這一拍會挨幾下」：魔物這回合不攻擊就估 0，
           * 噹噹起手那張「回敬」淨值 −0.6、機器人在不挨打的回合一輩子不打它（打出率 22%），
           * 只改這一條，噹噹 600 局平均到達樓層 20.2F → 22.1F；球球、菲菲只動 0.1～0.2F。
           */
          else if (fx.name === '反彈') value += fx.amount * Math.max(1, Math.min(hits, 4)) * rest * 0.6;
          else if (fx.name === '潛水') value += fx.amount * 4;
          else if (fx.name === '鐵布衫') value += fx.amount * 0.9;
          else if (fx.name === '翻肚') value -= 6;   // 出大事了的代價
        } else {
          const n = fx.target === 'all' ? enemies.length : 1;
          if (fx.name === '翻肚') value += 5 * n;
          /*
           * 中毒**會疊**，所以估的要是「這幾層多打出多少」，不是「這幾層自己打多少」。
           *
           * N 層的總傷害是 N(N+1)/2。原本寫 `amount*(amount+1)/2`，等於假設牠身上本來是乾淨的：
           * 對著已經 10 層的再加 3 層，實際是 91−55＝**36 點**，原本卻只估成 6 點。
           * 差六倍，而機器人就是照這個數字挑牌——堆毒流在牠手上永遠疊不起來
           *（2026-09-12 量菲菲時抓到：她 15F 陣亡 216／300，球球只有 161）。
           * 另外**打超過牠的血就是浪費**，估值夾在牠現在的生命。
           */
          else if (fx.name === '中毒') {
            const tri = (k: number): number => k * (k + 1) / 2;
            const amt = fx.amount + (fx.step ?? 0) * plays;   // 菲菲的分身術：這場打過幾次就多幾段
            const marginal = (e: EnemyCombat): number => {
              const cur = getStatus(e, '中毒');
              return Math.min(tri(cur + amt) - tri(cur), e.hp);
            };
            const hit = fx.target === 'all' ? enemies
              : [target !== undefined ? enemies.find((e) => e.uid === target) : undefined, target0, enemies[0]].find((e) => !!e);
            const list = Array.isArray(hit) ? hit : hit ? [hit] : [];
            value += list.reduce((sum, e) => sum + marginal(e), 0) * 0.9;
          }
          else if (fx.name === '懶洋洋') value += Math.min(incoming, 12) * 0.25 * n + 2;
          else if (fx.name === '炸毛') value += 1.5 * n;
          else if (fx.name === '定身') {
            const stunned = target !== undefined ? enemies.find((e) => e.uid === target) : enemies.slice().sort((a, b) => incomingHits(cs, b, p).reduce((s, h) => s + h, 0) - incomingHits(cs, a, p).reduce((s, h) => s + h, 0))[0];
            const saved = stunned ? incomingHits(cs, stunned, p).reduce((s, h) => s + h, 0) : 0;
            value += saved * (lowHp ? 3 : 1.2) + 3;
            if (stunned && def.target === 'enemy' && !hasDamage) target = stunned.uid;
          }
        }
        break;
      case 'draw': value += fx.n * (p.energy - st.cost > 0 ? 3 : 1.2); break;
      case 'drawNextTurn': value += fx.n * 2; break;
      case 'drawIfTargetStatus': value += 1; break;
      case 'energy': value += fx.n * 3.5; break;
      case 'gainQi': {
        const room = Math.min(fx.n, Math.max(0, 12 - (p.qi ?? 0)));
        const keep = Math.max(1.4, hold);
        let v = room * keep;
        /*
         * **先吐納、再出斬**（2026-09-22 量測修正，策略性的）。手上有花蓄氣的攻擊牌、飯糰也夠
         * 兩張一起打時，這幾點氣「這一回合就換得成傷害」，照那張牌每點氣加幾點估；
         * 原本一律 1.4，比 0 氣的平斬（5 點）低，機器人於是先斬後吐納，每一刀都只有 5 點，
         * 花蓄氣的牌平均只用到 1.04 點氣（上限 2～5）。
         * 只有封封的牌會產蓄氣（`gainQi`），其他三隻的出牌一個位元都不會變。
         */
        let left = p.energy - st.cost;
        let need = 0; let rate = 0;
        const spenders = p.hand.filter((h) => h.uid !== c.uid)
          .map((h) => ({ cost: cardStats(h).cost, e: cardStats(h).effects.find((x) => x.kind === 'damageSpendQi') }))
          .filter((x): x is { cost: number; e: Extract<Effect, { kind: 'damageSpendQi' }> } => x.e?.kind === 'damageSpendQi')
          .sort((a, b) => b.e.perQi - a.e.perQi);
        for (const s of spenders) {
          if (s.cost > left) continue;
          left -= s.cost;
          need += s.e.allQi ? 12 : (s.e.maxQi ?? 12);
          rate = Math.max(rate, s.e.perQi * (s.e.times ?? 1) * (s.e.target === 'all' ? Math.max(1, enemies.length) : 1));
        }
        const usable = Math.max(0, Math.min(room, need - (p.qi ?? 0)));
        if (usable > 0) v = Math.max(v, usable * rate + (room - usable) * keep);
        /*
         * 滿月劍意（2026-09-23 第二批）：這一張把蓄氣蓄到門檻（10）的話，這回合下一張攻擊牌加倍——照分身油那條估（手上還有攻擊牌才算）。
         * 不寫的話機器人不會為了蓄氣去打吐納，量尺量到這件每場只發動 0.06 次，分數等於沒量。
         */
        const qiNow = Math.max(0, p.qi ?? 0);
        if (room > 0 && p.fullMoonTurn !== cs.turn
            && p.relics.some((id) => { const t = relicById[id]?.hooks.qiReachDoubleNext; return t !== undefined && qiNow < t && Math.min(12, qiNow + fx.n) >= t; })
            && p.hand.some((h) => h.uid !== c.uid && cardById[h.cardId]?.type === '攻擊')) v += 6;
        value += v;
        break;
      }
      case 'heal': value += Math.min(fx.percent ? Math.round(p.maxHp * fx.percent / 100) : fx.n, p.maxHp - p.hp) * (danger ? 1.5 : 0.9); break;
      case 'gold': value += fx.onKill ? 0.5 : fx.n * 0.15; break;
      case 'power': {
        // 能力越早放越划算：粗估還要打幾回合
        const turnsLeft = Math.max(1, Math.min(8, Math.ceil(totalEnemyHp / 14)));
        let per = 0;
        for (const sub of fx.effects) {
          if (sub.kind === 'block') per += sub.amount * 0.9;
          else if (sub.kind === 'status' && sub.name === '爪力') per += sub.amount * 3.5;
          else if (sub.kind === 'status' && sub.name === '貓步') per += sub.amount * 2.5;
          // 反彈（2026-09-17 稽核 高-1）：漏這一行的後果是**整張牌估成負分、機器人一輩子不打**。
          // 站樁（`cards.ts` 的 `dangdang_zhanzhuang`）整張只有「每回合開始給反彈 2」，
          // per 算出來是 0 → `value - cost*0.6 = -0.6` → 打不過 `value > 0.5` 的門檻。
          // 更糟的是 `rating()` 沒列它、照罕見給預設分，所以牌照樣被挑進牌組、然後整場躺在手上。
          // 口徑照 `case 'status'` 那邊對自己上反彈的寫法（同一支檔案上面幾行），不要另創一套。
          // 這是「加第三個角色才冒出來」的同型錯誤第五次：清單型的判斷只認得舊角色用得到的種類。
          // 每回合給的反彈會**一路疊上去**（整場不消失），所以每一輪的價值再乘「平均疊了幾輪」（剩餘回合的一半）。
          // 口徑跟上面 `case 'status'` 的反彈同一套（2026-09-22 量測修正：原本只看這一拍挨幾下）
          else if (sub.kind === 'status' && sub.name === '反彈') per += sub.amount * Math.max(1, Math.min(hits, 4)) * 0.6 * Math.max(1, turnsLeft / 2);
          /*
           * 能力牌裡的「加蓄氣」（封封的循息、藏鋒）。原本這張清單沒有它，整張只剩 −0.6 的出牌成本，
           * 機器人一輩子不打（600 局打出 0 次）——「清單型的判斷只認得舊角色用得到的種類」同型錯誤第六次。
           * 口徑跟一般的 `gainQi`（每點 1.4）一樣；打出技能牌才觸發的那種打八折（不是每回合都湊得到）。
           */
          else if (sub.kind === 'gainQi') per += sub.n * 1.4 * (fx.trigger === 'afterCard' ? 0.8 : 1);
          else if (sub.kind === 'draw') per += sub.n * 2.5;
          else if (sub.kind === 'heal') per += sub.n * 0.6;
        }
        value += per * (fx.thisTurn ? 1 : turnsLeft) * (fx.trigger === 'onKill' ? 0.4 : fx.trigger === 'turnEndNoAttack' ? 0.3 : 1);
        break;
      }
      case 'immuneThisTurn': value += incoming * (lowHp ? 3 : 1.2); break;
      case 'doubleNextAttack': value += p.hand.some((h) => h.uid !== c.uid && cardById[h.cardId]?.type === '攻擊') ? 6 : 0; break;
      case 'selfDamage': value -= fx.amount * (danger ? 3 : 0.8); break;
      case 'endTurn': endsTurn = true; break;
      case 'noAttacksThisTurn': value -= p.hand.filter((h) => cardById[h.cardId]?.type === '攻擊').length * 2; break;
      case 'stealBlock': value += (target !== undefined ? enemies.find((e) => e.uid === target)?.block ?? 0 : 0) * 1.2; break;
      case 'cleanse': value += Object.entries(p.statuses).filter(([k, v]) => (DEBUFFS as readonly string[]).includes(k) && (v ?? 0) > 0).length * 4; break;
      case 'doubleStatus': {
        const best = enemies.reduce((m, e) => Math.max(m, getStatus(e, fx.name)), 0);
        value += best * (best + 1) / 2 * 0.9;
        if (best > 0 && def.target === 'enemy' && !hasDamage) target = enemies.find((e) => getStatus(e, fx.name) === best)!.uid;
        break;
      }
      case 'transferDebuffs': value += (getStatus(p, '中毒') + getStatus(p, '翻肚') * 2 + getStatus(p, '懶洋洋')) * 1.5; break;
      case 'removeStatuses': {
        const cap = fx.max ?? 99;
        value += (target !== undefined ? Math.min(cap, enemies.find((e) => e.uid === target)?.block ?? 0) * 0.8 + Math.min(cap, getStatus(enemies.find((e) => e.uid === target) ?? p, '爪力')) * 4 : 0);
        break;
      }
      case 'scry': value += 1; break;
      case 'exhaustFromHand': value += p.hand.some((h) => cardById[h.cardId]?.pool === '壞毛病') ? 4 : -1; break;
      case 'retainFromHand': value += 1.5; break;
      case 'discardFromHand': value -= 1; break;
      case 'recoverFromDiscard': value += p.discardPile.length ? 3 : -5; break;
      case 'damage': case 'damageSpendQi': case 'damageEqualBlock': case 'damageRamp': case 'damageRandom': break;   // 傷害在 switch 之前的傷害估算區另算，這裡不重複計
      case 'damageScatter': value += fx.amount * fx.times * 0.8; break;   // 打散：單隻場面等於集中火力，多隻場面會浪費一點，打八折
      case 'skipEnemyTurn': value += 12; break;                          // 整輪不挨打，價值約等於一次大防禦
      /*
       * 幫隊友的三招（連線版 2026-09-11）。機器人是**單人**在跑，所以這裡估的是
       * 「一個人玩的時候值多少」——那正是它們退化後的價值，估高了會讓機器人
       * 在單機測試裡優先打連線牌，平衡數字就歪了。
       */
      case 'blockAll': value += (fx.amount + (p.blockBonus ?? 0)) * 0.9; break;   // 一個人時就等於一般的蜷縮，稍微打折（沒有同伴可分）；拒馬同樣要算
      case 'statusAlly': value += fx.amount * 1.5; break; // 一個人時退化成掛自己身上，當一般的加狀態估
      case 'taunt': break;                                // 一個人時**完全沒作用**（本來就只會打你），估 0 是對的
      case 'blockAlly': value += (fx.amount + (p.blockBonus ?? 0)) * 0.9; break;   // 一個人時退化成給自己，當一般蜷縮估（稍打折：沒有同伴可分擔）；拒馬同樣要算
      case 'drawAlly': value += fx.n * 2.2; break;         // 一個人時退化成自己抽，跟 `draw` 同口徑
      case 'cleanseAlly': value += DEBUFFS.filter((d) => getStatus(p, d) > 0).length * 3; break;
      case 'energyAlly': value += fx.n * 4; break;         // 一顆飯糰約等於一張中等的牌
      // 見血封喉／一針斃命：傷害本身在 switch 之前的傷害估算區（`damageTo`）已經算過、也挑好了目標，這裡不重複計
      //（原本又加一次「目標身上幾層」，這兩張被高估一倍多——夜間稽核留的「見血封喉估值算兩次」）。
      // 只留原本那個語意：不清毒的話毒會繼續滾，同樣層數比一次性的傷害多值三成
      case 'damageByStatus': if (target0 && !fx.consume) value += getStatus(target0, fx.name) * (fx.mul ?? 1) * 0.3; break;
      case 'execByStatus': break;
      /*
       * 三個長效旗標：機器人是**單人**在跑，估的是「這一場剩下的回合裡大概值多少」。
       * `rest` 跟 `power` 那條用同一個粗估法（還要打幾回合），口徑才一致。
       */
      // 散毒：把目標的毒分給其他每一隻。估的是「其他那幾隻多出來的總傷害」——只剩一隻時等於 0
      case 'spreadStatus': {
        const t = target0 ?? enemies[0];
        const n = t ? getStatus(t, fx.name) : 0;
        const each = fx.half ? Math.floor(n / 2) : n;
        const tri = (k: number): number => k * (k + 1) / 2;
        value += enemies.filter((e) => e !== t).reduce((sum, e) => {
          const cur = getStatus(e, fx.name);
          return sum + Math.min(tri(cur + each) - tri(cur), e.hp);
        }, 0) * 0.9;
        break;
      }
      case 'poisonBurst': value += enemies.length > 1 ? 16 : 4; break;   // 只剩一隻時屍爆沒有對象
      // 拒馬：之後每次獲得蜷縮都多幾點。粗估這一場還會再擋幾次（每回合約一次）
      case 'blockBonus': value += fx.n * rest * 0.9; break;
      /*
       * 影子分身：之後每回合的第一張牌等於打兩次。粗估＝「剩幾回合 × 一張好牌的價值」。
       * 一張好牌抓 12 點當量（這副牌的攻擊牌大多 6～16），跟 `blockBonus` 同一套折算法。
       * **估太準沒有意義**——重點是它不能被當成零分，不然機器人永遠不打，量出來的平衡會偏低。
       */
      case 'echoFirst': value += rest * 12 * 0.9; break;
      case 'poisonOnAttack': value += fx.n * rest * 1.5; break;
      // 連線支援牌（2026-09-13）。機器人跑的是**單人**對照，所以這兩個都照
      // 「退化成作用在自己身上」估——那正是單人時真正會發生的事。
      case 'healAlly': value += fx.n * 0.8; break;          // 跟 `heal` 同一個係數
      // B 批六個。機器人跑的是**單人**對照，所以一律照「退化成自己」估：
      //   - 讀同伴的值 → 讀自己的（`blockFromAllyBlock`、`damageFromAllyStrength`）
      //   - 轉飯糰給同伴 → 單人時什麼都不發生，估 0 才對
      case 'blockFromAllyBlock':
        value += (fx.amount + Math.min(fx.half ? Math.floor(p.block / 2) : p.block, fx.cap)) * 1.0;
        break;
      case 'damageFromAllyStrength':
        value += (fx.amount + Math.min(getStatus(p, '爪力'), fx.cap)) * 1.1;
        break;
      case 'energyTransfer': break;                         // 單人時不轉，真的是 0
      case 'doubleNextAttackAlly':
        // 跟 `doubleNextAttack` 同一套：手上還有別的攻擊牌才有價值
        value += p.hand.some((h) => h.uid !== c.uid && cardById[h.cardId]?.type === '攻擊') ? 6 : 0;
        break;
      case 'drawAllyIfTargetStatus': {
        const t = target !== undefined ? enemies.find((e) => e.uid === target) : undefined;
        const hit = !t ? false
          : fx.anyDebuff ? (DEBUFFS as readonly string[]).some((d) => getStatus(t, d as never) > 0)
            : fx.name !== undefined && getStatus(t, fx.name) > 0;
        value += hit ? fx.n * 3 : 0;
        break;
      }
      /*
       * C 批六個。機器人跑的是**單人**對照。
       * 2026-09-13 稽核之後這幾張單人時都有退路了（改成監聽自己、發給自己），
       * 所以估值一律照「作用在自己身上」算，每輪各值一次抽牌或一份蜷縮，
       * 用 `rest`（剩幾回合）折算，跟 `blockBonus` 同一套。
       */
      case 'watchAllyPlay': value += rest * 3 * 0.9; break;         // 每輪抽 1 張
      case 'watchSelfPlay': value += rest * 6 * 0.9; break;         // 每輪 6 點蜷縮
      case 'watchPoisonHit': value += rest * 4 * 0.7; break;        // 每輪 4 點，但要湊中毒的條件
      case 'poisonAllyNextAttack': value += fx.amount * 2; break;   // 2 層毒≒3 點傷害，再給點餘裕
      case 'energyForAllyEachRound': value += rest * 3 * 0.9; break;  // 每輪 1 顆飯糰
      case 'transferDebuffsFromAlly':
        // 單人時等同 `transferDebuffs`，照它的係數
        value += (getStatus(p, '中毒') + getStatus(p, '翻肚') * 2 + getStatus(p, '懶洋洋')) * 1.5;
        break;
      case 'ifSelfStatus': {
        /*
         * 兩條分支都粗估一次、取**比較小**的那個。
         *
         * 為什麼不遞迴呼叫這支：整個估值是一個很長的 switch 寫在迴圈裡，沒有可重入的函式，
         * 為了一張牌把它拆開重構不划算。這裡只把分支裡的數字加總——
         * 那些效果（蜷縮、隱身、抽牌）的量級本來就差不多，估值只是用來
         * 決定「值不值得打」，不需要準。
         *
         * 取小的那邊是因為**高估比低估糟**：高估會讓機器人為了賭一個分支浪費飯糰，
         * 量出來的平衡就偏高，而平衡數字是拿來做決策的。
         */
        const crude = (es: typeof fx.then): number => es.reduce((s, e) => {
          const n = (e as { amount?: number; n?: number }).amount ?? (e as { n?: number }).n ?? 0;
          return s + n;
        }, 0);
        value += Math.min(crude(fx.then), crude(fx.otherwise)) * 0.9;
        break;
      }
      case 'blockSpendQi': {
        const spentQi = Math.min(p.qi ?? 0, fx.maxQi);
        const b = computeBlock(qiAmount(fx, spentQi) + (p.blockBonus ?? 0), p);
        value += Math.min(b, incoming) * (lowHp ? 3 : danger ? 1.6 : 1.1);
        break;
      }
      case 'nextAttackBonusSpendQi': {
        const spentQi = Math.min(p.qi ?? 0, fx.maxQi);
        value += (fx.amount + fx.perQi * spentQi) * (fx.recipients === 'selfAndAlly' ? 1.3 : 1);
        break;
      }
      case 'ifQiAtPlay': case 'ifSpentQiAtLeast': case 'ifAllyBlockAtPlay': {
        /*
         * **門檻沒到就不算**（2026-09-22 量測修正）。原本不管條件成不成立一律打七折照算，
         * 蓄氣 0 的時候「退步守勢」照樣被當成 11 點擋、「回步刺」照樣多抽一張。
         * 三個條件照引擎的判準：出牌前的蓄氣、這張實際會花掉的蓄氣、出牌當下同伴的蜷縮
         *（單人時同伴就是自己，跟 `playCard` 的 `mateAtPlay` 一樣）。
         */
        const qi = Math.max(0, Math.min(12, p.qi ?? 0));
        const spender = st.effects.find((e) => e.kind === 'damageSpendQi' || e.kind === 'blockSpendQi' || e.kind === 'nextAttackBonusSpendQi');
        const willSpend = !spender ? 0
          : spender.kind === 'damageSpendQi' && spender.allQi ? qi
            : Math.min(qi, (spender as { maxQi?: number }).maxQi ?? qi);
        const mate = cs.players.find((q) => q !== p && !q.down) ?? p;
        const met = fx.kind === 'ifQiAtPlay' ? qi >= fx.min
          : fx.kind === 'ifSpentQiAtLeast' ? willSpend >= fx.min
            : mate.block >= fx.min;
        if (!met) break;
        value += fx.then.reduce((sum, sub) => sum + ((sub as { amount?: number; n?: number }).amount
          ?? (sub as { n?: number }).n ?? 0), 0) * 0.7;
        break;
      }
      case 'preventEnergyGainThisPhase': break;
      /*
       * ===== 噹噹的十個（2026-09-17）=====
       * 傷害那幾種（`damageSpendBlock`、`damageByOwnStatus`）在 switch 之前的傷害估算區
       * 已經算過了，這裡跟 `damage` 一樣不重複計。
       */
      /*
       * 傷害本身在 switch 之前的傷害估算區算過了，這裡只補**代價**：
       * 卸出去的那幾點蜷縮本來擋得住這一輪的攻擊，不扣的話機器人會
       * 「有蜷縮就全部拿去打」——那正好是這個角色最不該亂做的事，
       * 量出來的難度會偏樂觀（審查 2026-09-17 低-11）。
       */
      case 'damageSpendBlock': {
        const want = fx.all ? p.block : (fx.max ?? 0);
        const hit = Math.min(want, p.halfSpendBlock ? p.block * 2 : p.block);
        const spent = p.halfSpendBlock ? Math.ceil(hit / 2) : hit;
        /*
         * 扣的是「**本來擋得住、卸出去就擋不住**的那幾點」，不是卸掉的總量。
         * 蜷縮 10、這一輪只會挨 8 的時候，卸掉 6 其實只少擋 4——
         * 照總量扣的話，機器人連多出來的那幾點都捨不得拿去打（審查 2026-09-17 低-11 的修正版）。
         */
        /*
         * 2026-09-22 量測修正：`incoming` 是**已經扣過現有蜷縮**的淨值，上面那版拿它再去夾蜷縮，
         * 等於同一份蜷縮算兩次——蜷縮 10、這一拍要挨 12（淨值 2）時，卸 6 點被估成「只少擋 0 點」，
         * 實際卸完剩 4、多吃 6 點。600 局裡 42% 的卸蜷縮出招拿的是這一拍要用的蜷縮。
         * 改成直接模擬「卸完之後這一拍會吃多少」，減掉現在會吃的量。
         */
        const lost = expectedIncoming(cs, p, Math.max(0, p.block - spent)) - incoming;
        value -= lost * (lowHp ? 3 : danger ? 1.6 : 1.1);
        break;
      }
      case 'damageByOwnStatus': break;   // 反彈不會被消耗，沒有代價
      case 'healSpendBlock': {
        // 卸蜷縮換血：擋不到的那幾點蜷縮本來就要歸零，換成血是淨賺；擋得到的就是換掉一次防禦
        const spend = Math.min(fx.max, p.halfSpendBlock ? p.block * 2 : p.block);
        // 擋不到東西的那幾點＝現有蜷縮 − 它真正擋掉的量（同上，`incoming` 是淨值，不能拿來直接減）
        const waste = Math.max(0, p.block - (expectedIncoming(cs, p, 0) - incoming));
        value += Math.min(spend, waste) * (lowHp ? 1.4 : 0.8) + Math.max(0, spend - waste) * 0.2;
        break;
      }
      // 借勢：把反彈墊到身前。反彈不減少，所以這是純賺，照 `block` 的係數估
      case 'blockFromThorns': {
        const b = computeBlock(getStatus(p, '反彈') + (p.blockBonus ?? 0), p);
        const useful = Math.min(b, incoming);
        value += useful * (lowHp ? 3 : danger ? 1.6 : 1.1) + (b - useful) * 0.12;
        break;
      }
      // 穩住：把本來要歸零的蜷縮留到下一回合，所以值的是「**擋不到的那幾點**」
      // 同一張牌前面那條 `block` 還沒結算，所以要把它一起算進來（審查 2026-09-17 低-10）
      case 'keepBlock': {
        const soon = p.block + st.effects.reduce((n, e) => n + (e.kind === 'block' ? e.amount : 0), 0);
        // 擋完還剩多少要跟「完全不擋會挨多少」比，不是跟扣過蜷縮的淨值比（2026-09-22 量測修正，同卸蜷縮那條）
        value += Math.min(fx.n, Math.max(0, soon - expectedIncoming(cs, p, 0))) * 0.7;
        break;
      }
      case 'ifBlock': break;        // 條件分支的價值在傷害估算區算過；`then` 裡的加狀態量級太小，不另計
      case 'ifEnemyIntent': break;  // 同上
      /*
       * 三個長效旗標，跟拒馬、影子分身同一套折算法：粗估這一場還剩幾回合（`rest`）。
       * **重點是不能估成 0**，不然機器人永遠不打它們，量出來的平衡就偏低。
       */
      // 銅牆鐵壁：之後每張消耗牌等於多打一半。抓每回合卸一次、每次 8 點當量
      case 'halfSpendBlock': value += rest * 4 * 0.9; break;
      /*
       * 千斤墜：每**挨一下**拿幾點蜷縮，而魔物的多段攻擊是一段算一下
       *（狂風連掌 10×7、十二連環 7×6）。原本抓「一回合挨一招」，
       * 對上連段的關主低估好幾倍（審查 2026-09-17 中-2）。
       * 改成照這一輪**真的會挨幾下**算，場上是誰就看誰。
       */
      case 'blockWhenAttacked': {
        const hitsPerTurn = Math.max(1, enemies.reduce((n, e) => n + (e.move.intent === 'attack'
          ? e.move.effects.reduce((k, x) => k + (x.kind === 'damage' ? (x.times ?? 1) : 0), 0) : 0), 0));
        value += fx.n * rest * hitsPerTurn * 0.9;
        break;
      }
      // 以傷還傷：**身上要先有反彈才算數**。沒有反彈的話這張是純廢牌，估 0 是對的
      case 'thornsBonus': value += getStatus(p, '反彈') > 0 ? fx.n * rest * 0.9 : 0; break;
      /*
       * 橋接牌那四個（2026-09-17）。跟上面幾個長效旗標同一套折算法（`rest`＝這一場還剩幾回合），
       * 而且**都要看另一半在不在**——沒有反彈的順勢、沒有蜷縮可卸的以身作盾都是廢牌，
       * 估成固定值的話機器人會在還沒成形時就搶著打它們。
       */
      case 'blockOnThorns': value += getStatus(p, '反彈') > 0 ? fx.n * rest * 0.9 : 0; break;
      // 以身作盾：卸多少拿多少（或一半）。手上有卸蜷縮的牌才算數
      case 'thornsFromSpend': {
        const canSpend = p.hand.some((h) => (cardById[h.cardId]?.effects ?? []).some((e) => e.kind === 'damageSpendBlock'));
        value += canSpend ? rest * (fx.full ? 6 : 3) * 0.9 : 1;
        break;
      }
      /*
       * 反震：換的是**魔物打完之後還剩下的**那幾點（結算點在魔物回合末，見 `combat.ts`）。
       *
       * 2026-09-17 稽核 中-1：原本拿整個 `soon` 去估，把「這一輪會被拿去擋掉」的那幾點
       * 也算成換得到反彈，等於高估。被拿去擋的那部分會消失、換不到東西——
       * 口徑要跟正上方的 `keepBlock`（穩住）一致，兩張牌值的是同一份東西：
       * **擋完還剩下的**。原本的註解把這件事講反了。
       */
      case 'blockToThorns': {
        const soon = p.block + st.effects.reduce((n, e) => n + (e.kind === 'block' ? e.amount : 0), 0);
        // 同上：用「完全不擋會挨多少」算擋完剩下的（2026-09-22 量測修正）
        value += Math.floor(Math.max(0, soon - expectedIncoming(cs, p, 0)) / fx.per) * fx.gain * 1.2;
        break;
      }
      // 2026-09-23 內容擴充第二批：只有忍具用這四種（忍具走 `maybePotion`，不經過這裡），沒有牌會打出它們
      case 'energyNextTurn': case 'guardLethal': case 'transformFromHand': case 'daze': break;
      default: { const _never: never = fx; void _never; }   // 每加一種效果都得來這裡寫一行估值，不能靜默估 0（體檢 2026-09-05）
    }
  }
  // 要指定目標卻還沒挑（盯上你了、威嚇、封口術這類不打人的）：減益丟給最壯的那隻
  if (def.target === 'enemy' && target === undefined) {
    const big = enemies.filter((e) => attackable(cs, e)).sort((a, b) => b.hp - a.hp)[0] ?? target0;
    if (!big) return null;
    target = big.uid;
  }
  // 憋氣：花掉的氣本來可以留著，照「留著值多少」扣回來（產氣那邊照同一個價加分，見 gainQi）
  if (hold > 0) {
    const bank = Math.max(0, Math.min(12, p.qi ?? 0));
    const spender = st.effects.find((e) => e.kind === 'damageSpendQi' || e.kind === 'blockSpendQi' || e.kind === 'nextAttackBonusSpendQi');
    if (spender) {
      const spent = spender.kind === 'damageSpendQi' && spender.allQi ? bank : Math.min(bank, (spender as { maxQi?: number }).maxQi ?? bank);
      value -= hold * spent;
    }
  }
  // 費用效率：同樣的價值便宜的先打；0 費的牌永遠可以塞
  const cost = chk.cost;
  return { uid: c.uid, target, value: value - cost * 0.6, cost, endsTurn };
}

function pickPending(cs: CombatState, rng: Rng): void {
  const pd = cs.pending;
  if (!pd) return;
  const score = (c: CardInstance): number => rating(c.cardId) + (c.upgraded ? 1 : 0);
  let picks: number[] = [];
  const sorted = [...pd.cards];
  // 替換符（2026-09-23 第二批）換掉的也是最爛的那一張（壞毛病、起手的基本牌），跟消耗同一套挑法
  if (pd.purpose === 'exhaust' || pd.purpose === 'discard' || pd.purpose === 'scryDiscard' || pd.purpose === 'transform') {
    sorted.sort((a, b) => score(a) - score(b));   // 最爛的先丟
    const n = pd.purpose === 'scryDiscard' ? Math.min(pd.max, sorted.filter((c) => score(c) <= 2).length) : pd.min;
    picks = sorted.slice(0, n).map((c) => c.uid);
  } else {
    sorted.sort((a, b) => score(b) - score(a));   // 最好的先留／拿回來
    picks = sorted.slice(0, Math.max(pd.min, Math.min(pd.max, 1))).map((c) => c.uid);
  }
  if (!resolveChoice(cs, picks)) {
    // 保底：亂選也要把它解掉，不然引擎卡住
    const fallback = rng.shuffle(pd.cards).slice(0, pd.min).map((c) => c.uid);
    if (!resolveChoice(cs, fallback)) throw new Error('resolveChoice 被拒');
  }
}

/** 封封會吃蓄氣（或看蓄氣）的牌效果：蓄氣忍具要手上有這種牌才喝（2026-09-23） */
const QI_USE: ReadonlySet<Effect['kind']> = new Set(['damageSpendQi', 'blockSpendQi', 'nextAttackBonusSpendQi', 'ifQiAtPlay']);

/** 關主或大魔物戰（第二批的幾條喝法用；第一批那段在迴圈裡另算了一份同樣的 `bigFight`） */
function bigFightOf(cs: CombatState): boolean {
  return cs.enemies.some((e) => { const pool = enemyById[e.enemyId]?.pool; return pool === '塔主' || pool === '大魔物'; });
}

/** `seat`＝誰要喝（2026-09-16 量雙人時加的）。不傳就是座位 0，`p.potions` 跟 `cs.potions` 是同一個陣列，單機完全沒變 */
function maybePotion(cs: CombatState, incoming: number, seat = 0): boolean {
  const p = (cs.players[seat] ?? cs.player) as PlayerCombat;
  /** 喝自己袋子裡的那一瓶（忍具各帶各的，見 `usePotion` 的 seat） */
  const drink = (potionId: string, targetUid?: number): boolean => {
    if (probe?.potion && canUsePotion(cs, potionId, targetUid, seat)) probe.potion(cs, potionId, seat);   // 量尺的忍具使用率
    return usePotion(cs, potionId, targetUid, seat);
  };
  const enemies = aliveEnemies(cs).filter((e) => attackable(cs, e));
  const boss = cs.enemies.some((e) => enemyById[e.enemyId]?.pool === '塔主');
  for (const id of [...p.potions]) {
    const def = potionById[id];
    if (!def) continue;
    // 有使用條件的（起死回生丹要血低於三成）現在用不出來就跳過（稽核 2026-09-11 中-3）。
    // 不濾的話 `usePotion` 會回 false，而 `maybePotion` 拿到 false 就整支 return，
    // 同一輪連後面那支九命符都不會試——`bot.ts` 補了這一條，這裡漏了，兩支機器人不同調
    // 集中精神後的飯糰類忍具也一樣用不出來（2026-09-23 稽核 引擎 低-1），同一支 `potionBlockedReason` 一起濾
    if (potionBlockedReason(p, def) !== null) continue;
    const kinds = def.effects.map((f) => f.kind);
    const heal = def.effects.find((f) => f.kind === 'heal');
    // `percent` 是回最大生命的百分之幾，`n` 這時是 0——照 `n` 判會讓「缺的血夠不夠回」恆為真
    const healAmt = heal?.kind === 'heal' ? (heal.percent ? Math.round(p.maxHp * heal.percent / 100) : heal.n) : 0;
    if (healAmt > 0 && p.hp <= p.maxHp * 0.4 && p.maxHp - p.hp >= healAmt) return drink(id);
    if ((kinds.includes('block') || (kinds.includes('status') && def.effects.some((f) => f.kind === 'status' && f.name === '隱身')))
      && incoming >= 10 && p.hp - incoming <= p.maxHp * 0.35) return drink(id);
    // **無視防禦的不在這裡處理**（稽核 2026-09-11 中-1）：這條用 `hp + block <= total` 判斷，
    // 對破甲錐來說 `block` 根本不該算進去，而且它沒扣飛行的砍半——
    // 一隻飛著、血 8、防禦 3 的魔物會被這條接走（8+3 <= 12），實際只打進 6 點、45 條白燒。
    // 那支交給下面用 `damageTo` 估的專屬分支。
    const dmg = def.effects.find((f) => f.kind === 'damage' && !f.ignoreBlock);
    if (dmg && dmg.kind === 'damage') {
      const total = dmg.amount * (dmg.times ?? 1);
      const victim = enemies.find((e) => e.hp + e.block <= total && e.hp >= 6);
      if (victim && dmg.target !== 'all') return drink(id, victim.uid);
      if (dmg.target === 'all' && enemies.length >= 2 && enemies.some((e) => e.hp <= total)) return drink(id);
    }
    if (kinds.includes('energy') && p.energy === 0 && p.hand.filter((c) => canPlay(cs, c.uid, enemies[0]?.uid, seat).ok || cardStats(c).cost > 0).length >= 2
      && (incoming > p.block || enemies.some((e) => e.hp <= 15))) return drink(id);
    /*
     * 溫牛奶（清掉自己身上所有減益）。原本只認「中毒 4 層以上」，量尺實測喝掉率 8%、
     * 死的時候還握著的有 300／342 支（2026-09-23 第〇批 0-3 忍具使用率）：翻肚、定身這些
     * 當拍就要命的減益它完全不看。照「這一拍有多痛」補三條：
     *   - 翻肚（受傷 ×1.5）撐過回合末的衰減、這一拍又要挨 9 點以上——清掉等於少挨三分之一
     *   - 定身（攻擊牌整回合鎖住）而手上有兩張以上攻擊牌
     *   - 翻肚、懶洋洋、炸毛、定身合計 3 層以上
     */
    if (kinds.includes('cleanse')) {
      const after = decayedDefender(p);
      const attacks = p.hand.filter((c) => cardById[c.cardId]?.type === '攻擊').length;
      const other = getStatus(p, '翻肚') + getStatus(p, '懶洋洋') + getStatus(p, '炸毛') + getStatus(p, '定身');
      if (getStatus(p, '中毒') >= 4 || (getStatus(after, '翻肚') > 0 && incoming >= 9)
        || (getStatus(p, '定身') > 0 && attacks >= 2) || other >= 3) return drink(id);
    }
    /*
     * 2026-09-11 新增的那批忍具（稽核中-4）。原本 `maybePotion` 只認回血、防禦、隱身、傷害、
     * 飯糰、清減益與關主戰那兩種狀態，七支新忍具裡有五支它一輩子不會用——
     * 忍具池 20→27 之後有兩成六的抽中率是機器人拿了不會用的東西，
     * 而 `tests/smart.report.test.ts` 是這個專案唯一的平衡訊號來源，那份報告會靜靜失真。
     */
    // 貓爪雷：隨機分散，所以只在「有人快死了」或「一群小怪」時才划算
    const scatter = def.effects.find((f) => f.kind === 'damageScatter');
    if (scatter?.kind === 'damageScatter') {
      const total = scatter.amount * scatter.times;
      if (enemies.length === 1 && enemies[0]!.hp + enemies[0]!.block <= total) return drink(id);
      if (enemies.length >= 2 && enemies.every((e) => e.hp <= scatter.amount)) return drink(id);
    }
    /*
     * 下面幾條各自帶一個「已經生效就別再燒」的守衛（複核 2026-09-11 中-1）。
     * 用掉忍具只會改 `cs.skipEnemies`／`p.immune`／`p.doubleNext` 這些旗標，
     * `incoming`、`p.hp`、`p.block` 一個都沒變，`smartCombat` 的 `continue` 會讓這支再跑一次，
     * 帶兩支同款就在同一輪連燒兩支——分身油最慘，`doubleNext = 1` 是**指派**不是累加，第二支全白費。
     */
    // 先手香：整輪不挨打。挨的量夠大才捨得用，跟防禦、隱身那條同一個門檻
    if (kinds.includes('skipEnemyTurn') && !cs.skipEnemies && incoming >= 12 && p.hp - (incoming - p.block) <= p.maxHp * 0.45) return drink(id);
    // 鐵布衫膏：這回合免疫，用在會被打很痛的那一輪（比先手香更該留到大場面）
    if (kinds.includes('immuneThisTurn') && !p.immune && incoming >= 15 && p.hp - (incoming - p.block) <= p.maxHp * 0.4) return drink(id);
    // 分身油：下一擊加倍，關主戰蓄力那一拍最有價值；手上得真的有攻擊牌打得出去
    if (kinds.includes('doubleNextAttack') && boss && p.doubleNext === 0 && p.energy >= 1
      && p.hand.some((c) => cardById[c.cardId]?.type === '攻擊' && cardStats(c).effects.some((f) => f.kind === 'damage' && f.amount >= 10))) return drink(id);
    // 定身釘：只有七成會中，所以留到「下一拍會被打很痛」時用
    if (def.effects.some((f) => f.kind === 'status' && f.target !== 'self' && f.name === '定身')
      && incoming >= 12 && p.hp - (incoming - p.block) <= p.maxHp * 0.45) {
      const t = enemies[0];
      if (t && def.target === 'enemy') return drink(id, t.uid);
      if (def.target === 'all') return drink(id);
    }
    // 撿回來：棄牌堆有東西、手牌又空得差不多時才有意義
    if (kinds.includes('recoverFromDiscard') && p.discardPile.length > 0 && p.hand.length <= 2 && p.energy >= 1) return drink(id);
    /*
     * 2026-09-11 第二批（五支對敵忍具）。同樣是為了 `tests/smart.report.test.ts` 那份平衡報告：
     * 機器人不會用的忍具等於白白佔掉抽中率，勝率會被壓低而且看不出原因。
     */
    // 順手牽羊爪：目標防禦夠厚才划算（搶過來的同時也清掉牠的防禦，一來一回）
    if (kinds.includes('stealBlock')) {
      const fat = enemies.find((e) => e.block >= 10);
      if (fat) return drink(id, fat.uid);
    }
    // 加倍奉還：身上中毒越多翻倍越賺；沒有中毒也有保底 2 層，但留著等中毒流起來比較好
    const dbl = def.effects.find((f) => f.kind === 'doubleStatus');
    if (dbl?.kind === 'doubleStatus') {
      const t = enemies.find((e) => getStatus(e, dbl.name) >= 3);
      if (t) return drink(id, t.uid);
    }
    // 亂石包：門檻用**期望值**，跟同檔 `damageTo` 估隨機傷害的口徑一致（稽核 2026-09-11 低-2）。
    // 原本寫 `<= rnd.min`（6），只有「血＋防禦剛好五六點」才會用，等於補了等於沒補
    const rnd = def.effects.find((f) => f.kind === 'damageRandom');
    if (rnd?.kind === 'damageRandom') {
      const avg = (rnd.min + rnd.max) / 2;
      const victim = enemies.find((e) => e.hp + e.block <= avg && e.hp >= 5);
      if (victim) return drink(id, victim.uid);
    }
    /*
     * 以彼之道：拿現有的蜷縮換傷害（用完蜷縮還在，不是消耗掉）。
     * **只在打得死的時候用**（稽核 2026-09-11 中-1）：原本還有個 `?? enemies[0]` 的退路，
     * 蜷縮一到 14 就對隨便一隻開一支 50 條的忍具，平衡報告會被這支的浪費污染——
     * 正是這批補判斷想避免的事。旁邊那條 `dmg`（固定傷害）也是只在打得死時才用，口徑一致。
     */
    if (kinds.includes('damageEqualBlock') && p.block >= 14) {
      const victim = enemies.find((e) => e.hp + e.block <= p.block);
      if (victim) return drink(id, victim.uid);
    }
    /*
     * 拔狀態的三支（破功散、剪刺鉗、黏鳥膠）**寫在同一個區塊、照 `names` 分流**。
     *
     * 分開寫過一次，出了兩個洞（稽核 2026-09-11 高-1、高-2）：
     *   ① 破功散那條原本只判「是不是 `removeStatuses`」，而剪刺鉗也是——
     *      場上隨便一隻魔物爪力堆到 5（一般戰第 10 回合起魔氣暴走每回合全體 +1，幾輪就到），
     *      機器人就拿 40 條的剪刺鉗去拔牠身上根本沒有的反彈，白燒一支。
     *   ② 黏鳥膠中途改用新效果 `ground`，而判斷還在找 `removeStatuses`，
     *      整條變成永遠進不去的死碼——機器人抽到它就只是佔一格到戰鬥結束。
     * 兩個洞壞的都不是玩家看得到的東西，是 `tests/smart.report.test.ts` 那份
     * 專案唯一的平衡訊號；之後每次調平衡都會帶著看不見的偏差。
     *
     * 判準一律用「那個麻煩現在有多痛」，不是「有沒有出現」——出現就用會讓機器人在小怪身上
     * 把 40~60 條的忍具燒光。
     */
    /*
     * ===== 2026-09-23 內容擴充第二批的六支 =====
     * 每一支各一條（傳功丹走上面「飯糰」那條：`energy` 就接得到）。沒有規則的忍具拿到就佔一格到死，平衡報告會被量歪（提案 ⑦）。
     */
    // 照妖鏡（全體拔隱身、潛水、虛化）：有一隻正在虛化、全場的隱身合計兩層以上、或隱身擋在我手上打得出去的攻擊牌前面才照。
    // 只看「兩層以上」時量尺喝掉率 9%（魔物多半一次只掛一層），拿到就揣到死；一層擋著我這回合的攻擊就值得照。
    // 排在下面「拔狀態」那一段前面：那段的兜底會拿它當單體的拔狀態忍具用
    const mirror = def.effects.find((f) => f.kind === 'removeStatuses' && f.target === 'all');
    if (mirror) {
      const stealth = enemies.reduce((n, e) => n + getStatus(e, '隱身'), 0);
      const attackReady = p.hand.some((c) => cardById[c.cardId]?.type === '攻擊' && canPlay(cs, c.uid, enemies[0]?.uid, seat).ok);
      if (enemies.some((e) => getStatus(e, '虛化') > 0) || stealth >= 2 || (stealth >= 1 && attackReady)) return drink(id);
      continue;
    }
    // 回魂香（這場第一次會被打倒時留 1 血）：這一拍挨下去會死、或是大場面血掉到三成以下，而且還沒點過
    if (kinds.includes('guardLethal') && !p.guardLethal
      && (p.hp - incoming <= 0 || (bigFightOf(cs) && p.hp <= p.maxHp * 0.3))) return drink(id);
    // 便當（下回合多 2 顆飯糰）：這回合的飯糰用光了、仗還長（大場面或魔物總血 30 以上）才打開，已經有一份等著就不疊
    if (kinds.includes('energyNextTurn') && !p.energyNextTurn && p.energy === 0
      && (bigFightOf(cs) || enemies.reduce((s, e) => s + e.hp, 0) >= 30)) return drink(id);
    // 替換符（手上一張換成隨機升級牌）：手上有爛牌（壞毛病、起手的基本牌）才換，換完還有飯糰打得出去
    if (kinds.includes('transformFromHand') && p.energy >= 1 && p.hand.some((c) => rating(c.cardId) <= 2)) return drink(id);
    // 迷魂香：這一拍打我最痛的那一隻，痛到 12 點以上、旁邊還有同伴可以替我挨（打同伴＝傷害轉給魔物）；
    // 只剩牠一隻時等於讓牠這一下打空，留到會要命的那一拍（挨下去剩不到四成）才用
    if (kinds.includes('daze')) {
      const worst = enemies.filter((e) => !isDazed(e))
        .map((e) => ({ e, dmg: incomingHits(cs, e, p).reduce((s, h) => s + h, 0) }))
        .sort((a, b) => b.dmg - a.dmg)[0];
      if (worst && worst.dmg >= 12 && (dazeTarget(cs, worst.e) || p.hp - incoming <= p.maxHp * 0.4)) return drink(id, worst.e.uid);
    }
    const strip = def.effects.find((f) => f.kind === 'removeStatuses');
    if (strip?.kind === 'removeStatuses') {
      const names = strip.names;
      if (names.includes('爪力')) {
        // 破功散：拔爪力／貓步／鱗甲／不壞身。加權後夠多才用，拔一兩層不值 60 條
        //（加權式子沒算貓步：魔物身上的貓步只有鏡貓抄得到，權重併進爪力那一項就夠）
        const buffed = enemies.find((e) => getStatus(e, '爪力') + getStatus(e, '鱗甲') * 2 + getStatus(e, '不壞身') * 3 >= 5);
        if (buffed) return drink(id, buffed.uid);
      } else if (names.includes('飛行')) {
        // 黏鳥膠：飛行 3 層以上才值得——1、2 層打兩下就自己掉了，而這支是一次性的
        const flier = enemies.find((e) => getStatus(e, '飛行') >= 3);
        if (flier) return drink(id, flier.uid);
      } else if (names.includes('反彈')) {
        // 剪刺鉗：反彈 2 層以上才值得（1 層扎一下還能忍）
        const thorny = enemies.find((e) => getStatus(e, '反彈') >= 2);
        if (thorny) return drink(id, thorny.uid);
      } else {
        /*
         * **兜底**（稽核 2026-09-11 中-3）：以後加一支只拔鱗甲的忍具，
         * 上面三條都接不到，它就會變成「機器人抽到就佔格子到戰鬥結束」——
         * 這個區塊的註解裡親口記過的「洞②」原封不動再來一次。
         * 退路很笨但不會是零：名單裡隨便一種層數夠多就用。
         */
        const any = enemies.find((e) => names.some((nm) => getStatus(e, nm) >= 3));
        if (any) return drink(id, any.uid);
      }
    }
    /*
     * 破甲錐：要真的打得死才用，防禦越厚的越優先。
     * **估傷用同檔的 `damageTo`**（稽核 2026-09-11 中-4）：自己拿 `pierce.amount` 比血量，
     * 會漏掉飛行的砍半與虛化的「每下最多 1 點」——對一隻飛著、血 10、防禦 12 的魔物
     * 算出「12 打得死」就開了 45 條的忍具，實際只進去 6 點。
     * `hp >= 6` 是跟旁邊那條 `dmg` 同口徑：不要為了補一隻剩一滴血的怪花掉一支忍具。
     *
     * 原本還要求「防禦 12 以上」（一般攻擊打不穿才划算），量尺實測喝掉率只有 13%、
     * 死的時候還握著 290／342 支（2026-09-23 第〇批 0-3 忍具使用率）——厚防禦又剛好打得死的場面太少，
     * 等於一輩子揣著。拿掉那個門檻，跟手裡劍、鐵指虎一樣「打得死就用」；防禦厚的照樣排前面。
     */
    const pierce = def.effects.find((f) => f.kind === 'damage' && f.ignoreBlock);
    if (pierce?.kind === 'damage') {
      const turtle = enemies.filter((e) => e.hp >= 6 && damageTo(cs, def.effects, e, 0, false, 0, true, p) >= e.hp)
        .sort((a, b) => b.block - a.block)[0];
      if (turtle) return drink(id, turtle.uid);
    }
    /*
     * 鮪魚（抽 3 張）與鏡片（反彈 5）以前**沒有任何一條規則**，量尺實測喝掉率都是 0%，
     * 拿到就佔一格到死（2026-09-23 第〇批 0-3 忍具使用率：死的時候還握著 340／349、312／322）。
     */
    // 抽牌：飯糰還剩兩顆以上、手上卻只剩一張以下打得出去，牌堆裡又有得抽——這時候三張新牌才換得成出手。
    // 關主戰第一回合也用（跟下面那幾支增益忍具同一個想法：一局最硬的一場，留著沒意義）
    if (kinds.includes('draw') && !kinds.includes('energy') && p.drawPile.length + p.discardPile.length >= 2
      && ((p.energy >= 2 && p.hand.filter((c) => canPlay(cs, c.uid, enemies[0]?.uid, seat).ok).length <= 1)
        || (boss && cs.turn === 1 && p.energy >= 1))) return drink(id);
    // 反彈（整場不消失、每挨一下回敬一次）：挨得越多下越賺。關主、大魔物戰一開始挨打就掛上；一般戰等這一拍要挨三下以上。
    // 疊兩支不浪費（反彈是加上去的），所以不用「已經生效就別再燒」的守衛
    if (def.effects.some((f) => f.kind === 'status' && f.target === 'self' && f.name === '反彈')) {
      const hitsNow = aliveEnemies(cs).reduce((n, e) => n + incomingHits(cs, e, p).length, 0);
      const big = boss || cs.enemies.some((e) => enemyById[e.enemyId]?.pool === '大魔物');
      if ((big && hitsNow >= 1) || hitsNow >= 3) return drink(id);
    }
    /*
     * ===== 2026-09-23 內容擴充第一批的十支 =====
     * 鐵布衫油（蜷縮＋反彈）、替身人偶（隱身＋抽牌）上面的蜷縮／隱身救命、反彈、抽牌那幾條已經接得到；
     * 其餘每一支在這裡各有一條——沒有的話機器人拿到就佔一格到死，平衡報告會被量歪（提案 ⑦）。
     */
    const bigFight = boss || cs.enemies.some((e) => enemyById[e.enemyId]?.pool === '大魔物');
    // 火雷珠（全體 14）：上面那條全體傷害只在「兩隻以上、有一隻收得掉」時用，對關主一隻永遠等不到；
    // 關主戰直接丟、一般戰三隻以上也丟。鞭炮（6 點）不走這條（`>= 10`），它的判斷照舊
    const aoe = def.effects.find((f) => f.kind === 'damage' && f.target === 'all');
    if (aoe?.kind === 'damage' && aoe.amount * (aoe.times ?? 1) >= 10 && (boss || enemies.length >= 3)) return drink(id);
    // 蓄氣（提神茶、劍意符，只有封封拿得到）：手上有打得出去、會吃蓄氣的牌，而且灌下去不會被 12 的上限吃掉一大半；
    // 關主戰第一回合也喝（先把氣灌滿，下一輪就能開大招）
    const qi = def.effects.find((f) => f.kind === 'gainQi');
    if (qi?.kind === 'gainQi') {
      const room = 12 - Math.max(0, p.qi ?? 0);
      const spender = p.hand.some((c) => canPlay(cs, c.uid, enemies[0]?.uid, seat).ok && cardStats(c).effects.some((f) => QI_USE.has(f.kind)));
      if (room >= Math.min(qi.n, 6) && (spender || (boss && cs.turn === 1))) return drink(id);
    }
    // 散毒粉：目標身上的毒夠多、旁邊還有別隻分得到才撒（一半給每一隻，目標自己不少）
    const spread = def.effects.find((f) => f.kind === 'spreadStatus');
    if (spread?.kind === 'spreadStatus' && aliveEnemies(cs).length >= 2) {
      const t = enemies.filter((e) => getStatus(e, spread.name) >= 4).sort((a, b) => getStatus(b, spread.name) - getStatus(a, spread.name))[0];
      if (t) return drink(id, t.uid);
    }
    // 千針膏（整場每張攻擊牌再上 2 層毒）：長的仗越早喝越賺——關主、大魔物戰前兩回合；一般戰魔物血還厚、手上有兩張以上攻擊牌才喝
    if (kinds.includes('poisonOnAttack')) {
      const attacks = p.hand.filter((c) => cardById[c.cardId]?.type === '攻擊').length;
      if ((bigFight && cs.turn <= 2) || (enemies.reduce((s, e) => s + e.hp, 0) >= 40 && attacks >= 2)) return drink(id);
    }
    // 以牙還牙粉（反彈回敬多打 4）：身上要真的有反彈才有用；這一拍要挨兩下以上、或是關主／大魔物戰
    if (kinds.includes('thornsBonus') && getStatus(p, '反彈') > 0) {
      const hitsNow = aliveEnemies(cs).reduce((n, e) => n + incomingHits(cs, e, p).length, 0);
      if (hitsNow >= 2 || (bigFight && hitsNow >= 1)) return drink(id);
    }
    // 潛水竹管（下回合開始變 2 層隱身，隱身不會自己消失）：大場面先喝囤著；一般戰血掉到一半以下才喝
    if (def.effects.some((f) => f.kind === 'status' && f.name === '潛水')
      && ((bigFight && cs.turn <= 2) || (p.hp <= p.maxHp * 0.5 && incoming > 0))) return drink(id);
    // 對半包子（每一位 8 點蜷縮）：這一拍擋不住的量有 8 點以上，而且挨下去會掉到一半以下（或大場面）
    if (kinds.includes('blockAll') && incoming - p.block >= 8
      && (bigFight || p.hp - (incoming - p.block) <= p.maxHp * 0.5)) return drink(id);
    // 攻擊型狀態忍具：關主戰開頭就用
    if (boss && cs.turn <= 2 && def.effects.some((f) => f.kind === 'status' && f.target === 'self' && (f.name === '爪力' || f.name === '貓步'))) return drink(id);
    if (boss && def.effects.some((f) => f.kind === 'status' && f.target !== 'self' && (f.name === '翻肚' || f.name === '中毒'))) {
      const t = enemies[0];
      if (t && def.target === 'enemy') return drink(id, t.uid);
      if (def.target === 'all') return drink(id);
    }
  }
  return false;
}

/**
 * 有牌等著選就替他選掉，回 true。`smartCombat` 裡那一行的對外版本（2026-09-16）：
 * 雙人時兩個人都舉手了才收回合，而 `beginEnemyTurn` 遇到還沒選完的牌會拒收——
 * 沒有這支的話，選牌的那位剛好先舉手就會卡死。
 */
export function smartPending(cs: CombatState, rng: Rng): boolean {
  if (!cs.pending) return false;
  pickPending(cs, rng);
  return true;
}

/**
 * **一位玩家的下一個動作**（2026-09-16 為了量雙人平衡加的；`tests/coop.report.test.ts` 用）。
 *
 * 判斷邏輯跟 `smartCombat` 裡那一段**一模一樣**——選牌、喝忍具、挑目標全走同一批函式，
 * 只是多帶一個「現在是誰在動」。單機那條路（`smartCombat`）一個字都沒動，錨值不會跑掉。
 *
 * 回 `true`＝剛做了一件事，呼叫端再叫一次；回 `false`＝這位這回合沒別的好打了，
 * 該由呼叫端替他舉手（`setReady`）。**這支自己不收回合**：兩個人要等雙方都舉手才收。
 */
export function smartSeatAct(cs: CombatState, rng: Rng, seat: number): boolean {
  const p = cs.players[seat];
  if (!p || p.down || p.ready || cs.phase !== 'player') return false;
  if (cs.pending) { pickPending(cs, rng); return true; }   // 在等選牌的是誰，`pending` 自己記得
  const incoming = expectedIncoming(cs, p);
  if (maybePotion(cs, incoming, seat)) return true;
  const hits = incomingHitCount(cs);
  const plans = p.hand.map((c) => evaluate(cs, c, incoming, hits, seat)).filter((x): x is Plan => x !== null);
  if (plans.length === 0) return false;
  // 結束回合的牌（撒手鐧、先睡了）只在沒有別的值得打的時候才打——跟 `smartCombat` 同一條
  const others = plans.filter((x) => !x.endsTurn && x.value > 0.5);
  const pick = others.length ? others.sort((a, b) => b.value - a.value)[0]! : plans.filter((x) => x.value > 0.5).sort((a, b) => b.value - a.value)[0];
  if (!pick) return false;
  if (!playCard(cs, pick.uid, pick.target, seat)) throw new Error(`第 ${seat} 位在第 ${cs.turn} 回合打不出 ${pick.uid}（${cs.encounterId}）`);
  return true;
}

export function smartCombat(cs: CombatState, rng: Rng, maxTurns = 200, seed = '?'): void {
  while (cs.phase === 'player') {
    // 僵局（打不死也死不了）當作輸：一場的判斷失誤不該把整份報告炸掉；報告會列出是哪一場
    if (cs.turn > maxTurns) { cs.phase = 'lost'; cs.player.hp = 0; cs.log.push(`僵局：${seed} ${cs.encounterId}`); return; }
    if (cs.pending) { pickPending(cs, rng); continue; }
    const incoming = expectedIncoming(cs);
    if (maybePotion(cs, incoming)) continue;
    const hits = incomingHitCount(cs);
    const plans = cs.player.hand.map((c) => evaluate(cs, c, incoming, hits)).filter((x): x is Plan => x !== null);
    if (plans.length === 0) { endTurn(cs); continue; }
    // 結束回合的牌（撒手鐧、先睡了）只在沒有別的值得打的時候才打
    const others = plans.filter((x) => !x.endsTurn && x.value > 0.5);
    const pick = others.length ? others.sort((a, b) => b.value - a.value)[0]! : plans.filter((x) => x.value > 0.5).sort((a, b) => b.value - a.value)[0];
    if (!pick) { endTurn(cs); continue; }
    if (!playCard(cs, pick.uid, pick.target)) throw new Error(`種子 ${seed}：第 ${cs.turn} 回合打不出 ${pick.uid}（${cs.encounterId}）`);
    if (allReady(cs)) endTurn(cs);
  }
  // 調平衡用：`SMART_TRACE=<encounterId>` 會把那場的完整戰鬥紀錄印出來（例：SMART_TRACE=tanuki_lord SMART_N=600 …）
  if (TRACE && cs.encounterId === TRACE) console.log(['[trace]', seed, cs.encounterId, cs.phase, `剩 ${cs.player.hp}`, ...cs.log].join('\n'));
}
const TRACE = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['SMART_TRACE'];

// ===== 整局 =====

/** `seat` 不填就是自己（2026-09-16 加的參數，量雙人時第二位要挑自己的牌組） */
export function deckJunk(run: RunState, seat = 0): CardInstance[] {
  return me(run, seat).deck.filter((c) => rating(c.cardId) <= 2).sort((a, b) => rating(a.cardId) - rating(b.cardId));
}

export function pickCard(run: RunState, choices: { id: string }[], seat = 0,
  /** 每一張都加這麼多（夢枕的三張都是升級版：+1，跟牌組評分 `c.upgraded ? 1 : 0` 同一把尺；2026-09-24 b3int） */
  bonus = 0): string | null {
  let best: { id: string; v: number } | null = null;
  const attacks = me(run, seat).deck.filter((c) => cardById[c.cardId]?.type === '攻擊').length;
  const skills = me(run, seat).deck.length - attacks;
  for (const ch of choices) {
    const def = cardById[ch.id];
    if (!def) continue;
    let v = rating(ch.id) + bonus;
    if (def.type === '攻擊' && attacks < skills) v += 1;
    if (def.type !== '攻擊' && skills < attacks - 2) v += 1;
    if (me(run, seat).deck.filter((c) => c.cardId === ch.id).length >= 2) v -= 2;
    if (!best || v > best.v) best = { id: ch.id, v };
  }
  if (!best) return null;
  const threshold = me(run, seat).deck.length >= 22 ? 6 : me(run, seat).deck.length >= 16 ? 5 : 4;
  return best.v >= threshold ? best.id : null;
}

export function bestUpgrade(run: RunState, seat = 0): CardInstance | undefined {
  return me(run, seat).deck.filter((c) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病')
    .sort((a, b) => rating(b.cardId) - rating(a.cardId))[0];
}

function handleOutcome(run: RunState, rng: Rng, outcome: RunEffectOutcome, seed: string, stats: SmartStats): void {
  if (!outcome) return;
  if ('needs' in outcome) {
    for (let i = 0; i < outcome.n; i++) {
      if (outcome.needs === 'removeCard') { const j = deckJunk(run)[0]; if (j) removeCard(run, j.uid); }
      else { const u = bestUpgrade(run); if (u) upgradeCard(run, u.uid); }
    }
  } else if ('chooseCard' in outcome) {
    const id = pickCard(run, outcome.chooseCard) ?? outcome.chooseCard[0]?.id;   // 開出升級版的那張學到就是升級牌（下面 addCard 帶旗標）
    if (id) addCard(run, id, outcome.upgradedCard === id);
    if (outcome.then) handleOutcome(run, rng, outcome.then, seed, stats);   // 學完再挑牌升級（2026-09-23 內容擴充第二批）
  } else if ('purify' in outcome) {
    // 兩件以上沾了魔氣的：挑淨化後分數多最多的那件（2026-09-23 第三批）
    const id = bestPurify(outcome.purify, heroOf(me(run)));
    if (id) purifyRelic(run, id);
  } else if ('fight' in outcome) {
    run.pendingAfterFight = outcome.fight.afterWin;   // 事件附帶的獎勵：打贏才發（稽核 2026-09-04 中 2）
    fight(run, rng, outcome.fight.encounterId, outcome.fight.bonusFish, seed, stats);
    resolvePendingAfterFight(run, run.status === 'playing');
    if (run.status === 'playing') for (let i = 0; i < (outcome.fight.bonusUpgrades ?? 0); i++) { const u = bestUpgrade(run); if (u) upgradeCard(run, u.uid); }
  }
}

function fight(run: RunState, rng: Rng, encounterId: string | undefined, bonusFish: number, seed: string, stats: SmartStats): void {
  const cs = beginCombat(run, encounterId);
  const hpIn = me(run).hp;
  smartCombat(cs, rng, 200, seed);
  probe?.combatEnd?.(cs);
  const isBoss = encounterById[cs.encounterId]?.pool === '塔主';
  const r = finishCombat(run, cs, bonusFish);
  stats.fights.push({ id: cs.encounterId, floor: run.floor, act: run.act, hpLost: hpIn - (r ? me(run).hp : 0), turns: cs.turn, won: !!r, str: cs.player.statuses['爪力'] ?? 0 });
  if (isBoss) stats.bosses.push({ id: cs.encounterId, act: run.act, hpIn, maxHp: me(run).maxHp, won: !!r, turns: cs.turn });
  if (!r) { stats.diedTo = (cs.turn > 200 ? '僵局:' : '') + cs.encounterId; return; }
  if (r.cards.length) { takeCardReward(run, r, pickCard(run, r.cards)); closeCardReward(r); }
}

/** 事件選項值多少：血少時看重回血、避開掉血；壞毛病是大扣分 */
export function eventValue(run: RunState, effects: RunEffect[], costFish: number, seat = 0): number {
  const hpPct = me(run, seat).hp / me(run, seat).maxHp;
  let v = -costFish * 0.35;
  if (costFish > me(run, seat).fish) return -999;
  /*
   * **同一個選項裡連著砍好幾張、升好幾張的，第二張起要縮水**（稽核 2026-09-11 低-4）。
   *
   * 「磨到只剩一把刀」是三個 `removeCard` 連寫，原本每一個都給滿分 18（只要牌組裡「有」廢牌就給），
   * 三張共 54、扣掉最大生命 −8 的 17.6 之後穩賺，所以機器人一定會磨；
   * 可是牌組只剩一張廢牌時，第二、三張砍的是好牌。「速成的卷軸」的兩個 `upgradeCard` 同理。
   * 這裡照「這個選項裡已經用掉幾張」往下算：砍到沒廢牌就掉到 2 分（等於在砍好牌），
   * 升級也一樣——沒得升就是 0。
   */
  let removed = 0, upgraded = 0;
  const junk = deckJunk(run, seat).length;
  const upgradable = me(run, seat).deck.filter((c) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病').length;
  for (const fx of effects) {
    switch (fx.kind) {
      case 'heal': v += Math.min(fx.n, me(run, seat).maxHp - me(run, seat).hp) * (hpPct < 0.5 ? 1.4 : 0.6); break;
      /*
       * 交出一件秘寶：本身是純損失，但它一定跟「換兩件」綁在一起，淨值由那兩件的 relic 估值補回來。
       * 交的是身上隨機一件（起始的不算），所以扣「身上那幾件的平均事件分」（2026-09-23 量尺；原本一律扣 14）。
       * **身上沒有可交的**：引擎的 `applyRunEffects` 在這裡就整個停掉（回 null），後面換來的兩件一件都不給——
       * 原本照樣算成淨賺兩件，機器人會去選一個什麼都不會發生的選項。這裡照引擎，後面的一律不算。
       */
      case 'loseRelic': {
        const hero = heroOf(me(run, seat));
        const mine = me(run, seat).relics.filter((id) => relicById[id]?.pool !== '起始');
        if (!mine.length) return v;
        v -= mine.reduce((s, id) => s + relicEventValue(id, hero), 0) / mine.length;
        break;
      }
      case 'healPercent': v += Math.min(me(run, seat).maxHp * fx.p, me(run, seat).maxHp - me(run, seat).hp) * (hpPct < 0.5 ? 1.4 : 0.6); break;
      case 'damage': v -= fx.n * (hpPct < 0.4 ? 4 : hpPct < 0.6 ? 1.8 : 0.9); break;
      case 'fish': v += fx.n * 0.35; break;
      case 'fishHalve': v -= me(run, seat).fish * 0.5 * 0.35; break;
      case 'maxHp': v += fx.n * 2.2; break;
      case 'addCard': v += cardById[fx.cardId]?.pool === '壞毛病' ? -28 : 6; break;
      case 'addRandomCard': v += fx.rarity === '罕見' ? 8 : fx.rarity === '稀有' ? 14 : 4; break;
      case 'removeCard': v += removed++ < junk ? 18 : 2; break;
      case 'upgradeCard': v += upgraded++ < upgradable ? 16 : 0; break;
      // 隨機一件：這一位抽得到的那幾件的平均事件分（2026-09-23 量尺；原本一律 24／34，不看角色也不看身上有什麼）
      case 'relic': v += relicPoolValue(run, fx.pool, seat); break;
      case 'potions': v += Math.min(fx.n, 3 - me(run, seat).potions.length) * 7; break;
      // 打這一關大魔物池的（睡著的大魔物，2026-09-23 第三批 新M）再扣 15：這支估值不看對手多強，不扣的話叫醒牠會被高估（design3 R3 自評）
      case 'fight': v += (hpPct < 0.5 ? -30 : fx.bonusFish * 0.35 + 6 + (fx.bonusUpgrades ?? 0) * 5) - (fx.pool ? 15 : 0); break;
      case 'chooseCard': v += fx.pool === '絕學' ? 14 : 9; break;
      case 'gamble': v += fx.p * eventValue(run, fx.win, 0, seat) + (1 - fx.p) * eventValue(run, fx.lose, 0, seat); break;
      /*
       * 旗標只影響後集事件會不會出現，一般不算分——**事件鏈的入口例外**（2026-09-23 內容擴充第二批）：
       * 郵差鴿、影子鏈的第一集只有代價（扣血），好處在後兩集（第二集約 15 分、第三集塔主秘寶約 40 分），
       * 不算的話機器人永遠不幫鴿子、不追影子，兩條鏈在平衡報告裡等於不存在（實測 800 局鏈開頭 0 次）。
       * 照「到得了第二、三關的機率」打折估成 12 分；只算 `chain:` 開頭、會解鎖後集、這一局還沒記過的，舊的前後集照舊不算。
       */
      case 'flag':
        if (fx.name.startsWith('chain:') && !run.flags[fx.name] && events.some((e) => e.requiresFlag === fx.name)) v += 12;
        break;
      /*
       * 內容擴充第二批的四種（2026-09-23）。
       * - 指定那一件：身上沒有＝那一件的事件分（量尺），已經有了＝退回的小魚乾
       * - 交出指定那一件：身上有才扣，扣那一件的事件分
       * - 交出最便宜的忍具：身上有才扣，照一個忍具 7 分（跟 `potions` 同一把尺）
       * - 下一場開場的加成：爪力一點約 4 分、蜷縮一點約 0.6 分（跟回血同一把尺：一點蜷縮大約擋一點血）
       */
      case 'relicId': {
        const own = me(run, seat).relics.includes(fx.id) || !relicById[fx.id];
        // 已經有了改給那一池隨機一件的（2026-09-23 第三批 `fallbackPool`）：那一池抽得到的平均；抽乾了才是小魚乾
        const alt = own && fx.fallbackPool ? relicPoolValue(run, fx.fallbackPool, seat) : 0;
        v += !own ? relicEventValue(fx.id, heroOf(me(run, seat))) : alt > 0 ? alt : fx.fallbackFish * 0.35;
        break;
      }
      case 'loseRelicId': if (me(run, seat).relics.includes(fx.id)) v -= relicEventValue(fx.id, heroOf(me(run, seat))); break;
      case 'losePotion': if (me(run, seat).potions.length) v -= 7; break;
      case 'nextFight':
        // 給魔物的減益（開局祝福「護身符」的翻肚，2026-09-23 第三批）一層約 2.5 分；連套幾場就乘幾場。便當那種只給自己的照舊
        for (const e of fx.effects) v += (e.kind === 'status' && e.name === '爪力' ? e.amount * 4 : e.kind === 'block' ? e.amount * 0.6
          : e.kind === 'status' && e.target !== 'self' ? e.amount * 2.5 : 2) * (fx.fights ?? 1);
        break;
      /*
       * 內容擴充第三批（2026-09-23，design3 新F／新K／新N／新O）。
       * - 抽獎：各格估值 × 機率（跟 `gamble` 同一套）
       * - 淨化：量尺上「淨化版 − 原件」的事件分（`purifyGain`）；一件挑最多的、全部就加起來；沒得淨化時 `orRemove` 照 `removeCard`
       * - 忍具全部失去：每支 7 分（跟 `potions` 同一把尺）
       * - 隨機一件沾了魔氣的：這一位抽得到的那幾件的平均事件分；都有了是退回的小魚乾
       */
      case 'lottery': {
        const total = fx.table.reduce((s, t) => s + Math.max(0, t.w), 0);
        if (total > 0) for (const t of fx.table) v += (Math.max(0, t.w) / total) * eventValue(run, t.effects, 0, seat);
        break;
      }
      case 'purify': {
        const hero = heroOf(me(run, seat));
        const mine = miasmaRelicsOf(run, seat);
        if (!mine.length) { if (fx.orRemove) v += removed++ < junk ? 18 : 2; break; }
        const gains = mine.map((id) => purifyGain(id, hero).ev);
        v += fx.n === 'all' ? gains.reduce((s, g) => s + g, 0) : Math.max(...gains);
        break;
      }
      case 'loseAllPotions': v -= me(run, seat).potions.length * 7; break;
      case 'relicMiasma': {
        const hero = heroOf(me(run, seat));
        const owned = me(run, seat).relics;
        const cands = Object.keys(MIASMA_PURE).filter((id) => relicById[id] && !owned.includes(id) && !owned.includes(MIASMA_PURE[id]!) && relicOk(relicById[id]!, [hero]));
        v += cands.length ? cands.reduce((s, id) => s + relicEventValue(id, hero), 0) / cands.length : fx.fallbackFish * 0.35;
        break;
      }
      default: { const _never: never = fx; void _never; }   // 每加一種效果都得來這裡寫一行估值，不能靜默估 0（體檢 2026-09-05）
    }
  }
  return v;
}

/**
 * 開局祝福一樣值多少（2026-09-23 第三批，設計稿 2-3）：一般效果照 `eventValue`；只有祝福有的幾種——
 * 交出起始秘寶扣那一件的事件分、擲骰照機率平均、挑牌照事件的移除／升級（換一張 12 分、選一張稀有 18 分，設計稿 2-2）。
 */
export function blessingValue(run: RunState, def: BlessingDef, seat = 0): number {
  const hero = heroOf(me(run, seat));
  let v = eventValue(run, def.effects, 0, seat);
  const starter = def.loseStarter ? me(run, seat).relics.find((id) => relicById[id]?.pool === '起始') : undefined;
  if (starter) v -= relicEventValue(starter, hero);
  let prev = 0;
  for (const t of def.dice ?? []) { v += ((t.max - prev) / 6) * eventValue(run, t.effects, 0, seat); prev = t.max; }
  const pk = def.pick;
  if (pk?.kind === 'choose') v += blessChoices(run, seat, def.id).length ? 18 : 0;
  else if (pk) {
    const n = blessPickCount(run, seat, def).max;
    if (pk.kind === 'transform') v += n * 12;
    else v += eventValue(run, Array.from({ length: n }, () => ({ kind: pk.kind === 'remove' ? 'removeCard' : 'upgradeCard' }) as RunEffect), 0, seat);
  }
  return v;
}

/** 挑牌那一步機器人怎麼挑：丟／換評分最低的、升評分最高的；三選一照戰利品的挑法（都不夠格就拿評分最高那張） */
export function blessingPickFor(run: RunState, def: BlessingDef, seat = 0): BlessPick {
  const pk = def.pick;
  if (!pk) return {};
  if (pk.kind === 'choose') {
    const opts = blessChoices(run, seat, def.id);
    const c = pickCard(run, opts, seat) ?? opts.slice().sort((a, b) => rating(b.id) - rating(a.id))[0]?.id;
    return c ? { c } : {};
  }
  const n = blessPickCount(run, seat, def).max;
  const cands = blessPickable(run, seat, pk.kind).slice()
    .sort((a, b) => (pk.kind === 'upgrade' ? rating(b.cardId) - rating(a.cardId) : rating(a.cardId) - rating(b.cardId)));
  return { u: cands.slice(0, n).map((c) => c.uid) };
}

/**
 * 祝福量尺量出來的「多爬幾層」（`bless-ratings.json`，`tools/relic_ruler.test.ts` 的 `RULER=bless` 產生），每隻一份。
 * 表上沒有的（還沒量、舊護腕那件秘寶還沒進池）照 `blessingValue` 換成層數（一層 8 事件分，同秘寶量尺的 `eventPointsPerFloor`）。
 */
const BLESS_TABLE = (BLESS_RATINGS as { bless: Record<string, Partial<Record<Hero, number>>> }).bless;
const EVENT_POINTS_PER_FLOOR = (RELIC_RATINGS as { meta?: { eventPointsPerFloor?: number } }).meta?.eventPointsPerFloor ?? 8;
export function blessingScore(run: RunState, def: BlessingDef, seat = 0): number {
  return BLESS_TABLE[def.id]?.[heroOf(me(run, seat))] ?? blessingValue(run, def, seat) / EVENT_POINTS_PER_FLOOR;
}

/**
 * 開局拿祝福（`smartRun`／`coopRun` 走第一格之前）：包袱四樣各算 `blessingScore`、拿最高的。
 * 觀察點 `blessing` 可以強制拿某一樣或什麼都不拿（祝福量尺）。
 */
export function smartBless(run: RunState, seat = 0): string | null {
  rollBlessings(run);
  const forced = probe?.blessing?.(run, seat);
  if (forced === null) { delete me(run, seat).bless; return null; }
  if (forced) me(run, seat).bless = { offer: [forced] };
  const offer = me(run, seat).bless?.offer ?? [];
  const scored = offer.map((id, i) => ({ i, def: blessingById[id]! })).filter((x) => x.def)
    .map((x) => ({ ...x, v: blessingScore(run, x.def, seat) })).sort((a, b) => b.v - a.v);
  const best = scored[0];
  if (!best) return null;
  return takeBlessing(run, seat, best.i, blessingPickFor(run, best.def, seat)) ? best.def.id : null;
}

/**
 * 打盹回的血比磨爪（順便回一成）多嗎（2026-09-23 內容擴充第一批，不眠香爐「打盹不再回血」的代價）。
 * 沒帶香爐時打盹回三成，一定成立，兩支機器人的貓窩判斷跟以前一模一樣；帶了就知道睡下去什麼都不回，
 * 不會照舊在缺血時衝貓窩打盹、白白放掉一次升級。44F 師父門前那一格照樣回滿，也成立。
 */
export function napWorks(run: RunState, seat = 0): boolean {
  return napHeal(run, seat) > Math.floor(me(run, seat).maxHp * 0.1);
}

/**
 * 為了店主繞路（2026-09-23 第三批 新J，design3 4-4）：罐頭鋪那一格照顧店的是誰加分——阿福＋15（廢牌兩張以上）、
 * 掌櫃＋15（錢 150 以上）、婆婆＋10（忍具不到兩支，或身上有沾了魔氣的秘寶）。橘貓老闆不加，跟以前一樣。
 * 讓機器人也會「看到那張臉就繞過去」，量尺才量得到這個結構。連線那支（`coopbot.ts`）看座位 0。
 */
export function keeperDetour(run: RunState, n: MapNode, seat = 0): number {
  const k = keeperOf(n);
  const p = me(run, seat);
  if (k === 'junk') return deckJunk(run, seat).length >= 2 ? 15 : 0;
  if (k === 'curio') return p.fish >= 150 ? 15 : 0;
  // 婆婆：忍具不到兩支，或身上有沾了魔氣的秘寶（她會淨化，2026-09-24 b3int 合併後接上 b3rare 的 `miasmaRelicsOf`）
  if (k === 'tortoise') return p.potions.length < 2 || miasmaRelicsOf(run, seat).length > 0 ? 10 : 0;
  return 0;
}

/**
 * 客座店主的服務與放生（2026-09-23 第三批 新J，design3 4-4），逛店一開始先跑（跟「先放生爛牌」同一個時機）：
 * 阿福——廢牌一張以上、錢夠半價放生再留 40 就放生；牌組還有評分 2 以下的、錢 100 以上才換招。
 * 婆婆——淨化後多 1.5 層以上、錢 130 以上就淨化（淨化那條線 b3rare 的 `purifyAtShop`；收益＝量尺上「淨化版 − 原件」，`purifyGain`，
 * 跟貓窩的清心香同一把尺；2026-09-24 b3int 合併後接上）。
 * 橘貓老闆、掌櫃什麼都不做（掌櫃照現在：秘寶 6 分門檻）。兩支機器人（單人、連線）共用，規則一樣。
 */
export function keeperServices(run: RunState, shop: ShopStock, seat = 0): void {
  const p = me(run, seat);
  if (shop.keeper === 'junk') {
    const junk = deckJunk(run, seat);
    if (junk.length >= 1 && p.fish >= removePrice(run, seat, shop) + 40) buyRemove(run, junk[0]!.uid, seat, shop);
    const left = deckJunk(run, seat);
    if (left.length && p.fish >= 100) buySwap(run, shop, left[0]!.uid, seat);
  }
  if (shop.keeper === 'tortoise' && p.fish >= 130) {
    const hero = heroOf(p);
    const id = bestPurify(miasmaRelicsOf(run, seat), hero);
    if (id && purifyGain(id, hero).floors >= 1.5) purifyAtShop(run, shop, id, seat);
  }
}

/**
 * 婆婆那間的忍具（design3 4-4）：身上不到三支、錢夠價錢再留 30 就買最便宜那支，買到三支或錢不夠為止（帶滿了不換）。
 * 回傳 false＝不是婆婆那間，呼叫端照舊規則買（不到兩支、留 40）。
 */
export function keeperPotions(run: RunState, shop: ShopStock, seat = 0): boolean {
  if (shop.keeper !== 'tortoise') return false;
  const p = me(run, seat);
  while (p.potions.length < 3 && p.potions.length < potionCapacity(run, seat)) {
    const cheap = shop.potions.map((it, i) => ({ i, price: priceFor(run, it, seat, shop), sold: it.sold }))
      .filter((x) => !x.sold).sort((a, b) => a.price - b.price)[0];
    if (!cheap || p.fish < cheap.price + 30 || !buyPotion(run, shop, cheap.i, undefined, seat)) break;
  }
  return true;
}

/**
 * 探路杖下一個問號格就到點了（任一位；到點那一格一定是路邊紙箱）：選路時問號格多 20 分，機器人才會「照著杖走」
 *（2026-09-24 b3int：原本機器人不理它，量出來常見池墊底 +0.4 層；真人帶著它也會往問號格走）。計數存在 `RunPlayer.counters[秘寶代號]`
 */
export function scoutDue(run: RunState): boolean {
  return run.players.some((p) => !p.down && p.relics.some((id) => {
    const every = relicById[id]?.hooks.qmarkEvery;
    return !!every && (p.counters?.[id] ?? 0) >= every - 1;
  }));
}

function nodeScore(run: RunState, n: MapNode): number {
  const hpPct = me(run).hp / me(run).maxHp;
  switch (n.type) {
    // 缺血才衝貓窩——前提是打盹回得了血（不眠香爐睡了不回，那時貓窩只剩磨爪，2026-09-23）
    case '貓窩': return hpPct < 0.55 && napWorks(run) ? 100 : bestUpgrade(run) ? 55 : 20;
    // 客座店主繞路加分（`keeperDetour`，b3shop）；帶集章卡、這位店主還沒蓋過章時再 +15（design3 7-3：機器人要會繞路，量尺才量得準）
    case '罐頭鋪': return (me(run).fish >= 120 ? 75 : me(run).fish >= 75 ? 45 : 15) + keeperDetour(run, n) + (stampWanted(run, 0, n) ? 15 : 0);
    case '事件': return 50 + (scoutDue(run) ? 20 : 0);
    case '紙箱': return 90;
    case '大魔物': return hpPct >= 0.7 && me(run).deck.some((c) => c.upgraded) ? 62 : 8;
    case '戰鬥': return 42;
    case '塔主': return 1;
  }
}

/**
 * 行腳商（問號格變化，2026-09-23 內容擴充第三批，設計稿 3-5）：只做一筆生意。秘寶分數 ≥ 6 且買得起就買秘寶；
 * 不然牌評分 ≥ 7 就買牌；不然身上忍具少於 2 支就買便宜的那支；都不合就走。兩支機器人共用（`coopbot.ts` 每一位各叫一次）。
 */
export function shopAtMerchant(run: RunState, shop: ShopStock, seat = 0): void {
  const hero = heroOf(me(run, seat));
  const fish = me(run, seat).fish;
  const relic = shop.relics.map((r, i) => ({ i, v: relicRating(r.id, hero) + setBonusScore(r.id, hero, me(run, seat).relics), p: priceFor(run, r, seat, shop) })).sort((a, b) => b.v - a.v)[0];
  if (relic && relic.v >= 6 && fish >= relic.p && buyRelic(run, shop, relic.i, seat)) return;
  const card = shop.cards.map((c, i) => ({ i, v: rating(c.def.id), p: priceFor(run, c, seat, shop) })).sort((a, b) => b.v - a.v)[0];
  if (card && card.v >= 7 && fish >= card.p && buyCard(run, shop, card.i, seat)) return;
  if (me(run, seat).potions.length >= 2) return;
  const cheap = shop.potions.map((x, i) => ({ i, p: priceFor(run, x, seat, shop) })).sort((a, b) => a.p - b.p)[0];
  if (cheap && fish >= cheap.p) buyPotion(run, shop, cheap.i, undefined, seat);
}

/** 問號格變成的那一種（設計稿 3-5）：伏擊照 `eventValue` 比兩條路（血少於五成時打一場 −30，所以血少會跑、血多會打）；路邊紙箱照紙箱開 */
function smartQmark(run: RunState, rng: Rng, node: MapNode, seed: string, stats: SmartStats): void {
  if (node.variant === '伏擊') {
    const [fightFx, fleeFx] = ambushOutcomes(node);
    const fx = eventValue(run, fightFx, 0) >= eventValue(run, fleeFx, 0) ? fightFx : fleeFx;
    handleOutcome(run, rng, applyRunEffects(run, fx), seed, stats);
  } else if (node.variant === '行腳商') shopAtMerchant(run, makeMerchant(run));
  else openRoadsideBox(run);
}

export function smartRun(seed: string, difficulty = 1, hero: Hero = 'ninja'): SmartStats {
  const run = newRun(seed, difficulty, hero);   // `hero`＝拿聰明機器人量另一個角色的平衡（2026-09-12 加的）
  const rng = new Rng(seedFromString('smart:' + seed));
  const stats: SmartStats = { seed, won: false, floor: 0, act: 1, deckSize: 0, deckIds: [], relicIds: [], upgraded: 0, relics: 0, diedTo: null, bosses: [], fights: [] };
  probe?.setup?.(run);
  smartBless(run);   // 開局祝福（2026-09-23 第三批）：分支亂數，不動整局亂數與機器人自己的亂數
  let guard = 0;
  while (run.status === 'playing') {
    if (++guard > 140) throw new Error('節點推進超過 140 次');
    const options = nextChoices(run.map, run.currentNode);
    const scored = options.map((n) => ({ n, s: nodeScore(run, n) + rng.next() * 6 }));
    const node = chooseNode(run, scored.sort((a, b) => b.s - a.s)[0]!.n.id);
    switch (node.type) {
      case '戰鬥': case '大魔物': case '塔主': {
        fight(run, rng, undefined, 0, seed, stats);
        if (node.type === '塔主' && run.status === 'playing' && run.act < ACTS) {
          const picks = rollActRelics(run);
          const best = bestRelic(picks, heroOf(me(run)), me(run).relics);
          if (best) takeRelic(run, best);
          const cardPicks = rollActCards(run);
          const id = pickCard(run, cardPicks) ?? cardPicks.slice().sort((a, b) => rating(b.id) - rating(a.id))[0]?.id;
          if (id) addCard(run, id);
          advanceAct(run);
        }
        break;
      }
      case '事件': {
        // 問號格變化（2026-09-23 內容擴充第三批，設計稿 3-5）：走進去才知道變成什麼，`nodeScore` 的事件格照舊 50
        if (node.variant) { smartQmark(run, rng, node, seed, stats); break; }
        const ev = eventById[node.eventId!]!;
        // 只挑看得到的選項（條件選項沒達成就不在，2026-09-23 內容擴充第二批）；估值照這一位會跑的那一串
        const choice = visibleChoices(run, ev).map((i) => ev.choices[i]!)
          .map((c) => ({ c, v: eventValue(run, choiceEffectsFor(c, 0), c.costFish ?? 0) })).sort((a, b) => b.v - a.v)[0]!.c;
        me(run).fish = Math.max(0, me(run).fish - (choice.costFish ?? 0));
        handleOutcome(run, rng, applyRunEffects(run, choiceEffectsFor(choice, 0)), seed, stats);
        break;
      }
      case '罐頭鋪': {
        const shop = makeShop(run);
        // 客座店主的服務與放生先跑（阿福放生換招、婆婆淨化，2026-09-23 第三批）；阿福那間放生照他的規則，下面不再放生
        keeperServices(run, shop);
        // 先放生爛牌（留 60 條買東西），再看秘寶，再看牌
        const junk = deckJunk(run);
        if (shop.keeper !== 'junk' && junk.length >= 3 && me(run).fish >= removePrice(run, 0, shop) + 60) buyRemove(run, junk[0]!.uid, 0, shop);   // 會員卡的固定價（2026-09-23 第二批）
        const relicIdx = shop.relics.map((r, i) => ({ i, v: relicRating(r.id, heroOf(me(run))) + setBonusScore(r.id, heroOf(me(run)), me(run).relics), p: r.price })).sort((a, b) => b.v - a.v)[0];
        if (relicIdx && relicIdx.v >= 6 && me(run).fish >= relicIdx.p) buyRelic(run, shop, relicIdx.i);
        const cardIdx = shop.cards.map((c, i) => ({ i, v: rating(c.def.id), p: c.price })).sort((a, b) => b.v - a.v)[0];
        if (cardIdx && cardIdx.v >= 7 && me(run).fish >= cardIdx.p && me(run).deck.length < 24) buyCard(run, shop, cardIdx.i);
        if (!keeperPotions(run, shop)) for (let i = 0; i < shop.potions.length; i++) {   // 婆婆那間照她的規則買（2026-09-23 第三批）
          const it = shop.potions[i]!;
          if (me(run).potions.length < 2 && me(run).fish >= it.price + 40) buyPotion(run, shop, i);
        }
        break;
      }
      case '貓窩': {
        const u = bestUpgrade(run);
        // 44F 打盹回滿：真人只要沒滿血都會睡，機器人比照（不然 60% 以上的血會去磨爪、量不到補給的效果）。
        // 打盹回不了血（不眠香爐）就去磨爪——磨爪還順便回一成，睡下去只剩暖毯那點蜷縮（2026-09-23）
        // 點清心香（2026-09-23 第三批）：收益 ≥ 1.5 層、血 ≥ 六成、不是 44F 才淨化（`restPurifyPick`），不然照原本的打盹／磨爪
        const pur = restPurifyPick(run);
        if (pur) rest(run, '淨化', undefined, 0, pur);
        else if ((me(run).hp < me(run).maxHp * (run.floor === 44 ? 0.98 : 0.6) && napWorks(run)) || !u || pillowWorthNap(run)) { rest(run, '打盹'); takePillowCard(run); }   // 夢枕：睡完挑一張
        else rest(run, '磨爪', u.uid);
        break;
      }
      case '紙箱': openChest(run); break;
    }
    probe?.node?.(run, node);
  }
  stats.won = run.status === 'won';
  stats.floor = run.floor;
  stats.act = run.act;
  stats.deckSize = me(run).deck.length;
  stats.upgraded = me(run).deck.filter((c) => c.upgraded).length;
  stats.relics = me(run).relics.length;
  stats.deckIds = me(run).deck.map((c) => c.cardId + (c.upgraded ? '+' : ''));
  stats.relicIds = [...me(run).relics];
  return stats;
}
