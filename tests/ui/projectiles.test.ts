/**
 * 丟出去的東西各飛各的（2026-09-22，批次 proj）。
 *
 * 原本：遠程牌與丟出去的忍具，飛出去的一律是手裏劍（球球）或飛針（菲菲）——聚葉成刀、毛球彈、撒手鐧飛手裏劍，
 * 毒丸彈、毒砂、絆索飛針，三連針在球球手上飛手裏劍；噹噹、封封丟東西時什麼都沒飛（連推掌、突刺都衝上前去）。
 *
 * 這支測試釘：
 *  1. 遠程牌 × 四隻貓：戰鬥畫面真正在跑的 `motionForCard` 選到「丟東西」那一套動作，而且飛出指定的東西、圖檔在；
 *     把飛什麼的表改回預設（手裏劍／飛針）、或把噹噹封封改回近身出招，這裡會紅。
 *  2. 丟出去的忍具 × 四隻貓：同上（戰鬥畫面的 `motionForPotion`）；不是丟的忍具什麼都不飛。
 *  3. 每一位拿得到的每一張牌：只要選到丟東西的動作，就一定有東西飛（不會空手丟）。
 *  4. 飛行：噹噹、封封從出手格那隻手放出去、命中時點才到；狀態類忍具照丟向誰飛、連線客戶端那一拍不先飛。
 *  5. 戰鬥畫面四條路（本機出牌、本機用忍具、連線重播、連線單張）都把「丟的是什麼」帶給結算。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import manifest from '../../public/assets/manifest.json';
import dangdangMotionData from '../../src/ui/dangdang-motion-data.json';
import fengfengMotionData from '../../src/ui/fengfeng-motion-data.json';
import { cards, starterDeckFor } from '../../src/content/cards';
import { potions, potionById } from '../../src/content/potions';
import { pickable, type Hero } from '../../src/engine/hero';
import { cardStats } from '../../src/engine/deck';
import type { CardDef } from '../../src/engine/types';
import { _setManifestForTest, hasHeroSprite, type Manifest } from '../../src/ui/assets';
import { preloadQiuqiuMotion, qiuqiuCardAction, qiuqiuPlayableAction } from '../../src/ui/qiuqiu-motion';
import {
  companionCardAction,
  companionImpactDelay,
  companionIsMelee,
  companionPlayableAction,
  companionThrowRelease,
  preloadCompanionMotion,
  type CompanionMotionKind,
} from '../../src/ui/companion-motion';
import { potionMotionAction } from '../../src/ui/potion-motion';
import { isFeifeiNeedleAction } from '../../src/ui/feifei-needle-patterns';
import {
  cardProjectile,
  isThrowAction,
  potionProjectile,
  resolveProjectileShot,
  shotAimsAt,
  shotUsedIn,
  type ProjectileKind,
} from '../../src/ui/projectile-kinds';
import { COMPANION_THROW_ORIGIN, PROJECTILE_LOOKS, joinElapsed, playThrow, throwLaunch } from '../../src/ui/projectile-flight';
import { motionMs } from '../../src/ui/motion-speed';

type Source = 'qiuqiu' | CompanionMotionKind;
const HEROES: readonly { hero: Hero; source: Source }[] = [
  { hero: 'ninja', source: 'qiuqiu' }, { hero: 'feifei', source: 'feifei' },
  { hero: 'dangdang', source: 'dangdang' }, { hero: 'fengfeng', source: 'fengfeng' },
];

/** 遠程牌 × 四隻貓飛什麼（照每位自己那張牌面插圖）；null＝這一位那張是近身出招、什麼都不飛 */
const CARD_EXPECT: Readonly<Record<Source, Readonly<Record<string, ProjectileKind | null>>>> = {
  // 拋爪：四位的牌面都是甩出去的帶繩飛爪（2026-09-23 批次 toss；原本球球、噹噹、封封近身出招，菲菲飛針）
  qiuqiu: {
    juye: 'leaf', luanwu: 'shuriken', 'luanwu+': 'shuriken', maoqiudan: 'furball_qiuqiu', sashoujian: 'kunai',
    paozhao: 'grapple', tieshazhang: null, qinna: null,
  },
  feifei: {
    juye: 'leaf', luanwu: 'shuriken', maoqiudan: 'poison_pill', sashoujian: 'kunai',
    tieshazhang: 'poison_sand', qinna: 'snare_cord', paozhao: 'grapple',
    // 她自己的針術牌、改成針術的共用牌照舊飛針
    feifei_feizhen: 'needle', feifei_zhenyu: 'needle', feifei_quansale: 'needle', dianxue: 'needle',
  },
  dangdang: {
    juye: 'leaf', maoqiudan: 'furball_dangdang', sashoujian: 'barrel', paozhao: 'grapple',
    // 他那張叫「橫掃千軍」，是掃堂帶過一圈（使用者 2026-09-17 改的名），沒有東西飛
    luanwu: null, tieshazhang: null, qinna: null,
  },
  fengfeng: {
    juye: 'leaf', luanwu: 'shuriken', maoqiudan: 'furball_fengfeng', sashoujian: 'barrel', paozhao: 'grapple',
    tieshazhang: null, qinna: null,
  },
};

