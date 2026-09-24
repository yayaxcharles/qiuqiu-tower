import { DEBUFFS } from '../engine/types';
import type { CardDef, Effect, StatusName } from '../engine/types';

/**
 * 規格 §6.1 有幾張牌的兩段效果是各自獨立的子句，用分號接才讀得順：
 * 順手牽羊（造成 6 點傷害；打倒牠就多拿 15 條小魚乾）、我在這、戰術撤退、讀心術、拖字訣。
 * 借力使力也算：前半句「造成的傷害等於你現在的蜷縮，而且蜷縮不會因此減少」自己就含逗號，
 * 後面再用逗號接「獲得 6 點蜷縮」會黏成一長串，看不出那 6 點是另一件事。
 */
const CLAUSE_AFTER: ReadonlySet<Effect['kind']> = new Set(['scry', 'retainFromHand', 'damageEqualBlock']);
const CLAUSE_BEFORE: ReadonlySet<Effect['kind']> = new Set(['drawIfTargetStatus', 'noAttacksThisTurn', 'poisonBurst', 'blockBonus', 'poisonOnAttack', 'echoFirst',
  'halfSpendBlock', 'blockWhenAttacked', 'thornsBonus', 'keepBlock', 'ifBlock', 'ifEnemyIntent',
  // `ifSelfStatus`（2026-09-17 稽核 中-1）：在噹噹之前，用這種效果的牌兩邊都有內容，
  // 「；否則」自己就把句子切開了；護臂格擋的 `otherwise` 是空的，切點跟著不見，
  // 就變成「獲得 7 點蜷縮，自己身上有反彈的話，獲得 4 點蜷縮。」兩個逗號串成一句
  'ifSelfStatus',
  'blockOnThorns', 'thornsFromSpend', 'blockToThorns']);

/** 效果落在同伴身上的那幾種：一個人玩的時候會算回自己身上（句尾統一補一句） */
/** 效果可能包在 `ifSelfStatus` 的 `then`／`otherwise` 裡，要一路往下看（推前審查 高-2） */
function hasAlly(fx: Effect): boolean {
  if (ALLY_KINDS.has(fx.kind)) return true;
  if (fx.kind === 'ifSelfStatus') return [...fx.then, ...fx.otherwise].some((f) => f && hasAlly(f));
  if (fx.kind === 'blockSpendQi') return fx.recipient === 'ally';
  if (fx.kind === 'nextAttackBonusSpendQi') return true;
  // 條件本身就在看同伴（借我擋一下：一個人或同伴倒下時改看自己的蜷縮），
  // 不能只看 `then` 裡有沒有同伴效果——`then` 是自己拿蓄氣，句尾那句就漏掉了（2026-09-23 稽核 引擎 低-4）
  if (fx.kind === 'ifAllyBlockAtPlay') return true;
  if (fx.kind === 'ifQiAtPlay' || fx.kind === 'ifSpentQiAtLeast') return fx.then.some(hasAlly);
  return false;
}

const ALLY_KINDS = new Set<Effect['kind']>([
  'statusAlly', 'blockAlly', 'drawAlly', 'drawAllyIfTargetStatus', 'cleanseAlly', 'healAlly',
  'blockFromAllyBlock', 'damageFromAllyStrength', 'doubleNextAttackAlly', 'transferDebuffsFromAlly',
  'energyAlly', 'energyForAllyEachRound', 'poisonAllyNextAttack', 'watchSelfPlay',
  // `watchAllyPlay` 與 `energyTransfer` 不在這裡：它們一個人玩時是**另一種行為**
  //（改成看自己出牌／根本不轉），不是「算在自己身上」，各自的句子裡有交代
]);

/**
 * 魔物這回合要做什麼，寫成玩家看得懂的一句話（噹噹的見招拆招）。
 * 用的字跟戰鬥畫面那排意圖圖示的說明一致，不然牌面講一套、圖示講另一套。
 */
const INTENT_TEXT: Readonly<Record<string, string>> = {
  // 引擎是「**任何一隻**符合就算」，所以寫「有魔物」不寫「魔物」（審查 2026-09-17 低-6）
  attack: '有魔物這回合要攻擊', block: '有魔物這回合要防禦', buff: '有魔物這回合要強化自己',
  debuff: '有魔物這回合要對你下手', summon: '有魔物這回合要叫幫手', special: '有魔物這回合要出怪招',
  idle: '有魔物這回合按兵不動',   // 引擎是 `some`（任何一隻符合就算），不能寫「都」（稽核 2026-09-17 低-3）
};

/** 條件句裡的「再」：「造成 6 點傷害；蜷縮大於 10 的話，**再**造成 6 點傷害」 */
function again(s: string): string {
  return /^(造成|獲得|抽|回復)/.test(s) ? `再${s}` : s;
}

/**
 * 一次性的狀態：**只給 1 層時**牌面不寫層數（規格 §6.1 定身術、點穴手都只寫「給目標定身」）。
 *
 * 2026-09-17 加上「只給 1 層時」這個但書。原本一律不寫，於是菲菲的絆線升級之後
 * 定身從 1 層變 2 層，牌面卻一個字都沒變——玩家磨了一張牌回來，完全看不出多了什麼。
 * 規格那句話是對「都只給 1 層」的牌講的，2 層以上就不成立了。
 */
