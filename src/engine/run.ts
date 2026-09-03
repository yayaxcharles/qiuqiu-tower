import { STARTER_DECK, cardById, cards } from '../content/cards';
import { clampDifficulty, difficultyMods, type DifficultyMods } from '../content/difficulty';
import { encounterById } from '../content/enemies';
import { potionById, potions } from '../content/potions';
import { relicById } from '../content/relics';
import { startCombat } from './combat';
import { FLOORS, generateMap, nextChoices, nodeById } from './map';
import { Rng, seedFromString } from './rng';
import { rollCardChoices, rollPotion, rollRelic, rollRewards, type CombatRewards } from './rewards';
import type { CardDef, CardInstance, CombatState, MapNode, Rarity, RunEffect, RunState } from './types';

export const START_FISH = 50;
export const ACTS = 3;
export const ACT_NAMES = ['塔下', '塔中', '塔頂'] as const;

/**
 * 這一關的關主候選（遭遇 id）。
 * 走火入魔的大俠貓是故事的最終頭目（師父閉關走火入魔、把自己關在塔頂），
 * 固定守在第三關；前兩關從其餘塔主隨機。第二關還沒有專屬關主（立繪要另外生），
 * 骨架先跟第一關共用同一池。
 */
export function bossPoolForAct(act: number): string[] {
  // 塔下五選一（貓又／鐵爪／橘皮大王／蛙大名／犰狳王）、
  // 塔中五選一（奶牛貓／狸大人／波斯大小姐／沉睡的龍貓／詛咒老住持）、塔頂固定師父。
  // 新關主的立繪還在生圖中：資料先接好，圖裝進資產包才會推上線（沒圖就是灰剪影，不會報錯）。
  if (act >= 3) return ['tower_master'];
  if (act === 2) return ['cowcat_boss', 'tanuki_lord', 'persian_lady', 'dragon_cat', 'hex_abbot'];
  return ['nekomata', 'iron_claw', 'orange_king', 'frog_daimyo', 'armadillo_king'];
}
const PRICE: Record<Rarity, number> = { 常見: 50, 罕見: 75, 稀有: 150 };
const RELIC_PRICE = 150, POTION_PRICE = 45;   // 沒標價的保底值；各件的價差標在 relics.ts／potions.ts

export function runRng(run: RunState): Rng {
  const rng = new Rng(run.rng);
  run.rng = rng.state;
  return rng;
}

/** 這一局的難度旋鈕（舊存檔沒有 difficulty 就是 1） */
export function runMods(run: RunState): DifficultyMods { return difficultyMods(run.difficulty ?? 1); }

export function newRun(seed: string, difficulty = 1): RunState {
  const rng = new Rng(seedFromString(seed));
  const level = clampDifficulty(difficulty);
  const mods = difficultyMods(level);
  const run: RunState = {
    version: 1, seed, rng: rng.state, hp: mods.maxHp, maxHp: mods.maxHp, fish: START_FISH, act: 1, difficulty: level,
    deck: [], relics: [], potions: [], floor: 0,
    map: generateMap(rng, { act: 1, bossIds: bossPoolForAct(1), eliteMul: mods.eliteMul }), currentNode: null, trail: [],
    nextUid: 1, stats: { kills: 0, turns: 0, cardsPlayed: 0 }, removeCost: 75, status: 'playing',
    flags: {},
  };
  for (const id of STARTER_DECK) addCard(run, id);
  if (mods.startCurse) addCard(run, mods.startCurse);   // 難度 4 起：開局就背一張壞毛病
  takeRelic(run, 'blue_headband');
  return run;
}

export function currentNode(run: RunState): MapNode | null {
  return run.currentNode ? nodeById(run.map, run.currentNode) : null;
}

