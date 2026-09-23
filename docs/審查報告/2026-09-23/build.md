# 爪破魔塔連線版 建置／測試／部署稽核（1902d32，範圍 c625d72..HEAD）

稽核日期 2026-09-23。全程唯讀：倉庫裡只跑了 `npx tsc --noEmit -p .`（過）；模擬雲端的動作都在暫存區 `tmp_build\` 做。

## 怎麼模擬雲端

- 用 `git -c core.autocrlf=false archive HEAD` 取出一份**換行是 LF、只含已進版控檔案**的副本（跟雲端取出來的一樣）。
- 套件資料夾只連結鎖檔裡有的套件，排除了本機多裝、鎖檔裡沒有的 8 個（`@types/node`、`@types/ws`、`@types/whatwg-mimetype`、`undici-types`、`happy-dom`、`whatwg-mimetype`、`entities`、`buffer-image-size`）。型別檢查另外開了 `preserveSymlinks`，讓它不能沿著連結跑回倉庫去撿 `@types/node`。另外放了一支用到 `Buffer` 和 `statSync` 的探測檔，確認這樣真的會報錯，模擬才算數。
- 結果：型別檢查過；**全套測試 277 個檔通過、5 個跳過（全是要設環境變數才跑的傾印工具）**；打包成功，主程式檔名 `main-cXlO5oza.js`，**跟推送閘門紀錄的那一份一模一樣**，網址路徑是 `/qiuqiu-tower-coop/`。所以「本機 CRLF 對雲端 LF」「本機套件對鎖檔套件」兩邊現在的結果一致。

## 問題清單（高 → 低）

**高：沒有。**

### 中-1　動作圖守門測試只看清單第一層，`monsters` 整個分類沒守到（測試假綠）
- 位置：`tests/ui/motion_manifest_guard.test.ts:20-22`
- 狀況：`listed` 只取每個分類 `Object.values(group)` 那一層的值。可是 `manifest.monsters` 的 116 筆，每筆的值都是 `{idle, attack, hurt, block}` 這種物件，不是字串路徑，所以整個魔物分類一條都沒比對到；`review`（陣列）也被略過。打包外掛 `swapPaths` 卻是整棵樹往下找，碰到路徑就算「已用」，那張圖就不會進 `files` 表。
- 觸發情境：哪天把 `assets/motion/enemies/*.webp` 或某張動作圖登記進 `monsters.<某魔物>.hurt` 這類欄位，`fileUrl()` 在線上會去抓沒有雜湊碼的舊檔名，結果 404，魔物退回靜態圖。這支守門測試照樣會過，本機開發伺服器也正常，正好是它檔頭說要擋的那種狀況。
- 目前實況：沒有壞。我拿程式裡引用到的 138 個素材路徑，對打包後的 `dist/assets/manifest.json` 逐一查過，全都找得到。
- 信心：確認（讀程式碼加上清單結構）。修法方向：`listed` 改成整棵樹往下收字串，寫法比照 `vite-asset-hash.ts` 的 `collectPaths`。

### 中-2　推送閘門借用本機整個套件資料夾，擋不住雷 1、雷 2（閘門放行、雲端才紅）
- 位置：`tools/prepush_gate.sh:66`（用 junction 連結 `$top/node_modules`）、`:70`（在那份上跑測試）
- 狀況：本機套件資料夾裡有 8 個鎖檔裡沒有的套件，其中包含 `@types/node` 和 `happy-dom`。閘門跑的型別檢查和測試會撿到它們，所以「測試或工具用到的 `node:` 函式忘了寫進宣告檔」「測試偷用 happy-dom」這兩種錯，閘門都是綠的，要到雲端 `npm ci` 之後才紅。整個倉庫也沒有任何測試去比對 `node:` 匯入跟宣告檔（只找到 `potionask.test.ts` 的註解提到 happy-dom）。這支腳本 c625d72 之後沒改過，屬於結構性缺口，不是這次新埋的。
- 觸發情境：下一支新測試寫 `import { statSync } from 'node:fs'`。本機和閘門都綠，推上去 GitHub Actions 的 `npm run build`（`tsc --noEmit`）就紅，線上停在舊版（09-16、09-20 兩次就是這樣）。
- 目前實況：沒有壞，模擬雲端的型別檢查是過的。
- 信心：確認。

### 低-1　首載預算已用到 97%，閘門和雲端都不檢查
- 位置：`tools/check_size.py:80`
- 在暫存區實際打包後跑的結果：首載程式 661.7 / 680 KB（97.3%）、樣式 108.2 / 120 KB（90.2%）、圖片 10.21 / 10.6 MB（96.3%）、首載總計 10.98 / 11.3 MB（97.2%），結論「大小 OK」。
- 附註：派工單寫的程式上限 580 KB 是 09-16 的數字；09-17 噹噹的文字進來之後，上限已經改成 680 KB（檔頭有寫原因）。
- 五個 `*-motion-data.json` 都只被 `companion-motion.ts`、`qiuqiu-motion.ts`、`enemy-motion.ts`、`hit-recoil-motion.ts` 匯入，打包後落在按需載入的程式塊（`companion-motion-*.js` 71.8 KB、`qiuqiu-motion-*.js` 35.2 KB）裡，**沒有進首載**。`index.html` 預先載入的只有 main、assets、audio、app 四塊。
- 風險：`check_size.py` 沒接進閘門，也沒接進 `deploy.yml`。下一批圖或文字進來超標時，不會有任何東西擋下來。信心：確認。

### 低-2　`tools/*.test.ts` 不在 tsconfig 的檢查範圍裡，型別錯誤永遠不會被抓到
- 位置：`tsconfig.json` 的 `include` 只收了 `tools/node-build.d.ts` 和 `tools/vite-asset-hash.ts`
- 例子：`tools/assets_nonempty.test.ts`、`tools/feifei_stills.test.ts`、`tools/hero_text_scan.test.ts` 都用了 `statSync`，宣告檔裡沒有；`tools/haze.test.ts` 用的 `node:child_process` 也沒有宣告。vitest 執行時不檢查型別，所以不會紅，也不影響部署；只是這些測試的型別錯誤沒有人會發現。信心：確認。

## 逐項檢查結果（沒有問題的也列出來）

1. **`node:` 匯入對宣告檔**：`tsc` 檢查得到的範圍是 `src`、`tests`、`vite.config.ts`、`tools/vite-asset-hash.ts`。用到的名稱全部都有宣告：
   - `node:fs`：readFileSync、existsSync、copyFileSync、mkdtempSync、rmSync、readdirSync（`tests/ui/node-fs.d.ts`）；mkdirSync、writeFileSync、renameSync、readdirSync 帶 isFile（`tools/node-build.d.ts`）
   - `node:crypto`：createHash
   - `node:os`：tmpdir
   - `node:path`：dirname、relative、join、resolve、extname
   
   雲端模擬的型別檢查通過。
2. **happy-dom／jsdom**：`src`、`tests`、`tools` 都沒有匯入，也沒有 vitest 設定檔去指定畫面環境。雲端模擬的套件裡沒有 happy-dom，全套照樣綠。
3. **CRLF／LF**：LF 副本跑全套是綠的，閘門在 CRLF 工作目錄跑也是綠的（紀錄 `qiuqiu_gate_last` 就是 1902d32），兩邊打出來的主程式檔名也一樣。09-20 之後新加、會讀原始碼的測試（`projectiles`、`review_fixes_0922`、`walk_first_frame_0922`、`fengfeng_noncombat`、`combat_bubbles_and_marks` 等）都先做了 `.replace(/\r\n/g,'\n')`。`.gitattributes` 也把 `*.sh` 釘成 LF。
4. **動作圖守門**：`walk('public/assets/motion')` 有掃到 09-22 新加的 `projectile/` 15 張和 `qiuqiu/shuriken_128.webp`；`potion-motion.ts` 本身沒有圖檔。缺口見中-1。
5. **首載**：見低-1。
6. **網址路徑與存檔前綴**：`deploy.sh`、`prepush_gate.sh`、`.gitattributes` 在 c625d72 之後都沒改；`vite.config.ts` 只多接了素材雜湊外掛，`SITE_NAME` 邏輯沒變。打包後的程式裡是 `/qiuqiu-tower-coop/`，沒有出現 `Program Files`。`save.ts` 的前綴仍然從 `BASE_URL` 來（這次只改了武士存檔的轉換）。素材雜湊外掛不動 `main-*.js`，`deploy.sh` 第三步對得起來。
7. **新測試會不會真的紅**：
   - `projectiles.test.ts`：把 combat.ts 真正的函式挖出來跑，並驗圖檔存在、大小、飛行時點，有效。
   - `motion_asset_build.test.ts`：真的跑外掛驗 `files` 表和雜湊檔名，有效；但用的是假清單，不守真清單的衝突（那是守門測試的工作，見中-1）。
   - `walk_first_frame_0922.test.ts`：比對雜湊碼、圖集、比例、落腳點與樣式，有效。
   - `review_fixes_0922.test.ts`：把 `speak` 挖出來執行，有效。
   - `motion_manifest_guard.test.ts`：部分假綠（中-1）。
8. **版控對照**：
   - `git ls-files -ci --exclude-standard` 是空的：沒有已進版控、卻被 `.gitignore` 蓋住的檔。
   - `public/` 底下沒有未追蹤的檔。
   - 程式裡寫死的 138 個素材路徑全部都在版控裡；打包後也都查得到（`files` 表或原路徑）。
   - 新忽略的 `tools/motion-art-source/*/**/*.png` 沒有被任何測試引用；LF 副本只含版控檔，全套照樣綠，這一點也坐實了。

## 已知、沒有再報
沒有 favicon、`auto_play.js` 不認 `bossdoor`、未追蹤的 `tools/pack_*.py` 與 `docs/第四隻角色_*_提案/`、全套測試會重寫 `docs/牌池總表.json` 與 `docs/怪物工作檯.json`。
