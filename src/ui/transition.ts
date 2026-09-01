import { artUrl } from './assets';
import { play } from './audio';
import { el } from './dom';
import { tierBgKey } from './screenbg';

/**
 * 節點之間的走路過場：球球在這一層的場景前走一小段，才切到目的地的畫面。
 *
 * 靈感來自《Take Me To The Dungeon!!》那種「一路走進地城」的推進感——
 * 我們的節點地圖本來是「點一下、畫面瞬間跳掉」，中間沒有「移動」這件事，
 * 場景再漂亮也感覺不到自己在爬塔（使用者的原話：「蠻缺少切場景的感覺」）。
 *
 * 流程：走路（約一秒）→ 在遮罩底下換畫面 → 遮罩淡出露出新畫面。
 * 換畫面那一步藏在遮罩後面做，玩家看不到重畫的瞬間。
 * 點一下可以跳過（老玩家不想每次等一秒）。
 */

const WALK_MS = 1000;
const FADE_MS = 220;

export function walkTransition(stage: HTMLElement, floor: number, then: () => void): void {
  const bgUrl = artUrl('bg', tierBgKey(Math.max(1, floor)));
  const catUrl = artUrl('sprites', 'hero/ninja');
  // 素材還沒好（灰剪影）就直接換畫面，不要放一段看不懂的過場
  if (bgUrl.startsWith('data:') || catUrl.startsWith('data:')) { then(); return; }

  const cat = el('img', { class: 'walk-cat', src: catUrl, alt: '' });
  const overlay = el('div', { class: 'walk-overlay' },
    el('div', { class: 'walk-bg', style: `background-image:url(${bgUrl})` }),
    el('div', { class: 'walk-shadow' }),
    cat);
  stage.append(overlay);

  // 腳步聲跟著步伐，音高微錯開才不像節拍器
  const steps = [120, 460, 800].map((t, i) =>
    window.setTimeout(() => play('step', 0.94 + i * 0.06), t));

  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    for (const t of steps) window.clearTimeout(t);
    then();                                   // 換畫面：在遮罩底下做，玩家看不到切換的瞬間
    overlay.classList.add('out');
    window.setTimeout(() => overlay.remove(), FADE_MS + 60);
  };
  const timer = window.setTimeout(finish, WALK_MS);
  // 點一下跳過。跳過也要走同一個 finish：換畫面與收遮罩的順序不能亂
  overlay.addEventListener('pointerdown', () => { window.clearTimeout(timer); finish(); });
}
