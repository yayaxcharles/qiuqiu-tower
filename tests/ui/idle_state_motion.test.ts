/**
 * 待機狀態補圖（2026-09-21）：掛彩、氣勢、肚子餓、定身、懶洋洋、鐵布衫、蜷縮（同伴另有翻肚、隱身、炸毛）
 * 原本沒有新版逐格動作，動作畫布一收就退回舊版靜態立繪，同一場戰鬥畫風跳來跳去。
 *
 * 這支測試釘三件事：
 *  1. 戰鬥畫面真正在跑的 `restMotionAction`（直接從 combat.ts 摳出來執行）對四隻貓都選到新動作——
 *     舊寫法同伴只傳待機與中毒、球球少七種，這裡會全部變成 undefined（退回舊立繪）而失敗；
 *  2. 素材缺了就交還舊立繪，不會退成一般站姿把狀態外觀蓋掉；
 *  3. 每個新動作播完停在第 8 格慢慢呼吸（比照翻肚），肚子餓與蜷縮只亮 650～700 毫秒，第 8 格要來得及出現。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import extraMotionData from '../../src/ui/qiuqiu-extra-motion-data.json';
import feifeiMotionData from '../../src/ui/feifei-motion-data.json';
import dangdangMotionData from '../../src/ui/dangdang-motion-data.json';
import fengfengMotionData from '../../src/ui/fengfeng-motion-data.json';
import { qiuqiuRestMotionAction } from '../../src/ui/qiuqiu-combat-motion';
import { restStateAction } from '../../src/ui/rest-state-motion';
import {
  companionMotionDuration,
  companionRestMotionAction,
  createCompanionMotionActor,
  preloadCompanionMotion,
  type CompanionMotionAction,
  type CompanionMotionKind,
} from '../../src/ui/companion-motion';
import { createQiuqiuActor, preloadQiuqiuMotion, qiuqiuMotionDuration, type QiuqiuAction } from '../../src/ui/qiuqiu-motion';

// 待機狀態圖是預載完才在背景下載的；遊戲裡一定是預載完才用到逐格動作，
// 所以先跑一次預載，drawable 才會說「畫得出來」（沒下載好時交還靜態立繪另有測試）。
beforeAll(async () => {
  vi.stubGlobal('Image', class { src = ''; complete = true; naturalWidth = 1; decode() { return Promise.resolve(); } addEventListener() {} });
  await Promise.all([preloadQiuqiuMotion(), ...(['feifei', 'dangdang', 'fengfeng'] as const).map((kind) => preloadCompanionMotion(kind))]);
  vi.unstubAllGlobals();
});

type Source = 'qiuqiu' | CompanionMotionKind;
type Frame = { rect: number[]; pivot: number[]; duration: number };
type Motion = { texture: string; loop: boolean; frames: Frame[] };

/** `POSE` 的欄位 → 期待的新動作名（掛彩的立繪叫 hurt，動作叫 wounded：hurt 動作是挨打的那一下） */
const QIUQIU_STATES = {
  hurt: 'wounded', power: 'power', hungry: 'hungry', dizzy: 'dizzy', lazy: 'lazy', iron: 'iron', curl: 'curl',
} as const;
const COMPANION_STATES = { ...QIUQIU_STATES, belly: 'belly', stealth: 'stealth', puff: 'puff' } as const;
const SOURCES: readonly Source[] = ['qiuqiu', 'feifei', 'dangdang', 'fengfeng'];
const DATA: Record<Source, { actions: Record<string, Motion> }> = {
  qiuqiu: extraMotionData as unknown as { actions: Record<string, Motion> },
  feifei: feifeiMotionData as unknown as { actions: Record<string, Motion> },
  dangdang: dangdangMotionData as unknown as { actions: Record<string, Motion> },
  fengfeng: fengfengMotionData as unknown as { actions: Record<string, Motion> },
};
const statesFor = (source: Source): Record<string, string> => (source === 'qiuqiu' ? QIUQIU_STATES : COMPANION_STATES);

function branch(start: string, end: string): string {
  const src = SRC.replace(/\r\n/g, '\n');
  const first = src.indexOf(start);
  const last = src.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`combat.ts 找不到這一段：${start}`);
  return src.slice(first, last);
}

