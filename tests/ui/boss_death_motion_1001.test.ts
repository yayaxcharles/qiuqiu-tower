import { describe, expect, it } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';

/*
 * 2026-10-01 使用者：「第一關 BOSS 機器狗還是原本的？他跟掃地機器人王不是有改成動畫版嗎？爆炸應該很華麗。」
 * 鐵爪機關貓第二階段（iron_claw_p2）在待機改畫立繪的名單裡（staticIdle，09-29）：站著、剛被打死還在倒下空檔時，
 * 逐格畫布都從立繪框拿掉了。倒下由 finishEnemyMotion 直接開演、之後打完就不再重畫，
 * 所以爆炸在看不見的畫布上演完，畫面只剩靜態倒地圖（實測快網路也一樣，上線前 ae83bd88 就是這樣）。
 * 這裡跑 combat.ts 裡真正的那幾段（畫面裡的區域函式不是公開介面），假的立繪框、假的畫布。
 */
function sourceBetween(start: string, end: string): string {
  const normalized = SRC.replace(/\r\n/g, '\n');
  const first = normalized.indexOf(start);
  const last = normalized.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`找不到 combat.ts 的這一段：${start}`);
  return normalized.slice(first, last);
}

const deathSource = sourceBetween('  const MOTION_DEATH_FADE_MS', '  const mountEnemyMotion = (');

type FakeEl = { parentNode: FakeEl | null; children: FakeEl[]; classes: Set<string>; append(c: FakeEl): void; remove(): void; classList: { add(k: string): void; remove(k: string): void; contains(k: string): boolean } };
function fakeEl(): FakeEl {
  const node: FakeEl = {
    parentNode: null, children: [], classes: new Set(),
    append(c) { c.remove(); c.parentNode = node; node.children.push(c); },
    remove() { const p = node.parentNode; if (p) { p.children = p.children.filter((x) => x !== node); node.parentNode = null; } },
    classList: { add: (k) => { node.classes.add(k); }, remove: (k) => { node.classes.delete(k); }, contains: (k) => node.classes.has(k) },
  };
  Object.defineProperty(node, 'isConnected', { get: () => node.parentNode !== null });
  return node;
}

async function runDeath(kind: string, opts: { longDeath: boolean; hasKnockdown: boolean; staticIdleKind: boolean; attached?: boolean; call?: string }) {
  const unit = fakeEl();
  const box = fakeEl();
  unit.append(box);
  const canvas = fakeEl();   // 待機交還靜態立繪：畫布不在框裡（mountEnemyMotion 的 handBack 拿掉了）
  if (opts.attached) box.append(canvas);
  const played: string[] = [];
  const state = { kind, action: 'idle', busyUntil: 0, actor: { element: canvas, play: (a: string) => { played.push(a); }, pause() {}, dispose() {} } };
  const enemyMotionActors = new Map<number, typeof state>([[7, state]]);
  const root = {
    querySelector: (sel: string) => sel === '.unit.enemy[data-uid="7"] .sprite-box' ? box : sel === '.unit.enemy[data-uid="7"]' ? unit : null,
  };
  const bindings: Record<string, unknown> = {
    enemyMotionActors, root,
    staticIdle: () => opts.staticIdleKind,
    playsLongDeath: () => opts.longDeath,
    isSideMotionKind: () => true,
    // 橫向捲軸那幾套都沒有挨打片段；倒下看這一套有沒有
    enemyMotionHas: (_k: string, a: string) => (a === 'knockdown' ? opts.hasKnockdown : a !== 'hurt'),
    enemyMotionDuration: () => 600,
    qiuqiuEnemyMotionHold: () => 2700,
    BOSS_DEATH_HOLD_MS: 400,
    motionImpactTimers: new Set(),
    app: { cs: {} }, cs: { phase: 'won' },
    performance: { now: () => 1000 },
    window: { setTimeout: () => 1, clearTimeout() {} },
  };
  bindings.app = { cs: bindings.cs };
  const code = (await transformWithOxc(`${deathSource}\n${opts.call ?? 'finishEnemyMotion(7);'}`, 'boss-death-motion.ts')).code;
  new Function(...Object.keys(bindings), code)(...Object.values(bindings));
  return { box, unit, canvas, played, state };
}

