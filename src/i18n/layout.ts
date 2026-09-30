/*
 * 英日才用得到的版面退讓（2026-10-01 審查後從首載搬出來）。
 *
 * 事件文字讓位、祝福旁白讓位、牌名換行與牌圖讓高度、魔物意圖牌與名字牌縮字——繁中量過放得下、明擺著跳過，
 * 所以這些量版面的程式不放首載：英文、日文語言包載入時 `import './layout'`，在 `layoutHooks`（`src/ui/layouthooks.ts`）上掛好，
 * 首載那邊只留空位（`layoutHooks.xxx?.()`）。流程（純判斷）在 `src/ui/*fit.ts`，這裡只有「怎麼量、怎麼改」的轉接器。
 * 每一支都冪等（先還原再量），並登記轉向重量（`watchLayout`）：手機直拿時不量，轉橫後由 `app.ts` 叫 `relayout()` 重跑。
 */
import { layoutHooks, layoutOk, watchLayout } from '../ui/layouthooks';
import { getLang } from './index';
import { runSceneFit, SCENE_BOX_LIMIT, SCENE_FIT_LEVELS, type SceneAdapter } from '../ui/scenefit';
import { BLESS_CLASS_LEVELS, BLESS_GAP, runBlessFit, type BlessAdapter } from '../ui/blessfit';
import { fitIntentWidth, fitNameWidth, INTENT_MAX_W, type LabelAdapter } from '../ui/labelfit';
import { runNameWrap, runTextSpace } from '../ui/cardfit';
import { hudClassesFor, hudShortfall, runHudFit, type HudAdapter } from '../ui/hudfit';
import { tipTop } from '../ui/tippos';

/** 舞台目前被縮放多少倍（`#stage` 身上那個 `transform: scale()`） */
function stageScale(): number {
  const w = document.getElementById('stage')?.getBoundingClientRect().width ?? 0;
  return w > 0 ? w / 1280 : 1;
}

/** 對白框彈入動畫（從下面 26 像素滑上來）播的時候量到的框比實際低：扣掉現在的位移（同 `refitGoods`） */
function lift(box: HTMLElement): number {
  const t = getComputedStyle(box).transform;
  return t && t !== 'none' && typeof DOMMatrixReadOnly === 'function' ? new DOMMatrixReadOnly(t).m42 : 0;
}

// ---- 狀態列（高-1、高-2）：繁中也會用（狀態列放不下是三個語系共同的問題）----
function fitHud(hud: HTMLElement, relics: HTMLElement, moreBtn: (n: number) => HTMLElement, total: number): void {
  const crowded0 = hud.classList.contains('crowded');
  const removed: HTMLElement[] = [];
  const hp = hud.querySelector<HTMLElement>('.hud-hp');
  const adapter: HudAdapter = {
    reset: () => {
      hud.classList.remove('t-icons', 't-short');
      hud.classList.toggle('crowded', crowded0);
      if (removed.length) {
        relics.querySelector('.hud-relic-more')?.remove();
        while (removed.length) relics.append(removed.pop()!);
        if (total > 8) relics.append(moreBtn(total - 8));
      }
    },
    apply: (l) => { for (const c of hudClassesFor(l)) hud.classList.add(c); },
    shortfall: () => {
      let last: HTMLElement | undefined;
      for (let i = hud.children.length - 1; i >= 0 && !last; i--) { const c = hud.children[i] as HTMLElement; if (c.offsetWidth > 0) last = c; }
      return hudShortfall(last ? last.offsetLeft + last.offsetWidth : 0, hp?.offsetWidth ?? 0, hp?.querySelector<HTMLElement>('span')?.offsetWidth ?? 0);
    },
    drop: () => {
      const icons = relics.querySelectorAll<HTMLElement>('.hud-relic');
      const tail = icons[icons.length - 1];
      if (!tail) return false;
      tail.remove();
      removed.push(tail);
      relics.querySelector('.hud-relic-more')?.remove();
      relics.append(moreBtn(total - icons.length + 1));
      return true;
    },
  };
  const run = (): void => {
    if (!layoutOk()) return;   // 手機直拿時手機橫拿專用的樣式沒套上，量到的不作數；轉橫後 `relayout` 再量
    if (!hud.isConnected) {
      // 戰鬥整頁重畫是先把整個 `.combat` 組好、狀態列還在游離的節點裡才掛上去：排一個微任務（同一段程式跑完、下一格畫面前）再量
      if (typeof queueMicrotask === 'function') queueMicrotask(() => { if (hud.isConnected) run(); });
      return;
    }
    runHudFit(adapter);
  };
  watchLayout(hud, run);
  run();
}

