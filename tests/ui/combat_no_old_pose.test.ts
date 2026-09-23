/**
 * 戰鬥裡不再跳回舊版靜態立繪（2026-09-22 晚，盤點 docs/審查報告/畫面盤點_2026-09-22.md 問題 1、2）。
 *
 * 原本：用忍具（煙霧彈、手裡劍、爪力膏、鞭炮、麻繩、三連針⋯⋯）只有吃的有逐格動作，其餘一按下去動作畫布收起來、
 * 舊立繪亮 0.7 秒，三連針還在舊「擲」與舊「爪擊」之間換三次；毛球彈四隻都會、聚葉成刀、鐵砂掌、擒拿手、撒手鐧、
 * 手裏劍亂舞、噹噹的貓抓打出去也一樣。
 *
 * 這支測試釘四件事：
 *  1. 四隻貓 × 各自拿得到的每一張牌（起手、獎勵、罐頭鋪、事件、連線牌，加上魔物塞進來、打得出去的黏液與眼冒金星）
 *     × 基礎版與升級版 × 延後下載的圖到了沒——戰鬥畫面真正在跑的 `motionForCard` 每一次都選到有素材、畫得出來的動作；
 *  2. 四隻貓 × 全部 35 種忍具，同上（戰鬥畫面的 `motionForPotion`）；
 *  3. 戰鬥畫面三條用忍具的路（本機、連線重播、連線單張）都走 `motionForPotion`，沒有「只有吃的才演」的舊寫法；
 *  4. 多段攻擊時兩張靜態立繪輪流換那段，逐格動作正在演就不換。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import manifest from '../../public/assets/manifest.json';
import extraMotionData from '../../src/ui/qiuqiu-extra-motion-data.json';
import feifeiMotionData from '../../src/ui/feifei-motion-data.json';
import dangdangMotionData from '../../src/ui/dangdang-motion-data.json';
import fengfengMotionData from '../../src/ui/fengfeng-motion-data.json';
import { cards, starterDeckFor } from '../../src/content/cards';
import { events } from '../../src/content/events';
import { potions, potionById } from '../../src/content/potions';
import { pickable, type Hero } from '../../src/engine/hero';
import { cardStats } from '../../src/engine/deck';
import type { CardDef } from '../../src/engine/types';
import { _setManifestForTest, hasHeroSprite, type Manifest } from '../../src/ui/assets';
import { qiuqiuChoreographyDuration, type QiuqiuPoseAction } from '../../src/ui/qiuqiu-choreography';
import {
  DEFERRED_QIUQIU_ACTIONS,
  preloadQiuqiuMotion,
  qiuqiuCardAction,
  qiuqiuHasOwnMotion,
  qiuqiuPlayableAction,
} from '../../src/ui/qiuqiu-motion';
import {
  DEFERRED_COMPANION_ACTIONS,
  companionCardAction,
  companionHasOwnMotion,
  companionPlayableAction,
  preloadCompanionMotion,
  type CompanionMotionAction,
  type CompanionMotionKind,
} from '../../src/ui/companion-motion';
import { potionMotionAction, potionMotionKind } from '../../src/ui/potion-motion';

type Source = 'qiuqiu' | CompanionMotionKind;
type Motion = { texture: string };

const HEROES: readonly { hero: Hero; source: Source }[] = [
  { hero: 'ninja', source: 'qiuqiu' }, { hero: 'feifei', source: 'feifei' },
  { hero: 'dangdang', source: 'dangdang' }, { hero: 'fengfeng', source: 'fengfeng' },
];

/** 延後下載的出牌動作圖（含 2026-09-23 的空手擲出）：測試用假影像靠它模擬「還在下載」 */
const DEFERRED_TEXTURES = [
  ...['taiji', 'qinggong', 'focus', 'scroll', 'toss'].map((a) => (extraMotionData.actions as Record<string, Motion>)[a]!.texture),
  ...['roar', 'taiji', 'toss'].map((a) => (feifeiMotionData.actions as Record<string, Motion>)[a]!.texture),
  ...['toss'].map((a) => (dangdangMotionData.actions as Record<string, Motion>)[a]!.texture),
  ...['roar', 'taiji', 'toss'].map((a) => (fengfengMotionData.actions as Record<string, Motion>)[a]!.texture),
].map((texture) => `/${texture}`);

