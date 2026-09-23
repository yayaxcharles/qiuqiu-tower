/**
 * 連線的鏡子走廊：插圖照座位 0 那一位挑，文字對得上插圖（2026-09-23 實機驗收 M-1）。
 *
 * 鏡中那隻照座位 0 變裝、文字也照它改（`MIRROR_EVENT_TEXT`），插圖原本卻照本機那一位挑：
 * 球球開房、菲菲加入時，菲菲那台讀到「鏡子裡是綁著頭巾的影子」，圖上是她自己跟她自己的黑影。
 * 這裡守：
 *  1. 連線時鏡子走廊的主圖（結果圖是同一張）照座位 0 那一位挑；單人、其他事件照舊；
 *  2. 坐 1 號、插圖裡沒有自己時，旁邊放自己的立繪；坐 0 號（圖就是自己）不放；
 *  3. 十二組混搭文字跟座位 0 那張插圖講的是同一件事：菲菲那張鏡子裡是黑影，
 *     球球、噹噹、封封那三張是彩色倒影；球球看到的是同伴的倒影，不是「無數個球球」；封封的劍佩在腰上。
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventTextFor, setCoopStory } from '../../src/content/dialogue';
import { events } from '../../src/content/events';
import { HEROES, type Hero } from '../../src/engine/hero';
import { _setManifestForTest, eventArtCast, eventArtHero, eventArtKey, eventSidePortrait, setLocalHero, type Manifest } from '../../src/ui/assets';

const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
beforeEach(() => { _setManifestForTest(MANIFEST); });
afterEach(() => { setCoopStory(null); setLocalHero(undefined); });

const OWN_KEY: Record<Hero, string> = {
  ninja: 'bg/event_mirror_hall', feifei: 'bg/event_feifei_mirror_hall',
  dangdang: 'bg/event_dangdang_mirror_hall', fengfeng: 'bg/event_fengfeng_mirror_hall',
};
/** 四張鏡子走廊插圖裡看得到的事（2026-09-23 逐張看過）：鏡子裡是不是黑影、那一位身上認得出的東西 */
const PICTURE: Record<Hero, { dark: boolean; mark: string }> = {
  ninja: { dark: false, mark: '頭巾' },
  feifei: { dark: true, mark: '蝴蝶結' },
  dangdang: { dark: false, mark: '護臂' },
  fengfeng: { dark: false, mark: '封封' },
};
const PAIRS = HEROES.flatMap((seat0) => HEROES.filter((h) => h !== seat0).map((seat1) => [seat0, seat1] as const));
const hall = events.find((e) => e.id === 'mirror_hall')!;
const fight = hall.choices.find((c) => c.outcome.some((o) => o.kind === 'fight'))!;

describe('連線的鏡子走廊插圖照座位 0 那一位挑', () => {
  it.each(PAIRS)('座位 0＝%s、座位 1＝%s：兩台都看座位 0 那張，坐 1 號的旁邊放自己的立繪', (seat0, seat1) => {
    const art = eventArtHero('mirror_hall', [seat0, seat1]);
    expect(art).toBe(seat0);
    expect(eventArtKey('mirror_hall', art)).toBe(OWN_KEY[seat0]);
    expect(eventArtCast(eventArtKey('mirror_hall', art))).toEqual([seat0]);
    // 坐 1 號：圖裡沒有自己 → 放自己的立繪；坐 0 號：圖就是自己 → 不放
    const side = eventSidePortrait('mirror_hall', art, seat1);
    expect(side, '坐 1 號要有自己的立繪').toBeDefined();
    expect(side!.startsWith('data:')).toBe(false);
    expect(eventSidePortrait('mirror_hall', art, seat0)).toBeUndefined();
  });

  it('單人、同角色雙人、其他事件照舊（照本機這一位挑、不放立繪）', () => {
    expect(eventArtHero('mirror_hall', ['feifei'])).toBeUndefined();
    expect(eventArtHero('toll', ['ninja', 'feifei'])).toBeUndefined();
    setLocalHero('feifei');
    expect(eventArtKey('mirror_hall', eventArtHero('mirror_hall', ['feifei']))).toBe(OWN_KEY.feifei);
    expect(eventArtHero('mirror_hall', ['dangdang', 'dangdang'])).toBe('dangdang');
    expect(eventSidePortrait('mirror_hall', 'dangdang', 'dangdang')).toBeUndefined();
    expect(eventSidePortrait('toll', undefined, 'feifei')).toBeUndefined();
  });

  it('事件畫面的開頭、結果兩處都照它挑圖、放立繪', () => {
    const src = readFileSync('src/ui/screens/event.ts', 'utf8').replace(/\r\n/g, '\n');
    expect(src).toContain("const artHero = eventArtHero(ev.id, run.players.map((p) => p.hero));");
    expect(src).toContain('eventArt(art ?? ev.id, artHero)');
    expect(src).toContain('eventArt(ev.id, artHero)');
    expect(src.match(/\.\.\.\(portrait \? \{ portrait \} : \{\}\)/g)?.length).toBe(2);
    // 事件的框比紙箱高，立繪照紙箱那條放會踩在名牌上：事件畫面自己一條，站在插圖左邊、腳底對齊插圖底邊
    const css = readFileSync('src/ui/styles/screens.css', 'utf8').replace(/\r\n/g, '\n');
    expect(css).toMatch(/#stage\[data-screen="event"\] \.scene \.scene-portrait \{[^}]*top: 108px;[^}]*bottom: auto;/);
  });
});

describe('十二組混搭文字對得上座位 0 那張插圖', () => {
  it.each(PAIRS)('鏡子照 %s、坐 1 號的是 %s', (seat0, me) => {
    setCoopStory({ partner: seat0, mirror: seat0 });
    const intro = eventTextFor(me, hall.text);
    const fought = eventTextFor(me, fight.result);
    expect(intro, '開頭講得出鏡子裡那一位的樣子').toContain(PICTURE[seat0].mark);
    if (PICTURE[seat0].dark) {
      expect(intro, '這張鏡子裡是黑影').toContain('黑影');
    } else {
      expect(intro, '這張鏡子裡是彩色倒影，不是黑影').not.toContain('黑影');
      expect(fought, '結果也是同一張圖').not.toContain('黑影');
    }
    if (me === 'ninja') expect(intro, '鏡子裡是同伴，不是無數個球球').not.toContain('無數個球球');
    if (seat0 === 'fengfeng') expect(intro, '封封的劍佩在腰上、倒影握著拳').not.toMatch(/背著劍|劍柄/);
  });
});
