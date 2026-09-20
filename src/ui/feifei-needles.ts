import {
  feifeiNeedleFlightMs,
  feifeiNeedleGapMs,
  feifeiNeedleReleaseTimes,
  type FeifeiNeedleAction,
} from './feifei-needle-patterns';

export const FEIFEI_NEEDLE_FLIGHT_MS = 170;
export const FEIFEI_NEEDLE_GAP_MS = 140;

export type FeifeiNeedlePoint = Readonly<{ x: number; y: number }>;

export type FeifeiNeedlePlayOptions = Readonly<{
  action: FeifeiNeedleAction;
  waves: number;
  elapsed?: number;
  /** 每一波的真實結算時點；同波裝飾針不增加命中回呼。 */
  impactTimes: readonly number[];
  onImpact(wave: number): void;
  onDone(): void;
}>;

type NeedleVisual = Readonly<{
  width: number;
  height: number;
  count: number;
  route: string;
  hands: string;
  trail?: 'long';
  impactEffect?: string;
  impactDuration?: number;
}>;

type NeedlePlacement = Readonly<{
  x: number;
  y: number;
  angle: number;
  scale?: number;
}>;

const VISUALS: Readonly<Record<FeifeiNeedleAction, NeedleVisual>> = {
  shuriken: { width: 54, height: 18, count: 1, route: 'straight', hands: 'front' },
  storm: { width: 70, height: 46, count: 3, route: 'triple-line', hands: 'front' },
  needle_combo: { width: 54, height: 18, count: 1, route: 'alternating-line', hands: 'alternating' },
  needle_backhand: {
    width: 78, height: 34, count: 1, route: 'low-arc', hands: 'back',
    impactEffect: 'backhand-spark', impactDuration: 70,
  },
  needle_venom: {
    width: 84, height: 34, count: 1, route: 'venom-focus', hands: 'front',
    impactEffect: 'poison-flower', impactDuration: 140,
  },
  needle_pierce: {
    width: 148, height: 28, count: 1, route: 'piercing-line', hands: 'front', trail: 'long',
    impactEffect: 'pierce-flash', impactDuration: 80,
  },
  needle_retreat: {
    width: 128, height: 82, count: 7, route: 'panic-converge', hands: 'front',
    impactEffect: 'panic-pricks', impactDuration: 90,
  },
  needle_fan: {
    width: 128, height: 82, count: 5, route: 'horizontal-fan', hands: 'front',
    impactEffect: 'fan-pricks', impactDuration: 80,
  },
  needle_rain: {
    width: 142, height: 104, count: 7, route: 'up-then-drop', hands: 'overhead',
    impactEffect: 'rain-pricks', impactDuration: 120,
  },
  needle_barrage: {
    width: 174, height: 116, count: 12, route: 'wide-net', hands: 'front-back',
    impactEffect: 'net-pricks', impactDuration: 120,
  },
};

function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

function waveReleaseAt(action: FeifeiNeedleAction, wave: number): number {
  const releases = feifeiNeedleReleaseTimes(action);
  if (wave < releases.length) return releases[wave]!;
  return releases.at(-1)! + (wave - releases.length + 1) * feifeiNeedleGapMs(action);
}

function waveOrigin(action: FeifeiNeedleAction, wave: number, from: FeifeiNeedlePoint): FeifeiNeedlePoint {
  if (action === 'needle_combo') return { x: from.x, y: from.y + (wave % 2 === 0 ? -12 : 12) };
  if (action === 'needle_rain') return { x: from.x - 45, y: from.y - 110 };
  if (action === 'needle_retreat') return { x: from.x - 25, y: from.y };
  return from;
}

