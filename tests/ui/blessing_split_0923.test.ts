import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import MAIN_RAW from '../../src/main.ts?raw';
import APP_RAW from '../../src/ui/app.ts?raw';
import LOBBY_RAW from '../../src/ui/screens/lobby.ts?raw';
import PRELOAD_RAW from '../../src/ui/preload.ts?raw';
import { _setManifestForTest, heroArtUrls, isItemIcon, itemIconUrls } from '../../src/ui/assets';
import { NON_EVENT_ART, deferredBgKeys } from '../../src/ui/bgacts';
import { BLESSINGS } from '../../src/content/blessings';

/*
 * 開局祝福的畫面與文字**不在首載**、圖**用到才下載**（2026-09-23 第三批，設計稿 2-1「首載」）。
 * 做法跟事件文字分包（`event_text_split.test.ts`）同一套：照原始碼把主程式的靜態匯入走一遍，碰到就紅。
 * 另外守兩個時機：包袱要在連線動作到得了之前就摸好（大廳開局那一拍）、序章播完先進祝福畫面。
 */
const norm = (s: string): string => s.replace(/\r\n/g, '\n');
const MAIN = norm(MAIN_RAW); const APP = norm(APP_RAW); const LOBBY = norm(LOBBY_RAW); const PRELOAD = norm(PRELOAD_RAW);

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  if (/\.(css|json)(\?|$)|\?raw$/.test(spec)) return null;
  const parts = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  const base = parts.join('/');
  for (const cand of [base, `${base}.ts`, `${base}/index.ts`]) if (/\.ts$/.test(cand) && existsSync(cand)) return cand;
  throw new Error(`${from} 匯入的 ${spec} 找不到檔案`);
}
function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = norm(readFileSync(file, 'utf-8'));
    const specs = [
      ...[...src.matchAll(/^(?:import|export)\s+(?!type\s)[^'"`;]*?\sfrom\s+'([^']+)'/gms)].map((m) => m[1]!),
      ...[...src.matchAll(/^import\s+'([^']+)'/gm)].map((m) => m[1]!),
    ];
    for (const s of specs) { const next = resolve(file, s); if (next) todo.push(next); }
  }
  return seen;
}

afterEach(() => _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] }));

describe('祝福畫面與文字不在首載', () => {
  const graph = staticGraph('src/main.ts');
  it('主程式的靜態匯入碰不到祝福畫面與祝福文字（規則那一份在首載，引擎要用）', () => {
    expect(graph.has('src/ui/app.ts'), '走法本身沒壞').toBe(true);
    expect(graph.has('src/content/blessings.ts'), '規則表：引擎與連線動作要用').toBe(true);
    expect(graph.has('src/ui/screens/blessing.ts'), '祝福畫面被靜態匯入了').toBe(false);
    expect(graph.has('src/content/blessing-text.ts'), '有首載的模組靜態匯入了祝福文字').toBe(false);
  });
  it('祝福畫面登記成延後載入，序章時的背景預抓載的是同一個模組', () => {
    expect(MAIN).toContain("registerLazyScreen('blessing', () => import('./ui/screens/blessing'), ");
    expect(PRELOAD).toContain("export const loadBlessingScreen = (): Promise<unknown> => import('./screens/blessing');");
    expect(MAIN).not.toMatch(/^import '\.\/ui\/screens\/blessing';/m);
  });
});

describe('祝福的圖用到才下載', () => {
  it('物品圖示算「進入一局才補」的那一類（開場的 preloadArt 跳過、adoptRun 時補）', () => {
    for (const b of BLESSINGS) expect(isItemIcon(b.art), b.art).toBe(true);
    expect(isItemIcon('icon/onigiri_full'), '介面圖示照舊開場就要').toBe(false);
    _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, bg: {}, review: [], icons: { 'codex/bless_dice': 'assets/icons/bless_dice.webp', 'icon/x': 'assets/icons/x.webp' } });
    expect(itemIconUrls().some((u) => u.endsWith('bless_dice.webp'))).toBe(true);
    expect(itemIconUrls().some((u) => u.endsWith('/x.webp'))).toBe(false);
  });
  it('祝福主圖開場不載（球球那張在延後名單、另外三隻的版本選角時也不補），序章時由 warmBlessing 抓', () => {
    expect(NON_EVENT_ART).toContain('bless_bundle');
    expect(deferredBgKeys().has('bg/event_bless_bundle')).toBe(true);
    _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, icons: {}, review: [], bg: {
      'bg/event_bless_bundle': 'assets/bg/event_bless_bundle.webp', 'bg/event_feifei_bless_bundle': 'assets/bg/event_feifei_bless_bundle.webp',
      'bg/feifei_other': 'assets/bg/feifei_other.webp' } });
    const urls = heroArtUrls(['feifei']);
    expect(urls.some((u) => u.includes('bless_bundle'))).toBe(false);
    expect(urls.some((u) => u.endsWith('feifei_other.webp')), '對照組：她的其他圖照常補').toBe(true);
    expect(PRELOAD).toMatch(/export function warmBlessing[\s\S]*?eventArtKey\('bless_bundle', hero\)/);
  });
});

describe('開局的時機', () => {
  it('新的一局與連線開局都在開局那一拍摸包袱、在背景抓；序章播完走 afterPrologue', () => {
    expect(APP).toMatch(/rollBlessings\(run\);[^\n]*\n\s*this\.adoptRun\(run, 0\);\n\s*warmBlessing\(run, 0\);/);
    expect(APP).toContain('this.playPrologue(hero, () => this.afterPrologue());');
    expect(APP).toMatch(/afterPrologue\(\): void \{[\s\S]*?this\.save\(\);\n\s*this\.show\(anyBlessingPending\(run\) \? 'blessing' : 'map'\);/);
    // 續玩：選到一半重新整理的回到祝福畫面
    expect(APP).toMatch(/this\.show\(anyBlessingPending\(run\) \? 'blessing' : 'map'\);\n\s*return true;/);
  });
  it('連線：包袱在 `begin` 裡、序章之前就摸好（同伴序章點得快、先送來的祝福動作才套得進去）', () => {
    const begin = LOBBY.slice(LOBBY.indexOf('const begin = '), LOBBY.indexOf('if (isHost) {'));
    const roll = begin.indexOf('rollBlessings(run);');
    expect(roll, '大廳開局要摸包袱').toBeGreaterThan(0);
    expect(roll).toBeLessThan(begin.indexOf('session.useRun(run);'));
    expect(roll).toBeLessThan(begin.indexOf('app.playPrologue('));
    expect(begin).toContain('() => app.afterPrologue()');
  });
});
