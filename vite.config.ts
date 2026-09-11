import { defineConfig } from 'vite';

export default defineConfig({
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
   * 確認連線版可以之後要替換回去時，這一行改回 `/qiuqiu-tower/` 就好。
   */
  base: '/qiuqiu-tower-coop/',
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
