import type { App } from './app';
import type { Hero } from '../engine/hero';
import { beginCombat, newRun } from '../engine/run';
import { cardStats } from '../engine/deck';
import { setStore } from '../engine/save';
import { setLocalHero, heroSpriteUrls } from './assets';
import { setSfxHero } from './audio';
import { setBgm } from './bgm';
import { warmEncounter } from './preload';
import { actWalkTransition } from './acttransition';
import { el } from './dom';
import type { QiuqiuAction } from './qiuqiu-motion';
import type { CompanionMotionAction, CompanionMotionKind } from './companion-motion';
import { playFeifeiClone, playQiuqiuEchoes } from './qiuqiu-motion-effects';
import './styles/motion-preview.css';

// 角色清單只有 `engine/hero.ts` 那一份（2026-09-23 health H-2 第 1 塊：這裡原本手寫一份聯集）
export type MotionPreviewHero = Hero;
export type MotionPreviewGroup = 'basic' | 'ninjutsu' | 'ultimate' | 'defense';

type MotionPreviewCard = Readonly<{ cardId: string; upgraded: boolean }>;
type MotionPreviewGroupData = Readonly<{ label: string; cards: readonly MotionPreviewCard[] }>;
type PreviewAction = QiuqiuAction | CompanionMotionAction;
type PreviewActor = {
  element: HTMLCanvasElement;
  play(action: PreviewAction): void;
  dispose(): void;
};

/** 招式播完回到呼吸；持續狀態與移動展示則保留各自姿勢。 */
export function playMotionPreviewAction(actor: PreviewActor, action: PreviewAction, duration: number): () => void {
  actor.element.style.opacity = action === 'stealth' ? '.58' : '';
  actor.play(action);
  if (['idle', 'poison', 'belly', 'puff', 'stealth', 'down', 'defeat', 'win', 'walk', 'run'].includes(action)) return () => {};
  const timer = window.setTimeout(() => {
    actor.element.style.opacity = '';
    actor.element.style.left = '50%';
    actor.play('idle');
  }, duration);
  return () => window.clearTimeout(timer);
}

export const MOTION_PREVIEW_GROUPS = {
  basic: {
    label: '基礎招式',
    cards: [
      { cardId: 'sanjo', upgraded: false }, { cardId: 'sanjo', upgraded: false },
      { cardId: 'sanjo', upgraded: false }, { cardId: 'sanjo', upgraded: false },
      { cardId: 'huixuan', upgraded: false }, { cardId: 'roubao', upgraded: false },
      { cardId: 'luanwu', upgraded: false },
    ],
  },
  ninjutsu: {
    label: '第二組：忍術',
    cards: [
      { cardId: 'bunshin', upgraded: false }, { cardId: 'ruying', upgraded: false },
      { cardId: 'canying', upgraded: false }, { cardId: 'shunkan', upgraded: false },
      { cardId: 'dilie', upgraded: false }, { cardId: 'bengquan', upgraded: false },
      { cardId: 'caiweiba', upgraded: false },
    ],
  },
  ultimate: {
    label: '第三組：大招',
    cards: [
      { cardId: 'liandao', upgraded: false }, { cardId: 'shierlian', upgraded: false },
      { cardId: 'shibadie', upgraded: false },
      { cardId: 'luanwu', upgraded: true }, { cardId: 'lianhuan', upgraded: false },
      { cardId: 'shihou', upgraded: false }, { cardId: 'tietou', upgraded: false },
    ],
  },
  defense: {
    label: '第四組：防禦恢復',
    cards: [
      { cardId: 'tanding', upgraded: false }, { cardId: 'tiebushan', upgraded: false },
      { cardId: 'guixi', upgraded: false }, { cardId: 'kawarimi', upgraded: false },
      { cardId: 'zhangyan', upgraded: false },
    ],
  },
} as const satisfies Record<MotionPreviewGroup, MotionPreviewGroupData>;

