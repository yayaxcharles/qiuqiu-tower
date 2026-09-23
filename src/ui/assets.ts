import { deferredBgKeys } from './bgacts';
import { cards } from '../content/cards';

/** 只有兩個人一起玩才拿得到的牌（`coop: true`）的牌面鍵：單機一輩子用不到，開場不載，進大廳才補 */
const COOP_ONLY_ART: ReadonlySet<string> = new Set(cards.filter((c) => c.coop).map((c) => c.art));

export interface Manifest {
  cards: Record<string, string>;
  sprites: Record<string, string>;
  monsters: Record<string, { idle?: string; attack?: string; hurt?: string; block?: string; down?: string }>;
  icons: Record<string, string>;
  bg: Record<string, string>;
  review: string[];
  /**
   * 不走上面那些分類的靜態檔：`原始相對路徑 → 帶雜湊的相對路徑`（見 `fileUrl`）。
   * 打包時由 `tools/vite-asset-hash.ts` 產生；開發伺服器沒有這一欄。
   */
  files?: Record<string, string>;
}

let manifest: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };

export const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 缺圖時的灰色剪影：清單還沒生好也不會出現破圖 */
const SILHOUETTE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="55" r="35" fill="#555"/><circle cx="30" cy="25" r="12" fill="#555"/><circle cx="70" cy="25" r="12" fill="#555"/></svg>');

/*
 * 這一份網頁是哪一次打包的（`vite.config.ts` 的 `define` 填，跟 `net/code.ts` 是同一個值）。
 * 不從那邊匯入是因為那支是連線專用、被切到另一個分塊，拉進來會把它整個併回首載的主程式。
 */
declare const __BUILD_TAG__: string;
const BUILD = typeof __BUILD_TAG__ === 'string' ? __BUILD_TAG__ : '';

export async function loadManifest(): Promise<void> {
  // 清單讀不到就整組退回剪影，不能讓遊戲開不起來
  try {
    /*
     * **網址後面要夾這一次打包的編號**（2026-09-16）。
     *
     * 素材檔名帶了內容雜湊碼之後（`tools/vite-asset-hash.ts`），所有圖的網址都寫在這份清單裡，
     * 清單就成了唯一的入口——它自己不能加雜湊，不然沒人找得到它。
     * 問題是 GitHub Pages 對**每個**檔案都回十分鐘的快取，清單也不例外：
     * 剛部署完，玩家按重新整理，瀏覽器會重抓 `index.html`（重新整理本來就會回頭問一次），
     * 於是拿到新的主程式；但清單是子資源、十分鐘還沒到，直接吃快取裡的**舊清單**，
     * 新程式照舊清單去要舊網址——換過的那幾張圖還是舊的，整件事等於白做。
     *
     * 夾上打包編號之後，新的主程式問的是一個從來沒被快取過的網址，一定拿到跟它同一版的清單，
     * 清單裡的圖又個個帶雜湊、也一定沒被快取過。**換過的圖當場就是新的。**
     *
     * 檔名沒有動（還是 `manifest.json`），所以「入口不加雜湊」那條規矩沒破：
     * 這只是叫瀏覽器每出一版就重新問一次，不是給它一個新檔名。
     */
    const res = await fetch(`${BASE}assets/manifest.json${BUILD ? `?v=${BUILD}` : ''}`);
    if (res.ok) manifest = { ...manifest, ...(await res.json() as Partial<Manifest>) };
  } catch (e) {
    // 加了素材雜湊之後，清單掛掉不只影響圖——聲音、音樂、影片的檔名也都在清單裡，
    // 會整組 404（推前審查 2026-09-16 中-5）。線上有人回報沒聲音時要查得到
    // eslint-disable-next-line no-console
    console.warn('[素材] 清單載不到，圖會退回剪影、聲音與影片會失效：', e);
  }
}

export function _setManifestForTest(m: Manifest): void { manifest = m; }

