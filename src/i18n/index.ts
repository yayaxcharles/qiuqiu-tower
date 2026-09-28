/**
 * 多語系（2026-09-29 第一片）：繁中／English／日本語。
 *
 * **鍵就是中文原句**（gettext 的做法）：畫面程式照舊寫中文，外面包一層 `t('新的一局')`。
 * - 繁中不必載任何語言包，`t()` 直接回原句——缺譯時自動退回中文也是同一條路。
 * - 英文、日文的語言包是延後載入的一包（`./en`、`./ja`），開場前載好（`initLang`），之後 `t()` 都是同步的。
 * - 中文原句改了，舊譯文就對不上、退回中文，缺譯掃描（`tests/i18n/missing_keys.test.ts`）會抓到。
 *
 * 牌、秘寶、忍具、魔物照 **id** 查（中文名留在牌表裡當正本），狀態、關鍵字、節點種類這些「中文當代號」的詞照 `term()` 查。
 * **只有畫面用**：引擎、連線送出去的永遠是代號與中文原值，不送翻過的字（兩台可以各用各的語言）。
 */
import type { CardDef, Effect } from '../engine/types';

export type Lang = 'zh' | 'en' | 'ja';
export const LANGS: readonly { code: Lang; label: string }[] = [
  { code: 'zh', label: '繁中' }, { code: 'en', label: 'English' }, { code: 'ja', label: '日本語' },
];

/** 一個語言包的長相（英文、日文各一份，`src/i18n/<lang>/index.ts`） */
export interface LangPack {
  /** 畫面文字：中文原句 → 譯文。可帶 `{名稱}` 參數；`{n|card|cards}` 依 n 是不是 1 挑單複數 */
  ui: Readonly<Record<string, string>>;
  /** 「中文當代號」的詞：狀態、關鍵字、節點、稀有度、牌型、角色名… */
  term: Readonly<Record<string, string>>;
  /** 名詞說明（中文詞 → 譯文說明），提示框用 */
  gloss: Readonly<Record<string, string>>;
  /** 牌名：id → 名字；某位角色有專屬牌名時是 `角色:id` */
  card: Readonly<Record<string, string>>;
  relic: Readonly<Record<string, readonly [string, string]>>;
  potion: Readonly<Record<string, readonly [string, string]>>;
  enemy: Readonly<Record<string, string>>;
  /** 魔物招式名：中文招式名 → 譯文 */
  move: Readonly<Record<string, string>>;
  /** 牌面規則文字的產生器（每個語言一套規則，不是逐句翻） */
  describeCard(def: CardDef, upgraded: boolean, plays: number): string;
  /** 單一條效果（能力牌掛在身上時的說明用） */
  describeEffects?(effects: readonly Effect[]): string;
}

const STORE_KEY = 'qiuqiu.lang';
let lang: Lang = 'zh';
let pack: LangPack | null = null;

const loaders: Record<Exclude<Lang, 'zh'>, () => Promise<{ default: LangPack }>> = {
  en: () => import('./en/index'),
  ja: () => import('./ja/index'),
};

function isLang(v: unknown): v is Lang { return v === 'zh' || v === 'en' || v === 'ja'; }

/** 這台裝置存的語言（沒存過＝繁中）。無痕視窗碰 localStorage 會丟例外，一律當沒存 */
export function storedLang(): Lang {
  try {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(STORE_KEY) : null;
    return isLang(v) ? v : 'zh';
  } catch { return 'zh'; }
}

export function getLang(): Lang { return lang; }
/** 目前的語言包（繁中是 null） */
export function currentPack(): LangPack | null { return pack; }

function applyDocLang(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : lang;
}

/**
 * 換語言：先把包載好才切，載不到就留在原本的語言（丟出例外給呼叫端講）。
 * `remember`＝寫進這台裝置（封面選語系時）；開場讀回來套用時不必再寫一次。
 */
export async function setLang(next: Lang, remember = true): Promise<void> {
  const p = next === 'zh' ? null : (await loaders[next]()).default;
  lang = next;
  pack = p;
  version++;
  applyDocLang();
  if (remember) { try { window.localStorage.setItem(STORE_KEY, next); } catch { /* 存不了就只這次有效 */ } }
}

/** 開場叫一次：照這台裝置存的語言載包。載不到（斷網）就先用繁中，不擋開場 */
export async function initLang(): Promise<void> {
  const want = storedLang();
  if (want === 'zh') { applyDocLang(); return; }
  try { await setLang(want, false); } catch { lang = 'zh'; pack = null; applyDocLang(); }
}

/** 測試用：直接塞一個包 */
export function _setPackForTest(next: Lang, p: LangPack | null): void { lang = next; pack = p; version++; }

/** 每換一次語言加一，給「照語言快取」的地方當鍵 */
let version = 0;
export function langVersion(): number { return version; }

/** 把 `{名稱}` 換成參數；`{n|單數|複數}` 依 n 是不是 1 挑一個 */
export function format(s: string, params?: Readonly<Record<string, string | number>>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (m, k: string, one?: string, other?: string) => {
    const v = params[k];
    if (v === undefined) return m;
    if (one !== undefined) return Number(v) === 1 ? one : (other ?? one);
    return String(v);
  });
}

/** 畫面文字。`zh` 是中文原句（也是鍵）；缺譯就回中文 */
export function t(zh: string, params?: Readonly<Record<string, string | number>>): string {
  return format(pack?.ui[zh] ?? zh, params);
}

/** 「中文當代號」的詞（狀態、關鍵字、節點種類、角色名…） */
export function term(zh: string): string {
  return pack?.term[zh] ?? zh;
}

/** 名詞說明；缺譯回 undefined（呼叫端退回中文說明） */
export function glossText(zhTerm: string): string | undefined {
  return pack?.gloss[zhTerm];
}

const RARITY_ZH = { common: '常見', uncommon: '罕見', rare: '稀有' } as const;
const TYPE_ZH = { attack: '攻擊', skill: '技能', power: '能力' } as const;
export function rarityLabel(r: keyof typeof RARITY_ZH): string { return term(RARITY_ZH[r]); }
export function cardTypeLabel(ty: keyof typeof TYPE_ZH): string { return term(TYPE_ZH[ty]); }

/** 牌名：`zhName` 是牌表（含角色專屬改名）算出來的中文名 */
export function cardNameL(def: CardDef, hero: string | undefined, zhName: string): string {
  if (!pack) return zhName;
  return pack.card[`${hero ?? 'ninja'}:${def.id}`] ?? pack.card[def.id] ?? zhName;
}
export function relicNameL(id: string, zh: string): string { return pack?.relic[id]?.[0] ?? zh; }
export function relicTextL(id: string, zh: string): string { return pack?.relic[id]?.[1] ?? zh; }
export function potionNameL(id: string, zh: string): string { return pack?.potion[id]?.[0] ?? zh; }
export function potionTextL(id: string, zh: string): string { return pack?.potion[id]?.[1] ?? zh; }
export function enemyNameL(id: string, zh: string): string { return pack?.enemy[id] ?? zh; }
export function moveLabelL(zh: string): string { return pack?.move[zh] ?? zh; }

/** 中文的標點與連接詞在其他語言要換掉的幾個（清單接起來時用） */
export function listJoin(items: readonly string[]): string {
  return items.join(lang === 'en' ? ', ' : lang === 'ja' ? '・' : '、');
}