export const FEIFEI_MOTION_PREVIEW_GROUPS = {
  basic: {
    label: '第一組：單體針招',
    cards: [
      { cardId: 'feifei_feizhen', upgraded: false }, { cardId: 'feifei_lianzhen', upgraded: false },
      { cardId: 'feifei_shouhua', upgraded: false },
      { cardId: 'feifei_tuikai', upgraded: false }, { cardId: 'feifei_cuidu', upgraded: false },
    ],
  },
  ninjutsu: {
    label: '第二組：毒針與針雨',
    cards: [
      { cardId: 'feifei_sazhen', upgraded: false }, { cardId: 'feifei_zhenyu', upgraded: false },
      { cardId: 'feifei_quansale', upgraded: false }, { cardId: 'feifei_fenshen', upgraded: false },
      { cardId: 'feifei_jianxue', upgraded: false },
    ],
  },
  ultimate: {
    label: '第三組：絕招與升級連針',
    cards: [
      { cardId: 'feifei_yizhen', upgraded: false }, { cardId: 'feifei_buyaoguolai', upgraded: false },
      { cardId: 'feifei_lianzhen', upgraded: true },
    ],
  },
  defense: {
    label: '第四組：防禦技能',
    cards: [
      { cardId: 'feifei_tuikai', upgraded: false }, { cardId: 'feifei_tieqiang', upgraded: false },
      { cardId: 'feifei_tanlu', upgraded: false }, { cardId: 'feifei_suoshou', upgraded: false },
      { cardId: 'feifei_taoshengsuo', upgraded: false }, { cardId: 'feifei_moyao', upgraded: false },
    ],
  },
} as const satisfies Record<MotionPreviewGroup, MotionPreviewGroupData>;

export const DANGDANG_MOTION_PREVIEW_GROUPS = {
  basic: {
    label: '基礎拳掌',
    cards: [
      { cardId: 'dangdang_zhengquan', upgraded: false },
      { cardId: 'dangdang_xieli', upgraded: false },
      { cardId: 'dangdang_jiapan', upgraded: false },
      { cardId: 'dangdang_jieliqi', upgraded: false },
      { cardId: 'dangdang_fanshou', upgraded: false },
      { cardId: 'luanwu', upgraded: false },
    ],
  },
  ninjutsu: {
    label: '第二組：護臂',
    cards: [
      { cardId: 'dangdang_yingpeng', upgraded: false },
      { cardId: 'dangdang_tiesha', upgraded: false },
      { cardId: 'dangdang_tiaoxin', upgraded: false },
      { cardId: 'dangdang_bengshan', upgraded: false },
      { cardId: 'dangdang_yibi', upgraded: false },
      { cardId: 'dangdang_zhendang', upgraded: false },
    ],
  },
  ultimate: {
    label: '第三組：絕學',
    cards: [
      { cardId: 'dangdang_tieshan', upgraded: false },
      { cardId: 'dangdang_qianjin', upgraded: false },
      { cardId: 'dangdang_yishang', upgraded: false },
      { cardId: 'dangdang_sheshen', upgraded: false },
      { cardId: 'dangdang_huima', upgraded: false },
    ],
  },
  defense: {
    label: '第四組：守勢',
    cards: [
      { cardId: 'dangdang_huben', upgraded: false },
      { cardId: 'dangdang_wenzhu', upgraded: false },
      { cardId: 'dangdang_jianzhao', upgraded: false },
      { cardId: 'dangdang_yingkang', upgraded: false },
      { cardId: 'dangdang_zhanzhuang', upgraded: false },
      { cardId: 'dangdang_tongqiang', upgraded: false },
    ],
  },
} as const satisfies Record<MotionPreviewGroup, MotionPreviewGroupData>;

