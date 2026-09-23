import { encounterById, encounters, enemyArtFor, enemyById } from '../content/enemies';
import { eventById, events } from '../content/events';
import { bossPoolForAct } from '../engine/run';
import type { EnemyDef, EnemyEffect, EnemyPool, QmarkVariant, RunState } from '../engine/types';
import { QMARK_ART, qmarkProtected } from '../engine/qmark';
import { MERCHANT_SPRITES, artUrl, coopArtUrlsFor, decodeAll, eventArtHero, eventArtKey, hasMonsterPose, monsterPhaseKey, heroArtUrls, heroOfKey, itemIconUrls, localHero, monsterUrl, releaseHeldArt, warmed, type DecodePool, type MonsterPose } from './assets';
import { SLIDES_BY_ACT, bgKeysForAct } from './bgacts';
import { netSpeed } from './netspeed';
import { actVariantKey } from './screenbg';

/**
 * 魔物立繪的分關預載（使用者 2026-09-04：「戰鬥中圖要直接到位，不然會有灰影」）。
 *
 * 首載只抓 UI／牌面／背景與**第一關**會遇到的魔物；第二、三關的魔物等過關時再抓。
 * 另外每場戰鬥開打前先把這場會出現的（含牠們召喚得出來的）解碼好，最多等 1.5 秒，
 * 沒等到也照開——寧可偶爾閃一下也不能卡住不開打。
 *
 * 首載預算（tools/check_size.py）配合這裡：第一關用不到的魔物歸「分關載入」，不算首載。
 */

const POSES: MonsterPose[] = ['idle', 'attack', 'hurt', 'block', 'down'];

/** 這隻怪自己＋牠召得出來的、分裂得出來的全部魔物 id */
function relatedIds(id: string, out: Set<string>): void {
  if (out.has(id)) return;
  const def = enemyById[id];
  if (!def) return;
  out.add(id);
  const fx: EnemyEffect[] = [];
  for (const m of def.moves) fx.push(...m.effects);
  for (const ph of def.phases ?? []) { fx.push(...ph.onEnter); for (const m of ph.moves) fx.push(...m.effects); if (ph.onEnterMove) fx.push(...ph.onEnterMove.effects); }
  for (const f of fx) if (f.kind === 'summon') relatedIds(f.enemyId, out);
  if (def.splitInto) relatedIds(def.splitInto.enemyId, out);
}

/** 這一關可能遇到的所有魔物（一般池、菁英、關主、召喚物） */
export function enemyIdsForAct(act: number): Set<string> {
  const pools: EnemyPool[] = act >= 2 ? ['中', '強', '大魔物'] : ['弱', '中', '強', '大魔物'];
  const ids = new Set<string>();
  for (const enc of encounters) {
    if (enc.hidden) continue;   // 立繪還沒到齊的遭遇地圖抽不到，也不用預載（稽核 2026-09-04 中 3）
    const inAct = !enc.acts || enc.acts.includes(act);
    const take = (pools.includes(enc.pool) && inAct) || (enc.pool === '塔主' && bossPoolForAct(act).includes(enc.id));
    if (!take) continue;
    for (const id of enc.enemies) relatedIds(id, ids);
  }
  // 鏡子走廊那場（事件觸發，池標召喚）依關數接 _a<關數>
  for (const enc of encounters) if (enc.id === 'mirror_duel' || enc.id === `mirror_duel_a${act}`) for (const id of enc.enemies) relatedIds(id, ids);
  return ids;
}

/** 這一關會用到的立繪鍵（manifest.monsters 的鍵） */
export function monsterArtKeysForAct(act: number): string[] {
  const keys = new Set<string>();
  for (const id of enemyIdsForAct(act)) {
    const def = enemyById[id];
    if (!def || def.art === 'daxia') continue;
    keys.add(def.art);
    // 換階段立繪也在進關時預載；大小清單必須跟實際請求使用同一套鍵，
    // 否則這些圖會被誤標成「沒用到」，從首載報告漏掉。
    for (let phase = 1; phase <= (def.phases?.length ?? 0); phase += 1) keys.add(`${def.art}_p${phase + 1}`);
  }
  return [...keys];
}

