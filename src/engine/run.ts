import { STARTER_DECK, cardById, cards } from '../content/cards';
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
  // 塔下三選一（貓又／鐵爪／橘皮大王）、塔中三選一（奶牛貓／狸大人／波斯大小姐）、
  // 塔頂固定師父。新關主的立繪還在生圖中：資料先接好，圖裝進資產包才會推上線。
  if (act >= 3) return ['tower_master'];
  if (act === 2) return ['cowcat_boss', 'tanuki_lord', 'persian_lady'];
  return ['nekomata', 'iron_claw', 'orange_king'];
}
const PRICE: Record<Rarity, number> = { 常見: 50, 罕見: 75, 稀有: 150 };
const RELIC_PRICE = 150, POTION_PRICE = 45;

export function runRng(run: RunState): Rng {
  const rng = new Rng(run.rng);
  run.rng = rng.state;
  return rng;
}

export function newRun(seed: string): RunState {
  const rng = new Rng(seedFromString(seed));
  const run: RunState = {
    version: 1, seed, rng: rng.state, hp: 70, maxHp: 70, fish: START_FISH, act: 1,
    deck: [], relics: [], potions: [], floor: 0,
    map: generateMap(rng, { act: 1, bossIds: bossPoolForAct(1) }), currentNode: null,
    nextUid: 1, stats: { kills: 0, turns: 0, cardsPlayed: 0 }, removeCost: 75, status: 'playing',
    flags: {},
  };
  for (const id of STARTER_DECK) addCard(run, id);
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
  // 顯示用的樓層是**跨關累計**的（第二關從 16F 起跳），地圖節點自己的 floor 仍是關內 1～15
  run.floor = (run.act - 1) * FLOORS + n.floor;
  return n;
}

export function beginCombat(run: RunState, encounterId?: string): CombatState {
  const enc = encounterId ?? currentNode(run)?.encounterId;
  if (!enc) throw new Error('目前節點沒有遭遇');
  return startCombat({ hp: run.hp, maxHp: run.maxHp, deck: run.deck.map((c) => ({ ...c })), relics: run.relics, potions: run.potions, encounterId: enc, rng: runRng(run) });
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
  run.fish = Math.max(0, run.fish + cs.fishDelta);
  const node = currentNode(run);
  // 看遭遇屬於哪個池，不要比對特定 id——塔主現在有三個，寫死 id 會漏掉另外兩個
  const isBoss = encounterById[cs.encounterId ?? '']?.pool === '塔主';
  const kind: CombatRewards['kind'] = isBoss ? '塔主' : node?.type === '大魔物' ? '大魔物' : '戰鬥';
  const winGold = run.relics.reduce((s, id) => s + (relicById[id]?.hooks.winGold ?? 0), 0);
  // 「後期」＝第一關的 8F 起、或第二關以後：獎勵抽好一點的牌
  const late = run.act >= 2 || run.floor >= 8;
  const r = rollRewards(runRng(run), kind, run.relics, winGold, late);
  run.fish += r.fish + bonusFish;   // 獎金另計：r.fish 維持規格 §5.4 的戰利品數字，不把事件獎金摻進去
  if (r.relic) takeRelic(run, r.relic);
  if (r.potion && !addPotion(run, r.potion)) r.potion = null;
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
  run.hp = run.maxHp;
  run.map = generateMap(runRng(run), { act: run.act, bossIds: bossPoolForAct(run.act) });
  run.currentNode = null;
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
    const id = rollRelic(rng, '大魔物', [...run.relics, ...out]);
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

export function addPotion(run: RunState, potionId: string): boolean {
  if (run.potions.length >= 3 || !potions.some((p) => p.id === potionId)) return false;
  run.potions.push(potionId);
  return true;
}

export function rest(run: RunState, choice: '打盹' | '磨爪', uid?: number): boolean {
  if (choice === '打盹') {
    const mult = run.relics.reduce((m, id) => m * (relicById[id]?.hooks.restMultiplier ?? 1), 1);
    run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * 0.3 * mult));
    return true;
  }
  return uid !== undefined && upgradeCard(run, uid);
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
  const rng = runRng(run);
  const cardDefs = [...rollCardChoices(rng, '忍術', 3), ...rollCardChoices(rng, '絕學', 2)];
  const relicIds: string[] = [];
  for (let i = 0; i < 2; i++) { const id = rollRelic(rng, '常見', [...run.relics, ...relicIds]); if (id) relicIds.push(id); }
  return {
    cards: cardDefs.map((def) => ({ def, price: PRICE[def.rarity], sold: false })),
    relics: relicIds.map((id) => ({ id, price: RELIC_PRICE, sold: false })),
    potions: Array.from({ length: 3 }, () => ({ id: rollPotion(rng), price: POTION_PRICE, sold: false })),
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
export function buyPotion(run: RunState, shop: ShopStock, i: number): boolean {
  const it = shop.potions[i]; if (!it || it.sold || run.potions.length >= 3 || !pay(run, it.price)) return false;
  it.sold = true; addPotion(run, it.id); return true;
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
  | { fight: { encounterId: string; bonusFish: number } }
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
export type RunGain = { kind: '秘寶' | '忍具'; id: string };

export function applyRunEffects(run: RunState, effects: RunEffect[], notes?: string[],
  gains?: RunGain[]): RunEffectOutcome {
  let outcome: RunEffectOutcome = null;
  const cardName = (id: string): string => cardById[id]?.name ?? id;
  for (const fx of effects) {
    switch (fx.kind) {
      case 'heal': run.hp = Math.min(run.maxHp, run.hp + fx.n); break;
      case 'healPercent': run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * fx.p)); break;
      case 'damage': run.hp = Math.max(1, run.hp - fx.n); break;
      case 'fish': run.fish = Math.max(0, run.fish + fx.n); break;
      case 'fishHalve': run.fish = Math.floor(run.fish / 2); break;
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
        const pool = cards.filter((c) => c.pool === fx.pool && (!fx.rarity || c.rarity === fx.rarity));
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
        break;
      }
      case 'potions': {
        // 忍具最多帶三個，滿了 addPotion 會回 false 並把多的靜靜丟掉——那件事一定要講出來，
        // 不然文案寫著「掏出兩個忍具塞給球球」，玩家一個都沒拿到還以為是壞掉了
        const rng = runRng(run);
        let full = 0;
        for (let i = 0; i < fx.n; i++) {
          const id = rollPotion(rng);
          if (addPotion(run, id)) gains?.push({ kind: '忍具', id }); else full += 1;
        }
        if (full > 0) notes?.push(`忍具帶滿了，還有 ${full} 個收不下`);
        break;
      }
      case 'fight': outcome = { fight: { encounterId: fx.encounterId, bonusFish: fx.bonusFish } }; break;
      case 'chooseCard': outcome = { chooseCard: rollCardChoices(runRng(run), fx.pool, fx.n) }; break;
      case 'gamble': {
        // 中了哪一邊由子效果自己講（贏＝最大生命 +5、輸＝牌組被塞一張「失手了」）
        const won = runRng(run).chance(fx.p);
        // 中沒中要自己講。兩邊的結果文案往往同一句（「井底傳來一聲悶響」），
        // 輸的那邊效果常常是空的——玩家按下去只看到圖換了一張，會以為按了沒反應
        notes?.push(won ? '中了！' : '沒中……');
        const o = applyRunEffects(run, won ? fx.win : fx.lose, notes, gains); if (o) outcome = o;
        break;
      }
      default: { const _never: never = fx; void _never; }   // 漏接新的 RunEffect 種類會在型別檢查就爆
    }
  }
  return outcome;
}
