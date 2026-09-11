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
  | '縮殼' | '飛行' | '鱗甲' | '沉睡' | '消散' | '虛化' | '不壞身'
  | '鐵布衫';   // 2026-09-04：下回合開始換成等量蜷縮（跟潛水→隱身同型）
export const DEBUFFS: readonly StatusName[] = ['翻肚', '懶洋洋', '炸毛', '噎到', '定身'];   // 溫牛奶、返璞「清掉所有減益」含定身（審查 #16）
/** 回合結束層數 −1 的狀態 */
// 定身也走回合衰減：魔物在牠的回合丟上來、你下一個回合攻擊牌全鎖、回合結束消掉。
// （魔物身上的定身不走這條——那邊是「出招時消耗」，在 endTurn 的攻擊判定裡處理）
export const TURN_DECAY: readonly StatusName[] = ['翻肚', '懶洋洋', '炸毛', '定身'];

export type PowerTrigger = 'turnStart' | 'onKill' | 'turnEndNoAttack';

export type Effect =
  | { kind: 'damage'; amount: number; times?: number; ignoreBlock?: boolean; scaleWithCombo?: boolean; comboCap?: number; target?: 'enemy' | 'all'; ifTargetDebuffed?: boolean }
  /** 分身術（2026-09-03）：造成 amount 點傷害；這場戰鬥裡同一張牌每打出一次，之後的傷害就多 step 點（看 CombatState.cardPlays） */
  | { kind: 'damageRamp'; amount: number; step: number }
  | { kind: 'damageRandom'; min: number; max: number }
  /**
   * 貓爪雷：每一下**各自隨機挑一隻活著的**打（不是全體、也不是指定一隻）。
   * 跟 `damage` 的 `times` 不同——那是同一隻連打幾下。單隻場面等於集中火力，多隻場面就打散。
   */
  | { kind: 'damageScatter'; amount: number; times: number }
  /**
   * 先手香：**直接跳過魔物這一回合的行動**。牠們的預告留著（下回合照樣會出那一招），
   * 只是這一輪不動手。跟定身的差別：定身是掛在單一隻身上、會消耗層數；這個是整場一次。
   */
  | { kind: 'skipEnemyTurn' }
  | { kind: 'damageEqualBlock' }
  | { kind: 'selfDamage'; amount: number }
  | { kind: 'block'; amount: number }
  /*
   * ===== 幫隊友的三招（連線版 2026-09-11）=====
   *
   * 抄二代的四張連線專用牌裡做得出來的三張（Rally／Coordinate／Intercept；
   * 第四張 Tag Team 是「你的攻擊由隊友再打一次」，要重播別人的出牌，先不做）。
   *
   * **一個人玩的時候它們不會消失，而是退化成只作用在自己身上**——
   * 不做成「單機不出現」是刻意的：那會讓牌池隨人數改變，
   * 同一顆種子在單機與雙人開出來的東西就不一樣，鎖步的種子對照就沒得比了。
   * 退化的規則寫在各自的效果裡。
   */
  /** 分你一半：**每一位**（含自己）各獲得 amount 點蜷縮。一個人時就只有自己拿到 */
  | { kind: 'blockAll'; amount: number }
  /** 幫你一把：給**同伴**掛一個狀態（隱身會走 `gainStealth`，吃收禮那一方的秘寶加成）。一個人時退化成掛在自己身上 */
  | { kind: 'statusAlly'; name: StatusName; amount: number }
  /** 你拿去擋：把蜷縮**整份給同伴**（照他自己的貓步算）。一個人時退化成給自己 */
  | { kind: 'blockAlly'; amount: number }
  /** 你也抽一張：**同伴**抽牌。一個人時退化成自己抽 */
  | { kind: 'drawAlly'; n: number }
  /** 我幫你拍掉：清掉**同伴**身上的減益。一個人時退化成清自己的 */
  | { kind: 'cleanseAlly' }
  /** 飯糰分你：**同伴**這回合多幾顆飯糰。一個人時退化成給自己 */
  | { kind: 'energyAlly'; n: number }
  /**
   * 我來擋：這一輪魔物的攻擊**全部打我**。
   *
   * 規則二本來是「一招隨機挑一位還站著的打」，這張把隨機關掉、全部導向自己。
   * 一個人時等於什麼都沒做（本來就只會打你），所以牌面會少一半價值——
   * 這是可接受的：連線專用牌在單機本來就不該是好牌。
   */
  | { kind: 'taunt' }
  | { kind: 'stealBlock' }
  | { kind: 'draw'; n: number }
  | { kind: 'drawIfTargetStatus'; name: StatusName; n: number }
  | { kind: 'drawNextTurn'; n: number }
  | { kind: 'status'; name: StatusName; amount: number; target: 'self' | 'enemy' | 'all' }
  /** `max`＝每種最多拆幾點（防禦也照這個數）。不填＝整個拆光（封口術本來全拆，使用者 2026-09-02：太強，改最多 5） */
  | { kind: 'removeStatuses'; names: StatusName[]; removeBlock?: boolean; max?: number }
  /** 催噎：目標身上這個狀態翻倍（沒有就沒事），再加 add 層 */
  | { kind: 'doubleStatus'; name: StatusName; add?: number }
  | { kind: 'transferDebuffs' }
  /** 清掉自己身上所有減益。跟 `transferDebuffs` 的差別是「丟掉」不是「丟給別人」 */
  | { kind: 'cleanse'; max?: number }
  | { kind: 'energy'; n: number; onKill?: boolean }
  | { kind: 'heal'; n: number; percent?: number }   // `percent`＝改成回最大生命的百分之幾（起死回生丹），有它就不看 `n`
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
  /** `thisTurn` ＝這個能力只在本回合有效，回合結束就消失（2026-09-04 起沒有牌在用；吸貓大法基礎版改成整場有效） */
  | { kind: 'power'; trigger: PowerTrigger; effects: Effect[]; thisTurn?: true };

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  type: CardType;
  rarity: Rarity;
  pool: Pool;
  /** 職業獨占：沒寫＝兩個職業共用；'ninja' 的隱身潛水那批武士拿不到（見 engine/hero） */
  hero?: 'ninja' | 'samurai';
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
  /** 牌面插圖還沒到齊：不進獎勵、罐頭鋪、事件、圖鑑；圖接入後由生圖腳本拿掉 */
  hidden?: true;
  /**
   * 連線專用牌：**只有兩個人以上的局才會進獎勵與罐頭鋪的池子**
   *（使用者 2026-09-11 指定）。
   *
   * 一開始我把它們做成「單機也抽得到、只是退化成作用在自己身上」，理由是
   * 「牌池隨人數改變的話，同一顆種子在單機與雙人開出來的東西就不一樣」——
   * **那個顧慮是想錯的**：鎖步要求的是「同一局的兩台機器算出一樣的結果」，
   * 而兩邊都知道人數，池子自然一樣，不可能分岔。單機跟雙人本來就是兩種局，
   * 種子沒有互相對照的必要。
   *
   * 效果本身仍然保留「一個人時退化」的行為，因為牌可能從事件、
   * 或是從別人分享的局面碼流進單機的牌組裡，那時候不能變成一張廢牌。
   */
  coop?: true;
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
  /**
   * 用得出來的條件（起死回生丹：生命低於三成才准用）。
   * 不填＝隨時可用。**引擎與畫面共用這一支**：引擎在 `usePotion` 擋、畫面拿它把格子變灰並寫原因，
   * 兩邊各寫一套遲早會走鐘（罐頭鋪的「買不起」就踩過）。
   */
  usable?: { check: (hp: number, maxHp: number) => boolean; reason: string };
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
  // `percent`＝回**牠自己**最大生命的百分之幾（跟玩家那邊的 `Effect.heal` 同口徑）。
  // 鏡貓學牌會把玩家的 heal 原樣搬過來（`mimic.ts`），那邊帶了 percent 這裡沒有的話，
  // 學到的牌會回 0 血；而且展開語法塞進去的多餘屬性不吃型別檢查，tsc 不會擋（稽核 2026-09-11 中-1）
  | { kind: 'heal'; n: number; percent?: number }
  | { kind: 'stealFish'; n: number }
  | { kind: 'discardRandomHand'; n: number }
  | { kind: 'summon'; enemyId: string; n: number; max?: number; noPour?: true }   // max＝同種活著的上限，補召不爆量；noPour＝滿了就不做事（不走「灌血給最弱那隻」的通則）
  | { kind: 'purgePlayer'; names: StatusName[] }   // 破功：把玩家這些狀態各拍掉一半（向下取整保留）
  /** 照著學（鏡中球球）：把玩家這些狀態的層數抄過來（只抄比自己高的，不會愈抄愈少） */
  | { kind: 'copyPlayerStatus'; names: StatusName[] }
  | { kind: 'stripPlayer'; names: StatusName[] }   // 看破：把玩家這些狀態拍掉一半（2026-09-03 起，跟破功同一套算法）（隱身、潛水——先囤好的閃避全沒）
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
export interface EnemyMove {
  intent: Intent; label: string; effects: EnemyEffect[];
  /** 照著學的招（鏡中球球）：這一招是從球球牌組抄來的哪幾張牌（含升級旗標，亮牌面才會畫對版本），見 engine/mimic.ts */
  learned?: { cardId: string; upgraded: boolean }[];
}
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
  /** 換階段後的第一招固定是它：先掛在頭上讓玩家看到，牠的回合才做（貓又換階段放尾巴——原本寫在 onEnter 會在玩家回合中途憑空冒出尾巴，使用者 2026-09-03）。**只對 hpBelow 門檻式階段有效**；血條式（hpBar）換血條固定是「蹲下調息」，這欄會被忽略。 */
  onEnterMove?: EnemyMove;
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
  /**
   * 照著學（鏡中球球，2026-09-08）：招式不照 moves 走，每一動從球球這一局的牌組隨機抽牌翻成一招
   * （翻法見 engine/mimic.ts；一次抽幾張看遭遇的 learnCards）。moves 只在牌組裡沒半張學得會時當退路。
   */
  learnsPlayerCards?: true;
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
  /** 開戰帶飛行 N；打掉就不再補回（2026-09-11 改；舊版是每個牠的回合開始補回 N） */
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
  /**
   * 不壞身（2026-09-04 使用者指定的鐵羅漢特性）：每個牠的回合結束獲得 N 點防禦，
   * 而且牠的防禦**不會在敵方回合開始歸零**，會一路往上疊。不動手打就永遠打不穿。
   */
  ironBody?: number;
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
   * 伏兵（2026-09-04）：打到第 `turn` 回合的敵方回合，`enemyId` 從煙裡跳出 `n` 隻（`line`＝紀錄那一句）。
   * 援軍那一拍不出招（意圖先亮給玩家看），下回合才動。只掛在少數遭遇上；預設會跟著遭遇的血量倍率與魔氣放大，塔頂要用 hpScale／strength 壓回小怪的量級。
   */
  reinforce?: { turn: number; enemyId: string; n?: number; line?: string;
    /** 援軍的血量倍率與爪力：不填＝照這場遭遇的 hpScale／strength 放大（塔頂單怪戰是 1.6×＋8 爪力，會很痛，要小怪就填小一點） */
    hpScale?: number; strength?: number }[];
  /** 立繪還沒到齊：地圖抽不到（encountersOfPool 會濾掉）。第三波怪物用；立繪由 tools/make_wave3_monster_jobs.py 的工作檔生（背景腳本在 scratchpad art_wave3.sh），接完圖後把這個旗標拿掉 */
  hidden?: boolean;
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
  /** 照著學的魔物一動抽幾張牌（不填＝1）。鏡子走廊二、三關版是 2 */
  learnCards?: number;
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
  /**
   * 隨機交出一件身上的秘寶（換家的老鼠）。**起始秘寶不會被拿走**——那是開局就給的、
   * 拿走等於平白削弱一段開場，而且玩家沒有選它的機會。
   * 跟 `relic` 組合起來就是「交一件換兩件」，不必為那個事件另做一種效果。
   */
  | { kind: 'loseRelic' }
  | { kind: 'potions'; n: number }
  /** `bonusUpgrades`＝打贏後在獎勵畫面挑幾張牌升級（鏡子走廊用）。`encounterId` 若有 `_a<關數>` 的版本會自動換成該關的 */
  | { kind: 'fight'; encounterId: string; bonusFish: number; bonusUpgrades?: number }
  | { kind: 'chooseCard'; pool: Pool; n: number }
  | { kind: 'gamble'; p: number; win: RunEffect[]; lose: RunEffect[] }
  /** 在本局旗標上記一筆（事件前後集用：下一關的地圖生成時看旗標決定要不要排後集） */
  | { kind: 'flag'; name: string };
