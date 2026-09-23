import { cardById, cardNameFor, cards } from '../content/cards';
import { BLESSINGS, BLESS_CLASSES, blessingById, type BlessingDef, type BlessPickKind } from '../content/blessings';
import { relicById } from '../content/relics';
import { heroOf, pickable } from './hero';
import { Rng, seedFromString } from './rng';
import { addCard, applyRunEffects, removeCard, runRng, upgradeCard, type RunGain } from './run';
import { me } from './runplayer';
import type { CardDef, CardInstance, RunEffect, RunState } from './types';

/**
 * 開局祝福的規則（2026-09-23 內容擴充第三批 新A～新F，設計稿 design3 第二節）。資料表在 `content/blessings.ts`。
 *
 * **這一整批的隨機都用分支亂數**（設計稿〇-2）：包袱摸到哪四樣用 `${seed}|bless|${座位}`、套效果用 `…|fx`、
 * 三選一那三張用 `…|choose`，**不推整局的 `run.rng`**。好處三個：
 *   1. 連線兩人各選各的，誰的動作先繞回來都一樣（兩條分支互不相干），兩台一定算得一樣；
 *   2. 重新整理重進看到同四張、點同一張拿到同樣的東西；
 *   3. 選了不抽亂數的那幾樣（乾糧袋、零錢袋、舊剪刀……），地圖、戰利品、機器人的走向跟沒有祝福時一格都不差。
 * 套效果時把 `run.rng` 暫時換成分支那一條、套完換回來（`withBranchRng`）：`applyRunEffects` 裡的抽法一個字都不用改。
 */

/** 這一張現在發不發（舊護腕要等第七節那件秘寶進池，見 `BlessingDef.needsRelic`） */
export function blessingAvailable(def: BlessingDef): boolean {
  return !def.needsRelic || !!relicById[def.needsRelic];
}

/**
 * 替每一位摸四樣（已經摸過的不重摸）。序章播完、走第一格之前叫（`App.afterPrologue`、機器人開局）。
 * **不在 `newRun` 裡摸**：除錯頁直接開的局、舊存檔都不演（設計稿 2-1），而且 `newRun` 被幾百條測試拿來開局，
 * 多一欄就會動到一堆整局比對。
 */
export function rollBlessings(run: RunState): void {
  run.players.forEach((p, seat) => {
    if (p.bless) return;
    const rng = new Rng(seedFromString(`${run.seed}|bless|${seat}`));
    p.bless = { offer: BLESS_CLASSES.map((cls) => rng.pick(BLESSINGS.filter((b) => b.cls === cls && blessingAvailable(b))).id) };
  });
}

/** 這一位還沒選（有包袱、還沒拿） */
export function blessingPending(run: RunState, seat: number): boolean {
  const b = run.players[seat]?.bless;
  return !!b && b.took === undefined;
}
/** 還有人沒選（連線要兩個人都選好才一起進地圖） */
export function anyBlessingPending(run: RunState): boolean {
  return run.players.some((_, i) => blessingPending(run, i));
}

/** 要自己挑的那一步送出來的東西：`u`＝挑的牌號（移除、升級、換牌）、`c`＝三選一挑的那一張 */
export interface BlessPick { u?: number[]; c?: string }

/** 三選一那三張（一疊招式圖）：分支亂數，畫面先算出來給玩家挑、套用時再算一次驗，兩次一定一樣 */
export function blessChoices(run: RunState, seat: number, id: string): CardDef[] {
  const pk = blessingById[id]?.pick;
  if (!pk || pk.kind !== 'choose') return [];
  const hero = heroOf(me(run, seat));
  const cands = cards.filter((c) => c.pool === pk.pool && c.rarity === pk.rarity && pickable(c, hero, run.players.length));
  return new Rng(seedFromString(`${run.seed}|bless|${seat}|choose`)).shuffle(cands).slice(0, pk.n);
}