export function chooseNode(run: RunState, nodeId: string): MapNode {
  const n = nextChoices(run.map, run.currentNode).find((x) => x.id === nodeId);
  if (!n) throw new Error(`不能走到 ${nodeId}`);
  run.currentNode = n.id;
  run.trail.push(n.id);   // 足跡：地圖上「走過的路亮起來」靠這條
  // 顯示用的樓層是**跨關累計**的（第二關從 16F 起跳），地圖節點自己的 floor 仍是關內 1～15
  run.floor = (run.act - 1) * FLOORS + n.floor;
  return n;
}

export function beginCombat(run: RunState, encounterId?: string): CombatState {
  const enc = encounterId ?? currentNode(run)?.encounterId;
  if (!enc) throw new Error('目前節點沒有遭遇');
  const m = runMods(run);
  // 難度：所有魔物帶爪力、血量倍率；難度 5 的塔頂大魔物再加魔氣
  const strength = m.enemyStrength + (run.act >= ACTS && encounterById[enc]?.pool === '大魔物' ? m.topEliteStrength : 0);
  const startBlock = run.restBlock ?? 0;
  run.restBlock = 0;   // 暖毯的蜷縮只帶一場
  return startCombat({ hp: run.hp, maxHp: run.maxHp, deck: run.deck.map((c) => ({ ...c })), relics: run.relics, potions: run.potions, encounterId: enc, rng: runRng(run),
    mods: { hpMul: m.hpMul, strength, startBlock } });
}

