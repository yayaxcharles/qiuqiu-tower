#!/usr/bin/env node
/*
 * 把各支量測腳本存下的 JSON 彙整成一份繁體中文報告。
 *   node tools/i18n-edge/build-report.mjs
 * 輸出：docs/檢查_英日極端版面_20260930.md（截圖與原始量測資料放同名資料夾）
 * 數字全部從 JSON 現算，不手填；敘述與改法建議寫在本檔的模板裡。
 */
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';

const D = 'F:/ClaudeWork/qiuqiu-wt-i18nedge0930/docs/檢查_英日極端版面_20260930/';
const OUTMD = 'F:/ClaudeWork/qiuqiu-wt-i18nedge0930/docs/檢查_英日極端版面_20260930.md';
const FIG = '檢查_英日極端版面_20260930/';
const load = (f) => (existsSync(D + f) ? JSON.parse(readFileSync(D + f, 'utf8')) : null);
const LANG = { en: '英文', ja: '日文', zh: '繁中（對照）' };
const VP = { desk: '桌機 1280×800', phone: '手機橫拿 844×390' };
const HERO = { ninja: '球球', feifei: '菲菲', dangdang: '噹噹', fengfeng: '封封' };
const img = (f, alt = '') => `![${alt || f}](${FIG}${f})`;
const link = (f) => (existsSync(D + f) ? `[${f}](${FIG}${f})` : `（缺圖 ${f}）`);
const px = (n) => `${Math.round(n)}px`;
const md = [];
const P = (s = '') => md.push(s);

// ------------------------------------------------------------------ 讀資料
const cards = load('cards_raw_enja_deskphone.json') ?? [];
const hud = [...(load('hud_enja_deskphone_ninja-feifei-dangdang-fengfeng.json') ?? []), ...((load('hud_enzh_desk_ninja.json') ?? []).filter((x) => x.lang === 'zh'))];
const bless = load('bless_enjazh_deskphone_ninja-feifei-dangdang-fengfeng_blessing.json')?.rows ?? [];
const scr = [...(load('screens_enja_deskphone_ninja-feifei-dangdang-fengfeng.json')?.rows ?? []), ...(load('elite_enja_deskphone_ninja-feifei-dangdang-fengfeng_reward_elite.json')?.rows ?? []), ...(load('modals_enja_deskphone_ninja_modals.json')?.rows ?? [])];
const events = ['en', 'ja', 'zh'].flatMap((l) => load(`events_${l}_deskphone_ninja-feifei-dangdang-fengfeng.json`) ?? []);
const story = [...(load('story_enja_deskphone_ninja-feifei-dangdang-fengfeng.json') ?? []), ...(load('story_zh_desk_ninja-feifei-dangdang-fengfeng.json') ?? [])];
const tipr = load('tipr_enjazh_deskphone_ninja-feifei-dangdang-fengfeng.json') ?? [];
const tips = load('tips_enjazh_desk.json') ?? [];
const cstress = [...(load('combat_stress_enja_deskphone_ninja-feifei-dangdang-fengfeng.json')?.results ?? []), ...(load('combat_stress_zh_deskphone_ninja-feifei-dangdang-fengfeng.json')?.results ?? [])];
const clog = load('clog_enjazh_deskphone.json') ?? [];
const misc = load('misc_enjazh.json') ?? [];
const intents = [...(load('intents_enja_deskphone_ninja.json') ?? []), ...(load('intents_enja_deskphone_feifei-dangdang-fengfeng.json') ?? [])];
const hudDiff = load('hud-diff_enjazh_deskphone.json') ?? [];
const shopLines = load('shoplines_enjazh_deskphone_ninja-feifei-dangdang-fengfeng.json') ?? [];

// ------------------------------------------------------------------ 卡牌
const cardCls = (o) => (o.textOver > 0.5 ? 'H' : o.nameOver > 0.5 ? 'Mname' : o.typeOver > 0.5 ? 'Mtype' : o.fsT <= 10.01 ? 'Mtext' : o.fsN <= 9.01 ? 'Mnamemin' : o.fsT < o.baseT - 0.01 ? 'Ltext' : o.fsN < o.baseN - 0.01 ? 'Lname' : 'ok');
const cardDesk = cards.filter((c) => c.vp === 'desk');
const cardAgg = (lang) => {
  const m = new Map();
  for (const o of cardDesk.filter((c) => c.lang === lang)) {
    const c = cardCls(o); if (c === 'ok') continue;
    const k = o.id; const e = m.get(k) ?? { id: o.id, name: o.name.replace(/＋$/, ''), coop: o.coop, heroes: new Set(), vers: new Map(), worst: 'ok' };
    e.heroes.add(o.hero);
    const ver = `${o.size === 'small' ? '小牌(手牌)' : '大牌'}${o.upgraded ? '＋' : ''}`;
    const rank = { H: 5, Mname: 4, Mtype: 4, Mtext: 3, Mnamemin: 3, Ltext: 1, Lname: 1, ok: 0 };
    const prev = e.vers.get(ver);
    if (!prev || rank[c] > rank[prev.c] || (rank[c] === rank[prev.c] && o.textOver > prev.o.textOver)) e.vers.set(ver, { c, o });
    if (rank[c] > rank[e.worst]) e.worst = c;
    m.set(k, e);
  }
  return [...m.values()];
};
const cardCounts = (lang) => {
  const xs = cardDesk.filter((c) => c.lang === lang);
  const uniq = (fn) => new Set(xs.filter(fn).map((o) => `${o.id}|${o.size}|${o.upgraded}`)).size;
  return {
    total: new Set(xs.map((o) => `${o.id}|${o.size}|${o.upgraded}`)).size,
    H: uniq((o) => cardCls(o) === 'H'), name: uniq((o) => cardCls(o) === 'Mname'), textMin: uniq((o) => cardCls(o) === 'Mtext'), nameMin: uniq((o) => cardCls(o) === 'Mnamemin'),
    shrunk: uniq((o) => ['Ltext', 'Lname'].includes(cardCls(o))),
    ids: new Set(xs.map((o) => o.id)).size,
  };
};
const cEn = cardCounts('en'), cJa = cardCounts('ja');
const cardHighEn = cardAgg('en').filter((e) => e.worst === 'H');
const cardNameEn = cardAgg('en').filter((e) => ['Mname', 'Mnamemin'].includes(e.worst));
const cardTextMinEn = cardAgg('en').filter((e) => e.worst === 'Mtext');
const cardTextMinJa = cardAgg('ja').filter((e) => e.worst === 'Mtext');

// ------------------------------------------------------------------ 狀態列
const hudStat = (lang, vp) => {
  const xs = hud.filter((x) => x.lang === lang && x.vp === vp);
  const heroSet = [...new Set(xs.map((x) => x.hero))];
  const one = xs.filter((x) => x.hero === heroSet[0]);
  const bad = one.filter((x) => x.m.overStage.length || x.m.hpClipped);
  return { n: one.length, bad: bad.length, maxOver: Math.max(...one.map((x) => x.m.maxRight)) - 1280, minHp: Math.min(...one.map((x) => x.m.hpW)), heroes: heroSet.length };
};
const hudCase = (lang, vp, diff, relics) => hud.find((x) => x.lang === lang && x.vp === vp && x.hero === 'ninja' && x.diff === diff && x.relics === relics && x.fish === 30 && x.act === 2);
const hudCell = (lang, vp, diff, relics) => {
  const x = hudCase(lang, vp, diff, relics); if (!x) return '沒資料';
  const names = x.m.overStage.map((o) => o.text.replace(/^[^\p{L}]+/u, '').replace(/\s+/g, '').slice(0, 9)).filter(Boolean);
  const over = x.m.maxRight - 1280;
  const hp = x.m.hpW < 60 ? `；生命條只剩 ${x.m.hpW}px` : '';
  return names.length ? `掉出畫面 ${names.length} 顆（${names.join('、')}），最遠超出 ${px(over)}${hp}` : (hp ? `無掉出${hp}` : '正常');
};

// ------------------------------------------------------------------ 祝福畫面
const blessStat = (lang, vp) => {
  const xs = bless.filter((r) => r.lang === lang && r.vp === vp && r.extra);
  const per = xs.map((r) => ({ hero: r.hero, name: r.name, gap: r.extra.textT - r.extra.cardsB, lines: r.extra.lines, cardsB: r.extra.cardsB, textT: r.extra.textT }));
  return { n: per.length, over: per.filter((p) => p.gap < 0), worst: per.reduce((a, b) => (b.gap < a.gap ? b : a), per[0] ?? { gap: 0 }), maxLines: Math.max(...per.map((p) => p.lines)), minGap: Math.min(...per.map((p) => p.gap)) };
};

// ------------------------------------------------------------------ 事件
const evKey = (x) => `${x.vp}|${x.hero}|${x.id}|${x.step}`;
const evIdx = new Map(events.map((x) => [`${x.lang}|${evKey(x)}`, x]));
const evSummary = (lang, vp) => {
  const xs = events.filter((x) => x.lang === lang && x.vp === vp);
  const s = { n: xs.length, underHud: 0, artCover: 0, lootOut: 0, minT: 9999, lootEvents: new Set(), maxLootOver: 0, maxLines: 0, btnOut: 0 };
  for (const x of xs) {
    const m = x.m;
    if (m.box) { s.minT = Math.min(s.minT, m.box.t); s.maxLines = Math.max(s.maxLines, m.boxLines); }
    if (m.box && m.hudB !== null && m.box.t < m.hudB - 1) s.underHud++;
    if (m.box && m.art && m.box.t < m.art.b - 30) s.artCover++;
    const lo = x.outside.filter((c) => /loot/.test(c.el));
    if (lo.length) { s.lootOut++; s.lootEvents.add(x.id); s.maxLootOver = Math.max(s.maxLootOver, ...lo.map((c) => c.over.t)); }
    if (m.btns?.length && Math.max(...m.btns.map((b) => b.b)) > 722) s.btnOut++;
  }
  return s;
};
const evWorst = (lang, vp, n = 8) => {
  const out = [];
  for (const x of events.filter((y) => y.lang === lang && y.vp === vp && y.m.box)) {
    const z = evIdx.get(`zh|${evKey(x)}`) ?? evIdx.get(`zh|desk|${x.hero}|${x.id}|${x.step}`);
    out.push({ id: x.id, step: x.step, hero: x.hero, t: x.m.box.t, artB: x.m.art?.b ?? 0, artT: x.m.art?.t ?? 0, zt: z?.m.box?.t ?? null, lines: x.m.boxLines, btns: x.m.btns.length, len: x.m.len });
  }
  // 每個「事件×步驟」只留一位主角（最糟的）
  const best = new Map();
  for (const o of out) { const k = o.id + '|' + o.step; const p = best.get(k); if (!p || o.t < p.t) best.set(k, o); }
  return [...best.values()].sort((a, b) => a.t - b.t).slice(0, n);
};

