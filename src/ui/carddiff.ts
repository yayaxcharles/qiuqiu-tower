/**
 * 升級前後牌面差在哪（從 `cardtext.ts` 搬出來，2026-09-29 多語系）：牌面文字照目前的語言算，
 * 繁中的產生器改成開場時跟語言包一起載（`src/i18n/zh.ts`），首載程式才塞得下英日的架構。
 */
import type { CardDef, Effect } from '../engine/types';
import { describeCardText, langVersion } from '../i18n';
/**
 * 升級版牌面跟沒升級版比起來，動了哪些地方。
 *
 * 玩家的原話：「才知道升級跟沒升級牌的差異」。升級大多只動一兩個數字（造成 6→9 點傷害），
 * 兩張牌並排看還是得逐字比對才找得出差在哪，所以直接把改掉的字標色。
 *
 * `changed`＝升級版文字裡跟原版不一樣的字元位置（標色用）。
 * `removed`＝升級後被拿掉的句子。有三張牌的升級**只是刪東西**（出大事了少掉自傷、踏雪無痕
 * 少掉消耗、催噎少掉那句括號），這種差異在升級版牌面上根本沒有位置可以標色，
 * 光看牌面完全看不出升級了什麼，所以另外撈出來給升級預覽掛在標籤上講。
 *
 * 兩者都用最長共同子序列對齊兩段文字算出來：沒對到的字，在升級版那側就是新增或改動、
 * 在原版那側就是被拿掉的。牌面文字最長六十來字，這個對齊算得很快。
 */
export interface UpgradeDiff {
  changed: ReadonlySet<number>;
  removed: readonly string[];
}

const EMPTY_DIFF: UpgradeDiff = { changed: new Set(), removed: [] };
const diffCache = new Map<string, UpgradeDiff>();

/** 這張牌的文字會不會隨「這場打過幾次」變（只有分身術這種成長牌會）——決定快取要不要把次數算進去 */
function textVariesWithPlays(def: CardDef): boolean {
  const has = (fx: readonly Effect[] | undefined): boolean =>
    (fx ?? []).some((e) => e.kind === 'damageRamp' || (e.kind === 'status' && !!e.step));
  return has(def.effects) || has(def.upgrade.effects);
}

export function upgradeDiff(def: CardDef, plays = 0): UpgradeDiff {
  // 只有成長牌的文字會隨打出次數變，其他牌把次數放進 key 只會讓同一份結果存好幾份
  const key = `${langVersion()}|` + (textVariesWithPlays(def) ? `${def.id}|${plays}` : def.id);
  const hit = diffCache.get(key);
  if (hit) return hit;
  const base = describeCardText(def, false, plays);
  const up = describeCardText(def, true, plays);
  if (base === up) { diffCache.set(key, EMPTY_DIFF); return EMPTY_DIFF; }

  const n = base.length;
  const m = up.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = base[i] === up[j]
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const changed = new Set<number>();
  const dropped: number[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base[i] === up[j]) { i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { dropped.push(i); i++; }
    else { changed.add(j); j++; }
  }
  for (; i < n; i++) dropped.push(i);
  for (; j < m; j++) changed.add(j);

  // 數字整串一起標：15→25 只有十位變，逐字比對會標成「[2]5」，
  // 一個數字半紅半黑很難讀，所以只要某一位變了就整串都算改過。
  for (let a = 0; a < m; a++) {
    if (!/\d/.test(up[a] ?? '')) continue;
    let b = a;
    while (b + 1 < m && /\d/.test(up[b + 1] ?? '')) b++;
    let hitDigit = false;
    for (let k = a; k <= b; k++) if (changed.has(k)) { hitDigit = true; break; }
    if (hitDigit) for (let k = a; k <= b; k++) changed.add(k);
    a = b;
  }

  const diff: UpgradeDiff = { changed, removed: removedPhrases(base, dropped) };
  diffCache.set(key, diff);
  return diff;
}

/** 升級版牌面文字裡「跟沒升級不一樣」的字元位置（標色用） */
export function upgradedChangedChars(def: CardDef, plays = 0): ReadonlySet<number> {
  return upgradeDiff(def, plays).changed;
}

/**
 * 把「原版有、升級版沒有」的字元位置串成人看得懂的句子。
 *
 * 逐字比對出來的位置常常是零散的（對齊時中間夾了幾個共用字），所以只留連續三字以上的整段，
 * 再把兩端的標點與連接詞修掉——「，自己獲得 1 層翻肚」要變成「自己獲得 1 層翻肚」才唸得順。
 * 修完剩不到兩個字的（只是標點差異）就丟掉，不然標籤上會冒出「。」這種沒意義的東西。
 */
function removedPhrases(base: string, dropped: readonly number[]): string[] {
  const out: string[] = [];
  let k = 0;
  while (k < dropped.length) {
    let e = k;
    while (e + 1 < dropped.length && dropped[e + 1] === dropped[e]! + 1) e++;
    const from = dropped[k]!;
    const to = dropped[e]! + 1;
    if (to - from >= 3) {
      const phrase = base.slice(from, to).replace(/^[，。；、（）,.;()\s]+/, '').replace(/[，。；、（）,.;()\s]+$/, '');
      if (phrase.length >= 2) out.push(phrase);
    }
    k = e + 1;
  }
  return out;
}

