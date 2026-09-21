// 三份「多工下載並解碼」合成一支 `decodeAll`（清理 2026-09-22 B6）：
// 戰鬥畫面帶自己的紀錄與參照，不能動到整頁共用的那一份
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeAll, warmed, type DecodePool } from '../../src/ui/assets';

class FakeImage {
  static made: FakeImage[] = [];
  src = '';
  constructor() { FakeImage.made.push(this); }
  async decode(): Promise<void> { if (this.src.includes('broken')) throw new Error('壞圖'); }
}

afterEach(() => {
  warmed.clear();
  FakeImage.made = [];
  vi.unstubAllGlobals();
});

describe('decodeAll 的紀錄與參照', () => {
  it('帶自己的一組時：登記在自己那組、參照留在自己那組，整頁共用的紀錄不動', async () => {
    vi.stubGlobal('Image', FakeImage);
    const pool: DecodePool = { seen: new Set(), keep: [] };
    await decodeAll(['/a.webp', '/b.webp', '/broken.webp'], 3, true, pool);
    expect([...pool.seen].sort()).toEqual(['/a.webp', '/b.webp']);
    expect(pool.keep.map((im) => im.src).sort()).toEqual(['/a.webp', '/b.webp', '/broken.webp']);
    expect(warmed.size).toBe(0);
  });

  it('整頁共用的紀錄解過的，戰鬥自己那組照樣會再解一次並留住（姿勢圖要跟著這一場）', async () => {
    vi.stubGlobal('Image', FakeImage);
    warmed.add('/a.webp');
    const pool: DecodePool = { seen: new Set(), keep: [] };
    await decodeAll(['/a.webp'], 1, true, pool);
    expect(pool.keep.map((im) => im.src)).toEqual(['/a.webp']);
  });

  it('不帶的時候走整頁共用那組：解過就跳過、失敗的不登記、hold=false 不留參照', async () => {
    vi.stubGlobal('Image', FakeImage);
    warmed.add('/done.webp');
    const pool: DecodePool = { seen: new Set(), keep: [] };
    await decodeAll(['/done.webp', '/new.webp', '/broken.webp', 'data:,x'], 2, false);
    expect(FakeImage.made.map((im) => im.src).sort()).toEqual(['/broken.webp', '/new.webp']);
    expect(warmed.has('/new.webp')).toBe(true);
    expect(warmed.has('/broken.webp')).toBe(false);
    expect(pool.keep).toEqual([]);
  });
});