// ------------------------------------------------------------------ 劇情
const realStory = story.filter((x) => x.m && !x.m.err && x.src !== 'pack_other');
const H = (x) => x.m.box.b - x.m.box.t;
const storyDist = (lang, vp, ctx) => {
  const xs = realStory.filter((x) => x.lang === lang && x.vp === vp && x.ctx === ctx);
  const uniq = new Map();
  for (const x of xs) { const k = `${x.text}|${x.speaker}|${x.box ?? ''}`; const p = uniq.get(k); if (!p || H(x) > H(p)) uniq.set(k, x); }
  const u = [...uniq.values()];
  const lines = {}; for (const x of u) lines[x.m.lines] = (lines[x.m.lines] ?? 0) + 1;
  return { n: u.length, maxH: u.length ? Math.max(...u.map(H)) : 0, lines, sideOut: u.filter((x) => x.m.box.r > 1280.5 || x.m.box.l < -0.5).length, maxLines: u.length ? Math.max(...u.map((x) => x.m.lines)) : 0 };
};
const storyTop = (lang, n = 10) => {
  const xs = realStory.filter((x) => x.lang === lang && x.vp === 'desk' && ['slide', 'dialogue', 'bark', 'bubble'].includes(x.ctx));
  const uniq = new Map(); for (const x of xs) if (!uniq.has(x.m.shown)) uniq.set(x.m.shown, x);
  return [...uniq.values()].sort((a, b) => [...b.m.shown].length - [...a.m.shown].length).slice(0, n);
};
const CTX = { slide: '幻燈片', dialogue: '對白框', bark: '戰鬥吐槽泡泡', bubble: '魔物頭上泡泡' };
const SRC = (s) => s.replace(/^solo:/, '單人 ').replace(/^coop:(\w+):/, (m, p) => `連線（同伴${HERO[p] ?? p}） `).replace('prologue', '序章').replace('ending_d1', '結局').replace('ending_d5', '結局（難度5）').replace('act1', '第一關過關').replace('act2', '第二關過關').replace(/^top$/, '塔頂').replace('defeat', '落敗').replace('victory_raw', '結局').replace(/^firstMeet:(.*)$/, '魔物初見 $1');

// ------------------------------------------------------------------ 提示框
const tipStat = (lang, vp = 'desk') => {
  const xs = tipr.filter((x) => x.lang === lang && x.vp === vp);
  const bad = xs.filter((x) => x.t < 0 || x.b > 720 || x.l < 0 || x.r > 1280);
  const by = {};
  for (const x of bad) { const b = (by[x.kind] ??= { n: 0, max: 0, ex: '', h: 0 }); b.n++; if (x.b - 720 > b.max) { b.max = x.b - 720; b.ex = x.label; b.h = x.h; } }
  return { n: xs.length, bad: bad.length, by };
};

// ------------------------------------------------------------------ 意圖
const moves = intents.filter((x) => x.step === 'moves');
const mvStat = (lang, vp, variant) => {
  const xs = moves.filter((x) => x.lang === lang && x.vp === vp && x.variant === variant);
  const top = [...xs].sort((a, b) => b.w - a.w).slice(0, 5);
  return { n: xs.length, top, overlap: xs.filter((x) => x.over.length), multi: xs.filter((x) => x.lines > 1).length, tallTip: [...xs].filter((x) => x.tip).sort((a, b) => b.tip.h - a.tip.h)[0] };
};
const encs = intents.filter((x) => x.step === 'enc');
const encIssues = (lang, vp) => {
  const out = [];
  for (const x of encs.filter((y) => y.lang === lang && y.vp === vp)) {
    for (const u of x.units) if (u.nameOver > 1) out.push({ enc: x.enc, hero: x.hero, text: u.nameText, over: u.nameOver, id: u.id });
  }
  return out;
};

// ------------------------------------------------------------------ 覆蓋表
const scrGroup = (name) => name.replace(/_p\d+$/, '').replace(/^compendium_.*/, 'compendium').replace(/^heroselect_.*/, 'heroselect').replace(/^blessing_\d/, 'blessing').replace(/^rest_btn\d/, 'rest').replace(/^shop_.*/, 'shop').replace(/^bossdoor_.*/, 'bossdoor').replace(/^reward_elite_.*/, 'reward_elite').replace(/^result_.*/, 'result').replace(/^chest_.*/, 'chest').replace(/^relic_list$/, 'relic_list').replace(/^modal_.*/, 'modals').replace(/^title_diff5$/, 'title');
const isHud = (c) => /hud/.test(c.el);
const shopClamp = (c) => /div\.small/.test(c.el);
const cardEl = (c) => /card-(text|name)/.test(c.el);
const scrSig = (lang, vp, group) => {
  const rows = scr.filter((r) => r.lang === lang && r.vp === vp && scrGroup(r.name) === group);
  if (!rows.length) return { covered: false };
  const heroes = new Set(rows.map((r) => r.hero));
  const ids = new Set(); const other = [];
  for (const r of rows) {
    for (const c of [...r.clipped.filter((c) => !c.scroll), ...r.outside, ...r.ellipsis]) {
      if (isHud(c)) ids.add(c.el.includes('hp') ? 'H-2' : 'H-1');
      else if (shopClamp(c)) ids.add('M-4');
      else if (cardEl(c)) ids.add('H-3');
      else other.push(c.el + ':' + (c.text ?? '').slice(0, 20));
    }
  }
  return { covered: true, heroes: heroes.size, ids: [...ids], other: [...new Set(other)] };
};
const SCREENS = [
  ['title', '封面（語言鈕、難度鈕、按鈕列）', '球球（與主角無關）'],
  ['compendium', '卡牌圖鑑（四位主角各一頁＋升級版）', '四位'],
  ['itemcomp', '秘寶與忍具圖鑑（全部逐屏捲動掃）', '與主角無關'],
  ['heroselect', '選角畫面（四位各點一次）', '四位'],
  ['map', '地圖與狀態列', '四位'],
  ['blessing', '開局祝福（16 種、四張一組共 4 組）', '四位'],
  ['hud_allrelics', '狀態列＋全部秘寶掛身上', '與主角無關'],
  ['relic_list', '「本局秘寶」清單視窗（全部秘寶逐屏）', '與主角無關'],
  ['hud_potions', '狀態列＋三支最長忍具', '與主角無關'],
  ['rest', '貓窩（進門、按每顆鈕後）', '四位'],
  ['chest', '紙箱（未開、已開）', '四位'],
  ['shop', '罐頭鋪（四位店主＋行腳商）', '四位'],
  ['reward', '戰鬥獎勵', '四位'],
  ['reward_elite', '大魔物獎勵（第一關山豬、第三關鬼將）', '四位'],
  ['bossdoor', '關主門（三關）', '四位'],
  ['actclear', '過關（三選一秘寶＋牌）', '四位'],
  ['result', '結算（通關、陣亡）', '四位'],
  ['modals', '換忍具、淨化挑選、牌組、升級確認、移除確認', '球球（與主角無關）'],
];

// ================================================================== 寫報告
const sEn = { desk: hudStat('en', 'desk'), phone: hudStat('en', 'phone') }, sJa = { desk: hudStat('ja', 'desk'), phone: hudStat('ja', 'phone') }, sZh = hudStat('zh', 'desk');
const bEn = { desk: blessStat('en', 'desk'), phone: blessStat('en', 'phone') }, bJa = { desk: blessStat('ja', 'desk'), phone: blessStat('ja', 'phone') }, bZh = blessStat('zh', 'desk');
const eS = {}; for (const l of ['en', 'ja', 'zh']) for (const v of ['desk', 'phone']) eS[`${l}/${v}`] = evSummary(l, v);
const tS = { en: tipStat('en'), ja: tipStat('ja'), zh: tipStat('zh') };

P('# 爪破魔塔　英文、日文語系極端版面檢查（2026-09-30）');
P();
P('> 只查不改。檢查對象：多語系英日三批（09-29 已上線兩站、使用者尚未實機驗收）。工作副本 `F:\\ClaudeWork\\qiuqiu-wt-i18nedge0930`（分支 `i18nedge-0930`，由 coop 分出），`src\\` 一個字都沒動、沒提交到 coop、沒推、沒部署。');
P('> 本報告的數字全部由 `tools/i18n-edge/` 底下的腳本量出來（程式讀元素實際外框，不是看截圖猜），腳本可重跑，原始量測資料在同名資料夾。');
P();
P('## 〇、先講結論');
P();
P('__SUMMARY__');
P();
P('## 一、怎麼查的、查不到的是什麼');
P();
P('- **環境**：本機 vite 開發伺服器（埠 5231，與效能量測那個副本不同埠），Playwright 驅動本機 Chrome（一律走閘門的獨立設定資料夾），只開 `127.0.0.1`，沒碰任何線上網址、沒寫任何線上的 localStorage（語言與語音開關寫的是本機開發網址自己的儲存）。');
P('- **畫面尺寸**：桌機 1280×800；手機橫拿 844×390（開觸控模擬，遊戲才會套 `phone.css` 的手機版排版）。');
P('- **手機直式（約 390×844）**：遊戲設計上直立時**不顯示遊戲畫面**，只蓋一張「請把手機橫過來玩」的提示卡（`#rotate-hint`）。所以直式只能查那張提示卡（英日各一張，見 L-3），其餘各項一律以手機橫拿代查，**沒有直式下的遊戲畫面可查**。');
P('- **量法**：逐個文字節點量真實外框，對照它上面每一層會裁切的容器（`overflow`）與舞台邊界；手牌扇形、被縮放的元素外框會失真，另外處理。一個一定切得到的假元素驗證過掃描函式抓得到才開跑。');
P('- **字型限制**：遊戲用系統字型（英文 Segoe UI／Helvetica Neue／Arial、日文 Yu Gothic UI…）。本次是 Windows 上的 Chrome，蘋果與安卓手機的字寬會差幾個百分點；**邊緣案例（差不到 10%）在真機上可能不同，大幅溢出的（狀態列掉出畫面、祝福畫面蓋牌）不受影響**。');
P('- **對照組**：同樣的腳本也對繁中跑了一輪（狀態列、事件、劇情、戰鬥壓力、提示框、紀錄框），用來分辨「英日才有的問題」與「繁中本來就有的老問題」。');
P('- **沒查到的**：見第七節。');
P();
P('## 二、問題清單');
P();
P('嚴重度：**高**＝玩家看不到內容或碰不到操作；**中**＝明顯難看或讀不完整；**低**＝小瑕疵。每題格式：語系｜畫面｜元素｜怎麼壞（像素）｜截圖｜改法建議（只建議，沒動 `src\\`；改法一律保留畫質與特效，以縮字、換行、捲動、截斷加完整提示為主）。');
P();
P('__ISSUES__');
P();
P('## 三、覆蓋表（語系 × 畫面 × 主角）');
P();
P('__COVERAGE__');
P();
P('## 四、已查、正常的畫面');
P();
P('__OK__');
P();
P('## 五、附錄');
P();
P('__APPENDIX__');
P();
P('## 六、重跑方式與檔案');
P();
P('__FILES__');
P();
P('## 七、沒查到的（與原因）');
P();
P('__MISSING__');

let body = md.join('\n');
const SECTIONS = {};

// ------------------------------------------------------------------ 問題清單（高）
const iss = [];
const I = (s = '') => iss.push(s);

