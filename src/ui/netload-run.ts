import type { EnemyDef, RunState, StatusName } from '../engine/types';
import { encounterById, enemyById } from '../content/enemies';
import { nextChoices } from '../engine/map';
import type { HeroVidsHero } from './hero-vids';
import { me } from '../engine/runplayer';
import { artUrl, cardFaceUrls, decodeAll, heroArtUrl, mapHeroKey, warmed, type DecodePool } from './assets';
import type { Sfx } from './audio';
import type * as Preload from './preload';
import { STATUS_ICON } from './status-kind';

/*
 * 慢網路修正（2026-09-30，量測報告 `docs/量測_慢網路聲音與卡頓_20260930.md` 第 4～6 節）——**進入一局那一刻要抓什麼、照什麼順序**。
 *
 * 這一塊是按需載入的（審查 2026-10-01：首載程式只剩 1.3 KB 預算）：封面圖到齊後就在背景先抓好（`main.ts`），
 * 選好角色時 `netload.ts` 的 `warmRun` 叫 `startRun`，通常已經在手上、不多等一趟。
 *
 * A 層（最低可玩完成度，約 360 KB），全部插隊（高優先）、**比既有的背景那批（`preloadHeroArt`）先送出**：
 *   地圖底圖＋節點圖示 → 全部音效 → 戰鬥畫面程式與主角動作資料 → 配音程式與查表。
 * 同一個優先等級裡瀏覽器照送出的先後排，所以順序就是上面那串。
 * A 到齊之後才要 B 層：第一步魔物會上的狀態小圖示 → 第一步走得到的魔物 → 起手牌面 → 主角最先換到的幾張姿勢。
 * 量測的反例：什麼都用高優先一次全開，1 MB 的圖會把 39 KB 的戰鬥程式壓住，0.8 Mbps 進戰鬥反而要 3 到 13 秒（報告 5.3）。
 *
 * 只改「什麼時候下載」：不動畫質、特效、音質，不動任何局面、亂數或連線訊息。
 * 背景那批（主角立繪、逐格動作、這一關其餘魔物）照原本送：音樂延後與大圖集讓路都掛在它身上（使用者裁定音樂不改）。
 */

/** 第一次進大地圖前最多等 A 層多久（跟 `netload.ts` 的 `MAP_GATE_MS` 同一個數）；B 層最晚也這時候開始 */
const B_AFTER_MS = 8000;

/** 全部音效（`Sfx` 的每一個）；慢網路最常被跳過的四個排前面 */
export const ALL_SFX: readonly Sfx[] = ['step', 'enemy_down', 'blocked', 'poison', 'claw', 'hit', 'hit_heavy', 'hurt', 'block', 'dodge', 'thorns',
  'stealth', 'buff', 'debuff', 'heal', 'draw', 'click', 'turn_end', 'turn_start', 'fish', 'buy', 'potion', 'upgrade', 'relic',
  'victory', 'defeat', 'hurt_feifei', 'victory_feifei'];

/**
 * 主角第一場最先換到的幾張姿勢（待機、出招的掌推與爪擊、蜷縮、施術、挨打；鍵寫球球版，`heroArtUrl` 換成那一位的）。
 * 開打前不再等三十張姿勢之後，慢網路量到出第一張牌時這幾張還沒到、主角那一格空白一下（修正報告第 1 節）；所以 B 層先插隊抓。
 * 留參照只留到第一場戰鬥畫面自己把姿勢解好為止（`dropFirstPoses`，審查 低-5：整局壓著一位約 7 MB 解碼後的點陣圖）。
 */
export const FIRST_POSES: readonly string[] = ['hero/ninja', 'hero/ninja_attack', 'hero/ninja_claw', 'hero/ninja_curl', 'hero/ninja_skill', 'hero/ninja_hit'];

/**
 * 地圖圖示這一組**自己留著、整局都留**：共用那一組在進關時會被 `releaseHeldArt` 整組放掉（`preloadAct` 緊接著就叫），
 * 放掉之後離開地圖、瀏覽器把圖丟掉，第二次回到地圖時這幾張又要重新排隊（慢網路實測空了 2 秒）。八張小圖。
 */
let iconPool: DecodePool = { seen: new Set(), keep: new Map() };
/** 主角那幾張姿勢：「解過了」記在共用那份（開打前背景暖姿勢那批就不重抓），參照另外留、第一場開打後放掉 */
let poseKeep = new Map<string, HTMLImageElement>();
let current: RunState | null = null;

/**
 * 首載那幾支（`preload.ts`、`audio.ts`、`screenbg.ts`、`voicegate.ts`）由 `netload.ts` 傳進來：這一塊直接引用的話，
 * 打包會把它們各拆成一個檔、首載程式反而變大（審查 2026-10-01 首載預算，實測過）。
 */
export type RunDeps = Pick<typeof Preload, 'NODE_ICON' | 'follow' | 'preloadHeroArt' | 'relatedIds' | 'urlsFor'> & {
  preloadSfx: (names: readonly Sfx[]) => Promise<unknown>[]; actVariantKey: (base: string, act: number) => string; warmVoice: () => Promise<unknown>;
};

let deps: RunDeps | null = null;
/** 記下首載那幾支（`startRun` 會叫；測試也用它） */
export function useRunDeps(d: RunDeps): void { deps = d; }

