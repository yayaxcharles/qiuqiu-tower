import { deferredBgKeys } from './bgacts';

export interface Manifest {
  cards: Record<string, string>;
  sprites: Record<string, string>;
  monsters: Record<string, { idle?: string; attack?: string; hurt?: string; block?: string }>;
  icons: Record<string, string>;
  bg: Record<string, string>;
  review: string[];
}

let manifest: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };

export const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 缺圖時的灰色剪影：清單還沒生好也不會出現破圖 */
const SILHOUETTE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="55" r="35" fill="#555"/><circle cx="30" cy="25" r="12" fill="#555"/><circle cx="70" cy="25" r="12" fill="#555"/></svg>');

export async function loadManifest(): Promise<void> {
  // 清單讀不到就整組退回剪影，不能讓遊戲開不起來
  try {
    const res = await fetch(`${BASE}assets/manifest.json`);
    if (res.ok) manifest = { ...manifest, ...(await res.json() as Partial<Manifest>) };
  } catch { /* 離線或檔案不在，忽略 */ }
}

export function _setManifestForTest(m: Manifest): void { manifest = m; }

export function artUrl(group: 'cards' | 'sprites' | 'icons' | 'bg', key: string): string {
  const rel = manifest[group][key];
  return rel ? `${BASE}${rel}` : SILHOUETTE;
}

/**
 * 球球全部姿勢的網址。開打前一起暖（`warmEncounter`）——換姿勢是直接換 `<img>` 的 `src`，
 * 圖還沒下載好會先畫成一片空白、載好才冒出來，看起來就是「角色突然消失再出現」
 *（使用者 2026-09-10 在剛部署完、整包圖都要重抓的那一次遇到）。
 * 直接讀清單而不是寫死名單：以後補新姿勢不會漏。
 */
const HERO_NOT_IN_COMBAT = new Set(['hero/cover', 'hero/idle', 'hero/armed']);
export function heroSpriteUrls(): string[] {
  // 排掉戰鬥裡永遠用不到的三張（稽核 2026-09-10 低-2）：`cover` 只有標題畫面用，
  // `idle`／`armed` 是舊素材、`combat.ts` 的註解自己寫「目前沒排到位置，留著備用」。
  // 三張共 89 KB，佔這批暖圖的一成一，卻只是擋在魔物前面。
  return Object.entries(manifest.sprites)
    .filter(([k]) => k.startsWith('hero/') && !HERO_NOT_IN_COMBAT.has(k))
    .map(([, v]) => `${BASE}${v}`);
}

/** 這張立繪生好了沒（階段專屬圖、球球狀態圖還沒落地時要退回一般圖，不能畫成灰剪影） */
export function hasSprite(key: string): boolean { return manifest.sprites[key] !== undefined; }

export type MonsterPose = 'idle' | 'attack' | 'hurt' | 'block';
export function hasMonsterPose(artKey: string, pose: MonsterPose): boolean { return manifest.monsters[artKey]?.[pose] !== undefined; }
export function monsterUrl(artKey: string, pose: MonsterPose): string {
  const m = manifest.monsters[artKey];
  const rel = m?.[pose] ?? m?.idle;
  return rel ? `${BASE}${rel}` : SILHOUETTE;
}

/**
 * 開場之後在背景把圖全部先載好、先解好。
 *
 * 沒有這一段的話，每張圖都是**畫面要用到的當下**才去下載＋解碼——
 * 第一次進戰鬥，整張戰鬥背景（1280x720）、魔物立繪、球球的七個姿勢
 * 全部同時在你眼前現載，畫面就頓一下。這是「好多很卡」很大一部分的來源。
 *
 * 為什麼要 `decode()` 不只是 `new Image().src`：光設 src 只是**下載**，
 * 解碼還是留到畫的那一刻才做，該頓的還是會頓。`decode()` 會把解碼也一起做完。
 *
 * 順序照「多快會用到」排：立繪與圖示馬上要，牌面進戰鬥要，背景最重但可以晚一點。
 * 一次六張：太多會跟畫面搶頻寬，反而開場更慢。
 */
/**
 * 已經下載＋解碼過的圖，兩支預載共用同一份紀錄。
 *
 * 放在 `assets.ts` 而不是 `preload.ts`：`preload.ts` 已經引用這裡，反過來再引用一次會成環——
 * 這個專案踩過（`bossdoor.ts` 與 `app.ts` 互相引用，害一支測試在載入階段就掛掉、測試數靜靜少了四條）。
 */
export const warmed = new Set<string>();

/**
 * 登記「這張已經解碼過了」，之後 `preload.ts` 的 `decodeAll` 就會跳過它。
 *
 * 開場的 `preloadArt` 自己寫了一份解碼迴圈、不經過 `decodeAll`，所以解完的那幾百張
 * 從來沒被登記——`preloadAct(1)` 接著又照 `bgKeysForAct(1)` 解一次。
 * 以前那份清單只有 19 個鍵、重工看不出來；2026-09-11 把事件插圖也照關數分流之後長到約 50 個，
 * 開場等於多解碼三十幾張 1024×768（複核 2026-09-11 低-4）。
 * 圖檔本身在瀏覽器快取裡、不會重新下載，但解碼是實打實的 CPU，舊機器上就是開場多卡一下。
 */
export function markWarmed(urls: Iterable<string>): void {
  for (const u of urls) if (!u.startsWith('data:')) warmed.add(u);
}

export async function preloadArt(): Promise<void> {
  const order: (keyof Manifest)[] = ['sprites', 'icons', 'cards', 'bg'];
  // 第二、三關才看得到的底圖開場不載，過關時再由 `preloadAct` 補（跟魔物立繪同一套）
  const skip = deferredBgKeys();
  const urls: string[] = [];
  for (const g of order) {
    const group = manifest[g];
    if (!group || Array.isArray(group)) continue;
    for (const [key, v] of Object.entries(group)) {
      if (g === 'bg' && skip.has(key)) continue;
      if (typeof v === 'string') urls.push(`${BASE}${v}`);
      else if (v) for (const one of Object.values(v)) if (one) urls.push(`${BASE}${one}`);
    }
  }

  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < urls.length; i = next++) {
      const url = urls[i];
      if (!url) continue;
      try {
        const img = new Image();
        img.src = url;
        // decode() 在有些瀏覽器對還沒進 DOM 的圖會丟例外，那就退回只等下載完成
        if (typeof img.decode === 'function') await img.decode();
      } catch { /* 少載一張只是那張會晚一點出現，不該讓預載整串停掉 */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  // 登記進共用的「解過了」名單，`preloadAct(1)` 才不會把同一批再解一次（複核 2026-09-11 低-4）
  markWarmed(urls);
}

export function computeScale(w: number, h: number): number { return Math.min(w / 1280, h / 720); }
