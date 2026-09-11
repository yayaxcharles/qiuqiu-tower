/**
 * 連線碼：把 WebRTC 的連線資訊壓成一串可以用 LINE 傳的字。
 *
 * WebRTC 要連上之前，兩邊得先交換一段叫 SDP 的描述（誰在哪個網路位置、
 * 支援哪些格式）。正常做法是架一台伺服器幫忙轉交，但那就不是純靜態網頁了。
 * **手動貼代碼**＝把那段描述壓成一串字，玩家自己用 LINE 傳給對方。
 * 零伺服器、零費用，代價是開局要來回貼兩次。
 *
 * 為什麼要壓：原始的 SDP 有一兩千字，貼進聊天室會被斷行、被吃掉空白。
 * 壓過之後只剩幾百字，而且只有 A-Z、0-9 這些字元，貼到哪裡都不會壞。
 */

/** 這一版的連線碼格式。兩邊版本不同就直接拒收，不要試著硬連 */
const VERSION = 'Q1';

/**
 * 用 Base64（網址安全版）＋原生的壓縮把 SDP 變短。
 *
 * `CompressionStream` 是瀏覽器內建的（Chrome 80+、Safari 16.4+、Firefox 113+），
 * 不用多載一個壓縮函式庫進來——首載預算本來就很緊。
 */
/**
 * 寫進壓縮流再讀出來。
 *
 * **寫入與關閉的 promise 一定要接住**：資料壞掉的時候（貼到一半的連線碼）
 * 它們會拒絕，沒接住就變成「未處理的拒絕」——本機跑得過，CI 會直接把整包測試判失敗
 * （2026-09-11 實際踩到，本機全綠、CI 紅）。
 * 真正要讓呼叫端看到的錯誤來自**讀的那一側**，所以寫入這側吞掉就好。
 */
async function pump(stream: CompressionStream | DecompressionStream, data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const w = stream.writable.getWriter();
  const fed = w.write(data).then(() => w.close()).catch(() => { /* 讀的那側會丟出真正的錯 */ });
  const out = await new Response(stream.readable).arrayBuffer();
  await fed;
  return out;
}

async function deflate(s: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await pump(new CompressionStream('deflate-raw'), new TextEncoder().encode(s)));
}

async function inflate(b: Uint8Array<ArrayBuffer>): Promise<string> {
  return new TextDecoder().decode(await pump(new DecompressionStream('deflate-raw'), b));
}

/** 位元組轉成網址安全的 Base64（去掉 `+/=`，貼到哪裡都不會被改掉） */
export function bytesToCode(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function codeToBytes(code: string): Uint8Array<ArrayBuffer> {
  const s = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

/** 把一段 SDP 壓成連線碼。回傳的字串只含 A-Z a-z 0-9 - _ 與一個冒號 */
export async function packSignal(kind: 'offer' | 'answer', sdp: string): Promise<string> {
  return `${VERSION}${kind === 'offer' ? 'O' : 'A'}:${bytesToCode(await deflate(sdp))}`;
}

/**
 * 把連線碼解回 SDP。**貼錯、貼到一半、版本不對都要好好拒絕**——
 * 玩家貼錯碼是常態，這裡丟出一個看不懂的例外的話，畫面上只會是「發生錯誤」。
 */
export async function unpackSignal(code: string): Promise<{ kind: 'offer' | 'answer'; sdp: string }> {
  const clean = code.trim().replace(/\s+/g, '');   // 聊天室常常會塞換行進來
  const i = clean.indexOf(':');
  if (i < 0) throw new Error('這串不像連線碼（少了冒號），請整段重貼一次');
  const head = clean.slice(0, i);
  if (!head.startsWith(VERSION)) throw new Error('連線碼的版本對不上，兩邊要用同一版的網頁');
  const kind = head.slice(VERSION.length);
  if (kind !== 'O' && kind !== 'A') throw new Error('這串不像連線碼，請整段重貼一次');
  let sdp: string;
  try {
    sdp = await inflate(codeToBytes(clean.slice(i + 1)));
  } catch {
    throw new Error('連線碼壞掉了（可能貼到一半），請請對方重傳一次');
  }
  if (!sdp.startsWith('v=')) throw new Error('連線碼的內容不對，請請對方重傳一次');
  return { kind: kind === 'O' ? 'offer' : 'answer', sdp };
}
