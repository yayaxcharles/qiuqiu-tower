import { cardById } from '../content/cards';
import { encounterById, enemyById } from '../content/enemies';
import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import { advanceMove, aliveEnemies, damageEnemy, damagePlayer, drawCards, findEnemy, gainBlock, gainStealth, giveCards, log, makeEnemy, runEnemyEffects, SLEEP_MOVE } from './actions';
import { cardStats, discardHand, moveCard } from './deck';
import { applyEffects } from './effects';
import type { Rng } from './rng';
import { addStatus, decayTurnStatuses, getStatus, removeStatus, tickPoison } from './statuses';
import { TURN_DECAY } from './types';
import type { CardInstance, CombatState, EffectCtx, PlayerCombat, StatusName } from './types';

type NumHook = 'firstTurnDraw' | 'firstTurnEnergy' | 'energyPerTurn' | 'firstCardDiscount' | 'firstCardDiscountCombat' | 'blockKeep' | 'killHeal' | 'killStrength' | 'killFish' | 'combatEndHeal';
function relicSum(relics: string[], key: NumHook): number {
  return relics.reduce((s, id) => s + (relicById[id]?.hooks[key] ?? 0), 0);
}

export function startCombat(input: {
  hp: number; maxHp: number; deck: CardInstance[]; relics: string[]; potions: string[]; encounterId: string; rng: Rng;
  /** 難度旋鈕（見 content/difficulty.ts）：血量倍率乘在遭遇的 hpScale 上、爪力加在遭遇的魔氣上 */
  mods?: { hpMul?: number; strength?: number; startBlock?: number };
}): CombatState {
  const enc = encounterById[input.encounterId];
  if (!enc) throw new Error(`未知的遭遇：${input.encounterId}`);
  const player: PlayerCombat = {
    hp: input.hp, maxHp: input.maxHp, block: 0, armour: 0, statuses: {},
    energy: 0, maxEnergy: 3 + relicSum(input.relics, 'energyPerTurn'),
    hand: [], drawPile: input.rng.shuffle(input.deck), discardPile: [], exhaustPile: [],
    retained: [], powers: [], doubleNext: 0, drawNextTurn: 0,
    noAttacks: false, immune: false, attackedThisTurn: false, cardsPlayedThisTurn: 0,
    firstStealthGiven: false, firstCardPlayed: false, lethalPrevented: false, freshDebuffs: {},
  };
  const cs: CombatState = {
    rng: input.rng, player, enemies: [], relics: [...input.relics], potions: [...input.potions],
    turn: 0, phase: 'player', pending: null, log: [], encounterId: input.encounterId, endTurnRequested: false,
    stolenFish: 0, fishDelta: 0, kills: 0, cardsPlayed: 0, nextEnemyUid: 1,
    // 魔物塞牌用的編號從牌組最大編號 +1 起跳，不會跟原本的牌撞號
    nextCardUid: input.deck.reduce((m, c) => Math.max(m, c.uid), 0) + 1,
  };
  enc.enemies.forEach((id, k) => cs.enemies.push(makeEnemy(cs, id, k, (enc.hpScale ?? 1) * (input.mods?.hpMul ?? 1))));
  const strength = (enc.strength ?? 0) + (input.mods?.strength ?? 0);   // 魔氣（見 EncounterDef.strength）＋難度
  if (strength) for (const e of cs.enemies) addStatus(e, '爪力', strength);
  cs.mods = { hpMul: (enc.hpScale ?? 1) * (input.mods?.hpMul ?? 1), strength };   // 召喚出來的也照這組套（審查 #9；含遭遇的 hpScale，2026-09-02 稽核 L-2）
  if (cs.relics.some((id) => relicById[id]?.hooks.firstAttackDouble)) cs.player.firstAttackDouble = true;   // 秘笈
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
  for (const rid of cs.relics) {
    const hooks = relicById[rid]?.hooks.combatStart;
    if (hooks) applyEffects(cs, hooks, { source: 'relic' });
  }
  // 暖毯：打盹後帶進來的蜷縮（run.ts 的 rest 記、beginCombat 帶進來）
  if (input.mods?.startBlock) { cs.player.block += input.mods.startBlock; log(cs, `暖毯還熱著，先有 ${input.mods.startBlock} 點蜷縮`); }
  startPlayerTurn(cs);
  return cs;
}