export function finishCombat(run: RunState, cs: CombatState, bonusFish = 0): CombatRewards | null {
  if (cs.phase === 'player') throw new Error('戰鬥尚未結束');
  run.stats.turns += cs.turn;
  run.stats.cardsPlayed += cs.cardsPlayed;
  run.potions = [...cs.potions];
  // 輸掉的那一場也是打倒過魔物的，統計要照收，不然總擊倒數會少算
  run.stats.kills += cs.kills;
  if (cs.phase === 'lost') { run.hp = 0; run.status = 'lost'; return null; }
  run.hp = cs.player.hp;
  // 打贏回血的秘寶（暖爐石、不倒翁）
  const endHeal = run.relics.reduce((s, id) => s + (relicById[id]?.hooks.combatEndHeal ?? 0), 0);
  if (endHeal > 0) run.hp = Math.min(run.maxHp, run.hp + endHeal);
  run.fish = Math.max(0, run.fish + cs.fishDelta);
  const node = currentNode(run);
  // 看遭遇屬於哪個池，不要比對特定 id——塔主現在有三個，寫死 id 會漏掉另外兩個
  const isBoss = encounterById[cs.encounterId ?? '']?.pool === '塔主';
  const kind: CombatRewards['kind'] = isBoss ? '塔主' : node?.type === '大魔物' ? '大魔物' : '戰鬥';
  const winGold = run.relics.reduce((s, id) => s + (relicById[id]?.hooks.winGold ?? 0), 0);
  // 「後期」＝第一關的 8F 起、或第二關以後：獎勵抽好一點的牌
  const late = run.act >= 2 || run.floor >= 8;
  // 牌組裡已經有兩張的不再開（第三張同名牌等於少一個選項）；稀有保底見 RunState.rarePity
  const counts = new Map<string, number>();
  for (const c of run.deck) counts.set(c.cardId, (counts.get(c.cardId) ?? 0) + 1);
  const exclude = [...counts.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
  const extraChoices = run.relics.reduce((s, id) => s + (relicById[id]?.hooks.rewardChoices ?? 0), 0);   // 掌門印：牌多一張可選
  const r = rollRewards(runRng(run), kind, run.relics, winGold, late, { exclude, rareBonus: (run.rarePity ?? 0) * 4, extraChoices });
  if (r.cards.length) run.rarePity = r.cards.some((c) => c.rarity === '稀有') ? 0 : (run.rarePity ?? 0) + 1;
  run.fish += r.fish + bonusFish;   // 獎金另計：r.fish 維持規格 §5.4 的戰利品數字，不把事件獎金摻進去
  if (r.relic) takeRelic(run, r.relic);
  if (r.potion && !addPotion(run, r.potion)) { r.potionMissed = r.potion; r.potion = null; }   // 帶滿：留著讓獎勵畫面問要不要換
  // 只有第三關的關主倒下才算通關；前兩關的關主打完由 advanceAct 接手進下一關
  if (kind === '塔主' && run.act >= ACTS) run.status = 'won';
  return r;
}

/**
 * 進下一關：回滿血、生下一關的地圖、回到「還沒踏上第一個節點」的狀態。
 * 回滿血是跟「殺戮尖塔」一樣的取捨——後面的怪更痛，不回滿活不到第三關。
 * 這裡**不存檔**（規格 §3：節點結算完才存），存檔交給過關畫面收尾的 backToMap()。
 */
export function advanceAct(run: RunState): void {
  if (run.act >= ACTS || run.status !== 'playing') return;
  run.act += 1;
  // 過關回血：難度 3 起只補回缺血的七成五（殺戮尖塔進階 5 的做法）
  const heal = runMods(run).actHeal;
  run.hp = heal >= 1 ? run.maxHp : Math.min(run.maxHp, run.hp + Math.round((run.maxHp - run.hp) * heal));
  run.map = generateMap(runRng(run), { act: run.act, bossIds: bossPoolForAct(run.act), eliteMul: runMods(run).eliteMul });
  run.currentNode = null;
  run.trail = [];
  run.floor = (run.act - 1) * FLOORS;
}

/**
 * 過關獎勵之二：稀有牌三選一（兩張忍術＋一張絕學）。
 * 打倒關主原本一張牌都不給，牌組跨關幾乎只靠一般戰鬥的常見池長大，
 * 中後期永遠差一口氣——這是「牌組養不起來」的另一個病根。
 */
export function rollActCards(run: RunState): CardDef[] {
  const rng = runRng(run);
  const jue = rollCardChoices(rng, '絕學', 1, [], true);
  const ren = rollCardChoices(rng, '忍術', 2, jue.map((c) => c.id), true);
  return rng.shuffle([...jue, ...ren]);
}

/** 過關獎勵：大魔物級秘寶三選一。池子抽乾了就有幾件算幾件（有可能一件都不剩）。 */
export function rollActRelics(run: RunState, n = 3): string[] {
  const rng = runRng(run);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    // 過關三選一抽塔主池（圖鑑也這樣寫）；塔主池抽完了才退回大魔物池——以前一直抽大魔物池，塔主池九件永遠拿不到（審查 #2）
    const id = rollRelic(rng, '塔主', [...run.relics, ...out]) ?? rollRelic(rng, '大魔物', [...run.relics, ...out]);
    if (id) out.push(id);
  }
  return out;
}

export function takeCardReward(run: RunState, rewards: CombatRewards, cardId: string | null): void {
  if (cardId && rewards.cards.some((c) => c.id === cardId)) addCard(run, cardId);
  rewards.cards = [];
}

export function addCard(run: RunState, cardId: string, upgraded = false): CardInstance {
  if (!cardById[cardId]) throw new Error(`未知的牌：${cardId}`);
  const c: CardInstance = { uid: run.nextUid++, cardId, upgraded };
  run.deck.push(c);
  return c;
}
export function removeCard(run: RunState, uid: number): boolean {
  const i = run.deck.findIndex((c) => c.uid === uid);
  if (i < 0) return false;
  run.deck.splice(i, 1);
  return true;
}
export function upgradeCard(run: RunState, uid: number): boolean {
  const c = run.deck.find((x) => x.uid === uid);
  if (!c || c.upgraded || cardById[c.cardId]?.pool === '壞毛病') return false;
  c.upgraded = true;
  return true;
}

