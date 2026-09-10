import { play } from '../audio';
import { dialogue, pick } from '../../content/dialogue';
import { relicById } from '../../content/relics';
import { openChest } from '../../engine/run';
import { registerScreen } from '../app';
import { actVariantKey, clearKeepBg, screenBg } from '../screenbg';
import { artUrl } from '../assets';
import { toast } from '../dialogue';
import { el } from '../dom';
import { renderHud } from '../hud';
import { sceneView } from '../scene';

/**
 * 紙箱節點。**兩段**（使用者 2026-09-10：「一開始先是還沒打開的紙箱，球球準備要打開牠，
 * 箱子會發亮浮動讓我們點左鍵，點下去後動畫箱子打開，再跳到後面出現說明的圖片」）。
 *
 * 第一段：還沒開的箱子，浮著、發著光，等你點。第二段：箱子開了、秘寶站在光柱裡、說明在正下方。
 *
 * **這不違反「拉長節奏的動畫一律不做」那條鐵則**：第一段完全由玩家決定要停多久，
 * 不是強迫等待；第二段的開箱閃光只有 0.36 秒，而且是你按下去換來的回饋，不是過場稅。
 */
registerScreen('chest', (app, root) => {
  root.append(screenBg(actVariantKey('bg/screen_chest', app.run?.act ?? 1, app.run?.floor)));
  const run = app.run;
  if (!run) { app.show('title'); return; }

  /**
   * **開箱要等玩家點下去才算數**，不能在進畫面時就先開。
   *
   * `openChest` 會把秘寶真的塞進背包（鮪魚罐頭那類還會當場改最大生命），而狀態列一畫出來
   * 就看得到那一格——先開的話，第一段那個「還沒打開的箱子」上方已經擺著你即將拿到的東西，
   * 懸念直接被劇透。所以第一段只畫沒開的箱子與當時的狀態列，點下去才開。
   * 抽選用的是 `runRng`，晚一點抽不影響同種子的重現（中間沒有別人動過那個亂數）。
   */
  const closed = artUrl('bg', 'bg/event_chest_closed');
  if (!closed.startsWith('data:')) {
    renderHud(app, root);
    toast(pick(dialogue.chestLines), '球球');
    const box = el('img', { class: 'event-art chest-closed', src: closed, alt: '沒開過的紙箱' });
    const scene = el('div', { class: 'chest-scene chest-waiting' }, box);
    let opened = false;
    const open = (): void => {
      // `opened` 一個旗標就夠：畫面換掉的話這幾個節點早就脫離文件，使用者根本點不到它們
      //（`app.screen` 是常駐節點、不是畫面名稱，拿它比對永遠是 true——這專案踩過）
      if (opened) return;
      opened = true;
      scene.classList.add('bursting');
      play('click');
      /**
       * **要等一格再換畫面**（稽核 2026-09-10 中-2）。
       *
       * 原本是掛上 `bursting` 之後**同一個 tick** 就 `reveal()`，而 `reveal()` 第一行的
       * `clearKeepBg` 會把整個 `scene` 從文件裡拔掉——瀏覽器連樣式都還沒重算，
       * 那支閃光動畫**一格都沒播**（不是被切掉，是根本沒開始），`.chest-scene.bursting` 整段是死碼。
       * 玩家點下去只看到畫面瞬間跳掉。
       *
       * 180 毫秒剛好走到那支閃光最亮的那一格（`chest-burst` 的 45%）。
       * 這是**玩家自己按出來的回饋**、不是每場都要付的過場稅，不違反「不做拉長節奏的動畫」。
       */
      window.setTimeout(() => { if (scene.isConnected) reveal(); }, 180);
    };
    scene.addEventListener('click', open);
    root.append(sceneView({
      art: scene,
      speaker: '紙箱',
      text: '箱子還封著，上面貼了一條膠帶。',
      actions: [el('button', { class: 'btn primary', onclick: open }, '打開箱子')],
    }));
    return;
  }
  // 沒開的那張還沒生好就直接開箱（不要為了一張圖把整個節點卡住）
  reveal();

  /** 第二段：箱子開了。這一段跟兩段式之前的畫面完全一樣 */
  function reveal(): void {
    if (!run) return;
    clearKeepBg(root);   // 底圖那一層要留著，clear(root) 會把它一起清掉、畫面看起來像當掉
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
      art = el('div', { class: 'chest-scene chest-opened' },
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

    /**
     * 拿到什麼、有什麼用，寫在**插圖正下方**（使用者 2026-09-10：「應該放在事件圖片正下方，
     * 目前放在對話框下有點太遠，不是很明顯看到說明」）。
     *
     * 原本排在對白框裡的正文下面，量出來離插圖底部快 200 像素、貼在「繼續」按鈕旁邊——
     * 眼睛看完光柱裡那件秘寶，還要往下掃過整段對白才找得到它是什麼。
     *
     * 掛進 `.chest-scene`（插圖的定位框）而不是 `.scene-art`，而且**一定要絕對定位**：
     * 那個框的尺寸就是插圖本身，秘寶疊在光柱裡的座標是對它算百分比的
     *（`left: 33%`／`top: 22%`），塞一個佔位子的節點進去會把框撐高、秘寶就飄出光柱了。
     * 絕對定位的子節點不算進尺寸，框維持原樣。
     *
     * 判準跟 `text`／`play()` 一致用 `def`，不是 `hasLoot`（稽核 2026-09-10 低-2）：
     * 哪天有秘寶沒生圖示，才不會變成「空箱插圖＋『找到了——』然後沒有下文」。
     */
    if (hasScene && def && art instanceof HTMLElement) {
      art.append(el('div', { class: 'chest-loot-line' },
        el('span', { class: 'loot-kind' }, '秘寶'),
        el('b', { class: 'loot-name' }, def.name),
        el('span', { class: 'loot-text' }, def.text)));
    }

    root.append(sceneView({
      art,
      speaker: '紙箱',
      // 空箱現在幾乎碰不到了：`openChest` 會從常見一路退到大魔物、塔主池，
      // 三池 64 件全部收齊才會真的空（使用者 2026-09-10：「紙箱節點是一定有寶物」）
      text: def ? '球球把箱子翻了個底朝天，找到了——' : '紙箱是空的——塔裡的秘寶全被你搬光了，裡面只剩一堆碎紙。',
      actions: [el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '繼續')],
    }));
  }
});
