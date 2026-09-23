import { fileUrl } from './assets';
import { companionImpactDelay, companionThrowRelease, type CompanionMotionAction } from './companion-motion';
import {
  FEIFEI_NEEDLE_DEFAULT_ORIGIN,
  feifeiNeedleFlightMs,
  feifeiNeedleOrigin,
  isFeifeiNeedleAction,
  type FeifeiNeedleAction,
} from './feifei-needle-patterns';
import { paintSingleNeedle, playFeifeiNeedles, SINGLE_NEEDLE_SIZE } from './feifei-needles';
import { playQiuqiuShuriken, QIUQIU_SHURIKEN_FLIGHT_MS } from './qiuqiu-shuriken';
import type { ProjectileKind, ProjectileShot } from './projectile-kinds';
import type { CombatMotionAction, CombatMotionSource } from './qiuqiu-combat-motion';

/**
 * 丟出去的東西怎麼飛（2026-09-22，批次 proj；飛什麼在 `projectile-kinds.ts`）。
 *
 * 時間照原本的飛行物系統：每一波在「命中時點 − 飛行時間」從出手那隻手放出去，飛到魔物身上那一刻才算命中
 *（戰鬥畫面在 `onImpact` 裡跳數字）。命中時點由戰鬥畫面照動作算好傳進來，這裡不改。
 * 球球的手裏劍、菲菲的飛針照舊走原本那兩支（`qiuqiu-shuriken.ts`、`feifei-needles.ts`），其餘的走這裡的圖。
 */

type Point = Readonly<{ x: number; y: number }>;

type Look = Readonly<{
  /** 圖檔（public 底下的路徑）；飛針沒有圖檔，用畫的 */
  src?: string;
  /** 顯示大小（舞台像素） */
  width: number;
  height: number;
  /**
   * 飛一趟轉幾度：只有畫成單一物件、沒有拖尾的圓東西才轉（手裏劍、毛球）；
   * 其餘都畫成「飛行中」的樣子（尖端或正面朝右、身後帶拖尾），順著飛行方向擺頭、不轉——轉起來拖尾會跑到前面
   */
  spin: number;
  /** 飛行中左右擺的角度（葉片飄、繩圈甩） */
  wobble?: number;
  /** 拋物線最高點比直線高多少：重的、圓的東西是拋出去的 */
  arc?: number;
  /** 飛行中從多大變到多大（毒砂散開、繩圈甩開） */
  grow?: readonly [number, number];
  /** 一波同時飛好幾個（聚葉成刀一次三片），位置相對中心：x 沿飛行方向、y 垂直飛行方向 */
  copies?: readonly Point[];
}>;

const art = (name: string): string => `assets/motion/projectile/${name}.webp`;

/** 大小照手裏劍（40 像素）抓：小東西 30～45、長條的 55～60；圖檔是顯示大小的兩倍多，縮下來才清楚 */
export const PROJECTILE_LOOKS: Readonly<Record<ProjectileKind, Look>> = {
  shuriken: { src: 'assets/motion/qiuqiu/shuriken_128.webp', width: 40, height: 41, spin: 720 },
  needle: { width: SINGLE_NEEDLE_SIZE.width, height: SINGLE_NEEDLE_SIZE.height, spin: 0 },
  leaf: { src: art('leaf'), width: 50, height: 14, spin: 0, wobble: 12, copies: [{ x: 6, y: 0 }, { x: -8, y: -13 }, { x: -6, y: 13 }] },
  kunai: { src: art('kunai'), width: 66, height: 17, spin: 0 },
  barrel: { src: art('barrel'), width: 54, height: 48, spin: 0, wobble: 6, arc: 48 },
  furball_qiuqiu: { src: art('furball_qiuqiu'), width: 40, height: 40, spin: 540, arc: 34 },
  furball_dangdang: { src: art('furball_dangdang'), width: 40, height: 40, spin: 540, arc: 34 },
  furball_fengfeng: { src: art('furball_fengfeng'), width: 40, height: 40, spin: 540, arc: 34 },
  poison_pill: { src: art('poison_pill'), width: 56, height: 24, spin: 0 },
  poison_sand: { src: art('poison_sand'), width: 72, height: 38, spin: 0, grow: [0.55, 1.15] },
  snare_cord: { src: art('snare_cord'), width: 76, height: 32, spin: 0, wobble: 10, grow: [0.75, 1.15] },
  hemp_rope: { src: art('hemp_rope'), width: 76, height: 36, spin: 0, wobble: 10, grow: [0.75, 1.15] },
  firecracker: { src: art('firecracker'), width: 66, height: 40, spin: 0, wobble: 5, arc: 60 },
  smoke_bomb: { src: art('smoke_bomb'), width: 58, height: 39, spin: 0, arc: 46 },
  nip_ball: { src: art('nip_ball'), width: 58, height: 37, spin: 0, arc: 50 },
  bind_nail: { src: art('bind_nail'), width: 56, height: 28, spin: 0 },
  rubble: { src: art('rubble'), width: 64, height: 32, spin: 0, wobble: 6, arc: 44 },
};

