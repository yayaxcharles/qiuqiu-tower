import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/map.css';
import './ui/styles/combat.css';
import './ui/styles/screens.css';
import { App } from './ui/app';
import { loadManifest } from './ui/assets';
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
  const root = document.getElementById('app');
  if (!root) return;
  const app = new App(root);
  app.show('title');
}

void boot();
