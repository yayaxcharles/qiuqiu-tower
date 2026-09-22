import { afterAll, beforeAll, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { assetHash } from '../../tools/vite-asset-hash';
import { _setManifestForTest, artUrl, fileUrl, type Manifest } from '../../src/ui/assets';
import { HIT_RECOIL_MOTIONS } from '../../src/ui/hit-recoil-motion';

/*
 * 挨打那張圖打包後要載得到（2026-09-22 換成新畫風）。
 *
 * 新圖放在 `assets/motion/<角色>/hit_recoil.webp`，跟其他逐格動作一樣走 `fileUrl()`，
 * 打包改名後靠清單的 `files` 平表找回來；舊挨打立繪 `hero/<代號>_hit` 留給 `?motion=0` 的舊版演出，
 * 照舊走清單的 sprites 分類。兩條路都要通，缺一條就是線上灰剪影或破圖。
 */
const root = mkdtempSync(join(tmpdir(), 'qiuqiu-hashed-hits-'));
const outDir = join(root, 'dist');
const LEGACY_KEYS = ['ninja', 'feifei', 'dangdang', 'fengfeng'].map((key) => `hero/${key}_hit`);
let builtManifest: Manifest;

function copyIn(relative: string): void {
  mkdirSync(dirname(join(outDir, relative)), { recursive: true });
  copyFileSync(resolve('public', relative), join(outDir, relative));
}

beforeAll(() => {
  for (const motion of Object.values(HIT_RECOIL_MOTIONS)) copyIn(motion.texture);
  const sprites: Record<string, string> = {};
  for (const key of LEGACY_KEYS) {
    sprites[key] = `assets/sprites/${key}.webp`;
    copyIn(sprites[key]!);
  }
  writeFileSync(join(outDir, 'assets/manifest.json'), JSON.stringify({
    cards: {}, sprites, monsters: {}, icons: {}, bg: {}, review: [],
  }));
  const plugin = assetHash() as unknown as {
    configResolved(config: { root: string; build: { outDir: string } }): void;
    closeBundle(): void;
  };
  plugin.configResolved({ root, build: { outDir: 'dist' } });
  plugin.closeBundle();
  builtManifest = JSON.parse(readFileSync(join(outDir, 'assets/manifest.json'), 'utf8')) as Manifest;
  _setManifestForTest(builtManifest);
});

afterAll(() => {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes('qiuqiu-hashed-hits-')) {
    throw new Error('測試暫存目錄不在預期範圍');
  }
  rmSync(root, { recursive: true, force: true });
});

function expectWebp(relative: string): void {
  const published = readFileSync(join(outDir, relative));
  expect(new TextDecoder().decode(published.subarray(0, 4))).toBe('RIFF');
  expect(new TextDecoder().decode(published.subarray(8, 12))).toBe('WEBP');
}

it.each(Object.entries(HIT_RECOIL_MOTIONS))('%s 的新畫風挨打圖打包後由動作路徑載得到', (hero, motion) => {
  expect(motion.texture).toBe(`assets/motion/${hero}/hit_recoil.webp`);
  const hashed = builtManifest.files?.[motion.texture];
  expect(hashed).toBeDefined();
  expect(hashed).not.toBe(motion.texture);
  expect(fileUrl(motion.texture)).toBe(`/${hashed}`);
  expect(existsSync(join(outDir, motion.texture))).toBe(false);
  expectWebp(hashed!);
});

it.each(LEGACY_KEYS)('舊挨打立繪 %s 仍由清單載得到（舊版演出的退路）', (key) => {
  const hashed = builtManifest.sprites[key];
  expect(hashed).toMatch(new RegExp(`^assets/sprites/${key}-[\\w-]{8}\\.webp$`));
  expect(artUrl('sprites', key)).toBe(`/${hashed}`);
  expectWebp(hashed!);
});