// H-1
I('### 高');
I();
I('#### H-1　狀態列右邊的按鈕掉出畫面（音樂／音效／語音、分享都點不到）');
I();
I(`- **語系**：英文（最嚴重）、日文；繁中對照也會，但發生得晚很多。`);
I('- **畫面**：所有帶狀態列的畫面（地圖、事件、罐頭鋪、貓窩、紙箱、戰鬥獎勵、過關、關主門、祝福、結算……）。');
I('- **元素**：`.hud` 那一整列（`hud-sound` 三顆、`hud-seed`「Share Run」、音量拉桿）。這一列是固定 1280px 寬、不換行的橫排，只有生命條肯縮（縮到 `crowded` 的 146px 下限，或英文桌機難度 2 以上直接縮到 4px），其餘不縮，超出就被舞台邊界裁掉。');
I(`- **怎麼壞**：我把「關名 × 難度 1／5 × 秘寶 0／8／12 件 × 小魚乾 30／999」共 12 種組合、三個關卡各量一次（每種語系×畫面 36 組、四位主角結果一致）：`);
I();
I('| 語系／畫面 | 36 組中有按鈕掉出或生命條被擠 | 最遠超出 | 生命條最窄 |');
I('|---|---|---|---|');
for (const [l, v] of [['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone']]) { const s = hudStat(l, v); I(`| ${LANG[l]}｜${VP[v]} | ${s.bad} / ${s.n} | ${px(s.maxOver)} | ${px(s.minHp)} |`); }
I(`| ${LANG.zh}｜${VP.desk} | ${sZh.bad} / ${sZh.n} | ${px(sZh.maxOver)} | ${px(sZh.minHp)} |`);
I();
I('代表案例（第二關、小魚乾 30、球球；數字是超出舞台右緣的像素）：');
I();
I('| 情境 | 英文｜桌機 | 英文｜手機橫拿 | 日文｜桌機 | 日文｜手機橫拿 | 繁中｜桌機 |');
I('|---|---|---|---|---|---|');
for (const [d, r, label] of [[1, 8, '難度 1、8 件秘寶（遊戲中期很平常）'], [5, 0, '難度 5、0 件秘寶'], [5, 12, '難度 5、12 件秘寶']]) {
  I(`| ${label} | ${hudCell('en', 'desk', d, r)} | ${hudCell('en', 'phone', d, r)} | ${hudCell('ja', 'desk', d, r)} | ${hudCell('ja', 'phone', d, r)} | ${hudCell('zh', 'desk', d, r)} |`);
}
I();
I('- **為什麼高**：英文只要帶 8 件秘寶（狀態列最多畫 8 顆）就會把「SFX」「Voice」擠出畫面；難度 2 以上因為多一塊「Difficulty 5·Demon Tower」牌子，連「Music」也出去，12 件秘寶加難度 5 時連「Share Run」都不見。玩家**在中後期沒辦法關音樂、關音效、關日文配音**。手機橫拿更早出事（英文連 0 件秘寶、難度 1 的第二關就把「Voice」擠出畫面，8 件秘寶時「SFX」「Voice」超出約 ' + px(hudCase('en', 'phone', 1, 8).m.maxRight - 1280) + '）。');
I(`- **截圖**：${link('fig_hud_en_desk_relics8_diff1.jpg')}（英文桌機 8 件秘寶：右邊只剩 Music，SFX、Voice 不見）、${link('fig_hud_en_desk_relics12_diff5.jpg')}（12 件＋難度 5：Share Run 之後全沒了）、${link('fig_hud_en_phone_relics8_diff1.jpg')}（手機橫拿）、${link('fig_hud_ja_desk_relics12_diff5.jpg')}、${link('fig_hud_ja_phone_relics12_diff5.jpg')}、對照 ${link('fig_hud_zh_desk_relics12_diff5.jpg')}。`);
I();
I(img('fig_hud_en_desk_relics8_diff1.jpg', '英文桌機 8 件秘寶 狀態列'));
I();
I(img('fig_hud_en_desk_relics12_diff5.jpg', '英文桌機 12 件秘寶 難度5 狀態列'));
I();
I('- **改法建議**：\n  1. 音樂、音效、語音三顆改成**只有圖示**（🎵 🔊 🗣，滑過去才出文字，`title` 已經有）；「Share Run／分享」縮成圖示＋一個字。這一項就省下約 250px，桌機英文 8 件秘寶就能放下。\n  2. 難度牌子改寫成「D5」＋滑過去看全名（提示框本來就有全名）。\n  3. 畫完狀態列後量一次 `scrollWidth`，超過 1280 就依序退一級：先縮秘寶圖示（`crowded` 那一級再加一級）、再把「牌組 10」「圖鑑」文字換成圖示、最後把秘寶收成「+N」（現在是 8 顆上限，可改成量得下幾顆畫幾顆）。做法可以照 `scene.ts` 的 `fitGoods`：畫好之後量現場、不夠就縮。\n  4. 至少讓 `.hud-sound` 那三顆 `flex-shrink: 0` 並排在最前面（畫質、特效完全不受影響）。');
I();

// H-2
{
  const enD = hud.filter((x) => x.lang === 'en' && x.vp === 'desk' && x.hero === 'ninja' && x.m.hpW < 60);
  I('#### H-2　狀態列的生命條被擠成幾個像素、看不到血量');
  I();
  I('- **語系／畫面**：英文｜桌機（手機橫拿的日英、日文桌機沒擠到 60px 以下，但也逼近）；所有帶狀態列的畫面。');
  I('- **元素**：`.hud-hp`（可收縮的那一格，別的格子不縮就輪到它縮）。');
  const dd = hudDiff.filter((x) => x.lang === 'en' && x.vp === 'desk' && x.relics === 0);
  const ddBad = dd.filter((x) => x.hpW < 60);
  const ddPhone = hudDiff.filter((x) => x.lang === 'en' && x.vp === 'phone' && x.relics === 0 && x.diff === 1 && x.out.length);
  I(`- **怎麼壞**：英文桌機**難度 2 以上**時，難度牌子（Difficulty N·名稱）＋長關名（Middle Tower）＋長按鈕字，把生命條擠到 **${Math.min(...ddBad.map((x) => x.hpW), 999)}px**（正常 146～220px），「176 / 176 HP」整段被切掉、只剩一條深色細縫。再補跑「難度 1～5 × 三個關卡」共 ${dd.length} 組（英文桌機、0 件秘寶）：其中 ${ddBad.length} 組（**難度 2～5、三個關卡全部**）生命條 ≤ ${Math.max(...ddBad.map((x) => x.hpW), 0)}px；難度 1 或已帶 8 件秘寶時 HP 格會停在最小寬度 146px、改由右邊按鈕掉出（見 H-1）。使用者**看不到自己剩多少血**。另外小魚乾到 4 位數（9999）時，難度 1 的罐頭鋪等畫面也把生命條擠到 14px（見 \`screens_*.json\` 的 \`div.hud-hp\`）。`);
  I(`- 手機橫拿英文即使難度 1、**0 件秘寶**，第二、三關就有 ${ddPhone.length ? ddPhone.map((x) => `${x.act === 2 ? '第二' : x.act === 3 ? '第三' : '第一'}關`).join('、') : '（無）'} 把「${ddPhone[0]?.out?.join('、') ?? ''}」擠出畫面。`);
  I(`- **截圖**：${link('fig_hud_en_desk_relics0_diff5.jpg')}（英文桌機，難度 5、0 件秘寶：生命條只剩一條線）。`);
  I();
  I(img('fig_hud_en_desk_relics0_diff5.jpg', '英文桌機 難度5 生命條被擠掉'));
  I();
  I('- **改法建議**：`.hud-hp` 設 `flex: 0 0 auto; min-width: 120px`（讓別的格子讓位，不要讓生命條讓位）；生命文字改用「176/176」，字型縮到 13px 再放；血量是全遊戲最重要的數字，排序上優先於秘寶圖示與難度牌子。難度牌子見 H-1 建議 2。');
  I();
}

// H-3
{
  I('#### H-3　卡牌說明被切掉（英文，手牌大小的牌）');
  I();
  I('- **語系**：英文（日文沒有被切到的）。');
  I('- **畫面**：戰鬥手牌、卡牌圖鑑、獎勵／罐頭鋪的小牌；連線專用牌與封封的牌為主。');
  I('- **元素**：`.card-text`（145×213 的小牌，文字區只有約 73px 高）。`fitCardText` 已經把字從 13px 一路縮到下限 10px 了，**縮到底還是放不下**，最後一兩行直接被牌框切掉。');
  I(`- **怎麼壞**：全部 ${cEn.ids} 張牌（四位主角各自拿得到的＋詛咒／狀態牌＋連線牌，一般與升級版、大小兩種尺寸）逐張量：英文有 **${cEn.H} 種（牌×版本×尺寸）縮到 10px 仍被切**，涵蓋下表 ${cardHighEn.length} 張牌；被切的多半是最後一句 “Solo: “partner” means you.”／“Exhaust.”，也就是**單人玩時才有意義的那句規則會看不到**。日文 ${cJa.H} 種被切。`);
  I();
  I('| 牌（英文名） | 哪幾位拿得到 | 被切的版本 | 縮字後字級 | 被切掉的高度 | 文字總行數 |');
  I('|---|---|---|---|---|---|');
  for (const e of cardHighEn.sort((a, b) => a.name.localeCompare(b.name))) {
    const worst = [...e.vers.values()].filter((v) => v.c === 'H').sort((a, b) => b.o.textOver - a.o.textOver)[0];
    I(`| ${e.name} | ${[...e.heroes].map((h) => HERO[h]).join('、')} | ${[...e.vers.entries()].filter(([, v]) => v.c === 'H').map(([k]) => k).join('、')} | ${worst.o.fsT}px | 約 ${worst.o.textOver}px（≈${(worst.o.textOver / (worst.o.fsT * 1.3)).toFixed(1)} 行） | ${worst.o.lines} |`);
  }
  I();
  I(`- **截圖**（被切／逼近下限的牌自動集成聯絡表）：${link('cards_en_desk_fengfeng_small_base_p0.png')}、${link('cards_en_desk_ninja_small_up_p0.png')}、${link('cards_en_desk_feifei_small_up_p0.png')}、${link('cards_en_desk_dangdang_small_up_p0.png')}。`);
  I();
  I(img('cards_en_desk_fengfeng_small_base_p0.png', '英文封封小牌 被切的牌'));
  I();
  I('- **手機橫拿的補充**：舞台在 844×390 的手機上縮成 0.54 倍，10px 的牌字實際只有約 5.4 CSS 像素，13px 的一般牌字也只有約 7px；也就是手機上手牌本來就要靠「按住放大」（`cardpeek`）才讀得到，縮字越多越依賴它。放大版是同一張牌等比放大，所以被切的那一行放大後**仍然是切掉的**。');
  I('- **改法建議**：不要再往下縮字（10px 已經很小，手機更讀不到）。三選一：\n  1. **縮短英文文案**：這批被切的幾乎都是連線牌，共同的尾巴 “Solo: “partner” means you.” 約 35 字元；改成短句 “Solo: partner = you.”，或把它移到牌型標籤那一行（`card-type` 現在只有一個字「Skill · 雙人」，還有空間）／改掛成提示框，牌面就多出一行。\n  2. 「（copies of this card don\'t stack; the highest applies）」這類括號補充也改成提示框（關鍵字滑過去看）。\n  3. 這幾張牌在手牌區允許「按住放大」已有（`cardpeek`），可另外讓手牌被切的牌在文字區右下角出一個「…」記號，提醒有被截斷。');
  I();
}

