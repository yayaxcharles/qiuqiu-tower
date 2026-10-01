import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * 審查 2026-10-01 低：師父在第三關地圖上先下載的特效（黑氣、閉關氣場）只下載、不解碼——
 * 還要好一陣子才打到師父，不先在地圖上壓一份點陣圖。開打那一串照舊下載好就排背景解開。
 */
const decoded: string[] = [];
vi.mock('../../src/ui/decoded-atlas', async (orig) => ({
  ...(await orig<typeof import('../../src/ui/decoded-atlas')>()),
  prepareDecodedAtlas: (image: { src: string }) => { decoded.push(image.src); return Promise.resolve(); },
}));

class FakeImage {
  complete = true;
  naturalWidth = 100;
  private value = '';
  set src(v: string) { this.value = v; }
  get src(): string { return this.value; }
  async decode(): Promise<void> {}
}

describe('prefetchFx 的 decode 參數', () => {
  beforeEach(() => {
    vi.resetModules();
    decoded.length = 0;
    vi.stubGlobal('Image', FakeImage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('預設下載好就排背景解開；傳 false 只下載', async () => {
    const fx = await import('../../src/ui/fx-layer');
    (await import('../../src/ui/heavy-lane'))._resetHeavyLaneForTest();
    await fx.prefetchFx(['daxia_black_qi'], false);
    expect(fx.fxReady('daxia_black_qi')).toBe(true);
    expect(decoded).toEqual([]);
    await fx.prefetchFx(['daxia_seclude_aura']);
    expect(decoded.some((u) => u.includes('daxia_seclude_aura'))).toBe(true);
  });
});