const ONE_SHOT: ReadonlySet<StatusName> = new Set(['定身']);

/**
 * 各狀態的量詞。少了量詞的「獲得 1 隱身」「給目標 2 翻肚」唸起來不像中文，
 * 加上「層／點」才是一句話。分法照規格 §2 的名詞表：
 * 撐幾回合的算層（隱身、翻肚、懶洋洋、炸毛、中毒），數值型的算點（爪力、貓步、反彈）。
 */
export const STATUS_UNIT: Readonly<Record<string, string>> = {
  隱身: '層', 翻肚: '層', 懶洋洋: '層', 炸毛: '層', 中毒: '層',
  // 定身本來不用量詞（只給 1 層時牌面不寫層數），2026-09-17 絆線升級寫出兩層之後才需要
  定身: '層',
  爪力: '點', 貓步: '點', 反彈: '點',
};

/**
 * 潛水是引擎內部用來記「下回合開始換成隱身」的暫存狀態（見 glossary 與 combat.ts 的回合開始結算）。
 * 牌面不講這個名字，照規格 §6.1 寫成「下回合開始再獲得 N 隱身」。
 */
function isDive(fx: Effect | undefined): boolean {
  return fx?.kind === 'status' && fx.name === '潛水';
}

/** 這條效果點名的是「全體魔物」嗎——收掉重複主詞用 */
function namesAllFoes(fx: Effect | undefined): boolean {
  if (!fx) return false;
  if (fx.kind === 'damage') return fx.target === 'all';
  if (fx.kind === 'status') return fx.target === 'all' && !isDive(fx);
  return false;
}

/** 這張牌有沒有動到魔物——有的話回復要寫成「你回復 N 生命」才分得清誰回血（規格 §6.1 以德服人） */
const FOE_KINDS: ReadonlySet<Effect['kind']> = new Set(
  ['damage', 'damageRamp', 'damageRandom', 'damageEqualBlock', 'damageByStatus', 'execByStatus',
   'damageSpendBlock', 'damageByOwnStatus', 'damageSpendQi',
   'stealBlock', 'removeStatuses', 'transferDebuffs']);
function touchesFoes(effects: readonly Effect[]): boolean {
  return effects.some((e) => FOE_KINDS.has(e.kind) || (e.kind === 'status' && e.target !== 'self'));
}

/**
 * 這張牌有沒有打魔物——自傷寫成「自己**也**受 N 點傷害」時，那個「也」要有對象才成立。
 * 鐵頭功、亡命是先打人再自傷，「也」對；拼命只有自傷（拿血換飯糰），
 * 寫「也」會害玩家回頭去找那個根本不存在的前一下。
 */
const HURT_KINDS: ReadonlySet<Effect['kind']> = new Set(
  ['damage', 'damageRamp', 'damageRandom', 'damageEqualBlock', 'damageByStatus', 'execByStatus',
   'damageSpendBlock', 'damageByOwnStatus', 'damageSpendQi']);
function hurtsFoes(effects: readonly Effect[]): boolean {
  return effects.some((e) => HURT_KINDS.has(e.kind));
}

function sep(prev: Effect, next: Effect): string {
  // 「獲得 1 隱身」跟「下回合開始再獲得 1 隱身」是兩件事，用分號分開（規格 §6.1 潛水術）
  if (isDive(next)) return '；';
  // 連續兩條都打全體魔物：主詞只講一次，第二條用頓號接在後面（規格 §6.1 催眠術）
  if (namesAllFoes(prev) && namesAllFoes(next) && next.kind === 'status' && prev.kind === 'status') return '、';
  if ((next.kind === 'gold' || next.kind === 'energy' || next.kind === 'energyAlly') && next.onKill) return '；';
  // 條件句後的抽牌獨立成句，避免看成也要符合前面的條件。
  if (next.kind === 'drawAlly' && (prev.kind === 'ifSelfStatus' || (prev.kind === 'energyAlly' && prev.onKill))) return '。';
  if (next.kind === 'blockIfPoisoned' && namesAllFoes(prev)) return '。';
  return CLAUSE_AFTER.has(prev.kind) || CLAUSE_BEFORE.has(next.kind) ? '；' : '，';
}

interface Ctx {
  /**
   * 這條效果掛在能力牌的觸發子句底下。
   * 措辭改寫後蜷縮一律講「獲得 N 點蜷縮」，兩種情境已經同一種講法，這個旗標目前不影響文字；
   * 留著是因為 power 的內層仍照它遞迴，之後要分開講時有地方掛。
   */
  inPower?: boolean;
  /** 前一條效果，用來收掉重複的主詞與接「再」 */
  prev?: Effect | undefined;
  /** 這張牌同時動到魔物，回復要寫「你回復」 */
  youHeal?: boolean;
  /** 這張牌同時也打了魔物，自傷才寫得出「自己也受」 */
  alsoHurts?: boolean;
  /** 分身術這場已經打過幾次：牌面要印「這次打出去實際打幾點」，不是永遠印基礎值 */
  plays?: number;
}

