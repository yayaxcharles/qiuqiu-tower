import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOODS_GAP, GOODS_MIN_SCALE, goodsShrink, nextGoodsScale, type Box } from '../../src/ui/goodsfit';
import SCENE_SRC from '../../src/ui/scene.ts?raw';
import SHOP_SRC from '../../src/ui/screens/shop.ts?raw';
import DIALOGUE_SRC from '../../src/ui/dialogue.ts?raw';
// 樣式表用 readFileSync 讀（`.css?raw` 在測試裡會被樣式外掛吃成空字串）
const SCREENS_CSS = readFileSync('src/ui/styles/screens.css', 'utf8');
const PHONE_CSS = readFileSync('src/ui/styles/phone.css', 'utf8');
const BASE_CSS = readFileSync('src/ui/styles/base.css', 'utf8');

/*
 * 實機驗收五（accept_c3，2026-09-24）推之前的四項版面。
 * 版面本身在瀏覽器裡量（兩台修前修後的量測與截圖在派工暫存區 `b3int_shots/layout_fix/`）；
 * 這裡守的是「量出來會對」靠的那幾條：純計算、樣式規矩、立繪的畫布與挑定紀錄。
 */
const norm = (s: string): string => s.replace(/\r\n/g, '\n');

describe('中：罐頭鋪價錢永遠看得到（貨架讓位給對白）', () => {
  // 實機驗收那一格的數字（桌機第二關長毛掌櫃）：貨架上緣 66、秘寶那排價錢底邊 598，店主那句字從 570 開始
  const price = (x: number, bottom: number): Box => ({ x, y: bottom - 26, w: 150, h: 26 });
  const line = (x: number, w: number, y: number): Box => ({ x, y, w, h: 35 });

  it('字壓到價錢：縮到價錢底邊離字 `GOODS_GAP`；縮完再算一次就不用再縮', () => {
    const s = goodsShrink(66, [price(220, 598)], [line(120, 600, 570)]);
    expect(s).toBeCloseTo((570 - GOODS_GAP - 66) / (598 - 66), 6);
    const after = 66 + (598 - 66) * s;
    expect(after + GOODS_GAP).toBeCloseTo(570, 6);
    expect(goodsShrink(66, [{ x: 220, y: after - 26 * s, w: 150 * s, h: 26 * s }], [line(120, 600, 570)])).toBe(1);
  });

  it('左右錯開的字蓋不到那一格、離得夠遠的不縮：橘貓老闆那幾間照舊一個像素都不動', () => {
    expect(goodsShrink(66, [price(900, 598)], [line(120, 600, 570)]), '字只到 720，價錢在 900').toBe(1);
    expect(goodsShrink(66, [price(220, 560)], [line(120, 600, 570)]), '底邊 560＋留白 6 還在字上面').toBe(1);
    expect(goodsShrink(66, [], [line(120, 600, 570)])).toBe(1);
  });

  it('按鈕也算：價錢沉到按鈕那一排也要讓', () => {
    expect(goodsShrink(66, [price(300, 660)], [{ x: 240, y: 640, w: 270, h: 58 }])).toBeLessThan(1);
  });

  it('最多縮到 `GOODS_MIN_SCALE`，不會縮成一團；已經縮過的照乘', () => {
    expect(nextGoodsScale(1, 0.2)).toBe(GOODS_MIN_SCALE);
    expect(nextGoodsScale(0.95, 0.9)).toBeCloseTo(0.855, 6);
    expect(nextGoodsScale(1, 1)).toBe(1);
  });

  it('接線：畫面畫好時量一次、行腳商換一句話時再量一次；縮放用獨立的 `scale`、原點在上緣', () => {
    const scene = norm(SCENE_SRC);
    expect(scene).toContain("if (scene.querySelector('.scene-goods')) watchGoods(scene);");
    expect(scene).toContain('requestAnimationFrame(() => refitGoods(scene))');
    expect(scene).toContain("for (const e of scene.querySelectorAll('.scene-goods, .scene-box')) watch.observe(e);");
    expect(scene).toContain("scene.addEventListener('animationend', () => refitGoods(scene));");
    expect(scene).toContain('const next = nextGoodsScale(scale, goodsShrink(top, prices, covers));');
    expect(scene).toContain("goods.style.scale = String(Math.floor(scale * 1000) / 1000);");
    expect(scene).toContain("for (const b of box.querySelectorAll('.scene-actions .btn')) covers.push(settled(R(b.getBoundingClientRect())));");
    expect(norm(SHOP_SRC)).toContain('if (node && !intro) { node.textContent = text; refitGoods(root); }');
    expect(norm(SCREENS_CSS)).toMatch(/\.scene-goods \{[^}]*transform-origin: top center;/);
  });

  /*
   * 2026-09-24 使用者：「長毛掌櫃那間買完東西介面突然放大縮小、畫面抖動，字比原本小」。
   * 實機逐格記錄（桌機第一關長毛掌櫃，買一件秘寶）：買完那一刻整個畫面重畫、對白框重播彈入（往下 26 像素滑上來），
   * 那 0.28 秒量到「不用縮」→ 貨架彈回原大（0.979 → 1），播完又縮回 0.978——這就是忽大忽小。
   * 修法兩條：① 量的時候扣掉框現在的位移（量「播完的位置」）；② 貨架說明最多四行，店長私藏（集章卡）七行的說明不再把貨架撐到要縮。
   * 修後同一格：進店到買完 6 秒內貨架一直是原大、一次都沒變（桌機第一、二關，手機橫拿第一關）。
   */
  it('買完東西貨架不再忽大忽小：量對白框時扣掉彈入動畫的位移', () => {
    const scene = norm(SCENE_SRC);
    expect(scene).toContain("const t = getComputedStyle(box).transform;");
    expect(scene).toContain('new DOMMatrixReadOnly(t).m42');
    expect(scene).toContain('const settled = (b: Box): Box => ({ ...b, y: b.y - lift });');
    expect(scene).toContain('covers.push(settled(R(r)))');
  });
  it('貨架說明最多四行（全文在滑鼠提示）；只夾罐頭鋪貨架，開局祝福與手機放大那張不受影響，牌也不受影響', () => {
    const css = norm(SCREENS_CSS);
    expect(css).toMatch(/\.scene-goods \.shop-item:not\(\.card-item\) \.small \{[^}]*-webkit-line-clamp: 4;/);
    // 沒有別的規則夾 `.shop-item .small`（推前審查 中：開局祝福的卡也是 `.shop-item`，曾被連帶夾成四行）
    expect(css.match(/-webkit-line-clamp: 4/g)?.length).toBe(1);
    expect(norm(SHOP_SRC)).toContain("el('div', { class: 'small', title: text }, text)");
  });
});

