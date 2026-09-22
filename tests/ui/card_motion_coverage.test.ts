/**
 * 出牌動作補齊（2026-09-22）：原本球球 70 張、菲菲 28 張、封封 18 張牌出牌時選不到新版逐格動作，
 * 動作畫布收起來、舊版靜態立繪亮 0.65 秒，畫風跳一下（盤點 docs/審查報告/缺動作的牌_2026-09-21.md）。
 *
 * 這支測試釘五件事：
 *  1. 戰鬥畫面真正在跑的 `motionForCard`（直接從 combat.ts 摳出來執行）對四隻貓每張打得出去的牌都選到
 *     有素材的動作——舊寫法這 116 張會回 undefined 而失敗；刻意不配的 8 張遠程暗器牌逐張列出理由；
 *  2. 八套新圖各自接到哪些牌（照規則：招式家族、牌型、效果），吼、太極、輕功沒有被通用動作吃掉；
 *  3. 新圖延後下載、不進解碼預載；圖還沒到時交還靜態立繪（比照待機狀態的 drawable），到了就用新動作；
 *  4. 動作長度照一般速度、原地演出不算近戰、獅吼功有命中時間；輕功騰空格留得住跳起來的高度；
 *  5. 新舊動作圖的雜湊都跟打包紀錄一致（既有圖一個位元都沒動）。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { motionMs } from '../../src/ui/motion-speed';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import manifest from '../../public/assets/manifest.json';
import extraMotionData from '../../src/ui/qiuqiu-extra-motion-data.json';
import feifeiMotionData from '../../src/ui/feifei-motion-data.json';
import fengfengMotionData from '../../src/ui/fengfeng-motion-data.json';
import cardMotionRecord from '../../docs/card-motion-assets.json';
import { cards, starterDeckFor } from '../../src/content/cards';
import { pickable, type Hero } from '../../src/engine/hero';
import { cardStats } from '../../src/engine/deck';
import type { CardDef } from '../../src/engine/types';
import { _setManifestForTest, hasHeroSprite, type Manifest } from '../../src/ui/assets';
import { qiuqiuChoreographyDuration, type QiuqiuPoseAction } from '../../src/ui/qiuqiu-choreography';
import {
  DEFERRED_QIUQIU_CARD_ACTIONS,
  preloadQiuqiuMotion,
  qiuqiuMotionReady,
  qiuqiuCardAction,
  qiuqiuCardMotionPlayable,
  qiuqiuHasOwnMotion,
  qiuqiuIsMelee,
  qiuqiuMotionDuration,
  type QiuqiuAction,
} from '../../src/ui/qiuqiu-motion';
import {
  DEFERRED_COMPANION_CARD_ACTIONS,
  companionCardAction,
  companionCardMotionPlayable,
  companionHasOwnMotion,
  companionImpactTimes,
  companionIsMelee,
  companionMotionDuration,
  preloadCompanionMotion,
  companionMotionReady,
  type CompanionMotionAction,
  type CompanionMotionKind,
} from '../../src/ui/companion-motion';

type Source = 'qiuqiu' | CompanionMotionKind;
type Frame = { rect: number[]; pivot: number[]; duration: number };
type Motion = { texture: string; loop: boolean; frames: Frame[]; impactTimes?: number[] };

const HEROES: readonly { hero: Hero; source: Source }[] = [
  { hero: 'ninja', source: 'qiuqiu' }, { hero: 'feifei', source: 'feifei' },
  { hero: 'dangdang', source: 'dangdang' }, { hero: 'fengfeng', source: 'fengfeng' },
];

/** 刻意不配動作的牌（維持靜態立繪）：卡圖是遠程暗器，要另畫投擲動作與投射物，不能硬套近身或針術。 */
const DELIBERATELY_STATIC: Readonly<Record<Source, Readonly<Record<string, string>>>> = {
  qiuqiu: { juye: '聚葉成刀：卡圖是葉片飛刃', maoqiudan: '毛球彈：卡圖是丟出去的毛球' },
  feifei: { tieshazhang: '毒砂：撒出去的毒砂', maoqiudan: '毒丸彈：丟出去的毒丸', qinna: '絆索：甩出去的繩索' },
  dangdang: {},
  fengfeng: { luanwu: '手裏劍亂舞：環繞的手裏劍', maoqiudan: '毛球彈：毛球', sashoujian: '撒手鐧：甩出去的木桶' },
};

