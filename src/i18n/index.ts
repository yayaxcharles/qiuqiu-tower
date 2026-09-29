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
  /** 台詞（劇情、吐槽、魔物台詞、幻燈片）：畫面上最後那句中文（換過角色之後的） → 譯文 */
  line: Readonly<Record<string, string>>;
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
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant-TW' : lang;   // 跟 index.html 原本寫的一樣
}

/**
 * 換語言：先把包載好才切，載不到就留在原本的語言（丟出例外給呼叫端講）。
 * `remember`＝寫進這台裝置（封面選語系時）；開場讀回來套用時不必再寫一次。
 */
let switchSeq = 0;
export async function setLang(next: Lang, remember = true): Promise<void> {
  const seq = ++switchSeq;
  const p = next === 'zh' ? null : (await loaders[next]()).default;
  // 載的時候又點了別的語言：以最後點的為準，慢到的那一包作廢（不然先點慢的、再點快的，最後會停在慢的那個）
  if (seq !== switchSeq) return;
  lang = next;
  pack = p;
  version++;
  applyDocLang();
  if (remember) { try { window.localStorage.setItem(STORE_KEY, next); } catch { /* 存不了就只這次有效 */ } }
}

/** 繁中的底子（牌面產生器、名詞說明）：任何語言都要，開場載一次（`./zh.ts`） */
type ZhBase = typeof import('./zh').default;
let zh: ZhBase | null = null;
export async function loadZhBase(): Promise<void> {
  if (zh) return;
  // 載不到就丟例外往上（瀏覽器對同一個網址失敗過會快取失敗，原地重抓沒用）：開場那邊接住、顯示「載入失敗、請重新整理」（`main.ts` 的 `showBootError`）
  zh = (await import('./zh')).default;
}

/**
 * 開場叫一次：載繁中底子，再照這台裝置存的語言載包。
 * 語言包載不到（斷網）就先用繁中，不擋開場；繁中底子載不到就真的開不了（牌面要用），讓例外往上丟。
 */
export async function initLang(): Promise<void> {
  const want = storedLang();
  await Promise.all([loadZhBase(), want === 'zh' ? null
    : setLang(want, false).catch(() => { lang = 'zh'; pack = null; })]);
  applyDocLang();
}

/** 牌面規則文字（照目前語言；繁中用底子裡的產生器）。底子還沒載好時回空字串 */
export function describeCardText(def: CardDef, upgraded: boolean, plays = 0): string {
  return pack?.describeCard(def, upgraded, plays) ?? zh?.describeCard(def, upgraded, plays) ?? '';
}
/** 繁中名詞說明表（提示框的名詞清單以它為準） */
export function zhGlossary(): Readonly<Record<string, string>> { return zh?.glossary ?? {}; }

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

/** 只是標記「這句要翻」（給缺譯掃描看），原樣回傳；模組層的表用這個，真正顯示時再 `t(x)`（模組載入時語言包還沒到） */
export const N_ = (zh: string): string => zh;

/** 「中文當代號」的詞（狀態、關鍵字、節點種類、角色名…） */
export function term(zh: string): string {
  return pack?.term[zh] ?? zh;
}

/** 名詞說明（目前語言；缺譯退回繁中）；查無此詞回 undefined */
export function glossText(zhTerm: string): string | undefined {
  return pack?.gloss[zhTerm] ?? zh?.glossary[zhTerm];
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
/** 一句台詞（鍵是畫面上最後那句中文；缺譯退回介面文字表，再退回中文） */
export function lineL(zh: string): string { return pack ? (pack.line[zh] ?? pack.ui[zh] ?? zh) : zh; }
/** 說話者的名字（角色、店主、旁白這類代號詞；魔物名由呼叫端先換） */
export function speakerL(zh: string): string { return pack ? (pack.term[zh] ?? pack.line[zh] ?? zh) : zh; }

/** 幾個子句接成一句（中文用「，」） */
export function clauseJoin(items: readonly string[]): string {
  return items.join(lang === 'en' ? ', ' : lang === 'ja' ? '、' : '，');
}

/** 中文的標點與連接詞在其他語言要換掉的幾個（清單接起來時用） */
export function listJoin(items: readonly string[]): string {
  return items.join(lang === 'en' ? ', ' : lang === 'ja' ? '・' : '、');
}