/** `skinHero`＝決定魔物變裝的角色（鏡中菲菲看的是**座位 0**，連線時不一定是本機這位；推前審查 2026-09-15 低-1） */
function urlsFor(defs: EnemyDef[], skinHero: string | undefined = localHero(), includePhases = true): string[] {
  const urls: string[] = [];
  for (const def of defs) {
    if (def.art === 'daxia') continue;   // 師父的立繪組在 sprites 裡，首載本來就有
    // 有變裝的（玩菲菲時的鏡中球球＝影菲菲）要暖**變裝那組**，不然真正會出現在畫面上的那五張沒人先抓。
    // 圖還沒進倉時 `enemyArtFor` 回的鍵在清單裡查不到，`assets.ts` 會退回原本那組，等於沒差
    const art = enemyArtFor(def.id, skinHero);
    for (const pose of POSES) if (hasMonsterPose(art, pose)) urls.push(monsterUrl(art, pose));
    /*
     * 換階段之後那組也要先抓（2026-09-16）。不抓的話血打到門檻那一刻要現載，
     * 玩家看到的是「變身那一拍先閃一下白」——換階段本來就是這場仗最該看清楚的一刻。
     * 還沒生的階段圖 `monsterPhaseKey` 會退回前一階段，這裡就自然收不到新網址，不會多抓。
     */
    for (let phase = 1; includePhases && phase <= (def.phases?.length ?? 0); phase += 1) {
      const pk = monsterPhaseKey(art, phase);
      if (pk === art) continue;
      for (const pose of POSES) if (hasMonsterPose(pk, pose)) urls.push(monsterUrl(pk, pose));
    }
  }
  return [...new Set(urls)];
}

/**
 * 背景預載整關的魔物立繪**與底圖**（開場預載完 UI 後叫第一關；過關畫面叫下一關）。
 *
 * 底圖也在這裡是 2026-09-10 加的：第二關的木造牆、第三關的夜空石台那 18 張本來在開場就全載，
 * 第一關一輩子看不到。改成跟魔物同一個時機補——過關畫面停留的那幾十秒足夠抓完。
 * 底圖排在魔物前面：一進新關第一眼看到的是地圖與戰鬥背景，魔物還要等走到節點。
 */
/** 上一次 `preloadAct` 抓的是第幾關：換了關才放掉上一關留著的圖（清理 2026-09-22，見 `releaseHeldArt`） */
let heldAct = 0;

export function preloadAct(act: number, skinHero: string | undefined = localHero()): Promise<void> {
  if (act !== heldAct) { releaseHeldArt(); heldAct = act; }
  const defs = [...enemyIdsForAct(act)].map((id) => enemyById[id]).filter((d): d is EnemyDef => !!d);
  const bg = bgKeysForAct(act)
    .filter((key) => {
      const who = heroOfKey(key);
      return !who || who === (skinHero ?? 'ninja');
    })
    .map((k) => artUrl('bg', k));
  // 底圖排前面（一進新關第一眼看到的是地圖與戰鬥背景，魔物還要等走到節點），但**不留參照**。
  // 跟 `warmEncounter` 一樣送**同一批**，不要 `.then()` 串成兩段（稽核 2026-09-10 低-9）：
  // 串起來的話底圖最後一張解完之前魔物一張都不會開始下載，而 `bgKeysForAct` 從 9 個鍵長到 15 個，
  // 這裡雖然沒有時限（過關畫面停留幾十秒）不會出事，但兩支寫法不一致，照著抄就會再踩一次。
  // 換階段圖等確定進入該遭遇後由 `warmEncounter` 補；進關時先載全關基礎姿勢即可。
  const held = new Set(urlsFor(defs, skinHero, false));
  return decodeAll([...new Set([...bg, ...held])], 4, (u) => held.has(u));
}

