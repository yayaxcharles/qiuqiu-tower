// 四道門檻的新舊比對（純函式：吃兩版擷取到的資料，吐「發現」）。
//
// 每一筆發現：{ gate, id, hero, title, level: 'fail'|'warn'|'info', what, base?, head?, ... }
//   fail＝不通過（非預期差異，離開碼非 0）；warn＝要人看（有變，但在規矩內或機器判斷不了）；info＝列出來參考。
// id 是穩定的字串（例：`rest:feifei:a2:f24:nap`），允許清單（allow.json）照它比對放行。
//
// **原則：一模一樣的直接過，不量**。只有圖或大小真的變了，才拿去量頭／截圖給人看。所以同一版對同一版一定零差異。
import { HERO_NAME, contentIdOf } from './util.mjs';

export const T = {
  SIZE_FAIL: 0.05,      // 頭（或同一張圖的顯示大小）差超過 5%＝不通過（使用者 2026-09-23 的規矩）
  SIZE_WARN: 0.015,     // 1.5% 以上列出來給人看
  FEET_FAIL: 6,         // 戰鬥站位腳底線上下差超過 6 像素＝浮起來或沉下去
  FEET_WARN: 2,
  REST_PX: 1.0,         // 貓窩外框（位置或大小）差超過 1 像素就算動了（09-23 那次新舊差 0 像素）
  MIN_CORR: 0.85,       // 量頭的相關係數低於這個＝量不準，交給人看
  VIEW_POS_WARN: 6,
};

const pct = (r) => `${r >= 1 ? '+' : ''}${((r - 1) * 100).toFixed(1)}%`;
const near = (a, b, tol) => Math.abs((a ?? 0) - (b ?? 0)) <= tol;
const cid = (src) => contentIdOf(String(src ?? '').replace(/\?.*$/, ''));

/** 網址（http://127.0.0.1:埠/網站/assets/…）→ dist 裡的相對路徑 */
export function srcToRel(src, site) {
  if (!src) return null;
  const s = String(src).replace(/\?.*$/, '');
  const i = s.indexOf(`/${site}/`);
  return i >= 0 ? s.slice(i + site.length + 2) : s.replace(/^\/+/, '');
}

/* ======================= 門檻一：角色大小 ======================= */

/**
 * 規劃門檻一：哪些東西變了、要量哪幾張頭。回傳 { findings（先不含量頭結果）, jobs, pending（量完要回填的） }
 * sizeCap：兩版每隻的擷取（capture-size.mjs）；motion：diffMotion 的結果；dists：{ base, head } dist 路徑。
 */
