import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import qiuqiuVids from '../../src/ui/hero-vids/qiuqiu.json';
import feifeiVids from '../../src/ui/hero-vids/feifei.json';
import dangdangVids from '../../src/ui/hero-vids/dangdang.json';
import fengfengVids from '../../src/ui/hero-vids/fengfeng.json';
import motionData from '../../src/ui/qiuqiu-motion-data.json';
import extraMotionData from '../../src/ui/qiuqiu-extra-motion-data.json';
import attackMotionData from '../../src/ui/qiuqiu-attack-motion-data.json';
import feifeiData from '../../src/ui/feifei-motion-data.json';
import dangdangData from '../../src/ui/dangdang-motion-data.json';
import dangdangAttackData from '../../src/ui/dangdang-attack-motion-data.json';
import fengfengData from '../../src/ui/fengfeng-motion-data.json';
import fengfengAttackData from '../../src/ui/fengfeng-attack-motion-data.json';
import { heroVidsEnabled, heroVidsMotionsFrom, heroVidsVariant } from '../../src/ui/hero-vids';
import { motionMs } from '../../src/ui/motion-speed';

/**
 * 主角 Google Vids／Flow Omni 新動作（2026-09-28 球球試做、09-29 擴到四位）：
 * 每位的對照表不能少、節奏不能變長、命中那格要對準、圖集不能進開場下載、只載選到的主角、新圖壞了要退回原本的動作。
 */
const ROOT = join(__dirname, '..', '..');
type Hero = 'qiuqiu' | 'feifei' | 'dangdang' | 'fengfeng';
const HEROES: readonly Hero[] = ['qiuqiu', 'feifei', 'dangdang', 'fengfeng'];

/** 每位換成新片的動作（清單.md 總結；09-29 重生後菲菲加空手擲與倒下、封封加平斬、重劈、收刀與倒下；待機維持停格呼吸） */
const VIDS_ACTIONS: Readonly<Record<Hero, readonly string[]>> = {
  qiuqiu: ['attack1', 'attack2', 'attack3', 'attack4', 'toss', 'hurt', 'defeat', 'run', 'seal', 'guard', 'win', 'focus', 'dash', 'kick', 'eat', 'taiji', 'shuriken'],
  feifei: ['shuriken', 'seal', 'guard', 'attack1', 'win', 'hurt', 'run', 'toss', 'defeat', 'kick', 'eat', 'roll'],
  dangdang: ['guard', 'punch', 'focus', 'palm', 'win', 'shoulder', 'hurt', 'defeat', 'run', 'toss', 'dodge', 'counter', 'eat', 'kick', 'rapid_combo'],
  fengfeng: ['focus', 'guard', 'win', 'thrust', 'hurt', 'run', 'slash', 'heavy_slash', 'sheath', 'defeat', 'toss', 'dodge', 'eat', 'sweep', 'double_slash'],
};
/**
 * 沒有新片、一定要留在原本那套的（對照表多出來也算錯：例如把舊的空手擲蓋掉）。
 * 2026-09-29 審查退回過菲菲、封封倒下、封封平斬與收刀，同日重生（菲菲空手擲 v5、倒下 v2；封封平斬 v5、重劈 v5、收刀 v4、倒下 v3）後已接上
 */
const KEEP_OLD: Readonly<Record<Hero, readonly string[]>> = {
  qiuqiu: ['idle'],
  feifei: ['idle', 'needle_combo'],
  dangdang: ['idle'],
  fengfeng: ['idle'],
};

type Frame = { rect: number[]; pivot: number[]; duration: number; src: number };
type Motion = { texture: string; scale: number; loop: boolean; frames: Frame[]; impactTimes?: number[]; releaseTimes?: number[] };
type VidsFile = { variants: Record<'desktop' | 'mobile', { fps: number; actions: Record<string, Motion> }> };
const FILES: Readonly<Record<Hero, unknown>> = { qiuqiu: qiuqiuVids, feifei: feifeiVids, dangdang: dangdangVids, fengfeng: fengfengVids };
const variantsOf = (hero: Hero) => (FILES[hero] as VidsFile).variants;
/**
 * 刻意比舊動作短的（原速秒數）：09-29 晚使用者說封封「不太流暢、有點慢速、卡頓感」，
 * 查到平斬、重劈命中後刀停著 0.4～0.5 秒才收刀 → 剪掉停頓（pack_hero_vids.py 的 `trimTail`）。
 * 命中時間不變，後面接的收刀照舊，只是早一點接上。
 */
