import { el } from './dom';

/**
 * 劇場版面：整張底圖鋪滿舞台、插圖（或商品、或牌）立在中上方、底下一個跟序章幻燈片同一套的對白框，
 * 選項按鈕排在對白框裡。事件、貓窩、罐頭鋪三個畫面 2026-09-02 起都用這個——
 * 使用者的原話：「開場那種投影片對話我很喜歡，事件、商店、休息能不能也做成那樣」。
 * 之前是「中央一塊米白面板把底圖遮掉大半」，故事感全被面板吃掉。
 */
export interface SceneOpts {
  /** 中上方的主圖（事件插圖、牌、商品架都行）；不給就空著讓底圖當主角 */
  art?: Node | string;
  /** 站在對白框左側的立繪（老闆、球球）；跟對白疊層的立繪同一個位置 */
  portrait?: string;
  /** 對白框左上角的名牌；不給或給空字串就是旁白（字置中、冷色紙） */
  speaker?: string;
  text: string;
  /** 對白框裡、正文下面的補充（戰利品列、備註） */
  extra?: (Node | string)[];
  /** 對白框裡的按鈕；`column` 讓它們一列一顆撐滿（事件的選項），否則一排排開 */
  actions?: (Node | string)[];
  column?: boolean;
}

export function sceneView(o: SceneOpts): HTMLElement {
  const narration = !o.speaker;
  const box = el('div', { class: `dialogue-box scene-box${narration ? ' narration' : ''}` },
    el('div', { class: 'dialogue-speaker' }, o.speaker ?? ''),
    el('div', { class: 'dialogue-text scene-text' }, o.text),
    ...(o.extra ?? []),
    o.actions?.length ? el('div', { class: `scene-actions${o.column ? ' column' : ''}` }, ...o.actions) : '');
  const scene = el('div', { class: 'scene' },
    o.art ? el('div', { class: 'scene-art' }, o.art) : '',
    o.portrait ? el('img', { class: 'scene-portrait', src: o.portrait, alt: '' }) : '',
    box);
  fitArt(scene, box);
  return scene;
}

/**
 * 對白框的文字要是長到會壓到插圖，插圖就自己讓位（2026-09-11）。
 *
 * 版面是兩塊各自絕對定位、彼此看不見高度的元素：插圖釘在 `.scene` 上緣（`top: 18px`、高 360），
 * 對白框釘在下緣、高度隨內容長。純 CSS 沒辦法讓其中一個看另一個，所以量完再設一次高度。
 * 下限 210：再矮就看不出畫的是什麼，那時寧可讓它擠一點也不要縮成一條。
 *
 * **今天這支不會觸發，它是防未來的保險。** 2026-09-11 把 38 個事件的文案整批換掉
 *（開場平均從 37 字變 63 字）之後，我在瀏覽器裡把每一個事件都量過：最擠的「一整片貓薄荷」
 * 文字上緣離插圖底部還有 51 像素。中間看起來像被蓋住的那一大段，是對白框頂端
 * 135 像素的透明漸層與名牌內距——插圖本來就該疊進那一段，那是設計。
 *（第一版把基準取在框的邊界上，才誤判成「蓋住 84 像素」。）
 * 留著它是因為文案這次一口氣長了七成，下次再長就會真的撞上，而撞上的症狀是字被圖蓋住、
 * 不會有任何錯誤訊息。
 */
function fitArt(scene: HTMLElement, box: HTMLElement): void {
  const img = scene.querySelector<HTMLElement>('.scene-art img.event-art');
  if (!img) return;
  /**
   * **量現場，不要把版面常數抄進程式**（稽核 2026-09-11 低-3）。
   *
   * 第一版寫的是 `664 − 框高`，其中 664 來自「舞台 720、框底離下緣 30」——兩個數字都是錯的：
   * `.scene` 自己是 `top: 56px; height: 664px`（所以裡面的座標是對這 664 算的），
   * 而 `screens.css:825` 後來又把 `.scene .dialogue-box.scene-box` 的 `bottom: 30px` 覆蓋成 `bottom: 0`。
   * 實測沒出事純粹是因為框頂那 36～60 像素是透明漸層＋名牌內距，剛好把誤差吃掉了——
   * 誰動一下 padding 就會破。
   *
   * 改成量「文字真正從哪裡開始」：框的上緣是透明漸層，插圖疊進那一段沒關係，
   * 疊到字才是問題。所以基準取框裡第一個看得見的元素。
   */
  const firstText = box.querySelector<HTMLElement>('.dialogue-speaker, .scene-text');
  // 量高度要等節點進到文件裡；`requestAnimationFrame` 在測試環境（jsdom、node）可能沒有
  const run = (): void => {
    // `scene` 是每次 `sceneView()` 新建、`app.show()` 會整個清掉的節點，
    // 所以它的 `isConnected` 真的代表「這張畫面還在不在」——
    // 跟 `app.screen`（常駐節點、恆真）那個坑正好相反，這裡是安全的
    if (!scene.isConnected || !firstText) return;
    const k = stageScale();
    const sceneTop = scene.getBoundingClientRect().top;
    const textTop = (firstText.getBoundingClientRect().top - sceneTop) / k;
    if (!textTop) return;
    const ART_TOP = 18;   // `.scene-art` 的 top，對 `.scene` 算（screens.css:685）
    img.style.height = `${Math.max(210, Math.min(360, textTop - ART_TOP - 8))}px`;
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else run();
}

/** 舞台目前被縮放多少倍（`#stage` 身上那個 `transform: scale()`）。量到的螢幕像素要除掉它才是版面像素 */
function stageScale(): number {
  const stage = document.getElementById('stage');
  const w = stage?.getBoundingClientRect().width ?? 0;
  return w > 0 ? w / 1280 : 1;
}