export const FENGFENG_MOTION_PREVIEW_GROUPS = {
  basic: {
    label: '基礎劍招',
    cards: [
      { cardId: 'fengfeng_pingzhan', upgraded: false },
      { cardId: 'fengfeng_hushen', upgraded: false },
      { cardId: 'fengfeng_tuna', upgraded: false },
      { cardId: 'fengfeng_tanbu', upgraded: false },
      { cardId: 'fengfeng_hengsao', upgraded: false },
      { cardId: 'fengfeng_tabu', upgraded: false },
    ],
  },
  ninjutsu: {
    label: '第二組：拆招',
    cards: [
      { cardId: 'fengfeng_tiaokai', upgraded: false },
      { cardId: 'fengfeng_tuibu', upgraded: false },
      { cardId: 'fengfeng_zhengxi', upgraded: false },
      { cardId: 'fengfeng_wenwan', upgraded: false },
      { cardId: 'fengfeng_huanshou', upgraded: false },
      { cardId: 'fengfeng_jianqiao', upgraded: false },
    ],
  },
  ultimate: {
    label: '第三組：劍勢',
    cards: [
      { cardId: 'fengfeng_huibu', upgraded: false },
      { cardId: 'fengfeng_chuantang', upgraded: false },
      { cardId: 'fengfeng_shuangduan', upgraded: false },
      { cardId: 'fengfeng_huzhou', upgraded: false },
      { cardId: 'fengfeng_duanliu', upgraded: false },
      { cardId: 'fengfeng_kaishan', upgraded: false },
      { cardId: 'liandao', upgraded: false },
    ],
  },
  defense: {
    label: '第四組：守勢',
    cards: [
      { cardId: 'fengfeng_zhuanshen', upgraded: false },
      { cardId: 'fengfeng_changxi', upgraded: false },
      { cardId: 'fengfeng_zhenshou', upgraded: false },
      { cardId: 'fengfeng_xunxi', upgraded: false },
      { cardId: 'fengfeng_shoushi', upgraded: false },
      { cardId: 'fengfeng_kanshi', upgraded: false },
    ],
  },
} as const satisfies Record<MotionPreviewGroup, MotionPreviewGroupData>;

export const MOTION_PREVIEW_ACTIONS = [
  { action: 'idle', label: '待機' }, { action: 'hurt', label: '受傷' },
  { action: 'down', label: '倒地' }, { action: 'walk', label: '走路' },
  { action: 'run', label: '跑步' }, { action: 'roll', label: '翻滾' },
  { action: 'jump', label: '起跳' }, { action: 'land', label: '落地' },
  { action: 'attack1', label: '爪擊一' }, { action: 'attack2', label: '爪擊二' },
  { action: 'attack3', label: '爪擊三' }, { action: 'attack4', label: '爪擊四' },
  { action: 'attack_run', label: '奔襲' }, { action: 'attack_air', label: '空中爪擊' },
  { action: 'dash', label: '瞬身' }, { action: 'clone', label: '分身' },
  { action: 'clone_duo', label: '雙重分身' }, { action: 'shuriken', label: '手裏劍' },
  { action: 'kick', label: '迴旋踢' }, { action: 'seal', label: '結印' },
  { action: 'storm', label: '手裏劍亂舞' }, { action: 'rush', label: '疾衝' },
  { action: 'combo_kick', label: '連環踢' }, { action: 'uppercut', label: '崩拳' },
  { action: 'flying_kick', label: '飛踢' }, { action: 'roar', label: '獅吼功' },
  { action: 'ground_slam', label: '地裂陣' }, { action: 'body_bash', label: '鐵頭衝撞' },
  { action: 'palm_combo', label: '肉球連擊' }, { action: 'ultimate_clone', label: '十二連環' },
  { action: 'ultimate_storm', label: '升級亂舞' }, { action: 'ultimate_rush', label: '連刀' },
  { action: 'guard', label: '防禦' }, { action: 'eat', label: '恢復' },
  { action: 'win', label: '勝利' }, { action: 'poison', label: '中毒' },
  { action: 'belly', label: '翻肚' }, { action: 'puff', label: '炸毛' },
  { action: 'stealth', label: '隱身' }, { action: 'defeat', label: '落敗' },
] as const satisfies readonly { action: QiuqiuAction; label: string }[];

