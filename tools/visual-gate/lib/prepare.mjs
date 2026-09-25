// 準備兩份要比的遊戲：base（某一筆提交）與目前工作樹，都在本機打包成 dist/。
//
// - base：用 `git archive` 把那一筆的原始碼（src、public 與打包要用的幾個檔）解到快取夾，借目前工作樹的
//   node_modules（junction）打包；打包結果照提交編號快取，同一筆第二次跑就不用再打包。
//   **不用 `git worktree add`**：那會在共用的 .git 登記一個工作目錄，閘門中途被砍掉就留下殘骸。
// - 目前工作樹：直接在工作樹打包，但輸出到快取夾（`--outDir`），不碰工作樹自己的 `dist/`。
//
// 兩邊用同一個 SITE_NAME（網址路徑）與同一個 BUILD_TAG，打出來的東西除了真的改到的地方以外一模一樣。
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { git, join, readJson, run, runAsync, resolve, toPosix } from './util.mjs';

export const BUILD_TAG = 'visualgate';

/** 兩個網站各自從哪裡部署（`tools/deploy.sh`）：連線版＝coopdeploy 的 main，單機版＝origin 的 main */
export const SITES = {
  coopdeploy: { remote: 'coopdeploy', site: 'qiuqiu-tower-coop', label: '連線版（coop → coopdeploy/main）' },
  origin: { remote: 'origin', site: 'qiuqiu-tower', label: '單機版（main → origin/main）' },
};

function hasCommit(repo, sha) {
  return run('git', ['-C', repo, 'cat-file', '-e', `${sha}^{commit}`], { allowFail: true, raw: true }).status === 0;
}

/**
 * 決定 base 是哪一筆。
 * 沒給 `--base`：看目前分支——`main` 比單機版（origin/main），其他分支（coop 與它長出去的）比連線版（coopdeploy/main）。
 * 先用 `git ls-remote` 問遠端現在的 main 是哪一筆（只讀，不動任何東西）；本機沒有那一筆才 `git fetch` 那一條。
 * 問不到遠端（離線）就退回本機記得的 `<遠端>/main`，並在報告裡註明。
 */
export function resolveBase(repo, baseArg, siteArg) {
  const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const remotes = git(repo, ['remote']).split(/\s+/);
  const deployKey = siteArg === 'origin' || siteArg === 'qiuqiu-tower' ? 'origin'
    : siteArg === 'coopdeploy' || siteArg === 'qiuqiu-tower-coop' ? 'coopdeploy'
      : branch === 'main' ? 'origin' : (remotes.includes('coopdeploy') ? 'coopdeploy' : 'origin');
  const site = SITES[deployKey];
  const notes = [];
  if (baseArg) {
    const sha = git(repo, ['rev-parse', '--verify', `${baseArg}^{commit}`]);
    return { sha, label: baseArg, site: site.site, siteLabel: site.label, branch, notes };
  }
  let sha = null;
  const lr = run('git', ['-C', repo, 'ls-remote', site.remote, 'refs/heads/main'], { allowFail: true, raw: true, timeout: 20000 });
  if (lr.status === 0 && lr.stdout.trim()) {
    sha = lr.stdout.trim().split(/\s+/)[0];
    if (!hasCommit(repo, sha)) {
      notes.push(`本機沒有線上那一筆 ${sha.slice(0, 8)}，先 git fetch ${site.remote} main（只更新遠端追蹤，不動任何工作目錄）`);
      run('git', ['-C', repo, 'fetch', '--no-tags', site.remote, 'main'], { allowFail: true, timeout: 120000 });
    }
    if (!hasCommit(repo, sha)) { notes.push(`抓不到 ${sha.slice(0, 8)}，退回本機的 ${site.remote}/main`); sha = null; }
  } else {
    notes.push(`問不到遠端 ${site.remote}（離線？），用本機記得的 ${site.remote}/main，可能不是最新的線上版`);
  }
  if (!sha) sha = git(repo, ['rev-parse', '--verify', `${site.remote}/main^{commit}`]);
  return { sha, label: `線上${site.label}`, site: site.site, siteLabel: site.label, branch, notes };
}

/* ---------- git archive 解包（自己解 tar，不靠系統的 tar：Git Bash 的 tar 會把 F: 當成遠端主機） ---------- */

function parseOctal(buf, off, len) {
  const s = buf.toString('latin1', off, off + len).replace(/\0.*$/, '').trim();
  return s ? parseInt(s, 8) : 0;
}
function cstr(buf, off, len) {
  const end = buf.indexOf(0, off);
  return buf.toString('utf8', off, end >= 0 && end < off + len ? end : off + len);
}

function extractTar(buf, dest) {
  let off = 0;
  let paxPath = null;
  let files = 0;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const size = parseOctal(h, 124, 12);
    const type = String.fromCharCode(h[156] || 48);
    const name = cstr(h, 0, 100);
    const prefix = cstr(h, 345, 155);
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      const txt = body.toString('utf8');
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(txt);
      if (m) paxPath = m[1];
      continue;
    }
    if (type === 'g') continue;
    const full = paxPath ?? (prefix ? `${prefix}/${name}` : name);
    paxPath = null;
    const out = join(dest, full);
    if (type === '5') { mkdirSync(out, { recursive: true }); continue; }
    if (type !== '0' && type !== '\0' && type !== '7') continue;   // 連結之類的不需要
    mkdirSync(resolve(out, '..'), { recursive: true });
    writeFileSync(out, body);
    files++;
  }
  return files;
}

