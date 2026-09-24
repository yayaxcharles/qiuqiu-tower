// 畫面抖動稽核 2026-09-24（docs/審查報告/2026-09-24_畫面抖動稽核/00_報告.md）的五個修正。
// 修前修後的逐格量測數字在派工回報；這裡釘住做法，任何一條改回原樣都會變紅。
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import { keepLoops } from '../../src/ui/dom';
import { clearKeepBg } from '../../src/ui/screenbg';
import APP_RAW from '../../src/ui/app.ts?raw';
import SCENE_RAW from '../../src/ui/scene.ts?raw';
import SHOP_RAW from '../../src/ui/screens/shop.ts?raw';
import ACTCLEAR_RAW from '../../src/ui/screens/actclear.ts?raw';
import REWARD_RAW from '../../src/ui/screens/reward.ts?raw';
import EVENT_RAW from '../../src/ui/screens/event.ts?raw';
import MAP_RAW from '../../src/ui/screens/map.ts?raw';
import COMBAT_RAW from '../../src/ui/screens/combat.ts?raw';

// 這台的原始碼是 CRLF，比對多行片段前先換成 LF
const norm = (s: string): string => s.replace(/\r\n/g, '\n');
const APP = norm(APP_RAW), SCENE = norm(SCENE_RAW), SHOP = norm(SHOP_RAW), ACTCLEAR = norm(ACTCLEAR_RAW);
const REWARD = norm(REWARD_RAW), EVENT = norm(EVENT_RAW), MAP = norm(MAP_RAW), COMBAT = norm(COMBAT_RAW), CSS = norm(readFileSync('src/ui/styles/screens.css', 'utf8'));
function between(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`找不到片段：${start}`);
  return src.slice(a, b);
}

/* ---------- 循環動畫接回原進度 ---------- */
type FakeAnim = { animationName?: string; playState: string; startTime: number | null; effect: { getTiming: () => { iterations: number } } };
const anim = (name: string | undefined, iterations: number, playState = 'running'): FakeAnim =>
  ({ ...(name ? { animationName: name } : {}), playState, startTime: null, effect: { getTiming: () => ({ iterations }) } });

describe('keepLoops：重畫後的無限循環 CSS 動畫一律從畫面第一次進場那一刻起算', () => {
  it('只動正在跑的無限循環 CSS 動畫；進場動畫、暫停的、程式自己開的、指定跳過的都不碰', () => {
    const loop = anim('bg-torchlight', Infinity);
    const entry = anim('dialogue-in', 1);
    const paused = anim('idle-breathe', Infinity, 'paused');
    const waapi = anim(undefined, Infinity);
    const idle = anim('card-idle', Infinity);
    const root = { getAnimations: vi.fn(() => [loop, entry, paused, waapi, idle]) };
    keepLoops(root as unknown as Element, 1234, 'card-idle');
    expect(root.getAnimations).toHaveBeenCalledWith({ subtree: true });
    expect(loop.startTime, '火光要釘回同一個起點').toBe(1234);
    expect(entry.startTime).toBeNull();
    expect(paused.startTime, '暫停的設了起點會自己跑起來').toBeNull();
    expect(waapi.startTime).toBeNull();
    expect(idle.startTime, '手牌起伏由戰鬥畫面自己接（slideHand）').toBeNull();
  });
  it('沒有 getAnimations 的環境（測試用的假節點）直接略過', () => {
    expect(() => keepLoops({} as Element, 0)).not.toThrow();
  });
});

/* ---------- 底圖留在原地 ---------- */
type FakeNode = { cls: string; parentNode: FakeRoot | FakeNode | null; removed: number; children: FakeNode[]; remove: () => void };
type FakeRoot = { childNodes: FakeNode[]; parentNode: null; querySelector: (s: string) => FakeNode | null; append: (n: FakeNode) => void };
function fakeRoot(nestBg = false) {
  const root: FakeRoot = {
    childNodes: [], parentNode: null,
    querySelector: (s: string) => {
      const want = s.replace('.', '');
      const walk = (ns: FakeNode[]): FakeNode | null => { for (const n of ns) { if (n.cls === want) return n; const d = walk(n.children); if (d) return d; } return null; };
      return walk(root.childNodes);
    },
    append: (n: FakeNode) => { n.parentNode = root; root.childNodes.push(n); },
  };
  const node = (cls: string, parent: FakeRoot | FakeNode): FakeNode => {
    const n: FakeNode = {
      cls, parentNode: parent, removed: 0, children: [],
      remove() {
        n.removed++;
        const p = n.parentNode!;
        const list = 'childNodes' in p ? p.childNodes : p.children;
        list.splice(list.indexOf(n), 1);
        n.parentNode = null;
      },
    };
    if ('childNodes' in parent) parent.childNodes.push(n); else parent.children.push(n);
    return n;
  };
  const wrap = nestBg ? node('wrap', root) : null;
  const bg = node('screen-bg', wrap ?? root);
  const hud = node('hud', root);
  const scene = node('scene', root);
  return { root, bg, hud, scene };
}

