// 報告：一頁 HTML，新舊並排、差異標紅、四道門檻通過／不通過一覽。圖都存在報告夾裡，用相對路徑引用。
import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { HERO_NAME, toPosix } from './util.mjs';
import { POSE_NAME, gateStatus } from './compare.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATUS = { pass: ['通過', 'ok'], warn: ['要人看', 'warn'], fail: ['不通過', 'bad'], skip: ['沒跑', 'skip'] };
const LEVEL = { fail: ['不通過', 'bad'], warn: ['要人看', 'warn'], info: ['參考', 'info'] };

export const GATES = [
  { id: 'size', name: '門檻一　角色大小', rule: '比頭不比外框。新動作、靜態立繪、頭像、地圖頭像、選角、過關亮相，頭跟同一隻待機差超過 5% 就是問題。' },
  { id: 'rest', name: '門檻二　貓窩位置', rule: '四隻 × 五種姿勢 × 三關（每關三張底圖），新舊比外框位置與大小；坐不進籃子、滿出來、浮起來或沉下去都是問題。' },
  { id: 'motion', name: '門檻三　動作流暢度', rule: '逐格膠卷（每 50 毫秒一格）看近戰、丟東西、接招、挨打、勝利、過關走路；閃白、空白、露舊畫風、瞬間跳位、忽大忽小都是問題。' },
  { id: 'event', name: '門檻四　事件圖片', rule: '四隻各掃共用事件主圖與結果圖，圖文對得上、是自己的版本；沒打算改的圖一張都不能變。' },
];

const METHOD = {
  size: `<b>機器判斷到哪</b>：逐格動作直接比資料（每一格在圖集裡的位置、scale、圖集內容），一模一樣就不可能變大變小；
    畫面上的地圖頭像、對白頭像、過關亮相、選角、戰鬥待機畫布、戰鬥靜態立繪（每張換上去）量「圖畫多大、貓的不透明外框在哪」。
    有變的才量頭：拿 base 版戰鬥待機第 1 格的頭當樣板做比對（09-23 驗收同一套），算出「跟舊版同一格差幾 %」「跟待機差幾 %」，超過 5% 判不通過。
    <b>還要人看</b>：量頭相關係數低於 0.85 的（背面、躺姿、特寫）只能看縮圖；對白頭像、地圖頭像本來就跟戰鬥待機不同大小，只跟舊版比。`,
  rest: `<b>機器判斷到哪</b>：每一組量貓在舞台上的外框（不透明像素），新舊差超過 1 像素就判不通過，並寫出往哪邊跑、跑幾像素。
    打盹、磨爪、扶同伴是把立繪換成那一張量（跟遊戲同一套退路挑圖；09-23 對照過真的按打盹，差 0 像素）。
    <b>還要人看</b>：外框沒動、但圖換了的，機器不知道貓有沒有坐進籃子，列成「要人看」。`,
  motion: `<b>機器判斷到哪</b>：同一顆種子、同一副牌、同一串動作，兩版各錄一次。每一格量角色的外框，畫面格算亮度：
    整格閃白、整格空白、角色不見、逐格模式露出靜態立繪、相鄰兩格跳太遠、高度忽變——新版比舊版多就標出來；另外逐格比「同一時間的位置與大小」，對不上的比例太高也標。
    <b>還要人看</b>：新動作「好不好看、順不順」機器判斷不了，膠卷在下面。<b>連線同伴出牌沒有自動化</b>（要兩台真的連線），推前仍要人工開兩個分頁看。`,
  event: `<b>機器判斷到哪</b>：遊戲的除錯總覽「事件」分頁跟事件畫面挑圖走同一支程式，四隻各讀一次，得到每個事件的主圖與每個選項結果圖實際用哪一張（打包後檔名帶內容雜湊碼）；
    跟舊版比，任何一張換了、缺了、變成別隻的版本、事件不見了都判不通過；文字改了但圖沒換，列「要人看」。紙箱、問號格這類不在事件清單裡的事件圖，從素材清單比。
    <b>還要人看</b>：「圖文對不對得上」是語意，機器判斷不了——有變的事件把除錯總覽那一列（圖＋文字＋選項＋結果圖）新舊並排截給你看。`,
};

function img(p, root, cls = '') {
  if (!p) return '<div class="noimg">（沒有圖）</div>';
  return `<img loading="lazy" class="${cls}" src="${esc(toPosix(relative(root, p)))}">`;
}

