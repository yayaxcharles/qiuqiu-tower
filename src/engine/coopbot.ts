import { cardById } from '../content/cards';
import { encounterById, enemyById } from '../content/enemies';
import { eventById } from '../content/events';
import { relicById } from '../content/relics';
import { advanceMove, log, runEnemyEffects } from './actions';
import { allReady, beginEnemyTurn, finishEnemyTurn, setReady, stepEnemyTurn } from './combat';
import { coopHpMul } from './coopscale';
import { choiceEffectsFor, visibleChoices } from './eventcond';
import { heroOf, type Hero } from './hero';
import { nextChoices } from './map';
import { relicOk, settleRelicPicks } from './rewards';
import { Rng, seedFromString } from './rng';
import {
  ACTS, addCard, advanceAct, applyRunEffects, beginCombat, buyCard, buyPotion, buyRelic, buyRemove, chooseNode,
  closeCardReward, finishCombat, heroesIn, makeShops, newCoopRun, openChestCoop, removeCard, removePrice, rest, resolvePendingAfterFight,
  revivePartner, rollActCardsPerSeat, rollActRelics, runRng, takeCardReward, takeRelic, upgradeCard,
  type RunEffectOutcome } from './run';
import { me, standing } from './runplayer';
import { addStatus } from './statuses';
import { bestRelic, bestUpgrade, deckJunk, eventValue, keeperDetour, keeperPotions, keeperServices, napWorks, pickCard, rating, relicRating, setBonusScore, smartPending, smartSeatAct } from './smartbot';
import type { CombatState, EnemyCombat, EnemyPool, MapNode, RunState } from './types';

/**
 * **兩個人的量平衡機器人**（2026-09-16）。
 *
 * `smartbot.ts` 的 `smartRun` 只跑一個人，所以「雙人到底比單人容易多少」以前量不出來，
 * 只能紙上算。這一支把同一批決策函式（`smartSeatAct`、`pickCard`、`eventValue`…）
 * 套到**兩個座位**上，整局的地圖、商店、貓窩、事件、戰利品都照連線版的規則各走各的。
 *
 * 三件事要先講清楚，不然數字會被當成玩家的體感：
 *
 *  1. **這是同一支機器人，不是兩個真人。** 它不會商量、不會為了保同伴而墊刀，
 *     兩個座位各自照「我現在打什麼最划算」出牌。真人的雙人配合一定比它強，
 *     所以這裡量到的雙人優勢是**下限**。
 *  2. **互助牌（分你一半、我來擋那九張）它估不準。** 那幾張的估值寫在 `smartbot.ts` 裡，
 *     口徑是「一個人玩時退化成什麼」（見那邊 `case 'taunt'` 那一段的註解），
 *     所以雙人時它低估自己手上的互助牌——又一次讓雙人的數字偏保守。
 *  3. **出牌順序是「座位 0 打完換座位 1」**，真人是同時打。互相給蜷縮、喊嘲諷這些
 *     在真人那邊可以看著對方的意圖決定，這裡不行。
 *
 * 要試算「改成什麼樣會怎樣」用 `CoopTuning`，**一個內容檔都不用動**。
 */

export interface CoopTuning {
  /**
   * 魔物血量倍率覆寫，照**遭遇**所屬的池（引擎就是照遭遇的池算的，見 `combat.ts` 的 `startCombat`）。
   * 不填就照 `coopscale.ts` 的表（一般怪 1.5、大魔物 1.65、塔主 1.75）。
   */
  hpMul?: Partial<Record<EnemyPool, number>>;
  /** 塔主每隔幾回合多出手一次（2＝每兩回合一次）。0／不填＝照舊一回合一次 */
  bossExtraEvery?: number;
  /** 大魔物每隔幾回合多出手一次 */
  eliteExtraEvery?: number;
  /** 每隻魔物開場多幾層爪力（雙人時把傷害整體拉高用；召喚出來的也吃得到） */
  extraStrength?: number;
  /** 只加在某幾個池的遭遇上（例：`{ '塔主': 3 }`＝只有塔主戰變重）。跟 `extraStrength` 相加 */
  strengthByPool?: Partial<Record<EnemyPool, number>>;
}

