import { enemyById } from '../content/enemies';
import { relicById } from '../content/relics';
import { draw } from './deck';
import { applyEffects } from './effects';
import { addStatus, computeAttack, computeBlock, getStatus } from './statuses';
import type { CardInstance, CombatState, EnemyCombat, EnemyEffect, EnemyMove, EnemyPhase, Unit } from './types';

export function log(cs: CombatState, msg: string): void { cs.log.push(msg); }
export function aliveEnemies(cs: CombatState): EnemyCombat[] { return cs.enemies.filter((e) => !e.dead); }
export function findEnemy(cs: CombatState, uid: number): EnemyCombat | undefined { return cs.enemies.find((e) => e.uid === uid && !e.dead); }
export function hasRelic(cs: CombatState, id: string): boolean { return cs.relics.includes(id); }

export function gainBlock(cs: CombatState, u: Unit, base: number): number {
  const v = computeBlock(base, u);
  u.block += v;
  return v;
}

/** 每回合第一次拿隱身時吃秘寶加成（紙袋的 stealthBonus），加成量由秘寶資料決定 */
export function gainStealth(cs: CombatState, n: number): void {
  let amt = n;
  if (!cs.player.firstStealthGiven) amt += cs.relics.reduce((s, id) => s + (relicById[id]?.hooks.stealthBonus ?? 0), 0);
  cs.player.firstStealthGiven = true;
  addStatus(cs.player, '隱身', amt);
}

export function healPlayer(cs: CombatState, n: number): number {
  const p = cs.player; const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + n);
  return p.hp - before;
}

export function drawCards(cs: CombatState, n: number): CardInstance[] { return draw(cs.player, n, cs.rng); }

/** 魔物（或自傷）打球球。direct＝不看隱身、不看蜷縮、不套公式（自傷、噎到、壞毛病用） */
export function damagePlayer(cs: CombatState, attacker: Unit, base: number, opts: { direct?: boolean } = {}): number {
  const p = cs.player;
  let lose: number;
  if (opts.direct) {
    lose = base;
  } else {
    if (p.immune) { log(cs, '球球躲在角落，什麼都沒看到'); return 0; }
    if (getStatus(p, '隱身') > 0) { addStatus(p, '隱身', -1); log(cs, '球球閃過了'); return 0; }
    const dmg = computeAttack(base, attacker, p);
    const absorbed = Math.min(p.block, dmg);
    p.block -= absorbed;
    lose = dmg - absorbed;
    const thorns = getStatus(p, '反彈');
    if (dmg > 0 && thorns > 0 && attacker !== p) {
      const e = cs.enemies.find((x) => x === attacker);
      if (e) damageEnemy(cs, e, thorns, { direct: true });
    }
  }
  p.hp -= lose;
  // 已經打贏了，殘餘效果（自傷、壞毛病）不會把球球打死
  if (cs.phase === 'won') { p.hp = Math.max(1, p.hp); return lose; }
  if (p.hp <= 0) {
    // 擋一次致命傷的秘寶由資料決定（木樁的 preventLethal），不要把 id 寫死在引擎裡
    const saved = cs.relics.some((id) => relicById[id]?.hooks.preventLethal);
    if (saved && !p.lethalPrevented) { p.hp = 1; p.lethalPrevented = true; log(cs, '木樁替球球挨了這一下'); }
    else { p.hp = 0; cs.phase = 'lost'; }
  }
  return lose;
}

function currentPhase(e: EnemyCombat): EnemyPhase | undefined {
  return enemyById[e.enemyId]?.phases?.[e.phase - 1];
}
function moveSet(e: EnemyCombat): { moves: EnemyMove[]; pattern: 'cycle' | 'random' } {
  const def = enemyById[e.enemyId]!;
  const ph = currentPhase(e);
  return ph ? { moves: ph.moves, pattern: ph.pattern } : { moves: def.moves, pattern: def.pattern };
}

export function advanceMove(cs: CombatState, e: EnemyCombat): void {
  const { moves, pattern } = moveSet(e);
  // 照表出招的怪先問表（turnCount 是「已經行動過的回合數」，下一動＝+1）
  const scripted = enemyById[e.enemyId]?.chooseMove?.(e.turnCount + 1, moves);
  if (scripted) { e.move = scripted; return; }
  if (pattern === 'random') { e.move = cs.rng.pick(moves); return; }
  e.moveIndex = (e.moveIndex + 1) % moves.length;
  e.move = moves[e.moveIndex] as EnemyMove;
}

function checkPhase(cs: CombatState, e: EnemyCombat): void {
  const def = enemyById[e.enemyId]!;
  const next = def.phases?.[e.phase];
  // hpBelow 語意＝「生命 ≤ 此值就切換」，所以剛好等於門檻也要進下一階段
  if (!next || e.hp > next.hpBelow || e.dead) return;
  e.phase += 1;
  e.moveIndex = 0;
  if (next.line) log(cs, `${e.name}：${next.line}`);
  runEnemyEffects(cs, e, next.onEnter, false);
  e.move = def.chooseMove?.(e.turnCount + 1, next.moves)
    ?? (next.pattern === 'random' ? cs.rng.pick(next.moves) : (next.moves[0] as EnemyMove));
}

