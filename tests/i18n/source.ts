/**
 * 多語系要翻的中文原文（抽取腳本與缺譯檢查共用）。
 *
 * - `uiKeys()`：原始碼裡 `t('…')` 的第一個參數（一定是單引號字面值，見 `src/i18n/index.ts`），外加幾組「引擎產生、畫面顯示」的動態句。
 * - `contentSource()`：牌名（含角色專屬牌名）、秘寶、忍具、魔物、招式名、代號詞、名詞說明。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { cards, cardNameFor } from '../../src/content/cards';
import { enemies, enemyNameFor } from '../../src/content/enemies';
import { glossary } from '../../src/content/glossary';
import { potions } from '../../src/content/potions';
import { PURIFY_CHANGE, RELIC_SETS, relics } from '../../src/content/relics';
import { HEROES } from '../../src/engine/hero';
import { DEBUFFS } from '../../src/engine/types';
import { DIFFICULTY_NAMES } from '../../src/content/difficulty';
import { KEEPERS } from '../../src/content/keepers';
import { ACT_NAMES, BOSS_PREFIXES } from '../../src/engine/run';
import * as dialogueMod from '../../src/content/dialogue';
import * as fengfengMod from '../../src/content/fengfeng-dialogue';
import * as coopPairMod from '../../src/content/coop-pair-text';
import * as echoesMod from '../../src/content/victory-echoes';
import { fillEcho } from '../../src/content/victory-echoes';
import * as purifyMod from '../../src/content/purify-text';
import { castLineFor, lineFor } from '../../src/content/dialogue';
import { encounters, encounterSkin, enemySkin } from '../../src/content/enemies';
import { events } from '../../src/content/events';
import * as eventTextMod from '../../src/content/event-text';
import * as eventTextB2Mod from '../../src/content/event-text-b2';
import * as eventTextB3Mod from '../../src/content/event-text-b3rare';
import { eventTextFor } from '../../src/content/event-text';
import * as qmarkTextMod from '../../src/content/qmark-text';
import * as shopTextMod from '../../src/content/shop-text';
import * as blessingTextMod from '../../src/content/blessing-text';
import { blessTakeLine } from '../../src/content/blessing-text';
import { BLESSINGS } from '../../src/content/blessings';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && (!p.includes('/i18n/') || /\/i18n\/(names|speech)\.ts$/.test(p))) out.push(p);
  }
  return out;
}

/** 單引號字面值裡的跳脫（\' 與 \\）還原 */
function unquote(s: string): string { return s.replace(/\\(.)/g, (_m, c: string) => (c === 'n' ? '\n' : c)); }

/**
 * 戰鬥紀錄的句型：`log(cs, 句型, { … })` 的第二個參數（`engine/logfmt.ts`，畫面用 `t(句型)` 照語言顯示）。
 * 句型可能是單一字面值、`K_('…')`，也可能是 `mate === p ? '甩掉了{ls}' : '幫對方拍掉了{ls}'` 這種二選一，
 * 所以掃到第二個參數結束為止，把裡面每個單引號字面值都收進來。
 */
export function logTemplates(source: string): string[] {
  const out: string[] = [];
  const src = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // 註解裡的範例不算
  for (const m of src.matchAll(/(?<![\w.$])(?:log|note)\(\s*\w+\s*,/g)) {
    let i = m.index! + m[0].length;
    let depth = 0;
    let expr = '';
    for (; i < src.length; i++) {
      const c = src[i]!;
      if (c === "'") {
        let j = i + 1;
        while (j < src.length && src[j] !== "'") j += src[j] === '\\' ? 2 : 1;
        expr += src.slice(i, j + 1);
        i = j;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) break;
      expr += c;
    }
    for (const q of expr.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) out.push(unquote(q[1]!));
  }
  return out;
}

/** 原始碼裡所有 `t('…')` 的鍵 → 出現在哪個檔 */
export function scannedUiKeys(root = 'src'): Map<string, string> {
  const keys = new Map<string, string>();
  const re = /(?<![\w.$])(?:t|N_|i18nT)\(\s*'((?:[^'\\\n]|\\.)*)'/g;
  for (const f of walk(root)) {
    const src = readFileSync(f, 'utf-8');
    const found = [...src.matchAll(re)].map((m) => unquote(m[1]!));
    found.push(...logTemplates(src));
    // 抽獎那一格的提示（`note(notes, row.tier)`）與紀錄參數裡的小句型（`{ sub: '…' }`、`{ tx: '…' }`）：字面值直接收
    for (const m of src.matchAll(/\b(?:tier|sub|tx):\s*'((?:[^'\\\n]|\\.)*)'/g)) found.push(unquote(m[1]!));
    for (const k of found) {
      if (/[　-鿿＀-￯]/.test(k) && !keys.has(k)) keys.set(k, f);
    }
  }
  return keys;
}

