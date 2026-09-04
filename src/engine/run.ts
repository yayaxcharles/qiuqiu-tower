import { STARTER_DECK, cardById, cards } from '../content/cards';
import { addStatus } from './statuses';
import { clampDifficulty, difficultyMods, type DifficultyMods } from '../content/difficulty';
import { encounterById, enemyById } from '../content/enemies';
import { heroOf } from './hero';
import { modifierById } from '../content/modifiers';
import { potionById, potions } from '../content/potions';
import { relicById } from '../content/relics';
import { startCombat } from './combat';
import { FLOORS, generateMap, nextChoices, nodeById } from './map';
import { Rng, seedFromString } from './rng';
import { rollCardChoices, rollPotion, rollRelic, rollRewards, type CombatRewards } from './rewards';
import type { CardDef, CardInstance, CombatState, EnemyCombat, MapNode, Rarity, RunEffect, RunState } from './types';

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

export function newRun(seed: string, difficulty = 1, hero: 'ninja' | 'samurai' = 'ninja'): RunState {
  const rng = new Rng(seedFromString(seed));
  const level = clampDifficulty(difficulty);
  const mods = difficultyMods(level);
  const run: RunState = {
    version: 1, ...(hero === 'ninja' ? {} : { hero }), seed, rng: rng.state, hp: mods.maxHp, maxHp: mods.maxHp, fish: START_FISH, act: 1, difficulty: level,
    deck: [], relics: [], potions: [], floor: 0,
    map: generateMap(rng, { act: 1, bossIds: bossPoolForAct(1), eliteMul: mods.eliteMul, flags: {} }), currentNode: null, trail: [],
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
  const cs = startCombat({ hp: run.hp, maxHp: run.maxHp, deck: run.deck.map((c) => ({ ...c })), relics: run.relics, potions: run.potions, encounterId: enc, rng: runRng(run),
    mods: { hpMul: m.hpMul, strength, startBlock } });
  applyBossPrefix(run, cs);
  applyEncounterModifier(run, cs);
  return cs;
}

/**
 * 遭遇修飾詞（使用者 2026-09-04 拍板）：一般怪與菁英在地圖生成時就抽好標在節點上，
 * 開戰時整場的**每一隻**魔物都吃一次。關主走自己的 `BOSS_PREFIXES`，兩套互不干擾——
 * 關主節點的 `modifier` 本來就不會被填（見 map.ts）。
 *
 * 整場的魔物都冠上修飾詞的名字（「暴怒的老鼠」，使用者 2026-09-04 指定），這樣戰鬥中的每一行
 * 紀錄、每一顆頭上的名牌都看得到這場不一樣，不用回頭想地圖上寫了什麼。
 * `startCombat` 已經用舊名字印過開場白，跟 applyBossPrefix 一樣要一併改寫，
 * 不然同一隻在紀錄裡會有兩個名字。
 *
 * 戰鬥中才冒出來的（伏兵、召喚物）不冠名：修飾詞講的是「原本站在這裡的這一群」，
 * 河童叫來的蝌蚪兵本來就不是那一群的。
 */
function nodeModifier(run: RunState, encounterId: string | undefined) {
  const node = currentNode(run);
  // 護欄一：遭遇 id 可以被呼叫端覆寫（事件戰、難度 5 前哨戰、鏡像戰），節點標的跟實際打的不是同一場時
  // 修飾詞不能生效——今天四條覆寫路徑都落在事件或塔主節點（那些節點不會有修飾詞）所以碰不到，
  // 但那是巧合不是設計，補一行讓它變明文（稽核 2026-09-04 夜 L-1）
  if (!node || node.encounterId !== encounterId) return undefined;
  // 護欄二：`modifierById` 是 Object.fromEntries 建的，原型上的字（constructor、__proto__、toString）
  // 查得到東西。被竄改的存檔寫 `modifier: "constructor"` 會變成「undefined木樁人」（稽核同上 L-6）
  const id = node.modifier;
  return id && Object.hasOwn(modifierById, id) ? modifierById[id] : undefined;
}

export function applyEncounterModifier(run: RunState, cs: CombatState): void {
  const mod = nodeModifier(run, cs.encounterId);
  if (!mod) return;
  const oldNames = [...new Set(cs.enemies.map((e) => e.name))];
  for (const e of cs.enemies) { mod.apply(e); e.name = mod.label + e.name; }
  // 比對「舊名字＋全形冒號」而不是只比名字：「老鼠」才不會把「老鼠將軍：…」那行也改掉
  cs.log = cs.log.map((l) => (oldNames.some((n) => l.startsWith(n + '：')) ? mod.label + l : l));
  cs.log.push(`${mod.label}：${mod.desc}`);
}

/**
 * 關主隨機前綴（使用者 2026-09-04：「同一個關主偶爾帶不同開場狀態，重玩才不會每次一樣」）。
 * 塔下、塔中的關主戰有 35% 機率抽到一個；師父（第三關）不抽。名字直接改成「暴怒的橘皮大王」，
 * 開場紀錄講一句它做了什麼。三種都是有得有失：暴怒＝爪力 +2 但血 −10%；疲憊＝血 −15% 但開場 8 點防禦；披甲＝鱗甲 2（每回合長防禦）但血 −5%。
 */
export const BOSS_PREFIXES: { label: string; line: string; apply: (e: EnemyCombat) => void }[] = [
  { label: '暴怒的', line: '牠氣得毛都豎起來了（爪力 +2，生命 −10%）', apply: (e) => { addStatus(e, '爪力', 2); e.maxHp = Math.round(e.maxHp * 0.9); e.hp = e.maxHp; } },
  { label: '疲憊的', line: '牠看起來累壞了（生命 −15%，但先架好 8 點防禦）', apply: (e) => { e.maxHp = Math.round(e.maxHp * 0.85); e.hp = e.maxHp; e.block += 8; } },
  { label: '披甲的', line: '牠身上多披了一層甲（鱗甲 2：每回合長出防禦，生命 −5%）', apply: (e) => { addStatus(e, '鱗甲', 2); e.maxHp = Math.round(e.maxHp * 0.95); e.hp = e.maxHp; } },
];
export function applyBossPrefix(run: RunState, cs: CombatState): void {
  if (encounterById[cs.encounterId]?.pool !== '塔主' || run.act >= ACTS) return;
  const boss = cs.enemies.find((e) => enemyById[e.enemyId]?.pool === '塔主');
  if (!boss) return;
  const rng = runRng(run);
  if (!rng.chance(0.35)) return;
  const p = rng.pick(BOSS_PREFIXES);
  p.apply(boss);
  const oldName = boss.name;
  boss.name = p.label + boss.name;
  // startCombat 已經用舊名字印了開場白，一併改寫，紀錄裡才不會同一隻兩個名字（稽核 2026-09-04 中 9）
  cs.log = cs.log.map((l) => (l.startsWith(oldName + '：') ? boss.name + l.slice(oldName.length) : l));
  cs.log.push(`${boss.name}：${p.line}`);
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
  // 遭遇修飾詞掛在戰利品上的兩條：中了魔氣的多挑一張牌、肥美的／餓扁了的改小魚乾（見 content/modifiers）
  const mod = nodeModifier(run, cs.encounterId);
  const extraChoices = run.relics.reduce((s, id) => s + (relicById[id]?.hooks.rewardChoices ?? 0), 0)
    + (mod?.extraCard ? 1 : 0);   // 掌門印：牌多一張可選
  const upgradeChance = upgradeChanceFor(run);   // 戰鬥獎勵開出升級牌的機率（第一關 10%、第二關 20%、第三關 40%）
  const r = rollRewards(runRng(run), kind, run.relics, winGold, late, { exclude, rareBonus: (run.rarePity ?? 0) * 4, extraChoices, upgradeChance, hero: heroOf(run) });
  if (r.cards.length) run.rarePity = r.cards.some((c) => c.rarity === '稀有') ? 0 : (run.rarePity ?? 0) + 1;
  // 倍率只吃戰利品本身：事件獎金（bonusFish）本來就在外面，秘寶承諾的加成（winGold）也要先扣掉再乘——
  // 不然帶滿三件加小魚乾的秘寶時，「餓扁了的」會把秘寶答應你的 +55 砍成 +27（稽核 2026-09-04 夜 M-2）
  if (mod?.fishMul) r.fish = Math.round((r.fish - winGold) * mod.fishMul) + winGold;
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
  run.map = generateMap(runRng(run), { act: run.act, bossIds: bossPoolForAct(run.act), eliteMul: runMods(run).eliteMul, flags: run.flags });
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
  const h = heroOf(run);
  const jue = rollCardChoices(rng, '絕學', 1, [], true, 0, undefined, h);
  const ren = rollCardChoices(rng, '忍術', 2, jue.map((c) => c.id), true, 0, undefined, h);
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
  if (cardId && rewards.cards.some((c) => c.id === cardId)) addCard(run, cardId, rewards.upgradedCard === cardId);   // 開出來的升級牌拿到就是升級版
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
  /**
   * `base`＝未打折的定價；`price`＝現在的售價（買到零錢罐那一刻整間店重標，見 repriceShop）；`upgraded`＝這格是升級版；
   * `sale`＝特價折數（0.7＝七折；每間店隨機一件，使用者 2026-09-04）
   */
  cards: { def: CardDef; base: number; price: number; sold: boolean; upgraded?: boolean; sale?: number }[];
  relics: { id: string; base: number; price: number; sold: boolean; sale?: number }[];
  potions: { id: string; base: number; price: number; sold: boolean; sale?: number }[];
  /** 重整貨架用過了沒（每店一次，75 條；賣掉的格子不動） */
  reshuffled?: boolean;
}

/** 特價折數與權重：七折最常見、三折最少（使用者 2026-09-04：「不一定五折，7／5／4／3 折隨機，機率你定」） */
export const SALE_RATES: readonly [number, number][] = [[0.7, 45], [0.5, 30], [0.4, 15], [0.3, 10]];
export const RESHUFFLE_COST = 75;

function priceOf(base: number, mul: number, sale?: number): number { return Math.round(base * mul * (sale ?? 1)); }
/** 罐頭鋪牌格數：第一關 5、第二關起 6 */
export function shopCardCount(run: RunState): number { return run.act >= 2 ? 6 : 5; }

/** 罐頭鋪價格倍率：難度 4 起貴一成 × 帶著的秘寶折扣（零錢罐八折、貪吃錢袋漲三成，相乘） */
export function shopMulFor(run: RunState): number {
  return runMods(run).shopMul * run.relics.reduce((m, id) => m * (relicById[id]?.hooks.shopDiscount ?? 1), 1);
}

/** 依現在的倍率把還沒賣掉的東西重新標價（買到會改價格的秘寶時叫——使用者 2026-09-04：買了零錢罐商品沒跟著變） */
export function repriceShop(run: RunState, shop: ShopStock): void {
  const mul = shopMulFor(run);
  for (const it of [...shop.cards, ...shop.relics, ...shop.potions]) if (!it.sold) it.price = priceOf(it.base, mul, it.sale);
}

/** 罐頭鋪的牌：依關數的稀有度配額抽 n 張（排除 `exclude`），並套稀有保底 */
function rollShopCards(run: RunState, rng: Rng, n: number, exclude: string[]): CardDef[] {
  const odds: readonly [Rarity, number][] = run.act >= 3 ? [['常見', 20], ['罕見', 40], ['稀有', 40]]
    : run.act === 2 ? [['常見', 35], ['罕見', 40], ['稀有', 25]] : [['常見', 60], ['罕見', 30], ['稀有', 10]];
  const jueN = n > 0 && rng.chance(run.act >= 3 ? 0.4 : run.act === 2 ? 0.3 : 0.2) ? 1 : 0;
  const cardDefs = [...rollCardChoices(rng, '忍術', n - jueN, exclude, false, 0, odds, heroOf(run)), ...rollCardChoices(rng, '絕學', jueN, exclude, false, 0, odds, heroOf(run))];
  const wantRare = Math.min(n, run.act >= 3 ? 2 : run.act === 2 ? 1 : 0);
  const order = rng.shuffle(cardDefs.map((_, i) => i)).sort((x, y) => Number(cardDefs[x]!.pool === '絕學') - Number(cardDefs[y]!.pool === '絕學'));
  for (const i of order) {
    if (cardDefs.filter((c) => c.rarity === '稀有').length >= wantRare) break;
    const cur = cardDefs[i]!;
    if (cur.rarity === '稀有') continue;
    const pool = cards.filter((c) => c.pool === cur.pool && c.rarity === '稀有' && !c.combatOnly && !c.hidden && !exclude.includes(c.id) && !cardDefs.some((d) => d.id === c.id));
    if (pool.length) cardDefs[i] = rng.pick(pool);
  }
  return cardDefs;
}

/**
 * 重整貨架（使用者 2026-09-04）：75 條、每店一次，只換還沒賣掉的牌格（賣掉的維持原牌、寫「賣掉了」，免得越買越多）；
 * 特價如果掛在被換掉的格子上，新牌繼承那個折數。
 */
export function reshuffleShop(run: RunState, shop: ShopStock): boolean {
  const open = shop.cards.map((c, i) => (c.sold ? -1 : i)).filter((i) => i >= 0);
  if (shop.reshuffled || !open.length || !pay(run, RESHUFFLE_COST)) return false;   // 沒有空格可換就不收錢（稽核 2026-09-04 低 1）
  shop.reshuffled = true;
  const rng = runRng(run);
  const fresh = rollShopCards(run, rng, open.length, shop.cards.map((c) => c.def.id));
  const upIdx = fresh.length && rng.chance(upgradeChanceFor(run)) ? rng.int(0, fresh.length - 1) : -1;
  const mul = shopMulFor(run);
  open.forEach((slot, k) => {
    const def = fresh[k]; if (!def) return;
    const prev = shop.cards[slot]!;
    shop.cards[slot] = { def, base: PRICE[def.rarity], price: priceOf(PRICE[def.rarity], mul, prev.sale), sold: false, ...(k === upIdx ? { upgraded: true } : {}), ...(prev.sale ? { sale: prev.sale } : {}) };
  });
  return true;
}

/** 戰鬥獎勵、罐頭鋪、事件選牌開出「升級牌」的機率：第一關 10%、第二關 20%、第三關 40%（使用者 2026-09-04） */
export function upgradeChanceFor(run: RunState): number {
  return run.act >= 3 ? 0.4 : run.act === 2 ? 0.2 : 0.1;
}

export function makeShop(run: RunState): ShopStock {
  const shopMul = shopMulFor(run);
  const rng = runRng(run);
  // 罐頭鋪的稀有度隨關數往上（使用者 2026-09-03）、絕學低機率一張、稀有保底（稽核 2026-09-04 M-4）——全部在 rollShopCards 裡
  // 第二關起貨架放六張牌（使用者 2026-09-04：新招區還有空間）；第一關五張
  const cardDefs = rollShopCards(run, rng, shopCardCount(run), []);
  const relicIds: string[] = [];
  for (let i = 0; i < 2; i++) { const id = rollRelic(rng, '常見', [...run.relics, ...relicIds]); if (id) relicIds.push(id); }
  // 珍品架（使用者 2026-09-04）：第二、三關多一件大魔物池的秘寶，標價照那件秘寶自己的定價（使用者：不要另外抬到 250）
  let treasure: string | null = null;
  if (run.act >= 2) { treasure = rollRelic(rng, '大魔物', [...run.relics, ...relicIds]); if (treasure) relicIds.push(treasure); }
  // 升級牌：依關數機率把架上（第一關五張、第二關起六張）的一張標成升級版（同價；使用者 2026-09-04：罐頭鋪也要套用）
  const upgradedIdx = cardDefs.length && rng.chance(upgradeChanceFor(run)) ? rng.int(0, cardDefs.length - 1) : -1;
  const shop: ShopStock = {
    cards: cardDefs.map((def, i) => ({ def, base: PRICE[def.rarity], price: priceOf(PRICE[def.rarity], shopMul), sold: false, ...(i === upgradedIdx ? { upgraded: true } : {}) })),
    relics: relicIds.map((id) => { const base = relicById[id]?.price ?? RELIC_PRICE; return { id, base, price: priceOf(base, shopMul), sold: false }; }),
    potions: Array.from({ length: 3 }, () => {
      const id = rollPotion(rng);
      const base = potionById[id]?.price ?? POTION_PRICE;
      return { id, base, price: priceOf(base, shopMul), sold: false };
    }),
  };
  // 每店一件特價（使用者 2026-09-04）：全部商品裡隨機一件，折數照 SALE_RATES 的權重抽
  const all = [...shop.cards, ...shop.relics, ...shop.potions];
  if (all.length) {
    const total = SALE_RATES.reduce((s, [, w]) => s + w, 0);
    let roll = rng.next() * total; let rate = SALE_RATES[0]![0];
    for (const [rt, w] of SALE_RATES) { roll -= w; if (roll < 0) { rate = rt; break; } }
    const it = all[rng.int(0, all.length - 1)]!;
    it.sale = rate; it.price = priceOf(it.base, shopMul, rate);
  }
  return shop;
}

function pay(run: RunState, price: number): boolean {
  if (run.fish < price) return false;
  run.fish -= price;
  return true;
}
export function buyCard(run: RunState, shop: ShopStock, i: number): boolean {
  const it = shop.cards[i]; if (!it || it.sold || !pay(run, it.price)) return false;
  it.sold = true; addCard(run, it.def.id, !!it.upgraded); return true;   // 標成升級版的那格買到就是升級牌
}
export function buyRelic(run: RunState, shop: ShopStock, i: number): boolean {
  const it = shop.relics[i]; if (!it || it.sold || run.relics.includes(it.id) || !pay(run, it.price)) return false;
  it.sold = true; takeRelic(run, it.id);
  repriceShop(run, shop);   // 零錢罐、貪吃錢袋這類改價的秘寶買到當下整間店重標（使用者 2026-09-04）
  return true;
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
  | { chooseCard: CardDef[]; upgradedCard?: string }   // `upgradedCard`＝這一張是升級版（機率同戰鬥獎勵）
  /** `afterWin`＝同一個選項裡其他的獎勵效果（秘寶、小魚乾、牌……），要等打贏才發；事件畫面開打前把它放進 run.pendingAfterFight */
  | { fight: { encounterId: string; bonusFish: number; bonusUpgrades?: number; afterWin?: RunEffect[] } }
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
  // 同一個選項裡有「打一場」：其他獎勵（秘寶、小魚乾、牌……）不能先發，要等打贏（使用者 2026-09-04）。
  // 旗標照常記（那是「你選了什麼」，不是獎勵）。
  const fightIdx = effects.findIndex((e) => e.kind === 'fight');
  // 要玩家互動的（挑牌、放生、升級）不能延後——延後了就沒有畫面接手、會被靜靜吞掉（稽核 2026-09-04 中 1）；它們當場做，其餘戰利品打贏才發
  const interactive = (e: RunEffect): boolean => e.kind === 'chooseCard' || e.kind === 'removeCard' || e.kind === 'upgradeCard';
  const deferred: RunEffect[] = fightIdx >= 0 ? effects.filter((e) => e.kind !== 'fight' && e.kind !== 'flag' && !interactive(e)) : [];
  const now = fightIdx >= 0 ? effects.filter((e) => e.kind === 'fight' || e.kind === 'flag' || interactive(e)) : effects;
  if (deferred.length) notes?.push('獎勵要打贏才拿得到');
  for (const fx of now) {
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
        const pool = cards.filter((c) => c.pool === fx.pool && !c.combatOnly && !c.hidden && (!fx.rarity || c.rarity === fx.rarity));
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
        outcome = { fight: { encounterId: encounterById[byAct] ? byAct : fx.encounterId, bonusFish: fx.bonusFish, bonusUpgrades: fx.bonusUpgrades, ...(deferred.length ? { afterWin: deferred } : {}) } };
        break;
      }
      case 'chooseCard': {
        const rng = runRng(run);
        const picks = rollCardChoices(rng, fx.pool, fx.n, [], false, 0, undefined, heroOf(run));
        const up = picks.length && rng.chance(upgradeChanceFor(run)) ? rng.pick(picks).id : undefined;
        outcome = { chooseCard: picks, ...(up ? { upgradedCard: up } : {}) };
        break;
      }
      case 'flag': run.flags[fx.name] = true; break;
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

/**
 * 事件「要打一場」附帶的獎勵：打贏才發、輸了清掉。戰鬥收尾（app.afterCombat）在算完戰利品後叫一次；
 * 回傳的 notes／gains 給畫面跳提示用。
 */
export function resolvePendingAfterFight(run: RunState, won: boolean, notes?: string[], gains?: RunGain[]): void {
  const list = run.pendingAfterFight;
  run.pendingAfterFight = undefined;
  if (!list || !won) return;
  applyRunEffects(run, list, notes, gains);
}