/** 在截圖上畫新舊兩個外框（舞台座標 → 截圖裡的百分比）：綠色虛線＝舊版、紅色實線＝新版 */
function boxes(side, f) {
  const clip = side?.clip;
  if (!clip || !f.base?.cat || !f.head?.cat) return '';
  const one = (c, cls) => `<div class="bx ${cls}" style="left:${((c.x - clip.x) / clip.width) * 100}%;top:${((c.y - clip.y) / clip.height) * 100}%;width:${(c.w / clip.width) * 100}%;height:${(c.h / clip.height) * 100}%"></div>`;
  return one(f.base.cat, 'bxb') + one(f.head.cat, 'bxh');
}

function pair(f, root) {
  if (!f.base?.shot && !f.head?.shot && f.evBaseShot === undefined && f.evHeadShot === undefined) return '';
  const b = f.base?.shot ?? f.evBaseShot, h = f.head?.shot ?? f.evHeadShot;
  const legend = f.base?.cat && f.head?.cat && (f.base?.clip || f.head?.clip) ? '<p class="small">框線：<span class="lg lgb"></span>舊版外框　<span class="lg lgh"></span>新版外框</p>' : '';
  // 事件那一塊是除錯總覽的一整列（圖＋文字，很寬）：上下疊著放，字才看得清楚
  if (f.gate === 'event') {
    return `<div class="stack"><figure><figcaption>舊版（base）</figcaption>${img(b, root)}</figure><figure><figcaption>新版</figcaption>${img(h, root)}</figure></div>`;
  }
  return `${legend}<div class="pair"><figure><figcaption>舊版（base）</figcaption><div class="ovl">${img(b, root)}${boxes(f.base, f)}</div></figure>
    <figure><figcaption>新版</figcaption><div class="ovl">${img(h, root)}${boxes(f.head, f)}</div></figure></div>`;
}

const HERO_ORDER = ['ninja', 'feifei', 'dangdang', 'fengfeng'];
const byHero = (obj) => Object.entries(obj ?? {}).filter(([k]) => HERO_ORDER.includes(k)).sort((a, b) => HERO_ORDER.indexOf(a[0]) - HERO_ORDER.indexOf(b[0]));

/** 膠卷只秀動作那一塊（舞台座標）：戰鬥拿掉上方狀態列與下方手牌，過關走路取中間 */
const CROP = { actwalk: [240, 110, 900, 640], default: [0, 60, 1280, 560] };
function filmCell(x, root, scene) {
  const [x0, y0, x1, y1] = CROP[scene] ?? CROP.default;
  const W = 250;
  const s = W / (x1 - x0);   // 顯示像素／舞台像素（膠卷原圖是舞台的一半大小，所以圖寬＝1280×s）
  const src = esc(toPosix(relative(root, x.file)));
  return `<figure class="fcell"><a href="${src}" target="_blank"><div class="fclip" style="width:${W}px;height:${Math.round((y1 - y0) * s)}px">
    <img loading="lazy" src="${src}" style="width:${Math.round(1280 * s)}px;margin-left:${-Math.round(x0 * s)}px;margin-top:${-Math.round(y0 * s)}px"></div></a><figcaption>${x.t}</figcaption></figure>`;
}

function framesTable(f, root) {
  if (!f.frames?.length) return '';
  // 縮圖一律照同一個比例（遊戲裡的 CSS 像素 × 0.6）顯示，大小差才看得出來
  const th = (p, m) => (p ? `<img loading="lazy" class="th" src="${esc(toPosix(relative(root, p)))}"${m?.thumbW ? ` style="width:${Math.round(m.thumbW * 0.6)}px"` : ''}>` : '<div class="noimg">—</div>');
  const cell = (r) => {
    if (r.similar) return `<td>第 ${r.i + 1} 格｜像素跟舊版幾乎一樣（最大區塊差 ${r.pix?.maxBlock ?? '—'}）</td>`;
    const v = (x) => (x === null || x === undefined ? '—' : `${x >= 1 ? '+' : ''}${((x - 1) * 100).toFixed(1)}%`);
    return `<td class="${r.bad ? 'redcell' : r.unsure ? 'amber' : ''}"><div class="fr">${th(r.thumbBase, r.base)}${th(r.thumbHead, r.head)}</div>
      第 ${r.i + 1} 格｜跟舊版 ${v(r.vsBase)}｜跟待機 ${v(r.vsIdle)}${r.unsure ? '｜量不準' : ''}</td>`;
  };
  const rows = [];
  for (let i = 0; i < f.frames.length; i += 4) rows.push(`<tr>${f.frames.slice(i, i + 4).map(cell).join('')}</tr>`);
  return `<p class="small">每格左＝舊版、右＝新版，照遊戲裡的大小（CSS 像素）。</p><table class="frames">${rows.join('')}</table>`;
}

