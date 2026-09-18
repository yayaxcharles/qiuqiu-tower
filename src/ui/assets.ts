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
const HERO_NOT_IN_COMBAT = new Set(['hero/cover', 'hero/feifei_cover', 'hero/dangdang_cover', 'hero/idle', 'hero/armed']);
/**
 * 帶角色名、卻在**選角之前**就會出現的圖：首頁兩張「參上」並排（2026-09-15）。
 * 開場預載不能因為鍵名帶 `feifei` 就跳過，戰鬥暖圖也不用它（總稽核 2026-09-16 戊 M3）。
 */
export const TITLE_ART: ReadonlySet<string> = new Set(['hero/feifei_cover', 'hero/dangdang_cover']);

/**
 * 這個鍵是哪一位角色專屬的；`null`＝共用或球球的。
 *
 * 菲菲的素材鍵都帶 `feifei`（`hero/feifei_*`、`card/feifei_*`、`bg/event_feifei_*`、`bg/feifei_still_*`、
 * `icon/map_hero_feifei_*`），球球的沒有前綴——那是 main 時代留下來的命名，正好讓「只玩球球的人
 * 開場下載的東西」跟併入她之前一模一樣（總稽核 F 中-1：原本她的 300 多張圖全部算進每個人的首載）。
 */
export function heroOfKey(key: string): string | null {
  const m = /(?:^|[/_])(feifei|samurai|dangdang)(?:_|$)/.exec(key);
  return m ? m[1]! : null;
}

/** 這一局登場的角色（單機一位、連線兩位）的戰鬥姿勢圖；沒登場的那位不暖，免得跟魔物立繪搶下載（總稽核 F 中-3） */
export function heroSpriteUrls(heroes: readonly (string | undefined)[] = ['ninja']): string[] {
  const want = new Set(heroes.map((h) => h ?? 'ninja'));
  // 排掉戰鬥裡永遠用不到的三張（稽核 2026-09-10 低-2）：`cover` 只有標題畫面用，
  // `idle`／`armed` 是舊素材、`combat.ts` 的註解自己寫「目前沒排到位置，留著備用」。
  // 三張共 89 KB，佔這批暖圖的一成一，卻只是擋在魔物前面。
  return Object.entries(manifest.sprites)
    .filter(([k]) => k.startsWith('hero/') && !HERO_NOT_IN_COMBAT.has(k) && want.has(heroOfKey(k) ?? 'ninja'))
    .map(([, v]) => `${BASE}${v}`);
}

/**
 * 選好角色之後才補載的那一位（連線是兩位）專屬的圖。球球沒有專屬鍵，所以他什麼都不用補。
 * 結果圖（`_r<n>`）與二三關才會遇到的事件底圖照 `preloadArt` 同一套規矩跳過。
 */
/** 雙人專屬牌的牌面（球球版與菲菲版都算，兩位在連線裡都可能拿到） */
export function coopArtUrls(): string[] {
  return Object.entries(manifest.cards)
    .filter(([k]) => COOP_ONLY_ART.has(k) || COOP_ONLY_ART.has(k.replace(/^card\/(?:feifei|samurai|dangdang)_/, 'card/')))
    .map(([, v]) => `${BASE}${v}`);
}

/** 這個鍵是不是雙人專屬牌的牌面（給分關載入的清單用） */
export function isCoopOnlyArt(key: string): boolean {
  return COOP_ONLY_ART.has(key) || COOP_ONLY_ART.has(key.replace(/^card\/(?:feifei|samurai|dangdang)_/, 'card/'));
}

export function heroArtUrls(heroes: readonly (string | undefined)[]): string[] {
  const want = new Set(heroes.map((h) => h ?? 'ninja'));
  const skip = deferredBgKeys();
  const urls: string[] = [];
  for (const g of ['sprites', 'icons', 'cards', 'bg'] as const) {
    for (const [key, v] of Object.entries(manifest[g])) {
      const who = heroOfKey(key);
      if (!who || !want.has(who)) continue;
      if (g === 'bg') {
        if (/_r\d+$/.test(key) || /\/[a-z]+_still_/.test(key)) continue;   // 結果圖與幻燈片本來就是點到才載
        if (skip.has(key) || skip.has(key.replace(`_${who}_`, '_'))) continue;   // 事件底圖照共用那張的關數分流
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
const HERO_PREFIX: Readonly<Record<string, string>> = { ninja: 'ninja', samurai: 'samurai', feifei: 'feifei', dangdang: 'dangdang' };

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
export function setLocalHero(hero: string | undefined): void { localHeroId = hero ?? 'ninja'; }
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
export function cardArtKey(baseKey: string, hero?: string): string {
  // `hero` 只有卡牌圖鑑會填（那裡可以在標題畫面切角色看），其餘一律用這一局的那位
  const who = hero ?? localHeroId;
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
export function eventArtKey(id: string): string {
  const base = `bg/event_${id}`;
  if (localHeroId === 'ninja') return base;
  const mine = `bg/event_${localHeroId}_${id}`;
  return manifest.bg[mine] !== undefined ? mine : base;
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
      // 角色專屬的（菲菲那 300 多張）開場不載：這時還不知道玩家要選誰，選好由 `preloadHeroArt` 補
      if (heroOfKey(key) && !TITLE_ART.has(key)) continue;
      // 雙人專屬牌（27 張、0.67 MB）同理，進大廳才補（`preloadCoopArt`）——只玩單機的人下載量才會跟併入前一樣
      if (g === 'cards' && COOP_ONLY_ART.has(key)) continue;
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
