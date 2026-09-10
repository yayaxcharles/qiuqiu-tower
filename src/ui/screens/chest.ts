import { play } from '../audio';
import { dialogue, pick } from '../../content/dialogue';
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
  root.append(screenBg(actVariantKey('bg/screen_chest', app.run?.act ?? 1, app.run?.floor)));
  const run = app.run;
  if (!run) { app.show('title'); return; }
  toast(pick(dialogue.chestLines), '球球');
  // 常見秘寶全部拿過的話會回 null，那就是一個空紙箱（引擎不會硬塞別的池子給你）
  const id = openChest(run);
  // 狀態列一定要等開箱之後才畫：鮪魚罐頭那類秘寶會當場改最大生命，先畫的話玩家會看到
  // 「最大生命 +10」的訊息，配上還沒加的血條與少一格的秘寶列，要回地圖才對得起來
  renderHud(app, root);
  const def = id ? relicById[id] : undefined;
  play(def ? 'relic' : 'click');   // 空箱子沒有拿到東西，不要放拿寶的音
  const url = def ? artUrl('icons', def.art) : '';
  const hasLoot = !!def && !url.startsWith('data:');

  /**
   * 2026-09-10 改成「跟事件同一套」（使用者：「目前有點簡陋沒有投影片的事件感」）。
   *
   * 原本的版面是三個湊在一起的零件：球球站在左邊發呆（`hero/ninja` 那張中性站姿）、
   * 秘寶圖示浮在一片黑色空地中間、真正的紙箱是底圖右下角一個小方塊——三者之間沒有任何關係。
   * 事件畫面之所以有「事件感」，是因為那是**一張畫**、球球在畫裡做那件事，而且**沒有立繪**。
   * 所以這裡改成：插圖當主角、球球在畫裡撕箱子，立繪整個拿掉。
   *
   * 秘寶圖示疊在插圖那道金光裡（生圖時就要求光柱中央留空給它站），名字與效果收進對白框。
   * 插圖沒生好就退回舊版面（圖示大圖＋上下兩行字），不會開天窗。
   */
  const artUrlKey = def ? 'bg/event_chest_open' : 'bg/event_chest_empty';
  const sceneArt = artUrl('bg', artUrlKey);
  const hasScene = !sceneArt.startsWith('data:');

  let art: Node | string;
  if (hasScene) {
    art = el('div', { class: 'chest-scene' },
      el('img', { class: 'event-art', src: sceneArt, alt: '' }),
      hasLoot ? el('img', { class: 'chest-loot in-beam', src: url, alt: def.name })
        : def ? el('div', { class: 'chest-loot in-beam chest-loot-missing' }) : '');
  } else if (hasLoot) {
    // 舊版面（插圖沒生好時的退路）
    art = el('div', { class: 'loot-stack' },
      el('p', { class: 'loot-above' }, def.text),
      el('img', { class: 'chest-loot', src: url, alt: def.name }),
      el('div', { class: 'loot-below' }, el('span', { class: 'loot-kind' }, '秘寶'), el('b', { class: 'loot-name' }, def.name)));
  } else {
    art = '';
  }

  // 拿到東西時，名字與效果排在對白框裡的正文下面（插圖版）；退回舊版面時那兩行已經在圖上下了
  // 判準跟 `text`／`play()` 一致用 `def`，不是 `hasLoot`（稽核 2026-09-10 低-2）：
  // 哪天有秘寶沒生圖示，才不會變成「空箱插圖＋『找到了——』然後沒有下文」。
  // 圖示缺的那格用佔位塊撐著（舊版面本來就有 `.chest-loot-missing`）
  const extra = hasScene && def
    ? [el('div', { class: 'chest-loot-line' },
        el('span', { class: 'loot-kind' }, '秘寶'),
        el('b', { class: 'loot-name' }, def.name),
        el('span', { class: 'loot-text' }, def.text))]
    : [];

  root.append(sceneView({
    art,
    speaker: '紙箱',
    // 空箱現在幾乎碰不到了：`openChest` 會從常見一路退到大魔物、塔主池，
    // 三池 64 件全部收齊才會真的空（使用者 2026-09-10：「紙箱節點是一定有寶物」）
    text: def ? '球球把箱子翻了個底朝天，找到了——' : '紙箱是空的——塔裡的秘寶全被你搬光了，裡面只剩一堆碎紙。',
    extra,
    actions: [el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '繼續')],
  }));
});
