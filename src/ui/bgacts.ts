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

/** 每個關卡色調有三張，用樓層輪著挑（見 `screenbg.ts` 的 `tierBgKey`） */
export const BG_VARIANTS = ['', '_b', '_c'] as const;

/** 一關一個色調：塔下石牢、塔中木造、塔頂夜空石台 */
const TIER_BY_ACT = ['low', 'mid', 'top'] as const;

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