/**
 * `resultArt`＝這個選項有自己的結果插圖時，圖檔的鍵（對應 `bg/event_<resultArt>`）。
 * 沒填就沿用事件本身的場景圖。選了之後畫面上如果只有文字換掉、圖一模一樣，
 * 玩家感覺不到「我剛剛做了一件事」。
 */
export interface EventChoice {
  label: string; costFish?: number; outcome: RunEffect[]; result: string; resultArt?: string;
}
export interface EventDef {
  id: string; title: string; text: string; choices: EventChoice[]; fixedFloor?: number;
  /** 前後集（2026-09-04）：要有這個本局旗標才會排進地圖（旗標由前集選項的 `flag` 效果設）；`acts` 限定只在哪幾關出現 */
  requiresFlag?: string;
  acts?: number[];
}

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
  /**
   * 遭遇修飾詞的 id（見 content/modifiers）。地圖生成時就抽好寫在這裡，地圖上才標得出來。
   * 可選欄位：舊存檔沒有這一欄＝那一局沒有修飾詞，不必升存檔版本（升了會清掉進行中的局）。
   */
  modifier?: string;
}
export interface GameMap { nodes: MapNode[]; start: string[] }

// ===== 整局 =====
/**
 * 一位玩家在**整局**裡的家當（連線版規則一與規則五，使用者 2026-09-11：各帶各的）。
 *
 * 以前這幾欄直接掛在 `RunState` 上，因為只有一位玩家。兩個人一起玩之後，
 * 血量、牌組、秘寶、忍具、小魚乾、移除價、保底都是**各一份**，所以整組搬進來。
 *
 * 刻意**不留**「指向第一位的別名」——`RunState` 會被存進瀏覽器，
 * getter 存下去讀回來會變成一份獨立的死資料，之後兩邊各改各的就悄悄分岔了
 * （`CombatState` 可以用別名，是因為它從頭到尾不存檔）。
 */
