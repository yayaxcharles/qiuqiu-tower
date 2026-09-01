import { hasSave, loadBest } from '../../engine/save';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { el } from '../dom';
import { screenBg } from '../screenbg';

registerScreen('title', (app, root) => {
  // 「種子」是程式用語，玩家看不懂，還會誤以為是存檔碼（存檔是自動的、存在瀏覽器裡）。
  // 畫面上一律講「本局代碼」，並在提示裡講清楚它的作用。
  const seed = el('input', {
    class: 'seed', placeholder: '本局代碼（可留空）',
    title: '填同一組代碼會生出一模一樣的塔：地圖、遭遇、罐頭鋪的貨全部一樣。留空就隨機開一局。',
  });
  const best = loadBest();
  root.append(screenBg('bg/screen_title'));
  root.append(
    el('div', { class: 'title-screen' },
      // 陰影跟戰鬥畫面同一招：去背的角色貼在背景上就是浮著，腳下墊一片橢圓才像站著
      el('div', { class: 'title-cat-box' },
        el('div', { class: 'ground-shadow' }),
        el('img', { class: 'title-cat', src: artUrl('sprites', 'hero/ninja_win'), alt: '球球' })),
      // 正式名（2026-09-01 定案）：主標走「殺戮尖塔」式的四字重名，球球退到副標——
      // 他還是主角，但招牌要像作品名，不是一句口語
      el('h1', {}, '爪破魔塔'),
      el('div', { class: 'title-sub' }, '－ 球球參上 －'),
      el('div', { class: 'title-buttons' },
        el('button', { class: 'btn primary', onclick: () => app.newRun(seed.value) }, '新的一局'),
        // 沒存檔時才加 disabled：這個屬性只要存在就會生效，給空字串也一樣
        el('button', { class: 'btn', ...(hasSave() ? {} : { disabled: 'disabled' }), onclick: () => { if (!app.continueRun()) app.show('title'); } }, '續玩'),
        seed),
      el('div', { class: 'title-best' }, best ? `最佳成績：到達 ${best.floor}F${best.won ? '（通關）' : ''}` : '還沒有成績'),
      el('div', { class: 'title-note' }, '存檔存在這台電腦的瀏覽器裡。')));
});
