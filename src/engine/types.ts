import type { Rng, RngState } from './rng';

// ===== 牌 =====
export type CardType = '攻擊' | '技能' | '能力';
export type Rarity = '常見' | '罕見' | '稀有';
export type Pool = '起手' | '忍術' | '絕學' | '壞毛病';
/** 虛幻＝回合結束時還留在手上就直接消失，不進棄牌堆（魔物塞給你的「眼冒金星」用） */
export type Keyword = '消耗' | '保留' | '不可打出' | '虛幻';
export type TargetMode = 'enemy' | 'all' | 'self' | 'none';

/**
 * 後面五個（縮殼、飛行、鱗甲、沉睡、消散）是 2026-09-02 第二波魔物帶進來的，
 * 「虛化」是 2026-09-03 菁英擴充帶進來的，
 * **只會出現在魔物身上**，而且各自有自己的衰減規則（見 combat.ts 的魔物迴圈與 actions.ts 的 damageEnemy），
 * 所以刻意不放進 `TURN_DECAY`——通用的「回合結束 −1」不管它們。
 */
export type StatusName =
  | '爪力' | '貓步' | '翻肚' | '懶洋洋' | '炸毛' | '噎到' | '隱身' | '定身' | '反彈' | '潛水'
  | '縮殼' | '飛行' | '鱗甲' | '沉睡' | '消散' | '虛化';
export const DEBUFFS: readonly StatusName[] = ['翻肚', '懶洋洋', '炸毛', '噎到', '定身'];   // 溫牛奶、返璞「清掉所有減益」含定身（審查 #16）
/** 回合結束層數 −1 的狀態 */
// 定身也走回合衰減：魔物在牠的回合丟上來、你下一個回合攻擊牌全鎖、回合結束消掉。
// （魔物身上的定身不走這條——那邊是「出招時消耗」，在 endTurn 的攻擊判定裡處理）
export const TURN_DECAY: readonly StatusName[] = ['翻肚', '懶洋洋', '炸毛', '定身'];

export type PowerTrigger = 'turnStart' | 'onKill' | 'turnEndNoAttack';

export type Effect =
  | { kind: 'damage'; amount: number; times?: number; ignoreBlock?: boolean; scaleWithCombo?: boolean; comboCap?: number; target?: 'enemy' | 'all' }
  /** 分身術（2026-09-03）：造成 amount 點傷害；這場戰鬥裡同一張牌每打出一次，之後的傷害就多 step 點（看 CombatState.cardPlays） */
  | { kind: 'damageRamp'; amount: number; step: number }
  | { kind: 'damageRandom'; min: number; max: number }
  | { kind: 'damageEqualBlock' }
  | { kind: 'selfDamage'; amount: number }
  | { kind: 'block'; amount: number }
  | { kind: 'stealBlock' }
  | { kind: 'draw'; n: number }
  | { kind: 'drawIfTargetStatus'; name: StatusName; n: number }
  | { kind: 'drawNextTurn'; n: number }
  | { kind: 'status'; name: StatusName; amount: number; target: 'self' | 'enemy' | 'all' }
  /** `max`＝每種最多拆幾點（防禦也照這個數）。不填＝整個拆光（封口術本來全拆，使用者 2026-09-02：太強，改最多 5） */
  | { kind: 'removeStatuses'; names: StatusName[]; removeBlock?: boolean; max?: number }
  | { kind: 'transferDebuffs' }
  /** 清掉自己身上所有減益。跟 `transferDebuffs` 的差別是「丟掉」不是「丟給別人」 */
  | { kind: 'cleanse' }
  | { kind: 'energy'; n: number }
  | { kind: 'heal'; n: number }
  | { kind: 'gold'; n: number; onKill?: boolean }
  | { kind: 'scry'; n: number }
  | { kind: 'exhaustFromHand'; n: number }
  | { kind: 'retainFromHand'; n: number }
  | { kind: 'discardFromHand'; n: number }
  | { kind: 'recoverFromDiscard' }
  | { kind: 'doubleNextAttack' }
  | { kind: 'endTurn' }
  | { kind: 'noAttacksThisTurn' }
  | { kind: 'immuneThisTurn' }
  /** `thisTurn` ＝這個能力只在本回合有效，回合結束就消失（例如「吸貓大法」） */
  | { kind: 'power'; trigger: PowerTrigger; effects: Effect[]; thisTurn?: true };

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  type: CardType;
  rarity: Rarity;
  pool: Pool;
  target: TargetMode;
  effects: Effect[];
  keywords?: Keyword[];
  /** 貼圖位置：'ninja/10'＝忍者第 10 張、'daxia/05'＝大俠第 5 張、'codex/curl'＝Codex 生圖 */
  art: string;
  /** 升級版覆蓋的欄位；effects 給就整組取代 */
  upgrade: { cost?: number; effects?: Effect[]; keywords?: Keyword[] };
  /** 壞毛病副作用 */
  curse?: { onTurnEnd?: number; onTurnStart?: number; onDraw?: 'loseEnergy' };
  /**
   * 戰鬥雜牌：只有魔物在戰鬥中塞得進來（黏液、眼冒金星），
   * 不會出現在事件、獎勵與圖鑑的壞毛病清單裡。戰鬥本來就用牌組的副本，戰鬥結束自然消失。
   */
  combatOnly?: boolean;
}

