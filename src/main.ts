import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/map.css';
import './ui/styles/combat.css';
import './ui/styles/screens.css';
import { App } from './ui/app';
import { loadManifest, preloadArt } from './ui/assets';
import { preloadActMonsters } from './ui/preload';
import { unlockOnFirstGesture } from './ui/audio';
import { unlockBgmOnFirstGesture } from './ui/bgm';
import { applyArtVars } from './ui/screenbg';
import './ui/screens/actclear';
import './ui/screens/chest';
import './ui/screens/combat';
import './ui/screens/event';
import './ui/screens/map';
import './ui/screens/rest';
import './ui/screens/result';
import './ui/screens/reward';
import './ui/screens/shop';
import './ui/screens/title';

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
  if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as { __app?: App }).__app = app;
  app.show('title');
  // 標題畫面出來之後才開始預載：先讓人看到遊戲，圖在背景慢慢補。
  // 不 await——預載完不完成都不影響能不能玩。
  // UI／牌面／背景先，再抓第一關會遇到的魔物；第二三關的等過關畫面再抓（分關載入，見 preload.ts）
  void preloadArt().then(() => preloadActMonsters(1));
}

void boot();
