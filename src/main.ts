import './ui/styles/base.css';
import './ui/styles/map.css';
import { App } from './ui/app';
import { loadManifest } from './ui/assets';
import './ui/screens/map';
import './ui/screens/title';

async function boot(): Promise<void> {
  await loadManifest();
  const root = document.getElementById('app');
  if (!root) return;
  const app = new App(root);
  app.show('title');
}

void boot();
