import { afterEach, describe, expect, it, vi } from 'vitest';
import APP_RAW from '../../src/ui/app.ts?raw';
import NETLOAD_RAW from '../../src/ui/netload-run.ts?raw';
import { _setManifestForTest, cardFaceUrls, heroCardUrls, isDeferredBossArt, preloadArt, runStartArtUrls, setLocalHero, type Manifest } from '../../src/ui/assets';
import { firstFightUrls, preloadAct, preloadHeroArt } from '../../src/ui/preload';
import { cardById, cards, starterDeckFor } from '../../src/content/cards';
import { encounters, enemyById } from '../../src/content/enemies';
import { _heavyLaneStateForTest, _resetHeavyLaneForTest } from '../../src/ui/heavy-lane';
import { _setNetSpeedForTest } from '../../src/ui/netspeed';

/*
 * 開場分批（2026-09-29 效能）。
 * 慢網路（1.6 Mbps）量到：停在封面一分鐘背景抓了 453 個檔、9.4 MB，很多要選好角色、甚至打到第三關才用得到。
 * 改成：停在封面只抓「不管選誰接下來都會看到的」；角色的立繪與牌面、這一關其餘的魔物，
 * 選好角色進入一局才抓；師父全套進第三關才抓；英日版封面換語言才抓（封面先到那一半見 `title_first_0929.test.ts`）。
 */

const EMPTY: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };
const A = (p: string): string => `assets/${p}.webp`;
const U = (p: string): string => `/assets/${p}.webp`;

/** 假的 Image：記下設過的網址與優先權；`decode` 預設立刻好 */
function stubImages(decode: () => Promise<void> = () => Promise.resolve()) {
  const sources: string[] = [];
  const priorities: (string | undefined)[] = [];
  vi.stubGlobal('Image', class {
    fetchPriority: string | undefined;
    private v = '';
    set src(v: string) { this.v = v; sources.push(v); priorities.push(this.fetchPriority); }
    get src(): string { return this.v; }
    decode(): Promise<void> { return decode(); }
  });
  return { sources, priorities };
}

afterEach(() => {
  _setManifestForTest(EMPTY);
  vi.unstubAllGlobals();
});

describe('停在封面時只抓不管選誰都會看到的', () => {
  it('選角畫面四隻的立繪排最前面；球球的戰鬥姿勢、封面（含英日版）、牌面、師父全套都不抓', async () => {
    const { sources } = stubImages();
    _setManifestForTest({
      ...EMPTY,
      sprites: {
        'hero/ninja': A('hero/ninja'), 'hero/ninja_claw': A('hero/ninja_claw'), 'hero/ninja_portrait': A('hero/ninja_portrait'),
        'hero/feifei_idle': A('hero/feifei_idle'), 'hero/dangdang_idle': A('hero/dangdang_idle'), 'hero/fengfeng_idle': A('hero/fengfeng_idle'),
        'hero/cover': A('hero/cover'), 'hero/cover_en': A('hero/cover_en'), 'hero/cover_ja': A('hero/cover_ja'), 'hero/feifei_cover': A('hero/feifei_cover'),
        'boss/idle1': A('boss/idle1'), 'boss/defeat': A('boss/defeat'), 'boss/palm2': A('boss/palm2'), 'shop/keeper': A('shop/keeper'),
      },
      cards: { 'card/sanjo': A('card/sanjo'), 'card/tanding': A('card/tanding') },
      icons: { 'icon/onigiri_full': A('icon/onigiri_full') },
      bg: { 'bg/screen_title': A('bg/screen_title') },
    });
    await preloadArt();
    expect(sources.slice(0, 4), '選角那四張先抓').toEqual([U('hero/ninja'), U('hero/feifei_idle'), U('hero/dangdang_idle'), U('hero/fengfeng_idle')]);
    expect(new Set(sources)).toEqual(new Set([
      U('hero/ninja'), U('hero/feifei_idle'), U('hero/dangdang_idle'), U('hero/fengfeng_idle'),
      U('boss/idle1'), U('boss/defeat'), U('shop/keeper'), U('icon/onigiri_full'), U('bg/screen_title'),
    ]));
    // 改回舊寫法（球球的鍵沒前綴就算共用、牌面整組開場抓）這幾張會回來
    for (const no of ['hero/ninja_claw', 'hero/ninja_portrait', 'hero/cover_en', 'hero/cover_ja', 'card/sanjo', 'boss/palm2']) expect(sources, no).not.toContain(U(no));
  });

  it('師父：對白頭像那兩張留在開場，其餘進第三關才抓（進第一關不抓）', async () => {
    expect(isDeferredBossArt('boss/idle1')).toBe(false);
    expect(isDeferredBossArt('boss/defeat')).toBe(false);
    expect(isDeferredBossArt('boss/palm2')).toBe(true);
    expect(isDeferredBossArt('shop/keeper')).toBe(false);
    const { sources } = stubImages();
    _setManifestForTest({ ...EMPTY, sprites: { 'boss/idle1': A('boss/idle1'), 'boss/palm2': A('boss/palm2') } });
    await preloadAct(1, 'ninja');
    expect(sources).not.toContain(U('boss/palm2'));
    await preloadAct(3, 'ninja');
    expect(sources).toContain(U('boss/palm2'));
    expect(sources, '對白頭像開場就有，進關不重抓').not.toContain(U('boss/idle1'));
  });

  it('第一關前五層的弱魔物（第一場一定從這一池抽）：只抓弱池，中池以上等進入一局', () => {
    const monsters: Manifest['monsters'] = {};
    for (const e of Object.values(enemyById)) monsters[e.art] = { idle: A(`m/${e.art}`) };
    _setManifestForTest({ ...EMPTY, monsters });
    const urls = new Set(firstFightUrls());
    const weak = encounters.filter((e) => !e.hidden && e.pool === '弱' && (!e.acts || e.acts.includes(1)));
    expect(weak.length).toBeGreaterThan(3);
    for (const e of weak) for (const id of e.enemies) expect(urls.has(U(`m/${enemyById[id]!.art}`)), id).toBe(true);
    const weakArts = new Set(weak.flatMap((e) => e.enemies.map((id) => enemyById[id]!.art)));
    const mid = encounters.find((e) => !e.hidden && e.pool === '中' && (!e.acts || e.acts.includes(1)) && e.enemies.every((id) => !weakArts.has(enemyById[id]!.art)));
    expect(mid, '前提：第一關有一場中池的').toBeDefined();
    for (const id of mid!.enemies) expect(urls.has(U(`m/${enemyById[id]!.art}`)), id).toBe(false);
  });
});

