import { DEBUFFS, TURN_DECAY } from './types';
import type { Hero } from './hero';
import { cardById } from '../content/cards';
import { encounterById, enemyById } from '../content/enemies';
import { eventById } from '../content/events';
import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import { aliveEnemies, attackable } from './actions';
import { allReady, canPlay, endTurn, playCard, resolveChoice, usePotion, willAct } from './combat';
import { cardStats } from './deck';
import { nextChoices } from './map';
import { Rng, seedFromString } from './rng';
import { computeAttack, computeBlock, getStatus } from './statuses';
import {
  ACTS, addCard, advanceAct, applyRunEffects, beginCombat, buyCard, buyPotion, buyRelic, buyRemove, chooseNode,
  finishCombat, makeShop, newRun, openChest, removeCard, rest, rollActCards, rollActRelics, takeCardReward, closeCardReward, takeRelic,
  upgradeCard, type RunEffectOutcome, resolvePendingAfterFight } from './run';
import type { CardInstance, CombatState, Effect, EnemyCombat, MapNode, PlayerCombat, RunEffect, RunState, Unit } from './types';
import { me } from './runplayer';

/**
 * 會算傷害的機器人（2026-09-02）。
 *
 * `bot.ts` 的隨機機器人只拿來抓引擎例外，勝率遠低於真人，關主一律 0 勝，數字只能看相對。
 * 這隻照真人的思路出牌：先看魔物這回合會打多少、擋得住就擋、擋不住就閃或殺；
 * 有殺傷力的牌打最矮的魔物；能力牌趁早放；忍具留到快死或能收頭的時候用。
 * 地圖、獎勵、商店、貓窩、事件也都照一套簡單的判斷走（見各 pick*）。
 *
 * 用途只有一個：**量平衡**。勝率的絕對值仍然比不上熟練玩家，但比亂打貼近太多，
 * 至少看得出「哪一關、哪一場、哪隻關主」是牆。數字看 `tests/smart.report.test.ts`。
 */

export interface SmartStats {
  seed: string;
  won: boolean;
  floor: number;
  act: number;
  deckSize: number;
  /** 收局時的牌組與秘寶（看爪力從哪裡來用） */
  deckIds: string[];
  relicIds: string[];
  upgraded: number;
  relics: number;
  /** 陣亡的那場遭遇（打贏就是 null） */
  diedTo: string | null;
  /** 每一場關主戰：進場血量與結果 */
  bosses: { id: string; act: number; hpIn: number; maxHp: number; won: boolean; turns: number }[];
  /** 每一場戰鬥：遭遇、掉了多少血、回合數 */
  fights: { id: string; floor: number; act: number; hpLost: number; turns: number; won: boolean; str: number }[];
}

// ===== 牌的靜態評分（挑獎勵、商店、升級、放生用）。10 最想要、0 不要 =====
const RATING: Record<string, number> = {
  // 起手（菲菲的三張照球球的對應牌評：飛針＝貓抓、退開＝淡定、淬毒＝替身術。
  // 沒列的話會照稀有度預設 4，她的起手牌就永遠不算廢牌、一輩子不會被放生，牌組會比球球多帶三張基本牌）
  sanjo: 2, tanding: 2, kawarimi: 3, feifei_feizhen: 2, feifei_tuikai: 2, feifei_cuidu: 3,
  // 忍術 常見
  shunkan: 7, shengdong: 6, shunshou: 5, wozaizhe: 4, jiaochulai: 4, susu: 5, zhangyan: 5, yinshen: 4,
  bianshen: 7, zhuangsi: 4, duxin: 3, qianliyan: 5, shunfenger: 4, dingshang: 6, chudashi: 4, youcike: 5,
  zhanshu: 4, tuozi: 3, roubao: 5, liangzhua: 6, suoyituan: 5, weihe: 5, paozhao: 3, tianmao: 4,
  // 忍術 罕見
  bunshin: 7, feifei_fenshen: 6, ruying: 7, shuaiguo: 3, dingshen: 6, cuimian: 5, fengkou: 4, qianshui: 5, touchi: 5, xianshuile: 2,
  gaotui: 4, jiejie: 7, fantan: 5, luoye: 5, canying: 4, caiweiba: 6, diaohu: 5, sashoujian: 5, jiuming: 5, fanzhua: 4,
  // 忍術 稀有
  meikandao: 6, renwuwancheng: 4, fengyin: 8, wanhua: 8, yingzi: 6, feifei_yingzi: 6, huanying: 8, wufeng: 4, sanhua: 8, jingzhi: 6,
  // 絕學
  tieshazhang: 7, qinna: 6, juye: 5, jinzhong: 8, qinggong: 4, taxue: 5, xuli: 5, tietou: 7, shihou: 7, dianxue: 7,
  zuiquan: 5, yixing: 5, gekong: 4, guixi: 5, taiji: 4, mabu: 7, yungong: 8, yide: 6, tuishou: 5, dieda: 5, shibadie: 6,
  hujin: 6, boming: 6, liandao: 8, jiedao: 6, wangming: 7, tiexin: 9, fanpu: 5, shierlian: 7, huxin: 8, jiuweiquan: 8,
};
export function rating(cardId: string): number {
  const def = cardById[cardId];
  if (!def) return 0;
  if (def.pool === '壞毛病') return -10;
  return RATING[cardId] ?? (def.rarity === '稀有' ? 7 : def.rarity === '罕見' ? 5 : 4);
}

const RELIC_RATING: Record<string, number> = {
  onigiri_bag: 7, tuna_can: 6, catgrass: 5, bell: 7, fish_jar: 4, catnip: 6, tail_bell: 3,
  wood_post: 6, yarn_ball: 8, cat_teaser: 7, scroll: 7, paper_bag: 5, bronze_mirror: 5, tower_token: 8,
  straw_hat: 5, wrist_guard: 7, soft_pad: 6, dried_squid: 4, fish_bone: 7, small_cushion: 7, sardine_tin: 4,
  worn_scroll: 6, lucky_coin: 5, warm_blanket: 5, iron_collar: 8, claw_sheath: 9, ghost_bell: 8,
  counting_beads: 7, still_water: 4, nine_tails: 10, shadow_cloak: 6, last_breath: 6, master_belt: 8, golden_bowl: 8,
};
export const relicRating = (id: string): number => RELIC_RATING[id] ?? 5;

// ===== 戰鬥 =====

/**
 * 玩家在「回合結束的減益衰減跑完之後」的樣子。只用來估傷害，不動真的狀態。
 *
 * 收的是**哪一位**（2026-09-16 量雙人時加的參數）：兩個人一起打時每個座位身上的
 * 翻肚層數不一樣，估錯人等於估錯這一拍會挨多少。不傳就是座位 0，單機完全沒變。
 */
function decayedDefender(p: PlayerCombat): Unit {
  const statuses = { ...p.statuses };
  for (const name of TURN_DECAY) {
    const fresh = p.freshDebuffs[name] ?? 0;
    const have = statuses[name] ?? 0;
    if (have > fresh) statuses[name] = have - 1;
  }
  return { hp: p.hp, maxHp: p.maxHp, block: p.block, statuses };
}

/** 這隻魔物這一拍會打出來的每一下（已算爪力、蓄力、你的翻肚），沒攻擊就是空陣列。`who`＝算在誰身上 */
function incomingHits(cs: CombatState, e: EnemyCombat, who: PlayerCombat = cs.player): number[] {
  return incomingHitList(cs, e, who).map((h) => h.dmg);
}
/** 同上，但帶著「這一下穿不穿蜷縮」 */
function incomingHitList(cs: CombatState, e: EnemyCombat, who: PlayerCombat = cs.player): { dmg: number; pierce: boolean }[] {
  if (e.dead) return [];
  const m = e.move;
  if (!willAct(e)) return [];   // 定身擋整個動作、沉睡什麼都不做——跟引擎與畫面同一支判準
  const x = e.charged ? 2 : 1;
  // 翻肚（受傷 ×1.5）要照**衰減之後**的層數算（稽核 2026-09-10 低-5）：
  // 引擎在魔物出手之前就先把玩家的減益減一層（`endTurn` 裡那段），所以身上剛好 1 層翻肚時
  // 魔物實際打過來是不吃加成的，機器人卻按 1.5 倍估、於是多擋少打。這只影響平衡報告的數字，
  // 但平衡就是靠這支量的。自己這回合疊上去的那幾層不衰減，判準跟引擎那邊一致。
  const player = decayedDefender(who);
  const hits: { dmg: number; pierce: boolean }[] = [];
  for (const fx of m.effects) {
    if (fx.kind === 'damage') for (let i = 0; i < (fx.times ?? 1); i++) hits.push({ dmg: computeAttack(fx.amount * x, e, player), pierce: !!fx.pierce });
    else if (fx.kind === 'damageRandom') hits.push({ dmg: computeAttack(Math.round((fx.min + fx.max) / 2) * x, e, player), pierce: false });
    // 自爆那一下照樣要擋（河豚精的 28 點是整場最痛的單發之一）
    else if (fx.kind === 'selfDestruct') hits.push({ dmg: computeAttack(fx.amount * x, e, player), pierce: false });
    // 照你身上的毒打（鏡中球球學菲菲的見血封喉，2026-09-15）：不估的話機器人會低估這一拍、少擋——
    // 毒流的層數常常比魔物的普攻還痛，而平衡報告就是靠這支量的
    else if (fx.kind === 'damageByPlayerStatus') hits.push({ dmg: computeAttack(getStatus(player, fx.name) * (fx.mul ?? 1) * x, e, player), pierce: false });
  }
  return hits;
}