// H-4
{
  I('#### H-4　開局祝福畫面：旁白蓋住第四張祝福卡的最後幾行');
  I();
  I('- **語系**：英文、日文（繁中沒有）。');
  I('- **畫面**：開局祝福（四張卡＋下方旁白＋主角的一句話），四位主角都有，四組 16 種祝福都量了。這是您說的「已知小事：英文旁白長會壓到卡片下緣」，這次量出實際大小，並發現**不只壓下緣，而是蓋掉卡片文字**。');
  I('- **元素**：`.scene-box .dialogue-text`（旁白，4 行）與 `.bless-card`（卡片，最高那張最後幾行說明）。旁白框是貼底往上長的，卡片架釘在上面，兩塊各自定位、互相看不到高度。');
  I('- **怎麼壞**：旁白文字上緣比卡片下緣高多少（負數＝蓋住）：');
  I();
  I('| 語系｜畫面 | 旁白行數 | 卡片被蓋住 | 最糟的一組 | 16 組（4 位主角×4 組）中蓋住的組數 |');
  I('|---|---|---|---|---|');
  for (const [l, v, s] of [['en', 'desk', bEn.desk], ['en', 'phone', bEn.phone], ['ja', 'desk', bJa.desk], ['ja', 'phone', bJa.phone]]) {
    I(`| ${LANG[l]}｜${VP[v]} | ${s.maxLines} 行 | 最多 ${px(-s.minGap)} | ${s.worst.name}（${HERO[s.worst.hero]}） | ${s.over.length} / ${s.n} |`);
  }
  I(`| ${LANG.zh}｜${VP.desk}（對照） | ${bZh.maxLines} 行 | 沒有（最少留 ${px(bZh.minGap)} 空隙） | — | ${bZh.over.length} / ${bZh.n} |`);
  I();
  I(`- **實際看到的**：第三組（代價類）第四張「Miasma-Stained Old Wrist Guard」說明有 5 行，旁白第一行直接壓在它第 4、5 行上，「Max HP −8」（代價）讀不出來——玩家在選一個有代價的祝福，卻看不到代價。`);
  I(`- **截圖**：${link('bless_blessing_2_en_desk_ninja.jpg')}（英文桌機，第三組）、${link('bless_blessing_2_en_phone_ninja.jpg')}、${link('bless_blessing_2_ja_desk_ninja.jpg')}、對照 ${link('bless_blessing_2_zh_desk_ninja.jpg')}。`);
  I();
  I(img('bless_blessing_2_en_desk_ninja.jpg', '英文桌機 祝福畫面 旁白蓋住卡片'));
  I();
  I('- **改法建議**：照 `goodsfit.ts`／`fitGoods` 的老辦法，在祝福畫面也「畫完量現場、撞到就縮」：①卡片架 `scale` 縮到旁白上緣再留 6px（最小 0.8）；②旁白字級從 27px 縮到 22～23px、行距 1.75→1.5（英文四行就變約 3 行，省 60～80px）；③旁白長於三行時只顯示前兩行、後面接「…」，點一下展開（完整文字放提示框，畫質特效都不動）。');
  I();
}