export function planSize({ sizeCap, motion, baseActs, headActs, dists, site, heroes }) {
  const findings = [];
  const jobs = [];
  const pending = [];
  const templates = {};
  let checked = 0;
  const addJob = (j) => { if (!jobs.some((x) => x.id === j.id)) jobs.push(j); return j.id; };
  const texPath = (ver, act) => (act?.textureFile ? `${dists[ver]}/${act.textureFile}` : null);

  // 樣板：base 版戰鬥待機第 1 格
  const idleOf = (acts, hero) => [...acts.values()].find((a) => a.hero === hero && a.name === 'idle' && /^(qiuqiu|feifei|dangdang|fengfeng)$/.test(a.stem));
  for (const hero of heroes) {
    const idle = idleOf(baseActs, hero);
    if (idle && texPath('base', idle)) templates[hero] = { image: texPath('base', idle), rect: idle.frames[0].rect, scale: idle.scale };
  }
  const idleRefJobs = (hero) => {
    const out = {};
    for (const ver of ['base', 'head']) {
      const a = idleOf(ver === 'base' ? baseActs : headActs, hero);
      if (a && texPath(ver, a)) out[ver] = addJob({ id: `idle:${ver}:${hero}`, hero, image: texPath(ver, a), rect: a.frames[0].rect, scale: a.scale });
    }
    return out;
  };

  // --- 逐格動作（資料比對） ---
  checked += motion.same + motion.changed.length + motion.added.length;
  const MAXF = 12;
  for (const c of motion.changed) {
    const hero = c.head.hero;
    const title = `${HERO_NAME[hero]}「${c.head.name}」逐格動作（${c.head.stem}）`;
    const id = `size:motion:${hero}:${c.head.stem}:${c.head.name}`;
    if (!c.shape && !c.tex) {
      findings.push({ gate: 'size', id, hero, title, level: 'warn', what: '只改了停留時間（節奏），大小不會變；動得順不順看門檻三的膠卷。' });
      continue;
    }
    if (!templates[hero]) { findings.push({ gate: 'size', id, hero, title, level: 'warn', what: `${c.what.join('、')}；找不到 base 待機當樣板，沒辦法量頭，請人看。` }); continue; }
    const refs = idleRefJobs(hero);
    const frames = [];
    const n = Math.min(MAXF, c.head.frames.length);
    // 只換了圖集內容、格子位置與 scale 都沒動（例如整批重新壓縮）：每一格先跟舊版同一格比像素，幾乎一樣就不用量頭
    if (!c.shape && texPath('base', c.base)) {
      for (let i = 0; i < n; i++) {
        frames.push({ i, pair: addJob({ id: `m:pair:${c.id}:${i}`, hero, image: texPath('head', c.head), rect: c.head.frames[i].rect, scale: c.head.scale, thumb: true,
          twin: { image: texPath('base', c.base), rect: c.base.frames[i].rect, scale: c.base.scale, thumb: true } }) });
      }
      pending.push({ kind: 'motion', id, hero, title, what: c.what, frames, refs, cut: c.head.frames.length > MAXF ? c.head.frames.length : null, texOnly: true });
      continue;
    }
    for (let i = 0; i < n; i++) {
      const bi = c.base.frames.length === c.head.frames.length ? i : null;
      frames.push({
        i,
        head: addJob({ id: `m:head:${c.id}:${i}`, hero, image: texPath('head', c.head), rect: c.head.frames[i].rect, scale: c.head.scale, thumb: true }),
        base: bi !== null && texPath('base', c.base) ? addJob({ id: `m:base:${c.id}:${bi}`, hero, image: texPath('base', c.base), rect: c.base.frames[bi].rect, scale: c.base.scale, thumb: true }) : null,
      });
    }
    pending.push({ kind: 'motion', id, hero, title, what: c.what, frames, refs, cut: c.head.frames.length > MAXF ? c.head.frames.length : null });
  }
  for (const a of motion.added) {
    const hero = a.hero;
    const id = `size:motion:${hero}:${a.stem}:${a.name}`;
    const title = `${HERO_NAME[hero]}「${a.name}」逐格動作（新的，${a.stem}）`;
    if (!templates[hero] || !texPath('head', a)) { findings.push({ gate: 'size', id, hero, title, level: 'warn', what: '新動作，沒辦法量頭，請人看。' }); continue; }
    const refs = idleRefJobs(hero);
    const frames = [];
    for (let i = 0; i < Math.min(MAXF, a.frames.length); i++) frames.push({ i, head: addJob({ id: `m:head:${a.id}:${i}`, hero, image: texPath('head', a), rect: a.frames[i].rect, scale: a.scale, thumb: true }), base: null });
    pending.push({ kind: 'motion', id, hero, title, what: ['新動作'], frames, refs, isNew: true });
  }
  for (const a of motion.removed) {
    findings.push({ gate: 'size', id: `size:motion:${a.hero}:${a.stem}:${a.name}`, hero: a.hero, title: `${HERO_NAME[a.hero]}「${a.name}」逐格動作（${a.stem}）`, level: 'warn', what: '這個動作不見了（新版資料檔裡沒有）。' });
  }

  // --- 畫面上量到的東西（兩版各一份） ---
  for (const hero of heroes) {
    const B = sizeCap.base[hero], H = sizeCap.head[hero];
    if (!B || !H || B.err || H.err) {
      findings.push({ gate: 'size', id: `size:capture:${hero}`, hero, title: `${HERO_NAME[hero]} 擷取`, level: 'fail', what: `擷取失敗：${B?.err ?? H?.err ?? '沒有資料'}` });
      continue;
    }
    const views = [
      ...[0, 1, 2].map((i) => [`map${i + 1}`, `地圖頭像（第 ${i + 1} 關）`, B.map[i], H.map[i], 4]),
      ['portrait', '對白頭像', B.portrait, H.portrait, 1],
      ['actclear', '過關亮相（勝利立繪）', B.actclear, H.actclear, 1],
    ];
    if (sizeCap.base.__heroSelect && sizeCap.head.__heroSelect) views.push(['heroselect', '選角畫面', sizeCap.base.__heroSelect[hero], sizeCap.head.__heroSelect[hero], 1]);
    for (const [key, label, b, h, boost] of views) {
      checked++;
      viewCompare({ findings, pending, addJob, hero, key, label, b, h, boost, dists, site, templates, combat: false });
    }
    // 戰鬥待機（逐格畫布）：元素大小＋一整個循環的不透明外框聯集
    checked++;
    const bm = B.combatMotion, hm = H.combatMotion;
    const mid = `size:view:${hero}:combat_motion`, mtitle = `${HERO_NAME[hero]} 戰鬥待機（逐格畫布）`;
    if (!bm?.union || !hm?.union) {
      findings.push({ gate: 'size', id: mid, hero, title: mtitle, level: bm?.union || hm?.union ? 'fail' : 'warn', what: `畫布量不到（base：${bm?.err ?? (bm?.union ? '有' : '空')}，新版：${hm?.err ?? (hm?.union ? '有' : '空')}）`, base: { shot: bm?.shot }, head: { shot: hm?.shot } });
    } else {
      const same = bm.canvas.styleW === hm.canvas.styleW && bm.canvas.styleH === hm.canvas.styleH && bm.canvas.bottom === hm.canvas.bottom
        && near(bm.union.h, hm.union.h, 1.5) && near(bm.union.w, hm.union.w, 1.5) && near(bm.union.bottom, hm.union.bottom, 1.5);
      if (!same) {
        const r = hm.union.h / bm.union.h;
        const feet = hm.union.bottom - bm.union.bottom;
        const level = Math.abs(r - 1) > T.SIZE_FAIL || Math.abs(feet) > T.FEET_FAIL ? 'fail' : 'warn';
        findings.push({ gate: 'size', id: mid, hero, title: mtitle, level,
          what: `整隻高 ${bm.union.h}→${hm.union.h}（${pct(r)}）、腳底 ${feet >= 0 ? '往下' : '往上'} ${Math.abs(feet).toFixed(1)} 像素；畫布 ${bm.canvas.styleW}×${bm.canvas.styleH}→${hm.canvas.styleW}×${hm.canvas.styleH}`,
          base: { shot: bm.shot, cat: bm.union, clip: bm.clip }, head: { shot: hm.shot, cat: hm.union, clip: hm.clip } });
      }
    }
    // 戰鬥靜態立繪（?motion=0，每張換上去量）
    const keys = new Set([...Object.keys(B.combatStatic), ...Object.keys(H.combatStatic)].filter((k) => k !== '__native'));
    for (const k of [...keys].sort()) {
      checked++;
      viewCompare({ findings, pending, addJob, hero, key: `static:${k}`, label: `戰鬥靜態立繪 ${k.replace(/^hero\//, '')}`, b: B.combatStatic[k], h: H.combatStatic[k], boost: 1, dists, site, templates, combat: true });
    }
  }
  return { findings, jobs, pending, templates, checked };
}