export function startPlayerTurn(cs: CombatState): void {
  if (cs.phase !== 'player') return;
  const p = cs.player;
  cs.turn += 1;
  // 蜷縮不在這裡清：回合結束、魔物打完才照守護符留量修剪（見 endTurn 尾端）——
  // 以前在這裡歸零，開戰拿到的蜷縮（斗笠、鐵項圈、龜甲、暖毯）從來沒生效過（審查 #1）
  p.freshDebuffs = {};   // 先清，這樣回合開始的能力若自己疊減益也算「本回合拿到的」
  if (cs.turn > 1) p.firstStealthGiven = false;   // 第一回合不清：開戰的鈴鐺已經吃過紙袋的加成（審查 #14）
  const poison = getStatus(p, '噎到');
  if (poison > 0) { addStatus(p, '噎到', -1); damagePlayer(cs, p, poison, { direct: true }); if (cs.phase !== 'player') return; }
  const dive = getStatus(p, '潛水');
  if (dive > 0) { removeStatus(p, '潛水'); gainStealth(cs, dive); }
  const iron = getStatus(p, '鐵布衫');
  if (iron > 0) { removeStatus(p, '鐵布衫'); gainBlock(cs, p, iron); }   // 走 gainBlock：跟牌上其他蜷縮一樣吃貓步（稽核 低-1）
  p.energy = p.maxEnergy + (cs.turn === 1 ? relicSum(cs.relics, 'firstTurnEnergy') : 0);
  // 回合開始的能力排在飽足設好之後：萬花筒抽到嘴饞扣的飯糰才不會被上一行蓋掉（審查 #15）
  for (const pw of p.powers) if (pw.trigger === 'turnStart') applyEffects(cs, pw.effects, { source: 'power' });
  p.noAttacks = false; p.immune = false; p.attackedThisTurn = false; p.cardsPlayedThisTurn = 0;
  p.firstCardPlayed = false; p.doubleNext = 0;   // 蓄力只撐到回合結束；秘笈的第一擊加倍走自己的旗標（審查 #8）
  const n = 5 + p.drawNextTurn + (cs.turn === 1 ? relicSum(cs.relics, 'firstTurnDraw') : 0);
  p.drawNextTurn = 0;
  drawCards(cs, n);
  // 每回合開始的秘寶效果（鐵砂袋、靈貓鈴）：排在抽牌之後，抽到的牌才算進這回合的手牌
  for (const rid of cs.relics) { const h = relicById[rid]?.hooks.turnStart; if (h) applyEffects(cs, h, { source: 'relic' }); }
  for (const c of [...p.hand]) {
    const cu = cardById[c.cardId]?.curse;
    if (cu?.onTurnStart) { log(cs, `「${cardById[c.cardId]?.name}」發作`); damagePlayer(cs, p, cu.onTurnStart, { direct: true }); }
  }
}

export function canPlay(cs: CombatState, uid: number, targetUid?: number): { ok: true; cost: number } | { ok: false; reason: string } {
  if (cs.phase !== 'player') return { ok: false, reason: '戰鬥已結束' };
  if (cs.pending) return { ok: false, reason: '先把牌選完' };
  const card = cs.player.hand.find((c) => c.uid === uid);
  if (!card) return { ok: false, reason: '不在手牌' };
  const st = cardStats(card);
  if (st.keywords.includes('不可打出')) return { ok: false, reason: '不可打出' };
  if (st.def.type === '攻擊' && cs.player.noAttacks) return { ok: false, reason: '本回合不能再打攻擊牌' };
  // 球球被定身：這回合攻擊牌整排打不出（毛線球怪的「纏住」）。
  // 這一側漏了很久——引擎本來只實作魔物被定身那一半，玩家身上的定身完全沒作用
  if (st.def.type === '攻擊' && getStatus(cs.player, '定身') > 0) return { ok: false, reason: '被纏住了，打不出攻擊牌' };
  let cost = st.cost;
  if (!cs.player.firstCardPlayed) cost = Math.max(0, cost - relicSum(cs.relics, 'firstCardDiscount'));
  if (!cs.player.firstCardEver) cost = Math.max(0, cost - relicSum(cs.relics, 'firstCardDiscountCombat'));   // 破卷軸：整場只有第一張（審查 #7）
  if (cost > cs.player.energy) return { ok: false, reason: '餓扁了' };
  if (st.def.target === 'enemy' && (targetUid === undefined || !findEnemy(cs, targetUid))) return { ok: false, reason: '要選一隻魔物' };
  return { ok: true, cost };
}