// ---- 事件文字讓位（中-1）----
function sceneAdapter(scene: HTMLElement, box: HTMLElement, text: HTMLElement): SceneAdapter {
  const k = (): number => stageScale();
  return {
    reset: () => {
      for (let i = 1; i <= SCENE_FIT_LEVELS; i++) scene.classList.remove(`text-fit-${i}`);
      scene.classList.remove('text-scroll');
      text.style.removeProperty('max-height');
    },
    boxTop: () => (box.getBoundingClientRect().top - scene.getBoundingClientRect().top) / k() - lift(box),
    setLevel: (l) => { for (let i = 1; i <= SCENE_FIT_LEVELS; i++) scene.classList.toggle(`text-fit-${i}`, i <= l); },
    textHeight: () => text.offsetHeight,
    scroll: (h) => { scene.classList.add('text-scroll'); text.style.maxHeight = `${h}px`; },
  };
}

function fitSceneText(scene: HTMLElement, box: HTMLElement, limit: number = SCENE_BOX_LIMIT): void {
  const text = box.querySelector<HTMLElement>('.scene-text');
  if (!text) return;
  const a = sceneAdapter(scene, box, text);
  if (getLang() === 'zh') { a.reset(); return; }   // 繁中的排法今天就是這樣，不動
  runSceneFit(a, limit);
}

/** 中間放的是牌或獲得物展示（不是事件插圖）時，對白框的字也不能壓到那一塊：框頂要在那一塊底邊往上 28 以內（透明漸層那段算設計） */
const SHOWCASE_OVERLAP = 28;
function fitShowcaseText(scene: HTMLElement, box: HTMLElement): void {
  if (scene.querySelector('img.event-art') || !scene.querySelector('.scene-art > .reward-cards, .scene-art > .showcase')) return;
  const run = (): void => {
    if (!scene.isConnected || !layoutOk()) return;
    const art = scene.querySelector<HTMLElement>('.scene-art');
    if (!art) return;
    fitSceneText(scene, box, (art.getBoundingClientRect().bottom - scene.getBoundingClientRect().top) / stageScale() - SHOWCASE_OVERLAP);
  };
  watchLayout(scene, run);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else run();
}

// ---- 開局祝福旁白讓位（高-4）----
function measureBlessOverlap(scene: HTMLElement): number {
  const box = scene.querySelector<HTMLElement>('.scene-box');
  const stage = scene.querySelector<HTMLElement>('.bless-stage');
  if (!box || !stage) return 0;
  const k = stageScale();
  let cardsBottom = -Infinity;
  for (const e of stage.querySelectorAll('.bless-card, .bless-mate')) cardsBottom = Math.max(cardsBottom, e.getBoundingClientRect().bottom);
  const first = box.querySelector<HTMLElement>('.dialogue-speaker:not(:empty), .scene-text');
  if (cardsBottom === -Infinity || !first) return 0;
  let top = Infinity;
  const range = document.createRange();
  range.selectNodeContents(first);
  for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) top = Math.min(top, r.top);
  if (top === Infinity) top = first.getBoundingClientRect().top;
  return (cardsBottom - (top - lift(box) * k)) / k + BLESS_GAP;
}

function fitBlessing(scene: HTMLElement): void {
  const row = scene.querySelector<HTMLElement>('.bless-row');
  if (!row || getLang() === 'zh') return;   // 繁中旁白兩行、量過留得下，不走
  const a: BlessAdapter = {
    reset: () => { row.style.removeProperty('scale'); for (let i = 1; i <= BLESS_CLASS_LEVELS; i++) scene.classList.remove(`bless-fit-${i}`); },
    setLevel: (l) => { for (let i = 1; i <= BLESS_CLASS_LEVELS; i++) scene.classList.toggle(`bless-fit-${i}`, i <= l); },
    overlap: () => measureBlessOverlap(scene),
    rowHeight: () => row.getBoundingClientRect().height / stageScale(),
    scaleRow: (s) => { row.style.scale = String(Math.floor(s * 1000) / 1000); },
  };
  const run = (): void => { if (scene.isConnected && layoutOk()) runBlessFit(a); };
  watchLayout(scene, run);
  run();
}