/**
 * 照**原始相對路徑**取一個靜態檔的網址（音效、背景音樂、過場影片）。
 *
 * 這三類跟圖不一樣：它們不在清單的分類裡，程式是照名字現組路徑的
 *（`assets/sfx/claw.mp3`、`bgm/act1.mp3`、`video/opening.mp4`）。
 * 打包版的檔名帶了內容雜湊碼（`tools/vite-asset-hash.ts`），所以要先查一次對照表。
 *
 * **查不到就照原路徑走**：開發伺服器直接吃 `public/`，那邊的檔名本來就沒有雜湊，
 * 這樣一條程式碼兩邊都對。清單還沒載好時也是走這條——原路徑在打包版會 404，
 * 但這三支呼叫點（音效、音樂、影片）全都在 `main.ts` 等完 `loadManifest()` 之後才會動。
 */
export function fileUrl(rel: string): string {
  return `${BASE}${manifest.files?.[rel] ?? rel}`;
}

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
const HERO_NOT_IN_COMBAT = new Set([
  'hero/cover', 'hero/feifei_cover', 'hero/dangdang_cover', 'hero/fengfeng_cover',
  // 2026-09-18 補的四張非戰鬥姿勢（貓窩的打盹／磨爪／扶同伴，加過關走路）：戰鬥裡一張都用不到，
  // 進暖圖只會擋在魔物立繪前面。四隻各四張＝16 張
  ...['ninja', 'feifei', 'dangdang', 'fengfeng'].flatMap((h) => ['nap', 'sharpen', 'helpup', 'walk'].map((p) => `hero/${h}_${p}`)),
  // 對白頭像（2026-09-22，新版待機第 1 格裁出來的）：只有對白疊層用，戰鬥裡用不到
  ...['ninja', 'feifei', 'dangdang', 'fengfeng'].map((h) => `hero/${h}_portrait`),
]);
/**
 * 帶角色名、卻在**選角之前**就會出現的圖：首頁兩張「參上」並排（2026-09-15）。
 * 開場預載不能因為鍵名帶 `feifei` 就跳過，戰鬥暖圖也不用它（總稽核 2026-09-16 戊 M3）。
 */
export const TITLE_ART: ReadonlySet<string> = new Set(['hero/feifei_cover', 'hero/dangdang_cover', 'hero/fengfeng_cover']);

/**
 * 這個鍵是哪一位角色專屬的；`null`＝共用或球球的。
 *
 * 菲菲的素材鍵都帶 `feifei`（`hero/feifei_*`、`card/feifei_*`、`bg/event_feifei_*`、`bg/feifei_still_*`、
 * `icon/map_hero_feifei_*`），球球的沒有前綴——那是 main 時代留下來的命名，正好讓「只玩球球的人
 * 開場下載的東西」跟併入她之前一模一樣（總稽核 F 中-1：原本她的 300 多張圖全部算進每個人的首載）。
 */
export function heroOfKey(key: string): string | null {
  if (key === 'codex/relic_old_sword_tassel') return 'fengfeng';
  const m = /(?:^|[/_])(feifei|dangdang|fengfeng)(?:_|$)/.exec(key);
  return m ? m[1]! : null;
}

/**
 * 秘寶與忍具的圖示（`codex/relic_*`、`codex/potion_*`）：**開場不載，進入一局才補**（2026-09-23 內容擴充第二批）。
 *
 * 這一組只在一局裡用得到（狀態列、獎勵、罐頭鋪、紙箱、事件、戰鬥忍具欄）；標題畫面唯一碰得到的是
 * 「秘寶與忍具圖鑑」，它直接畫 `<img src>`（`itemcompendium.ts`），沒預載也會自己下載。
 * 第一批 28 張進來時首載總計只剩約 50 KB，第二批再 22 張、第三批還要補到約 120 件——
 * 照舊劍穗那套在 `heroOfKey` 一件一件特例化只救得了鎖角色的幾件，共用的照樣算首載，
 * 所以整組一起延後（約 0.55 MB）。進入一局那一刻由 `preload.ts` 的 `preloadHeroArt` 補（`adoptRun` 叫它，
 * 新的一局、續玩、連線開局三個入口都走那裡），序章幻燈片那幾秒就抓完了。
 */
export function isItemIcon(key: string): boolean {
  return /^codex\/(?:relic|potion)_/.test(key);
}

