// 產生 docs/分關載入.json：每張魔物立繪與底圖最早在第幾關會用到（tools/check_size.py 拿它把二三關的圖歸「分關載入」）。
// `npx vitest run` 會一起跑到（tools/ 也在測試範圍），所以檔案不會過期；改了遭遇、關主池或底圖分關規則，
// 跑完測試把 docs/分關載入.json 一起提交就好
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { monsterArtKeysForAct } from '../src/ui/preload';
import { SLIDES_BY_ACT, bgKeysForAct, eventMainKeys, qmarkMainKeys } from '../src/ui/bgacts';
import { MERCHANT_SPRITES, TITLE_ART, heroOfKey, isCoopOnlyArt, isItemIcon } from '../src/ui/assets';

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
  // 問號格變化的三張揭曉圖與行腳商三張立繪（2026-09-23 第三批）：地圖上有會變的問號格才背景抓（`preload.ts` 的 `preloadQmarkArt`），同一類、寫 0。
  // 角色版的揭曉圖由下面「角色專屬」那一圈收
  for (const key of qmarkMainKeys()) { const path = manifest.bg[key]; if (path) out[path] = 0; }
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

  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync('docs/分關載入.json', JSON.stringify(sorted, null, 1) + '\n', 'utf-8');
  const n = (a: number) => Object.values(sorted).filter((v) => v === a).length;
  console.log(`分關載入：第一關 ${n(1)} 檔、第二關 ${n(2)}、第三關 ${n(3)}、沒用到 ${n(9)}`);
  // 事件主圖一張都不准算首載（2026-09-23 0-2）：拿掉上面 `eventMainKeys` 那一圈，三關都排得到的三十張會掉回首載，這裡就紅
  const firstLoad = Object.entries(manifest.bg)
    .filter(([key]) => eventMainKeys().includes(key) && sorted[manifest.bg[key]!] !== 0).map(([key]) => key);
  expect(firstLoad, '事件主圖照地圖現抓，不該留在首載').toEqual([]);
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
});
