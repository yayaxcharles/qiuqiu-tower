import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/map.css';
import './ui/styles/combat.css';
import './ui/styles/screens.css';
import './ui/styles/phone.css';   // 手機橫拿的字級與按鈕（2026-09-23），排最後才蓋得過前面幾份
import { App } from './ui/app';
import { initLang } from './i18n';
import { registerLazyScreen } from './ui/lazy-screen';
import { loadEventScreen } from './ui/event-loader';
import { loadManifest, preloadArt } from './ui/assets';
import { preloadAct } from './ui/preload';
import { whenTitleArtReady } from './ui/titleart';
import { armHeavyLane, holdHeavyLane } from './ui/heavy-lane';
import { probeNetSpeed } from './ui/netspeed';
import { unlockOnFirstGesture } from './ui/audio';
import { deferBgm, unlockBgmOnFirstGesture } from './ui/bgm';
import { applyArtVars } from './ui/screenbg';
import { registerAssetCache } from './ui/assetcache';
import { clearRejoin, readRejoin } from './net/rejoin';
import './ui/screens/actclear';
import './ui/screens/chest';
import './ui/screens/bossdoor';
import './ui/screens/map';
import './ui/screens/rest';
import './ui/screens/result';
import './ui/screens/reward';
import './ui/screens/shop';
import './ui/screens/title';
import './ui/screens/heroselect';
registerLazyScreen('combat', () => import('./ui/screens/combat'), '正在準備戰鬥畫面……');
// 事件畫面連同三份角色事件文案（`content/event-text.ts`，一百多 KB）按需載入（2026-09-23 內容擴充 0-1）。
// 平常走不到這個載入畫面：地圖一出來就在背景先抓，走進事件格時 `app.ts` 的 `enterEvent` 也會等它抓好才換畫面
// 載入走 `event-loader.ts`：失敗會換網址參數重試、跟地圖預抓共用同一次（2026-09-23 推前審查 低-1）
registerLazyScreen('event', loadEventScreen, '正在準備事件……');
// 開局祝福（2026-09-23 第三批）：一局只用一次，畫面與文字按需載入；序章播放時 `warmBlessing` 就在背景抓好
registerLazyScreen('blessing', () => import('./ui/screens/blessing'), '正在打開包袱……');
// 除錯總覽只有輸入暗號後才用到，不佔一般玩家首載。
registerLazyScreen('debug', () => import('./ui/screens/debug'), '正在準備除錯總覽……');
// 合作大廳只在主動選擇連線遊玩時載入。
registerLazyScreen('lobby', () => import('./ui/screens/lobby'), '正在準備合作大廳……');

