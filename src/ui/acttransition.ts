import { artUrl } from './assets';
import { play } from './audio';
import { el } from './dom';
import { tierBgKey } from './screenbg';

/**
 * 過關的走路轉場：打倒關主、挑完秘寶之後，球球慢慢走向下一關（約三秒）。
 *
 * 跟先前拆掉的「每個節點都走一段」不同：那個每場戰鬥都要等一秒、卡節奏；
 * 這個一關只出現一次（十五層一遇），是「翻過一章」的儀式感，使用者點名要的。
 * 背景用**下一關**的色調——走著走著場景換了，才是「到新地方」的感覺。
 * 一樣點一下可跳過。
 */

const WALK_MS = 3000;
const FADE_MS = 400;

export function actWalkTransition(stage: HTMLElement, nextActFloor: number, then: () => void): void {
  const bgUrl = artUrl('bg', tierBgKey(Math.max(1, nextActFloor)));
  const catUrl = artUrl('sprites', 'hero/ninja');
  if (bgUrl.startsWith('data:') || catUrl.startsWith('data:')) { then(); return; }

  const overlay = el('div', { class: 'actwalk-overlay' },
    el('div', { class: 'actwalk-bg', style: `background-image:url(${bgUrl})` }),
    el('div', { class: 'actwalk-shadow' }),
    el('img', { class: 'actwalk-cat', src: catUrl, alt: '' }),
    el('div', { class: 'actwalk-hint' }, '（往上一層……）'));
  stage.append(overlay);

  // 慢步調的腳步聲：三秒走六步
  const steps = Array.from({ length: 6 }, (_, i) =>
    window.setTimeout(() => play('step', 0.92 + (i % 2) * 0.1), 260 + i * 470));

  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    for (const t of steps) window.clearTimeout(t);
    then();                                   // 在遮罩底下換畫面（下一關的地圖）
    overlay.classList.add('out');
    window.setTimeout(() => overlay.remove(), FADE_MS + 60);
  };
  const timer = window.setTimeout(finish, WALK_MS);
  overlay.addEventListener('pointerdown', () => { window.clearTimeout(timer); finish(); });
}
