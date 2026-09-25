#!/usr/bin/env node
/*
 * 畫面比對閘門（2026-09-25）：推上線前，把「要推的這一版」跟「線上正在跑的那一版」逐一比四道硬門檻。
 *
 *   npm run gate:visual                      比目前工作樹 vs 線上那一版（連線版 coopdeploy/main；在 main 分支上跑就比單機版 origin/main）
 *   npm run gate:visual -- --base <git 參照>  指定 base（例：--base HEAD 比「未提交的改動」、--base 48ea5685）
 *   npm run gate:visual -- --head <git 參照>  新版改比某一筆提交（預設是目前工作樹）
 *   npm run gate:visual -- --quick           快速版：動作流暢度只錄近戰、丟東西、挨打、勝利四段
 *   其他：--heroes ninja,feifei   --gates size,rest,motion,event   --allow <允許清單.json>   --out <報告根目錄>   --site coop|single
 *
 * 四道門檻（使用者 2026-09-23 明講不可再犯）：①角色大小（比頭不比外框）②貓窩位置 ③動作流暢度 ④事件圖片。
 *
 * 做法：base 那一筆與目前工作樹**都在本機打包**（`lib/prepare.mjs`），各開一個本機埠（`lib/server.mjs`，閘門自己的行程裡），
 * 用本機的 Chrome（playwright-core＋channel: 'chrome'，每個工作一個獨立設定資料夾，放 C:/pwsw 短路徑）以同一顆種子、同一串動作驅動兩邊，
 * 能比資料就比資料（外框數字、動作資料、打包後的內容雜湊碼），真的有變才量頭、截圖給人看。
 * **不連任何線上網址**（2026-09-14 曾在線上網址寫 localStorage 蓋掉玩家存檔）。
 *
 * 產出：報告夾（預設 <倉庫上一層>/qiuqiu-gate-reports/<日期時間>/report.html），終端機印路徑。
 * 離開碼：0＝沒有不通過（可能有「要人看」）；1＝有非預期差異；2＝閘門自己出錯。
 * 預期內的改動（這批本來就換了某張圖）：寫進 tools/visual-gate/allow.json 放行，格式見那個檔。
 *
 * **這支沒有接進推送閘門**（`tools/prepush_gate.sh`）：誤報會卡住部署，要不要硬接由使用者決定。`tools/deploy.sh` 開頭有提醒。
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { loadManifest, prepareBase, prepareHead, pruneCache, resolveBase } from './lib/prepare.mjs';
import { startServer } from './lib/server.mjs';
import { killOwnChrome, loadPlaywright, newContext } from './lib/browser.mjs';
import { captureSize } from './lib/capture-size.mjs';
import { captureRest } from './lib/capture-rest.mjs';
import { captureEvents, shootEvents } from './lib/capture-event.mjs';
import { captureMotion, MOTION_SCENES } from './lib/capture-motion.mjs';
import { frameStats, saveGrid } from './lib/film.mjs';
import { collectMotion, diffMotion } from './lib/motiondata.mjs';
import { applyAllow, compareEvents, compareMotion, compareRest, filmMetrics, finishEventPix, finishSize, globalEventFindings, manifestDiff, planEventPix, planSize, timelineMismatch } from './lib/compare.mjs';
import { filmHtml, restOverview, writeReport } from './lib/report.mjs';
import { fmtSec, git, HEROES, readJson, stamp, TOOL_DIR } from './lib/util.mjs';

const ALL_GATES = ['size', 'rest', 'motion', 'event'];

function parseArgs(argv) {
  const a = { base: null, head: null, site: null, quick: false, heroes: HEROES, gates: ALL_GATES, allow: null, out: null, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--base') a.base = v();
    else if (k === '--head') a.head = v();
    else if (k === '--site') a.site = { coop: 'coopdeploy', single: 'origin' }[v()] ?? argv[i];
    else if (k === '--quick') a.quick = true;
    else if (k === '--full') a.quick = false;
    else if (k === '--heroes') a.heroes = v().split(',').filter((h) => HEROES.includes(h));
    else if (k === '--gates') a.gates = v().split(',').filter((g) => ALL_GATES.includes(g));
    else if (k === '--allow') a.allow = v();
    else if (k === '--out') a.out = v();
    else if (k === '--keep') a.keep = true;
    else if (k === '-h' || k === '--help') { a.help = true; }
    else throw new Error(`看不懂的參數：${k}（用 --help 看用法）`);
  }
  return a;
}

const log = (...m) => console.log(...m);

async function pool(tasks, n) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); }
  }));
  return out;
}

function pythonOk() {
  for (const py of ['python', 'python3', 'py']) {
    const r = spawnSync(py, ['-c', 'import cv2, numpy, PIL'], { windowsHide: true });
    if (r.status === 0) return py;
  }
  return null;
}

/** 報告夾只留最近 15 份（只動名字是「日期-時間」的資料夾，那是這支自己產生的） */
function pruneReports(outRoot, keep = 15) {
  const dirs = readdirSync(outRoot).filter((d) => /^\d{8}-\d{6}$/.test(d)).sort();
  for (const d of dirs.slice(0, Math.max(0, dirs.length - keep))) rmSync(join(outRoot, d), { recursive: true, force: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(readHelp()); return 0; }
  const T0 = Date.now();
  const timings = {};
  const tick = (name, t) => { timings[name] = fmtSec(Date.now() - t); };
  const repoTop = git(process.cwd(), ['rev-parse', '--show-toplevel']).replace(/\//g, '/');
  const pkg = readJson(join(repoTop, 'package.json'));
  if (pkg.name !== 'qiuqiu-tower') throw new Error(`這裡不是爪破魔塔的倉庫：${repoTop}`);

  const base = resolveBase(repoTop, args.base, args.site);
  // 新版：預設是目前工作樹（含未提交的改動）；給了 --head 就改比那一筆提交（跟 base 一樣從 git 解出來打包）
  const headRef = args.head ? git(repoTop, ['rev-parse', '--verify', `${args.head}^{commit}`]) : null;
  const headSha = headRef ?? git(repoTop, ['rev-parse', 'HEAD']);
  const dirty = headRef ? false : !!git(repoTop, ['status', '--porcelain', '--', 'src', 'public', 'index.html', 'vite.config.ts']);
  const outRoot = resolve(args.out ?? join(repoTop, '..', 'qiuqiu-gate-reports'));
  const runId = stamp();
  const reportDir = join(outRoot, runId);
  const cacheRoot = join(outRoot, '_cache');
  const workDir = join(cacheRoot, `run-${runId}`);
  const runTag = `vg-${runId}`;
  mkdirSync(reportDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });
  const allowFile = resolve(args.allow ?? join(TOOL_DIR, 'allow.json'));
  const allow = readJson(allowFile, { items: [] });
  const scenes = args.quick ? MOTION_SCENES.filter((s) => ['melee', 'throw', 'hurt', 'victory'].includes(s.id)) : MOTION_SCENES;
  const heroes = args.heroes;
  const gates = args.gates;

  log(`畫面比對閘門：base ${base.sha.slice(0, 8)}（${base.label}） vs ${headRef ? `提交 ${args.head}` : '目前工作樹'} ${headSha.slice(0, 8)}${dirty ? '＋未提交改動' : ''}`);
  for (const n of base.notes) log('  注意：' + n);

  // ---- 1. 兩版都在本機打包 ----
  let t = Date.now();
  log('[1/5] 打包兩版…');
  const [B, H] = await Promise.all([
    prepareBase(repoTop, repoTop, base.sha, base.site, cacheRoot, log),
    headRef ? prepareBase(repoTop, repoTop, headRef, base.site, cacheRoot, log) : prepareHead(repoTop, base.site, workDir, log),
  ]);
  if (B.cached) log('  base 用快取（同一筆打包過）');
  tick('打包', t);
  const dists = { base: B.dist, head: H.dist };
  const man = { base: loadManifest(B.dist), head: loadManifest(H.dist) };
  const srv = { base: await startServer(B.dist, base.site), head: await startServer(H.dist, base.site) };
  log(`  本機預覽：base ${srv.base.url}　新版 ${srv.head.url}`);

  await loadPlaywright();
  const logs = { base: [], head: [] };
  const shotDir = { base: join(reportDir, 'shots', 'base'), head: join(reportDir, 'shots', 'head') };
  const sizeCap = { base: {}, head: {} }, restCap = { base: {}, head: {} }, eventCap = { base: {}, head: {} }, motionCap = { base: {}, head: {} };
  const errDir = join(reportDir, 'errors');
  const guard = async (C, what, fn) => {
    try { return await fn(); } catch (e) {
      mkdirSync(errDir, { recursive: true });
      await C.page.screenshot({ path: join(errDir, `${what}.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
      log(`  ✗ ${what} 失敗：${String(e?.message ?? e).split('\n')[0]}`);
      return { err: String(e?.message ?? e).slice(0, 400) };
    }
  };

  try {
    // ---- 2. 靜態擷取（大小、貓窩、事件）：兩版 × 每隻一個瀏覽器，同時跑 ----
    t = Date.now();
    log('[2/5] 擷取角色大小、貓窩、事件清單…');
    const staticTasks = [];
    for (const ver of ['base', 'head']) {
      for (const hero of heroes) {
        staticTasks.push(async () => {
          const C = await newContext(runTag, `${ver}-${hero}`);
          try {
            if (gates.includes('size')) {
              const r = await guard(C, `${ver}_${hero}_size`, () => captureSize({ page: C.page, url: srv[ver].url, hero, manifest: man[ver], shotDir: shotDir[ver], heroSelect: hero === heroes[0] }));
              sizeCap[ver][hero] = r;
              if (r.heroSelect) sizeCap[ver].__heroSelect = r.heroSelect;
            }
            if (gates.includes('rest')) restCap[ver][hero] = await guard(C, `${ver}_${hero}_rest`, () => captureRest({ page: C.page, url: srv[ver].url, hero, manifest: man[ver], shotDir: shotDir[ver] }));
            if (gates.includes('event')) eventCap[ver][hero] = await guard(C, `${ver}_${hero}_event`, () => captureEvents({ page: C.page, url: srv[ver].url, hero }));
          } finally {
            logs[ver].push(...C.logs.map((l) => ({ ...l, tag: hero })));
            await C.close();
          }
        });
      }
    }
    await pool(staticTasks, 8);
    tick('大小／貓窩／事件擷取', t);

    // ---- 3. 動作膠卷：同一隻的兩版同時錄（負載對稱），兩隻一組 ----
    const films = {};
    if (gates.includes('motion')) {
      t = Date.now();
      log(`[3/5] 錄動作膠卷（${scenes.map((s) => s.name).join('、')}）…`);
      const motionTasks = [];
      for (const hero of heroes) {
        motionTasks.push(async () => {
          await Promise.all(['base', 'head'].map(async (ver) => {
            const C = await newContext(runTag, `m-${ver}-${hero}`);
            try {
              const r = await guard(C, `${ver}_${hero}_motion`, () => captureMotion({ page: C.page, url: srv[ver].url, hero, only: scenes.map((s) => s.id), log: ver === 'head' ? log : () => {} }));
              if (!r.err) {
                const ap = await C.ctx.newPage();
                await ap.goto('about:blank');
                for (const [id, sc] of Object.entries(r)) {
                  if (!sc?.frames) continue;
                  sc.stats = await frameStats(ap, sc.frames);
                  sc.frameTimes = sc.frames.map((f) => f.t);
                  const dur = scenes.find((s) => s.id === id)?.dur ?? 2000;
                  const grid = saveGrid(sc.frames, -100, dur, 50, join(reportDir, 'film', `${hero}_${id}`), ver);
                  ((films[hero] ??= {})[id] ??= {})[ver] = grid;
                  delete sc.frames;
                }
                await ap.close();
              }
              motionCap[ver][hero] = r;
            } finally {
              logs[ver].push(...C.logs.map((l) => ({ ...l, tag: `${hero}-動作` })));
              await C.close();
            }
          }));
        });
      }
      await pool(motionTasks, 2);
      tick('動作膠卷', t);
    }

    // ---- 4. 比對 ----
    t = Date.now();
    log('[4/5] 比對…');
    const results = {};
    const notes = [...base.notes];
    let plan = null;
    if (gates.includes('size')) {
      const baseActs = collectMotion(B.motionDir, man.base), headActs = collectMotion(H.motionDir, man.head);
      const motion = diffMotion(baseActs, headActs);
      plan = planSize({ sizeCap, motion, baseActs, headActs, dists, site: base.site, heroes });
    } else results.size = { skipped: '--gates 沒選', findings: [] };

    if (gates.includes('rest')) {
      const r = compareRest({ restCap, heroes });
      results.rest = { ...r, html: restOverview(restCap, r.findings, reportDir) };
    } else results.rest = { skipped: '--gates 沒選', findings: [] };

    if (gates.includes('motion')) {
      const r = compareMotion({ motionCap, heroes, scenes });
      for (const hero of heroes) {
        for (const sc of scenes) {
          const b = motionCap.base[hero]?.[sc.id], h = motionCap.head[hero]?.[sc.id];
          const f = films[hero]?.[sc.id];
          if (!f) continue;
          if (b?.samples && h?.samples) f.metrics = { base: filmMetrics(b), head: filmMetrics(h), tl: timelineMismatch(b, h) };
          f.flag = r.findings.some((x) => x.hero === hero && x.scene === sc.id);
        }
      }
      results.motion = { ...r, html: filmHtml(films, scenes, reportDir) };
    } else results.motion = { skipped: '--gates 沒選', findings: [] };

    const md = manifestDiff(man.base, man.head);
    if (gates.includes('event')) {
      const r = compareEvents({ eventCap, heroes });
      const covered = new Set();
      for (const ver of ['base', 'head']) for (const list of Object.values(eventCap[ver])) if (Array.isArray(list)) for (const e of list) { covered.add(e.mainKey); for (const c of e.choices) covered.add(c.key); }
      r.findings.push(...globalEventFindings(md, covered));
      // 有差異的事件：除錯總覽那一列新舊各截一張
      const shots = { base: {}, head: {} };
      const need = ['base', 'head'].flatMap((ver) => Object.entries(r.shootIdx[ver]).map(([hero, wants]) => ({ ver, hero, wants })));
      if (need.length) {
        log(`  截有差異的事件（${need.reduce((n, x) => n + x.wants.length, 0)} 塊）…`);
        await pool(need.map(({ ver, hero, wants }) => async () => {
          const C = await newContext(runTag, `e-${ver}-${hero}`);
          try { shots[ver][hero] = await shootEvents({ page: C.page, url: srv[ver].url, hero, wants, shotDir: shotDir[ver], tag: ver }); }
          catch (e) { log(`  ✗ 截事件失敗 ${ver} ${hero}：${e.message}`); }
          finally { await C.close(); }
        }), 4);
      }
      for (const f of r.findings) {
        if (!f.hero) continue;
        if (f.evBase !== null && f.evBase !== undefined) f.evBaseShot = shots.base[f.hero]?.[`${f.evBase}:${f.evSlot}`] ?? null;
        if (f.evHead !== null && f.evHead !== undefined) f.evHeadShot = shots.head[f.hero]?.[`${f.evHead}:${f.evSlot}`] ?? null;
      }
      results.event = r;
    } else results.event = { skipped: '--gates 沒選', findings: [] };

    // ---- 量頭與比像素（python＋opencv）：門檻一有變的圖、門檻四換掉的事件圖，一次跑完 ----
    const pyJobs = [...(plan?.jobs ?? []), ...(results.event?.findings ? planEventPix(results.event.findings, dists, base.site) : [])];
    let measured = {};
    if (pyJobs.length) {
      const py = pythonOk();
      if (!py) {
        notes.push('這台沒有可用的 python＋opencv（cv2）＋numpy＋Pillow：有變的圖沒辦法量頭、比像素，全部列成「要人看」或照原判定。');
      } else {
        const thumbs = join(reportDir, 'thumbs');
        mkdirSync(thumbs, { recursive: true });
        let n = 0;
        const th = () => join(thumbs, `f${String(n++).padStart(4, '0')}.jpg`);
        const jobs = pyJobs.map((j) => ({ ...j, ...(j.thumb ? { thumb: th() } : {}), ...(j.twin ? { twin: { ...j.twin, ...(j.twin.thumb ? { thumb: th() } : {}) } } : {}) }));
        const jf = join(workDir, 'py_jobs.json'), of = join(workDir, 'py_out.json');
        writeFileSync(jf, JSON.stringify({ templates: plan?.templates ?? {}, jobs }));
        const t1 = Date.now();
        log(`  量頭／比像素：${jobs.length} 個工作（有變的才做）…`);
        const r = spawnSync(py, [join(TOOL_DIR, 'head_measure.py'), jf, of], { encoding: 'utf8', windowsHide: true, timeout: 1200000 });
        if (r.status !== 0) notes.push('量頭的程式出錯：' + (r.stderr || r.error?.message || '').slice(-400));
        else measured = readJson(of, {});
        tick('量頭／比像素', t1);
      }
    }
    if (plan) results.size = { findings: finishSize(plan, measured), checked: plan.checked };
    if (results.event?.findings) finishEventPix(results.event.findings, measured);

    const allFindings = Object.values(results).flatMap((r) => r.findings ?? []);
    const allowRules = applyAllow(allFindings, allow);
    tick('比對', t);

    // ---- 5. 報告 ----
    log('[5/5] 寫報告…');
    const total = fmtSec(Date.now() - T0);
    const reportFile = join(reportDir, 'report.html');
    const status = writeReport({
      file: reportFile, root: reportDir, results, films, scenes, restCap, md, allowRules, logs, timings,
      meta: { baseSha: base.sha, baseLabel: base.label, headSha, headLabel: headRef ? `提交 ${args.head}` : '目前工作樹', dirty, branch: base.branch, site: base.site, mode: args.quick ? '快速版' : '完整版', heroes, when: new Date().toLocaleString('zh-TW', { hour12: false }), total, notes, allowFile },
    });
    const motionMetrics = Object.fromEntries(Object.entries(films).map(([hero, byScene]) => [hero, Object.fromEntries(Object.entries(byScene).map(([id, f]) => [id, f.metrics ?? null]))]));
    writeFileSync(join(reportDir, 'result.json'), JSON.stringify({ base: base.sha, head: headSha, dirty, status, timings, findings: allFindings.map(({ frames, metrics, ...f }) => f), motionMetrics }, null, 1));
    const NAME = { size: '角色大小', rest: '貓窩位置', motion: '動作流暢度', event: '事件圖片' };
    const LABEL = { pass: '通過', warn: '要人看', fail: '不通過', skip: '沒跑' };
    log('');
    for (const g of ALL_GATES) {
      const f = (results[g].findings ?? []).filter((x) => !x.allowed);
      log(`  ${NAME[g]}：${LABEL[status[g]]}${results[g].skipped ? '' : `（比了 ${results[g].checked ?? 0} 項；不通過 ${f.filter((x) => x.level === 'fail').length}、要人看 ${f.filter((x) => x.level === 'warn').length}）`}`);
      for (const x of f.filter((y) => y.level === 'fail').slice(0, 6)) log(`     ✗ ${x.title}：${x.what}`);
    }
    log(`\n報告：${reportFile}`);
    log(`總共 ${total}`);
    const anyFail = ALL_GATES.some((g) => status[g] === 'fail');
    return anyFail ? 1 : 0;
  } finally {
    await srv.base.close();
    await srv.head.close();
    killOwnChrome(runTag);
    if (!args.keep) rmSync(workDir, { recursive: true, force: true });
    pruneCache(cacheRoot, 3);
    try { pruneReports(outRoot, 15); } catch { /* 清不掉就算了 */ }
  }
}

function readHelp() {
  return `畫面比對閘門：推上線前比四道硬門檻（角色大小、貓窩位置、動作流暢度、事件圖片）

  npm run gate:visual                      目前工作樹 vs 線上那一版（連線版 coopdeploy/main；main 分支上跑就比單機版 origin/main）
  npm run gate:visual -- --base <參照>      指定 base，例：--base HEAD、--base 48ea5685
  --head <參照>                            新版改比某一筆提交（預設是目前工作樹，含未提交的改動）
  npm run gate:visual -- --quick           快速版（動作只錄近戰、丟東西、挨打、勝利）
  --heroes ninja,feifei,dangdang,fengfeng   只比這幾隻
  --gates size,rest,motion,event           只跑這幾道
  --allow <檔>                             允許清單（預設 tools/visual-gate/allow.json）
  --out <資料夾>                           報告根目錄（預設 倉庫上一層/qiuqiu-gate-reports）
  --site coop|single                       指定比哪個網站的線上版（預設看分支）
  --keep                                   留下這次的暫存（新版打包結果）

離開碼：0＝沒有不通過；1＝有非預期差異；2＝閘門自己出錯。`;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error('畫面比對閘門出錯：', e?.stack ?? e);
  process.exit(2);
});