describe('選好角色進入一局才抓那一位的圖', () => {
  const starter = [...new Set(starterDeckFor('ninja'))];
  const shared = cards.find((c) => !c.hero && !c.coop && c.pool !== '起手' && !c.combatOnly)!;
  const coop = cards.find((c) => c.coop)!;
  const fake = (): Manifest => ({
    ...EMPTY,
    sprites: {
      'hero/ninja': A('hero/ninja'), 'hero/ninja_claw': A('hero/ninja_claw'), 'hero/ninja_portrait': A('hero/ninja_portrait'),
      'hero/ninja_nap': A('hero/ninja_nap'), 'hero/cover': A('hero/cover'), 'hero/feifei_idle': A('hero/feifei_idle'),
    },
    cards: {
      ...Object.fromEntries(starter.map((id) => [cardById[id]!.art, A(cardById[id]!.art)])),
      [shared.art]: A(shared.art), [shared.art.replace('card/', 'card/feifei_')]: A(shared.art.replace('card/', 'card/feifei_')),
      [coop.art]: A(coop.art),
    },
  });

  it('球球：對白頭像先、起手牌排在戰鬥姿勢與其他牌前面；封面、連線牌、菲菲的版本不抓', () => {
    _setManifestForTest(fake());
    const urls = runStartArtUrls(['ninja']);
    expect(urls[0]).toBe(U('hero/ninja_portrait'));
    for (const k of ['hero/ninja', 'hero/ninja_claw', 'hero/ninja_nap', shared.art]) expect(urls, k).toContain(U(k));
    for (const k of ['hero/cover', 'hero/feifei_idle', coop.art, shared.art.replace('card/', 'card/feifei_')]) expect(urls, k).not.toContain(U(k));
    const lastStarter = Math.max(...starter.map((id) => urls.indexOf(U(cardById[id]!.art))));
    expect(lastStarter).toBeGreaterThanOrEqual(0);
    expect(lastStarter, '起手牌先').toBeLessThan(urls.indexOf(U(shared.art)));
    // 手牌一開打就整排攤開，排在三十張戰鬥姿勢後面的話慢網路下第一場開打時還是空的（實測 2026-09-29）
    expect(lastStarter, '起手牌排在戰鬥姿勢前面').toBeLessThan(urls.indexOf(U('hero/ninja_claw')));
  });

  it('菲菲：有她的版本就抓她的（畫面畫哪張就抓哪張），球球的立繪一張都不抓', () => {
    _setManifestForTest(fake());
    const urls = runStartArtUrls(['feifei']);
    expect(heroCardUrls(['feifei'])).toContain(U(shared.art.replace('card/', 'card/feifei_')));
    expect(urls).toContain(U(shared.art.replace('card/', 'card/feifei_')));
    expect(urls).not.toContain(U(shared.art));
    expect(urls.some((u) => u.includes('/hero/ninja'))).toBe(false);
  });

  it('進入一局（給了關數）：立繪牌面之外，這一關其餘的魔物也一起抓；沒給關數照舊', async () => {
    const monsters: Manifest['monsters'] = {};
    for (const e of Object.values(enemyById)) monsters[e.art] = { idle: A(`m/${e.art}`) };
    const { sources } = stubImages();
    vi.stubGlobal('location', { search: '?motion=0' });
    _setManifestForTest({ ...fake(), monsters });
    await preloadHeroArt(['ninja']);
    expect(sources).toContain(U('hero/ninja_claw'));
    expect(sources).toContain(U(cardById[starter[0]!]!.art));
    expect(sources.some((u) => u.includes('/m/')), '沒給關數不抓魔物').toBe(false);
    sources.length = 0;
    await preloadHeroArt(['ninja'], 1);
    expect(sources.some((u) => u.includes('/m/')), '給了關數：這一關的魔物').toBe(true);
  });

  /*
   * 慢網路：原本大圖集（逐格動作）要等「開場那一批（含第一關魔物）」抓完才放行；開場那批變小之後，
   * 改成進入一局時再掛一次、等這一局這一批抓完。戰鬥畫面自己叫的動作預載也走同一條（`loadHeavy`），一起被擋住。
   * 拿掉這一段，這一條就紅。快網路不擋（主控裁定：一般情況照原本）。
   */
  it('慢網路：進入一局這一批抓完之前大圖集先別開抓；快網路不擋', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    stubImages(() => gate);
    vi.stubGlobal('location', { search: '?motion=0' });
    _setManifestForTest({ ...EMPTY, sprites: { 'hero/feifei_attack': A('hero/feifei_attack_heavy') } });
    _resetHeavyLaneForTest();
    try {
      _setNetSpeedForTest('slow');
      const all = preloadHeroArt(['feifei'], 1);
      await vi.waitFor(() => expect(_heavyLaneStateForTest().holds).toBe(1));
      open();
      await all;
      await vi.waitFor(() => expect(_heavyLaneStateForTest().holds).toBe(0));
      _setNetSpeedForTest('fast');
      await preloadHeroArt(['feifei'], 1);
      await new Promise((r) => setTimeout(r, 10));
      expect(_heavyLaneStateForTest().holds).toBe(0);
    } finally {
      _setNetSpeedForTest('fast');
      _resetHeavyLaneForTest();
    }
  });

  /*
   * 開打前連這一手的牌面一起暖（2026-09-29 實測：牌面改成選好角色才抓之後，封面停 20 秒再開局的那一組，
   * 第一場開打時七張手牌全空、約 2 秒後才冒出來；改之前那一組手牌是齊的）。排在魔物後面、姿勢前面，共用 1.5 秒上限。
   */
  it('開打前的遭遇預熱帶上這一手的牌面（本機這一位的版本），排在角色姿勢前面', () => {
    _setManifestForTest(fake());
    setLocalHero('feifei');
    try {
      expect(cardFaceUrls([shared.id, shared.id, 'no_such_card'])).toEqual([U(shared.art.replace('card/', 'card/feifei_'))]);
    } finally { setLocalHero('ninja'); }
    const app = APP_RAW.replace(/\r\n/g, '\n');
    // 2026-09-30 慢網路修正：主角姿勢不再一起等（改背景暖），上限 1.5 → 3 秒（ENCOUNTER_WAIT_MS）
    expect(app).toContain('warmEncounter(encounterId, ENCOUNTER_WAIT_MS, cardFaceUrls((cs.players[this.seat]?.hand ?? []).map((c) => c.cardId)), run.players[0]?.hero, pr),');
    expect(app).toContain('void decodeAll(heroSpriteUrls(run.players.map((p) => p.hero)), 3, false);');
  });

  it('adoptRun 把關數交給 preloadHeroArt；續玩不再另外叫第二次 preloadAct', () => {
    const app = APP_RAW.replace(/\r\n/g, '\n');
    // 2026-09-30：adoptRun 改叫 netload.ts 的 warmRun → netload-run.ts 的 startRun（先插隊要最低完成度，再照原本叫 preloadHeroArt，首載那支用傳的）
    expect(app).toContain('    warmRun(run, seat);');
    const netload = NETLOAD_RAW.replace(/\r\n/g, '\n');
    expect(netload).toContain('void d.preloadHeroArt(run.players.map((p) => p.hero), run.act);');
    expect(app).not.toMatch(/void preloadAct\(/);
  });
});

describe('獎勵畫面三選一的牌面先抓好再開（2026-09-29 審查 中）', () => {
  it('afterCombat 先 decodeAll 這三張（插隊、最多 2 秒）才 show reward', () => {
    const app = APP_RAW.replace(/\r\n/g, '\n');
    const i = app.indexOf('const go = (): void => {', app.indexOf('afterCombat('));
    const body = app.slice(i, i + 700);
    expect(body).toContain("void decodeAll(cardFaceUrls(mine.map((c) => c.id)), 3, false, undefined, 'high').then(once, once);");
    expect(body).toContain('window.setTimeout(once, 2000);');
    expect(body).not.toContain("this.show('reward'");
  });
});
