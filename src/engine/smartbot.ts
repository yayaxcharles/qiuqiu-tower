import { cardById } from '../content/cards';
import { encounterById, enemyById } from '../content/enemies';
import { eventById } from '../content/events';
import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import { aliveEnemies } from './actions';
import { canPlay, endTurn, playCard, resolveChoice, usePotion } from './combat';
import { cardStats } from './deck';
import { nextChoices } from './map';
import { Rng, seedFromString } from './rng';
import { computeAttack, computeBlock, getStatus } from './statuses';
import {
  ACTS, addCard, advanceAct, applyRunEffects, beginCombat, buyCard, buyPotion, buyRelic, buyRemove, chooseNode,
  finishCombat, makeShop, newRun, openChest, removeCard, rest, rollActCards, rollActRelics, takeCardReward, takeRelic,
  upgradeCard, type RunEffectOutcome,
} from './run';
import type { CardInstance, CombatState, Effect, EnemyCombat, MapNode, RunEffect, RunState } from './types';

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
  // 起手
  sanjo: 2, tanding: 2, kawarimi: 3,
  // 忍術 常見
  shunkan: 7, shengdong: 6, shunshou: 5, wozaizhe: 4, jiaochulai: 4, susu: 5, zhangyan: 5, yinshen: 4,
  bianshen: 7, zhuangsi: 4, duxin: 3, qianliyan: 5, shunfenger: 4, dingshang: 6, chudashi: 4, youcike: 5,
  zhanshu: 4, tuozi: 3, roubao: 5, liangzhua: 6, suoyituan: 5, weihe: 5, paozhao: 3, tianmao: 4,
  // 忍術 罕見
  bunshin: 7, ruying: 7, shuaiguo: 3, dingshen: 6, cuimian: 5, fengkou: 4, qianshui: 5, touchi: 5, xianshuile: 2,
  gaotui: 4, jiejie: 7, fantan: 5, luoye: 5, canying: 4, caiweiba: 6, diaohu: 5, sashoujian: 5, jiuming: 5, fanzhua: 4,
  // 忍術 稀有
  meikandao: 6, renwuwancheng: 4, fengyin: 8, wanhua: 8, yingzi: 6, huanying: 8, wufeng: 4, sanhua: 8, jingzhi: 6,
  // 絕學
  tieshazhang: 7, qinna: 6, juye: 5, jinzhong: 8, qinggong: 4, taxue: 5, xuli: 5, tietou: 7, shihou: 7, dianxue: 7,
  zuiquan: 5, yixing: 5, gekong: 4, guixi: 5, taiji: 4, mabu: 7, yungong: 8, yide: 6, tuishou: 5, dieda: 5, shibadie: 6,
  hujin: 6, boming: 6, liandao: 8, jiedao: 6, wangming: 7, tiexin: 9, fanpu: 5, shierlian: 7, huxin: 8, jiuweiquan: 8,
};
function rating(cardId: string): number {
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
const relicRating = (id: string): number => RELIC_RATING[id] ?? 5;

// ===== 戰鬥 =====

/** 這隻魔物這一拍會打出來的每一下（已算爪力、蓄力、你的翻肚），沒攻擊就是空陣列 */
function incomingHits(cs: CombatState, e: EnemyCombat): number[] {
  return incomingHitList(cs, e).map((h) => h.dmg);
}
/** 同上，但帶著「這一下穿不穿蜷縮」 */
function incomingHitList(cs: CombatState, e: EnemyCombat): { dmg: number; pierce: boolean }[] {
  if (e.dead) return [];
  const m = e.move;
  if (m.intent === 'attack' && getStatus(e, '定身') > 0) return [];
  const x = e.charged ? 2 : 1;
  const hits: { dmg: number; pierce: boolean }[] = [];
  // 睡著的什麼都不做（第二波魔物的沉睡）：這一拍不會有任何一下
  if (getStatus(e, '沉睡') > 0) return [];
  for (const fx of m.effects) {
    if (fx.kind === 'damage') for (let i = 0; i < (fx.times ?? 1); i++) hits.push({ dmg: computeAttack(fx.amount * x, e, cs.player), pierce: !!fx.pierce });
    else if (fx.kind === 'damageRandom') hits.push({ dmg: computeAttack(Math.round((fx.min + fx.max) / 2) * x, e, cs.player), pierce: false });
    // 自爆那一下照樣要擋（河豚精的 28 點是整場最痛的單發之一）
    else if (fx.kind === 'selfDestruct') hits.push({ dmg: computeAttack(fx.amount * x, e, cs.player), pierce: false });
  }
  return hits;
}

/** 這回合還會吃到多少：照引擎的順序模擬——每一下先由蜷縮擋，擋不完的那一下才耗一層隱身閃掉；穿透不看蜷縮（2026-09-04 判定順序改了） */
function expectedIncoming(cs: CombatState): number {
  const p = cs.player;
  if (p.immune) return 0;
  const all = aliveEnemies(cs).flatMap((e) => incomingHitList(cs, e));
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

function attackable(cs: CombatState, e: EnemyCombat): boolean {
  if (e.dead || e.invulnIn > 0) return false;
  if (enemyById[e.enemyId]?.guardedByAllies && cs.enemies.some((o) => o !== e && !o.dead)) return false;
  return true;
}

/** 這張牌打在這隻魔物身上大概能扣多少血（吃過爪力、翻肚、防禦、隱身） */
function damageTo(cs: CombatState, effects: Effect[], e: EnemyCombat, combo: number, doubled: boolean, plays = 0): number {
  if (!attackable(cs, e)) return 0;
  if (getStatus(e, '隱身') > 0) return 0;
  let block = e.block;
  let total = 0;
  const p = cs.player;
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
      for (let i = 0; i < times; i++) swing(computeAttack(fx.amount * (doubled ? 2 : 1), p, e), fx.ignoreBlock);
    } else if (fx.kind === 'damageRamp') {
      // 分身術：這場這張已打過幾次就加幾段（plays 由呼叫端查 cs.cardPlays）
      swing(computeAttack((fx.amount + fx.step * plays) * (doubled ? 2 : 1), p, e));
    } else if (fx.kind === 'damageRandom') {
      swing(computeAttack(Math.round((fx.min + fx.max) / 2) * (doubled ? 2 : 1), p, e));
    } else if (fx.kind === 'damageEqualBlock') {
      swing(computeAttack(p.block, p, e, { noStrength: true }));
    }
  }
  return total;
}

