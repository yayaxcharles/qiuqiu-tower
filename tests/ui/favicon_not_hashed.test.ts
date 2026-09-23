import { afterAll, beforeAll, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { assetHash } from '../../tools/vite-asset-hash';

/*
 * 小圖示的網址是 `index.html` 用 `%BASE_URL%favicon.png` 寫死的（2026-09-23，見那邊的說明），
 * 不像清單裡的圖靠 `files` 表動態找回改名後的檔案。素材雜湊外掛預設對**清單分類沒用到的**
 * 檔案一律加雜湊碼改名（`tools/vite-asset-hash.ts` 的 `SKIP_EXT`／`FAVICON_REL`）——
 * `.png` 不在跳過的副檔名清單裡，沒有額外排它的話打包會把 `favicon.png` 改名成
 * `favicon-XXXXXXXX.png`，`index.html` 裡的舊名字就變成 404。
 *
 * 這條測試真的跑一次打包外掛（不是只讀原始碼），確認 `favicon.png` 打包後檔名沒變、
 * 內容也還是同一張圖。
 */
const root = mkdtempSync(join(tmpdir(), 'qiuqiu-favicon-'));
const outDir = join(root, 'dist');

beforeAll(() => {
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  copyFileSync(resolve('public/favicon.png'), join(outDir, 'favicon.png'));
  // 外掛需要清單存在才會動手（見檔頭第 2 條），內容跟這條測試無關，給個最小的空清單
  writeFileSync(join(outDir, 'assets/manifest.json'), JSON.stringify({
    cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [],
  }));
  const plugin = assetHash() as unknown as {
    configResolved(config: { root: string; build: { outDir: string } }): void;
    closeBundle(): void;
  };
  plugin.configResolved({ root, build: { outDir: 'dist' } });
  plugin.closeBundle();
});

afterAll(() => {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes('qiuqiu-favicon-')) {
    throw new Error('測試暫存目錄不在預期範圍');
  }
  rmSync(root, { recursive: true, force: true });
});

it('favicon.png 打包後檔名不變（index.html 的網址是寫死的，不走清單）', () => {
  expect(existsSync(join(outDir, 'favicon.png'))).toBe(true);
  const published = readFileSync(join(outDir, 'favicon.png'));
  const source = readFileSync(resolve('public/favicon.png'));
  expect(published).toEqual(source);
});