/**
 * 這一關的過關幻燈片先抓起來（2026-09-11）。
 *
 * 由關主門呼叫：門停在那裡等玩家點，打完關主才會播這幾張，中間隔著一整場關主戰，來得及。
 * 不留參照（`hold: false`）——那幾張只播一次，播完就該讓瀏覽器回收。
 * 不 await：門不該為了預載等在那裡。
 */
export function warmSlides(act: number): void {
  const i = Math.min(Math.max(act, 1), 3) - 1;
  // 幻燈片照角色換前綴（跟 `storyslides.ts` 的 `stillKey` 同一條）：
  // 菲菲的是 `bg/feifei_still_*`、噹噹的是 `bg/dangdang_still_*`；球球沒有前綴
  const h = localHero();
  const mine = (k: string): string => (h === 'ninja' ? k : k.replace('bg/still_', `bg/${h}_still_`));
  void decodeAll(SLIDES_BY_ACT[i]!.map((k) => artUrl('bg', mine(k))), 3, false);
}

/*
 * ===== 事件主圖照這張地圖現抓（2026-09-23 內容擴充第〇批 0-2）=====
 *
 * 原本三十張球球版事件主圖全在首載（約 0.9 MB），玩菲菲、噹噹、封封的人選角時又各補三十幾張自己的；
 * 一局一關實際只走進兩三個事件格。地圖在進關那一刻就排好了，所以改成：
 * 地圖畫面一出來，只抓**這張地圖上排到的事件格**＋**這一關待出的後集**（走進第一個事件格就會換成它），
 * 走進事件格時再確認那一張已經解好（`warmEventArt`，`app.ts` 的 `enterEvent` 等它）。
 *
 * 鍵跟事件畫面挑圖**走同一條路**（`eventArtKey` ＋ `eventArtHero`）：本機這一位有自己的版本就抓她的、沒有退回球球那張；
 * 連線的鏡子走廊照座位 0 挑。兩邊算法不一樣的話，抓的是一張、畫的是另一張，等於沒抓。
 */

/** 這張地圖上看得到的事件：待出的後集排前面（第一個事件格就會換成它），其餘照樓層由近到遠 */
export function mapEventIds(run: RunState): string[] {
  // 判準照抄 `engine/run.ts` 的 `enterEvent`（`tests/ui/map_event_art.test.ts` 拿真的 `chooseNode` 對過）
  const pending = events
    .filter((e) => run.flags[`sequel:${e.id}`] && !run.flags[`event:${e.id}`] && (!e.acts || e.acts.includes(run.act)))
    .map((e) => e.id);
  const onMap = run.map.nodes
    .filter((n) => n.type === '事件' && n.eventId)
    .sort((a, b) => a.floor - b.floor)
    .map((n) => n.eventId!);
  return [...new Set([...pending, ...onMap])];
}

/** 事件畫面會畫的那一張主圖（同 `screens/event.ts` 的 `eventArt(ev.id, artHero)`） */
function eventMainUrl(run: RunState, eventId: string): string {
  return artUrl('bg', eventArtKey(eventId, eventArtHero(eventId, run.players.map((p) => p.hero))));
}

/** 這張地圖要先抓的事件主圖網址（清單裡沒有的圖回剪影網址，`decodeAll` 自己會跳過） */
export function mapEventArtUrls(run: RunState): string[] {
  return mapEventIds(run).map((id) => eventMainUrl(run, id));
}

/**
 * 事件畫面的底圖（同 `screens/event.ts` 第一行的 `screenBg(actVariantKey('bg/screen_event', …))`）。
 * 它本來就在開場那批裡，但排在幾百張圖的最後；慢網路（約 1.6 Mbps）實測第一次走進事件格時它還沒到，
 * 事件畫面整片露出舞台的米白底一秒多才補上（2026-09-23 實機）。所以跟主圖一起插隊、一起等。
 */
