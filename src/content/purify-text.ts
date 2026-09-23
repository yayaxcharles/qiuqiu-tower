/*
 * **淨化那幾句**（2026-09-23 內容擴充第三批，design3 6-5）：貓窩「點一炷清心香」的按鈕、點完的旁白、四隻各一句。
 * 畫面層不准寫「喵」（`tests/ui` 有守），球球那句放在這裡。玳瑁婆婆那裡淨化完也用同一句角色台詞（design3 6-5），
 * 婆婆自己那一句與按鈕也先放在這裡，給店主輪替那條線接（`engine/run.ts` 的 `purifyAtShop`）。
 * 字不多、貓窩畫面在主程式裡，所以跟著主程式走，不放延後載入的事件文字。
 */
export const PURIFY_REST_LABEL = '點一炷清心香（淨化 1 件沾了魔氣的秘寶）';
/** 按鈕下面那行灰字；`verb`＝這一位的磨爪（菲菲磨針、封封磨劍，`hero.ts` 的 `sharpenVerb`） */
export function purifyRestSub(verb: string): string { return `這一格就不能打盹或${verb}了`; }
export const PURIFY_NARRATION = '清心香的煙先是紫的，燒著燒著，變成了白的。';
const PURIFY_LINES: Readonly<Record<string, string>> = {
  ninja: '紫色的煙散掉了……這樣就乾淨了喵。',
  feifei: '煙一開始是紫的，後來變白了……師父身上的，也能這樣就好了。',
  dangdang: '魔氣燒掉了。東西還能用。',
  fengfeng: '乾淨了。這件可以放心帶著走。',
};
/** 淨化完這一位講的那一句（貓窩、婆婆都用） */
export function purifyLine(hero: string | undefined): string {
  return PURIFY_LINES[hero ?? 'ninja'] ?? PURIFY_LINES['ninja']!;
}
/** 玳瑁婆婆的按鈕（價錢由呼叫端帶 `PURIFY_PRICE`）與婆婆那一句 */
export function tortoisePurifyLabel(price: number): string { return `請婆婆淨化：${price} 條小魚乾`; }
export const TORTOISE_PURIFY_LINE = '拿來。那個大個子比這還髒的東西，婆婆都擦過。';
