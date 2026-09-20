import { afterAll, beforeAll, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { assetHash } from '../../tools/vite-asset-hash';
import { _setManifestForTest, fileUrl, type Manifest } from '../../src/ui/assets';
import { LEGACY_HIT_MOTIONS } from '../../src/ui/legacy-hit-motion';

const root = mkdtempSync(join(tmpdir(), 'qiuqiu-hashed-hits-'));
const outDir = join(root, 'dist');
let builtManifest: Manifest;

beforeAll(() => {
  const sprites: Record<string, string> = {};
  for (const motion of Object.values(LEGACY_HIT_MOTIONS)) {
    const relative = motion.texture;
    mkdirSync(dirname(join(outDir, relative)), { recursive: true });
    copyFileSync(resolve('public', relative), join(outDir, relative));
    sprites[relative.replace('assets/sprites/', '').replace('.webp', '')] = relative;
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

it.each(Object.entries(LEGACY_HIT_MOTIONS))('%s 的受擊圖打包後可同時由立繪鍵及動作路徑載入', (_hero, motion) => {
  const spriteKey = motion.texture.replace('assets/sprites/', '').replace('.webp', '');
  const hashed = builtManifest.sprites[spriteKey];
  expect(hashed).not.toBe(motion.texture);
  expect(fileUrl(motion.texture)).toBe(`/${hashed}`);
  expect(existsSync(join(outDir, motion.texture))).toBe(false);
  const published = readFileSync(join(outDir, hashed!));
  expect(new TextDecoder().decode(published.subarray(0, 4))).toBe('RIFF');
  expect(new TextDecoder().decode(published.subarray(8, 12))).toBe('WEBP');
});