export interface CardInstance { uid: number; cardId: string; upgraded: boolean }

// ===== 秘寶、忍具 =====
export type RelicPool = '起始' | '常見' | '大魔物' | '塔主';
export interface RelicDef {
  id: string;
  name: string;
  pool: RelicPool;
  text: string;
  art: string;
  /** 罐頭鋪售價。不填＝150。強弱要有價差（使用者指定），數字標在各件定義上 */
  price?: number;
  hooks: {
    /** 忍具多帶幾支（忍具袋） */
    potionSlots?: number;
    /** 每次獲得隱身都多幾層（影披風；紙袋的 stealthBonus 是每回合第一次） */
    stealthBonusEvery?: number;
    /** 每場戰鬥第一張牌少花幾顆飯糰（破卷軸；毛線球的 firstCardDiscount 是每回合） */
    firstCardDiscountCombat?: number;
    /** 每場戰鬥第一張攻擊牌傷害加倍（秘笈） */
    firstAttackDouble?: boolean;
    firstTurnDraw?: number;
    firstTurnEnergy?: number;
    maxHp?: number;
    restMultiplier?: number;
    combatStart?: Effect[];
    winGold?: number;
    turnEndNoAttack?: Effect[];
    preventLethal?: boolean;
    firstCardDiscount?: number;
    drawOnNthCard?: { n: number; draw: number };
    stealthBonus?: number;
    energyPerTurn?: number;
    // ---- 2026-09-02 秘寶擴充到 60 件加的掛鉤（各自接在引擎哪裡見 combat.ts／actions.ts／run.ts 的註解）----
    /** 使用忍具之後 */
    onPotionUse?: Effect[];
    /** 打出攻擊牌之後：chance＝機率（不填＝必定）、firstEachTurn＝每回合只算第一張 */
    onAttackPlayed?: { effects: Effect[]; chance?: number; firstEachTurn?: boolean };
    /** 被魔物打掉血時（每回合最多一次） */
    onHit?: Effect[];
    killHeal?: number; killStrength?: number; killFish?: number;
    /** 打贏一場回幾點 */
    combatEndHeal?: number;
    /** 罐頭鋪價格倍率（0.9＝九折） */
    shopDiscount?: number;
    /** 打盹額外回幾點；打盹後下一場開戰帶幾點蜷縮 */
    restFlat?: number; restNextFightBlock?: number;
    energyOnNthCard?: { n: number; energy: number };
    /** 每回合開始時 */
    turnStart?: Effect[];
    /** 回合結束最多留幾點蜷縮到下一回合 */
    blockKeep?: number;
    /** 戰鬥獎勵的牌多幾張可選 */
    rewardChoices?: number;
  };
}

export interface PotionDef {
  id: string;
  name: string;
  text: string;
  art: string;
  /** 罐頭鋪售價。不填＝45。 */
  price?: number;
  target: 'enemy' | 'all' | 'self';
  effects: Effect[];
}

