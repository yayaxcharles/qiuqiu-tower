import { cardById, cardNameFor } from '../content/cards';
import { encounterById, encounterSkin, enemyById, enemySkin } from '../content/enemies';
import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import { advanceMove, aliveEnemies, damageEnemy, damagePlayer, drawCards, findEnemy, fireRelic, gainBlock, gainEnergy, gainStealth, giveCards, log, makeEnemy, markCombatWon, markPoisoner, markRelic, pickVictim, runEnemyEffects, SLEEP_MOVE, willRevive } from './actions';
import { coopHpMul } from './coopscale';
import { unitName } from './hero';
import type { Hero } from './hero';
import { cardStats, discardHand, moveCard } from './deck';
import { applyEffects } from './effects';
import type { Rng } from './rng';
import { addStatus, decayTurnStatuses, getStatus, removeStatus, tickPoison } from './statuses';
import { TURN_DECAY } from './types';
import type { CardInstance, CombatState, Effect, EffectCtx, PlayerCombat, PotionDef, StatusName, EnemyCombat } from './types';

type NumHook = 'firstTurnDraw' | 'firstTurnEnergy' | 'energyPerTurn' | 'firstCardDiscount' | 'firstCardDiscountCombat' | 'blockKeep' | 'killHeal' | 'killStrength' | 'killFish' | 'combatEndHeal';
function relicSum(relics: string[], key: NumHook): number {
  return relics.reduce((s, id) => s + (relicById[id]?.hooks[key] ?? 0), 0);
}

export function startCombat(input: {
  hp: number; maxHp: number; deck: CardInstance[]; relics: string[]; potions: string[]; encounterId: string; rng: Rng;
  /** 難度旋鈕（見 content/difficulty.ts）：血量倍率乘在遭遇的 hpScale 上、爪力加在遭遇的魔氣上 */
  mods?: { hpMul?: number; strength?: number; startBlock?: number };
  /**
   * 這一場有幾個人（連線版 2026-09-11）。不填＝1，單機完全不受影響。
   *
   * 只影響**魔物的血量**（見 `coopscale.ts`），傷害一點都不動——抄的是二代的規則。
   * 第二位玩家的資料由呼叫端在開戰後放進 `cs.players`；這裡只需要知道人數，
   * 因為魔物的血量在建立的那一刻就要決定。
   */
  players?: number;
  /** 第一位的職業。沒填＝忍者（單機舊存檔就是這樣） */
  hero?: Hero;
}): CombatState {
  const enc = encounterById[input.encounterId];
  if (!enc) throw new Error(`未知的遭遇：${input.encounterId}`);
  const player: PlayerCombat = {
    ...(input.hero ? { hero: input.hero } : {}),
    seat: 0,
    relics: [...input.relics], potions: [...input.potions],
    hp: input.hp, maxHp: input.maxHp, block: 0, statuses: {},
    energy: 0, maxEnergy: 3 + relicSum(input.relics, 'energyPerTurn'),
    qi: 0,
    hand: [], drawPile: input.rng.shuffle(input.deck), discardPile: [], exhaustPile: [],
    retained: [], powers: [], doubleNext: 0, drawNextTurn: 0,
    noAttacks: false, immune: false, attackedThisTurn: false, cardsPlayedThisTurn: 0,
    firstStealthGiven: false, firstCardPlayed: false, lethalPrevented: false, freshDebuffs: {}, fishDelta: 0,
  };
  const cs: CombatState = {
    rng: input.rng,
    players: [player],
    // 開場那一拍第二位還沒 push 進來，戰報要知道「這場預計幾個人」才寫得對（見 types.ts 的說明）
    seatCount: input.players ?? 1,
    // `player` 是**算出來的別名**不是存起來的欄位：永遠回傳陣列裡的第一位。
    // 連線版之後就算陣列被換過，這個別名也不可能指到舊物件（見 CombatState 的說明）
    get player(): PlayerCombat { return this.players[0] as PlayerCombat; },
    // 秘寶與忍具真正的資料在人身上（規則一），這兩個是指向第一位的別名。
    // 回傳同一個陣列物件，所以 `cs.potions.splice` 改得動真正的資料
    get relics(): string[] { return (this.players[0] as PlayerCombat).relics; },
    get potions(): string[] { return (this.players[0] as PlayerCombat).potions; },
    get fishDelta(): number { return (this.players[0] as PlayerCombat).fishDelta; },
    set fishDelta(v: number) { (this.players[0] as PlayerCombat).fishDelta = v; },
    enemies: [],
    turn: 0, phase: 'player', pending: null, log: [], hits: [], encounterId: input.encounterId,
    stolenFish: 0, energyGain: 0, relicFired: [], kills: 0, cardsPlayed: 0, nextEnemyUid: 1,
    // 魔物塞牌用的編號從牌組最大編號 +1 起跳，不會跟原本的牌撞號
    nextCardUid: input.deck.reduce((m, c) => Math.max(m, c.uid), 0) + 1,
  };
  // 兩個人一起打時魔物血量放大（只放大血量，傷害不動——見 `coopscale.ts`）。
  // 一個人時 `coopHpMul` 一定回 1，所以單機的數字一個位元都沒變
  const hpMul = (enc.hpScale ?? 1) * (input.mods?.hpMul ?? 1) * coopHpMul(enc.pool, input.players ?? 1, enc.id);
  enc.enemies.forEach((id, k) => cs.enemies.push(makeEnemy(cs, id, k, hpMul)));
  const strength = (enc.strength ?? 0) + (input.mods?.strength ?? 0);   // 魔氣（見 EncounterDef.strength）＋難度
  if (strength) for (const e of cs.enemies) addStatus(e, '爪力', strength);
  cs.mods = { hpMul, strength };   // 召喚出來的也照這組套（審查 #9；含遭遇的 hpScale，2026-09-02 稽核 L-2）
  if (player.relics.some((id) => relicById[id]?.hooks.firstAttackDouble)) player.firstAttackDouble = true;   // 秘笈
  for (const e of cs.enemies) {
    // 開場台詞從 line 與 lines 裡挑一句。不用戰鬥亂數（會動到整場的抽牌順序、機器人錨值），
    // 用亂數種子的目前狀態加編號做一個穩定的選法：同一局同一場永遠同一句，不同局會不同
    const def = enemyById[e.enemyId];
    // 有變裝的（玩菲菲時的鏡中球球）講變裝那份開場白，不然「那是我的影子」會從一隻暹羅貓嘴裡冒出來
    // 遭遇自己也可以換名牌與開場白（影子鏈那一場，2026-09-23 內容擴充第二批）：同一隻鏡中對手，名牌換成「某某的影子」
    const encSkin = encounterSkin(enc, e.enemyId, player.hero);
    if (encSkin) e.name = encSkin.name;
    const skin = encSkin ?? enemySkin(e.enemyId, player.hero);
    const pool = [skin?.line ?? def?.line ?? '', ...(skin?.lines ?? def?.lines ?? [])].filter((l) => l.length > 0);
    const st = (cs.rng as unknown as { state?: unknown }).state;
    const seed = typeof st === 'number' ? st : (typeof st === 'object' && st !== null ? Object.values(st as Record<string, unknown>).reduce<number>((a, v) => a + (typeof v === 'number' ? v : 0), 0) : 0);
    e.line = pool.length ? pool[Math.abs(Math.floor(seed) + e.uid * 7) % pool.length] : def?.line;
    log(cs, `${e.name}：${e.line ?? ''}`);
  }
  /**
   * 飯糰上限加成（塔主令牌、九尾墜、魔氣護符）**刻意不演**。
   *
   * 第一輪稽核建議補上，理由是「4 / 3 是個裸數字，沒人知道是誰給的」；但複核指出兩個問題：
   * 一是那是**整場都掛著的常駐加成**，沒有「發動」這個時刻可言，跟忍具袋多一格同一類；
   * 二是魔氣護符同時掛這個加成與「開場帶 2 層炸毛」，兩者都在開戰那一拍發動，
   * 一件秘寶只會浮一張名牌，金色的加成與暗紅的代價會互相蓋掉，玩家看到的顏色變成隨機的。
   * 常駐加成要講清楚的地方是秘寶說明（滑上去就看得到），不是每場閃一次。
   */
  for (const rid of player.relics) {
    const hooks = relicById[rid]?.hooks.combatStart;
    if (hooks) { fireRelic(cs, rid, player); applyRelicHook(cs, player, hooks); }
  }
  // 暖毯：打盹後帶進來的蜷縮（run.ts 的 rest 記、beginCombat 帶進來）
  if (input.mods?.startBlock) {
    player.block += input.mods.startBlock;
    // 暖毯自己有專屬紀錄句，只推清單讓畫面閃（稽核 2026-09-10 中-3）
    const wid = player.relics.find((id) => (relicById[id]?.hooks.restNextFightBlock ?? 0) > 0);
    if (wid) markRelic(cs, wid);
    log(cs, `暖毯還熱著，先有 ${input.mods.startBlock} 點蜷縮`);
  }
  startPlayerTurn(cs);
  return cs;
}

/** 效果對象是「同伴」的那幾種（見 `Effect` 的幫隊友那一批） */
const ALLY_KINDS: ReadonlySet<Effect['kind']> = new Set(['statusAlly', 'blockAlly', 'drawAlly', 'healAlly', 'energyAlly', 'cleanseAlly']);

/**
 * 跑一件秘寶的效果（2026-09-23 內容擴充第一批：同心結、分食便當第一次用到「給同伴」）。
 *
 * 座位 0 的開場與第一回合是在 `startCombat` 裡跑的，那時座位 1 還沒進場（`players.length < seatCount`），
 * 「給同伴」會退回給自己——同心結的兩點爪力全落在座位 0、同伴一點都沒有。
 * 所以人還沒到齊時，給同伴的那幾條先記進 `cs.pendingAllyRelics`，其餘照常當場跑；
 * `beginCombat` 補完人之後叫 `flushAllyRelics` 一次發掉。人到齊（或單機）時跟以前一模一樣。
 */
function applyRelicHook(cs: CombatState, p: PlayerCombat, effects: Effect[]): void {
  let now = effects;
  if (cs.players.length < (cs.seatCount ?? 1)) {
    const later = effects.filter((fx) => ALLY_KINDS.has(fx.kind));
    if (later.length) {
      cs.pendingAllyRelics = [...(cs.pendingAllyRelics ?? []), { seat: p.seat, effects: later }];
      now = effects.filter((fx) => !ALLY_KINDS.has(fx.kind));
    }
  }
  if (now.length) applyEffects(cs, now, { self: p, source: 'relic' });
}

