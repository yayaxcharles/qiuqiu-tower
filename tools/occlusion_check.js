(() => {
  const vw = innerWidth, vh = innerHeight;
  const sel = 'button, .btn, [role=button], a[href], input, select, textarea, .card, .relic, .potion, .unit, .intent, .node, .map-node, .pick-tile, .showcase-card, .item, .slot, .diff-btn, .tab';
  const els = [...document.querySelectorAll(sel)];
  const issues = [];
  const desc = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '') + (el.textContent && el.textContent.trim() ? ' "' + el.textContent.trim().replace(/\s+/g, ' ').slice(0, 14) + '"' : '');
  const hiddenUp = (el) => { let a = el; while (a && a !== document.documentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return true; a = a.parentElement; } return false; };
  let checked = 0;
  for (const el of els) {
    if (hiddenUp(el)) continue;
    if (getComputedStyle(el).pointerEvents === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    checked++;
    const out = r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1;
    const pts = [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]);
    let blocked = 0, blocker = null;
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x >= vw || y >= vh) { blocked++; continue; }
      const h = document.elementFromPoint(x, y);
      if (!h) { blocked++; continue; }
      if (h === el || el.contains(h) || h.contains(el)) continue;
      blocked++; blocker = blocker || desc(h);
    }
    const cs = getComputedStyle(el);
    const clipped = el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'visible';
    if (blocked || out || clipped) issues.push({ el: desc(el), blocked: blocked + '/5', by: blocker, out, clipped, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
  }
  return { screen: document.querySelector('#stage')?.dataset.screen, vw, vh, checked, issues: issues.slice(0, 40) };
})()
