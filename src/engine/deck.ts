import { cardById } from '../content/cards';
import type { Rng } from './rng';
import type { CardDef, CardInstance, Effect, Keyword, PlayerCombat } from './types';

export const HAND_LIMIT = 10;

export function cardStats(inst: CardInstance): { def: CardDef; name: string; cost: number; effects: Effect[]; keywords: Keyword[] } {
  const def = cardById[inst.cardId];
  if (!def) throw new Error(`未知的牌：${inst.cardId}`);
  if (!inst.upgraded) return { def, name: def.name, cost: def.cost, effects: def.effects, keywords: def.keywords ?? [] };
  const u = def.upgrade;
  return {
    def,
    name: def.name + '＋',
    cost: u.cost ?? def.cost,
    effects: u.effects ?? def.effects,
    keywords: u.keywords ?? def.keywords ?? [],
  };
}

function reshuffle(p: PlayerCombat, rng: Rng): void {
  p.drawPile = rng.shuffle(p.discardPile);
  p.discardPile = [];
}

export function draw(p: PlayerCombat, n: number, rng: Rng): CardInstance[] {
  const got: CardInstance[] = [];
  for (let i = 0; i < n; i++) {
    if (p.hand.length >= HAND_LIMIT) break;
    if (p.drawPile.length === 0) {
      if (p.discardPile.length === 0) break;
      reshuffle(p, rng);
    }
    const c = p.drawPile.shift() as CardInstance;
    p.hand.push(c);
    got.push(c);
    if (cardById[c.cardId]?.curse?.onDraw === 'loseEnergy') p.energy = Math.max(0, p.energy - 1);
  }
  return got;
}

export function discardHand(p: PlayerCombat): void {
  const keep: CardInstance[] = [];
  for (const c of p.hand) {
    const retain = cardStats(c).keywords.includes('保留') || p.retained.includes(c.uid);
    if (retain) keep.push(c); else p.discardPile.push(c);
  }
  p.hand = keep;
  p.retained = [];
}

export function findCard(p: PlayerCombat, uid: number): { pile: 'hand' | 'discard' | 'exhaust' | 'draw'; card: CardInstance } | undefined {
  const piles = [['hand', p.hand], ['discard', p.discardPile], ['exhaust', p.exhaustPile], ['draw', p.drawPile]] as const;
  for (const [pile, arr] of piles) {
    const card = arr.find((c) => c.uid === uid);
    if (card) return { pile, card };
  }
  return undefined;
}

export function moveCard(p: PlayerCombat, uid: number, to: 'hand' | 'discard' | 'exhaust' | 'drawTop' | 'drawBottom'): boolean {
  const found = findCard(p, uid);
  if (!found) return false;
  const src = { hand: p.hand, discard: p.discardPile, exhaust: p.exhaustPile, draw: p.drawPile }[found.pile];
  src.splice(src.indexOf(found.card), 1);
  if (to === 'hand') p.hand.push(found.card);
  else if (to === 'discard') p.discardPile.push(found.card);
  else if (to === 'exhaust') p.exhaustPile.push(found.card);
  else if (to === 'drawTop') p.drawPile.unshift(found.card);
  else p.drawPile.push(found.card);
  return true;
}
