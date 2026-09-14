import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

/**
 * 清單裡不可以留「中途檔」（2026-09-13 總覽稽核抓到 5 筆）。
 *
 * 生圖是一批一批來的，同一個場景常常會生第二版比對：`..._v2`、`..._v2_normalized`、
 * `..._draft`，還有去背前的 `..._chromakey`。比完之後**選中的那張會改回正式檔名**，
 * 沒選中的就該離場。問題是進倉腳本是照檔名收的——它不知道哪張是正式的，
 * 於是兩張都收、兩張都寫進 `manifest.json`。
 *
 * 這件事是**靜音**的：程式裡的鍵是 `bg/event_feifei_stuck_kitten`，
 * 沒有一行會去讀 `..._stuck_kitten_v2`，所以畫面完全正常、測試全綠，
 * 只是每個玩家都多下載了幾張永遠不會出現的圖。人眼也看不出來——
 * 要把 66 張拼成一張大圖、一個一個念檔名，才會發現有兩張長得很像。
 *
 * 這一條同時擋兩種：清單裡有中途檔（多載）、清單裡的檔案不存在（少圖）。
 */
const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8')) as Record<
  string, unknown
>;

/**
 * 中途檔的命名特徵。`.previous-` 是「重生前先改名留底」那條規則留下的備份。
 *
 * 這份名單**只認得已經用過的命名**，換個習慣（`_alt`、`_try3`）就會漏——
 * 所以它是防呆不是保證，真正抓走鐘還是要靠總覽拼圖。新增命名時記得補進來。
 *
 * **不可以加 `_b$`／`_c$`**：`bg/low_b`、`bg/screen_rest_b` 那批是正式的畫面背景變體
 *（`src/ui/screenbg.ts` 按關數挑），加進來會誤殺 12 筆。
 */
const SCRATCH = /_v\d+$|_v\d+_|_normalized|_draft|_chromakey|_alt\d*$|_try\d*$|_final$|\.previous-|\.before\d/;

/** 把清單攤平成「鍵 → 檔案路徑」，不管它巢狀幾層。 */
function flatten(node: unknown, path: string[] = [], out: [string, string][] = []): [string, string][] {
  if (typeof node === 'string') out.push([path.join('/'), node]);
  else if (Array.isArray(node)) node.forEach((v, i) => flatten(v, [...path, String(i)], out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) flatten(v, [...path, k], out);
  }
  return out;
}

const entries = flatten(manifest);

describe('素材清單的衛生', () => {
  it('清單裡沒有生圖的中途檔', () => {
    const bad = entries
      .filter(([k, v]) => SCRATCH.test(k) || SCRATCH.test(v))
      .map(([k, v]) => `${k} → ${v}`);
    expect(bad, `這幾筆是比稿用的中途檔，選完要移出 public/：\n${bad.join('\n')}`).toEqual([]);
  });

  /*
   * **清單裡的事件插圖，都要有人真的會去要**（2026-09-13 稽核 中-7）。
   *
   * 上面那條是黑名單（看檔名像不像中途檔），它抓不到「名字很正常但沒人用」的孤兒。
   * 實際就有一張：`bg/event_feifei_robin_candidate`，53 KB，`src/` 裡一次都沒出現，
   * 卻因為 `preloadArt` 會走遍 manifest 每個 bg 鍵，**每位玩家每次首載都下載它**。
   *
   * 這條改成正面表列：事件插圖的鍵只會從 `eventArtKey(<事件編號>)` 出來，
   * 而事件編號來自 `events.ts`（事件本身）與各選項的 `resultArt`，
   * 加上幾個畫面自己寫的（紙箱三態）。列得出來的才算數，其餘就是孤兒。
   * 這種判準連 `_alt`、`_try3`、任何沒見過的命名都擋得住，也不用維護名單。
   */
  it('事件插圖沒有沒人用的孤兒', async () => {
    const { events } = await import('../src/content/events');
    const ids = new Set<string>();
    for (const ev of events) {
      ids.add(ev.id);
      for (const c of ev.choices) if (c.resultArt) ids.add(c.resultArt);
    }
    // 畫面自己組的：紙箱那三態不是事件，是 `chest.ts` 直接叫 `eventArtKey` 的
    for (const k of ['chest_closed', 'chest_open', 'chest_empty']) ids.add(k);

    const orphan = Object.keys(manifest)
      .filter((k) => k === 'bg')
      .flatMap(() => Object.keys((manifest as { bg: Record<string, string> }).bg))
      .filter((k) => k.startsWith('bg/event_'))
      .filter((k) => {
        // 兩種都要試：一般事件的她版是 `event_feifei_<編號>`（前綴要剝掉），
        // 但**她的專屬事件本身就叫 `feifei_trace`**，那個 `feifei_` 是編號的一部分，
        // 剝掉就查不到了（第一版就這樣誤報了 8 張）。
        const raw = k.replace(/^bg\/event_/, '');
        return !ids.has(raw) && !ids.has(raw.replace(/^feifei_/, ''));
      });
    expect(orphan, `這幾張沒人會去要，卻每次首載都被下載：\n${orphan.join('\n')}`).toEqual([]);
  });

  it('清單列到的檔案都真的在', () => {
    const missing = entries
      .filter(([, v]) => typeof v === 'string' && v.includes('/') && !existsSync(`public/${v}`))
      .map(([k, v]) => `${k} → public/${v}`);
    expect(missing, `清單指到不存在的檔案：\n${missing.join('\n')}`).toEqual([]);
  });
});
