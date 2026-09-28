import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let sources: string[];
let rejectMotion: boolean;

beforeEach(() => {
  vi.resetModules();
  sources = [];
  rejectMotion = false;
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('Image', class {
    srcValue = '';
    set src(value: string) { this.srcValue = value; sources.push(value); }
    async decode(): Promise<void> {}
    // 逐格動作只等 load／error（不呼叫 decode）；要測失敗就讓動作圖集觸發 error
    addEventListener(type: string, listener: () => void): void {
      const fail = rejectMotion && this.srcValue.includes('/motion/');
      if (type === (fail ? 'error' : 'load')) queueMicrotask(listener);
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function preload(heroes: readonly (string | undefined)[]): Promise<void> {
  const { _setManifestForTest } = await import('../../src/ui/assets');
  _setManifestForTest({
    cards: {}, monsters: {}, icons: {}, bg: {}, review: [],
    sprites: {
      'hero/feifei_idle': 'assets/sprites/hero/feifei_idle.webp',
      'hero/dangdang_idle': 'assets/sprites/hero/dangdang_idle.webp',
      'hero/fengfeng_idle': 'assets/sprites/hero/fengfeng_idle.webp',
    },
  });
  const { preloadHeroArt } = await import('../../src/ui/preload');
  await preloadHeroArt(heroes);
}

/** 動作圖集屬於哪一位：Vids 新動作（2026-09-28 球球試做）放在共用的 hero-vids 資料夾、檔名以主角開頭 */
function motionHeroes(): string[] {
  return [...new Set(sources.flatMap((url) => {
    const vids = url.match(/\/motion\/hero-vids\/([a-z]+)-/)?.[1];
    if (vids) return [vids];
    return url.match(/\/motion\/([^/]+)\//)?.[1] ?? [];
  }))].sort();
}

describe('確定本局角色後才預載逐格動作', () => {
  it.each(['ninja', 'feifei', 'dangdang', 'fengfeng'])('單人選 %s 只要求該角色的實際圖片', async (hero) => {
    await preload([hero]);
    expect(motionHeroes()).toEqual([hero === 'ninja' ? 'qiuqiu' : hero]);
    const staticSources = sources.filter((url) => !url.includes('/motion/'));
    // 逐格受擊 2026-09-22 起用該角色動作資料夾裡的新畫風挨打圖，不再到 sprites 目錄借舊立繪
    // 挨打換成影片版（hero-vids.ts）：球球 2026-09-28、其他三位 2026-09-29；舊的挨打立繪不再下載
    const code = hero === 'ninja' ? 'qiuqiu' : hero;
    expect(sources).toContain(`/assets/motion/hero-vids/${code}-hurt-d.webp`);
    expect(sources).not.toContain(`/assets/motion/${code}/hit_recoil.webp`);
    expect(staticSources.sort()).toEqual(hero === 'ninja' ? [] : [`/assets/sprites/hero/${hero}_idle.webp`]);
  });

  it('雙人只暖本局兩位，重複角色不重複要求圖片', async () => {
    await preload(['feifei', 'fengfeng', 'feifei']);
    expect(motionHeroes()).toEqual(['feifei', 'fengfeng']);
    expect(sources.filter((url) => !url.includes('/motion/')).sort()).toEqual([
      '/assets/sprites/hero/feifei_idle.webp', '/assets/sprites/hero/fengfeng_idle.webp',
    ]);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('舊存檔未寫角色時仍預載球球', async () => {
    await preload([undefined]);
    expect(motionHeroes()).toEqual(['qiuqiu']);
  });

  it('關閉動作仍補齊角色靜態圖，不要求動作圖片', async () => {
    vi.stubGlobal('location', { search: '?motion=0' });
    await preload(['fengfeng']);
    expect(sources).toEqual(['/assets/sprites/hero/fengfeng_idle.webp']);
  });

  it('動作圖片失敗不阻斷角色預載，靜態圖仍完成', async () => {
    rejectMotion = true;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(preload(['fengfeng'])).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('逐格動作預載失敗，改用普通立繪', expect.any(Error));
    const { warmed } = await import('../../src/ui/assets');
    expect(warmed.has('/assets/sprites/hero/fengfeng_idle.webp')).toBe(true);
  });
});