/** 引擎或內容產生、畫面拿去 `t(x) // i18n-dynamic` 的句子 */
export function dynamicUiKeys(): string[] {
  const out = new Set<string>();
  for (const ch of Object.values(PURIFY_CHANGE)) { for (const s of [...ch.good, ...ch.bad, ch.gist]) out.add(s); }
  for (const s of Object.values(RELIC_SETS)) out.add(s.text);
  for (const c of cards) if (c.note) out.add(c.note);   // 牌的來歷（英日產生器用 t() 查）
  // 引擎 `canPlay` 的拒絕理由（`reason: '…'`）與其他標了 i18n-dynamic 來源的檔
  for (const f of ['src/engine/combat.ts', 'src/content/potions.ts']) {
    const src = readFileSync(f, 'utf-8');
    for (const m of src.matchAll(/reason: '((?:[^'\\\n]|\\.)*)'/g)) out.add(unquote(m[1]!));
  }
  out.add('集中精神之後，這回合不能再獲得飯糰');
  out.add('手上沒有牌可以換');
  out.add('他'); out.add('她');
  // 紀錄參數裡的小句型（`{ sub, p }`、`{ tx }`，`engine/combat.ts`、`engine/actions.ts`）：掃不到 `log(` 的字面值
  out.add('{n} 點{st}'); out.add('一半的中毒');
  // 下一場戰鬥開始時的效果那一句（`run.ts` 的 `nextFight`）：三元運算式裡的字面值掃不到
  out.add('，給全體魔物{ls}'); out.add('給全體魔物{ls}');
  // 連線事件的稱呼（`event-text-b2.ts` 的 `CALL`）與同角色配對時的說法：畫面層用 `callL` 翻
  for (const s of ['師兄', '師妹', '同伴']) out.add(s);
  // 用三元運算式先組成 `const k = …` 再交給 `log`、掃不到的句型（`engine/combat.ts` 的上回合飯糰、套組第一回合飯糰）
  for (const s of ['上一回合留下的飯糰：多 {n} 顆', '{who}上一回合留下的飯糰：多 {n} 顆', '{set}套組：第一回合多 {n} 顆飯糰', '{who}的{set}套組：第一回合多 {n} 顆飯糰']) out.add(s);
  // 挑牌視窗標題（`deckview.ts`、`screens/blessing.ts`）：`t(至多 ? 'A' : 'B')` 的三元運算式掃不到
  for (const s of ['選 {n} 張牌{verb}', '最多選 {n} 張牌{verb}', '選 {max} 張牌{verb}（不選＝回去看包袱裡的其他東西）', '最多選 {max} 張牌{verb}（不選＝回去看包袱裡的其他東西）']) out.add(s);
  // 旗標型條件的理由（`event-text-b2.ts` 的 `FLAG_WHY`，畫面用 `t(why)` 取）
  out.add('替爺爺寫過回信'); out.add('躲著看它練過招');
  // 秘寶發動那一行的句型是 `relicLine` 現組的（`engine/actions.ts`），掃不到字面值
  for (const own of ['{who}（{seat} 號）的秘寶發動：{list}', '秘寶發動：{list}']) { out.add(own); out.add(`${own}…等 {n} 件`); }
  // 整檔都是給畫面看的短句（錯誤訊息、難度說明、店主招牌、戰鬥變化）：每個含中文的單引號字面值都算
  for (const f of ['src/engine/sharecode.ts', 'src/net/rtc.ts', 'src/net/ws.ts', 'src/net/code.ts', 'src/net/session.ts',
    'src/content/modifiers.ts', 'src/content/keepers.ts', 'src/content/difficulty.ts']) {
    const src = readFileSync(f, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
      const k = unquote(m[1]!);
      if (/[一-鿿]/.test(k)) out.add(k);
    }
  }
  for (const k of Object.values(KEEPERS)) out.delete(k.name);
  for (const d of DIFFICULTY_NAMES) out.delete(d);
  return [...out];
}

export function uiKeys(): string[] {
  return [...new Set([...scannedUiKeys().keys(), ...dynamicUiKeys()])];
}