function routePoint(
  action: FeifeiNeedleAction,
  from: FeifeiNeedlePoint,
  to: FeifeiNeedlePoint,
  progress: number,
): Readonly<{ point: FeifeiNeedlePoint; angle: number }> {
  const p = Math.max(0, Math.min(1, progress));
  if (action === 'needle_backhand') {
    const lift = 48 * 4 * p * (1 - p);
    const x = from.x + (to.x - from.x) * p;
    const y = from.y + (to.y - from.y) * p + lift;
    const dx = to.x - from.x;
    const dy = to.y - from.y + 192 * (1 - 2 * p);
    return { point: { x, y }, angle: Math.atan2(dy, dx) * 180 / Math.PI };
  }
  if (action === 'needle_rain') {
    const control = {
      x: to.x - (to.x - from.x) * 0.12,
      y: Math.min(from.y, to.y) - 330,
    };
    const oneMinus = 1 - p;
    const x = oneMinus * oneMinus * from.x + 2 * oneMinus * p * control.x + p * p * to.x;
    const y = oneMinus * oneMinus * from.y + 2 * oneMinus * p * control.y + p * p * to.y;
    const dx = 2 * oneMinus * (control.x - from.x) + 2 * p * (to.x - control.x);
    const dy = 2 * oneMinus * (control.y - from.y) + 2 * p * (to.y - control.y);
    return { point: { x, y }, angle: Math.atan2(dy, dx) * 180 / Math.PI };
  }
  const x = from.x + (to.x - from.x) * p;
  const y = from.y + (to.y - from.y) * p;
  return {
    point: { x, y },
    angle: Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI,
  };
}

function needlePlacements(action: FeifeiNeedleAction, progress: number): readonly NeedlePlacement[] {
  const opening = Math.sin(Math.PI * progress);
  const converging = 1 - progress;
  if (action === 'storm') {
    return [-12, 0, 12].map((y) => ({ x: 0, y, angle: y * 0.28 }));
  }
  if (action === 'needle_retreat') {
    return Array.from({ length: 7 }, (_, index) => {
      const unit = index - 3;
      return { x: -Math.abs(unit) * 2 * converging, y: unit * 10 * converging, angle: unit * 8 * converging };
    });
  }
  if (action === 'needle_fan') {
    return Array.from({ length: 5 }, (_, index) => {
      const unit = index - 2;
      return { x: Math.abs(unit) * 3 * opening, y: unit * 15 * opening, angle: unit * 10 * opening };
    });
  }
  if (action === 'needle_rain') {
    return Array.from({ length: 7 }, (_, index) => {
      const unit = index - 3;
      return { x: unit * 10 * opening, y: Math.abs(unit) * -4 * opening, angle: unit * 3 };
    });
  }
  if (action === 'needle_barrage') {
    return Array.from({ length: 12 }, (_, index) => {
      const hand = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2) - 2.5;
      const spread = converging * 22 + opening * 18;
      return {
        x: hand * (12 * converging + Math.abs(row) * 4 * opening),
        y: row * spread,
        angle: row * 5 + hand * 4,
        scale: 0.9 + (index % 3) * 0.06,
      };
    });
  }
  return [{ x: 0, y: 0, angle: 0, scale: action === 'needle_pierce' ? 1.22 : 1 }];
}

