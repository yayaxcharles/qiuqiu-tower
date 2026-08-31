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
export const TURN_DECAY: readonly StatusName[] = ['翻肚', '懶洋洋', '炸毛'];

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
  | { kind: 'summon'; enemyId: string; n: number }
  | { kind: 'chargeNext' }
  | { kind: 'escape' }
  | { kind: 'nothing' };
export interface EnemyMove { intent: Intent; label: string; effects: EnemyEffect[] }
export type EnemyPool = '弱' | '中' | '強' | '大魔物' | '塔主' | '召喚';
export interface EnemyPhase {
  hpBelow: number;
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
  strengthEveryNTurns?: number;
  phases?: EnemyPhase[];
}
export interface EncounterDef { id: string; pool: EnemyPool; enemies: string[] }

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
export interface EventChoice { label: string; costFish?: number; outcome: RunEffect[]; result: string }
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
  nextUid: number;
  stats: { kills: number; turns: number; cardsPlayed: number };
  removeCost: number;
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
  stolenFish: number;       // 山賊偷走的，擊倒牠全部拿回
  fishDelta: number;        // 牌效果賺到的小魚乾
  kills: number;
  cardsPlayed: number;
  nextEnemyUid: number;
}