const STATUS_NAMES = ['爪力', '貓步', '翻肚', '懶洋洋', '炸毛', '中毒', '隱身', '定身', '反彈', '潛水',
  '縮殼', '飛行', '鱗甲', '沉睡', '消散', '虛化', '不壞身', '鐵布衫', '迷魂', '蓄氣', '蜷縮', '防禦'];

export interface ContentSource {
  term: Record<string, string>;
  gloss: Record<string, string>;
  card: Record<string, string>;
  relic: Record<string, [string, string]>;
  potion: Record<string, [string, string]>;
  enemy: Record<string, string>;
  move: Record<string, string>;
}

export function contentSource(): ContentSource {
  const term: Record<string, string> = {};
  const add = (s: string): void => { term[s] = s; };
  [...STATUS_NAMES, ...DEBUFFS, ...Object.keys(glossary),
    '消耗', '保留', '不可打出', '虛幻',
    '常見', '罕見', '稀有', '攻擊', '技能', '能力',
    '起手', '忍術', '絕學', '壞毛病',
    '起始', '大魔物', '塔主', '罐頭鋪', '事件', '戰鬥', '貓窩', '紙箱',
    '球球', '菲菲', '噹噹', '封封', '師門',
    '磨爪', '磨針', '調護臂', '磨劍', '伏擊', '行腳商', '路邊紙箱',
    ...DIFFICULTY_NAMES, ...ACT_NAMES, '暗器', '拳腳', '劍術', '攻', '守', '強', '弱', '召', '秘寶', '忍具',
    '安全', '換牌', '代價', '賭運氣', '升級', '移除', '換成新的', '雙人', ...Object.values(KEEPERS).map((k) => k.name),
  ].forEach(add);
  // 影子鏈那場的名牌「球球的影子」等（`encounterSkin`）：戰鬥紀錄的說話者用它，走代號詞表（`speakerL`）
  for (const enc of encounters) for (const id of enc.enemies) for (const h of HEROES) { const s = encounterSkin(enc, id, h); if (s) add(s.name); }
  const gloss: Record<string, string> = { ...glossary };
  const card: Record<string, string> = {};
  for (const c of cards) {
    card[c.id] = c.name;
    for (const h of HEROES) {
      const n = cardNameFor(c, h);
      if (n !== c.name) card[`${h}:${c.id}`] = n;
    }
  }
  const relic: Record<string, [string, string]> = {};
  for (const r of relics) relic[r.id] = [r.name, r.text];
  const potion: Record<string, [string, string]> = {};
  for (const p of potions) potion[p.id] = [p.name, p.text];
  const enemy: Record<string, string> = {};
  const move: Record<string, string> = {};
  for (const e of enemies) {
    enemy[e.id] = e.name;
    for (const h of HEROES) {
      const n = enemyNameFor(e.id, h);
      if (n !== e.name) enemy[`skin:${h}:${e.id}`] = n;
    }
    const allMoves = [...e.moves, ...(e.phases ?? []).flatMap((ph) => [...ph.moves, ...(ph.onEnterMove ? [ph.onEnterMove] : [])])];
    for (const m of allMoves) move[m.label] = m.label;
  }
  return { term, gloss, card, relic, potion, enemy, move };
}

/** 把一個值（物件、陣列、字串）裡所有含中文的字串收進 `out` */
function collectZh(v: unknown, out: Set<string>, seen = new WeakSet<object>()): void {
  if (typeof v === 'string') { if (/[一-鿿]/.test(v)) out.add(v); return; }
  if (!v || typeof v !== 'object' || seen.has(v as object)) return;
  seen.add(v as object);
  for (const x of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) collectZh(x, out, seen);
}

/**
 * 台詞（劇情、過場、戰鬥吐槽、魔物開場白與台詞泡泡、幻燈片、結局伏筆）：畫面上**最後顯示的那一句中文** → 譯文。
 * 鍵是換過角色之後的句子（`lineFor`／`castLineFor` 的輸出），所以每位角色各自有一整句，英日不必再做「拿掉句尾喵」這種中文構詞。
 * 收法寧多勿少：劇本模組匯出的每一句，加上每一句給四位角色各過一次 `lineFor`／`castLineFor` 的結果。
 */