/**
 * 人到齊之後，把開場時先記著的「給同伴」發掉（`beginCombat` 叫）。發完就刪掉那個欄位。
 * 記的那一位已經倒下（座位 0 上一場就倒了）就不發；同伴倒著的話 `ally()` 會退回給自己，跟單人一樣。
 */
export function flushAllyRelics(cs: CombatState): void {
  const list = cs.pendingAllyRelics ?? [];
  delete cs.pendingAllyRelics;
  for (const { seat, effects } of list) {
    const p = cs.players[seat];
    if (!p || p.down || cs.phase !== 'player') continue;
    applyEffects(cs, effects, { self: p, source: 'relic' });
  }
}

/**
 * 事件帶進這一場的東西（送上樓的便當，2026-09-23 內容擴充第二批 新6）：人到齊之後、開打之前套一次（`beginCombat` 叫）。
 * 效果照牌的規則跑（`status` 走爪力、`block` 走蜷縮，拒馬與貓步照算），紀錄先寫一行是誰吃了什麼。
 */
export function applyCarriedEffects(cs: CombatState, p: PlayerCombat, effects: Effect[], note: string): void {
  if (p.down || cs.phase !== 'player') return;
  log(cs, `${unitName(p)}${note}`);
  applyEffects(cs, effects, { self: p, source: 'relic' });
}

export function startPlayerTurn(cs: CombatState): void {
  if (cs.phase !== 'player') return;
  cs.turn += 1;
  cs.hits.length = 0;   // 分段演出只看這一拍新增的幾筆，上一回合的不用留著（稽核 2026-09-05 夜 低-1）
  // 每位玩家各開一次自己的回合（連線版第一步 2026-09-11）。單機就是跑一次，順序與結果完全沒變。
  // 中途被中毒打倒就整個停下來——後面的人不用再抽牌了
  for (const p of cs.players) { if (p.down) continue; startSeatTurn(cs, p); if (cs.phase !== 'player') return; }
}

/** 一位玩家的回合開始：狀態結算、補飽足、抽新手牌。整場只有一份的事情在 `startPlayerTurn` 做完了 */
/**
 * 連線支援牌 C 批的三個監聽（2026-09-13）。打完一張牌、效果結算完才叫。
 *
 * 三件事：
 *   1. **你忙我補位**：同伴打了符合的牌 → 監聽的那個人抽 1 張
 *   2. **有我在前面**：自己打了符合的牌 → 同伴拿 6 點蜷縮
 *   3. **我有先備好**：攻擊**真的扣到**已中毒魔物的血 → 雙方各 4 點蜷縮
 *   4. **別碰針尖喔**：這張牌真的打到人的話，對每隻被打到的魔物各上毒
 *
 * 每輪各只發動一次（`firedXxx`），而且**不由那張能力牌自己的施放觸發**——
 * 能力牌打出來的當下 `applyEffects` 才剛把旗標設好，所以這裡一律跳過能力牌。
 *
 * 「命中」的判準是**真的扣到血**（使用者 2026-09-13 裁定）：被蜷縮全擋掉不算。
 * 判準用 `cs.hits`——那份只記真的扣到的量，被擋成 0 的也會留一筆但 amount 是 0。
 *
 * **鎖步安全**：沒有隨機、沒讀時間，兩台跑同一份順序會算出同一個結果。
 */
function coopWatchers(cs: CombatState, p: PlayerCombat, type: string,
  hitsBefore: number, poisonBefore: ReadonlyMap<number, number>,
  had: ReadonlyMap<PlayerCombat, WatchSnapshot>, junk: boolean): void {
  // 打完了就不補（跟千針萬毒、逗貓棒、詛咒魔物同一個判斷）。
  // 少了這道，打贏的那一下同伴照樣抽一張、照樣吃掉本輪的觸發機會，
  // 而那次抽牌會動到 `cs.rng`（那份就是 `run.rng`），等於白推了戰後獎勵的骰子。
  if (cs.phase !== 'player') return;
  const damaged = cs.hits.slice(hitsBefore).filter((h) => h.amount > 0);  // 真的扣到血的那幾隻

  /*
   * 別碰針尖喔：附毒。每隻**只加一次**，多段攻擊不會疊三份（交辦單明定）。
   *
   * 兩件事跟第一版不同（2026-09-13 稽核）：
   *   - **一隻都沒上到就不要印紀錄、也不要清旗標**。一擊把唯一的目標打死時
   *     `!e.dead` 讓迴圈整個空轉，原本卻照樣印「針上的藥沾到了」並把待觸發的附毒吃掉——
   *     玩家看到紀錄說毒上了、屍體上沒有毒，那張罕見牌就這樣白打一張。
   *   - **要記「誰下的毒」**。`killEnemy` 用 `poisonedBy` 決定擊倒獎勵歸誰，
   *     不記的話一律算在 0 號座位頭上：菲菲坐 1 號時，她備的藥毒死的魔物好處全歸對方。
   *     記的是**出手的那位**，跟 `poisonOnAttack` 同口徑。
   */
  const pn = p.poisonNextAttack;
  if (pn && damaged.length > 0 && (type === '攻擊' || pn.anyDamage)) {
    let applied = 0;
    for (const uid of new Set(damaged.map((h) => h.uid))) {
      const e = cs.enemies.find((x) => x.uid === uid);
      if (e && !e.dead) { addStatus(e, '中毒', pn.amount); markPoisoner(e, '中毒', p); applied += 1; }
    }
    if (applied > 0) {
      log(cs, `針上的藥沾到了，多上了 ${pn.amount} 層中毒`);
      p.poisonNextAttack = undefined;                // 真的上到才算用掉
    }
  }

  for (const w of cs.players) {
    if (w.down) continue;
    const snap = had.get(w);
    if (!snap) continue;
    /*
     * **`w === p` 也要算**（2026-09-13 稽核 高-1）。
     *
     * 第一版寫 `w !== p`，於是單人局、或雙人局裡同伴倒下之後，這三張稀有能力牌
     * 完全不作用：花了飯糰、狀態列多一個牌子、整場什麼都沒發生，連紀錄都沒有一行。
     * 交辦單 §7 明寫「單人時『同伴』改為自己；能力改監聽自己的出牌」，
     * 而 `ally()` 的退路只保護「當場作用」那類效果，這三個監聽沒被蓋到。
     *
     * 判準改成 `solo`：**場上有沒有另一位還站著的**。有就照原本的規則（看同伴／給同伴），
     * 沒有就退回自己。
     */
    const mate = cs.players.find((o) => o !== w && !o.down);
    const solo = mate === undefined;

    /*
     * **用快照判斷「這張牌打之前就掛著」**（2026-09-13 稽核 中-1）。
     *
     * 第一版靠 `if (type === '能力') return;` 擋「能力牌自己觸發自己」，
     * 卻把**整類**能力牌一起排除了——升級版牌面寫「不限類型」，同伴打馬步、運功、
     * 千針萬毒那 19 張能力牌卻一次都不會觸發。跟影子分身那次是同一型的錯。
     * 改看快照之後，自觸發自然被擋掉（打出來的當下快照裡還沒有它），能力牌也不必整類排除。
     */
    /*
     * 戰鬥雜牌（黏液、眼冒金星）不算「打出牌」（2026-09-23 主控裁決，跟循息那條同一個標準）：
     * 這兩張監聽的牌面寫的是「第一次打出牌／技能牌／攻擊牌時」，沒說雜牌也算，
     * 原本打掉一張眼冒金星就吃掉本輪那一次。附毒與「我有先備好」看的是真的扣到血，雜牌不會打人，本來就碰不到。
     */
    if (!junk && !solo && snap.allyPlay && !w.firedAllyPlay && w !== p
        && (snap.allyPlay === 'any' || type === snap.allyPlay)) {
      w.firedAllyPlay = true;
      drawCards(cs, 1, w);
      log(cs, `${unitName(w)}接上了節奏，多抽一張`);
    }
    if (!junk && solo && snap.allyPlay && !w.firedAllyPlay && w === p
        && (snap.allyPlay === 'any' || type === snap.allyPlay)) {
      w.firedAllyPlay = true;                        // 一個人時改成監聽自己
      drawCards(cs, 1, w);
      log(cs, '接上了自己的節奏，多抽一張');
    }

    // 有我在前面：看的是**自己**打牌，好處給同伴；一個人時給自己
    if (!junk && w === p && snap.selfPlay && !w.firedSelfPlay
        && (snap.selfPlay === 'any' || type === snap.selfPlay)) {
      w.firedSelfPlay = true;
      const to = mate ?? w;
      gainBlock(cs, to, 6);
      log(cs, to === w ? '擋在前面，自己也穩住了' : `${unitName(w)}擋在前面，${unitName(to)}少挨了 6 點`);
    }

    /*
     * 我有先備好：攻擊真的扣到「打之前就中毒」的魔物。
     *   - 基礎版**只認攻擊牌**（2026-09-13 稽核 中-2）：第一版完全沒看牌型，
     *     同伴打「交出來」「絕學·太極」這種會造成直接傷害的技能牌也會發，
     *     等於升級版講的那個差別根本不存在。
     *   - 基礎版只認同伴出手；一個人時退回「自己出手也算」，不然整張沒用。
     *   - 升級版不限出手的人、技能傷害也算，但**每輪仍合計一次**。
     */
    const byOk = snap.poisonHit === 'both' || solo || w !== p;
    const typeOk = snap.poisonHit === 'both' || type === '攻擊';
    if (snap.poisonHit && !w.firedPoisonHit && byOk && typeOk
        && damaged.some((h) => (poisonBefore.get(h.uid) ?? 0) > 0)) {
      w.firedPoisonHit = true;
      // 升級版（或一個人時）自己那份加倍——交辦單 §7：「第 20 張觸發後：自己獲得 8 蜷縮」
      if (solo) gainBlock(cs, w, 8);
      else for (const q of cs.players) if (!q.down) gainBlock(cs, q, 4);
      log(cs, solo ? '藥先備好了，穩住了' : '藥先備好了，兩個人都穩住');
    }
  }
}

/** 打這張牌**之前**三個監聽各自掛著什麼。用快照判斷才擋得掉「能力牌自己觸發自己」 */
interface WatchSnapshot {
  allyPlay: PlayerCombat['watchAllyPlay'];
  selfPlay: PlayerCombat['watchSelfPlay'];
  poisonHit: PlayerCombat['watchPoisonHit'];
}

