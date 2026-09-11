import { aliveEnemies, attackable, damageEnemy, damagePlayer, drawCards, findEnemy, gainBlock, gainStealth, healPlayer, log } from './actions';
import { endTurn } from './combat';
import { HAND_LIMIT } from './deck';
import { addStatus, getStatus, removeStatus } from './statuses';
import { DEBUFFS, TURN_DECAY } from './types';
import type { CardInstance, CombatState, Effect, EffectCtx, PlayerCombat } from './types';

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

/**
 * 這張牌要幫的「同伴」是誰。
 *
 * 一個人玩、或同伴已經倒下時**回自己**——連線牌可能從事件或別人分享的局面碼
 * 流進單機的牌組，那時候不能變成一張完全沒作用的廢牌。
 * 倒下的人也不該收禮：加在他身上等於白打一張。
 */
function ally(cs: CombatState, me: PlayerCombat): PlayerCombat {
  return cs.players.find((q) => q !== me && !q.down) ?? me;
}

/** 回傳 true＝已暫停等待選牌 */
export function applyOne(cs: CombatState, fx: Effect, ctx: EffectCtx, queue: Effect[]): boolean {
  /*
   * **這一串效果是誰引發的**（連線版第一步 2026-09-11）。
   *
   * 以前寫死 `cs.player`，因為只有一位玩家。現在打牌、喝忍具的地方會把自己填進
   * `ctx.self`，加防禦、抽牌、回血就記在正確的人身上。魔物的招式與還沒改完的
   * 舊呼叫點沒填，退回第一位——單機兩者是同一個人，行為完全沒變。
   */
  const p = ctx.self ?? cs.player;
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
      /**
       * **先扣蜷縮，擋不完的才進血**（使用者 2026-09-11 回報：「用鐵頭功的時候我身上有蜷縮值
       * 卻還是扣血了」）。
       *
       * 走的是 `throughBlock`——跟 2026-09-03 那次改反彈時使用者定下的原則同一條：
       * 「被打到的人都應該優先扣蜷縮」。那次只改了反彈，自傷這條漏掉了。
       * `direct` 仍然留著：自傷不套攻擊公式、不吃爪力翻肚、不觸發隱身閃避，
       * 只是現在會先讓蜷縮吃掉。
       *
       * 受影響的只有三張牌（鐵頭功 2、拼命 3、亡命 6）與鐵砂衣的開場 4 點。
       * 鐵砂衣那一下**打在開戰第一拍**，那時蜷縮還是 0（除了暖毯），所以它的代價實質不變。
       */
      damagePlayer(cs, p, amount, { direct: true, throughBlock: true, victim: p });
      if (ctx.source === 'relic') log(cs, `秘寶的代價：失去 ${amount} 點生命`);
      return false;
    }
    case 'block': gainBlock(cs, p, fx.amount); return false;
    case 'blockAll': {
      // **每一位都要照自己的貓步算**，所以一個一個走 `gainBlock`，不是算一次再發下去
      for (const q of cs.players) if (!q.down) gainBlock(cs, q, fx.amount);
      if (cs.players.length > 1) log(cs, '蜷縮分了對方一半');
      return false;
    }
    case 'statusAlly': {
      const mate = ally(cs, p);
      // 隱身走 `gainStealth`：那支會吃**收禮那一方**的秘寶加成（紙袋、影披風），
      // 直接 `addStatus` 的話等於偷偷少給（稽核自檢 2026-09-11）
      if (fx.name === '隱身') gainStealth(cs, fx.amount, mate); else addStatus(mate, fx.name, fx.amount);
      if (mate !== p) log(cs, `幫對方加了 ${fx.amount} 層${fx.name}`);
      return false;
    }
    case 'blockAlly': {
      const mate = ally(cs, p);
      // 照**收禮那一方**自己的貓步算：送出去的是「幫他擋一下」，不是把自己的護甲搬過去
      gainBlock(cs, mate, fx.amount);
      if (mate !== p) log(cs, `幫對方擋了 ${fx.amount} 點`);
      return false;
    }
    case 'drawAlly': {
      const mate = ally(cs, p);
      drawCards(cs, fx.n, mate);
      if (mate !== p) log(cs, `對方多抽了 ${fx.n} 張`);
      return false;
    }
    case 'cleanseAlly': {
      const mate = ally(cs, p);
      const hit = DEBUFFS.filter((d) => getStatus(mate, d) > 0);
      for (const d of hit) removeStatus(mate, d);
      log(cs, hit.length
        ? (mate === p ? `甩掉了${hit.join('、')}` : `幫對方拍掉了${hit.join('、')}`)
        : '身上很乾淨，沒什麼好拍的');
      return false;
    }
    case 'energyAlly': {
      const mate = ally(cs, p);
      mate.energy += fx.n;
      cs.energyGain += fx.n;   // 畫面靠這個數字知道飯糰是「多出來的」不是自己省下的
      if (mate !== p) log(cs, `飯糰分了對方 ${fx.n} 顆`);
      return false;
    }
    case 'taunt': {
      p.taunt = true;
      log(cs, cs.players.length > 1 ? '球球站到前面，這一輪魔物都衝著他來' : '球球擺出架式');
      return false;
    }
    case 'draw': drawCards(cs, fx.n, p); return false;
    case 'drawIfTargetStatus': {
      const t = cs.enemies.find((e) => e.uid === ctx.targetUid);
      if (t && getStatus(t, fx.name) > 0) drawCards(cs, fx.n, p);
      return false;
    }
    case 'drawNextTurn': p.drawNextTurn += fx.n; return false;
    case 'status': {
      if (fx.target === 'self') {
        if (fx.name === '隱身') gainStealth(cs, fx.amount, p); else addStatus(p, fx.name, fx.amount);
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
    case 'heal': healPlayer(cs, fx.percent ? Math.round(p.maxHp * fx.percent / 100) : fx.n, p); return false;
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
    case 'endTurn': queue.length = 0; p.ready = true; return false;   // 替**打這張牌的人**舉手，不是把整桌的回合切掉
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