/**
 * 這回合還會吃到多少：照引擎的順序模擬——每一下先由蜷縮擋，擋不完的那一下才耗一層隱身閃掉；穿透不看蜷縮（2026-09-04 判定順序改了）。
 *
 * `who`＝算誰的（2026-09-16）。兩個人一起打時**一招打全部站著的人、每個人各吃完整一份**
 *（`actions.ts` 的 `ENEMY_HITS_EVERYONE`），所以每一位都照整份清單算，差別只在各自的蜷縮與隱身。
 */
function expectedIncoming(cs: CombatState, who: PlayerCombat = cs.player): number {
  const p = who;
  if (p.immune) return 0;
  const all = aliveEnemies(cs).flatMap((e) => incomingHitList(cs, e, who));
  let block = p.block; let stealth = getStatus(p, '隱身'); let taken = 0;
  for (const h of all) {
    const absorbed = h.pierce ? 0 : Math.min(block, h.dmg);
    const rest = h.dmg - absorbed;
    if (rest > 0 && stealth > 0) { stealth -= 1; block -= absorbed; continue; }
    block -= absorbed; taken += rest;
  }
  return taken;
}
function incomingHitCount(cs: CombatState): number {
  return aliveEnemies(cs).reduce((s, e) => s + incomingHits(cs, e).length, 0);
}

/** 這張牌打在這隻魔物身上大概能扣多少血（吃過爪力、翻肚、防禦、隱身） */
/**
 * `noStrength`：**忍具的傷害不吃爪力**（`effects.ts` 的 `noStrength: ctx.source === 'potion'`）。
 * 不傳的話估出來是「傷害＋爪力」，實際只有傷害——球球爪力 6、魔物血 18 防禦 20 時
 * 會估成「18 打得死」而開掉一支 45 條的忍具，實際只進 12 點、魔物活著剩 6 血
 *（稽核 2026-09-11 中-2）。牌的呼叫端不傳，維持原本行為。
 */
function damageTo(cs: CombatState, effects: Effect[], e: EnemyCombat, combo: number, doubled: boolean, plays = 0, noStrength = false,
                  who: PlayerCombat = cs.player): number {
  if (!attackable(cs, e)) return 0;
  if (getStatus(e, '隱身') > 0) return 0;
  let block = e.block;
  let total = 0;
  const p = who;   // 出手的是哪一位（2026-09-16 量雙人時加的；不傳就是座位 0，單機一個位元都沒變）
  // 飛行（燈蛾、月蛾后）：每一下先減半，扣到血就掉一層，掉到 0 之後才打得到全額
  let flying = getStatus(e, '飛行');
  // 虛化（虛無貓，2026-09-03）：每一段最多只扣 1 點血。防禦照原本的量扣掉，只有進血條的那幾點被壓成 1
  const phasing = getStatus(e, '虛化') > 0;
  const swing = (raw: number, ignoreBlock = false): void => {
    const dmg = flying > 0 ? Math.floor(raw / 2) : raw;
    const ab = ignoreBlock ? 0 : Math.min(block, dmg);
    block -= ab; total += phasing ? Math.min(1, dmg - ab) : dmg - ab;
    if (flying > 0 && dmg - ab > 0) flying -= 1;
  };
  for (const fx of effects) {
    if (fx.kind === 'damage') {
      const times = fx.scaleWithCombo ? Math.min(combo + 1, fx.comboCap ?? 99) : (fx.times ?? 1);
      for (let i = 0; i < times; i++) swing(computeAttack(fx.amount * (doubled ? 2 : 1), p, e, { noStrength }), fx.ignoreBlock);
    } else if (fx.kind === 'damageRamp') {
      // 分身術：這場這張已打過幾次就加幾段（plays 由呼叫端查 cs.cardPlays）
      swing(computeAttack((fx.amount + fx.step * plays) * (doubled ? 2 : 1), p, e, { noStrength }));
    } else if (fx.kind === 'damageRandom') {
      swing(computeAttack(Math.round((fx.min + fx.max) / 2) * (doubled ? 2 : 1), p, e, { noStrength }));
    } else if (fx.kind === 'damageEqualBlock') {
      // 這裡也要乘加倍，跟 `effects.ts` 同步（稽核 2026-09-10 中-3）：
      // 同一支函式的 damage／damageRamp／damageRandom 三個分支都乘了，只有這個漏掉，
      // 蓄力／秘笈在手時「絕學·借力使力」的價值被低估一半，機器人不會挑它、牌價值表也偏低
      swing(computeAttack(p.block * (doubled ? 2 : 1), p, e, { noStrength: true }));
    } else if (fx.kind === 'damageByStatus') {
      // 見血封喉：把毒一次引爆。引擎走 `direct`，蜷縮擋不住，所以這裡也要 ignoreBlock。
      // 倍率要算進去（升級版兩倍），不然機器人會低估那張牌、永遠不挑它
      // 加倍也要乘，跟 `effects.ts` 同步（夜間稽核 高-1）
      swing(getStatus(e, fx.name) * (fx.mul ?? 1) * (doubled ? 2 : 1), true);
    } else if (fx.kind === 'execByStatus') {
      // 一針斃命：毒夠多就直接了結，不夠就什麼都沒發生
      if (getStatus(e, fx.name) >= e.hp) swing(e.hp, true);
    }
  }
  return total;
}

interface Plan { uid: number; target?: number; value: number; cost: number; endsTurn: boolean }

/**
 * 幫每一張打得出的牌估一個「現在打出去值多少」。
 *
 * `seat`＝現在輪到誰在挑牌（2026-09-16 量雙人時加的）。不傳就是座位 0，單機那條路一個字都沒動；
 * 連線量測時兩個座位各叫一次，估的是各自的手牌、飯糰、蜷縮與身上的狀態。
 */