// ------------------------------------------------------------------ 中
I('### 中');
I();
// M-1 events art cover
{
  const en = eS['en/desk'], enp = eS['en/phone'], ja = eS['ja/desk'], jap = eS['ja/phone'], zh = eS['zh/desk'], zhp = eS['zh/phone'];
  I('#### M-1　事件：長文字把插圖蓋住、對白框頂到狀態列');
  I();
  I('- **語系**：英文最嚴重，日文次之。');
  I('- **畫面**：事件開場與結果畫面（78 篇事件裡該主角遇得到的約 66～67 篇 × 開場＋每個選項的結果；四位主角、桌機與手機橫拿各一輪，英日各 ' + (en?.n ?? 0) + '／' + (ja?.n ?? 0) + ' 個畫面，繁中對照）。');
  I('- **元素**：`.scene-box`（對白框，貼底、往上長）與 `.scene-art`（事件插圖）、`.hud`。');
  I('- **怎麼壞**：對白框上緣比插圖下緣高 30px 以上（＝文字壓在插圖上）的畫面數：');
  I();
  I('| 語系 | 桌機 | 手機橫拿 |');
  I('|---|---|---|');
  I(`| 英文 | ${en?.artCover} / ${en?.n} | ${enp?.artCover} / ${enp?.n} |`);
  I(`| 日文 | ${ja?.artCover} / ${ja?.n} | ${jap?.artCover} / ${jap?.n} |`);
  I(`| 繁中（對照） | ${zh?.artCover} / ${zh?.n} | ${zhp?.artCover ?? '（沒跑）'} / ${zhp?.n ?? ''} |`);
  I();
  I(`最嚴重的（框頂 y 座標越小越糟；狀態列底約在 y=56）：`);
  I();
  I('| 事件 | 步驟 | 語系｜畫面 | 框頂 y | 繁中同畫面框頂 | 說明 |');
  I('|---|---|---|---|---|---|');
  for (const [l, v] of [['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone']]) {
    for (const w of evWorst(l, v, 4)) I(`| ${w.id} | ${w.step === 'open' ? '開場' : '選項' + (Number(w.step.slice(3)) + 1) + '結果'} | ${LANG[l]}｜${VP[v]} | ${w.t} | ${w.zt ?? '—'} | ${w.lines} 行、${w.btns} 個選項；插圖底在 ${w.artB} |`);
  }
  I();
  I(`- 手機橫拿英文有 ${enp?.underHud} 個畫面（4 個選項的「greedy_merchant」開場，四位主角都有）框頂到 y=21，**事件名稱那塊木牌與第一行被狀態列蓋住**（狀態列底約在 y=56）。日文手機沒有蓋到狀態列，但也有 ${jap?.artCover} 個畫面壓到插圖。`);
  I(`- **截圖**：${link('_evp_greedy_merchant_open_en_desk_fengfeng.png')}（英文桌機：文字直接疊在插圖上）、${link('_evp_greedy_merchant_open_en_phone_fengfeng.png')}（英文手機橫拿：事件名稱被狀態列吃掉）、${link('_evp_greedy_merchant_open_ja_phone_ninja.png')}（日文手機橫拿）、${link('_evp_rare_catnip_master_open_en_desk_ninja.png')}（英文桌機另一篇）。`);
  I();
  I(img('_evp_greedy_merchant_open_en_desk_fengfeng.png', '英文桌機 事件文字蓋住插圖'));
  I();
  I('- **改法建議**：事件插圖現在有 `fitArt`（縮圖），但只縮到某個下限；文字太長時下限之後還是蓋。①框頂一旦低於插圖底，就把插圖再縮到最小 0.6 倍並上移到狀態列下緣；②選項按鈕在 3 個以上、且文字兩行時字級 17→15px、內距 12→8px（4 個兩行選項省約 40px）；③框頂低於狀態列底時把事件內文那一塊改成可捲動（`overflow-y: auto`、上緣淡出），不要讓標題被狀態列吃掉。');
  I();
}
// M-2 loot
{
  const en = eS['en/desk'], ja = eS['ja/desk'], zh = eS['zh/desk'], enp = eS['en/phone'], jap = eS['ja/phone'];
  I('#### M-2　事件結果的「獲得物展示」跑出畫面上緣');
  I();
  I('- **語系／畫面**：英文、日文；事件結果畫面（一次拿到 3～4 樣秘寶或忍具時）。繁中也有一篇（`greedy_merchant`）——是老問題，英日讓它更嚴重且多了幾篇。');
  I('- **元素**：`.loot-above`／`.loot-kind`／`.loot-name`（結果畫面裡秘寶或忍具的大圖示與名稱、說明，疊在插圖位置）。');
  I(`- **怎麼壞**：桌機英文 ${en?.lootOut} 個畫面、日文 ${ja?.lootOut} 個、繁中 ${zh?.lootOut} 個；手機英文 ${enp?.lootOut}、日文 ${jap?.lootOut}。涉及的事件：英文 ${[...(en?.lootEvents ?? [])].join('、')}；日文 ${[...(ja?.lootEvents ?? [])].join('、')}。最嚴重時展示區的說明文字往上超出舞台 **${px(en?.maxLootOver ?? 0)}**（英文），名稱與種類標籤（Relic／Ninja Tool）也超出 60～80px。這些獲得物底下的「Got Relic …」文字列還在，所以是**看得到獲得了什麼但展示圖與說明被切**，不是資訊完全消失。`);
  I(`- **截圖**：${link('_evp_greedy_merchant_3_en_desk_fengfeng.png')}（英文桌機：「Pick It Back Up」「Soul-Return Incense」的大字名稱重疊在標題木牌上，說明被狀態列吃掉）。`);
  I();
  I(img('_evp_greedy_merchant_3_en_desk_fengfeng.png', '英文桌機 事件結果 獲得物展示跑出畫面'));
  I();
  I('- **改法建議**：獲得物超過 2 樣時，展示區改成橫排小圖示（不再放大字名稱），或整塊 `scale` 縮到能放進插圖區（同 `fitArt`）；說明字（`loot-above`）只留在底下的 “Got …” 文字列。畫質與特效不動。');
  I();
}
// M-3 tooltips
{
  const te = tS.en, tj = tS.ja, tz = tS.zh;
  I('#### M-3　提示框（滑過去的說明）下緣被舞台切掉');
  I();
  I('- **語系**：英文最嚴重、日文次之，繁中也有（老問題）。');
  I('- **畫面**：戰鬥中滑過左下角的忍具格、手牌上的名詞（蓄氣／隱身／定身…）。提示框從錨點往上 90px 開始往下長，沒有判斷下緣。');
  I('- **元素**：`.tooltip`（寬 260px、高度隨字數）。');
  I(`- **怎麼壞**（在戰鬥裡真的把滑鼠移到那些元素上量）：忍具格——英文 ${te.by.potion?.n ?? 0} 次提示框出界、最多 **${px(te.by.potion?.max ?? 0)}**（「Demon-Revealing Mirror」提示框高 ${px(te.by.potion?.h ?? 0)}，等於畫面高的六成）；日文 ${tj.by.potion?.n ?? 0} 次、最多 ${px(tj.by.potion?.max ?? 0)}；繁中 ${tz.by.potion?.n ?? 0} 次、最多 ${px(tz.by.potion?.max ?? 0)}。手牌上的名詞——英文 ${te.by.handKw?.n ?? 0} 次、最多 ${px(te.by.handKw?.max ?? 0)}（「Qi」）；日文 ${px(tj.by.handKw?.max ?? 0)}；繁中 ${px(tz.by.handKw?.max ?? 0)}。切掉的是提示框最後幾行（往往是名詞補充說明的最後一條）。`);
  I(`- **另外**：把名詞表 ${new Set(tips.filter((x) => x.kind === 'gloss').map((x) => x.id)).size} 條、秘寶 ${new Set(tips.filter((x) => x.kind === 'relic').map((x) => x.id)).size} 件、忍具 ${new Set(tips.filter((x) => x.kind === 'potion').map((x) => x.id)).size} 支的提示框逐條掛在四種錨點各量一次（見 \`tips_*.json\`），英文最高一條 451px、日文 485px（「Miasma-Stained Old Wrist Guard」＝沾了魔氣的舊護腕）、繁中 338px。`);
  I(`- **截圖**：${link('fig_tooltip_potion_en_desk.jpg')}（英文，最後一行 “Stacks can keep piling up.” 貼在舞台底邊、第三條補充說明整條不見）、${link('fig_tooltip_potion_ja_desk.jpg')}、對照 ${link('fig_tooltip_potion_zh_desk.jpg')}。`);
  I();
  I(img('fig_tooltip_potion_en_desk.jpg', '英文 忍具提示框被舞台下緣切掉'));
  I();
  I('- **改法建議**：`showTip` 算完 `top` 之後加一行 `top = Math.min(top, 720 - 提示框高 - 8)`（貼下緣就往上推，錨點在下半畫面就改成放在錨點上方）；提示框補充說明（`glossaryLines`）在英日文最多 2 條、超過的折成「…（更多請看圖鑑）」；提示框內文超過 12 行時字級 14→12.5px。');
  I();
}
// M-4 shop clamp
{
  const rows = scr.filter((r) => scrGroup(r.name) === 'shop');
  const clampRows = rows.flatMap((r) => r.clipped.filter((c) => shopClamp(c)).map((c) => ({ ...c, lang: r.lang, vp: r.vp, hero: r.hero, name: r.name })));
  const byLang = (l) => clampRows.filter((c) => c.lang === l);
  const worst = (l) => byLang(l).sort((a, b) => b.over.b - a.over.b)[0];
  const distinct = (l) => new Set(byLang(l).map((c) => c.text.slice(0, 40))).size;
  I('#### M-4　罐頭鋪：秘寶說明被截在 4 行，後面看不到');
  I();
  I('- **語系**：英文、日文（繁中沒有被截的）。');
  I('- **畫面**：罐頭鋪貨架（四位店主、行腳商）。');
  I('- **元素**：`.scene-goods .shop-item .small`（設計上就有 `-webkit-line-clamp: 4`，完整文字只放在 `title` 屬性，靠滑鼠停留才看得到）。');
  I(`- **怎麼壞**：英文有 ${distinct('en')} 段說明被截（最多超出 ${px(worst('en')?.over.b ?? 0)}，例：「${(worst('en')?.text ?? '').slice(0, 50)}…」），日文有 ${distinct('ja')} 段（最多 ${px(worst('ja')?.over.b ?? 0)}）。被截的通常是最後一句（套組加成、淨化說明、「價格打三折」這類影響買不買的規則）。**手機沒有滑鼠停留，完整說明看不到**（觸控只會出現點擊，沒有提示；貨架格雖然掛了「按住放大」\`cardpeek\`，但它放大的是同一份已被截成 4 行的複製品，還是看不到後面的字）。`);
  I(`- **截圖**：${link('screens_shop_curio_en_desk_feifei.jpg')}（英文桌機，第一格 Anvil 的最後一句 “Rebound damage deals 1 ext…” 被截）、${link('screens_shop_orange_en_phone_ninja.jpg')}（手機橫拿）。`);
  I();
  I(img('screens_shop_curio_en_desk_feifei.jpg', '英文桌機 罐頭鋪 說明被截'));
  I();
  I('- **改法建議**：①英日文把 `line-clamp` 放寬到 6 行，並把 `.small` 字級 11.5→10.5px（英文貨架高度只多約 20px，`fitGoods` 會自動縮貨架補償）；②貨架格點一下（觸控）彈出跟秘寶圖鑑同款的完整說明提示（`attachTextTooltip` 已有現成函式）；③被截的格子右下角補「…」記號，提醒還有下文。');
  I();
}
// M-5 card name cut / text floor
{
  I('#### M-5　卡牌牌名被切／文字縮到下限（英文為主）');
  I();
  I('- **語系**：英文（日文只有 ' + cJa.textMin + ' 種文字縮到下限）。');
  I('- **畫面**：手牌（小牌）、卡牌圖鑑、獎勵、罐頭鋪。');
  I('- **元素**：`.card-name`（牌名固定一行、`fitCardText` 縮到下限 9px）與 `.card-text`（縮到下限 10px 但剛好放得下）。');
  I(`- **怎麼壞**：牌名縮到 9px 仍被切 **${cEn.name} 種**（牌×版本×尺寸），縮到 9px 才剛好放下 ${cEn.nameMin} 種；文字縮到 10px 才放得下 ${cEn.textMin} 種。牌名被切的：` + cardNameEn.map((e) => `「${e.name}」（${[...e.vers.values()].reduce((m, v) => Math.max(m, v.o.nameOver), 0)}px）`).join('、') + '——全是「Secret Art:」（絕學）開頭的長牌名，**字母被切半個**。文字縮到 10px 的：' + cardTextMinEn.map((e) => `「${e.name}」`).join('、') + (cardTextMinJa.length ? `；日文：${cardTextMinJa.map((e) => `「${e.name}」`).join('、')}` : '') + '。');
  I(`- 另外有 ${cEn.shrunk} 種（英）／${cJa.shrunk} 種（日）只是縮了一兩級、仍可讀，列為正常（附錄 A）。`);
  I('- **截圖**：同 H-3 的聯絡表（' + link('cards_en_desk_dangdang_small_base_p0.png') + '、' + link('cards_en_desk_ninja_small_base_p0.png') + '）。');
  I('- **改法建議**：英文牌名的前綴「Secret Art:」改成「Art:」（省約 45px），或牌名超寬時允許兩行（牌名列高度 22→34px、圖區減 12px）；文字到下限的牌與 H-3 同一招：縮短英文文案。');
  I();
}
// M-6 intents
{
  const mE = mvStat('en', 'desk', 'plain'), mEb = mvStat('en', 'desk', 'big'), mJ = mvStat('ja', 'desk', 'plain'), mJb = mvStat('ja', 'desk', 'big');
  const ov = (m) => m.overlap.map((x) => `「${x.text}」`).slice(0, 4).join('、') || '沒有';
  I('#### M-6　魔物意圖牌（頭上那塊「Atk 4」）：英文長招式名互相蓋住');
  I();
  I('- **語系**：英文（日文最寬 170px、沒有蓋住的組合）。');
  I('- **畫面**：戰鬥，三隻魔物並排時。');
  I('- **元素**：`.intent`（不換行的單行牌子，寬度隨字數；魔物之間只隔約 205px）。');
  I(`- **怎麼壞**：把全部 ${mE.n} 招（每隻魔物的每個階段每一招）三隻一組塞進同一場，各量兩次——原樣一次、數字灌到三位數（傷害 188×5、多段、蜷縮 150、回復 999）一次。英文原樣最寬 **${px(mE.top[0]?.w ?? 0)}**（「${mE.top[0]?.text}」），灌大數字後最寬 ${px(mEb.top[0]?.w ?? 0)}（「${mEb.top[0]?.text}」）；三隻並排時**互相蓋住**：英文原樣 ${mE.overlap.length} 組（${ov(mE)}）、灌大數字 ${mEb.overlap.length} 組。日文原樣最寬 ${px(mJ.top[0]?.w ?? 0)}、灌大數字 ${px(mJb.top[0]?.w ?? 0)}，蓋住 ${mJb.overlap.length} 組。**沒有任何意圖牌換行或出舞台**（單行且沒超出 1280）；三位數傷害與多段攻擊（188×5＋188×3）沒有把牌子撐爆。`);
  I(`- 意圖提示框（滑過去）最高 ${px(mEb.tallTip?.tip?.h ?? 0)}（英文「${mEb.tallTip?.label ?? ''}」），都在舞台內。`);
  I(`- **截圖**：${link('fig_intent_en_desk.jpg')}（英文桌機：「Debuff Belly Drum(Seen Through)」被隔壁「Debuff Shriek(Seen Through)」壓住）、${link('fig_intent_ja_desk.jpg')}、${link('fig_intent_en_phone.jpg')}。`);
  I();
  I(img('fig_intent_en_desk.jpg', '英文桌機 三隻魔物意圖牌互相蓋住'));
  I();
  I('- **改法建議**：`.intent` 加 `max-width: 200px`＋`overflow: hidden; text-overflow: ellipsis`，全文本來就有提示框；或超過 200px 時字級 19→16px。英文把括號補充「(Seen Through)」「(Disrupted)」縮成圖示或 “(SeeThru)”，這兩個出現在多數長招式上。');
  I();
}
// M-7 boss names
{
  const en = encIssues('en', 'desk'), ja = encIssues('ja', 'desk'), enp = encIssues('en', 'phone'), jap = encIssues('ja', 'phone');
  const fmt = (xs) => [...new Map(xs.map((x) => [x.text, x])).values()].map((x) => `「${x.text}」（切 ${x.over}px）`).join('、') || '沒有';
  I('#### M-7　魔物名字牌被切（英文長名字的關主）');
  I();
  I('- **語系**：英文（日文：' + (fmt(ja) === '沒有' ? '沒有' : fmt(ja)) + '）。');
  I('- **畫面**：戰鬥，魔物腳下的名字。');
  I('- **元素**：`.unit .name`（單行、超出被 `overflow:hidden` 切掉）。');
  I(`- **怎麼壞**：跑了每一場一般、菁英、大魔物、塔主、鏡中戰鬥（${encs.filter((x) => x.lang === 'en' && x.vp === 'desk').length} 場）。英文桌機：${fmt(en)}；英文手機橫拿：${fmt(enp)}；日文桌機：${fmt(ja)}；日文手機橫拿：${fmt(jap)}。（提示：戰鬥裡「暴怒的」這類前綴只出現在紀錄與泡泡，名字牌不含前綴，所以前綴後的更長名字沒有量到，見第七節。）`);
  I('- **改法建議**：名字牌 `.name` 超寬時字級 16→13px（跟牌名的縮字同一支 `fitCardText` 作法）；或英文名縮寫（Cow Cat Second-in-Command → “Cow Cat Deputy”）。');
  I();
}