/**
 * **中途加入這一場的人，第一回合要跑跟別人一樣的開場**（2026-09-13 實測抓到）。
 *
 * `beginCombat` 幫加入的那一位手動發了五張牌、給滿飯糰，卻**漏掉秘寶那一段**——
 * 每回合開始的掛鉤（鐵砂袋、靈貓鈴，以及當時還是每回合灑毒的毒針袋——09-16 改成開場一次，現在走下面 `combatStart` 那一段）與第一回合限定的掛鉤
 *（藍頭巾多抽一張、飯糰袋多一顆）在他身上一次都不會跑。
 *
 * 玩家看到的是：菲菲當加入方時，她的起始秘寶毒針袋第一回合完全沒作用
 *（魔物身上沒有毒、紀錄也沒說發動）；球球當加入方時第一回合少抽一張。
 * 完全靜音——畫面正常，只是數字比該有的少。單機與開房那一位都沒事，所以測試也照樣綠。
 *
 * **這裡的順序照抄 `startCombat` 的結尾**：秘笈 → 「每場戰鬥開始」的秘寶 →
 * 暖毯的蜷縮 → 回合開始（`startCombat` 是 74 行立秘笈旗標、94 行跑 `combatStart`、
 * 99 行加暖毯，最後 `startPlayerTurn`）。順序照抄是為了以後誰改一邊就一定會發現另一邊，
 * 不是因為這幾步之間真的有依賴——掛 `combatStart` 的十六件沒有一件會造成傷害，
 * 所以秘笈的旗標先立後立結果都一樣（2026-09-13 稽核 低-2 指出我原本的註解把順序寫反了）。
 *
 * 2026-09-13 第三輪稽核抓到的第二半：上面只補了「每回合開始」那組，
 * 掛 `combatStart` 的十六件（斗笠、鐵項圈、龜甲、爪鞘、無聲鈴、墨玉、塔頂之月…）
 * 與秘笈的「第一張攻擊牌打兩倍」還是整場不發動。
 * 花 190 條買來的東西在加入方身上完全沒效果，而且一樣不會報錯。
 *
 * `startBlock`＝暖毯在貓窩蓋的那份蜷縮，擺在回合開始之前**純粹是為了跟座位 0 對齊**。
 *（原本這裡寫「不然回合開始結算中毒時擋不到」——那是錯的，中毒走 `direct` 本來就穿透蜷縮。
 * 理由錯了但做法是對的，2026-09-13 稽核 低-3。）
 */
export function startJoinedSeat(cs: CombatState, p: PlayerCombat, startBlock = 0): void {
  if (p.relics.some((id) => relicById[id]?.hooks.firstAttackDouble)) p.firstAttackDouble = true;   // 秘笈
  for (const rid of p.relics) {
    const hooks = relicById[rid]?.hooks.combatStart;
    if (hooks) { fireRelic(cs, rid, p); applyRelicHook(cs, p, hooks); }
  }
  if (startBlock) {
    p.block += startBlock;
    const wid = p.relics.find((id) => (relicById[id]?.hooks.restNextFightBlock ?? 0) > 0);
    if (wid) markRelic(cs, wid);
    // 兩個人都蓋了毯子時會有兩行一模一樣的句子，所以要寫是誰的（稽核 2026-09-13 低-6）
    log(cs, cs.players.length > 1
      ? `${unitName(p)}的暖毯還熱著，先有 ${startBlock} 點蜷縮`
      : `暖毯還熱著，先有 ${startBlock} 點蜷縮`);
  }
  startSeatTurn(cs, p);
}

function startSeatTurn(cs: CombatState, p: PlayerCombat): void {
  // 集中精神與下一擊準備都只撐一個本人的玩家階段；自然補滿不受集中精神影響。
  p.energyGainBlockedThisPhase = undefined;
  p.nextAttackBonus = undefined;
  // 蜷縮不在這裡清：回合結束、魔物打完才照守護符留量修剪（見 endTurn 尾端）——
  // 以前在這裡歸零，開戰拿到的蜷縮（斗笠、鐵項圈、龜甲、暖毯）從來沒生效過（審查 #1）
  p.freshDebuffs = {};   // 先清，這樣回合開始的能力若自己疊減益也算「本回合拿到的」
  if (cs.turn > 1) p.firstStealthGiven = false;   // 第一回合不清：開戰的鈴鐺已經吃過紙袋的加成（審查 #14）
  const poison = getStatus(p, '中毒');
  // 被毒倒的這一位回合就到此為止（連線稽核 低-1）：原本只有整場輸了才停，兩個人時一位倒下
  // 照樣抽 5 張、拿飯糰、秘寶照發（毒針袋還會記在一個躺著的人頭上）。單機倒下＝整場輸，行為不變
  if (poison > 0) { addStatus(p, '中毒', -1); damagePlayer(cs, p, poison, { direct: true, victim: p }); if (p.down || cs.phase !== 'player') return; }
  const dive = getStatus(p, '潛水');
  /*
   * 第一回合不換（2026-09-23 內容擴充第一批，竹筒）：開場拿到的潛水（秘寶的「每場戰鬥開始」）在第一回合開頭就換掉的話，
   * 「下回合變成隱身」等於開場直接給隱身，竹筒就跟無聲鈴一模一樣。牌與忍具給的潛水都是在某一回合中途拿到，
   * 換的時候一定已經是第二回合以後，不受影響。
   */
  if (dive > 0 && cs.turn > 1) { removeStatus(p, '潛水'); gainStealth(cs, dive, p); }
  const iron = getStatus(p, '鐵布衫');
  if (iron > 0) { removeStatus(p, '鐵布衫'); gainBlock(cs, p, iron); }   // 走 gainBlock：跟牌上其他蜷縮一樣吃貓步（稽核 低-1）
  p.energy = p.maxEnergy + (cs.turn === 1 ? relicSum(p.relics, 'firstTurnEnergy') : 0);
  /*
   * 飯糰留一口（2026-09-13）：**當場讀**有沒有同伴掛著這個能力，不是去領上一輪排好的東西。
   *
   * 使用者要求把跨回合的寫法改掉：「這一輪做的事下一輪才生效」很難算。
   * 現在值是在**你自己的回合開始那一刻**從場上的狀態算出來的，
   * 不必記著上一輪誰排了什麼，兩台鎖步也少一份要同步的暫存。
   * 排在 `p.energy = p.maxEnergy` 之後，不然剛給就被回滿蓋掉。
   */
  /*
   * **一個人時要退回給自己**（2026-09-13 稽核 高-1）。第一版寫 `o === p` 就跳過，
   * 於是單人局、或雙人局裡同伴倒下之後，這張罕見能力牌完全不作用：
   * 花了飯糰、狀態列多一個牌子、整場什麼都沒發生。
   * 交辦單 §7 明寫「單人時『同伴』改為自己」。
   */
  const hasMate = cs.players.some((o) => o !== p && !o.down);
  for (const o of cs.players) {
    if (o.down || !o.energyForAllyEachRound) continue;
    if (hasMate ? o === p : o !== p) continue;       // 有同伴＝別人給我；沒同伴＝自己給自己
    gainEnergy(cs, p, 1);
    if (o.energyForAllyEachRound === 'draw') p.drawNextTurn += 1;
    log(cs, o === p ? '自己留的那口飯糰，現在吃了' : `${unitName(o)}留的那口飯糰，${unitName(p)}拿到了`);
  }
  // 每輪監聽的次數重置。**只在這裡清**——不能因為對方出牌、按結束、撤回或畫面重繪就重置
  p.firedAllyPlay = undefined; p.firedSelfPlay = undefined; p.firedPoisonHit = undefined;
  p.poisonNextAttack = undefined;   // 待觸發的附毒不跨輪
  // 只在第一回合給的那幾件（稽核 2026-09-10 中-3）：第一回合就是它們唯一的發動時刻，
  // 不記的話玩家看到的只是「這回合飯糰比較多」，不知道是誰給的
  if (cs.turn === 1) for (const rid of p.relics) if ((relicById[rid]?.hooks.firstTurnEnergy ?? 0) > 0) fireRelic(cs, rid, p);
  // 回合開始的能力排在飽足設好之後：萬花筒抽到嘴饞扣的飯糰才不會被上一行蓋掉（審查 #15）
  for (const pw of p.powers) if (pw.trigger === 'turnStart') applyEffects(cs, pw.effects, { self: p, source: 'power' });
  p.noAttacks = false; p.immune = false; p.attackedThisTurn = false; p.cardsPlayedThisTurn = 0; p.echoUsed = false;
  p.taunt = false;   // 「我來擋」只保護一輪（連線版 2026-09-11）
  p.firstCardPlayed = false; p.doubleNext = 0;   // 蓄力只撐到回合結束；秘笈的第一擊加倍走自己的旗標（審查 #8）
  const n = 5 + p.drawNextTurn + (cs.turn === 1 ? relicSum(p.relics, 'firstTurnDraw') : 0);
  if (cs.turn === 1) for (const rid of p.relics) if ((relicById[rid]?.hooks.firstTurnDraw ?? 0) > 0) fireRelic(cs, rid, p);
  p.drawNextTurn = 0;
  drawCards(cs, n, p);
  // 每回合開始的秘寶效果（鐵砂袋、靈貓鈴）：排在抽牌之後，抽到的牌才算進這回合的手牌
  for (const rid of p.relics) {
    const h = relicById[rid]?.hooks.turnStart;
    if (!h) continue;
    // 只回血的（塔主的茶碗）滿血時那一下什麼都沒發生，不閃金光、不佔紀錄——跟沙丁魚罐同一條規矩（總稽核 2026-09-16 乙 低-6）
    if (h.every((fx) => fx.kind === 'heal') && p.hp >= p.maxHp) continue;
    // 只給蓄氣的（封封的舊劍穗）蓄氣已滿 12 時同理：那一下什麼都沒加，不閃、不寫「發動」（審查 2026-09-22）
    if (h.every((fx) => fx.kind === 'gainQi') && (p.qi ?? 0) >= 12) continue;
    // 看身上有沒有某狀態、這一次走到空的那一邊的（影忍頭帶：身上已經有隱身）同理，什麼都沒做就不閃（2026-09-23）
    if (h.every((fx) => fx.kind === 'ifSelfStatus' && (getStatus(p, fx.name) > 0 ? fx.then : fx.otherwise).length === 0)) continue;
    fireRelic(cs, rid, p); applyRelicHook(cs, p, h);
  }
  for (const c of [...p.hand]) {
    const cu = cardById[c.cardId]?.curse;
    if (cu?.onTurnStart) { log(cs, `「${curseName(c.cardId, p.hero)}」發作`); damagePlayer(cs, p, cu.onTurnStart, { direct: true, victim: p }); }
  }
}