function evaluate(cs: CombatState, c: CardInstance, incoming: number, hits: number, seat = 0): Plan | null {
  const p = (cs.players[seat] ?? cs.player) as PlayerCombat;
  const st = cardStats(c);
  const def = st.def;
  const enemies = aliveEnemies(cs);
  const target0 = def.target === 'enemy' ? enemies.find((e) => attackable(cs, e)) ?? enemies[0] : undefined;
  const chk = canPlay(cs, c.uid, target0?.uid, seat);
  if (!chk.ok) return null;
  const lowHp = p.hp - incoming <= 0;          // 不擋就死
  const danger = p.hp - incoming < p.maxHp * 0.35;
  const totalEnemyHp = enemies.reduce((s, e) => s + (attackable(cs, e) ? e.hp + e.block : 0), 0);
  let value = 0;
  let endsTurn = false;
  let target: number | undefined;
  const combo = p.cardsPlayedThisTurn;
  const plays = cs.cardPlays?.[c.uid] ?? 0;   // 分身術這場已打過幾次
  /** 粗估這一場還要打幾回合（長效旗標要乘它；跟 `power` 那條同一個算法） */
  const rest = Math.max(1, Math.min(8, Math.ceil(totalEnemyHp / 14)));
  /*
   * 這張牌會不會打人——**決定要不要進挑目標那一段**，而挑不到目標的指定牌會被
   * `if (def.target === 'enemy' && !target) return null` 整張丟掉。
   *
   * 2026-09-12 補上菲菲那三種（遠射、見血封喉、一針斃命）：漏掉的話機器人
   * **一輩子都打不出那三張**，而且完全不會報錯——量平衡時會安靜地少掉她三張主力。
   * 加新的傷害種類記得回頭補這一行，跟 `damageTo` 是一對。
   */
  const DMG_KINDS: ReadonlySet<Effect['kind']> = new Set(
    ['damage', 'damageRamp', 'damageRandom', 'damageEqualBlock', 'damageByStatus', 'execByStatus']);
  const hasDamage = st.effects.some((fx) => DMG_KINDS.has(fx.kind));

  if (hasDamage) {
    // 挑目標：能打死的優先（少一隻就少挨一份），否則打最矮的能打的那隻
    let best: { e: EnemyCombat; v: number } | null = null;
    for (const e of enemies) {
      if (!attackable(cs, e)) continue;
      const dmg = damageTo(cs, st.effects, e, combo, p.doubleNext > 0, plays, false, p);
      // 牠有隱身：這一下會落空，但不打掉那層永遠打不到牠——便宜的攻擊牌照樣值得丟
      let v = dmg > 0 ? dmg : getStatus(e, '隱身') > 0 ? 3 / Math.max(1, st.cost) : 0;
      if (dmg >= e.hp) v += 8 + incomingHits(cs, e, p).reduce((s, h) => s + h, 0);   // 收頭：牠這回合的傷害也一起省掉
      else v += e.hp < 20 ? 2 : 0;
      // 牠身上有反彈：每打一下就被刺一下（2026-09-02 反彈才真的生效），多段牌撞上去很痛
      const hits = st.effects.reduce((n, fx) => n + (fx.kind === 'damage' ? (fx.times ?? 1) : fx.kind === 'damageRandom' || fx.kind === 'damageEqualBlock' || fx.kind === 'damageRamp' ? 1 : 0), 0);
      if (getStatus(e, '反彈') > 0 && dmg < e.hp) v -= getStatus(e, '反彈') * hits * (lowHp ? 4 : 1.5);
      if (!best || v > best.v) best = { e, v };
    }
    if (def.target === 'all') {
      value += enemies.reduce((s, e) => s + damageTo(cs, st.effects, e, combo, p.doubleNext > 0, plays, false, p), 0);
      if (best) value += best.v - damageTo(cs, st.effects, best.e, combo, p.doubleNext > 0, plays, false, p);
    } else if (best) { value += best.v; target = best.e.uid; }
    if (def.target === 'enemy' && !target) return null;
    // 全場快清光了就別留手
    if (totalEnemyHp <= 12) value += 3;
  }
  for (const fx of st.effects) {
    switch (fx.kind) {
      case 'block': {
        // 拒馬（`blockBonus`）要一起算：引擎是 `computeBlock(base + blockBonus, u)`
        //（見 `actions.ts` 的 `gainBlock`）。漏掉的話，拿到拒馬之後**每一張**防禦牌、
        // 每一張自帶蜷縮的攻擊牌都被低估 2～3 點，機器人會傾向不打它們，
        // 而這支是量平衡用的尺，於是拒馬流的數字整個偏低（2026-09-12 稽核 中-3）
        const b = computeBlock(fx.amount + (p.blockBonus ?? 0), p);
        const useful = Math.min(b, incoming);
        value += useful * (lowHp ? 3 : danger ? 1.6 : 1.1) + (b - useful) * 0.12;
        break;
      }
      case 'blockIfPoisoned': {
        /*
         * 跟 `block` 同一條算式，但**目標原本沒中毒就一點都拿不到**
         * （2026-09-16：她的攻擊牌不再無條件送蜷縮）。
         *
         * 打全體的牌沒有指定目標，跟引擎同一個規矩：看場上最高的那一層。
         * 這裡照實算而不是打個折，因為這支是量平衡用的尺——估錯的話
         * 「先下毒再打」這個新的出牌順序就量不出來。
         */
        const t = target === undefined ? undefined : enemies.find((e) => e.uid === target);
        const poisoned = t ? getStatus(t, '中毒')
          : Math.max(0, ...enemies.filter((e) => attackable(cs, e)).map((e) => getStatus(e, '中毒')));
        if (poisoned > 0) {
          const b2 = computeBlock(fx.amount + (p.blockBonus ?? 0), p);
          const useful2 = Math.min(b2, incoming);
          value += useful2 * (lowHp ? 3 : danger ? 1.6 : 1.1) + (b2 - useful2) * 0.12;
        }
        break;
      }
      case 'status':
        if (fx.target === 'self') {
          if (fx.name === '隱身') {
            // 隱身排在蜷縮後面：照引擎順序把蜷縮一路吃掉，留下「擋不完的那幾下」（穿透不看蜷縮），由大到小估前幾層閃掉的價值（八成）（稽核 2026-09-04 低 7）
            let pool = p.block;
            const passing: number[] = [];
            for (const h of enemies.flatMap((e) => incomingHitList(cs, e, p))) {
              const ab = h.pierce ? 0 : Math.min(pool, h.dmg); pool -= ab;
              if (h.dmg - ab > 0) passing.push(h.dmg - ab);
            }
            const all = passing.sort((a, b) => b - a);
            const cur = getStatus(p, '隱身');
            const gain = all.slice(cur, cur + fx.amount).reduce((s, h) => s + h, 0) * 0.8;
            value += gain * (lowHp ? 3 : danger ? 1.6 : 1.1) + (fx.amount - Math.min(fx.amount, Math.max(0, all.length - cur))) * 1.5;
          } else if (fx.name === '爪力') value += fx.amount * 4 * Math.min(1, totalEnemyHp / 40);
          else if (fx.name === '貓步') value += fx.amount * 3;
          else if (fx.name === '反彈') value += fx.amount * Math.min(hits, 4) * 0.8;
          else if (fx.name === '潛水') value += fx.amount * 4;
          else if (fx.name === '鐵布衫') value += fx.amount * 0.9;
          else if (fx.name === '翻肚') value -= 6;   // 出大事了的代價
        } else {
          const n = fx.target === 'all' ? enemies.length : 1;
          if (fx.name === '翻肚') value += 5 * n;
          /*
           * 中毒**會疊**，所以估的要是「這幾層多打出多少」，不是「這幾層自己打多少」。
           *
           * N 層的總傷害是 N(N+1)/2。原本寫 `amount*(amount+1)/2`，等於假設牠身上本來是乾淨的：
           * 對著已經 10 層的再加 3 層，實際是 91−55＝**36 點**，原本卻只估成 6 點。
           * 差六倍，而機器人就是照這個數字挑牌——堆毒流在牠手上永遠疊不起來
           *（2026-09-12 量菲菲時抓到：她 15F 陣亡 216／300，球球只有 161）。
           * 另外**打超過牠的血就是浪費**，估值夾在牠現在的生命。
           */
          else if (fx.name === '中毒') {
            const tri = (k: number): number => k * (k + 1) / 2;
            const amt = fx.amount + (fx.step ?? 0) * plays;   // 菲菲的分身術：這場打過幾次就多幾段
            const marginal = (e: EnemyCombat): number => {
              const cur = getStatus(e, '中毒');
              return Math.min(tri(cur + amt) - tri(cur), e.hp);
            };
            const hit = fx.target === 'all' ? enemies
              : [target !== undefined ? enemies.find((e) => e.uid === target) : undefined, target0, enemies[0]].find((e) => !!e);
            const list = Array.isArray(hit) ? hit : hit ? [hit] : [];
            value += list.reduce((sum, e) => sum + marginal(e), 0) * 0.9;
          }
          else if (fx.name === '懶洋洋') value += Math.min(incoming, 12) * 0.25 * n + 2;
          else if (fx.name === '炸毛') value += 1.5 * n;
          else if (fx.name === '定身') {
            const stunned = target !== undefined ? enemies.find((e) => e.uid === target) : enemies.slice().sort((a, b) => incomingHits(cs, b, p).reduce((s, h) => s + h, 0) - incomingHits(cs, a, p).reduce((s, h) => s + h, 0))[0];
            const saved = stunned ? incomingHits(cs, stunned, p).reduce((s, h) => s + h, 0) : 0;
            value += saved * (lowHp ? 3 : 1.2) + 3;
            if (stunned && def.target === 'enemy' && !hasDamage) target = stunned.uid;
          }
        }
        break;
      case 'draw': value += fx.n * (p.energy - st.cost > 0 ? 3 : 1.2); break;
      case 'drawNextTurn': value += fx.n * 2; break;
      case 'drawIfTargetStatus': value += 1; break;
      case 'energy': value += fx.n * 3.5; break;
      case 'heal': value += Math.min(fx.percent ? Math.round(p.maxHp * fx.percent / 100) : fx.n, p.maxHp - p.hp) * (danger ? 1.5 : 0.9); break;
      case 'gold': value += fx.onKill ? 0.5 : fx.n * 0.15; break;
      case 'power': {
        // 能力越早放越划算：粗估還要打幾回合
        const turnsLeft = Math.max(1, Math.min(8, Math.ceil(totalEnemyHp / 14)));
        let per = 0;
        for (const sub of fx.effects) {
          if (sub.kind === 'block') per += sub.amount * 0.9;
          else if (sub.kind === 'status' && sub.name === '爪力') per += sub.amount * 3.5;
          else if (sub.kind === 'status' && sub.name === '貓步') per += sub.amount * 2.5;
          else if (sub.kind === 'draw') per += sub.n * 2.5;
          else if (sub.kind === 'heal') per += sub.n * 0.6;
        }
        value += per * (fx.thisTurn ? 1 : turnsLeft) * (fx.trigger === 'onKill' ? 0.4 : fx.trigger === 'turnEndNoAttack' ? 0.3 : 1);
        break;
      }
      case 'immuneThisTurn': value += incoming * (lowHp ? 3 : 1.2); break;
      case 'doubleNextAttack': value += p.hand.some((h) => h.uid !== c.uid && cardById[h.cardId]?.type === '攻擊') ? 6 : 0; break;
      case 'selfDamage': value -= fx.amount * (danger ? 3 : 0.8); break;
      case 'endTurn': endsTurn = true; break;
      case 'noAttacksThisTurn': value -= p.hand.filter((h) => cardById[h.cardId]?.type === '攻擊').length * 2; break;
      case 'stealBlock': value += (target !== undefined ? enemies.find((e) => e.uid === target)?.block ?? 0 : 0) * 1.2; break;
      case 'cleanse': value += Object.entries(p.statuses).filter(([k, v]) => (DEBUFFS as readonly string[]).includes(k) && (v ?? 0) > 0).length * 4; break;
      case 'doubleStatus': {
        const best = enemies.reduce((m, e) => Math.max(m, getStatus(e, fx.name)), 0);
        value += best * (best + 1) / 2 * 0.9;
        if (best > 0 && def.target === 'enemy' && !hasDamage) target = enemies.find((e) => getStatus(e, fx.name) === best)!.uid;
        break;
      }
      case 'transferDebuffs': value += (getStatus(p, '中毒') + getStatus(p, '翻肚') * 2 + getStatus(p, '懶洋洋')) * 1.5; break;
      case 'removeStatuses': {
        const cap = fx.max ?? 99;
        value += (target !== undefined ? Math.min(cap, enemies.find((e) => e.uid === target)?.block ?? 0) * 0.8 + Math.min(cap, getStatus(enemies.find((e) => e.uid === target) ?? p, '爪力')) * 4 : 0);
        break;
      }
      case 'scry': value += 1; break;
      case 'exhaustFromHand': value += p.hand.some((h) => cardById[h.cardId]?.pool === '壞毛病') ? 4 : -1; break;
      case 'retainFromHand': value += 1.5; break;
      case 'discardFromHand': value -= 1; break;
      case 'recoverFromDiscard': value += p.discardPile.length ? 3 : -5; break;
      case 'damage': case 'damageEqualBlock': case 'damageRamp': case 'damageRandom': break;   // 傷害在 switch 之前的傷害估算區另算，這裡不重複計
      case 'damageScatter': value += fx.amount * fx.times * 0.8; break;   // 打散：單隻場面等於集中火力，多隻場面會浪費一點，打八折
      case 'skipEnemyTurn': value += 12; break;                          // 整輪不挨打，價值約等於一次大防禦
      /*
       * 幫隊友的三招（連線版 2026-09-11）。機器人是**單人**在跑，所以這裡估的是
       * 「一個人玩的時候值多少」——那正是它們退化後的價值，估高了會讓機器人
       * 在單機測試裡優先打連線牌，平衡數字就歪了。
       */
      case 'blockAll': value += (fx.amount + (p.blockBonus ?? 0)) * 0.9; break;   // 一個人時就等於一般的蜷縮，稍微打折（沒有同伴可分）；拒馬同樣要算
      case 'statusAlly': value += fx.amount * 1.5; break; // 一個人時退化成掛自己身上，當一般的加狀態估
      case 'taunt': break;                                // 一個人時**完全沒作用**（本來就只會打你），估 0 是對的
      case 'blockAlly': value += (fx.amount + (p.blockBonus ?? 0)) * 0.9; break;   // 一個人時退化成給自己，當一般蜷縮估（稍打折：沒有同伴可分擔）；拒馬同樣要算
      case 'drawAlly': value += fx.n * 2.2; break;         // 一個人時退化成自己抽，跟 `draw` 同口徑
      case 'cleanseAlly': value += DEBUFFS.filter((d) => getStatus(p, d) > 0).length * 3; break;
      case 'energyAlly': value += fx.n * 4; break;         // 一顆飯糰約等於一張中等的牌
      // 見血封喉／一針斃命：傷害本身在 switch 之前的傷害估算區（`damageTo`）已經算過、也挑好了目標，這裡不重複計
      //（原本又加一次「目標身上幾層」，這兩張被高估一倍多——夜間稽核留的「見血封喉估值算兩次」）。
      // 只留原本那個語意：不清毒的話毒會繼續滾，同樣層數比一次性的傷害多值三成
      case 'damageByStatus': if (target0 && !fx.consume) value += getStatus(target0, fx.name) * (fx.mul ?? 1) * 0.3; break;
      case 'execByStatus': break;
      /*
       * 三個長效旗標：機器人是**單人**在跑，估的是「這一場剩下的回合裡大概值多少」。
       * `rest` 跟 `power` 那條用同一個粗估法（還要打幾回合），口徑才一致。
       */
      // 散毒：把目標的毒分給其他每一隻。估的是「其他那幾隻多出來的總傷害」——只剩一隻時等於 0
      case 'spreadStatus': {
        const t = target0 ?? enemies[0];
        const n = t ? getStatus(t, fx.name) : 0;
        const each = fx.half ? Math.floor(n / 2) : n;
        const tri = (k: number): number => k * (k + 1) / 2;
        value += enemies.filter((e) => e !== t).reduce((sum, e) => {
          const cur = getStatus(e, fx.name);
          return sum + Math.min(tri(cur + each) - tri(cur), e.hp);
        }, 0) * 0.9;
        break;
      }
      case 'poisonBurst': value += enemies.length > 1 ? 16 : 4; break;   // 只剩一隻時屍爆沒有對象
      // 拒馬：之後每次獲得蜷縮都多幾點。粗估這一場還會再擋幾次（每回合約一次）
      case 'blockBonus': value += fx.n * rest * 0.9; break;
      /*
       * 影子分身：之後每回合的第一張牌等於打兩次。粗估＝「剩幾回合 × 一張好牌的價值」。
       * 一張好牌抓 12 點當量（這副牌的攻擊牌大多 6～16），跟 `blockBonus` 同一套折算法。
       * **估太準沒有意義**——重點是它不能被當成零分，不然機器人永遠不打，量出來的平衡會偏低。
       */
      case 'echoFirst': value += rest * 12 * 0.9; break;
      case 'poisonOnAttack': value += fx.n * rest * 1.5; break;
      // 連線支援牌（2026-09-13）。機器人跑的是**單人**對照，所以這兩個都照
      // 「退化成作用在自己身上」估——那正是單人時真正會發生的事。
      case 'healAlly': value += fx.n * 0.8; break;          // 跟 `heal` 同一個係數
      // B 批六個。機器人跑的是**單人**對照，所以一律照「退化成自己」估：
      //   - 讀同伴的值 → 讀自己的（`blockFromAllyBlock`、`damageFromAllyStrength`）
      //   - 轉飯糰給同伴 → 單人時什麼都不發生，估 0 才對
      case 'blockFromAllyBlock':
        value += (fx.amount + Math.min(fx.half ? Math.floor(p.block / 2) : p.block, fx.cap)) * 1.0;
        break;
      case 'damageFromAllyStrength':
        value += (fx.amount + Math.min(getStatus(p, '爪力'), fx.cap)) * 1.1;
        break;
      case 'energyTransfer': break;                         // 單人時不轉，真的是 0
      case 'doubleNextAttackAlly':
        // 跟 `doubleNextAttack` 同一套：手上還有別的攻擊牌才有價值
        value += p.hand.some((h) => h.uid !== c.uid && cardById[h.cardId]?.type === '攻擊') ? 6 : 0;
        break;
      case 'drawAllyIfTargetStatus': {
        const t = target !== undefined ? enemies.find((e) => e.uid === target) : undefined;
        const hit = !t ? false
          : fx.anyDebuff ? (DEBUFFS as readonly string[]).some((d) => getStatus(t, d as never) > 0)
            : fx.name !== undefined && getStatus(t, fx.name) > 0;
        value += hit ? fx.n * 3 : 0;
        break;
      }
      /*
       * C 批六個。機器人跑的是**單人**對照。
       * 2026-09-13 稽核之後這幾張單人時都有退路了（改成監聽自己、發給自己），
       * 所以估值一律照「作用在自己身上」算，每輪各值一次抽牌或一份蜷縮，
       * 用 `rest`（剩幾回合）折算，跟 `blockBonus` 同一套。
       */
      case 'watchAllyPlay': value += rest * 3 * 0.9; break;         // 每輪抽 1 張
      case 'watchSelfPlay': value += rest * 6 * 0.9; break;         // 每輪 6 點蜷縮
      case 'watchPoisonHit': value += rest * 4 * 0.7; break;        // 每輪 4 點，但要湊中毒的條件
      case 'poisonAllyNextAttack': value += fx.amount * 2; break;   // 2 層毒≒3 點傷害，再給點餘裕
      case 'energyForAllyEachRound': value += rest * 3 * 0.9; break;  // 每輪 1 顆飯糰
      case 'transferDebuffsFromAlly':
        // 單人時等同 `transferDebuffs`，照它的係數
        value += (getStatus(p, '中毒') + getStatus(p, '翻肚') * 2 + getStatus(p, '懶洋洋')) * 1.5;
        break;
      case 'ifSelfStatus': {
        /*
         * 兩條分支都粗估一次、取**比較小**的那個。
         *
         * 為什麼不遞迴呼叫這支：整個估值是一個很長的 switch 寫在迴圈裡，沒有可重入的函式，
         * 為了一張牌把它拆開重構不划算。這裡只把分支裡的數字加總——
         * 那些效果（蜷縮、隱身、抽牌）的量級本來就差不多，估值只是用來
         * 決定「值不值得打」，不需要準。
         *
         * 取小的那邊是因為**高估比低估糟**：高估會讓機器人為了賭一個分支浪費飯糰，
         * 量出來的平衡就偏高，而平衡數字是拿來做決策的。
         */
        const crude = (es: typeof fx.then): number => es.reduce((s, e) => {
          const n = (e as { amount?: number; n?: number }).amount ?? (e as { n?: number }).n ?? 0;
          return s + n;
        }, 0);
        value += Math.min(crude(fx.then), crude(fx.otherwise)) * 0.9;
        break;
      }
      default: { const _never: never = fx; void _never; }   // 每加一種效果都得來這裡寫一行估值，不能靜默估 0（體檢 2026-09-05）
    }
  }
  // 要指定目標卻還沒挑（盯上你了、威嚇、封口術這類不打人的）：減益丟給最壯的那隻
  if (def.target === 'enemy' && target === undefined) {
    const big = enemies.filter((e) => attackable(cs, e)).sort((a, b) => b.hp - a.hp)[0] ?? target0;
    if (!big) return null;
    target = big.uid;
  }
  // 費用效率：同樣的價值便宜的先打；0 費的牌永遠可以塞
  const cost = chk.cost;
  return { uid: c.uid, target, value: value - cost * 0.6, cost, endsTurn };
}