/** 把 combat.ts 的 `POSE` 與 `restMotionAction` 原封不動摳出來執行（跟 combat_static_motion_handoff 同一招） */
async function combatRestMotion() {
  const code = [
    branch('const POSE = {', 'type PoseKey'),
    branch('  const REST_STATE_POSES = {', '  const mountMotion = ('),
    'return { POSE, restMotionAction };',
  ].join('\n');
  const bindings = {
    cs: { phase: 'player' },
    motionSourceFor: (q: { source: Source }) => q.source,
    qiuqiuRestMotionAction,
    companionRestMotionAction,
  };
  const compiled = await transformWithOxc(code, 'combat-rest-state.ts');
  return new Function(...Object.keys(bindings), compiled.code)(...Object.values(bindings)) as {
    POSE: Record<string, string>;
    restMotionAction(q: { source: Source; down?: boolean }, displayedPose: string): string | undefined;
  };
}

describe('戰鬥畫面的待機狀態選到新版逐格動作', () => {
  it.each(SOURCES)('%s：每一種狀態立繪都換成自己的新動作', async (source) => {
    const { POSE, restMotionAction } = await combatRestMotion();
    for (const [pose, action] of Object.entries(statesFor(source))) {
      expect(POSE[pose], `POSE.${pose}`).toBeTruthy();
      expect(restMotionAction({ source }, POSE[pose]!), `${source} 的 ${pose}`).toBe(action);
    }
    // 原本就接好的不能被弄壞
    expect(restMotionAction({ source }, POSE.idle!)).toBe('idle');
    expect(restMotionAction({ source }, POSE.choke!)).toBe('poison');
    // 挨打那一下（hit）不是待機狀態，照舊交還立繪
    expect(restMotionAction({ source }, POSE.hit!)).toBeUndefined();
  });

  it('球球原本就有的翻肚、隱身、炸毛照舊', async () => {
    const { POSE, restMotionAction } = await combatRestMotion();
    expect(restMotionAction({ source: 'qiuqiu' }, POSE.belly!)).toBe('belly');
    expect(restMotionAction({ source: 'qiuqiu' }, POSE.stealth!)).toBe('stealth');
    expect(restMotionAction({ source: 'qiuqiu' }, POSE.puff!)).toBe('puff');
  });

  it('倒下與勝負仍優先於待機狀態', async () => {
    const { POSE, restMotionAction } = await combatRestMotion();
    expect(restMotionAction({ source: 'dangdang', down: true }, POSE.curl!)).toBe('defeat');
  });

  it('素材不在就交還舊立繪，不退成一般站姿蓋掉狀態外觀', () => {
    const poses = { idle: 'idle-pose', hurt: 'hurt-pose', curl: 'curl-pose' };
    expect(restStateAction('hurt-pose', poses, () => false)).toBeUndefined();
    expect(restStateAction('curl-pose', poses, (action) => action === 'curl')).toBe('curl');
    expect(restStateAction('idle-pose', poses, () => false)).toBe('idle');
    // 沒傳進來的狀態（例如只傳了待機）也不會亂對
    expect(restStateAction('lazy-pose', poses, () => true)).toBeUndefined();
  });

  it('各函式直接呼叫也一樣（同伴、球球）', () => {
    const poses = {
      idle: 'i', poison: 'p', hurt: 'h', power: 'w', hungry: 'g', dizzy: 'd',
      lazy: 'l', iron: 'r', curl: 'c', belly: 'b', stealth: 's', puff: 'f',
    };
    for (const kind of ['feifei', 'dangdang', 'fengfeng'] as const) {
      expect(companionRestMotionAction(kind, 'h', poses, 'player', false)).toBe('wounded');
      expect(companionRestMotionAction(kind, 'c', poses, 'player', false)).toBe('curl');
      expect(companionRestMotionAction(kind, 's', poses, 'player', false)).toBe('stealth');
    }
    expect(qiuqiuRestMotionAction('h', poses, 'player', false)).toBe('wounded');
    expect(qiuqiuRestMotionAction('g', poses, 'player', false)).toBe('hungry');
    expect(qiuqiuRestMotionAction('c', poses, 'player', false)).toBe('curl');
  });
});