/** `seat`＝誰要打這張牌（連線版第一步 2026-09-11）。預設 0，單機與畫面完全不用改 */
export function canPlay(cs: CombatState, uid: number, targetUid?: number, seat = 0): { ok: true; cost: number } | { ok: false; reason: string } {
  if (cs.phase !== 'player') return { ok: false, reason: '戰鬥已結束' };
  if (cs.pending) return { ok: false, reason: '先把牌選完' };
  const p = cs.players[seat];
  if (!p) return { ok: false, reason: '沒有這個座位' };
  if (p.down) return { ok: false, reason: '已經倒下了' };
  if (p.ready) return { ok: false, reason: '已經結束回合了' };
  const card = p.hand.find((c) => c.uid === uid);
  if (!card) return { ok: false, reason: '不在手牌' };
  const st = cardStats(card);
  if (st.keywords.includes('不可打出')) return { ok: false, reason: '不可打出' };
  if (st.def.type === '攻擊' && p.noAttacks) return { ok: false, reason: '本回合不能再打攻擊牌' };
  // 球球被定身：這回合攻擊牌整排打不出（毛線球怪的「纏住」）。
  // 這一側漏了很久——引擎本來只實作魔物被定身那一半，玩家身上的定身完全沒作用
  if (st.def.type === '攻擊' && getStatus(p, '定身') > 0) return { ok: false, reason: '被定住了，這回合打不出攻擊牌' };
  /*
   * 「取高」比的是**能力的內容**，不是有沒有磨過（2026-09-23 稽核 引擎 低-2）：
   * 絕學·藏鋒的升級只降費用，掛上去的能力跟基礎版一模一樣。原本只看 `upgraded`，
   * 已掛基礎版時照樣打得出升級版，換上一份相同的能力——白花一張牌和飯糰。
   * 內容相同就跟「同名同級」一樣擋下來；循息、收勢、連息的升級版數字比較大，照舊取代基礎版。
   */
  const sameOrHigherPower = st.effects.some((fx) => fx.kind === 'power' && fx.sameNameMax
    && p.powers.some((old) => old.cardId === card.cardId && old.trigger === fx.trigger
      && (!card.upgraded || !!old.upgraded
        || JSON.stringify([old.effects, old.cardType, old.minQiSpent, old.oncePerTurn])
          === JSON.stringify([fx.effects, fx.cardType, fx.minQiSpent, fx.oncePerTurn]))));
  if (sameOrHigherPower) return { ok: false, reason: '同名或更高版本的能力已經生效' };
  let cost = st.cost;
  if (!p.firstCardPlayed) cost = Math.max(0, cost - relicSum(p.relics, 'firstCardDiscount'));
  if (!p.firstCardEver) cost = Math.max(0, cost - relicSum(p.relics, 'firstCardDiscountCombat'));   // 破卷軸：整場只有第一張（審查 #7）
  if (cost > p.energy) return { ok: false, reason: '餓扁了' };
  if (st.def.target === 'enemy' && (targetUid === undefined || !findEnemy(cs, targetUid))) return { ok: false, reason: '要選一隻魔物' };
  const support = st.effects.find((fx) => fx.kind === 'nextAttackBonusSpendQi');
  if (support?.kind === 'nextAttackBonusSpendQi') {
    const mate = cs.players.find((q) => q !== p && !q.down);
    if (support.recipients === 'ally' && mate?.ready) {
      return { ok: false, reason: '同伴已結束回合，請等下一回合' };
    }
    const recipients = support.recipients === 'ally'
      ? (mate ? (mate.ready ? [] : [mate]) : [p])
      : [p, ...(mate && !mate.ready ? [mate] : [])];
    const spent = Math.min(Math.max(0, p.qi ?? 0), support.maxQi);
    const amount = support.amount + support.perQi * spent;
    if (!recipients.some((q) => (q.nextAttackBonus ?? 0) < amount)) return { ok: false, reason: '下一擊準備沒有提高' };
  }
  return { ok: true, cost };
}

/** `seat`＝誰打這張牌（連線版第一步 2026-09-11）。連線層要送過去的就是「座位＋牌號＋目標」這三個數字 */
/** 壞毛病牌的名字（發作時印在紀錄上）。要過 `cardNameFor`——菲菲看到的名字不同 */
function curseName(id: string, hero: string | undefined): string {
  const d = cardById[id];
  return d ? cardNameFor(d, hero) : id;
}