function pickPending(cs: CombatState, rng: Rng): void {
  const pd = cs.pending;
  if (!pd) return;
  const score = (c: CardInstance): number => rating(c.cardId) + (c.upgraded ? 1 : 0);
  let picks: number[] = [];
  const sorted = [...pd.cards];
  if (pd.purpose === 'exhaust' || pd.purpose === 'discard' || pd.purpose === 'scryDiscard') {
    sorted.sort((a, b) => score(a) - score(b));   // 最爛的先丟
    const n = pd.purpose === 'scryDiscard' ? Math.min(pd.max, sorted.filter((c) => score(c) <= 2).length) : pd.min;
    picks = sorted.slice(0, n).map((c) => c.uid);
  } else {
    sorted.sort((a, b) => score(b) - score(a));   // 最好的先留／拿回來
    picks = sorted.slice(0, Math.max(pd.min, Math.min(pd.max, 1))).map((c) => c.uid);
  }
  if (!resolveChoice(cs, picks)) {
    // 保底：亂選也要把它解掉，不然引擎卡住
    const fallback = rng.shuffle(pd.cards).slice(0, pd.min).map((c) => c.uid);
    if (!resolveChoice(cs, fallback)) throw new Error('resolveChoice 被拒');
  }
}

/** `seat`＝誰要喝（2026-09-16 量雙人時加的）。不傳就是座位 0，`p.potions` 跟 `cs.potions` 是同一個陣列，單機完全沒變 */
function maybePotion(cs: CombatState, incoming: number, seat = 0): boolean {
  const p = (cs.players[seat] ?? cs.player) as PlayerCombat;
  /** 喝自己袋子裡的那一瓶（忍具各帶各的，見 `usePotion` 的 seat） */
  const drink = (potionId: string, targetUid?: number): boolean => usePotion(cs, potionId, targetUid, seat);
  const enemies = aliveEnemies(cs).filter((e) => attackable(cs, e));
  const boss = cs.enemies.some((e) => enemyById[e.enemyId]?.pool === '塔主');
  for (const id of [...p.potions]) {
    const def = potionById[id];
    if (!def) continue;
    // 有使用條件的（起死回生丹要血低於三成）現在用不出來就跳過（稽核 2026-09-11 中-3）。
    // 不濾的話 `usePotion` 會回 false，而 `maybePotion` 拿到 false 就整支 return，
    // 同一輪連後面那支九命符都不會試——`bot.ts` 補了這一條，這裡漏了，兩支機器人不同調
    const u = def.usable;
    if (u && !u.check(p.hp, p.maxHp)) continue;
    const kinds = def.effects.map((f) => f.kind);
    const heal = def.effects.find((f) => f.kind === 'heal');
    // `percent` 是回最大生命的百分之幾，`n` 這時是 0——照 `n` 判會讓「缺的血夠不夠回」恆為真
    const healAmt = heal?.kind === 'heal' ? (heal.percent ? Math.round(p.maxHp * heal.percent / 100) : heal.n) : 0;
    if (healAmt > 0 && p.hp <= p.maxHp * 0.4 && p.maxHp - p.hp >= healAmt) return drink(id);
    if ((kinds.includes('block') || (kinds.includes('status') && def.effects.some((f) => f.kind === 'status' && f.name === '隱身')))
      && incoming >= 10 && p.hp - incoming <= p.maxHp * 0.35) return drink(id);
    // **無視防禦的不在這裡處理**（稽核 2026-09-11 中-1）：這條用 `hp + block <= total` 判斷，
    // 對破甲錐來說 `block` 根本不該算進去，而且它沒扣飛行的砍半——
    // 一隻飛著、血 8、防禦 3 的魔物會被這條接走（8+3 <= 12），實際只打進 6 點、45 條白燒。
    // 那支交給下面用 `damageTo` 估的專屬分支。
    const dmg = def.effects.find((f) => f.kind === 'damage' && !f.ignoreBlock);
    if (dmg && dmg.kind === 'damage') {
      const total = dmg.amount * (dmg.times ?? 1);
      const victim = enemies.find((e) => e.hp + e.block <= total && e.hp >= 6);
      if (victim && dmg.target !== 'all') return drink(id, victim.uid);
      if (dmg.target === 'all' && enemies.length >= 2 && enemies.some((e) => e.hp <= total)) return drink(id);
    }
    if (kinds.includes('energy') && p.energy === 0 && p.hand.filter((c) => canPlay(cs, c.uid, enemies[0]?.uid, seat).ok || cardStats(c).cost > 0).length >= 2
      && (incoming > p.block || enemies.some((e) => e.hp <= 15))) return drink(id);
    if (kinds.includes('cleanse') && getStatus(p, '中毒') >= 4) return drink(id);
    /*
     * 2026-09-11 新增的那批忍具（稽核中-4）。原本 `maybePotion` 只認回血、防禦、隱身、傷害、
     * 飯糰、清減益與關主戰那兩種狀態，七支新忍具裡有五支它一輩子不會用——
     * 忍具池 20→27 之後有兩成六的抽中率是機器人拿了不會用的東西，
     * 而 `tests/smart.report.test.ts` 是這個專案唯一的平衡訊號來源，那份報告會靜靜失真。
     */
    // 貓爪雷：隨機分散，所以只在「有人快死了」或「一群小怪」時才划算
    const scatter = def.effects.find((f) => f.kind === 'damageScatter');
    if (scatter?.kind === 'damageScatter') {
      const total = scatter.amount * scatter.times;
      if (enemies.length === 1 && enemies[0]!.hp + enemies[0]!.block <= total) return drink(id);
      if (enemies.length >= 2 && enemies.every((e) => e.hp <= scatter.amount)) return drink(id);
    }
    /*
     * 下面幾條各自帶一個「已經生效就別再燒」的守衛（複核 2026-09-11 中-1）。
     * 用掉忍具只會改 `cs.skipEnemies`／`p.immune`／`p.doubleNext` 這些旗標，
     * `incoming`、`p.hp`、`p.block` 一個都沒變，`smartCombat` 的 `continue` 會讓這支再跑一次，
     * 帶兩支同款就在同一輪連燒兩支——分身油最慘，`doubleNext = 1` 是**指派**不是累加，第二支全白費。
     */
    // 先手香：整輪不挨打。挨的量夠大才捨得用，跟防禦、隱身那條同一個門檻
    if (kinds.includes('skipEnemyTurn') && !cs.skipEnemies && incoming >= 12 && p.hp - (incoming - p.block) <= p.maxHp * 0.45) return drink(id);
    // 鐵布衫膏：這回合免疫，用在會被打很痛的那一輪（比先手香更該留到大場面）
    if (kinds.includes('immuneThisTurn') && !p.immune && incoming >= 15 && p.hp - (incoming - p.block) <= p.maxHp * 0.4) return drink(id);
    // 分身油：下一擊加倍，關主戰蓄力那一拍最有價值；手上得真的有攻擊牌打得出去
    if (kinds.includes('doubleNextAttack') && boss && p.doubleNext === 0 && p.energy >= 1
      && p.hand.some((c) => cardById[c.cardId]?.type === '攻擊' && cardStats(c).effects.some((f) => f.kind === 'damage' && f.amount >= 10))) return drink(id);
    // 定身釘：只有七成會中，所以留到「下一拍會被打很痛」時用
    if (def.effects.some((f) => f.kind === 'status' && f.target !== 'self' && f.name === '定身')
      && incoming >= 12 && p.hp - (incoming - p.block) <= p.maxHp * 0.45) {
      const t = enemies[0];
      if (t && def.target === 'enemy') return drink(id, t.uid);
      if (def.target === 'all') return drink(id);
    }
    // 撿回來：棄牌堆有東西、手牌又空得差不多時才有意義
    if (kinds.includes('recoverFromDiscard') && p.discardPile.length > 0 && p.hand.length <= 2 && p.energy >= 1) return drink(id);
    /*
     * 2026-09-11 第二批（五支對敵忍具）。同樣是為了 `tests/smart.report.test.ts` 那份平衡報告：
     * 機器人不會用的忍具等於白白佔掉抽中率，勝率會被壓低而且看不出原因。
     */
    // 順手牽羊爪：目標防禦夠厚才划算（搶過來的同時也清掉牠的防禦，一來一回）
    if (kinds.includes('stealBlock')) {
      const fat = enemies.find((e) => e.block >= 10);
      if (fat) return drink(id, fat.uid);
    }
    // 加倍奉還：身上中毒越多翻倍越賺；沒有中毒也有保底 2 層，但留著等中毒流起來比較好
    const dbl = def.effects.find((f) => f.kind === 'doubleStatus');
    if (dbl?.kind === 'doubleStatus') {
      const t = enemies.find((e) => getStatus(e, dbl.name) >= 3);
      if (t) return drink(id, t.uid);
    }
    // 亂石包：門檻用**期望值**，跟同檔 `damageTo` 估隨機傷害的口徑一致（稽核 2026-09-11 低-2）。
    // 原本寫 `<= rnd.min`（6），只有「血＋防禦剛好五六點」才會用，等於補了等於沒補
    const rnd = def.effects.find((f) => f.kind === 'damageRandom');
    if (rnd?.kind === 'damageRandom') {
      const avg = (rnd.min + rnd.max) / 2;
      const victim = enemies.find((e) => e.hp + e.block <= avg && e.hp >= 5);
      if (victim) return drink(id, victim.uid);
    }
    /*
     * 以彼之道：拿現有的蜷縮換傷害（用完蜷縮還在，不是消耗掉）。
     * **只在打得死的時候用**（稽核 2026-09-11 中-1）：原本還有個 `?? enemies[0]` 的退路，
     * 蜷縮一到 14 就對隨便一隻開一支 50 條的忍具，平衡報告會被這支的浪費污染——
     * 正是這批補判斷想避免的事。旁邊那條 `dmg`（固定傷害）也是只在打得死時才用，口徑一致。
     */
    if (kinds.includes('damageEqualBlock') && p.block >= 14) {
      const victim = enemies.find((e) => e.hp + e.block <= p.block);
      if (victim) return drink(id, victim.uid);
    }
    /*
     * 拔狀態的三支（破功散、剪刺鉗、黏鳥膠）**寫在同一個區塊、照 `names` 分流**。
     *
     * 分開寫過一次，出了兩個洞（稽核 2026-09-11 高-1、高-2）：
     *   ① 破功散那條原本只判「是不是 `removeStatuses`」，而剪刺鉗也是——
     *      場上隨便一隻魔物爪力堆到 5（一般戰第 10 回合起魔氣暴走每回合全體 +1，幾輪就到），
     *      機器人就拿 40 條的剪刺鉗去拔牠身上根本沒有的反彈，白燒一支。
     *   ② 黏鳥膠中途改用新效果 `ground`，而判斷還在找 `removeStatuses`，
     *      整條變成永遠進不去的死碼——機器人抽到它就只是佔一格到戰鬥結束。
     * 兩個洞壞的都不是玩家看得到的東西，是 `tests/smart.report.test.ts` 那份
     * 專案唯一的平衡訊號；之後每次調平衡都會帶著看不見的偏差。
     *
     * 判準一律用「那個麻煩現在有多痛」，不是「有沒有出現」——出現就用會讓機器人在小怪身上
     * 把 40~60 條的忍具燒光。
     */
    const strip = def.effects.find((f) => f.kind === 'removeStatuses');
    if (strip?.kind === 'removeStatuses') {
      const names = strip.names;
      if (names.includes('爪力')) {
        // 破功散：拔爪力／貓步／鱗甲／不壞身。加權後夠多才用，拔一兩層不值 60 條
        //（加權式子沒算貓步：魔物身上的貓步只有鏡貓抄得到，權重併進爪力那一項就夠）
        const buffed = enemies.find((e) => getStatus(e, '爪力') + getStatus(e, '鱗甲') * 2 + getStatus(e, '不壞身') * 3 >= 5);
        if (buffed) return drink(id, buffed.uid);
      } else if (names.includes('飛行')) {
        // 黏鳥膠：飛行 3 層以上才值得——1、2 層打兩下就自己掉了，而這支是一次性的
        const flier = enemies.find((e) => getStatus(e, '飛行') >= 3);
        if (flier) return drink(id, flier.uid);
      } else if (names.includes('反彈')) {
        // 剪刺鉗：反彈 2 層以上才值得（1 層扎一下還能忍）
        const thorny = enemies.find((e) => getStatus(e, '反彈') >= 2);
        if (thorny) return drink(id, thorny.uid);
      } else {
        /*
         * **兜底**（稽核 2026-09-11 中-3）：以後加一支只拔鱗甲的忍具，
         * 上面三條都接不到，它就會變成「機器人抽到就佔格子到戰鬥結束」——
         * 這個區塊的註解裡親口記過的「洞②」原封不動再來一次。
         * 退路很笨但不會是零：名單裡隨便一種層數夠多就用。
         */
        const any = enemies.find((e) => names.some((nm) => getStatus(e, nm) >= 3));
        if (any) return drink(id, any.uid);
      }
    }
    /*
     * 破甲錐：對手防禦厚到「一般攻擊打不穿」才划算，而且要真的打得死。
     * **估傷用同檔的 `damageTo`**（稽核 2026-09-11 中-4）：自己拿 `pierce.amount` 比血量，
     * 會漏掉飛行的砍半與虛化的「每下最多 1 點」——對一隻飛著、血 10、防禦 12 的魔物
     * 算出「12 打得死」就開了 45 條的忍具，實際只進去 6 點。
     * `hp >= 6` 是跟旁邊那條 `dmg` 同口徑：不要為了補一隻剩一滴血的怪花掉一支忍具。
     */
    const pierce = def.effects.find((f) => f.kind === 'damage' && f.ignoreBlock);
    if (pierce?.kind === 'damage') {
      const turtle = enemies.find((e) => e.block >= 12 && e.hp >= 6 && damageTo(cs, def.effects, e, 0, false, 0, true, p) >= e.hp);
      if (turtle) return drink(id, turtle.uid);
    }
    // 攻擊型狀態忍具：關主戰開頭就用
    if (boss && cs.turn <= 2 && def.effects.some((f) => f.kind === 'status' && f.target === 'self' && (f.name === '爪力' || f.name === '貓步'))) return drink(id);
    if (boss && def.effects.some((f) => f.kind === 'status' && f.target !== 'self' && (f.name === '翻肚' || f.name === '中毒'))) {
      const t = enemies[0];
      if (t && def.target === 'enemy') return drink(id, t.uid);
      if (def.target === 'all') return drink(id);
    }
  }
  return false;
}