export interface RunPlayer {
  /** 這一位的職業。沒寫＝忍者 */
  hero?: 'ninja' | 'samurai';
  hp: number;
  maxHp: number;
  fish: number;
  deck: CardInstance[];
  relics: string[];
  potions: string[];
  /** 罐頭鋪移除一張牌的價錢，每移除一次就漲（各漲各的） */
  removeCost: number;
  /** 暖毯：打盹後下一場開戰帶的蜷縮，開戰用掉就歸零 */
  restBlock?: number;
  /**
   * 稀有牌保底：連續幾次戰鬥獎勵沒開出稀有牌（每次 +1，開出就歸零）。
   * 每一點讓下一次的稀有權重多 4——連續槓龜的手氣會自己回來。
   */
  rarePity?: number;
  /**
   * 倒下了（規則四）。倒下的人之後的戰鬥都只能觀戰，
   * **直到有人在打盹點把他扶起來**（使用者 2026-09-11 追認）。
   */
  down?: boolean;
}

export interface RunState {
  version: 2;
  /** 這一局的玩家，依座位排。單機就一位；`players[0]` 永遠是自己 */
  players: RunPlayer[];
  seed: string;
  rng: RngState;
  floor: number;
  map: GameMap;
  currentNode: string | null;
  /** 這一關實際走過的節點足跡（依序）。畫地圖時「走過的路亮、沒走過的暗」靠這條；換關清空。 */
  trail: string[];
  nextUid: number;
  stats: { kills: number; turns: number; cardsPlayed: number };
  /** 第幾關（1＝塔下、2＝塔中、3＝塔頂）。舊存檔沒有這欄，載入時補成 1。 */
  act: number;
  /** 難度 1～5（見 content/difficulty.ts）。舊存檔沒有這欄，載入時補成 1。 */
  difficulty?: number;
  status: 'playing' | 'won' | 'lost';
  /** 一次性旗標（看過哪段對話、觸發過哪個事件之類）；舊存檔沒有這欄，載入時補成 {} */
  flags: Record<string, boolean>;
  /** 事件選項「要打一場」附帶的獎勵：先記在這裡，打贏才發（輸了就清掉）——使用者 2026-09-04：秘寶不該還沒打就到手 */
  pendingAfterFight?: RunEffect[];
}