function findingRow(f, root) {
  const [lv, cls] = f.allowed ? ['已放行', 'allowed'] : LEVEL[f.level] ?? ['?', ''];
  return `<div class="finding ${cls}">
    <div class="fhead"><span class="badge ${cls}">${lv}</span><b>${esc(f.title)}</b><code>${esc(f.id)}</code></div>
    <div class="what ${f.level === 'fail' && !f.allowed ? 'red' : ''}">${esc(f.what)}</div>
    ${f.allowed ? `<div class="allowwhy">允許清單：${esc(f.allowWhy)}</div>` : ''}
    ${pair(f, root)}${framesTable(f, root)}</div>`;
}

function gateBlock(g, findings, extra, root, checked) {
  const st = extra.skipped ? 'skip' : gateStatus(findings);
  const [label, cls] = STATUS[st];
  const order = { fail: 0, warn: 1, info: 2 };
  const sorted = [...findings].sort((a, b) => (a.allowed - b.allowed) || (order[a.level] - order[b.level]));
  return `<section id="g-${g.id}"><h2>${g.name}<span class="badge big ${cls}">${label}</span></h2>
    <p class="rule">規矩：${esc(g.rule)}</p><p class="method">${METHOD[g.id]}</p>
    <p class="count">比了 ${checked ?? 0} 項；不通過 ${findings.filter((f) => f.level === 'fail' && !f.allowed).length}、要人看 ${findings.filter((f) => f.level === 'warn' && !f.allowed).length}、已放行 ${findings.filter((f) => f.allowed).length}。</p>
    ${extra.skipped ? `<p>這次沒跑（${esc(extra.skipped)}）。</p>` : sorted.length ? sorted.map((f) => findingRow(f, root)).join('') : '<p class="okline">沒有任何差異。</p>'}
    ${extra.html ?? ''}</section>`;
}

/** 門檻三：每隻 × 每段的膠卷（新舊上下對照）與指標 */
export function filmHtml(films, scenes, root) {
  const out = [];
  for (const [hero, byScene] of byHero(films)) {
    for (const sc of scenes) {
      const f = byScene[sc.id];
      if (!f) continue;
      const row = (list) => list.map((x) => filmCell(x, root, sc.id)).join('');
      const m = f.metrics;
      const mt = m ? `<table class="mt"><tr><th></th><th>角色不見</th><th>露出靜態</th><th>最大跳位</th><th>最大忽變</th><th>閃白</th><th>空白</th><th>亮度閃</th></tr>
        ${['base', 'head'].map((v) => `<tr><td>${v === 'base' ? '舊版' : '新版'}</td><td>${m[v].missingMs} 毫秒</td><td>${m[v].staticN} 格</td><td>${m[v].maxJump} 像素</td><td>${(m[v].maxSize * 100).toFixed(1)}%</td><td>${m[v].flash.length}</td><td>${m[v].blank.length}</td><td>${m[v].spike.length}</td></tr>`).join('')}
        <tr><td colspan="8">同一時間位置／大小對不上：${(m.tl.ratio * 100).toFixed(1)}%（${m.tl.bad}/${m.tl.n} 格）</td></tr></table>` : '';
      out.push(`<details${f.flag ? ' open' : ''}><summary>${f.flag ? '⚠ ' : ''}${esc(HERO_NAME[hero])}　${esc(sc.name)}</summary>${mt}
        <div class="strip"><div class="lbl">舊版</div>${row(f.base ?? [])}</div><div class="strip"><div class="lbl">新版</div>${row(f.head ?? [])}</div></details>`);
    }
  }
  return `<h3>膠卷（每 50 毫秒一格，數字是動作後幾毫秒；有標出問題的那段預設展開）</h3>${out.join('')}`;
}

/** 門檻二：每隻全部組合的新版截圖（小圖），外框有動的標紅 */
export function restOverview(restCap, findings, root) {
  const bad = new Set(findings.filter((f) => f.level === 'fail').map((f) => f.id));
  const out = [];
  for (const [hero, list] of byHero(restCap.head)) {
    if (!Array.isArray(list)) continue;
    const cells = list.map((r) => {
      const id = `rest:${hero}:a${r.act}:f${r.floor}:${r.pose}`;
      return `<figure class="rcell ${bad.has(id) ? 'redbox' : ''}">${img(r.shot, root, 'rest')}<figcaption>第${r.act}關 ${esc(r.restbg ?? '')} ${esc(POSE_NAME[r.pose] ?? r.pose)}</figcaption></figure>`;
    }).join('');
    out.push(`<details><summary>${esc(HERO_NAME[hero])}：全部 ${list.length} 組（新版）</summary><div class="grid">${cells}</div></details>`);
  }
  return `<h3>全部截圖（給人眼看有沒有坐進籃子）</h3>${out.join('')}`;
}