function drawNeedle(
  context: CanvasRenderingContext2D,
  placement: NeedlePlacement,
  action: FeifeiNeedleAction,
): void {
  const longTrail = action === 'needle_pierce';
  const trail = longTrail ? 68 : action === 'needle_venom' ? 30 : 22;
  const shaft = longTrail ? 48 : 35;
  context.save();
  context.translate(placement.x, placement.y);
  context.rotate(placement.angle * Math.PI / 180);
  const scale = placement.scale ?? 1;
  context.scale(scale, scale);

  context.strokeStyle = longTrail ? '#e8f4ff' : '#c8b4e4';
  context.globalAlpha = longTrail ? 0.62 : 0.35;
  context.lineWidth = longTrail ? 3 : 2;
  context.beginPath();
  context.moveTo(-shaft / 2 - trail, 0);
  context.lineTo(-shaft / 2, 0);
  context.stroke();

  context.globalAlpha = 1;
  context.lineCap = 'round';
  context.strokeStyle = '#d9d8eb';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-shaft / 2, 0);
  context.lineTo(shaft / 2 - 4, 0);
  context.stroke();

  context.strokeStyle = '#ffffff';
  context.lineWidth = 0.8;
  context.beginPath();
  context.moveTo(-shaft / 2 + 5, -1);
  context.lineTo(shaft / 2 - 6, -1);
  context.stroke();

  context.fillStyle = '#f7f6ff';
  context.beginPath();
  context.moveTo(shaft / 2 + 5, 0);
  context.lineTo(shaft / 2 - 4, -2.5);
  context.lineTo(shaft / 2 - 4, 2.5);
  context.closePath();
  context.fill();

  context.strokeStyle = '#74469d';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(-shaft / 2 - 1, 0);
  context.lineTo(-shaft / 2 + 8, 0);
  context.stroke();
  context.restore();
}

function drawFlight(canvas: HTMLCanvasElement, action: FeifeiNeedleAction, progress: number): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  for (const placement of needlePlacements(action, progress)) drawNeedle(context, placement, action);
  context.restore();
}

