import { expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/*
 * 逐格動作的圖（`public/assets/motion/**`）一律由 `fileUrl()` 查清單的 `files` 表找加了雜湊的路徑。
 * 打包外掛只把**清單分類沒用到的**檔案放進 `files`（`tools/vite-asset-hash.ts`），
 * 所以動作圖要是也被登記進 sprites／monsters 這類分類，就不會進 `files`：
 * 正式網站拿沒雜湊的舊路徑→404→那隻貓整場退回靜態立繪；本機開發伺服器照樣正常，其他測試也照樣綠。
 * 2026-09-20 真的發生過（當時用例外補洞，09-22 挨打換新圖後把例外拿掉），這條守的是真清單。
 */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
}

/*
 * 整棵樹往下收字串（2026-09-23 稽核中-1；寫法比照 `tools/vite-asset-hash.ts` 的 `collectPaths`）。
 *
 * 舊寫法只取每個分類 `Object.values(group)` 那一層：`manifest.monsters` 的 116 筆
 * 每筆的值是 `{idle, attack, hurt, block}` 這種物件，不是字串路徑，一條都沒比對到；
 * `review`（陣列）被 `!Array.isArray(group)` 直接排掉。跟打包外掛的 `swapPaths`／`collectPaths`
 * 一樣整棵樹往下找，才是真的守到「哪張圖被清單分類用了」。
 */
function collectPaths(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectPaths);
  if (node && typeof node === 'object') return Object.values(node as Record<string, unknown>).flatMap(collectPaths);
  return [];
}

it('動作圖沒有一張同時登記在清單分類裡（登記了就進不了 files 表，線上 404）', () => {
  const motion = new Set(walk('public/assets/motion').map((p) => relative('public', p).replace(/\\/g, '/')));
  expect(motion.size).toBeGreaterThan(100);
  const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Record<string, unknown>;
  const listed = collectPaths(manifest);
  expect(listed.length).toBeGreaterThan(1000);
  expect(listed.filter((p) => motion.has(p))).toEqual([]);
});