export function playCard(cs: CombatState, uid: number, targetUid?: number): boolean {
  const chk = canPlay(cs, uid, targetUid);
  if (!chk.ok) return false;
  const p = cs.player;
  const card = p.hand.find((c) => c.uid === uid) as CardInstance;
  const st = cardStats(card);
  p.energy -= chk.cost;
  p.hand.splice(p.hand.indexOf(card), 1);
  const toExhaust = st.keywords.includes('消耗') || st.def.type === '能力';
  (toExhaust ? p.exhaustPile : p.discardPile).push(card);
  const ctx: EffectCtx = { targetUid, cardUid: uid, cardId: st.def.id, cardUpgraded: card.upgraded, cardType: st.def.type, source: 'card', combo: p.cardsPlayedThisTurn };
  if (st.def.type === '攻擊' && p.doubleNext > 0) { ctx.doubleDamage = true; p.doubleNext = 0; }
  if (st.def.type === '攻擊' && p.firstAttackDouble) { ctx.doubleDamage = true; p.firstAttackDouble = false; log(cs, '秘笈：第一擊加倍'); }
  p.cardsPlayedThisTurn += 1;
  cs.cardsPlayed += 1;
  p.firstCardPlayed = true;
  p.firstCardEver = true;
  const firstAttack = st.def.type === '攻擊' && !p.attackedThisTurn;
  if (st.def.type === '攻擊') p.attackedThisTurn = true;
  log(cs, `球球打出「${st.name}」`);
  // 秘寶的第 N 張補抽排在牌效果之前：這張牌若要選牌，候選才不會被之後的補抽動到
  for (const rid of cs.relics) {
    const h = relicById[rid]?.hooks.drawOnNthCard;
    if (h && p.cardsPlayedThisTurn === h.n) drawCards(cs, h.draw);
    const e = relicById[rid]?.hooks.energyOnNthCard;
    if (e && p.cardsPlayedThisTurn === e.n) p.energy += e.energy;
  }
  applyEffects(cs, st.effects, ctx);
  // 這張牌這場打過幾次（分身術疊傷害用）：效果結算完才 +1，第一次打是 0 次
  cs.cardPlays = cs.cardPlays ?? {};
  cs.cardPlays[uid] = (cs.cardPlays[uid] ?? 0) + 1;
  // 打出攻擊牌之後的秘寶效果（逗貓棒、貓抓板）：牌效果算完才觸發，打贏了就不用
  if (st.def.type === '攻擊' && cs.phase === 'player') {
    for (const rid of cs.relics) {
      const h = relicById[rid]?.hooks.onAttackPlayed;
      if (!h || (h.firstEachTurn && !firstAttack) || (h.chance !== undefined && !cs.rng.chance(h.chance))) continue;
      applyEffects(cs, h.effects, { source: 'relic' });
    }
  }
  // 打出**技能**牌會惹到的兩種魔物（2026-09-02 第二波）：
  // 詛咒（詛咒神官、詛咒老住持）＝往你的抽牌堆洗爛牌；憤怒（赤鬼武夫）＝牠自己 +爪力。
  // 能力牌不算——規格只點名技能牌；戰鬥雜牌（黏液、眼冒金星）也不算，不然「打出去就消耗」對詛咒魔物會變成打一張補一張（稽核 2026-09-04 午後 高-1）
  if (st.def.type === '技能' && !st.def.combatOnly && cs.phase === 'player') {
    for (const e of aliveEnemies(cs)) {
      const d = enemyById[e.enemyId];
      if (d?.hexOnSkill) giveCards(cs, e, d.hexOnSkill.cardId, d.hexOnSkill.n, 'draw');
      if (d?.angerOnSkill) { addStatus(e, '爪力', d.angerOnSkill); log(cs, `${e.name}被激怒了`); }
    }
  }
  return true;
}