/**
 * 出手前手上畫的東西（2026-09-23 美術盤點）：球球的擲手裏劍第 2、4 格手上是一枚手裏劍，
 * 菲菲的彈針、撒針手上是針；空手擲出（`toss`）與菲菲的反手甩（`needle_backhand`）手上是空的。
 * 其餘不在這張表的丟東西動作（噹噹推掌、封封劍刺）都只准當空手擲出還沒下載好時的替身。
 */
function heldInHand(source: Source, action: string): ProjectileKind | 'empty' | 'borrowed' {
  if (action === 'toss') return 'empty';
  if (source === 'qiuqiu') return action === 'shuriken' || action === 'ultimate_storm' ? 'shuriken' : 'borrowed';
  if (source === 'feifei') return action === 'needle_backhand' ? 'empty' : isFeifeiNeedleAction(action) ? 'needle' : 'borrowed';
  return 'borrowed';
}

/** 丟出去的忍具飛什麼（四位一樣）；列在後面的不是丟的，什麼都不飛 */
const POTION_EXPECT: Readonly<Record<string, ProjectileKind | null>> = {
  shuriken: 'shuriken', needle_rain: 'needle', firecracker: 'firecracker', rope: 'hemp_rope',
  smoke_bomb: 'smoke_bomb', nip_ball: 'nip_ball', bind_nail: 'bind_nail', rubble_bag: 'rubble',
  onigiri: null, quilt: null, claw_oil: null, iron_paw: null, pepper: null, tuna: null, armor_pick: null,
  // 2026-09-23 內容擴充第一批：火雷珠丟出去（全體），其餘九支都不是丟的（喝、撒、抹、吃）
  thunder_bead: 'thunder_bead',
  qi_tea: null, sword_talisman: null, spread_powder: null, needle_salve: null, iron_oil: null,
  payback_powder: null, dive_straw: null, decoy_doll: null, share_half: null,
  // 2026-09-23 內容擴充第二批：迷魂香丟出去（單體），其餘五支都不是丟的（點香、吃、照鏡子、吞丹、貼符）
  daze_incense: 'daze_incense',
  revive_incense: null, bento: null, demon_mirror: null, transfer_pill: null, swap_talisman: null,
};

class FakeImage {
  src = '';
  complete = true;
  naturalWidth = 1536;
  addEventListener(): void {}
}

beforeAll(async () => {
  _setManifestForTest(manifest as unknown as Manifest);
  vi.stubGlobal('Image', FakeImage);
  await Promise.all([preloadQiuqiuMotion(), ...(['feifei', 'dangdang', 'fengfeng'] as const).map((kind) => preloadCompanionMotion(kind))]);
  vi.unstubAllGlobals();
});

function branch(start: string, end: string): string {
  const src = SRC.replace(/\r\n/g, '\n');
  const first = src.indexOf(start);
  const last = src.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`combat.ts 找不到這一段：${start}`);
  return src.slice(first, last);
}

