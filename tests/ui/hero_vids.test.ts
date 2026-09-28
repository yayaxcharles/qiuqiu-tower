import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import vidsData from '../../src/ui/hero-vids/qiuqiu.json';
import motionData from '../../src/ui/qiuqiu-motion-data.json';
import extraMotionData from '../../src/ui/qiuqiu-extra-motion-data.json';
import { heroVidsEnabled, heroVidsMotionsFrom, heroVidsVariant } from '../../src/ui/hero-vids';
import { motionMs } from '../../src/ui/motion-speed';

/**
 * 球球 Google Vids 新動作（2026-09-28 試做）：
 * 對照表不能不見、節奏不能變長、命中那格要對準、圖集不能進開場下載、新圖壞了要退回原本的動作。
 */
const ROOT = join(__dirname, '..', '..');
const VIDS_ACTIONS = ['attack1', 'attack2', 'attack3', 'attack4', 'toss', 'hurt', 'defeat', 'run'];

type Frame = { rect: number[]; pivot: number[]; duration: number; src: number };
type Motion = { texture: string; scale: number; loop: boolean; frames: Frame[]; releaseTimes?: number[] };
const variants = vidsData.variants as unknown as Record<'desktop' | 'mobile', { fps: number; actions: Record<string, Motion> }>;
const oldActions = { ...motionData.actions, ...extraMotionData.actions } as unknown as Record<string, Motion>;

function starts(motion: { frames: readonly { duration: number }[] }): number[] {
  let t = 0;
  return motion.frames.map((frame) => { const s = t; t += frame.duration * 1000; return Math.round(s); });
}
const total = (motion: { frames: readonly { duration: number }[] }): number =>
  Math.round(motion.frames.reduce((sum, frame) => sum + frame.duration * 1000, 0));

describe('球球新動作資料', () => {
  it('兩套（電腦每秒 24 格、手機每秒 12 格）都有八個動作，圖集檔都在', () => {
    expect(variants.desktop.fps).toBe(24);
    expect(variants.mobile.fps).toBe(12);
    for (const variant of ['desktop', 'mobile'] as const) {
      expect(Object.keys(variants[variant].actions).sort()).toEqual([...VIDS_ACTIONS].sort());
      for (const motion of Object.values(variants[variant].actions)) {
        expect(motion.texture.startsWith('assets/motion/hero-vids/qiuqiu-')).toBe(true);
        expect(existsSync(join(ROOT, 'public', motion.texture))).toBe(true);
        expect(motion.texture.endsWith(variant === 'desktop' ? '-d.webp' : '-m.webp')).toBe(true);
      }
    }
  });

  it('加速後每個動作不比原本長，電腦版真的是每秒約 24 格', () => {
    const desktop = heroVidsMotionsFrom(vidsData, 'desktop');
    const mobile = heroVidsMotionsFrom(vidsData, 'mobile');
    const old: Record<string, number> = {
      attack1: motionMs(total(oldActions.attack1!)),
      attack2: motionMs(total(oldActions.attack2!)),
      attack3: motionMs(total(oldActions.attack3!)),
      attack4: motionMs(total(oldActions.attack4!)),
      toss: motionMs(total(oldActions.toss!)),
      defeat: motionMs(total(oldActions.defeat!)),
      run: total(oldActions.run!),          // 跑步不加速
      hurt: 650,                             // 挨打照舊停 0.65 秒、不加速（hit-recoil-motion.ts）
    };
    for (const action of VIDS_ACTIONS) {
      expect(total(desktop[action]!)).toBeLessThanOrEqual(old[action]! + 1);
      expect(total(desktop[action]!)).toBeGreaterThanOrEqual(old[action]! - 1);
      const fps = desktop[action]!.frames.length / (total(desktop[action]!) / 1000);
      expect(fps).toBeGreaterThan(20);
      expect(fps).toBeLessThan(28);
      expect(mobile[action]!.frames.length).toBeLessThan(desktop[action]!.frames.length);
    }
  });

  it('命中那一格剛好在原本寫死的命中時間開始（貓抓 70／90／100／160 毫秒、空手擲出手 240 毫秒，都是原速）', () => {
    const desktop = heroVidsMotionsFrom(vidsData, 'desktop');
    const hitAt = (action: string, sourceMs: number): number => {
      const index = starts(desktop[action]!).indexOf(motionMs(sourceMs));
      expect(index).toBeGreaterThan(0);
      return (desktop[action]!.frames[index] as unknown as Frame).src;
    };
    expect(hitAt('attack1', 70)).toBe(30);     // 揮爪_v2a 第 30 格＝爪痕最大
    expect(hitAt('attack3', 100)).toBe(30);
    expect(hitAt('attack2', 90)).toBe(36);     // 貓抓B_flow_omni_v1 第 36 格＝爪痕在身前
    expect(hitAt('attack4', 160)).toBe(36);
    expect(hitAt('toss', 240)).toBe(34);       // 前投空手_v1 第 34 格出手
    expect(desktop.toss!.releaseTimes).toEqual([motionMs(240)]);
  });

  it('沒有瀏覽器網址（單元測試）或網址帶 vids=0 就不用；觸控螢幕用手機版', () => {
    expect(heroVidsEnabled(null)).toBe(false);
    expect(heroVidsEnabled('')).toBe(true);
    expect(heroVidsEnabled('?vids=0')).toBe(false);
    expect(heroVidsVariant('?vids=m')).toBe('mobile');
    expect(heroVidsVariant('?vids=d')).toBe('desktop');
  });
});