export function eventScreenBgUrl(run: RunState): string {
  return artUrl('bg', actVariantKey('bg/screen_event', run.act));
}

/**
 * 這張地圖的事件主圖**留參照、自己一組**：一張 560x420，解開不到 1 MB，一張地圖六七張（外加事件畫面底圖一張）；
 * 換了地圖（下一關、新的一局）整組放掉。不放進共用那一組，是因為換關的 `releaseHeldArt` 會把共用的整組放掉，
 * 而走進事件格那一刻要的就是「已經解好」。
 */
let mapEventPool: DecodePool = { seen: new Set(), keep: new Map() };
let mapEventKey = '';
/** 這張地圖已經送出去的：地圖畫面連線時每投一票就安靜重畫一次，同一張不重送 */
let mapEventAsked = new Set<string>();

/** 這一局這一關的那一組（換了地圖就整組放掉、重開一組） */
function mapEventPoolFor(run: RunState): DecodePool {
  const key = `${run.seed}|${run.act}|${run.players.map((p) => p.hero ?? 'ninja').join(',')}`;
  if (key !== mapEventKey) {
    mapEventKey = key;
    mapEventPool = { seen: new Set(), keep: new Map() };
    mapEventAsked = new Set();
  }
  return mapEventPool;
}

export function preloadMapEvents(run: RunState): Promise<void> {
  const pool = mapEventPoolFor(run);
  /*
   * **地圖自己的底圖排第一**：這一批插隊，第一次看到地圖時（慢網路下開場那幾百張還在排）會搶在地圖底圖前面，
   * 實測地圖先空著一兩秒才鋪上底圖。它就是玩家眼前這一張，排第一、不留參照（1280 寬的長條圖解開好幾 MB，
   * 樣式鋪上去瀏覽器自己會留著，見 `decodeAll` 的說明）。
   */
  const mapBg = artUrl('bg', actVariantKey('bg/map_tall', run.act));
  const fresh = [...new Set([mapBg, eventScreenBgUrl(run), ...mapEventArtUrls(run)])].filter((u) => !mapEventAsked.has(u));
  for (const u of fresh) mapEventAsked.add(u);
  // 插隊（`priority: 'high'`）：第一次看到地圖時開場那幾百張多半還在排隊，這幾張不插隊就排在最後
  return decodeAll(fresh, 3, (u) => u !== mapBg, pool, 'high');
}

/**
 * 走進事件格時等那一張主圖與事件畫面的底圖解好，最多 `timeoutMs`（`app.ts` 的 `enterEvent`）。
 * 地圖預載已經抓好就立刻結束；還在路上（或上次失敗）就插隊再要一次。
 * 時限到了照樣進去——網路整個卡住時不讓整局停在地圖上（同 `startFight` 等連線牌面的 6 秒）。
 */