function viewCompare({ findings, pending, addJob, hero, key, label, b, h, boost, dists, site, templates, combat }) {
  const id = key.startsWith('static:') ? `size:static:${hero}:${key.slice(7)}` : `size:view:${hero}:${key}`;
  const title = `${HERO_NAME[hero]} ${label}`;
  if (!b && !h) return;
  if (!h || h.err) { findings.push({ gate: 'size', id, hero, title, level: 'fail', what: `新版量不到（${h?.err ?? '沒有這一項'}）`, base: { shot: b?.shot } }); return; }
  if (!b || b.err) { queueHead(); return; }   // 新版才有的圖：量頭，跟待機比
  const sameSrc = cid(b.src) === cid(h.src);
  const sameGeo = near(b.pxPerNatural, h.pxPerNatural, b.pxPerNatural * 0.001) && b.cat && h.cat
    && near(b.cat.w, h.cat.w, 1) && near(b.cat.h, h.cat.h, 1) && near(b.cat.x, h.cat.x, 1) && near(b.cat.bottom, h.cat.bottom, 1);
  if (sameSrc && sameGeo) return;
  const feet = (h.cat?.bottom ?? 0) - (b.cat?.bottom ?? 0);
  const shift = Math.max(Math.abs((h.cat?.x ?? 0) - (b.cat?.x ?? 0)), Math.abs(feet));
  if (sameSrc) {
    const r = h.pxPerNatural / b.pxPerNatural;
    const bad = Math.abs(r - 1) > T.SIZE_FAIL || (combat && Math.abs(feet) > T.FEET_FAIL);
    const warn = Math.abs(r - 1) > T.SIZE_WARN || (combat ? Math.abs(feet) > T.FEET_WARN : shift > T.VIEW_POS_WARN);
    if (!bad && !warn) return;
    findings.push({ gate: 'size', id, hero, title, level: bad ? 'fail' : 'warn',
      what: `同一張圖，畫出來的大小 ${pct(r)}；${combat ? '腳底' : '位置'}${feet >= 0 ? '往下' : '往上'} ${Math.abs(feet).toFixed(1)} 像素（橫向 ${((h.cat?.x ?? 0) - (b.cat?.x ?? 0)).toFixed(1)}）`,
      base: { shot: b.shot, src: b.src, cat: b.cat, clip: b.clip }, head: { shot: h.shot, src: h.src, cat: h.cat, clip: h.clip } });
    return;
  }
  queueHead();
  function queueHead() {
    if (!templates[hero]) { findings.push({ gate: 'size', id, hero, title, level: 'warn', what: '圖換了，找不到樣板量頭，請人看。', base: { shot: b?.shot }, head: { shot: h?.shot } }); return; }
    const spec = (ver, m) => ({ hero, image: `${dists[ver]}/${srcToRel(m.src, site)}`, scale: m.pxPerNatural, boost, lo: boost > 1 ? 0.15 : 0.45, hi: boost > 1 ? 1.2 : 2.2 });
    const hasB = b && !b.err && b.src;
    // 兩版都有：一個工作（先比像素，幾乎一樣就不量頭）；新版才有：只量新版
    const jpair = hasB ? addJob({ id: `v:pair:${hero}:${key}`, ...spec('head', h), twin: spec('base', b) }) : null;
    const jh = hasB ? null : addJob({ id: `v:head:${hero}:${key}`, ...spec('head', h) });
    pending.push({ kind: 'view', id, hero, title, combat, feet: b?.cat && h?.cat ? h.cat.bottom - b.cat.bottom : 0, b, h, jpair, jh, refs: combat ? { base: `idle:base:${hero}`, head: `idle:head:${hero}` } : null });
    // 戰鬥靜態要跟同一隻待機比：base 待機第 1 格也量（新版待機有改時，逐格動作那邊會另外排新版的）
    if (combat) { const t = templates[hero]; addJob({ id: `idle:base:${hero}`, hero, image: t.image, rect: t.rect, scale: t.scale }); }
  }
}