const TRIMMED: Readonly<Partial<Record<Hero, Readonly<Record<string, number>>>>> = {
  fengfeng: { slash: 0.6, heavy_slash: 0.7 },
};
const OLD: Readonly<Record<Hero, Record<string, Motion>>> = {
  qiuqiu: { ...motionData.actions, ...extraMotionData.actions, ...attackMotionData.actions } as unknown as Record<string, Motion>,
  feifei: feifeiData.actions as unknown as Record<string, Motion>,
  dangdang: { ...dangdangData.actions, ...dangdangAttackData.actions } as unknown as Record<string, Motion>,
  fengfeng: { ...fengfengData.actions, ...fengfengAttackData.actions } as unknown as Record<string, Motion>,
};

function starts(motion: { frames: readonly { duration: number }[] }): number[] {
  let t = 0;
  return motion.frames.map((frame) => { const s = t; t += frame.duration * 1000; return Math.round(s); });
}
const total = (motion: { frames: readonly { duration: number }[] }): number =>
  Math.round(motion.frames.reduce((sum, frame) => sum + frame.duration * 1000, 0));

describe.each(HEROES)('%s 新動作資料', (hero) => {
  it('兩套（電腦每秒 24 格、手機每秒 12 格）動作一個不少、一個不多，圖集檔都在、檔名以這位開頭', () => {
    const variants = variantsOf(hero);
    expect(variants.desktop.fps).toBe(24);
    expect(variants.mobile.fps).toBe(12);
    for (const variant of ['desktop', 'mobile'] as const) {
      expect(Object.keys(variants[variant].actions).sort()).toEqual([...VIDS_ACTIONS[hero]].sort());
      for (const keep of KEEP_OLD[hero]) expect(variants[variant].actions[keep]).toBeUndefined();
      for (const motion of Object.values(variants[variant].actions)) {
        expect(motion.texture.startsWith(`assets/motion/hero-vids/${hero}-`)).toBe(true);
        expect(existsSync(join(ROOT, 'public', motion.texture))).toBe(true);
        expect(motion.texture.endsWith(variant === 'desktop' ? '-d.webp' : '-m.webp')).toBe(true);
      }
    }
  });

  it('加速後每個動作跟原本一樣長（回合不變長），電腦版真的是每秒約 24 格', () => {
    const desktop = heroVidsMotionsFrom(FILES[hero], 'desktop');
    const mobile = heroVidsMotionsFrom(FILES[hero], 'mobile');
    for (const action of VIDS_ACTIONS[hero]) {
      const want = action === 'hurt' ? 650                      // 挨打照舊停 0.65 秒、不加速（hit-recoil-motion.ts）
        : action === 'run' ? 480                                 // 跑步不加速；一圈 0.48 秒＝腳步聲兩步（acttransition.ts 每 240 毫秒一步）
          : TRIMMED[hero]?.[action] !== undefined ? motionMs(TRIMMED[hero]![action]! * 1000)
          : motionMs(total(OLD[hero][action]!));
      expect(Math.abs(total(desktop[action]!) - want), `${hero} ${action}`).toBeLessThanOrEqual(1);
      const fps = desktop[action]!.frames.length / (total(desktop[action]!) / 1000);
      expect(fps, `${hero} ${action}`).toBeGreaterThan(20);
      expect(fps, `${hero} ${action}`).toBeLessThan(28);
      expect(mobile[action]!.frames.length).toBeLessThan(desktop[action]!.frames.length);
      expect(desktop[action]!.loop).toBe(action === 'run');
    }
  });

  it('舊資料的命中／出手時間原樣帶過來', () => {
    const desktop = heroVidsMotionsFrom(FILES[hero], 'desktop');
    for (const action of VIDS_ACTIONS[hero]) {
      if (action === 'hurt') continue;
      const old = OLD[hero][action]!;
      expect(desktop[action]!.impactTimes, `${hero} ${action}`).toEqual(old.impactTimes?.map(motionMs));
      expect(desktop[action]!.releaseTimes, `${hero} ${action}`).toEqual(old.releaseTimes?.map(motionMs));
    }
  });
});

