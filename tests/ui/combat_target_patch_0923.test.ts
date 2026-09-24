// 選目標、取消選目標改成就地修補，不整頁重畫（2026-09-23 效能）。
// 量過：CPU 降速 4 倍時點一張要選目標的牌原本要 31 毫秒（整頁重建＋箭頭量位置逼瀏覽器當場重算整個戰鬥畫面）。
// 直接跑戰鬥畫面的原始碼片段：這幾支是畫面內部的函式，不是公開介面。
import { describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';

const NORMALIZED = SRC.replace(/\r\n/g, '\n');
function sourceBetween(start: string, end: string): string {
  const first = NORMALIZED.indexOf(start);
  const last = NORMALIZED.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`找不到戰鬥畫面片段：${start}`);
  return NORMALIZED.slice(first, last);
}

/** 只做 patchTargeting 用得到的那幾樣：類別開關、前面插、拿掉 */
class FakeEl {
  readonly classes: Set<string>;
  parent: FakeEl | null = null;
  readonly kids: FakeEl[] = [];
  readonly dataset: Record<string, string> = {};
  constructor(cls: string, readonly text = '') { this.classes = new Set(cls.split(/\s+/).filter(Boolean)); }
  readonly classList = {
    toggle: (c: string, on: boolean) => { if (on) this.classes.add(c); else this.classes.delete(c); },
    contains: (c: string) => this.classes.has(c),
  };
  append(...n: FakeEl[]): void { for (const k of n) { k.parent = this; this.kids.push(k); } }
  remove(): void { if (!this.parent) return; this.parent.kids.splice(this.parent.kids.indexOf(this), 1); this.parent = null; }
  before(n: FakeEl): void { const p = this.parent!; n.parent = p; p.kids.splice(p.kids.indexOf(this), 0, n); }
  has(c: string): boolean { return this.classes.has(c); }
}

function screen() {
  const box = new FakeEl('combat');
  const field = new FakeEl('field');
  const hand = new FakeEl('hand');
  const hud = new FakeEl('hud');
  box.append(new FakeEl('battle-bg'), field, new FakeEl('side'), hand, new FakeEl('log'), hud);
  const enemies = [1, 2, 3].map((uid) => { const n = new FakeEl('unit enemy'); n.dataset['uid'] = String(uid); field.append(n); return n; });
  const cards = [11, 12, 13].map((uid) => { const n = new FakeEl('card small clickable'); n.dataset['uid'] = String(uid); hand.append(n); return n; });
  const q = (sel: string): FakeEl[] => {
    if (sel === '.hand .card') return cards;
    const wanted = sel.split(',').map((s) => s.trim().replace(/^\./, ''));
    return box.kids.filter((k) => wanted.some((w) => k.has(w)));
  };
  Object.assign(box, {
    querySelector: (sel: string) => (sel === '.field' ? field : sel === '.hud' ? hud : q(sel)[0] ?? null),
    querySelectorAll: q,
  });
  Object.assign(field, {
    querySelector: (sel: string) => enemies.find((n) => sel === `.unit.enemy[data-uid="${n.dataset['uid']}"]`) ?? null,
  });
  return { box, field, hud, enemies, cards, order: () => box.kids.map((k) => [...k.classes].join('.')) };
}

async function mount(hasScreen = true) {
  const s = screen();
  const mounted: unknown[] = [];
  const hideTooltip = vi.fn();
  const render = vi.fn();
  const el = (_tag: string, attrs: { class?: string } = {}, ...children: unknown[]) => {
    const node = new FakeEl(attrs.class ?? '', children.filter((c) => typeof c === 'string').join(''));
    node.append(...children.filter((c): c is FakeEl => c instanceof FakeEl));
    return node;
  };
  const snippet = sourceBetween('  /** 選目標時鋪的接盤子', '  function render(): void {');
  const code = `let targeting = null; let hint = ''; let tutStep = -1;
function mountArrow(b) { arrowOff = new AbortController(); mounted.push({ box: b, off: arrowOff }); }
${snippet}
return { set(t, h = '', step = -1) { targeting = t; hint = h; tutStep = step; }, patchTargeting };`;
  const compiled = await transformWithOxc(code, 'combat-target-patch.ts');
  const bindings = {
    el, render, hideTooltip, mounted,
    root: { querySelector: (sel: string) => (hasScreen && sel === '.combat' ? s.box : null) },
    cs: { enemies: [{ uid: 1, dead: false }, { uid: 2, dead: true }, { uid: 3, dead: false }] },
    setTargeting: vi.fn(), tutDone: vi.fn(), TUT_TEXT: ['一', '二', '三'],
  };
  const api = new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as {
    set(t: unknown, hint?: string, step?: number): void; patchTargeting(): boolean;
  };
  return { ...s, api, mounted: mounted as Array<{ box: unknown; off: AbortController }>, hideTooltip };
}