/** 戰鬥畫面的 `motionForCard`、`motionForPotion`、`projectileForCard`、`projectileForPotion` 原封不動摳出來跑 */
async function combat() {
  const code = [
    branch('const POSE = {', 'type PoseKey'),
    branch('const ATTACK_POSES = new Set', '/** 吃喝姿勢'),
    'let clawMotionIndex = 0;',
    branch('  const motionForCard = (', '  const scheduleMotionImpact = ('),
    'return { card: (q, card) => { clawMotionIndex = 0; return motionForCard(q, card); }, potion: motionForPotion, projectileForCard, projectileForPotion };',
  ].join('\n');
  const bindings = {
    hasHeroSprite, qiuqiuCardAction, qiuqiuPlayableAction, companionCardAction, companionPlayableAction, cardStats,
    potionById, potionMotionAction, cardProjectile, potionProjectile,
    motionEnabled: true,
    motionSourceFor: (q: { source: Source }) => q.source,
  };
  const compiled = await transformWithOxc(code, 'combat-projectiles.ts');
  type Card = { uid: number; cardId: string; upgraded: boolean };
  return new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as {
    card(q: { source: Source }, card: Card): string | undefined;
    potion(q: { source: Source }, id: string): string | undefined;
    projectileForCard(q: { source: Source }, card: Card, action: string | undefined): { kind: ProjectileKind } | undefined;
    projectileForPotion(id: string, target: number | undefined): { kind: ProjectileKind; aim?: string; target?: number } | undefined;
  };
}

function artExists(kind: ProjectileKind): boolean {
  const src = PROJECTILE_LOOKS[kind].src;
  if (!src) return kind === 'needle';   // 飛針是畫的，沒有圖檔
  return existsSync(new URL(`../../public/${src}`, import.meta.url));
}

function obtainable(hero: Hero): CardDef[] {
  const starter = new Set(starterDeckFor(hero));
  return cards.filter((def) => !def.keywords?.includes('不可打出')
    && (starter.has(def.id) || def.combatOnly || (def.pool !== '起手' && def.pool !== '壞毛病' && pickable(def, hero, 2))));
}

describe('遠程牌 × 四隻貓：各飛各的東西', () => {
  it.each(HEROES)('$hero：清單裡每張牌都選到丟東西的動作、飛出指定的東西、圖檔在', async ({ hero, source }) => {
    const c = await combat();
    const pool = new Set(obtainable(hero).map((def) => def.id));
    for (const [key, expected] of Object.entries(CARD_EXPECT[source])) {
      const upgraded = key.endsWith('+');
      const cardId = key.replace(/\+$/, '');
      expect(pool.has(cardId), `${hero} 拿得到 ${cardId}`).toBe(true);
      const card = { uid: 1, cardId, upgraded };
      const action = c.card({ source }, card);
      const shot = c.projectileForCard({ source }, card, action);
      expect(shot?.kind ?? null, `${hero} 的 ${key}（動作 ${action}）`).toBe(expected);
      if (expected) {
        expect(isThrowAction(source, action as never), `${hero} 的 ${key} 要原地丟出去`).toBe(true);
        expect(artExists(expected), `${expected} 的圖`).toBe(true);
        // 丟東西不衝上前（東西是丟出去的）
        if (source !== 'qiuqiu') expect(companionIsMelee(source, action as never), `${hero} 的 ${key}`).toBe(false);
      }
    }
  });

  it.each(HEROES)('$hero：拿得到的每一張牌，只要選到丟東西的動作就一定有東西飛', async ({ hero, source }) => {
    const c = await combat();
    const empty: string[] = [];
    for (const def of obtainable(hero)) {
      for (const upgraded of [false, true]) {
        const card = { uid: 1, cardId: def.id, upgraded };
        const action = c.card({ source }, card);
        if (action && isThrowAction(source, action as never) && !c.projectileForCard({ source }, card, action)) {
          empty.push(`${def.id}${upgraded ? '+' : ''} → ${action}`);
        }
      }
    }
    expect(empty).toEqual([]);
  });
});

describe('出手前手上拿的東西跟飛出去的對得上（2026-09-23 美術盤點 A1～A5）', () => {
  // 圖都到了（延後下載的空手擲出已經載好）：選到的一定是正式動作，不是替身
  it.each(HEROES)('$hero：每張牌、每支忍具，手上不是空的就一定跟飛出去的同一種東西', async ({ hero, source }) => {
    const c = await combat();
    const bad: string[] = [];
    const judge = (label: string, action: string | undefined, kind: ProjectileKind | undefined): void => {
      if (!action || !kind) return;
      const held = heldInHand(source, action);
      if (held === 'empty' || held === kind) return;
      bad.push(`${label}：動作 ${action}（手上 ${held}）飛 ${kind}`);
    };
    for (const def of obtainable(hero)) {
      for (const upgraded of [false, true]) {
        const card = { uid: 1, cardId: def.id, upgraded };
        const action = c.card({ source }, card);
        judge(`${def.id}${upgraded ? '+' : ''}`, action, c.projectileForCard({ source }, card, action)?.kind);
      }
    }
    for (const potion of potions) {
      const action = c.potion({ source }, potion.id);
      judge(potion.id, action, resolveProjectileShot(source, action as never, c.projectileForPotion(potion.id, 7) as never)?.kind);
    }
    expect(bad).toEqual([]);
  });

  it('拋爪四隻都原地丟、飛出帶繩飛爪', async () => {
    const c = await combat();
    for (const { source } of HEROES) {
      const card = { uid: 1, cardId: 'paozhao', upgraded: false };
      const action = c.card({ source }, card);
      expect(action, source).toBe('toss');
      expect(c.projectileForCard({ source }, card, action)?.kind, source).toBe('grapple');
      if (source !== 'qiuqiu') expect(companionIsMelee(source, 'toss'), source).toBe(false);
    }
    expect(artExists('grapple')).toBe(true);
  });
});