// ===== 戰鬥 =====
export interface Unit { hp: number; maxHp: number; block: number; statuses: Partial<Record<StatusName, number>> }
export interface PlayerCombat extends Unit {
  /**
   * 座位編號，0 起算（連線版第一步 2026-09-11）。
   *
   * 單機永遠只有 0 號一個人，行為跟加這個欄位之前一模一樣。
   * 之所以要編號而不是拿物件比對：畫面與紀錄要講「誰做了什麼」，
   * 連線之後兩邊的記憶體物件不是同一個，能對起來的只有這個號碼。
   */
  seat: number;
  /**
   * 已經倒下（連線版規則四，使用者 2026-09-11 拍板）。
   *
   * 倒下的人**不抽牌、不出手、也不會再被魔物打到**，但留在畫面上觀戰。
   * 整場的敗北（`cs.phase = 'lost'`）改成「**每一位都倒下了**」才成立。
   * 單機只有一位，兩者是同一件事，行為跟加這個欄位之前一模一樣。
   */
  down?: boolean;
  /**
   * 「我這回合不打了」——按下結束回合就舉手（連線版 2026-09-11）。
   *
   * **舉手不等於結算。** 真正的收尾（丟手牌、減益衰減）等到所有還站著的人
   * 都舉手才一起跑，所以對方還沒舉手之前可以再按一次收回，按錯不會毀掉一個回合。
   * 舉手之後手牌鎖住打不出，但看得到對方還在動。
   *
   * 單機只有一位，舉手的下一拍就結算，跟以前按下去就結束一模一樣。
   */
  ready?: boolean;
  /**
   * 這一輪魔物全部打我（「我來擋」那張牌，連線版 2026-09-11）。
   * 回合開始清掉——它只保護**一輪**，不是掛著就永遠有效。
   */
  taunt?: boolean;
  /**
   * 這一位帶的秘寶與忍具（連線版規則一，使用者 2026-09-11：**各帶各的**）。
   *
   * 以前掛在整場（`CombatState`）上，因為只有一位玩家。現在搬到人身上，
   * 每回合補飽足、折價、留蜷縮這些都各算各的。
   * `cs.relics`／`cs.potions` 留成指向第一位的別名，整局層與畫面完全不用改。
   */
  relics: string[];
  potions: string[];
  /**
   * 甲（武士球球的防禦，2026-09-05）。跟蜷縮並列但性格相反：**回合開始不歸零**，被打會永久扣。
   * 受傷順序是 蜷縮 → 甲 → 生命——蜷縮回合末反正要消失，先用它擋；擋不完才啃甲。
   * 忍者球球整場都是 0，行為跟加這個欄位之前一模一樣。
   */
  armour: number;
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
  powers: { trigger: PowerTrigger; effects: Effect[]; thisTurn?: true; cardId?: string; upgraded?: boolean }[];
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
  /**
   * 這一場**自己**賺到（或被偷走）的小魚乾，打完才併回整局的錢包。
   *
   * 一人一份（規則一「各帶各的」）：銅錢劍是誰的、順手牽羊是誰打的、
   * 山賊偷的是誰的錢，都要記在那個人頭上。放在整場共用的話，
   * 連線時第二位打倒山賊拿回來的錢會跑進第一位的口袋。
   */
  fishDelta: number;
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
  /** 這一拍剛從同生共死爬起來：狀態照結算，但不出招、頭上那招留到下回合（稽核 2026-09-04 M-1） */
  justRevived?: boolean;
  /** 憤怒（angerOnSkill）這回合已經觸發過：每回合最多一次，防禦牌才不會變成餵怪（下一輪平衡 2026-09-05） */
  angerTurn?: number;
  move: EnemyMove;
  /**
   * 排好、**要等下一回合才亮出來**的招（換階段的 `onEnterMove` 用）。
   *
   * 為什麼不直接寫進 `move`：那是玩家頭上看得到的預告。牠在**玩家回合中途**被打過換階段門檻時
   * 直接改 `move`，等於「牌子上寫吸魂、你照著規劃了整個回合、牠卻在同一回合放出兩條尾巴」——
   * 使用者 2026-09-10 回報的正是這個（實測第七回合預告「吸魂」，打完當場變「放尾巴」並立刻放）。
   * 排進這裡，牠這一回合照原本預告的招出手，`advanceMove` 收尾時才把它換成下一回合的預告，
   * 玩家就有一整個回合可以應對。牠自己出招途中換階段（球球的反彈打過門檻）也走同一條路。
   */
  queuedMove?: EnemyMove;
  /** 上一次真的召喚出東西是牠的第幾個回合（見 actions.ts 的 `SUMMON_GAP`） */
  lastSummonTurn?: number;
  /** 第一次偷到小魚乾是**這場的第幾個回合**（`cs.turn`）。逃跑冷卻從這裡算，見 actions.ts 的 `ESCAPE_GAP` */
  stolenTurn?: number;
  dead: boolean;
  escaped: boolean;   // 逃走：不算擊倒、偷走的小魚乾不退（消散、分裂也走這條）
  /**
   * **自己散掉**（消散歸零）才標這個，逃走招式與分裂本體不標。
   *
   * `escaped` 三種來源混在一起，拿它當「有沒有戰利品」的判準會誤傷：橘貓山賊第五回合
   * 帶著小魚乾逃走也是 `escaped`，那是**正常打但差一口氣沒打完**，不該連獎勵都沒有
   *（實測 1000 局有 11.2% 踩到，而且全是第一關 8F 的山賊）。稽核 2026-09-10 中-1。
   */
  faded?: boolean;
  stolen: number;     // 這隻偷走的小魚乾，擊倒牠時退回
  /** 分裂過了：一場只裂一次（見 EnemyDef.splitInto） */
  split?: boolean;
}
export interface EffectCtx {
  /**
   * 這一串效果是**誰**引發的：打這張牌、喝這瓶忍具、觸發這件秘寶的那個人
   * （連線版第一步 2026-09-11）。
   *
   * 加防禦、抽牌、回血、掛能力這些「作用在自己身上」的效果都要認人。
   * 單機只有一位，填的一直是 `players[0]`，跟以前一模一樣。
   * **沒填就退回 `cs.player`**——魔物的招式、還沒改完的舊呼叫點都走這條路，
   * 單機兩者等值，所以過渡期不會有行為差異。
   */
  self?: PlayerCombat;
  targetUid?: number;
  cardUid?: number;
  cardId?: string;         // 打出的是哪張牌（能力牌掛牌子用）
  cardUpgraded?: boolean;  // 那張牌升級了沒（牌子的說明要念對版本，稽核 2026-09-04 H-2）
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
  /**
   * 這場戰鬥裡的所有玩家，依座位排（連線版第一步 2026-09-11）。**單機就一位。**
   *
   * 為什麼先把一個人包成陣列：連線版要讓兩個人打同一場，而整個引擎有一百多處
   * 寫死了「玩家＝那一個」。一次全改風險太大，所以先把容器換掉、行為完全不動，
   * 用既有的六百多條測試證明沒改壞，之後才一處一處把「那一個」換成「指定的那位」。
   */
  players: PlayerCombat[];
  /**
   * 相容用的別名，**永遠等於 `players[0]`**。
   *
   * 這是唯讀的 getter（在 `startCombat` 裡用 `get player()` 定義），不是複製出來的欄位，
   * 所以不會有「陣列換人了、這個別名還指著舊的」的走鐘問題——刻意選 getter 而不是
   * 存一份參考，正是為了把這種最難查的錯誤從一開始就排除掉。
   *
   * 新程式碼請改用明確的對象：牌效果用 `ctx.self`，魔物出招用被指定的受害者。
   * 剩下還在讀這個別名的地方，在連線版第二步會一批一批換掉。
   */
  readonly player: PlayerCombat;
  enemies: EnemyCombat[];
  /**
   * 相容用的別名，**永遠等於 `players[0]` 的那兩份**（規則一之後真正的資料在人身上）。
   * 回傳的是同一個陣列物件，所以 `cs.potions.splice` 照樣改得動真正的資料。
   */
  readonly relics: string[];
  readonly potions: string[];        // 從整局複製進來，用掉就移除，戰後寫回
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
  /** 這一場打在魔物身上的每一段傷害（依發生順序；amount 是真的扣到血的量，被防禦全吃掉就是 0）。
   *  畫面靠它把「5 點 ×3」拆成三下演，不用再從總掉血倒推（使用者 2026-09-05：連環踢看起來像一下扣 15） */
  hits: { uid: number; amount: number }[];
  encounterId: string;