export const FEIFEI_MOTION_PREVIEW_ACTIONS = [
  { action: 'idle', label: '待機' }, { action: 'hurt', label: '受傷' },
  { action: 'run', label: '跑步' }, { action: 'roll', label: '翻滾' },
  { action: 'attack1', label: '爪擊' }, { action: 'shuriken', label: '飛針' },
  { action: 'storm', label: '舊版撒針' },
  { action: 'needle_combo', label: '連針' }, { action: 'needle_backhand', label: '手滑' },
  { action: 'needle_venom', label: '見血封喉' }, { action: 'needle_pierce', label: '一針斃命' },
  { action: 'needle_retreat', label: '不要過來！' }, { action: 'needle_fan', label: '撒針' },
  { action: 'needle_rain', label: '針雨' }, { action: 'needle_barrage', label: '全撒了' },
  { action: 'kick', label: '踢擊' },
  { action: 'seal', label: '結印' }, { action: 'clone', label: '毒分身' },
  { action: 'guard', label: '防禦' }, { action: 'eat', label: '恢復' },
  { action: 'win', label: '勝利' }, { action: 'poison', label: '中毒' },
  { action: 'defeat', label: '落敗' },
] as const satisfies readonly { action: CompanionMotionAction; label: string }[];

export const DANGDANG_MOTION_PREVIEW_ACTIONS = [
  { action: 'idle', label: '待機' }, { action: 'hurt', label: '受傷' },
  { action: 'run', label: '跑步' }, { action: 'dodge', label: '閃避' },
  { action: 'punch', label: '正拳' }, { action: 'palm', label: '卸力掌' },
  { action: 'kick', label: '踢擊' }, { action: 'shoulder', label: '鐵山靠' },
  { action: 'counter', label: '反擊' }, { action: 'ground_slam', label: '震地' },
  { action: 'rapid_combo', label: '護臂連擊' }, { action: 'heavy_palm', label: '崩山掌' },
  { action: 'sweep_combo', label: '橫掃連踢' }, { action: 'reckless_bash', label: '捨身撞' },
  { action: 'guard', label: '架擋' }, { action: 'focus', label: '蓄勢' },
  { action: 'eat', label: '恢復' }, { action: 'win', label: '勝利' },
  { action: 'poison', label: '中毒' }, { action: 'defeat', label: '落敗' },
] as const satisfies readonly { action: CompanionMotionAction; label: string }[];

export const FENGFENG_MOTION_PREVIEW_ACTIONS = [
  { action: 'idle', label: '待機' }, { action: 'hurt', label: '受傷' },
  { action: 'run', label: '跑步' }, { action: 'dodge', label: '閃避' },
  { action: 'slash', label: '平斬' }, { action: 'sweep', label: '橫掃' },
  { action: 'heavy_slash', label: '重斬' }, { action: 'thrust', label: '突刺' },
  { action: 'double_slash', label: '雙斬' }, { action: 'sword_combo', label: '三拍連刀' },
  { action: 'qi_cleave', label: '氣斬' }, { action: 'earth_split', label: '開山' },
  { action: 'retreat_thrust', label: '回步刺' }, { action: 'guard', label: '架擋' },
  { action: 'focus', label: '凝神' }, { action: 'sheath', label: '收劍' },
  { action: 'eat', label: '恢復' }, { action: 'win', label: '勝利' },
  { action: 'poison', label: '中毒' }, { action: 'defeat', label: '落敗' },
] as const satisfies readonly { action: CompanionMotionAction; label: string }[];

function groupsFor(hero: MotionPreviewHero): Record<MotionPreviewGroup, MotionPreviewGroupData> {
  return hero === 'feifei' ? FEIFEI_MOTION_PREVIEW_GROUPS
    : hero === 'dangdang' ? DANGDANG_MOTION_PREVIEW_GROUPS
      : hero === 'fengfeng' ? FENGFENG_MOTION_PREVIEW_GROUPS
      : MOTION_PREVIEW_GROUPS;
}

function actionsFor(hero: MotionPreviewHero): readonly { action: PreviewAction; label: string }[] {
  return hero === 'feifei' ? FEIFEI_MOTION_PREVIEW_ACTIONS
    : hero === 'dangdang' ? DANGDANG_MOTION_PREVIEW_ACTIONS
      : hero === 'fengfeng' ? FENGFENG_MOTION_PREVIEW_ACTIONS
      : MOTION_PREVIEW_ACTIONS;
}