export function warmEventArt(run: RunState, eventId: string, timeoutMs = 6000): Promise<void> {
  const work = decodeAll([eventScreenBgUrl(run), eventMainUrl(run, eventId)], 2, true, mapEventPoolFor(run), 'high');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((r) => { timer = setTimeout(r, timeoutMs); });
  return Promise.race([work, timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}

/**
 * 這個事件各選項的結果圖（同 `screens/event.ts` 的 `eventArt(c.resultArt, artHero)`；沒有結果圖的選項沿用主圖，不列）。
 * 結果圖原本是點了選項、畫面建出 `<img>` 那一刻才抓，慢網路下結果那一塊先空著（2026-09-23 主控補充）。
 */
function eventResultUrl(run: RunState, eventId: string, choice: number): string | null {
  const art = eventById[eventId]?.choices[choice]?.resultArt;
  return art ? artUrl('bg', eventArtKey(art, eventArtHero(eventId, run.players.map((p) => p.hero)))) : null;
}

export function eventResultUrls(run: RunState, eventId: string): string[] {
  const n = eventById[eventId]?.choices.length ?? 0;
  const urls = Array.from({ length: n }, (_, i) => eventResultUrl(run, eventId, i)).filter((u): u is string => u !== null);
  return [...new Set(urls)];
}

/** 進到事件畫面就在背景抓這個事件所有選項的結果圖：插隊、留參照（跟主圖同一組），同一張不重送（連線每投一票就重畫一次） */
export function preloadEventResults(run: RunState, eventId: string): Promise<void> {
  const pool = mapEventPoolFor(run);
  const fresh = eventResultUrls(run, eventId).filter((u) => !mapEventAsked.has(u));
  for (const u of fresh) mapEventAsked.add(u);
  return decodeAll(fresh, 3, true, pool, 'high');
}

/** 選了這個選項、要畫結果之前等那張結果圖解好（`screens/event.ts` 的 `whenResultArtReady`）；沒有結果圖就立刻好。上限同主圖 */
export function warmResultArt(run: RunState, eventId: string, choice: number, timeoutMs = 6000): Promise<void> {
  const url = eventResultUrl(run, eventId, choice);
  if (!url) return Promise.resolve();
  const work = decodeAll([url], 1, true, mapEventPoolFor(run), 'high');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((r) => { timer = setTimeout(r, timeoutMs); });
  return Promise.race([work, timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}

/*
 * ===== 問號格變化的圖（2026-09-23 內容擴充第三批，設計稿 3-7）=====
 * 三張揭曉圖（本機這一位的版本，鍵走 `eventArtKey`、跟畫面挑圖同一條）＋行腳商三張立繪。開場、選角、進關都不載；
 * 地圖上還有會變的問號格才背景抓（不插隊：一局平均遇不到一次，不跟這張地圖的事件主圖搶），跟事件主圖留在同一組、換地圖就放掉。
 * 真的走進變了的那一格時插隊再要一次、最多等 6 秒（`warmQmarkArt`，`app.ts` 的 `enterQmark`）。
 */
export function qmarkArtUrls(variant?: QmarkVariant): string[] {
  const kinds = variant ? [variant] : (Object.keys(QMARK_ART) as QmarkVariant[]);
  const sprites = !variant || variant === '行腳商' ? MERCHANT_SPRITES : [];
  return [...kinds.map((k) => artUrl('bg', eventArtKey(QMARK_ART[k]))), ...sprites.map((k) => artUrl('sprites', k))];
}

/** 這張地圖上還有沒有會變的問號格（還沒走過、不是 5F／後集／鏈／稀有事件） */
export function mapHasQmark(run: RunState): boolean {
  return run.map.nodes.some((n) => n.type === '事件' && !n.variant && !qmarkProtected(n) && !run.trail.includes(n.id));
}

export function preloadQmarkArt(run: RunState): Promise<void> {
  if (!mapHasQmark(run)) return Promise.resolve();
  const fresh = qmarkArtUrls().filter((u) => !mapEventAsked.has(u));
  for (const u of fresh) mapEventAsked.add(u);
  return decodeAll(fresh, 2, true, mapEventPoolFor(run));
}

/** 走進變了的那一格：這一種的揭曉圖（伏擊、行腳商還有事件畫面那張底圖，行腳商的攤子也擺在那裡）插隊解好，最多 `timeoutMs` */
export function warmQmarkArt(run: RunState, variant: QmarkVariant, timeoutMs = 6000): Promise<void> {
  const urls = [...(variant !== '路邊紙箱' ? [eventScreenBgUrl(run)] : []), ...qmarkArtUrls(variant)];
  const work = decodeAll(urls, 3, true, mapEventPoolFor(run), 'high');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((r) => { timer = setTimeout(r, timeoutMs); });
  return Promise.race([work, timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}

/** 這張事件圖（主圖或結果圖）解好了沒：結果圖還沒好的話，事件畫面先用主圖頂著（`screens/event.ts` 的 `eventArt`） */
export function eventArtReady(run: RunState, url: string): boolean {
  return mapEventPoolFor(run).seen.has(url) || warmed.has(url);
}

/** 等這張事件圖解好，不設時限（先用主圖頂著的那一張，解好就換上）；解不出來也會結束，之後照 `eventArtReady` 判斷 */
export function whenEventArtDecoded(run: RunState, url: string): Promise<void> {
  return decodeAll([url], 1, true, mapEventPoolFor(run), 'high');
}

/** 測試用：這張地圖現在留著哪幾張事件主圖（與結果圖） */
export function _mapEventHeldForTest(): string[] { return [...mapEventPool.keep.keys()]; }

/**
 * 選好角色之後補載這一位（連線是兩位）專屬的圖（總稽核 F 中-1）。
 * 開場的 `preloadArt` 不載任何角色專屬的鍵——那時還不知道玩家要選誰；
 * 球球的靜態圖本來就在開場那批裡；逐格動作圖集等本局角色確定後才補。
 * 秘寶與忍具圖示也在這裡補（2026-09-23 內容擴充第二批，見 `assets.ts` 的 `isItemIcon`），排在角色專屬的後面：
 * 開局第一個畫面（序章、地圖）只用得到狀態列上那一兩件，那幾張自己的 `<img>` 會先去要。
 */
export function preloadHeroArt(heroes: readonly (string | undefined)[]): Promise<void> {
  const art = decodeAll([...new Set([...heroArtUrls(heroes), ...itemIconUrls()])], 6, false);
  if (typeof location === 'undefined' || new URLSearchParams(location.search).get('motion') === '0') return art;
  // 慢網路：逐格動作排在這一位的靜態圖後面（2026-09-23）——動作還沒到時畫面靠的就是靜態立繪與牌面，小圖先到；
  // 大圖集另外還有 `heavy-lane.ts` 管同時幾張、開場那批抓完才開始。快網路照原本兩邊一起抓（主控裁定：一般情況不能變慢）
  const motion = netSpeed().then((s) => (s === 'slow' ? art : undefined)).then(() => Promise.all([...new Set(heroes.map((hero) => hero ?? 'ninja'))].map(async (hero) => {
    if (hero === 'ninja') {
      const { preloadQiuqiuMotion } = await import('./qiuqiu-motion');
      await preloadQiuqiuMotion();
    } else if (hero === 'feifei' || hero === 'dangdang' || hero === 'fengfeng') {
      const { preloadCompanionMotion } = await import('./companion-motion');
      await preloadCompanionMotion(hero);
    }
  }))).catch((error: unknown) => {
    console.error('逐格動作預載失敗，改用普通立繪', error);
  });
  return Promise.all([art, motion]).then(() => undefined);
}

/**
 * 連線開局後補這一組搭檔的連線牌面（開場與單人都不載，見 `preloadArt`、`heroArtUrls`）。
 *
 * 2026-09-23 批次 coopload 改了三件事：
 *  1. **只抓這一組**（`coopArtUrlsFor`）：原本進大廳就抓全部 278 張、8.6 MB，一局只用得到二十幾張；
 *  2. **留參照、自己一組**：原本解完不留（`hold: false`），瀏覽器隨時可以把圖從記憶體丟掉，
 *     實測第一場戰鬥手牌上的連線牌在畫出來那一刻還是空的、要重新下載。
 *     這一組二十幾張、解碼後幾 MB，整局都用得到（獎勵、罐頭鋪、牌組一覽），所以整局留著；
 *     不放進共用那一組，是因為換關的 `releaseHeldArt` 會把共用的整組放掉；
 *  3. **換了搭檔就換一組**：同一個分頁回標題、兩人換角色再開一局時，上一組放掉、補抓新組合。
 *     同一組再叫一次就沿用手上那一份，不重抓。
 * 回傳（與 `coopArtReady`）＝這一組抓完的時候；開打前等它（`app.ts` 的 `startFight`）。
 */
let coopPool: DecodePool = { seen: new Set(), keep: new Map() };
let coopPair = '';
let coopDone: Promise<void> = Promise.resolve();

export function preloadCoopArt(heroes: readonly (string | undefined)[]): Promise<void> {
  const urls = coopArtUrlsFor(heroes);
  const pair = urls.join('\n');
  if (pair === coopPair) return coopDone;
  coopPair = pair;
  coopPool = { seen: new Set(), keep: new Map() };
  coopDone = decodeAll(urls, 6, true, coopPool);
  return coopDone;
}

/** 這一組連線牌面抓完了沒（沒開過連線局＝已完成） */
export function coopArtReady(): Promise<void> { return coopDone; }

/** 測試用：現在手上留著哪幾張連線牌面 */
export function _coopArtHeldForTest(): string[] { return [...coopPool.keep.keys()]; }

/** 開打前把這場的魔物（含召喚物）解碼好；最多等 `timeoutMs`，沒等到也照樣開打 */
export function warmEncounter(encounterId: string, timeoutMs = 1500, heroPoses: readonly string[] = [],
  skinHero: string | undefined = localHero()): Promise<void> {
  const enc = encounterById[encounterId];
  if (!enc) return Promise.resolve();
  const ids = new Set<string>();
  for (const id of enc.enemies) relatedIds(id, ids);
  const defs = [...ids].map((id) => enemyById[id]).filter((d): d is EnemyDef => !!d);
  /**
   * 球球那三十張姿勢也一起暖（2026-09-10，使用者回報「球球的腳色會突然消失再出現」）。
   *
   * 換姿勢是直接換 `<img>` 的 `src`。圖已經在快取裡就是無縫的，**還沒下載好就會先畫成一片空白、
   * 載好才冒出來**——正好是「消失又出現」。平常碰不到（`combat.ts` 的 `warmHeroes` 開戰時會暖），
   * 但**冷快取的第一場**（例如剛部署完、所有圖的內容都變了那一次）`warmHeroes` 自己也還在下載，
   * 玩家已經在出牌了。放進這裡就會卡在既有的 1.5 秒上限內先抓完，不另外增加等待。
   */
  // **魔物排前面**（稽核 2026-09-10 中-1）：球球那 27 張（`heroSpriteUrls()` 排掉了
  // `hero/cover`／`idle`／`armed`）是 787 KB，一場遭遇的魔物立繪中位數只有
  // 64.5 KB。`decodeAll` 的六個工人從同一個索引往下領號碼牌，球球排前面等於要等約 24 張下載完
  // 才輪到第一張魔物圖——冷快取又點得快的話，魔物必然吃滿 1.5 秒還沒好，
  // 等於把「球球突然消失」換成「魔物突然出現」。魔物開打第一格就在畫面上，球球的替代姿勢
  // 最快也要等玩家出第一張牌，先後很明確。
  //
  // **兩批要送進同一次 `decodeAll`**，不能 `.then()` 串成兩段（稽核 2026-09-10 低-3）：
  // 串起來的話，魔物那批**最後一張**解完之前球球一張都不會開始下載——魔物只要吃滿 1.5 秒，
  // 球球等於整批沒暖到，正好是這段當初要修的那個毛病。合成一串交給同一組工人，
  // 空出來的工人就會自己往下接球球那段，兩批的頭尾自然交疊，優先序還是靠順序決定。
  // `hold` 逐張決定：魔物那批照 2026-09-04 低 14 的規矩留參照；球球那 27 張解成點陣圖約 33 MB，
  // 戰鬥畫面掛上時 `combat.ts` 的 `warmHeroes()` 自己會再暖一次並留自己那份（`warmPool`，每場一份、跟著閉包回收），
  // 這裡不必再永久壓一份。
  const monsters = urlsFor(defs, skinHero);
  const held = new Set(monsters);
  const work = decodeAll([...new Set([...monsters, ...heroPoses])], 6, (u) => held.has(u));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((r) => { timer = setTimeout(r, timeoutMs); });
  return Promise.race([work, timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}