// ===== 魔物 =====
export type Intent = 'attack' | 'block' | 'buff' | 'debuff' | 'special' | 'summon' | 'idle';
export type EnemyEffect =
  /** `pierce`＝穿透：無視蜷縮直接扣血（隱身照樣閃得掉、反彈照樣回敬）。師父的穿心掌、亡命一擊用 */
  | { kind: 'damage'; amount: number; times?: number; pierce?: true }
  | { kind: 'damageRandom'; min: number; max: number }
  | { kind: 'block'; amount: number }
  | { kind: 'statusSelf'; name: StatusName; amount: number }
  | { kind: 'statusPlayer'; name: StatusName; amount: number }
  | { kind: 'heal'; n: number }
  | { kind: 'stealFish'; n: number }
  | { kind: 'discardRandomHand'; n: number }
  | { kind: 'summon'; enemyId: string; n: number; max?: number }   // max＝同種活著的上限，補召不爆量
  | { kind: 'purgePlayer'; names: StatusName[] }   // 破功：把玩家這些狀態各拍掉一半（向下取整保留）
  | { kind: 'stripPlayer'; names: StatusName[] }   // 看破：把玩家這些狀態整個拍掉（隱身、潛水——先囤好的閃避全沒）
  | { kind: 'chargeNext' }
  | { kind: 'escape' }
  // ---- 2026-09-02 第二波魔物 ----
  /** 自爆：先照 amount 打球球（吃蜷縮、隱身照閃），然後牠自己倒下（算打倒） */
  | { kind: 'selfDestruct'; amount: number }
  /** 鼓舞：場上所有活著的魔物（含自己）獲得狀態 */
  | { kind: 'statusAllies'; name: StatusName; amount: number }
  /** 盾陣：場上所有活著的魔物（含自己）獲得防禦 */
  | { kind: 'blockAllies'; amount: number }
  /** 塞牌：把 n 張雜牌塞進球球的棄牌堆，或洗進抽牌堆的隨機位置 */
  | { kind: 'giveCard'; cardId: string; n: number; to: 'discard' | 'draw' }
  | { kind: 'nothing' };
export interface EnemyMove { intent: Intent; label: string; effects: EnemyEffect[] }
export type EnemyPool = '弱' | '中' | '強' | '大魔物' | '塔主' | '召喚';
export interface EnemyPhase {
  /** 門檻式變身：血打到 ≤ 此值就進這個階段（貓又、橘皮大王用）。跟 hpBar 二選一。 */
  hpBelow?: number;
  /**
   * 血條式變身（師父用）：上一條血打完不算死，改成蹲下調息、無敵一回合，
   * 然後亮出這一條新血（hp 與 maxHp 都換成這個值）。
   */
  hpBar?: number;
  onEnter: EnemyEffect[];
  line?: string;
  pattern: 'cycle' | 'random';
  moves: EnemyMove[];
  strengthPerTurn?: number;
  /**
   * 每回合開始先震散玩家這些狀態各幾點（師父二、三階段用：1／1、2／2），
   * 讓爪力、貓步堆不到無限（使用者 2026-09-02 的設計）。紀錄寫「<名字>震散了你 N 點爪力、N 點貓步」。
   */
  drainPlayerPerTurn?: Partial<Record<StatusName, number>>;
}
export interface EnemyDef {
  id: string;
  name: string;
  hp: [number, number];
  pool: EnemyPool;
  pattern: 'cycle' | 'random';
  moves: EnemyMove[];
  line: string;
  /** 開場台詞的其他版本：戰鬥開始時從 line 與 lines 裡挑一句（2026-09-02 使用者：「出場台詞做幾個不同的隨機」） */
  lines?: string[];
  art: string;
  size: 'small' | 'medium' | 'large';
  onDeathHealPlayer?: number;
  /**
   * 「一起死才算數」：同一個 `reviveGroup` 的怪，只要還有同伴活著，
   * 倒下的那隻會在下一個回合開始時爬起來（回到 `reviveHp` 的血量）。
   * 要一次把整組清光才打得完。
   */
  reviveGroup?: string;
  reviveHp?: number;
  /** 在同一組裡只當「錨」：牠活著同伴會爬起來，牠自己倒了就不會（蛙大名） */
  neverRevive?: boolean;
  /** 倒下幾個回合後才爬起來。不填＝2（躺一個完整回合，玩家有時間把同伴清掉；2026-09-03 從 1 改成 2）。 */
  reviveDelay?: number;
  strengthEveryNTurns?: number;
  /**
   * 僕從護體：場上還有**任何同伴**站著，這隻就完全不受傷（波斯大小姐用）。
   * 正解是先清光僕從。規則照「隱藏機制全部掛牌可見」的原則在畫面上掛牌子。
   */
  guardedByAllies?: boolean;
  /**
   * 照表出招：回傳第 `turn` 回合（1 起算）要出的招；回傳 undefined 就照 pattern 走。
   * `moves` 是當下階段的招式表（進了階段就是階段的表）。
   * 貓又婆婆用：召喚要有固定節奏（1 召、4 準備、5 召、9 準備、10 召……），
   * cycle/random 都表達不了「每五回合一組、前一回合先預告」。
   */
  chooseMove?: (turn: number, moves: EnemyMove[]) => EnemyMove | undefined;
  phases?: EnemyPhase[];

