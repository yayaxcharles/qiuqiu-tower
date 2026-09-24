// 狀態牌子折行時，角色與魔物的腳底會不會動（2026-09-25，使用者：「角色會突然往上移，變成不是站在地上……腳離地」）。
//
// 用法：開發模式進到任何一場戰鬥（要有 window.__app），把整份貼進主控台，或用瀏覽器自動化工具注入執行
//（回傳一個 Promise，結果在 .then 裡；Playwright 的 page.evaluate 會自己等）。
// 倉庫測試刻意不裝畫面環境（雲端 npm ci 沒有瀏覽器），排版量不到，所以這支是手動量測；
// 做法的規矩由 tests/ui/chip_float_0925.test.ts 釘著。
//
// 量什麼：座位 0 那位、第一隻活著的魔物，牌子從少加到 12 塊以上，每加一塊就整頁安靜重畫一次，量
//   - 立繪框（.sprite-box）底邊的舞台座標：**重畫完同一拍**（驗 chipLift.settle）與**兩格之後**（驗 ResizeObserver）各量一次
//   - 實際腳底（不透明像素最下緣）：逐格畫布直接讀、靜態立繪把圖讀進離屏畫布找，照 object-fit 換算。待機呼吸會讓它晃 1～2 像素
//   - 牌子列排數、牌子數
// 三組：
//   貓·同一姿勢：只加不換待機姿勢的牌子（蜷縮、爪力＜5、貓步＜5、反彈、不壞身、潛水、下回合飯糰、回魂香、針上有毒、能力牌）
//   貓·中毒姿勢：先掛中毒（中毒的姿勢優先序最高，之後姿勢不再換），再加翻肚、懶洋洋、炸毛、定身……
//   魔物：不加防禦（有防禦會換成防禦姿勢），加爪力、中毒、翻肚、懶洋洋、炸毛、定身、迷魂、鱗甲、縮殼
// 判準：同一組裡每一步的框底邊（兩次都算）跟第一步差 ≤ 2 像素才算過（ok）。量完把兩位還原、重畫。
(async () => {
  const app = window.__app;
  if (!app?.cs) return { error: '要在戰鬥畫面、開發模式（window.__app）下執行' };
  const cs = app.cs;
  const stage = document.getElementById('stage');
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const toStage = (y) => {
    const sr = stage.getBoundingClientRect();
    return Math.round(((y - sr.top) / (sr.height / stage.offsetHeight)) * 10) / 10;
  };
  const alphaBottom = (data, w, h) => {
    for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 16) return y;
    return -1;
  };
  const bmpCache = new Map();
  async function footOf(box) {
    const canvas = [...box.querySelectorAll('canvas')].find((c) => c.width > 0 && getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().height > 0);
    if (canvas) {
      try {
        const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const lo = alphaBottom(d, canvas.width, canvas.height);
        const r = canvas.getBoundingClientRect();
        return lo < 0 ? null : toStage(r.top + ((lo + 1) / canvas.height) * r.height);
      } catch { return null; }
    }
    const img = box.querySelector('img.sprite');
    if (!img || !img.complete || !img.naturalWidth) return null;
    const url = img.currentSrc || img.src;
    let hit = bmpCache.get(url);
    if (!hit) {
      const bmp = await createImageBitmap(await (await fetch(url)).blob());
      const oc = new OffscreenCanvas(bmp.width, bmp.height);
      const octx = oc.getContext('2d');
      octx.drawImage(bmp, 0, 0);
      hit = { w: bmp.width, h: bmp.height, lo: alphaBottom(octx.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width, bmp.height) };
      bmpCache.set(url, hit);
    }
    if (hit.lo < 0) return null;
    const r = img.getBoundingClientRect();
    const ow = img.offsetWidth, oh = img.offsetHeight;
    const k = Math.min(ow / hit.w, oh / hit.h);
    return toStage(r.top + (oh - hit.h * k + (hit.lo + 1) * k) * (r.height / oh));
  }
  const unitSel = (who) => (who === 'player' ? '#screen .unit.player[data-seat="0"]' : `#screen .unit.enemy[data-uid="${who}"]`);
  const snapBox = (who) => {
    const u = document.querySelector(unitSel(who));
    if (!u) return null;
    const chips = u.querySelector(':scope > .chips');
    const tops = new Set([...(chips?.children ?? [])].map((c) => Math.round(c.getBoundingClientRect().top)));
    return { u, boxBottom: toStage(u.querySelector('.sprite-box').getBoundingClientRect().bottom), rows: tops.size, chips: chips?.children.length ?? 0,
      unitBottom: toStage(u.getBoundingClientRect().bottom), lift: u.style.getPropertyValue('--chips-lift') || '0' };
  };

  const p = cs.players[0];
  const e = cs.enemies.find((x) => !x.dead);
  const keepP = { statuses: { ...p.statuses }, block: p.block, powers: [...(p.powers ?? [])], energyNextTurn: p.energyNextTurn, guardLethal: p.guardLethal, poisonNextAttack: p.poisonNextAttack, hp: p.hp };
  const keepE = e ? { statuses: { ...e.statuses }, block: e.block } : null;
  const resetP = () => {
    p.statuses = {}; p.block = 0; p.powers = []; p.hp = p.maxHp;
    delete p.energyNextTurn; delete p.guardLethal; delete p.poisonNextAttack;
  };
  const power = (cardId) => (q) => { q.powers = [...(q.powers ?? []), { trigger: 'passive', effects: [], cardId }]; };
  const st = (name, v) => (q) => { q.statuses = { ...q.statuses, [name]: v }; };
  const SAME = [
    ['蜷縮8', (q) => { q.block = 8; }], ['爪力2', st('爪力', 2)], ['貓步2', st('貓步', 2)], ['反彈2', st('反彈', 2)],
    ['不壞身1', st('不壞身', 1)], ['潛水1', st('潛水', 1)], ['下回合飯糰', (q) => { q.energyNextTurn = 1; }],
    ['回魂香', (q) => { q.guardLethal = true; }], ['針上有毒', (q) => { q.poisonNextAttack = { amount: 2 }; }],
    ['能力牌1', power('jiejie')], ['能力牌2', power('fengyin')], ['能力牌3', power('gaotui')],
  ];
  const CHOKE = [
    ['中毒3', st('中毒', 3)], ['蜷縮8', (q) => { q.block = 8; }], ['翻肚2', st('翻肚', 2)], ['懶洋洋2', st('懶洋洋', 2)],
    ['炸毛1', st('炸毛', 1)], ['定身1', st('定身', 1)], ['爪力2', st('爪力', 2)], ['貓步2', st('貓步', 2)],
    ['反彈2', st('反彈', 2)], ['不壞身1', st('不壞身', 1)], ['潛水1', st('潛水', 1)], ['鐵布衫1', st('鐵布衫', 1)],
  ];
  const FOE = [
    ['爪力2', st('爪力', 2)], ['中毒5', st('中毒', 5)], ['翻肚2', st('翻肚', 2)], ['懶洋洋1', st('懶洋洋', 1)], ['炸毛2', st('炸毛', 2)],
    ['定身1', st('定身', 1)], ['迷魂1', st('迷魂', 1)], ['鱗甲2', st('鱗甲', 2)], ['縮殼1', st('縮殼', 1)],
  ];
  const out = { hero: p.hero ?? 'ninja', enemy: e?.enemyId, groups: {}, ok: true, maxDrift: 0 };
  async function run(label, who, target, steps, reset) {
    reset();
    const rows = [];
    const doStep = async (name) => {
      app.show('combat', {}, { quiet: true });
      const sync = snapBox(who);   // 重畫完同一拍
      await frame();
      await wait(60);
      const late = snapBox(who);
      if (!sync || !late) { rows.push({ step: name, err: '找不到那一格' }); return; }
      rows.push({ step: name, chips: late.chips, rows: late.rows, boxSync: sync.boxBottom, box: late.boxBottom, foot: await footOf(late.u.querySelector('.sprite-box')), unitBottom: late.unitBottom, lift: late.lift });
    };
    await doStep('（起點）');
    for (const [name, apply] of steps) { apply(target); await doStep(name); }
    const base = rows[0]?.box;
    let drift = 0;
    for (const r of rows) if (typeof r.box === 'number') drift = Math.max(drift, Math.abs(r.box - base), Math.abs(r.boxSync - base));
    out.groups[label] = { drift: Math.round(drift * 10) / 10, rows };
    out.maxDrift = Math.max(out.maxDrift, drift);
    if (drift > 2) out.ok = false;
  }
  try {
    await run('貓·同一姿勢', 'player', p, SAME, resetP);
    await run('貓·中毒姿勢', 'player', p, CHOKE, resetP);
    if (e) await run('魔物', e.uid, e, FOE, () => { e.statuses = {}; e.block = 0; });
  } finally {
    Object.assign(p, keepP);
    for (const k of ['energyNextTurn', 'guardLethal', 'poisonNextAttack']) if (keepP[k] === undefined) delete p[k];
    if (e && keepE) Object.assign(e, keepE);
    app.show('combat', {}, { quiet: true });
  }
  out.maxDrift = Math.round(out.maxDrift * 10) / 10;
  return out;
})()