/** 量完頭之後回填：算倍率、定等級 */
export function finishSize(plan, results, headIdle) {
  const out = [...plan.findings];
  const R = (id) => (id ? results[id] : null);
  const ok = (r) => r && !r.err && r.corr >= T.MIN_CORR;
  for (const p of plan.pending) {
    if (p.kind === 'motion') {
      const refB = R(p.refs.base), refH = R(p.refs.head);
      const idleB = ok(refB) ? refB.scale : 1, idleH = ok(refH) ? refH.scale : idleB;
      const rows = [];
      let fail = false, unsure = 0, similar = 0;
      for (const f of p.frames) {
        let h, b;
        if (f.pair) {
          const r = R(f.pair);
          if (r?.similar) { similar++; rows.push({ i: f.i, similar: true, pix: r, vsBase: 1 }); continue; }
          h = r; b = r?.twinRes;
        } else { h = R(f.head); b = R(f.base); }
        const row = { i: f.i, head: h, base: b, thumbHead: h?.thumb, thumbBase: b?.thumb, pix: h?.pix };
        if (!ok(h) || ((f.base || f.pair) && !ok(b))) { row.unsure = true; unsure++; rows.push(row); continue; }
        row.vsIdle = h.scale / idleH;
        row.vsBase = b ? h.scale / b.scale : null;
        const baseViol = b ? Math.abs(b.scale / idleB - 1) > T.SIZE_FAIL : false;
        row.bad = (row.vsBase !== null && Math.abs(row.vsBase - 1) > T.SIZE_FAIL) || (Math.abs(row.vsIdle - 1) > T.SIZE_FAIL && !baseViol);
        if (row.bad) fail = true;
        rows.push(row);
      }
      const worst = rows.filter((r) => r.vsBase !== undefined && r.vsBase !== null).map((r) => r.vsBase);
      const worstIdle = rows.filter((r) => r.vsIdle !== undefined).map((r) => r.vsIdle);
      const span = (a) => (a.length ? `${pct(Math.min(...a))}～${pct(Math.max(...a))}` : '—');
      // 改到的是待機本身：其他動作一格都沒動，但「跟待機比」全部跟著偏掉
      const isIdle = /:(qiuqiu|feifei|dangdang|fengfeng):idle$/.test(p.id) && worst.length && similar < rows.length;
      const idleNote = isIdle ? `。這是待機本身：其他動作沒改，但跟待機比等於全部差了 ${pct(1 / (worst.reduce((s, x) => s + x, 0) / worst.length))}` : '';
      if (similar === rows.length && rows.length) {
        const mx = Math.max(...rows.map((r) => r.pix?.maxBlock ?? 0));
        out.push({ gate: 'size', id: p.id, hero: p.hero, title: p.title, level: 'info',
          what: `${p.what.join('、')}；但每一格跟舊版同一格像素幾乎一樣（最大區塊差 ${mx.toFixed(1)}／255，多半是重新壓縮），格子位置與 scale 沒動，大小不會變` });
        continue;
      }
      out.push({ gate: 'size', id: p.id, hero: p.hero, title: p.title, level: fail ? 'fail' : 'warn',
        what: `${p.what.join('、')}。頭跟舊版同一格比 ${span(worst)}；跟${idleH !== idleB ? '（新版）' : ''}待機比 ${span(worstIdle)}${unsure ? `；${unsure} 格量不準（背面、躺姿、特寫），請看縮圖` : ''}${p.cut ? `；只量前 12 格（共 ${p.cut} 格）` : ''}${idleNote}`,
        frames: rows, idle: { base: idleB, head: idleH } });
    } else {
      const pr = R(p.jpair);
      const h = pr && !pr.similar ? pr : R(p.jh), b = pr && !pr.similar ? pr.twinRes : null;
      const refH = R(p.refs?.head) ?? R(p.refs?.base);
      let level = 'warn', what;
      if (pr?.similar) {
        // 圖檔換過（雜湊變了）但像素幾乎一樣：大小只看畫出來的比例與腳底
        const r = p.h.pxPerNatural / p.b.pxPerNatural;
        if (Math.abs(r - 1) > T.SIZE_FAIL || (p.combat && Math.abs(p.feet) > T.FEET_FAIL)) level = 'fail';
        else if (Math.abs(r - 1) <= T.SIZE_WARN && Math.abs(p.feet) <= T.FEET_WARN) level = 'info';
        what = `圖檔重新存過，像素跟舊版幾乎一樣（最大區塊差 ${pr.maxBlock}／255）；畫出來的大小 ${pct(r)}${p.combat ? `、腳底${p.feet >= 0 ? '往下' : '往上'} ${Math.abs(p.feet).toFixed(1)} 像素` : ''}`;
      } else if (ok(h) && ok(b)) {
        const r = h.scale / b.scale;
        const vsIdle = p.combat && ok(refH) ? h.scale / refH.scale : null;
        const baseIdle = p.combat && ok(R(p.refs?.base)) ? b.scale / R(p.refs.base).scale : null;
        const newViol = vsIdle !== null && Math.abs(vsIdle - 1) > T.SIZE_FAIL && !(baseIdle !== null && Math.abs(baseIdle - 1) > T.SIZE_FAIL);
        if (Math.abs(r - 1) > T.SIZE_FAIL || newViol || (p.combat && Math.abs(p.feet) > T.FEET_FAIL)) level = 'fail';
        what = `圖換了。頭跟舊版比 ${pct(r)}${vsIdle !== null ? `、跟待機比 ${pct(vsIdle)}` : ''}${p.combat ? `；腳底${p.feet >= 0 ? '往下' : '往上'} ${Math.abs(p.feet).toFixed(1)} 像素` : ''}`;
      } else if (ok(h) && !p.jpair) {
        const vsIdle = p.combat && ok(refH) ? h.scale / refH.scale : null;
        if (vsIdle !== null && Math.abs(vsIdle - 1) > T.SIZE_FAIL) level = 'fail';
        what = `新的圖。${vsIdle !== null ? `頭跟待機比 ${pct(vsIdle)}` : '請人看'}`;
      } else {
        what = `圖換了，頭量不準（相關 ${b?.corr ?? '—'}／${h?.corr ?? '—'}），請看截圖`;
      }
      out.push({ gate: 'size', id: p.id, hero: p.hero, title: p.title, level, what,
        base: { shot: p.b?.shot, src: p.b?.src, cat: p.b?.cat, clip: p.b?.clip, head: b }, head: { shot: p.h?.shot, src: p.h?.src, cat: p.h?.cat, clip: p.h?.clip, head: h } });
    }
  }
  return out;
}

