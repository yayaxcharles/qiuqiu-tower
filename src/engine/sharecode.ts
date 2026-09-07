import { checkRun } from './save';
import type { RunState } from './types';

/**
 * 局面碼：把「現在這一局的完整狀態」壓成一串可以複製貼上的文字，別人貼上就從你那個點接著打。
 *
 * 用途（使用者 2026-09-07）：三個人拿同一套牌組、秘寶、血量打同一隻王，比誰打得好。
 * 所以要的是**完整局面**，不是只有地圖種子——種子只能重現同一張地圖，牌組是各自走出來的。
 *
 * 為什麼直接壓整份存檔、不做精簡：量過四種做法，地圖一個人就佔存檔的 76%（2616／3439 字元），
 * 不存地圖能把碼從 1352 縮到 308，但第二、三關的地圖是進關當下用亂數生的，
 * 要重生成得多存「進關時的亂數狀態」，而且地圖生成還看旗標、旗標後來會變。
 * 使用者選了「最不會出錯」這條：整份壓縮、任何情況都還原得回來（2026-09-07 拍板）。
 *
 * 壓縮走瀏覽器內建的 gzip，不引任何函式庫；壓完轉成 Base64URL 才能安心貼進聊天室或網址列。
 */

/** 開頭的招牌。首頁那個欄位靠它分辨「這是局面碼」還是「這是地圖種子」 */
export const SHARE_PREFIX = 'QQT1~';

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  // Base64 的 +／ 在網址與部分聊天軟體裡會被轉義，換成 -_ ；尾巴的 = 拿掉，解碼時補回來
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return buf;   // 直接回 ArrayBuffer：Uint8Array 的 buffer 型別是 ArrayBufferLike，塞不進 Blob
}

/** 這個瀏覽器壓不壓得動。太舊的沒有 CompressionStream，呼叫端要能講人話而不是丟例外 */
export function shareSupported(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

async function pipe(data: BlobPart, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const buf = await new Response(new Blob([data]).stream().pipeThrough(stream as ReadableWritablePair)).arrayBuffer();
  return new Uint8Array(buf);
}

/** 把一局壓成局面碼。瀏覽器不支援壓縮就回 null，呼叫端自己決定怎麼講 */
export async function encodeRun(run: RunState): Promise<string | null> {
  if (!shareSupported()) return null;
  try {
    const gz = await pipe(JSON.stringify(run), new CompressionStream('gzip'));
    return SHARE_PREFIX + bytesToBase64Url(gz);
  } catch { return null; }
}

export type DecodeResult =
  | { ok: true; run: RunState }
  /** `why` 是可以直接給玩家看的一句話 */
  | { ok: false; why: string };

/**
 * 把局面碼還原成一局。
 *
 * **失敗一律只回錯誤、不動接收者自己的存檔**——別人給的碼壞掉，不該害他的進度消失，
 * 所以驗證走 `checkRun`（不碰倉庫）而不是 `loadRun`。
 */
export async function decodeRun(code: string): Promise<DecodeResult> {
  const body = code.trim();
  if (!body.startsWith(SHARE_PREFIX)) return { ok: false, why: '這不是局面碼（開頭要有 QQT1~）。' };
  if (!shareSupported()) return { ok: false, why: '這個瀏覽器不支援解壓縮，換 Chrome、Edge 或新版 Safari 再試。' };
  let json: string;
  try {
    const raw = await pipe(base64UrlToBytes(body.slice(SHARE_PREFIX.length)), new DecompressionStream('gzip'));
    json = new TextDecoder().decode(raw);
  } catch { return { ok: false, why: '這串局面碼看起來不完整，複製的時候可能少了一段。' }; }
  try {
    const run = checkRun(JSON.parse(json) as Partial<RunState>);
    // 版本或內容對不上（分享的人跟你玩的版本不同、中間改過牌表）都會落在這裡
    if (!run) return { ok: false, why: '這局的版本跟你現在的遊戲對不上，可能是分享的人用的是舊版。' };
    return { ok: true, run };
  } catch { return { ok: false, why: '這串局面碼解不開，請跟分享的人要一次完整的。' }; }
}
