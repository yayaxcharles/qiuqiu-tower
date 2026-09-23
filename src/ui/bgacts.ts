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
export const SLIDES_BY_ACT = [
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
  /**
   * **過關幻燈片不列進來了**（2026-09-11）。
   *
   * 原本算進該關的鍵，好讓第二、三關那幾張歸分關載入；但第一關那三張因此留在首載、
   * 白佔 121 KB——玩家要打完整整十五層才看得到。
   * 現在改成「推開關主門的那一刻才載」（`screens/bossdoor.ts` 呼叫 `warmSlides`）：
   * 門會停在那裡等你點，載完綽綽有餘，而且一關只會遇到一次。
   * 三關的幻燈片因此全部離開首載。
   */
  /*
   * 事件主圖**不在這裡了**（2026-09-23 內容擴充 0-2）。2026-09-11 起照 `acts` 分關，
   * 可是沒標 `acts` 的三十張每一關都排得到、全留在首載（約 0.9 MB），每加一篇三關共用的事件又多 27 KB。
   * 現在改成「這張地圖上真的排到的那幾格」才抓（`preload.ts` 的 `preloadMapEvents`，地圖畫面出來就叫），
   * 開場與進關都不載；名單見下面的 `eventMainKeys`。
   */
  for (const base of SCREEN_BASES) {
    const stem = `bg/${base}${SCREEN_SUFFIX[i]}`;
    if (SCREEN_BC.has(base)) for (const v of BG_VARIANTS) keys.push(`${stem}${v}`);
    else keys.push(stem);
  }
  return keys;
}

/**
 * 每篇事件的主圖鍵（球球那張 `bg/event_<id>`；角色版 `bg/event_<角色>_<id>` 在 `assets.ts` 的 `heroArtUrls` 換回這個鍵比對）。
 *
 * 全部照地圖現抓（`preload.ts` 的 `preloadMapEvents`），開場的 `preloadArt`、選角的 `heroArtUrls`、
 * 進關的 `preloadAct` 都不碰（2026-09-23 0-2）。結果圖（`_r<n>`）本來就是點到才載，不在這裡。
 * 紙箱畫面借用的 `bg/event_chest_*` 不是事件、不在名單裡，照舊開場就載。
 */
export function eventMainKeys(): string[] {
  return events.map((e) => `bg/event_${e.id}`);
}

/**
 * 畫面自己用、不是 `EventDef` 的事件類主圖（2026-09-23 內容擴充第三批）：鍵照事件圖的命名（`bg/event_<代號>`、角色版 `bg/event_<角色>_<代號>`），
 * 走 `eventArtKey` 挑這一位的版本。**開場不載**（併進 `deferredBgKeys`），用到的畫面自己在背景抓：
 * 祝福主圖由 `preload.ts` 的 `warmBlessing` 在序章播放時抓。`tools/dump_monster_acts.test.ts` 把它們記成 0（不算首載），
 * `tools/manifest_hygiene.test.ts` 認得它們不是孤兒。之後的問號格三種也可以加在這裡。
 */
export const NON_EVENT_ART: readonly string[] = ['bless_bundle'];

/**
 * 開場可以先不載的底圖：第二、三關才會用到、第一關碰不到的那些。
 *
 * 用「二三關的鍵減掉第一關的鍵」算，不是寫死一份名單——
 * 變體圖沒生齊時 `actVariantKey` 會退回第一關那張，那張本來就在首載裡，
 * 這樣減下來自然不會把它誤判成可延後（寫死名單就會）。
 */
export function deferredBgKeys(): Set<string> {
  const first = new Set(bgKeysForAct(1));
  /**
   * **三關的過關幻燈片全部延後**（2026-09-11）。
   *
   * 它們已經不在任何一關的 `bgKeysForAct` 裡（改由關主門那一刻載，見上面的說明），
   * 所以那個「二三關減第一關」的減法抓不到它們——不特別加進來的話，
   * 開場的 `preloadArt` 會把三關八張全部載好載滿，等於白改。
   */
  const slides = SLIDES_BY_ACT.flat();
  // 事件主圖同理：不在任何一關的清單裡，不併進來的話開場會照舊整包載（2026-09-23 0-2）
  // 不是事件的事件類主圖（祝福主圖，2026-09-23 第三批）同理，用到的畫面自己抓
  const screenArt = NON_EVENT_ART.map((id) => `bg/event_${id}`);
  return new Set([...bgKeysForAct(2), ...bgKeysForAct(3), ...slides, ...eventMainKeys(), ...screenArt].filter((k) => !first.has(k)));
}