  // ===== 2026-09-02 第二波魔物的被動（畫面上都掛牌子，見 ui/screens/combat.ts 的 enemyUnit）=====
  /**
   * 分裂：血量掉到最大值 × `below` 以下時，本體消失（**不算打倒**、不掉戰利品），
   * 原地冒出 `n` 隻 `enemyId`，每隻的血量＝本體剩下的血。一場只會發生一次。
   */
  splitInto?: { enemyId: string; n: number; below: number };
  /** 詛咒：玩家每打出一張**技能**牌，就把 n 張 `cardId` 洗進玩家的抽牌堆 */
  hexOnSkill?: { cardId: string; n: number };
  /** 憤怒：玩家每打出一張**技能**牌，牠就 +N 爪力 */
  angerOnSkill?: number;
  /** 被打醒時跑的效果（配「沉睡」用；自然睡飽醒來不算——那不會生氣） */
  onWake?: EnemyEffect[];
  /** 開戰帶飛行 N；每個牠的回合開始補回 N */
  flying?: number;
  /** 開戰帶鱗甲 N */
  plating?: number;
  /** 開戰帶縮殼 N */
  curlUp?: number;
  /** 開戰帶沉睡 N */
  asleep?: number;
  /** 開戰帶消散 N */
  fadeAfter?: number;

  // ===== 2026-09-03 菁英擴充（docs/菁英擴充_設計稿.md）=====
  /**
   * 虛化：開戰就帶「虛化」，之後**每個牠的回合開始切換一次**（有→拿掉、沒有→掛上），
   * 所以是虛一回合、實一回合。虛化中每一段傷害最多只扣 1 點血（攻擊、噎到、反彈都一樣），
   * 防禦照原本的量擋掉。切換寫在 combat.ts 的魔物迴圈、扣血上限寫在 actions.ts 的 damageEnemy。
   */
  phasing?: true;
  /**
   * 開戰帶反彈 N，整場不消失（紙老虎用）。
   * 既有魔物的反彈都是靠招式現場疊（刺蝟師傅的豎刺），開戰就要有的走這個欄位——
   * 跟飛行／鱗甲／縮殼那幾個開戰被動同一套做法，在 makeEnemy 掛上去。
   */
  thorns?: number;
}
export interface EncounterDef {
  id: string;
  pool: EnemyPool;
  enemies: string[];
  /**
   * 這一場的成員血量倍率（不動魔物本身的定義）。
   * 兩隻全規格怪同場的強遭遇用 0.8：單獨出場照舊、組隊出場各減兩成
   * （2026-09-01 實測那幾組對 17 張牌的勝率 0～18%，使用者拍板減血 20%）。
   */
  hpScale?: number;
  /**
   * 這場遭遇只在哪幾關出現（不填＝每一關都行）。
   * 三關制的專屬池：第一關的怪標 [1]、塔中標 [2]、塔頂標 [3]。
   */
  acts?: number[];
  /**
   * 魔氣：這場遭遇的成員出場就帶幾點爪力（塔頂精英用）。走正常的爪力狀態，
   * 魔物頭上會掛爪力牌子、意圖數字也算進去，不是暗中加傷。
   */
  strength?: number;
}

