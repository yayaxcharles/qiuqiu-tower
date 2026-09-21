import { createQiuqiuActor, qiuqiuImpactDelay, qiuqiuMotionDuration, type QiuqiuAction, type QiuqiuActor } from './qiuqiu-motion';
import {
  FEIFEI_CLONE_TIMING,
  createCompanionMotionActor,
  type CompanionMotionActor,
  type FeifeiMotionAction,
} from './companion-motion';
import { motionMs } from './motion-speed';

type Point = { x: number; y: number };

// 分身現身、淡入、收招後淡出的時間：motionMs() 括號裡是原速毫秒，跟分身的出招動作一起換成 1.5 倍速
const ECHO_APPEAR_LEAD_MS = motionMs(70);
const ULTIMATE_CLONE_APPEAR_LEAD_MS = motionMs(160);
const ECHO_FADE_IN_LEAD_MS = motionMs(20);
const ECHO_FADE_IN_MS = motionMs(60);
const ECHO_FADE_OUT_MS = motionMs(140);

type EchoActor<Action extends string> = Readonly<{
  element: HTMLCanvasElement;
  play(action: Action, options?: { elapsed?: number }): void;
  dispose(): void;
}>;

type EchoEntry<Action extends string> = {
  pose: Action;
  appear: number;
  begin: number;
  end: number;
  side: -1 | 1;
  playing: boolean;
  actor?: EchoActor<Action>;
  layer?: HTMLElement;
};

