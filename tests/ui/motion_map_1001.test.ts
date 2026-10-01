import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import { enemyMoveClipOf, SIDE_MOTION_KINDS } from '../../src/ui/enemy-motion';
import { enemyById } from '../../src/content/enemies';

/*
 * 2026-10-01 魔物每招配自己的片段＋變身（使用者看過盤點對照圖，兩題都說「好」）：
 *   ①招式對片段：橘皮大王「肚皮壓」播大跳砸下、蛙大名「跳壓／重跳壓」播跳壓、掃地機器人王「吸走」播龍捲；沒對到的招照舊播預設出招
 *   ②變身：橘皮大王、狸大人換階段那一刻播變身片段，演完交還第二階段的立繪
 * 這裡跑 combat.ts 裡真正的那幾段（畫面裡的區域函式不是公開介面），假的立繪框、假的畫布。
 */
const ROOT = resolve(__dirname, '../..');
const dataOf = (kind: string): {
  actions: Record<string, { frames: { duration: number }[] }>;
  extras?: Record<string, { texture: string; loop: boolean; frames: { duration: number }[] }>;
  moves?: Record<string, string>;
} => JSON.parse(readFileSync(join(ROOT, `src/ui/side-motion/${kind}.json`), 'utf8'));
const seconds = (m: { frames: { duration: number }[] }): number => m.frames.reduce((sum, f) => sum + f.duration, 0);

describe('招式對片段：資料', () => {
  it('這一批對到的招與片段', () => {
    expect(dataOf('orange_king').moves).toEqual({ 肚皮壓: 'slam' });
    expect(dataOf('frog_daimyo').moves).toEqual({ 跳壓: 'jump' });
    expect(dataOf('frog_daimyo_p2').moves).toEqual({ 重跳壓: 'jump_p2', 跳壓: 'jump_p2' });
    expect(dataOf('roomba_king').moves).toEqual({ 吸走: 'suck' });
    expect(Object.keys(dataOf('orange_king').extras ?? {}).sort()).toEqual(['change', 'slam']);
    expect(Object.keys(dataOf('tanuki_lord').extras ?? {})).toEqual(['change']);
  });

  it('對照表裡的招式名都是那隻魔物真的有的招（寫錯字就永遠對不到）', () => {
    const owner: Record<string, string> = {};
    for (const kind of SIDE_MOTION_KINDS) owner[kind] = kind.replace(/_p2$/, '');
    for (const kind of SIDE_MOTION_KINDS) {
      const moves = dataOf(kind).moves ?? {};
      const def = enemyById[owner[kind]!]!;
      const labels = new Set([...def.moves, ...(def.phases ?? []).flatMap((p) => p.moves ?? [])].map((m) => m.label));
      for (const label of Object.keys(moves)) expect(labels.has(label), `${kind}：${label}`).toBe(true);
    }
  });

  it('節奏：招式片段 ≤ 1.4 秒（跟預設出招同一條）；變身 ≤ 2 秒（原片 4 秒）；都不循環', () => {
    for (const kind of SIDE_MOTION_KINDS) {
      for (const [name, motion] of Object.entries(dataOf(kind).extras ?? {})) {
        expect(motion.loop, `${kind} ${name}`).toBe(false);
        expect(motion.texture.startsWith('assets/motion/side/'), `${kind} ${name}`).toBe(true);
        expect(seconds(motion), `${kind} ${name}`).toBeLessThanOrEqual(name === 'change' ? 2.0 : 1.4);
      }
    }
  });

  it('連線兩台：同一招對到同一段（只看資料與引擎裡的招式原文，不看介面語言、不看誰先下載好）', () => {
    for (const kind of SIDE_MOTION_KINDS) {
      const a = dataOf(kind);
      const b = JSON.parse(JSON.stringify(a)) as typeof a;   // 另一台各自載入的同一份資料
      const def = enemyById[kind.replace(/_p2$/, '')]!;
      const labels = [...def.moves, ...(def.phases ?? []).flatMap((p) => p.moves ?? [])].map((m) => m.label);
      for (const label of labels) expect(enemyMoveClipOf(a, label), `${kind} ${label}`).toBe(enemyMoveClipOf(b, label));
    }
    expect(enemyMoveClipOf(dataOf('orange_king'), '肚皮壓')).toBe('slam');
    expect(enemyMoveClipOf(dataOf('orange_king'), '丟魚骨頭')).toBe(undefined);   // 沒對到的照舊預設出招
    expect(enemyMoveClipOf(dataOf('orange_king'), undefined)).toBe(undefined);
  });
});

function sourceBetween(start: string, end: string): string {
  const normalized = SRC.replace(/\r\n/g, '\n');
  const first = normalized.indexOf(start);
  const last = normalized.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`找不到 combat.ts 的這一段：${start}`);
  return normalized.slice(first, last);
}
const mountSource = sourceBetween('  const MOTION_DEATH_FADE_MS', '  app.disposers.push(() => {');

type FakeEl = { parentNode: FakeEl | null; children: FakeEl[]; classes: Set<string>; append(c: FakeEl): void; remove(): void;
  classList: { add(k: string): void; remove(k: string): void; contains(k: string): boolean }; closest(): FakeEl | null };