/**
 * 結束回合＝敵方回合前半 → 魔物一隻一隻行動 → 收尾。三段拆開是給畫面逐隻演出用的
 * （使用者 2026-09-03：「怪物一次打完所有動作，看不出來誰動了」）；引擎、機器人、測試一律走這個包起來的版本，結果跟拆開前一模一樣。
 */
export function endTurn(cs: CombatState): void {
  if (!beginEnemyTurn(cs)) return;
  while (stepEnemyTurn(cs)) { /* 一隻一隻 */ }
  finishEnemyTurn(cs);
}

/** 敵方回合前半：詛咒發作、沒攻擊的鉤子、棄手牌、減益衰減、同伴復活、魔物防禦歸零，並排好這回合要行動的魔物。回 false＝這回合結束不了（不在玩家回合、還有牌要選、或球球被詛咒打倒） */
/** 魔氣暴走從第幾回合開始（玩家回合的計數） */
export const RAMPAGE_TURN = 10;   // 8 太早：機器人打關主平均 9～14 回合，等於每場關主戰都被加成，第一關到達率掉 8 個百分點（2026-09-04 實測）

export function beginEnemyTurn(cs: CombatState): boolean {
  if (cs.phase !== 'player' || cs.pending) return false;
  cs.endTurnRequested = false;   // 這個請求到這裡就兌現了
  const p = cs.player;
  for (const c of [...p.hand]) {
    const cu = cardById[c.cardId]?.curse;
    if (cu?.onTurnEnd) { log(cs, `「${cardById[c.cardId]?.name}」發作`); damagePlayer(cs, p, cu.onTurnEnd, { direct: true }); }
  }
  if (cs.phase !== 'player') return false;
  if (!p.attackedThisTurn) {
    for (const rid of cs.relics) { const h = relicById[rid]?.hooks.turnEndNoAttack; if (h) applyEffects(cs, h, { source: 'relic' }); }
    for (const pw of p.powers) if (pw.trigger === 'turnEndNoAttack') applyEffects(cs, pw.effects, { source: 'power' });
  }
  // 只限本回合的能力到這裡就過期。放在「沒出攻擊牌」的結算之後：
  // 那一段也會觸發能力，先讓它算完再清，不然本回合最後一次會少算。
  p.powers = p.powers.filter((pw) => !pw.thisTurn);
  discardHand(p);
  // 球球的減益衰減：這回合自己給自己疊的先放過一次（下一回合結束才開始減），魔物施加的照常減
  for (const name of TURN_DECAY) {
    if (p.freshDebuffs[name]) { delete p.freshDebuffs[name]; continue; }
    if (getStatus(p, name) > 0) addStatus(p, name, -1);
  }
  // 「一起死才算數」：同組只要還有一隻活著，倒下的同伴就爬起來。
  //
  // 放在魔物行動之前：爬起來的當回合就會出手，玩家才感覺得到「沒清乾淨的代價」。
  // 逃走的（`escaped`）不算倒下，不會被扶起來。
  // 擊殺數要扣回去——同一隻爬起來再打倒不該重複計數。
  for (const e of cs.enemies) {
    const rdef = enemyById[e.enemyId];
    if (!e.dead || e.escaped || !rdef?.reviveGroup || rdef.neverRevive) continue;
    const hasFriend = cs.enemies.some((o) => o !== e && !o.dead
      && enemyById[o.enemyId]?.reviveGroup === rdef.reviveGroup);
    // 同組沒人站著＝真的倒了：倒數歸零，之後不再占召喚上限的名額（2026-09-03 稽核）
    if (!hasFriend) { e.reviveIn = 0; continue; }
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
  if (cs.turn >= RAMPAGE_TURN) {
    const alive = cs.enemies.filter((e) => !e.dead);
    for (const e of alive) addStatus(e, '爪力', 1);
    if (alive.length) log(cs, cs.turn === RAMPAGE_TURN ? '魔氣開始暴走了！魔物全體爪力 +1，之後每回合都會再加' : '魔氣暴走：魔物全體爪力 +1');
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
  return true;
}

/** 讓排隊的下一隻魔物行動。回 false＝這回合沒有魔物要動了；回 true 但什麼都沒發生＝那隻已經倒下或球球已倒（跳過） */
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
    // 飛行：牠自己的回合一開始就補回滿層——上一輪被你打下來，這一輪牠又飛起來了
    if (def?.flying) { removeStatus(e, '飛行'); addStatus(e, '飛行', def.flying); }
    // 虛化（2026-09-03 菁英擴充）：牠的每個回合開始切換一次，所以是虛一回合、實一回合。
    // 開戰帶著虛化（makeEnemy），所以玩家的第一回合打不動牠，第二回合才是輸出窗口
    if (def?.phasing) {
      if (getStatus(e, '虛化') > 0) { removeStatus(e, '虛化'); log(cs, `${e.name}實體化了，這回合打得進去`); }
      else { addStatus(e, '虛化', 1); log(cs, `${e.name}變得半透明`); }
    }
    const ph = def?.phases?.[e.phase - 1];
    if (ph?.strengthPerTurn) addStatus(e, '爪力', ph.strengthPerTurn);
    // 師父二、三階段：每回合先把你堆的爪力、貓步震掉幾點（見 EnemyPhase.drainPlayerPerTurn）
    if (ph?.drainPlayerPerTurn) {
      const parts: string[] = [];
      for (const [name, n] of Object.entries(ph.drainPlayerPerTurn) as [StatusName, number][]) {
        const cut = Math.min(n, getStatus(cs.player, name));
        if (cut > 0) { addStatus(cs.player, name, -cut); parts.push(`${cut} 點${name}`); }
      }
      if (parts.length) log(cs, `${e.name}震散了你 ${parts.join('、')}`);
    }
    if (def?.strengthEveryNTurns && e.turnCount % def.strengthEveryNTurns === 0) addStatus(e, '爪力', 1);
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
      const charged = e.charged;
      if (e.move.intent === 'attack') e.charged = false;
      const hpBefore = cs.player.hp;
      runEnemyEffects(cs, e, e.move.effects, charged);
      // 被打掉血的秘寶效果（毛線手套）：每回合最多一次
      if (cs.player.hp < hpBefore && cs.phase === 'player' && cs.player.hitRelicTurn !== cs.turn) {
        cs.player.hitRelicTurn = cs.turn;
        for (const rid of cs.relics) { const h = relicById[rid]?.hooks.onHit; if (h) applyEffects(cs, h, { source: 'relic' }); }
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
        e.dead = true; e.escaped = true;
        log(cs, `${e.name}散去了`);
        if (aliveEnemies(cs).length === 0 && cs.phase === 'player') cs.phase = 'won';
      }
    }
    if (e.dead) return true;
    // 還在睡就繼續顯示「呼呼大睡」；睡飽自然醒的（沒被打醒＝不生氣）從招式表第一招開始
    if (getStatus(e, '沉睡') > 0) e.move = SLEEP_MOVE;
    else if (e.move === SLEEP_MOVE) { e.moveIndex = -1; advanceMove(cs, e); }
    else if (skipAct || e.phase !== phaseAtAct) { /* 剛爬起來的那招、或換階段時排好的那招，留著給下回合 */ }
    else advanceMove(cs, e);
  }
  return true;
}

