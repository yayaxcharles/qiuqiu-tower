import { play } from '../audio';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { battleBgKey, battleBgStyle, bossDoorKey } from '../screenbg';
import { el } from '../dom';
import { renderHud } from '../hud';

/**
 * 關主戰前的那扇門（使用者 2026-09-10：「睡覺補完後，加上打王前的過渡，
 * 讓玩家有種必須得打開門、打過這隻 BOSS 才能往上的動畫感」）。
 *
 * 一扇關著的對開門擋在路上，點下去左右拉開、裡面透出光，接著才進關主戰。
 *
 * **這不違反「拉長節奏的動畫一律不做」**：要停多久由玩家決定（門會等你點），
 * 開門那 0.9 秒是你按下去換來的，而且一局只會遇到三次——它不是每場戰鬥都要付的過場稅。
 *
 * 門只有一張圖，開的動作交給 CSS：同一張圖疊兩份、各自用 `clip-path` 切掉一半，
 * 左半往左滑、右半往右滑。生圖時就要求「左右對稱、接縫正好在正中央」，切出來才對得起來。
 */
registerScreen('bossdoor', (app, root, props) => {
  const run = app.run;
  const { encounterId } = props as { encounterId: string };
  if (!run || !encounterId) { app.show('map'); return; }
  renderHud(app, root);

  const door = artUrl('bg', bossDoorKey(run.act));
  /**
   * 門後面就是這一關的戰場，門一開就看得到自己要踏進哪裡。
   *
   * **鋪法要跟戰鬥畫面一字不差**（`battleBgStyle`，稽核 2026-09-11 中-1）：
   * `.screen-bg` 本來是 `cover` ＋置中，而戰鬥是「貼齊下緣＋各張不同的放大率」。
   * 只共用鍵、不共用放大率的話，門一拉開你看到的地板比較低，0.9 秒後切進戰鬥時
   * 整張背景會放大又往下沉一截——第一關差 27%，眼睛看得很清楚。
   */
  const behind = el('div', { class: 'screen-bg', style: battleBgStyle(battleBgKey(run.act, run.floor, true)) });

  let opened = false;
  const open = (): void => {
    // 一個旗標就夠：畫面換掉之後這些節點早就脫離文件，使用者點不到
    //（`app.screen` 是常駐節點，拿它比對永遠是 true——這專案踩過）
    if (opened) return;
    opened = true;
    scene.classList.add('opening');
    // 沒有專屬的開門音，借重擊那一聲。第二個參數是**播放速率不是音量**（見 audio.ts）：
    // 0.6 把音高壓低四成、拖長一點，聽起來就像石門被推開的悶響，正是這裡要的
    play('hit_heavy', 0.6);
    /**
     * 門拉開演完才進戰鬥。護欄有兩層：
     * ①`app.screen.contains(scene)`——`app.screen` 是常駐節點、`show()` 只清它的子節點，
     *   所以畫面一換 `scene` 就脫離文件，這個判斷會回 false（不能用 `isConnected`，那永遠是 true）。
     * ②掛進 `app.disposers`，換畫面當下就把計時器拆掉，跟這專案其他五處的寫法一致。
     *
     * 這段期間**整個舞台不吃點擊**（`door-opening`）：狀態列的層級是 10、畫在門上面又照樣可以按，
     * 玩家在這 900 毫秒裡按「牌組」或「圖鑑」會開一個疊層，接著關主開場對白也是疊層，
     * 兩個疊在一起要先關掉一個才點得動另一個（稽核 2026-09-10 低-1）。
     */
    app.stage.classList.add('door-opening');
    const t = window.setTimeout(() => {
      app.stage.classList.remove('door-opening');
      if (app.screen.contains(scene)) app.startFight(encounterId, true);
    }, 900);
    app.disposers.push(() => { window.clearTimeout(t); app.stage.classList.remove('door-opening'); });
  };

  const scene = el('div', { class: 'boss-door' },
    behind,
    // 關著的時候兩側是牆，看不到後面的戰場；推開時它淡掉（見 screens.css）
    el('div', { class: 'door-wall' }),
    el('img', { class: 'door-leaf left', src: door, alt: '' }),
    el('img', { class: 'door-leaf right', src: door, alt: '' }),
    el('div', { class: 'door-glow' }),
    el('div', { class: 'door-hint' },
      el('p', { class: 'door-line' }, '出現一扇門擋住了去路，門後方似乎有股強大的氣息。'),
      el('button', { class: 'btn primary', onclick: open }, '推開門')));
  scene.addEventListener('click', open);
  root.append(scene);
});
