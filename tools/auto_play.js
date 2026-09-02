// 瀏覽器自動玩家（介面層的壓力測試）。貼進開發模式的主控台（或用瀏覽器自動化工具注入）：
// 從標題點「新的一局」開始，隨機出牌、隨機走地圖、隨機選事件，一路點到結算畫面，
// 目的是抓「只有真的點介面才會出現」的錯誤（引擎測試蓋不到的）。
// 作弊：每場開戰把魔物血壓到 4、自己回滿，讓它一定走得到最後，把每種畫面都走過一遍。
// 看結果：__autoLog（最近 400 步）、__autoErrors（window error／unhandledrejection）、__autoScreens（各畫面步數）。
// 停：__autoStop = true。注意分頁放到背景時計時器會被節流，泡泡等演出要等更久。
(() => {
  window.__autoStop = false; window.__autoLog = []; window.__autoErrors = []; window.__autoSteps = 0; window.__autoScreens = {};
  if (!window.__autoHooked) { window.__autoHooked = true; window.addEventListener('error', (e) => __autoErrors.push('err:' + String(e.message))); window.addEventListener('unhandledrejection', (e) => __autoErrors.push('rej:' + String(e.reason))); }
  const log = (m) => { __autoLog.push(__autoSteps + ' ' + m); if (__autoLog.length > 400) __autoLog.shift(); };
  const vis = (el) => !!el && el.offsetParent !== null && !el.disabled && getComputedStyle(el).pointerEvents !== 'none';
  const q = (s) => document.querySelector(s); const qa = (s) => [...document.querySelectorAll(s)];
  let stuck = 0, lastSig = '', idle = 0, lastCsig = '', cheatedFor = null;
  function step() {
    if (__autoStop || __autoSteps > 8000) { clearInterval(__autoTimer); return; }
    __autoSteps++;
    const screen = q('#stage')?.dataset.screen; const app = window.__app;
    __autoScreens[screen] = (__autoScreens[screen] || 0) + 1;
    const dlg = q('.dialogue-overlay'); if (dlg) { (dlg.querySelector('.dialogue-box') || dlg).click(); log('dlg'); return; }
    const skip = qa('button').find((b) => b.textContent.includes('跳過') && vis(b)); if (skip) { skip.click(); log('skip'); return; }
    if (document.body.innerText.includes('點一下繼續')) { const c = document.elementFromPoint(innerWidth / 2, innerHeight / 2); if (c) { c.click(); log('continue-click'); return; } }
    const modal = q('.modal');
    if (modal) { const ok = modal.querySelector('.modal-foot button'); const cards = modal.querySelectorAll('.card'); if (cards.length && ok && ok.disabled) { cards[Math.floor(Math.random() * cards.length)].click(); log('modal card'); return; } if (ok && !ok.disabled) { ok.click(); log('modal ok'); return; } const btn = [...modal.querySelectorAll('button')].find(vis); if (btn) { btn.click(); log('modal btn ' + btn.textContent.slice(0, 6)); } return; }
    const swap = q('.swap-item'); if (swap) { swap.click(); log('swap'); return; }
    const comp = q('.compendium button'); if (comp) { comp.click(); log('comp close'); return; }
    const sig = screen + ':' + (app.cs ? app.cs.turn + ':' + app.cs.player.energy + ':' + app.cs.player.hand.length + ':' + app.cs.phase : '') + ':' + (app.run?.currentNode ?? '') + ':' + document.body.innerText.length;
    if (sig === lastSig) stuck++; else stuck = 0; lastSig = sig;
    if (stuck > 40) { __autoStop = true; log('STUCK on ' + screen + ' text=' + document.body.innerText.replace(/\s+/g, ' ').slice(0, 160)); return; }
    switch (screen) {
      case 'title': { const b = qa('button').find((b) => b.textContent.includes('新的一局') && vis(b)); if (b) { b.click(); log('new game'); } break; }
      case 'map': { const c = qa('.map-node.choice'); const pick = c[Math.floor(Math.random() * c.length)]; if (pick) { pick.click(); log('map ' + pick.title); } break; }
      case 'combat': {
        const cs = app.cs; if (!cs || cs.phase !== 'player') break;
        if (cheatedFor !== cs) { cheatedFor = cs; cs.player.hp = cs.player.maxHp; for (const e of cs.enemies) e.hp = Math.min(e.hp, 4); log('cheat ' + cs.encounterId); }
        if (q('.target-catcher')) { const alive = cs.enemies.filter((e) => !e.dead); const e = alive[Math.floor(Math.random() * alive.length)]; const node = e && q(`.unit.enemy[data-uid="${e.uid}"]`); if (node) { node.click(); log('target ' + e.name); } else { q('.target-catcher').click(); log('target cancel'); } break; }
        const endBtn = q('.end-turn');
        const csig = cs.turn + ':' + cs.player.energy + ':' + cs.player.hand.length + ':' + cs.player.hp;
        if (csig === lastCsig) idle++; else idle = 0; lastCsig = csig;
        const cards = qa('.hand .card').filter(vis);
        if (cs.turn > 1 && cs.player.hp < cs.player.maxHp * 0.5) cs.player.hp = cs.player.maxHp;
        if (idle >= 4 || cs.player.energy === 0 || !cards.length) { if (endBtn && vis(endBtn)) { endBtn.click(); log('end turn ' + cs.turn); idle = 0; } break; }
        const card = cards[Math.floor(Math.random() * cards.length)]; card.click(); log('card');
        break;
      }
      case 'reward': { const c = qa('.reward-cards .card').filter(vis); if (c.length) { c[Math.floor(Math.random() * c.length)].click(); log('reward card'); break; } const b = qa('button').filter(vis).find((b) => /繼續|不要|回地圖|出發|收下/.test(b.textContent)) || qa('.scene-actions button, .reward-actions button, .btn').filter(vis).pop(); if (b) { b.click(); log('reward btn ' + b.textContent.slice(0, 6)); } break; }
      case 'event': { const bs = qa('.scene-actions button, .event-actions button, .choices button').filter(vis); const b = bs[Math.floor(Math.random() * bs.length)] || qa('button').filter(vis).find((b) => !/圖鑑|牌組|音樂|音效|本局代碼/.test(b.textContent)); if (b) { b.click(); log('event ' + b.textContent.slice(0, 8)); } break; }
      case 'shop': { const buy = qa('.shelf button, .shop-item button, .price').filter(vis)[0]; if (buy && Math.random() < 0.5 && (app.run?.fish ?? 0) > 60) { buy.click(); log('shop buy'); break; } const b = qa('button').filter(vis).find((b) => /離開|走了|回地圖|不買/.test(b.textContent)) || qa('.scene-actions button').filter(vis).pop(); if (b) { b.click(); log('shop ' + b.textContent.slice(0, 6)); } break; }
      case 'rest': { const bs = qa('.scene-actions button').filter(vis); const b = bs[Math.floor(Math.random() * bs.length)] || qa('button').filter(vis).find((b) => /打盹/.test(b.textContent)); if (b) { b.click(); log('rest ' + b.textContent.slice(0, 6)); } break; }
      case 'chest': { const b = qa('.scene-actions button, button').filter(vis).find((b) => /繼續|拿走|回地圖|收下|出發/.test(b.textContent)) || qa('.scene-actions button').filter(vis).pop(); if (b) { b.click(); log('chest ' + b.textContent.slice(0, 6)); } break; }
      case 'actclear': { const t = qa('.pick-tile').filter(vis).find((t) => !t.classList.contains('picked') && !t.classList.contains('chosen')); const already = q('.pick-tile.picked, .pick-tile.chosen, .pick-tile.selected'); if (t && !already) { t.click(); log('actclear relic'); break; } const c = qa('.reward-cards .card, .actclear .card').filter(vis); if (c.length && !q('.card.picked, .card.chosen, .card.selected')) { c[0].click(); log('actclear card'); break; } const b = qa('button').filter(vis).find((b) => /出發|繼續|上路/.test(b.textContent)) || qa('.scene-actions button').filter(vis).pop(); if (b) { b.click(); log('actclear btn ' + b.textContent.slice(0, 6)); } break; }
      case 'result': { __autoStop = true; log('RESULT ' + app.run?.status + ' floor ' + app.run?.floor); break; }
      default: log('screen? ' + screen);
    }
  }
  if (window.__autoTimer) clearInterval(window.__autoTimer);
  window.__autoTimer = setInterval(() => { try { step(); } catch (e) { __autoErrors.push('step:' + (e && e.message)); } }, 350);
})();