describe('clearKeepBg：底圖不拔下來再接回（拔了火光就從頭播、背景暗一下）', () => {
  it('底圖原地留著、從頭到尾沒有離開過；其他東西清掉', () => {
    const t = fakeRoot();
    clearKeepBg(t.root as unknown as HTMLElement);
    expect(t.bg.removed, '拔下來再接回＝火光歸零').toBe(0);
    expect(t.root.childNodes).toEqual([t.bg]);
    expect(t.hud.removed + t.scene.removed).toBe(2);
  });
  it('底圖包在別的節點裡（舊寫法會搬到最外層）：照樣留下來、放回最外層', () => {
    const t = fakeRoot(true);
    clearKeepBg(t.root as unknown as HTMLElement);
    expect(t.root.childNodes).toEqual([t.bg]);
  });
});

/* ---------- App.show()：哪一次算「同一頁安靜重畫」 ---------- */
type ShowFn = (this: unknown, name: string, props?: unknown, opts?: { quiet?: boolean }) => void;
async function loadShow() {
  const method = between(APP, '  show(name: ScreenName, props: unknown = {}, opts: { quiet?: boolean } = {}): void {', '\n  /**\n   * 接手一局');
  const out: { fn?: ShowFn } = {};
  const code = (await transformWithOxc(`type ScreenName = string;\nfunction ${method.trim()}\n__out.fn = show;`, 'show.ts')).code;
  const kept: Array<[unknown, number]> = [];
  const timeline = { currentTime: 100 };
  const screens = new Map<string, (app: unknown, root: unknown, props: unknown) => void>();
  new Function('__out', 'screens', 'setBgm', 'hideTooltip', 'closeScreenModals', 'me', 'setLocalPartnerHero', 'clear', 'swapScreen', 'retireLeavingScreen', 'keepLoops', 'document', code)(
    out, screens, () => {}, () => {}, () => {}, () => ({}), () => {}, () => {}, () => ({}), () => {},
    (root: unknown, t0: number) => kept.push([root, t0]), { timeline });
  let loading = false;
  const screen = { firstChild: null, animate: undefined, querySelector: (s: string) => (loading && s.includes('.screen-loading') ? {} : null) };
  const app = {
    stage: { dataset: {} as Record<string, string>, querySelector: () => null },
    screen, overlay: {}, coop: null, disposers: [] as Array<() => void>, run: null, seat: 0,
    bgmFor: () => null, redraw: false, loopT0: 0,
  };
  const seen: boolean[] = [];
  for (const n of ['reward', 'event']) screens.set(n, (a) => { seen.push((a as typeof app).redraw); });
  const show = out.fn!.bind(app) as ShowFn;
  return { app, show, seen, kept, timeline, setLoading: (v: boolean) => { loading = v; } };
}

describe('App.show()：同一頁安靜重畫才算 redraw；循環動畫的起點只在真的換畫面時重設', () => {
  it('換畫面→不算、起點重設；同一頁 quiet→算、起點不動；quiet 但換了畫面→不算；從載入畫面接手→不算', async () => {
    const t = await loadShow();
    t.show('reward', {});
    expect(t.seen.at(-1)).toBe(false);
    expect(t.app.loopT0).toBe(100);
    t.timeline.currentTime = 900;
    t.show('reward', {}, { quiet: true });
    expect(t.seen.at(-1), '同伴投一票的安靜重畫').toBe(true);
    expect(t.app.loopT0, '起點不動，火光才接得上').toBe(100);
    t.show('event', {}, { quiet: true });
    expect(t.seen.at(-1), 'quiet 但換了畫面＝第一次進場').toBe(false);
    expect(t.app.loopT0).toBe(900);
    t.setLoading(true);
    t.show('event', {}, { quiet: true });
    expect(t.seen.at(-1), '從「正在準備畫面……」接手＝第一次畫出內容').toBe(false);
    expect(t.kept.length, '每畫一次都把循環動畫接回起點').toBe(4);
    expect(t.kept.at(-1)![1]).toBe(t.app.loopT0);
  });
  // 程式碼稽核 2026-09-24 低-1：連線時晚一步進來的人，第一次畫完下一拍就被同伴那票的安靜重畫蓋掉，進場一次都沒播過
  it('剛進場 300 毫秒內的安靜重畫照新畫面算（進場動畫照播）；過了 300 毫秒才算重畫', async () => {
    const t = await loadShow();
    t.show('reward', {});
    expect(t.app.loopT0).toBe(100);
    t.timeline.currentTime = 116;
    t.show('reward', {}, { quiet: true });
    expect(t.seen.at(-1), '第一次畫完下一拍的安靜重畫').toBe(false);
    t.timeline.currentTime = 116 + 301;
    t.show('reward', {}, { quiet: true });
    expect(t.seen.at(-1)).toBe(true);
  });
});