/** 進入一局：送出 A 層、接著原本的背景那批；A 到齊（或 8 秒）再送 B 層。回傳 A 層到齊（`pr` 記進度） */
export function startRun(run: RunState, seat: number, pr: Preload.Progress, d: RunDeps): Promise<void> {
  useRunDeps(d);
  current = run;
  iconPool = { seen: new Set(), keep: new Map() };
  poseKeep = new Map();
  const img = (u: string, hold = true): Promise<void> => decodeAll([u], 1, hold, iconPool, 'high');
  const ready = d.follow([
    // 底圖一張 1280 寬的長條，不留參照（樣式鋪上去瀏覽器自己會留，同 `preloadMapEvents`）
    img(artUrl('bg', d.actVariantKey('bg/map_tall', run.act)), false),
    ...[...Object.values(d.NODE_ICON), mapHeroKey(run.act)].map((k) => img(artUrl('icons', k))),
    ...d.preloadSfx(ALL_SFX),
    import('./screens/combat'),
    // 主角新動作的格子資料（`hero-vids/<主角>.json`，各一小塊程式）：戰鬥畫面程式沒帶到它，量測裡它在點下戰鬥格之後才開始抓、4 秒才到。只抓資料，圖集照原本的時機
    ...[...new Set(run.players.map((p) => p.hero ?? 'ninja'))].map((h) => import('./hero-vids').then((m) => m.loadHeroVids((h === 'ninja' ? 'qiuqiu' : h) as HeroVidsHero))),
    d.warmVoice(),
  ], pr);
  void d.preloadHeroArt(run.players.map((p) => p.hero), run.act);
  void Promise.race([ready, new Promise<void>((r) => setTimeout(r, B_AFTER_MS))]).then(() => {
    if (current !== run) return;
    // 狀態小圖示（翻肚、中毒…）排最前面、只抓第一步魔物會上的那幾顆（審查 低-4：原本排在最後、全部十七張，「中毒」那顆慢網路晚到 7.5 秒）
    void decodeAll(statusIconUrls(nextFightDefs(run)), 4, true, iconPool, 'high');
    void preloadNextFights(run);
    void decodeAll(cardFaceUrls(me(run, seat).deck.map((c) => c.cardId)), 3, true, undefined, 'high');
    const poses = [...new Set(run.players.flatMap((p) => FIRST_POSES.map((k) => heroArtUrl(p.hero, k))))];
    void decodeAll(poses, Math.max(1, poses.length), true, { seen: warmed, keep: poseKeep }, 'high');
  });
  return ready;
}

/** 第一場戰鬥畫面自己把姿勢解好、留住了（`combat.ts` 的 `warmHeroes`）：開局先抓的那幾張不必再整局壓著 */
export function dropFirstPoses(): void { poseKeep.clear(); }
/** 測試用：開局先抓、現在還留著的主角姿勢 */
export function _heldFirstPosesForTest(): string[] { return [...poseKeep.keys()]; }

/** 這些魔物（含換階段）會掛上的狀態：牠自己身上的、丟給主角的 */
function statusIconUrls(defs: readonly EnemyDef[]): string[] {
  const names = new Set<StatusName>();
  for (const d of defs) {
    for (const m of [...d.moves, ...(d.phases ?? []).flatMap((ph) => [...ph.moves, ...(ph.onEnterMove ? [ph.onEnterMove] : [])])]) {
      for (const f of m.effects) if (f.kind === 'statusSelf' || f.kind === 'statusPlayer') names.add(f.name);
    }
    for (const ph of d.phases ?? []) for (const f of ph.onEnter) if (f.kind === 'statusSelf' || f.kind === 'statusPlayer') names.add(f.name);
  }
  return [...names].map((n) => artUrl('icons', STATUS_ICON[n]));
}

/*
 * ===== 下一步走得到的戰鬥格先預載（2026-09-30 慢網路修正）=====
 * 那幾場的魔物立繪（含召喚、分裂、換階段）先解好；點下去時 `warmEncounter` 看到已解好就不用等。
 * 開局（上面的 B 層，第一層三格）、每次地圖畫出來（`screens/map.ts`，插隊）、每場戰鬥主角姿勢解好之後
 *（`combat.ts` → `App.warmNextFights`：審查 2026-10-01 中-1，開打那一刻就送會跟戰鬥畫面暖主角姿勢搶頻寬，改成等姿勢解好或 8 秒）各叫一次。
 * **只挑下一步**，不是整張地圖：一格四五張、一步兩三格。魔物變裝照座位 0（跟 `startFight` 傳給 `warmEncounter` 的同一位）。
 * 連線時同伴每投一票地圖就安靜重畫一次：同一張已經送出就不重送；**沒抓成的拿掉記號**，下次再試（審查 低-6）。
 * 只讀地圖與魔物表，不動局面、不碰亂數。
 */
let nextAsked = new Set<string>();
let nextKey = '';

/** 下一步走得到的戰鬥格會出現的魔物（含召喚、分裂出來的） */
export function nextFightDefs(run: RunState): EnemyDef[] {
  const ids = new Set<string>();
  for (const n of nextChoices(run.map, run.currentNode)) {
    if (n.encounterId && (n.type === '戰鬥' || n.type === '大魔物' || n.type === '塔主')) for (const id of encounterById[n.encounterId]?.enemies ?? []) deps?.relatedIds(id, ids);
  }
  return [...ids].map((id) => enemyById[id]).filter((d): d is EnemyDef => !!d);
}

export function nextFightUrls(run: RunState): string[] {
  return deps ? deps.urlsFor(nextFightDefs(run), run.players[0]?.hero ?? 'ninja') : [];
}

export async function preloadNextFights(run: RunState, high = true): Promise<void> {
  const key = `${run.seed}|${run.act}`;
  if (key !== nextKey) { nextKey = key; nextAsked = new Set(); }
  const fresh = nextFightUrls(run).filter((u) => !nextAsked.has(u));
  for (const u of fresh) nextAsked.add(u);
  await decodeAll(fresh, Math.max(1, fresh.length), true, undefined, high ? 'high' : undefined);
  for (const u of fresh) if (!warmed.has(u)) nextAsked.delete(u);
}