export interface CoopFight {
  id: string;
  floor: number;
  act: number;
  /** 這場遭遇屬於哪個池（一般怪／大魔物／塔主） */
  pool: EnemyPool;
  turns: number;
  won: boolean;
  /** 每個座位掉了多少血（倒下的算掉到 0） */
  hpLost: number[];
  /** 打完之後誰倒著 */
  down: boolean[];
}

export interface CoopStats {
  seed: string;
  won: boolean;
  floor: number;
  act: number;
  diedTo: string | null;
  /** 每位的收局牌組大小、升級張數、秘寶數 */
  deckSize: number[];
  upgraded: number[];
  relics: number[];
  /** 整局每位打了幾張牌。**兩邊差太多就表示這把尺壞了**（第二位沒在打） */
  cardsPlayed: number[];
  /**
   * 收局時牌組裡有幾張**連線專屬的互助牌**（分你一半那九張）。
   * 機器人對那幾張的估值是照「一個人玩時退化成什麼」寫的（見 `smartbot.ts`），
   * 所以這個數字就是「這把尺低估雙人的程度」有多大的直接證據。
   */
  coopCards: number[];
  fights: CoopFight[];
  bosses: { id: string; act: number; turns: number; won: boolean; hpIn: number[]; maxHp: number[] }[];
  /** 走進了哪些事件、挑了第幾個選項（2026-09-23 內容擴充第二批：量連線限定事件有沒有真的走完、兩人分工選了哪邊） */
  events: { id: string; choice: number }[];
}

// ===== 戰鬥 =====

/**
 * 這一場要動手腳的地方（血量倍率、開場爪力）。不填 `tuning` 就什麼都不做。
 *
 * **匯出只是為了測得到**（`tests/coop.report.test.ts` 有一條在驗「倍率覆寫真的有效」）——
 * 覆寫沒生效的話整份試算會安靜地變成十一份一樣的數字。
 */
export function applyTuning(cs: CombatState, players: number, t: CoopTuning): void {
  const pool = encounterById[cs.encounterId]?.pool;
  if (!pool) return;
  const want = t.hpMul?.[pool];
  if (want !== undefined) {
    // 引擎是「基礎血 × 遭遇倍率 × 難度倍率 × 人數倍率」算出來的，這裡只換掉**人數**那一項：
    // 拿新舊倍率的比值去乘現有的血量。四捨五入會跟直接改表差個一兩點，對統計沒有影響。
    const ratio = want / coopHpMul(pool, players, cs.encounterId);
    if (ratio !== 1) {
      for (const e of cs.enemies) {
        e.maxHp = Math.max(1, Math.round(e.maxHp * ratio));
        e.hp = Math.max(1, Math.round(e.hp * ratio));
      }
      // 之後召喚出來的小弟照 `cs.mods.hpMul` 放大（見 `actions.ts` 的 `summon`），一起改才一致
      if (cs.mods) cs.mods.hpMul *= ratio;
    }
  }
  const str = (t.extraStrength ?? 0) + (t.strengthByPool?.[pool] ?? 0);
  if (str) {
    for (const e of cs.enemies) addStatus(e, '爪力', str);
    if (cs.mods) cs.mods.strength = (cs.mods.strength ?? 0) + str;   // 之後召喚出來的也要有
  }
}

/** 這一拍要不要讓王多動一次；回傳那隻王（不用就回 null） */
function extraActor(cs: CombatState, t: CoopTuning): EnemyCombat | null {
  const pool = encounterById[cs.encounterId]?.pool;
  const every = pool === '塔主' ? t.bossExtraEvery : pool === '大魔物' ? t.eliteExtraEvery : 0;
  if (!every || every <= 0 || cs.turn <= 0 || cs.turn % every !== 0) return null;
  // 場上可能有牠召出來的小弟，多動的是**王自己**：同池、血條最厚的那一隻
  const boss = cs.enemies.filter((e) => !e.dead && enemyById[e.enemyId]?.pool === pool)
    .sort((a, b) => b.maxHp - a.maxHp)[0];
  return boss ?? null;
}

