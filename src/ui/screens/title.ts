import { hasSave, loadBest } from '../../engine/save';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { el } from '../dom';
import { screenBg } from '../screenbg';

registerScreen('title', (app, root) => {
  const seed = el('input', { class: 'seed', placeholder: '種子（可留空）' });
  const best = loadBest();
  root.append(screenBg('bg/screen_title'));
  root.append(
    el('div', { class: 'title-screen' },
      el('img', { class: 'title-cat', src: artUrl('sprites', 'ninja/01'), alt: '球球' }),
      el('h1', {}, '球球勇闖魔物塔'),
      el('div', { class: 'title-buttons' },
        el('button', { class: 'btn primary', onclick: () => app.newRun(seed.value) }, '新的一局'),
        // 沒存檔時才加 disabled：這個屬性只要存在就會生效，給空字串也一樣
        el('button', { class: 'btn', ...(hasSave() ? {} : { disabled: 'disabled' }), onclick: () => { if (!app.continueRun()) app.show('title'); } }, '續玩'),
        seed),
      el('div', { class: 'title-best' }, best ? `最佳成績：到達 ${best.floor}F${best.won ? '（通關）' : ''}` : '還沒有成績'),
      el('div', { class: 'title-note' }, '存檔存在這台電腦的瀏覽器裡。')));
});
