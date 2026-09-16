import { defineConfig } from 'vite';
import { assetHash } from './tools/vite-asset-hash.ts';

/*
 * 打包編號（見 `src/net/code.ts`）。**要跟著提交走，不能用當下的時間**：
 * `tools/deploy.sh` 靠「推送閘門在本機打出來的主程式檔名跟雲端打出來的一樣」確認線上換版了；
 * 用時間的話兩邊的內容不同、檔名一定對不上（2026-09-14 實際踩到，部署第三步報錯）。
 * 雲端的 Actions 自帶 GITHUB_SHA；推送閘門自己帶 BUILD_TAG（同一筆提交）；本機隨手打包兩個都沒有，才退回時間。
 * 這個專案的 tsconfig 沒有 node 的型別，所以只在這裡宣告用得到的那一小塊。
 */
declare const process: { env: Record<string, string | undefined> };
const BUILD_TAG = (process.env['GITHUB_SHA'] ?? process.env['BUILD_TAG'] ?? Date.now().toString(36)).slice(0, 10).toLowerCase();
// 傳的是倉庫名不是路徑：Git Bash 會把「/qiuqiu-tower/」這種看起來像路徑的環境變數換成 Windows 路徑
//（實測變成 /Program Files/Git/qiuqiu-tower/），推送閘門在 Git Bash 裡跑，所以不能帶斜線
const SITE_NAME = process.env['SITE_NAME']
  ?? (/\/qiuqiu-tower-coop$/.test(process.env['GITHUB_REPOSITORY'] ?? '') ? 'qiuqiu-tower-coop' : 'qiuqiu-tower');
const SITE_BASE = `/${SITE_NAME.replace(/^\/+|\/+$/g, '')}/`;

export default defineConfig({
  /*
   * 打包時把素材檔名改成「原名－內容雜湊碼」（見 `tools/vite-asset-hash.ts` 的檔頭）。
   * GitHub Pages 一律回十分鐘的快取又改不了，固定檔名換了內容會讓回鍋的玩家吃到舊圖。
   * 只動 `dist/`，`public/` 的原始檔名一個都不改（生圖工具全靠那些檔名）。
   */
  plugins: [assetHash()],
  /**
   * **連線版放在另一個網址**（使用者 2026-09-11：「連線版畢竟改動非常大，我怕把原本的
   * 也改壞。看要不要先更名或放另一個網址，等確認 OK 了再替換」）。
   *
   * 部署到倉庫 `qiuqiu-tower-coop`，所以路徑是 `/qiuqiu-tower-coop/`。
   * 原本的單機版 `/qiuqiu-tower/` 一動都不動。
   *
   * ⚠️ **存檔不會因為路徑不同就自動分開**：瀏覽器的儲存是按**網域**分的，
   * 兩個網址同網域＝共用同一份儲存。存檔的隔離是靠 `save.ts` 裡另一組鍵前綴
   * 做的（見那邊的說明），不是靠這一行。
   *
   * **照部署的倉庫自動決定**（2026-09-14 併回前，使用者裁定「各自保住存檔」）：一份程式碼、兩個網站。
   * 雲端 Actions 帶 `GITHUB_REPOSITORY`（`yayaxcharles/qiuqiu-tower-coop` 或 `yayaxcharles/qiuqiu-tower`）；
   * 推送閘門照要推的遠端帶 `SITE_NAME`（跟雲端打出同一份主程式，`deploy.sh` 第三步才對得上）；
   * 本機隨手打包兩個都沒有，退回單機版的路徑。存檔前綴也跟著這條路徑走（`src/engine/save.ts`）。
   */
  base: SITE_BASE,
  /*
   * 這一次打包的編號（2026-09-14）。連線碼開頭會夾著它：開房的人拿到新版、加入的人還開著舊分頁時，
   * 兩台跑的引擎不同，連上之後走第一格就對帳失敗。貼碼的當下比對它，直接請兩邊重新整理。見 `src/net/code.ts`。
   */
  define: {
    __BUILD_TAG__: JSON.stringify(BUILD_TAG),
    // 房號中繼的網址（`src/net/ws.ts`）：平常用寫死的正式站，本機要對著自己跑的 `wrangler dev` 測時用環境變數蓋掉
    __RELAY_URL__: JSON.stringify(process.env['RELAY_URL'] ?? ''),
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      // 兩個獨立的進入點。相對路徑寫法，不用 node:path——
      // 這個專案的 tsconfig 沒有 node 的型別（`types: []`），加進來只為了兩行路徑不划算
      input: {
        main: './index.html',
        // 連線測試頁：只確認兩台機器的瀏覽器連不連得起來，不含遊戲內容。
        // **不會被主程式載到**（各自是獨立的進入點），所以不吃首載預算
        nettest: './nettest.html',
      },
    },
  },
});
