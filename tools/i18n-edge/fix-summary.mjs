#!/usr/bin/env node
/*
 * 修正前後對照的數字表（定義照檢查報告 tools/i18n-edge/build-report.mjs，同一把尺）：
 *   node tools/i18n-edge/fix-summary.mjs <前資料夾> <後資料夾>
 * 前資料夾＝修正前跑出來的量測（或檢查報告那一份），後資料夾＝修正後。缺的檔就跳過那一項。
 */
import { readFileSync, existsSync } from 'node:fs';

const [B, A] = [process.argv[2], process.argv[3]].map((d) => (d.endsWith('/') ? d : d + '/'));
const load = (dir, f) => (existsSync(dir + f) ? JSON.parse(readFileSync(dir + f, 'utf8')) : null);
const loadAny = (dir, names) => { for (const n of names) { const x = load(dir, n); if (x) return x; } return null; };
const HEROES = 'ninja-feifei-dangdang-fengfeng';
const LV = { en: '英文', ja: '日文', zh: '繁中' };
const VP = { desk: '桌機', phone: '手機橫拿' };
const out = [];
const P = (s = '') => { out.push(s); console.log(s); };
const row = (cells) => P('| ' + cells.join(' | ') + ' |');
const head = (cells) => { row(cells); row(cells.map(() => '---')); };

// ---- 狀態列
{
  P('### 狀態列（H-1、H-2）：36 種情境（三個關卡×難度 1／5×秘寶 0／8／12 件×小魚乾 30／999）');
  head(['語系｜畫面', '前：按鈕掉出或生命條被擠', '前：最遠超出', '前：生命條最窄', '後：按鈕掉出或生命條被擠', '後：最遠超出', '後：生命條最窄']);
  const get = (dir) => {
    const files = [`hud_enjazh_deskphone_ninja.json`, `hud_enja_deskphone_${HEROES}.json`, 'hud_enzh_desk_ninja.json'];
    return files.flatMap((f) => load(dir, f) ?? []);
  };
  const b = get(B), a = get(A);
  const stat = (xs, lang, vp) => {
    const one = xs.filter((x) => x.lang === lang && x.vp === vp && x.hero === 'ninja');
    if (!one.length) return null;
    const bad = one.filter((x) => x.m.overStage.length || x.m.hpClipped);
    return { n: one.length, bad: bad.length, over: Math.max(0, Math.max(...one.map((x) => x.m.maxRight)) - 1280), hp: Math.min(...one.map((x) => x.m.hpW)) };
  };
  for (const [l, v] of [['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone'], ['zh', 'desk'], ['zh', 'phone']]) {
    const s0 = stat(b, l, v), s1 = stat(a, l, v);
    row([`${LV[l]}｜${VP[v]}`, s0 ? `${s0.bad} / ${s0.n}` : '—', s0 ? `${Math.round(s0.over)}px` : '—', s0 ? `${s0.hp}px` : '—', s1 ? `${s1.bad} / ${s1.n}` : '—', s1 ? `${Math.round(s1.over)}px` : '—', s1 ? `${s1.hp}px` : '—']);
  }
  P();
}

// ---- 狀態列（戰鬥畫面）
{
  P('### 狀態列在戰鬥畫面（整頁重畫時狀態列先在游離節點組好再掛上去）：18 種情境（三個關卡×難度 1／5×秘寶 0／8／12 件，小魚乾 999）');
  head(['語系｜畫面', '前：按鈕掉出畫面', '前：最遠超出', '後：按鈕掉出畫面', '後：最遠超出']);
  const stat = (dir, lang, vp) => {
    const rows = (load(dir, 'hud-combat_enjazh_deskphone_ninja.json') ?? []).filter((x) => x.lang === lang && x.vp === vp);
    if (!rows.length) return null;
    const bad = rows.filter((x) => x.m.kids.some((c) => c.w > 0 && (c.box.r > 1281 || c.box.l < -1)));
    return { n: rows.length, bad: bad.length, over: Math.max(0, Math.max(...rows.map((x) => x.m.maxRight)) - 1266) };
  };
  for (const [l, v] of [['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone'], ['zh', 'desk'], ['zh', 'phone']]) {
    const s0 = stat(B, l, v), s1 = stat(A, l, v);
    row([`${LV[l]}｜${VP[v]}`, s0 ? `${s0.bad} / ${s0.n}` : '—', s0 ? `${s0.over}px` : '—', s1 ? `${s1.bad} / ${s1.n}` : '—', s1 ? `${s1.over}px` : '—']);
  }
  P();
}