/**
 * 一條效果的文字。
 *
 * 2026-08-30 全面改寫措辭：原本是「造成 6 傷」「蜷縮 5」「獲得 1 隱身」這種
 * 沒動詞也沒量詞的寫法，唸出來不像人話。現在一律補齊「N 點傷害」「N 點蜷縮」
 * 「N 層隱身」「N 張牌」，句子也改成台灣人會講的語序。
 */
function one(fx: Effect, ctx: Ctx = {}): string {
  switch (fx.kind) {
    case 'gainQi': return `獲得 ${fx.n} 點蓄氣`;
    case 'damageSpendQi': {
      const spend = fx.allQi ? '用盡蓄氣' : `最多花 ${fx.maxQi ?? 0} 點蓄氣`;
      const who = fx.target === 'all' ? '對全體魔物' : '';
      const hits = (fx.times ?? 1) > 1 ? `，連打 ${fx.times} 次` : '';
      return `${spend}，${who}造成 ${fx.amount} 點傷害，每點蓄氣多 ${fx.perQi} 點${hits}`
        + (fx.ignoreBlock ? '，無視蜷縮' : '');
    }
    case 'blockSpendQi': return `最多花 ${fx.maxQi} 點蓄氣，${fx.recipient === 'ally' ? '同伴' : '自己'}獲得 ${fx.amount} 點蜷縮，每點蓄氣多 ${fx.perQi} 點`;
    case 'nextAttackBonusSpendQi': return `最多花 ${fx.maxQi} 點蓄氣，${fx.recipients === 'ally' ? '同伴' : '雙方'}本回合下一張攻擊牌的首段首目標多 ${fx.amount} 點傷害，每點蓄氣再多 ${fx.perQi} 點（取高不疊加）`;
    // 門檻是「至少」（引擎 `>=`），條件成立才跑的那段接「再」——跟噹噹的 `ifBlock` 同一套（2026-09-23 稽核 引擎 低-3）：
    // 原本印「獲得 8 點蜷縮，出牌前有 3 點蓄氣的話，獲得 3 點蜷縮」，像同一份拿兩次，「有 3 點」也會被讀成剛好 3 點。
    // 借我擋一下（`ifAllyBlockAtPlay`）是同一型句子，一起補「再」
    case 'ifQiAtPlay': return `出牌前有至少 ${fx.min} 點蓄氣的話，` + fx.then.map((e) => again(one(e, ctx))).join('，');
    case 'ifSpentQiAtLeast': return `這張牌花了至少 ${fx.min} 點蓄氣的話，` + fx.then.map((e) => one(e, ctx)).join('，');
    case 'ifAllyBlockAtPlay': return `同伴原有至少 ${fx.min} 點蜷縮的話，` + fx.then.map((e) => again(one(e, ctx))).join('，');
    case 'preventEnergyGainThisPhase': return '這回合不能再獲得飯糰';
    /*
     * ===== 噹噹（2026-09-17）=====
     *
     * 措辭統一寫「**卸掉**蜷縮」而不是「消耗」：「消耗」在這個遊戲已經是關鍵字
     *（打完就不見的那種牌），同一個詞當兩件事用，提示框會兩條都跳出來。
     */
    case 'damageSpendBlock': {
      // 「卸掉身上的蜷縮」不寫「全部」：帶著銅牆鐵壁時只卸一半，寫「全部」跟實際對不上
      const spend = fx.all ? '卸掉身上的蜷縮' : `最多卸掉 ${fx.max ?? 0} 點蜷縮`;
      const n = ({ 2: '兩', 3: '三' } as Record<number, string>)[fx.mul!] ?? `${fx.mul} `;
      const hit = (fx.mul ?? 1) > 1 ? `造成卸掉點數${n}倍的傷害` : '造成等量傷害';
      const who = fx.target === 'all' ? hit.replace('造成', '對全體魔物造成') : hit;
      const plus = fx.plusOwnStatus ? `，每有 1 點${fx.plusOwnStatus}再多打 1 點` : '';
      // 保底那段寫在前面（卸力掌乙方案）：「造成 4 點傷害，最多卸掉 6 點蜷縮加上去」
      if (fx.plus) return `造成 ${fx.plus} 點傷害，${spend}加上去${plus}` + (fx.ignoreBlock ? '，無視防禦' : '');
      return `${spend}，${who}${plus}` + (fx.ignoreBlock ? '，無視防禦' : '');
    }
    case 'healSpendBlock': return `最多卸掉 ${fx.max} 點蜷縮，回復等量生命`;
    case 'blockFromThorns': return '把你的反彈點數加到蜷縮上（反彈不會因此減少）';
    case 'damageByOwnStatus': return (fx.mul ?? 1) > 1
      ? `造成你${fx.name}點數${({ 2: '兩', 3: '三' } as Record<number, string>)[fx.mul!] ?? `${fx.mul} `}倍的傷害`
      : `造成等同你${fx.name}點數的傷害`;
    // 「身上有蜷縮」比「蜷縮不少於 1 點」好唸，只有門檻 1 這樣寫
    // 條件成立才跑的那幾條接在前一句後面，動詞前補個「再」才不會唸成重複兩次
    case 'ifBlock': return `${fx.min <= 1 ? '身上有蜷縮的話' : `蜷縮大於 ${fx.min - 1} 的話`}，`
      + fx.then.map((e) => again(one(e, ctx))).join('，');
    case 'ifEnemyIntent': return `${INTENT_TEXT[fx.intent]}的話，` + fx.then.map((e) => again(one(e, ctx))).join('，');
    case 'keepBlock': return `這回合結束時最多保留 ${fx.n} 點蜷縮`;
    case 'halfSpendBlock': return '之後卸掉蜷縮的牌只卸一半（不滿一點算一點，連卸光那種也是），打出去的力道不變';
    case 'blockWhenAttacked': return `之後每次被魔物攻擊（擋下來也算），獲得 ${fx.n} 點蜷縮`;
    case 'thornsBonus': return `之後反彈回敬時多打 ${fx.n} 點`;
    case 'blockOnThorns': return `之後每次反彈回敬，獲得 ${fx.n} 點蜷縮`;
    case 'thornsFromSpend': return `之後卸掉蜷縮打人時，獲得等同卸掉點數${fx.full ? '' : '一半'}的反彈`;
    // 蜷縮回合末本來就歸零，這張把要被丟掉的那份存成不會消失的一半
    case 'blockToThorns': return `這回合結束時，剩下的蜷縮每 ${fx.per} 點換成 ${fx.gain} 點反彈`;
    case 'damageScatter': return `對隨機魔物造成 ${fx.amount} 點傷害，打 ${fx.times} 次`;
    case 'skipEnemyTurn': return '魔物這回合不出手';
    // 倍率寫成「兩倍」不是「×2」：牌面其他地方都用中文，突然冒一個乘號很跳（2026-09-14）。
    // 原本註解這樣寫、程式卻印成「層數2 倍」（數字、少空格、「等同…的 2 倍」語意打架，夜間稽核 中-3），
    // 改成照使用者給的原句：「造成中毒層數兩倍的傷害」
    case 'damageByStatus': return ((fx.mul ?? 1) > 1
      ? `造成目標${fx.name}層數${({ 2: '兩', 3: '三', 4: '四' } as Record<number, string>)[fx.mul!] ?? `${fx.mul} `}倍的傷害`
      : `造成等同目標${fx.name}層數的傷害`)
      + (fx.consume ? `，然後把${fx.name}清掉` : '');
    // 「不少於」跟引擎一致（`effects.ts` 是層數 ≥ 生命就打倒）：原本寫「比…還多」，剛好相等時牌面說不行、實際會成功（夜間稽核 低-7）
    case 'execByStatus': return `目標的${fx.name}層數不少於牠剩下的生命的話，直接打倒牠`;
    case 'spreadStatus': return fx.half
      ? `把目標身上的${fx.name}分給其他魔物，各拿一半`
      : `把目標身上的${fx.name}原封不動複製給其他每一隻魔物`;
    case 'poisonBurst': return fx.full ? '中毒的魔物被打倒時，剩下的層數每一隻都拿一份'
      : '中毒的魔物被打倒時，把剩下的層數分給其他魔物';
    case 'blockBonus': return `之後每次獲得蜷縮都多 ${fx.n} 點`;
    // 括號裡第二句是 2026-09-16 補的：重播不再掛第二份能力（見 `effects.ts` 的 `case 'power'`）。
    // 牌面不寫的話，玩家會看到「又打了一次」卻發現封印解除的成長沒有變快，以為壞掉了
    case 'echoFirst': return '之後每回合第一張不是能力牌的牌，會再打一次（可以疊：多掛一張就多打一次）';
    case 'poisonOnAttack': return `之後每打出一張攻擊牌，再給那個目標 ${fx.n} 層中毒`;
    // 幫隊友的三招（連線版 2026-09-11）。措辭刻意寫成「兩個人一起玩才看得出差別」，
    // 不寫成「給隊友」——單機也抽得到這些牌，說了做不到的事會讓玩家以為壞掉
    case 'blockIfPoisoned': return namesAllFoes(ctx.prev)
      ? `出牌前已有任一隻魔物中毒的話，自己獲得 ${fx.amount} 點蜷縮`
      : `目標原本就中毒的話，獲得 ${fx.amount} 點蜷縮`;
    case 'blockAll': return `每個人各獲得 ${fx.amount} 點蜷縮`;
    case 'statusAlly': return `同伴獲得 ${fx.amount} ${STATUS_UNIT[fx.name] ?? '層'}${fx.name}`;
    case 'taunt': return '這一輪魔物全部衝著你來（攻擊、偷小魚乾、減益都算）';
    case 'blockAlly': return `同伴獲得 ${fx.amount} 點蜷縮`;
    case 'drawAlly': return `同伴抽 ${fx.n} 張牌`;
    case 'cleanseAlly': return '清掉同伴身上所有減益';
    // 連線支援牌（2026-09-13）。措辭跟上面幾張一致：寫「同伴」並補一句單人時怎麼算，
    // 不然單機抽到會以為牌壞掉
    case 'healAlly': return `同伴回復 ${fx.n} 點生命`;
    case 'blockFromAllyBlock': return `獲得 ${fx.amount} 點蜷縮，再照同伴現有的蜷縮`
      + `${fx.half ? '一半' : ''}多拿（最多 ${fx.cap} 點，同伴不會變少）`;
    case 'damageFromAllyStrength': return `造成 ${fx.amount} 點傷害，同伴每有 1 點爪力再加 1 點`
      + `（最多 ${fx.cap} 點）${fx.ignoreBlock ? '，無視防禦' : ''}`;
    // 句尾那句總結說「同伴就是你自己」，這一項卻是一個人玩時整個不發生，
    // 所以括號要寫成「這一項不會發生」才不會跟總結打架（推前審查 2026-09-16 高-3）
    case 'energyTransfer': return `把自己最多 ${fx.n} 顆剩下的飯糰交給同伴（這一項一個人玩時不會發生）`;
    case 'doubleNextAttackAlly': return '同伴本輪的下一張攻擊牌傷害加倍';
    case 'drawAllyIfTargetStatus': return `目標在出牌前已經${fx.anyDebuff ? '有任何減益' : `有${fx.name}`}的話，`
      + `同伴抽 ${fx.n} 張牌`;
    case 'transferDebuffsFromAlly': return '把同伴身上所有減益移到目標魔物身上';
    case 'watchAllyPlay': return `之後每一輪，同伴第一次打出${fx.cardType === 'any' ? '牌' : '技能牌'}時，自己抽 1 張`
      + '（自己一個人時改成看自己出牌）';
    case 'watchSelfPlay': return `之後每一輪，自己第一次打出${fx.cardType === 'any' ? '牌' : '攻擊牌'}時，同伴獲得 6 點蜷縮`;
    case 'watchPoisonHit': return `之後每輪一次，${fx.who === 'both' ? '任一方讓' : '同伴用攻擊牌讓'}原本就中毒的魔物扣血時，兩人各獲得 4 點蜷縮`   // 升級版技能傷害也算，所以不寫「攻擊」（審查 2026-09-15 引擎 低-7）
      + '（自己一個人時自己出手也算，獲得 8 點）';
    case 'poisonAllyNextAttack': return `同伴本輪下一張讓魔物扣血的${fx.anyDamage ? '牌' : '攻擊牌'}，`
      + `對牠們各施加 ${fx.amount} 層中毒`;
    case 'energyForAllyEachRound': return `之後每一輪開始時，同伴多 1 顆飯糰`
      + `${fx.draw ? '、並多抽 1 張' : ''}`;
    // `.map(one)` 不行：`map` 會把索引當成第二個參數塞進 `ctx`（型別檢查抓到的）
    /*
     * **另一邊是空的就不要接「否則」**（2026-09-17 抓到）。
     * 這條原本一律接「；否則」加上另一組的內容，而噹噹的護臂格擋沒有另一組，
     * 印出來變成「……獲得 4 點蜷縮；**否則。**」——一句沒講完的話。
     * 全牌池只有那一張中招，因為在那之前每一張用這個效果的牌兩邊都有東西。
     */
    case 'ifSelfStatus': {
      const then = fx.then.map((e) => one(e, ctx)).join('，');
      const other = fx.otherwise.map((e) => one(e, ctx)).join('，');
      return `自己身上有${fx.name}的話，${then}` + (other ? `；否則${other}` : '');
    }
    case 'energyAlly': return fx.onKill
      ? `打倒牠，同伴這回合就多 ${fx.n} 顆飯糰`   // 審查 2026-09-15 高-1：原本沒寫條件，9 點打不死玩家以為牌壞了
      : `同伴這回合多 ${fx.n} 顆飯糰`;
    case 'damage': {
      // 前面剛「把目標的防禦全部搶過來」，這一下要接「再造成 N 點傷害」（規格 §6.1 交出來）
      if (fx.ifTargetDebuffed) return `目標身上有任何減益就再造成 ${fx.amount} 點傷害`;
      const again = ctx.prev?.kind === 'stealBlock' ? '再' : '';
      const head = fx.target === 'all' ? `對全體魔物造成 ${fx.amount} 點傷害` : `${again}造成 ${fx.amount} 點傷害`;
      const cap = fx.comboCap === undefined ? '' : `（最多 ${fx.comboCap} 次）`;
      const times = fx.scaleWithCombo
        ? `，打的次數是連抓再加 1${cap}`
        : (fx.times ?? 1) > 1 ? `，連打 ${fx.times} 次` : '';
      return head + times + (fx.ignoreBlock ? '，無視防禦' : '');
    }
    case 'damageRamp': {
      // 疊過就印當下的數字，後面補一句原本幾點，玩家才看得出疊了多少（使用者 2026-09-04）
      const plays = ctx.plays ?? 0;
      const now = fx.amount + fx.step * plays;
      const grew = plays > 0 ? `（原本 ${fx.amount} 點）` : '';
      return `造成 ${now} 點傷害${grew}，這場戰鬥中這張牌每打出一次，傷害就再加 ${fx.step} 點`;
    }
    case 'damageRandom': return `隨機造成 ${fx.min}～${fx.max} 點傷害`;
    case 'damageEqualBlock': return '造成的傷害等於你現在的蜷縮，而且蜷縮不會因此減少';
    case 'selfDamage': return `自己${ctx.alsoHurts ? '也' : ''}受 ${fx.amount} 點傷害`;
    case 'block': return `獲得 ${fx.amount} 點蜷縮`;
    case 'stealBlock': return '把目標的防禦全部搶過來';
    case 'draw': return `抽 ${fx.n} 張牌`;
    case 'drawIfTargetStatus': return `目標身上有${fx.name}就抽 ${fx.n} 張牌`;
    case 'drawNextTurn': return `下回合開始時多抽 ${fx.n} 張牌`;
    case 'status': {
      // 成長牌（菲菲的分身術）：字照使用者 2026-09-14 給的原句；疊過就印當下的層數，後面補原本幾點（跟 damageRamp 同規矩）
      if (fx.step) {
        const plays = ctx.plays ?? 0;
        const grew = plays > 0 ? `（原本 ${fx.amount} 點）` : '';
        return `造成 ${fx.amount + fx.step * plays} 點${fx.name}層數${grew}，這場戰鬥中這張牌每打出一次，${fx.name}層數就再加 ${fx.step} 點`;
      }
      if (isDive(fx)) return `下回合開始時再獲得 ${fx.amount} 層隱身`;
      if (fx.name === '鐵布衫') return `下回合開始時再獲得 ${fx.amount} 點蜷縮`;
      const oneShot = ONE_SHOT.has(fx.name) && fx.amount <= 1;
      const body = oneShot ? fx.name : `${fx.amount} ${STATUS_UNIT[fx.name] ?? ''}${fx.name}`;
      const say = (head: string): string => (oneShot ? head + body : `${head} ${body}`);
      if (namesAllFoes(fx) && namesAllFoes(ctx.prev)) {
        // 主詞前一條已經講過了：接在同一條狀態後面只留層數，接在傷害後面補一句誰獲得
        return ctx.prev?.kind === 'status' ? body : say('再讓牠們獲得');
      }
      // 自己吃減益要講「自己獲得」，不然「獲得 1 層翻肚」會被讀成好事（規格 §6.1 出大事了的措辭）
      return fx.target === 'self' ? say(DEBUFFS.includes(fx.name) ? '自己獲得' : '獲得')
        : fx.target === 'all' ? say('全體魔物獲得')
          : say('給目標');
    }
    // 2026-09-23 內容擴充第二批的四個（今天只有忍具用，忍具的牌面是手寫的 `text`；這裡寫好是為了哪天有牌用到時不會漏）
    case 'energyNextTurn': return `下回合開始時多 ${fx.n} 顆飯糰`;
    case 'guardLethal': return '這場戰鬥接下來第一次會被打倒時，留下 1 點生命；這個魔物回合剩下的攻擊也打不死你（最低留 1 點）';
    case 'transformFromHand': return '挑一張手牌，換成一張隨機的升級牌（只在這場戰鬥）';
    case 'daze': return '目標這回合的攻擊改打牠旁邊的同伴（沒有同伴就打空）';
    case 'removeStatuses': return fx.target === 'all' ? `拔掉全體魔物身上的${fx.names.join('、')}` : fx.max === undefined
      ? `移除目標的${fx.names.join('、')}${fx.removeBlock ? '與防禦' : ''}`
      : `移除目標最多 ${fx.max} 點${fx.names.join('、')}${fx.removeBlock ? `與 ${fx.max} 點防禦` : ''}`;
    case 'transferDebuffs': return `把你身上的${DEBUFFS.join('、')}全部丟到目標身上`;   // 照引擎的表，不手抄
    case 'cleanse': return fx.max ? `清掉自己身上 ${fx.max} 種減益` : '清掉自己身上所有的減益';
    case 'energy': return fx.onKill ? `打倒牠就拿回 ${fx.n} 顆飯糰` : `獲得 ${fx.n} 顆飯糰`;
    case 'doubleStatus': return `把目標身上的${fx.name}翻倍` + (fx.add ? `，再加 ${fx.add} 層` : '（沒有就沒效果）');
    // `percent` 照實際數字印，不要寫死「一半」：型別上它是任意數字，
    // 哪天加一支回三成的，文字會跟實際回的血對不上（稽核 2026-09-11 低-2）
    case 'heal': return fx.percent
      ? `${ctx.youHeal ? '你' : ''}回復最大生命的 ${fx.percent}%`
      : `${ctx.youHeal ? '你' : ''}回復 ${fx.n} 點生命`;
    case 'gold': return fx.onKill ? `打倒牠就多拿 ${fx.n} 條小魚乾` : `多拿 ${fx.n} 條小魚乾`;
    case 'scry': return `看抽牌堆最上面 ${fx.n} 張，想丟掉哪幾張都可以`;
    case 'exhaustFromHand': return `消耗手牌裡的 ${fx.n} 張牌`;
    case 'retainFromHand': return `挑 ${fx.n} 張手牌留到下回合`;
    case 'discardFromHand': return `丟掉 ${fx.n} 張牌`;
    case 'recoverFromDiscard': return '從棄牌堆挑 1 張牌回到手上';
    case 'doubleNextAttack': return '本回合打出的下一張攻擊牌，傷害加倍';
    case 'endTurn': return '然後直接結束這回合';
    case 'noAttacksThisTurn': return '這回合不能再打攻擊牌';
    case 'immuneThisTurn': return '這回合魔物打不到你';
    case 'power': {
      const inner = fx.effects.map((e) => one(e, { inPower: true })).join('，');
      // 只限本回合的能力一定要講出來，不然玩家會當成永久的（2026-09-04 起沒有牌用 `thisTurn`，保留給日後）
      const scope = fx.thisTurn ? '這回合內，' : '';
      if (fx.trigger === 'afterCard') {
        const condition = fx.minQiSpent ? `花至少 ${fx.minQiSpent} 點蓄氣的` : '';
        return `${scope}${fx.oncePerTurn ? '每回合第一次' : '每次'}打出${condition}${fx.cardType ?? ''}牌後，${inner}`
          + (fx.sameNameMax ? '（同名取高）' : '');
      }
      if (fx.trigger === 'passive') return inner;
      // 「同名取高」每種觸發都要講（2026-09-23 稽核 引擎 低-2）：原本只有上面那一支有，
      // 絕學·藏鋒（每回合開始時）第二張會變灰，牌面卻沒交代為什麼
      return (fx.trigger === 'turnStart' ? `${scope}每回合開始時${inner}`
        : fx.trigger === 'onKill' ? `${scope}每打倒一隻魔物就${inner}`
          : `${scope}回合結束時，如果這回合沒打過攻擊牌，${inner}`)
        + (fx.sameNameMax ? '（同名取高）' : '');
    }
  }
}