export function takeRelic(run: RunState, relicId: string): boolean {
  const def = relicById[relicId];
  if (!def || run.relics.includes(relicId)) return false;
  run.relics.push(relicId);
  const d = def.hooks.maxHp ?? 0;
  if (d) { run.maxHp += d; run.hp = Math.min(run.maxHp, Math.max(1, run.hp + Math.max(0, d))); }
  return true;
}

/** 忍具格數＝難度給的格數＋秘寶加成（忍具袋） */
export function potionCapacity(run: RunState): number {
  return runMods(run).potionSlots + run.relics.reduce((s, id) => s + (relicById[id]?.hooks.potionSlots ?? 0), 0);
}
/** 帶滿時用新的換掉第 index 支（2026-09-02 使用者：「滿的話新拿到的可以把舊的替換掉」） */
export function replacePotion(run: RunState, index: number, potionId: string): boolean {
  if (index < 0 || index >= run.potions.length || !potions.some((p) => p.id === potionId)) return false;
  run.potions[index] = potionId;
  return true;
}
export function addPotion(run: RunState, potionId: string): boolean {
  if (run.potions.length >= potionCapacity(run) || !potions.some((p) => p.id === potionId)) return false;
  run.potions.push(potionId);
  return true;
}

/** 打盹回多少：最大生命三成 × 秘寶倍率（貓草）＋ 固定加成（貓草種子）。畫面顯示與實際結算共用這一條 */
export function napHeal(run: RunState): number {
  const mult = run.relics.reduce((m, id) => m * (relicById[id]?.hooks.restMultiplier ?? 1), 1);
  const flat = run.relics.reduce((s, id) => s + (relicById[id]?.hooks.restFlat ?? 0), 0);
  return Math.floor(run.maxHp * 0.3 * mult) + flat;
}
export function rest(run: RunState, choice: '打盹' | '磨爪', uid?: number): boolean {
  if (choice === '打盹') {
    run.hp = Math.min(run.maxHp, run.hp + napHeal(run));
    // 暖毯：打盹後下一場開戰帶蜷縮
    run.restBlock = run.relics.reduce((s, id) => s + (relicById[id]?.hooks.restNextFightBlock ?? 0), 0);
    return true;
  }
  // 磨爪順便回一成血（打盹的三分之一）：一關只有兩三次貓窩，升級跟回血硬碰硬的話
  // 血一掉就永遠選打盹，四十五層只升得了三四張牌（2026-09-02 機器人實測平均 3.6 張）
  const ok = uid !== undefined && upgradeCard(run, uid);
  if (ok) run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * 0.1));
  return ok;
}

export function openChest(run: RunState): string | null {
  const id = rollRelic(runRng(run), '常見', run.relics);
  if (id) takeRelic(run, id);
  return id;
}

export interface ShopStock {
  cards: { def: CardDef; price: number; sold: boolean }[];
  relics: { id: string; price: number; sold: boolean }[];
  potions: { id: string; price: number; sold: boolean }[];
}