/* ---------- 各畫面的接法（原始碼層級） ---------- */
describe('同一個畫面的重畫不再播進場動畫', () => {
  it('sceneView 的 calm 掛在新節點上，樣式表把對白框、立繪、戰利品列、備註的進場關掉', () => {
    expect(SCENE).toContain("const scene = el('div', { class: o.calm ? 'scene calm' : 'scene' },");
    expect(CSS).toContain('.scene.calm > .dialogue-box, .scene.calm > .scene-portrait, .scene.calm .reward-item, .scene.calm .event-note { animation: none; }');
    expect(CSS, '重畫前就選著的那張，勾章不再彈一次').toContain('.scene-picks .kept.selected::after { animation: none; }');
  });

  it('罐頭鋪：同一段（貨架／開頭）再畫一次就是 calm，畫完把循環動畫接回去', () => {
    const render = between(SHOP, '  function render(): void {', '  function paint(calm: boolean): void {');
    expect(render).toContain("const mode = mer && intro ? 'intro' : 'stall';");
    expect(render).toContain('const calm = drawn === mode;');
    expect(render).toContain('keepLoops(root, app.loopT0);');
    const paint = between(SHOP, '  function paint(calm: boolean): void {', '  /** 進門那一拍');
    expect(paint.match(/\n\s+calm,\n/g)?.length, '開頭與貨架兩個 sceneView 都要帶').toBe(2);
    expect(paint).toContain('clearKeepBg(root);');
  });

  it('過關：點秘寶、點牌只換選中的樣子與底下那顆鈕，不整頁重畫', () => {
    const render = between(ACTCLEAR, '  function render(): void {', '  /*\n   * **連線的回呼要掛在下面那個早退之前。**');
    expect(render).toContain("node.addEventListener('click', () => { pickedRelic = pickedRelic === id ? null : id; play('click'); refresh(); });");
    expect(render).toContain("onClick: () => { if (!sent && !iDown) { pickedCard = pickedCard === c.id ? null : c.id; play('click'); refresh(); } },");
    expect(render, '點選不准再叫 render()').not.toMatch(/play\('click'\); render\(\)/);
    expect(render).toContain('if (picks.length > 0 && !pickedRelic) return;');
    expect(render).toContain('keepLoops(root, app.loopT0);');
    expect(render).toMatch(/\n\s+calm,\n/);
    const refresh = between(ACTCLEAR, '  function refresh(): void {', '  let drawn = false;');
    expect(refresh).toContain("n.classList.remove('kept')");
  });

  it('戰利品、事件：安靜重畫帶 calm（App.redraw）', () => {
    expect(REWARD).toContain('calm: app.redraw,');
    expect(EVENT).toContain('column: true, calm: app.redraw })));');
  });
});

describe('地圖：同一層的安靜重畫接回自己捲到的位置', () => {
  it('離開前記下捲軸位置；redraw 而且同一局同一關同一層才接回，其餘照舊', () => {
    expect(MAP).toContain('const scrollKey = `${run.seed}|${run.act}|${here}`;');
    // 程式碼稽核 2026-09-24 中-1：往上爬的平滑捲動還沒播完就被安靜重畫時，玩家自己沒捲過就記「要去的那一層」，不記半路
    expect(MAP).toContain('const climbing = climbed !== null && climbed !== want;');
    expect(MAP).toContain("for (const ev of ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const) scroll.addEventListener(ev, () => { userMoved = true; }, { passive: true });");
    expect(MAP).toContain('app.disposers.push(() => { lastScroll = { key: scrollKey, top: climbing && !userMoved ? want : scroll.scrollTop }; });');
    expect(MAP).toContain('if (app.redraw && lastScroll?.key === scrollKey) scroll.scrollTop = lastScroll.top;\n  else if (climbed !== null');
    expect(MAP).toContain('else scroll.scrollTop = want;');
  });
});