/* ======================= 門檻二：貓窩位置 ======================= */

export function compareRest({ restCap, heroes }) {
  const findings = [];
  let checked = 0;
  for (const hero of heroes) {
    const B = restCap.base[hero], H = restCap.head[hero];
    if (!Array.isArray(B) || !Array.isArray(H)) {
      findings.push({ gate: 'rest', id: `rest:capture:${hero}`, hero, title: `${HERO_NAME[hero]} 貓窩擷取`, level: 'fail', what: `擷取失敗：${B?.err ?? H?.err ?? '沒有資料'}` });
      continue;
    }
    const k = (r) => `${r.act}:${r.floor}:${r.pose}`;
    const bm = new Map(B.map((r) => [k(r), r]));
    for (const h of H) {
      checked++;
      const b = bm.get(k(h));
      const id = `rest:${hero}:a${h.act}:f${h.floor}:${h.pose}`;
      const title = `${HERO_NAME[hero]} 第 ${h.act} 關貓窩（${h.restbg ?? '?'}）${POSE_NAME[h.pose] ?? h.pose}`;
      if (!b || !b.cat || !h.cat) {
        findings.push({ gate: 'rest', id, hero, title, level: 'fail', what: `量不到貓（base：${b?.err ?? (b?.cat ? '有' : '沒有')}；新版：${h.err ?? (h.cat ? '有' : '沒有')}）`, base: { shot: b?.shot }, head: { shot: h.shot } });
        continue;
      }
      const d = { x: h.cat.x - b.cat.x, y: h.cat.y - b.cat.y, w: h.cat.w - b.cat.w, h: h.cat.h - b.cat.h, bottom: h.cat.bottom - b.cat.bottom };
      const moved = Object.values(d).some((v) => Math.abs(v) > T.REST_PX);
      const sameSrc = cid(b.src) === cid(h.src);
      if (!moved && sameSrc && b.restbg === h.restbg) continue;
      const parts = [];
      if (Math.abs(d.bottom) > T.REST_PX) parts.push(`腳底${d.bottom > 0 ? '往下沉' : '往上浮'} ${Math.abs(d.bottom).toFixed(1)} 像素`);
      if (Math.abs(d.x) > T.REST_PX) parts.push(`往${d.x > 0 ? '右' : '左'} ${Math.abs(d.x).toFixed(1)} 像素`);
      if (Math.abs(d.w) > T.REST_PX || Math.abs(d.h) > T.REST_PX) parts.push(`外框 ${b.cat.w}×${b.cat.h} → ${h.cat.w}×${h.cat.h}（高 ${pct(h.cat.h / b.cat.h)}）`);
      if (!sameSrc) parts.push('立繪圖檔換了');
      if (b.restbg !== h.restbg) parts.push(`底圖 ${b.restbg} → ${h.restbg}`);
      findings.push({ gate: 'rest', id, hero, title, level: moved || b.restbg !== h.restbg ? 'fail' : 'warn', what: parts.join('；') + (moved ? '' : '（外框沒動，請看圖有沒有坐進籃子）'),
        delta: d, base: { shot: b.shot, cat: b.cat, src: b.src, clip: b.clip }, head: { shot: h.shot, cat: h.cat, src: h.src, clip: h.clip } });
    }
  }
  return { findings, checked };
}
export const POSE_NAME = { curl: '蜷縮（進門）', nap: '打盹', sharpen: '磨爪', helpup: '扶同伴', down: '倒地' };

/* ======================= 門檻三：動作流暢度 ======================= */

export const MT = {
  FLASH_MEAN: 222, FLASH_STD: 28,   // 整格偏白而且沒什麼層次＝閃白
  BLANK_STD: 3.5,                   // 整格幾乎單色＝空白
  SPIKE: 45,                        // 亮度突然跳這麼多、下一格又回來＝閃一下
  MISSING_MS: 60,                   // 角色不見多這麼久就算
  STATIC_N: 3,                      // 露出靜態立繪多這麼多格就算
  JUMP_PX: 30, JUMP_K: 1.35,        // 相鄰兩格中心跳太遠
  SIZE_JUMP: 0.08,                  // 相鄰兩格高度忽變
  TL_WIN: 70, TL_POS: 8, TL_SIZE: 0.05, TL_FAIL: 0.12, TL_WARN: 0.04,
};