describe('低：頂部提示同一時間只有一條、排隊輪流上', () => {
  const src = norm(DIALOGUE_SRC);
  const body = src.slice(src.indexOf('export function notice(text: string): void {'), src.indexOf('/** 一句公告留多久'));

  it('還掛著一條時新的一句先排著，現在那條最多再留 `NOTICE_YIELD_MS` 就讓位；同一句不排兩次', () => {
    expect(body).toContain('if (noticeNow) {');
    expect(body).toContain('noticeWait.push(text);');
    expect(body).toContain('if (noticeNow.outAt - Date.now() > NOTICE_YIELD_MS) hideNoticeIn(noticeNow, NOTICE_YIELD_MS);');
    expect(body).toContain('if (noticeNow.text === text || noticeWait.includes(text)) return;');
    expect(src).toContain('export const NOTICE_YIELD_MS = 1500;');
    // 每一句都直接開一條（修之前的寫法）就會疊在同一個位置
    expect(body).not.toMatch(/const t = el\('div', \{ class: 'notice' \}, text\);\s*layer\.append\(t\);\s*const stay/);
  });

  it('拔掉那一刻才換下一句上來，而且只有它還是「現在那條」才換；疊層被清掉就從頭來', () => {
    expect(body).toContain('cur.el.remove();\n    if (noticeNow !== cur) return;\n    noticeNow = null;\n    const next = noticeWait.shift();');
    expect(body).toContain('}, ms + NOTICE_FADE_MS);');
    expect(body).toContain('if (cur && !cur.el.isConnected) {');
    expect(src).toContain('return Math.min(4200, Math.max(2600, [...text].length * 90));');
  });

  it('公告的樣子照舊只在 base.css：一條、置中、壓在對白層上面', () => {
    expect(norm(BASE_CSS)).toMatch(/\.notice \{[^}]*top: 14px;[^}]*text-align: center;/);
    expect(norm(SCREENS_CSS)).not.toMatch(/\.notice\b/);
  });
});

