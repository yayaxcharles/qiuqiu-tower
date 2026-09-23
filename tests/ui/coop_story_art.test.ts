/**
 * 連線雙貓劇情圖（2026-09-23，批次 coopstory；美術盤點 C3，工具 `tools/gen_coop_story_art.py`）。
 *
 * 之前只有封封三條有序章、塔頂、結局各一張；球球＋菲菲、球球＋噹噹、噹噹＋菲菲整段退回純對白，
 * 封封三條的兩次過關也是。這一批補了 24 張，這裡守：
 *  1. 六組搭檔、兩個席位（誰當本機都一樣）：序章、兩次過關、結局都配到這一組自己的連線圖，
 *     一句都沒掉、沒有空白的那一張，而且**絕不借單人版的圖**；
 *  2. 那些圖都在清單裡、檔案在、是舞台大小（1280×720），`slidesReady` 認得；
 *  3. 兩張圖的序章與結局照台詞的 `slideBreak` 切（球球＋菲菲的序章原本沒有切點，這次補在第二句）。
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setCoopStory, storyFor, victoryLinesFor } from '../../src/content/dialogue';
import { _setManifestForTest, type Manifest } from '../../src/ui/assets';
import { slidesReady } from '../../src/ui/slides';
import { actClearSlides, endingSlides, prologueSlides, topSceneSlides } from '../../src/ui/storyslides';

const MANIFEST = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Manifest;
beforeEach(() => { _setManifestForTest(MANIFEST); });
afterEach(() => { setCoopStory(null); _setManifestForTest(MANIFEST); });

/** [本機, 搭檔, 圖鍵前綴, 序章張數, 結局張數] */
const PAIRS = [
  ['ninja', 'feifei', 'bg/feifei_coop_ninja_', 2, 2],
  ['ninja', 'dangdang', 'bg/dangdang_coop_ninja_', 2, 2],
  ['feifei', 'dangdang', 'bg/dangdang_coop_feifei_', 2, 2],
  ['fengfeng', 'ninja', 'bg/fengfeng_coop_ninja_', 1, 1],
  ['fengfeng', 'feifei', 'bg/fengfeng_coop_feifei_', 1, 1],
  ['fengfeng', 'dangdang', 'bg/fengfeng_coop_dangdang_', 1, 1],
] as const;
const SEATS = PAIRS.flatMap(([a, b, prefix, pro, vic]) => [
  { me: a, partner: b, prefix, pro, vic }, { me: b, partner: a, prefix, pro, vic },
]);

/** WebP（VP8／VP8X）表頭裡的畫布大小 */
const webpSize = (file: string): [number, number] => {
  const b = readFileSync(file);
  const kind = new TextDecoder().decode(b.subarray(12, 16));
  if (kind === 'VP8X') {
    const read24 = (at: number): number => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
    return [1 + read24(24), 1 + read24(27)];
  }
  expect(kind, file).toBe('VP8 ');
  return [(b[26]! | (b[27]! << 8)) & 0x3fff, (b[28]! | (b[29]! << 8)) & 0x3fff];
};