/**
 * 升級版牌面跟沒升級版比起來，動了哪些地方。
 *
 * 玩家的原話：「才知道升級跟沒升級牌的差異」。升級大多只動一兩個數字（造成 6→9 點傷害），
 * 兩張牌並排看還是得逐字比對才找得出差在哪，所以直接把改掉的字標色。
 *
 * `changed`＝升級版文字裡跟原版不一樣的字元位置（標色用）。
 * `removed`＝升級後被拿掉的句子。有三張牌的升級**只是刪東西**（出大事了少掉自傷、踏雪無痕
 * 少掉消耗、催噎少掉那句括號），這種差異在升級版牌面上根本沒有位置可以標色，
 * 光看牌面完全看不出升級了什麼，所以另外撈出來給升級預覽掛在標籤上講。
 *
 * 兩者都用最長共同子序列對齊兩段文字算出來：沒對到的字，在升級版那側就是新增或改動、
 * 在原版那側就是被拿掉的。牌面文字最長六十來字，這個對齊算得很快。
 */
export interface UpgradeDiff {
  changed: ReadonlySet<number>;
  removed: readonly string[];
}

const EMPTY_DIFF: UpgradeDiff = { changed: new Set(), removed: [] };
const diffCache = new Map<string, UpgradeDiff>();

