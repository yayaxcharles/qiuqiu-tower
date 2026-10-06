// 產生 docs/分關載入.json：每張魔物立繪與底圖最早在第幾關會用到（tools/check_size.py 拿它把二三關的圖歸「分關載入」）。
// 平常跑測試只**比對**、不寫檔（2026-10-02，tools/docs-dump.ts）：過期了這裡會紅。改了遭遇、關主池、底圖分關規則或加了圖，
// 跑 `npm run docs:dump` 更新，把 docs/分關載入.json 一起提交
import { readFileSync } from 'node:fs';
import { WRITE_DOCS, docUpToDate, writeDoc } from './docs-dump';
import { expect, it } from 'vitest';
import { monsterArtKeysForAct } from '../src/ui/preload';
import { NON_EVENT_ART, SLIDES_BY_ACT, art26Keys, bgKeysForAct, eventMainKeys } from '../src/ui/bgacts';
import { MERCHANT_SPRITES, TITLE_ART, _setManifestForTest, heroOfKey, heroSpriteKey, isCoopOnlyArt, isDeferredBossArt, isGuestKeeperArt, isItemIcon, type Manifest } from '../src/ui/assets';
import { HEROES } from '../src/engine/hero';

it('dump monster acts', () => {
  const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8')) as { monsters: Record<string, Record<string, string>>; bg: Record<string, string> };
  const minAct = new Map<string, number>();
  for (const act of [3, 2, 1]) for (const key of monsterArtKeysForAct(act)) minAct.set(key, act);
  const out: Record<string, number> = {};
  for (const [key, poses] of Object.entries(manifest.monsters)) {
    const act = minAct.get(key) ?? 9;   // 9＝目前沒有任何遭遇用到（例如只在事件裡出現的），當作分關載入
    for (const path of Object.values(poses)) out[path] = act;
  }
  // 底圖同一套：只在第二、三關用得到的（木造牆、夜空石台、那幾張換皮的節點畫面）歸分關載入。
  // 第一關也會用到的（變體沒生齊、`actVariantKey` 退回基底那幾張）留在首載。
  const bgAct = new Map<string, number>();
  for (const act of [3, 2, 1]) for (const key of bgKeysForAct(act)) bgAct.set(key, act);
  for (const [key, path] of Object.entries(manifest.bg)) {
    const act = bgAct.get(key);
    if (act !== undefined && act >= 2) out[path] = act;
  }
  // 過關幻燈片（2026-09-11 起改由關主門那一刻才載）：它們不在任何一關的 `bgKeysForAct` 裡，
  // 上面那個迴圈抓不到。**三關的都算分關載入**——連第一關那三張也是，
  // 因為要打完十五層、推開關主門才會開始抓（`screens/bossdoor.ts` 的 `warmSlides`）
  // 值寫 **0**＝「不分關，開場一律不載」。寫關數的話第一關那三張會被 `check_size.py` 的
  // 「第 2 關以後才算分關載入」擋在外面、照樣算進首載，這一刀就白改了
  for (const group of SLIDES_BY_ACT) {
    for (const key of group) { const path = manifest.bg[key]; if (path) out[path] = 0; }
  }
  // 事件主圖（2026-09-23 內容擴充 0-2）：改成照這張地圖排到的事件格現抓（`preload.ts` 的 `preloadMapEvents`），
  // 開場與進關都不載，也不在任何一關的 `bgKeysForAct` 裡——跟幻燈片同一類，寫 0。
  // 名單照事件編號算（`eventMainKeys`），紙箱畫面借用的 `bg/event_chest_*` 不在裡面、照舊算首載
  for (const key of eventMainKeys()) { const path = manifest.bg[key]; if (path) out[path] = 0; }
  // 第一關的新戰鬥背景（2026-10-06 美術改版）：開場不載（`deferredBgKeys`），進入一局才由 `preloadAct(1)` 抓——跟秘寶忍具圖示同一類，寫 0。
  // 二三關的照上面那圈記 2、3
  for (const key of art26Keys('low')) { const path = manifest.bg[key]; if (path) out[path] = 0; }
  // 不是事件的事件類主圖（祝福主圖、問號格三張揭曉圖，2026-09-23 第三批）：用到的畫面自己在背景抓（`bgacts.ts` 的 `NON_EVENT_ART`），同一類寫 0。
  // 角色版的揭曉圖由下面「角色專屬」那一圈收
  for (const id of NON_EVENT_ART) { const path = manifest.bg[`bg/event_${id}`]; if (path) out[path] = 0; }
  // 行腳商三張立繪（2026-09-23 第三批）：地圖上有會變的問號格才背景抓（`preload.ts` 的 `preloadQmarkArt`），同一類、寫 0
  const sprites = (manifest as unknown as { sprites: Record<string, string> }).sprites;
  for (const key of MERCHANT_SPRITES) { const path = sprites[key]; if (path) out[path] = 0; }
  /*
   * **事件的「結果圖」不算首載**（2026-09-11）。只認 `_r<數字>` 結尾的，
   * 判準寫緊一點是有原因的，見下面。
   *
   * 結果圖是走到那個事件、玩家選了某個選項、畫面建出 `<img>` 的那一刻才抓的。
   * 上面那個迴圈推進首載鍵集合的是 `bg/event_<事件 id>`（見 `bgacts.ts`），
   * **不含** `_r` 的那一批，所以它們確實從頭到尾沒被開場碰過。
   *
   * ⚠️ 判準原本寫成 `key.startsWith('bg/event_')`，那是錯的（稽核 2026-09-11 高-5）。
   * 事件的**基底插圖**開場是真的會下載的——`bgacts.ts` 把每個事件的
   * `bg/event_<id>` 列進每一關的鍵集合，`assets.ts` 的 `preloadArt()` 又會把
   * `manifest.bg` 整包載一遍、只跳過分關的那些；沒標 `acts` 的事件三關都在，
   * 「二三關減第一關」會把它減成空的，於是不在跳過名單裡。
   * 寬判準會把 34 張基底圖（0.92 MB，含紙箱那三張根本不是事件的圖）一起摳掉，
   * 那就不是修正高估，是**美化數字**。
   *
   * 值寫 0＝「不跟關數綁的按需載入」，跟過關幻燈片同一類。
   *（2026-09-23 起基底插圖也照地圖現抓、由上面 `eventMainKeys` 那一圈歸 0；這一圈的緊判準照舊，紙箱那三張仍算首載）
   */
  for (const [key, path] of Object.entries(manifest.bg)) {
    if (/_r\d+$/.test(key)) out[path] = 0;
  }
  // 角色專屬的圖（目前只有菲菲）開場不載、選好角色才補（`preloadHeroArt`），跟幻燈片一樣歸 0（總稽核 F 中-1）
  const groups = manifest as unknown as Record<string, Record<string, string | Record<string, string>>>;
  for (const g of ['sprites', 'icons', 'cards', 'bg']) {
    for (const [key, v] of Object.entries(groups[g] ?? {})) {
      if (TITLE_ART.has(key)) continue;   // 首頁就出現的（菲菲的參上封面）照首載算
      if (!heroOfKey(key) && !(g === 'cards' && isCoopOnlyArt(key))) continue;   // 雙人專屬牌也是進大廳才補
      for (const path of typeof v === 'string' ? [v] : Object.values(v)) out[path] = 0;
    }
  }
  // 秘寶與忍具圖示（2026-09-23 內容擴充第二批）：開場不載、進入一局才補（`assets.ts` 的 `isItemIcon`、
  // `preload.ts` 的 `preloadHeroArt`），跟角色專屬圖同一類，寫 0
  const icons = (groups.icons ?? {}) as Record<string, string>;
  for (const [key, path] of Object.entries(icons)) if (isItemIcon(key)) out[path] = 0;
  // 客座店主的立繪（2026-09-23 第三批 新J）：開場不載、這一關地圖上有那一位的店才抓（`assets.ts` 的 `isGuestKeeperArt`、
  // `preload.ts` 的 `preloadMapKeepers`），跟事件主圖同一類，寫 0（`sprites` 跟上面行腳商那一圈同一份）
  for (const [key, path] of Object.entries(sprites)) if (isGuestKeeperArt(key)) out[path] = 0;
  /*
   * 開場分批（2026-09-29 效能）：
   * - 牌面整組開場不載，選好角色照那一位抓（`assets.ts` 的 `heroCardUrls`）→ 全部寫 0；
   * - `hero/` 立繪開場只抓選角畫面那四張、封面自己抓目前語言那一套（中文原圖算首載）；
   *   球球的戰鬥姿勢、英日版封面（換語言才抓）→ 寫 0，選角那四張與中文封面拿掉標記＝照首載算；
   * - 師父戰鬥用的那二十幾張進第三關才抓（`isDeferredBossArt`）→ 寫 3，對白頭像那兩張照首載。
   */
  _setManifestForTest(manifest as unknown as Manifest);
  const portraits = new Set(HEROES.map((h) => heroSpriteKey(h, 'hero/ninja')));
  const zhCovers = new Set(['hero/cover', ...TITLE_ART]);
  for (const [key, path] of Object.entries(sprites)) {
    if (!key.startsWith('hero/')) continue;
    if (portraits.has(key) || zhCovers.has(key)) delete out[path];
    else out[path] = 0;
  }
  for (const v of Object.values(groups.cards ?? {})) for (const path of typeof v === 'string' ? [v] : Object.values(v)) out[path] = 0;
  for (const [key, path] of Object.entries(sprites)) if (isDeferredBossArt(key)) out[path] = 3;
  expect(portraits.size, '前提：四隻都有自己的站姿').toBe(4);

  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  const text = JSON.stringify(sorted, null, 1) + '\n';
  writeDoc('docs/分關載入.json', text);
  // check_size.py 靠這份把二三關的圖排除在首載外，過期就會量錯，所以不寫檔時要對得上
  if (!WRITE_DOCS) expect(docUpToDate('docs/分關載入.json', text), 'docs/分關載入.json 過期了：跑 npm run docs:dump 更新後一起提交').toBe(true);
  const n = (a: number) => Object.values(sorted).filter((v) => v === a).length;
  console.log(`分關載入：第一關 ${n(1)} 檔、第二關 ${n(2)}、第三關 ${n(3)}、沒用到 ${n(9)}`);
  // 事件主圖一張都不准算首載（2026-09-23 0-2）：拿掉上面 `eventMainKeys` 那一圈，三關都排得到的三十張會掉回首載，這裡就紅
  const firstLoad = Object.entries(manifest.bg)
    .filter(([key]) => eventMainKeys().includes(key) && sorted[manifest.bg[key]!] !== 0).map(([key]) => key);
  expect(firstLoad, '事件主圖照地圖現抓，不該留在首載').toEqual([]);
  // 祝福主圖（2026-09-23 第三批）同理：拿掉上面 `NON_EVENT_ART` 那一圈，球球那張就掉回首載，這裡就紅
  const screenArtFirst = NON_EVENT_ART.map((id) => `bg/event_${id}`).filter((key) => manifest.bg[key] && sorted[manifest.bg[key]!] !== 0);
  expect(screenArtFirst, '祝福主圖序章時才抓，不該留在首載').toEqual([]);
  expect(NON_EVENT_ART.length, '前提：名單裡真的有東西').toBeGreaterThan(0);
  // 紙箱畫面借用的三張不是事件，照舊算首載
  expect(sorted[manifest.bg['bg/event_chest_closed']!]).toBeUndefined();
  // 秘寶與忍具圖示一張都不准算首載（2026-09-23 第二批）：拿掉上面 `isItemIcon` 那一圈，這裡就紅
  const iconFirstLoad = Object.entries(icons).filter(([key, path]) => isItemIcon(key) && sorted[path] !== 0).map(([key]) => key);
  expect(iconFirstLoad, '秘寶與忍具圖示進入一局才補，不該留在首載').toEqual([]);
  // 狀態、節點、介面那些 `icon/` 圖示開場就要，照舊算首載
  expect(sorted[icons['icon/onigiri_full']!]).toBeUndefined();
  // 問號格那三張（四隻各一份）與行腳商三張一張都不准算首載（2026-09-23 第三批）：拿掉上面那兩圈，這裡就紅
  const qmarkFirstLoad = [
    ...Object.entries(manifest.bg).filter(([key]) => /^bg\/event_(?:(?:feifei|dangdang|fengfeng)_)?q_(?:ambush|merchant|roadbox)$/.test(key)),
    ...MERCHANT_SPRITES.map((key): [string, string] => [key, sprites[key]!]),
  ].filter(([, path]) => sorted[path] !== 0).map(([key]) => key);
  expect(qmarkFirstLoad, '問號格的圖照地圖現抓，不該留在首載').toEqual([]);
  // 三位客座店主九張立繪一張都不准算首載（2026-09-23 第三批）：拿掉上面 `isGuestKeeperArt` 那一圈，這裡就紅；橘貓老闆那三張照舊首載
  const keeperFirstLoad = Object.entries(sprites).filter(([key, path]) => isGuestKeeperArt(key) && sorted[path] !== 0).map(([key]) => key);
  expect(keeperFirstLoad, '客座店主的立繪照地圖現抓，不該留在首載').toEqual([]);
  expect(Object.keys(sprites).filter((k) => isGuestKeeperArt(k))).toHaveLength(9);
  for (const k of ['shop/keeper', 'shop/keeper_happy', 'shop/keeper_no']) expect(sorted[sprites[k]!], k).toBeUndefined();
  // 開場分批（2026-09-29）：牌面、球球的戰鬥姿勢、英日版封面不算首載；選角四張、中文封面、師父對白頭像照首載；師父其餘算第三關
  expect(sorted[sprites['hero/ninja_claw']!]).toBe(0);
  expect(sorted[sprites['hero/cover_en']!]).toBe(0);
  expect(sorted[sprites['hero/cover']!]).toBeUndefined();
  expect(sorted[sprites['hero/ninja']!]).toBeUndefined();
  expect(sorted[sprites['boss/idle1']!]).toBeUndefined();
  expect(sorted[sprites['boss/palm2']!]).toBe(3);
  const cardsFirst = Object.values(groups.cards ?? {}).filter((p) => typeof p === 'string' && sorted[p] !== 0);
  expect(cardsFirst, '牌面選好角色才抓，不該留在首載').toEqual([]);
  _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] });
});