/** 敵方回合收尾：蜷縮修剪、換回玩家回合（抽新手牌） */
export function finishEnemyTurn(cs: CombatState): void {
  cs.enemyQueue = [];
  // 蜷縮撐到你下回合開始：魔物打完了才修剪，守護符留 8 點、沒有守護符就歸零（審查 #1）
  cs.enemyActing = false;
  cs.player.block = Math.min(cs.player.block, relicSum(cs.relics, 'blockKeep'));
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
  const p = cs.player;
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

export function usePotion(cs: CombatState, potionId: string, targetUid?: number): boolean {
  if (cs.phase !== 'player' || cs.pending) return false;
  const i = cs.potions.indexOf(potionId);
  const def = potionById[potionId];
  if (i < 0 || !def) return false;
  if (def.target === 'enemy' && (targetUid === undefined || !findEnemy(cs, targetUid))) return false;
  cs.potions.splice(i, 1);
  log(cs, `球球用了「${def.name}」`);
  applyEffects(cs, def.effects, { targetUid, source: 'potion' });
  // 用忍具之後的秘寶效果（舊毛巾、貓薄荷煙斗、九命鈴）
  if (cs.phase === 'player') for (const rid of cs.relics) { const h = relicById[rid]?.hooks.onPotionUse; if (h) applyEffects(cs, h, { source: 'relic' }); }
  return true;
}