export function playCard(cs: CombatState, uid: number, targetUid?: number, seat = 0): boolean {
  const chk = canPlay(cs, uid, targetUid, seat);
  if (!chk.ok) return false;
  const p = cs.players[seat] as PlayerCombat;
  const card = p.hand.find((c) => c.uid === uid) as CardInstance;
  const st = cardStats(card);
  /**
   * 折價的那兩件（毛線球每回合第一張、破卷軸整場第一張）在這裡記（稽核 2026-09-10 中-3）。
   *
   * **不能記在 `canPlay` 裡**：那支是「這張打不打得出來」的查詢，畫面每重畫一次就會為手上
   * 每一張牌各叫一次，記在那裡等於一秒鐘閃幾十下。真的扣費用的這一刻才是它的發動時刻。
   * 條件跟 `canPlay` 算折價的那兩行對齊——旗標要到下面幾行才會被設成 true，所以這裡讀得到原值。
   */
  if (chk.cost < st.cost) {
    if (!p.firstCardPlayed) for (const rid of p.relics) if ((relicById[rid]?.hooks.firstCardDiscount ?? 0) > 0) fireRelic(cs, rid, p);
    if (!p.firstCardEver) for (const rid of p.relics) if ((relicById[rid]?.hooks.firstCardDiscountCombat ?? 0) > 0) fireRelic(cs, rid, p);
  }
  p.energy -= chk.cost;
  p.hand.splice(p.hand.indexOf(card), 1);
  const toExhaust = st.keywords.includes('消耗') || st.def.type === '能力';
  (toExhaust ? p.exhaustPile : p.discardPile).push(card);
  const mateAtPlay = cs.players.find((q) => q !== p && !q.down) ?? p;
  const ctx: EffectCtx = { self: p, targetUid, cardUid: uid, cardId: st.def.id, cardUpgraded: card.upgraded,
    cardType: st.def.type, source: 'card', combo: p.cardsPlayedThisTurn,
    qiBefore: Math.max(0, Math.min(12, p.qi ?? 0)), allyBlockBefore: mateAtPlay.block };
  /*
   * 目標**原本**有幾層毒：`blockIfPoisoned` 讀它。
   *
   * **一定要在跑效果之前記**——飛針、連針、撒針自己也會上毒，
   * 照效果順序檢查的話條件永遠成立，等於沒改。
   * 打全體的牌（撒針）沒有指定目標，就看場上有沒有任何一隻原本就中毒。
   */
  {
    const t = targetUid === undefined ? undefined : cs.enemies.find((e) => e.uid === targetUid);
    ctx.targetPoisonBefore = t ? getStatus(t, '中毒')
      : Math.max(0, ...cs.enemies.filter((e) => !e.dead).map((e) => getStatus(e, '中毒')));
  }
  if (st.def.type === '攻擊' && p.doubleNext > 0) { ctx.doubleDamage = true; p.doubleNext = 0; }
  if (st.def.type === '攻擊' && p.nextAttackBonus !== undefined) {
    ctx.nextAttackBonus = p.nextAttackBonus;
    p.nextAttackBonus = undefined;
  }
  // 秘笈自己有專屬紀錄句，只推清單讓畫面閃（稽核 2026-09-10 中-3）
  if (st.def.type === '攻擊' && p.firstAttackDouble) {
    ctx.doubleDamage = true; p.firstAttackDouble = false;
    const mid = p.relics.find((id) => relicById[id]?.hooks.firstAttackDouble);
    if (mid) markRelic(cs, mid);
    log(cs, '秘笈：第一擊加倍');
  }
  p.cardsPlayedThisTurn += 1;
  cs.cardsPlayed += 1;
  p.firstCardPlayed = true;
  p.firstCardEver = true;
  const firstAttack = st.def.type === '攻擊' && !p.attackedThisTurn;
  if (st.def.type === '攻擊') p.attackedThisTurn = true;
  // 牌名也跟著角色換（`cardNameFor`）：升級的「＋」接在後面，跟 `cardStats` 同一套
  log(cs, `${unitName(p)}打出「${cardNameFor(st.def, p.hero)}${card.upgraded ? '＋' : ''}」`);
  // 秘寶的第 N 張補抽排在牌效果之前：這張牌若要選牌，候選才不會被之後的補抽動到
  for (const rid of p.relics) {
    // 金爪套同時掛兩個第 N 張的掛鉤，分開叫會連印兩行「發動」（稽核 2026-09-10 中-2）
    const h = relicById[rid]?.hooks.drawOnNthCard;
    const e = relicById[rid]?.hooks.energyOnNthCard;
    const drew = !!h && p.cardsPlayedThisTurn === h.n;
    const gave = !!e && p.cardsPlayedThisTurn === e.n;
    if (drew || gave) fireRelic(cs, rid, p);
    if (drew) drawCards(cs, h!.draw, p);   // 抽進**打牌那位**的手裡（連線稽核 高-13：原本抽進座位 0）
    if (gave) gainEnergy(cs, p, e!.energy);
  }
  /*
   * 連線支援牌 C 批要兩份「打之前」的快照（2026-09-13）：
   *   - `hitsBefore`：這張牌造成的傷害要從這裡往後數，才知道有沒有真的扣到血
   *   - `poisonBefore`：「命中已中毒的魔物」看的是**打之前**就有毒，
   *     不然這張牌自己附的毒會讓條件自己成立
   * 兩份都當參數傳下去，**不放模組層級**——那會跨戰鬥外洩、也會弄壞鎖步。
   */
  const hitsBefore = cs.hits.length;
  const poisonBefore = new Map(cs.enemies.map((e) => [e.uid, getStatus(e, '中毒')]));
  // 三個監聽**打之前**各自掛著什麼。用快照判斷才擋得掉「能力牌自己觸發自己」，
  // 又不必把整類能力牌排除（2026-09-13 稽核 中-1）
  const watchHad = new Map(cs.players.map((q) => [q, {
    allyPlay: q.watchAllyPlay, selfPlay: q.watchSelfPlay, poisonHit: q.watchPoisonHit,
  }]));
  applyEffects(cs, st.effects, ctx);
  /*
   * 影子分身（2026-09-12 使用者指定）：這場戰鬥裡**每回合打出的第一張牌會再打一次**。
   *
   * 排在效果結算之後、再跑一次同一份效果。三個限制：
   *   - 只認**這回合的第一張**（`cardsPlayedThisTurn === 1`，上面剛 +1 過）
   *   - **影子分身自己不複製自己**：把它當第一張打出去的話會當場再給一層
   *   - 打完了（`phase !== 'player'`）就不補，跟千針萬毒同一個判斷
   *
   * **這一條原本寫成「所有能力牌都不複製」，那是錯的**（2026-09-13 使用者實測）：
   * 本意只是擋影子分身自己，卻把馬步、運功、千針萬毒整類一起排除掉——
   * 玩家有影分身、第一張打馬步（貓步 +2），期待 +4 卻還是 +2，而牌面上
   * 寫的是「打出的第一張牌，會再打一次」，沒有任何例外。
   * 現在只擋「這張牌自己會給影分身」，其餘照牌面走。
   *
   * 鎖步沒問題：兩台跑的是同一支、同一份效果、同一顆亂數，多消耗的次數也一樣。
   */
  /*
   * 兩個條件是 2026-09-13 稽核補的，兩個都會**算錯而且不出聲**：
   *
   * `!cs.pending`：碰到要玩家選牌的效果（告退、讀心術、拖字訣、隔空取物、移形換影），
   * `applyEffects` 會把剩下的效果收進 `cs.pending` 就返回。馬上再跑一次，第二次的
   * `pause()` 會把第一次的 `cs.pending` **整個蓋掉**——玩家只被問一次、只抽到一份，
   * 影子分身等於沒生效，可是紀錄已經印了「又打了一次」。移形換影更慘：
   * 抽牌跑兩次、棄牌只跑一次，變成玩家賺。這五張就不吃影分身，紀錄也不會說謊。
   *
   * `doubleDamage: false`：蓄力與秘笈的加倍是**用掉就清掉**的（上面 `p.doubleNext = 0`、
   * `p.firstAttackDouble = false`），程式自己的模型是「只該用在這一次」。
   * 原本 `{ ...ctx }` 把它一起複製過去，6 點的貓抓會打出 24 點（兩倍再兩倍）。
   *
   * **能力牌整張不重播**（2026-09-16 使用者裁定）：這一段本來是「照樣重播、但不多掛
   * 一份能力」，問題是那條規則在畫面上看不出來、玩家會忘記。改成能力牌直接跳過，
   * **這回合的重播留給下一張牌**（`p.echoUsed` 這時還沒立起來），所以打能力牌也不算浪費。
   *
   * 為什麼非擋不可：封印解除每回合 +1 爪力 +1 貓步，被重播就等於再掛一台成長機器。
   * 掛兩張影子分身之後變成每回合 +3／+3，第 14 回合貓步 33、一張金鐘罩擋 150 點
   * （沒有影子分身時是 13 與 30）。一張 3 費牌換五倍，不是「再打一次」該有的量。
   */
  if (p.echoFirst && !p.echoUsed && st.def.type !== '能力'
      && !st.effects.some((e) => e.kind === 'echoFirst')
      && cs.phase === 'player' && !cs.pending) {
    /*
     * **可以疊**（使用者 2026-09-14 深夜裁定）：掛幾張就多打幾次，兩張＝第一張牌打三次。
     * 原本這裡只看「有沒有」、永遠只重播一次，第二張等於白花 3 費，狀態列也只寫一層。
     * 每重播一次都再看一次 phase 與 pending：第一次重播就把最後一隻打倒的話，後面不能再打。
     */
    p.echoUsed = true;           // 這回合用掉了；能力牌不會走到這裡，所以打能力牌不算浪費
    const times = p.echoFirst;   // 先存起來：上限不能是活的，哪天有效果在重播中加到 echoFirst 就會跑不完（審查 低-2）
    let i = 0;
    for (; i < times && cs.phase === 'player' && !cs.pending; i++) {
      log(cs, `影子分身：「${cardNameFor(st.def, p.hero)}${card.upgraded ? '＋' : ''}」又打了一次${times > 1 ? `（${i + 1}／${times}）` : ''}`);
      const echoCtx: EffectCtx = { ...ctx, doubleDamage: false, combo: p.cardsPlayedThisTurn,
        qiBefore: Math.max(0, Math.min(12, p.qi ?? 0)) };
      delete echoCtx.qiSpent;
      delete echoCtx.nextAttackBonus;
      delete echoCtx.nextAttackBonusUsed;
      delete echoCtx.selfBlockPool;
      applyEffects(cs, st.effects, echoCtx);
    }
    // 重播途中開了選牌選單（告退、拖字訣、讀心術在手牌空著時原打不問、重播才問）就停在這裡，
    // 剩下的不補跑——但要說出來，不然紀錄印了 1／2 之後永遠等不到 2／2（審查 低-1）
    if (i < times && cs.pending) log(cs, `影子分身：這張牌要挑牌，剩下的 ${times - i} 次就不再打了`);
  }
  /*
   * **監聽排在影子分身重播之後**（2026-09-13 稽核 中-4）。
   *
   * 排在前面的話，重播那一次打出來的血監聽看不到：魔物防禦 6、貓抓 6 點，
   * 第一次剛好被擋光（`cs.hits` 那筆是 0）、重播那次才見血——玩家看到魔物掉血，
   * 但別碰針尖喔的毒沒上、我有先備好的蜷縮也沒發。
   * `hitsBefore` 本來就從打牌前起算，所以兩次的傷害會一起被涵蓋；
   * 每隻只上一次毒靠 `new Set` 去重，重複發動靠 `fired*` 旗標，都還擋得住。
   */
  coopWatchers(cs, p, st.def.type, hitsBefore, poisonBefore, watchHad, !!st.def.combatOnly);
  // 這張牌這場打過幾次（分身術疊傷害用）：效果結算完才 +1，第一次打是 0 次
  cs.cardPlays = cs.cardPlays ?? {};
  cs.cardPlays[uid] = (cs.cardPlays[uid] ?? 0) + 1;
  /*
   * 千針萬毒（菲菲的稀有能力 2026-09-12）：每打出一張攻擊牌，額外給那個目標幾層中毒。
   *
   * 排在牌效果**之後**：這樣「見血封喉」引爆的是打之前的層數，不會把這一層也算進去——
   * 不然同一張牌會自己餵自己。打贏了就不用補。
   */
  if (st.def.type === '攻擊' && p.poisonOnAttack && cs.phase === 'player') {
    /*
     * **打全體的牌就發給全體**（稽核 2026-09-12 中-11）。
     * 原本只看 `targetUid`，而撒針、針雨、全撒了這些 `target: 'all'` 的牌
     * 根本不會傳目標編號進來，整段直接跳過——玩家打出針雨，那額外一層永遠不會出現。
     */
    const hit = st.def.target === 'all'
      ? aliveEnemies(cs)
      : [targetUid === undefined ? undefined : findEnemy(cs, targetUid)].filter((t) => !!t);
    for (const t of hit) {
      if (t.dead) continue;
      addStatus(t, '中毒', p.poisonOnAttack);
      markPoisoner(t, '中毒', p);
      log(cs, `針上的毒又滲了進去（${t.name}）`);
    }
  }
  // 打出攻擊牌之後的秘寶效果（逗貓棒、貓抓板）：牌效果算完才觸發，打贏了就不用
  if (st.def.type === '攻擊' && cs.phase === 'player') {
    for (const rid of p.relics) {
      const h = relicById[rid]?.hooks.onAttackPlayed;
      if (!h || (h.firstEachTurn && !firstAttack) || (h.chance !== undefined && !cs.rng.chance(h.chance))) continue;
      fireRelic(cs, rid, p);
      applyEffects(cs, h.effects, { self: p, source: 'relic' });
    }
  }
  // 打出**技能**牌會惹到的兩種魔物（2026-09-02 第二波）：
  // 詛咒（詛咒神官、詛咒老住持）＝往你的抽牌堆洗爛牌；憤怒（赤鬼武夫）＝牠自己 +爪力。
  // 能力牌不算——規格只點名技能牌；戰鬥雜牌（黏液、眼冒金星）也不算，不然「打出去就消耗」對詛咒魔物會變成打一張補一張（稽核 2026-09-04 午後 高-1）
  if (st.def.type === '技能' && !st.def.combatOnly && cs.phase === 'player') {
    for (const e of aliveEnemies(cs)) {
      const d = enemyById[e.enemyId];
      // 爛牌塞進**打技能牌那位**的牌堆（連線稽核 高-14：原本塞進座位 0 的）
      if (d?.hexOnSkill) giveCards(cs, e, d.hexOnSkill.cardId, d.hexOnSkill.n, 'draw', p);
      // 憤怒每回合最多觸發一次（跟毛線手套 onHit 的 hitRelicTurn 同一套）：三隻第二關關主主招都是三段，
      // 每張技能牌都 +1／+2 會讓「先擋再打」的牌組被判死刑（全面體檢 2026-09-05；下一輪平衡拍板）
      if (d?.angerOnSkill && e.angerTurn !== cs.turn) { e.angerTurn = cs.turn; addStatus(e, '爪力', d.angerOnSkill); log(cs, `${e.name}被激怒了`); }
    }
  }
  // 封封能力在原牌及既有反應完成後觸發；能力效果不會再回到 playCard，因此不遞迴。
  // 戰鬥雜牌（黏液、眼冒金星）不算，跟上面詛咒、憤怒同一個排除（2026-09-23 稽核 引擎 低-5）：
  // 原本白狐巫女、鏡仙塞進來的眼冒金星 0 費打掉，就白拿循息的蓄氣。牌面寫的是「打出技能牌」，指的是牌組裡的牌
  if (!p.down && cs.phase === 'player' && !st.def.combatOnly) {
    for (const pw of p.powers) {
      if (pw.trigger !== 'afterCard' || (pw.cardType && pw.cardType !== st.def.type)
          || (pw.minQiSpent !== undefined && (ctx.qiSpent ?? 0) < pw.minQiSpent)
          || (pw.oncePerTurn && pw.firedTurn === cs.turn)) continue;
      if (pw.oncePerTurn) pw.firedTurn = cs.turn;
      applyEffects(cs, pw.effects, { self: p, source: 'power', qiBefore: Math.max(0, Math.min(12, p.qi ?? 0)) });
      if (p.down || cs.phase !== 'player') break;
    }
  }
  return true;
}

/**
 * 結束回合＝敵方回合前半 → 魔物一隻一隻行動 → 收尾。三段拆開是給畫面逐隻演出用的
 * （使用者 2026-09-03：「怪物一次打完所有動作，看不出來誰動了」）；引擎、機器人、測試一律走這個包起來的版本，結果跟拆開前一模一樣。
 */
/**
 * 舉手／收回手：「我這回合不打了」。回傳 true＝所有人都舉手了，可以收回合。
 *
 * 呼叫端（畫面或連線層）拿到 true 才去叫 `endTurn`。這樣「誰決定回合結束」
 * 這件事只有一個判準，畫面與連線層不會各寫一套然後走鐘。
 */
export function setReady(cs: CombatState, seat: number, ready = true): boolean {
  const p = cs.players[seat];
  if (!p || p.down || cs.phase !== 'player') return false;
  p.ready = ready;
  return allReady(cs);
}

