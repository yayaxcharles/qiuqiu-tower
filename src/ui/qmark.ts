import type { Hero } from '../engine/hero';
import { AMBUSH_BONUS_FISH, AMBUSH_FLEE_DAMAGE, QMARK_ART, QMARK_BASE, QMARK_CAP, QMARK_STEP, ambushAllowed, ambushOutcomes, qmarkChance } from '../engine/qmark';
import type { EventDef, MapNode, QmarkVariant, RunState } from '../engine/types';
import { eventById } from '../content/events';
import { artUrl } from './assets';
import { el } from './dom';

/*
 * ===== 問號格變化的畫面那一半（2026-09-23 內容擴充第三批，設計稿 design3 3-3）=====
 *
 * 引擎在 `chooseNode` 裡就擲好了（`engine/qmark.ts`）；這裡管三件事：
 *   1. 四隻的文字（`content/qmark-text.ts`）用到才下載，地圖畫面出來就在背景抓；
 *   2. 伏擊那一格組成一篇事件交給事件畫面（投票、結果、開打照一般事件走）；
 *   3. 揭曉那一拍：畫面中央的問號翻成那一種的圖示、上方一行橫幅。**0.4 秒、不擋點擊**——是換來的回饋，不是過場稅。
 * 這一支的字是系統口吻（不指名角色、不加喵）；角色講的話全在延後的那個模組裡。
 */

/** 上方那一行橫幅 */
export const QMARK_BANNER: Readonly<Record<QmarkVariant, string>> = {
  伏擊: '不是事件——有埋伏！',
  行腳商: '不是事件——遇到行腳商！',
  路邊紙箱: '不是事件——路邊有個紙箱！',
};
/** 伏擊的名牌與兩個選項（四隻共用；數字照引擎的常數組，改數字不用改兩處） */
export const AMBUSH_TITLE = '埋伏';
export const AMBUSH_LABELS: readonly [string, string] = [
  `迎戰（進入戰鬥，勝利後額外獲得 ${AMBUSH_BONUS_FISH} 條小魚乾）`,
  `甩掉牠們（最多失去 ${AMBUSH_FLEE_DAMAGE} 點生命）`,
];
/** 揭曉那一拍多長（翻面加淡出）；橫幅留久一點給人讀，但不擋任何東西 */
export const QMARK_REVEAL_MS = 400;

type QmarkTextModule = typeof import('../content/qmark-text');
let textMod: QmarkTextModule | null = null;
let loading: Promise<QmarkTextModule> | null = null;

/** 文字模組：同一時間只抓一次，失敗了下一次叫會重來（跟 `event-loader.ts` 同一個規矩） */
export function loadQmarkText(): Promise<QmarkTextModule> {
  if (textMod) return Promise.resolve(textMod);
  loading ??= import('../content/qmark-text').then((m) => { textMod = m; return m; }, (e: unknown) => { loading = null; throw e; });
  return loading;
}
/** 已經抓到的文字模組（還沒到就是 null，畫面退回橫幅那一句） */
export function qmarkText(): QmarkTextModule | null { return textMod; }

/** 這一位的那一份（新角色還沒寫就是 undefined，畫面退回橫幅那一句，不會講出別人的台詞） */
export function qmarkHeroText(hero: string | undefined): QmarkTextModule['QMARK_TEXT'][Hero] | undefined {
  return textMod?.QMARK_TEXT[(hero ?? 'ninja') as Hero];
}

/**
 * 伏擊那一格要演的事件：揭曉圖（`bg/event_q_ambush`，他版照 `eventArtKey`）、這一位的開頭、兩個選項。
 * 效果照引擎那一份（`ambushOutcomes`），所以兩台、機器人跑的是同一串；文字照本機這一位挑，連線混搭各看各的。
 */
export function ambushEvent(node: MapNode, hero: string | undefined): EventDef {
  const t = qmarkHeroText(hero);
  const [fight, flee] = ambushOutcomes(node);
  return {
    id: QMARK_ART['伏擊'], title: AMBUSH_TITLE, text: t?.ambush.text ?? QMARK_BANNER['伏擊'],
    choices: [
      { label: AMBUSH_LABELS[0], outcome: fight, result: t?.ambush.results[0] ?? '' },
      { label: AMBUSH_LABELS[1], outcome: flee, result: t?.ambush.results[1] ?? '' },
    ],
  };
}

/** 揭曉那一拍翻成什麼：交叉的爪（戰鬥節點那張）＝伏擊、行腳商本人＝行腳商、紙箱節點那張＝路邊紙箱 */
const REVEAL_ICON: Readonly<Record<QmarkVariant, readonly ['icons' | 'sprites', string]>> = {
  伏擊: ['icons', 'icon/node_fight'], 行腳商: ['sprites', 'shop/merchant'], 路邊紙箱: ['icons', 'icon/node_chest'],
};

/**
 * 揭曉一拍：疊層中央一張問號卡翻面、上方一行橫幅。掛在疊層（不是畫面層）：連線時同伴一投票畫面就安靜重畫，不會把它拔掉。
 * 整塊 `pointer-events: none`，翻的那 0.4 秒也點得到底下的選項；兩秒後自己拆掉。
 */
export function playQmarkReveal(layer: HTMLElement, variant: QmarkVariant): HTMLElement {
  layer.querySelector('.qmark-reveal')?.remove();
  const [group, key] = REVEAL_ICON[variant];
  const url = artUrl(group, key);
  // 外層管淡出、內層管翻面：翻面那一層不能動不透明度，不然會被壓平、背面翻不出來（樣式表那一段有說明）
  const node = el('div', { class: 'qmark-reveal', 'data-variant': variant },
    el('div', { class: 'qmark-flip' },
      el('div', { class: 'qmark-card' },
        el('div', { class: 'qmark-face front' }, '？'),
        el('div', { class: 'qmark-face back' }, url.startsWith('data:') ? '' : el('img', { src: url, alt: '' })))),
    el('div', { class: 'qmark-banner' }, QMARK_BANNER[variant]));
  layer.append(node);
  window.setTimeout(() => node.remove(), 2000);
  return node;
}

/**
 * 地圖上問號格的說明（主控裁決第 3 條：**寫出目前機率**，透明、不讓人覺得被騙）。
 * 只講整局共通的那個數，不講「這一格會不會變」——哪幾格是後集、鏈、稀有事件要走進去才知道，寫出來就劇透了。
 * 走過、變過的那一格改講它變成了什麼（地圖上那格也換成實際的圖示，見 `screens/map.ts`）。
 */
export function qmarkTip(run: RunState, n: MapNode): { title: string; body: string } {
  if (n.variant) return { title: `問號格：${n.variant}`, body: `這一格原本是問號格，走進去變成了${n.variant}。` };
  if (n.eventId && eventById[n.eventId]?.fixedFloor !== undefined) return { title: '問號格', body: '這一層是固定的事件，不會變。' };
  const pct = (p: number): number => Math.round(p * 100);
  return {
    title: '問號格',
    body: `通常是事件，偶爾會是伏擊、行腳商或路邊紙箱。現在走進問號格，約 ${pct(qmarkChance(run))}% 會變`
      + `（每遇到一次一般事件多 ${pct(QMARK_STEP)}%、最多 ${pct(QMARK_CAP)}%，變過就回到 ${pct(QMARK_BASE)}%）。`
      + (ambushAllowed(run, n) ? '' : '這一格不會是伏擊。'),
  };
}
