import { artUrl, heroArtUrl, localHero } from './assets';
import { play } from './audio';
import { el } from './dom';
import { tierBgKey } from './screenbg';
import type { Hero } from '../engine/hero';
import './styles/act-motion.css';

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

type WalkActor = {
  element: HTMLCanvasElement;
  readonly foot: Readonly<{ x: number; y: number }>;
  dispose(): void;
};

function motionRequested(search = typeof location === 'undefined' ? '' : location.search): boolean {
  const params = new URLSearchParams(search);
  return params.has('motion-preview') || params.get('motion') !== '0';
}

async function loadWalkActor(hero: Hero): Promise<WalkActor | null> {
  if (!motionRequested()) return null;
  if (hero === 'ninja') {
    const motion = await import('./qiuqiu-motion');
    await motion.preloadQiuqiuMotion();
    return motion.createQiuqiuActor({ height: 250, action: 'run' });
  }
  if (hero === 'feifei' || hero === 'dangdang' || hero === 'fengfeng') {
    const motion = await import('./companion-motion');
    await motion.preloadCompanionMotion(hero);
    return motion.createCompanionMotionActor(hero, { height: 250, action: 'run' });
  }
  return null;
}

export function actWalkTransition(stage: HTMLElement, nextActFloor: number, then: () => void): () => void {
  const bgUrl = artUrl('bg', tierBgKey(Math.max(1, nextActFloor)));
  /*
   * 走路那張（2026-09-18）：本來這三秒拿的是站姿圖，腳步聲有、腳沒動。
   * 圖沒生好就退回站姿——`heroArtUrl` 查不到會回一張 `data:` 的佔位圖，所以要自己判一次。
   */
  const walkUrl = heroArtUrl(localHero(), 'hero/ninja_walk');
  const catUrl = walkUrl.startsWith('data:') ? heroArtUrl(localHero(), 'hero/ninja') : walkUrl;
  if (bgUrl.startsWith('data:') || catUrl.startsWith('data:')) { then(); return () => {}; }

  const hero = localHero() as Hero;
  let actor: WalkActor | null = null;
  let finished = false;
  const fallback = el('img', { class: 'actwalk-cat', src: catUrl, alt: '' });
  const animated = motionRequested() && ['ninja', 'feifei', 'dangdang', 'fengfeng'].includes(hero);

  /*
   * 等逐格動作的那一小段（2026-09-22）：靜態圖就是跑步第 1 格，這段不晃、不加影子，
   * 換上畫布時才一模一樣、不會跳一下（`act-motion.css` 的 `.actwalk-await`）。動作載不到才照舊晃著走。
   */
  const overlay = el('div', { class: animated ? 'actwalk-overlay actwalk-await' : 'actwalk-overlay' },
    el('div', { class: 'actwalk-bg', style: `background-image:url(${bgUrl})` }),
    el('div', { class: 'actwalk-shadow' }),
    fallback,
    el('div', { class: 'actwalk-hint' }, '（往上一層……）'));
  stage.append(overlay);

  void loadWalkActor(hero).then((loaded) => {
    if (!loaded) { overlay.classList.remove('actwalk-await'); return; }
    if (finished) { loaded.dispose(); return; }
    actor = loaded;
    actor.element.style.position = 'absolute';
    actor.element.style.left = `${465 - actor.foot.x}px`;
    actor.element.style.top = `${484 - actor.foot.y}px`;
    actor.element.style.bottom = 'auto';
    actor.element.style.transform = 'none';
    fallback.remove();
    overlay.classList.add('actwalk-motion');
    overlay.append(actor.element);
  }).catch((error) => {
    overlay.classList.remove('actwalk-await');
    console.error('跑步動作素材載入失敗，改用靜態轉場', error);
  });

  // 慢步調的腳步聲：三秒走六步
  const steps = Array.from({ length: animated ? 12 : 6 }, (_, i) =>
    window.setTimeout(() => play('step', 0.92 + (i % 2) * 0.1), animated ? 120 + i * 240 : 260 + i * 470));

  let fadeTimer = 0;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timer);
    for (const t of steps) window.clearTimeout(t);
    actor?.dispose();
    then();                                   // 在遮罩底下換畫面（下一關的地圖）
    overlay.classList.add('out');
    fadeTimer = window.setTimeout(() => overlay.remove(), FADE_MS + 60);
  };
  const timer = window.setTimeout(finish, WALK_MS);
  overlay.addEventListener('pointerdown', () => { window.clearTimeout(timer); finish(); });
  return () => {
    finished = true;
    window.clearTimeout(timer);
    window.clearTimeout(fadeTimer);
    for (const t of steps) window.clearTimeout(t);
    actor?.dispose();
    overlay.remove();
  };
}
