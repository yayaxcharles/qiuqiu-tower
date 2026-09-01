import { play } from '../audio';
import { dialogue } from '../../content/dialogue';
import { relicById } from '../../content/relics';
import { openChest } from '../../engine/run';
import { registerScreen } from '../app';
import { screenBg } from '../screenbg';
import { artUrl } from '../assets';
import { toast } from '../dialogue';
import { el } from '../dom';
import { renderHud } from '../hud';

registerScreen('chest', (app, root) => {
  root.append(screenBg('bg/screen_chest'));
  const run = app.run;
  if (!run) { app.show('title'); return; }
  toast(dialogue.chestLine, '球球');
  // 常見秘寶全部拿過的話會回 null，那就是一個空紙箱（引擎不會硬塞別的池子給你）
  const id = openChest(run);
  // 狀態列一定要等開箱之後才畫：鮪魚罐頭那類秘寶會當場改最大生命，先畫的話玩家會看到
  // 「最大生命 +10」的訊息，配上還沒加的血條與少一格的秘寶列，要回地圖才對得起來
  renderHud(app, root);
  const def = id ? relicById[id] : undefined;
  play(def ? 'relic' : 'click');   // 空箱子沒有拿到東西，不要放拿寶的音
  const url = def ? artUrl('icons', def.art) : '';
  const body = def
    ? el('div', { class: 'reward-item' },
      url.startsWith('data:') ? '' : el('img', { src: url, alt: def.name }),
      `找到秘寶「${def.name}」：${def.text}`)
    : el('div', { class: 'reward-item' }, '紙箱是空的——常見的秘寶都拿過了，裡面只剩一堆碎紙。');

  root.append(el('div', { class: 'screen chest' },
    el('h1', {}, '紙箱'),
    body,
    el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '繼續')));
});
