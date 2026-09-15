import { relicById } from '../content/relics';
import { cards } from '../content/cards';
import { pickable } from './hero';
import type { Hero } from './hero';
import { potions } from '../content/potions';
import { relics } from '../content/relics';
import type { Rng } from './rng';
import type { CardDef, Pool, Rarity, RelicPool } from './types';

export interface CombatRewards {
  kind: '戰鬥' | '大魔物' | '塔主'; cards: CardDef[]; fish: number; potion: string | null; relic: string | null;
  /** 忍具帶滿收不下的那支：獎勵畫面會問要不要換掉一支舊的（2026-09-02） */
  potionMissed?: string | null;
  /** 這場的遭遇修飾詞（有的話）：獎勵畫面用它解釋小魚乾為什麼多了／少了、為什麼多一張牌可挑 */
  modifier?: { label: string; desc: string };
  /** 這一格牌是「已經升級過的」版本（機率見 run.ts 的 upgradeChanceFor） */
  upgradedCard?: string;
  /** 這場魔物是自己散掉的、你一隻都沒打倒：沒有戰利品，獎勵畫面要講清楚為什麼（稽核 2026-09-10 高-1） */
  escaped?: boolean;
  /**
   * 兩個人時攤出來的秘寶（規則三：出兩件各挑一件）。單機不填，走上面的 `relic`。
   *
   * 為什麼不把單機也改成長度 1 的陣列：`relic` 那條路是「直接塞進背包」，
   * 這條是「攤出來等兩個人挑」，兩件事的流程完全不同；合成一個欄位的話，
   * 每個讀它的地方都要再問一次「現在是哪一種」。
   */
  relicOffers?: string[];
  /** 忍具帶滿、收不下這一支的座位（一人一個背包，滿的人不一定是同一個） */
  potionMissedSeats?: number[];
  /**
   * **兩個人時每個人各一份三選一**（2026-09-13 使用者要求：「雙人各自獲得牌的話
   * 要能各自選擇拿到自己的牌」）。`cardsPerSeat[i]` 是第 i 位看到的那三張。
   *
   * 為什麼非做不可：原本整場只抽一份，而且是照**0 號座位的角色**抽的
   *（`heroOf(me(run))` 沒帶座位）。混搭連線時球球坐 0 號、菲菲坐 1 號，
   * 菲菲看到的永遠是球球的牌池——**她自己那 25 張專屬牌在連線裡一張都抽不到**，
   * 而且她還會拿到球球專屬的隱身牌。這件事完全靜音：畫面正常、牌也真的進了她的牌組。
   *
   * 單機不填（走上面的 `cards`），理由跟 `relicOffers` 一樣：兩條流程不同，
   * 合成一個欄位的話每個讀它的地方都要再問一次「現在是哪一種」。
   */
  cardsPerSeat?: CardDef[][];
  /** 跟 `cardsPerSeat` 成對：第 i 位那三張裡哪一張是升級版（沒有就是 undefined） */
  upgradedPerSeat?: (string | undefined)[];
  /**
   * **兩個人時每個人實際拿到幾條小魚乾**（2026-09-14 連線稽核 高-12）。
   *
   * `fish` 是照 0 號座位的秘寶（小魚乾罐、幸運錢幣、貪吃錢袋）加成算的；原本兩個人都照那個數字發，
   * 於是加成放在 1 號身上完全沒用、放在 0 號身上兩個人一起拿。現在戰利品的底數共用，
   * 加成各算各的。單機不填（走 `fish`），理由跟 `cardsPerSeat` 一樣。
   */
  fishPerSeat?: number[];
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

/**
 * `hero` 可以給一串（2026-09-14 連線稽核 高-8）：**共用的貨架**（罐頭鋪）要擺「這一局有人用得到」的牌，
 * 跟秘寶的 `relicOk` 同一條規則。單機只給一位，濾出來的清單跟以前一模一樣，亂數走向不變。
 */
export function rollCardChoices(rng: Rng, pool: Pool, n: number, exclude: string[] = [], late = false, rareBonus = 0, odds?: readonly [Rarity, number][], hero: Hero | readonly Hero[] = 'ninja', players = 1): CardDef[] {
  const out: CardDef[] = [];
  const taken = new Set(exclude);
  const heroes: readonly Hero[] = typeof hero === 'string' ? [hero] : hero;
  for (let i = 0; i < n; i++) {
    // 能不能開出來一律問 `pickable`（雜牌、待圖、職業、連線牌四道關卡都在那裡）
    const remaining = cards.filter((c) => c.pool === pool && heroes.some((h) => pickable(c, h, players)) && !taken.has(c.id));
    if (remaining.length === 0) break;
    const rar = rollRarity(rng, new Set(remaining.map((c) => c.rarity)), late, rareBonus, odds);
    const pick = rng.pick(remaining.filter((c) => c.rarity === rar));
    taken.add(pick.id);
    out.push(pick);
  }
  return out;
}

/**
  * `heroes`＝這一局有哪些職業（連線就傳兩位）。職業獨占的秘寶只給對得上的那一位，
  * 沒傳就當忍者（單機舊呼叫端不用改）。理由見 `RelicDef.notFor`。
  */
export function relicOk(r: { notFor?: readonly string[] }, heroes: readonly string[]): boolean {
  // 這一局**有人用得到**就留著：連線混搭時球球在場，紙袋照樣該出現（菲菲挑就是了）
  return !r.notFor?.length || heroes.some((h) => !r.notFor!.includes(h));
}

export function rollRelic(rng: Rng, pool: RelicPool, owned: string[], heroes: readonly string[] = ['ninja']): string | null {
  const cands = relics.filter((r) => r.pool === pool && !owned.includes(r.id) && relicOk(r, heroes));
  return cands.length ? rng.pick(cands).id : null;
}

export function rollPotion(rng: Rng): string { return rng.pick(potions).id; }

/**
 * 兩個人的秘寶獎勵：抽 `n` 件出來讓他們各挑一件（規則三，使用者 2026-09-11）。
 *
 * **只抽「兩個人都還沒有的」**。刻意不做成「各看各的清單」——那樣兩邊看到的東西
 * 不一樣，就沒辦法「像選路線一樣兩個人各選一件」，畫面也沒法把兩人的選擇擺在一起。
 * 六十件秘寶要兩個人同時收齊某一池才會抽不滿，真抽不滿就給幾件算幾件。
 *
 * 單機呼叫 `n = 1` 時行為跟 `rollRelic` 完全一樣（同樣的候選、同樣一次 `rng.pick`）。
 */
export function rollRelicChoices(rng: Rng, pool: RelicPool, ownedPerSeat: readonly string[][], n: number,
                                 heroes: readonly string[] = ['ninja']): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const cands = relics.filter((r) => r.pool === pool
      && !out.includes(r.id)
      && relicOk(r, heroes)
      && ownedPerSeat.every((owned) => !owned.includes(r.id)));
    if (!cands.length) break;
    out.push(rng.pick(cands).id);
  }
  return out;
}