/** 臨時試打資料；牌面與真正的出牌結算共用原本規則。 */
export function createMotionPreviewState(group: MotionPreviewGroup = 'basic', hero: MotionPreviewHero = 'ninja') {
  const run = newRun(`${hero}-motion-preview`, 1, hero);
  run.floor = 2;
  run.flags['prologue'] = true;
  const player = run.players[0]!;
  player.hp = Math.max(1, player.maxHp - 24);
  player.deck = groupsFor(hero)[group].cards.map((card) =>
    ({ uid: run.nextUid++, cardId: card.cardId, upgraded: card.upgraded }));
  // 球球不帶藍頭巾（2026-09-23 平衡 bal）：它改成開場 1 點爪力，試玩局要照牌面的數字演（原本只多抽一張，手牌下面整副換掉，沒影響）
  if (hero === 'ninja') player.relics = player.relics.filter((id) => id !== 'blue_headband');
  const cs = beginCombat(run, 'rats2');
  cs.player.hand = player.deck.map((card) => ({ ...card }));
  cs.player.drawPile = [];
  const requiredEnergy = cs.player.hand.reduce((sum, card) => sum + cardStats(card).cost, 0);
  cs.player.energy = Math.max(12, requiredEnergy);
  cs.player.maxEnergy = cs.player.energy;
  for (const enemy of cs.enemies) { enemy.hp = 9999; enemy.maxHp = 9999; }
  return { run, cs };
}

