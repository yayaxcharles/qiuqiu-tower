/**
 * 哪一關會用到哪幾張底圖——純算鍵名，不碰 manifest、不碰畫面，所以誰都能引用、不會繞成循環。
 *
 * 為什麼要分關：底圖有三分之一是「第二關的木造」「第三關的夜空石台」那種變體，
 * 第一關一輩子看不到，卻在開場就全部下載＋解碼（`preloadArt`）。魔物立繪早就分關載了
 * （`preload.ts`），底圖沒跟上，那 18 張加起來 0.54 MB 白白算進首載預算。
 *
 * 三處共用這裡的算法：`screenbg.ts`（挑圖）、`assets.ts`（開場預載跳過二三關的）、
 * `preload.ts`（過關時補載）。改關數規則只改這一個檔。
 */

import { events } from '../content/events';

/** 每個關卡色調有三張，用樓層輪著挑（見 `screenbg.ts` 的 `tierBgKey`） */
export const BG_VARIANTS = ['', '_b', '_c'] as const;

/** 一關一個色調：塔下石牢、塔中木造、塔頂夜空石台 */
const TIER_BY_ACT = ['low', 'mid', 'top'] as const;

/**
 * **打完這一關才會看到的幻燈片**（過關三張、第三關是結局兩張）。
 *
 * 算進該關的鍵，是為了讓第二、三關那幾張歸「分關載入」——共 250 KB，
 * 第一關的玩家要打好幾十分鐘才看得到，卻在開場就下載＋解碼（首載預算只剩 1.2%，這一刀就夠用）。
 *
 * **時機是安全的**：`preloadAct(N)` 在**進入第 N 關時**就跑（過關畫面呼叫 `preloadAct(act + 1)`），
 * 而這幾張要到你**打完**第 N 關才播——中間隔著一整關十五層，來得及。
 *
 * 序幕那四張（`still_teach`／`still_corrupt`／`still_rush`／`still_depart`）不在這裡：
 * 那是開新局第一秒就播的，必須留在首載。
 */
const SLIDES_BY_ACT = [
  ['bg/still_act1_stairs', 'bg/still_act1_fish', 'bg/still_act1_climb'],
  ['bg/still_act2_smoke', 'bg/still_act2_voice', 'bg/still_act2_moonstairs'],
  ['bg/still_embrace', 'bg/still_home'],   // 打贏第三關＝結局
] as const;

/** 會跟著關數換皮的節點畫面底圖（`actVariantKey` 加 `_mid`／`_top`） */
const SCREEN_BASES = ['map_tall', 'screen_chest', 'screen_event', 'screen_rest', 'screen_shop'] as const;
const SCREEN_SUFFIX = ['', '_mid', '_top'] as const;
/**
 * 關內還有第二、三款的那幾個（2026-09-10 生了 18 張）。`actVariantKey` 會照樓層輪著挑，
 * 所以這幾個的三款**都要預載**——只載第一款的話，走到輪到 `_b` 的樓層才現抓，那張就會慢半拍冒出來。
 * 地圖底圖與事件插圖沒做關內變體（事件是一事件一張，本來就不共用），維持一關一張。
 */
const SCREEN_BC = new Set<string>(['screen_chest', 'screen_rest', 'screen_shop']);

/** 這一關會用到的底圖鍵（manifest.bg 的鍵）。關主戰場 `boss<關數>` 也算 */
export function bgKeysForAct(act: number): string[] {
  const i = Math.min(Math.max(act, 1), 3) - 1;
  const keys = BG_VARIANTS.map((v) => `bg/${TIER_BY_ACT[i]}${v}`);
  keys.push(`bg/boss${i + 1}`);
  // 關主戰前那扇門也是一關一扇（稽核 2026-09-10 中-1）：沒列進來的話三扇全算首載，
  // 第二、三關那兩扇 65 KB 是白背的——第一關的玩家一輩子看不到。
  // 「二三關減一關」的減法會自己把 act1 那扇留在首載、另外兩扇歸分關載入，不用另外列白名單。
  keys.push(`bg/door_act${i + 1}`);
  for (const k of SLIDES_BY_ACT[i]!) keys.push(k);
  /**
   * **事件插圖也照 `acts` 分關**（2026-09-11）。
   *
   * 事件畫面靠事件編號自己找圖（`bg/event_<id>`），所以插圖從來沒被算進分關規則，
   * 三十八張全擠在首載——其中七張標了 `acts: [2, 3]`，第一關的地圖根本排不出那些事件
   *（`engine/map.ts` 的 `eventQueue` 就是照 `acts` 濾的），卻在開場就下載＋解碼，白佔 297 KB。
   *
   * 沒標 `acts` 的（大多數）每一關都排得到，照樣留在首載；
   * 後集事件（`requiresFlag`）不特別處理——它的旗標是前集留下的、可能同一關就觸發，
   * 而且那幾張本來就標了 `acts`，走這一條就夠。
   * 下面 `deferredBgKeys` 的「二三關減第一關」會自動把每一關都排得到的那些留在首載。
   */
  for (const e of events) if (!e.acts || e.acts.includes(i + 1)) keys.push(`bg/event_${e.id}`);
  for (const base of SCREEN_BASES) {
    const stem = `bg/${base}${SCREEN_SUFFIX[i]}`;
    if (SCREEN_BC.has(base)) for (const v of BG_VARIANTS) keys.push(`${stem}${v}`);
    else keys.push(stem);
  }
  return keys;
}

/**
 * 開場可以先不載的底圖：第二、三關才會用到、第一關碰不到的那些。
 *
 * 用「二三關的鍵減掉第一關的鍵」算，不是寫死一份名單——
 * 變體圖沒生齊時 `actVariantKey` 會退回第一關那張，那張本來就在首載裡，
 * 這樣減下來自然不會把它誤判成可延後（寫死名單就會）。
 */
export function deferredBgKeys(): Set<string> {
  const first = new Set(bgKeysForAct(1));
  return new Set([...bgKeysForAct(2), ...bgKeysForAct(3)].filter((k) => !first.has(k)));
}