// ===== 事件與整局效果 =====
export type RunEffect =
  | { kind: 'heal'; n: number }
  | { kind: 'healPercent'; p: number }
  | { kind: 'damage'; n: number }
  | { kind: 'fish'; n: number }
  | { kind: 'fishHalve' }
  | { kind: 'maxHp'; n: number }
  | { kind: 'addCard'; cardId: string }
  | { kind: 'addRandomCard'; pool: Pool; rarity?: Rarity }
  | { kind: 'removeCard' }
  | { kind: 'upgradeCard' }
  | { kind: 'relic'; pool: RelicPool }
  | { kind: 'potions'; n: number }
  /** `bonusUpgrades`＝打贏後在獎勵畫面挑幾張牌升級（鏡子走廊用）。`encounterId` 若有 `_a<關數>` 的版本會自動換成該關的 */
  | { kind: 'fight'; encounterId: string; bonusFish: number; bonusUpgrades?: number }
  | { kind: 'chooseCard'; pool: Pool; n: number }
  | { kind: 'gamble'; p: number; win: RunEffect[]; lose: RunEffect[] };
/**
 * `resultArt`＝這個選項有自己的結果插圖時，圖檔的鍵（對應 `bg/event_<resultArt>`）。
 * 沒填就沿用事件本身的場景圖。選了之後畫面上如果只有文字換掉、圖一模一樣，
 * 玩家感覺不到「我剛剛做了一件事」。
 */
export interface EventChoice {
  label: string; costFish?: number; outcome: RunEffect[]; result: string; resultArt?: string;
}
export interface EventDef { id: string; title: string; text: string; choices: EventChoice[]; fixedFloor?: number }

// ===== 地圖 =====
export type NodeType = '戰鬥' | '大魔物' | '事件' | '罐頭鋪' | '貓窩' | '紙箱' | '塔主';
export interface MapNode {
  id: string;
  floor: number;
  lane: number;
  type: NodeType;
  next: string[];
  encounterId?: string;
  eventId?: string;
}
export interface GameMap { nodes: MapNode[]; start: string[] }

// ===== 整局 =====
export interface RunState {
  version: 1;
  seed: string;
  rng: RngState;
  hp: number;
  maxHp: number;
  fish: number;
  deck: CardInstance[];
  relics: string[];
  potions: string[];
  floor: number;
  map: GameMap;
  currentNode: string | null;
  /** 這一關實際走過的節點足跡（依序）。畫地圖時「走過的路亮、沒走過的暗」靠這條；換關清空。 */
  trail: string[];
  nextUid: number;
  stats: { kills: number; turns: number; cardsPlayed: number };
  removeCost: number;
  /** 第幾關（1＝塔下、2＝塔中、3＝塔頂）。舊存檔沒有這欄，載入時補成 1。 */
  act: number;
  /** 難度 1～5（見 content/difficulty.ts）。舊存檔沒有這欄，載入時補成 1。 */
  difficulty?: number;
  status: 'playing' | 'won' | 'lost';
  /** 暖毯：打盹後下一場開戰帶的蜷縮，開戰用掉就歸零 */
  restBlock?: number;
  /** 一次性旗標（看過哪段對話、觸發過哪個事件之類）；舊存檔沒有這欄，載入時補成 {} */
  flags: Record<string, boolean>;
  /**
   * 稀有牌保底：連續幾次戰鬥獎勵沒開出稀有牌（每次 +1，開出就歸零）。
   * 每一點讓下一次的稀有權重多 4——連續槓龜的手氣會自己回來。舊存檔沒有這欄，當 0。
   */
  rarePity?: number;
}