/**
 * 收回合：敵方回合前半 → 一隻一隻行動 →（試算才有的）王多動一次 → 收尾。
 *
 * 沒開 `bossExtraEvery` 時這三步跟 `combat.ts` 的 `endTurn` **一模一樣**。
 * 多出來的那一動**擺在收尾之前**：玩家這回合的蜷縮還在（蜷縮是 `finishEnemyTurn` 才修剪的），
 * 所以那一下擋得住——這樣試算出來的才是「王多打一次」，不是「王多打一次而且你不能防」。
 */
function coopEndTurn(cs: CombatState, t: CoopTuning): void {
  if (!beginEnemyTurn(cs)) return;
  while (stepEnemyTurn(cs)) { /* 一隻一隻 */ }
  const extra = extraActor(cs, t);
  if (extra && cs.phase === 'player' && !extra.dead) {
    log(cs, `${extra.name}又動了一次`);
    runEnemyEffects(cs, extra, extra.move.effects, extra.charged);
    if (cs.phase === 'player' && !extra.dead) advanceMove(cs, extra);
  }
  finishEnemyTurn(cs);
}

/**
 * 兩個座位打完一場。
 *
 * 一次只讓一個人做一件事，做完重新掃一遍——場面每動一下（同伴給了蜷縮、魔物被打死）
 * 估值就變了，重掃才不會拿舊帳做決定。某一位沒別的好打了就替他舉手（`setReady`），
 * **兩位都舉手才收回合**，跟畫面那邊同一條規則。
 */
export function coopCombat(cs: CombatState, rng: Rng, t: CoopTuning = {}, maxTurns = 200, seed = '?',
                           /** 各座位打了幾張牌（量測用；不填就不記）。**這是這把尺的體檢項**：一邊掛零就是第二位根本沒在打 */
                           plays?: number[]): void {
  while (cs.phase === 'player') {
    // 僵局（打不死也死不了）當作輸，跟 `smartCombat` 同一個判準
    if (cs.turn > maxTurns) {
      cs.phase = 'lost';
      for (const p of cs.players) { p.hp = 0; p.down = true; }
      log(cs, `僵局：${seed} ${cs.encounterId}`);
      return;
    }
    if (smartPending(cs, rng)) continue;   // 有牌等著選：先選完，誰選的 `pending` 自己記得
    let moved = false;
    for (const p of cs.players) {
      if (p.down || p.ready) continue;
      const before = cs.cardsPlayed;
      if (smartSeatAct(cs, rng, p.seat)) {
        if (plays) plays[p.seat] = (plays[p.seat] ?? 0) + (cs.cardsPlayed - before);
        moved = true;
        break;
      }
      setReady(cs, p.seat);   // 這位沒別的好打了
      moved = true;
      break;
    }
    if (cs.phase !== 'player') break;
    if (allReady(cs)) { coopEndTurn(cs, t); continue; }
    if (!moved) break;   // 沒人動得了也沒人舉手：防呆，理論上到不了
  }
}

// ===== 整局 =====

/** 地圖節點的估值。照 `smartbot.ts` 的 `nodeScore` 改寫成兩個人的：血看最虛的那一位，有人倒著就非去貓窩不可 */
function nodeScoreCoop(run: RunState, n: MapNode): number {
  const alive = standing(run);
  const hpPct = alive.length ? Math.min(...alive.map((p) => p.hp / p.maxHp)) : 0;
  const anyDown = run.players.some((p) => p.down);
  const fish = Math.min(...run.players.map((p) => p.fish));
  const canUpgrade = run.players.some((_, i) => !!bestUpgrade(run, i));
  // 缺血而且**打盹真的回得了血**的那位才算「要去睡」（帶不眠香爐的睡了也不回，2026-09-23）；沒人帶時跟 `hpPct < 0.55` 同一件事
  const needNap = alive.some((p) => p.hp / p.maxHp < 0.55 && napWorks(run, run.players.indexOf(p)));
  switch (n.type) {
    case '貓窩': return anyDown ? 130 : needNap ? 100 : canUpgrade ? 55 : 20;
    case '罐頭鋪': return (fish >= 120 ? 75 : fish >= 75 ? 45 : 15) + keeperDetour(run, n);   // 為了店主繞路看座位 0（2026-09-23 第三批）
    case '事件': return 50;
    case '紙箱': return 90;
    case '大魔物': return hpPct >= 0.7 && run.players.some((p) => p.deck.some((c) => c.upgraded)) ? 62 : 8;
    case '戰鬥': return 42;
    case '塔主': return 1;
  }
}