/** 一段膠卷的指標：角色不見多久、露出靜態幾格、最大跳位、最大忽大忽小、閃白與空白格數 */
export function filmMetrics(scene) {
  const s = scene.samples ?? [];
  const st = scene.stats ?? [];
  const fr = scene.frameTimes ?? [];
  const m = { missingMs: 0, staticN: 0, maxJump: 0, maxJumpAt: null, maxSize: 0, maxSizeAt: null, flash: [], blank: [], spike: [] };
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], b = s[i];
    const dt = b.t - a.t;
    const combat = b.scr === 'combat' || b.mode?.startsWith('walk');
    if (b.t < 0) continue;
    if (combat && !b.ov && (b.mode === 'none' || b.mode === 'canvas-empty' || b.mode === 'walk-empty') && a.scr === b.scr) m.missingMs += Math.min(dt, 50);
    if (b.scr === 'combat' && (b.mode === 'static' || b.mode === 'both')) m.staticN++;
    if (a.b && b.b && dt <= 40) {
      const ca = [a.b[0] + a.b[2] / 2, a.b[1] + a.b[3] / 2], cb = [b.b[0] + b.b[2] / 2, b.b[1] + b.b[3] / 2];
      const j = Math.hypot(cb[0] - ca[0], cb[1] - ca[1]);
      if (j > m.maxJump) { m.maxJump = Math.round(j * 10) / 10; m.maxJumpAt = b.t; }
      const r = Math.abs(b.b[3] / a.b[3] - 1);
      if (r > m.maxSize) { m.maxSize = Math.round(r * 1000) / 1000; m.maxSizeAt = b.t; }
    }
  }
  m.missingMs = Math.round(m.missingMs);
  for (let i = 0; i < st.length; i++) {
    const [mean, sd] = st[i];
    const t = fr[i];
    if (t < -50) continue;
    if (mean > MT.FLASH_MEAN && sd < MT.FLASH_STD) m.flash.push(t);
    if (sd < MT.BLANK_STD) m.blank.push(t);
    if (i > 0 && i + 1 < st.length) {
      const d1 = mean - st[i - 1][0], d2 = mean - st[i + 1][0];
      if (Math.abs(d1) > MT.SPIKE && Math.abs(d2) > MT.SPIKE && Math.sign(d1) === Math.sign(d2)) m.spike.push(t);
    }
  }
  return m;
}

/** 新版的每一格，在舊版同一時間 ±70 毫秒內找得到位置、大小差不多的一格嗎？找不到的比例＝「演得不一樣」 */
export function timelineMismatch(base, head) {
  const bs = (base.samples ?? []).filter((x) => x.t >= 0);
  const hs = (head.samples ?? []).filter((x) => x.t >= 0);
  let n = 0, bad = 0, firstBad = null;
  let j0 = 0;
  for (const h of hs) {
    while (j0 < bs.length && bs[j0].t < h.t - MT.TL_WIN) j0++;
    let okOne = false, any = false;
    for (let j = j0; j < bs.length && bs[j].t <= h.t + MT.TL_WIN; j++) {
      const b = bs[j];
      any = true;
      if (!h.b && !b.b) { okOne = true; break; }
      if (!h.b || !b.b) continue;
      const dc = Math.max(Math.abs((h.b[0] + h.b[2] / 2) - (b.b[0] + b.b[2] / 2)), Math.abs((h.b[1] + h.b[3]) - (b.b[1] + b.b[3])));
      const ds = Math.abs(h.b[3] / b.b[3] - 1);
      if (dc <= MT.TL_POS && ds <= MT.TL_SIZE) { okOne = true; break; }
    }
    if (!any) continue;
    n++;
    if (!okOne) { bad++; if (firstBad === null) firstBad = h.t; }
  }
  return { n, bad, ratio: n ? bad / n : 0, firstBad };
}

export function compareMotion({ motionCap, heroes, scenes }) {
  const findings = [];
  let checked = 0;
  for (const hero of heroes) {
    const B = motionCap.base[hero], H = motionCap.head[hero];
    if (!B || !H || B.err || H.err) {
      findings.push({ gate: 'motion', id: `motion:capture:${hero}`, hero, title: `${HERO_NAME[hero]} 動作擷取`, level: 'fail', what: `擷取失敗：${B?.err ?? H?.err ?? '沒有資料'}` });
      continue;
    }
    for (const sc of scenes) {
      const b = B[sc.id], h = H[sc.id];
      if (!b && !h) continue;
      checked++;
      const base = `motion:${hero}:${sc.id}`;
      const title = `${HERO_NAME[hero]} ${sc.name}`;
      if (!b || !h || b.err || h.err) {
        findings.push({ gate: 'motion', id: `${base}:capture`, hero, title, level: 'fail', what: `沒錄到（base：${b?.err ?? (b ? '有' : '沒有')}；新版：${h?.err ?? (h ? '有' : '沒有')}）`, scene: sc.id });
        continue;
      }
      const mb = filmMetrics(b), mh = filmMetrics(h);
      const tl = timelineMismatch(b, h);
      const add = (kind, level, what) => findings.push({ gate: 'motion', id: `${base}:${kind}`, hero, title, level, what, scene: sc.id, metrics: { base: mb, head: mh, tl } });
      const at = (arr) => (arr.length ? `（${arr.slice(0, 4).join('、')} 毫秒${arr.length > 4 ? '…' : ''}）` : '');
      if (mh.flash.length > mb.flash.length) add('flash', mh.flash.length - mb.flash.length >= 2 ? 'fail' : 'warn', `整格閃白 ${mb.flash.length}→${mh.flash.length} 格${at(mh.flash)}`);
      if (mh.blank.length > mb.blank.length) add('blank', mh.blank.length - mb.blank.length >= 2 ? 'fail' : 'warn', `整格空白（單色） ${mb.blank.length}→${mh.blank.length} 格${at(mh.blank)}`);
      if (mh.spike.length > mb.spike.length) add('spike', 'warn', `畫面亮度閃一下 ${mb.spike.length}→${mh.spike.length} 次${at(mh.spike)}`);
      if (mh.missingMs > mb.missingMs + MT.MISSING_MS) add('missing', 'fail', `角色不見（沒畫出來）${mb.missingMs}→${mh.missingMs} 毫秒`);
      if (mh.staticN > mb.staticN + MT.STATIC_N) add('static', 'fail', `逐格模式下露出靜態立繪（舊畫風） ${mb.staticN}→${mh.staticN} 格`);
      if (mh.maxJump > mb.maxJump * MT.JUMP_K + MT.JUMP_PX) add('jump', 'fail', `相鄰兩格最大跳位 ${mb.maxJump}→${mh.maxJump} 像素（${mh.maxJumpAt} 毫秒）`);
      if (mh.maxSize > mb.maxSize + MT.SIZE_JUMP) add('size', 'fail', `相鄰兩格高度最大忽變 ${(mb.maxSize * 100).toFixed(1)}%→${(mh.maxSize * 100).toFixed(1)}%（${mh.maxSizeAt} 毫秒）`);
      if (tl.ratio > MT.TL_WARN) add('timeline', tl.ratio > MT.TL_FAIL ? 'fail' : 'warn', `跟舊版同一時間比，${(tl.ratio * 100).toFixed(1)}% 的格子位置或大小對不上（從 ${tl.firstBad} 毫秒開始）`);
    }
  }
  return { findings, checked };
}

