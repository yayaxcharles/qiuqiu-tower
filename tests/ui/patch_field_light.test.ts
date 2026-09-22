// 魔物回合逐步修補（patchField）不再每一步無條件重建同伴那一格與整條狀態列（清理 2026-09-22 C5）。
// 直接跑戰鬥畫面的原始碼片段：這幾支是畫面內部的函式，不是公開介面。
import { describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';

function sourceBetween(start: string, end: string): string {
  const normalized = SRC.replace(/\r\n/g, '\n');
  const first = normalized.indexOf(start);
  const last = normalized.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`找不到戰鬥畫面片段：${start}`);
  return normalized.slice(first, last);
}

const helpers = sourceBetween('function mateUnitStale(', 'interface Snap {');
const mateLoop = sourceBetween('    // 同伴那一格：他的變化來自連線', "    box.querySelector('.log')");
const hudPart = sourceBetween('    // 狀態列只在它畫的東西變了才重建', '    const endBtn = ');

const getStatus = (u: { statuses?: Record<string, number> }, name: string): number => u.statuses?.[name] ?? 0;
const sumStatus = (u: { statuses?: Record<string, number> }, names: readonly string[]): number =>
  names.reduce((t, k) => t + getStatus(u, k), 0);

type Q = { seat: number; hp: number; block: number; down?: boolean; ready?: boolean; hero: string; statuses: Record<string, number> };

function fakeNode(src: string, classes: string[] = [], mateSig = 'same') {
  const set = new Set(['unit', 'player', ...classes]);
  return {
    dataset: { mateSig },
    classList: { contains: (c: string) => set.has(c) },
    querySelector: () => ({ getAttribute: () => src }),
    replaceWith: vi.fn(),
  };
}

async function runMateLoop(q: Q, was: Record<string, unknown> | undefined, node: ReturnType<typeof fakeNode>): Promise<void> {
  const me = { seat: 0, hp: 50, block: 0, hero: 'ninja', statuses: {} };
  const code = `${helpers}\n${mateLoop}`;
  const bindings = {
    cs: { players: [me, q] }, mySeat: 0,
    field: { querySelector: () => node },
    before: { players: new Map(was ? [[q.seat, was]] : []) },
    heroArtUrl: (_hero: string, pose: string) => `/${pose}.webp`,
    matePose: (p: Q) => (p.down ? 'lose' : 'idle'),
    playerUnit: () => ({}),
    mateSig: () => 'same',
    getStatus, sumStatus, GOOD_STATUS: ['爪力'], BAD_STATUS: ['中毒'],
  };
  const compiled = await transformWithOxc(code, 'patch-field-mate.ts');
  new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings));
}

describe('同伴那一格有變才換新節點', () => {
  const q: Q = { seat: 1, hp: 40, block: 3, hero: 'feifei', statuses: { 中毒: 2 } };
  const was = { hp: 40, block: 3, stealth: 0, down: false, buff: 0, debuff: 2 };

  it('同伴出了一張只打魔物的牌（血量、狀態都沒變）：頭上那張牌、蓄氣變了就要換（推前審查 高-1）', async () => {
    const node = fakeNode('/idle.webp', [], 'uid-3|12|3|');
    await runMateLoop(q, was, node);
    expect(node.replaceWith).toHaveBeenCalledTimes(1);
  });

  it('這一步同伴什麼都沒變：不換（以前每一步都整格重建）', async () => {
    const node = fakeNode('/idle.webp');
    await runMateLoop(q, was, node);
    expect(node.replaceWith).not.toHaveBeenCalled();
  });

  it.each([
    ['血量', { ...q, hp: 33 }, '/idle.webp', []],
    ['蜷縮', { ...q, block: 0 }, '/idle.webp', []],
    ['減益', { ...q, statuses: { 中毒: 1 } }, '/idle.webp', []],
    ['增益', { ...q, statuses: { 中毒: 2, 爪力: 1 } }, '/idle.webp', []],
    ['倒下', { ...q, down: true }, '/idle.webp', []],
    ['舉手牌子該拆', q, '/idle.webp', ['ready']],
    ['姿勢圖換了', q, '/hurt.webp', []],
    ['還留著挨打類別', q, '/idle.webp', ['hit']],
  ] as const)('%s：換', async (_label, now, src, classes) => {
    const node = fakeNode(src, [...classes]);
    await runMateLoop(now as Q, was, node);
    expect(node.replaceWith).toHaveBeenCalledTimes(1);
  });

  it('快照裡沒有這一位（剛加入）：換', async () => {
    const node = fakeNode('/idle.webp');
    await runMateLoop(q, undefined, node);
    expect(node.replaceWith).toHaveBeenCalledTimes(1);
  });
});

describe('狀態列只在小魚乾、血量、秘寶這些東西變了才重建', () => {
  async function runHud(shown: string, player: Record<string, unknown>, fishDelta: number, hasHud = true) {
    const renderHud = vi.fn();
    const paintFlashes = vi.fn();
    const removed = vi.fn();
    const code = `${helpers}\nlet hudShown = shown;\n${hudPart}\nreturn hudShown;`;
    const bindings = {
      shown, getStatus, sumStatus, GOOD_STATUS: [], BAD_STATUS: [],
      me: () => player, run: {}, app: { seat: 0 }, my: () => ({ fishDelta }),
      box: { querySelector: () => (hasHud ? { remove: removed } : null) },
      renderHud, paintFlashes, performance: { now: () => 0 },
    };
    const compiled = await transformWithOxc(code, 'patch-field-hud.ts');
    const next = new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as string;
    return { renderHud, paintFlashes, removed, next };
  }
  const player = { fish: 120, hp: 40, maxHp: 60, relics: ['scroll'], potions: ['onigiri'], deck: [1, 2, 3] };
  const key = [120, 40, 60, 'scroll', 'onigiri', 3].join('|');

  it('跟上次畫的一樣：不重建', async () => {
    const r = await runHud(key, player, 0);
    expect(r.renderHud).not.toHaveBeenCalled();
    expect(r.removed).not.toHaveBeenCalled();
    expect(r.next).toBe(key);
  });

  it.each([
    ['被偷走小魚乾（戰鬥中的增減）', player, -5],
    ['血量', { ...player, hp: 39 }, 0],
    ['秘寶', { ...player, relics: ['scroll', 'yarn_ball'] }, 0],
  ] as const)('%s變了：重建一次並記下新的', async (_label, now, delta) => {
    const r = await runHud(key, now, delta);
    expect(r.removed).toHaveBeenCalledTimes(1);
    expect(r.renderHud).toHaveBeenCalledTimes(1);
    expect(r.paintFlashes).toHaveBeenCalledTimes(1);
    expect(r.next).not.toBe(key);
  });

  it('狀態列節點不見了：照樣補畫', async () => {
    const r = await runHud(key, player, 0, false);
    expect(r.renderHud).toHaveBeenCalledTimes(1);
  });
});
