import { aliveEnemies, damageEnemy, damagePlayer, drawCards, findEnemy, gainBlock, gainStealth, healPlayer, log } from './actions';
import { endTurn } from './combat';
import { addStatus, getStatus } from './statuses';
import type { CombatState, Effect, EffectCtx } from './types';

/** 依序執行效果；需要玩家選牌時把剩下的效果存進 cs.pending 後返回（Task 10） */
export function applyEffects(cs: CombatState, effects: Effect[], ctx: EffectCtx): void {
  const queue = [...effects];
  while (queue.length > 0) {
    if (cs.phase !== 'player') return;
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
    default:
      throw new Error(`效果尚未實作：${fx.kind}`);   // Task 10 補齊
  }
}