async function boot(): Promise<void> {
  // 語言包跟素材清單一起等（沒存過語言＝繁中，不用等）
  await Promise.all([loadManifest(), initLang()]);
  // 圖片離線快取：看過的圖留在本機，推新版只重下換過的那幾張（2026-09-24 使用者「優化載入的速度」）
  registerAssetCache();
  applyArtVars();
  // 音訊環境要等使用者動過畫面才建得起來（瀏覽器的自動播放限制）
  unlockOnFirstGesture();
  unlockBgmOnFirstGesture();
  const root = document.getElementById('app');
  if (!root) return;
  const app = new App(root);
  // 開發模式把 app 掛到 window：瀏覽器主控台可以直接叫 __app.startFight('mirror_duel', false, 0, 2) 之類的來驗畫面，
  // 不用真的打到那個節點。正式版（GitHub Pages）不掛。
  /*
   * 網址加上 `?debug` 也掛（2026-09-11）。
   *
   * 連線版只有**打包過的版本**才連得起來（開發伺服器每次改檔就重新整理、
   * 連線當場斷掉），所以連線的坑全部只在正式打包版現形，而那一版本來掛不上 `__app`——
   * 等於最難查的那一半完全沒有工具。要自己在網址後面加 `?debug` 才會掛，
   * 一般玩家碰不到。
   */
  const wantDebug = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV
    || new URLSearchParams(location.search).has('debug');
  if (wantDebug) (window as unknown as { __app?: App }).__app = app;
  if (new URLSearchParams(location.search).has('motion-preview')) {
    try {
      const [{ startMotionPreview }] = await Promise.all([
        import('./ui/motion-preview'),
        import('./ui/screens/combat'),
      ]);
      await startMotionPreview(app);
    } catch (error) {
      console.error('動作試玩載入失敗', error);
      app.stage.textContent = '動作試玩載入失敗，請重新整理再試。';
      Object.assign(app.stage.style, { display: 'grid', placeContent: 'center', gap: '20px' });
      const retry = document.createElement('button');
      retry.className = 'btn';
      retry.textContent = '重新整理';
      retry.addEventListener('click', () => location.reload());
      const back = document.createElement('a');
      back.className = 'btn';
      back.textContent = '回標題';
      back.href = location.pathname;
      app.stage.append(retry, back);
    }
    return;
  }
  /*
   * 連線局打到一半重新整理（2026-09-25 使用者：「兩件都做」）：分頁裡有兩分鐘內的記錄就直接接回那一局，不先停在標題。
   * 大廳那支是按需載入的，接回要用的函式在裡面；載不下來就退回標題。
   */
  const rejoin = readRejoin();
  if (rejoin) {
    void import('./ui/screens/lobby').then((m) => m.rejoinCoop(app, rejoin)).catch(() => { clearRejoin(); app.show('title'); });
  } else {
    app.show('title');
  }
  /*
   * **封面那幾張到齊才開始背景預載**（2026-09-29 效能：封面早一點出來）。
   * 原本封面一畫出來背景就一次開抓六張，慢網路下封面四隻貓要跟幾百張圖搶頻寬（量到封面出現後 2 秒才到齊）。
   * 最多等 6 秒（`titleart.ts`）；接回連線局的不經過封面，不等。
   */
  const titleArt = rejoin ? Promise.resolve() : whenTitleArtReady();
  // 標題畫面出來之後才開始預載：先讓人看到遊戲，圖在背景慢慢補。
  // 不 await——預載完不完成都不影響能不能玩。
  // UI／牌面／背景先，再抓第一關會遇到的魔物；第二三關的等過關畫面再抓（分關載入，見 preload.ts）
  /*
   * 慢網路才讓路（2026-09-23，主控裁定）：開場這一批一開抓就量速度（netspeed.ts，最多 2.5 秒）。
   * - 快：跟原本一模一樣——逐格動作的大圖集不限張數、不等，音樂一點就放；
   * - 慢：大圖集同時最多兩張、開場這一批抓完才開始（heavy-lane.ts），背景音樂也等這一批抓完才放。
   * 量出來之前大圖集先別開抓（最多 2.5 秒；快網路通常零點幾秒就量完）。
   * 量的 2.5 秒從開場這一批**真的開抓**（封面圖到齊）那一刻才起算（`probeNetSpeed` 的 `startAfter`）。
   */
  const speed = probeNetSpeed(titleArt);
  const releaseHeavy = holdHeavyLane();
  const opening = titleArt.then(() => preloadArt()).then(() => preloadAct(1));
  // 除錯網址（`?debug`）記下量到的速度，效能量測（`tools/perf/measure.mjs`）要對照前後兩版是不是同一種判斷
  if (wantDebug) void speed.then((s) => { const d = document.documentElement; if (d) d.dataset['netSpeed'] = s; });
  void speed.then((s) => {
    if (s === 'fast') { releaseHeavy(); return; }
    armHeavyLane(2);
    void opening.finally(releaseHeavy);
  });
  // 慢網路的音樂：開場這一批抓完才放，最多等 90 秒（跟大圖集同一個保險）
  deferBgm(speed.then((s) => (s === 'slow'
    ? Promise.race([opening, new Promise<void>((r) => window.setTimeout(r, 90_000))]) : undefined)));
}

/**
 * 開場必要的檔載不到（斷網、CDN 抖動、快取壞掉）：不要留一片空白，寫一段字加一顆重新整理鈕。
 * 三種語言都寫（這時語言包不一定載得到）。用原生 DOM，不靠任何還沒載好的東西。
 */
function showBootError(error: unknown): void {
  console.error('開場失敗', error);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;background:#1b2a4a;color:#f3ead6;font:16px/1.7 sans-serif;text-align:center';
  const msg = document.createElement('div');
  msg.style.whiteSpace = 'pre-line';
  msg.textContent = '載入失敗，請檢查網路後重新整理。\nFailed to load. Please check your connection and reload.\n読み込みに失敗しました。通信を確認して再読み込みしてください。';
  const btn = document.createElement('button');
  btn.textContent = '重新整理 / Reload / 再読み込み';
  btn.style.cssText = 'font:inherit;padding:8px 22px;cursor:pointer';
  btn.addEventListener('click', () => window.location.reload());
  box.append(msg, btn);
  (document.getElementById('app') ?? document.body).append(box);
}

boot().catch(showBootError);
