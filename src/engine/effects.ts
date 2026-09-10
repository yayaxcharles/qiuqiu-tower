import { aliveEnemies, attackable, damageEnemy, damagePlayer, drawCards, findEnemy, gainBlock, gainStealth, healPlayer, log } from './actions';
import { endTurn } from './combat';
import { HAND_LIMIT } from './deck';
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
        // 背刺：目標身上沒有任何減益，這一段就不打
        if (fx.ifTargetDebuffed && !DEBUFFS.some((d) => getStatus(t, d) > 0)) continue;
        for (let i = 0; i < times; i++) {
          const r = damageEnemy(cs, t, base, { ignoreBlock: fx.ignoreBlock, noStrength: ctx.source === 'potion' });
          if (r.killed) { if (!t.reviveIn) ctx.killed = true; break; }   // 同生共死的「暫時倒下」不算擊倒，跟 killEnemy 不發擊倒能力同口徑（稽核 中-3）
        }
      }
      return false;
    }
    case 'damageRamp': {
      // 分身術：這場戰鬥裡這張牌（同一個 uid）之前每打出一次，這次就多 step 點；次數在 playCard 打完才 +1
      const plays = ctx.cardUid !== undefined ? (cs.cardPlays?.[ctx.cardUid] ?? 0) : 0;
      const base = (fx.amount + fx.step * plays) * (ctx.doubleDamage ? 2 : 1);
      for (const t of targetsOf(cs, ctx, false)) {
        const r = damageEnemy(cs, t, base, { noStrength: ctx.source === 'potion' });
        if (r.killed) ctx.killed = true;
      }
      return false;
    }
    case 'damageScatter': {
      /**
       * 貓爪雷：**每一下各自隨機挑一隻打得到的**打。跟 `damage` 的 `times` 不同——那是同一隻連打幾下。
       * 每一下都重抽，所以打到一半有人倒下，剩下的自然打在活著的身上，不會空砍。
       * 傷害不吃爪力（跟其他忍具同口徑）。
       *
       * **挑的是 `attackable` 不是「還活著」**（稽核 2026-09-11 中-2）：調息中的關主與被僕從護著的
       * 那隻活著但完全吃不到傷害，盲抽會讓三下全打在牠身上、65 條小魚乾換到 0 傷害。
       *
       * 兩種收手要分開：**全打光了**就安靜結束（本來就打完了）；**活著卻一隻都打不到**
       * 才留一行紀錄——那時再揮也是 0 傷害，但玩家得知道錢花到哪去了，不能靜靜什麼都沒發生。
       * 不要「退回去揮空」：那會在紀錄裡印出「毫髮無傷」，反而像是打中了卻沒效果。
       */
      for (let i = 0; i < fx.times; i++) {
        const alive = cs.enemies.filter((e) => !e.dead);
        if (!alive.length) break;
        const hittable = alive.filter((e) => attackable(cs, e));
        if (!hittable.length) { log(cs, '雷光劈了下去，卻沒有一隻打得到'); break; }
        const t = cs.rng.pick(hittable);
        if (damageEnemy(cs, t, fx.amount * (ctx.doubleDamage ? 2 : 1), { noStrength: ctx.source === 'potion' }).killed) ctx.killed = true;
      }
      return false;
    }
    case 'skipEnemyTurn':
      // 先手香：這一輪魔物整排不出手。預告留著（下回合照樣出那一招），只是這一輪跳過
      cs.skipEnemies = true;
      log(cs, '一股香氣散開，魔物們都愣住了');
      return false;
    case 'damageRandom': {
      const base = cs.rng.int(fx.min, fx.max) * (ctx.doubleDamage ? 2 : 1);
      // 忍具的傷害不吃爪力，跟 damage／damageRamp 同口徑（稽核 2026-09-10 低-4：只有這個分支漏寫，
      // 目前沒有隨機傷害的忍具所以還沒出事，但補上比較保險）
      for (const t of targetsOf(cs, ctx, false)) if (damageEnemy(cs, t, base, { noStrength: ctx.source === 'potion' }).killed) ctx.killed = true;
      return false;
    }
    case 'selfDamage': {
      // 秘寶的代價（鐵砂衣開戰扣血）不能把球球直接打死，至少留 1 血，而且要留一行紀錄（稽核 2026-09-04 高 1）
      const amount = ctx.source === 'relic' ? Math.min(fx.amount, Math.max(0, p.hp - 1)) : fx.amount;
      if (amount <= 0) return false;
      damagePlayer(cs, p, amount, { direct: true });
      if (ctx.source === 'relic') log(cs, `秘寶的代價：失去 ${amount} 點生命`);
      return false;
    }
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
        if (TURN_DECAY.includes(fx.name)) p.freshDebuffs[fx.name] = (p.freshDebuffs[fx.name] ?? 0) + fx.amount;
      } else {
        for (const t of targetsOf(cs, ctx, fx.target === 'all')) {
          // 定身對魔物只有七成機會成功（使用者 2026-09-02：「定身太強」）；沒中就寫在紀錄、畫面飄「掙脫」
          if (fx.name === '定身' && !cs.rng.chance(0.7)) { log(cs, `${t.name}掙脫了定身`); continue; }
          addStatus(t, fx.name, fx.amount);
        }
      }
      return false;
    }
    // 追擊：onKill 只在打倒目標時退飯糰。`energyGain` 是給畫面看的累計（見 types.ts 的說明）
    case 'energy':
      if (!fx.onKill || ctx.killed) { p.energy += fx.n; if (fx.n > 0) cs.energyGain += fx.n; }
      return false;
    // `percent`＝回最大生命的百分之幾（起死回生丹）。用最大生命當基準不是「缺的血」：
    // 缺得越多回越多會變成「越晚喝越賺」，那會逼玩家故意拖到快死
    case 'heal': healPlayer(cs, fx.percent ? Math.round(p.maxHp * fx.percent / 100) : fx.n); return false;
    case 'gold': if (!fx.onKill || ctx.killed) { cs.fishDelta += fx.n; log(cs, `＋${fx.n} 小魚乾`); } return false;
    case 'power':
      // `thisTurn` 的能力回合結束會被清掉（endTurn 裡），所以旗標要一路帶進來
      p.powers.push({ trigger: fx.trigger, effects: fx.effects, ...(fx.thisTurn ? { thisTurn: true as const } : {}), ...(ctx.cardId ? { cardId: ctx.cardId } : {}), ...(ctx.cardUpgraded ? { upgraded: true } : {}) });
      return false;
    case 'noAttacksThisTurn': p.noAttacks = true; return false;
    case 'immuneThisTurn': p.immune = true; return false;
    case 'doubleNextAttack': p.doubleNext = 1; return false;
    // 掛旗不直呼：讓畫面走跟按「結束回合」一樣的完整流程（收牌→敵人動作→發牌），
    // 不然敵方回合擠在同一次重畫裡閃過，玩家以為敵人沒動（使用者實玩回報撒手鐧）
    case 'endTurn': queue.length = 0; cs.endTurnRequested = true; return false;
    case 'stealBlock': {
      for (const t of targetsOf(cs, ctx, false)) { p.block += t.block; t.block = 0; }
      return false;
    }
    case 'damageEqualBlock': {
      // 這裡也要吃加倍（稽核 2026-09-10 高-2）：四個傷害分支只有它漏接 `ctx.doubleDamage`，
      // 所以蓄力、秘笈打在「絕學·借力使力」上完全沒作用——蜷縮 20 時打出去還是 20 點，
      // 紀錄卻已經印了「秘笈：第一擊加倍」。一飯糰的蓄力或一件 190 條的秘寶就這樣被靜靜吃掉。
      //（「絕學·太極」也是這個分支，但它是技能牌、本來就吃不到加倍，不受影響）
      const base = p.block * (ctx.doubleDamage ? 2 : 1);
      for (const t of targetsOf(cs, ctx, false)) if (damageEnemy(cs, t, base, { noStrength: true }).killed) ctx.killed = true;
      return false;
    }
    case 'cleanse': {
      // 抖毛只清 max 種，照 DEBUFFS 的順序（翻肚最先）；返璞、溫牛奶不給 max＝全清
      let left = fx.max ?? 99;
      for (const name of DEBUFFS) if (left > 0 && getStatus(p, name) > 0) { removeStatus(p, name); left--; }
      return false;
    }
    case 'doubleStatus': {
      for (const t of targetsOf(cs, ctx, false)) {
        const cur = getStatus(t, fx.name);
        // 0 層：基礎版催不動（寫進紀錄，玩家才知道飯糰花去哪）；升級版的「再加 add 層」照加
        if (cur === 0 && !fx.add) { log(cs, `${t.name}身上沒有${fx.name}，催不動`); continue; }
        addStatus(t, fx.name, cur + (fx.add ?? 0));
      }
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
        for (const name of fx.names) {
          if (fx.max === undefined) removeStatus(t, name);
          else addStatus(t, name, -Math.min(fx.max, getStatus(t, name)));
        }
        if (fx.removeBlock) t.block = fx.max === undefined ? 0 : Math.max(0, t.block - fx.max);
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
    case 'recoverFromDiscard': {
      if (p.hand.length >= HAND_LIMIT) return false;   // 滿手就拿不回來，不必開選單
      // 隔空取物打出後自己已經躺在棄牌堆，不能把自己撿回來無限重打（控制端 2026-08-29 裁決）
      const cands = p.discardPile.filter((c) => c.uid !== ctx.cardUid);
      return pause(cs, queue, ctx, { from: 'discard', purpose: 'recover', cards: cands, min: 1, max: 1 });
    }
    default: { const _never: never = fx; void _never; return false; }   // 漏接新的 Effect 種類會在型別檢查就爆
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