export function writeReport({ file, root, meta, results, films, scenes, restCap, md, allowRules, logs, timings }) {
  const status = Object.fromEntries(GATES.map((g) => [g.id, results[g.id]?.skipped ? 'skip' : gateStatus(results[g.id]?.findings ?? [])]));
  const summary = GATES.map((g) => {
    const r = results[g.id] ?? { findings: [] };
    const [label, cls] = STATUS[status[g.id]];
    const f = r.findings ?? [];
    return `<tr><td><a href="#g-${g.id}">${g.name}</a></td><td><span class="badge ${cls}">${label}</span></td><td>${r.checked ?? 0}</td>
      <td class="${f.some((x) => x.level === 'fail' && !x.allowed) ? 'red' : ''}">${f.filter((x) => x.level === 'fail' && !x.allowed).length}</td>
      <td>${f.filter((x) => x.level === 'warn' && !x.allowed).length}</td><td>${f.filter((x) => x.allowed).length}</td></tr>`;
  }).join('');
  const other = md ? `<section><h2>其他圖檔變動（不在四道門檻內，列給人看）</h2>
    <p>素材清單共 ${md.total} 筆；內容變了 ${md.changed.length}、新增 ${md.added.length}、拿掉 ${md.removed.length}（事件圖與角色立繪已在上面各門檻處理）。</p>
    ${['changed', 'added', 'removed'].map((k) => {
      const list = md[k].filter((x) => !/^bg\|bg\/event_/.test(x) && !/^sprites\|hero\//.test(x));
      return list.length ? `<details><summary>${{ changed: '內容變了', added: '新增', removed: '拿掉' }[k]}（${list.length}）</summary><pre>${esc(list.join('\n'))}</pre></details>` : '';
    }).join('')}</section>` : '';
  const allowHtml = `<section><h2>允許清單</h2><p>檔案：<code>${esc(meta.allowFile)}</code>。放行的發現在上面標綠色「已放行」。</p>
    ${allowRules.length ? `<table class="mt"><tr><th>比對</th><th>為什麼</th><th>放行幾筆</th></tr>${allowRules.map((r) => `<tr><td><code>${esc(r.match)}</code></td><td>${esc(r.why)}</td><td class="${r.used ? '' : 'amber'}">${r.used}${r.used ? '' : '（沒用到，可以刪）'}</td></tr>`).join('')}</table>` : '<p>空的。</p>'}</section>`;
  const logHtml = `<section><h2>瀏覽器主控台錯誤</h2>${['base', 'head'].map((v) => `<h3>${v === 'base' ? '舊版' : '新版'}（${(logs[v] ?? []).length}）</h3><pre>${esc((logs[v] ?? []).slice(0, 60).map((l) => `[${l.tag}] ${l.kind} ${l.text}`).join('\n') || '（沒有）')}</pre>`).join('')}</section>`;
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>畫面比對閘門報告</title><style>
:root{--bg:#fbfaf7;--fg:#222;--muted:#666;--line:#ddd;--bad:#c62828;--badbg:#fdecea;--warn:#a15c00;--warnbg:#fff4e0;--ok:#2e7d32;--okbg:#e8f5e9;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#17181b;--fg:#e8e8e8;--muted:#aaa;--line:#333;--bad:#ff6b6b;--badbg:#3a1d1d;--warn:#ffb74d;--warnbg:#3a2c14;--ok:#81c784;--okbg:#1c3320;--card:#202226}}
body{background:var(--bg);color:var(--fg);font:15px/1.6 "Microsoft JhengHei","Noto Sans TC",sans-serif;margin:0;padding:16px 20px 60px;max-width:1500px}
h1{font-size:22px}h2{font-size:19px;border-bottom:2px solid var(--line);padding-bottom:4px;margin-top:36px}h3{font-size:16px}
table{border-collapse:collapse}td,th{border:1px solid var(--line);padding:4px 8px;vertical-align:top}
.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:13px;margin:0 6px;font-weight:bold}.badge.big{font-size:15px}
.ok{background:var(--okbg);color:var(--ok)}.bad{background:var(--badbg);color:var(--bad)}.warn{background:var(--warnbg);color:var(--warn)}.skip,.info{background:#8882;color:var(--muted)}
.allowed{background:var(--okbg);color:var(--ok)}.red{color:var(--bad);font-weight:bold}.amber{color:var(--warn)}
.finding{border:1px solid var(--line);border-left:5px solid var(--line);background:var(--card);padding:8px 12px;margin:10px 0;border-radius:4px}
.finding.bad{border-left-color:var(--bad)}.finding.warn{border-left-color:var(--warn)}.finding.allowed{border-left-color:var(--ok);opacity:.85}
.fhead code{color:var(--muted);font-size:12px;margin-left:8px}.what{margin:4px 0}.allowwhy{color:var(--ok)}
.pair{display:flex;gap:10px;flex-wrap:wrap}.pair figure{margin:0;flex:1;min-width:260px;max-width:720px}.pair img{max-width:100%;border:1px solid var(--line)}
figcaption{font-size:12px;color:var(--muted)}.noimg{color:var(--muted);font-size:13px;padding:20px}
.stack figure{margin:6px 0}.stack img{max-width:100%;border:1px solid var(--line)}
.frames td{text-align:center;font-size:12px}.redcell{background:var(--badbg)}.fr{display:flex;gap:4px;align-items:flex-end;justify-content:center}.th{display:block;max-width:none}
.strip{display:flex;gap:2px;overflow-x:auto;align-items:flex-start;margin:4px 0}.strip .lbl{writing-mode:vertical-rl;font-size:12px;color:var(--muted)}
.fcell{margin:0;flex:0 0 auto}.fclip{overflow:hidden}.fclip img{display:block;max-width:none}.fcell figcaption{text-align:center}
.ovl{position:relative;display:inline-block;max-width:100%}.ovl img{display:block}.bx{position:absolute;box-sizing:border-box;pointer-events:none}
.bxb{border:2px dashed #2e7d32}.bxh{border:2px solid #e53935}.lg{display:inline-block;width:18px;height:10px;vertical-align:middle;margin:0 4px}.lgb{border:2px dashed #2e7d32}.lgh{border:2px solid #e53935}
.grid{display:flex;flex-wrap:wrap;gap:4px}.rcell{margin:0;width:180px}.rest{width:180px;display:block;border:2px solid transparent}.redbox .rest{border-color:var(--bad)}
.rule{font-weight:bold}.method{color:var(--muted);font-size:14px}.okline{color:var(--ok);font-weight:bold}.small{font-size:12px;color:var(--muted)}
details{margin:6px 0}summary{cursor:pointer}pre{white-space:pre-wrap;font-size:12px;background:var(--card);border:1px solid var(--line);padding:8px}
.meta td:first-child{color:var(--muted);white-space:nowrap}
</style></head><body>
<h1>畫面比對閘門報告</h1>
<table class="meta">
<tr><td>舊版（base）</td><td><code>${esc(meta.baseSha.slice(0, 10))}</code>　${esc(meta.baseLabel)}</td></tr>
<tr><td>新版</td><td>${esc(meta.headLabel ?? '目前工作樹')} <code>${esc(meta.headSha.slice(0, 10))}</code>${meta.dirty ? '＋未提交的改動' : ''}（分支 ${esc(meta.branch)}）</td></tr>
<tr><td>網站路徑</td><td>${esc(meta.site)}（兩版都在本機打包、各開一個本機埠，沒有連任何線上網址）</td></tr>
<tr><td>模式</td><td>${esc(meta.mode)}；角色：${esc(meta.heroes.map((h) => HERO_NAME[h]).join('、'))}</td></tr>
<tr><td>時間</td><td>${esc(meta.when)}，共 ${esc(meta.total)}（${esc(Object.entries(timings).map(([k, v]) => `${k} ${v}`).join('、'))}）</td></tr>
${meta.notes.length ? `<tr><td>注意</td><td>${meta.notes.map(esc).join('<br>')}</td></tr>` : ''}
</table>
<h2>四道門檻一覽</h2>
<table><tr><th>門檻</th><th>結果</th><th>比了幾項</th><th>不通過</th><th>要人看</th><th>已放行</th></tr>${summary}</table>
<p class="small">「不通過」＝跟舊版比有非預期差異（離開碼非 0）；「要人看」＝有變但在規矩內、或機器判斷不了；確定是這批刻意改的，寫進允許清單放行。</p>
${GATES.map((g) => gateBlock(g, results[g.id]?.findings ?? [], results[g.id] ?? {}, root, results[g.id]?.checked)).join('')}
${other}${allowHtml}${logHtml}
</body></html>`;
  writeFileSync(file, html);
  return status;
}