describe('選目標：就地修補', () => {
  it('點一張要選目標的牌：只亮那張、活著的魔物可點、接盤子在戰場前、提示在狀態列前、掛箭頭', async () => {
    const m = await mount();
    m.api.set({ kind: 'card', uid: 12 });
    expect(m.api.patchTargeting()).toBe(true);
    expect(m.cards.map((c) => c.has('selected'))).toEqual([false, true, false]);
    expect(m.enemies.map((e) => e.has('targetable'))).toEqual([true, false, true]);
    expect(m.order()).toEqual(['battle-bg', 'target-catcher', 'field', 'side', 'hand', 'log', 'target-hint', 'hud']);
    expect(m.box.kids.find((k) => k.has('target-hint'))!.text).toContain('點一下打牠');
    expect(m.mounted).toHaveLength(1);
    expect(m.hideTooltip).toHaveBeenCalled();
  });

  it('改選另一張、再取消：選中的跟著換、接盤子與提示不重複疊、箭頭的監聽一起拆', async () => {
    const m = await mount();
    m.api.set({ kind: 'card', uid: 12 });
    m.api.patchTargeting();
    m.api.set({ kind: 'card', uid: 13 });
    m.api.patchTargeting();
    expect(m.cards.map((c) => c.has('selected'))).toEqual([false, false, true]);
    expect(m.order().filter((k) => k === 'target-catcher' || k === 'target-hint')).toEqual(['target-catcher', 'target-hint']);
    expect(m.mounted[0]!.off.signal.aborted).toBe(true);
    m.api.set(null);
    m.api.patchTargeting();
    expect(m.cards.some((c) => c.has('selected'))).toBe(false);
    expect(m.enemies.some((e) => e.has('targetable'))).toBe(false);
    expect(m.order()).toEqual(['battle-bg', 'field', 'side', 'hand', 'log', 'hud']);
    expect(m.mounted).toHaveLength(2);
    expect(m.mounted[1]!.off.signal.aborted, '取消了箭頭的監聽還掛著').toBe(true);
  });

  it('用忍具選目標：提示換成忍具那句；沒在選但有「打不出來」的原因就留紅字；教學條照現在的步驟重畫', async () => {
    const m = await mount();
    m.api.set({ kind: 'potion', id: 'shuriken' }, '', 1);
    m.api.patchTargeting();
    expect(m.box.kids.find((k) => k.has('target-hint'))!.text).toContain('用忍具');
    expect(m.order().slice(-3)).toEqual(['tut-bar', 'target-hint', 'hud']);
    expect(m.box.kids.find((k) => k.has('tut-bar'))!.kids[0]!.text).toBe('教學 2/3');
    m.api.set(null, '飯糰不夠', 1);
    m.api.patchTargeting();
    expect(m.order().filter((k) => k.startsWith('target-hint') || k === 'tut-bar')).toEqual(['tut-bar', 'target-hint.warn']);
  });

  it('畫面還沒畫好：回 false 讓呼叫端整頁重畫', async () => {
    const m = await mount(false);
    m.api.set({ kind: 'card', uid: 12 });
    expect(m.api.patchTargeting()).toBe(false);
  });
});

describe('選目標的每一條路都先修補、修補不了才整頁重畫', () => {
  const sites: Array<[string, string, string]> = [
    ['點牌（onCard）', '  function onCard(uid: number): void {', '  function pickTarget('],
    ['點要選目標的忍具（onPotion）', '  function onPotion(id: string): void {', '  /**\n   * 收牌'],
    ['Esc 取消', '  const onKey = (ev: KeyboardEvent): void => {', '  window.addEventListener(\'keydown\''],
    ['右鍵取消', '  const onContext = (ev: MouseEvent): void => {', '  window.addEventListener(\'contextmenu\''],
    ['點空白處取消（接盤子）', '  const targetCatcher = (): HTMLElement =>', '  /** 教學那一條'],
  ];
  it.each(sites)('%s', (_label, start, end) => {
    const body = sourceBetween(start, end);
    expect(body).toMatch(/setTargeting\([^;]*\);\s*if \(!patchTargeting\(\)\) render\(\);/);
    // 不准留一個沒先試修補、直接整頁重畫的選目標
    expect(body).not.toMatch(/setTargeting\([^;]*\);\s*render\(\);/);
  });

  it('整頁重畫與修補畫同一套接盤子、教學條、提示（兩邊不可能畫得不一樣）', () => {
    const render = sourceBetween('  function render(): void {', '  /**\n   * 選目標時從牌拉一條弧線');
    expect(render).toContain('box.append(targetCatcher())');
    expect(render).toContain('box.append(tutBar())');
    expect(render).toContain('const note = targetHint();');
    expect(render).not.toContain("class: 'target-hint'");
  });

  it('魔物的點擊一律掛著、點的當下才看在不在選目標（修補只換類別，不重建節點）', () => {
    const unit = sourceBetween('  function enemyUnit(e: EnemyCombat, i: number, n: number): HTMLElement {', '  function sidePanel(): HTMLElement {');
    expect(unit).toContain("node.addEventListener('click', () => { if (targeting && !e.dead) pickTarget(e.uid); });");
  });
});