function fakeEl(): FakeEl {
  const node: FakeEl = {
    parentNode: null, children: [], classes: new Set(),
    append(c) { c.remove(); c.parentNode = node; node.children.push(c); },
    remove() { const p = node.parentNode; if (p) { p.children = p.children.filter((x) => x !== node); node.parentNode = null; } },
    classList: { add: (k) => { node.classes.add(k); }, remove: (k) => { node.classes.delete(k); }, contains: (k) => node.classes.has(k) },
    closest: () => node.parentNode,
  };
  return node;
}

type Played = [string, string, string | undefined];
/** 搭一個只有一隻塔主的戰場，回傳可以呼叫 combat.ts 那幾段的環境 */
async function field(opts: { enemyId: string; phase: number; staticIdleKind?: boolean; acting?: Map<number, { label: string; attacked: boolean }>;
  clipFor?: (kind: string, label: string) => string | undefined; changeReady?: boolean; ready?: (kind: string) => boolean; hurt?: boolean }) {
  const unit = fakeEl();
  const box = fakeEl();
  unit.append(box);
  const played: Played[] = [];
  const created: string[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let now = 1000;
  const e = { uid: 7, enemyId: opts.enemyId, phase: opts.phase, dead: false, reviveIn: 0, invulnIn: 0 };
  const enemyMotionActors = new Map<number, { kind: string; action: string; actor: { element: FakeEl } }>();
  const enemyPhaseChanges = new Map<number, { kind: string; until: number }>();
  const bindings: Record<string, unknown> = {
    enemyMotionActors, enemyPhaseChanges,
    root: { querySelector: (sel: string) => (sel.endsWith('.sprite-box') ? box : unit) },
    qiuqiuEnemyMotionAllowed: () => true, motionEnabled: true, heroOf: () => 'ninja',
    qiuqiuEnemyMotionKind: (id: string, phase: number) => (phase > 0 ? `${id}_p2` : id),
    enemyMotionReady: opts.ready ?? (() => true), ensureEnemyMotion() {},
    enemyMotionChangeReady: () => opts.changeReady ?? true,
    enemyMotionMoveClip: (kind: string, label: string) => opts.clipFor?.(kind, label),
    fallingUids: new Set(), willRevive: () => false,
    createEnemyMotionActor: (kind: string) => {
      created.push(kind);
      const canvas = fakeEl();
      return { element: canvas, play: (a: string, clip?: string) => { played.push([kind, a, clip]); }, pause() {}, dispose() {} };
    },
    isSideMotionKind: () => true, hurtSet: new Set(opts.hurt ? [7] : []), acting: opts.acting ?? new Map(), enemyStaticPose: () => 'idle',
    staticIdle: () => opts.staticIdleKind ?? true, playsLongDeath: () => false,
    enemyMotionHas: (_k: string, a: string) => a !== 'hurt',
    enemyMotionDuration: (_k: string, a: string) => (a === 'change' ? 1900 : 1350),
    qiuqiuEnemyMotionHold: (_k: string, a: string) => (a === 'change' ? 1900 : 1350), BOSS_DEATH_HOLD_MS: 400,
    motionImpactTimers: new Set(), performance: { now: () => now },
    window: { setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {} },
  };
  const cs = { phase: 'combat', players: [], enemies: [e] };
  bindings.cs = cs;
  bindings.app = { cs };
  const code = (await transformWithOxc(`${mountSource}\nreturn { mountEnemyMotion, startPhaseChange, playEnemyMotion };`, 'motion-map.ts')).code;
  const api = new Function(...Object.keys(bindings), code)(...Object.values(bindings)) as {
    mountEnemyMotion(e: unknown, box: FakeEl): void; startPhaseChange(e: unknown, from: number): void; playEnemyMotion(uid: number, a: string, clip?: string): void;
  };
  return {
    e, box, played, created, timers, enemyPhaseChanges, enemyMotionActors,
    mount: () => api.mountEnemyMotion(e, box), api,
    advance: (ms: number) => { now += ms; },
    canvasShown: () => box.children.length > 0 && box.classList.contains('has-enemy-motion'),
  };
}

describe('招式對片段：戰鬥畫面', () => {
  it('肚皮壓：播自己的片段（slam）', async () => {
    const f = await field({ enemyId: 'orange_king', phase: 0, acting: new Map([[7, { label: '肚皮壓', attacked: true }]]),
      clipFor: (kind, label) => (kind === 'orange_king' && label === '肚皮壓' ? 'slam' : undefined) });
    f.mount();
    expect(f.played).toEqual([['orange_king', 'attack', 'slam']]);
    expect(f.canvasShown()).toBe(true);
  });

  it('沒對到的招（丟魚骨頭）、或片段圖集還沒下載好：照舊播預設出招片段', async () => {
    const f = await field({ enemyId: 'orange_king', phase: 0, acting: new Map([[7, { label: '丟魚骨頭', attacked: true }]]), clipFor: () => undefined });
    f.mount();
    expect(f.played).toEqual([['orange_king', 'attack', undefined]]);
  });

  it('非攻擊招（吸走）有對到片段才播；沒對到（或還沒下載好）照舊不播', async () => {
    const suck = await field({ enemyId: 'roomba_king', phase: 0, staticIdleKind: false,
      acting: new Map([[7, { label: '吸走', attacked: false }]]), clipFor: (_k, label) => (label === '吸走' ? 'suck' : undefined) });
    suck.mount();
    expect(suck.played.at(-1)).toEqual(['roomba_king', 'attack', 'suck']);
    const summon = await field({ enemyId: 'roomba_king', phase: 0, staticIdleKind: false,
      acting: new Map([[7, { label: '放出小掃把', attacked: false }]]), clipFor: () => undefined });
    summon.mount();
    expect(summon.played.some(([, a]) => a === 'attack')).toBe(false);
  });
});

describe('出招排在挨打前面（牠出手那一步同時被毒扣血）', () => {
  it('中了毒的橘皮大王出肚皮壓：照樣播出招片段（原本挨打優先，逐格出招一次都看不到）', async () => {
    const f = await field({ enemyId: 'orange_king', phase: 0, hurt: true, acting: new Map([[7, { label: '肚皮壓', attacked: true }]]),
      clipFor: (_k, label) => (label === '肚皮壓' ? 'slam' : undefined) });
    f.mount();
    expect(f.played).toEqual([['orange_king', 'attack', 'slam']]);
    expect(f.canvasShown()).toBe(true);
  });

  it('出招演到一半挨打（毒、反彈）：不打斷出招；沒在出招的照舊播挨打', async () => {
    const f = await field({ enemyId: 'roomba_king', phase: 0, staticIdleKind: false, acting: new Map([[7, { label: '滾刷', attacked: true }]]) });
    f.mount();
    expect(f.played).toEqual([['roomba_king', 'attack', undefined]]);
    f.api.playEnemyMotion(7, 'hurt');
    expect(f.played.length).toBe(1);
    f.advance(1400);   // 出招演完了
    f.api.playEnemyMotion(7, 'hurt');
    expect(f.played.at(-1)).toEqual(['roomba_king', 'hurt', undefined]);
  });
});

describe('變身：換階段那一刻播變身，演完交還第二階段立繪', () => {
  it('變身中掛第一階段那一套的畫布播變身；挨打、收回待機不打斷；演完重掛，交還第二階段的立繪（不掛畫布）', async () => {
    const f = await field({ enemyId: 'orange_king', phase: 1 });
    f.api.startPhaseChange(f.e, 0);
    expect(f.enemyPhaseChanges.get(7)?.kind).toBe('orange_king');
    f.mount();   // 換階段那一拍的重畫（引擎已經是第二階段）
    expect(f.created).toEqual(['orange_king']);
    expect(f.played).toEqual([['orange_king', 'change', undefined]]);
    expect(f.canvasShown()).toBe(true);   // 沒有先閃第二階段的立繪
    f.api.playEnemyMotion(7, 'hurt');
    f.api.playEnemyMotion(7, 'idle');
    expect(f.played.length).toBe(1);
    expect(f.canvasShown()).toBe(true);
    f.mount();   // 演到一半又重畫（叫小弟出來會整頁重畫）：不從頭再演
    expect(f.played.length).toBe(1);
    // 演完：計時到了重掛一次
    f.advance(1950);
    const end = f.timers.find((t) => t.ms >= 1900);
    expect(end).toBeDefined();
    end!.fn();
    expect(f.enemyPhaseChanges.has(7)).toBe(false);
    expect(f.created).toEqual(['orange_king', 'orange_king_p2']);
    expect(f.canvasShown()).toBe(false);   // 第二階段待機改畫立繪
  });

  it('變身片段圖集還沒到（慢網路）：不登記，照舊直接換第二階段立繪、不等', async () => {
    const f = await field({ enemyId: 'orange_king', phase: 1, changeReady: false });
    f.api.startPhaseChange(f.e, 0);
    expect(f.enemyPhaseChanges.size).toBe(0);
    f.mount();
    expect(f.played.some(([, a]) => a === 'change')).toBe(false);
    expect(f.canvasShown()).toBe(false);
  });

  it('變身中被打死或輪到牠出手：馬上收掉變身', async () => {
    const f = await field({ enemyId: 'tanuki_lord', phase: 1, acting: new Map() });
    f.api.startPhaseChange(f.e, 0);
    f.mount();
    expect(f.played).toEqual([['tanuki_lord', 'change', undefined]]);
    (f.e as { dead: boolean }).dead = true;
    f.mount();
    expect(f.enemyPhaseChanges.has(7)).toBe(false);
    expect(f.created.at(-1)).toBe('tanuki_lord_p2');
  });

  it('換階段的變身在重畫之前登記（不然重畫那一下會先閃第二階段的立繪）', () => {
    const c = SRC.replace(/\r\n/g, '\n');
    const start = c.indexOf('startPhaseChange(e, b.phase)');
    const render = c.indexOf('if (!(opts.light && patchField(before))) render();');
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThan(render);
    expect(render - start).toBeLessThan(600);
  });
});
