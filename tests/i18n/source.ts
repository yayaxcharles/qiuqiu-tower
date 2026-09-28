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
import { ACT_NAMES } from '../../src/engine/run';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.includes('/i18n/')) out.push(p);
  }
  return out;
}

/** 單引號字面值裡的跳脫（\' 與 \\）還原 */
function unquote(s: string): string { return s.replace(/\\(.)/g, (_m, c: string) => (c === 'n' ? '\n' : c)); }

/** 原始碼裡所有 `t('…')` 的鍵 → 出現在哪個檔 */
export function scannedUiKeys(root = 'src'): Map<string, string> {
  const keys = new Map<string, string>();
  const re = /(?<![\w.$])(?:t|N_|i18nT)\(\s*'((?:[^'\\\n]|\\.)*)'/g;
  for (const f of walk(root)) {
    const src = readFileSync(f, 'utf-8');
    for (const m of src.matchAll(re)) {
      const k = unquote(m[1]!);
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