/**
 * 有牌等著選就替他選掉，回 true。`smartCombat` 裡那一行的對外版本（2026-09-16）：
 * 雙人時兩個人都舉手了才收回合，而 `beginEnemyTurn` 遇到還沒選完的牌會拒收——
 * 沒有這支的話，選牌的那位剛好先舉手就會卡死。
 */
export function smartPending(cs: CombatState, rng: Rng): boolean {
  if (!cs.pending) return false;
  pickPending(cs, rng);
  return true;
}

/**
 * **一位玩家的下一個動作**（2026-09-16 為了量雙人平衡加的；`tests/coop.report.test.ts` 用）。
 *
 * 判斷邏輯跟 `smartCombat` 裡那一段**一模一樣**——選牌、喝忍具、挑目標全走同一批函式，
 * 只是多帶一個「現在是誰在動」。單機那條路（`smartCombat`）一個字都沒動，錨值不會跑掉。
 *
 * 回 `true`＝剛做了一件事，呼叫端再叫一次；回 `false`＝這位這回合沒別的好打了，
 * 該由呼叫端替他舉手（`setReady`）。**這支自己不收回合**：兩個人要等雙方都舉手才收。
 */
export function smartSeatAct(cs: CombatState, rng: Rng, seat: number): boolean {
  const p = cs.players[seat];
  if (!p || p.down || p.ready || cs.phase !== 'player') return false;
  if (cs.pending) { pickPending(cs, rng); return true; }   // 在等選牌的是誰，`pending` 自己記得
  const incoming = expectedIncoming(cs, p);
  if (maybePotion(cs, incoming, seat)) return true;
  const hits = incomingHitCount(cs);
  const plans = p.hand.map((c) => evaluate(cs, c, incoming, hits, seat)).filter((x): x is Plan => x !== null);
  if (plans.length === 0) return false;
  // 結束回合的牌（撒手鐧、先睡了）只在沒有別的值得打的時候才打——跟 `smartCombat` 同一條
  const others = plans.filter((x) => !x.endsTurn && x.value > 0.5);
  const pick = others.length ? others.sort((a, b) => b.value - a.value)[0]! : plans.filter((x) => x.value > 0.5).sort((a, b) => b.value - a.value)[0];
  if (!pick) return false;
  if (!playCard(cs, pick.uid, pick.target, seat)) throw new Error(`第 ${seat} 位在第 ${cs.turn} 回合打不出 ${pick.uid}（${cs.encounterId}）`);
  return true;
}