describe('新動作的素材資料', () => {
  it.each(SOURCES)('%s：每個新動作都是 8 格、非循環、有自己的圖', (source) => {
    for (const action of new Set(Object.values(statesFor(source)))) {
      const motion = DATA[source].actions[action];
      expect(motion, `${source}/${action}`).toBeDefined();
      expect(motion!.frames).toHaveLength(8);
      expect(motion!.loop).toBe(false);
      expect(motion!.texture).toMatch(new RegExp(`^assets/motion/${source}/(generated_)?${action}\\.webp$`));
    }
  });

  it.each(SOURCES)('%s：肚子餓與蜷縮只亮 650～700 毫秒，第 8 格在 0.45 秒內就要出現', (source) => {
    for (const action of ['hungry', 'curl']) {
      const frames = DATA[source].actions[action]!.frames;
      const eighth = frames.slice(0, 7).reduce((sum, frame) => sum + frame.duration * 1000, 0);
      expect(eighth, `${source}/${action}`).toBeLessThanOrEqual(450);
    }
  });
});

// ── 以下沿用 companion_motion.test.ts 的假畫布 ──
type DrawCall = [CanvasImageSource, number, number, number, number, number, number, number, number];
class FakeContext {
  draws: DrawCall[] = [];
  clearRect(): void {}
  setTransform(): void {}
  drawImage(...args: DrawCall): void { this.draws.push(args); }
}
class FakeCanvas {
  width = 0;
  height = 0;
  className = '';
  readonly style = { width: '', height: '', bottom: '', transform: '' };
  readonly context = new FakeContext();
  getContext(kind: string): FakeContext | null { return kind === '2d' ? this.context : null; }
  setAttribute(): void {}
}
class FakeImage {
  src = '';
  async decode(): Promise<void> {}
}
let nextRaf = 1;
let rafs = new Map<number, FrameRequestCallback>();
let canvases: FakeCanvas[] = [];
function step(time: number): void {
  const pending = [...rafs.values()];
  rafs.clear();
  for (const callback of pending) callback(time);
}
function lastRect(): number[] {
  const draw = canvases.at(-1)?.context.draws.at(-1);
  if (!draw) throw new Error('沒有畫出任何影格');
  return draw.slice(1, 5) as number[];
}

describe('新動作播完停在第 8 格', () => {
  beforeEach(() => {
    nextRaf = 1;
    rafs = new Map();
    canvases = [];
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag !== 'canvas') throw new Error(`非預期元素：${tag}`);
        const canvas = new FakeCanvas();
        canvases.push(canvas);
        return canvas;
      },
    });
    vi.stubGlobal('window', {
      devicePixelRatio: 1,
      requestAnimationFrame: (callback: FrameRequestCallback) => { const id = nextRaf++; rafs.set(id, callback); return id; },
      cancelAnimationFrame: (id: number) => { rafs.delete(id); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const cases = SOURCES.flatMap((source) => [...new Set(Object.values(statesFor(source)))].map((action) => [source, action] as const));
  it.each(cases)('%s／%s', (source, action) => {
    const actor = source === 'qiuqiu'
      ? createQiuqiuActor({ action: action as QiuqiuAction })
      : createCompanionMotionActor(source, { action: action as CompanionMotionAction });
    const duration = source === 'qiuqiu'
      ? qiuqiuMotionDuration(action as QiuqiuAction)
      : companionMotionDuration(source, action as CompanionMotionAction);
    const frames = DATA[source].actions[action]!.frames;
    expect(duration).toBe(Math.round(frames.reduce((sum, frame) => sum + frame.duration * 1000, 0)));
    step(0);
    expect(lastRect()).toEqual(frames[0]!.rect);
    step(duration);
    expect(lastRect()).toEqual(frames[7]!.rect);
    // 停著慢慢呼吸：幾秒後還是第 8 格，而且仍在排程（沒有停住、也沒有輪播回第 1 格）
    step(duration + 3100);
    expect(lastRect()).toEqual(frames[7]!.rect);
    expect(rafs.size).toBe(1);
    actor.dispose();
  });
});
