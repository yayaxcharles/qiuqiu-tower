import { describe, expect, it } from 'vitest';
import SHOP_RAW from '../../src/ui/screens/shop.ts?raw';
import REST_RAW from '../../src/ui/screens/rest.ts?raw';
import { TORTOISE_PURIFY_LINE, purifyLine, tortoisePurifyLabel } from '../../src/content/purify-text';
import { PURIFY_PRICE } from '../../src/engine/run';

/*
 * 第三批整合收尾的畫面規矩（2026-09-24 b3int）。倉庫不用瀏覽器模擬，照原始碼規矩守；實機在報告裡。
 */
const SHOP = SHOP_RAW.replace(/\r\n/g, '\n');
const REST = REST_RAW.replace(/\r\n/g, '\n');

describe('罐頭鋪：婆婆的「請婆婆淨化」接上淨化那條線', () => {
  it('服務鈕：婆婆那間走淨化（身上有沾了魔氣的才出現），一件直接淨化、兩件以上跳挑選窗（可以先不要）', () => {
    expect(SHOP).toContain("if (svc?.kind === 'purify') return purifyBtn();");
    expect(SHOP).toContain('const list = miasmaRelicsOf(run, seat);');
    expect(SHOP).toContain("if (!list.length) return '';");
    expect(SHOP).toContain('showPurifyPick(list, go, { cancellable: true })');
    expect(SHOP).toContain("shop.purified ? '這間已經淨化過了' : tortoisePurifyLabel(PURIFY_PRICE)");
    // 判準問引擎，不在畫面另寫一套
    expect(SHOP).toContain('!list.some((id) => canPurifyAtShop(run, shop, id, seat))');
    expect(tortoisePurifyLabel(PURIFY_PRICE)).toBe('請婆婆淨化：90 條小魚乾');
  });

  it('連線走 `act()`（`{ t: \'purify\' }`），等動作繞回來才講話；單機當下講', () => {
    expect(SHOP).toContain("act({ t: 'purify', seat, id }, () => purifyAtShop(run, shop, id, seat)) && !coop) afterPurify(id);");
    expect(SHOP).toContain("else if (one.a.seat === seat && one.a.t === 'purify') afterPurify(one.a.id);");
    // 繞回來那一條要排在「一般買東西」那一條前面，不然會被當成買東西、播錯的聲音
    expect(SHOP.indexOf("one.a.t === 'purify') afterPurify")).toBeLessThan(SHOP.indexOf("else if (one.a.seat === seat && one.a.t !== 'swap') {"));
  });

  it('淨化完：婆婆那一句＋自己回一句、算買了一樣、那一格閃白金光', () => {
    const body = SHOP.slice(SHOP.indexOf('function afterPurify('), SHOP.indexOf('function afterService('));
    expect(body).toContain('talk = { text: TORTOISE_PURIFY_LINE, reply: purifyLine(hero) };');
    expect(body).toContain('countBuy();');
    expect(body).toContain('flashPure = pure;');
    expect(SHOP).toContain("root.querySelector(`.hud-relic[data-relic=\"${flashPure}\"]`)?.classList.add('purified')");
    // 台詞本身：婆婆不講喵、球球那句句尾喵（畫面層不寫喵，台詞在 content）
    expect(TORTOISE_PURIFY_LINE).not.toContain('喵');
    expect(purifyLine('ninja').endsWith('喵。')).toBe(true);
  });
});

describe('貓窩：夢枕的三張照升級版畫', () => {
  it('牌面用＋版、學會那句帶＋', () => {
    // 已經送出去的（推前審查五 高-2）重畫時按不動
    expect(REST).toContain('cardNode({ uid: -1, cardId: c.id, upgraded: true }, { onClick: () => take(c.id), disabled: pillowSent })');
    expect(REST).toContain('學會了「${cardNameFor(nd, me(run, seat).hero)}＋」。');
  });
});