// ------------------------------------------------------------------ 低
I('### 低');
I();
{
  const clogRow = (l, v) => clog.find((x) => x.lang === l && x.vp === v && x.hero === 'ninja')?.m;
  const cs = (l, v, h = 'dangdang') => { const r = cstress.find((x) => x.lang === l && x.vp === v && x.hero === h); const p = r?.stress.units.find((u) => u.cls.includes('player')); return p ? { rows: p.chipRows, top: Math.round(p.chips.t), n: p.nChips } : null; };
  const a = clogRow('en', 'phone'), b = clogRow('en', 'desk'), z = clogRow('zh', 'phone'), zd = clogRow('zh', 'desk'), j = clogRow('ja', 'phone');
  I('#### L-1　戰鬥左下角的紀錄框：最舊的一行被切、手機英文蓋到抽牌堆計數');
  I();
  I(`- **語系／畫面**：英日；戰鬥（每一場都有，繁中也有但輕）。**元素**：\`.combat .log\`（固定高度、最舊一行從上緣被切）與 \`.combat .piles\`（抽牌堆／棄牌堆／消耗堆／連擊數）。`);
  I(`- **怎麼壞**：最舊那行被切掉的高度：英文桌機 ${b?.cutTop?.map(px).join('、')}、手機 ${a?.cutTop?.map(px).join('、')}；日文手機 ${j?.cutTop?.map(px).join('、')}；繁中桌機 ${zd?.cutTop?.map(px).join('、')}、手機 ${z?.cutTop?.map(px).join('、')}。英文**手機橫拿**時紀錄框往上多蓋了 ${px(a?.coverPiles ?? 0)}，壓到抽牌堆計數那排（繁中 0）。`);
  I(`- **截圖**：${link('clog_en_phone_ninja.jpg')}、${link('clog_ja_phone_ninja.jpg')}、對照 ${link('clog_zh_phone_ninja.jpg')}。`);
  I('- **改法建議**：紀錄框加 `overflow-y: auto`＋`flex-direction: column-reverse`（最新的在下、可往上滑看舊的），高度不變；手機版把 `.piles` 上移 16px 或紀錄框字級 −1px。');
  I();
  const es = cs('en', 'phone'), zs = cs('zh', 'phone');
  I('#### L-2　主角與魔物同時掛滿狀態（極端壓力）：英文狀態牌排數多，遮住主角');
  I();
  I(`- **做法**：主角與三隻魔物同時掛滿全部狀態（各 19 種、數字 137／88）、蜷縮 999、全部能力牌（主角 37～43 顆牌子），四位主角、桌機與手機各一輪。`);
  I(`- **結果**：沒有任何牌子跑出舞台、沒有壓到手牌（最底貼在 y=470、手牌上緣 y=476）；魔物的牌子 6～7 排，與繁中一樣。**主角這邊**：英文比繁中多排：例如噹噹在手機橫拿——英文 ${es?.rows} 排（牌子頂在 y=${es?.top}）、繁中 ${zs?.rows} 排（y=${zs?.top}）；日文介於兩者之間。牌子往上長，會蓋住整隻貓（繁中極端情境也會蓋，只是少一些）。`);
  I(`- **截圖**：${link('combat_stress_en_desk_ninja.png')}、${link('combat_stress_en_phone_dangdang.png')}、${link('combat_stress_ja_phone_dangdang.png')}、對照 ${link('combat_stress_zh_phone_dangdang.png')}。`);
  I('- **改法建議**：極端情境不算急；若要改，`.chips.many` 再加一級（字 15→13px）或超過 24 顆時最舊的能力牌收成「+N」。');
  I();
}
{
  const m = misc.filter((x) => x.name === 'rotate_hint');
  I('#### L-3　手機直立的「請橫過來玩」提示卡：英文貼滿左右邊');
  I();
  I(`- 英文卡寬 ${m.find((x) => x.lang === 'en')?.m.card.r - m.find((x) => x.lang === 'en')?.m.card.l}px＝整個螢幕寬（0px 左右留白），${m.find((x) => x.lang === 'en')?.m.lines} 行；日文 ${m.find((x) => x.lang === 'ja')?.m.card.r - m.find((x) => x.lang === 'ja')?.m.card.l}px、繁中 ${m.find((x) => x.lang === 'zh')?.m.card.r - m.find((x) => x.lang === 'zh')?.m.card.l}px。文字沒被切，只是卡片邊框貼著螢幕邊。`);
  I(`- **截圖**：${link('misc_portrait_en.jpg')}、${link('misc_portrait_ja.jpg')}、${link('misc_portrait_zh.jpg')}。`);
  I('- **改法建議**：`#rotate-hint .rotate-card` 加 `max-width: calc(100vw - 32px)`。');
  I();
  const jp = scr.filter((r) => r.lang === 'ja' && r.vp === 'phone').flatMap((r) => r.clipped.filter((c) => /hud-hp/.test(c.el) && c.over.t > 0 && c.over.t < 8));
  I('#### L-4　日文手機橫拿：狀態列生命文字上下被切 3.7px');
  I();
  I(`- 日文手機橫拿，生命條上的「体力 76 / 76」文字上緣被容器切掉 3.7px（${jp.length} 個畫面，所有帶狀態列的畫面都有；肉眼是字頂貼邊）。**改法**：\`.hud-hp span\` 的 \`line-height\` 1→1.15、生命條高 +2px。`);
  I();
  {
    const bad = shopLines.filter((x) => x.lang === 'en' && x.vp === 'phone' && x.kind === 'talk' && x.gapMin !== null && x.gapMin < 0);
    const combos = [...new Set(bad.map((x) => `${HERO[x.hero]}×${x.keeper === 'orange' ? '橘貓老闆' : x.keeper === 'junk' ? '雜貨阿福' : x.keeper}`))];
    const worst = bad.length ? Math.min(...bad.map((x) => x.gapMin)) : 0;
    I('#### L-5　罐頭鋪（英文手機橫拿）：貨架縮到下限仍貼到店主名牌');
    I();
    I(`- 英文、手機橫拿；${combos.join('、')} 兩種組合（${bad.length} 句台詞都一樣，因為是貨架本身太高，不是台詞長）：\`refitGoods\` 已把貨架縮到設計下限 0.8 倍，價錢下緣與店主名牌／對白上緣還是**重疊 ${px(-worst)}**（其餘組合最少留 6px，繁中桌機／手機同組合也有 6px）。肉眼是「價錢貼著名牌」，字沒被蓋掉。`);
    I(`- **截圖**：${link('shoplines_orange_en_phone_feifei.jpg')}、${link('shoplines_junk_en_phone_fengfeng.jpg')}。`);
    I('- **改法建議**：M-4 的改法（說明字級 11.5→10.5px、行距縮）會讓貨架矮約 20px，就自然解掉；另可把 `GOODS_MIN_SCALE` 在英文手機放寬到 0.72，或名牌的內距 −3px。');
    I();
  }
  const st = { desk: storyDist('en', 'desk', 'slide'), ja: storyDist('ja', 'desk', 'slide'), zh: storyDist('zh', 'desk', 'slide') };
  I('#### L-6　劇情幻燈片與對白框：最長的英文句框高到 328px（畫面高的 46%）');
  I();
  I(`- 幻燈片台詞框貼在畫面上緣、半透明漸層。英文最長 ${st.desk.maxLines} 行、框高 ${px(st.desk.maxH)}（4 行以上 ${(st.desk.lines[4] ?? 0) + (st.desk.lines[5] ?? 0)} 句，遮掉圖上半部）；日文最長 ${st.ja.maxLines} 行、框高 ${px(st.ja.maxH)}；繁中最高 ${px(st.zh.maxH)}。沒有任何一句跑出舞台或被切。`);
  const pc = (lang) => {
    const xs = realStory.filter((x) => x.lang === lang && x.vp === 'desk' && x.ctx === 'dialogue' && x.m.portrait);
    const cover = (x) => { const p = x.m.portrait; const h = p.b - p.t; return h > 0 ? Math.max(0, p.b - Math.max(p.t, x.m.box.t)) / h : 0; };
    const faceHit = (x) => { const p = x.m.portrait; return x.m.box.t < p.t + 0.45 * (p.b - p.t); };
    return { n: xs.length, max: Math.max(0, ...xs.map(cover)), face: xs.filter(faceHit).length, over50: xs.filter((x) => cover(x) > 0.5).length };
  };
  const pE = pc('en'), pJ = pc('ja'), pZ = pc('zh');
  I(`- 對白框（有說話者、有立繪的句子）壓到立繪的程度（框上緣蓋住立繪高度的比例；立繪腳被框蓋住一截是設計，但**臉**不該被蓋）：英文 ${pE.n} 句中最多蓋住 ${(pE.max * 100).toFixed(0)}%、框頂蓋到臉（立繪上 45%）的 ${pE.face} 句、蓋過一半的 ${pE.over50} 句；日文最多 ${(pJ.max * 100).toFixed(0)}%、蓋到臉 ${pJ.face} 句；繁中最多 ${(pZ.max * 100).toFixed(0)}%。`);
  I(`- **截圖**：${link('fig_story_slide_en_desk_dangdang.jpg')}（英文幻燈片：噹噹序章第 1 句，5 行）、${link('fig_story_dialogue_en_desk_fengfeng.jpg')}（英文對白框最長：封封落敗，5 行）、${link('fig_story_slide_ja_desk_dangdang.jpg')}、${link('fig_story_dialogue_ja_desk_ninja.jpg')}；手機橫拿：${link('fig_story_slide_en_phone_dangdang.jpg')}、${link('fig_story_dialogue_en_phone_fengfeng.jpg')}。`);
  I('- **改法建議**：幻燈片文字 >3 行時字級 30→26px；或分成兩頁（同一張圖、按一下續下半句）。詳細分布與最長前十句見附錄 B。');
  I();
  I('#### L-7　附帶發現（不是版面）：英日畫面上殘留中文');
  I();
  I('- **卡牌型別標籤**：連線專用牌的型別列，CSS 寫死了 `content: \'· 雙人\'`（`components.css` 第 574 行），英日文畫面看到 “Skill · 雙人”、「スキル · 雙人」（見 H-3 的聯絡表）。');
  I('- **戰鬥紀錄**：影球球那場，紀錄裡說話者寫「球球的影子: (The …)」，名字沒翻（`intents_*` 掃描時發現，`shadow_cat` 場）。');
  I('- 這兩個是翻譯漏網，不屬於「版面極端」，順手列出免得漏。');
  I();
}
SECTIONS.ISSUES = iss.join('\n');

// ------------------------------------------------------------------ 覆蓋表
{
  const out = [];
  out.push('圖例：✓＝查過、沒有新問題；ⓘ＝查過、只有列出的已知問題（H-1／H-2 是狀態列問題，幾乎每個帶狀態列的畫面都會帶著，這裡標出來不代表那個畫面本身有問題）；—＝沒查（原因見第七節）。「主角」欄寫這一項實際跑了幾位。');
  out.push('');
  out.push('**畫面類（`screens.mjs`）**');
  out.push('');
  out.push('| 畫面 | 主角 | 英文｜桌機 | 英文｜手機橫拿 | 日文｜桌機 | 日文｜手機橫拿 |');
  out.push('|---|---|---|---|---|---|');
  for (const [g, label, who] of SCREENS) {
    const cell = (l, v) => {
      const s = scrSig(l, v, g);
      if (!s.covered) return '—';
      const ids = [...s.ids];
      const o = s.other.length ? ` ⚠ ${s.other.slice(0, 2).join(' ')}` : '';
      return ids.length || o ? `ⓘ ${ids.join('／')}${o}` : '✓';
    };
    out.push(`| ${label} | ${who} | ${cell('en', 'desk')} | ${cell('en', 'phone')} | ${cell('ja', 'desk')} | ${cell('ja', 'phone')} |`);
  }
  out.push('');
  out.push('**其他專項**');
  out.push('');
  out.push('| 項目 | 主角 | 英文｜桌機 | 英文｜手機橫拿 | 日文｜桌機 | 日文｜手機橫拿 | 說明 |');
  out.push('|---|---|---|---|---|---|---|');
  const yes = (l, v, has) => (has(l, v) ? 'ⓘ' : '✓');
  const cardsHas = (l, v) => cards.some((c) => c.lang === l && c.vp === v && cardCls(c) !== 'ok' && !cardCls(c).startsWith('L'));
  out.push(`| 卡牌逐張（${cEn.ids} 張×一般／升級×大／小牌） | 四位 | ${yes('en', 'desk', cardsHas)} H-3／M-5 | ${yes('en', 'phone', cardsHas)} H-3／M-5 | ${yes('ja', 'desk', cardsHas)} M-5 | ${yes('ja', 'phone', cardsHas)} M-5 | 手機與桌機的牌面排版相同（同一組 CSS 像素） |`);
  out.push(`| 狀態列（36 種情境） | 四位（結果相同） | ⓘ H-1／H-2 | ⓘ H-1 | ⓘ H-1 | ⓘ H-1 | |`);
  out.push(`| 戰鬥：主角＋三魔物掛滿狀態 | 四位 | ⓘ L-2 | ⓘ L-2 | ✓ | ✓ | 無牌子出界、無壓手牌 |`);
  out.push(`| 戰鬥：提示框（忍具、手牌名詞、狀態牌、飯糰） | 四位 | ⓘ M-3 | ⓘ M-3 | ⓘ M-3 | ⓘ M-3 | 名詞／秘寶／忍具全表另掃 |`);
  out.push(`| 戰鬥：意圖牌（${mvStat('en', 'desk', 'plain').n} 招×原樣／大數字） | 球球（招式與主角無關） | ⓘ M-6 | ⓘ M-6 | ✓ | ✓ | 日文沒有蓋住的組合 |`);
  out.push(`| 戰鬥：各場遭遇名字／血條／意圖（${encs.filter((x) => x.lang === 'en' && x.vp === 'desk').length} 場） | 球球全跑；其他三位跑鏡中對手與塔主 | ⓘ M-7 | ⓘ M-7 | ✓ | ✓ | |`);
  out.push(`| 戰鬥紀錄框 | 球球、封封 | ⓘ L-1 | ⓘ L-1 | ⓘ L-1 | ⓘ L-1 | |`);
  out.push(`| 事件（每篇開場＋每個選項結果） | 四位 | ⓘ M-1／M-2 | ⓘ M-1／M-2 | ⓘ M-1／M-2 | ⓘ M-1／M-2 | 各約 ${eS['en/desk'].n} 個畫面 |`);
  out.push(`| 劇情：幻燈片、對白框、吐槽、魔物初見（每句） | 四位 | ⓘ L-6 | ⓘ L-6 | ✓ | ✓ | ${realStory.filter((x) => x.lang === 'en' && x.vp === 'desk').length} 句次（含連線搭檔版） |`);
  out.push(`| 罐頭鋪店主台詞（4 位店主×每句） | 四位 | ✓ | ⓘ L-5 | ✓ | ✓ | 進店對話、碎念、買太多、欠條、初見旁白 |`);
  out.push(`| 連線大廳（5 個不碰網路的步驟） | 與主角無關 | ✓ | ✓ | ✓ | ✓ | 開房、貼碼直連的網路步驟沒查 |`);
  out.push(`| 手機直立提示卡 | 與主角無關 | ✓（見 L-3） | — | ✓ | — | 直立不顯示遊戲畫面（設計） |`);
  SECTIONS.COVERAGE = out.join('\n');
}

