import { play } from '../audio';
import { dialogue } from '../../content/dialogue';
import { relicById } from '../../content/relics';
import { openChest } from '../../engine/run';
import { registerScreen } from '../app';
import { actVariantKey, screenBg } from '../screenbg';
import { artUrl } from '../assets';
import { toast } from '../dialogue';
import { el } from '../dom';
import { renderHud } from '../hud';
import { sceneView } from '../scene';

registerScreen('chest', (app, root) => {
  root.append(screenBg(actVariantKey('bg/screen_chest', app.run?.act ?? 1)));
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
  const hero = artUrl('sprites', 'hero/ninja');

  // 劇場版面（使用者 2026-09-02：「紙箱事件那邊也要重畫」）：秘寶的圖放大立在中上、
  // 球球站在框左邊，找到什麼、有什麼用寫在框裡
  root.append(sceneView({
    art: def && !url.startsWith('data:') ? el('img', { class: 'chest-loot', src: url, alt: def.name }) : '',
    portrait: hero.startsWith('data:') ? undefined : hero,
    speaker: '紙箱',
    text: def ? '球球把箱子翻了個底朝天，找到了——' : '紙箱是空的——常見的秘寶都拿過了，裡面只剩一堆碎紙。',
    // 秘寶名字做成木牌、效果一行米白字（本來只有「找到秘寶XX」加一行橘字，使用者：「沒設計感」）
    extra: def ? [el('div', { class: 'loot-block' },
      el('div', { class: 'loot-plate' }, el('span', { class: 'loot-kind' }, '秘寶'), el('b', { class: 'loot-name' }, def.name)),
      el('p', { class: 'loot-effect' }, def.text))] : [],
    actions: [el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '繼續')],
  }));
});
