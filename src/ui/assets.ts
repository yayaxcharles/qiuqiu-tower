export interface Manifest {
  cards: Record<string, string>;
  sprites: Record<string, string>;
  monsters: Record<string, { idle?: string; attack?: string }>;
  icons: Record<string, string>;
  bg: Record<string, string>;
  review: string[];
}

let manifest: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };

const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 缺圖時的灰色剪影：清單還沒生好也不會出現破圖 */
const SILHOUETTE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="55" r="35" fill="#555"/><circle cx="30" cy="25" r="12" fill="#555"/><circle cx="70" cy="25" r="12" fill="#555"/></svg>');

export async function loadManifest(): Promise<void> {
  // 清單讀不到就整組退回剪影，不能讓遊戲開不起來
  try {
    const res = await fetch(`${BASE}assets/manifest.json`);
    if (res.ok) manifest = { ...manifest, ...(await res.json() as Partial<Manifest>) };
  } catch { /* 離線或檔案不在，忽略 */ }
}

export function _setManifestForTest(m: Manifest): void { manifest = m; }

export function artUrl(group: 'cards' | 'sprites' | 'icons' | 'bg', key: string): string {
  const rel = manifest[group][key];
  return rel ? `${BASE}${rel}` : SILHOUETTE;
}

export function monsterUrl(artKey: string, pose: 'idle' | 'attack'): string {
  const m = manifest.monsters[artKey];
  const rel = m?.[pose] ?? m?.idle;
  return rel ? `${BASE}${rel}` : SILHOUETTE;
}

export function computeScale(w: number, h: number): number { return Math.min(w / 1280, h / 720); }