/**
 * 所有**還站著**的人都舉手了嗎。倒下的人不算——不然一個人倒下就再也結不了回合。
 * 全倒的情況回 false：那時 `phase` 已經是敗北，輪不到收回合。
 */
export function allReady(cs: CombatState): boolean {
  const standing = cs.players.filter((p) => !p.down);
  return standing.length > 0 && standing.every((p) => p.ready);
}

/** 還在等誰（畫面拿它寫「等對方…」）。回傳座位編號 */
export function waitingFor(cs: CombatState): number[] {
  return cs.players.filter((p) => !p.down && !p.ready).map((p) => p.seat);
}

/**
 * 對方要閒置多久，才亮出「強制收回合」那顆按鈕（使用者 2026-09-11：一分鐘）。
 *
 * 放在引擎這一側只是為了**讓畫面與連線層共用同一個數字**，引擎自己不會去看時間。
 */
export const IDLE_FORCE_MS = 60_000;

/**
 * 強制替**別人**收回合：對方走開了，總不能讓另一個人卡在那裡。
 *
 * **「過了幾秒」這件事刻意不放進引擎。** 引擎是完全決定性的（底下零時間相依），
 * 鎖步連線靠的就是兩邊算出一模一樣的結果；只要引擎裡出現「現在幾點」，
 * 兩台機器的秒差就會讓兩邊悄悄分岔，而那是最難查的一種錯。
 *
 * 所以計時在畫面那一層做，時間到只是**亮出一顆按鈕**；真的按下去才送一個
 * 明確的動作過來，兩邊收到的是同一個動作，結果自然一致。
 *
 * 也正因如此，**不可以做成「時間到自動收」**——兩邊的計時器不會同時響。
 * 使用者 2026-09-11 講的「另一人**可以**強制收回合」正是這個意思。
 */
export function forceReady(cs: CombatState, seat: number): boolean {
  const p = cs.players[seat];
  if (!p || p.down || p.ready || cs.phase !== 'player') return allReady(cs);
  p.ready = true;
  // 留一行紀錄：被強制收回合的人回來之後，得看得懂自己那個回合是怎麼沒的
  log(cs, '等太久了，同伴幫你把這回合結束掉了');
  return allReady(cs);
}

export function endTurn(cs: CombatState): void {
  if (!beginEnemyTurn(cs)) return;
  while (stepEnemyTurn(cs)) { /* 一隻一隻 */ }
  finishEnemyTurn(cs);
}

/** 魔氣暴走從第幾回合開始（玩家回合的計數）。10：8 太早——機器人打關主平均 9～14 回合，等於每場關主戰都被加成，第一關到達率掉 8 個百分點（2026-09-04 實測） */
export const BOSS_RAMPAGE_TURN = 15;
export const RAMPAGE_TURN = 10;
/** 這場戰鬥第幾回合起魔氣暴走：關主戰 15、其他 10（畫面的牌子跟引擎用同一條規則）。
 *  師父例外維持 10：使用者 2026-09-03「師父不放軟」，三條血的最長一戰不因為這條規則變軟（稽核 2026-09-06 低-12） */
export function rampageTurnFor(cs: CombatState): number {
  if (cs.encounterId === 'tower_master') return RAMPAGE_TURN;
  return encounterById[cs.encounterId]?.pool === '塔主' ? BOSS_RAMPAGE_TURN : RAMPAGE_TURN;
}

/** 敵方回合前半：詛咒發作、沒攻擊的鉤子、棄手牌、減益衰減、同伴復活、魔物防禦歸零，並排好這回合要行動的魔物。回 false＝這回合結束不了（不在玩家回合、還有牌要選、或球球被詛咒打倒） */
export function beginEnemyTurn(cs: CombatState): boolean {
  if (cs.phase !== 'player' || cs.pending) return false;
  for (const p of cs.players) p.ready = false;   // 舉的手到這裡就兌現了
  // 每位玩家各收一次自己的回合（連線版第一步 2026-09-11）。單機跑一次，順序與結果完全沒變
  for (const p of cs.players) { if (p.down) continue; endSeatTurn(cs, p); if (cs.phase !== 'player') return false; }
  return beginEnemyTurnRest(cs);
}

/** 一位玩家的回合結束：詛咒發作、沒出手的鉤子、丟手牌、減益衰減 */
function endSeatTurn(cs: CombatState, p: PlayerCombat): void {
  for (const c of [...p.hand]) {
    const cu = cardById[c.cardId]?.curse;
    if (cu?.onTurnEnd) { log(cs, `「${curseName(c.cardId, p.hero)}」發作`); damagePlayer(cs, p, cu.onTurnEnd, { direct: true, victim: p }); }
  }
  if (cs.phase !== 'player') return;
  if (!p.attackedThisTurn) {
    for (const rid of p.relics) { const h = relicById[rid]?.hooks.turnEndNoAttack; if (h) { fireRelic(cs, rid, p); applyEffects(cs, h, { self: p, source: 'relic' }); } }
    for (const pw of p.powers) if (pw.trigger === 'turnEndNoAttack') applyEffects(cs, pw.effects, { self: p, source: 'power' });
  }
  // 只限本回合的能力到這裡就過期。放在「沒出攻擊牌」的結算之後：
  // 那一段也會觸發能力，先讓它算完再清，不然本回合最後一次會少算。
  p.powers = p.powers.filter((pw) => !pw.thisTurn);
  discardHand(p);
  /**
   * 球球的減益衰減：這回合自己給自己疊的先放過一次（下一回合結束才開始減），魔物施加的照常減。
   *
   * `freshDebuffs` 記的是**層數**不是旗標（稽核 2026-09-10 低-1）。原本一個名字一個旗標，
   * 只要這回合自己疊過同名的減益，連魔物先前給的那幾層都一起被凍住：
   * 身上有魔物給的 3 層翻肚、打一張自帶 1 層翻肚的「出大事了」變 4 層，回合結束**還是 4 層**。
   * 現在只要「總層數比自己疊的多」就照減一層，多出來的那些本來就是魔物給的。
   */
  for (const name of TURN_DECAY) {
    const fresh = p.freshDebuffs[name] ?? 0;
    if (getStatus(p, name) > fresh) addStatus(p, name, -1);
    delete p.freshDebuffs[name];
  }
  p.nextAttackBonus = undefined;
  p.energyGainBlockedThisPhase = undefined;
}

/** 敵方回合前半剩下的整場結算：同伴復活、魔物防禦歸零、魔氣暴走，並排好這回合要行動的魔物 */
function beginEnemyTurnRest(cs: CombatState): boolean {
  // 「一起死才算數」：同組只要還有一隻活著，倒下的同伴就爬起來。
  //
  // 放在魔物行動之前：爬起來的當回合就會出手，玩家才感覺得到「沒清乾淨的代價」。
  // 逃走的（`escaped`）不算倒下，不會被扶起來。
  // 擊殺數要扣回去——同一隻爬起來再打倒不該重複計數。
  for (const e of cs.enemies) {
    const rdef = enemyById[e.enemyId];
    if (!e.dead || e.escaped || !rdef?.reviveGroup) continue;
    // 同組沒人站著、或牠自己標了倒了就倒了＝真的倒了：倒數歸零，不再占召喚名額（判準與 killEnemy 共用）
    if (!willRevive(cs, e)) { e.reviveIn = 0; continue; }
    // 「重生中」倒數：還沒數完就先躺著（預設躺兩回合，玩家才有湊一波清光的時間窗）
    if (e.reviveIn > 1) { e.reviveIn -= 1; continue; }
    e.reviveIn = 0;
    e.dead = false;
    e.hp = rdef.reviveHp ?? Math.max(1, Math.round((rdef.hp[0] + rdef.hp[1]) / 4));
    e.block = 0;
    cs.kills = Math.max(0, cs.kills - 1);
    // 爬起來的這一拍不出手：牠頭上掛的是倒下前的舊招，玩家沒看過就被打會覺得是 bug（使用者 2026-09-03）。
    // 立刻排下一招，玩家回合就看得到新意圖；自檢時發現若只掛「剛爬起來」的閒置招，牠下一拍又會白白發呆一輪。
    // 牠照樣進佇列跑 stepEnemyTurn（中毒、鱗甲、定身要正常結算），只靠 justRevived 跳過「出招」那一段（稽核 2026-09-04 M-1）
    advanceMove(cs, e);
    e.justRevived = true;
    log(cs, `${e.name}又爬起來了`);
  }

  cs.enemyActing = true;
  // 魔物的防禦在敵方回合**開始時一次全部歸零**，不是各自輪到才歸零。
  // 對既有的魔物完全等價（沒有誰會替別人加防禦），但「盾陣」那種替全體加防禦的招
  // （鼠大將、蛙大名，2026-09-02 第二波）本來會被排在後面的同伴自己洗掉。
  // 不壞身（鐵羅漢）不歸零：牠的防禦一路往上疊，逼玩家一直動手打（使用者 2026-09-04）
  for (const e of cs.enemies) if (!e.dead && getStatus(e, '不壞身') === 0) e.block = 0;
  // 魔氣暴走（使用者 2026-09-04：「拖著的都要有代價」）：第 RAMPAGE_TURN 回合起，每個敵方回合全體魔物 +1 爪力。
  // 治龜縮——機器人打龍貓拖三十多回合就是沒代價；正常戰鬥七八回合內結束不會碰到、關主戰打得乾脆也碰不到
  // 關主戰延到第 15 回合（第二輪平衡 2026-09-06）：關主戰平均 10～12 回合，第 10 回合起暴走等於每場後半都被加成，
  // 那是關主自己的成長該做的事；暴走要抓的是一般戰的拖延（體檢 2026-09-05「暴走沒治好龜縮」）
  const rampAt = rampageTurnFor(cs);
  if (cs.turn >= rampAt) {
    const alive = cs.enemies.filter((e) => !e.dead);
    for (const e of alive) addStatus(e, '爪力', 1);
    if (alive.length) log(cs, cs.turn === rampAt ? '魔氣開始暴走了！魔物全體爪力 +1，之後每回合都會再加' : '魔氣暴走：魔物全體爪力 +1');
  }
  // 這回合要行動的名單在這裡定案：中途被召喚出來的不算（跟以前一次跑完的行為一樣）
  cs.enemyQueue = cs.enemies.filter((e) => !e.dead).map((e) => e.uid);
  // 伏兵：排在佇列定案之後才跳出來＝這一拍不出招，玩家下回合看得到牠的意圖再挨（使用者 2026-09-04：「要合理，怕難度太高」）
  for (const r of encounterById[cs.encounterId]?.reinforce ?? []) {
    if (r.turn !== cs.turn) continue;
    let came = 0;
    for (let i = 0; i < (r.n ?? 1) && cs.enemies.filter((e) => !e.dead).length < 5; i++) {   // 場上最多五隻，塞不下就少來幾隻
      const fresh = makeEnemy(cs, r.enemyId, i, (cs.mods?.hpMul ?? 1) * (r.hpScale ?? 1));
      const str = r.strength ?? cs.mods?.strength ?? 0;
      if (str > 0) addStatus(fresh, '爪力', str);
      cs.enemies.push(fresh);
      came++;
    }
    if (came === 0) continue;
    const name = enemyById[r.enemyId]?.name ?? r.enemyId;
    // 紀錄照實際來了幾隻講（只來得及一隻就不要說兩隻，稽核 2026-09-04 低 12）
    log(cs, came === (r.n ?? 1) && r.line ? r.line : `伏兵！${came > 1 ? `${came} 隻` : ''}${name}從煙裡跳了出來`);
  }
  /**
   * 先手香（`skipEnemyTurn`）：這一輪整排魔物不出手。
   *
   * **佇列清空**，不是逐隻跳過——排空的話 `stepEnemyTurn` 一次都不會跑，
   * 牠們的預告、鱗甲、中毒、定身層數全部原封不動留到下一輪，正是「這一輪沒發生」的語意。
   * 旗標在這裡就清掉：只擋一輪，不會不小心連擋兩輪。
   * 上面那些（減益衰減、爬起來、防禦歸零、魔氣暴走）照跑——那些是回合換手的結算，不是魔物的行動。
   *
   * **一定要排在伏兵迴圈後面**（稽核 2026-09-11 中-1）。原本是提前 `return`，
   * 而伏兵只認 `r.turn === cs.turn` 那一個回合號碼——在援軍要來的那一輪用先手香，
   * 那一段整個沒跑過，`cs.turn` 之後再也不會回到 3，**那批援軍整場都不會出現**，
   * 而且畫面上沒有任何提示（小狸、河童第 3 回合，瘴氣泥第 4 回合三場都中）。
   * 伏兵本來就排在佇列定案之後、這一拍不出招，所以讓牠們照樣跳出來不違反「魔物這回合不出手」。
   */
  if (cs.skipEnemies) {
    cs.skipEnemies = false;
    cs.enemyQueue = [];
    /**
     * **剛爬起來的旗標要一起清掉**（複核 2026-09-11 低-1）。
     * `justRevived` 只有 `stepEnemyTurn` 會清，而這裡把佇列排空之後那支一次都不會跑——
     * 在「同伴剛爬起來」那一輪用先手香，牠的旗標會留到下一輪再被判一次，
     * 等於白賺兩輪不出手，而且 `willAct` 回 false 會讓畫面連預告都不亮。
     * 這一輪本來就沒有人出招，「不出招」這件事已經達成了，旗標的任務算完成。
     */
    for (const e of cs.enemies) e.justRevived = false;
    log(cs, '魔物們還愣著，這一輪沒動手');
  }
  return true;
}

