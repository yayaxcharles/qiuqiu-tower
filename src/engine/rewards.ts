import { cards } from '../content/cards';
import { potions } from '../content/potions';
import { relics } from '../content/relics';
import type { Rng } from './rng';
import type { CardDef, Pool, Rarity, RelicPool } from './types';

export interface CombatRewards {
  kind: '戰鬥' | '大魔物' | '塔主'; cards: CardDef[]; fish: number; potion: string | null; relic: string | null;
  /** 忍具帶滿收不下的那支：獎勵畫面會問要不要換掉一支舊的（2026-09-02） */
  potionMissed?: string | null;
  /** 這一格牌是「已經升級過的」版本（使用者 2026-09-04：第一關一成、第二關兩成、第三關四成的獎勵有一張升級牌） */
  upgradedCard?: string;
}

const RARITY_ODDS: [Rarity, number][] = [['常見', 65], ['罕見', 30], ['稀有', 5]];
/**
 * 中後期的戰鬥獎勵抽好一點的牌。300 局實測玩家最常死在弱怪換中怪的斷層，
 * 病根之一是「牌組長不大」：整關都用 65% 常見的表，抽十次還是一堆基本牌
 * （使用者的原話：「卡牌獲取的手段不夠，牌組養不起來就打不過了」）。
 */
const RARITY_ODDS_LATE: [Rarity, number][] = [['常見', 40], ['罕見', 45], ['稀有', 15]];

/** `rareBonus`＝稀有保底加的權重（見 RunState.rarePity）：連續沒開出稀有，稀有那格越來越大 */
function rollRarity(rng: Rng, available: Set<Rarity>, late = false, rareBonus = 0, odds?: readonly [Rarity, number][]): Rarity {
  const table = (odds ?? (late ? RARITY_ODDS_LATE : RARITY_ODDS))
    .filter(([r]) => available.has(r))
    .map(([r, w]): [Rarity, number] => [r, r === '稀有' ? w + rareBonus : w]);
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [rar, w] of table) { r -= w; if (r < 0) return rar; }
  return table[table.length - 1]![0];
}

export function rollCardChoices(rng: Rng, pool: Pool, n: number, exclude: string[] = [], late = false, rareBonus = 0, odds?: readonly [Rarity, number][]): CardDef[] {
  const out: CardDef[] = [];
  const taken = new Set(exclude);
  for (let i = 0; i < n; i++) {
    // `combatOnly` 的戰鬥雜牌（黏液、眼冒金星）不進任何獎勵池
    const remaining = cards.filter((c) => c.pool === pool && !c.combatOnly && !taken.has(c.id));
    if (remaining.length === 0) break;
    const rar = rollRarity(rng, new Set(remaining.map((c) => c.rarity)), late, rareBonus, odds);
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

/**
 * `opts.exclude`＝這次不要再開的牌（牌組裡已經有兩張的：第三張同名牌幾乎沒人要，開出來等於少一個選項）；
 * `opts.rareBonus`＝稀有保底權重。兩者都只影響牌，不影響小魚乾／忍具／秘寶。
 */
export function rollRewards(rng: Rng, kind: CombatRewards['kind'], owned: string[], winGoldBonus: number,
  late = false, opts: { exclude?: string[]; rareBonus?: number; extraChoices?: number; upgradeChance?: number } = {}): CombatRewards {
  const ex = opts.exclude ?? [];
  const bonus = opts.rareBonus ?? 0;
  const extra = opts.extraChoices ?? 0;   // 掌門印：牌多幾張可選
  if (kind === '塔主') return { kind, cards: [], fish: 100 + winGoldBonus, potion: null, relic: owned.includes('tower_token') ? null : 'tower_token' };
  // 升級牌：依機率挑三選一裡的一張改成升級版（第一關 10%、第二關 20%、第三關 40%，見 run.ts upgradeChanceFor）
  const withUpgrade = (cards: CardDef[]): { upgradedCard?: string } =>
    cards.length && (opts.upgradeChance ?? 0) > 0 && rng.chance(opts.upgradeChance ?? 0) ? { upgradedCard: rng.pick(cards).id } : {};
  if (kind === '大魔物') {
    const jue = rollCardChoices(rng, '絕學', 1, ex, late, bonus);
    const rest = rollCardChoices(rng, '忍術', 2 + extra, ex, late, bonus);
    const cards = rng.shuffle([...jue, ...rest]);
    return { kind, cards, fish: 35 + winGoldBonus, potion: rng.chance(0.5) ? rollPotion(rng) : null, relic: rollRelic(rng, '大魔物', owned), ...withUpgrade(cards) };
  }
  // 小魚乾 10～20 → 15～25：原本一關打完約 90 條，罐頭鋪一張常見牌 50、
  // 等於整關只逛得起一次店，商店形同虛設
  let picks = rollCardChoices(rng, '忍術', 3 + extra, ex, late, bonus);
  // 後期（8F 起、第二關起）四分之一的戰利品把一張忍術換成絕學：
  // 絕學原本只有精英、關主、事件、商店拿得到，一般戰鬥打四十場看到的永遠是忍術池那三十幾張
  if (late && rng.chance(0.25)) {
    const jue = rollCardChoices(rng, '絕學', 1, ex, late, bonus);
    if (jue.length) picks = rng.shuffle([...picks.slice(0, 2 + extra), ...jue]);
  }
  return { kind, cards: picks, fish: rng.int(15, 25) + winGoldBonus, potion: rng.chance(0.4) ? rollPotion(rng) : null, relic: null, ...withUpgrade(picks) };
}