describe('低：貓窩的旁白與按鈕不蓋到貓（貓的位置一個像素都不動）', () => {
  const css = norm(SCREENS_CSS);
  const phone = norm(PHONE_CSS);

  it('旁白與名牌置中（貓趴在左下角，置中那一行從 480 起）', () => {
    expect(css).toContain(':is(#stage, .screen-leaving)[data-screen="rest"] .scene .scene-box .scene-text { text-align: center; }');
    expect(css).toContain(':is(#stage, .screen-leaving)[data-screen="rest"] .scene .scene-box .dialogue-speaker { left: 50%; translate: -50% 0; }');
  });

  it('三顆鈕以上桌機縮一級排一行；手機四顆鈕縮到 20 字排兩排', () => {
    expect(css).toContain(':is(#stage, .screen-leaving)[data-screen="rest"] .scene-actions:has(> .btn:nth-child(3)) .btn { min-width: 0; padding: 10px 14px; font-size: 17px; letter-spacing: 0; }');
    expect(css).toContain(':is(#stage, .screen-leaving)[data-screen="rest"] .scene-actions:has(> .btn:nth-child(3)) .btn.two-line { padding-top: 4px; padding-bottom: 4px; line-height: 1.1; }');
    expect(phone).toContain('html[data-device="phone"][data-orient="landscape"] #stage[data-screen="rest"] .scene-actions:has(> .btn:nth-child(4)) .btn { font-size: 20px; padding-left: 10px; padding-right: 10px; }');
  });

  it('這次沒有動貓：貓窩的立繪規則還是那 15 條、數字照舊', () => {
    const rules = css.split('\n').filter((l) => /\[data-screen="rest"\][^{]*\.scene-portrait \{/.test(l));
    expect(rules.length).toBe(15);
    expect(rules).toContain(':is(#stage, .screen-leaving)[data-screen="rest"] .scene-portrait { left: 156px; bottom: 150px; }');
    expect(rules).toContain(':is(#stage, .screen-leaving)[data-screen="rest"][data-act="3"] .scene-portrait { left: 2px; bottom: 178px; }');
    expect(rules.join('\n')).not.toMatch(/scene-portrait \{[^}]*(height|scale|width)/);
  });
});

describe('低：行腳商的頭跟橘貓老闆一樣大（照頭寬 153 重縮）', () => {
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
  const picks = JSON.parse(readFileSync('tools/motion-art-source/c3/picks.json', 'utf8')) as Record<string, { headSource: number; headTarget: number; headInCanvas: number; size: number[]; file: string }>;

  it('三張都照重量的臉寬挑定（臉頰黑線到黑線，不含頭巾尾巴），縮到 153、畫布 360×480', () => {
    const want: Record<string, number> = { merchant: 427, merchant_happy: 425, merchant_no: 483 };
    for (const [name, head] of Object.entries(want)) {
      const p = picks[name]!;
      expect(p.headSource, name).toBe(head);
      expect(p.headTarget, name).toBe(153);
      expect(p.headInCanvas, name).toBe(153);
      expect(p.size, name).toEqual([360, 480]);
      expect(webpSize(p.file), name).toEqual([360, 480]);
    }
    for (const k of ['keeper_tortoise', 'keeper_curio', 'keeper_junk']) expect(webpSize(`public/assets/sprites/shop/${k}.webp`), k).toEqual([332, 420]);
  });

  it('框照同一個每像素比例放大（266 × 480 ÷ 420 = 304）、底邊照舊；只有行腳商那一格掛 class', () => {
    expect(266 * 480 / 420).toBe(304);
    const css = norm(SCREENS_CSS);
    expect(css).toContain('.scene:has(.scene-goods) .scene-portrait { bottom: 160px; height: 266px; }');
    expect(css).toContain('.scene:has(.scene-goods) .scene-portrait.merchant { height: 304px; }');
    expect(css).not.toMatch(/\.scene-portrait\.merchant \{[^}]*bottom/);
    expect(norm(SHOP_SRC)).toContain("if (mer) root.querySelector('.scene-portrait')?.classList.add('merchant');");
    const tool = norm(readFileSync('tools/gen_content_batch3_art.py', 'utf8'));
    expect(tool).toContain('MERCHANT_SIZE = (360, 480)');
    expect(tool).toContain("fit_sprite(cleaned, head, fit, MERCHANT_SIZE if name.startswith('merchant') else SPRITE_SIZE)");
  });
});