/** 讓排隊的下一隻魔物行動。回 false＝這回合沒有魔物要動了；回 true 但什麼都沒發生＝那隻已經倒下或球球已倒（跳過） */
/**
 * 這一拍這隻魔物到底會不會出手：倒下、剛爬起來、被定身（擋整個動作）、睡著的都不會。
 * 畫面（預告、出招演出）與機器人（估算下一拍會挨幾下）都問這一支——原本三處各寫一份，
 * 機器人那份還停在「定身只擋攻擊」的舊規則（全面體檢 2026-09-05）。
 * `stepEnemyTurn` 自己的分支有各自的紀錄文字所以沒改寫，但判準必須跟這裡一致（tests/ui/telegraph.test.ts 釘著）。
 */
export function willAct(e: EnemyCombat): boolean {
  if (e.dead || e.justRevived) return false;
  return getStatus(e, '定身') === 0 && getStatus(e, '沉睡') === 0;
}

export function stepEnemyTurn(cs: CombatState): boolean {
  const uid = cs.enemyQueue?.shift();
  if (uid === undefined) return false;
  const e = cs.enemies.find((x) => x.uid === uid);
  if (!e) return true;
  {
    if (e.dead || cs.phase !== 'player') return true;
    const skipAct = !!e.justRevived;   // 剛爬起來：狀態照結算，但不出招、不算牠的回合數
    e.justRevived = false;
    if (!skipAct) e.turnCount += 1;
    const def = enemyById[e.enemyId];
    /*
     * **飛行打掉就是打掉，不再每回合補回滿層**（使用者 2026-09-11 拍板）。
     *
     * 舊規則是牠自己的回合一開始就補回 `def.flying` 層，等於「你這輩子打牠都只進一半」——
     * 而打下來之後又飛回去，跟畫面上牠確實摔在地上也對不起來。
     * 現在飛行是**一次性的資源**：你打掉幾層就少幾層，清光就一直踩在地上。
     * 補償見 `enemies.ts`：飛行層數與血量一起調高，讓「把牠打下來」變成要投資的事。
     *
     * 這條改動順便讓「黏鳥膠」退回單純的 `removeStatuses`，不用特例旗標。
     */
    // 虛化（2026-09-03 菁英擴充）：牠的每個回合開始切換一次，所以是虛一回合、實一回合。
    // 開戰帶著虛化（makeEnemy），所以玩家的第一回合打不動牠，第二回合才是輸出窗口
    if (def?.phasing) {
      if (getStatus(e, '虛化') > 0) { removeStatus(e, '虛化'); log(cs, `${e.name}實體化了，這回合打得進去`); }
      else { addStatus(e, '虛化', 1); log(cs, `${e.name}變得半透明`); }
    }
    /**
     * 被定住或睡著的這一拍，**每回合成長與震散都不跑**（稽核 2026-09-10 中-1）。
     *
     * 使用者 2026-09-02 拍板「魔物被定住是整個動作做不了」，名詞表也寫著沉睡是「什麼都不做」；
     * 但這三行原本排在定身判斷的**上面**，所以照跑。實測把師父第三條血定住，同一拍會出現
     * 「震散了你 2 點爪力、2 點貓步」跟「被定住了，這回合動不了」兩行自相矛盾的紀錄——
     * 玩家花掉最寶貴的控場資源，最痛的那個效果照樣吃到。
     *
     * 回合結束長防禦的鱗甲、不壞身不在這條裡：那兩個是被動、不是牠做的動作。
     */
    const frozen = getStatus(e, '定身') > 0 || getStatus(e, '沉睡') > 0;
    const ph = def?.phases?.[e.phase - 1];
    if (ph?.strengthPerTurn && !frozen) addStatus(e, '爪力', ph.strengthPerTurn);
    // 師父二、三階段：每回合先把你堆的爪力、貓步震掉幾點（見 EnemyPhase.drainPlayerPerTurn）
    /*
     * **每一位站著的人各震一次**（連線稽核 高-15）。原本只震 `cs.player`：座位 1 可以在
     * 師父第三條血面前無限疊爪力，座位 0 倒下之後照樣去震一個躺著的人。
     * 單機只有一位、紀錄照舊寫「震散了你」；兩個人時寫名字，不然兩行一模一樣分不出是誰。
     */
    if (ph?.drainPlayerPerTurn && !frozen) {
      for (const q of cs.players) {
        if (q.down) continue;
        const parts: string[] = [];
        for (const [name, n] of Object.entries(ph.drainPlayerPerTurn) as [StatusName, number][]) {
          const cut = Math.min(n, getStatus(q, name));
          if (cut > 0) { addStatus(q, name, -cut); parts.push(`${cut} 點${name}`); }
        }
        if (parts.length) log(cs, `${e.name}震散了${cs.players.length > 1 ? unitName(q) : '你'} ${parts.join('、')}`);
      }
    }
    if (def?.strengthEveryNTurns && !frozen && e.turnCount % def.strengthEveryNTurns === 0) addStatus(e, '爪力', 1);
    // 結算中毒：扣血走 damageEnemy（調息無敵、僕從護體才擋得到——審查 #10）；毒到換階段就這回合先擺架勢不出手（審查 #18）
    const phaseBefore = e.phase;
    damageEnemy(cs, e, tickPoison(e), { direct: true });
    if (e.dead || cs.phase !== 'player') return true;
    if (e.phase !== phaseBefore) { log(cs, `${e.name}換了個架勢`); decayTurnStatuses(e, ['定身']); return true; }
    // 出招途中換階段的偵測：被球球的反彈打過門檻（checkPhase 排好 onEnterMove）或血條式蹲下調息，
    // 尾端就不能再 advanceMove 把那招蓋掉（稽核 2026-09-04 H-1，反彈流打貓又時尾巴永遠放不出來的病根）
    const phaseAtAct = e.phase;
    // 沉睡：睡著的什麼都不做，每個牠的回合睡掉一層。**打痛牠會提早醒**（在 damageEnemy 裡處理，還會觸發 onWake）
    if (getStatus(e, '沉睡') > 0) {
      addStatus(e, '沉睡', -1);
      log(cs, `${e.name}睡得很熟，什麼都沒做`);
    }
    // 定身擋的是魔物**整個動作**，不只攻擊：偷小魚乾、召喚、疊防禦一律動不了
    // （原本只擋攻擊，使用者 2026-09-02 實玩：「定身敵人好像只能阻止攻擊？偷竊照偷」）
    else if (getStatus(e, '定身') > 0) {
      addStatus(e, '定身', -1);
      e.charged = false;   // 這一下被定掉，蓄力也一起作廢
      log(cs, `${e.name}被定住了，這回合動不了`);
    } else if (skipAct) {
      // 剛爬起來的這一拍不出手，頭上排好的那招留到下回合
    } else {
      // 蓄力由 runEnemyEffects 在第一次套加倍時自己用掉（不看意圖，見該函式註解）
      // 傷害與減益對每個站著的人各來一次（`ENEMY_HITS_EVERYONE`，使用者 2026-09-15）；`victim` 只給偷小魚乾那類單人效果
      const victim = pickVictim(cs);
      const hpBefore = new Map(cs.players.map((q) => [q, q.hp] as const));
      if (e.move.learned) log(cs, `${e.name}照著打出「${e.move.label}」`);   // 照著學的（鏡中球球）：紀錄要寫是哪張牌
      runEnemyEffects(cs, e, e.move.effects, e.charged, victim);
      // 被打掉血的秘寶效果（毛線手套）：每個人每回合最多一次
      for (const q of cs.players) {
        if (q.hp < (hpBefore.get(q) ?? q.hp) && cs.phase === 'player' && q.hitRelicTurn !== cs.turn) {
          q.hitRelicTurn = cs.turn;
          for (const rid of q.relics) { const h = relicById[rid]?.hooks.onHit; if (h) { fireRelic(cs, rid, q); applyEffects(cs, h, { self: q, source: 'relic' }); } }
        }
      }
    }
    decayTurnStatuses(e, ['定身']);   // 魔物的定身在出招那一拍消耗，這裡不再多扣一次（審查 #5）
    if (e.invulnIn > 0) e.invulnIn -= 1;   // 蹲下調息演完這回合就站起來，下回合開始照常挨打
    // 鱗甲：牠的回合結束長出等同層數的防禦（被打痛一下就剝落一層，見 damageEnemy）
    const plating = getStatus(e, '鱗甲');
    if (plating > 0 && !e.dead) gainBlock(cs, e, plating);
    // 不壞身：回合結束再加 N 點防禦，配上「敵方回合不歸零」就會一路疊上去
    const iron = getStatus(e, '不壞身');
    if (iron > 0 && !e.dead) gainBlock(cs, e, iron);
    // 消散：每個牠的回合結束少一層，歸零就散去。走 escape 那條路——不算打倒、不掉戰利品
    if (getStatus(e, '消散') > 0 && !e.dead) {
      addStatus(e, '消散', -1);
      if (getStatus(e, '消散') === 0) {
        e.dead = true; e.escaped = true; e.faded = true;   // 自己散掉的才算「什麼都沒留下」（見 types.ts 的 faded）
        log(cs, `${e.name}散去了`);
        markCombatWon(cs);
      }
    }
    if (e.dead) return true;
    // 還在睡就繼續顯示「呼呼大睡」；睡飽自然醒的（沒被打醒＝不生氣）從招式表第一招開始
    if (getStatus(e, '沉睡') > 0) e.move = SLEEP_MOVE;
    else if (e.move === SLEEP_MOVE) { e.moveIndex = -1; advanceMove(cs, e); }
    /**
     * **這一拍才換階段的，那一招留給下回合**。
     *
     * 血條式（`hpBar`）的「蹲下調息」是 `damageEnemy` 當場塞進 `e.move` 的（`REST_MOVE`）：
     * 牠出招途中被球球的反彈打完當前那條血，就在這一拍換了階段。照常排招會把調息蓋掉，
     * 師父白賺給玩家的那個回合整個消失（稽核 2026-09-10 高-1，實測被換成「十二連環」）。
     *
     * 判準是「**這一拍**換過階段」不是「現在這招是不是調息」：牠真的**演完**調息之後
     * 本來就該排下一招（塔主第三條血起身接亡命一擊那條測試守著這件事）。
     * 換階段發生在玩家回合中途時，`phaseAtAct` 已經是新階段、不會誤判。
     */
    else if (skipAct || e.phase !== phaseAtAct) { /* 剛爬起來的、或這一拍換過階段的，留著給下回合 */ }
    else advanceMove(cs, e);
  }
  return true;
}

