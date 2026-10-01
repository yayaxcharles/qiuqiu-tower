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

  it('挨打：站著交還立繪時不播（沒有挨打片段，播了只會在背景抓走路圖集、空轉）；畫布在畫面上、待機照播的照舊播', async () => {
    const hidden = await runDeath('iron_claw_p2', { longDeath: true, hasKnockdown: true, staticIdleKind: true, call: "playEnemyMotion(7, 'hurt');" });
    expect(hidden.played).toEqual([]);
    expect(hidden.state.action).toBe('idle');
    const roomba = await runDeath('roomba_king', { longDeath: true, hasKnockdown: true, staticIdleKind: false, attached: true, call: "playEnemyMotion(7, 'hurt');" });
    expect(roomba.played).toEqual(['hurt']);
  });

  it('畫布本來就在框裡（掃地機器人王，待機照播逐格）：不重掛，框裡還是只有那一張', async () => {
    const { box, canvas, played } = await runDeath('roomba_king', { longDeath: true, hasKnockdown: true, staticIdleKind: false, attached: true });
    expect(played).toEqual(['knockdown']);
    expect(box.children).toEqual([canvas]);
  });
});