/** 挑牌那幾種能挑哪幾張：升級要還沒升過、不是壞毛病；移除與換牌整副都行 */
export function blessPickable(run: RunState, seat: number, kind: BlessPickKind): CardInstance[] {
  const deck = me(run, seat).deck;
  return kind === 'upgrade' ? deck.filter((c) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病') : deck;
}

/** 要挑幾張：寫死張數的要挑滿（牌不夠就挑到沒有），寫「至多」的挑一張也行 */
export function blessPickCount(run: RunState, seat: number, def: BlessingDef): { min: number; max: number } {
  const pk = def.pick;
  if (!pk || pk.kind === 'choose') return { min: 0, max: 0 };
  const max = Math.min(pk.n, blessPickable(run, seat, pk.kind).length);
  return { min: pk.upTo ? Math.min(1, max) : max, max };
}

/** 這一位包袱裡第 `i` 樣 */
export function offeredBlessing(run: RunState, seat: number, i: number): BlessingDef | undefined {
  const id = run.players[seat]?.bless?.offer[i];
  return id ? blessingById[id] : undefined;
}

/** 選得下去嗎（連線的放行判斷也問這一支）。挑的牌要合規矩：張數對、不重複、都在牌組裡、升級的要升得了 */
export function canTakeBlessing(run: RunState, seat: number, i: number, pick: BlessPick = {}): boolean {
  const p = run.players[seat];
  if (!p?.bless || p.bless.took !== undefined) return false;
  const def = offeredBlessing(run, seat, i);
  if (!def) return false;
  const pk = def.pick;
  if (pk?.kind === 'choose') {
    const opts = blessChoices(run, seat, def.id);
    return opts.length ? opts.some((c) => c.id === pick.c) : pick.c === undefined;
  }
  if (!pk) return true;
  const u = pick.u ?? [];
  const { min, max } = blessPickCount(run, seat, def);
  const ok = new Set(blessPickable(run, seat, pk.kind).map((c) => c.uid));
  return u.length >= min && u.length <= max && new Set(u).size === u.length && u.every((x) => ok.has(x));
}

/** 套效果時把整局亂數換成這一位的分支（套完一定換回來，例外也一樣） */
function withBranchRng(run: RunState, key: string, fn: () => void): void {
  const saved = run.rng;
  run.rng = seedFromString(key);
  try { fn(); } finally { run.rng = saved; }
}

/**
 * 換牌（塗鴉本，新C）：這一張換成**同一位、同是忍術池、罕見以上**的隨機一張（壞毛病換成常見），不會換到同名的；
 * 升級不帶過去。**原地換**：牌號、在牌組裡的位置都不動（兩台一樣，`nextUid` 也不用推）。
 */
function transformCard(run: RunState, c: CardInstance, seat: number): CardDef | null {
  const hero = heroOf(me(run, seat));
  const curse = cardById[c.cardId]?.pool === '壞毛病';
  const cands = cards.filter((d) => d.pool === '忍術' && d.id !== c.cardId && pickable(d, hero, run.players.length)
    && (curse ? d.rarity === '常見' : d.rarity !== '常見'));
  if (!cands.length) return null;
  const next = runRng(run).pick(cands);
  c.cardId = next.id;
  c.upgraded = false;
  return next;
}

/**
 * 選這一樣、當場套完。回 false＝選不下去（`canTakeBlessing` 不過），什麼都沒動。
 * `notes`／`gains` 跟事件一樣，給畫面講「實際發生了什麼」（隨機拿到哪件秘寶、擲出幾點……）。
 */
export function takeBlessing(run: RunState, seat: number, i: number, pick: BlessPick = {},
  notes?: string[], gains?: RunGain[]): boolean {
  if (!canTakeBlessing(run, seat, i, pick)) return false;
  const p = me(run, seat);
  const def = offeredBlessing(run, seat, i)!;
  const hero = heroOf(p);
  const name = (c: CardInstance | CardDef): string => {
    const d = 'uid' in c ? cardById[c.cardId] : c;
    return d ? cardNameFor(d, hero) : ('uid' in c ? c.cardId : c.id);
  };
  withBranchRng(run, `${run.seed}|bless|${seat}|fx`, () => {
    // 空的寶盒：先交出起始秘寶（照 `loseRelicId` 還原最大生命與忍具格），再拿塔主秘寶
    const starter = def.loseStarter ? p.relics.find((id) => relicById[id]?.pool === '起始') : undefined;
    const fx: RunEffect[] = [...(starter ? [{ kind: 'loseRelicId', id: starter } as const] : []), ...def.effects];
    applyRunEffects(run, fx, notes, gains, seat);
    if (def.dice) {
      const face = runRng(run).int(1, 6);
      notes?.push(`擲出 ${face} 點`);
      const tier = def.dice.find((t) => face <= t.max);
      if (tier) applyRunEffects(run, tier.effects, notes, gains, seat);
    }
    const pk = def.pick;
    if (pk?.kind === 'choose') {
      const got = blessChoices(run, seat, def.id).find((c) => c.id === pick.c);
      if (got) { addCard(run, got.id, !!pk.upgraded, seat); notes?.push(`學會了「${name(got)}${pk.upgraded ? '＋' : ''}」`); }
    } else if (pk) {
      const picked = (pick.u ?? []).map((uid) => p.deck.find((c) => c.uid === uid)!).filter(Boolean);
      if (pk.kind === 'transform') {
        for (const c of picked) {
          const before = name(c);
          const next = transformCard(run, c, seat);
          if (next) notes?.push(`「${before}」換成了「${name(next)}」`);
        }
      } else if (picked.length) {
        const names = picked.map((c) => name(c));
        for (const c of picked) {
          if (pk.kind === 'remove') removeCard(run, c.uid, seat); else upgradeCard(run, c.uid, seat);
        }
        notes?.push(`「${names.join('」「')}」${pk.kind === 'remove' ? '被丟掉了' : '升級了'}`);
      }
    }
  });
  p.bless = { offer: p.bless!.offer, took: def.id };
  return true;
}