/**
 * 兩個人各挑一件，挑同一件怎麼辦（規則三，使用者 2026-09-11：
 * 「都選同一個就隨機給一個人，剩下的秘寶就給另一位」）。
 *
 * `picks[seat]`＝那一位挑的秘寶 id，`null`＝沒挑（倒下、或就是不要）。
 * 回傳每個座位真正拿到的。
 *
 * 撞件時**只擲一次骰**決定誰拿到自己挑的那件，輸的人自動拿剩下那件——
 * 所以兩個人一定都拿得到東西，沒有人會因為手慢而空手。
 */
/**
 * 撞件結算完的一句話（連線版）：誰拿到什麼、是不是擲骰決定的。
 * 使用者 2026-09-15：「雙人選擇的時候要知道最後誰拿到什麼」——原本只靠秘寶列的底色自己推。
 * `seat`＝我是第幾位；其他人一律叫「同伴」（現在最多兩個人）。
 */
export function relicOutcomeText(offered: readonly string[], picks: readonly (string | null)[],
  got: readonly (string | null)[], seat: number): string {
  const name = (id: string | null): string => (id ? (relicById[id]?.name ?? id) : '');
  const who = (i: number): string => (i === seat ? '你' : '同伴');
  const chosen = picks.filter((p): p is string => p !== null && offered.includes(p));
  const clashed = new Set(chosen).size < chosen.length;
  const parts = got.map((id, i) => (id ? `${who(i)}拿到「${name(id)}」` : null)).filter((s): s is string => s !== null);
  if (!parts.length) return '';
  return (clashed ? `兩人都想要「${name(chosen[0] ?? null)}」，擲骰決定：` : '') + parts.join('、');
}

export function settleRelicPicks(rng: Rng, offered: readonly string[], picks: readonly (string | null)[]): (string | null)[] {
  const valid = picks.map((p) => (p !== null && offered.includes(p) ? p : null));
  const chosen = valid.filter((p): p is string => p !== null);
  // 沒撞件（含只有一個人挑）就各拿各的，一次骰都不用擲
  if (new Set(chosen).size === chosen.length) return [...valid];

  const winner = rng.int(0, valid.length - 1);
  const prize = valid[winner] as string;
  const leftover = offered.find((id) => id !== prize) ?? null;
  return valid.map((p, i) => (p === null ? null : i === winner ? prize : leftover));
}

