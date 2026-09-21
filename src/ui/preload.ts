import { encounterById, encounters, enemyArtFor, enemyById } from '../content/enemies';
import { bossPoolForAct } from '../engine/run';
import type { EnemyDef, EnemyEffect, EnemyPool } from '../engine/types';
import { artUrl, coopArtUrls, decodeAll, hasMonsterPose, monsterPhaseKey, heroArtUrls, heroOfKey, localHero, monsterUrl, releaseHeldArt, type MonsterPose } from './assets';
import { SLIDES_BY_ACT, bgKeysForAct } from './bgacts';

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

/**
 * 選好角色之後補載這一位（連線是兩位）專屬的圖（總稽核 F 中-1）。
 * 開場的 `preloadArt` 不載任何角色專屬的鍵——那時還不知道玩家要選誰；
 * 球球的靜態圖本來就在開場那批裡；逐格動作圖集等本局角色確定後才補。
 */
export function preloadHeroArt(heroes: readonly (string | undefined)[]): Promise<void> {
  const art = decodeAll(heroArtUrls(heroes), 6, false);
  if (typeof location === 'undefined' || new URLSearchParams(location.search).get('motion') === '0') return art;
  const motion = Promise.all([...new Set(heroes.map((hero) => hero ?? 'ninja'))].map(async (hero) => {
    if (hero === 'ninja') {
      const { preloadQiuqiuMotion } = await import('./qiuqiu-motion');
      await preloadQiuqiuMotion();
    } else if (hero === 'feifei' || hero === 'dangdang' || hero === 'fengfeng') {
      const { preloadCompanionMotion } = await import('./companion-motion');
      await preloadCompanionMotion(hero);
    }
  })).catch((error: unknown) => {
    console.error('逐格動作預載失敗，改用普通立繪', error);
  });
  return Promise.all([art, motion]).then(() => undefined);
}

/** 進大廳才補雙人專屬牌的牌面（開場不載，見 `preloadArt`） */
export function preloadCoopArt(): Promise<void> {
  return decodeAll(coopArtUrls(), 6, false);
}

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
   * 載好才冒出來**——正好是「消失又出現」。平常碰不到（`combat.ts` 的 `warmAll` 開戰時會暖），
   * 但**冷快取的第一場**（例如剛部署完、所有圖的內容都變了那一次）`warmAll` 自己也還在下載，
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
  // 戰鬥畫面掛上時 `combat.ts` 的 `warmAll()` 自己會再暖一次並留自己那份（每場一份、跟著閉包回收），
  // 這裡不必再永久壓一份。
  const monsters = urlsFor(defs, skinHero);
  const held = new Set(monsters);
  const work = decodeAll([...new Set([...monsters, ...heroPoses])], 6, (u) => held.has(u));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((r) => { timer = setTimeout(r, timeoutMs); });
  return Promise.race([work, timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}