// ---- 祝福
{
  P('### 開局祝福（H-4）：旁白第一行字的上緣與卡片框下緣的距離（負數＝蓋住），四位主角×四組＝16 組');
  head(['語系｜畫面', '前：蓋住的組數', '前：最糟', '後：蓋住的組數', '後：最糟（最小距離）', '後：旁白最多行數']);
  const stat = (rows, l, v) => { const xs = rows.filter((r) => r.lang === l && r.vp === v); if (!xs.length) return null; return { n: xs.length, over: xs.filter((r) => r.gap < 0).length, worst: Math.min(...xs.map((r) => r.gap)), lines: Math.max(...xs.map((r) => r.lines)) }; };
  const b = loadAny(B, [`bless_enjazh_deskphone_${HEROES}.json`]) ?? [];
  const a = loadAny(A, [`bless_enjazh_deskphone_${HEROES}.json`]) ?? [];
  for (const [l, v] of [['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone'], ['zh', 'desk'], ['zh', 'phone']]) {
    const s0 = stat(b, l, v), s1 = stat(a, l, v);
    row([`${LV[l]}｜${VP[v]}`, s0 ? `${s0.over} / ${s0.n}` : '—', s0 ? `${s0.worst}px` : '—', s1 ? `${s1.over} / ${s1.n}` : '—', s1 ? `${s1.worst}px` : '—', s1 ? s1.lines : '—']);
  }
  P();
}

// ---- 卡牌
{
  P('### 卡牌（H-3、M-5）：235 張牌×一般／升級×大／小牌，每種（牌×版本×尺寸）算一次');
  const sum = (dir) => {
    const rows = load(dir, 'cards_raw_enjazh_deskphone.json') ?? load(dir, 'cards_raw_enja_deskphone.json');
    if (!rows) return null;
    const o = {};
    for (const lang of [...new Set(rows.map((r) => r.lang))]) {
      const seen = new Map();
      for (const r of rows.filter((x) => x.lang === lang && x.p === 0)) {
        const k = `${r.id}|${r.upgraded}|${r.size}`;
        const c = seen.get(k) ?? { textCut: false, nameCut: false, textMin: false, nameMin: false, wrap: false };
        c.textCut ||= r.textOver > 0.5; c.nameCut ||= r.nameOver > 0.5; c.textMin ||= r.fsT <= 10.01; c.nameMin ||= r.fsN <= 9.01; c.wrap ||= !!r.nameWrap;
        seen.set(k, c);
      }
      const v = [...seen.values()];
      o[lang] = { total: v.length, textCut: v.filter((x) => x.textCut).length, nameCut: v.filter((x) => x.nameCut).length, textMin: v.filter((x) => x.textMin && !x.textCut).length, nameMin: v.filter((x) => x.nameMin && !x.nameCut).length, wrap: v.filter((x) => x.wrap).length };
    }
    return o;
  };
  const b = sum(B), a = sum(A);
  head(['語系', '前：文字被切', '前：牌名被切', '前：文字剛好下限', '前：牌名剛好下限', '後：文字被切', '後：牌名被切', '後：文字剛好下限', '後：牌名剛好下限', '後：牌名換兩行']);
  for (const l of ['en', 'ja', 'zh']) {
    const x = b?.[l], y = a?.[l];
    row([LV[l], x?.textCut ?? '—', x?.nameCut ?? '—', x?.textMin ?? '—', x?.nameMin ?? '—', y?.textCut ?? '—', y?.nameCut ?? '—', y?.textMin ?? '—', y?.nameMin ?? '—', y?.wrap ?? '—']);
  }
  P();
}