describe('命中那一格剛好在原本寫死的命中時間開始（原速毫秒 → 來源第幾格）', () => {
  const HITS: Readonly<Record<Hero, readonly (readonly [string, number, number])[]>> = {
    // 揮爪_v2a 第 30 格＝爪痕最大；貓抓B 第 36 格；空手擲第 34 格出手；突進第 31 格拳頭打到最遠
    qiuqiu: [['attack1', 70, 30], ['attack3', 100, 30], ['attack2', 90, 36], ['attack4', 160, 36], ['toss', 240, 34], ['dash', 60, 31]],
    // 彈針第 36 格手伸直（程式的針從這裡飛出去）；爪擊第 24 格；結印第 28 格＝分身停住的那格（原速 170）
    feifei: [['shuriken', 285, 36], ['attack1', 340, 24], ['seal', 170, 28]],
    dangdang: [['punch', 300, 28], ['palm', 340, 32], ['shoulder', 360, 50]],
    fengfeng: [['thrust', 300, 45]],
  };
  it.each(HEROES)('%s', (hero) => {
    const desktop = heroVidsMotionsFrom(FILES[hero], 'desktop');
    for (const [action, sourceMs, src] of HITS[hero]) {
      const index = starts(desktop[action]!).indexOf(motionMs(sourceMs));
      expect(index, `${hero} ${action}`).toBeGreaterThan(0);
      expect((desktop[action]!.frames[index] as unknown as Frame).src, `${hero} ${action}`).toBe(src);
    }
  });
});

describe('2026-09-29 閘門審查修的兩處跳格', () => {
  const srcs = (hero: Hero, action: string): number[] => variantsOf(hero).desktop.actions[action]!.frames.map((f) => f.src);
  it('球球勝利起跳那段（第 20～25 格）一格都不跳，不然一格就高 20%', () => {
    const s = srcs('qiuqiu', 'win');
    const at = s.indexOf(20);
    expect(s.slice(at, at + 6)).toEqual([20, 21, 22, 23, 24, 25]);
  });
  it('菲菲挨打從站姿（第 24 格）開始，不用衝擊光貼著手的第 27～28 格', () => {
    const s = srcs('feifei', 'hurt');
    expect(s[0]).toBe(24);
    expect(s).not.toContain(27);
    expect(s).not.toContain(28);
  });
});

