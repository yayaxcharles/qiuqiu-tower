import { cards } from '../content/cards';
import type { CardDef, RunPlayer } from './types';

/**
 * 職業（2026-09-05 拍板）。同一隻球球的兩種打法，不是兩個角色。
 *
 * - `ninja`：現況。靠隱身與潛水閃掉傷害，蜷縮每回合重新賺、回合末歸零＝流動防禦。
 * - `samurai`：穿重甲。沒有任何閃避手段，改用「甲」硬吃——甲不歸零、被打永久扣，
 *   整場就那些，得規劃著用（見 `PlayerCombat.armour` 與 `damagePlayer` 的受傷順序）。
 * - `feifei`：**不是球球**，是球球的師妹、一隻暹羅貓（2026-09-12）。丟毒暗器，
 *   路數是**毒＋攻擊自帶蜷縮**：她的攻擊牌大多同時給幾點擋，不用在打與擋之間二選一，
 *   傷害低但毒會滾（原本設計過一套「距離」機制，2026-09-12 整個拆掉了）。
 * - `dangdang`：**第三隻貓**（2026-09-17），黑白賓士、村口修東西的工匠，走硬碰硬的護衛路數。
 *   **他跟大俠貓不是師徒**（2026-09-17 稽核 高-2：這裡本來寫「球球的師弟」，是錯的）。
 *   球球喊「師父」、菲菲喊「師父」與「師兄」，他只喊「大俠貓」——村裡的鄰居。
 *   他上塔的理由也不同：不是「把師父帶回家」，是「他村裡還有人等著」。
 *   這一行是查角色設定最先讀到的地方，寫錯會被後面每一場會話沿用，所以特別註明。
 *   路數是**蜷縮當彈藥**：蜷縮既是防禦也是攻擊的本錢，出招會把它消耗掉，
 *   所以每一張牌都在問「現在要打還是要留」；另一條路是反彈——不被消耗，挨打才回敬。
 *   刻意跟菲菲相反：她攻擊自帶蜷縮、不用選，他非選不可（見 `Effect` 的 `damageSpendBlock`）。
 *
 * 分流深度是**中分流**：大部分牌共用，各自有一批獨占牌（`CardDef.hero`）。
 */
export type Hero = 'ninja' | 'samurai' | 'feifei' | 'dangdang' | 'fengfeng';

/**
 * 合法的職業清單。**存檔驗證要用這一份，不要在別的檔案再手寫一次**。
 *
 * 2026-09-12 稽核抓到：`save.ts` 的 `usablePlayer` 寫死了 `'ninja' | 'samurai'`，
 * 加了菲菲之後沒跟著改——選她開一局、關掉分頁，下次打開「續玩」是灰的，
 * 而且**存檔是真的被刪掉**（驗不過 → `checkRun` 回 null → `loadRun` 呼叫 `clearSave()`），
 * 回到標題就會發生。共用一份之後，加第四個角色不會再漏。
 */
export const HEROES: readonly Hero[] = ['ninja', 'samurai', 'feifei', 'dangdang', 'fengfeng'];

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
const HERO_NAME: Readonly<Record<Hero, string>> = { ninja: '球球', samurai: '球球', feifei: '菲菲', dangdang: '噹噹', fengfeng: '封封' };
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
 * 畫面上該用「他」還是「她」（2026-09-13 第三輪稽核 中-3）。
 *
 * 連線的兩句話寫死了「他」：「替他收回合」與扶人那格的「他回 N 點生命站起來」。
 * 對面坐的是菲菲時就成了性別錯字——同一個畫面上她的名字還寫著「菲菲」。
 * 選角畫面本來就在按鈕上做過這件事，只是當時寫在那一行裡沒收成共用的。
 *
 * 收在 `hero.ts` 的理由跟 `unitName` 一樣：`PlayerCombat` 拿不到 `RunPlayer`，
 * 但兩邊的 `hero` 欄位長一樣，這支兩種都吃得下。
 */
export function heroPronoun(p: { hero?: Hero } | undefined): string {
  return (p?.hero ?? 'ninja') === 'feifei' ? '她' : '他';
}

/**
 * 這個職業的起始秘寶。球球是藍頭巾（第一回合多抽一張），菲菲是毒針袋（每回合開始給所有魔物 1 層中毒）。
 */
export function startRelicFor(hero: Hero): string {
  if (hero === 'feifei') return 'backstep';
  if (hero === 'dangdang') return 'copper_bracer';
  if (hero === 'fengfeng') return 'old_sword_tassel';
  return 'blue_headband';
}

/**
 * 貓窩裡那個動作叫什麼（2026-09-12）。
 *
 * `'磨爪'` 是**引擎用的值**（`rest(run, '磨爪', uid)`、存檔、連線動作），不能改；
 * 這一支只換**畫面上寫的字**——她磨的是針不是爪子，按鈕寫「磨爪」跟她的台詞
 *「磨利一點，扎得淺也能把藥送進去」對不起來。
 */
export function sharpenVerb(hero: string | undefined): string {
  // 噹噹用的是銅護臂、不是爪子，而且他在貓窩講的話全是在喬站姿與接招
  //（`dialogue.ts` 的 `restSharpenLines`），按鈕寫「磨爪」跟他講的話對不上（稽核 2026-09-17 中-9）。
  // 寫成查表而不是再串一個三元式：第四隻貓進來只要加一格
  return SHARPEN_VERB[hero ?? ''] ?? '磨爪';
}
const SHARPEN_VERB: Readonly<Record<string, string>> = { feifei: '磨針', dangdang: '調護臂', fengfeng: '磨劍' };

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
  if ((c.hero === 'fengfeng' && c.pool === '起手') || c.combatOnly || c.hidden) return false;
  if (c.hero && c.hero !== hero) return false;
  if (c.coop && players < 2) return false;
  return true;
}
