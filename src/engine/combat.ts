import { cardById } from '../content/cards';
import { encounterById, enemyById } from '../content/enemies';
import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import { advanceMove, damageEnemy, damagePlayer, drawCards, findEnemy, gainStealth, log, makeEnemy, runEnemyEffects } from './actions';
import { cardStats, discardHand, moveCard } from './deck';
import { applyEffects } from './effects';
import type { Rng } from './rng';
import { addStatus, decayTurnStatuses, getStatus, removeStatus, tickPoison } from './statuses';
import { TURN_DECAY } from './types';
import type { CardInstance, CombatState, EffectCtx, PlayerCombat } from './types';

type NumHook = 'firstTurnDraw' | 'firstTurnEnergy' | 'energyPerTurn' | 'firstCardDiscount';
function relicSum(relics: string[], key: NumHook): number {
  return relics.reduce((s, id) => s + (relicById[id]?.hooks[key] ?? 0), 0);
}

export function startCombat(input: {
  hp: number; maxHp: number; deck: CardInstance[]; relics: string[]; potions: string[]; encounterId: string; rng: Rng;
}): CombatState {
  const enc = encounterById[input.encounterId];
  if (!enc) throw new Error(`未知的遭遇：${input.encounterId}`);
  const player: PlayerCombat = {
    hp: input.hp, maxHp: input.maxHp, block: 0, statuses: {},
    energy: 0, maxEnergy: 3 + relicSum(input.relics, 'energyPerTurn'),
    hand: [], drawPile: input.rng.shuffle(input.deck), discardPile: [], exhaustPile: [],
    retained: [], powers: [], doubleNext: 0, drawNextTurn: 0,
    noAttacks: false, immune: false, attackedThisTurn: false, cardsPlayedThisTurn: 0,
    firstStealthGiven: false, firstCardPlayed: false, lethalPrevented: false, freshDebuffs: {},
  };
  const cs: CombatState = {
    rng: input.rng, player, enemies: [], relics: [...input.relics], potions: [...input.potions],
    turn: 0, phase: 'player', pending: null, log: [], encounterId: input.encounterId,
    stolenFish: 0, fishDelta: 0, kills: 0, cardsPlayed: 0, nextEnemyUid: 1,
  };
  enc.enemies.forEach((id, k) => cs.enemies.push(makeEnemy(cs, id, k)));
  for (const e of cs.enemies) log(cs, `${e.name}：${enemyById[e.enemyId]?.line ?? ''}`);
  for (const rid of cs.relics) {
    const hooks = relicById[rid]?.hooks.combatStart;
    if (hooks) applyEffects(cs, hooks, { source: 'relic' });
  }
  startPlayerTurn(cs);
  return cs;
}

export function startPlayerTurn(cs: CombatState): void {
  if (cs.phase !== 'player') return;
  const p = cs.player;
  cs.turn += 1;
  p.block = 0;
  p.freshDebuffs = {};   // 先清，這樣回合開始的能力若自己疊減益也算「本回合拿到的」
  p.firstStealthGiven = false;   // 也要先清，潛水轉隱身才吃得到紙袋的每回合第一次加成
  const poison = getStatus(p, '噎到');
  if (poison > 0) { addStatus(p, '噎到', -1); damagePlayer(cs, p, poison, { direct: true }); if (cs.phase !== 'player') return; }
  const dive = getStatus(p, '潛水');
  if (dive > 0) { removeStatus(p, '潛水'); gainStealth(cs, dive); }
  for (const pw of p.powers) if (pw.trigger === 'turnStart') applyEffects(cs, pw.effects, { source: 'power' });
  p.energy = p.maxEnergy + (cs.turn === 1 ? relicSum(cs.relics, 'firstTurnEnergy') : 0);
  p.noAttacks = false; p.immune = false; p.attackedThisTurn = false; p.cardsPlayedThisTurn = 0;
  p.firstCardPlayed = false; p.doubleNext = 0;
  const n = 5 + p.drawNextTurn + (cs.turn === 1 ? relicSum(cs.relics, 'firstTurnDraw') : 0);
  p.drawNextTurn = 0;
  drawCards(cs, n);
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
  let cost = st.cost;
  if (!cs.player.firstCardPlayed) cost = Math.max(0, cost - relicSum(cs.relics, 'firstCardDiscount'));
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
  const ctx: EffectCtx = { targetUid, cardUid: uid, cardType: st.def.type, source: 'card', combo: p.cardsPlayedThisTurn };
  if (st.def.type === '攻擊' && p.doubleNext > 0) { ctx.doubleDamage = true; p.doubleNext = 0; }
  p.cardsPlayedThisTurn += 1;
  cs.cardsPlayed += 1;
  p.firstCardPlayed = true;
  if (st.def.type === '攻擊') p.attackedThisTurn = true;
  log(cs, `球球打出「${st.name}」`);
  // 秘寶的第 N 張補抽排在牌效果之前：這張牌若要選牌，候選才不會被之後的補抽動到
  for (const rid of cs.relics) {
    const h = relicById[rid]?.hooks.drawOnNthCard;
    if (h && p.cardsPlayedThisTurn === h.n) drawCards(cs, h.draw);
  }
  applyEffects(cs, st.effects, ctx);
  return true;
}

export function endTurn(cs: CombatState): void {
  if (cs.phase !== 'player' || cs.pending) return;
  const p = cs.player;
  for (const c of [...p.hand]) {
    const cu = cardById[c.cardId]?.curse;
    if (cu?.onTurnEnd) { log(cs, `「${cardById[c.cardId]?.name}」發作`); damagePlayer(cs, p, cu.onTurnEnd, { direct: true }); }
  }
  if (cs.phase !== 'player') return;
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
  for (const e of [...cs.enemies]) {
    if (e.dead || cs.phase !== 'player') continue;
    e.block = 0;
    e.turnCount += 1;
    const def = enemyById[e.enemyId];
    const ph = def?.phases?.[e.phase - 1];
    if (ph?.strengthPerTurn) addStatus(e, '爪力', ph.strengthPerTurn);
    if (def?.strengthEveryNTurns && e.turnCount % def.strengthEveryNTurns === 0) addStatus(e, '爪力', 1);
    tickPoison(e);
    damageEnemy(cs, e, 0, { direct: true });   // 結算噎到：順手處理毒死與掉到階段門檻以下
    if (e.dead || cs.phase !== 'player') continue;
    if (e.move.intent === 'attack' && getStatus(e, '定身') > 0) {
      addStatus(e, '定身', -1);
      e.charged = false;   // 這一下被定掉，蓄力也一起作廢
      log(cs, `${e.name}被定住了，這一下打不出來`);
    } else {
      const charged = e.charged;
      if (e.move.intent === 'attack') e.charged = false;
      runEnemyEffects(cs, e, e.move.effects, charged);
    }
    decayTurnStatuses(e);
    if (!e.dead) advanceMove(cs, e);
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
  return true;
}
