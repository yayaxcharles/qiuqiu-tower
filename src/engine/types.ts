import type { Rng, RngState } from './rng';

// ===== 牌 =====
export type CardType = '攻擊' | '技能' | '能力';
export type Rarity = '常見' | '罕見' | '稀有';
export type Pool = '起手' | '忍術' | '絕學' | '壞毛病';
export type Keyword = '消耗' | '保留' | '不可打出';
export type TargetMode = 'enemy' | 'all' | 'self' | 'none';

export type StatusName =
  | '爪力' | '貓步' | '翻肚' | '懶洋洋' | '炸毛' | '噎到' | '隱身' | '定身' | '反彈' | '潛水';
export const DEBUFFS: readonly StatusName[] = ['翻肚', '懶洋洋', '炸毛', '噎到'];
/** 回合結束層數 −1 的狀態 */
// 定身也走回合衰減：魔物在牠的回合丟上來、你下一個回合攻擊牌全鎖、回合結束消掉。
// （魔物身上的定身不走這條——那邊是「出招時消耗」，在 endTurn 的攻擊判定裡處理）
export const TURN_DECAY: readonly StatusName[] = ['翻肚', '懶洋洋', '炸毛', '定身'];

export type PowerTrigger = 'turnStart' | 'onKill' | 'turnEndNoAttack';

export type Effect =
  | { kind: 'damage'; amount: number; times?: number; ignoreBlock?: boolean; scaleWithCombo?: boolean; comboCap?: number; target?: 'enemy' | 'all' }
  | { kind: 'damageRandom'; min: number; max: number }
  | { kind: 'damageEqualBlock' }
  | { kind: 'selfDamage'; amount: number }
  | { kind: 'block'; amount: number }
  | { kind: 'stealBlock' }
  | { kind: 'draw'; n: number }
  | { kind: 'drawIfTargetStatus'; name: StatusName; n: number }
  | { kind: 'drawNextTurn'; n: number }
  | { kind: 'status'; name: StatusName; amount: number; target: 'self' | 'enemy' | 'all' }
  | { kind: 'removeStatuses'; names: StatusName[]; removeBlock?: boolean }
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
  | { kind: 'damage'; amount: number; times?: number }
  | { kind: 'damageRandom'; min: number; max: number }
  | { kind: 'block'; amount: number }
  | { kind: 'statusSelf'; name: StatusName; amount: number }
  | { kind: 'statusPlayer'; name: StatusName; amount: number }
  | { kind: 'heal'; n: number }
  | { kind: 'stealFish'; n: number }
  | { kind: 'discardRandomHand'; n: number }
  | { kind: 'summon'; enemyId: string; n: number; max?: number }   // max＝同種活著的上限，補召不爆量
  | { kind: 'purgePlayer'; names: StatusName[] }   // 破功：把玩家這些狀態各拍掉一半（向下取整保留）
  | { kind: 'chargeNext' }
  | { kind: 'escape' }
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
}
export interface EnemyDef {
  id: string;
  name: string;
  hp: [number, number];
  pool: EnemyPool;
  pattern: 'cycle' | 'random';
  moves: EnemyMove[];
  line: string;
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
  /** 倒下幾個回合後才爬起來。不填＝1（下一回合就起來，貓又的尾巴用這個）。 */
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
  | { kind: 'fight'; encounterId: string; bonusFish: number }
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
  status: 'playing' | 'won' | 'lost';
  /** 一次性旗標（看過哪段對話、觸發過哪個事件之類）；舊存檔沒有這欄，載入時補成 {} */
  flags: Record<string, boolean>;
}

// ===== 戰鬥 =====
export interface Unit { hp: number; maxHp: number; block: number; statuses: Partial<Record<StatusName, number>> }
export interface PlayerCombat extends Unit {
  energy: number;
  maxEnergy: number;
  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  retained: number[];
  powers: { trigger: PowerTrigger; effects: Effect[]; thisTurn?: true }[];
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
  escaped: boolean;   // 逃走：不算擊倒、偷走的小魚乾不退
  stolen: number;     // 這隻偷走的小魚乾，擊倒牠時退回
}
export interface EffectCtx {
  targetUid?: number;
  cardUid?: number;
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
  rng: Rng;                 // 戰鬥不存檔，直接帶亂數物件
  player: PlayerCombat;
  enemies: EnemyCombat[];
  relics: string[];
  potions: string[];        // 從整局複製進來，用掉就移除，戰後寫回
  turn: number;
  phase: 'player' | 'won' | 'lost';
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
}
