import { cards } from '../content/cards';
import type { CardDef, RunPlayer } from './types';

/**
 * 職業（2026-09-05 拍板）。同一隻球球的兩種打法，不是兩個角色。
 *
 * - `ninja`：現況。靠隱身與潛水閃掉傷害，蜷縮每回合重新賺、回合末歸零＝流動防禦。
 * - `samurai`：穿重甲。沒有任何閃避手段，改用「甲」硬吃——甲不歸零、被打永久扣，
 *   整場就那些，得規劃著用（見 `PlayerCombat.armour` 與 `damagePlayer` 的受傷順序）。
 * - `feifei`：**不是球球**，是球球的師妹、一隻暹羅貓（2026-09-12）。丟毒暗器，
 *   防禦是「距離」不是「擋」——站得遠打得痛、被打到就被逼近（見 `PlayerCombat.range`）。
 *
 * 分流深度是**中分流**：大部分牌共用，各自有一批獨占牌（`CardDef.hero`）。
 */
export type Hero = 'ninja' | 'samurai' | 'feifei';

/**
 * 合法的職業清單。**存檔驗證要用這一份，不要在別的檔案再手寫一次**。
 *
 * 2026-09-12 稽核抓到：`save.ts` 的 `usablePlayer` 寫死了 `'ninja' | 'samurai'`，
 * 加了菲菲之後沒跟著改——選她開一局、關掉分頁，下次打開「續玩」是灰的，
 * 而且**存檔是真的被刪掉**（驗不過 → `checkRun` 回 null → `loadRun` 呼叫 `clearSave()`），
 * 回到標題就會發生。共用一份之後，加第四個角色不會再漏。
 */
export const HEROES: readonly Hero[] = ['ninja', 'samurai', 'feifei'];

/**
 * 這一位的職業。沒寫＝忍者。
 *
 * 連線版之後職業是**每個人各自的**（規則一那一批的自然結果），所以收的是
 * 一位玩家而不是整局。兩個人各玩各的職業也就順便成立了。
 */
export function heroOf(p: Pick<RunPlayer, 'hero'>): Hero {
  return p.hero ?? 'ninja';
}

/**
 * 畫面上叫他什麼。
 *
 * 忍者與武士是**同一隻球球**的兩種打法，所以都叫「球球」；
 * 菲菲是另一隻貓（球球的師妹），名字必須不一樣——不然連線時兩格都寫「球球」，
 * 玩家根本分不出哪一格是誰。
 */
const HERO_NAME: Readonly<Record<Hero, string>> = { ninja: '球球', samurai: '球球', feifei: '菲菲' };
export function heroName(p: Pick<RunPlayer, 'hero'> | undefined): string {
  return HERO_NAME[heroOf(p ?? {})];
}

/**
 * 戰報裡該叫他什麼。
 *
 * 引擎本來整排寫死「球球」，換角色之後菲菲打牌會印成「球球打出『退開』」
 *（2026-09-12 實機測到）。收在這裡是因為 `PlayerCombat` 拿不到 `RunPlayer`，
 * 但兩邊的 `hero` 欄位長一樣。
 */
export function unitName(p: { hero?: Hero } | undefined): string {
  return HERO_NAME[p?.hero ?? 'ninja'];
}

/**
 * 這個職業的起始秘寶。球球是藍頭巾（第一回合多抽一張），菲菲是後撤步（開場距離 +1）。
 */
export function startRelicFor(hero: Hero): string {
  return hero === 'feifei' ? 'backstep' : 'blue_headband';
}

/**
 * 開場的距離。只有菲菲有（設計稿：開場 1，起始秘寶「後撤步」再 +1 變成 2）。
 *
 * 其他職業永遠是 0，所以距離那一條在畫面上也不顯示、那些效果也推不動。
 */
export function startRange(hero: Hero | undefined): number {
  return hero === 'feifei' ? 1 : 0;
}

/** 這個職業拿得到的牌：沒標 `hero` 的是共用，標了的只有那個職業拿得到。 */
export function cardsForHero(hero: Hero): CardDef[] {
  return cards.filter((c) => !c.hero || c.hero === hero);
}

/**
 * 這張牌**現在這一局**開得到嗎——獎勵、罐頭鋪、事件全部問這一支。
 *
 * 抽成一支共用的判準是刻意的：同一條規則散在四個地方各寫一次，
 * 遲早會有人只改了三個（這一批的稽核就抓到過同型的問題）。
 *
 * 三道關卡：
 * - `combatOnly`：魔物塞牌用的雜牌（黏液、眼冒金星），任何池子都不進
 * - `hidden`：插圖還沒生好，圖到齊由生圖腳本拿掉旗標
 * - `hero`：職業獨占。不濾的話武士會開出隱身牌，但他整套機制裡根本沒有隱身
 * - `coop`：連線專用牌，**只有兩個人以上的局才進池**（使用者 2026-09-11 指定）
 */
export function pickable(c: CardDef, hero: Hero, players = 1): boolean {
  if (c.combatOnly || c.hidden) return false;
  if (c.hero && c.hero !== hero) return false;
  if (c.coop && players < 2) return false;
  return true;
}