/** 八套新圖的貼圖網址（測試用假影像靠它分辨「還沒下載好」） */
const NEW_TEXTURES = [
  ...['taiji', 'qinggong', 'focus', 'scroll'].map((a) => (extraMotionData.actions as Record<string, Motion>)[a]!.texture),
  ...['roar', 'taiji'].map((a) => (feifeiMotionData.actions as Record<string, Motion>)[a]!.texture),
  ...['roar', 'taiji'].map((a) => (fengfengMotionData.actions as Record<string, Motion>)[a]!.texture),
].map((texture) => `/${texture}`);

const pending = new Set<string>();
class FakeImage {
  src = '';
  get complete(): boolean { return !pending.has(this.src); }
  get naturalWidth(): number { return pending.has(this.src) ? 0 : 1536; }
  addEventListener(): void {}   // 還在下載的新圖永遠等不到 load
}

beforeAll(async () => {
  _setManifestForTest(manifest as unknown as Manifest);
  // 假裝新圖還在背景下載：預載只解碼原本那批，延後的圖建立了但還沒到
  for (const src of NEW_TEXTURES) pending.add(src);
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

/** 把 combat.ts 的 `motionForCard`（連同它讀的姿勢表）原封不動摳出來執行 */
async function combatMotionForCard() {
  const code = [
    branch('const POSE = {', 'type PoseKey'),
    branch('const ATTACK_POSES = new Set', '/** 吃喝姿勢'),
    'let clawMotionIndex = 0;',
    branch('  const motionForCard = (', '  const scheduleMotionImpact = ('),
    'return (q, card) => { clawMotionIndex = 0; return motionForCard(q, card); };',
  ].join('\n');
  const bindings = {
    hasHeroSprite, qiuqiuCardAction, qiuqiuCardMotionPlayable, companionCardAction, companionCardMotionPlayable, cardStats,
    motionEnabled: true,
    motionSourceFor: (q: { source: Source }) => q.source,
    companionKind: (source: CompanionMotionKind) => source,
  };
  const compiled = await transformWithOxc(code, 'combat-card-motion.ts');
  return new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as
    (q: { source: Source }, card: { uid: number; cardId: string; upgraded: boolean }) => string | undefined;
}

/** 這位拿得到、打得出去的牌：起手牌＋獎勵／罐頭鋪／事件池（忍術、絕學，含連線牌）；不含詛咒、戰鬥雜牌、不可打出的 */
function deckCards(hero: Hero): CardDef[] {
  const starter = new Set(starterDeckFor(hero));
  return cards.filter((def) => def.pool !== '壞毛病' && !def.combatOnly && !def.keywords?.includes('不可打出')
    && (starter.has(def.id) || (def.pool !== '起手' && pickable(def, hero, 2))));
}

/** 有沒有自己的逐格素材（不算退回一般待機）；組合動作（分身連打、菲菲的毒分身）也算有 */
function ownMotion(source: Source, action: string): boolean {
  if (source === 'qiuqiu') {
    return qiuqiuHasOwnMotion(action as QiuqiuPoseAction) || qiuqiuChoreographyDuration(action as QiuqiuAction) !== null;
  }
  if (source === 'feifei' && action === 'clone') return true;
  return companionHasOwnMotion(source, action as CompanionMotionAction);
}

describe('新圖還沒下載好：交還靜態立繪，不停在上一個動作的最後一格', () => {
  it('圖還沒到時新動作選不到、預載的沿用動作照播；圖到了就用新動作', async () => {
    const motionForCard = await combatMotionForCard();
    const play = (source: Source, cardId: string) => motionForCard({ source }, { uid: 1, cardId, upgraded: false });
    // 還沒到：太極、輕功、運氣、翻卷軸、吼（同伴）交還靜態立繪
    expect(play('qiuqiu', 'tuishou')).toBeUndefined();
    expect(play('qiuqiu', 'qinggong')).toBeUndefined();
    expect(play('qiuqiu', 'huxin')).toBeUndefined();
    expect(play('qiuqiu', 'qianliyan')).toBeUndefined();
    expect(play('feifei', 'weihe')).toBeUndefined();
    expect(play('fengfeng', 'yide')).toBeUndefined();
    for (const action of DEFERRED_QIUQIU_CARD_ACTIONS) expect(qiuqiuCardMotionPlayable(action as QiuqiuAction)).toBe(false);
    // 沿用的動作跟著預載，不受影響
    expect(play('qiuqiu', 'jinzhong')).toBe('guard');
    expect(play('qiuqiu', 'dingshen')).toBe('seal');
    expect(play('qiuqiu', 'weihe')).toBe('roar');
    expect(play('feifei', 'gaotui')).toBe('roll');
    expect(play('fengfeng', 'gaotui')).toBe('dodge');
    // 圖到了（背景下載完成）：下一張牌就用新動作
    pending.clear();
    expect(play('qiuqiu', 'tuishou')).toBe('taiji');
    expect(play('qiuqiu', 'qinggong')).toBe('qinggong');
    expect(play('qiuqiu', 'huxin')).toBe('focus');
    expect(play('qiuqiu', 'qianliyan')).toBe('scroll');
    expect(play('feifei', 'weihe')).toBe('roar');
    expect(play('fengfeng', 'yide')).toBe('taiji');
  });

  it('新圖不進解碼預載（預載完才在背景下載、排進背景解開）', () => {
    expect([...DEFERRED_QIUQIU_CARD_ACTIONS].sort()).toEqual(['focus', 'qinggong', 'scroll', 'taiji']);
    expect([...DEFERRED_COMPANION_CARD_ACTIONS].sort()).toEqual(['roar', 'taiji']);
    // beforeAll 裡新圖一直沒載好（load 永遠不來），預載照樣完成＝預載沒有等它們
    expect(qiuqiuMotionReady()).toBe(true);
    for (const kind of ['feifei', 'dangdang', 'fengfeng'] as const) expect(companionMotionReady(kind)).toBe(true);
  });
});

describe('每張打得出去的牌都選到有素材的動作', () => {
  beforeAll(() => { pending.clear(); });

  it.each(HEROES)('$hero：基礎版與升級版都選得到（刻意不配的遠程暗器牌除外）', async ({ hero, source }) => {
    const motionForCard = await combatMotionForCard();
    const missing: string[] = [];
    const statics: string[] = [];
    for (const def of deckCards(hero)) {
      for (const upgraded of [false, true]) {
        const action = motionForCard({ source }, { uid: 1, cardId: def.id, upgraded });
        if (DELIBERATELY_STATIC[source][def.id]) {
          if (action !== undefined) statics.push(`${def.id}${upgraded ? '+' : ''} → ${action}`);
          continue;
        }
        if (action === undefined || !ownMotion(source, action)) missing.push(`${def.id}${upgraded ? '+' : ''}（${def.name}）→ ${action}`);
      }
    }
    expect(missing).toEqual([]);
    expect(statics).toEqual([]);
    // 刻意不配的牌確實在這位的牌池裡（列了就要真的存在，免得清單過期）
    const pool = new Set(deckCards(hero).map((def) => def.id));
    for (const id of Object.keys(DELIBERATELY_STATIC[source])) expect(pool.has(id), `${hero} 的 ${id}`).toBe(true);
  });

  it('八套新圖各自接到規則指定的牌（招式家族、牌型、效果），吼、太極、輕功沒有被通用動作吃掉', async () => {
    const motionForCard = await combatMotionForCard();
    const using = (hero: Hero, source: Source, action: string) => deckCards(hero)
      .filter((def) => motionForCard({ source }, { uid: 1, cardId: def.id, upgraded: false }) === action)
      .map((def) => def.id).sort();
    const taiji = ['fanzhua', 'jieli', 'shuaiguo', 'tuishou', 'yide'];
    expect(using('ninja', 'qiuqiu', 'taiji')).toEqual(taiji);
    expect(using('ninja', 'qiuqiu', 'qinggong')).toEqual(['diaohu', 'gaotui', 'qinggong', 'taxue', 'yixing', 'zhanshu']);
    // 能力牌一律運氣：球球牌池裡的能力牌，除了原本就逐張指定結印的影子分身
    expect(using('ninja', 'qiuqiu', 'focus')).toEqual(deckCards('ninja')
      .filter((def) => def.type === '能力' && def.id !== 'yingzi').map((def) => def.id).sort());
    expect(qiuqiuCardAction('yingzi', undefined, 0)).toBe('seal');
    expect(using('ninja', 'qiuqiu', 'focus')).toHaveLength(13);
    expect(using('ninja', 'qiuqiu', 'scroll')).toEqual(['doumao', 'qianliyan', 'tuozi', 'zhexienixianchi']);
    // 吼：技能四張沿用獅吼功那套，攻擊牌獅吼功本身照舊
    expect(using('ninja', 'qiuqiu', 'roar')).toEqual(['boming', 'chudashi', 'shihou', 'weihe', 'youcike']);
    for (const [hero, source] of [['feifei', 'feifei'], ['fengfeng', 'fengfeng']] as const) {
      expect(using(hero, source, 'roar'), hero).toEqual(['boming', 'chudashi', 'shihou', 'weihe', 'youcike']);
      expect(using(hero, source, 'taiji'), hero).toEqual(taiji);
    }
    expect(using('feifei', 'feifei', 'roll')).toEqual(['diaohu', 'feifei_lakai', 'gaotui', 'yixing', 'zhanshu']);
    expect(using('fengfeng', 'fengfeng', 'dodge')).toEqual(['diaohu', 'gaotui', 'yixing', 'zhanshu']);
    // 借力使力（攻擊牌裡的太極）沿用既有攻擊
    expect(motionForCard({ source: 'feifei' }, { uid: 1, cardId: 'jiedao', upgraded: false })).toBe('kick');
    expect(motionForCard({ source: 'fengfeng' }, { uid: 1, cardId: 'jiedao', upgraded: false })).toBe('retreat_thrust');
    // 菲菲逐張指定的三張：點穴一針、十二連環全撒、撒手鐧飛針
    expect(motionForCard({ source: 'feifei' }, { uid: 1, cardId: 'dianxue', upgraded: false })).toBe('needle_pierce');
    expect(motionForCard({ source: 'feifei' }, { uid: 1, cardId: 'shierlian', upgraded: false })).toBe('needle_barrage');
    expect(motionForCard({ source: 'feifei' }, { uid: 1, cardId: 'sashoujian', upgraded: false })).toBe('shuriken');
  });
});

describe('新動作的長度、近戰與命中時間', () => {
  it('照一般速度編寫（跟既有動作同一個尺度），載入時跟全部動作一起加快 1.5 倍（motion-speed.ts）', () => {
    expect(qiuqiuMotionDuration('taiji')).toBe(motionMs(800));
    expect(qiuqiuMotionDuration('qinggong')).toBe(motionMs(730));
    expect(qiuqiuMotionDuration('focus')).toBe(motionMs(800));
    expect(qiuqiuMotionDuration('scroll')).toBe(motionMs(800));
    expect(companionMotionDuration('feifei', 'roar')).toBe(motionMs(780));
    expect(companionMotionDuration('feifei', 'taiji')).toBe(motionMs(800));
    // 封封的吼、太極不是劍招，播完不接收劍
    expect(companionMotionDuration('fengfeng', 'roar')).toBe(motionMs(780));
    expect(companionMotionDuration('fengfeng', 'taiji')).toBe(motionMs(800));
  });

  it('都是原地演出，不算近戰；獅吼功命中在吼出來那一拍', () => {
    for (const action of ['taiji', 'qinggong', 'focus', 'scroll'] as const) expect(qiuqiuIsMelee(action), action).toBe(false);
    for (const kind of ['feifei', 'fengfeng'] as const) {
      expect(companionIsMelee(kind, 'roar')).toBe(false);
      expect(companionIsMelee(kind, 'taiji')).toBe(false);
      expect(companionImpactTimes(kind, 'roar', 1)).toEqual([motionMs(380)]);
      expect(companionImpactTimes(kind, 'taiji', 1)).toEqual([]);
    }
  });

  it('每套 8 格、播一次、第 8 格回到待機架式；輕功的騰空格留得住跳起來的高度', () => {
    const all: [string, Motion][] = [
      ...['taiji', 'qinggong', 'focus', 'scroll'].map((a) => [`qiuqiu/${a}`, (extraMotionData.actions as Record<string, Motion>)[a]!] as [string, Motion]),
      ...['roar', 'taiji'].map((a) => [`feifei/${a}`, (feifeiMotionData.actions as Record<string, Motion>)[a]!] as [string, Motion]),
      ...['roar', 'taiji'].map((a) => [`fengfeng/${a}`, (fengfengMotionData.actions as Record<string, Motion>)[a]!] as [string, Motion]),
    ];
    for (const [label, motion] of all) {
      expect(motion.frames, label).toHaveLength(8);
      expect(motion.loop, label).toBe(false);
      expect(existsSync(`public/${motion.texture}`), label).toBe(true);
      const first = motion.frames[0]!.rect;
      const last = motion.frames[7]!.rect;
      expect(last[3]! / first[3]!, label).toBeGreaterThan(0.9);
      expect(last[3]! / first[3]!, label).toBeLessThan(1.1);
    }
    // 腳底定位：騰空格（第 3～5 格）的定位點在畫到的最底下再往下，也就是腳離地；著地格就在腳底
    const lifts = (extraMotionData.actions as Record<string, Motion>).qinggong!.frames.map((frame) => frame.pivot[1]! - (frame.rect[3]! - 1));
    expect(lifts.filter((_, i) => ![2, 3, 4].includes(i))).toEqual([0, 0, 0, 0, 0]);
    expect(Math.max(...lifts.slice(2, 5))).toBeGreaterThan(40);
  });
});

describe('動作圖雜湊', () => {
  const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

  it('八套新圖跟打包紀錄一致', () => {
    expect(cardMotionRecord.assets).toHaveLength(8);
    for (const asset of cardMotionRecord.assets) expect(sha(asset.target), asset.target).toBe(asset.targetSha256);
  });

  it('既有動作圖一個位元都沒動（對各批打包紀錄）', () => {
    const records = ['feifei-motion-assets', 'dangdang-motion-assets', 'fengfeng-motion-assets', 'qiuqiu-attack-motion-assets-v2',
      'dangdang-attack-motion-assets-v2', 'fengfeng-attack-motion-assets-v2', 'feifei-needle-redraw-ff2', 'idle-state-motion-assets'];
    let checked = 0;
    for (const name of records) {
      const record = JSON.parse(readFileSync(`docs/${name}.json`, 'utf-8')) as { assets: { target: string; targetSha256: string }[] };
      for (const asset of record.assets) {
        const path = existsSync(asset.target) ? asset.target : `public/${asset.target}`;
        expect(sha(path), asset.target).toBe(asset.targetSha256);
        checked += 1;
      }
    }
    // 球球額外動作那批紀錄用動作名記
    const extra = JSON.parse(readFileSync('docs/qiuqiu-extra-motion-assets.json', 'utf-8')) as { assets: { action: string; outputSha256: string }[] };
    for (const asset of extra.assets) {
      const texture = (extraMotionData.actions as Record<string, Motion>)[asset.action]!.texture;
      expect(sha(`public/${texture}`), texture).toBe(asset.outputSha256);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(80);
  });
});