/** 這張牌的文字會不會隨「這場打過幾次」變（只有分身術這種成長牌會）——決定快取要不要把次數算進去 */
function textVariesWithPlays(def: CardDef): boolean {
  const has = (fx: readonly Effect[] | undefined): boolean =>
    (fx ?? []).some((e) => e.kind === 'damageRamp' || (e.kind === 'status' && !!e.step));
  return has(def.effects) || has(def.upgrade.effects);
}

export function upgradeDiff(def: CardDef, plays = 0): UpgradeDiff {
  // 只有成長牌的文字會隨打出次數變，其他牌把次數放進 key 只會讓同一份結果存好幾份
  const key = textVariesWithPlays(def) ? `${def.id}|${plays}` : def.id;
  const hit = diffCache.get(key);
  if (hit) return hit;
  const base = describeCard(def, false, plays);
  const up = describeCard(def, true, plays);
  if (base === up) { diffCache.set(key, EMPTY_DIFF); return EMPTY_DIFF; }

  const n = base.length;
  const m = up.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = base[i] === up[j]
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const changed = new Set<number>();
  const dropped: number[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base[i] === up[j]) { i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { dropped.push(i); i++; }
    else { changed.add(j); j++; }
  }
  for (; i < n; i++) dropped.push(i);
  for (; j < m; j++) changed.add(j);

  // 數字整串一起標：15→25 只有十位變，逐字比對會標成「[2]5」，
  // 一個數字半紅半黑很難讀，所以只要某一位變了就整串都算改過。
  for (let a = 0; a < m; a++) {
    if (!/\d/.test(up[a] ?? '')) continue;
    let b = a;
    while (b + 1 < m && /\d/.test(up[b + 1] ?? '')) b++;
    let hitDigit = false;
    for (let k = a; k <= b; k++) if (changed.has(k)) { hitDigit = true; break; }
    if (hitDigit) for (let k = a; k <= b; k++) changed.add(k);
    a = b;
  }

  const diff: UpgradeDiff = { changed, removed: removedPhrases(base, dropped) };
  diffCache.set(key, diff);
  return diff;
}

