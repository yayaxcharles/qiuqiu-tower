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

/*
 * **這一份網頁是哪一次打包的**（2026-09-14 審查 低-4）。
 *
 * 碼的格式一樣不代表遊戲一樣：開房的人剛重新整理拿到新版、加入的人還開著昨天的舊分頁，
 * 碼照樣解得開、連得上，可是兩台跑的是不同的引擎，走第一格就對帳失敗，畫面只寫「連線出問題」。
 * 所以把打包編號夾在碼的開頭，貼碼的當下就講清楚。
 * 編號由 `vite.config.ts` 的 `define` 填（開發伺服器、測試也有，同一次啟動就同一個）；沒填就不比。
 */
declare const __BUILD_TAG__: string;
export const BUILD: string = typeof __BUILD_TAG__ === 'string' ? __BUILD_TAG__ : '';   // 房號中繼（`ws.ts`）也拿它比版本

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

/**
 * 把一段 SDP 壓成連線碼。回傳的字串只含 A-Z a-z 0-9 - _ 與一個冒號。
 * 開頭是「格式版本＋邀請或回應＋打包編號」（`Q1O` 後面接編號），`build` 只給測試換
 */
export async function packSignal(kind: 'offer' | 'answer', sdp: string, build: string = BUILD): Promise<string> {
  return `${VERSION}${kind === 'offer' ? 'O' : 'A'}${build}:${bytesToCode(await deflate(sdp))}`;
}

/**
 * 把連線碼解回 SDP。**貼錯、貼到一半、版本不對都要好好拒絕**——
 * 玩家貼錯碼是常態，這裡丟出一個看不懂的例外的話，畫面上只會是「發生錯誤」。
 */
export async function unpackSignal(code: string, build: string = BUILD): Promise<{ kind: 'offer' | 'answer'; sdp: string }> {
  const clean = code.trim().replace(/\s+/g, '');   // 聊天室常常會塞換行進來
  const i = clean.indexOf(':');
  if (i < 0) throw new Error('這串不像連線碼（少了冒號），請整段重貼一次');
  const head = clean.slice(0, i);
  if (!head.startsWith(VERSION)) throw new Error('連線碼的版本對不上，兩邊要用同一版的網頁');
  const kind = head.charAt(VERSION.length);
  if (kind !== 'O' && kind !== 'A') throw new Error('這串不像連線碼，請整段重貼一次');
  // 我這邊有打包編號，對方的就要一模一樣；沒帶編號的是這次改版之前的舊頁面，一樣算不同版
  if (build && head.slice(VERSION.length + 1) !== build) {
    throw new Error('對方開的遊戲版本跟你不一樣（有一邊的頁面比較舊）。兩邊都重新整理頁面，再重新開房一次');
  }
  let sdp: string;
  try {
    sdp = await inflate(codeToBytes(clean.slice(i + 1)));
  } catch {
    throw new Error('連線碼壞掉了（可能貼到一半），請對方重傳一次');
  }
  if (!sdp.startsWith('v=')) throw new Error('連線碼的內容不對，請對方重傳一次');
  return { kind: kind === 'O' ? 'offer' : 'answer', sdp };
}