// ---- 事件
{
  P('### 事件（M-1、M-2）：四位主角×每篇開場與每個選項結果，928 個畫面');
  head(['語系｜畫面', '前：框壓插圖', '前：框頂進狀態列', '前：獲得物超出畫面', '後：框壓插圖', '後：框頂進狀態列', '後：獲得物超出畫面', '後：文字捲動級（畫面數）']);
  const get = (dir, l, v) => {
    const f = [`events_${l}_${v}_${HEROES}.json`, `events_${l}_deskphone_${HEROES}.json`];
    const rows = loadAny(dir, f);
    return rows ? rows.filter((x) => x.vp === v) : null;
  };
  const stat = (rows) => {
    if (!rows) return null;
    const rs = rows.filter((r) => r.m && r.m.box);
    const lootOut = rs.filter((r) => (r.outside ?? []).some((o) => /loot|gain-stack|showcase/.test(o.el) && o.over.t > 1.5) || (r.m.lootTop != null && r.m.hudB != null && r.m.lootTop < r.m.hudB - 1));
    return { n: rs.length, cover: rs.filter((r) => r.m.art && r.m.box.t < r.m.art.b - 30).length, hud: rs.filter((r) => r.m.hudB != null && r.m.box.t < r.m.hudB - 1).length, loot: lootOut.length, scroll: rs.filter((r) => r.m.scrolled).length };
  };
  for (const [l, v] of [['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone'], ['zh', 'desk'], ['zh', 'phone']]) {
    const s0 = stat(get(B, l, v)), s1 = stat(get(A, l, v));
    row([`${LV[l]}｜${VP[v]}`, s0?.cover ?? '—', s0?.hud ?? '—', s0?.loot ?? '—', s1?.cover ?? '—', s1?.hud ?? '—', s1?.loot ?? '—', s1?.scroll ?? '—']);
  }
  P();
}

// ---- 提示框
{
  P('### 提示框（M-3）：戰鬥裡把滑鼠真的移到忍具格、手牌名詞、狀態牌子、飯糰、意圖上，量提示框有沒有出舞台');
  head(['語系', '前：量測次數', '前：出界次數', '前：下緣最多超出', '後：量測次數', '後：出界次數', '後：下緣最多超出']);
  const stat = (rows, l) => {
    if (!rows) return null;
    const xs = rows.filter((x) => x.lang === l && x.vp === 'desk');
    const bad = xs.filter((x) => x.t < 0 || x.b > 720 || x.l < 0 || x.r > 1280);
    return { n: xs.length, bad: bad.length, max: Math.max(0, ...bad.map((x) => x.b - 720)) };
  };
  const f = `tipr_enjazh_deskphone_${HEROES}.json`;
  const b = load(B, f), a = load(A, f);
  for (const l of ['en', 'ja', 'zh']) {
    const s0 = stat(b, l), s1 = stat(a, l);
    row([LV[l], s0?.n ?? '—', s0?.bad ?? '—', s0 ? `${Math.round(s0.max)}px` : '—', s1?.n ?? '—', s1?.bad ?? '—', s1 ? `${Math.round(s1.max)}px` : '—']);
  }
  P();
}

// ---- 罐頭鋪說明
{
  P('### 罐頭鋪貨架說明被截（M-4）：罐頭鋪各畫面裡被夾行截掉的說明段數');
  head(['語系', '前：被截段數', '前：最多超出', '後：被截段數', '後：最多超出']);
  const stat = (dir, l) => {
    const rows = load(dir, `screens_${l}_deskphone_${HEROES}.json`)?.rows ?? (load(dir, `screens_enja_deskphone_${HEROES}.json`)?.rows ?? []).filter((r) => r.lang === l);
    const xs = rows.filter((r) => r.lang === l && /^shop_/.test(r.name));
    const clips = xs.flatMap((r) => r.clipped.filter((c) => !c.scroll && /div\.small/.test(c.el)));
    const uniq = new Map(clips.map((c) => [c.text, c]));
    return { n: uniq.size, max: Math.max(0, ...clips.map((c) => c.over.b)) };
  };
  for (const l of ['en', 'ja']) { const s0 = stat(B, l), s1 = stat(A, l); row([LV[l], s0.n, `${Math.round(s0.max)}px`, s1.n, `${Math.round(s1.max)}px`]); }
  P();
}