describe('戰鬥：整頁重畫後循環動畫接上、手牌滑過去', () => {
  it('render()：清掉之前先記手牌，畫完接回循環動畫、手牌滑過去；逐步修補與收回待機也接', () => {
    const render = between(COMBAT, '  function render(): void {', '  /**\n   * 選目標時從牌拉一條弧線');
    expect(render.indexOf('const handWas = handSnap();')).toBeGreaterThan(-1);
    expect(render.indexOf('const handWas = handSnap();')).toBeLessThan(render.indexOf('clear(root);'));
    expect(render).toContain("keepLoops(root, app.loopT0, 'card-idle');\n    slideHand(handWas);");
    const patch = between(COMBAT, '  function patchField(', '  /** 選目標時鋪的接盤子');
    expect(patch).toContain("keepLoops(box, app.loopT0, 'card-idle');\n    return true;");
    expect(COMBAT).toContain("u.classList.remove('attack', 'hit', 'dodge', 'cast');");
    expect(between(COMBAT, "u.classList.remove('attack', 'hit', 'dodge', 'cast');", '      // **就地換圖，不要 render()**')).toContain('keepLoops(u, app.loopT0);');
  });

  it('slideHand：同一張牌從舊位置補間到新位置（transform 兩端清單一樣），起伏扣掉延遲再接；新牌不動', async () => {
    const code = between(COMBAT, '  /** 重畫前每張手牌（依 uid）', '  function handRow(): HTMLElement {');
    const js = (await transformWithOxc(`${code}\nreturn { handSnap, slideHand };`, 'slide.ts')).code;
    const idleOf = new Map<object, { currentTime: number; effect: { getTiming: () => { delay: number } } }>();
    const card = (uid: string, x: number, tf: string, idleT: number, delay: number) => {
      const cls = new Set<string>();
      const anim: { onfinish?: () => void; oncancel?: () => void } = {};
      const n = { dataset: { uid }, offsetLeft: x, offsetTop: 0, style: { transform: tf }, animate: vi.fn(() => anim), anim, cls,
        classList: { add: (c: string) => cls.add(c), remove: (c: string) => cls.delete(c) } };
      idleOf.set(n, { currentTime: idleT, effect: { getTiming: () => ({ delay }) } });
      return n;
    };
    let hand = [card('1', 100, 'rotate(-3deg) translateY(5px)', 2000, -500), card('2', 250, 'rotate(0deg) translateY(0px)', 2000, -1000)];
    const root = { querySelectorAll: () => hand };
    const fns = new Function('root', 'idleAnimOf', 'idleTimeOf', js)(root,
      (n: object) => idleOf.get(n), (n: object) => idleOf.get(n)?.currentTime ?? null) as { handSnap: () => unknown; slideHand: (w: unknown) => void };
    const was = fns.handSnap();
    // 出掉 uid 1 之後重畫：uid 2 換成新節點、排到第一張（延遲從 -1000 變 -500），另外發來一張新牌 uid 3
    hand = [card('2', 180, 'rotate(-1.6deg) translateY(2px)', 0, -500), card('3', 330, 'rotate(1.6deg) translateY(2px)', 0, 0)];
    fns.slideHand(was);
    const [moved, fresh] = hand;
    expect(moved!.animate).toHaveBeenCalledWith(
      [{ transform: 'translate(70px, 0px) rotate(0deg) translateY(0px)' }, { transform: 'translate(0px, 0px) rotate(-1.6deg) translateY(2px)' }],
      { duration: 180, easing: 'ease-out' });
    // 舊的：跑了 2000、延遲 -1000 → 週期裡 3000；新的延遲 -500 → currentTime 要設 2500 才是同一格
    expect(idleOf.get(moved!)!.currentTime).toBe(2500);
    expect(fresh!.animate, '新發的牌走發牌動畫，不滑').not.toHaveBeenCalled();
    expect(idleOf.get(fresh!)!.currentTime).toBe(0);
    // 畫面稽核重量 2026-09-24：滑的這段掛 .sliding（不套滑過抬起），滑完拿掉
    expect(moved!.cls.has('sliding')).toBe(true);
    moved!.anim.onfinish!();
    expect(moved!.cls.has('sliding')).toBe(false);
    expect(fresh!.cls.has('sliding')).toBe(false);
  });

  it('滑過抬起那條（!important）不套在正滑過來的牌上，不然游標底下那張一格跳到終點', () => {
    const css = norm(readFileSync('src/ui/styles/combat.css', 'utf8'));
    expect(css).toContain('.combat .hand .card:not(.sliding):hover {\n  transform: translateY(-46px) scale(1.06) !important;');
    expect(css).not.toMatch(/\n\.combat \.hand \.card:hover \{\n  transform:/);
  });
});

describe('事件插圖讓位量字的位置時扣掉對白框的彈入位移（畫面稽核重量 2026-09-24）', () => {
  it('fitArt 跟 refitGoods 一樣扣掉框現在的位移，第一次進場就量對、連線投票後不會再縮一截', () => {
    const fit = between(SCENE, 'function fitArt(scene: HTMLElement, box: HTMLElement): void {', '/** 舞台目前被縮放多少倍');
    expect(fit).toContain('const t = getComputedStyle(box).transform;');
    expect(fit).toContain('const textTop = (firstText.getBoundingClientRect().top - sceneTop) / k - lift;');
  });
});
