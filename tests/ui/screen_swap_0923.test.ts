import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import APP_RAW from '../../src/ui/app.ts?raw';
import COMBAT_RAW from '../../src/ui/screens/combat.ts?raw';
import CHEST_RAW from '../../src/ui/screens/chest.ts?raw';
import REWARD_RAW from '../../src/ui/screens/reward.ts?raw';

/*
 * 2026-09-23 實機驗收 M-2：打贏→戰利品（還有地圖→戰鬥／事件／貓窩／關主門、事件→戰鬥、過關幻燈片→過關畫面、開頁）
 * 換畫面那一格整片米白。原因：新畫面從透明淡入，底下直接是舞台的米白底色。
 * 修法：舊畫面原地改當退場層墊在底下（screenswap.ts）；整片劇情層蓋著時不淡入、由那一層自己淡出；開頁整個舞台從深色底淡入。
 * 修前修後每 25 毫秒一格的膠卷在派工報告。這裡釘住那幾條規則，改回原樣會變紅。
 */
vi.mock('../../src/ui/dom', () => ({
  el: (tag: string, _attrs: unknown, ...kids: unknown[]) => fakeNode(tag, kids),
  stageFrame: () => ({ left: 0, top: 0, k: 1 }),
}));
vi.mock('../../src/ui/assets', () => ({ artUrl: () => 'bg.webp' }));

import { LEAVING_CLASS, retireLeavingScreen, swapScreen } from '../../src/ui/screenswap';
import { playSlides } from '../../src/ui/slides';
import { setOverlayRoot } from '../../src/ui/overlay';

const norm = (s: string): string => s.replace(/\r\n/g, '\n');
const APP = norm(APP_RAW);
const css = (name: string): string => norm(readFileSync(`src/ui/styles/${name}`, 'utf8'));

function sourceBetween(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`找不到這一段：${start}`);
  return src.slice(a, b);
}

/* ---------- 假節點（倉庫不用假的瀏覽器環境） ---------- */
type Node0 = {
  tag: string; kids: unknown[]; removed: boolean; attrs: Record<string, string>; classes: Set<string>;
  dataset: Record<string, string>; style: Record<string, string>; inert: boolean; parent: Stage0 | null;
  anims: Array<{ done: boolean; finish(): void }>; animated: unknown[][];
  listeners: Record<string, (ev: unknown) => void>; textContent: string; src: string;
  readonly id: string;
  classList: { add(c: string): void; remove(c: string): void; toggle(): void; contains(c: string): boolean };
  append(...k: unknown[]): void; remove(): void; addEventListener(t: string, fn: (ev: unknown) => void): void;
  removeAttribute(k: string): void; setAttribute(k: string, v: string): void; cloneNode(deep: boolean): Node0;
  getAnimations(): Array<{ done: boolean; finish(): void }>; querySelector(): null; querySelectorAll(): unknown[];
  animate(k: unknown, o: unknown): { finished: Promise<void> };
  fade: { resolve: () => void } | null;
};
type Stage0 = { dataset: Record<string, string>; children: Node0[]; insertBefore(n: Node0, ref: Node0): void; querySelectorAll(sel: string): Node0[] };

