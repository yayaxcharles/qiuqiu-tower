/**
 * 封面左上角的語言切換（多語系第一片，2026-09-29）：繁中／English／日本語三顆鈕，樣式沿用難度鈕。
 * 選了就載好那一包、存進這台裝置，再請封面重畫一次（`onChange`）。載不到（斷網）就留在原本的語言、鈕上寫一聲。
 *
 * 審查修正（2026-09-29）：載的時候三顆鈕一起停用（不能連點）；載完時人若已經離開封面（進了選角色），不再把畫面拉回封面。
 */
import { getLang, LANGS, setLang } from '../i18n';
import { el } from './dom';

export function langPicker(onChange: () => void): HTMLElement {
  const box = el('div', { class: 'diff-picker lang-picker' }, el('span', { class: 'diff-label', 'aria-hidden': 'true' }, '🌐'));
  const buttons: HTMLButtonElement[] = [];
  for (const l of LANGS) {
    const b = el('button', { class: `btn small diff-btn d1${l.code === getLang() ? ' selected' : ''}`, lang: l.code === 'zh' ? 'zh-Hant' : l.code }, l.label) as HTMLButtonElement;
    b.addEventListener('click', () => {
      if (l.code === getLang()) return;
      for (const x of buttons) x.disabled = true;
      void setLang(l.code).then(() => {
        if (box.isConnected) onChange();   // 還停在封面才重畫；人已經走了，下一個畫面本來就會照新語言畫
      }, () => { for (const x of buttons) x.disabled = false; b.textContent = `${l.label} ✗`; });
    });
    buttons.push(b);
    box.append(b);
  }
  return box;
}
