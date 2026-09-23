import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { eventById } from '../../src/content/events';
import { HEROES } from '../../src/engine/hero';
import { BASE, _setManifestForTest, eventArtCast, eventArtKey, heroArtUrls, setLocalHero, type Manifest } from '../../src/ui/assets';
import { deferredBgKeys, eventMainKeys } from '../../src/ui/bgacts';

/*
 * 內容擴充第一批的事件圖接線（2026-09-23，美術代理 art1 的對照表 `batch1_art_keys.md`）：
 *   - 5F 兩版四隻各一套，挑圖走 `eventArtKey`（沒有自己那張才退回球球那張——這批四隻都齊，一張都不該退）；
 *   - 球球三篇的主圖沒有角色前綴：`eventArtCast` 要認 `ninja_`，不然會被當成純場景；
 *   - 5 張球球版主圖不進首載：照地圖現抓（第〇批 0-2 的 `eventMainKeys`），開場與選角都不載。
 */
const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
const EMPTY: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };
afterEach(() => { _setManifestForTest(EMPTY); setLocalHero('ninja'); });

const FIVE = ['daxia_chest', 'daxia_lastpage', 'ninja_blue_headband', 'ninja_target', 'ninja_roof_shadow'];

describe('5F 兩版：四隻各看自己那一套（主圖＋每張結果圖）', () => {
  it.each(HEROES)('%s', (hero) => {
    _setManifestForTest(MANIFEST);
    for (const id of ['daxia_chest', 'daxia_lastpage']) {
      const keys = [id, ...eventById[id]!.choices.flatMap((c) => (c.resultArt ? [c.resultArt] : []))];
      for (const k of keys) {
        const want = hero === 'ninja' ? `bg/event_${k}` : `bg/event_${hero}_${k}`;
        expect(eventArtKey(k, hero), `${hero} ${k}`).toBe(want);
        expect(MANIFEST.bg[want], `${want} 不在清單裡`).toBeTruthy();
        expect(eventArtCast(want), `${want} 畫的應該是 ${hero}`).toEqual([hero]);
      }
    }
  });
});

describe('球球三篇', () => {
  it('主圖與結果圖都在清單裡，插圖裡畫的是球球（認 `ninja_` 前綴）', () => {
    _setManifestForTest(MANIFEST);
    for (const id of ['ninja_blue_headband', 'ninja_target', 'ninja_roof_shadow']) {
      const keys = [id, ...eventById[id]!.choices.flatMap((c) => (c.resultArt ? [c.resultArt] : []))];
      for (const k of keys) {
        expect(MANIFEST.bg[`bg/event_${k}`], k).toBeTruthy();
        expect(eventArtKey(k, 'ninja')).toBe(`bg/event_${k}`);
        expect(eventArtCast(`bg/event_${k}`), k).toEqual(['ninja']);
      }
    }
    // 舊規則照舊：沒有前綴、有菲菲版＝畫了球球；另外三隻的前綴照舊
    expect(eventArtCast('bg/event_daxia_chest')).toEqual(['ninja']);
    expect(eventArtCast('bg/event_fengfeng_daxia_lastpage_r2')).toEqual(['fengfeng']);
  });
});

describe('5 張球球版主圖不進首載', () => {
  it('都在「照地圖現抓」的名單裡，開場那批會跳過', () => {
    const deferred = deferredBgKeys();
    for (const id of FIVE) {
      expect(eventMainKeys(), id).toContain(`bg/event_${id}`);
      expect(deferred.has(`bg/event_${id}`), `${id} 會在開場被載`).toBe(true);
    }
  });

  it('選角之後補載自己那一套時，也不會把 5F 兩版的主圖帶進來（一樣照地圖現抓）', () => {
    _setManifestForTest(MANIFEST);
    for (const hero of HEROES) {
      const urls = new Set(heroArtUrls([hero]));
      for (const id of ['daxia_chest', 'daxia_lastpage']) {
        const key = hero === 'ninja' ? `bg/event_${id}` : `bg/event_${hero}_${id}`;
        expect(urls.has(`${BASE}${MANIFEST.bg[key]}`), `${hero} 選角就載了 ${key}`).toBe(false);
      }
    }
  });
});