/** 球球擲出去的手（相對腳底定位點；原本寫死在 combat.ts 的 throwFrom） */
const QIUQIU_THROW_ORIGIN: Point = { x: 125, y: -135 };
/**
 * 噹噹、封封丟東西那一格的手（相對腳底定位點的舞台像素，量自出手格：
 * 噹噹推掌第 4 格的掌心、封封突刺第 3 格往前推的左手；量法同 `tools/measure_feifei_needle_hands.py`，
 * 逐格畫布以 252 單位＝252 舞台像素畫）。
 */
export const COMPANION_THROW_ORIGIN: Readonly<Record<'dangdang' | 'fengfeng', Point>> = {
  dangdang: { x: 110, y: -155 },
  fengfeng: { x: 112, y: -120 },
};

/** 這一套丟東西的動作第 wave 波從哪裡放出去（相對腳底）、飛多久；不是丟東西的動作回 undefined */
export function throwLaunch(
  source: CombatMotionSource,
  action: CombatMotionAction,
  wave = 0,
): Readonly<{ origin: Point; flightMs: number }> | undefined {
  if (source === 'qiuqiu') {
    return action === 'shuriken' || action === 'ultimate_storm'
      ? { origin: QIUQIU_THROW_ORIGIN, flightMs: QIUQIU_SHURIKEN_FLIGHT_MS }
      : undefined;
  }
  if (source === 'feifei') {
    return isFeifeiNeedleAction(action)
      ? { origin: feifeiNeedleOrigin(action, wave), flightMs: feifeiNeedleFlightMs(action) }
      : undefined;
  }
  const release = companionThrowRelease(source, action);
  if (release === undefined) return undefined;
  return {
    origin: COMPANION_THROW_ORIGIN[source],
    flightMs: companionImpactDelay(source, action as CompanionMotionAction) - release,
  };
}

const images = new Map<string, HTMLImageElement>();

/** 開戰時先把飛行物的圖載好（每張幾 KB）；沒載好就丟出去的話，那一趟會是空的 */
export function preloadProjectiles(): void {
  if (typeof Image === 'undefined') return;
  for (const look of Object.values(PROJECTILE_LOOKS)) {
    if (!look.src || images.has(look.src)) continue;
    const image = new Image();
    image.src = fileUrl(look.src);
    images.set(look.src, image);
  }
}

export type ProjectilePlayOptions = Readonly<{
  waves: number;
  elapsed?: number;
  /** 每一波的抵達時點（＝命中時點） */
  impactTimes: readonly number[];
  onImpact(wave: number): void;
  onDone(): void;
}>;

function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

function createSprite(kind: ProjectileKind, look: Look): HTMLElement {
  if (!look.src) {
    const canvas = document.createElement('canvas');
    canvas.width = look.width;
    canvas.height = look.height;
    paintSingleNeedle(canvas);
    return canvas;
  }
  const image = document.createElement('img');
  image.src = fileUrl(look.src);
  image.alt = '';
  image.draggable = false;
  image.dataset.kind = kind;
  return image;
}