  /** 先手香：這一輪魔物不出手（`beginEnemyTurn` 看到就整輪跳過，見 Effect 的 `skipEnemyTurn`） */
  skipEnemies?: boolean;
  stolenFish: number;       // 山賊偷走的，擊倒牠全部拿回
  /**
   * 相容用的別名，**永遠等於 `players[0].fishDelta`**（真正的值在人身上）。
   * 跟 `player`／`relics`／`potions` 同一套理由：`CombatState` 從頭到尾不存檔，
   * 所以別名不會像 `RunState` 那樣被寫進瀏覽器變成一份會走鐘的死資料。
   */
  fishDelta: number;
  /**
   * 整場**憑空多出來**的飯糰累計（追擊退回來的、秘寶補的都算）。
   * 畫面拿它跟自己的快照相減，就知道這一拍有沒有多出飯糰、多幾顆。
   *
   * 為什麼要記：出一張牌是「扣費用→跑效果→重畫」一次做完的，畫面永遠只看得到淨值。
   * 追擊花 2 顆、打死怪退 2 顆，畫面上飯糰從 3 變 3，**看起來就像什麼都沒發生**——
   * 使用者 2026-09-10 正是因此回報「追擊沒退飯糰，有 BUG」（引擎其實是對的）。
   *
   * 2026-09-10 把「第 N 張牌補飯糰」（竹蜻蜓、金爪套的 `energyOnNthCard`）也算進來：
   * 那條沒走 `applyEffects`，本來漏掉，玩家看到的一樣是一個突然變大的數字（稽核 低-8）。
   */
  energyGain: number;
  /**
   * 整場**真的打進魔物血條**的傷害累計（被防禦擋掉的、虛化吃掉的都不算）。
   *
   * 只給「魔物散掉時要不要發獎」用（`finishCombat` 的 `FADE_REWARD_MIN`）。
   * 為什麼不看終局血量：那量的是「牠現在缺幾成血」，魔物回血就等於把玩家打過的功勞洗掉。
   * 醉拳狗六回合灌兩次酒各回 10 點，實際要打進 36% 才過得了兩成的門檻（稽核 2026-09-10 中-2）。
   */
  damageDealt: number;
  /**
   * 這場**發動過的秘寶**，照發生順序一件一筆（同一件發動兩次就兩筆）。
   *
   * 為什麼要記：秘寶的效果多半是靜悄悄套上去的——靈貓鈴多抽一張牌、貓抓板多長一點蜷縮，
   * 數字就這樣變了，玩家不知道是誰做的，久了會以為那件秘寶根本沒作用。
   * 畫面拿它跟自己的快照相減（跟 `energyGain` 同一套），就知道「這一拍哪幾件動了」，
   * 讓狀態列那一格閃一下、名字浮一下。
   */
  relicFired: string[];
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