/** 升級版牌面文字裡「跟沒升級不一樣」的字元位置（標色用） */
export function upgradedChangedChars(def: CardDef, plays = 0): ReadonlySet<number> {
  return upgradeDiff(def, plays).changed;
}

/**
 * 把「原版有、升級版沒有」的字元位置串成人看得懂的句子。
 *
 * 逐字比對出來的位置常常是零散的（對齊時中間夾了幾個共用字），所以只留連續三字以上的整段，
 * 再把兩端的標點與連接詞修掉——「，自己獲得 1 層翻肚」要變成「自己獲得 1 層翻肚」才唸得順。
 * 修完剩不到兩個字的（只是標點差異）就丟掉，不然標籤上會冒出「。」這種沒意義的東西。
 */
function removedPhrases(base: string, dropped: readonly number[]): string[] {
  const out: string[] = [];
  let k = 0;
  while (k < dropped.length) {
    let e = k;
    while (e + 1 < dropped.length && dropped[e + 1] === dropped[e]! + 1) e++;
    const from = dropped[k]!;
    const to = dropped[e]! + 1;
    if (to - from >= 3) {
      const phrase = base.slice(from, to).replace(/^[，。；、（）\s]+/, '').replace(/[，。；、（）\s]+$/, '');
      if (phrase.length >= 2) out.push(phrase);
    }
    k = e + 1;
  }
  return out;
}