// ===== 戰鬥 =====
export interface Unit { hp: number; maxHp: number; block: number; statuses: Partial<Record<StatusName, number>> }
export interface PlayerCombat extends Unit {
  /** 被打掉血的秘寶效果（onHit）這回合已經觸發過：記回合數 */
  hitRelicTurn?: number;
  /** 這場戰鬥打過第一張牌了（破卷軸用） */
  firstCardEver?: boolean;
  /** 秘笈：這場第一張攻擊牌加倍，打出去就消掉 */
  firstAttackDouble?: boolean;
  energy: number;
  maxEnergy: number;
  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  retained: number[];
  /** 掛在球球身上的能力；`cardId` 記來源牌，戰鬥畫面用它掛「這是哪張牌的效果」的牌子（使用者 2026-09-03） */
  powers: { trigger: PowerTrigger; effects: Effect[]; thisTurn?: true; cardId?: string }[];
  doubleNext: number;
  drawNextTurn: number;
  noAttacks: boolean;
  immune: boolean;
  attackedThisTurn: boolean;
  cardsPlayedThisTurn: number;
  firstStealthGiven: boolean;
  firstCardPlayed: boolean;
  lethalPrevented: boolean;
  /** 這回合球球自己給自己的減益：本回合結束不衰減，下一回合結束才開始減 */
  freshDebuffs: Partial<Record<StatusName, number>>;
}
export interface EnemyCombat extends Unit {
  uid: number;
  enemyId: string;
  name: string;
  /** 這一場實際講的開場台詞（從 EnemyDef.line／lines 挑出來的） */
  line?: string;
  moveIndex: number;
  turnCount: number;
  phase: number;
  charged: boolean;
  /** 「重生中」倒數：倒下時由 reviveDelay 設定，每回合結束減一，歸零爬起來。0＝沒在重生。 */
  reviveIn: number;
  /** 無敵倒數（血條式變身的蹲下回合）：>0 時任何傷害都不吃 */
  invulnIn: number;
  move: EnemyMove;
  dead: boolean;
  escaped: boolean;   // 逃走：不算擊倒、偷走的小魚乾不退（消散、分裂也走這條）
  stolen: number;     // 這隻偷走的小魚乾，擊倒牠時退回
  /** 分裂過了：一場只裂一次（見 EnemyDef.splitInto） */
  split?: boolean;
}
export interface EffectCtx {
  targetUid?: number;
  cardUid?: number;
  cardId?: string;         // 打出的是哪張牌（能力牌掛牌子用）
  cardType?: CardType;
  source?: 'card' | 'potion' | 'relic' | 'power';
  combo?: number;          // 這張牌之前本回合已打出的牌數
  doubleDamage?: boolean;  // 蓄力：這張攻擊牌的傷害加倍
  killed?: boolean;        // 這張牌的傷害有沒有擊倒魔物（順手牽羊用）
}
export interface PendingChoice {
  kind: 'chooseCards';
  from: 'hand' | 'discard' | 'scry';
  purpose: 'exhaust' | 'retain' | 'discard' | 'recover' | 'scryDiscard';
  cards: CardInstance[];
  min: number;
  max: number;
  remaining: Effect[];
  ctx: EffectCtx;
}
export interface CombatState {
  /** 難度與遭遇給的血量倍率、出場爪力：召喚出來的也要套（審查 #9） */
  mods?: { hpMul: number; strength: number };
  rng: Rng;                 // 戰鬥不存檔，直接帶亂數物件
  player: PlayerCombat;
  enemies: EnemyCombat[];
  relics: string[];
  potions: string[];        // 從整局複製進來，用掉就移除，戰後寫回
  turn: number;
  phase: 'player' | 'won' | 'lost';
  /** 敵方回合正在逐隻出招（endTurn 的迴圈裡）；召喚要靠它分「敵方回合召的」與「玩家回合中途冒出來的」 */
  enemyActing?: boolean;
  /** 敵方回合排隊要行動的魔物 uid（beginEnemyTurn 排好、stepEnemyTurn 一隻一隻拿），畫面靠它逐隻演出 */
  enemyQueue?: number[];
  /** 這場戰鬥裡每張牌（uid）已打出的次數：分身術疊傷害用；每場戰鬥重新算 */
  cardPlays?: Record<number, number>;
  pending: PendingChoice | null;
  log: string[];
  encounterId: string;
  /**
   * 牌效果要求結束回合（撒手鐧、先睡了）。以前是效果裡直接呼叫 endTurn，
   * 敵方回合被壓縮在同一次重畫裡閃過，玩家看起來像「打完馬上又輪到我」。
   * 改成掛旗子，由呼叫端（畫面／機器人）用跟按鈕一樣的流程收尾。
   */
  endTurnRequested: boolean;
  stolenFish: number;       // 山賊偷走的，擊倒牠全部拿回
  fishDelta: number;        // 牌效果賺到的小魚乾
  kills: number;
  cardsPlayed: number;
  nextEnemyUid: number;
  /**
   * 魔物塞牌給球球（黏液、眼冒金星）時要發的下一個牌編號。
   * 從「牌組副本裡最大的編號 +1」起跳，才不會跟原本的牌撞號——
   * 撞號的話 `moveCard`／`retained` 那些靠 uid 找牌的地方會抓錯張。
   */
  nextCardUid: number;
}
