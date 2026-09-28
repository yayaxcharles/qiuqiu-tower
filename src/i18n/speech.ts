/**
 * 台詞、說話者名字、戰鬥紀錄的多語系顯示（2026-09-29 多語系第二片）。
 *
 * 引擎與劇本照舊產生**中文**（配音查表、畫面判斷、測試都靠它），這裡只在「要顯示」那一刻換成目前語言：
 * - 台詞：鍵是畫面上最後那句中文（`lineFor` 換過角色之後的），見 `LangPack.line`。
 * - 說話者：角色、旁白、店主走代號詞；魔物與關主照中文名反查 id 再換。
 * - 戰鬥紀錄：`engine/logfmt.ts` 記下的「句型＋參數」照目前語言重組；查不到事件的舊句子退回整句查表。
 */
import { enemies, enemyNameFor } from '../content/enemies';
import { cardById } from '../content/cards';
import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import { heroName, HEROES } from '../engine/hero';
import { logEvent, fill, type LogArg } from '../engine/logfmt';
import { currentPack, format, lineL, listJoin, moveLabelL, speakerL, t, term } from './index';
import { ENCOUNTER_MODIFIERS } from '../content/modifiers';
import { BOSS_PREFIXES } from '../engine/run';
import { cardName, enemyName, potionName, relicName } from './names';

/** 魔物中文名（含照角色換的鏡中名）→ [id, 角色] */
let byZh: Map<string, [string, string | undefined]> | null = null;
function enemyByZh(): Map<string, [string, string | undefined]> {
  if (!byZh) {
    byZh = new Map();
    for (const e of enemies) {
      byZh.set(e.name, [e.id, undefined]);
      for (const h of HEROES) { const n = enemyNameFor(e.id, h); if (!byZh.has(n)) byZh.set(n, [e.id, h]); }
    }
  }
  return byZh;
}

/**
 * 魔物在這一場的名字（可能帶「暴怒的」這類前綴、或影子鏈的變裝名）。
 * 前綴另外查介面文字表；整個名字查不到就當代號詞／台詞查，最後退回中文。
 */
export function enemyDisplay(id: string | undefined, zh: string): string {
  if (!currentPack()) return zh;
  const map = enemyByZh();
  const whole = map.get(zh);
  if (whole) return enemyName(whole[0], whole[1]);
  for (const [name, [eid, h]] of map) {
    if ((id === undefined || eid === id) && zh.length > name.length && zh.endsWith(name)) {
      return t(zh.slice(0, zh.length - name.length)) + enemyName(eid, h);
    }
  }
  return speakerL(zh);
}

/** 說話者名字（對白木牌、台詞泡泡、吐槽前面那個名字） */
export function speakerDisplay(zh: string): string {
  if (!zh || !currentPack()) return zh;
  const hit = currentPack()!.term[zh];
  return hit ?? (enemyByZh().has(zh) ? enemyDisplay(undefined, zh) : speakerL(zh));
}

/**
 * 魔物招式名。鏡中對手照你牌組學的那一招，中文名是「牌名、牌名（影分身）」現組的，
 * 這裡照 `learned` 重組：牌名照語言、括號裡的招牌（影分身、蓄氣）走代號詞。
 */
export function moveName(m: { label: string; learned?: readonly { cardId: string; upgraded: boolean }[] }, hero: string | undefined): string {
  if (!currentPack()) return m.label;
  if (!m.learned?.length) return moveLabelL(m.label);
  const names = m.learned.map((c) => { const d = cardById[c.cardId]; return (d ? cardName(d, hero) : c.cardId) + (c.upgraded ? '+' : ''); });
  const tags = /（([^（）]+)）$/.exec(m.label)?.[1]?.split('、') ?? [];
  return listJoin(names) + (tags.length ? ` (${listJoin(tags.map(term))})` : '');
}

/** 一句台詞 */
export const lineDisplay = lineL;

function argL(a: LogArg): string {
  if (typeof a === 'number') return String(a);
  if (typeof a === 'string') return a;
  if ('en' in a) return enemyDisplay(a.en, a.nm);
  if ('hero' in a && !('card' in a)) return term(heroName({ hero: a.hero }));
  if ('card' in a) { const d = cardById[a.card]; return (d ? cardName(d, a.hero) : a.card) + (a.up ? '+' : ''); }
  if ('relic' in a) { const r = relicById[a.relic]; return r ? relicName(r) : a.relic; }
  if ('potion' in a) { const p = potionById[a.potion]; return p ? potionName(p) : a.potion; }
  if ('st' in a) return term(a.st);
  if ('tx' in a) return t(a.tx);
  if ('say' in a) return lineL(a.say);
  return listJoin(a.ls.map(argL));
}

function render(zh: string): string | undefined {
  const ev = logEvent(zh);
  if (!ev) return undefined;
  const nums: Record<string, number> = {};
  for (const [k, v] of Object.entries(ev.p ?? {})) if (typeof v === 'number') nums[k] = v;
  return fill(format(t(ev.k), nums), ev.p, argL);   // 先填數字（英文單複數 `{n|a|b}` 在這一步挑），再填名字
}

/** 戰鬥紀錄的一行，照目前語言顯示 */
export function logLine(zh: string): string {
  if (!currentPack()) return zh;
  const hit = render(zh);
  if (hit !== undefined) return hit;
  // 開場白被前綴改名過的那幾行（`applyEncounterModifier`／`applyBossPrefix` 在句首補「暴怒的」）：前綴另外翻
  for (const label of new Set([...ENCOUNTER_MODIFIERS.map((m) => m.label), ...BOSS_PREFIXES.map((p) => p.label)])) {
    if (zh.startsWith(label)) { const rest = render(zh.slice(label.length)); if (rest !== undefined) return t(label) + rest; }
  }
  return t(zh);
}