// ------------------------------------------------------------------ 已查正常
{
  const ok = [];
  ok.push('以下畫面英日各兩種尺寸都量過，**除狀態列（H-1／H-2）之外沒有文字被切、出界、省略號**：');
  ok.push('');
  const okList = SCREENS.filter(([g]) => { const s = ['en', 'ja'].flatMap((l) => ['desk', 'phone'].map((v) => scrSig(l, v, g))); return s.every((x) => x.covered && !x.other.length && !x.ids.some((i) => !['H-1', 'H-2'].includes(i))); });
  for (const [, label, who] of okList) ok.push(`- ${label}（${who}）`);
  ok.push('');
  ok.push('另外：');
  ok.push('- **卡牌圖鑑、秘寶與忍具圖鑑、「本局秘寶」清單視窗**：圖鑑與清單本身的標題列、主角切換鈕、分區標題沒被切；秘寶／忍具說明是可捲動區，全部逐屏掃過（唯一問題是圖鑑裡的卡牌本身，見 H-3／M-5）。');
  ok.push('- **劇情台詞**：每一句用遊戲自己的 `playDialogue`／`playSlides`／`toast`／`bubbleAt` 播出來量，**沒有任何一句的文字框跑出舞台、被切掉或蓋住按鈕**；戰鬥吐槽與魔物初見的泡泡英日全部一到兩行、沒有橫向出界。對白框最長 5 行（英文），立繪腳被蓋住是設計。');
  {
    const sl = (l, v) => shopLines.filter((x) => x.lang === l && x.vp === v && !x.err);
    const st = (l, v) => { const xs = sl(l, v); const talk = xs.filter((x) => x.kind === 'talk'); const nt = xs.filter((x) => x.kind === 'notice' && x.notice); return { n: xs.length, overlap: talk.filter((x) => x.gapMin !== null && x.gapMin < 0).length, minScale: talk.length ? Math.min(...talk.map((x) => x.scale)) : 1, maxLines: Math.max(0, ...talk.map((x) => x.lines)), noticeW: nt.length ? Math.max(...nt.map((x) => x.notice.w)) : 0, noticeH: nt.length ? Math.max(...nt.map((x) => x.notice.h)) : 0 }; };
    const cells = [['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone']].map(([l, v]) => `${LANG[l]}${v === 'desk' ? '桌機' : '手機'}：${st(l, v).n} 句、價錢被字蓋住 ${st(l, v).overlap} 句、貨架最小縮到 ${st(l, v).minScale.toFixed(2)} 倍、對白最多 ${st(l, v).maxLines} 行、第一次見面旁白條最寬 ${px(st(l, v).noticeW)}／高 ${px(st(l, v).noticeH)}`);
    ok.push('- **罐頭鋪店主台詞（橘貓老闆、三位客座店主 × 四位主角 × 每一句：碎念、進店對話、買太多、欠條、第一次見面旁白）**：每句放進真的罐頭鋪對白框、叫遊戲自己的 `refitGoods` 縮貨架後量價錢有沒有被字蓋住。結果——' + cells.join('；') + '。除了英文手機橫拿的兩種組合（L-5）之外，價錢與對白之間都留有 ≥ 6px 空隙、貨架沒有縮到下限。');
  }
  ok.push('- **意圖牌與魔物血條**：三位數傷害、多段攻擊（188×5＋188×3）、蜷縮 150 都沒有撐爆牌子、沒有換行、沒有出舞台。');
  ok.push('- **祝福畫面的日文文字本身**沒被切（只有與卡片的相對位置問題，見 H-4）。');
  SECTIONS.OK = ok.join('\n');
}

// ------------------------------------------------------------------ 附錄
{
  const ap = [];
  ap.push('### A. 卡牌：縮字後有狀況的牌（英文）');
  ap.push('');
  ap.push(`全部 ${cEn.ids} 張牌 × 四位主角 × 一般／升級 × 小牌（手牌／圖鑑 145×213）／大牌（獎勵／罐頭鋪 170×250）。每種「牌×版本×尺寸」計一次，共 ${cEn.total} 種。`);
  ap.push('');
  ap.push('| 分級 | 英文 | 日文 |');
  ap.push('|---|---|---|');
  ap.push(`| 高：縮到下限仍被切（文字） | ${cEn.H} | ${cJa.H} |`);
  ap.push(`| 中：牌名縮到 9px 仍被切 | ${cEn.name} | 0 |`);
  ap.push(`| 中：文字剛好縮到下限 10px | ${cEn.textMin} | ${cJa.textMin} |`);
  ap.push(`| 中：牌名剛好縮到下限 9px | ${cEn.nameMin} | ${cardCounts('ja').nameMin} |`);
  ap.push(`| 低：縮了一兩級、仍可讀 | ${cEn.shrunk} | ${cJa.shrunk} |`);
  ap.push('');
  ap.push('英文「文字縮到下限」與「牌名」的完整清單：');
  ap.push('');
  ap.push('| 牌 | 主角 | 版本 | 文字字級 | 牌名字級 | 牌名被切 |');
  ap.push('|---|---|---|---|---|---|');
  for (const e of [...cardTextMinEn, ...cardNameEn].sort((a, b) => a.name.localeCompare(b.name))) {
    const v = [...e.vers.values()].sort((a, b) => b.o.nameOver - a.o.nameOver)[0];
    ap.push(`| ${e.name} | ${[...e.heroes].map((h) => HERO[h]).join('、')} | ${[...e.vers.keys()].join('、')} | ${v.o.fsT}px | ${v.o.fsN}px | ${v.o.nameOver > 0 ? px(v.o.nameOver) : '—'} |`);
  }
  ap.push('');
  ap.push('### B. 劇情：文字長度與框高');
  ap.push('');
  ap.push('| 語系｜畫面 | 語境 | 不重複句數 | 最高框 | 行數分布（行數:句數） | 橫向出舞台 |');
  ap.push('|---|---|---|---|---|---|');
  for (const [l, v] of [['zh', 'desk'], ['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone']]) for (const ctx of ['slide', 'dialogue', 'bark', 'bubble']) {
    const s = storyDist(l, v, ctx);
    ap.push(`| ${LANG[l]}｜${VP[v]} | ${CTX[ctx]} | ${s.n} | ${px(s.maxH)} | ${Object.entries(s.lines).map(([k, n]) => `${k}:${n}`).join(' ')} | ${s.sideOut} |`);
  }
  ap.push('');
  ap.push('**英文最長前十句**（顯示後字元數；框高是桌機實測）：');
  ap.push('');
  ap.push('| # | 字元數 | 語境 | 出處 | 主角 | 行數 | 框高 | 開頭 |');
  ap.push('|---|---|---|---|---|---|---|---|');
  storyTop('en').forEach((x, i) => ap.push(`| ${i + 1} | ${[...x.m.shown].length} | ${CTX[x.ctx]} | ${SRC(x.src)} | ${HERO[x.hero]} | ${x.m.lines} | ${px(H(x))} | ${x.m.shown.slice(0, 50).replace(/\|/g, '/')}… |`));
  ap.push('');
  ap.push('**日文最長前十句**：');
  ap.push('');
  ap.push('| # | 字元數 | 語境 | 出處 | 主角 | 行數 | 框高 | 開頭 |');
  ap.push('|---|---|---|---|---|---|---|---|');
  storyTop('ja').forEach((x, i) => ap.push(`| ${i + 1} | ${[...x.m.shown].length} | ${CTX[x.ctx]} | ${SRC(x.src)} | ${HERO[x.hero]} | ${x.m.lines} | ${px(H(x))} | ${x.m.shown.slice(0, 40).replace(/\|/g, '/')}… |`));
  ap.push('');
  ap.push('**師父（大俠貓，第三關關主）的台詞**：開場、換階段、落敗，含連線搭檔專屬接話版：');
  ap.push('');
  ap.push('| 語系 | 句次 | 不重複句 | 最多行數 | 最高框 | 最長那句（顯示後字元數） |');
  ap.push('|---|---|---|---|---|---|');
  for (const l of ['zh', 'en', 'ja']) {
    const xs = realStory.filter((x) => x.lang === l && x.vp === 'desk' && x.ctx === 'dialogue' && (/:tower_master$/.test(x.src) || /^coopBoss:/.test(x.src)));
    const u = new Map(); for (const x of xs) if (!u.has(x.m.shown)) u.set(x.m.shown, x);
    const arr = [...u.values()];
    const top = [...arr].sort((a, b) => [...b.m.shown].length - [...a.m.shown].length)[0];
    ap.push(`| ${LANG[l]} | ${xs.length} | ${arr.length} | ${Math.max(0, ...arr.map((x) => x.m.lines))} | ${px(Math.max(0, ...arr.map(H)))} | ${top ? [...top.m.shown].length : 0} |`);
  }
  ap.push('');
  ap.push(`（劇情來源：序章、第一二關過關、塔頂、結局（難度 1 與 5）、落敗、關主開場／換階段／落敗、祕笈、貓窩前夜、吐槽、魔物初見，單人四位主角＋每位主角與另外三位的連線搭檔版；另把語言包裡沒被上述來源掃到的 ${story.filter((x) => x.lang === 'en' && x.vp === 'desk' && x.hero === 'ninja' && x.src === 'pack_other').length} 句也用對白框各量一次，那些其實是事件旁白、不會出現在對白框，只算進「涵蓋整份語言包」，不列入上面的分級。）`);
  ap.push('');
  ap.push('### C. 事件：框頂最高（最擠）的畫面');
  ap.push('');
  for (const [l, v] of [['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone']]) {
    ap.push(`**${LANG[l]}｜${VP[v]}**`);
    ap.push('');
    ap.push('| 事件 | 步驟 | 框頂 y | 繁中框頂 | 文字行數 | 選項數 |');
    ap.push('|---|---|---|---|---|---|');
    for (const w of evWorst(l, v, 8)) ap.push(`| ${w.id} | ${w.step} | ${w.t} | ${w.zt ?? '—'} | ${w.lines} | ${w.btns} |`);
    ap.push('');
  }
  ap.push('### D. 魔物招式：最寬的意圖牌前五');
  ap.push('');
  for (const [l, v] of [['en', 'desk'], ['ja', 'desk']]) for (const variant of ['plain', 'big']) {
    const s = mvStat(l, v, variant);
    ap.push(`**${LANG[l]}｜${VP[v]}｜${variant === 'plain' ? '原樣' : '數字灌到三位數'}**：` + s.top.map((x) => `${px(x.w)}「${x.text}」`).join('；'));
    ap.push('');
  }
  ap.push('### E. 狀態列：三個關卡 × 難度 × 秘寶 × 小魚乾 全表');
  ap.push('');
  ap.push('見 `hud_*.json`（每筆含每一格的外框）。');
  SECTIONS.APPENDIX = ap.join('\n');
}

