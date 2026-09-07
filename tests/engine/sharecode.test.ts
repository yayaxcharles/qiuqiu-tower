import { describe, expect, it } from 'vitest';
import { SHARE_PREFIX, decodeRun, encodeRun, shareSupported } from '../../src/engine/sharecode';
import { newRun } from '../../src/engine/run';
import { loadRun, saveRun, setStore } from '../../src/engine/save';

/**
 * 局面碼（使用者 2026-09-07：「讓三個人用同一種牌組跟秘寶打王看看」）。
 * 壓縮走瀏覽器內建的 CompressionStream，Node 18+ 也有，所以測得到。
 */
describe('局面碼', () => {
  // 這個環境一定要有壓縮 API，不然下面每一條都會靜靜地什麼都不驗就過。
  // 日後把測試環境換成 jsdom（沒有實作 CompressionStream）這一條就會紅，提醒你去補
  it('測試環境有壓縮 API（沒有的話下面全是假綠）', () => {
    expect(shareSupported()).toBe(true);
  });

  it('壓得出來也還原得回去，內容一模一樣', async () => {
    const run = newRun('share-test', 3);
    run.hp = 42;
    run.fish = 777;
    const code = await encodeRun(run);
    expect(code).toBeTruthy();
    expect(code!.startsWith(SHARE_PREFIX)).toBe(true);
    const res = await decodeRun(code!);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.run.hp).toBe(42);
    expect(res.run.fish).toBe(777);
    expect(res.run.difficulty).toBe(3);
    expect(res.run.seed).toBe('share-test');
    expect(res.run.deck.map((c) => c.cardId)).toEqual(run.deck.map((c) => c.cardId));
    expect(res.run.map.nodes.length).toBe(run.map.nodes.length);
  });

  it('碼會比原本的存檔短（壓縮真的有作用）', async () => {
    const run = newRun('share-size', 1);
    const code = await encodeRun(run);
    expect(code!.length).toBeLessThan(JSON.stringify(run).length);
  });

  it('不是局面碼就明講，不要當成壞掉', async () => {
    const res = await decodeRun('1757123456789');   // 這是地圖種子
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.why).toContain('QQT1~');
  });

  it('缺一段的碼要擋下來，而且不能丟例外', async () => {
    const run = newRun('share-broken', 1);
    const code = await encodeRun(run);
    const res = await decodeRun(code!.slice(0, code!.length - 40));
    expect(res.ok).toBe(false);
  });

  it('內容對不上牌表的碼要擋下來', async () => {
    const run = newRun('share-bad-card', 1);
    run.deck[0]!.cardId = '這張牌不存在';
    const code = await encodeRun(run);
    const res = await decodeRun(code!);
    expect(res.ok).toBe(false);
  });
  it('碼壞掉時絕對不能動到收到的人自己的存檔', async () => {
    // 這是這個功能的核心安全要求：別人給的碼再怎麼壞，都不該害你的進度消失。
    // 原本的存檔驗證驗到一半就會 clearSave()，拿去驗別人的碼會誤刪——所以才抽出不碰倉庫的 checkRun。
    // 日後有人把 decodeRun 裡的 checkRun 換回 loadRun，這條就會紅
    const mine = { get: 0, set: 0, del: 0 };
    const box = new Map<string, string>();
    setStore({
      getItem: (k) => { mine.get += 1; return box.get(k) ?? null; },
      setItem: (k, v) => { mine.set += 1; box.set(k, v); },
      removeItem: (k) => { mine.del += 1; box.delete(k); },
    });
    const own = newRun('my-own-progress', 1);
    saveRun(own);
    const before = { ...mine };
    for (const bad of ['', 'QQT1~', 'QQT1~???', '1757123456789', `${SHARE_PREFIX}H4sIAAAAAAAA`]) {
      const res = await decodeRun(bad);
      expect(res.ok).toBe(false);
    }
    expect(mine.del).toBe(before.del);       // 一次都沒清
    expect(mine.set).toBe(before.set);       // 一次都沒覆寫
    expect(loadRun()?.seed).toBe('my-own-progress');   // 自己的進度還在
  });
});