function fakeNode(tag: string, kids: unknown[] = [], id = ''): Node0 {
  const n: Node0 = {
    tag, kids: [...kids], removed: false, attrs: id ? { id } : {}, classes: new Set(), dataset: {}, style: {}, inert: false, parent: null,
    anims: [], animated: [], listeners: {}, textContent: '', src: '', fade: null,
    get id() { return n.attrs['id'] ?? ''; },
    classList: { add: (c) => { n.classes.add(c); }, remove: (c) => { n.classes.delete(c); }, toggle: () => {}, contains: (c) => n.classes.has(c) },
    append: (...k) => { n.kids.push(...k); },
    remove: () => { n.removed = true; if (n.parent) n.parent.children = n.parent.children.filter((x) => x !== n); },
    addEventListener: (t, fn) => { n.listeners[t] = fn; },
    removeAttribute: (k) => { delete n.attrs[k]; },
    setAttribute: (k, v) => { n.attrs[k] = v; },
    cloneNode: (deep) => fakeNode(n.tag, deep ? n.kids : [], n.attrs['id'] ?? ''),
    getAnimations: () => n.anims,
    querySelector: () => null, querySelectorAll: () => [],
    animate: (k, o) => {
      n.animated.push([k, o]);
      return { finished: new Promise<void>((resolve) => { n.fade = { resolve }; }) };
    },
  };
  return n;
}
function fakeStage(dataset: Record<string, string>, ...children: Node0[]): Stage0 {
  const s: Stage0 = {
    dataset, children: [],
    insertBefore: (node, ref) => { const i = s.children.indexOf(ref); s.children.splice(i < 0 ? s.children.length : i, 0, node); node.parent = s; },
    querySelectorAll: (sel) => s.children.filter((c) => sel.startsWith('.') && c.classes.has(sel.slice(1))),
  };
  for (const c of children) { s.children.push(c); c.parent = s; }
  return s;
}

describe('換畫面時舊畫面墊在底下（screenswap.ts）', () => {
  it('舊畫面原地改當退場層：拿掉 id、掛退場類別、抄舞台當下的 data-*、點不到；新的空畫面層插在它前面接手 #screen', () => {
    const old = fakeNode('div', ['舊畫面的內容'], 'screen');
    const overlay = fakeNode('div', [], 'overlay');
    const stage = fakeStage({ screen: 'rest', act: '2', hero: 'feifei', restbg: 'screen_rest_mid' }, old, overlay);
    const next = swapScreen(stage as unknown as HTMLElement, old as unknown as HTMLElement) as unknown as Node0;
    expect(next).not.toBe(old);
    expect(next.id).toBe('screen');
    expect(next.kids, '新畫面層是空的，畫面渲染函式從頭畫').toHaveLength(0);
    expect(old.id, '舊的那層不能再叫 #screen（樣式、疊層、除錯都照 id 找現在的畫面）').toBe('');
    expect(old.classes.has(LEAVING_CLASS)).toBe(true);
    expect(old.dataset, '舊畫面的排版看舞台上的畫面名（貓窩立繪位置、地圖深色底）：抄一份，換名字之後舊畫面長相不變')
      .toEqual({ screen: 'rest', act: '2', hero: 'feifei', restbg: 'screen_rest_mid' });
    expect(old.inert).toBe(true);
    expect(old.removed, '舊的那層原地不動，不拔不搬（搬了 CSS 動畫會重播）').toBe(false);
    expect(old.kids).toEqual(['舊畫面的內容']);
    expect(stage.children, '新畫面層排在舊的前面：文件裡先找到的是現在的畫面').toEqual([next, old, overlay]);
  });

  it('連續換兩次、上一場還沒淡完：更底下那層直接撤，正要退場的這一層淡入跳到完（不然半透明透出米白）', () => {
    const first = fakeNode('div', ['地圖'], 'screen');
    const stage = fakeStage({ screen: 'map' }, first);
    const second = swapScreen(stage as unknown as HTMLElement, first as unknown as HTMLElement) as unknown as Node0;
    second.kids.push('戰鬥');
    const fading = { done: false, finish() { this.done = true; } };
    second.anims.push(fading);
    stage.dataset['screen'] = 'combat';
    const third = swapScreen(stage as unknown as HTMLElement, second as unknown as HTMLElement) as unknown as Node0;
    expect(first.removed).toBe(true);
    expect(fading.done).toBe(true);
    expect(stage.children).toEqual([third, second]);
    expect(second.dataset['screen']).toBe('combat');
  });

  it('新畫面淡入完才撤掉退場層；淡入被取消也撤；沒有動畫就當場撤', async () => {
    const old = fakeNode('div', ['舊'], 'screen');
    let finish!: () => void;
    retireLeavingScreen(old as unknown as HTMLElement, { finished: new Promise<void>((r) => { finish = r; }) } as unknown as Animation);
    await Promise.resolve();
    expect(old.removed, '淡入還沒完就拔掉＝又露出米白').toBe(false);
    finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(old.removed).toBe(true);

    const cancelled = fakeNode('div', ['舊'], 'screen');
    retireLeavingScreen(cancelled as unknown as HTMLElement, { finished: Promise.reject(new Error('cancel')) } as unknown as Animation);
    await new Promise((r) => setTimeout(r, 0));
    expect(cancelled.removed).toBe(true);

    const none = fakeNode('div', ['舊'], 'screen');
    retireLeavingScreen(none as unknown as HTMLElement, undefined);
    expect(none.removed).toBe(true);
  });
});

