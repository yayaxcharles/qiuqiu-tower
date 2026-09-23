import { afterEach, describe, expect, it, vi } from 'vitest';
import { _setEventLoaderForTest, failedModuleUrl, loadEventScreen } from '../../src/ui/event-loader';

/*
 * 事件畫面那一塊載入失敗的重試（2026-09-23 推前審查 低-1，`src/ui/event-loader.ts`）。
 *
 * 實測 Chrome：動態載入某個網址失敗一次之後，同一個網址再載一樣失敗（瀏覽器記住了），網址後面換個參數就好。
 */
const URL_ = 'http://localhost:5321/qiuqiu-tower-coop/assets/event-B1uqmOCK.js';
const chromeError = (): Error => new TypeError(`Failed to fetch dynamically imported module: ${URL_}`);

afterEach(() => { _setEventLoaderForTest({ importer: () => Promise.resolve('real'), importUrl: () => Promise.resolve('real'), wait: () => Promise.resolve() }); });

describe('事件畫面的載入', () => {
  it('從錯誤訊息拿得到那一塊的網址（Chrome、Firefox）；拿不到（Safari）回 null', () => {
    expect(failedModuleUrl(chromeError())).toBe(URL_);
    expect(failedModuleUrl(new TypeError(`error loading dynamically imported module: ${URL_}?retry=1`))).toBe(URL_);
    expect(failedModuleUrl(new TypeError('Importing a module script failed.'))).toBeNull();
  });

  it('第一次失敗：換網址參數再抓（不再用原網址，瀏覽器記住的失敗會一直失敗）', async () => {
    const urls: string[] = [];
    let plain = 0;
    _setEventLoaderForTest({
      importer: () => { plain += 1; return Promise.reject(chromeError()); },
      importUrl: (u) => { urls.push(u); return Promise.resolve('ok'); },
      wait: () => Promise.resolve(),
    });
    await expect(loadEventScreen()).resolves.toBe('ok');
    expect(plain).toBe(1);
    expect(urls).toEqual([`${URL_}?retry=1`]);
  });

  it('重試都失敗就往外丟；下一次叫會整個重來（不會永遠卡在上一次的失敗），參數也換新的', async () => {
    const urls: string[] = [];
    let fail = true;
    _setEventLoaderForTest({
      importer: () => Promise.reject(chromeError()),
      importUrl: (u) => { urls.push(u); return fail ? Promise.reject(chromeError()) : Promise.resolve('ok'); },
      wait: () => Promise.resolve(),
    });
    await expect(loadEventScreen()).rejects.toThrow('Failed to fetch');
    expect(urls).toEqual([`${URL_}?retry=1`, `${URL_}?retry=2`]);
    fail = false;
    await expect(loadEventScreen()).resolves.toBe('ok');
    expect(urls.at(-1)).toBe(`${URL_}?retry=3`);
  });

  it('錯誤訊息沒有網址（Safari）：照原本的方式再試', async () => {
    let n = 0;
    _setEventLoaderForTest({
      importer: () => (++n < 2 ? Promise.reject(new TypeError('Importing a module script failed.')) : Promise.resolve('ok')),
      importUrl: () => Promise.reject(new Error('不該走到這裡')),
      wait: () => Promise.resolve(),
    });
    await expect(loadEventScreen()).resolves.toBe('ok');
    expect(n).toBe(2);
  });

  it('同一時間只抓一次：地圖預抓、走進事件格、載入畫面共用同一次；成功過就一直用那一次', async () => {
    let n = 0;
    let release!: (v: unknown) => void;
    _setEventLoaderForTest({ importer: () => { n += 1; return new Promise((r) => { release = r; }); }, wait: () => Promise.resolve() });
    const a = loadEventScreen(); const b = loadEventScreen();
    expect(a).toBe(b);
    release('ok');
    await a;
    await loadEventScreen();
    expect(n).toBe(1);
  });

  it('兩次重試之間有間隔（0.6、1.2 秒），不是連珠砲', async () => {
    const waits: number[] = [];
    _setEventLoaderForTest({
      importer: () => Promise.reject(chromeError()),
      importUrl: () => Promise.reject(chromeError()),
      wait: (ms) => { waits.push(ms); return Promise.resolve(); },
    });
    await loadEventScreen().catch(() => undefined);
    expect(waits).toEqual([600, 1200]);
    vi.restoreAllMocks();
  });
});
