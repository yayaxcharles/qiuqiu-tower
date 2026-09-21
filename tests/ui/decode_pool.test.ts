// 三份「多工下載並解碼」合成一支 `decodeAll`（清理 2026-09-22 B6）：
// 戰鬥畫面帶自己的紀錄與參照，不能動到整頁共用的那一份
import { afterEach, describe, expect, it, vi } from 'vitest';
import { _setManifestForTest, decodeAll, releaseHeldArt, warmed, type DecodePool } from '../../src/ui/assets';
import { preloadAct } from '../../src/ui/preload';

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
    const pool: DecodePool = { seen: new Set(), keep: new Map() };
    await decodeAll(['/a.webp', '/b.webp', '/broken.webp'], 3, true, pool);
    expect([...pool.seen].sort()).toEqual(['/a.webp', '/b.webp']);
    expect([...pool.keep.keys()].sort()).toEqual(['/a.webp', '/b.webp', '/broken.webp']);
    expect(warmed.size).toBe(0);
  });

  it('整頁共用的紀錄解過的，戰鬥自己那組照樣會再解一次並留住（姿勢圖要跟著這一場）', async () => {
    vi.stubGlobal('Image', FakeImage);
    warmed.add('/a.webp');
    const pool: DecodePool = { seen: new Set(), keep: new Map() };
    await decodeAll(['/a.webp'], 1, true, pool);
    expect([...pool.keep.keys()]).toEqual(['/a.webp']);
  });

  it('不帶的時候走整頁共用那組：解過就跳過、失敗的不登記、hold=false 不留參照', async () => {
    vi.stubGlobal('Image', FakeImage);
    warmed.add('/done.webp');
    await decodeAll(['/done.webp', '/new.webp', '/broken.webp', 'data:,x'], 2, false);
    expect(FakeImage.made.map((im) => im.src).sort()).toEqual(['/broken.webp', '/new.webp']);
    expect(warmed.has('/new.webp')).toBe(true);
    expect(warmed.has('/broken.webp')).toBe(false);
  });
});

describe('換關放掉整頁共用那一份留著的圖（清理 2026-09-22 C12：以前只增不減）', () => {
  it('留住的放掉、並從「解過了」拿掉，下次會重新解好留住；沒留住的照舊算解過', async () => {
    vi.stubGlobal('Image', FakeImage);
    await decodeAll(['/held.webp', '/loose.webp'], 2, (u) => u === '/held.webp');
    expect(warmed.has('/held.webp') && warmed.has('/loose.webp')).toBe(true);
    releaseHeldArt();
    expect(warmed.has('/held.webp')).toBe(false);
    expect(warmed.has('/loose.webp')).toBe(true);
    FakeImage.made = [];
    await decodeAll(['/held.webp', '/loose.webp'], 2, true);
    expect(FakeImage.made.map((im) => im.src)).toEqual(['/held.webp']);
  });

  it('preloadAct 換了關才放：同一關叫兩次不重解，換到下一關時上一關的魔物被放掉', async () => {
    vi.stubGlobal('Image', FakeImage);
    const poses = (id: string) => Object.fromEntries(['idle', 'attack', 'hurt', 'block', 'down']
      .map((pose) => [pose, `assets/monsters/${id}_${pose}.webp`]));
    _setManifestForTest({ cards: {}, sprites: {}, icons: {}, bg: {}, review: [], monsters: { 'codex/monster_nekomata': poses('nekomata') } });
    try {
      await preloadAct(1, 'ninja');
      const nekomata = '/assets/monsters/nekomata_idle.webp';
      expect(warmed.has(nekomata)).toBe(true);
      FakeImage.made = [];
      await preloadAct(1, 'ninja');
      expect(FakeImage.made).toEqual([]);
      await preloadAct(2, 'ninja');   // 第二關沒有貓又（第一關關主）
      expect(warmed.has(nekomata)).toBe(false);
    } finally {
      _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] });
    }
  });
});