/* ---------- App.show()：原始碼抽出來真的跑 ---------- */
type ShowFn = (this: unknown, name: string, props?: unknown, opts?: { quiet?: boolean }) => void;
async function loadShow(bindings: Record<string, unknown>): Promise<ShowFn> {
  const method = sourceBetween(APP, '  show(name: ScreenName, props: unknown = {}, opts: { quiet?: boolean } = {}): void {', '\n  /**\n   * 接手一局');
  const out: { fn?: ShowFn } = {};
  const code = (await transformWithOxc(`type ScreenName = string;\nfunction ${method.trim()}\n__out.fn = show;`, 'show.ts')).code;
  new Function('__out', ...Object.keys(bindings), code)(out, ...Object.values(bindings));
  return out.fn!;
}
type Screen0 = { firstChild: unknown; animate: ReturnType<typeof vi.fn>; name: string };
const screenFake = (name: string, content: boolean): Screen0 => ({ name, firstChild: content ? {} : null, animate: vi.fn(() => ({ finished: Promise.resolve() })) });

async function setup(opts: { content?: boolean; covered?: boolean; nested?: boolean } = {}) {
  const screens = new Map<string, (app: unknown, root: unknown, props: unknown) => void>();
  const rendered: string[] = [];
  const made: Screen0[] = [];
  const swap = vi.fn((_stage: unknown, _old: unknown) => { const s = screenFake(`new${made.length}`, false); made.push(s); return s; });
  const retire = vi.fn();
  const clearFn = vi.fn();
  const coveredSelectors: string[] = [];
  const app = {
    stage: { dataset: {} as Record<string, string>, animate: vi.fn(), querySelector: (sel: string) => { coveredSelectors.push(sel); return opts.covered ? {} : null; } },
    screen: screenFake('old', opts.content ?? true) as Screen0,
    overlay: {}, coop: null, disposers: [] as Array<() => void>, run: null, seat: 0,
    bgmFor: () => null,
    show: undefined as unknown as ShowFn,
  };
  const show = await loadShow({
    screens, setBgm: () => {}, hideTooltip: () => {}, closeScreenModals: () => {}, me: () => ({}), setLocalPartnerHero: () => {},
    clear: clearFn, swapScreen: swap, retireLeavingScreen: retire,
    // 畫面抖動稽核 2026-09-24：show() 多記一個循環動畫起點、畫完把循環動畫接回去（這裡只驗換層，兩樣給空的）
    keepLoops: () => {}, document: { timeline: { currentTime: 0 } },
  });
  app.show = show.bind(app) as ShowFn;
  // 戰利品頁先掛底圖、沒有局面才回標題（reward.ts 開頭就是這樣）：回標題那一下畫面層已經有東西
  screens.set('reward', (_a, root) => { rendered.push(`reward@${(root as Screen0).name}`); (root as Screen0).firstChild = {}; if (opts.nested) app.show('title'); });
  screens.set('title', (_a, root) => { rendered.push(`title@${(root as Screen0).name}`); });
  return { app, swap, retire, clearFn, made, rendered, coveredSelectors };
}