describe('開關', () => {
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
      for (const hero of HEROES) {
        if (text.includes(`hero-vids/${hero}.json`)) expect(text).toContain(`import('./hero-vids/${hero}.json')`);
      }
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

const vidsHeroes = (): string[] => [...new Set(loaded.flatMap((src) => src.match(/hero-vids\/([a-z]+)-/)?.[1] ?? []))].sort();

describe('球球新動作接上遊戲', () => {
  it('選到球球預載時才換上新動作，只下載電腦版那套、只有球球的', async () => {
    const motion = await import('../../src/ui/qiuqiu-motion');
    expect(loaded.some((src) => src.includes('hero-vids'))).toBe(false);
    await motion.preloadQiuqiuMotion();
    expect([...motion.qiuqiuHeroVidsActions()].sort()).toEqual([...VIDS_ACTIONS.qiuqiu].sort());
    const vids = loaded.filter((src) => src.includes('hero-vids'));
    expect(vids.length).toBeGreaterThan(0);
    expect(vids.every((src) => src.endsWith('-d.webp') && src.includes('/qiuqiu-'))).toBe(true);
    motion.createQiuqiuActor({ action: 'attack1' });
    expect(lastTexture()).toContain('assets/motion/hero-vids/qiuqiu-claw-d.webp');
    motion.createQiuqiuActor({ action: 'hurt' });
    expect(lastTexture()).toContain('hero-vids/qiuqiu-hurt-d.webp');
    motion.createQiuqiuActor({ action: 'attack2' });
    expect(lastTexture()).toContain('hero-vids/qiuqiu-clawb-d.webp');
    motion.createQiuqiuActor({ action: 'seal' });
    expect(lastTexture()).toContain('hero-vids/qiuqiu-seal-d.webp');
    motion.createQiuqiuActor({ action: 'guard' });
    expect(lastTexture()).toContain('hero-vids/qiuqiu-guard-d.webp');
    // 沒有新片的動作、待機照舊（待機維持停格呼吸，使用者 09-28 裁定）
    motion.createQiuqiuActor({ action: 'shuriken' });
    expect(lastTexture()).toContain('hero-vids/qiuqiu-shuriken-d.webp');   // 09-29 第二輪 Flow 片接上
    motion.createQiuqiuActor({ action: 'idle' });
    expect(lastTexture()).toContain('assets/motion/qiuqiu/idle_hurt_sheet.webp');
    expect(motion.qiuqiuMotionDuration('hurt')).toBe(650);
  });

  it('新動作的長度與命中時間跟原本那套一模一樣', async () => {
    vi.stubGlobal('location', { search: '?vids=0' });
    const oldMotion = await import('../../src/ui/qiuqiu-motion');
    await oldMotion.preloadQiuqiuMotion();
    const cards = ['attack1', 'attack2', 'attack3', 'attack4', 'toss', 'dash', 'seal', 'guard', 'win', 'focus', 'defeat',
      'clone', 'clone_duo', 'ultimate_clone', 'ultimate_storm'] as const;
    const before = cards.map((a) => [oldMotion.qiuqiuMotionDuration(a), oldMotion.qiuqiuImpactTimes(a, 3)]);
    vi.resetModules();
    vi.stubGlobal('location', { search: '' });
    const motion = await import('../../src/ui/qiuqiu-motion');
    await motion.preloadQiuqiuMotion();
    expect(motion.qiuqiuHeroVidsActions().length).toBeGreaterThan(0);
    expect(cards.map((a) => [motion.qiuqiuMotionDuration(a), motion.qiuqiuImpactTimes(a, 3)])).toEqual(before);
  });

  it('新圖集載不到：整組退回原本的動作，不空白', async () => {
    broken = (src) => src.includes('hero-vids');
    const motion = await import('../../src/ui/qiuqiu-motion');
    await motion.preloadQiuqiuMotion();
    expect(motion.qiuqiuHeroVidsActions()).toEqual([]);
    expect(motion.qiuqiuMotionReady()).toBe(true);
    motion.createQiuqiuActor({ action: 'attack1' });
    expect(lastTexture()).toContain('assets/motion/qiuqiu/claw_1_sheet.webp');
    motion.createQiuqiuActor({ action: 'seal' });
    expect(lastTexture()).toContain('assets/motion/qiuqiu/seal_sheet.webp');
    motion.createQiuqiuActor({ action: 'hurt' });
    expect(lastTexture()).toContain('assets/motion/qiuqiu/hit_recoil.webp');
  });

  it('新圖集載不到、兩處同時預載：後到的那個不丟錯，一起退回原本的動作', async () => {
    broken = (src) => src.includes('hero-vids');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const motion = await import('../../src/ui/qiuqiu-motion');
    await expect(Promise.all([motion.preloadQiuqiuMotion(), motion.preloadQiuqiuMotion()])).resolves.toBeDefined();
    expect(motion.qiuqiuHeroVidsActions()).toEqual([]);
    expect(motion.qiuqiuMotionReady()).toBe(true);
    motion.createQiuqiuActor({ action: 'attack1' });
    expect(lastTexture()).toContain('assets/motion/qiuqiu/claw_1_sheet.webp');
    warn.mockRestore();
  });

  it('網址帶 vids=0 就完全不抓新動作', async () => {
    vi.stubGlobal('location', { search: '?vids=0' });
    const motion = await import('../../src/ui/qiuqiu-motion');
    await motion.preloadQiuqiuMotion();
    expect(motion.qiuqiuHeroVidsActions()).toEqual([]);
    expect(loaded.some((src) => src.includes('hero-vids'))).toBe(false);
  });
});

type Kind = 'feifei' | 'dangdang' | 'fengfeng';
const KINDS: readonly Kind[] = ['feifei', 'dangdang', 'fengfeng'];
/** 每位挑一個出牌動作看畫的是哪張圖集（新片）、一個沒有新片的看還是舊圖集 */
const PROBE: Readonly<Record<Kind, { vids: [string, string]; old: [string, string] }>> = {
  feifei: { vids: ['attack1', 'feifei-claw-d.webp'], old: ['needle_combo', 'assets/motion/feifei/needle_combo_v3.webp'] },
  dangdang: { vids: ['punch', 'dangdang-punch-d.webp'], old: ['idle', 'assets/motion/dangdang/idle_hurt.webp'] },
  fengfeng: { vids: ['thrust', 'fengfeng-thrust-d.webp'], old: ['idle', 'assets/motion/fengfeng/idle_hurt.webp'] },
};
const CARD_ACTIONS: Readonly<Record<Kind, readonly string[]>> = {
  feifei: ['shuriken', 'seal', 'guard', 'attack1', 'win', 'defeat', 'clone', 'toss', 'kick'],
  dangdang: ['guard', 'punch', 'focus', 'palm', 'win', 'shoulder', 'defeat', 'palm_throw', 'kick'],
  fengfeng: ['slash', 'sheath', 'focus', 'guard', 'win', 'thrust', 'defeat', 'thrust_throw', 'heavy_slash'],
};

describe.each(KINDS)('%s 新動作接上遊戲', (kind) => {
  it('選到這位預載時才換上新動作，只下載這位的電腦版', async () => {
    const motion = await import('../../src/ui/companion-motion');
    expect(loaded.some((src) => src.includes('hero-vids'))).toBe(false);
    await motion.preloadCompanionMotion(kind);
    expect([...motion.companionHeroVidsActions(kind)].sort()).toEqual([...VIDS_ACTIONS[kind]].sort());
    expect(vidsHeroes()).toEqual([kind]);
    expect(loaded.filter((src) => src.includes('hero-vids')).every((src) => src.endsWith('-d.webp'))).toBe(true);
    // 換掉的動作原本那張圖不再下載（挨打立繪、跑步）
    expect(loaded).not.toContain(`/assets/motion/${kind}/hit_recoil.webp`);
    expect(loaded).not.toContain(`/assets/motion/${kind}/run.webp`);
    motion.createCompanionMotionActor(kind, { action: PROBE[kind].vids[0] as never });
    expect(lastTexture()).toContain(PROBE[kind].vids[1]);
    motion.createCompanionMotionActor(kind, { action: 'hurt' });
    expect(lastTexture()).toContain(`hero-vids/${kind}-hurt-d.webp`);
    motion.createCompanionMotionActor(kind, { action: 'run' });
    expect(lastTexture()).toContain(`hero-vids/${kind}-run-d.webp`);
    motion.createCompanionMotionActor(kind, { action: PROBE[kind].old[0] as never });
    expect(lastTexture()).toContain(PROBE[kind].old[1]);
    motion.createCompanionMotionActor(kind, { action: 'idle' });
    expect(lastTexture()).toContain(`assets/motion/${kind}/idle_hurt.webp`);
    expect(motion.companionMotionDuration(kind, 'hurt')).toBe(650);
  });

  it('出牌動作的長度（封封含收刀）、命中與出手時間跟原本那套一模一樣', async () => {
    const snapshot = (m: typeof import('../../src/ui/companion-motion')) => CARD_ACTIONS[kind].map((a) => [
      a, m.companionMotionDuration(kind, a as never, 1), m.companionMotionDuration(kind, a as never, 3),
      m.companionImpactTimes(kind, a as never, 2), m.companionThrowRelease(kind, a),
    ]);
    vi.stubGlobal('location', { search: '?vids=0' });
    const oldMotion = await import('../../src/ui/companion-motion');
    await oldMotion.preloadCompanionMotion(kind);
    // 剪掉停頓的動作：總長照剪掉的量縮短，命中與出手時間不變
    const cut = (a: string): number => {
      const t = TRIMMED[kind]?.[a];
      return t === undefined ? 0 : motionMs(total(OLD[kind][a]!)) - motionMs(t * 1000);
    };
    const before = snapshot(oldMotion).map(([a, d1, d3, ...rest]) => [a, (d1 as number) - cut(a as string), (d3 as number) - cut(a as string), ...rest]);
    vi.resetModules();
    vi.stubGlobal('location', { search: '' });
    const motion = await import('../../src/ui/companion-motion');
    await motion.preloadCompanionMotion(kind);
    expect(motion.companionHeroVidsActions(kind).length).toBeGreaterThan(0);
    expect(snapshot(motion)).toEqual(before);
  });

  it('新圖集載不到：整組退回原本的動作，不空白', async () => {
    broken = (src) => src.includes('hero-vids');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const motion = await import('../../src/ui/companion-motion');
    await motion.preloadCompanionMotion(kind);
    expect(motion.companionHeroVidsActions(kind)).toEqual([]);
    expect(motion.companionMotionReady(kind)).toBe(true);
    motion.createCompanionMotionActor(kind, { action: 'hurt' });
    expect(lastTexture()).toContain(`assets/motion/${kind}/hit_recoil.webp`);
    motion.createCompanionMotionActor(kind, { action: 'run' });
    expect(lastTexture()).toContain(`assets/motion/${kind}/run.webp`);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('新圖集載不到、兩處同時預載：後到的那個不丟錯，一起退回原本的動作', async () => {
    broken = (src) => src.includes('hero-vids');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const motion = await import('../../src/ui/companion-motion');
    await expect(Promise.all([motion.preloadCompanionMotion(kind), motion.preloadCompanionMotion(kind)])).resolves.toBeDefined();
    expect(motion.companionHeroVidsActions(kind)).toEqual([]);
    expect(motion.companionMotionReady(kind)).toBe(true);
    motion.createCompanionMotionActor(kind, { action: 'hurt' });
    expect(lastTexture()).toContain(`assets/motion/${kind}/hit_recoil.webp`);
    warn.mockRestore();
  });
});

describe('連線版兩個座位', () => {
  it('只載本局兩位的新動作，第三位一張都不抓', async () => {
    const motion = await import('../../src/ui/companion-motion');
    await Promise.all([motion.preloadCompanionMotion('feifei'), motion.preloadCompanionMotion('fengfeng')]);
    expect(vidsHeroes()).toEqual(['feifei', 'fengfeng']);
    expect(motion.companionHeroVidsActions('dangdang')).toEqual([]);
  });

  it('網址帶 vids=0 同伴也完全不抓新動作', async () => {
    vi.stubGlobal('location', { search: '?vids=0' });
    const motion = await import('../../src/ui/companion-motion');
    await motion.preloadCompanionMotion('dangdang');
    expect(motion.companionHeroVidsActions('dangdang')).toEqual([]);
    expect(loaded.some((src) => src.includes('hero-vids'))).toBe(false);
  });
});

describe('菲菲彈針換了圖，飛針的出手點跟著新圖的手', () => {
  it('新動作用新量的出手點，退回舊動作就回到舊的出手點', async () => {
    const shuriken = (feifeiVids as unknown as VidsFile).variants.desktop.actions.shuriken as Motion & { releaseOrigins?: { x: number; y: number }[] };
    expect(shuriken.releaseOrigins?.length).toBe(1);
    const motion = await import('../../src/ui/companion-motion');
    const patterns = await import('../../src/ui/feifei-needle-patterns');
    const before = patterns.feifeiNeedleOrigin('shuriken', 0);
    await motion.preloadCompanionMotion('feifei');
    expect(patterns.feifeiNeedleOrigin('shuriken', 0)).toEqual(shuriken.releaseOrigins![0]);
    expect(patterns.feifeiNeedleOrigin('needle_combo', 0)).toEqual({ x: 132, y: -116 });   // 沒換圖的針術照舊

    vi.resetModules();
    broken = (src) => src.includes('hero-vids');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fallback = await import('../../src/ui/companion-motion');
    const oldPatterns = await import('../../src/ui/feifei-needle-patterns');
    await fallback.preloadCompanionMotion('feifei');
    expect(oldPatterns.feifeiNeedleOrigin('shuriken', 0)).toEqual(before);
    warn.mockRestore();
  });
});
