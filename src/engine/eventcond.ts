import { cardById } from '../content/cards';
import { potionCapacity } from './run';
import { me } from './runplayer';
import type { CardDef, CardInstance, ChoiceCond, DeckTag, Effect, EventChoice, EventDef, RunEffect, RunState } from './types';

/**
 * 事件的條件選項與座位不對稱選項（2026-09-23 內容擴充第二批，劇本 design2 新1、新7）。
 *
 * **只讀整局狀態、不抽亂數**：兩台機器在同一拍算出來一模一樣，所以畫面、機器人、票的結算都拿這一支判斷
 * 「這個選項現在在不在」，不會有一台多一顆按鈕。選項清單進事件格時現算、不存檔。
 */

/** 牌的效果攤平：能力牌包在 `power` 裡、條件牌包在 `then` 裡的也要算（毒霧、見招拆招那類） */
function flat(fx: readonly Effect[]): Effect[] {
  const out: Effect[] = [];
  const walk = (list: readonly Effect[]): void => {
    for (const e of list) {
      out.push(e);
      for (const v of Object.values(e)) {
        if (Array.isArray(v) && v.length && v.every((x) => !!x && typeof x === 'object' && 'kind' in x)) walk(v as Effect[]);
      }
    }
  };
  walk(fx);
  return out;
}

/**
 * 這張牌（照升級與否那一份效果）算哪幾派。判準跟結局那句「牌組傾向」（`content/dialogue.ts` 的 `deckLeaning`）同一套：
 * - 毒：對魔物上中毒、攻擊附毒、餘毒、同伴毒中才發動的；給自己上的毒不算
 * - 反彈：給自己上反彈，加上把反彈變強、把反彈接到蜷縮的那幾個長效旗標
 * - 隱身：給自己隱身或潛水
 * - 蓄氣：獲得蓄氣（封封）
 */
export function cardTags(def: CardDef, upgraded = false): Set<DeckTag> {
  const fx = flat((upgraded ? def.upgrade?.effects : undefined) ?? def.effects);
  const tags = new Set<DeckTag>();
  const self = (e: Effect, name: string): boolean => e.kind === 'status' && e.target === 'self' && e.name === name;
  for (const e of fx) {
    if (('name' in e && e.name === '中毒' && !('target' in e && e.target === 'self'))
      || e.kind === 'poisonOnAttack' || e.kind === 'poisonBurst' || e.kind === 'poisonAllyNextAttack' || e.kind === 'watchPoisonHit') tags.add('毒');
    if (self(e, '反彈') || e.kind === 'thornsBonus' || e.kind === 'blockWhenAttacked' || e.kind === 'blockFromThorns'
      || (e.kind === 'damageByOwnStatus' && e.name === '反彈')
      || e.kind === 'blockOnThorns' || e.kind === 'thornsFromSpend' || e.kind === 'blockToThorns'
      || (e.kind === 'damageSpendBlock' && e.plusOwnStatus === '反彈')) tags.add('反彈');
    if (self(e, '隱身') || self(e, '潛水')) tags.add('隱身');
    if (e.kind === 'gainQi') tags.add('蓄氣');
  }
  return tags;
}

/** 這一位**後來學的**牌裡，有幾張屬於這一派（起手牌不算：菲菲起手就有六張上毒的，不排掉的話她一開局就有那條路） */
export function deckTagCount(run: RunState, seat: number, tag: DeckTag): number {
  return me(run, seat).deck.filter((c: CardInstance) => {
    const def = cardById[c.cardId];
    return !!def && def.pool !== '起手' && cardTags(def, c.upgraded).has(tag);
  }).length;
}

/** 單一位符合的話，畫面要講的「因為…」 */
export type CondWhy =
  | { kind: 'deckTag'; tag: DeckTag; n: number }
  | { kind: 'relic'; id: string }
  | { kind: 'fishAtLeast'; n: number }
  | { kind: 'potionsFull' }
  | { kind: 'flag'; name: string };

/** 這一位自己符不符合（`flag` 是整局的，每一位都一樣） */
function seatWhy(run: RunState, cond: ChoiceCond, seat: number): CondWhy | null {
  switch (cond.kind) {
    case 'deckTag': { const n = deckTagCount(run, seat, cond.tag); return n >= cond.min ? { kind: 'deckTag', tag: cond.tag, n } : null; }
    case 'relic': { const id = cond.ids.find((x) => me(run, seat).relics.includes(x)); return id ? { kind: 'relic', id } : null; }
    case 'fishAtLeast': return me(run, seat).fish >= cond.n ? { kind: 'fishAtLeast', n: cond.n } : null;
    case 'potionsFull': return me(run, seat).potions.length >= potionCapacity(run, seat) ? { kind: 'potionsFull' } : null;
    case 'flag': return run.flags[cond.name] ? { kind: 'flag', name: cond.name } : null;
    case 'anyOf': { for (const c of cond.of) { const w = seatWhy(run, c, seat); if (w) return w; } return null; }
    default: { const _never: never = cond; void _never; return null; }
  }
}