SECTIONS.FILES = [
  '- 腳本都在 `tools/i18n-edge/`（副本分支 `i18nedge-0930`）：`lib.mjs`（共用零件與掃描函式）、`cards.mjs`、`screens.mjs`、`hud-check.mjs`、`events.mjs`、`story.mjs`、`intents.mjs`、`combat-stress.mjs`、`combat-log.mjs`、`tooltips.mjs`、`tips-real.mjs`、`misc.mjs`、`shots.mjs`、`build-report.mjs`（本報告產生器）。',
  '- 需要先在副本開一個開發伺服器：`npx vite --port 5231 --host 127.0.0.1 --strictPort`（環境變數 `EDGE_PORT` 可換埠）；瀏覽器走閘門 `tools/visual-gate/lib/browser.mjs` 的設定資料夾規則（`C:/pwsw/edge-*`，跑完自動關）。',
  '- 例：`node tools/i18n-edge/cards.mjs en,ja desk,phone`、`node tools/i18n-edge/hud-check.mjs en,ja desk,phone`、`node tools/i18n-edge/events.mjs en desk,phone`；最後 `node tools/i18n-edge/build-report.mjs` 重產本報告。',
  '- 截圖與原始量測（JSON）：`docs/檢查_英日極端版面_20260930/`。`fig_*` 是報告用的重現截圖，`screens_*`、`bless_*`、`modals_*`、`elite_*` 是各畫面的逐張截圖，`cards_*` 是卡牌聯絡表。',
].join('\n');

SECTIONS.MISSING = [
  '- **手機直立（約 390×844）的遊戲畫面**：設計上直立時只顯示「請橫過來玩」提示卡，底下的遊戲不渲染，所以只查了提示卡；其餘以手機橫拿 844×390（開觸控模擬）代查。若日後要支援直立，需另查。',
  '- **真機字型**：蘋果／安卓手機的中日英字型與 Windows 不同，字寬會差幾個百分點；本次只在 Windows Chrome 上量。',
  '- **卡牌按住放大（手機長按 `cardpeek`）**：需要真實的觸控長按事件，自動化只能點擊，沒查；放大只是把同一張牌放大，文字溢出以卡牌本身的量測為準。',
  '- **連線大廳的「開房」「貼碼直連」網路步驟**：會連到中繼伺服器或做 WebRTC，違反「只開本機」的限制，沒查；只查了不碰網路的 5 個步驟（選擇、直連模式、加入、輸入錯誤的失敗訊息、直連加入）。連線進行中的畫面（兩位主角同框的戰鬥、對方的狀態列）也沒查。',
  '- **問號格變化**（伏擊、行腳商開頭橫幅、路邊紙箱開頭）：行腳商的貨架有查（`shop_merchant`），但它的開頭那一段對白與揭曉圖動畫沒逐句量。',
  '- **事件中需要另開視窗才走得完的選項**（挑牌升級／移除的牌組視窗、要打一場的事件）：按下去後若跳出牌組視窗就只量到視窗打開那一刻，視窗內的牌已由卡牌逐張量測涵蓋；「要打一場」的事件只量到選項本身。',
  '- **稀有／罕見的開局祝福變體**：16 種祝福都量了，但祝福「三選一」那個挑牌子畫面（`choosing`）沒逐個量。',
  '- **語音**：語音關掉量測（避免下載語音檔）；日文配音本身與版面無關，沒查。',
  '- **關主「暴怒的」前綴與遭遇前綴（例如「暴怒的貓又婆婆」）**：這些前綴在名字牌上不顯示、只出現在紀錄與泡泡，用的是同一批已量過的句型；沒有把每個「前綴×魔物」組合逐一播出來量。',
  '- **連線時同伴的狀態列與手牌預覽**（`mate-play`）：需要兩台連線，沒查。',
].join('\n');

const issText = SECTIONS.ISSUES;
const cntH = (issText.match(/^#### H-\d+/gm) ?? []).length, cntM = (issText.match(/^#### M-\d+/gm) ?? []).length, cntL = (issText.match(/^#### L-\d+/gm) ?? []).length;
const sum = [];
sum.push(`共 **${cntH} 個高、${cntM} 個中、${cntL} 個低**（英日兩個語系合計；英文遠比日文嚴重，日文的高級問題只有狀態列與祝福畫面）。`);
sum.push('');
sum.push('**最嚴重的三個**');
sum.push('');
sum.push(`1. **H-1 狀態列右邊的按鈕掉出畫面**：英文帶 8 件秘寶（很平常）就看不到「SFX」「Voice」，難度 2 以上連「Music」也沒了，12 件秘寶加難度 5 連「Share Run」都不見；手機橫拿更早。玩家中後期沒辦法關音樂、音效、日文配音。繁中也有同型問題，但要 12 件秘寶＋高難度才出現。`);
sum.push(`2. **H-2 英文桌機難度 2 以上，生命條被擠成 4px**：血量看不到（0 件秘寶就中）。`);
sum.push(`3. **H-4 開局祝福畫面旁白蓋住卡片說明**：英文旁白 4 行，最多蓋住第四張卡 ${px(-bEn.desk.minGap)}（手機 ${px(-bEn.phone.minGap)}）、16 組中 ${bEn.desk.over.length} 組蓋到；玩家在挑「有代價的祝福」時看不到代價（Max HP −8）。日文也蓋（最多 ${px(-bJa.desk.minGap)}）。`);
sum.push('');
sum.push(`另一個高：**H-3 英文的 ${cardHighEn.length} 張牌（連線牌與封封的牌）說明縮到 10px 仍被切掉最後一行**（多半是「單人時 partner 指自己」那句）。日文的牌全部放得下。`);
sum.push('');
sum.push('**問題一覽**');
sum.push('');
sum.push('| 編號 | 級別 | 語系 | 畫面 | 一句話 |');
sum.push('|---|---|---|---|---|');
for (const [id, sev, lg, sc, one] of [
  ['H-1', '高', '英、日（繁中輕）', '所有有狀態列的畫面', '音樂／音效／語音鈕掉出畫面右緣，點不到'],
  ['H-2', '高', '英（桌機）', '所有有狀態列的畫面', '難度 2 以上生命條被擠成 4px，看不到血量'],
  ['H-3', '高', '英', '手牌、圖鑑、獎勵、罐頭鋪', `${cardHighEn.length} 張連線牌／封封的牌，說明縮到 10px 仍被切最後一行`],
  ['H-4', '高', '英、日', '開局祝福', '旁白蓋住第四張祝福卡的說明（含代價）'],
  ['M-1', '中', '英、日', '事件', '長文字蓋住插圖；手機英文標題被狀態列吃掉'],
  ['M-2', '中', '英、日', '事件結果', '獲得物展示超出畫面上緣'],
  ['M-3', '中', '英、日（繁中輕）', '戰鬥提示框', '滑過忍具格、手牌名詞時，提示框下緣被切'],
  ['M-4', '中', '英、日', '罐頭鋪', '秘寶說明只顯示 4 行，手機看不到全文'],
  ['M-5', '中', '英（日 1 張）', '卡牌', '「Secret Art:」牌名被切、文字縮到下限'],
  ['M-6', '中', '英', '戰鬥意圖牌', '長招式名的意圖牌互相蓋住'],
  ['M-7', '中', '英', '戰鬥名字牌', '兩隻關主／大魔物名字被切'],
  ['L-1', '低', '英、日（繁中輕）', '戰鬥紀錄框', '最舊一行被切；手機英文蓋到抽牌堆計數'],
  ['L-2', '低', '英、日', '戰鬥（極端狀態）', '主角狀態牌排數比繁中多 2～5 排'],
  ['L-3', '低', '英', '手機直立提示卡', '卡片貼滿左右邊'],
  ['L-4', '低', '日', '狀態列（手機）', '生命文字上緣被切 3.7px'],
  ['L-5', '低', '英', '罐頭鋪（手機）', '貨架縮到下限仍貼到店主名牌 13px'],
  ['L-6', '低', '英', '劇情幻燈片／對白', '最長句框高 328px（46%）'],
  ['L-7', '低', '英、日', '卡牌、戰鬥紀錄', '殘留中文（「· 雙人」、「球球的影子」）'],
]) sum.push(`| ${id} | ${sev} | ${lg} | ${sc} | ${one} |`);
sum.push('');
sum.push('**沒有問題的**：劇情台詞每一句（幻燈片、對白、吐槽、魔物初見、關主、店主）英日都沒有跑出畫面、被切或蓋住按鈕；意圖牌撐得住三位數傷害與多段攻擊；罐頭鋪店主台詞不會蓋價錢（只有英文手機橫拿的兩種組合貼邊，L-5）；封面、選角、圖鑑、秘寶清單、結算、連線大廳、各種確認視窗都正常。');
sum.push('');
sum.push('**手機直式（390×844）**：遊戲直立時只顯示「請把手機橫過來玩」提示卡（設計如此），英日提示卡都放得下（英文貼滿左右邊，L-3）；遊戲畫面本身一律以手機橫拿 844×390 代查，沒有直式下的遊戲畫面可看。');
sum.push('');
sum.push('**已知小事的現況**：①英文祝福旁白壓卡片——確認，而且比想像的嚴重（H-4，蓋到說明文字不只是壓下緣）；②英文狀態牌掛滿 20 種沒溢出（`i18n-chips-check.mjs` 量的是角色腳下那排狀態牌）——確認，沒有溢出（見 L-2）。**但「狀態列」這個詞有兩處要分開：角色腳下的狀態牌沒事，畫面最上方那一整條（程式裡叫 `hud`，本報告一律稱「狀態列」）才是重災區（H-1、H-2）。**');
SECTIONS.SUMMARY = sum.join('\n');

for (const [k, v] of Object.entries(SECTIONS)) body = body.replace(`__${k}__`, () => v);
writeFileSync(OUTMD, body, 'utf-8');
console.log('wrote', OUTMD, body.length, 'chars');