export function lineSource(): string[] {
  const raw = new Set<string>();
  for (const mod of [dialogueMod, fengfengMod, coopPairMod, echoesMod]) collectZh(mod, raw);
  for (const e of enemies) collectZh([e.line, e.lines ?? []], raw);
  collectZh([encounters.map((enc) => enc.reinforce?.map((r) => r.line)), BOSS_PREFIXES.map((p) => p.line)], raw);   // 援兵登場句、關主前綴那一句（不收整個 encounters，會連「弱／中／強」這種分類標籤都抓進來）
  for (const enc of encounters) for (const id of enc.enemies) for (const h of HEROES) {
    const s = encounterSkin(enc, id, h) ?? enemySkin(id, h);
    if (s) collectZh([s.line, s.lines], raw);
  }
  collectZh([purifyMod.PURIFY_NARRATION, purifyMod.TORTOISE_PURIFY_LINE, ...HEROES.map((h) => purifyMod.purifyLine(h))], raw);
  // 畫面程式裡直接寫死、再交給 lineFor 的那幾句（戰鬥「有伏兵跳出來了喵！」之類），以及標了 L_ 的
  for (const f of walk('src/ui')) {
    for (const m of readFileSync(f, 'utf-8').matchAll(/(?:lineFor\([^,()]+(?:\([^()]*\))?,|L_\()\s*'((?:[^'\\\n]|\\.)*)'/g)) raw.add(unquote(m[1]!));
  }
  const out = new Set(raw);
  for (const s of raw) for (const h of HEROES) { out.add(lineFor(h, s)); out.add(castLineFor(h, s)); }
  // 結局伏筆的共用句帶 `{名}`、`{師}`：畫面上顯示的是換過主角名字的整句，所以鍵收換完的、範本本身不收
  for (const s of raw) {
    if (!/\{[名師]\}/.test(s)) continue;
    out.delete(s);
    for (const h of HEROES) out.add(fillEcho(s, h));
  }
  return [...out].filter((s) => /[一-鿿]/.test(s));
}

/** 給譯者看的：每句是誰講的（劇本裡 `{ speaker, text }` 那種；換過角色的句子記成那位角色） */
export function lineSpeakers(): Record<string, string> {
  const who: Record<string, string> = {};
  const seen = new WeakSet<object>();
  const walkObj = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v as object)) return;
    seen.add(v as object);
    const o = v as { speaker?: unknown; text?: unknown };
    if (typeof o.speaker === 'string' && typeof o.text === 'string') {
      who[o.text] ??= o.speaker;
      if (o.speaker === '球球') for (const h of HEROES) who[lineFor(h, o.text)] ??= ({ ninja: '球球', feifei: '菲菲', dangdang: '噹噹', fengfeng: '封封' } as Record<string, string>)[h]!;
      else for (const h of HEROES) who[castLineFor(h, o.text)] ??= o.speaker;
    }
    for (const x of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) walkObj(x);
  };
  for (const mod of [dialogueMod, fengfengMod, coopPairMod, echoesMod]) walkObj(mod);
  return who;
}

/**
 * 隨機事件的文案（第三片，2026-09-29）：畫面上**最後顯示的那一句中文** → 譯文（跟台詞一樣照最後那句查）。
 * 收法：事件資料本身（標題、開場、按鈕標籤、結果——球球的原句），加上四份角色對照表、條件提示、抽獎後句、
 * 鏡子走廊表的每個值，再把球球原句給四位主角各過一次 `eventTextFor`（換名字、換引號那條路）。
 * 帶 `{同伴}`／`{稱}`／`{對方}` 的連線句照原樣收（畫面層先翻、再填稱呼，見 `i18n/speech.ts` 的 `callL／coopFill(…, loc)`）。
 */
export function eventSource(): string[] {
  const originals = new Set<string>();
  for (const ev of events) {
    collectZh([ev.title, ev.text, ev.choices.map((c) => [c.label, c.result, c.requiresLabel ?? ''])], originals);
  }
  const raw = new Set(originals);
  for (const mod of [eventTextMod, eventTextB2Mod, eventTextB3Mod]) collectZh(mod, raw);
  // 問號格的行腳商與伏擊、罐頭鋪的客座店主、開局祝福（名字、卡面、開場、選完的那一句）：同樣是「最後那句中文」
  for (const mod of [qmarkTextMod, shopTextMod, blessingTextMod]) collectZh(mod, raw);
  for (const def of BLESSINGS) for (const h of HEROES) raw.add(blessTakeLine(def.id, def.cls, h));
  const out = new Set(raw);
  for (const s of originals) for (const h of HEROES) out.add(eventTextFor(h, s));
  return [...out].filter((s) => /[一-鿿]/.test(s));
}
