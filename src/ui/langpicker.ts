/**
 * 封面左上角的語言切換（多語系第一片，2026-09-29）：繁中／English／日本語三顆鈕，樣式沿用難度鈕。
 * 選了就載好那一包、存進這台裝置，再請封面重畫一次（`onChange`）。載不到（斷網）就留在原本的語言、鈕上寫一聲。
 */
import { getLang, LANGS, setLang } from '../i18n';
import { el } from './dom';

export function langPicker(onChange: () => void): HTMLElement {
  const box = el('div', { class: 'diff-picker lang-picker' }, el('span', { class: 'diff-label', 'aria-hidden': 'true' }, '🌐'));
  for (const l of LANGS) {
    const b = el('button', { class: `btn small diff-btn d1${l.code === getLang() ? ' selected' : ''}`, lang: l.code === 'zh' ? 'zh-Hant' : l.code }, l.label) as HTMLButtonElement;
    b.addEventListener('click', () => {
      if (l.code === getLang()) return;
      b.disabled = true;
      void setLang(l.code).then(onChange, () => { b.disabled = false; b.textContent = `${l.label} ✗`; });
    });
    box.append(b);
  }
  return box;
}