describe('App.show()：淡入時舊畫面墊底、劇情層蓋著不淡入、開頁整個舞台淡入', () => {
  it('一般換畫面：舊畫面層交給 swapScreen、新畫面層淡入、淡完撤掉舊的；不就地清空', async () => {
    const t = await setup();
    const old = t.app.screen;
    t.app.show('reward', {});
    expect(t.swap).toHaveBeenCalledWith(t.app.stage, old);
    expect(t.clearFn, '就地清空＝底下只剩舞台的米白').not.toHaveBeenCalled();
    const next = t.made[0]!;
    expect(t.app.screen).toBe(next);
    expect(t.rendered).toEqual(['reward@new0']);
    expect(next.animate).toHaveBeenCalledTimes(1);
    expect(next.animate.mock.calls[0]![0]).toEqual([{ opacity: 0, transform: 'scale(.988)' }, { opacity: 1, transform: 'none' }]);
    expect(t.retire).toHaveBeenCalledWith(old, next.animate.mock.results[0]!.value);
    expect(t.app.stage.animate).not.toHaveBeenCalled();
  });

  it('安靜重畫（同伴投一票）：照舊就地清空、不淡入、不換層', async () => {
    const t = await setup();
    const old = t.app.screen;
    t.app.show('reward', {}, { quiet: true });
    expect(t.clearFn).toHaveBeenCalledWith(old);
    expect(t.swap).not.toHaveBeenCalled();
    expect(old.animate).not.toHaveBeenCalled();
    expect(t.retire).not.toHaveBeenCalled();
  });

  it('幻燈片／過場影片／過關走路蓋著：不墊舊畫面、不淡入，新畫面直接畫好（那一層自己淡出）', async () => {
    const t = await setup({ covered: true });
    const old = t.app.screen;
    t.app.show('reward', {});
    expect(t.coveredSelectors.join(' ')).toMatch(/\.slide-overlay/);
    expect(t.coveredSelectors.join(' ')).toMatch(/\.cine-overlay/);
    expect(t.coveredSelectors.join(' ')).toMatch(/\.actwalk-overlay:not\(\.out\)/);
    expect(t.swap, '墊了的話那一層一收，先露出早就看不到的舊畫面（剛打完的關主戰）').not.toHaveBeenCalled();
    expect(t.clearFn).toHaveBeenCalledWith(old);
    expect(old.animate).not.toHaveBeenCalled();
    expect(t.app.stage.animate).not.toHaveBeenCalled();
  });

  it('開頁第一個畫面（底下沒有舊畫面）：整個舞台從頁面的深色底淡入，只動不透明度（縮放寫在舞台的行內 transform）', async () => {
    const t = await setup({ content: false });
    const old = t.app.screen;
    t.app.show('reward', {});
    expect(t.swap).not.toHaveBeenCalled();
    expect(old.animate, '只淡畫面層＝透出舞台的米白').not.toHaveBeenCalled();
    expect(t.app.stage.animate).toHaveBeenCalledTimes(1);
    expect(t.app.stage.animate.mock.calls[0]![0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });

  it('畫面渲染途中自己又換了畫面：外層不再對已經被換掉的那一層淡入', async () => {
    const t = await setup({ nested: true });
    t.app.show('reward', {});
    expect(t.rendered).toEqual(['reward@new0', 'title@new1']);
    expect(t.made[0]!.animate).not.toHaveBeenCalled();
    expect(t.made[1]!.animate).toHaveBeenCalledTimes(1);
    expect(t.app.screen).toBe(t.made[1]);
  });
});

/* ---------- 幻燈片收尾：回呼先叫、這一層後收 ---------- */
describe('幻燈片收尾（slides.ts）', () => {
  let layer: Node0 & { parentElement: { querySelector: () => null } };
  beforeEach(() => {
    layer = Object.assign(fakeNode('div'), { parentElement: { querySelector: () => null } });
    vi.stubGlobal('window', { setTimeout: () => 1, clearTimeout: () => {} });
    setOverlayRoot(layer as unknown as HTMLElement);
  });
  afterEach(() => { setOverlayRoot(null); vi.unstubAllGlobals(); });

  it('最後一句點掉：先叫 onDone（新畫面畫在這一層底下），這一層淡出完才拔掉', async () => {
    const seen: boolean[] = [];
    let box!: Node0;
    playSlides([{ img: 'story_1', lines: [{ speaker: '旁白', text: '一' }] }], () => { seen.push(box.removed); });
    box = layer.kids[0] as Node0;
    box.listeners['click']!({ timeStamp: performance.now() + 60_000 });
    expect(seen, 'onDone 叫的時候這一層還在（先拔掉的話，換場那一格露出底下早就不在的舊畫面）').toEqual([false]);
    expect(box.animated).toHaveLength(1);
    expect(box.animated[0]![0]).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(box.style['pointerEvents'], '淡出那一下不擋新畫面的點擊').toBe('none');
    expect(box.removed).toBe(false);
    box.fade!.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(box.removed).toBe(true);
  });
});

/* ---------- 樣式與其他畫面的配合 ---------- */
describe('退場層的樣式與幾個畫面的配合', () => {
  it('退場層墊在最底（負的層級＝舞台底色之上、新畫面之下）、點不到、跟畫面層一樣鋪滿', () => {
    const rule = /\.screen-leaving \{([^}]*)\}/.exec(css('base.css'))?.[1] ?? '';
    expect(rule).toMatch(/position: absolute;/);
    expect(rule).toMatch(/inset: 0;/);
    expect(rule).toMatch(/z-index: -1;/);
    expect(rule).toMatch(/pointer-events: none;/);
  });

  it('看舞台畫面名排版的規則（地圖深色底、貓窩／罐頭鋪／結算立繪、開始畫面底圖、戰鬥狀態列）退場層也吃得到；只剩疊層裡的東西照舊看 #stage', () => {
    let converted = 0;
    for (const name of ['base.css', 'combat.css', 'map.css', 'screens.css']) {
      for (const line of css(name).split('\n')) {
        if (line.startsWith(':is(#stage, .screen-leaving)[data-screen=')) converted += 1;
        if (!line.startsWith('#stage[data-screen=')) continue;
        // 還留著 `#stage[...]` 的只能是疊層裡的東西：吐槽泡泡、同伴挑牌中那行字、看疊層有沒有泡泡的同伴牌
        expect(line, `${name}：${line}`).toMatch(/\.toast|\.pick-wait|:has\(#overlay /);
      }
    }
    expect(converted).toBeGreaterThanOrEqual(22);
    expect(css('map.css')).toContain(':is(#stage, .screen-leaving)[data-screen="map"] { background-color: #14100c; }');
  });

  it('戰鬥收場只停動作、不先拔畫布：換場那 220 毫秒墊在底下的戰鬥畫面裡貓和魔物還在', () => {
    const src = norm(COMBAT_RAW);
    const block = sourceBetween(src, '  app.disposers.push(() => {\n    for (const timer of motionImpactTimers)', '  });\n');
    expect(block).toContain('state.actor.dispose()');
    expect(block).not.toMatch(/\.element\.remove\(\)|state\.layer\.remove\(\)/);
  });

  it('「還在不在現在的畫面上」改看 app.screen.contains：紙箱開箱、戰利品問換忍具（舊畫面淡出那段還連在文件上）', () => {
    expect(norm(CHEST_RAW)).toContain('window.setTimeout(() => { if (app.screen.contains(scene)) reveal(); }, 180);');
    expect(norm(REWARD_RAW)).toContain('if (!app.screen.contains(line) || !shouldAskPotion(r.potionAsk)) return;');
  });
});