/** 全部秘寶、忍具圖示的網址（進入一局才補，見 `isItemIcon`） */
export function itemIconUrls(): string[] {
  return Object.entries(manifest.icons).filter(([k]) => isItemIcon(k)).map(([, v]) => `${BASE}${v}`);
}

/** 這一局登場的角色（單機一位、連線兩位）的戰鬥姿勢圖；沒登場的那位不暖，免得跟魔物立繪搶下載（總稽核 F 中-3） */
export function heroSpriteUrls(heroes: readonly (string | undefined)[] = ['ninja']): string[] {
  const want = new Set(heroes.map((h) => h ?? 'ninja'));
  // 排掉戰鬥裡永遠用不到的圖（稽核 2026-09-10 低-2）：`cover` 只有標題畫面用，只是擋在魔物前面。
  // 當時一起排掉的舊素材 `idle`／`armed` 2026-09-22 已經連清單帶檔案刪掉。
  return Object.entries(manifest.sprites)
    .filter(([k]) => k.startsWith('hero/') && !HERO_NOT_IN_COMBAT.has(k) && want.has(heroOfKey(k) ?? 'ninja'))
    .map(([, v]) => `${BASE}${v}`);
}

/**
 * 選好角色之後才補載的那一位（連線是兩位）專屬的圖。球球沒有專屬鍵，所以他什麼都不用補。
 * 結果圖（`_r<n>`）與事件主圖（2026-09-23 起照地圖現抓，見 `preload.ts` 的 `preloadMapEvents`）照 `preloadArt` 同一套規矩跳過。
 */
/** 雙人專屬牌的牌面（球球版與菲菲版都算，兩位在連線裡都可能拿到） */
/**
 * 這一局（連線）的兩位會畫到的連線牌圖——**只算這一組搭檔**（2026-09-23 批次 coopload）。
 *
 * 原本進大廳就把清單裡所有連線牌圖抓下來：四位各自的版本＋全部搭檔的混搭版。
 * 混搭牌面補齊 171 張之後變成 278 張、8.6 MB，而一局只用得到其中一組的二十幾張。
 *
 * 鍵直接問 `cardArtKey`（兩個席位各問一次），畫面要畫哪一張、這裡就抓哪一張，兩邊不會走鐘：
 * 不同角色抓混搭那組（沒有混搭圖的新牌會退回自己的版本，也一起算進來），
 * 同角色雙人抓那一位自己的版本。只挑兩位拿得到的牌（標了別人 `hero` 的專屬牌不抓）。
 * 一個人玩回空陣列。
 */
export function coopArtUrlsFor(heroes: readonly (string | undefined)[]): string[] {
  if (heroes.length < 2) return [];
  const hs = heroes.map((h) => h ?? 'ninja');
  const urls = new Set<string>();
  for (const c of cards) {
    if (!c.coop || (c.hero && !hs.includes(c.hero))) continue;
    for (let i = 0; i < hs.length; i++) {
      for (let j = 0; j < hs.length; j++) {
        if (i !== j) urls.add(artUrl('cards', cardArtKey(c.art, hs[i], hs[j])));
      }
    }
  }
  return [...urls].filter((u) => !u.startsWith('data:'));
}

/** 這個鍵是不是雙人專屬牌的牌面（給分關載入的清單用） */
export function isCoopOnlyArt(key: string): boolean {
  const base = key.replace(/^card\/coop_(?:ninja|feifei|dangdang|fengfeng)_(?:ninja|feifei|dangdang|fengfeng)_/, 'card/');
  return COOP_ONLY_ART.has(base) || COOP_ONLY_ART.has(base.replace(/^card\/(?:feifei|dangdang|fengfeng)_/, 'card/'));
}