/**
 * `opts.exclude`＝這次不要再開的牌（牌組裡已經有兩張的：第三張同名牌幾乎沒人要，開出來等於少一個選項）；
 * `opts.rareBonus`＝稀有保底權重。兩者都只影響牌，不影響小魚乾／忍具／秘寶。
 */
export function rollRewards(rng: Rng, kind: CombatRewards['kind'], owned: string[], winGoldBonus: number,
  late = false, opts: { exclude?: string[]; rareBonus?: number; extraChoices?: number; upgradeChance?: number; hero?: Hero;
    /**
     * 兩個人各自已經有的秘寶。填了就改開 `ownedPerSeat.length` 件讓他們各挑一件（規則三）；
     * 不填就是單機，照舊只開一件直接給。
     *
     * 一人時 `rollRelicChoices(…, 1)` 跟 `rollRelic` 抽出來一模一樣（同候選、同一次 `rng.pick`），
     * 所以這個參數不影響單機的亂數走向——四個定錨測試就是在盯這件事。
     */
    ownedPerSeat?: readonly string[][];
    /** 這一局有哪些職業（連線兩位）。濾掉「對這一局沒人用得到」的秘寶，見 `RelicDef.notFor` */
    heroes?: readonly string[];
    /**
     * 這一局幾個人。**連線牌（`CardDef.coop`）只有填 2 以上才抽得到**，
     * 見 `pickable` 第三道關卡。
     *
     * 2026-09-13 稽核抓到的：這個參數以前根本不存在，`rollCardChoices` 就吃自己的預設值 1，
     * 於是連線局打完的三選一、過關三選一、罐頭鋪整排——27 張連線牌一張都開不出來。
     * 完全靜音：畫面正常、牌也照常三選一，只是那些牌永遠不在池子裡。
     * 單機傳 1（或不傳）時行為與修改前一模一樣，`pickable` 那一關直接放行。
     */
    players?: number } = {}): CombatRewards {
  const ex = opts.exclude ?? [];
  const hero = opts.hero ?? 'ninja';   // 職業獨占牌的過濾（2026-09-05）
  const players = opts.players ?? 1;   // 連線牌的過濾（2026-09-13）
  const bonus = opts.rareBonus ?? 0;
  const extra = opts.extraChoices ?? 0;   // 掌門印：牌多幾張可選
  if (kind === '塔主') return { kind, cards: [], fish: 100 + winGoldBonus, potion: null, relic: owned.includes('tower_token') ? null : 'tower_token' };
  // 升級牌：依機率挑三選一裡的一張改成升級版（機率見 run.ts upgradeChanceFor）
  const withUpgrade = (cards: CardDef[]): { upgradedCard?: string } =>
    cards.length && (opts.upgradeChance ?? 0) > 0 && rng.chance(opts.upgradeChance ?? 0) ? { upgradedCard: rng.pick(cards).id } : {};
  if (kind === '大魔物') {
    const jue = rollCardChoices(rng, '絕學', 1, ex, late, bonus, undefined, hero, players);
    const rest = rollCardChoices(rng, '忍術', 2 + extra, ex, late, bonus, undefined, hero, players);
    const cards = rng.shuffle([...jue, ...rest]);
    const potion = rng.chance(0.5) ? rollPotion(rng) : null;
    const seats = opts.ownedPerSeat;
    if (seats && seats.length > 1) {
      const offers = rollRelicChoices(rng, '大魔物', seats, seats.length, opts.heroes ?? [hero]);
      return { kind, cards, fish: 35 + winGoldBonus, potion, relic: null, relicOffers: offers, ...withUpgrade(cards) };
    }
    return { kind, cards, fish: 35 + winGoldBonus, potion, relic: rollRelic(rng, '大魔物', owned, opts.heroes ?? [hero]), ...withUpgrade(cards) };
  }
  // 小魚乾 10～20 → 15～25：原本一關打完約 90 條，罐頭鋪一張常見牌 50、
  // 等於整關只逛得起一次店，商店形同虛設
  let picks = rollCardChoices(rng, '忍術', 3 + extra, ex, late, bonus, undefined, hero, players);
  // 後期（8F 起、第二關起）四分之一的戰利品把一張忍術換成絕學：
  // 絕學原本只有精英、關主、事件、商店拿得到，一般戰鬥打四十場看到的永遠是忍術池那三十幾張
  if (late && rng.chance(0.25)) {
    const jue = rollCardChoices(rng, '絕學', 1, ex, late, bonus, undefined, hero, players);
    if (jue.length) picks = rng.shuffle([...picks.slice(0, 2 + extra), ...jue]);
  }
  return { kind, cards: picks, fish: rng.int(15, 25) + winGoldBonus, potion: rng.chance(0.4) ? rollPotion(rng) : null, relic: null, ...withUpgrade(picks) };
}