function killEnemy(cs: CombatState, e: EnemyCombat): void {
  e.dead = true;
  // 同生共死組的成員倒下就開始倒數「重生中」；沒有同組概念的魔物維持 0
  const rd = enemyById[e.enemyId];
  e.reviveIn = rd?.reviveGroup ? (rd.reviveDelay ?? 1) : 0;
  cs.kills += 1;
  const def = enemyById[e.enemyId]!;
  if (def.onDeathHealPlayer) healPlayer(cs, def.onDeathHealPlayer);
  if (e.stolen > 0) { cs.fishDelta += e.stolen; cs.stolenFish -= e.stolen; e.stolen = 0; }
  for (const pw of cs.player.powers) if (pw.trigger === 'onKill') applyEffects(cs, pw.effects, { source: 'power' });
  if (aliveEnemies(cs).length === 0 && cs.phase === 'player') cs.phase = 'won';
}

export function damageEnemy(cs: CombatState, e: EnemyCombat, base: number,
  opts: { ignoreBlock?: boolean; noStrength?: boolean; direct?: boolean } = {}): { dealt: number; killed: boolean } {
  if (e.dead) return { dealt: 0, killed: false };
  // 僕從護體：還有同伴活著就毫髮無傷（含直傷）。放在隱身之前——被護著的時候不消耗隱身層數
  if (enemyById[e.enemyId]?.guardedByAllies && cs.enemies.some((o) => o !== e && !o.dead)) {
    log(cs, `${e.name}被僕從護著，毫髮無傷`);
    return { dealt: 0, killed: false };
  }
  let lose: number;
  if (opts.direct) {
    lose = base;
  } else {
    if (getStatus(e, '隱身') > 0) { addStatus(e, '隱身', -1); log(cs, `${e.name}閃過了`); return { dealt: 0, killed: false }; }
    const dmg = computeAttack(base, cs.player, e, { noStrength: opts.noStrength });
    if (opts.ignoreBlock) lose = dmg;
    else { const absorbed = Math.min(e.block, dmg); e.block -= absorbed; lose = dmg - absorbed; }
  }
  e.hp = Math.max(0, e.hp - lose);
  if (e.hp === 0) { killEnemy(cs, e); return { dealt: lose, killed: true }; }
  checkPhase(cs, e);
  return { dealt: lose, killed: false };
}

export function makeEnemy(cs: CombatState, enemyId: string, index: number, hpScale = 1): EnemyCombat {
  const def = enemyById[enemyId];
  if (!def) throw new Error(`未知的魔物：${enemyId}`);
  const hp = Math.max(1, Math.round(cs.rng.int(def.hp[0], def.hp[1]) * hpScale));
  const moveIndex = def.pattern === 'cycle' ? index % def.moves.length : 0;
  const move = def.pattern === 'cycle' ? (def.moves[moveIndex] as EnemyMove) : cs.rng.pick(def.moves);
  return {
    uid: cs.nextEnemyUid++, enemyId, name: def.name, hp, maxHp: hp, block: 0, statuses: {},
    moveIndex, turnCount: 0, phase: 0, charged: false, reviveIn: 0,
    move: def.chooseMove?.(1, def.moves) ?? move, dead: false, escaped: false, stolen: 0,
  };
}

/** 包成函式再讀，免得 TypeScript 把 cs.phase 窄化後，看不見 damagePlayer 途中把戰鬥打成敗北 */
function isLost(cs: CombatState): boolean { return cs.phase === 'lost'; }

export function runEnemyEffects(cs: CombatState, e: EnemyCombat, effects: EnemyEffect[], charged: boolean): void {
  const p = cs.player;
  for (const fx of effects) {
    if (e.dead) return;        // 已經倒下（例如被反彈打死）就不再執行剩下的效果
    if (isLost(cs)) return;
    switch (fx.kind) {
      case 'damage': {
        const base = fx.amount * (charged ? 2 : 1);
        for (let i = 0; i < (fx.times ?? 1); i++) {
          if (e.dead) return;      // 被反彈打死，剩下的段數不能再打
          damagePlayer(cs, e, base);
          if (isLost(cs)) return;
        }
        break;
      }
      case 'damageRandom': damagePlayer(cs, e, cs.rng.int(fx.min, fx.max) * (charged ? 2 : 1)); break;
      case 'block': gainBlock(cs, e, fx.amount); break;
      case 'statusSelf': addStatus(e, fx.name, fx.amount); break;
      case 'statusPlayer': addStatus(p, fx.name, fx.amount); break;
      case 'heal': e.hp = Math.min(e.maxHp, e.hp + fx.n); break;
      case 'stealFish': e.stolen += fx.n; cs.stolenFish += fx.n; cs.fishDelta -= fx.n; log(cs, `${e.name}偷走了 ${fx.n} 小魚乾`); break;
      case 'discardRandomHand': {
        for (let i = 0; i < fx.n && p.hand.length > 0; i++) {
          const c = cs.rng.pick(p.hand);
          p.hand.splice(p.hand.indexOf(c), 1); p.discardPile.push(c);
        }
        break;
      }
      case 'summon': {
        for (let i = 0; i < fx.n && aliveEnemies(cs).length < 5; i++) {
          // max＝這種怪同時在場的上限（補召）：尾巴還剩一條就只補一條，不會越疊越多
          if (fx.max !== undefined && cs.enemies.filter((o) => o.enemyId === fx.enemyId && !o.dead).length >= fx.max) break;
          cs.enemies.push(makeEnemy(cs, fx.enemyId, i));
        }
        break;
      }
      case 'chargeNext': e.charged = true; break;
      case 'escape': e.dead = true; e.escaped = true; log(cs, `${e.name}帶著小魚乾逃走了`);
        if (aliveEnemies(cs).length === 0 && cs.phase === 'player') cs.phase = 'won'; break;
      case 'nothing': break;
      default: { const _never: never = fx; void _never; break; }   // 漏接新的 EnemyEffect 種類會在型別檢查就爆
    }
  }
}
