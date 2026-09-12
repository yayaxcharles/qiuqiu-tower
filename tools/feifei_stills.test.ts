import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 過關與結局的插圖不可以混到別人（2026-09-12）。
 *
 * 這幾張圖裡**球球是主角**——相擁那張他就在正中央被師父抱著。原本程式無條件用他那一套，
 * 玩菲菲時文字寫「師父把她拉過去，摸了摸她的頭」，畫面卻是球球撲進師父懷裡；
 * 過關那三張也一樣（她的台詞講的是撿到師兄踩彎的針、把口罩拉上來）。
 *
 * 兩條：
 *   1. `app.ts` 不可以再出現寫死的 `bg/still_embrace` 那類鍵——一律走 `stillKey`。
 *   2. 進度追蹤：她那八張生好了幾張。**沒生好不是錯**（`slidesReady` 會讓整段退回純對白，
 *      那是對的退路），但生好之後被刪掉是錯，所以用下限釘著。
 */
const app = readFileSync('src/ui/app.ts', 'utf-8');
const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8')) as {
  bg: Record<string, string>;
};

const NAMES = [
  'still_embrace', 'still_home',
  'still_act1_stairs', 'still_act1_fish', 'still_act1_climb',
  'still_act2_smoke', 'still_act2_voice', 'still_act2_moonstairs',
];

/** 她那八張目前生好幾張。生圖補進來就往上調，**只准往上**（2026-09-12 15:40 起是 8＝全到齊） */
const FLOOR = 8;

describe('過關與結局的插圖', () => {
  it('app.ts 裡沒有寫死的球球版鍵', () => {
    const hard = NAMES.filter((n) => app.includes(`'bg/${n}'`));
    expect(hard, `這幾個鍵還寫死在 app.ts：${hard.join('、')}——要走 stillKey`).toEqual([]);
  });

  it('球球那八張都在（她的退路就是這一套的存在）', () => {
    const missing = NAMES.filter((n) => !manifest.bg[`bg/${n}`]);
    expect(missing, `球球的圖不見了：${missing.join('、')}`).toEqual([]);
  });

  it(`她那八張生好的張數不少於 ${FLOOR}`, () => {
    const hers = NAMES.filter((n) => manifest.bg[`bg/feifei_${n}`]);
    // eslint-disable-next-line no-console
    console.log(`  她的過關與結局插圖 ${hers.length}/8${hers.length < 8 ? `　還缺：${NAMES.filter((n) => !manifest.bg[`bg/feifei_${n}`]).join('、')}` : ''}`);
    expect(hers.length, '倒退了——是不是有圖被刪掉或改名？').toBeGreaterThanOrEqual(FLOOR);
  });

  it('她的序章四張已經有了（那批先做的，拿來對照上面的做法）', () => {
    for (const n of ['teach', 'corrupt', 'wait', 'depart']) {
      expect(manifest.bg[`bg/feifei_still_${n}`], `序章 ${n} 不見了`).toBeTruthy();
    }
  });
});

/**
 * 事件插圖也要能依角色（2026-09-12）。
 *
 * 76 張事件／畫面插圖裡有 54 張把球球畫進去了。這邊的退路跟結局那八張不同：
 * **沒生好就退回球球那張**，不是整個不放——54 張要生好幾個小時，
 * 中間放他的圖比整批事件都沒有插圖好。生一張就換一張。
 */
describe('事件插圖依角色', () => {
  it('她有自己那張時就用她的，沒有就退回球球的', async () => {
    const { _setManifestForTest, eventArtKey, setLocalHero } = await import('../src/ui/assets');
    _setManifestForTest({
      cards: {}, sprites: {}, monsters: {}, icons: {}, review: [],
      bg: { 'bg/event_daxia_teach': 'a.webp', 'bg/event_feifei_daxia_teach': 'b.webp', 'bg/event_old_well': 'c.webp' },
    });
    setLocalHero('feifei');
    expect(eventArtKey('daxia_teach')).toBe('bg/event_feifei_daxia_teach');
    expect(eventArtKey('old_well'), '沒有她的就該退回球球那張').toBe('bg/event_old_well');
    setLocalHero('ninja');
    expect(eventArtKey('daxia_teach'), '球球看到的還是原本那張').toBe('bg/event_daxia_teach');
    setLocalHero('ninja');
  });

  it('她的兩個專屬事件的結果圖都在', () => {
    for (const k of ['feifei_trace_r0', 'feifei_trace_r1', 'feifei_brew_r0', 'feifei_brew_r1']) {
      expect(manifest.bg[`bg/event_${k}`], `${k} 不見了`).toBeTruthy();
    }
  });
});

/**
 * 地圖上「你在這」那顆頭像（2026-09-12）。
 *
 * 這顆最該分家：**每次看地圖都看得到**，而且它代表的就是「我」。
 * 玩菲菲卻在地圖上看到球球，比事件插圖裡混到他還怪。
 */
describe('地圖上的頭像', () => {
  it('依關數挑，而且有她的就用她的', async () => {
    const { _setManifestForTest, mapHeroKey, setLocalHero } = await import('../src/ui/assets');
    _setManifestForTest({
      cards: {}, sprites: {}, monsters: {}, bg: {}, review: [],
      icons: {
        'icon/map_hero_low': 'a', 'icon/map_hero_mid': 'b', 'icon/map_hero_top': 'c',
        'icon/map_hero_feifei_low': 'd',
      },
    });
    setLocalHero('ninja');
    expect(mapHeroKey(1)).toBe('icon/map_hero_low');
    expect(mapHeroKey(2)).toBe('icon/map_hero_mid');
    expect(mapHeroKey(3)).toBe('icon/map_hero_top');
    setLocalHero('feifei');
    expect(mapHeroKey(1), '有她的就該用她的').toBe('icon/map_hero_feifei_low');
    expect(mapHeroKey(2), '沒有她的就該退回球球那顆').toBe('icon/map_hero_mid');
    setLocalHero('ninja');
  });

  it('map.ts 沒有寫死的頭像鍵', () => {
    const map = readFileSync('src/ui/screens/map.ts', 'utf-8');
    expect(map.includes('icon/map_hero_$'), 'map.ts 還在自己組鍵，要走 mapHeroKey').toBe(false);
  });
});
