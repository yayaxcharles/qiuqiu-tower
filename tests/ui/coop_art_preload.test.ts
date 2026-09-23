/**
 * 連線牌面只抓這一組搭檔的（2026-09-23，批次 coopload）。
 *
 * 原本一進連線大廳就把清單裡**全部**連線牌圖抓下來（四位各自的版本＋全部搭檔的混搭版，
 * 混搭牌面補齊之後 278 張、8.6 MB），一局只用得到其中一組的二十幾張；而且解完不留參照，
 * 實測第一場戰鬥手牌上的連線牌畫出來那一刻還是空的、要重新下載。這裡守：
 *  1. 抓的就是這一組會畫到的：兩位拿得到的每一張連線牌、兩個席位各自看到的那張都在，別組的一張都不抓；
 *     同角色雙人抓那一位自己的版本；一個人玩不抓；
 *  2. 抓完留著、換了搭檔就換一組、同一組不重抓；
 *  3. 單人選角後的補載不抓連線牌（原本只擋了混搭的，菲菲、噹噹、封封自己的連線牌照抓）；
 *  4. 連線局開打前等這一組抓完（`app.ts` 的 `startFight`）。
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cards } from '../../src/content/cards';
import { pickable } from '../../src/engine/hero';
import { _setManifestForTest, artUrl, cardArtKey, coopArtUrlsFor, heroArtUrls, isCoopOnlyArt, type Manifest } from '../../src/ui/assets';
import { _coopArtHeldForTest, coopArtReady, preloadCoopArt } from '../../src/ui/preload';

const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
const HEROES = ['ninja', 'feifei', 'dangdang', 'fengfeng'] as const;
const PAIRS = HEROES.flatMap((a, i) => HEROES.slice(i).map((b) => [a, b] as const));
const ALL_COOP = Object.entries(MANIFEST.cards).filter(([k]) => isCoopOnlyArt(k)).map(([, v]) => `/${v}`);
beforeEach(() => { _setManifestForTest(MANIFEST); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('連線牌面只抓這一組搭檔的', () => {
  it.each(PAIRS)('%s＋%s：兩位拿得到的每一張連線牌、兩個席位看到的那張都在，別組的不抓', (a, b) => {
    const urls = new Set(coopArtUrlsFor([a, b]));
    for (const c of cards) {
      if (!c.coop) continue;
      for (const [me, mate] of [[a, b], [b, a]] as const) {
        if (!pickable(c, me, 2)) continue;
        const want = artUrl('cards', cardArtKey(c.art, me, mate));
        expect(urls.has(want), `${me}（同伴 ${mate}）的 ${c.name} → ${want}`).toBe(true);
      }
    }
    for (const u of urls) {
      if (a === b) expect(u, '同角色雙人沒有混搭圖').not.toMatch(/\/coop_/);
      else expect(u, '混搭局只抓這一組的混搭圖').toContain(`/coop_${[a, b].sort().join('_')}_`);
    }
    expect(urls.size).toBeGreaterThanOrEqual(24);
    expect(urls.size).toBeLessThanOrEqual(31);   // 修前一律 278 張
    expect(ALL_COOP.length).toBe(278);
  });

  it('一個人玩不抓；換了搭檔抓的是另一組', () => {
    expect(coopArtUrlsFor(['feifei'])).toEqual([]);
    expect(coopArtUrlsFor([])).toEqual([]);
    const a = coopArtUrlsFor(['dangdang', 'fengfeng']);
    const b = coopArtUrlsFor(['ninja', 'feifei']);
    expect(a.filter((u) => b.includes(u))).toEqual([]);
  });

  it('單人選角後的補載不抓連線牌（修前菲菲、噹噹、封封各抓 26、24、28 張自己的連線牌）', () => {
    const coop = new Set(ALL_COOP);
    for (const h of HEROES) expect(heroArtUrls([h]).filter((u) => coop.has(u)), h).toEqual([]);
  });
});

describe('連線牌面的預載', () => {
  it('抓完留著、同一組不重抓、換了搭檔就換一組', async () => {
    const sources: string[] = [];
    class FakeImage {
      set src(value: string) { sources.push(value); }
      async decode(): Promise<void> { /* src 紀錄就是可觀察結果 */ }
    }
    vi.stubGlobal('Image', FakeImage);
    const first = coopArtUrlsFor(['dangdang', 'fengfeng']);
    await preloadCoopArt(['dangdang', 'fengfeng']);
    expect([...sources].sort()).toEqual([...first].sort());
    expect(_coopArtHeldForTest().sort(), '整局留著（不然瀏覽器隨時可以丟掉、畫的時候又要重抓）').toEqual([...first].sort());
    await coopArtReady();

    sources.length = 0;
    await preloadCoopArt(['fengfeng', 'dangdang']);   // 另一個席位、同一組
    expect(sources, '同一組不重抓').toEqual([]);

    const second = coopArtUrlsFor(['ninja', 'ninja']);
    await preloadCoopArt(['ninja', 'ninja']);   // 回標題、兩人換角色再開一局
    expect([...sources].sort()).toEqual([...second].sort());
    expect(_coopArtHeldForTest().sort(), '上一組放掉、留新的那組').toEqual([...second].sort());
  });

  it('連線局開打前等這一組連線牌面抓完（app.ts 的 startFight）', () => {
    const src = readFileSync('src/ui/app.ts', 'utf8').replace(/\r\n/g, '\n');
    const body = src.slice(src.indexOf('  startFight(encounterId'), src.indexOf('  afterCombat('));
    expect(body).toMatch(/Promise\.allSettled\(\[[\s\S]*this\.coop \? \[Promise\.race\(\[coopArtReady\(\)/);
    const lobby = readFileSync('src/ui/screens/lobby.ts', 'utf8');
    // 大廳開局同日改走 `app.adoptRun(run, seat)`（health H-3），這一局叫 `run`
    expect(lobby).toContain('preloadCoopArt(run.players.map((p) => p.hero))');
  });
});
