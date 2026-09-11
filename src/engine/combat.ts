import { cardById } from '../content/cards';
import { encounterById, enemyById } from '../content/enemies';
import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import { advanceMove, aliveEnemies, damageEnemy, damagePlayer, drawCards, findEnemy, fireRelic, gainBlock, gainStealth, giveCards, log, makeEnemy, markRelic, pickVictim, runEnemyEffects, SLEEP_MOVE, willRevive } from './actions';
import { coopHpMul } from './coopscale';
import { cardStats, discardHand, moveCard } from './deck';
import { applyEffects } from './effects';
import type { Rng } from './rng';
import { addStatus, decayTurnStatuses, getStatus, removeStatus, tickPoison } from './statuses';
import { TURN_DECAY } from './types';
import type { CardInstance, CombatState, EffectCtx, PlayerCombat, StatusName, EnemyCombat } from './types';

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
}): CombatState {
  const enc = encounterById[input.encounterId];
  if (!enc) throw new Error(`未知的遭遇：${input.encounterId}`);
  const player: PlayerCombat = {
    seat: 0,
    relics: [...input.relics], potions: [...input.potions],
    hp: input.hp, maxHp: input.maxHp, block: 0, armour: 0, statuses: {},
    energy: 0, maxEnergy: 3 + relicSum(input.relics, 'energyPerTurn'),
    hand: [], drawPile: input.rng.shuffle(input.deck), discardPile: [], exhaustPile: [],
    retained: [], powers: [], doubleNext: 0, drawNextTurn: 0,
    noAttacks: false, immune: false, attackedThisTurn: false, cardsPlayedThisTurn: 0,
    firstStealthGiven: false, firstCardPlayed: false, lethalPrevented: false, freshDebuffs: {}, fishDelta: 0,
  };
  const cs: CombatState = {
    rng: input.rng,
    players: [player],
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
    stolenFish: 0, energyGain: 0, damageDealt: 0, relicFired: [], kills: 0, cardsPlayed: 0, nextEnemyUid: 1,
    // 魔物塞牌用的編號從牌組最大編號 +1 起跳，不會跟原本的牌撞號
    nextCardUid: input.deck.reduce((m, c) => Math.max(m, c.uid), 0) + 1,
  };
  // 兩個人一起打時魔物血量放大（只放大血量，傷害不動——見 `coopscale.ts`）。
  // 一個人時 `coopHpMul` 一定回 1，所以單機的數字一個位元都沒變
  const hpMul = (enc.hpScale ?? 1) * (input.mods?.hpMul ?? 1) * coopHpMul(enc.pool, input.players ?? 1);
  enc.enemies.forEach((id, k) => cs.enemies.push(makeEnemy(cs, id, k, hpMul)));
  const strength = (enc.strength ?? 0) + (input.mods?.strength ?? 0);   // 魔氣（見 EncounterDef.strength）＋難度
  if (strength) for (const e of cs.enemies) addStatus(e, '爪力', strength);
  cs.mods = { hpMul, strength };   // 召喚出來的也照這組套（審查 #9；含遭遇的 hpScale，2026-09-02 稽核 L-2）
  if (player.relics.some((id) => relicById[id]?.hooks.firstAttackDouble)) player.firstAttackDouble = true;   // 秘笈
  for (const e of cs.enemies) {
    // 開場台詞從 line 與 lines 裡挑一句。不用戰鬥亂數（會動到整場的抽牌順序、機器人錨值），
    // 用亂數種子的目前狀態加編號做一個穩定的選法：同一局同一場永遠同一句，不同局會不同
    const def = enemyById[e.enemyId];
    const pool = [def?.line ?? '', ...(def?.lines ?? [])].filter((l) => l.length > 0);
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
    if (hooks) { fireRelic(cs, rid); applyEffects(cs, hooks, { self: player, source: 'relic' }); }
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

export function startPlayerTurn(cs: CombatState): void {
  if (cs.phase !== 'player') return;
  cs.turn += 1;
  cs.hits.length = 0;   // 分段演出只看這一拍新增的幾筆，上一回合的不用留著（稽核 2026-09-05 夜 低-1）
  // 每位玩家各開一次自己的回合（連線版第一步 2026-09-11）。單機就是跑一次，順序與結果完全沒變。
  // 中途被噎到打倒就整個停下來——後面的人不用再抽牌了
  for (const p of cs.players) { if (p.down) continue; startSeatTurn(cs, p); if (cs.phase !== 'player') return; }
}

/** 一位玩家的回合開始：狀態結算、補飽足、抽新手牌。整場只有一份的事情在 `startPlayerTurn` 做完了 */
function startSeatTurn(cs: CombatState, p: PlayerCombat): void {
  // 蜷縮不在這裡清：回合結束、魔物打完才照守護符留量修剪（見 endTurn 尾端）——
  // 以前在這裡歸零，開戰拿到的蜷縮（斗笠、鐵項圈、龜甲、暖毯）從來沒生效過（審查 #1）
  p.freshDebuffs = {};   // 先清，這樣回合開始的能力若自己疊減益也算「本回合拿到的」
  if (cs.turn > 1) p.firstStealthGiven = false;   // 第一回合不清：開戰的鈴鐺已經吃過紙袋的加成（審查 #14）
  const poison = getStatus(p, '噎到');
  if (poison > 0) { addStatus(p, '噎到', -1); damagePlayer(cs, p, poison, { direct: true, victim: p }); if (cs.phase !== 'player') return; }
  const dive = getStatus(p, '潛水');
  if (dive > 0) { removeStatus(p, '潛水'); gainStealth(cs, dive, p); }
  const iron = getStatus(p, '鐵布衫');
  if (iron > 0) { removeStatus(p, '鐵布衫'); gainBlock(cs, p, iron); }   // 走 gainBlock：跟牌上其他蜷縮一樣吃貓步（稽核 低-1）
  p.energy = p.maxEnergy + (cs.turn === 1 ? relicSum(p.relics, 'firstTurnEnergy') : 0);
  // 只在第一回合給的那幾件（稽核 2026-09-10 中-3）：第一回合就是它們唯一的發動時刻，
  // 不記的話玩家看到的只是「這回合飯糰比較多」，不知道是誰給的
  if (cs.turn === 1) for (const rid of p.relics) if ((relicById[rid]?.hooks.firstTurnEnergy ?? 0) > 0) fireRelic(cs, rid);
  // 回合開始的能力排在飽足設好之後：萬花筒抽到嘴饞扣的飯糰才不會被上一行蓋掉（審查 #15）
  for (const pw of p.powers) if (pw.trigger === 'turnStart') applyEffects(cs, pw.effects, { self: p, source: 'power' });
  p.noAttacks = false; p.immune = false; p.attackedThisTurn = false; p.cardsPlayedThisTurn = 0;
  p.taunt = false;   // 「我來擋」只保護一輪（連線版 2026-09-11）
  p.firstCardPlayed = false; p.doubleNext = 0;   // 蓄力只撐到回合結束；秘笈的第一擊加倍走自己的旗標（審查 #8）
  const n = 5 + p.drawNextTurn + (cs.turn === 1 ? relicSum(p.relics, 'firstTurnDraw') : 0);
  if (cs.turn === 1) for (const rid of p.relics) if ((relicById[rid]?.hooks.firstTurnDraw ?? 0) > 0) fireRelic(cs, rid);
  p.drawNextTurn = 0;
  drawCards(cs, n, p);
  // 每回合開始的秘寶效果（鐵砂袋、靈貓鈴）：排在抽牌之後，抽到的牌才算進這回合的手牌
  for (const rid of p.relics) { const h = relicById[rid]?.hooks.turnStart; if (h) { fireRelic(cs, rid); applyEffects(cs, h, { self: p, source: 'relic' }); } }
  for (const c of [...p.hand]) {
    const cu = cardById[c.cardId]?.curse;
    if (cu?.onTurnStart) { log(cs, `「${cardById[c.cardId]?.name}」發作`); damagePlayer(cs, p, cu.onTurnStart, { direct: true, victim: p }); }
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
  if (st.def.type === '攻擊' && getStatus(p, '定身') > 0) return { ok: false, reason: '被纏住了，打不出攻擊牌' };
  let cost = st.cost;
  if (!p.firstCardPlayed) cost = Math.max(0, cost - relicSum(p.relics, 'firstCardDiscount'));
  if (!p.firstCardEver) cost = Math.max(0, cost - relicSum(p.relics, 'firstCardDiscountCombat'));   // 破卷軸：整場只有第一張（審查 #7）
  if (cost > p.energy) return { ok: false, reason: '餓扁了' };
  if (st.def.target === 'enemy' && (targetUid === undefined || !findEnemy(cs, targetUid))) return { ok: false, reason: '要選一隻魔物' };
  return { ok: true, cost };
}

/** `seat`＝誰打這張牌（連線版第一步 2026-09-11）。連線層要送過去的就是「座位＋牌號＋目標」這三個數字 */
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
    if (!p.firstCardPlayed) for (const rid of p.relics) if ((relicById[rid]?.hooks.firstCardDiscount ?? 0) > 0) fireRelic(cs, rid);
    if (!p.firstCardEver) for (const rid of p.relics) if ((relicById[rid]?.hooks.firstCardDiscountCombat ?? 0) > 0) fireRelic(cs, rid);
  }
  p.energy -= chk.cost;
  p.hand.splice(p.hand.indexOf(card), 1);
  const toExhaust = st.keywords.includes('消耗') || st.def.type === '能力';
  (toExhaust ? p.exhaustPile : p.discardPile).push(card);
  const ctx: EffectCtx = { self: p, targetUid, cardUid: uid, cardId: st.def.id, cardUpgraded: card.upgraded, cardType: st.def.type, source: 'card', combo: p.cardsPlayedThisTurn };
  if (st.def.type === '攻擊' && p.doubleNext > 0) { ctx.doubleDamage = true; p.doubleNext = 0; }
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
  log(cs, `球球打出「${st.name}」`);
  // 秘寶的第 N 張補抽排在牌效果之前：這張牌若要選牌，候選才不會被之後的補抽動到
  for (const rid of p.relics) {
    // 金爪套同時掛兩個第 N 張的掛鉤，分開叫會連印兩行「發動」（稽核 2026-09-10 中-2）
    const h = relicById[rid]?.hooks.drawOnNthCard;
    const e = relicById[rid]?.hooks.energyOnNthCard;
    const drew = !!h && p.cardsPlayedThisTurn === h.n;
    const gave = !!e && p.cardsPlayedThisTurn === e.n;
    if (drew || gave) fireRelic(cs, rid);
    if (drew) drawCards(cs, h!.draw);
    if (gave) { p.energy += e!.energy; cs.energyGain += e!.energy; }
  }
  applyEffects(cs, st.effects, ctx);
  // 這張牌這場打過幾次（分身術疊傷害用）：效果結算完才 +1，第一次打是 0 次
  cs.cardPlays = cs.cardPlays ?? {};
  cs.cardPlays[uid] = (cs.cardPlays[uid] ?? 0) + 1;
  // 打出攻擊牌之後的秘寶效果（逗貓棒、貓抓板）：牌效果算完才觸發，打贏了就不用
  if (st.def.type === '攻擊' && cs.phase === 'player') {
    for (const rid of p.relics) {
      const h = relicById[rid]?.hooks.onAttackPlayed;
      if (!h || (h.firstEachTurn && !firstAttack) || (h.chance !== undefined && !cs.rng.chance(h.chance))) continue;
      fireRelic(cs, rid);
      applyEffects(cs, h.effects, { self: p, source: 'relic' });
    }
  }
  // 打出**技能**牌會惹到的兩種魔物（2026-09-02 第二波）：
  // 詛咒（詛咒神官、詛咒老住持）＝往你的抽牌堆洗爛牌；憤怒（赤鬼武夫）＝牠自己 +爪力。
  // 能力牌不算——規格只點名技能牌；戰鬥雜牌（黏液、眼冒金星）也不算，不然「打出去就消耗」對詛咒魔物會變成打一張補一張（稽核 2026-09-04 午後 高-1）
  if (st.def.type === '技能' && !st.def.combatOnly && cs.phase === 'player') {
    for (const e of aliveEnemies(cs)) {
      const d = enemyById[e.enemyId];
      if (d?.hexOnSkill) giveCards(cs, e, d.hexOnSkill.cardId, d.hexOnSkill.n, 'draw');
      // 憤怒每回合最多觸發一次（跟毛線手套 onHit 的 hitRelicTurn 同一套）：三隻第二關關主主招都是三段，
      // 每張技能牌都 +1／+2 會讓「先擋再打」的牌組被判死刑（全面體檢 2026-09-05；下一輪平衡拍板）
      if (d?.angerOnSkill && e.angerTurn !== cs.turn) { e.angerTurn = cs.turn; addStatus(e, '爪力', d.angerOnSkill); log(cs, `${e.name}被激怒了`); }
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
  log(cs, '等太久了，替走開的那位收了回合');
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
    if (cu?.onTurnEnd) { log(cs, `「${cardById[c.cardId]?.name}」發作`); damagePlayer(cs, p, cu.onTurnEnd, { direct: true, victim: p }); }
  }
  if (cs.phase !== 'player') return;
  if (!p.attackedThisTurn) {
    for (const rid of p.relics) { const h = relicById[rid]?.hooks.turnEndNoAttack; if (h) { fireRelic(cs, rid); applyEffects(cs, h, { self: p, source: 'relic' }); } }
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
    // 牠照樣進佇列跑 stepEnemyTurn（噎到、鱗甲、定身要正常結算），只靠 justRevived 跳過「出招」那一段（稽核 2026-09-04 M-1）
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
   * 牠們的預告、鱗甲、噎到、定身層數全部原封不動留到下一輪，正是「這一輪沒發生」的語意。
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
    if (ph?.drainPlayerPerTurn && !frozen) {
      const parts: string[] = [];
      for (const [name, n] of Object.entries(ph.drainPlayerPerTurn) as [StatusName, number][]) {
        const cut = Math.min(n, getStatus(cs.player, name));
        if (cut > 0) { addStatus(cs.player, name, -cut); parts.push(`${cut} 點${name}`); }
      }
      if (parts.length) log(cs, `${e.name}震散了你 ${parts.join('、')}`);
    }
    if (def?.strengthEveryNTurns && !frozen && e.turnCount % def.strengthEveryNTurns === 0) addStatus(e, '爪力', 1);
    // 結算噎到：扣血走 damageEnemy（調息無敵、僕從護體才擋得到——審查 #10）；毒到換階段就這回合先擺架式不出手（審查 #18）
    const phaseBefore = e.phase;
    damageEnemy(cs, e, tickPoison(e), { direct: true });
    if (e.dead || cs.phase !== 'player') return true;
    if (e.phase !== phaseBefore) { log(cs, `${e.name}換了個架式`); decayTurnStatuses(e, ['定身']); return true; }
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
      const victim = pickVictim(cs);   // 這一招隨機打一位還站著的（規則二）
      const hpBefore = victim.hp;
      if (e.move.learned) log(cs, `${e.name}照著打出「${e.move.label}」`);   // 照著學的（鏡中球球）：紀錄要寫是哪張牌
      runEnemyEffects(cs, e, e.move.effects, e.charged, victim);
      // 被打掉血的秘寶效果（毛線手套）：每回合最多一次
      if (victim.hp < hpBefore && cs.phase === 'player' && victim.hitRelicTurn !== cs.turn) {
        victim.hitRelicTurn = cs.turn;
        for (const rid of victim.relics) { const h = relicById[rid]?.hooks.onHit; if (h) { fireRelic(cs, rid); applyEffects(cs, h, { self: victim, source: 'relic' }); } }
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
        if (aliveEnemies(cs).length === 0 && cs.phase === 'player') cs.phase = 'won';
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
    const keep = relicSum(p.relics, 'blockKeep');
    // 球球已經倒下那一拍不演（稽核 2026-09-10 複核 低-5）：被穿透打死但身上還有蜷縮時會踩到
    if (keep > 0 && cs.phase === 'player' && p.block > 0) for (const rid of p.relics) if ((relicById[rid]?.hooks.blockKeep ?? 0) > 0) fireRelic(cs, rid);
    p.block = Math.min(p.block, keep);
  }
  if (cs.phase === 'player') startPlayerTurn(cs);
}

export function combatResult(cs: CombatState): { hp: number; fishDelta: number; kills: number; potions: string[] } {
  return { hp: cs.player.hp, fishDelta: cs.fishDelta, kills: cs.kills, potions: [...cs.potions] };
}

export function resolveChoice(cs: CombatState, chosenUids: number[]): boolean {
  const pd = cs.pending;
  if (!pd) return false;
  const allowed = new Set(pd.cards.map((c) => c.uid));
  const uniq = [...new Set(chosenUids)];
  if (uniq.length < pd.min || uniq.length > pd.max || uniq.some((u) => !allowed.has(u))) return false;
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

/** `seat`＝誰喝這瓶忍具。忍具各帶各的（規則一），所以找的是那一位自己袋子裡的 */
export function usePotion(cs: CombatState, potionId: string, targetUid?: number, seat = 0): boolean {
  if (cs.phase !== 'player' || cs.pending) return false;
  const p = cs.players[seat];
  if (!p || p.down || p.ready) return false;
  const i = p.potions.indexOf(potionId);   // 喝的是**自己**袋子裡的那瓶（規則一）
  const def = potionById[potionId];
  if (i < 0 || !def) return false;
  // 有使用條件的（起死回生丹：生命低於三成才准用）。畫面讀同一個 `usable` 把格子變灰並寫原因，見 `ui/screens/combat.ts` 的忍具列
  if (def.usable && !def.usable.check(p.hp, p.maxHp)) return false;
  if (def.target === 'enemy' && (targetUid === undefined || !findEnemy(cs, targetUid))) return false;
  p.potions.splice(i, 1);
  log(cs, `球球用了「${def.name}」`);
  applyEffects(cs, def.effects, { self: p, targetUid, source: 'potion' });
  // 用忍具之後的秘寶效果（舊毛巾、貓薄荷煙斗、九命鈴）
  if (cs.phase === 'player') for (const rid of p.relics) { const h = relicById[rid]?.hooks.onPotionUse; if (h) { fireRelic(cs, rid); applyEffects(cs, h, { self: p, source: 'relic' }); } }
  return true;
}
