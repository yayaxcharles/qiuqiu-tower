import { encounterById, encounters, enemyById } from '../content/enemies';
import { bossPoolForAct } from '../engine/run';
import type { EnemyDef, EnemyEffect, EnemyPool } from '../engine/types';
import { artUrl, hasMonsterPose, monsterUrl, warmed, type MonsterPose } from './assets';
import { bgKeysForAct } from './bgacts';

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
  for (const id of enemyIdsForAct(act)) { const def = enemyById[id]; if (def && def.art !== 'daxia') keys.add(def.art); }
  return [...keys];
}

function urlsFor(defs: EnemyDef[]): string[] {
  const urls: string[] = [];
  for (const def of defs) {
    if (def.art === 'daxia') continue;   // 師父的立繪組在 sprites 裡，首載本來就有
    for (const pose of POSES) if (hasMonsterPose(def.art, pose)) urls.push(monsterUrl(def.art, pose));
  }
  return [...new Set(urls)];
}

/** 撐住 Image 物件的參照：沒人引用的圖下載沒完成就可能被回收（稽核 2026-09-04 低 14） */
const keep: HTMLImageElement[] = [];

/**
 * 把一批圖片下載並解碼好（失敗就算了，不該讓流程停掉）。
 *
 * `hold` ＝要不要把 `Image` 留在 `keep` 裡，可以給 `true`／`false`，也可以給一個逐張決定的函式
 *（同一批裡有些要留有些不留時用，見 `warmEncounter`）。**底圖一律不留**：一張 1280x720
 * 解碼成點陣圖是 3.5 MB，三關 27 張加起來將近 100 MB，全部壓到分頁關掉為止；而底圖本來就是拿去當
 * `background-image` 用的，樣式一鋪上去瀏覽器自己就會把它留在快取裡，不需要我們多抓一份。
 * 魔物立繪維持留著（那是 2026-09-04 低 14 加的，一張只有幾十 KB）。
 *
 * `urls` 的**順序就是優先序**：工人們從索引 0 往下領號碼牌，排前面的先下載。
 */
async function decodeAll(urls: string[], concurrency = 4,
  hold: boolean | ((url: string) => boolean) = true): Promise<void> {
  if (typeof Image === 'undefined') return;   // 測試環境沒有瀏覽器
  const todo = urls.filter((u) => !warmed.has(u) && !u.startsWith('data:'));
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < todo.length; i = next++) {
      const url = todo[i]!;
      try {
        const img = new Image();
        if (typeof hold === 'function' ? hold(url) : hold) keep.push(img);
        img.src = url;
        // 沒有 decode() 的瀏覽器退回等 onload，不能直接當作暖好了
        if (typeof img.decode === 'function') await img.decode();
        else await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); });
        warmed.add(url);
      } catch { /* 少一張只是那張晚一點出現 */ }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

/**
 * 背景預載整關的魔物立繪**與底圖**（開場預載完 UI 後叫第一關；過關畫面叫下一關）。
 *
 * 底圖也在這裡是 2026-09-10 加的：第二關的木造牆、第三關的夜空石台那 18 張本來在開場就全載，
 * 第一關一輩子看不到。改成跟魔物同一個時機補——過關畫面停留的那幾十秒足夠抓完。
 * 底圖排在魔物前面：一進新關第一眼看到的是地圖與戰鬥背景，魔物還要等走到節點。
 */
export function preloadAct(act: number): Promise<void> {
  const defs = [...enemyIdsForAct(act)].map((id) => enemyById[id]).filter((d): d is EnemyDef => !!d);
  const bg = bgKeysForAct(act).map((k) => artUrl('bg', k));
  // 底圖排前面（一進新關第一眼看到的是地圖與戰鬥背景，魔物還要等走到節點），但**不留參照**。
  // 跟 `warmEncounter` 一樣送**同一批**，不要 `.then()` 串成兩段（稽核 2026-09-10 低-9）：
  // 串起來的話底圖最後一張解完之前魔物一張都不會開始下載，而 `bgKeysForAct` 從 9 個鍵長到 15 個，
  // 這裡雖然沒有時限（過關畫面停留幾十秒）不會出事，但兩支寫法不一致，照著抄就會再踩一次。
  const held = new Set(urlsFor(defs));
  return decodeAll([...new Set([...bg, ...held])], 4, (u) => held.has(u));
}

/** 開打前把這場的魔物（含召喚物）解碼好；最多等 `timeoutMs`，沒等到也照樣開打 */
export function warmEncounter(encounterId: string, timeoutMs = 1500, heroPoses: readonly string[] = []): Promise<void> {
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
  const monsters = urlsFor(defs);
  const held = new Set(monsters);
  const work = decodeAll([...new Set([...monsters, ...heroPoses])], 6, (u) => held.has(u));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((r) => { timer = setTimeout(r, timeoutMs); });
  return Promise.race([work, timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}
