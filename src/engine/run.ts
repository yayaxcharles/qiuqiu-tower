import { STARTER_DECK, cardById, cards } from '../content/cards';
import { potions } from '../content/potions';
import { relicById } from '../content/relics';
import { startCombat } from './combat';
import { generateMap, nextChoices, nodeById } from './map';
import { Rng, seedFromString } from './rng';
import { rollCardChoices, rollPotion, rollRelic, rollRewards, type CombatRewards } from './rewards';
import type { CardDef, CardInstance, CombatState, MapNode, Rarity, RunEffect, RunState } from './types';

export const START_FISH = 50;
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
    version: 1, seed, rng: rng.state, hp: 70, maxHp: 70, fish: START_FISH,
    deck: [], relics: [], potions: [], floor: 0, map: generateMap(rng), currentNode: null,
    nextUid: 1, stats: { kills: 0, turns: 0, cardsPlayed: 0 }, removeCost: 75, status: 'playing',
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
  run.floor = n.floor;
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
  if (cs.phase === 'lost') { run.hp = 0; run.status = 'lost'; return null; }
  run.hp = cs.player.hp;
  run.stats.kills += cs.kills;
  run.fish = Math.max(0, run.fish + cs.fishDelta);
  const node = currentNode(run);
  const kind: CombatRewards['kind'] = cs.encounterId === 'tower_master' ? '塔主' : node?.type === '大魔物' ? '大魔物' : '戰鬥';
  const winGold = run.relics.reduce((s, id) => s + (relicById[id]?.hooks.winGold ?? 0), 0);
  const r = rollRewards(runRng(run), kind, run.relics, winGold);
  run.fish += r.fish + bonusFish;   // 獎金另計：r.fish 維持規格 §5.4 的戰利品數字，不把事件獎金摻進去
  if (r.relic) takeRelic(run, r.relic);
  if (r.potion && !addPotion(run, r.potion)) r.potion = null;
  if (kind === '塔主') run.status = 'won';
  return r;
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
  | { needs: 'removeCard' | 'upgradeCard' }
  | { chooseCard: CardDef[] }
  | { fight: { encounterId: string; bonusFish: number } }
  | null;

export function applyRunEffects(run: RunState, effects: RunEffect[]): RunEffectOutcome {
  let outcome: RunEffectOutcome = null;
  for (const fx of effects) {
    switch (fx.kind) {
      case 'heal': run.hp = Math.min(run.maxHp, run.hp + fx.n); break;
      case 'healPercent': run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * fx.p)); break;
      case 'damage': run.hp = Math.max(1, run.hp - fx.n); break;
      case 'fish': run.fish = Math.max(0, run.fish + fx.n); break;
      case 'fishHalve': run.fish = Math.floor(run.fish / 2); break;
      case 'maxHp': run.maxHp += fx.n; run.hp = Math.min(run.maxHp, run.hp + Math.max(0, fx.n)); break;
      case 'addCard': addCard(run, fx.cardId); break;
      case 'addRandomCard': {
        const pool = cards.filter((c) => c.pool === fx.pool && (!fx.rarity || c.rarity === fx.rarity));
        if (pool.length) addCard(run, runRng(run).pick(pool).id);
        break;
      }
      case 'removeCard': outcome = { needs: 'removeCard' }; break;
      case 'upgradeCard': outcome = { needs: 'upgradeCard' }; break;
      case 'relic': { const id = rollRelic(runRng(run), fx.pool, run.relics); if (id) takeRelic(run, id); break; }
      case 'potions': { const rng = runRng(run); for (let i = 0; i < fx.n; i++) addPotion(run, rollPotion(rng)); break; }
      case 'fight': outcome = { fight: { encounterId: fx.encounterId, bonusFish: fx.bonusFish } }; break;
      case 'chooseCard': outcome = { chooseCard: rollCardChoices(runRng(run), fx.pool, fx.n) }; break;
      case 'gamble': {
        const sub = runRng(run).chance(fx.p) ? fx.win : fx.lose;
        const o = applyRunEffects(run, sub); if (o) outcome = o;
        break;
      }
      default: { const _never: never = fx; void _never; }   // 漏接新的 RunEffect 種類會在型別檢查就爆
    }
  }
  return outcome;
}
