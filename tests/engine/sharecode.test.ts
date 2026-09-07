import { describe, expect, it } from 'vitest';
import { SHARE_PREFIX, decodeRun, encodeRun, shareSupported } from '../../src/engine/sharecode';
import { newRun } from '../../src/engine/run';

/**
 * 局面碼（使用者 2026-09-07：「讓三個人用同一種牌組跟秘寶打王看看」）。
 * 壓縮走瀏覽器內建的 CompressionStream，Node 18+ 也有，所以測得到。
 */
describe('局面碼', () => {
  it('壓得出來也還原得回去，內容一模一樣', async () => {
    if (!shareSupported()) return;   // 環境沒有壓縮 API 就跳過，不要假紅
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
    if (!shareSupported()) return;
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
    if (!shareSupported()) return;
    const run = newRun('share-broken', 1);
    const code = await encodeRun(run);
    const res = await decodeRun(code!.slice(0, code!.length - 40));
    expect(res.ok).toBe(false);
  });

  it('內容對不上牌表的碼要擋下來', async () => {
    if (!shareSupported()) return;
    const run = newRun('share-bad-card', 1);
    run.deck[0]!.cardId = '這張牌不存在';
    const code = await encodeRun(run);
    const res = await decodeRun(code!);
    expect(res.ok).toBe(false);
  });
});