function gitArchive(repo, sha, paths) {
  return new Promise((res, rej) => {
    const p = spawn('git', ['-C', repo, 'archive', '--format=tar', sha, '--', ...paths], { windowsHide: true });
    const chunks = [];
    let err = '';
    p.stdout.on('data', (d) => chunks.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res(Buffer.concat(chunks)) : rej(new Error('git archive 失敗：' + err.slice(0, 500)))));
  });
}

/** 打包那一筆需要的路徑：根目錄底下除了文件、工具、測試那些大資料夾以外全部，再加 tools/ 第一層的 .ts/.mjs（vite 設定會 import） */
function buildPaths(repo, sha) {
  const SKIP = new Set(['docs', 'tools', 'tests', 'worker', '_incoming', '影片腳本包', '.github']);
  const root = run('git', ['-C', repo, 'ls-tree', '-z', sha], {}).split('\0').filter(Boolean);
  const out = [];
  for (const line of root) {
    const [meta, path] = line.split('\t');
    const type = meta.split(' ')[1];
    if (SKIP.has(path)) continue;
    if (type === 'blob' && /\.(md|bat|cmd)$/i.test(path)) continue;
    out.push(path);
  }
  const tools = run('git', ['-C', repo, 'ls-tree', '-z', sha, 'tools/'], {}).split('\0').filter(Boolean);
  for (const line of tools) {
    const [meta, path] = line.split('\t');
    if (meta.split(' ')[1] === 'blob' && /\.(ts|mts|mjs|js)$/.test(path) && !/\.test\./.test(path)) out.push(path);
  }
  return out;
}

function linkNodeModules(dir, from) {
  const link = join(dir, 'node_modules');
  if (existsSync(link)) return link;
  symlinkSync(resolve(from, 'node_modules'), link, 'junction');
  return link;
}

/** 拆 junction：只拆連結本身，絕不順著連結刪到被連的那份 node_modules */
export function unlinkJunction(link) {
  try {
    const st = lstatSync(link);
    if (st.isSymbolicLink()) { unlinkSync(link); return true; }
    // 不是連結（不該發生）：不動它
    return false;
  } catch { return false; }
}

async function viteBuild(cwd, repoTop, outDir, siteName, logFile) {
  const vite = join(repoTop, 'node_modules', 'vite', 'bin', 'vite.js');
  const env = { ...process.env, SITE_NAME: siteName, BUILD_TAG };
  delete env.GITHUB_SHA;
  const r = await runAsync(process.execPath, [vite, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], { cwd, env });
  writeFileSync(logFile, r.out);
  if (r.code !== 0) throw new Error(`打包失敗（${cwd}），看 ${logFile}：\n${r.out.slice(-1500)}`);
}

const MOTION_JSON = /^[a-z0-9-]+-motion-data\.json$/;

function copyMotionJson(srcUi, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const f of readdirSync(srcUi)) if (MOTION_JSON.test(f)) cpSync(join(srcUi, f), join(destDir, f));
}

/** base 那一筆：有快取就直接用，沒有就解包＋打包。回傳 { dist, motionDir, cached } */
export async function prepareBase(repo, repoTop, sha, siteName, cacheRoot, log) {
  const dir = join(cacheRoot, `base-${sha.slice(0, 12)}-${siteName}`);
  const dist = join(dir, 'dist');
  const motionDir = join(dir, 'motion-data');
  const done = join(dir, 'ok.json');
  if (existsSync(done) && existsSync(join(dist, 'index.html'))) return { dist, motionDir, cached: true };
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const src = join(dir, 'src-tree');
  log(`  解開 ${sha.slice(0, 8)} 的原始碼（git archive，第一次約 20 秒）…`);
  const paths = buildPaths(repo, sha);
  const tar = await gitArchive(repo, sha, paths);
  const n = extractTar(tar, src);
  log(`  解開 ${n} 個檔，打包中…`);
  const link = linkNodeModules(src, repoTop);
  try {
    await viteBuild(src, repoTop, dist, siteName, join(dir, 'build.log'));
  } finally {
    unlinkJunction(link);
  }
  copyMotionJson(join(src, 'src', 'ui'), motionDir);
  // 原始碼用不到了（動作資料已經另外抄出來），只留打包結果，省空間
  if (!existsSync(link)) rmSync(src, { recursive: true, force: true });
  writeFileSync(done, JSON.stringify({ sha, siteName, at: new Date().toISOString() }));
  return { dist, motionDir, cached: false };
}

/** 目前工作樹：打包到快取夾（不碰工作樹的 dist/） */
export async function prepareHead(repoTop, siteName, workDir, log) {
  const dist = join(workDir, 'head-dist');
  const motionDir = join(repoTop, 'src', 'ui');
  log('  打包目前工作樹…');
  await viteBuild(repoTop, repoTop, dist, siteName, join(workDir, 'head-build.log'));
  return { dist, motionDir, cached: false };
}

/** 快取只留最近用過的幾份 base（一份約 150 MB） */
export function pruneCache(cacheRoot, keep = 3) {
  if (!existsSync(cacheRoot)) return;
  const dirs = readdirSync(cacheRoot).filter((d) => d.startsWith('base-')).map((d) => ({ d, t: statSync(join(cacheRoot, d)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { d } of dirs.slice(keep)) {
    const link = join(cacheRoot, d, 'src-tree', 'node_modules');
    unlinkJunction(link);
    if (!existsSync(link)) rmSync(join(cacheRoot, d), { recursive: true, force: true });
  }
}

/** 兩份 dist 的素材清單（key → 帶雜湊的路徑） */
export function loadManifest(dist) {
  return readJson(join(dist, 'assets', 'manifest.json'));
}

export { toPosix };