export function smartCombat(cs: CombatState, rng: Rng, maxTurns = 200, seed = '?'): void {
  while (cs.phase === 'player') {
    // 僵局（打不死也死不了）當作輸：一場的判斷失誤不該把整份報告炸掉；報告會列出是哪一場
    if (cs.turn > maxTurns) { cs.phase = 'lost'; cs.player.hp = 0; cs.log.push(`僵局：${seed} ${cs.encounterId}`); return; }
    if (cs.pending) { pickPending(cs, rng); continue; }
    const incoming = expectedIncoming(cs);
    if (maybePotion(cs, incoming)) continue;
    const hits = incomingHitCount(cs);
    const plans = cs.player.hand.map((c) => evaluate(cs, c, incoming, hits)).filter((x): x is Plan => x !== null);
    if (plans.length === 0) { endTurn(cs); continue; }
    // 結束回合的牌（撒手鐧、先睡了）只在沒有別的值得打的時候才打
    const others = plans.filter((x) => !x.endsTurn && x.value > 0.5);
    const pick = others.length ? others.sort((a, b) => b.value - a.value)[0]! : plans.filter((x) => x.value > 0.5).sort((a, b) => b.value - a.value)[0];
    if (!pick) { endTurn(cs); continue; }
    if (!playCard(cs, pick.uid, pick.target)) throw new Error(`種子 ${seed}：第 ${cs.turn} 回合打不出 ${pick.uid}（${cs.encounterId}）`);
    if (allReady(cs)) endTurn(cs);
  }
  // 調平衡用：`SMART_TRACE=<encounterId>` 會把那場的完整戰鬥紀錄印出來（例：SMART_TRACE=tanuki_lord SMART_N=600 …）
  if (TRACE && cs.encounterId === TRACE) console.log(['[trace]', seed, cs.encounterId, cs.phase, `剩 ${cs.player.hp}`, ...cs.log].join('\n'));
}
const TRACE = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['SMART_TRACE'];