describe('新動作不進開場下載', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
    });
  }

  it('格子資料只用動態 import 載入，程式裡沒有任何地方直接寫圖集網址', () => {
    for (const file of [...sources(join(ROOT, 'src')), join(ROOT, 'index.html')]) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/^\s*import\s[^(\n]*hero-vids\/[^'"\n]*\.json/m);
      expect(text, file).not.toContain('assets/motion/hero-vids');
      if (text.includes('hero-vids/qiuqiu.json')) expect(text).toContain("import('./hero-vids/qiuqiu.json')");
    }
  });

  it('圖集不在素材清單（開場預載）裡', () => {
    const manifest = readFileSync(join(ROOT, 'public', 'assets', 'manifest.json'), 'utf8');
    expect(manifest).not.toContain('hero-vids');
  });
});

// ---- 接上遊戲：預載時換上新動作；新圖壞掉就整組退回 ----

class FakeCanvas {
  width = 0; height = 0; className = '';
  style = { width: '', height: '', bottom: '' };
  readonly draws: unknown[][] = [];
  getContext(): unknown {
    return { clearRect() {}, setTransform() {}, drawImage: (...args: unknown[]) => { this.draws.push(args); } };
  }
  setAttribute(): void {}
}

let broken = (src: string): boolean => { void src; return false; };
const loaded: string[] = [];

class FakeImage {
  src = '';
  addEventListener(type: string, listener: () => void): void {
    queueMicrotask(() => {
      const bad = broken(this.src);
      if (type === 'load' && !bad) { loaded.push(this.src); listener(); }
      if (type === 'error' && bad) listener();
    });
  }
}

let canvases: FakeCanvas[] = [];

beforeEach(() => {
  vi.resetModules();
  loaded.length = 0;
  canvases = [];
  broken = () => false;
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('document', { createElement: () => { const c = new FakeCanvas(); canvases.push(c); return c; } });
  vi.stubGlobal('window', { devicePixelRatio: 2, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} });
});

afterEach(() => vi.unstubAllGlobals());

function lastTexture(): string {
  const draw = canvases.at(-1)?.draws.at(-1);
  if (!draw) throw new Error('沒有畫出任何影格');
  return (draw[0] as FakeImage).src;
}

describe('球球新動作接上遊戲', () => {
  it('選到球球預載時才換上新動作，只下載電腦版那套、只有球球的', async () => {
    const motion = await import('../../src/ui/qiuqiu-motion');
    expect(loaded.some((src) => src.includes('hero-vids'))).toBe(false);
    await motion.preloadQiuqiuMotion();
    expect([...motion.qiuqiuHeroVidsActions()].sort()).toEqual([...VIDS_ACTIONS].sort());
    const vids = loaded.filter((src) => src.includes('hero-vids'));
    expect(vids.length).toBeGreaterThan(0);
    expect(vids.every((src) => src.endsWith('-d.webp') && src.includes('/qiuqiu-'))).toBe(true);
    motion.createQiuqiuActor({ action: 'attack1' });
    expect(lastTexture()).toContain('assets/motion/hero-vids/qiuqiu-claw-d.webp');
    motion.createQiuqiuActor({ action: 'hurt' });
    expect(lastTexture()).toContain('hero-vids/qiuqiu-hurt-d.webp');
    // 沒有新片的動作、待機照舊
    motion.createQiuqiuActor({ action: 'attack2' });
    expect(lastTexture()).toContain('hero-vids/qiuqiu-clawb-d.webp');
    motion.createQiuqiuActor({ action: 'seal' });
    expect(lastTexture()).toContain('assets/motion/qiuqiu/seal_sheet.webp');
    motion.createQiuqiuActor({ action: 'idle' });
    expect(lastTexture()).toContain('assets/motion/qiuqiu/idle_hurt_sheet.webp');
    expect(motion.qiuqiuMotionDuration('hurt')).toBe(650);
  });

  it('新圖集載不到：整組退回原本的動作，不空白', async () => {
    broken = (src) => src.includes('hero-vids');
    const motion = await import('../../src/ui/qiuqiu-motion');
    await motion.preloadQiuqiuMotion();
    expect(motion.qiuqiuHeroVidsActions()).toEqual([]);
    expect(motion.qiuqiuMotionReady()).toBe(true);
    motion.createQiuqiuActor({ action: 'attack1' });
    expect(lastTexture()).toContain('assets/motion/qiuqiu/claw_1_sheet.webp');
    motion.createQiuqiuActor({ action: 'hurt' });
    expect(lastTexture()).toContain('assets/motion/qiuqiu/hit_recoil.webp');
  });

  it('網址帶 vids=0 就完全不抓新動作', async () => {
    vi.stubGlobal('location', { search: '?vids=0' });
    const motion = await import('../../src/ui/qiuqiu-motion');
    await motion.preloadQiuqiuMotion();
    expect(motion.qiuqiuHeroVidsActions()).toEqual([]);
    expect(loaded.some((src) => src.includes('hero-vids'))).toBe(false);
  });
});
