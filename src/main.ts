import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/map.css';
import './ui/styles/combat.css';
import './ui/styles/screens.css';
import { App } from './ui/app';
import { loadManifest, preloadArt } from './ui/assets';
import { applyArtVars } from './ui/screenbg';
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
  const root = document.getElementById('app');
  if (!root) return;
  const app = new App(root);
  app.show('title');
  // 標題畫面出來之後才開始預載：先讓人看到遊戲，圖在背景慢慢補。
  // 不 await——預載完不完成都不影響能不能玩。
  void preloadArt();
}

void boot();