export function heroArtUrls(heroes: readonly (string | undefined)[]): string[] {
  const want = new Set(heroes.map((h) => h ?? 'ninja'));
  const skip = deferredBgKeys();
  const urls: string[] = [];
  for (const g of ['sprites', 'icons', 'cards', 'bg'] as const) {
    for (const [key, v] of Object.entries(manifest[g])) {
      // 連線牌（混搭的、這一位自己的版本都算）只由連線預載負責（2026-09-23：原本只擋了混搭的，
      // 單人玩菲菲、噹噹、封封也會把自己那二十幾張連線牌抓下來；連線時又跟連線預載同時各抓一次）
      if (g === 'cards' && isCoopOnlyArt(key)) continue;
      const who = heroOfKey(key);
      if (!who || !want.has(who)) continue;
      if (g === 'bg') {
        if (/_r\d+$/.test(key)
          || key.startsWith(`bg/${who}_still_`)
          || key.startsWith(`bg/${who}_story_`)
          || key.startsWith(`bg/${who}_coop_`)) continue;   // 結果圖與故事場景本來就是點到才載
        if (skip.has(key) || skip.has(key.replace(`_${who}_`, '_'))) continue;   // 事件主圖（角色版換回共用那張的鍵比對）一律照地圖現抓
      }
      if (typeof v === 'string') urls.push(`${BASE}${v}`);
      else if (v) for (const one of Object.values(v)) if (one) urls.push(`${BASE}${one}`);
    }
  }
  return urls;
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
const HERO_PREFIX: Readonly<Record<string, string>> = {
  ninja: 'ninja', feifei: 'feifei', dangdang: 'dangdang', fengfeng: 'fengfeng',
};

/** 她沒生這張圖時，退到自己的哪一張。鍵與值都是**姿勢名**（不含 `hero/<前綴>_`） */
const POSE_FALLBACK: Readonly<Record<string, string>> = {
  /*
   * 攻擊家族退回基本出招。**這只是退路**——她 2026-09-12 補了自己的四張
   *（`hasHeroSprite` 查得到就直接用她的，根本走不到這裡）。
   * 球球那四張是爪擊／踢技／衝撞／拳，她的是丟針的四種變化：
   * 單發精準、一次三根、由上往下砸、貼身彈指。
   */
  claw: 'attack', kick: 'attack', dash: 'attack', punch: 'attack',
  // 技能家族全退回施術
  focus: 'skill', scroll: 'skill', roar: 'skill', taiji: 'skill', qinggong: 'skill', eat: 'skill',
  // 狀態待機退回受傷／站姿（`idlePoseKey` 會先問 hasSprite，退到這裡就是「就用站姿」）
  choke: 'hurt', dizzy: 'hurt', belly: 'hurt', lazy: 'hurt', puff: 'hurt', iron: 'idle',
  // 擋下來的抱胸格擋退回蜷縮；倒在地上退回站著垂頭
  guard: 'curl', down: 'lose',
  // 貓窩與過關走路那四張（2026-09-18）：睡著退回蜷縮，其餘退回站姿
  nap: 'curl', sharpen: 'idle', helpup: 'idle', walk: 'idle',
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
  /*
   * 三層退路：她的那一張 → 她的替代姿勢 → **她的站姿**。
   *
   * 最後那一層是後來補的（測試抓到的）：同時缺姿勢與它的替代時，本來會掉回球球那張，
   * 玩菲菲卻冒出一隻灰虎斑。站姿每個角色都一定有，退到那裡至少人是對的——
   * 姿勢不精準遠比認錯角色好。真的連站姿都沒有（新角色剛開工）才回原鍵。
   */
  return ownPose(prefix, pose) ?? (fb ? ownPose(prefix, fb) : null) ?? ownPose(prefix, 'idle') ?? key;
}

/*
 * ===== 本機這一位玩的是誰（2026-09-12）=====
 *
 * 單人畫面（對白疊層、過關走路轉場、標題）只演給本機這一位看，用一個模組層級的
 * 變數最省事。**戰鬥畫面不能這樣讀**——那邊兩位同框，一律從 `PlayerCombat.hero` 取。
 * 開新局與讀存檔時由 `app.ts` 設定。
 */
let localHeroId = 'ninja';
let localPartnerHero: string | undefined;
export function setLocalHero(hero: string | undefined): void {
  localHeroId = hero ?? 'ninja';
  localPartnerHero = undefined;
}
/** 每次切換畫面時同步；標題、圖鑑與單人局沒有搭檔。 */
export function setLocalPartnerHero(hero: string | undefined): void { localPartnerHero = hero; }
/** 這一局同伴是誰（單人、標題與圖鑑是 `undefined`）。對白疊層靠它分辨頭像是自己還是同伴，決定戰場上藏哪一格 */
export function localPartner(): string | undefined { return localPartnerHero; }
export function localHero(): string { return localHeroId; }

/**
 * 這張牌要用誰的圖（2026-09-12，使用者：「牌全部分家」）。
 *
 * **牌的數字只定義一份**（`content/cards.ts`），分家的只有圖：菲菲在玩時，
 * 有 `card/feifei_<牌號>` 就用她的，沒有就退回原本那張。
 *
 * 走 `localHero()` 而不是把職業一路傳進 `cardNode`（那支有九個呼叫點）：
 * 畫面上的牌永遠是**本機這一位自己的**——手牌、牌組一覽、獎勵、罐頭鋪、圖鑑都是。
 * 連線時看不到同伴的手牌，所以不會有「兩個人的牌同框」的情況。
 */
export function cardArtKey(baseKey: string, hero?: string, partnerHero = hero === undefined ? localPartnerHero : undefined): string {
  // 指定角色的圖鑑不沿用本局搭檔；同伴出牌預覽則同時傳入角色與搭檔。
  const who = hero ?? localHeroId;
  if (partnerHero && partnerHero !== who && COOP_ONLY_ART.has(baseKey)) {
    const pair = [who, partnerHero].sort().join('_');
    const mixed = baseKey.replace(/^card\//, `card/coop_${pair}_`);
    if (manifest.cards[mixed] !== undefined) return mixed;
  }
  if (who === 'ninja') return baseKey;
  const mine = baseKey.replace(/^card\//, `card/${who}_`);
  return manifest.cards[mine] !== undefined ? mine : baseKey;
}

/**
 * 事件插圖的鍵。做法跟 `cardArtKey` 一模一樣：有她的就用她的，沒有就退回原本那張。
 *
 * 為什麼需要這個（2026-09-12）：76 張事件／畫面插圖裡有 54 張**把球球畫進去了**
 *（大俠傳功那張他就趴在秘笈上）。玩菲菲時讀到的故事是她的，圖卻是他，
 * 跟結局那八張同一類問題（見 `app.ts` 的 `stillKey`）。
 *
 * 差別在退路：結局那邊沒圖就整段退回純對白（`slidesReady`），這邊**退回球球那張**。
 * 理由是事件插圖本來就有「還沒生好就不放」的處理，而 54 張要生好幾個小時——
 * 中間這段時間放他的圖，比整批事件都沒有插圖好。生一張就換一張。
 */
export function eventArtKey(id: string, hero: string = localHeroId): string {
  // `hero`：插圖照誰挑（不給＝本機這一位）。連線的鏡子走廊照座位 0 那一位，見 `event.ts` 的 `artHeroFor`
  const base = `bg/event_${id}`;
  if (hero === 'ninja') return base;
  const mine = `bg/event_${hero}_${id}`;
  return manifest.bg[mine] !== undefined ? mine : base;
}

/**
 * 連線時鏡子走廊的插圖照**座位 0 那一位**挑（2026-09-23 實機驗收 M-1）。
 *
 * 鏡中那隻照座位 0 變裝（`app.ts` 的 `syncStory` 把 `mirror` 設成座位 0 的角色），文字也照它改
 *（`event-text.ts` 的 `MIRROR_EVENT_TEXT`）；插圖原本卻照本機那一位挑：坐 1 號的人讀到「鏡子裡是綁頭巾的影子」，
 * 圖上是自己跟自己的倒影。09-23 菲菲那張換成她自己的黑影之後，球球開房、菲菲加入那一組從對變錯。
 * 現在坐 1 號的人看到座位 0 那張：同伴站在鏡前、鏡子裡是同伴的影子。主圖與結果圖都照這個挑（`event.ts`）。
 * 單人、其他事件回 `undefined`＝照本機這一位（`eventArtKey` 的預設）。
 */
const MIRROR_EVENTS: ReadonlySet<string> = new Set(['mirror_hall']);
export function eventArtHero(eventId: string, heroes: readonly (string | undefined)[]): string | undefined {
  if (heroes.length < 2 || !MIRROR_EVENTS.has(eventId)) return undefined;
  return heroes[0] ?? 'ninja';
}

/**
 * 插圖照別人挑、圖裡又沒畫到本機這一位時，旁邊放自己的立繪（同 `eventArtCast`／`data-art-cast` 的規矩：
 * 插圖裡已經有這隻貓就不放，沒有才放）。只有 `eventArtHero` 有回值的那幾個事件會走到；其他事件照舊不放。
 */
export function eventSidePortrait(eventId: string, artHero: string | undefined, mine: string): string | undefined {
  if (artHero === undefined || artHero === mine) return undefined;
  if (eventArtCast(eventArtKey(eventId, artHero)).includes(mine)) return undefined;
  const url = heroArtUrl(mine, 'hero/ninja');
  return url.startsWith('data:') ? undefined : url;
}

/**
 * 事件插圖裡**畫了哪幾隻貓主角**（2026-09-22 畫面盤點 問題 5，使用者裁定「插圖裡已經有這隻貓時，對白就不放頭像」）。
 *
 * 照檔名規則判斷，不另外手抄一張表：
 * - `bg/event_<角色>_…`：那一位專屬的版本（她那份是把球球整段換成她轉出來的，見 `tools/make_feifei_event_jobs.py`），畫的就是那一位；
 * - 沒有前綴的是球球那張：**有菲菲版的**才是畫了他的那批（她的版本只替「工單裡有球球」的圖轉，
 *   2026-09-22 對過 `tools/codex_jobs` 的工單，找得到工單的每一張都對得上）；沒有菲菲版的是純場景。
 * 目前只有 5F「師父留下的秘笈」會在事件畫面上播對白，四隻的版本都畫了自己。
 */
export function eventArtCast(key: string): string[] {
  const own = /^bg\/event_(feifei|dangdang|fengfeng)_/.exec(key);
  if (own) return [own[1]!];
  if (!key.startsWith('bg/event_')) return [];
  return manifest.bg[`bg/event_feifei_${key.slice('bg/event_'.length)}`] !== undefined ? ['ninja'] : [];
}

/**
 * 地圖上「你在這」那顆頭像的鍵。做法同 `cardArtKey`／`eventArtKey`。
 *
 * 這顆最該分家：**每次看地圖都看得到**，而且它代表的就是「我」。
 * 玩菲菲卻在地圖上看到球球，比事件插圖裡混到他還怪（2026-09-12）。
 * 沒生好她那三顆之前退回他的——地圖上沒有頭像會不知道自己走到哪，那更糟。
 */
export function mapHeroKey(act: number): string {
  const tier = act >= 3 ? 'top' : act === 2 ? 'mid' : 'low';
  const base = `icon/map_hero_${tier}`;
  if (localHeroId === 'ninja') return base;
  const mine = `icon/map_hero_${localHeroId}_${tier}`;
  return manifest.icons[mine] !== undefined ? mine : base;
}

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
/*
 * 「立繪還沒進倉就先借長得像的那一隻」那張對照表（`MONSTER_ART_FALLBACK`）**2026-09-18 拿掉了**。
 * 它是 2026-09-15 為影菲菲（鏡中球球照到菲菲時的變裝）臨時加的鷹架，她那五張姿勢當天就進倉，
 * 表從此是空的、還留著一段說「正在生」的過期註解。要再借一次就從 git 歷史撈回來。
 * 查不到鍵照樣由 `monsterUrl` 退成灰剪影（`assets.test.ts` 第一個案子守著）。
 */

/**
 * 換階段之後那一隻的立繪鍵（2026-09-16 使用者實測：「打老住持，菲菲說牠長出鱗甲，
 * 可是牠長得一模一樣」）。
 *
 * 規則：第二階段是原鍵加 `_p2`、第三階段 `_p3`。**查不到就往前退一階**，
 * 最後退回原鍵——所以還沒生的階段圖不會變成灰剪影，只會維持變身前那張臉。
 * 這條讓「先生一批、之後再補」成立（師父那套 `bossIdle` 早就是同一個做法）。
 *
 * 第一階段（`phase` 0）直接回原鍵，不做任何查表——**沒有階段的魔物一個位元都不受影響**。
 */
export function monsterPhaseKey(artKey: string, phase: number): string {
  for (let p = Math.floor(phase); p >= 1; p -= 1) {
    const k = `${artKey}_p${p + 1}`;
    if (manifest.monsters[k]) return k;
  }
  return artKey;
}

export function hasMonsterPose(artKey: string, pose: MonsterPose): boolean { return manifest.monsters[artKey]?.[pose] !== undefined; }
export function monsterUrl(artKey: string, pose: MonsterPose): string {
  const m = manifest.monsters[artKey];
  const rel = m?.[pose] ?? m?.idle;
  return rel ? `${BASE}${rel}` : SILHOUETTE;
}

/**
 * 已經下載＋解碼過的圖，所有預載共用同一份紀錄（`decodeAll` 解完就登記、下一批就跳過它）。
 *
 * 放在 `assets.ts` 而不是 `preload.ts`：`preload.ts` 已經引用這裡，反過來再引用一次會成環——
 * 這個專案踩過（`bossdoor.ts` 與 `app.ts` 互相引用，害一支測試在載入階段就掛掉、測試數靜靜少了四條）。
 *
 * 開場的 `preloadArt` 以前自己寫了一份解碼迴圈、解完的那幾百張從來沒登記，
 * `preloadAct(1)` 接著又照 `bgKeysForAct(1)` 解一次（複核 2026-09-11 低-4）。
 * 現在開場、分關／遭遇預載、戰鬥畫面三處都走同一支 `decodeAll`。
 */
export const warmed = new Set<string>();

/**
 * 一組「解過了沒」的紀錄＋留參照的地方。
 *
 * 整頁共用一組（`warmed`＋下面的 `keep`）；戰鬥畫面自己開一組，跟著那一場的閉包一起回收
 *（每場各留一份姿勢圖，打完就放掉，不會一路壓到分頁關掉）。
 */
export type DecodePool = { seen: Set<string>; keep: Map<string, HTMLImageElement> };

/** 撐住 Image 物件的參照：沒人引用的圖下載沒完成就可能被回收（稽核 2026-09-04 低 14）。以網址為鍵，同一張不會留兩份 */
const keep = new Map<string, HTMLImageElement>();
const sharedPool: DecodePool = { seen: warmed, keep };

/**
 * 放掉整頁共用那一份留著的圖（清理 2026-09-22）。
 *
 * 以前只增不減：三關的魔物立繪、遭遇預熱的換階段圖，一路壓到分頁關掉為止。
 * 留參照是為了「下載沒完成前不被回收」與「開打那一刻已經解好」；換關之後上一關的魔物用不到了，
 * 所以 `preloadAct` 抓下一關之前先放掉。放掉的同時把它們從「解過了」拿掉：下一關也會出現的魔物
 *（一般池跨關）才會被重新解好、重新留住，不會因為「登記過」就被跳過、開打時才當場解碼。
 * 還在下載的那幾張不受影響：解碼迴圈自己手上還握著它們。
 */
export function releaseHeldArt(): void {
  for (const url of keep.keys()) warmed.delete(url);
  keep.clear();
}

/**
 * 把一批圖片下載並解碼好（失敗就算了，不該讓流程停掉；失敗的不登記，下一批還會再試）。
 *
 * 為什麼要 `decode()` 不只是 `new Image().src`：光設 src 只是**下載**，
 * 解碼還是留到畫的那一刻才做，該頓的還是會頓。`decode()` 會把解碼也一起做完。
 *
 * `hold` ＝要不要把 `Image` 留在 `pool.keep` 裡，可以給 `true`／`false`，也可以給一個逐張決定的函式
 *（同一批裡有些要留有些不留時用，見 `warmEncounter`）。**底圖一律不留**：一張 1280x720
 * 解碼成點陣圖是 3.5 MB，三關 27 張加起來將近 100 MB，全部壓到分頁關掉為止；而底圖本來就是拿去當
 * `background-image` 用的，樣式一鋪上去瀏覽器自己就會把它留在快取裡，不需要我們多抓一份。
 * 魔物立繪維持留著（那是 2026-09-04 低 14 加的，一張只有幾十 KB）。
 *
 * `urls` 的**順序就是優先序**：工人們從索引 0 往下領號碼牌，排前面的先下載。
 *
 * `priority: 'high'`＝插隊（2026-09-23 0-2）：事件主圖改成照地圖現抓之後，開場那批幾百張還在排隊時
 * 這幾張也得先到——慢網路下瀏覽器把 `new Image()` 一律排成低優先，不插隊就排在整包開場圖後面。
 */
export async function decodeAll(urls: readonly string[], concurrency = 4,
  hold: boolean | ((url: string) => boolean) = true, pool: DecodePool = sharedPool,
  priority?: 'high'): Promise<void> {
  if (typeof Image === 'undefined') return;   // 測試環境沒有瀏覽器
  const todo = urls.filter((u) => !pool.seen.has(u) && !u.startsWith('data:'));
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < todo.length; i = next++) {
      const url = todo[i]!;
      try {
        const img = new Image();
        if (typeof hold === 'function' ? hold(url) : hold) pool.keep.set(url, img);
        if (priority) img.fetchPriority = priority;   // 要在設 src 之前給，設了 src 請求就送出去了
        img.src = url;
        // 沒有 decode() 的瀏覽器退回等 onload，不能直接當作暖好了
        if (typeof img.decode === 'function') await img.decode();
        else await new Promise<void>((res, reject) => { img.onload = () => res(); img.onerror = () => reject(new Error('圖片載入失敗')); });
        pool.seen.add(url);
      } catch { /* 少一張只是那張晚一點出現 */ }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

/**
 * 開場之後在背景把圖全部先載好、先解好。
 *
 * 沒有這一段的話，每張圖都是**畫面要用到的當下**才去下載＋解碼——
 * 第一次進戰鬥，整張戰鬥背景（1280x720）、魔物立繪、球球的七個姿勢
 * 全部同時在你眼前現載，畫面就頓一下。這是「好多很卡」很大一部分的來源。
 *
 * 順序照「多快會用到」排：立繪與圖示馬上要，牌面進戰鬥要，背景最重但可以晚一點。
 * 一次六張：太多會跟畫面搶頻寬，反而開場更慢。
 */
export async function preloadArt(): Promise<void> {
  const order: (keyof Manifest)[] = ['sprites', 'icons', 'cards', 'bg'];
  // 第二、三關才看得到的底圖開場不載，過關時再由 `preloadAct` 補（跟魔物立繪同一套）
  const skip = deferredBgKeys();
  const urls: string[] = [];
  for (const g of order) {
    const group = manifest[g];
    if (!group || Array.isArray(group)) continue;
    for (const [key, v] of Object.entries(group)) {
      if (g === 'bg' && /_r\d+$/.test(key)) continue;   // 結果圖進結果頁才載，與 heroArtUrls 保持一致
      if (g === 'bg' && skip.has(key)) continue;
      // 角色專屬的（菲菲那 300 多張）開場不載：這時還不知道玩家要選誰，選好由 `preloadHeroArt` 補
      if (heroOfKey(key) && !TITLE_ART.has(key)) continue;
      // 秘寶與忍具圖示同理，進入一局才補（`isItemIcon`，2026-09-23 內容擴充第二批）
      if (g === 'icons' && isItemIcon(key)) continue;
      // 雙人專屬牌（27 張、0.67 MB）同理，進大廳才補（`preloadCoopArt`）——只玩單機的人下載量才會跟併入前一樣
      if (g === 'cards' && isCoopOnlyArt(key)) continue;
      if (typeof v === 'string') urls.push(`${BASE}${v}`);
      else if (v) for (const one of Object.values(v)) if (one) urls.push(`${BASE}${one}`);
    }
  }

  // 成功解碼後才登記；失敗的留給後續遭遇預熱重試。不留參照：開場這幾百張交給瀏覽器快取
  await decodeAll(urls, 6, false);
}

export function computeScale(w: number, h: number): number { return Math.min(w / 1280, h / 720); }