export async function startMotionPreview(app: App): Promise<void> {
  const trialStore = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  setStore(trialStore);
  app.leaveCoop();
  let currentHero: MotionPreviewHero = 'ninja';
  setLocalHero(currentHero);
  setSfxHero(currentHero);
  const loading = el('div', { class: 'motion-preview-loading' }, '正在準備動作素材……');
  app.stage.append(loading);

  let qiuqiuModule: typeof import('./qiuqiu-motion') | undefined;
  let companionModule: typeof import('./companion-motion') | undefined;
  const warmed = new Set<MotionPreviewHero>();
  const loadHero = async (hero: MotionPreviewHero): Promise<void> => {
    if (hero === 'ninja') {
      qiuqiuModule ??= await import('./qiuqiu-motion');
      await qiuqiuModule.preloadQiuqiuMotion();
    } else {
      companionModule ??= await import('./companion-motion');
      await companionModule.preloadCompanionMotion(hero);
    }
    if (!warmed.has(hero)) {
      await warmEncounter('rats2', 3000, heroSpriteUrls([hero]), hero);
      warmed.add(hero);
    }
  };

  try {
    const enemyMotion = await import('./enemy-motion');
    await Promise.all([loadHero(currentHero), enemyMotion.preloadEnemyMotion(['rat'])]);
  } catch (error) {
    loading.replaceChildren(el('p', {}, '動作素材載入失敗，請重新整理再試。'),
      el('button', { class: 'btn', onclick: () => location.reload() }, '重新整理'));
    console.error('動作素材載入失敗', error);
    return;
  }
  loading.remove();

  let stopWalk: (() => void) | undefined;
  let showcaseActor: PreviewActor | undefined;
  let currentGroup: MotionPreviewGroup = 'basic';
  let currentAction: PreviewAction = 'idle';
  let stopShowcase: (() => void) | undefined;
  let stopPlayback: (() => void) | undefined;
  let expandedShowcase = false;
  let switching = false;
  let screenVersion = 0;
  const modalOpen = (): boolean => !!app.overlay.querySelector('.modal-overlay, .dialogue-overlay');
  const heroLabel = (): string => currentHero === 'feifei' ? '菲菲'
    : currentHero === 'dangdang' ? '噹噹'
      : currentHero === 'fengfeng' ? '封封' : '球球';

  const groupSelect = el('select', { class: 'motion-preview-select', 'aria-label': '試打牌組' }) as HTMLSelectElement;
  const actionSelect = el('select', { class: 'motion-preview-select', 'aria-label': '動作展示' }) as HTMLSelectElement;
  const heroSelect = el('select', { class: 'motion-preview-select motion-preview-hero', 'aria-label': '展示角色' },
    el('option', { value: 'ninja' }, '球球'), el('option', { value: 'feifei' }, '菲菲'),
    el('option', { value: 'dangdang' }, '噹噹'), el('option', { value: 'fengfeng' }, '封封')) as HTMLSelectElement;
  const showcaseStage = el('div', { class: 'motion-preview-showcase-stage', 'aria-label': '獨立動作展示舞台' });
  const title = el('b', {}, '球球動作試玩');
  let reset: () => void;

  const fillSelects = (): void => {
    groupSelect.replaceChildren(...Object.entries(groupsFor(currentHero)).map(([value, group]) =>
      el('option', { value }, group.label)));
    groupSelect.value = currentGroup;
    actionSelect.replaceChildren(...actionsFor(currentHero).map(({ action, label }) =>
      el('option', { value: action }, label)));
    actionSelect.value = currentAction;
    title.textContent = `${heroLabel()}動作試玩`;
  };

  const showcaseHeight = (): number => expandedShowcase ? 220 : 54;
  const createShowcaseActor = (): PreviewActor => currentHero === 'ninja'
    ? qiuqiuModule!.createQiuqiuActor({ height: showcaseHeight(), action: currentAction as QiuqiuAction }) as unknown as PreviewActor
    : companionModule!.createCompanionMotionActor(currentHero as CompanionMotionKind, {
        height: showcaseHeight(), action: currentAction as CompanionMotionAction,
      }) as unknown as PreviewActor;

  const replayShowcase = (): void => {
    stopShowcase?.();
    stopShowcase = undefined;
    stopPlayback?.();
    stopPlayback = undefined;
    if (showcaseActor) stopPlayback = playMotionPreviewAction(showcaseActor, currentAction, currentHero === 'ninja'
      ? qiuqiuModule!.qiuqiuMotionDuration(currentAction as QiuqiuAction)
      : companionModule!.companionMotionDuration(currentHero, currentAction as CompanionMotionAction));
    const qClone = currentHero === 'ninja' && ['clone', 'clone_duo', 'ultimate_clone'].includes(currentAction);
    const feifeiClone = currentHero === 'feifei' && currentAction === 'clone';
    if (showcaseActor) showcaseActor.element.style.left = qClone || feifeiClone ? (expandedShowcase ? '90px' : '33px') : '50%';
    const target = expandedShowcase ? { x: 390, y: 299, width: 90 } : { x: 146, y: 57, width: 30 };
    if (qClone) {
      const action = currentAction as QiuqiuAction;
      stopShowcase = playQiuqiuEchoes(showcaseStage, action, target, {
        height: showcaseHeight(),
        impactTimes: qiuqiuModule!.qiuqiuImpactTimes(action,
          action === 'clone' ? 1 : action === 'clone_duo' ? 2 : 3),
        onDone: () => { stopShowcase = undefined; },
      });
    } else if (feifeiClone) {
      stopShowcase = playFeifeiClone(showcaseStage, target, {
        height: showcaseHeight(), onDone: () => { stopShowcase = undefined; },
      });
    }
  };

  groupSelect.onchange = () => { currentGroup = groupSelect.value as MotionPreviewGroup; reset(); };
  actionSelect.onchange = () => { currentAction = actionSelect.value as PreviewAction; replayShowcase(); };
  heroSelect.onchange = async () => {
    if (switching) return;
    switching = true;
    heroSelect.disabled = true;
    const previous = currentHero;
    const version = screenVersion;
    currentHero = heroSelect.value as MotionPreviewHero;
    currentGroup = 'basic';
    currentAction = 'idle';
    try {
      await loadHero(currentHero);
      if (version !== screenVersion) return;   // 已離開試玩，晚到的素材不能把畫面拉回來
      setLocalHero(currentHero);
      setSfxHero(currentHero);
      fillSelects();
      switching = false;
      reset();
    } catch (error) {
      if (version !== screenVersion) return;
      console.error(`${heroLabel()}動作素材載入失敗`, error);
      currentHero = previous;
      heroSelect.value = previous;
      fillSelects();
    } finally {
      switching = false;
      heroSelect.disabled = false;
    }
  };

  const replayButton = el('button', { class: 'btn small', onclick: replayShowcase }, '重播') as HTMLButtonElement;
  const zoomButton = el('button', { class: 'btn small', onclick: () => {
    expandedShowcase = !expandedShowcase;
    showcase.classList.toggle('expanded', expandedShowcase);
    zoomButton.textContent = expandedShowcase ? '縮小' : '放大';
    zoomButton.setAttribute('aria-expanded', String(expandedShowcase));
    stopPlayback?.(); stopPlayback = undefined;
    stopShowcase?.(); stopShowcase = undefined;
    showcaseActor?.dispose();
    showcaseActor = createShowcaseActor();
    showcaseStage.replaceChildren(showcaseActor.element);
    replayShowcase();
  }, 'aria-label': '放大或縮小動作展示', 'aria-expanded': 'false' }, '放大') as HTMLButtonElement;
  const showcase = el('div', { class: 'motion-preview-showcase' }, showcaseStage,
    el('div', { class: 'motion-preview-showcase-controls' },
      el('label', {}, el('span', {}, '動作展示'), actionSelect),
      el('div', { class: 'motion-preview-showcase-buttons' }, replayButton, zoomButton)));
  const runButton = el('button', { class: 'btn small', onclick: () => {
    if (runButton.disabled || modalOpen()) return;
    runButton.disabled = true;
    stopWalk = actWalkTransition(app.stage, 16, () => { runButton.disabled = false; });
  } }, '跑步換場') as HTMLButtonElement;
  const tools = el('div', { class: 'motion-preview-tools' },
    el('div', { class: 'motion-preview-copy' }, title,
      el('span', {}, '切換角色或牌組會清空戰場；試打不保存。'),
      el('small', { class: 'motion-preview-note' }, '12 顆飯糰・耐打目標・真實卡牌規則')),
    el('div', { class: 'motion-preview-controls' },
      el('label', {}, el('span', {}, '角色'), heroSelect),
      el('label', {}, el('span', {}, '試打牌組'), groupSelect),
      runButton,
      el('button', { class: 'btn small', onclick: () => { runButton.disabled = false; reset(); } }, '重新試打'),
      el('a', { class: 'btn small', href: `${location.pathname}?motion=1` }, '用新動作闖塔')),
    showcase);

  reset = (): void => {
    if (modalOpen() || switching) return;
    stopWalk?.();
    stopWalk = undefined;
    stopShowcase?.();
    stopShowcase = undefined;
    stopPlayback?.(); stopPlayback = undefined;
    showcaseActor?.dispose();
    const { run, cs } = createMotionPreviewState(currentGroup, currentHero);
    app.sandbox = true;
    app.run = run;
    app.cs = cs;
    setLocalHero(currentHero);
    setSfxHero(currentHero);
    setBgm('battle');
    app.show('combat');
    setStore(trialStore);
    app.stage.classList.add('motion-preview-active');
    showcaseActor = createShowcaseActor();
    showcaseStage.replaceChildren(showcaseActor.element);
    replayShowcase();
    app.stage.append(tools);
    app.disposers.push(() => {
      screenVersion++;   // 重設也會同步清理；只在等待載入返回時比對版本
      stopWalk?.(); stopWalk = undefined; runButton.disabled = false;
      showcaseActor?.dispose();
      showcaseActor = undefined;
      stopShowcase?.(); stopShowcase = undefined;
      stopPlayback?.(); stopPlayback = undefined;
      tools.remove();
      app.stage.classList.remove('motion-preview-active');
      try { setStore(window.localStorage); } catch { setStore(trialStore); }
    });
  };

  fillSelects();
  reset();
}