// ===== 整局 =====

/** `seat` 不填就是自己（2026-09-16 加的參數，量雙人時第二位要挑自己的牌組） */
export function deckJunk(run: RunState, seat = 0): CardInstance[] {
  return me(run, seat).deck.filter((c) => rating(c.cardId) <= 2).sort((a, b) => rating(a.cardId) - rating(b.cardId));
}

export function pickCard(run: RunState, choices: { id: string }[], seat = 0): string | null {
  let best: { id: string; v: number } | null = null;
  const attacks = me(run, seat).deck.filter((c) => cardById[c.cardId]?.type === '攻擊').length;
  const skills = me(run, seat).deck.length - attacks;
  for (const ch of choices) {
    const def = cardById[ch.id];
    if (!def) continue;
    let v = rating(ch.id);
    if (def.type === '攻擊' && attacks < skills) v += 1;
    if (def.type !== '攻擊' && skills < attacks - 2) v += 1;
    if (me(run, seat).deck.filter((c) => c.cardId === ch.id).length >= 2) v -= 2;
    if (!best || v > best.v) best = { id: ch.id, v };
  }
  if (!best) return null;
  const threshold = me(run, seat).deck.length >= 22 ? 6 : me(run, seat).deck.length >= 16 ? 5 : 4;
  return best.v >= threshold ? best.id : null;
}

