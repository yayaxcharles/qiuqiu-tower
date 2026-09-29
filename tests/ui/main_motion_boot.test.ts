import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SRC from '../../src/main.ts?raw';
import PRELOAD_SRC from '../../src/ui/preload.ts?raw';

const mocks = vi.hoisted(() => ({
  show: vi.fn(),
  loadManifest: vi.fn(),
  localHero: vi.fn(),
  preloadArt: vi.fn(),
  preloadFirstFights: vi.fn(),
  whenTitleArtReady: vi.fn(),
  preloadQiuqiuMotion: vi.fn(),
  preloadCompanionMotion: vi.fn(),
  startMotionPreview: vi.fn(),
  initLang: vi.fn(),
}));

vi.mock('../../src/i18n', () => ({
  initLang: mocks.initLang, t: (zh: string) => zh, term: (zh: string) => zh, N_: (zh: string) => zh,
}));
vi.mock('../../src/ui/app', () => ({ App: class { show = mocks.show; } }));
vi.mock('../../src/ui/lazy-screen', () => ({ registerLazyScreen: vi.fn() }));
vi.mock('../../src/ui/assets', () => ({
  loadManifest: mocks.loadManifest, localHero: mocks.localHero, preloadArt: mocks.preloadArt,
}));
vi.mock('../../src/ui/preload', () => ({ preloadFirstFights: mocks.preloadFirstFights }));
// 封面圖到齊才開始背景預載（2026-09-29）：替身直接回「到齊了」
vi.mock('../../src/ui/titleart', () => ({ whenTitleArtReady: mocks.whenTitleArtReady }));
vi.mock('../../src/ui/audio', () => ({ unlockOnFirstGesture: vi.fn() }));
// `deferBgm`：慢網路時背景音樂等開場那批圖到齊才開始（2026-09-23 內容擴充第〇批）。假模組少了它，開頁那段非同步會丟未處理的錯，推送閘門判紅
vi.mock('../../src/ui/bgm', () => ({ unlockBgmOnFirstGesture: vi.fn(), deferBgm: vi.fn() }));
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
  mocks.initLang.mockResolvedValue(undefined);
  mocks.localHero.mockReturnValue('ninja');
  mocks.preloadArt.mockResolvedValue(undefined);
  mocks.preloadFirstFights.mockResolvedValue(undefined);
  mocks.whenTitleArtReady.mockResolvedValue(undefined);
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
    // 開場那一批（2026-09-29 分批）：介面與第一關前五層的弱魔物；第一關其餘的魔物選好角色才抓（`adoptRun`）
    await vi.waitFor(() => expect(mocks.preloadFirstFights).toHaveBeenCalledTimes(1));
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
    expect(mocks.preloadFirstFights).not.toHaveBeenCalled();
  });

  /*
   * 封面圖到齊才開始背景預載（2026-09-29 效能：封面早一點出來）。慢網路下原本封面四隻貓要跟開場那一批搶頻寬，
   * 封面出現後 2 秒才到齊。改回「封面一出來就開抓」，這一條就紅。
   */
  it('封面那幾張還沒到齊：封面照樣出來，但背景預載還不開始；到齊了才開始', async () => {
    let ready!: () => void;
    mocks.whenTitleArtReady.mockReturnValue(new Promise<void>((r) => { ready = r; }));
    await import('../../src/main');
    await vi.waitFor(() => expect(mocks.show).toHaveBeenCalledExactlyOnceWith('title'));
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.preloadArt).not.toHaveBeenCalled();
    ready();
    await vi.waitFor(() => expect(mocks.preloadArt).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(mocks.preloadFirstFights).toHaveBeenCalledTimes(1));
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
