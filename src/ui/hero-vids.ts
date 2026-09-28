import type { FrameMotion } from './frame-motion';
import { speedUpMotions } from './motion-speed';

/**
 * 主角的 Google Vids／Flow Omni 逐格動作（2026-09-28 球球試做、09-29 擴到四位，規劃見 qiuqiu-side/docs/2026-09-28_爪破主角Vids動作規劃.md）。
 *
 * - 格子資料是 `hero-vids/<主角>.json` 一個小檔（`tools/pack_hero_vids.py` 產生），**選到這位主角、要預載動作時才動態載入**，
 *   不進開場的主程式；圖集（public 底下 motion 的 hero-vids 資料夾）也一樣只在預載這位主角時才下載。
 * - 電腦版每秒 24 格、手機版（觸控螢幕）每秒 12 格、圖集也小一號（比照魔物那套的使用者裁定）。
 * - 只換有新片的動作；其他動作、十種待機狀態照舊用原本的圖集。新圖沒到或壞掉就整組退回原本的圖集（見 qiuqiu-motion.ts）。
 * - 時間在 json 裡是原速，這裡照舊經 `speedUpMotions` 加快 1.5 倍；json 的 `unscaled`（挨打）不加速，
 *   比照原本那張挨打立繪停 0.65 秒（hit-recoil-motion.ts）。
 */
export type HeroVidsHero = 'qiuqiu' | 'feifei' | 'dangdang' | 'fengfeng';
export type HeroVidsVariant = 'desktop' | 'mobile';

type TimedMotion = FrameMotion & Readonly<{ impactTimes?: readonly number[]; releaseTimes?: readonly number[] }>;

type HeroVidsFile = Readonly<{
  hero: string;
  unscaled: readonly string[];
  variants: Readonly<Record<HeroVidsVariant, Readonly<{ fps: number; actions: Readonly<Record<string, TimedMotion>> }>>>;
}>;

/** 每位主角一個動態載入函式（打包時各自拆成獨立小檔，要用才抓） */
const LOADERS: Readonly<Record<HeroVidsHero, () => Promise<unknown>>> = {
  qiuqiu: () => import('./hero-vids/qiuqiu.json'),
  feifei: () => import('./hero-vids/feifei.json'),
  dangdang: () => import('./hero-vids/dangdang.json'),
  fengfeng: () => import('./hero-vids/fengfeng.json'),
};

/**
 * 要不要用新動作：網址帶 `vids=0` 就不用（錄新舊對照、出事時的後門）。
 * 沒有瀏覽器網址（單元測試的假環境）也不用：舊測試驗的是原本那套圖集，新動作另有自己的測試。
 */
export function heroVidsEnabled(search = typeof location === 'undefined' ? null : location.search): boolean {
  if (search === null) return false;
  return new URLSearchParams(search).get('vids') !== '0';
}

/** 電腦版還是手機版：觸控為主的螢幕（跟 decoded-atlas.ts 同一個判斷）用手機版；網址 `vids=m`／`vids=d` 可強制 */
export function heroVidsVariant(search = typeof location === 'undefined' ? '' : location.search): HeroVidsVariant {
  const forced = new URLSearchParams(search).get('vids');
  if (forced === 'm') return 'mobile';
  if (forced === 'd') return 'desktop';
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse ? 'mobile' : 'desktop';
}

/** json 內容 → 播放用的動作表（已換成加速後的時間） */
export function heroVidsMotionsFrom(file: unknown, variant: HeroVidsVariant): Record<string, TimedMotion> {
  const data = ((file as { default?: unknown }).default ?? file) as HeroVidsFile;
  const actions = data.variants[variant].actions;
  const unscaled = new Set(data.unscaled);
  const scaled = speedUpMotions(Object.fromEntries(Object.entries(actions).filter(([action]) => !unscaled.has(action))));
  return { ...scaled, ...Object.fromEntries(Object.entries(actions).filter(([action]) => unscaled.has(action))) };
}

/** 載入這位主角的新動作；關掉或載不到就回 null（照舊用原本的圖集） */
export async function loadHeroVids(hero: HeroVidsHero, search?: string): Promise<Record<string, TimedMotion> | null> {
  if (!heroVidsEnabled(search)) return null;
  try {
    return heroVidsMotionsFrom(await LOADERS[hero](), heroVidsVariant(search));
  } catch (error: unknown) {
    console.warn('主角新動作資料載入失敗，照舊用原本的動作', error);
    return null;
  }
}