export function makeShop(run: RunState): ShopStock {
  // 難度 4 起貴一成；零錢罐九折（兩者相乘）
  const shopMul = runMods(run).shopMul * run.relics.reduce((m, id) => m * (relicById[id]?.hooks.shopDiscount ?? 1), 1);
  const rng = runRng(run);
  // 罐頭鋪的稀有度隨關數往上（使用者 2026-09-03：第二關要比較常看到稀有牌可以買、第三關更高）：
  // 第一關 常見 60／罕見 30／稀有 10；第二關 35／40／25 且至少一張稀有；第三關 20／40／40 且至少兩張稀有
  const odds: readonly [Rarity, number][] = run.act >= 3 ? [['常見', 20], ['罕見', 40], ['稀有', 40]]
    : run.act === 2 ? [['常見', 35], ['罕見', 40], ['稀有', 25]] : [['常見', 60], ['罕見', 30], ['稀有', 10]];
  // 絕學只低機率出現一張（使用者 2026-09-03）：第一關 20%、第二關 30%、第三關 40%；其餘都是忍術
  const jueN = rng.chance(run.act >= 3 ? 0.4 : run.act === 2 ? 0.3 : 0.2) ? 1 : 0;
  const cardDefs = [...rollCardChoices(rng, '忍術', 5 - jueN, [], false, 0, odds), ...rollCardChoices(rng, '絕學', jueN, [], false, 0, odds)];
  // 稀有保底：不夠就把某一格換成同池的稀有牌。要換的格子隨機挑、忍術格優先——原本固定從最後一格（絕學）往前掃，
  // 二三關那張絕學有五到七成變成稀有、整店最貴的一格永遠是它（稽核 2026-09-04 M-4）。
  // 保底不是硬保證：同池稀有牌都已經在架上就放棄（稀有忍術 9 張、稀有絕學 11 張，實測三關各 3000 間 0 次失敗）。
  // 加上保底後的實測分布：第一關 60／30／10、第二關 33／37／30、第三關 17／35／48（常見／罕見／稀有）。
  const wantRare = run.act >= 3 ? 2 : run.act === 2 ? 1 : 0;
  const order = rng.shuffle(cardDefs.map((_, i) => i)).sort((x, y) => Number(cardDefs[x]!.pool === '絕學') - Number(cardDefs[y]!.pool === '絕學'));
  for (const i of order) {
    if (cardDefs.filter((c) => c.rarity === '稀有').length >= wantRare) break;
    const cur = cardDefs[i]!;
    if (cur.rarity === '稀有') continue;
    const pool = cards.filter((c) => c.pool === cur.pool && c.rarity === '稀有' && !c.combatOnly && !cardDefs.some((d) => d.id === c.id));
    if (pool.length) cardDefs[i] = rng.pick(pool);
  }
  const relicIds: string[] = [];
  for (let i = 0; i < 2; i++) { const id = rollRelic(rng, '常見', [...run.relics, ...relicIds]); if (id) relicIds.push(id); }
  return {
    cards: cardDefs.map((def) => ({ def, price: Math.round(PRICE[def.rarity] * shopMul), sold: false })),
    relics: relicIds.map((id) => ({ id, price: Math.round((relicById[id]?.price ?? RELIC_PRICE) * shopMul), sold: false })),
    potions: Array.from({ length: 3 }, () => {
      const id = rollPotion(rng);
      return { id, price: Math.round((potionById[id]?.price ?? POTION_PRICE) * shopMul), sold: false };
    }),
  };
}

function pay(run: RunState, price: number): boolean {
  if (run.fish < price) return false;
  run.fish -= price;
  return true;
}
export function buyCard(run: RunState, shop: ShopStock, i: number): boolean {
  const it = shop.cards[i]; if (!it || it.sold || !pay(run, it.price)) return false;
  it.sold = true; addCard(run, it.def.id); return true;
}
export function buyRelic(run: RunState, shop: ShopStock, i: number): boolean {
  const it = shop.relics[i]; if (!it || it.sold || run.relics.includes(it.id) || !pay(run, it.price)) return false;
  it.sold = true; takeRelic(run, it.id); return true;
}
/** `replaceIndex`＝帶滿時要換掉哪一支；帶滿又沒指定就不賣（錢也不扣） */
export function buyPotion(run: RunState, shop: ShopStock, i: number, replaceIndex?: number): boolean {
  const it = shop.potions[i]; if (!it || it.sold) return false;
  const full = run.potions.length >= potionCapacity(run);
  if (full && (replaceIndex === undefined || replaceIndex < 0 || replaceIndex >= run.potions.length)) return false;
  if (!pay(run, it.price)) return false;
  it.sold = true;
  if (full) replacePotion(run, replaceIndex!, it.id); else addPotion(run, it.id);
  return true;
}
export function buyRemove(run: RunState, uid: number): boolean {
  if (!run.deck.some((c) => c.uid === uid) || !pay(run, run.removeCost)) return false;
  removeCard(run, uid); run.removeCost += 25; return true;
}