const pending = new Set<string>();
class FakeImage {
  src = '';
  get complete(): boolean { return !pending.has(this.src); }
  get naturalWidth(): number { return pending.has(this.src) ? 0 : 1536; }
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

/** 把 combat.ts 的 `motionForCard`、`motionForPotion`（連同它們讀的姿勢表）原封不動摳出來執行 */
async function combatMotion() {
  const code = [
    branch('const POSE = {', 'type PoseKey'),
    branch('const ATTACK_POSES = new Set', '/** 吃喝姿勢'),
    'let clawMotionIndex = 0;',
    branch('  const motionForCard = (', '  const scheduleMotionImpact = ('),
    'return { card: (q, card) => { clawMotionIndex = 0; return motionForCard(q, card); }, potion: motionForPotion };',
  ].join('\n');
  const bindings = {
    hasHeroSprite, qiuqiuCardAction, qiuqiuPlayableAction, companionCardAction, companionPlayableAction, cardStats,
    potionById, potionMotionAction,
    motionEnabled: true,
    motionSourceFor: (q: { source: Source }) => q.source,
  };
  const compiled = await transformWithOxc(code, 'combat-no-old-pose.ts');
  return new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as {
    card(q: { source: Source }, card: { uid: number; cardId: string; upgraded: boolean }): string | undefined;
    potion(q: { source: Source }, id: string): string | undefined;
  };
}

/**
 * 這位拿得到、打得出去的每一張牌：起手十張＋獎勵／罐頭鋪／事件池（忍術、絕學，兩人局才有的連線牌也算），
 * 再加魔物塞進牌堆、打得出去的戰鬥雜牌（黏液、眼冒金星）。壞毛病不可打出，打不出去就不會出招。
 */
function obtainable(hero: Hero): CardDef[] {
  const starter = new Set(starterDeckFor(hero));
  return cards.filter((def) => !def.keywords?.includes('不可打出')
    && (starter.has(def.id) || def.combatOnly || (def.pool !== '起手' && def.pool !== '壞毛病' && pickable(def, hero, 2))));
}

/** 有沒有自己的逐格素材（不算退回一般待機）；組合動作（分身連打、菲菲的毒分身）也算有 */
function ownMotion(source: Source, action: string): boolean {
  if (source === 'qiuqiu') {
    return qiuqiuHasOwnMotion(action as QiuqiuPoseAction) || qiuqiuChoreographyDuration(action as never) !== null;
  }
  if (source === 'feifei' && action === 'clone') return true;
  return companionHasOwnMotion(source, action as CompanionMotionAction);
}

/** 這個動作現在畫得出來嗎：延後下載的圖還沒到就畫不出來（畫布會停在上一個動作的最後一格） */
function drawableNow(source: Source, action: string): boolean {
  const deferred = source === 'qiuqiu' ? DEFERRED_QIUQIU_ACTIONS : DEFERRED_COMPANION_ACTIONS;
  return pending.size === 0 || !deferred.has(action);
}

/** 退回舊立繪的情形：選不到動作、選到沒有素材的動作、選到還沒下載好的動作 */
function fallsBack(source: Source, action: string | undefined): boolean {
  return action === undefined || !ownMotion(source, action) || !drawableNow(source, action);
}

const STATES = [
  { label: '延後下載的圖還沒到', set: () => { for (const t of DEFERRED_TEXTURES) pending.add(t); } },
  { label: '圖都到了', set: () => pending.clear() },
] as const;

describe('四隻貓 × 拿得到的每一張牌：出牌不會退回舊姿勢立繪', () => {
  it('牌表有照實列：事件直接給的牌、魔物塞的戰鬥雜牌都在裡面', () => {
    for (const { hero } of HEROES) {
      const ids = new Set(obtainable(hero).map((def) => def.id));
      expect(ids.has('slime_card'), hero).toBe(true);
      expect(ids.has('dazed_card'), hero).toBe(true);
      for (const id of starterDeckFor(hero)) expect(ids.has(id), `${hero} 起手 ${id}`).toBe(true);
    }
    // 事件的 addCard（含賭一把的輸贏兩邊）：打得出去的都要在拿得到那位的牌表裡
    type Fx = { kind: string; cardId?: string; win?: Fx[]; lose?: Fx[] };
    const flat = (list: readonly Fx[]): Fx[] => list.flatMap((fx) => [fx, ...flat(fx.win ?? []), ...flat(fx.lose ?? [])]);
    const given = events.flatMap((ev) => ev.choices.flatMap((choice) => flat(choice.outcome as Fx[])
      .filter((fx) => fx.kind === 'addCard' && fx.cardId)
      .map((fx) => ({ hero: (ev as { hero?: Hero }).hero, cardId: fx.cardId! }))));
    expect(given.length).toBeGreaterThan(5);
    for (const { hero, cardId } of given) {
      if (cards.find((def) => def.id === cardId)?.keywords?.includes('不可打出')) continue;
      for (const h of hero ? [hero] : HEROES.map((one) => one.hero)) {
        expect(obtainable(h).some((def) => def.id === cardId), `${h} 事件給的 ${cardId}`).toBe(true);
      }
    }
  });

  for (const state of STATES) {
    it.each(HEROES)(`$hero（${state.label}）：每張牌的基礎版與升級版都選到畫得出來的逐格動作`, async ({ hero, source }) => {
      state.set();
      const motion = await combatMotion();
      const bad: string[] = [];
      for (const def of obtainable(hero)) {
        for (const upgraded of [false, true]) {
          const action = motion.card({ source }, { uid: 1, cardId: def.id, upgraded });
          if (fallsBack(source, action)) bad.push(`${def.id}${upgraded ? '+' : ''}（${def.name}）→ ${action}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }

  it('盤點點名跳回舊立繪的那幾張，現在各自接到指定的出手動作', async () => {
    pending.clear();
    const motion = await combatMotion();
    const play = (source: Source, cardId: string) => motion.card({ source }, { uid: 1, cardId, upgraded: false });
    // 毛球彈四隻都會。2026-09-23（批次 toss）起四隻都是空手擲出：原本球球擲手裏劍、菲菲彈針（出手前手上的東西不對），
    // 噹噹、封封是原地推掌、原地一刺
    for (const source of ['qiuqiu', 'feifei', 'dangdang', 'fengfeng'] as const) expect(play(source, 'maoqiudan'), source).toBe('toss');
    // 球球聚葉成刀；菲菲鐵砂掌（毒砂）、擒拿手（絆索，反手甩、手上本來就空）；封封撒手鐧、手裏劍亂舞
    expect(play('qiuqiu', 'juye')).toBe('toss');
    expect(play('feifei', 'tieshazhang')).toBe('toss');
    expect(play('feifei', 'qinna')).toBe('needle_backhand');
    expect(play('fengfeng', 'sashoujian')).toBe('toss');
    expect(play('fengfeng', 'luanwu')).toBe('toss');
    // 噹噹的貓抓：正常玩拿不到（球球的起手牌），盤點是硬塞進去測的；照規則也配得到
    expect(play('dangdang', 'sanjo')).toBe('palm');
    // 黏液、眼冒金星：噹噹原本列在不配動作的名單裡
    expect(play('dangdang', 'slime_card')).toBe('focus');
    expect(play('dangdang', 'dazed_card')).toBe('focus');
  });
});

describe('四隻貓 × 35 種忍具：用忍具不會退回舊姿勢立繪', () => {
  it('忍具總表 35 種，每種都分得到類別', () => {
    expect(potions).toHaveLength(35);
    for (const potion of potions) expect(['eat', 'throw', 'guard', 'draw', 'cast']).toContain(potionMotionKind(potion));
  });

  for (const state of STATES) {
    it.each(HEROES)(`$hero（${state.label}）：每種忍具都選到畫得出來的逐格動作`, async ({ source }) => {
      state.set();
      const motion = await combatMotion();
      const bad = potions
        .map((potion) => ({ id: potion.id, action: motion.potion({ source }, potion.id) }))
        .filter(({ action }) => fallsBack(source, action))
        .map(({ id, action }) => `${id} → ${action}`);
      expect(bad).toEqual([]);
    });
  }

  it('盤點點名的六種：丟的擲出去、其餘施術；吃的照舊吃、小被子擺架式', async () => {
    pending.clear();
    const motion = await combatMotion();
    const use = (source: Source, id: string) => motion.potion({ source }, id);
    // 2026-09-22 批次 proj：煙霧彈、鞭炮、麻繩是丟出去的（原本施術）。2026-09-23（批次 toss）起丟的一律空手擲出，
    // 只有球球丟手裡劍照舊擲手裏劍（手上那枚剛好對）；菲菲的麻繩反手甩出去、三連針用連針
    expect(['smoke_bomb', 'shuriken', 'claw_oil', 'firecracker', 'rope', 'needle_rain'].map((id) => use('qiuqiu', id)))
      .toEqual(['toss', 'shuriken', 'seal', 'toss', 'toss', 'toss']);
    expect(['smoke_bomb', 'shuriken', 'claw_oil', 'firecracker', 'rope', 'needle_rain'].map((id) => use('feifei', id)))
      .toEqual(['toss', 'toss', 'seal', 'toss', 'needle_backhand', 'needle_combo']);
    // 噹噹、封封原本沒有投擲動作、借原地推掌與原地一刺；2026-09-23 起有自己的空手擲出。施術用運氣
    expect(['smoke_bomb', 'shuriken', 'claw_oil', 'needle_rain'].map((id) => use('dangdang', id)))
      .toEqual(['toss', 'toss', 'focus', 'toss']);
    expect(['smoke_bomb', 'shuriken', 'claw_oil', 'needle_rain'].map((id) => use('fengfeng', id)))
      .toEqual(['toss', 'toss', 'focus', 'toss']);
    for (const { source } of HEROES) {
      expect(use(source, 'onigiri'), source).toBe('eat');
      expect(use(source, 'nine_lives'), source).toBe('eat');
      expect(use(source, 'quilt'), source).toBe('guard');
      expect(use(source, 'iron_salve'), source).toBe('guard');
    }
    // 半卷殘頁會抽牌：球球翻卷軸（延後下載的圖，還沒到就先結印）
    expect(use('qiuqiu', 'secret_scroll')).toBe('scroll');
    for (const t of DEFERRED_TEXTURES) pending.add(t);
    expect(use('qiuqiu', 'secret_scroll')).toBe('seal');
    pending.clear();
  });
});

describe('戰鬥畫面三條用忍具的路都走同一套動作', () => {
  const src = SRC.replace(/\r\n/g, '\n');

  it('本機、連線重播、連線單張都叫 motionForPotion，沒有「只有吃的才演」的舊寫法', () => {
    expect(branch('  function drinkPotion(', '  function flyCard(')).toContain('const motion = motionForPotion(my(), id);');
    expect(src).toContain('action ??= motionForPotion(frame.player, frame.a.id);');
    expect(src).toContain('const action = motionForPotion(q, a.id);');
    // 原本三處都寫成「吃的才給 eat」：拿掉之後，EAT_POTIONS 只剩靜態立繪的退路（potionPose）在用
    expect(src).not.toMatch(/EAT_POTIONS\.has\([^)]*\)\s*\)?\s*(\?|\{)/);
    expect(src.match(/EAT_POTIONS\.has\(/g)).toHaveLength(1);
    expect(branch('function potionPose(', '/** 出手時該用')).toContain('EAT_POTIONS.has(id)');
  });

  it('連線重播時丟出去的忍具也算出手（跟本機 potionPose 的 attack 一樣），傷害才排得到打中那一拍', () => {
    expect(src).toContain('attack = !!potionPose(heroOf(frame.player), frame.a.id).attack;');
    expect(src).toContain('incomingMotion = { seat: a.seat, action, attack: !!potionPose(heroOf(q), a.id).attack,');
  });
});

describe('多段攻擊的兩張靜態立繪輪流換：逐格動作在演就不換', () => {
  async function alternation(active: boolean) {
    const timers: number[] = [];
    const code = [
      'let seq = 0;',
      'return () => {',
      branch('    const mine = ++seq;', '    // 蜷縮加上去的當下'),
      '};',
    ].join('\n');
    const POSE = { claw: 'hero/ninja_claw', attack: 'hero/ninja_attack' };
    const bindings = {
      opts: { attack: true }, stagedMax: 3, pose: POSE.claw, POSE, ATTACK_POSES: new Set([POSE.claw, POSE.attack]),
      motionActors: new Map([[0, { active }]]), mySeat: 0,
      hasHeroSprite: () => true, my: () => ({ hero: 'ninja' }), heroArtUrl: (_hero: string, key: string) => key,
      window: { setTimeout: (_fn: () => void, ms: number) => { timers.push(ms); return timers.length; } },
      root: { querySelector: () => null }, MINE: '.mine', app: { cs: null }, cs: null,
    };
    const compiled = await transformWithOxc(code, 'combat-alternation.ts');
    (new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as () => void)();
    return timers;
  }

  it('三段攻擊、逐格動作正在演：不排任何換圖', async () => {
    expect(await alternation(true)).toEqual([]);
  });

  it('逐格動作沒在演（素材還沒載好、退回靜態演出）：照舊兩張輪流換', async () => {
    expect(await alternation(false)).toEqual([150, 300]);
  });
});