describe('丟出去的忍具 × 四隻貓', () => {
  it.each(HEROES)('$hero：每支丟出去的忍具都擲出去、飛指定的東西；不是丟的不飛', async ({ source }) => {
    const c = await combat();
    for (const [id, expected] of Object.entries(POTION_EXPECT)) {
      const action = c.potion({ source }, id);
      const given = c.projectileForPotion(id, 7);
      const shot = resolveProjectileShot(source, action as never, given as never);
      expect(shot?.kind ?? null, `${source} 用 ${id}（動作 ${action}）`).toBe(expected);
      if (expected) expect(artExists(expected), `${expected} 的圖`).toBe(true);
    }
  });

  it('丟向誰照忍具：單體帶選的那一隻、全體每一隻、煙霧彈丟在自己腳邊', () => {
    expect(potionProjectile(potionById.rope!, 7)).toEqual({ kind: 'hemp_rope', aim: 'enemy', target: 7, potion: 'rope' });
    expect(potionProjectile(potionById.bind_nail!, 7)).toEqual({ kind: 'bind_nail', aim: 'all', potion: 'bind_nail' });
    expect(potionProjectile(potionById.smoke_bomb!)).toEqual({ kind: 'smoke_bomb', aim: 'self', potion: 'smoke_bomb' });
    const rope = potionProjectile(potionById.rope!, 7);
    expect([7, 8].map((uid) => shotAimsAt(rope, uid))).toEqual([true, false]);
    expect([7, 8].map((uid) => shotAimsAt(potionProjectile(potionById.nip_ball!), uid))).toEqual([true, true]);
    expect(shotAimsAt(potionProjectile(potionById.smoke_bomb!), 7)).toBe(false);
    expect(shotAimsAt({ kind: 'leaf' }, 7)).toBe(false);   // 牌照命中紀錄，不走這條
  });

  it('連線客戶端送出那一拍（紀錄裡還沒「用了」）不先飛；主機套用那一拍才飛', () => {
    const rope = potionProjectile(potionById.rope!, 7);
    const name = (id: string) => potionById[id]?.name;
    expect(shotUsedIn(rope, [], name)).toBe(false);
    expect(shotUsedIn(rope, ['菲菲用了「麻繩」', '小老鼠兵掙脫了定身'], name)).toBe(true);
    expect(shotUsedIn(rope, ['菲菲用了「手裡劍」'], name)).toBe(false);
    expect(shotUsedIn({ kind: 'leaf' }, [], name)).toBe(true);
  });

  it('忍具總數沒變，丟的清單每一支都真的存在', () => {
    expect(potions).toHaveLength(51);   // 2026-09-23 內容擴充第一批 +10（其中丟的只有火雷珠）、第二批 +6（丟的只有迷魂香）；上面 POTION_EXPECT 有列
    for (const id of Object.keys(POTION_EXPECT)) expect(potionById[id], id).toBeDefined();
  });
});

describe('飛行物的圖', () => {
  it('每一種都有圖（飛針是畫的），檔案小（每張 10 KB 以內）', () => {
    for (const [kind, look] of Object.entries(PROJECTILE_LOOKS)) {
      if (!look.src) { expect(kind).toBe('needle'); continue; }
      const url = new URL(`../../public/${look.src}`, import.meta.url);
      expect(existsSync(url), kind).toBe(true);
      expect(readFileSync(url, 'latin1').length, kind).toBeLessThanOrEqual(10 * 1024);
    }
  });
});