/** 一趟飛行（一波）在第 progress（0～1）時的位置、角度、大小 */
export function projectilePose(
  look: Look,
  from: Point,
  to: Point,
  progress: number,
): Readonly<{ x: number; y: number; angle: number; scale: number }> {
  const p = Math.max(0, Math.min(1, progress));
  const arc = look.arc ?? 0;
  const x = from.x + (to.x - from.x) * p;
  const y = from.y + (to.y - from.y) * p - arc * 4 * p * (1 - p);
  const heading = Math.atan2((to.y - from.y) - arc * 4 * (1 - 2 * p), to.x - from.x) * 180 / Math.PI;
  const wobble = (look.wobble ?? 0) * Math.sin(p * Math.PI * 4);
  const angle = look.spin ? heading + look.spin * p : heading + wobble;
  const scale = look.grow ? look.grow[0] + (look.grow[1] - look.grow[0]) * p : 1;
  return { x, y, angle, scale };
}

/**
 * 丟出去的東西（手裏劍、飛針以外那些）：每一波一個（聚葉成刀一波三片），從出手那隻手飛到目標，
 * 到了就拿掉並回呼 `onImpact`。`fromAt(wave)`＝這一波從哪裡放出去（連針那種左右手輪流的會不一樣）。
 */
export function playProjectile(
  stage: HTMLElement,
  kind: ProjectileKind,
  fromAt: (wave: number) => Point,
  to: Point,
  options: ProjectilePlayOptions & Readonly<{ flightMs: number }>,
): () => void {
  const look = PROJECTILE_LOOKS[kind];
  const waveCount = Math.max(0, Math.floor(options.waves));
  const flightMs = Math.max(1, options.flightMs);
  const nodes: Array<HTMLElement | undefined> = Array.from({ length: waveCount });
  const impacted = Array.from({ length: waveCount }, () => false);
  const startedAt = performance.now() - Math.max(0, options.elapsed ?? 0);
  let raf = 0;
  let disposed = false;
  let completed = false;

  const remove = (wave: number): void => {
    nodes[wave]?.remove();
    nodes[wave] = undefined;
  };
  const create = (wave: number): HTMLElement => {
    const node = document.createElement('div');
    node.className = `projectile projectile-${kind}`;
    node.dataset.kind = kind;
    node.dataset.wave = String(wave);
    node.dataset.phase = 'flight';
    Object.assign(node.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${look.width}px`,
      height: `${look.height}px`,
      pointerEvents: 'none',
      zIndex: '20',
      transformOrigin: '50% 50%',
    });
    for (const copy of look.copies ?? [{ x: 0, y: 0 }]) {
      const sprite = createSprite(kind, look);
      Object.assign(sprite.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: `${look.width}px`,
        height: `${look.height}px`,
        transform: copy.x || copy.y ? `translate(${copy.x}px, ${copy.y}px)` : '',
      });
      node.append(sprite);
    }
    stage.append(node);
    nodes[wave] = node;
    return node;
  };

  const frame = (now: number): void => {
    raf = 0;
    if (disposed || completed) return;
    const elapsed = Math.max(0, now - startedAt);
    for (let wave = 0; wave < waveCount; wave += 1) {
      if (impacted[wave]) continue;
      const impactAt = options.impactTimes[wave] ?? options.impactTimes.at(-1) ?? flightMs;
      const releaseAt = Math.max(0, impactAt - flightMs);
      if (elapsed >= impactAt) {
        remove(wave);
        impacted[wave] = true;
        options.onImpact(wave);
        if (disposed) return;
        continue;
      }
      if (elapsed < releaseAt) continue;
      const pose = projectilePose(look, fromAt(wave), to, (elapsed - releaseAt) / (impactAt - releaseAt));
      const node = nodes[wave] ?? create(wave);
      node.dataset.x = formatNumber(pose.x);
      node.dataset.y = formatNumber(pose.y);
      node.style.transform = `translate(${formatNumber(pose.x - look.width / 2)}px, ${formatNumber(pose.y - look.height / 2)}px) `
        + `rotate(${formatNumber(pose.angle)}deg) scale(${formatNumber(pose.scale)})`;
    }
    if (impacted.every(Boolean)) {
      completed = true;
      for (let wave = 0; wave < waveCount; wave += 1) remove(wave);
      options.onDone();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);
  return (): void => {
    if (disposed || completed) return;
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    for (let wave = 0; wave < waveCount; wave += 1) remove(wave);
  };
}

/**
 * 戰鬥畫面丟東西的單一入口：`foot`＝丟的那一位的腳底定位點，`to`＝落點（魔物身體中間，或煙霧彈丟在自己腳邊）。
 * 球球丟手裏劍、菲菲丟飛針照舊走原本那兩支（起點、畫法、命中特效都沒變），其餘照 `shot.kind` 飛對應的圖。
 */
export function playThrow(
  stage: HTMLElement,
  source: CombatMotionSource,
  action: CombatMotionAction,
  shot: ProjectileShot,
  foot: Point,
  to: Point,
  options: ProjectilePlayOptions,
): () => void {
  const launch = (wave: number) => throwLaunch(source, action, wave)
    ?? { origin: QIUQIU_THROW_ORIGIN, flightMs: QIUQIU_SHURIKEN_FLIGHT_MS };
  const flightMs = launch(0).flightMs;
  const timed = { ...options, elapsed: throwElapsed(source, action, options.elapsed ?? 0, options.impactTimes) };
  if (shot.kind === 'needle' && source === 'feifei' && isFeifeiNeedleAction(action)) {
    return playFeifeiNeedles(stage, {
      x: foot.x + FEIFEI_NEEDLE_DEFAULT_ORIGIN.x,
      y: foot.y + FEIFEI_NEEDLE_DEFAULT_ORIGIN.y,
    }, to, { action: action as FeifeiNeedleAction, ...timed });
  }
  if (shot.kind === 'shuriken' && source === 'qiuqiu') {
    return playQiuqiuShuriken(stage, { x: foot.x + QIUQIU_THROW_ORIGIN.x, y: foot.y + QIUQIU_THROW_ORIGIN.y }, to, timed);
  }
  return playProjectile(stage, shot.kind, (wave) => {
    const { origin } = launch(wave);
    return { x: foot.x + origin.x, y: foot.y + origin.y };
  }, to, { ...timed, flightMs });
}

/**
 * 從第幾毫秒接著演。連線加入方自己丟的東西要等主機確認回來才飛（來回約 0.3～0.4 秒），
 * 那時出手格早就過了——照原本的時間算，東西已經飛到，整趟直接跳過、只剩數字（2026-09-22 實機：
 * 加入方自己的毛球、麻繩、煙霧彈在自己畫面上完全看不到，開房方那台看得到）。
 * 這種時候從第一波出手那一刻接著演：東西照樣從手上飛完整一趟，命中跟著晚一點（數字本來就要等確認才跳）。
 * 單人、開房方、看同伴出手都是從 0 開始，不受影響。
 */
export function joinElapsed(elapsed: number, impactTimes: readonly number[], flightMs: number): number {
  const firstRelease = Math.max(0, (impactTimes[0] ?? 0) - flightMs);
  return Math.min(Math.max(0, elapsed), firstRelease);
}

/**
 * `playThrow` 實際從第幾毫秒演起（套過 `joinElapsed`）。戰鬥畫面算「最後一波什麼時候打到」要用同一個數：
 * 照原本的 `impactElapsed` 算，連線加入方的多波投擲會以為早就打完，650 毫秒的收姿勢先把魔物換回待機，
 * 最後一兩波打到時又切回受擊，魔物閃一下待機（2026-09-23 稽核 ui 低-2）。
 */
export function throwElapsed(
  source: CombatMotionSource,
  action: CombatMotionAction,
  elapsed: number,
  impactTimes: readonly number[],
): number {
  const flightMs = (throwLaunch(source, action, 0) ?? { flightMs: QIUQIU_SHURIKEN_FLIGHT_MS }).flightMs;
  return joinElapsed(elapsed, impactTimes, flightMs);
}