/* ======================= 門檻四：事件圖片 ======================= */

const OTHER = (hero) => ['feifei', 'dangdang', 'fengfeng', 'ninja'].filter((x) => x !== hero);

export function compareEvents({ eventCap, heroes }) {
  const findings = [];
  // 要截哪幾塊：{ base|head: { hero: [{ i, slot }] } }（slot＝main／r<k>／all）
  const shootIdx = { base: {}, head: {} };
  let checked = 0;
  for (const hero of heroes) {
    const B = eventCap.base[hero], H = eventCap.head[hero];
    if (!Array.isArray(B) || !Array.isArray(H)) {
      findings.push({ gate: 'event', id: `event:capture:${hero}`, hero, title: `${HERO_NAME[hero]} 事件擷取`, level: 'fail', what: `擷取失敗：${B?.err ?? H?.err ?? '沒有資料'}` });
      continue;
    }
    // 用主圖鍵配對（文字會改、順序會變）；沒有主圖的才退回用標題
    const keyOf = (e) => e.mainKey ?? `title:${e.title}`;
    const bm = new Map(B.map((e) => [keyOf(e), e]));
    const hm = new Map(H.map((e) => [keyOf(e), e]));
    const want = (ver, i, slot) => {
      if (i === null || i === undefined) return;
      const list = (shootIdx[ver][hero] ??= []);
      if (!list.some((x) => x.i === i && x.slot === slot)) list.push({ i, slot });
    };
    for (const h of H) {
      checked++;
      const b = bm.get(keyOf(h));
      const slotBase = `event:${hero}:${keyOf(h)}`;
      const title = `${HERO_NAME[hero]}「${h.title}」`;
      const add = (slot, level, what, shotSlot, srcs = {}) => {
        findings.push({ gate: 'event', id: `${slotBase}:${slot}`, hero, title, level, what, evBase: b?.i ?? null, evHead: h.i, evSlot: shotSlot, ...srcs });
        want('base', b?.i, shotSlot); want('head', h.i, shotSlot);
      };
      // 絕對檢查：拿到別隻的版本（跟舊版無關，錯了就是錯）
      for (const [slot, key] of [['main', h.mainKey], ...h.choices.map((c, i) => [`r${i}`, c.key])]) {
        if (!key) continue;
        const other = OTHER(hero).find((o) => o !== 'ninja' && key.startsWith(`bg/event_${o}_`));
        if (other && !(h.tags ?? []).some((t) => t.includes(HERO_NAME[other]))) add(`${slot}:wronghero`, 'fail', `${slot === 'main' ? '主圖' : `選項 ${Number(slot.slice(1)) + 1} 結果圖`}用的是${HERO_NAME[other]}的版本（${key}）`, slot);
      }
      if (!b) { add('new', 'warn', `新事件（舊版沒有），請看圖文：主圖 ${h.mainKey ?? '（沒有）'}`, 'all'); continue; }
      if (h.mainMissing && !b.mainMissing) add('main:missing', 'fail', '主圖缺圖（舊版有）', 'main');
      if (cid(b.mainSrc) !== cid(h.mainSrc)) add('main', 'fail', `主圖換了${b.mainKey !== h.mainKey ? `（鍵 ${b.mainKey} → ${h.mainKey}）` : '（同一個鍵，圖的內容變了）'}`, 'main', { srcB: b.mainSrc, srcH: h.mainSrc });
      const n = Math.max(b.choices.length, h.choices.length);
      if (b.choices.length !== h.choices.length) add('choices', 'warn', `選項數 ${b.choices.length} → ${h.choices.length}`, 'all');
      let imgChanged = false;
      for (let i = 0; i < n; i++) {
        const cb = b.choices[i], ch = h.choices[i];
        if (!cb || !ch) continue;
        if (ch.missing && !cb.missing) { add(`r${i}:missing`, 'fail', `選項 ${i + 1}「${ch.label.slice(0, 14)}」結果圖缺圖（舊版有）`, `r${i}`); imgChanged = true; }
        if (cid(cb.src) !== cid(ch.src) || cb.key !== ch.key) {
          imgChanged = true;
          add(`r${i}`, 'fail', `選項 ${i + 1}「${ch.label.slice(0, 14)}」結果圖${!cb.key ? '從沒有變成有' : !ch.key ? '不見了' : cb.key !== ch.key ? `換鍵 ${cb.key} → ${ch.key}` : '內容變了'}`, `r${i}`, { srcB: cb.src, srcH: ch.src });
        }
      }
      const textChanged = b.title !== h.title || b.text !== h.text || b.choices.some((c, i) => h.choices[i] && (c.label !== h.choices[i].label || c.result !== h.choices[i].result));
      if (textChanged && !imgChanged && cid(b.mainSrc) === cid(h.mainSrc)) add('text', 'warn', '文字改了、圖沒換：請對一下圖文還對不對得上', 'all');
    }
    for (const b of B) {
      if (!hm.has(keyOf(b))) {
        findings.push({ gate: 'event', id: `event:${hero}:${keyOf(b)}:gone`, hero, title: `${HERO_NAME[hero]}「${b.title}」`, level: 'fail', what: '這個事件在新版的清單裡不見了（或主圖鍵換了）', evBase: b.i, evHead: null, evSlot: 'all' });
        want('base', b.i, 'all');
      }
    }
  }
  return { findings, shootIdx, checked };
}