/** 一件秘寶要不要挑：兩個人從同一份選項各挑自己最想要的（撞件由 `settleRelicPicks` 擲骰） */
function pickRelic(offers: readonly string[], run: RunState, seat: number): string | null {
  const mine = me(run, seat).relics;
  // 分數照**這一位**的角色（2026-09-23 量尺：同一件對不同貓價值不同）。
  // 鎖這一位的不挑（2026-09-23 內容擴充第一批）：混搭時清單照「有人用得到」開，量尺對鎖住的那格留空＝5 分，
  // 不濾的話別件量出來比 5 低時，菲菲會去挑封封的磨劍石
  const hero = heroOf(me(run, seat));
  const want = bestRelic(offers.filter((id) => !mine.includes(id) && relicOk(relicById[id] ?? {}, [hero])), hero, mine);   // 帶身上的：湊成師門套組的那件加分（2026-09-23 第二批）
  return want ?? null;
}

function takeOffers(run: RunState, offers: string[]): void {
  if (!offers.length) return;
  const picks = run.players.map((p, i) => (p.down ? null : pickRelic(offers, run, i)));
  const got = settleRelicPicks(runRng(run), offers, picks, heroesIn(run));
  got.forEach((id, i) => { if (id) takeRelic(run, id, i); });
}

/** 事件／戰後那些「要你放生一張、升一張」的待處理結果。`seat`＝這一份是誰的 */
function handleNeeds(run: RunState, outcome: RunEffectOutcome, seat: number): void {
  if (!outcome) return;
  if ('needs' in outcome) {
    for (let i = 0; i < outcome.n; i++) {
      if (outcome.needs === 'removeCard') { const j = deckJunk(run, seat)[0]; if (j) removeCard(run, j.uid, seat); }
      else { const u = bestUpgrade(run, seat); if (u) upgradeCard(run, u.uid, seat); }
    }
  } else if ('chooseCard' in outcome) {
    const id = pickCard(run, outcome.chooseCard, seat) ?? outcome.chooseCard[0]?.id;
    if (id) addCard(run, id, outcome.upgradedCard === id, seat);
    if (outcome.then) handleNeeds(run, outcome.then, seat);   // 學完再挑牌升級（2026-09-23 內容擴充第二批）
  }
}

function fight(run: RunState, rng: Rng, encounterId: string | undefined, bonusFish: number,
               seed: string, stats: CoopStats, t: CoopTuning): void {
  const cs = beginCombat(run, encounterId);
  applyTuning(cs, run.players.length, t);
  const hpIn = run.players.map((p) => p.hp);
  const maxHp = run.players.map((p) => p.maxHp);
  coopCombat(cs, rng, t, 200, seed, stats.cardsPlayed);
  const pool = encounterById[cs.encounterId]?.pool ?? '中';
  const turns = cs.turn;
  const r = finishCombat(run, cs, bonusFish);
  const won = !!r;
  stats.fights.push({
    id: cs.encounterId, floor: run.floor, act: run.act, pool, turns, won,
    hpLost: run.players.map((p, i) => (hpIn[i] ?? 0) - (won ? p.hp : 0)),
    down: run.players.map((p) => !!p.down),
  });
  if (pool === '塔主') stats.bosses.push({ id: cs.encounterId, act: run.act, turns, won, hpIn, maxHp });
  if (!r) { stats.diedTo = (turns > 200 ? '僵局:' : '') + cs.encounterId; return; }
  // 戰利品的牌：**每個人各挑各的那一份**（規則三）
  if (r.cards.length) {
    run.players.forEach((p, i) => {
      if (p.down) return;
      const mine = r.cardsPerSeat?.[i] ?? r.cards;
      takeCardReward(run, r, pickCard(run, mine, i), i);
    });
    closeCardReward(r);
  }
  // 大魔物的秘寶：開兩件各挑一件
  if (r.relicOffers?.length) takeOffers(run, [...r.relicOffers]);
}

