import type { RunState } from '../engine/types';
import type { HeroVidsHero } from './hero-vids';
import { me } from '../engine/runplayer';
import { t } from '../i18n';
import { BASE, artUrl, cardFaceUrls, decodeAll, heroArtUrl, manifestImagePaths, mapHeroKey, type DecodePool } from './assets';
import { preloadSfx } from './audio';
import { el } from './dom';
import { NODE_ICON, follow, preloadHeroArt, preloadNextFights, type Progress } from './preload';
import { actVariantKey } from './screenbg';
import { warmVoice } from './voicegate';

/*
 * 慢網路修正（2026-09-30，量測報告 `docs/量測_慢網路聲音與卡頓_20260930.md` 第 4～6 節）。
 *
 * 進入一局（`App.adoptRun`）那一刻照順序先要「最低可玩完成度」（A 層，約 360 KB）：
 *   地圖底圖＋節點圖示 → 全部音效 → 戰鬥畫面程式 → 配音程式與查表。
 * 全部插隊（高優先）、**比既有的背景那批（`preloadHeroArt`）先送出**；同一個優先等級裡瀏覽器照送出的先後排，所以順序就是上面那串。
 * A 到齊之後才要 B 層（第一步走得到的魔物、起手牌面、主角最先換到的幾張姿勢）——量測的反例：什麼都用高優先一次全開，
 * 1 MB 的圖會把 39 KB 的戰鬥程式壓住，0.8 Mbps 進戰鬥反而要 3 到 13 秒（報告 5.3）。
 *
 * 只改「什麼時候下載」：不動畫質、特效、音質，不動任何局面、亂數或連線訊息。
 * 背景那批（主角立繪、逐格動作、這一關其餘魔物）照原本的時機開始：音樂延後與大圖集讓路都掛在它身上，
 * 延後它就等於改了背景音樂的時機（使用者裁定不改）。
 */

let cur: { run: RunState; pr: Progress; ready: Promise<void> } | null = null;
/**
 * 地圖圖示這一組**自己留著、整局都留**：共用那一組在進關時會被 `releaseHeldArt` 整組放掉（`preloadAct` 緊接著就叫），
 * 放掉之後離開地圖、瀏覽器把圖丟掉，第二次回到地圖時這幾張又要重新排隊（慢網路實測空了 2 秒）。八張小圖，解開不到 1 MB。
 */
let pool: DecodePool = { seen: new Set(), keep: new Map() };

/** 第一次進大地圖前最多等 A 層多久（報告：0.8 Mbps 在爭搶下最慢 7 秒）；到了照樣進去、背景繼續抓 */
export const MAP_GATE_MS = 8000;

/**
 * 主角第一場最先換到的幾張姿勢（待機、出招的掌推與爪擊、蜷縮、施術、挨打；鍵寫球球版，`heroArtUrl` 換成那一位的）。
 * 開打前不再等三十張姿勢之後，慢網路量到出第一張牌時這幾張還沒到、主角那一格空白一下（前後對照見修正報告）；
 * 所以跟 B 層一起插隊先抓、自己留著（一位約 160 KB）。其餘二十幾張照原本在背景抓。
 */
export const FIRST_POSES: readonly string[] = ['hero/ninja', 'hero/ninja_attack', 'hero/ninja_claw', 'hero/ninja_curl', 'hero/ninja_skill', 'hero/ninja_hit'];

export function warmRun(run: RunState, seat: number): void {
  const pr: Progress = { done: 0, total: 0 };
  pool = { seen: new Set(), keep: new Map() };
  const img = (u: string, hold = true): Promise<void> => decodeAll([u], 1, hold, pool, 'high');
  const ready = follow([
    // 底圖一張 1280 寬的長條，不留參照（樣式鋪上去瀏覽器自己會留，同 `preloadMapEvents`）
    img(artUrl('bg', actVariantKey('bg/map_tall', run.act)), false),
    ...[...Object.values(NODE_ICON), mapHeroKey(run.act)].map((k) => img(artUrl('icons', k))),
    ...preloadSfx(),
    import('./screens/combat'),
    // 主角新動作的格子資料（`hero-vids/<主角>.json`，各一小塊程式）：戰鬥畫面程式沒帶到它，量測裡它在點下戰鬥格之後才開始抓、4 秒才到。只抓資料，圖集照原本的時機
    ...[...new Set(run.players.map((p) => p.hero ?? 'ninja'))].map((h) => import('./hero-vids').then((m) => m.loadHeroVids((h === 'ninja' ? 'qiuqiu' : h) as HeroVidsHero))),
    warmVoice(),
  ], pr);
  cur = { run, pr, ready };
  void Promise.race([ready, new Promise<void>((r) => setTimeout(r, MAP_GATE_MS))]).then(() => {
    if (cur?.run !== run) return;
    void preloadNextFights(run);
    void decodeAll(cardFaceUrls(me(run, seat).deck.map((c) => c.cardId)), 3, true, undefined, 'high');
    const poses = [...new Set(run.players.flatMap((p) => FIRST_POSES.map((k) => heroArtUrl(p.hero, k))))];
    void decodeAll(poses, Math.max(1, poses.length), true, pool, 'high');
    // 魔物身上狀態小圖示（翻肚、纏住…十七張約 70 KB）：原本在開場那批的最後，A、B 插隊之後排得更晚，慢網路第一場空了 5～7 秒，排在 B 層最後補上
    void decodeAll(manifestImagePaths().filter((u) => /\/icons\/status_/.test(u)).map((u) => BASE + u), 4, true, pool, 'high');
  });
  void preloadHeroArt(run.players.map((p) => p.hero), run.act);
}

/** 這一局的 A 層進度（地圖前的門檻用）；不是這一局回 null */
export function runProgress(run: RunState): { pr: Progress; ready: Promise<void> } | null {
  return cur?.run === run ? cur : null;
}

/**
 * 條件式進度條的時機（只管時間，畫面由 `show` 決定）：`ready` 在 `graceMs` 內好了就**完全不出現**（快網路一閃都不要）；
 * 沒好才叫 `show`（回傳收掉的函式）；`ready` 好了或到 `maxMs`（0＝不設上限）就收掉、結束。
 */
export function gateProgress(ready: Promise<unknown>, show: () => () => void, maxMs = 0, graceMs = 250): Promise<void> {
  return new Promise<void>((done) => {
    let hide: (() => void) | undefined;
    let over = false;
    const finish = (): void => {
      if (over) return;
      over = true;
      clearTimeout(grace);
      clearTimeout(cap);
      hide?.();
      done();
    };
    const grace = setTimeout(() => { if (!over) hide = show(); }, graceMs);
    const cap = maxMs > 0 ? setTimeout(finish, maxMs) : undefined;
    void ready.then(finish, finish);
  });
}

/** 進度條：一行標題、一條進度、「準備中 x/y」（樣式 `.net-progress`，沿用旋轉提示那張卡的配色） */
export function progressBar(host: HTMLElement, label: string, pr: Progress): () => void {
  const fill = el('i');
  const count = el('small');
  const box = el('div', { class: 'net-progress' }, el('b', {}, label), el('span', { class: 'net-bar' }, fill), count);
  const draw = (): void => {
    fill.style.width = `${pr.total ? Math.round((pr.done / pr.total) * 100) : 0}%`;
    count.textContent = t('準備中 {done}/{total}', { done: pr.done, total: pr.total });
  };
  const prev = pr.on;
  pr.on = () => { prev?.(); draw(); };
  draw();
  host.append(box);
  return () => { pr.on = prev; box.remove(); };
}
