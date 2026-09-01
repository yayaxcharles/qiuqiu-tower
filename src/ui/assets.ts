export interface Manifest {
  cards: Record<string, string>;
  sprites: Record<string, string>;
  monsters: Record<string, { idle?: string; attack?: string }>;
  icons: Record<string, string>;
  bg: Record<string, string>;
  review: string[];
}

let manifest: Manifest = { cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] };

export const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

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

/**
 * 開場之後在背景把圖全部先載好、先解好。
 *
 * 沒有這一段的話，每張圖都是**畫面要用到的當下**才去下載＋解碼——
 * 第一次進戰鬥，整張戰鬥背景（1280x720）、魔物立繪、球球的七個姿勢
 * 全部同時在你眼前現載，畫面就頓一下。這是「好多很卡」很大一部分的來源。
 *
 * 為什麼要 `decode()` 不只是 `new Image().src`：光設 src 只是**下載**，
 * 解碼還是留到畫的那一刻才做，該頓的還是會頓。`decode()` 會把解碼也一起做完。
 *
 * 順序照「多快會用到」排：立繪與圖示馬上要，牌面進戰鬥要，背景最重但可以晚一點。
 * 一次六張：太多會跟畫面搶頻寬，反而開場更慢。
 */
export async function preloadArt(): Promise<void> {
  const order: (keyof Manifest)[] = ['sprites', 'icons', 'cards', 'bg'];
  const urls: string[] = [];
  for (const g of order) {
    const group = manifest[g];
    if (!group || Array.isArray(group)) continue;
    for (const v of Object.values(group)) {
      if (typeof v === 'string') urls.push(`${BASE}${v}`);
      else if (v) for (const one of Object.values(v)) if (one) urls.push(`${BASE}${one}`);
    }
  }

  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < urls.length; i = next++) {
      const url = urls[i];
      if (!url) continue;
      try {
        const img = new Image();
        img.src = url;
        // decode() 在有些瀏覽器對還沒進 DOM 的圖會丟例外，那就退回只等下載完成
        if (typeof img.decode === 'function') await img.decode();
      } catch { /* 少載一張只是那張會晚一點出現，不該讓預載整串停掉 */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

export function computeScale(w: number, h: number): number { return Math.min(w / 1280, h / 720); }