/**
 * 跑一整局兩個人的。
 *
 * `heroes`＝兩位的角色（`['ninja','ninja']` 或 `['ninja','feifei']`…）。
 * 種子與難度的意思跟 `smartRun` 一樣，方便同一組種子拿來跟單人對照。
 */
export function coopRun(seed: string, difficulty = 1, heroes: readonly [Hero, Hero] = ['ninja', 'ninja'],
                        t: CoopTuning = {}): CoopStats {
  const run = newCoopRun(seed, difficulty, heroes[0], heroes[1]);
  const rng = new Rng(seedFromString('coop:' + seed));
  const stats: CoopStats = {
    seed, won: false, floor: 0, act: 1, diedTo: null,
    deckSize: [], upgraded: [], relics: [], cardsPlayed: [0, 0], coopCards: [], fights: [], bosses: [], events: [],
  };
  let guard = 0;
  while (run.status === 'playing') {
    if (++guard > 140) throw new Error('節點推進超過 140 次');
    const options = nextChoices(run.map, run.currentNode);
    const scored = options.map((n) => ({ n, s: nodeScoreCoop(run, n) + rng.next() * 6 }));
    const node = chooseNode(run, scored.sort((a, b) => b.s - a.s)[0]!.n.id);
    switch (node.type) {
      case '戰鬥': case '大魔物': case '塔主': {
        fight(run, rng, undefined, 0, seed, stats, t);
        if (node.type === '塔主' && run.status === 'playing' && run.act < ACTS) {
          // 過關獎勵：秘寶三選一（兩個人從同一份各挑一件，撞了也各拿各的——跟畫面那邊同一條）、
          // 再各抽一份稀有牌三選一。順序照 `ui/screens/actclear.ts`：先擲秘寶、再擲牌
          const offers = rollActRelics(run);
          const cardsPerSeat = rollActCardsPerSeat(run);
          run.players.forEach((p, i) => {
            if (p.down) return;
            const picks = cardsPerSeat[i] ?? [];
            const id = pickCard(run, picks, i) ?? picks.slice().sort((a, b) => rating(b.id) - rating(a.id))[0]?.id;
            if (id) addCard(run, id, false, i);
          });
          run.players.forEach((p, i) => {
            if (p.down) return;
            const want = pickRelic(offers, run, i);
            if (want) takeRelic(run, want, i);
          });
          advanceAct(run);
        }
        break;
      }
      case '事件': {
        const ev = eventById[node.eventId!]!;
        /*
         * 兩個人投同一個選項（真人會商量）：估值把兩位各自的加起來挑最高的那個，
         * 因為事件的效果**每個人各跑一次**（見 `ui/screens/event.ts` 的 `take`）。
         */
        /*
         * 只挑看得到的選項（條件選項、倒下時的分工選項，2026-09-23 內容擴充第二批）；
         * 座位不對稱的（連線限定事件的「我拿／我付」）照每一位自己那一串估，兩人加起來比。
         */
        const choice = visibleChoices(run, ev).map((i) => ev.choices[i]!)
          .map((c) => ({ c, v: eventValue(run, choiceEffectsFor(c, 0), c.costFish ?? 0, 0) + eventValue(run, choiceEffectsFor(c, 1), c.costFish ?? 0, 1) }))
          .sort((a, b) => b.v - a.v)[0]!.c;
        stats.events.push({ id: ev.id, choice: ev.choices.indexOf(choice) });
        const seats = run.players.map((_, i) => i).filter((i) => !run.players[i]?.down);
        for (const i of seats) me(run, i).fish = Math.max(0, me(run, i).fish - (choice.costFish ?? 0));
        const outcomes: RunEffectOutcome[] = [];
        for (const i of seats) outcomes[i] = applyRunEffects(run, choiceEffectsFor(choice, i), undefined, undefined, i);
        // 各自的挑牌／放生／升級先處理掉
        for (const i of seats) handleNeeds(run, outcomes[i] ?? null, i);
        // 「打一場」是**兩個人一起打的同一場**，只打一次
        const f = outcomes.find((o) => !!o && 'fight' in o);
        if (f && 'fight' in f) {
          run.pendingAfterFight = f.fight.afterWin;
          fight(run, rng, f.fight.encounterId, f.fight.bonusFish, seed, stats, t);
          resolvePendingAfterFight(run, run.status === 'playing');
          if (run.status === 'playing') {
            for (const i of seats) {
              for (let k = 0; k < (f.fight.bonusUpgrades ?? 0); k++) { const u = bestUpgrade(run, i); if (u) upgradeCard(run, u.uid, i); }
            }
          }
        }
        break;
      }
      case '罐頭鋪': {
        // 一人一間店（`makeShops`），各買各的
        const shops = makeShops(run);
        run.players.forEach((_, i) => {
          const shop = shops[i];
          if (!shop) return;
          keeperServices(run, shop, i);   // 客座店主（2026-09-23 第三批）：阿福放生換招、婆婆淨化，規則同單人機器人
          const junk = deckJunk(run, i);
          if (shop.keeper !== 'junk' && junk.length >= 3 && me(run, i).fish >= removePrice(run, i, shop) + 60) buyRemove(run, junk[0]!.uid, i, shop);   // 會員卡的固定價（2026-09-23 第二批）
          const relicIdx = shop.relics.map((r, k) => ({ k, v: relicRating(r.id, heroOf(me(run, i))) + setBonusScore(r.id, heroOf(me(run, i)), me(run, i).relics), p: r.price })).sort((a, b) => b.v - a.v)[0];
          if (relicIdx && relicIdx.v >= 6 && me(run, i).fish >= relicIdx.p) buyRelic(run, shop, relicIdx.k, i);
          const cardIdx = shop.cards.map((c, k) => ({ k, v: rating(c.def.id), p: c.price })).sort((a, b) => b.v - a.v)[0];
          if (cardIdx && cardIdx.v >= 7 && me(run, i).fish >= cardIdx.p && me(run, i).deck.length < 24) buyCard(run, shop, cardIdx.k, i);
          if (!keeperPotions(run, shop, i)) for (let k = 0; k < shop.potions.length; k++) {   // 婆婆那間照她的規則買（2026-09-23 第三批）
            const it = shop.potions[k]!;
            if (me(run, i).potions.length < 2 && me(run, i).fish >= it.price + 40) buyPotion(run, shop, k, undefined, i);
          }
        });
        break;
      }
      case '貓窩': {
        /*
         * 有人倒著就先救人：救的那一位**用掉自己這一格的打盹**（規則四），
         * 另一位照單人的判準決定要睡還是磨爪。
         */
        const downSeat = run.players.findIndex((p) => p.down);
        const helper = run.players.findIndex((p) => !p.down);
        if (downSeat >= 0 && helper >= 0) revivePartner(run, downSeat);
        run.players.forEach((p, i) => {
          if (p.down || (downSeat >= 0 && i === helper)) return;   // 救人的那位這一格用掉了
          const u = bestUpgrade(run, i);
          if ((p.hp < p.maxHp * (run.floor === 44 ? 0.98 : 0.6) && napWorks(run, i)) || !u) rest(run, '打盹', undefined, i);
          else rest(run, '磨爪', u.uid, i);
        });
        break;
      }
      case '紙箱': takeOffers(run, openChestCoop(run)); break;
    }
  }
  stats.won = run.status === 'won';
  stats.floor = run.floor;
  stats.act = run.act;
  stats.deckSize = run.players.map((p) => p.deck.length);
  stats.upgraded = run.players.map((p) => p.deck.filter((c) => c.upgraded).length);
  stats.relics = run.players.map((p) => p.relics.length);
  stats.coopCards = run.players.map((p) => p.deck.filter((c) => cardById[c.cardId]?.coop).length);
  return stats;
}
