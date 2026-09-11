import { deferredBgKeys } from './bgacts';

export interface Manifest {
  cards: Record<string, string>;
  sprites: Record<string, string>;
  monsters: Record<string, { idle?: string; attack?: string; hurt?: string; block?: string; down?: string }>;
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

/*
 * ===== 換角色的立繪（2026-09-12）=====
 *
 * 立繪鍵長 `hero/<前綴>_<姿勢>`，全遊戲的姿勢名冊寫在 `combat.ts` 的 `POSE`，
 * 值一律是**球球版**的鍵——那是「姿勢的身分證」，畫面到處拿它做相等比較
 *（`pose === POSE.claw`、`ATTACK_POSES.has(pose)`）。所以換角色**不改那張表**，
 * 只在「鍵要變成網址」與「這張圖有沒有」這兩個出口翻譯一次。
 *
 * 退路刻意**退回她自己**最接近的姿勢，不是退回球球的：
 * 玩菲菲卻突然跳出一隻灰虎斑，比姿勢不精準難看得多。
 */
const HERO_PREFIX: Readonly<Record<string, string>> = { ninja: 'ninja', samurai: 'samurai', feifei: 'feifei' };

/** 她沒生這張圖時，退到自己的哪一張。鍵與值都是**姿勢名**（不含 `hero/<前綴>_`） */
const POSE_FALLBACK: Readonly<Record<string, string>> = {
  // 攻擊家族全退回基本出招
  claw: 'attack', kick: 'attack', dash: 'attack', punch: 'attack',
  // 技能家族全退回施術
  focus: 'skill', scroll: 'skill', roar: 'skill', taiji: 'skill', qinggong: 'skill', eat: 'skill',
  // 狀態待機退回受傷／站姿（`idlePoseKey` 會先問 hasSprite，退到這裡就是「就用站姿」）
  choke: 'hurt', dizzy: 'hurt', belly: 'hurt', lazy: 'hurt', puff: 'hurt', iron: 'idle',
  // 擋下來的抱胸格擋退回蜷縮；倒在地上退回站著垂頭
  guard: 'curl', down: 'lose',
};

/**
 * 這位角色**自己**畫好的那一張（不走退路）；沒有就回 null。
 *
 * 站姿兩種寫法都認：球球的鍵是 `hero/ninja`（沒有後綴，最早那批留下來的），
 * 後來的角色一律是 `hero/<前綴>_idle`。這裡兩個都查，生圖腳本就不必為了對齊改檔名。
 */
function ownPose(prefix: string, pose: string): string | null {
  const names = pose === 'idle' ? [`hero/${prefix}`, `hero/${prefix}_idle`] : [`hero/${prefix}_${pose}`];
  return names.find((k) => manifest.sprites[k] !== undefined) ?? null;
}

/** 從球球版的鍵取出姿勢名（`hero/ninja_claw` → `claw`、`hero/ninja` → `idle`） */
function poseNameOf(key: string): string | null {
  if (!key.startsWith('hero/ninja')) return null;
  return key.slice('hero/ninja'.length).replace(/^_/, '') || 'idle';
}

/**
 * 把球球版的立繪鍵換成這位角色的。她沒畫那一張就照 `POSE_FALLBACK` 退一步，
 * 再沒有就回原本那個（球球的）——寧可畫錯角色也不要破圖。
 */
export function heroSpriteKey(hero: string | undefined, key: string): string {
  const prefix = HERO_PREFIX[hero ?? 'ninja'] ?? 'ninja';
  if (prefix === 'ninja') return key;
  const pose = poseNameOf(key);
  if (!pose) return key;
  const fb = POSE_FALLBACK[pose];
  return ownPose(prefix, pose) ?? (fb ? ownPose(prefix, fb) : null) ?? key;
}

/*
 * ===== 本機這一位玩的是誰（2026-09-12）=====
 *
 * 單人畫面（對白疊層、過關走路轉場、標題）只演給本機這一位看，用一個模組層級的
 * 變數最省事。**戰鬥畫面不能這樣讀**——那邊兩位同框，一律從 `PlayerCombat.hero` 取。
 * 開新局與讀存檔時由 `app.ts` 設定。
 */
let localHeroId = 'ninja';
export function setLocalHero(hero: string | undefined): void { localHeroId = hero ?? 'ninja'; }
export function localHero(): string { return localHeroId; }

/** 這位角色的立繪網址。鍵一律寫球球版的，換角色的翻譯交給 `heroSpriteKey` */
export function heroArtUrl(hero: string | undefined, key: string): string {
  return artUrl('sprites', heroSpriteKey(hero, key));
}

/**
 * 這位角色**自己**畫好這張姿勢了沒——**嚴格版，不走退路**。
 *
 * 挑待機姿勢（`idlePoseKey`）與挑招式圖（`posePick`）問的是「這張圖存在嗎」，
 * 用寬鬆版的話永遠是「在」（退路一定找得到東西），中毒待機就會挑到退路後的掛彩圖，
 * 玩家看到的姿勢跟身上的狀態對不起來。
 */
export function hasHeroSprite(hero: string | undefined, key: string): boolean {
  const prefix = HERO_PREFIX[hero ?? 'ninja'] ?? 'ninja';
  if (prefix === 'ninja') return hasSprite(key);
  const pose = poseNameOf(key);
  return pose ? ownPose(prefix, pose) !== null : hasSprite(key);
}

/** 這張立繪生好了沒（階段專屬圖、球球狀態圖還沒落地時要退回一般圖，不能畫成灰剪影） */
export function hasSprite(key: string): boolean { return manifest.sprites[key] !== undefined; }

export type MonsterPose = 'idle' | 'attack' | 'hurt' | 'block' | 'down';
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