/**
 * 事件圖換了的那幾筆：兩版都有圖的，排一個「比像素」的工作。
 * 幾乎一樣（整批重新壓縮之類）就降成「要人看」並寫明，不當成換了一張圖。
 */
export function planEventPix(findings, dists, site) {
  const jobs = [];
  for (const f of findings) {
    if (f.gate !== 'event' || !f.srcB || !f.srcH) continue;
    f.pixJob = `px:${f.id}`;
    jobs.push({ id: f.pixJob, kind: 'pixdiff', a: `${dists.head}/${srcToRel(f.srcH, site)}`, b: `${dists.base}/${srcToRel(f.srcB, site)}` });
  }
  return jobs;
}

export function finishEventPix(findings, results) {
  for (const f of findings) {
    const r = f.pixJob ? results[f.pixJob] : null;
    if (!r || r.err) continue;
    if (r.similar) {
      f.level = 'warn';
      f.what += `——但像素跟舊版幾乎一樣（平均差 ${r.mean}、最大區塊差 ${r.maxBlock}／255），多半是重新壓縮；確定是刻意的就寫進允許清單`;
    } else if (r.sizeSame) {
      f.what += `（像素平均差 ${r.mean}、最大區塊差 ${r.maxBlock}／255）`;
    } else {
      f.what += `（圖的尺寸也不一樣：${r.sizeB?.join('×')} → ${r.sizeA?.join('×')}）`;
    }
  }
}

/* ======================= 全部素材清單的差異（打包後的檔名帶內容雜湊碼） ======================= */

function flatten(man) {
  const out = new Map();
  for (const g of ['cards', 'sprites', 'icons', 'bg']) for (const [k, v] of Object.entries(man[g] ?? {})) out.set(`${g}|${k}`, v);
  for (const [k, v] of Object.entries(man.monsters ?? {})) for (const [p, f] of Object.entries(v ?? {})) out.set(`monsters|${k}|${p}`, f);
  for (const [k, v] of Object.entries(man.files ?? {})) if (/\.(webp|png|jpe?g)$/.test(k)) out.set(`files|${k}`, v);
  return out;
}

export function manifestDiff(baseMan, headMan) {
  const a = flatten(baseMan), b = flatten(headMan);
  const changed = [], added = [], removed = [];
  for (const [k, v] of b) { if (!a.has(k)) added.push(k); else if (contentIdOf(a.get(k)) !== contentIdOf(v)) changed.push(k); }
  for (const k of a.keys()) if (!b.has(k)) removed.push(k);
  return { changed, added, removed, total: b.size };
}

/** 事件命名空間（bg/event_*）的圖在清單層級有變、卻不在四隻的事件清單裡（紙箱、問號格那些）：也算門檻四 */
export function globalEventFindings(md, coveredKeys) {
  const out = [];
  for (const [list, what, level] of [[md.changed, '圖的內容變了', 'fail'], [md.removed, '這張圖從清單裡不見了', 'fail'], [md.added, '新增的圖', 'info']]) {
    for (const k of list) {
      const m = /^bg\|(bg\/event_.+)$/.exec(k);
      if (!m || coveredKeys.has(m[1])) continue;
      out.push({ gate: 'event', id: `event:global:${m[1]}`, hero: null, title: m[1], level, what: `${what}（不在四隻的事件清單裡，可能是紙箱／問號格／祝福這類畫面用的）` });
    }
  }
  return out;
}

/* ======================= 允許清單 ======================= */

export function globToRe(g) {
  return new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
}

export function applyAllow(findings, allow) {
  const rules = (allow?.items ?? []).filter((x) => x && x.match).map((x) => ({ ...x, re: globToRe(x.match), used: 0 }));
  for (const f of findings) {
    const r = rules.find((x) => x.re.test(f.id));
    if (r) { f.allowed = true; f.allowWhy = r.why ?? ''; r.used++; }
  }
  return rules.map(({ re, ...x }) => x);
}

export function gateStatus(findings) {
  const live = findings.filter((f) => !f.allowed);
  if (live.some((f) => f.level === 'fail')) return 'fail';
  if (live.some((f) => f.level === 'warn')) return 'warn';
  return 'pass';
}