describe('連線雙貓劇情圖', () => {
  it.each(SEATS)('$me＋$partner：序章、兩次過關、結局都配這一組自己的圖，一句不掉', ({ me, partner, prefix, pro, vic }) => {
    setCoopStory({ partner, mirror: me });
    const story = storyFor(me);
    const parts = [
      { name: 'prologue', slides: prologueSlides(me), lines: story.prologue, count: pro },
      { name: 'act1', slides: actClearSlides(me, 1), lines: story.actClear1, count: 1 },
      { name: 'act2', slides: actClearSlides(me, 2), lines: story.actClear2, count: 1 },
      { name: 'victory', slides: endingSlides(me, [], 1), lines: victoryLinesFor([], 1, me), count: vic },
    ];
    for (const { name, slides, lines, count } of parts) {
      expect(slides.length, name).toBe(count);
      for (const s of slides) {
        expect(s.img.startsWith(prefix), `${name} 配到 ${s.img}`).toBe(true);
        expect(s.lines.length, `${name} ${s.img} 沒有台詞`).toBeGreaterThan(0);
      }
      expect(slides.flatMap((s) => s.lines), name).toEqual(lines);
      expect(slidesReady(slides), `${name} 的圖不在清單裡`).toBe(true);
    }
    // 兩張的那幾組：序章 1／2、結局 1／2；一張的封封那三組：序章、結局
    const expectKeys = pro === 2
      ? ['prologue1', 'prologue2', 'act1', 'act2', 'victory1', 'victory2']
      : ['prologue', 'act1', 'act2', 'victory'];
    expect(parts.flatMap((p) => p.slides.map((s) => s.img))).toEqual(expectKeys.map((k) => prefix + k));
  });

  it.each(SEATS)('$me＋$partner：兩台機器配到同一套圖', ({ me, partner }) => {
    setCoopStory({ partner, mirror: me });
    const mine = [...prologueSlides(me), ...actClearSlides(me, 1), ...actClearSlides(me, 2), ...endingSlides(me, [], 1)].map((s) => s.img);
    setCoopStory({ partner: me, mirror: me });
    const theirs = [...prologueSlides(partner), ...actClearSlides(partner, 1), ...actClearSlides(partner, 2), ...endingSlides(partner, [], 1)].map((s) => s.img);
    expect(theirs).toEqual(mine);
  });

  it('兩張圖的切點落在台詞寫的地方（第一張講完那一句才換圖）', () => {
    setCoopStory({ partner: 'feifei', mirror: 'ninja' });
    const [p1, p2] = prologueSlides('ninja');
    expect(p1!.lines.at(-1)!.text).toContain('一路追到塔下');
    expect(p2!.lines[0]!.text).toContain('我叫你好幾次了');
    const [v1] = endingSlides('ninja', [], 1);
    expect(v1!.lines.at(-1)!.text).toContain('一手把菲菲拉到身邊');
    setCoopStory({ partner: 'feifei', mirror: 'dangdang' });
    expect(prologueSlides('dangdang')[0]!.lines.at(-1)!.text).toContain('我還帶了師父的藥');
    expect(endingSlides('dangdang', [], 1)[0]!.lines.at(-1)!.text).toContain('我找了你好久');
  });

  it('困難難度多出來的那句旁白接在結局最後一張，不會多出一張沒有圖的', () => {
    setCoopStory({ partner: 'dangdang', mirror: 'ninja' });
    const slides = endingSlides('ninja', [], 5);
    expect(slides.length).toBe(2);
    expect(slides.flatMap((s) => s.lines)).toEqual(victoryLinesFor([], 5, 'ninja'));
  });

  it('二十四張都在清單裡、檔案在、是舞台大小', () => {
    const keys = PAIRS.flatMap(([, , prefix, pro]) => (pro === 2
      ? ['prologue1', 'prologue2', 'act1', 'act2', 'victory1', 'victory2']
      : ['act1', 'act2']).map((k) => prefix + k));
    expect(keys.length).toBe(24);
    for (const key of keys) {
      const rel = MANIFEST.bg[key];
      expect(rel, key).toBe(`assets/${key}.webp`);
      expect(webpSize(`public/${rel}`), key).toEqual([1280, 720]);
    }
  });

  it('封封那三組的塔頂圖照舊', () => {
    for (const partner of ['ninja', 'feifei', 'dangdang'] as const) {
      setCoopStory({ partner, mirror: 'fengfeng' });
      expect(topSceneSlides('fengfeng').map((s) => s.img)).toEqual([`bg/fengfeng_coop_${partner}_top`]);
    }
    // 另外三組沒有塔頂那一段台詞，就沒有塔頂圖
    setCoopStory({ partner: 'feifei', mirror: 'ninja' });
    expect(topSceneSlides('ninja')).toEqual([]);
  });

  it('清單裡還沒有這批圖（舊快取）就整段退回純對白，不借單人的圖', () => {
    const bg = Object.fromEntries(Object.entries(MANIFEST.bg).filter(([k]) => !/_coop_/.test(k)));
    _setManifestForTest({ ...MANIFEST, bg });
    setCoopStory({ partner: 'dangdang', mirror: 'ninja' });
    for (const slides of [prologueSlides('ninja'), actClearSlides('ninja', 1), actClearSlides('ninja', 2), endingSlides('ninja', [], 1)]) {
      expect(slides.every((s) => s.img.includes('_coop_')), slides.map((s) => s.img).join()).toBe(true);
      expect(slidesReady(slides)).toBe(false);
    }
  });
});
