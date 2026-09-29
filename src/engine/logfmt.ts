/**
 * 戰鬥紀錄的「事件＋參數」（2026-09-29 多語系第二片）。
 *
 * 引擎寫一筆紀錄＝一個**中文句型**（鍵，帶 `{名稱}` 參數）＋參數。參數存的是代號（魔物 id、角色、牌號、秘寶 id、狀態名），
 * 不存翻好的字，所以兩台連線的電腦各自照自己的語言顯示（紀錄本來就是各自跑引擎算出來的，網路上只傳動作）。
 *
 * `cs.log` 照舊是**一字不差的中文**（畫面上好幾處照中文句子判斷要飄什麼字、測試也照它斷言），
 * 同一句中文對應的事件記在下面的對照表，畫面要顯示時用 `logEvent(那一句)` 查回來、照目前語言重組。
 * 對照表以句子為鍵，所以紀錄被切短、複製、還原（預覽、連線重播）都不會對錯位。
 */
import { cardNameFor, cardById } from '../content/cards';
import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import { unitName, type Hero } from './hero';
import type { CombatState } from './types';

/** 一個參數：數字、原樣字串（不必翻，例如數字組成的字）或帶代號的東西 */
export type LogArg =
  | number
  | string
  /** 魔物：id＋這一場的名字（可能帶「暴怒的」這類前綴或變裝名） */
  | { en: string; nm: string }
  /** 角色（玩家那一位） */
  | { hero: Hero | undefined }
  /** 牌：牌號＋誰的牌名（角色專屬牌名）＋有沒有升級（中文尾巴「＋」） */
  | { card: string; hero?: Hero | undefined; up?: boolean }
  | { relic: string }
  | { potion: string }
  /** 中文當代號的詞：狀態名、關鍵字（畫面用 term() 翻） */
  | { st: string }
  /** 一小段要翻的中文（畫面用 t() 翻） */
  | { tx: string }
  /** 一句台詞（畫面用台詞表翻） */
  | { say: string }
  /** 一小段帶參數的句型（畫面用 t() 翻、再填自己的參數；例：「{n} 點{st}」） */
  | { sub: string; p: Readonly<Record<string, LogArg>> }
  /** 一串東西，中文用「、」接（`sep` 可換成「與」之類；英日照語言自己接） */
  | { ls: LogArg[]; sep?: string };

export interface LogEv { k: string; p?: Readonly<Record<string, LogArg>> }

/** 參數的中文（跟改版前寫死在句子裡的一模一樣） */
export function argZh(a: LogArg): string {
  if (typeof a === 'number' || typeof a === 'string') return String(a);
  if ('en' in a) return a.nm;
  if ('hero' in a && !('card' in a)) return unitName({ hero: a.hero });
  if ('card' in a) { const d = cardById[a.card]; return (d ? cardNameFor(d, a.hero) : a.card) + (a.up ? '＋' : ''); }
  if ('relic' in a) return relicById[a.relic]?.name ?? a.relic;
  if ('potion' in a) return potionById[a.potion]?.name ?? a.potion;
  if ('st' in a) return a.st;
  if ('tx' in a) return a.tx;
  if ('say' in a) return a.say;
  if ('sub' in a) return fill(a.sub, a.p, argZh);
  return a.ls.map(argZh).join(a.sep ?? '、');
}

/** 句型填參數（`{名稱}` 換成參數；找不到的原樣留著） */
export function fill(k: string, p: Readonly<Record<string, LogArg>> | undefined, show: (a: LogArg) => string): string {
  if (!p) return k;
  return k.replace(/\{(\w+)\}/g, (m, name: string) => (p[name] === undefined ? m : show(p[name]!)));
}

const byLine = new Map<string, LogEv>();
const MAX = 4000;
/** 記下「這句中文是哪個事件」，舊的超過上限就丟（畫面只顯示最後幾行） */
export function remember(line: string, ev: LogEv): void {
  byLine.delete(line);
  byLine.set(line, ev);
  if (byLine.size > MAX) byLine.delete(byLine.keys().next().value!);
}
/** 這句中文紀錄的事件（查不到＝還沒結構化的舊句子，畫面照中文顯示） */
export function logEvent(line: string): LogEv | undefined { return byLine.get(line); }

/** 寫一筆紀錄：`k` 是中文句型（也是翻譯的鍵），`p` 是參數。回傳寫進去的那句中文 */
export function log(cs: CombatState, k: string, p?: Readonly<Record<string, LogArg>>): string {
  const line = fill(k, p, argZh);
  if (p) remember(line, { k, p });
  cs.log.push(line);
  return line;
}

/**
 * 畫面上「實際發生了什麼」的提示（事件結果、祝福、走進格子）：跟戰鬥紀錄同一套。
 * 中文句子照舊放進 `notes`（畫面上好幾處照它判斷），句型與參數另外記下，畫面用 `logLine(那一句)` 照語言顯示。
 */
export function note(notes: string[] | undefined, k: string, p?: Readonly<Record<string, LogArg>>): void {
  if (!notes) return;
  const line = fill(k, p, argZh);
  if (p) remember(line, { k, p });
  notes.push(line);
}

/** 魔物參數的簡寫 */
export const E = (e: { enemyId: string; name: string }): LogArg => ({ en: e.enemyId, nm: e.name });
/** 角色參數的簡寫 */
export const H = (p: { hero?: Hero | undefined }): LogArg => ({ hero: p.hero });

/** 只是標記「這段中文要翻」（給缺譯掃描看），原樣回傳；用在 `{ tx: K_('…') }` 或 `log(cs, 條件 ? K_('甲') : K_('乙'))` */
export const K_ = (zh: string): string => zh;