// ---- 意圖牌與名字牌（中-6、中-7）----
function fitIntent(n: HTMLElement): void {
  // 還原：縮字、省略號那層都拿掉
  n.style.removeProperty('font-size');
  const ell = n.firstElementChild;
  if (ell?.classList.contains('ell')) { ell.replaceWith(...ell.childNodes); }
  if (n.offsetWidth <= INTENT_MAX_W) return;
  const a: LabelAdapter = { baseSize: parseFloat(getComputedStyle(n).fontSize) || 14, width: () => n.offsetWidth, setSize: (px) => { n.style.fontSize = `${px}px`; } };
  if (!fitIntentWidth(a)) return;
  // 縮到下限還放不下：牌子裡包一層 span 做省略號，牌子本身保持可見溢出（紅光圈、落影是牌子的偽元素，牌子一裁切就被切掉）
  const cs = getComputedStyle(n);
  const chrome = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  const wrap = document.createElement('span');
  wrap.className = 'ell';
  wrap.style.cssText = `display:block;overflow:hidden;text-overflow:ellipsis;max-width:${INTENT_MAX_W - chrome}px`;
  wrap.append(...n.childNodes);
  n.append(wrap);
}

function fitName(n: HTMLElement): void {
  n.style.removeProperty('height');
  n.style.removeProperty('line-height');
  n.style.removeProperty('font-size');
  if (n.scrollWidth <= n.clientWidth + 0.5) return;
  // 先把高度與行高釘成現在的值，再縮字：名字變矮立繪就會往下掉
  const h = n.offsetHeight;
  n.style.height = `${h}px`;
  n.style.lineHeight = `${h}px`;
  fitNameWidth({ baseSize: parseFloat(getComputedStyle(n).fontSize) || 15, width: () => n.scrollWidth, setSize: (px) => { n.style.fontSize = `${px}px`; } }, n.clientWidth);
}

function fitUnitLabels(field: ParentNode): void {
  if (getLang() === 'zh') return;   // 繁中量過（桌機最寬 179、手機橫拿最寬 196，名字都在框內），明擺著跳過
  const run = (): void => {
    if (!layoutOk()) return;
    for (const n of field.querySelectorAll<HTMLElement>('.unit .intent')) fitIntent(n);
    for (const n of field.querySelectorAll<HTMLElement>('.unit .name')) fitName(n);
  };
  watchLayout(field as Node, run);
  run();
}

// ---- 牌面的後兩級（高-3、中-5）----
function fitCard(node: HTMLElement, step: 'name' | 'text'): void {
  if (step === 'name') {
    const name = node.querySelector<HTMLElement>('.card-name');
    if (!name) return;
    name.style.fontSize = '';
    runNameWrap({
      base: parseFloat(getComputedStyle(name).fontSize),
      wrap: () => name.classList.add('wrap'),
      setSize: (px) => { name.style.fontSize = `${px}px`; },
      tooWide: () => name.scrollWidth > name.clientWidth,
      tooTall: (ws) => name.scrollHeight > ws * 1.2 * 2 + 6,
    });
    return;
  }
  const t = node.querySelector<HTMLElement>('.card-text');
  const art = node.querySelector<HTMLElement>('.card-art');
  if (!t || !art) return;
  runTextSpace({
    overflow: () => t.scrollHeight > t.clientHeight,
    tighten: () => { t.style.lineHeight = '1.2'; },
    artHeight: () => art.offsetHeight,
    setArt: (h) => { art.style.height = `${h}px`; },
  });
}

layoutHooks.scene = fitSceneText;
layoutHooks.showcase = fitShowcaseText;
layoutHooks.bless = fitBlessing;
layoutHooks.labels = fitUnitLabels;
layoutHooks.card = fitCard;
layoutHooks.hud = fitHud;
layoutHooks.tipTop = (y, h) => (getLang() === 'zh' ? undefined : tipTop(y, h));   // 繁中維持原位（這個檔在繁中也可能被載入：狀態列按需載入時）