interface Plan { uid: number; target?: number; value: number; cost: number; endsTurn: boolean }

/** 幫每一張打得出的牌估一個「現在打出去值多少」 */
function evaluate(cs: CombatState, c: CardInstance, incoming: number, hits: number): Plan | null {
  const p = cs.player;
  const st = cardStats(c);
  const def = st.def;
  const enemies = aliveEnemies(cs);
  const target0 = def.target === 'enemy' ? enemies.find((e) => attackable(cs, e)) ?? enemies[0] : undefined;
  const chk = canPlay(cs, c.uid, target0?.uid);
  if (!chk.ok) return null;
  const lowHp = p.hp - incoming <= 0;          // 不擋就死
  const danger = p.hp - incoming < p.maxHp * 0.35;
  const totalEnemyHp = enemies.reduce((s, e) => s + (attackable(cs, e) ? e.hp + e.block : 0), 0);
  let value = 0;
  let endsTurn = false;
  let target: number | undefined;
  const combo = p.cardsPlayedThisTurn;
  const plays = cs.cardPlays?.[c.uid] ?? 0;   // 分身術這場已打過幾次
  const hasDamage = st.effects.some((fx) => fx.kind === 'damage' || fx.kind === 'damageRamp' || fx.kind === 'damageRandom' || fx.kind === 'damageEqualBlock');

  if (hasDamage) {
    // 挑目標：能打死的優先（少一隻就少挨一份），否則打最矮的能打的那隻
    let best: { e: EnemyCombat; v: number } | null = null;
    for (const e of enemies) {
      if (!attackable(cs, e)) continue;
      const dmg = damageTo(cs, st.effects, e, combo, p.doubleNext > 0, plays);
      // 牠有隱身：這一下會落空，但不打掉那層永遠打不到牠——便宜的攻擊牌照樣值得丟
      let v = dmg > 0 ? dmg : getStatus(e, '隱身') > 0 ? 3 / Math.max(1, st.cost) : 0;
      if (dmg >= e.hp) v += 8 + incomingHits(cs, e).reduce((s, h) => s + h, 0);   // 收頭：牠這回合的傷害也一起省掉
      else v += e.hp < 20 ? 2 : 0;
      // 牠身上有反彈：每打一下就被刺一下（2026-09-02 反彈才真的生效），多段牌撞上去很痛
      const hits = st.effects.reduce((n, fx) => n + (fx.kind === 'damage' ? (fx.times ?? 1) : fx.kind === 'damageRandom' || fx.kind === 'damageEqualBlock' || fx.kind === 'damageRamp' ? 1 : 0), 0);
      if (getStatus(e, '反彈') > 0 && dmg < e.hp) v -= getStatus(e, '反彈') * hits * (lowHp ? 4 : 1.5);
      if (!best || v > best.v) best = { e, v };
    }
    if (def.target === 'all') {
      value += enemies.reduce((s, e) => s + damageTo(cs, st.effects, e, combo, p.doubleNext > 0, plays), 0);
      if (best) value += best.v - damageTo(cs, st.effects, best.e, combo, p.doubleNext > 0, plays);
    } else if (best) { value += best.v; target = best.e.uid; }
    if (def.target === 'enemy' && !target) return null;
    // 全場快清光了就別留手
    if (totalEnemyHp <= 12) value += 3;
  }
  for (const fx of st.effects) {
    switch (fx.kind) {
      case 'block': {
        const b = computeBlock(fx.amount, p);
        const useful = Math.min(b, incoming);
        value += useful * (lowHp ? 3 : danger ? 1.6 : 1.1) + (b - useful) * 0.12;
        break;
      }
      case 'status':
        if (fx.target === 'self') {
          if (fx.name === '隱身') {
            // 隱身現在排在蜷縮後面：只有蜷縮擋不完的那幾下才值錢。把「超過現有蜷縮的下」由大到小排，估前幾層閃掉的價值（八成）
            const all = enemies.flatMap((e) => incomingHits(cs, e)).filter((h) => h > p.block).sort((a, b) => b - a);
            const cur = getStatus(p, '隱身');
            const gain = all.slice(cur, cur + fx.amount).reduce((s, h) => s + h, 0) * 0.8;
            value += gain * (lowHp ? 3 : danger ? 1.6 : 1.1) + (fx.amount - Math.min(fx.amount, Math.max(0, all.length - cur))) * 1.5;
          } else if (fx.name === '爪力') value += fx.amount * 4 * Math.min(1, totalEnemyHp / 40);
          else if (fx.name === '貓步') value += fx.amount * 3;
          else if (fx.name === '反彈') value += fx.amount * Math.min(hits, 4) * 0.8;
          else if (fx.name === '潛水') value += fx.amount * 4;
          else if (fx.name === '翻肚') value -= 6;   // 出大事了的代價
        } else {
          const n = fx.target === 'all' ? enemies.length : 1;
          if (fx.name === '翻肚') value += 5 * n;
          else if (fx.name === '噎到') value += fx.amount * (fx.amount + 1) / 2 * 0.9 * n;
          else if (fx.name === '懶洋洋') value += Math.min(incoming, 12) * 0.25 * n + 2;
          else if (fx.name === '炸毛') value += 1.5 * n;
          else if (fx.name === '定身') {
            const stunned = target !== undefined ? enemies.find((e) => e.uid === target) : enemies.slice().sort((a, b) => incomingHits(cs, b).reduce((s, h) => s + h, 0) - incomingHits(cs, a).reduce((s, h) => s + h, 0))[0];
            const saved = stunned ? incomingHits(cs, stunned).reduce((s, h) => s + h, 0) : 0;
            value += saved * (lowHp ? 3 : 1.2) + 3;
            if (stunned && def.target === 'enemy' && !hasDamage) target = stunned.uid;
          }
        }
        break;
      case 'draw': value += fx.n * (p.energy - st.cost > 0 ? 3 : 1.2); break;
      case 'drawNextTurn': value += fx.n * 2; break;
      case 'drawIfTargetStatus': value += 1; break;
      case 'energy': value += fx.n * 3.5; break;
      case 'heal': value += Math.min(fx.n, p.maxHp - p.hp) * (danger ? 1.5 : 0.9); break;
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
      case 'cleanse': value += Object.entries(p.statuses).filter(([k, v]) => ['翻肚', '懶洋洋', '炸毛', '噎到'].includes(k) && (v ?? 0) > 0).length * 4; break;
      case 'transferDebuffs': value += (getStatus(p, '噎到') + getStatus(p, '翻肚') * 2 + getStatus(p, '懶洋洋')) * 1.5; break;
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
      default: break;
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

function maybePotion(cs: CombatState, incoming: number): boolean {
  const p = cs.player;
  const enemies = aliveEnemies(cs).filter((e) => attackable(cs, e));
  for (const id of [...cs.potions]) {
    const def = potionById[id];
    if (!def) continue;
    const kinds = def.effects.map((f) => f.kind);
    const heal = def.effects.find((f) => f.kind === 'heal');
    if (heal && heal.kind === 'heal' && p.hp <= p.maxHp * 0.4 && p.maxHp - p.hp >= heal.n) return usePotion(cs, id);
    if ((kinds.includes('block') || (kinds.includes('status') && def.effects.some((f) => f.kind === 'status' && f.name === '隱身')))
      && incoming >= 10 && p.hp - incoming <= p.maxHp * 0.35) return usePotion(cs, id);
    const dmg = def.effects.find((f) => f.kind === 'damage');
    if (dmg && dmg.kind === 'damage') {
      const total = dmg.amount * (dmg.times ?? 1);
      const victim = enemies.find((e) => e.hp + e.block <= total && e.hp >= 6);
      if (victim && dmg.target !== 'all') return usePotion(cs, id, victim.uid);
      if (dmg.target === 'all' && enemies.length >= 2 && enemies.some((e) => e.hp <= total)) return usePotion(cs, id);
    }
    if (kinds.includes('energy') && p.energy === 0 && p.hand.filter((c) => canPlay(cs, c.uid, enemies[0]?.uid).ok || cardStats(c).cost > 0).length >= 2
      && (incoming > p.block || enemies.some((e) => e.hp <= 15))) return usePotion(cs, id);
    if (kinds.includes('cleanse') && getStatus(p, '噎到') >= 4) return usePotion(cs, id);
    // 攻擊型狀態忍具：關主戰開頭就用
    const boss = cs.enemies.some((e) => enemyById[e.enemyId]?.pool === '塔主');
    if (boss && cs.turn <= 2 && def.effects.some((f) => f.kind === 'status' && f.target === 'self' && (f.name === '爪力' || f.name === '貓步'))) return usePotion(cs, id);
    if (boss && def.effects.some((f) => f.kind === 'status' && f.target !== 'self' && (f.name === '翻肚' || f.name === '噎到'))) {
      const t = enemies[0];
      if (t && def.target === 'enemy') return usePotion(cs, id, t.uid);
      if (def.target === 'all') return usePotion(cs, id);
    }
  }
  return false;
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
    if (cs.endTurnRequested) endTurn(cs);
  }
  // 調平衡用：`SMART_TRACE=<encounterId>` 會把那場的完整戰鬥紀錄印出來（例：SMART_TRACE=tanuki_lord SMART_N=600 …）
  if (TRACE && cs.encounterId === TRACE) console.log(['[trace]', seed, cs.encounterId, cs.phase, `剩 ${cs.player.hp}`, ...cs.log].join('\n'));
}
const TRACE = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['SMART_TRACE'];

// ===== 整局 =====

function deckJunk(run: RunState): CardInstance[] {
  return run.deck.filter((c) => rating(c.cardId) <= 2).sort((a, b) => rating(a.cardId) - rating(b.cardId));
}

function pickCard(run: RunState, choices: { id: string }[]): string | null {
  let best: { id: string; v: number } | null = null;
  const attacks = run.deck.filter((c) => cardById[c.cardId]?.type === '攻擊').length;
  const skills = run.deck.length - attacks;
  for (const ch of choices) {
    const def = cardById[ch.id];
    if (!def) continue;
    let v = rating(ch.id);
    if (def.type === '攻擊' && attacks < skills) v += 1;
    if (def.type !== '攻擊' && skills < attacks - 2) v += 1;
    if (run.deck.filter((c) => c.cardId === ch.id).length >= 2) v -= 2;
    if (!best || v > best.v) best = { id: ch.id, v };
  }
  if (!best) return null;
  const threshold = run.deck.length >= 22 ? 6 : run.deck.length >= 16 ? 5 : 4;
  return best.v >= threshold ? best.id : null;
}

function bestUpgrade(run: RunState): CardInstance | undefined {
  return run.deck.filter((c) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病')
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
    fight(run, rng, outcome.fight.encounterId, outcome.fight.bonusFish, seed, stats);
    if (run.status === 'playing') for (let i = 0; i < (outcome.fight.bonusUpgrades ?? 0); i++) { const u = bestUpgrade(run); if (u) upgradeCard(run, u.uid); }
  }
}

function fight(run: RunState, rng: Rng, encounterId: string | undefined, bonusFish: number, seed: string, stats: SmartStats): void {
  const cs = beginCombat(run, encounterId);
  const hpIn = run.hp;
  smartCombat(cs, rng, 200, seed);
  const isBoss = encounterById[cs.encounterId]?.pool === '塔主';
  const r = finishCombat(run, cs, bonusFish);
  stats.fights.push({ id: cs.encounterId, floor: run.floor, act: run.act, hpLost: hpIn - (r ? run.hp : 0), turns: cs.turn, won: !!r, str: cs.player.statuses['爪力'] ?? 0 });
  if (isBoss) stats.bosses.push({ id: cs.encounterId, act: run.act, hpIn, maxHp: run.maxHp, won: !!r, turns: cs.turn });
  if (!r) { stats.diedTo = (cs.turn > 200 ? '僵局:' : '') + cs.encounterId; return; }
  if (r.cards.length) takeCardReward(run, r, pickCard(run, r.cards));
}

/** 事件選項值多少：血少時看重回血、避開掉血；壞毛病是大扣分 */
function eventValue(run: RunState, effects: RunEffect[], costFish: number): number {
  const hpPct = run.hp / run.maxHp;
  let v = -costFish * 0.35;
  if (costFish > run.fish) return -999;
  for (const fx of effects) {
    switch (fx.kind) {
      case 'heal': v += Math.min(fx.n, run.maxHp - run.hp) * (hpPct < 0.5 ? 1.4 : 0.6); break;
      case 'healPercent': v += Math.min(run.maxHp * fx.p, run.maxHp - run.hp) * (hpPct < 0.5 ? 1.4 : 0.6); break;
      case 'damage': v -= fx.n * (hpPct < 0.4 ? 4 : hpPct < 0.6 ? 1.8 : 0.9); break;
      case 'fish': v += fx.n * 0.35; break;
      case 'fishHalve': v -= run.fish * 0.5 * 0.35; break;
      case 'maxHp': v += fx.n * 2.2; break;
      case 'addCard': v += cardById[fx.cardId]?.pool === '壞毛病' ? -28 : 6; break;
      case 'addRandomCard': v += fx.rarity === '罕見' ? 8 : fx.rarity === '稀有' ? 14 : 4; break;
      case 'removeCard': v += deckJunk(run).length ? 18 : 2; break;
      case 'upgradeCard': v += bestUpgrade(run) ? 16 : 0; break;
      case 'relic': v += fx.pool === '大魔物' ? 34 : 24; break;
      case 'potions': v += Math.min(fx.n, 3 - run.potions.length) * 7; break;
      case 'fight': v += hpPct < 0.5 ? -30 : fx.bonusFish * 0.35 + 6 + (fx.bonusUpgrades ?? 0) * 5; break;
      case 'chooseCard': v += fx.pool === '絕學' ? 14 : 9; break;
      case 'gamble': v += fx.p * eventValue(run, fx.win, 0) + (1 - fx.p) * eventValue(run, fx.lose, 0); break;
      default: break;
    }
  }
  return v;
}

function nodeScore(run: RunState, n: MapNode): number {
  const hpPct = run.hp / run.maxHp;
  switch (n.type) {
    case '貓窩': return hpPct < 0.55 ? 100 : bestUpgrade(run) ? 55 : 20;
    case '罐頭鋪': return run.fish >= 120 ? 75 : run.fish >= 75 ? 45 : 15;
    case '事件': return 50;
    case '紙箱': return 90;
    case '大魔物': return hpPct >= 0.7 && run.deck.some((c) => c.upgraded) ? 62 : 8;
    case '戰鬥': return 42;
    case '塔主': return 1;
  }
}

export function smartRun(seed: string, difficulty = 1): SmartStats {
  const run = newRun(seed, difficulty);
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
        run.fish = Math.max(0, run.fish - (choice.costFish ?? 0));
        handleOutcome(run, rng, applyRunEffects(run, choice.outcome), seed, stats);
        break;
      }
      case '罐頭鋪': {
        const shop = makeShop(run);
        // 先放生爛牌（留 60 條買東西），再看秘寶，再看牌
        const junk = deckJunk(run);
        if (junk.length >= 3 && run.fish >= run.removeCost + 60) buyRemove(run, junk[0]!.uid);
        const relicIdx = shop.relics.map((r, i) => ({ i, v: relicRating(r.id), p: r.price })).sort((a, b) => b.v - a.v)[0];
        if (relicIdx && relicIdx.v >= 6 && run.fish >= relicIdx.p) buyRelic(run, shop, relicIdx.i);
        const cardIdx = shop.cards.map((c, i) => ({ i, v: rating(c.def.id), p: c.price })).sort((a, b) => b.v - a.v)[0];
        if (cardIdx && cardIdx.v >= 7 && run.fish >= cardIdx.p && run.deck.length < 24) buyCard(run, shop, cardIdx.i);
        for (let i = 0; i < shop.potions.length; i++) {
          const it = shop.potions[i]!;
          if (run.potions.length < 2 && run.fish >= it.price + 40) buyPotion(run, shop, i);
        }
        break;
      }
      case '貓窩': {
        const u = bestUpgrade(run);
        if (run.hp < run.maxHp * 0.6 || !u) rest(run, '打盹'); else rest(run, '磨爪', u.uid);
        break;
      }
      case '紙箱': openChest(run); break;
    }
  }
  stats.won = run.status === 'won';
  stats.floor = run.floor;
  stats.act = run.act;
  stats.deckSize = run.deck.length;
  stats.upgraded = run.deck.filter((c) => c.upgraded).length;
  stats.relics = run.relics.length;
  stats.deckIds = run.deck.map((c) => c.cardId + (c.upgraded ? '+' : ''));
  stats.relicIds = [...run.relics];
  return stats;
}