function playMotionEchoes<Action extends string>(
  stage: HTMLElement,
  target: Point & { width: number },
  entries: EchoEntry<Action>[],
  options: { elapsed?: number; height?: number; className: string; onDone: () => void },
  createActor: (height: number) => EchoActor<Action>,
): () => void {
  const started = performance.now() - Math.max(0, options.elapsed ?? 0);
  let stopped = false;
  let raf = 0;
  const dispose = (): void => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    for (const entry of entries) { entry.actor?.dispose(); entry.layer?.remove(); }
  };
  const frame = (now: number): void => {
    if (stopped) return;
    const elapsed = now - started;
    for (const entry of entries) {
      if (elapsed < entry.appear) continue;
      // 收掉之後要記起來：沒有旗標的話，先結束的分身會在之後每一幀被重複 dispose 與 remove，
      // 三個分身錯開結束，中間那段每幀白做兩次 DOM 操作（稽核 2026-09-21 第 9 點）。
      if (elapsed >= entry.end) {
        if (entry.actor || entry.layer) { entry.actor?.dispose(); entry.layer?.remove(); entry.actor = undefined; entry.layer = undefined; }
        continue;
      }
      if (!entry.actor) {
        const height = options.height ?? 252;
        entry.actor = createActor(height);
        entry.layer = document.createElement('div');
        entry.layer.className = options.className;
        const x = target.x + entry.side * (target.width * .25 + 100 * height / 252);
        Object.assign(entry.layer.style, {
          position: 'absolute', left: `${x}px`, top: `${target.y}px`,
          width: '0', height: '0', pointerEvents: 'none', zIndex: '19',
          transform: entry.side > 0 ? 'scaleX(-1)' : '',
          filter: 'saturate(.72) brightness(1.12)',
        });
        entry.layer.append(entry.actor.element);
        stage.append(entry.layer);
      }
      if (elapsed >= entry.begin && !entry.playing) {
        entry.playing = true;
        entry.actor.play(entry.pose, { elapsed: Math.max(0, elapsed - entry.begin) });
      }
      const fadeIn = Math.min(1, (elapsed - entry.appear + ECHO_FADE_IN_LEAD_MS) / ECHO_FADE_IN_MS);
      const fadeOut = Math.min(1, (entry.end - elapsed) / ECHO_FADE_OUT_MS);
      entry.layer!.style.opacity = String(.78 * fadeIn * fadeOut);
    }
    if (entries.every((entry) => elapsed >= entry.end)) { dispose(); options.onDone(); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return dispose;
}

/** 分身各自演完；下一張牌只接管本體，不會把上一張已出手的分身切掉。 */
export function playQiuqiuEchoes(
  stage: HTMLElement,
  action: QiuqiuAction,
  target: Point & { width: number },
  options: { impactTimes: readonly number[]; elapsed?: number; height?: number; onDone: () => void },
): () => void {
  const entries = options.impactTimes.map((impact, index) => {
    const pose: QiuqiuAction = action === 'ultimate_clone'
      ? (['attack1', 'kick', 'attack4'] as const)[index % 3]! : 'attack1';
    const begin = Math.max(0, impact - qiuqiuImpactDelay(pose));
    const appear = Math.max(0, begin - (action === 'ultimate_clone' ? ULTIMATE_CLONE_APPEAR_LEAD_MS : ECHO_APPEAR_LEAD_MS));
    return { pose, appear, begin, side: (index % 2 === 1 ? 1 : -1) as -1 | 1,
      playing: false, end: begin + qiuqiuMotionDuration(pose) + ECHO_FADE_OUT_MS,
      actor: undefined as QiuqiuActor | undefined, layer: undefined as HTMLElement | undefined };
  });
  return playMotionEchoes(stage, target, entries, { ...options, className: 'qiuqiu-echo' },
    (height) => createQiuqiuActor({ height }));
}

/** 菲菲的毒分身先顯現待機，再用自己的爪擊完整出招。 */
export function playFeifeiClone(
  stage: HTMLElement,
  target: Point & { width: number },
  options: { elapsed?: number; height?: number; onDone: () => void },
): () => void {
  const entries: EchoEntry<FeifeiMotionAction>[] = [{
    pose: 'attack1',
    appear: FEIFEI_CLONE_TIMING.appear,
    begin: FEIFEI_CLONE_TIMING.begin,
    end: FEIFEI_CLONE_TIMING.end,
    side: -1,
    playing: false,
    actor: undefined as CompanionMotionActor | undefined,
    layer: undefined,
  }];
  return playMotionEchoes(stage, target, entries, { ...options, className: 'feifei-clone' },
    (height) => createCompanionMotionActor('feifei', { height }));
}

/** 殘影只複製當下完整畫布，沒有線條或常駐軌跡。 */
export function playQiuqiuAfterimages(
  stage: HTMLElement,
  actor: QiuqiuActor,
  foot: Point,
  options: { duration: number; elapsed?: number; onDone: () => void },
): () => void {
  const started = performance.now() - Math.max(0, options.elapsed ?? 0);
  const ghosts: Array<{ canvas: HTMLCanvasElement; at: number }> = [];
  // 每張殘影畫的都是開招那一格，內容一樣：收掉的畫布留著下一張再用，不再每 50 毫秒新建一張
  // 全尺寸（高解析度螢幕上約 1.6 MB）的加速畫布；同時在場最多三、四張（稽核 2026-09-21 晚 中-3）
  const spare: HTMLCanvasElement[] = [];
  const captured = document.createElement('canvas');
  captured.width = actor.element.width;
  captured.height = actor.element.height;
  captured.getContext('2d')?.drawImage(actor.element, 0, 0);
  const lifetime = 150;
  let last = -50;
  let raf = 0;
  let stopped = false;
  const dispose = (): void => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    for (const ghost of ghosts) ghost.canvas.remove();
    ghosts.length = 0;
    spare.length = 0;
  };
  const frame = (now: number): void => {
    if (stopped) return;
    const elapsed = now - started;
    if (elapsed < options.duration && elapsed - last >= 50) {
      last = elapsed;
      let canvas = spare.pop();
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'qiuqiu-afterimage';
        canvas.width = actor.element.width;
        canvas.height = actor.element.height;
        canvas.getContext('2d')?.drawImage(captured, 0, 0);
      }
      // A captured whole pose drifts a few pixels behind the fighter then fades.
      Object.assign(canvas.style, { position: 'absolute', pointerEvents: 'none', zIndex: '18',
        left: `${foot.x - actor.foot.x}px`, top: `${foot.y - actor.foot.y}px`,
        width: `${actor.width}px`, height: `${actor.height}px`, opacity: '', transform: '' });
      stage.append(canvas);
      ghosts.push({ canvas, at: elapsed });
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const ghost = ghosts[i]!;
      const age = elapsed - ghost.at;
      if (age >= lifetime) { ghost.canvas.remove(); spare.push(ghost.canvas); ghosts.splice(i, 1); }
      else { ghost.canvas.style.opacity = String(.24 * (1 - age / lifetime));
        ghost.canvas.style.transform = `translateX(${-age * .10}px)`; }
    }
    if (elapsed >= options.duration && ghosts.length === 0) { dispose(); options.onDone(); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return dispose;
}