function drawImpact(canvas: HTMLCanvasElement, effect: string, progress: number): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.globalAlpha = Math.max(0, 1 - progress);
  const radius = 8 + progress * (effect === 'poison-flower' ? 32 : 23);
  if (effect === 'poison-flower') {
    context.strokeStyle = '#8e50b8';
    context.fillStyle = '#6f2c91';
    context.lineWidth = 2.5;
    for (let petal = 0; petal < 6; petal += 1) {
      const angle = petal * Math.PI / 3;
      const x = Math.cos(angle) * radius * 0.55;
      const y = Math.sin(angle) * radius * 0.55;
      context.beginPath();
      context.arc(x, y, 3 + progress * 5, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.strokeStyle = effect === 'poison-flower' ? '#bb77dc' : '#e8e5ff';
  context.lineWidth = effect === 'pierce-flash' ? 3 : 2;
  const rays = effect === 'net-pricks' ? 12 : effect === 'rain-pricks' ? 8 : 6;
  for (let ray = 0; ray < rays; ray += 1) {
    const angle = ray * Math.PI * 2 / rays;
    context.beginPath();
    context.moveTo(Math.cos(angle) * radius * 0.25, Math.sin(angle) * radius * 0.25);
    context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    context.stroke();
  }
  context.restore();
}

function positionCanvas(
  canvas: HTMLCanvasElement,
  point: FeifeiNeedlePoint,
  angle: number,
): void {
  const x = point.x - canvas.width / 2;
  const y = point.y - canvas.height / 2;
  canvas.dataset.x = formatNumber(point.x);
  canvas.dataset.y = formatNumber(point.y);
  canvas.style.transform = `translate(${formatNumber(x)}px, ${formatNumber(y)}px) rotate(${formatNumber(angle)}deg)`;
}

function applyCanvasStyle(canvas: HTMLCanvasElement, width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;
  Object.assign(canvas.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
    zIndex: '20',
    transformOrigin: '50% 50%',
    filter: 'drop-shadow(0 1px 2px #5b2b7d99)',
  });
}

export function playFeifeiNeedles(
  stage: HTMLElement,
  from: FeifeiNeedlePoint,
  to: FeifeiNeedlePoint,
  options: FeifeiNeedlePlayOptions,
): () => void {
  const waveCount = Math.max(0, Math.floor(options.waves));
  const visual = VISUALS[options.action];
  const flightMs = feifeiNeedleFlightMs(options.action);
  const flights: Array<HTMLCanvasElement | undefined> = Array.from({ length: waveCount });
  const impacts: Array<HTMLCanvasElement | undefined> = Array.from({ length: waveCount });
  const impactEnds = Array.from({ length: waveCount }, () => 0);
  const impacted = Array.from({ length: waveCount }, () => false);
  const startedAt = performance.now() - Math.max(0, options.elapsed ?? 0);
  let raf = 0;
  let disposed = false;
  let completed = false;

  const removeFlight = (wave: number): void => {
    flights[wave]?.remove();
    flights[wave] = undefined;
  };
  const removeImpact = (wave: number): void => {
    impacts[wave]?.remove();
    impacts[wave] = undefined;
  };
  const removeAll = (): void => {
    for (let wave = 0; wave < waveCount; wave += 1) {
      removeFlight(wave);
      removeImpact(wave);
    }
  };

  const createFlight = (wave: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.className = `feifei-needle feifei-needle-${options.action}`;
    canvas.dataset.pattern = options.action;
    canvas.dataset.wave = String(wave);
    canvas.dataset.route = visual.route;
    canvas.dataset.phase = 'flight';
    canvas.dataset.needleCount = String(visual.count);
    canvas.dataset.hands = visual.hands;
    if (options.action === 'needle_combo') canvas.dataset.hand = wave % 2 === 0 ? 'front' : 'back';
    if (visual.trail) canvas.dataset.trail = visual.trail;
    applyCanvasStyle(canvas, visual.width, visual.height);
    drawFlight(canvas, options.action, 0);
    stage.append(canvas);
    flights[wave] = canvas;
    return canvas;
  };

  const createImpact = (wave: number, elapsed: number, impactAt: number): void => {
    if (!visual.impactEffect || !visual.impactDuration || elapsed >= impactAt + visual.impactDuration) return;
    const canvas = document.createElement('canvas');
    canvas.className = `feifei-needle-impact feifei-needle-impact-${options.action}`;
    canvas.dataset.pattern = options.action;
    canvas.dataset.wave = String(wave);
    canvas.dataset.phase = 'impact';
    canvas.dataset.effect = visual.impactEffect;
    applyCanvasStyle(canvas, 96, 96);
    positionCanvas(canvas, to, 0);
    impactEnds[wave] = impactAt + visual.impactDuration;
    drawImpact(canvas, visual.impactEffect, (elapsed - impactAt) / visual.impactDuration);
    stage.append(canvas);
    impacts[wave] = canvas;
  };

  const frame = (now: number): void => {
    raf = 0;
    if (disposed || completed) return;
    const elapsed = Math.max(0, now - startedAt);

    for (let wave = 0; wave < waveCount; wave += 1) {
      const impactCanvas = impacts[wave];
      if (impactCanvas) {
        if (elapsed >= impactEnds[wave]!) removeImpact(wave);
        else drawImpact(
          impactCanvas,
          visual.impactEffect!,
          Math.max(0, (elapsed - (impactEnds[wave]! - visual.impactDuration!)) / visual.impactDuration!),
        );
      }
      if (impacted[wave]) continue;

      const impactAt = options.impactTimes[wave] ?? waveReleaseAt(options.action, wave) + flightMs;
      const releaseAt = Math.max(0, impactAt - flightMs);
      if (elapsed >= impactAt) {
        removeFlight(wave);
        impacted[wave] = true;
        createImpact(wave, elapsed, impactAt);
        options.onImpact(wave);
        if (disposed) return;
        continue;
      }
      if (elapsed < releaseAt) continue;

      const progress = Math.max(0, Math.min(1, (elapsed - releaseAt) / flightMs));
      const origin = waveOrigin(options.action, wave, from);
      const route = routePoint(options.action, origin, to, progress);
      const canvas = flights[wave] ?? createFlight(wave);
      drawFlight(canvas, options.action, progress);
      positionCanvas(canvas, route.point, route.angle);
    }

    if (impacted.every(Boolean) && impacts.every((canvas) => canvas === undefined)) {
      completed = true;
      removeAll();
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
    removeAll();
  };
}