/** 敵方回合收尾：蜷縮修剪、換回玩家回合（抽新手牌） */
export function finishEnemyTurn(cs: CombatState): void {
  cs.enemyQueue = [];
  // 蜷縮撐到你下回合開始：魔物打完了才修剪，守護符留 8 點、沒有守護符就歸零（審查 #1）
  cs.enemyActing = false;
  // 留蜷縮到下一回合的那幾件：真的留下東西才算發動（稽核 2026-09-10 中-3）
  // 每人照**自己**帶的守護符算（規則一）
  for (const p of cs.players) {
    // 穩住（噹噹）跟守護符那類秘寶**相加**，但只撐這一回合，下面用完就清掉
    const keep = relicSum(p.relics, 'blockKeep') + (p.blockKeepThisTurn ?? 0);
    // 球球已經倒下那一拍不演（稽核 2026-09-10 複核 低-5）：被穿透打死但身上還有蜷縮時會踩到
    if (keep > 0 && cs.phase === 'player' && p.block > 0 && !p.down) for (const rid of p.relics) if ((relicById[rid]?.hooks.blockKeep ?? 0) > 0) fireRelic(cs, rid, p);
    /*
     * 反震（噹噹 2026-09-17）：擺在修剪**之前**——蜷縮回合末本來就歸零，
     * 這張存的就是那份要被丟掉的。修剪之後才算的話永遠只剩守護符留下來的那幾點。
     */
    const conv = p.blockToThornsThisTurn;
    if (conv && p.block > 0 && !p.down) {
      /*
       * **只換「真的會被丟掉的那份」**（2026-09-17 稽核 中-2）。
       * 原本拿整個 `p.block` 去換，可是守護符（`blockKeep`）留下來的那幾點**不會被丟掉**——
       * 它們下一行就被 `Math.min(p.block, keep)` 留著了。整個拿去換等於同一份蜷縮
       * 既留著、又變成反彈，吃兩份，而且守護符越多吃得越兇。
       * 扣掉 `keep` 之後，上面那句「存的就是那份要被丟掉的」才真的成立。
       */
      const doomed = Math.max(0, p.block - keep);
      const got = Math.floor(doomed / conv.per) * conv.gain;
      if (got > 0) { addStatus(p, '反彈', got); log(cs, `${unitName(p)}把擋下來的力道存成 ${got} 點反彈`); }
    }
    p.blockToThornsThisTurn = undefined;
    p.block = Math.min(p.block, keep);
    p.blockKeepThisTurn = 0;
  }
  if (cs.phase === 'player') startPlayerTurn(cs);
}

export function combatResult(cs: CombatState): { hp: number; fishDelta: number; kills: number; potions: string[] } {
  return { hp: cs.player.hp, fishDelta: cs.fishDelta, kills: cs.kills, potions: [...cs.potions] };
}

/**
 * 這樣選合不合規矩：張數在範圍內、挑的都是給出來的那幾張。
 * 連線層送出前先問它（2026-09-14 夜間稽核 高-4），跟 `resolveChoice` 用同一套判準，不另寫一份。
 */
export function canResolveChoice(cs: CombatState, chosenUids: number[]): boolean {
  const pd = cs.pending;
  if (!pd) return false;
  const allowed = new Set(pd.cards.map((c) => c.uid));
  const uniq = [...new Set(chosenUids)];
  return uniq.length >= pd.min && uniq.length <= pd.max && uniq.every((u) => allowed.has(u));
}

export function resolveChoice(cs: CombatState, chosenUids: number[]): boolean {
  const pd = cs.pending;
  if (!pd || !canResolveChoice(cs, chosenUids)) return false;
  const uniq = [...new Set(chosenUids)];
  // 在等選牌的是誰，`pending` 自己記得（打那張牌時就寫進 ctx.self 了），不用再從外面傳座位進來
  const p = pd.ctx.self ?? cs.player;
  for (const uid of uniq) {
    switch (pd.purpose) {
      case 'exhaust': moveCard(p, uid, 'exhaust'); break;
      case 'retain': p.retained.push(uid); break;
      case 'discard': moveCard(p, uid, 'discard'); break;
      case 'recover': moveCard(p, uid, 'hand'); break;
      case 'scryDiscard': moveCard(p, uid, 'discard'); break;
    }
  }
  cs.pending = null;
  applyEffects(cs, pd.remaining, pd.ctx);
  return true;
}

/**
 * 這瓶忍具現在喝得下去嗎。連線層送出前先問它（2026-09-14 夜間稽核 高-3）：
 * 原本連線那邊只看「有沒有在選牌、有沒有倒下」，袋子裡沒這瓶、目標已經倒了也放行，
 * 主機發了號碼才在套用時被拒絕，那就不是「來不及」而是整場停掉。
 */
export function canUsePotion(cs: CombatState, potionId: string, targetUid?: number, seat = 0): boolean {
  if (cs.phase !== 'player' || cs.pending) return false;
  const p = cs.players[seat];
  if (!p || p.down || p.ready) return false;
  const def = potionById[potionId];
  if (!p.potions.includes(potionId) || !def) return false;   // 喝的是**自己**袋子裡的那瓶（規則一）
  // 用不出來的條件（起死回生丹的生命門檻、集中精神後的飯糰忍具）。畫面讀同一支把格子變灰並寫原因，見 `ui/screens/combat.ts` 的忍具列
  if (potionBlockedReason(p, def) !== null) return false;
  if (def.target === 'enemy' && (targetUid === undefined || !findEnemy(cs, targetUid))) return false;
  return true;
}

/**
 * 這瓶忍具**此刻**為什麼用不出來（`null`＝用得出來）。只看忍具本身與喝的那一位；
 * 階段、袋子裡有沒有、目標對不對歸 `canUsePotion`。
 * 引擎、畫面（格子變灰＋原因）、兩支機器人共用這一支，理由跟 `PotionDef.usable` 一樣：各寫一套遲早走鐘。
 *
 * 集中精神那條（2026-09-23 稽核 引擎 低-1）：打了集中精神之後這回合新增的飯糰一律變 0（`gainEnergy`），
 * 原本飯糰、兩顆飯糰照樣喝得下去——忍具被吃掉、飯糰一顆沒多、紀錄只有一行「用了」。
 * 牌面寫了「這回合不能再獲得飯糰」，規則本身沒錯，錯在讓玩家白白丟掉一支忍具。
 * 只擋**整支都是給飯糰**的（主控 2026-09-23 裁決）：半卷殘頁還抽得到兩張牌，照樣能喝，
 * 被擋掉的那兩顆由 `gainEnergy` 印一行「集中精神：這回合拿不到飯糰」，不會靜靜消失。
 */
export function potionBlockedReason(p: PlayerCombat, def: PotionDef): string | null {
  if (def.usable && !def.usable.check(p.hp, p.maxHp)) return def.usable.reason;
  if (p.energyGainBlockedThisPhase && def.effects.every((fx) => fx.kind === 'energy')) return '集中精神之後，這回合不能再獲得飯糰';
  return null;
}

/** `seat`＝誰喝這瓶忍具。忍具各帶各的（規則一），所以找的是那一位自己袋子裡的 */
export function usePotion(cs: CombatState, potionId: string, targetUid?: number, seat = 0): boolean {
  if (!canUsePotion(cs, potionId, targetUid, seat)) return false;
  const p = cs.players[seat]!;
  const def = potionById[potionId]!;
  p.potions.splice(p.potions.indexOf(potionId), 1);
  log(cs, `${unitName(p)}用了「${def.name}」`);
  applyEffects(cs, def.effects, { self: p, targetUid, source: 'potion' });
  // 用忍具之後的秘寶效果（舊毛巾、貓薄荷煙斗、九命鈴）
  if (cs.phase === 'player') for (const rid of p.relics) { const h = relicById[rid]?.hooks.onPotionUse; if (h) { fireRelic(cs, rid, p); applyEffects(cs, h, { self: p, source: 'relic' }); } }
  return true;
}