export function bestUpgrade(run: RunState, seat = 0): CardInstance | undefined {
  return me(run, seat).deck.filter((c) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病')
    .sort((a, b) => rating(b.cardId) - rating(a.cardId))[0];
}

function handleOutcome(run: RunState, rng: Rng, outcome: RunEffectOutcome, seed: string, stats: SmartStats): void {
  if (!outcome) return;
  if ('needs' in outcome) {
    for (let i = 0; i < outcome.n; i++) {
      if (outcome.needs === 'removeCard') { const j = deckJunk(run)[0]; if (j) removeCard(run, j.uid); }
      else { const u = bestUpgrade(run); if (u) upgradeCard(run, u.uid); }
    }
  } else if ('chooseCard' in outcome) {
    const id = pickCard(run, outcome.chooseCard) ?? outcome.chooseCard[0]?.id;   // 開出升級版的那張學到就是升級牌（下面 addCard 帶旗標）
    if (id) addCard(run, id, outcome.upgradedCard === id);
  } else if ('fight' in outcome) {
    run.pendingAfterFight = outcome.fight.afterWin;   // 事件附帶的獎勵：打贏才發（稽核 2026-09-04 中 2）
    fight(run, rng, outcome.fight.encounterId, outcome.fight.bonusFish, seed, stats);
    resolvePendingAfterFight(run, run.status === 'playing');
    if (run.status === 'playing') for (let i = 0; i < (outcome.fight.bonusUpgrades ?? 0); i++) { const u = bestUpgrade(run); if (u) upgradeCard(run, u.uid); }
  }
}

function fight(run: RunState, rng: Rng, encounterId: string | undefined, bonusFish: number, seed: string, stats: SmartStats): void {
  const cs = beginCombat(run, encounterId);
  const hpIn = me(run).hp;
  smartCombat(cs, rng, 200, seed);
  const isBoss = encounterById[cs.encounterId]?.pool === '塔主';
  const r = finishCombat(run, cs, bonusFish);
  stats.fights.push({ id: cs.encounterId, floor: run.floor, act: run.act, hpLost: hpIn - (r ? me(run).hp : 0), turns: cs.turn, won: !!r, str: cs.player.statuses['爪力'] ?? 0 });
  if (isBoss) stats.bosses.push({ id: cs.encounterId, act: run.act, hpIn, maxHp: me(run).maxHp, won: !!r, turns: cs.turn });
  if (!r) { stats.diedTo = (cs.turn > 200 ? '僵局:' : '') + cs.encounterId; return; }
  if (r.cards.length) { takeCardReward(run, r, pickCard(run, r.cards)); closeCardReward(r); }
}

/** 事件選項值多少：血少時看重回血、避開掉血；壞毛病是大扣分 */
export function eventValue(run: RunState, effects: RunEffect[], costFish: number, seat = 0): number {
  const hpPct = me(run, seat).hp / me(run, seat).maxHp;
  let v = -costFish * 0.35;
  if (costFish > me(run, seat).fish) return -999;
  /*
   * **同一個選項裡連著砍好幾張、升好幾張的，第二張起要縮水**（稽核 2026-09-11 低-4）。
   *
   * 「磨到只剩一把刀」是三個 `removeCard` 連寫，原本每一個都給滿分 18（只要牌組裡「有」廢牌就給），
   * 三張共 54、扣掉最大生命 −8 的 17.6 之後穩賺，所以機器人一定會磨；
   * 可是牌組只剩一張廢牌時，第二、三張砍的是好牌。「速成的卷軸」的兩個 `upgradeCard` 同理。
   * 這裡照「這個選項裡已經用掉幾張」往下算：砍到沒廢牌就掉到 2 分（等於在砍好牌），
   * 升級也一樣——沒得升就是 0。
   */
  let removed = 0, upgraded = 0;
  const junk = deckJunk(run, seat).length;
  const upgradable = me(run, seat).deck.filter((c) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病').length;
  for (const fx of effects) {
    switch (fx.kind) {
      case 'heal': v += Math.min(fx.n, me(run, seat).maxHp - me(run, seat).hp) * (hpPct < 0.5 ? 1.4 : 0.6); break;
      // 交出一件秘寶：本身是純損失，但它一定跟「換兩件」綁在一起，淨值由那兩件的 relic 估值補回來
      case 'loseRelic': v -= 14; break;
      case 'healPercent': v += Math.min(me(run, seat).maxHp * fx.p, me(run, seat).maxHp - me(run, seat).hp) * (hpPct < 0.5 ? 1.4 : 0.6); break;
      case 'damage': v -= fx.n * (hpPct < 0.4 ? 4 : hpPct < 0.6 ? 1.8 : 0.9); break;
      case 'fish': v += fx.n * 0.35; break;
      case 'fishHalve': v -= me(run, seat).fish * 0.5 * 0.35; break;
      case 'maxHp': v += fx.n * 2.2; break;
      case 'addCard': v += cardById[fx.cardId]?.pool === '壞毛病' ? -28 : 6; break;
      case 'addRandomCard': v += fx.rarity === '罕見' ? 8 : fx.rarity === '稀有' ? 14 : 4; break;
      case 'removeCard': v += removed++ < junk ? 18 : 2; break;
      case 'upgradeCard': v += upgraded++ < upgradable ? 16 : 0; break;
      case 'relic': v += fx.pool === '大魔物' ? 34 : 24; break;
      case 'potions': v += Math.min(fx.n, 3 - me(run, seat).potions.length) * 7; break;
      case 'fight': v += hpPct < 0.5 ? -30 : fx.bonusFish * 0.35 + 6 + (fx.bonusUpgrades ?? 0) * 5; break;
      case 'chooseCard': v += fx.pool === '絕學' ? 14 : 9; break;
      case 'gamble': v += fx.p * eventValue(run, fx.win, 0, seat) + (1 - fx.p) * eventValue(run, fx.lose, 0, seat); break;
      case 'flag': break;   // 旗標只影響後集事件會不會出現，對機器人的當下估值沒有意義
      default: { const _never: never = fx; void _never; }   // 每加一種效果都得來這裡寫一行估值，不能靜默估 0（體檢 2026-09-05）
    }
  }
  return v;
}

function nodeScore(run: RunState, n: MapNode): number {
  const hpPct = me(run).hp / me(run).maxHp;
  switch (n.type) {
    case '貓窩': return hpPct < 0.55 ? 100 : bestUpgrade(run) ? 55 : 20;
    case '罐頭鋪': return me(run).fish >= 120 ? 75 : me(run).fish >= 75 ? 45 : 15;
    case '事件': return 50;
    case '紙箱': return 90;
    case '大魔物': return hpPct >= 0.7 && me(run).deck.some((c) => c.upgraded) ? 62 : 8;
    case '戰鬥': return 42;
    case '塔主': return 1;
  }
}

export function smartRun(seed: string, difficulty = 1, hero: Hero = 'ninja'): SmartStats {
  const run = newRun(seed, difficulty, hero);   // `hero`＝拿聰明機器人量另一個角色的平衡（2026-09-12 加的）
  const rng = new Rng(seedFromString('smart:' + seed));
  const stats: SmartStats = { seed, won: false, floor: 0, act: 1, deckSize: 0, deckIds: [], relicIds: [], upgraded: 0, relics: 0, diedTo: null, bosses: [], fights: [] };
  let guard = 0;
  while (run.status === 'playing') {
    if (++guard > 140) throw new Error('節點推進超過 140 次');
    const options = nextChoices(run.map, run.currentNode);
    const scored = options.map((n) => ({ n, s: nodeScore(run, n) + rng.next() * 6 }));
    const node = chooseNode(run, scored.sort((a, b) => b.s - a.s)[0]!.n.id);
    switch (node.type) {
      case '戰鬥': case '大魔物': case '塔主': {
        fight(run, rng, undefined, 0, seed, stats);
        if (node.type === '塔主' && run.status === 'playing' && run.act < ACTS) {
          const picks = rollActRelics(run);
          const best = picks.slice().sort((a, b) => relicRating(b) - relicRating(a))[0];
          if (best) takeRelic(run, best);
          const cardPicks = rollActCards(run);
          const id = pickCard(run, cardPicks) ?? cardPicks.slice().sort((a, b) => rating(b.id) - rating(a.id))[0]?.id;
          if (id) addCard(run, id);
          advanceAct(run);
        }
        break;
      }
      case '事件': {
        const ev = eventById[node.eventId!]!;
        const choice = ev.choices.map((c) => ({ c, v: eventValue(run, c.outcome, c.costFish ?? 0) })).sort((a, b) => b.v - a.v)[0]!.c;
        me(run).fish = Math.max(0, me(run).fish - (choice.costFish ?? 0));
        handleOutcome(run, rng, applyRunEffects(run, choice.outcome), seed, stats);
        break;
      }
      case '罐頭鋪': {
        const shop = makeShop(run);
        // 先放生爛牌（留 60 條買東西），再看秘寶，再看牌
        const junk = deckJunk(run);
        if (junk.length >= 3 && me(run).fish >= me(run).removeCost + 60) buyRemove(run, junk[0]!.uid);
        const relicIdx = shop.relics.map((r, i) => ({ i, v: relicRating(r.id), p: r.price })).sort((a, b) => b.v - a.v)[0];
        if (relicIdx && relicIdx.v >= 6 && me(run).fish >= relicIdx.p) buyRelic(run, shop, relicIdx.i);
        const cardIdx = shop.cards.map((c, i) => ({ i, v: rating(c.def.id), p: c.price })).sort((a, b) => b.v - a.v)[0];
        if (cardIdx && cardIdx.v >= 7 && me(run).fish >= cardIdx.p && me(run).deck.length < 24) buyCard(run, shop, cardIdx.i);
        for (let i = 0; i < shop.potions.length; i++) {
          const it = shop.potions[i]!;
          if (me(run).potions.length < 2 && me(run).fish >= it.price + 40) buyPotion(run, shop, i);
        }
        break;
      }
      case '貓窩': {
        const u = bestUpgrade(run);
        // 44F 打盹回滿：真人只要沒滿血都會睡，機器人比照（不然 60% 以上的血會去磨爪、量不到補給的效果）
        if (me(run).hp < me(run).maxHp * (run.floor === 44 ? 0.98 : 0.6) || !u) rest(run, '打盹'); else rest(run, '磨爪', u.uid);
        break;
      }
      case '紙箱': openChest(run); break;
    }
  }
  stats.won = run.status === 'won';
  stats.floor = run.floor;
  stats.act = run.act;
  stats.deckSize = me(run).deck.length;
  stats.upgraded = me(run).deck.filter((c) => c.upgraded).length;
  stats.relics = me(run).relics.length;
  stats.deckIds = me(run).deck.map((c) => c.cardId + (c.upgraded ? '+' : ''));
  stats.relicIds = [...me(run).relics];
  return stats;
}
