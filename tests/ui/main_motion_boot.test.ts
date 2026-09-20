import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SRC from '../../src/main.ts?raw';
import PRELOAD_SRC from '../../src/ui/preload.ts?raw';

const mocks = vi.hoisted(() => ({
  show: vi.fn(),
  loadManifest: vi.fn(),
  localHero: vi.fn(),
  preloadArt: vi.fn(),
  preloadAct: vi.fn(),
  preloadQiuqiuMotion: vi.fn(),
  preloadCompanionMotion: vi.fn(),
  startMotionPreview: vi.fn(),
}));

vi.mock('../../src/ui/app', () => ({ App: class { show = mocks.show; } }));
vi.mock('../../src/ui/lazy-screen', () => ({ registerLazyScreen: vi.fn() }));
vi.mock('../../src/ui/assets', () => ({
  loadManifest: mocks.loadManifest, localHero: mocks.localHero, preloadArt: mocks.preloadArt,
}));
vi.mock('../../src/ui/preload', () => ({ preloadAct: mocks.preloadAct }));
vi.mock('../../src/ui/audio', () => ({ unlockOnFirstGesture: vi.fn() }));
vi.mock('../../src/ui/bgm', () => ({ unlockBgmOnFirstGesture: vi.fn() }));
vi.mock('../../src/ui/screenbg', () => ({ applyArtVars: vi.fn() }));
vi.mock('../../src/ui/qiuqiu-motion', () => ({ preloadQiuqiuMotion: mocks.preloadQiuqiuMotion }));
vi.mock('../../src/ui/companion-motion', () => ({ preloadCompanionMotion: mocks.preloadCompanionMotion }));
vi.mock('../../src/ui/motion-preview', () => ({ startMotionPreview: mocks.startMotionPreview }));
vi.mock('../../src/ui/screens/combat', () => ({}));
vi.mock('../../src/ui/screens/actclear', () => ({}));
vi.mock('../../src/ui/screens/chest', () => ({}));
vi.mock('../../src/ui/screens/bossdoor', () => ({}));
vi.mock('../../src/ui/screens/event', () => ({}));
vi.mock('../../src/ui/screens/map', () => ({}));
vi.mock('../../src/ui/screens/rest', () => ({}));
vi.mock('../../src/ui/screens/result', () => ({}));
vi.mock('../../src/ui/screens/reward', () => ({}));
vi.mock('../../src/ui/screens/shop', () => ({}));
vi.mock('../../src/ui/screens/title', () => ({}));
vi.mock('../../src/ui/screens/heroselect', () => ({}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.loadManifest.mockResolvedValue(undefined);
  mocks.localHero.mockReturnValue('ninja');
  mocks.preloadArt.mockResolvedValue(undefined);
  mocks.preloadAct.mockResolvedValue(undefined);
  mocks.startMotionPreview.mockResolvedValue(undefined);
  mocks.preloadQiuqiuMotion.mockReturnValue(new Promise<void>(() => {}));
  mocks.preloadCompanionMotion.mockReturnValue(new Promise<void>(() => {}));
  vi.stubGlobal('document', { getElementById: () => ({}) });
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { search: '' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('動作模式不阻塞標題啟動', () => {
  it.each(['ninja', 'feifei', 'dangdang', 'fengfeng'])('本機角色為 %s 時，標題仍不預載尚未選定的角色動作', async (hero) => {
    mocks.localHero.mockReturnValue(hero);
    await import('../../src/main');
    await vi.dynamicImportSettled();
    await vi.waitFor(() => expect(mocks.preloadAct).toHaveBeenCalledExactlyOnceWith(1));
    expect(mocks.show).toHaveBeenCalledExactlyOnceWith('title');
    expect(mocks.preloadQiuqiuMotion).not.toHaveBeenCalled();
    expect(mocks.preloadCompanionMotion).not.toHaveBeenCalled();
    expect(mocks.preloadArt).toHaveBeenCalledTimes(1);
  });

  it('一般美術尚未載完，標題已經可以操作', async () => {
    mocks.preloadArt.mockReturnValue(new Promise<void>(() => {}));
    await import('../../src/main');
    await vi.waitFor(() => expect(mocks.show).toHaveBeenCalledExactlyOnceWith('title'));
    expect(mocks.preloadArt).toHaveBeenCalledTimes(1);
    expect(mocks.preloadAct).not.toHaveBeenCalled();
  });

  it('關閉動作時正常顯示標題且不預載逐格動作', async () => {
    vi.stubGlobal('location', { search: '?motion=0' });
    await import('../../src/main');
    await vi.waitFor(() => expect(mocks.show).toHaveBeenCalledExactlyOnceWith('title'));
    expect(mocks.preloadQiuqiuMotion).not.toHaveBeenCalled();
    expect(mocks.preloadCompanionMotion).not.toHaveBeenCalled();
    expect(mocks.preloadArt).toHaveBeenCalledTimes(1);
  });

  it('動作預覽仍直接進入預覽，不顯示一般標題或執行一般預載', async () => {
    vi.stubGlobal('location', { search: '?motion-preview&motion=0' });
    await import('../../src/main');
    await vi.waitFor(() => expect(mocks.startMotionPreview).toHaveBeenCalledTimes(1));
    expect(mocks.show).not.toHaveBeenCalled();
    expect(mocks.preloadQiuqiuMotion).not.toHaveBeenCalled();
    expect(mocks.preloadCompanionMotion).not.toHaveBeenCalled();
    expect(mocks.preloadArt).not.toHaveBeenCalled();
  });

  it('角色動作模組保留動態匯入，避免放入入口靜態載入', () => {
    expect(PRELOAD_SRC).toContain("import('./qiuqiu-motion')");
    expect(PRELOAD_SRC).toContain("import('./companion-motion')");
    expect(SRC).not.toMatch(/import\s+[^;]+\s+from\s+['"]\.\/ui\/(?:qiuqiu|companion)-motion['"]/);
    expect(PRELOAD_SRC).not.toMatch(/import\s+[^;]+\s+from\s+['"]\.\/(?:qiuqiu|companion)-motion['"]/);
  });
});
