import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/ui/app';

const probe = vi.hoisted(() => ({
  preloadCompanion: vi.fn(async (_hero: string) => {}),
  setLocalHero: vi.fn(), setSfxHero: vi.fn(), setStore: vi.fn(),
}));
vi.mock('../../src/ui/assets', () => ({ setLocalHero: probe.setLocalHero, heroSpriteUrls: () => [] }));
vi.mock('../../src/ui/audio', () => ({ setSfxHero: probe.setSfxHero }));
vi.mock('../../src/ui/bgm', () => ({ setBgm: vi.fn() }));
vi.mock('../../src/ui/preload', () => ({ warmEncounter: async () => {} }));
vi.mock('../../src/ui/acttransition', () => ({ actWalkTransition: () => () => {} }));
vi.mock('../../src/engine/save', () => ({ setStore: probe.setStore }));
vi.mock('../../src/ui/qiuqiu-motion-effects', () => ({ playFeifeiClone: vi.fn(), playQiuqiuEchoes: vi.fn() }));
vi.mock('../../src/ui/qiuqiu-motion', () => ({
  preloadQiuqiuMotion: async () => {},
  createQiuqiuActor: () => ({ element: { style: {} }, play: vi.fn(), dispose: vi.fn() }),
  qiuqiuMotionDuration: () => 500,
}));
vi.mock('../../src/ui/companion-motion', () => ({
  preloadCompanionMotion: probe.preloadCompanion,
  createCompanionMotionActor: () => ({ element: { style: {} }, play: vi.fn(), dispose: vi.fn() }),
  companionMotionDuration: () => 500,
}));
vi.mock('../../src/ui/enemy-motion', () => ({ preloadEnemyMotion: async () => {} }));
vi.mock('../../src/ui/dom', () => ({
  el: (tag: string, attrs: Record<string, unknown> = {}, ...children: unknown[]) => new TestNode(tag, attrs, children),
}));

import { startMotionPreview } from '../../src/ui/motion-preview';

class TestNode {
  static nodes: TestNode[] = [];
  value = '';
  disabled = false;
  textContent = '';
  style = {};
  onchange?: () => void | Promise<void>;
  onclick?: () => void;
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  remove = vi.fn();
  querySelector = () => null;
  constructor(readonly tag: string, readonly attrs: Record<string, unknown> = {}, public children: unknown[] = []) {
    this.onclick = attrs['onclick'] as (() => void) | undefined;
    TestNode.nodes.push(this);
  }
  append(...children: unknown[]) { this.children.push(...children); }
  replaceChildren(...children: unknown[]) { this.children = children; }
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function preview() {
  const stage = new TestNode('div');
  const shown: string[] = [];
  const app = {
    stage, overlay: new TestNode('div'),
    run: null as App['run'], cs: null as App['cs'], sandbox: false,
    disposers: [] as (() => void)[], leaveCoop: vi.fn(),
    // 保留 App.show 的同步清理順序，正常重新試打也會走同一條清理路徑。
    show(name: string) {
      for (const dispose of this.disposers.splice(0)) dispose();
      shown.push(name);
    },
    exitSandbox() {
      this.sandbox = false;
      this.run = null;
      this.cs = null;
      this.show('debug');
    },
  };
  await startMotionPreview(app as unknown as App);
  const hero = TestNode.nodes.find((node) => node.attrs['aria-label'] === '展示角色')!;
  const group = TestNode.nodes.find((node) => node.attrs['aria-label'] === '試打牌組')!;
  return { app, shown, hero, group };
}

describe('動作試玩切換角色的生命週期', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    probe.preloadCompanion.mockReset().mockResolvedValue();
    TestNode.nodes = [];
    vi.stubGlobal('window', { localStorage: {}, setTimeout, clearTimeout });
    vi.stubGlobal('location', { pathname: '/qiuqiu-tower-coop/', reload: vi.fn() });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('載入角色期間離開，延後成功不能重建戰鬥或改回角色與儲存器', async () => {
    const { app, shown, hero } = await preview();
    const load = deferred();
    probe.preloadCompanion.mockReturnValueOnce(load.promise);
    hero.value = 'feifei';
    const change = hero.onchange!();
    app.exitSandbox();
    probe.setLocalHero.mockClear();
    probe.setSfxHero.mockClear();
    probe.setStore.mockClear();
    load.resolve();
    await change;
    expect(shown).toEqual(['combat', 'debug']);
    expect(app.sandbox).toBe(false);
    expect(app.run).toBeNull();
    expect(app.cs).toBeNull();
    expect(probe.setLocalHero).not.toHaveBeenCalled();
    expect(probe.setSfxHero).not.toHaveBeenCalled();
    expect(probe.setStore).not.toHaveBeenCalled();
  });

  it('離開後才回報載入失敗，不顯示過期錯誤或改寫舊選單', async () => {
    const { app, shown, hero } = await preview();
    const load = deferred();
    probe.preloadCompanion.mockReturnValueOnce(load.promise);
    hero.value = 'feifei';
    const change = hero.onchange!();
    app.exitSandbox();
    load.reject(new Error('late failure'));
    await change;
    expect(console.error).not.toHaveBeenCalled();
    expect(shown).toEqual(['combat', 'debug']);
    expect(hero.value).toBe('feifei');
  });

  it('正常角色切換經過同步清理後仍可再次切換、切牌組與重新試打', async () => {
    const { app, shown, hero, group } = await preview();
    for (const name of ['feifei', 'fengfeng']) {
      hero.value = name;
      await hero.onchange!();
      expect(app.run!.players[0]!.hero).toBe(name);
      expect(app.cs!.player.hero).toBe(name);
      expect(hero.disabled).toBe(false);
      expect(app.sandbox).toBe(true);
    }
    group.value = 'defense';
    await group.onchange!();
    expect(app.cs!.player.hand[0]!.cardId).toBe('fengfeng_zhuanshen');
    const oldRun = app.run;
    TestNode.nodes.find((node) => node.tag === 'button' && node.children.includes('重新試打'))!.onclick!();
    expect(app.run).not.toBe(oldRun);
    expect(app.cs!.player.hero).toBe('fengfeng');
    expect(shown).toEqual(['combat', 'combat', 'combat', 'combat', 'combat']);
    expect(app.disposers).toHaveLength(1);
    const store = probe.setStore.mock.calls.at(-1)![0] as { getItem: (key: string) => null };
    expect(store).not.toBe(window.localStorage);
    expect(store.getItem('qiuqiu.save')).toBeNull();
  });

  it('仍在試玩時載入失敗會回復原角色並允許重試', async () => {
    const { app, shown, hero } = await preview();
    const original = app.run;
    probe.preloadCompanion.mockRejectedValueOnce(new Error('failed'));
    hero.value = 'feifei';
    await hero.onchange!();
    expect(console.error).toHaveBeenCalledOnce();
    expect(hero.value).toBe('ninja');
    expect(hero.disabled).toBe(false);
    expect(app.run).toBe(original);
    hero.value = 'feifei';
    await hero.onchange!();
    expect(app.cs!.player.hero).toBe('feifei');
    expect(shown).toEqual(['combat', 'combat']);
  });
});
