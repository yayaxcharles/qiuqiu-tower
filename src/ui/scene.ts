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
  return el('div', { class: 'scene' },
    o.art ? el('div', { class: 'scene-art' }, o.art) : '',
    o.portrait ? el('img', { class: 'scene-portrait', src: o.portrait, alt: '' }) : '',
    box);
}