describe('待機改立繪的魔物：倒下時逐格畫布要掛回立繪框（爆炸看得到）', () => {
  it('鐵爪機關貓第二階段：打死時畫布掛回框、框標成有逐格，爆炸從頭演、整隻掛 motion-death', async () => {
    const { box, unit, canvas, played } = await runDeath('iron_claw_p2', { longDeath: true, hasKnockdown: true, staticIdleKind: true });
    expect(played).toEqual(['knockdown']);
    expect(canvas.parentNode).toBe(box);
    expect(box.classList.contains('has-enemy-motion')).toBe(true);
    expect(unit.classList.contains('motion-death')).toBe(true);
  });

  it('短倒下的（河童、盔甲幽靈那幾套）也一樣掛回去，不然倒下片段看不到、煙又被省掉', async () => {
    const { box, canvas, played } = await runDeath('kappa', { longDeath: false, hasKnockdown: true, staticIdleKind: true });
    expect(played).toEqual(['knockdown']);
    expect(canvas.parentNode).toBe(box);
    expect(box.classList.contains('has-enemy-motion')).toBe(true);
  });

  it('沒有倒下片段的（塔主第一階段那一套）照舊交還靜態：不掛畫布', async () => {
    const { box, canvas, played } = await runDeath('iron_claw', { longDeath: false, hasKnockdown: false, staticIdleKind: true });
    expect(played).toEqual([]);
    expect(canvas.parentNode).toBe(null);
    expect(box.classList.contains('has-enemy-motion')).toBe(false);
  });

  it('挨打：待機改立繪的一律不播（沒有挨打片段，播了只會抓走路圖集、空轉）；待機照播逐格的照舊播', async () => {
    const hidden = await runDeath('iron_claw_p2', { longDeath: true, hasKnockdown: true, staticIdleKind: true, call: "playEnemyMotion(7, 'hurt');" });
    expect(hidden.played).toEqual([]);
    expect(hidden.state.action).toBe('idle');
    // 出招中被反彈打到（畫布正掛在畫面上）：也不換成走路、不打斷收招（審查 低-2）
    const attacking = await runDeath('iron_claw_p2', { longDeath: true, hasKnockdown: true, staticIdleKind: true, attached: true, call: "playEnemyMotion(7, 'hurt');" });
    expect(attacking.played).toEqual([]);
    const roomba = await runDeath('roomba_king', { longDeath: true, hasKnockdown: true, staticIdleKind: false, attached: true, call: "playEnemyMotion(7, 'hurt');" });
    expect(roomba.played).toEqual(['hurt']);
  });

  it('畫布本來就在框裡（掃地機器人王，待機照播逐格）：不重掛，框裡還是只有那一張', async () => {
    const { box, canvas, played } = await runDeath('roomba_king', { longDeath: true, hasKnockdown: true, staticIdleKind: false, attached: true });
    expect(played).toEqual(['knockdown']);
    expect(box.children).toEqual([canvas]);
  });
});

/** 跑 mountEnemyMotion（連同它用到的 disposeEnemyMotion、playEnemyMotion 那幾段） */
const mountSource = sourceBetween('  const MOTION_DEATH_FADE_MS', '  app.disposers.push(() => {');

