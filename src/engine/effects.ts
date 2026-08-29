import { aliveEnemies, damageEnemy, damagePlayer, drawCards, findEnemy, gainBlock, gainStealth, healPlayer, log } from './actions';
import { endTurn } from './combat';
import { addStatus, getStatus, removeStatus } from './statuses';
import { DEBUFFS, TURN_DECAY } from './types';
import type { CardInstance, CombatState, Effect, EffectCtx } from './types';

/** 依序執行效果；需要玩家選牌時把剩下的效果存進 cs.pending 後返回（Task 10） */
export function applyEffects(cs: CombatState, effects: Effect[], ctx: EffectCtx): void {
  const queue = [...effects];
  while (queue.length > 0) {
    // 只有打輸了才半途收手；打贏了剩下的效果照樣結算（例如順手牽羊的小魚乾）
    if (cs.phase === 'lost') return;
    const fx = queue.shift() as Effect;
    const paused = applyOne(cs, fx, ctx, queue);
    if (paused) return;
  }
}

function targetsOf(cs: CombatState, ctx: EffectCtx, all: boolean) {
  if (all) return aliveEnemies(cs);
  const t = ctx.targetUid === undefined ? undefined : findEnemy(cs, ctx.targetUid);
  return t ? [t] : [];
}

/** 回傳 true＝已暫停等待選牌 */
export function applyOne(cs: CombatState, fx: Effect, ctx: EffectCtx, queue: Effect[]): boolean {
  const p = cs.player;
  switch (fx.kind) {
    case 'damage': {
      const times = fx.scaleWithCombo ? Math.min((ctx.combo ?? 0) + 1, fx.comboCap ?? 99) : (fx.times ?? 1);
      const base = fx.amount * (ctx.doubleDamage ? 2 : 1);
      for (const t of targetsOf(cs, ctx, fx.target === 'all')) {
        for (let i = 0; i < times; i++) {
          const r = damageEnemy(cs, t, base, { ignoreBlock: fx.ignoreBlock, noStrength: ctx.source === 'potion' });
          if (r.killed) { ctx.killed = true; break; }
        }
      }
      return false;
    }
    case 'damageRandom': {
      const base = cs.rng.int(fx.min, fx.max) * (ctx.doubleDamage ? 2 : 1);
      for (const t of targetsOf(cs, ctx, false)) if (damageEnemy(cs, t, base).killed) ctx.killed = true;
      return false;
    }
    case 'selfDamage': damagePlayer(cs, p, fx.amount, { direct: true }); return false;
    case 'block': gainBlock(cs, p, fx.amount); return false;
    case 'draw': drawCards(cs, fx.n); return false;
    case 'drawIfTargetStatus': {
      const t = cs.enemies.find((e) => e.uid === ctx.targetUid);
      if (t && getStatus(t, fx.name) > 0) drawCards(cs, fx.n);
      return false;
    }
    case 'drawNextTurn': p.drawNextTurn += fx.n; return false;
    case 'status': {
      if (fx.target === 'self') {
        if (fx.name === '隱身') gainStealth(cs, fx.amount); else addStatus(p, fx.name, fx.amount);
        // 自己給自己疊的減益，這回合結束先不衰減
        if (TURN_DECAY.includes(fx.name)) p.freshDebuffs[fx.name] = 1;
      } else {
        for (const t of targetsOf(cs, ctx, fx.target === 'all')) addStatus(t, fx.name, fx.amount);
      }
      return false;
    }
    case 'energy': p.energy += fx.n; return false;
    case 'heal': healPlayer(cs, fx.n); return false;
    case 'gold': if (!fx.onKill || ctx.killed) { cs.fishDelta += fx.n; log(cs, `＋${fx.n} 小魚乾`); } return false;
    case 'power': p.powers.push({ trigger: fx.trigger, effects: fx.effects }); return false;
    case 'noAttacksThisTurn': p.noAttacks = true; return false;
    case 'immuneThisTurn': p.immune = true; return false;
    case 'doubleNextAttack': p.doubleNext = 1; return false;
    case 'endTurn': queue.length = 0; endTurn(cs); return false;
    case 'stealBlock': {
      for (const t of targetsOf(cs, ctx, false)) { p.block += t.block; t.block = 0; }
      return false;
    }
    case 'damageEqualBlock': {
      for (const t of targetsOf(cs, ctx, false)) if (damageEnemy(cs, t, p.block, { noStrength: true }).killed) ctx.killed = true;
      return false;
    }
    case 'transferDebuffs': {
      for (const t of targetsOf(cs, ctx, false)) for (const name of DEBUFFS) {
        const v = getStatus(p, name);
        if (v > 0) { removeStatus(p, name); addStatus(t, name, v); }
      }
      return false;
    }
    case 'removeStatuses': {
      for (const t of targetsOf(cs, ctx, false)) {
        for (const name of fx.names) removeStatus(t, name);
        if (fx.removeBlock) t.block = 0;
      }
      return false;
    }
    case 'scry': {
      const cards = p.drawPile.slice(0, fx.n);
      return pause(cs, queue, ctx, { from: 'scry', purpose: 'scryDiscard', cards, min: 0, max: cards.length });
    }
    case 'exhaustFromHand': {
      const n = Math.min(fx.n, p.hand.length);
      return pause(cs, queue, ctx, { from: 'hand', purpose: 'exhaust', cards: [...p.hand], min: n, max: n });
    }
    case 'retainFromHand': {
      const n = Math.min(fx.n, p.hand.length);
      return pause(cs, queue, ctx, { from: 'hand', purpose: 'retain', cards: [...p.hand], min: n, max: n });
    }
    case 'discardFromHand': {
      const n = Math.min(fx.n, p.hand.length);
      return pause(cs, queue, ctx, { from: 'hand', purpose: 'discard', cards: [...p.hand], min: n, max: n });
    }
    case 'recoverFromDiscard':
      return pause(cs, queue, ctx, { from: 'discard', purpose: 'recover', cards: [...p.discardPile], min: 1, max: 1 });
  }
}

/** 戰鬥已分出勝負或候選為空就跳過；否則把剩餘效果收進 pending 並清空佇列 */
function pause(cs: CombatState, queue: Effect[], ctx: EffectCtx,
  spec: { from: 'hand' | 'discard' | 'scry'; purpose: 'exhaust' | 'retain' | 'discard' | 'recover' | 'scryDiscard'; cards: CardInstance[]; min: number; max: number }): boolean {
  if (cs.phase !== 'player' || spec.cards.length === 0) return false;
  cs.pending = { kind: 'chooseCards', ...spec, remaining: [...queue], ctx };
  queue.length = 0;
  return true;
}
