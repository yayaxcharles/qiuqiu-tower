import { cards } from '../content/cards';
import { potions } from '../content/potions';
import { relics } from '../content/relics';
import type { Rng } from './rng';
import type { CardDef, Pool, Rarity, RelicPool } from './types';

export interface CombatRewards { kind: '戰鬥' | '大魔物' | '塔主'; cards: CardDef[]; fish: number; potion: string | null; relic: string | null }

const RARITY_ODDS: [Rarity, number][] = [['常見', 65], ['罕見', 30], ['稀有', 5]];
/**
 * 中後期的戰鬥獎勵抽好一點的牌。300 局實測玩家最常死在弱怪換中怪的斷層，
 * 病根之一是「牌組長不大」：整關都用 65% 常見的表，抽十次還是一堆基本牌
 * （使用者的原話：「卡牌獲取的手段不夠，牌組養不起來就打不過了」）。
 */
const RARITY_ODDS_LATE: [Rarity, number][] = [['常見', 40], ['罕見', 45], ['稀有', 15]];

function rollRarity(rng: Rng, available: Set<Rarity>, late = false): Rarity {
  const table = (late ? RARITY_ODDS_LATE : RARITY_ODDS).filter(([r]) => available.has(r));
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [rar, w] of table) { r -= w; if (r < 0) return rar; }
  return table[table.length - 1]![0];
}

export function rollCardChoices(rng: Rng, pool: Pool, n: number, exclude: string[] = [], late = false): CardDef[] {
  const out: CardDef[] = [];
  const taken = new Set(exclude);
  for (let i = 0; i < n; i++) {
    const remaining = cards.filter((c) => c.pool === pool && !taken.has(c.id));
    if (remaining.length === 0) break;
    const rar = rollRarity(rng, new Set(remaining.map((c) => c.rarity)), late);
    const pick = rng.pick(remaining.filter((c) => c.rarity === rar));
    taken.add(pick.id);
    out.push(pick);
  }
  return out;
}

export function rollRelic(rng: Rng, pool: RelicPool, owned: string[]): string | null {
  const cands = relics.filter((r) => r.pool === pool && !owned.includes(r.id));
  return cands.length ? rng.pick(cands).id : null;
}

export function rollPotion(rng: Rng): string { return rng.pick(potions).id; }

export function rollRewards(rng: Rng, kind: CombatRewards['kind'], owned: string[], winGoldBonus: number,
  late = false): CombatRewards {
  if (kind === '塔主') return { kind, cards: [], fish: 100 + winGoldBonus, potion: null, relic: owned.includes('tower_token') ? null : 'tower_token' };
  if (kind === '大魔物') {
    const jue = rollCardChoices(rng, '絕學', 1, [], late);
    const rest = rollCardChoices(rng, '忍術', 2, [], late);
    return { kind, cards: rng.shuffle([...jue, ...rest]), fish: 35 + winGoldBonus, potion: rng.chance(0.5) ? rollPotion(rng) : null, relic: rollRelic(rng, '大魔物', owned) };
  }
  // 小魚乾 10～20 → 15～25：原本一關打完約 90 條，罐頭鋪一張常見牌 50、
  // 等於整關只逛得起一次店，商店形同虛設
  return { kind, cards: rollCardChoices(rng, '忍術', 3, [], late), fish: rng.int(15, 25) + winGoldBonus, potion: rng.chance(0.4) ? rollPotion(rng) : null, relic: null };
}