describe('噹噹、封封從出手格那隻手丟出去', () => {
  // 出手＝那一格的開頭（1.5 倍速後）：噹噹推掌第 4 格、封封突刺第 3 格
  const frameStart = (frames: readonly { duration: number }[], index: number): number =>
    motionMs(frames.slice(0, index).reduce((sum, frame) => sum + frame.duration * 1000, 0));

  it('出手時點是出手那一格的開頭、命中＝出手＋飛行，飛行夠長看得到（至少 90 毫秒）', () => {
    expect(companionThrowRelease('dangdang', 'palm_throw')).toBe(frameStart(dangdangMotionData.actions.palm.frames, 3));
    expect(companionThrowRelease('fengfeng', 'thrust_throw')).toBe(frameStart(fengfengMotionData.actions.thrust.frames, 2));
    for (const [source, action] of [['dangdang', 'palm_throw'], ['fengfeng', 'thrust_throw']] as const) {
      const launch = throwLaunch(source, action)!;
      expect(launch.origin).toEqual(COMPANION_THROW_ORIGIN[source]);
      expect(launch.flightMs).toBeGreaterThanOrEqual(90);
      expect(companionThrowRelease(source, action)! + launch.flightMs).toBe(companionImpactDelay(source, action));
    }
    // 近身推掌、突刺照舊（命中點是手碰到魔物那一格）
    expect(companionImpactDelay('dangdang', 'palm')).toBe(motionMs(340));
    expect(companionIsMelee('dangdang', 'palm')).toBe(true);
    expect(companionIsMelee('fengfeng', 'thrust')).toBe(true);
    expect(throwLaunch('dangdang', 'palm')).toBeUndefined();
  });

  it('實際飛一趟：出手那一刻在手上、飛到才回呼命中、聚葉成刀一波三片', () => {
    let now = 0;
    const rafs = new Map<number, (t: number) => void>();
    let serial = 0;
    type Node = { tag: string; style: Record<string, string>; dataset: Record<string, string>; children: Node[]; src?: string;
      className?: string; append(child: Node): void; remove(): void; parent?: Node };
    const make = (tag: string): Node => {
      const node: Node = {
        tag, style: {}, dataset: {}, children: [],
        append(child) { child.parent = node; node.children.push(child); },
        remove() { if (node.parent) node.parent.children = node.parent.children.filter((c) => c !== node); },
      };
      return node;
    };
    const stage = make('stage');
    vi.stubGlobal('document', { createElement: make });
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => { rafs.set(++serial, cb); return serial; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafs.delete(id); });
    const step = (t: number) => { now = t; const pending = [...rafs.values()]; rafs.clear(); for (const cb of pending) cb(t); };
    try {
      const impact = companionImpactDelay('dangdang', 'palm_throw');
      const { flightMs } = throwLaunch('dangdang', 'palm_throw')!;
      const hits: number[] = [];
      const foot = { x: 200, y: 400 };
      playThrow(stage as never, 'dangdang', 'palm_throw', { kind: 'leaf' }, foot, { x: 800, y: 330 }, {
        waves: 1, impactTimes: [impact], onImpact: (wave) => hits.push(wave), onDone() {},
      });
      step(impact - flightMs - 1);
      expect(stage.children).toHaveLength(0);   // 還沒出手
      step(impact - flightMs);
      expect(stage.children).toHaveLength(1);
      const node = stage.children[0]!;
      expect(node.dataset.kind).toBe('leaf');
      expect(node.children).toHaveLength(3);
      expect(node.children.every((img) => String(img.src).includes('assets/motion/projectile/leaf'))).toBe(true);
      expect({ x: Number(node.dataset.x), y: Number(node.dataset.y) })
        .toEqual({ x: foot.x + COMPANION_THROW_ORIGIN.dangdang.x, y: foot.y + COMPANION_THROW_ORIGIN.dangdang.y });
      step(impact - 1);
      expect(hits).toEqual([]);
      expect(Number(node.dataset.x)).toBeGreaterThan(780);
      step(impact);
      expect(hits).toEqual([0]);
      expect(stage.children).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('連線加入方自己丟的：確認回來時出手格已過，照樣從手上飛完整一趟', () => {
  it('晚到的從第一波出手那一刻接著演；準時的（單人、開房方、看同伴）不動', () => {
    // 噹噹推掌丟東西：出手 193、命中 307；來回 380 毫秒才確認
    expect(joinElapsed(380, [307], 114)).toBe(193);
    expect(joinElapsed(380, [307, 400], 114)).toBe(193);   // 多波一起往後挪，間隔不變
    expect(joinElapsed(0, [307], 114)).toBe(0);
    expect(joinElapsed(150, [307], 114)).toBe(150);        // 還沒到出手格：照原本時間
  });

  it('實際跑：晚 380 毫秒才開始，東西仍從手上出去、飛滿一趟才命中', () => {
    let now = 1000;
    const rafs = new Map<number, (t: number) => void>();
    let serial = 0;
    type Node = { style: Record<string, string>; dataset: Record<string, string>; children: Node[]; src?: string;
      append(child: Node): void; remove(): void; parent?: Node };
    const make = (): Node => {
      const node: Node = { style: {}, dataset: {}, children: [],
        append(child) { child.parent = node; node.children.push(child); },
        remove() { if (node.parent) node.parent.children = node.parent.children.filter((c) => c !== node); } };
      return node;
    };
    const stage = make();
    vi.stubGlobal('document', { createElement: make });
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => { rafs.set(++serial, cb); return serial; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafs.delete(id); });
    const step = (t: number) => { now = t; const pending = [...rafs.values()]; rafs.clear(); for (const cb of pending) cb(t); };
    try {
      const impact = companionImpactDelay('dangdang', 'palm_throw');
      const { flightMs } = throwLaunch('dangdang', 'palm_throw')!;
      const hits: number[] = [];
      const foot = { x: 200, y: 400 };
      playThrow(stage as never, 'dangdang', 'palm_throw', { kind: 'furball_dangdang' }, foot, { x: 800, y: 330 }, {
        waves: 1, elapsed: 380, impactTimes: [impact], onImpact: (wave) => hits.push(wave), onDone() {},
      });
      step(1000);
      expect(hits).toEqual([]);
      const node = stage.children[0]!;
      expect(node.dataset.kind).toBe('furball_dangdang');
      expect(Number(node.dataset.x)).toBe(foot.x + COMPANION_THROW_ORIGIN.dangdang.x);
      step(1000 + flightMs - 1);
      expect(hits).toEqual([]);
      step(1000 + flightMs);
      expect(hits).toEqual([0]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('戰鬥畫面四條路都把「丟的是什麼」帶給結算', () => {
  const src = SRC.replace(/\r\n/g, '\n');
  it('本機出牌、本機用忍具、連線重播、連線單張', () => {
    expect(branch('  function drinkPotion(', '  function flyCard(')).toContain('impactProjectile: projectileForPotion(id, enemyUid)');
    expect(branch('  function play(', '  function onPotion(')).toContain('impactProjectile: projectileForCard(my(), card, motion)');
    expect(src).toContain('? projectileForPotion(frame.a.id, frame.a.g)\n                    : frame.card && frame.player ? projectileForCard(frame.player, frame.card, action) : undefined,');
    expect(src).toContain('impactProjectile: incomingMotion ? incomingMotion.projectile : ownImpactProjectile,');
    expect(src).toContain('ownImpactProjectile = projectileForPotion(a.id, a.g);');
    expect(src).toContain('ownImpactProjectile = card && me ? projectileForCard(me, card, localMotion.action) : undefined;');
  });

  it('結算飛東西一律走 playThrow；狀態類忍具照丟向誰排一波；煙霧彈丟在自己腳邊', () => {
    const settle = branch('  function settle(', '  function checkOver(');
    expect(settle).toContain('const shot = resolveProjectileShot(impactSource, impactMotion, opts.impactProjectile);');
    expect(settle).not.toContain('playQiuqiuShuriken(');
    expect(settle).not.toContain('playFeifeiNeedles(');
    expect(settle.match(/playThrow\(/g)).toHaveLength(2);
    expect(settle).toContain('if (impactPlan.length === 0 && shotAimsAt(shot, e.uid) && shotUsed && impactSource && impactMotion && !b.dead) {');
    expect(settle).toContain("if (shot?.aim === 'self' && shotUsed && throwFoot && impactSource && impactMotion) {");
    // 掙脫定身、上了減益：丟出去的忍具等東西飛到才演
    expect(settle).toContain('if (live && statusByFlight && wave === waves - 1) landStatus(live);');
    expect(settle).toContain('if (!statusByFlight) landStatus(node);');
  });
});
