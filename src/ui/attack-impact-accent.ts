/** 只在已確認的傷害落點顯示；不排程傷害，也不阻擋下一張牌。 */
export function playAttackImpactAccent(target: Element, action: string, wave = 0): boolean {
  let shape: string;
  let color = '#ffe1a0';
  let ground = false;
  let width = 150;
  let rotation = 0;
  if (action === 'roar') {
    shape = '<path d="M35 35Q63 60 35 85M53 24Q89 60 53 96M74 14Q116 60 74 106"/>';
    color = '#fff0b6';
  } else if (action === 'ground_slam' || action === 'earth_split') {
    shape = '<path d="M60 55L44 70 51 76 20 88M60 55L78 67 73 78 112 92M60 55L56 87 66 95 62 110M60 55L33 51 17 57M60 55L89 48 110 53"/>';
    color = action === 'earth_split' ? '#ffc46d' : '#ead3a5';
    ground = true;
    width = 180;
  } else if (action === 'sweep_combo') {
    shape = '<path d="M10 64Q52 108 112 43Q84 84 19 73"/><path d="M25 85L14 98M56 94L55 108M87 83L99 96"/>';
    ground = true;
    width = 185;
  } else if (action === 'qi_cleave') {
    shape = '<path d="M15 10L105 109 51 64Z"/><path d="M29 10L111 97"/>';
    color = '#fff1cb';
    width = 195;
  } else if (action === 'retreat_thrust' || (action === 'sword_combo' && wave % 3 === 2)) {
    shape = '<path d="M4 57L109 60 4 65 30 60Z"/><path d="M84 44L98 60 85 77"/>';
    color = '#fff4d7';
    width = 180;
  } else if (action === 'sword_combo') {
    shape = wave % 3 === 0 ? '<path d="M16 9L105 109 67 78Z"/>' : '<path d="M15 108L106 9 73 59Z"/>';
    color = '#fff4d7';
    width = 175;
  } else if (['body_bash', 'reckless_bash', 'heavy_palm', 'palm_combo', 'rapid_combo'].includes(action)) {
    shape = '<circle cx="60" cy="60" r="23"/><path d="M60 12L64 34 82 19 77 42 105 37 84 56 110 69 83 72 98 96 73 84 64 111 55 83 32 102 41 77 12 76 36 61 15 43 42 44 40 18 55 37Z"/>';
    width = action === 'heavy_palm' || action.includes('bash') ? 155 : 120;
    rotation = (wave % 3 - 1) * 17;
  } else return false;

  const host = target.querySelector('.sprite-box');
  if (!host) return false;
  const effect = document.createElement('span');
  effect.className = 'attack-impact-accent';
  effect.dataset.action = action;
  effect.setAttribute('aria-hidden', 'true');
  const transform = `translate(-50%, 50%) rotate(${rotation}deg)`;
  Object.assign(effect.style, {
    position: 'absolute', left: '50%', bottom: ground ? '5%' : '32%',
    width: `${width}px`, height: `${ground ? width * .62 : width}px`,
    pointerEvents: 'none', zIndex: '8', transform,
  });
  effect.innerHTML = `<svg viewBox="0 0 120 120" width="100%" height="100%" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>`;
  host.append(effect);
  const remove = (): void => { window.clearTimeout(timer); effect.remove(); };
  const timer = window.setTimeout(remove, 340);
  if (typeof effect.animate === 'function') {
    const animation = effect.animate([
      { opacity: 1, transform: `${transform} scale(.65)` },
      { opacity: .95, transform: `${transform} scale(1)`, offset: .2 },
      { opacity: 0, transform: `${transform} scale(1.18)` },
    ], { duration: 230, easing: 'ease-out', fill: 'forwards' });
    animation.onfinish = remove;
    animation.oncancel = remove;
  }
  return true;
}