/** 牌面規則文字，措辭照規格 §6.1 的牌表 */
export function describeCard(def: CardDef, upgraded: boolean, plays = 0): string {
  const effects = upgraded ? (def.upgrade.effects ?? def.effects) : def.effects;
  const keywords = upgraded ? (def.upgrade.keywords ?? def.keywords ?? []) : (def.keywords ?? []);
  const parts: string[] = [];
  if (keywords.includes('不可打出')) parts.push('不能打出。');
  // 打得出來卻什麼都不做的牌（黏液）：規則就是「花那點飽足把它丟掉」，要講清楚，
  // 不然牌面只剩一句「消耗。」，玩家會以為漏了什麼
  if (!effects.length && !keywords.includes('不可打出')) parts.push('打出去什麼事都不會發生。');
  if (effects.length) {
    const youHeal = touchesFoes(effects);
    const alsoHurts = hurtsFoes(effects);
    let text = '';
    for (let i = 0; i < effects.length; i++) {
      const fx = effects[i];
      if (!fx) continue;
      const prev = effects[i - 1];
      text += (prev ? sep(prev, fx) : '') + one(fx, { prev, youHeal, alsoHurts, plays });
    }
    // 這裡曾經按牌號補一句玩笑話（變身術的「（變成飯糰）」）。拿掉了：飯糰是飽足的單位，
    // 玩家看到「獲得 9 點蜷縮（變成飯糰）」會以為那張牌還附送一顆飯糰，真的有人這樣問過。
    // 牌面只講規則，玩笑話交給圖去講。
    parts.push(text + '。');
    /*
     * **一張牌只講一次「一個人玩的時候怎麼算」**（2026-09-16）。
     *
     * 原本每個連線效果各自帶一個括號，一張牌最多重複四次——最長那張 88 個字，
     * 而 `cardview.ts` 的設計基準是 42 字（超過就自動縮字級，88 字會縮到最小、讀不下去）。
     * 這句話是整張牌共用的規矩，不是某一個效果的細節，所以搬到句尾講一次。
     * `energyTransfer`、`watchAllyPlay`、`watchPoisonHit` 不在名單裡：它們一個人玩時是
     * **另一種行為**（不發生／改成看自己出牌／自己出手也算），各自的句子裡有交代。
     * 句子本身也壓短了：舊括號 14 字、第一版總結 18 字，一張牌只有一個連線效果時反而變長
     *（推前審查 2026-09-16 中-1 量到超過 42 字的從 23 條變 24 條）。現在是 14 字。
     */
    if (effects.some((f) => f && hasAlly(f))) parts.push('一個人玩時「同伴」＝你自己。');
  }
  if (def.curse?.onTurnEnd) parts.push(`回合結束時還在手上的話，受 ${def.curse.onTurnEnd} 點傷害。`);
  if (def.curse?.onTurnStart) parts.push(`每回合開始時還在手上的話，受 ${def.curse.onTurnStart} 點傷害。`);
  if (def.curse?.onDraw) parts.push('抽到的時候會少 1 顆飯糰。');
  if (keywords.includes('消耗')) parts.push('消耗。');
  if (keywords.includes('保留')) parts.push('保留。');
  if (keywords.includes('虛幻')) parts.push('回合結束還在手上就消失。');
  if (def.note) parts.push(def.note);   // 來歷放最後：規則講完才講故事
  return parts.join('');
}