describe('建畫布時就帶要畫的動作（不留空畫布）', () => {
  async function mountChanged(falling: boolean) {
    const unit = fakeEl();
    const box = fakeEl() as FakeEl & { closest: () => FakeEl };
    box.closest = () => unit;
    unit.append(box);
    const oldCanvas = fakeEl();
    const created: { kind: string; options: unknown }[] = [];
    const newCanvas = fakeEl();
    // 原本掛著第一階段那一套；這一拍變成第二階段（換了一套），而且已經倒下
    const enemyMotionActors = new Map<number, unknown>([[7, { kind: 'iron_claw', action: 'idle', busyUntil: 0, actor: { element: oldCanvas, play() {}, pause() {}, dispose() {} } }]]);
    const e = { uid: 7, enemyId: 'iron_claw', phase: 1, dead: true, reviveIn: 0 };
    const bindings: Record<string, unknown> = {
      enemyMotionActors,
      root: { querySelector: () => box },
      qiuqiuEnemyMotionAllowed: () => true, motionEnabled: true, heroOf: () => 'ninja',
      qiuqiuEnemyMotionKind: (_id: string, phase: number) => (phase > 0 ? 'iron_claw_p2' : 'iron_claw'),
      enemyMotionReady: () => true, ensureEnemyMotion() {},
      fallingUids: new Set(falling ? [7] : []), willRevive: () => false,
      createEnemyMotionActor: (kind: string, options?: unknown) => {
        created.push({ kind, options });
        return { element: newCanvas, play() {}, pause() {}, dispose() {} };
      },
      isSideMotionKind: () => true, hurtSet: new Set(), acting: new Map(), enemyStaticPose: () => 'down',
      staticIdle: () => true, playsLongDeath: () => true,
      enemyMotionHas: (_k: string, a: string) => a !== 'hurt',
      enemyMotionDuration: () => 600, qiuqiuEnemyMotionHold: () => 2700, BOSS_DEATH_HOLD_MS: 400,
      motionImpactTimers: new Set(), cs: { phase: 'won', players: [] }, performance: { now: () => 1000 },
      window: { setTimeout: () => 1, clearTimeout() {} },
    };
    bindings.app = { cs: bindings.cs };
    const code = (await transformWithOxc(`${mountSource}\nmountEnemyMotion(e, box);`, 'boss-mount-motion.ts')).code;
    new Function(...Object.keys(bindings), 'e', 'box', code)(...Object.values(bindings), e, box);
    return { created, box, newCanvas, state: enemyMotionActors.get(7) as { action: string } };
  }

  it('已倒下（不在等倒下）時換了一套：建畫布就畫倒下，掛上去的不是空畫布', async () => {
    const { created, box, newCanvas, state } = await mountChanged(false);
    expect(created).toEqual([{ kind: 'iron_claw_p2', options: { action: 'knockdown' } }]);
    expect(state.action).toBe('knockdown');
    expect(newCanvas.parentNode).toBe(box);
  });

  it('還在等倒下：記成待機、畫布先不掛，倒下那一拍才從第一格開演', async () => {
    const { created, newCanvas, state } = await mountChanged(true);
    expect(created).toEqual([{ kind: 'iron_claw_p2', options: { action: 'idle' } }]);
    expect(state.action).toBe('idle');
    expect(newCanvas.parentNode).toBe(null);
  });
});

/** 開打那一段：第一階段那一套好了，才先下載下一階段 */
const prefetchSource = sourceBetween('    for (const enemy of cs.enemies) {\n      const now = ', '\n  }\n\n  const refreshMotion');

describe('塔主第二階段先下載：等第一階段好了才開始', () => {
  it('第一階段還沒好不先下載；好了才下載第二階段；沒有第二階段的不下載', async () => {
    let finish = (): void => {};
    const preloadCalls: string[][] = [];
    const prefetched: string[] = [];
    const bindings: Record<string, unknown> = {
      cs: { enemies: [{ enemyId: 'iron_claw', phase: 0 }, { enemyId: 'roomba_king', phase: 0 }] },
      qiuqiuEnemyMotionKind: (id: string, phase: number) => (id === 'iron_claw' ? (phase > 0 ? 'iron_claw_p2' : 'iron_claw') : id),
      preloadEnemyMotion: (kinds: string[]) => { preloadCalls.push(kinds); return new Promise<void>((r) => { finish = r; }); },
      prefetchEnemyMotion: (kind: string) => { prefetched.push(kind); return Promise.resolve(); },
    };
    const code = (await transformWithOxc(prefetchSource, 'boss-prefetch.ts')).code;
    new Function(...Object.keys(bindings), code)(...Object.values(bindings));
    expect(preloadCalls).toEqual([['iron_claw']]);
    await Promise.resolve();
    expect(prefetched).toEqual([]);
    finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(prefetched).toEqual(['iron_claw_p2']);
  });
});