export type RunEffectOutcome =
  /**
   * `n`＝要玩家挑幾張。本來只是一個旗標，事件寫兩次 `upgradeCard` 也只會覆蓋成同一個，
   * 畫面就只跳一次選牌——「升級兩張牌」的事件實際上只升到一張（鏡子、腳印兩個事件都中招）。
   */
  | { needs: 'removeCard' | 'upgradeCard'; n: number }
  | { chooseCard: CardDef[] }
  | { fight: { encounterId: string; bonusFish: number; bonusUpgrades?: number } }
  | null;

/**
 * 跑一串整局效果。
 *
 * `notes` 是給畫面用的「實際發生了什麼」：有幾種效果**在畫面上完全看不出結果**——賭飯糰
 * 到底中了哪一邊、忍具帶滿時多的那幾個被靜靜丟掉、隨機撿到的是哪一張牌——事件畫面拿這幾句
 * 補在結果文案下面（`finish` 的第二個參數）。傳不傳都行，機器人試玩就不傳。
 * 這裡寫的是敘述句，不是球球講話，所以句尾不加「喵」。
 */
/**
 * 事件實際拿到手的東西。`notes` 只寫得出一行字（「拿到忍具「鐵爪套」「小魚乾串」」），
 * 玩家看不到那是什麼、有什麼用——使用者的原話：「圖片跟功能這邊沒顯示出來會不知道拿到了甚麼」。
 * 所以另外收一份結構化的清單，畫面拿它排出圖示＋名稱＋效果，跟戰利品畫面同一種列。
 */
/** `missed`＝忍具帶滿收不下（畫面會問要不要換掉一支舊的） */
export type RunGain = { kind: '秘寶' | '忍具'; id: string; missed?: boolean };