/** 付錢型（`fishAtLeast`，含包在 `anyOf` 裡的）要每一位都符合；其餘是養成型，任一位符合就行 */
function paysEach(cond: ChoiceCond): boolean {
  return cond.kind === 'fishAtLeast' || (cond.kind === 'anyOf' && cond.of.some(paysEach));
}

/**
 * 這個選項現在出不出現、是誰讓它出現的（劇本 design2 新1「連線時條件怎麼算」）：
 * - 單人：看自己。
 * - 連線：**養成型**（流派牌、秘寶、忍具滿了）站著的人任一位符合就出現，`by` 是那一位（本機這一位優先，標籤寫是誰的）；
 *   **付錢型**（小魚乾）每一位站著的人都要符合（這件事兩個人都要付）；旗標是整局的。
 * - 座位不對稱的選項（`bySeat`）：**任一位倒下就不出現**——一個人撐不起「分工」，只剩兩人一樣的那個。
 */
export interface ChoiceGate { shown: boolean; by?: number; why?: CondWhy }
export function choiceGate(run: RunState, choice: EventChoice, viewer = 0): ChoiceGate {
  if (choice.bySeat && run.players.some((p) => p.down)) return { shown: false };
  const cond = choice.requires;
  if (!cond) return { shown: true };
  const seats = run.players.map((_, i) => i).filter((i) => !run.players[i]?.down);
  if (!seats.length) return { shown: false };
  if (paysEach(cond)) {
    const whys = seats.map((i) => seatWhy(run, cond, i));
    return whys.every((w) => !!w) ? { shown: true, why: whys[0]! } : { shown: false };
  }
  // 本機這一位先看：兩個人都符合時，標籤寫自己的
  const order = seats.includes(viewer) ? [viewer, ...seats.filter((i) => i !== viewer)] : seats;
  for (const i of order) {
    const w = seatWhy(run, cond, i);
    if (w) return { shown: true, by: i, why: w };
  }
  return { shown: false };
}

/**
 * 條件選項的結果文字照哪一位的版本寫（2026-09-23 b2fin，主控裁定）：連線時是**同伴**讓它出現的（養成型，`choiceGate` 的 `by`），
 * 結果就寫同伴做的事——畫面拿同伴那一位的文字（事件開頭那句條件提示句本來就照 `by` 那一位挑，這裡跟它同一套）。
 * 兩個人都符合、單人、付錢型、旗標，都照本機這一位。只影響畫面上的字，兩台各看各的也不會分岔。
 * **要在套效果之前問**：鈴鐺那條會把條件本身交出去，套完就問不出是誰的了。
 */
export function resultSeat(run: RunState, choice: EventChoice, viewer = 0): number {
  if (!choice.requires) return viewer;
  return choiceGate(run, choice, viewer).by ?? viewer;
}

/** 這篇事件現在看得到哪幾個選項（原本的索引，由小到大）。畫面、機器人、票的結算都用這一支 */
export function visibleChoices(run: RunState, ev: EventDef, viewer = 0): number[] {
  return ev.choices.map((c, i) => (choiceGate(run, c, viewer).shown ? i : -1)).filter((i) => i >= 0);
}

/**
 * 座位不對稱的選項，**文字**要照哪一個選項的寫（劇本 design2 新7）：約定是 `choices[0]` 的標籤與結果是「我拿」、
 * `choices[1]` 的是「我付」（座位 0 的視角），所以座位 1 看的時候兩個對調。其餘選項照原本的索引。
 * 投票、套效果一律用原本的索引（票是絕對的，兩台才結算得一樣），只有畫面上的字照這支挑。
 */
export function seatTextIndex(ev: EventDef, index: number, seat: number): number {
  return ev.choices[index]?.bySeat && index < 2 ? (index === seat ? 0 : 1) : index;
}

/** 畫面上選項的排法：看得到的那幾個；連線限定事件把「我拿」排第一（座位 1 的人看到原本的第二個在上面） */
export function choiceOrder(run: RunState, ev: EventDef, seat: number): number[] {
  const shown = visibleChoices(run, ev, seat);
  return seat === 1 && ev.choices[0]?.bySeat && shown.includes(0) && shown.includes(1)
    ? [1, 0, ...shown.filter((i) => i > 1)] : shown;
}

/** 這個選項對這一位跑哪一串效果（座位不對稱的看 `bySeat`，其餘都是 `outcome`） */
export function choiceEffectsFor(choice: EventChoice, seat: number): RunEffect[] {
  return choice.bySeat ? choice.bySeat[seat] ?? [] : choice.outcome;
}
