import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/map.css';
import './ui/styles/combat.css';
import './ui/styles/screens.css';
import './ui/styles/phone.css';   // 手機橫拿的字級與按鈕（2026-09-23），排最後才蓋得過前面幾份
import { App } from './ui/app';
import { registerLazyScreen } from './ui/lazy-screen';
import { loadEventScreen } from './ui/event-loader';
import { loadManifest, preloadArt } from './ui/assets';
import { preloadAct } from './ui/preload';
import { armHeavyLane, holdHeavyLane } from './ui/heavy-lane';
import { probeNetSpeed } from './ui/netspeed';
import { unlockOnFirstGesture } from './ui/audio';
import { deferBgm, unlockBgmOnFirstGesture } from './ui/bgm';
import { applyArtVars } from './ui/screenbg';
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
  await loadManifest();
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
  app.show('title');
  // 標題畫面出來之後才開始預載：先讓人看到遊戲，圖在背景慢慢補。
  // 不 await——預載完不完成都不影響能不能玩。
  // UI／牌面／背景先，再抓第一關會遇到的魔物；第二三關的等過關畫面再抓（分關載入，見 preload.ts）
  /*
   * 慢網路才讓路（2026-09-23，主控裁定）：開場這一批一開抓就量速度（netspeed.ts，最多 2.5 秒）。
   * - 快：跟原本一模一樣——逐格動作的大圖集不限張數、不等，音樂一點就放；
   * - 慢：大圖集同時最多兩張、開場這一批抓完才開始（heavy-lane.ts），背景音樂也等這一批抓完才放。
   * 量出來之前大圖集先別開抓（最多 2.5 秒；快網路通常零點幾秒就量完）。
   */
  const speed = probeNetSpeed();
  const releaseHeavy = holdHeavyLane();
  const opening = preloadArt().then(() => preloadAct(1));
  void speed.then((s) => {
    if (s === 'fast') { releaseHeavy(); return; }
    armHeavyLane(2);
    void opening.finally(releaseHeavy);
  });
  // 慢網路的音樂：開場這一批抓完才放，最多等 90 秒（跟大圖集同一個保險）
  deferBgm(speed.then((s) => (s === 'slow'
    ? Promise.race([opening, new Promise<void>((r) => window.setTimeout(r, 90_000))]) : undefined)));
}

void boot();