export function applyRunEffects(run: RunState, effects: RunEffect[], notes?: string[],
  gains?: RunGain[]): RunEffectOutcome {
  let outcome: RunEffectOutcome = null;
  const cardName = (id: string): string => cardById[id]?.name ?? id;
  for (const fx of effects) {
    switch (fx.kind) {
      case 'heal': { const got = Math.min(run.maxHp, run.hp + fx.n) - run.hp; run.hp += got; if (got > 0) notes?.push(`回復了 ${got} 點生命`); break; }
      case 'healPercent': { const got = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * fx.p)) - run.hp; run.hp += got; if (got > 0) notes?.push(`回復了 ${got} 點生命`); break; }
      // 難度 4 起壞事件更壞：掉血乘 1.5、賭博成功率乘 0.7
      case 'damage': { const lost = run.hp - Math.max(1, run.hp - Math.round(fx.n * (runMods(run).unlucky ? 1.5 : 1))); run.hp -= lost; if (lost > 0) notes?.push(`受了 ${lost} 點傷害`); break; }
      case 'fish': { const before = run.fish; run.fish = Math.max(0, run.fish + fx.n); const d = run.fish - before; if (d > 0) notes?.push(`拿到 ${d} 條小魚乾`); else if (d < 0) notes?.push(`少了 ${-d} 條小魚乾`); break; }
      case 'fishHalve': { const gone = run.fish - Math.floor(run.fish / 2); run.fish -= gone; if (gone > 0) notes?.push(`分出去 ${gone} 條小魚乾`); break; }
      case 'maxHp':
        run.maxHp += fx.n; run.hp = Math.min(run.maxHp, run.hp + Math.max(0, fx.n));
        notes?.push(`最大生命 ${fx.n >= 0 ? '+' : ''}${fx.n}`);
        break;
      case 'addCard':
        addCard(run, fx.cardId);
        // 壞毛病是被塞進來的，講法要跟「學會了」分開，玩家才知道自己是賺到還是中招
        notes?.push(cardById[fx.cardId]?.pool === '壞毛病'
          ? `牌組被塞了一張「${cardName(fx.cardId)}」`
          : `學會了「${cardName(fx.cardId)}」`);
        break;
      case 'addRandomCard': {
        // `combatOnly` 的戰鬥雜牌（黏液、眼冒金星）只有魔物塞得進來，事件不能抽到
        const pool = cards.filter((c) => c.pool === fx.pool && !c.combatOnly && (!fx.rarity || c.rarity === fx.rarity));
        if (pool.length) { const def = runRng(run).pick(pool); addCard(run, def.id); notes?.push(`撿到了「${def.name}」`); }
        break;
      }
      // 同一種連寫幾次就累加張數；換成另一種就重算（目前沒有事件混用，但規矩要成立）
      case 'removeCard':
      case 'upgradeCard': {
        const need = fx.kind;
        outcome = outcome && 'needs' in outcome && outcome.needs === need
          ? { needs: need, n: outcome.n + 1 } : { needs: need, n: 1 };
        break;
      }
      case 'relic': {
        const id = rollRelic(runRng(run), fx.pool, run.relics);
        if (id) { takeRelic(run, id); gains?.push({ kind: '秘寶', id }); }
        else notes?.push('這一池的秘寶都拿過了，沒有新的可拿');   // 收齊整池才會踩到，但不能靜靜什麼都不給（2026-09-02 稽核 L-4）
        break;
      }
      case 'potions': {
        // 忍具最多帶三個，滿了 addPotion 會回 false 並把多的靜靜丟掉——那件事一定要講出來，
        // 不然文案寫著「掏出兩個忍具塞給球球」，玩家一個都沒拿到還以為是壞掉了
        const rng = runRng(run);
        let full = 0;
        for (let i = 0; i < fx.n; i++) {
          const id = rollPotion(rng);
          if (addPotion(run, id)) gains?.push({ kind: '忍具', id }); else { full += 1; gains?.push({ kind: '忍具', id, missed: true }); }
        }
        if (full > 0) notes?.push(`忍具帶滿了，還有 ${full} 個收不下`);
        break;
      }
      case 'fight': {
        // 事件寫 `mirror_duel`，實際打 `mirror_duel_a<關數>`：同一個事件三關都抽得到，對手要跟著關卡變強
        const byAct = `${fx.encounterId}_a${run.act}`;
        outcome = { fight: { encounterId: encounterById[byAct] ? byAct : fx.encounterId, bonusFish: fx.bonusFish, bonusUpgrades: fx.bonusUpgrades } };
        break;
      }
      case 'chooseCard': outcome = { chooseCard: rollCardChoices(runRng(run), fx.pool, fx.n) }; break;
      case 'gamble': {
        // 中了哪一邊由子效果自己講（贏＝最大生命 +5、輸＝牌組被塞一張「失手了」）
        const won = runRng(run).chance(fx.p * (runMods(run).unlucky ? 0.7 : 1));
        // 中沒中要自己講。兩邊的結果文案往往同一句（「井底傳來一聲悶響」），
        // 輸的那邊效果常常是空的——玩家按下去只看到圖換了一張，會以為按了沒反應
        // 贏的那邊如果是小魚乾，把數字寫進去（使用者 2026-09-03：掀碗後沒感受到贏還是輸）
        const prize = won ? fx.win.reduce((sum, e) => sum + (e.kind === 'fish' ? e.n : 0), 0) : 0;
        notes?.push(won ? (prize > 0 ? `中了！贏了 ${prize} 條小魚乾` : '中了！') : '沒中……');
        const o = applyRunEffects(run, won ? fx.win : fx.lose, notes, gains); if (o) outcome = o;
        break;
      }
      default: { const _never: never = fx; void _never; }   // 漏接新的 RunEffect 種類會在型別檢查就爆
    }
  }
  return outcome;
}