// ---- 意圖牌與名字牌
{
  P('### 意圖牌（M-6）與名字牌（M-7）');
  head(['語系｜畫面', '前：意圖牌最寬', '前：互相蓋住（原樣／灌大數字）', '前：名字被切', '後：意圖牌最寬', '後：互相蓋住（原樣／灌大數字）', '後：名字被切']);
  const get = (dir) => [...(load(dir, 'intents_enja_deskphone_ninja.json') ?? []), ...(load(dir, 'intents_enja_deskphone_feifei-dangdang-fengfeng.json') ?? []), ...(load(dir, `intents_enja_deskphone_${HEROES}.json`) ?? [])];
  const stat = (rows, l, v) => {
    const mv = rows.filter((x) => x.step === 'moves' && x.lang === l && x.vp === v);
    if (!mv.length) return null;
    const enc = rows.filter((x) => x.step === 'enc' && x.lang === l && x.vp === v);
    const names = [];
    for (const x of enc) for (const u of x.units) if (u.nameOver > 1) names.push(u.nameText);
    const orig = mv.filter((x) => x.variant === 'orig' || x.variant === 'normal' || x.variant === undefined);
    const variants = [...new Set(mv.map((x) => x.variant))];
    const ov = (vr) => mv.filter((x) => x.variant === vr && x.over.length).length;
    return { maxW: Math.max(...mv.map((x) => x.w)), ov: variants.map((vr) => ov(vr)).join('／'), names: [...new Set(names)].length };
  };
  const b = get(B), a = get(A);
  for (const [l, v] of [['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone']]) {
    const s0 = stat(b, l, v), s1 = stat(a, l, v);
    row([`${LV[l]}｜${VP[v]}`, s0 ? `${Math.round(s0.maxW)}px` : '—', s0?.ov ?? '—', s0?.names ?? '—', s1 ? `${Math.round(s1.maxW)}px` : '—', s1?.ov ?? '—', s1?.names ?? '—']);
  }
  P();
}

// ---- 全畫面掃描（文字被切／跑出舞台／省略號）：修正有沒有把本來正常的畫面弄壞
{
  P('### 全畫面掃描：文字被切、跑出舞台、省略號的項目數（依元素分類；「其他」增加＝有東西變壞）');
  const cls = (c) => (/hud/.test(c.el) ? '狀態列' : /card-(text|name)/.test(c.el) ? '牌面' : /div\.small/.test(c.el) ? '貨架說明' : /loot|gain-stack|showcase/.test(c.el) ? '獲得物' : /intent/.test(c.el) ? '意圖牌' : /name/.test(c.el) ? '名字牌' : '其他');
  const items = (r) => [...(r.clipped ?? []).filter((c) => !c.scroll), ...(r.outside ?? []), ...(r.ellipsis ?? [])];
  const tally = (rows) => { const t = {}; for (const r of rows) for (const c of items(r)) { const k = cls(c); t[k] = (t[k] ?? 0) + 1; } return t; };
  const evRows = (dir, l, v) => loadAny(dir, [`events_${l}_${v}_${HEROES}.json`, `events_${l}_deskphone_${HEROES}.json`])?.filter((x) => x.vp === v) ?? null;
  head(['來源', '語系｜畫面', '前', '後']);
  for (const [l, v] of [['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone'], ['zh', 'desk'], ['zh', 'phone']]) {
    const b = evRows(B, l, v), a = evRows(A, l, v);
    row(['事件', `${LV[l]}｜${VP[v]}`, b ? JSON.stringify(tally(b)) : '—', a ? JSON.stringify(tally(a)) : '—']);
  }
  const scr = (dir, l, v) => {
    const rows = load(dir, `screens_${l}_deskphone_${HEROES}.json`)?.rows ?? (load(dir, `screens_enja_deskphone_${HEROES}.json`)?.rows ?? []).filter((r) => r.lang === l);
    return rows.filter((r) => r.lang === l && r.vp === v);
  };
  for (const [l, v] of [['en', 'desk'], ['en', 'phone'], ['ja', 'desk'], ['ja', 'phone']]) {
    const b = scr(B, l, v), a = scr(A, l, v);
    row(['各畫面', `${LV[l]}｜${VP[v]}`, b.length ? JSON.stringify(tally(b)) : '—', a.length ? JSON.stringify(tally(a)) : '—']);
  }
  P();
}
