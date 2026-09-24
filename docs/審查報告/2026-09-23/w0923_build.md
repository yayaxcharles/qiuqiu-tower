# build 代號｜派工單執行報告（2026-09-23）

worktree：`F:\ClaudeWork\qq-build`，分支 `w0923-build`（從 coop `1902d32` 開出）。
逐條列「改了什麼／怎麼確認會紅／沒做的與原因」，最後附提交清單。

## 中-1　動作圖守門測試改成整棵樹往下收字串

- 改：`tests/ui/motion_manifest_guard.test.ts`——新增 `collectPaths()`（遞迴收字串，寫法比照 `tools/vite-asset-hash.ts` 的 `collectPaths`），取代原本只取 `Object.values(group)` 第一層的 `listed`。
- 驗證會紅：把 `public/assets/manifest.json` 裡 `monsters["codex/monster_rat"].hurt` 暫時改成 `assets/motion/enemies/rat-attack.webp`（一張真的動作圖）。
  - 用舊版測試碼跑：**假綠**（1 passed）——坐實稽核講的「monsters 巢狀物件一條都沒比對到」。
  - 改成新版 `collectPaths` 後再跑：**真紅**（`AssertionError: expected [ "assets/motion/enemies/rat-attack.webp" ] to deeply equal []`）。
  - 改回 `rat_hurt.webp` 原值，`git status --porcelain` 確認 manifest.json 無殘留差異，測試轉綠。
- 沒做的：無。

## 中-2　推送閘門改借鎖檔套件、加靜態掃描

- 新增 `tools/build_gate_node_modules.mjs`：在暫時工作目錄裡讀那一筆提交自己的 `package-lock.json`，逐一 junction 連結鎖檔列出的套件（不重裝）。optional 套件本機裝不到就跳過，鎖檔要求但本機真的沒裝到的才判失敗。也連 `.bin` 一起借（裡面的捷徑指的都是鎖檔套件）。獨立測試過：177 個鎖檔項目中連結 80、跳過 97 個 optional，耗時 0.136 秒；`npx vitest --version` 能在只有這份 node_modules 的資料夾裡正常解析執行。
- 改：`tools/prepush_gate.sh`
  - 拿掉整份 `mklink /J` 借用本機 `node_modules`，改成 `cd "$tmp"` 後呼叫上面那支腳本。
  - `cleanup()` 改用 `node -e "require('fs').rmSync(...)"` 拆借來的連結，不再用 `cmd /c rmdir` 對單一大 junction 那套。**實測過安全性**：另開一個獨立的 junction 測試（真實目標資料夾放一個 marker 檔、container 資料夾裡放一個指向它的 junction），對 container 跑 `fs.rmSync(recursive:true, force:true)`，確認 container 消失、marker 檔內容原封不動——證實 `fs.rmSync` 對 Windows junction 只拆連結本身、不會順著連結刪掉主資料夾的真內容。
  - 型別檢查另外加一段 `npx tsc --noEmit -p . --preserveSymlinks`（見下方「驗證中另外抓到的坑」）。
- 新增 `tools/node_import_declarations.test.ts`：掃 `tests/` 與 `tools/` 全部 `.ts` 檔的 `import { a, b } from 'node:xxx'`，比對 `tests/ui/node-fs.d.ts`、`tools/node-build.d.ts` 有沒有宣告這個名字，沒有就列出 `檔案:行號`。
- 驗證會紅（兩種方式都做了）：
  1. 直接跑測試：暫時加一支 `tools/_tmp_verify_undeclared.test.ts`，`import { appendFileSync } from 'node:fs'`（真的沒宣告的函式）。`npx vitest run tools/node_import_declarations.test.ts` 紅：`tools/_tmp_verify_undeclared.test.ts:2  node:fs 的 appendFileSync 沒有宣告`。跑完刪掉暫存檔。
  2. **用真正的閘門腳本跑一次**：把同一支壞測試提交成一筆暫時提交，`echo "refs/heads/w0923-build <sha> refs/heads/main 0000...0" | sh tools/prepush_gate.sh origin`，輸出 `[推送閘門] ✗ 測試紅了，這次不推`，抓到的正是 `node_import_declarations.test.ts` 那條。驗完 `git reset --hard HEAD~1` 拿掉暫時提交，沒有留在分支上。
- **驗證中另外抓到的坑（不在原稽核清單上，屬於同一件事必須一起補）**：`node_modules` 底下是逐套件連結的 junction，`tsc` 預設遇到連結會解回真實路徑，往上找 `node_modules` 又摸到主資料夾自己那份完整安裝——裡面有本機多裝的 `@types/node`，型別檢查在本機還是悄悄撿到它，跟雲端不一樣看不出來。用「`git -c core.autocrlf=false archive HEAD` 取 LF 副本＋這支 mjs 建鎖檔 node_modules＋`npx tsc --noEmit -p . --preserveSymlinks`」模擬雲端才真的抓到：7 支 `tools/*.test.ts` 報 `process` 找不到、3 支報 `__dirname` 找不到（詳見「低-2」）。修法是在閘門裡 `npm run build` 之前**額外**加一段帶 `--preserveSymlinks` 的 `tsc --noEmit`，紅了就擋（`npm run build` 自己那次沒帶這面旗子，兩次都跑，刻意加嚴不是重複）。
- 閘門前後耗時（同一顆提交，跑兩次取變異範圍）：
  - 舊版（`mklink /J` 整包借、無 size 檢查、無新增測試）：**35.9s、37.1s**（兩次）。
  - 新版（鎖檔連結＋靜態掃描＋size 檢查＋`--preserveSymlinks` 加嚴）：**41.7s、48.9s、53.6s**（三次，含最終版）。
  - 多出約 6–18 秒（15%–45%），主要是額外一次 `--preserveSymlinks` 的 tsc、check_size.py、以及數十個小 junction 比單一大 junction 多一點檔案系統開銷；junction 建立本身只要 0.1 秒級。這個代價換到的是「本機綠、雲端紅」這個結構性缺口被真正堵住，判斷是值得的，但沒有事先問過使用者是否接受這個耗時增幅，寫在這裡讓你知道。
- 沒做的：`.bin` 是整包借過去（不是逐一解析每支捷徑實際指到哪個套件），因為掃過內容確認全部指向鎖檔套件，沒有例外；如果以後 `.bin` 出現指向本機額外套件的捷徑，這裡不會擋到。

## 低-1　`tools/check_size.py` 接進閘門

- 改：`tools/prepush_gate.sh`——打包成功後找 `python`／`python3`／`py`（`command -v` 逐一試），找不到就印警告跳過、不判紅；找到了就跑 `check_size.py`，離開碼 1（超標）才擋，離開碼非 0/1（找不到 `dist/`、腳本本身出錯）一樣只警告不擋。
- `check_size.py` 本身只用標準函式庫（`json`／`re`／`sys`／`pathlib`），沒有像 `check_haze.py` 要賭 Pillow／numpy 在不在的問題，但還是照 09-13 教訓的做法留了「跑不動就跳過」這條路。
- 驗證：在 LF 副本＋鎖檔套件的模擬環境裡實跑，離開碼 0、印出「大小 OK」（首載程式 97.3%、樣式 90.2%、圖片 96.3%、首載總計 97.2%，跟稽核報告的數字一致，沒有回歸）。沒有刻意造一批超標的圖去驗證「離開碼 1 會擋」那條分支，因為要真的做出超標的 dist 產出成本較高；改用讀程式碼＋離開碼邏輯表核對（`check_size.py` 的 `main()` 明寫 `return 1` 對應超標、`return 2` 對應找不到 `dist/`，閘門那段 `[ "$size_rc" -eq 1 ]` 對上超標、其餘非 0 都是警告不擋），邏輯正確但沒有實跑紅燈這一步，這點誠實告知。

## 低-2　`tools/*.test.ts` 納入型別檢查

- 改：`tsconfig.json`——`include` 加 `"tools/*.test.ts"`（沒用整個 `"tools"` 目錄，是因為 `tools/_batch_boss.ts`、`_cardlist.ts`、`_probe_boss.ts` 這幾支沒有任何測試匯入，拖進來型別檢查範圍會撿到跟這次任務無關的舊腳本；`story_table_lib.ts` 因為被 `dump_story_table.test.ts` 匯入，會自動透過依賴關係被檢查到，不用額外列）。
- 開了之後浮出的型別錯誤，逐一修：
  - `tools/node-build.d.ts` 補 `statSync`、`readdirSync`（不帶 `options` 的版本）、`node:path` 的 `dirname`、`node:child_process` 的 `execFileSync`，以及全域的 `process`（`{ env: Record<string,string|undefined> }`）與 `__dirname`（`string`）。
  - `tools/down_art.test.ts`：讀 WebP 檔頭要用 Buffer 專屬的 `toString(編碼)`／`readUIntLE`／`readUInt32LE`／`readUInt16LE`。**試過**把共用宣告檔 `readFileSync`（不帶編碼）的回傳型別整個換成「擴充 `Uint8Array`」的 Buffer 型，結果 `node:crypto` 那十幾支呼叫 `createHash().update()` 的檔案全部型別對不上（`Uint8Array` 泛型的 `ArrayBufferLike` 判斷出問題），得不償失，**改成只在這支測試局部宣告一個不繼承 `Uint8Array` 的最小介面 `WebpHeaderBytes`、用 `as unknown as` 轉型**，不動共用宣告。順手把這支檔頭「放在 tools/ 是因為不受型別檢查照到」的舊註解更新成現況。
  - `tools/feifei_cardart.test.ts`、`tools/feifei_sprites.test.ts`：手寫的 `manifest` 型別（`monsters: Record<string,string>`）跟 `src/ui/assets.ts` 的正牌 `Manifest`（`monsters` 應該是巢狀物件）早就對不上，改成 `import type { Manifest }` 用正本。
  - `tools/feifei_stills.test.ts`：`HEROES.filter((h) => h !== 'ninja' && h !== 'samurai')`——`samurai` 2026-09-22 已經整套拆掉、不在 `Hero` 型別裡，這行是型別上比不出結果的死比較，拿掉 `&& h !== 'samurai'`（行為沒變，因為 `samurai` 本來就不在 `HEROES` 陣列裡）。
- 驗證：
  - 本機 `npx tsc --noEmit -p .` 過（但本機因為 node_modules 有間接撿到的 `@types/node`，這個結果不能單獨採信）。
  - **用 LF 副本＋鎖檔套件＋`--preserveSymlinks` 模擬雲端**：第一輪就是靠這個抓到 `process`／`__dirname` 兩類共 10 個錯誤點（見中-2「驗證中另外抓到的坑」），補完宣告後重跑，**零錯誤**。
  - 同一份模擬環境跑 `npx vitest run`：279 個檔案過、5 個跳過，2388 條測試過、6 條跳過。
  - 同一份模擬環境跑打包（`tsc --noEmit && vite build` 等效指令）：成功，`check_size.py` 大小 OK。
- 沒做的：無（原稽核只點名 `statSync`、`node:child_process` 兩例，實際修的範圍比這個大，因為打開檢查之後冒出的錯誤比預期多，都在報告裡列清楚了）。

## 任務 5　`tools/auto_play.js` 認得推開門畫面

- 改：`tools/auto_play.js`——`switch (screen)` 加一支 `case 'bossdoor'`：找文字含「推開」的可見按鈕就點。門開演出開始後 `.boss-door.opening .door-hint { pointer-events: none }` 會讓按鈕的 `vis()` 判定自然變 false，不用額外判斷「已經開過門」。
- 驗證：`node --check tools/auto_play.js` 語法過；`node -e "console.log(/推開/.test('推開門'))"` 確認按鈕文字比對邏輯正確；讀 `src/ui/screens/bossdoor.ts` 與 `src/ui/styles/screens.css` 核對 CSS 選擇器與按鈕文字跟原始碼一致。
- **沒有自動化的反向紅測試**：這支是貼進瀏覽器主控台跑的壓力測試，不在 `vitest` 套件裡（倉庫規矩禁 happy-dom／jsdom，沒有真的 DOM 可以跑），沒辦法比照其他 bug 補一條會反向變紅的測試，誠實列在這裡。

## 任務 6　補小圖示

- 改：`index.html`——加 `<link rel="icon" type="image/png" href="%BASE_URL%favicon.png">`。用 Vite 的 html 環境變數替換（`%BASE_URL%` 是 Vite 內建變數，不是自訂），打包後驗過兩種前綴都對：本機預設 `/qiuqiu-tower/favicon.png`、`SITE_NAME=qiuqiu-tower-coop` 時是 `/qiuqiu-tower-coop/favicon.png`。
- 新增 `public/favicon.png`：從 `public/assets/sprites/hero/ninja_portrait.webp`（球球的立繪）裁頭部區域、縮成 64×64 PNG。檔名固定，之後美術產線接手只要換內容、不用再改 `index.html`。
- 改：`tools/vite-asset-hash.ts`——加 `FAVICON_REL = 'favicon.png'`，跟 `MANIFEST_REL` 同一個模式排除加雜湊。原因：`index.html` 的網址是寫死的，不像清單裡的圖靠 `files` 表動態找回改名後的檔案；`.png` 不在 `SKIP_EXT` 裡，沒有這條排除的話打包會把它改名成 `favicon-XXXXXXXX.png`，`index.html` 裡的舊名字就 404（**這是我在寫這個修正的過程中自己發現、順手一起修掉的坑，不在原派工單裡，但不修的話這個任務等於白做**）。刻意不把整個 `.png` 副檔名加進 `SKIP_EXT`（那樣以後其他 png 素材圖進來會漏掉加雜湊防快取），只排這一個固定檔名。
- 新增 `tests/ui/favicon_not_hashed.test.ts`：真的跑一次打包外掛（比照 `motion_asset_build.test.ts` 的做法，不是只讀原始碼），驗證 `favicon.png` 打包後檔名沒變、內容跟來源一致。
- 驗證會紅：暫時把 `FAVICON_REL` 那行排除註解掉，跑測試——**真紅**（`existsSync` 在原檔名處找不到檔案，因為外掛把它改名了）。改回來，測試轉綠。另外也在本機真的打包一次（不帶 `SITE_NAME`、帶 `SITE_NAME=qiuqiu-tower-coop` 各跑一次），用 `cmp` 核對 `dist/favicon.png` 跟 `public/favicon.png` 位元組完全一致。

## 共同規則驗收

- `npx tsc --noEmit -p .` 零錯誤（本機、以及 LF 副本＋鎖檔套件＋`--preserveSymlinks` 模擬環境都跑過）。
- `npx vitest run` 全綠：279 個檔案過、5 個跳過（都是要設環境變數才跑的傾印工具，跟稽核報告的 5 個一致）；2388 條測試過、6 條跳過。
- 雷 5（跑完整套測試會重寫 `docs/牌池總表.json`、`docs/怪物工作檯.json`）：確認過，`怪物工作檯.json` 只差 `generatedAt` 日期一行、`牌池總表.json` 實際上零差異；`docs/事件文案.md`、`docs/分關載入.json` 也是零差異。四個都 `git checkout --` 收拾乾淨，最終 `git status --porcelain` 全空。
- 提交在自己的分支 `w0923-build`，共 7 筆，訊息繁體中文、照既有風格。
- **實際用 `sh tools/prepush_gate.sh` 跑了三次全綠、一次確認會擋（見中-2），不是只憑推理。**

## 提交清單（`git log --oneline 1902d32..HEAD`）

```
ca5ba53 推前審查修正：閘門的型別檢查加 --preserveSymlinks（驗證中另外抓到的坑）
76c3e1b 推前審查修正：補 process／__dirname 的全域宣告（稽核低-2 追加）
6b116d9 推前審查修正：補小圖示，擋掉每次載入一筆 favicon.ico 404（已知問題）
f534599 推前審查修正：瀏覽器自動玩家認得推開門畫面（已知問題）
5de93c9 推前審查修正：tools/*.test.ts 納入型別檢查、補齊缺的宣告（稽核低-2）
9013095 推前審查修正：推送閘門改借鎖檔套件、加靜態掃描擋沒宣告的 node: 匯入（稽核中-2）
41de57d 推前審查修正：動作圖守門測試改成整棵樹往下收字串（稽核中-1）
```

## 需要主控決定的事

1. **閘門變慢了約 6–18 秒**（36s → 42–54s，視系統當下負載有變異）。原因主要是多一段帶 `--preserveSymlinks` 的 `tsc --noEmit`、`check_size.py`、以及逐套件 junction 比整包借多一點檔案系統開銷。這是換取「閘門真的擋得住本機綠雲端紅」的必要代價，但沒有先問過可不可接受，先照做了，提出來讓你知道。
2. **低-1 沒有實跑「超標會擋」那條紅燈路徑**——邏輯核對過是對的，但沒有真的做一批超標的圖來驗證離開碼 1 那個分支的行為，如果在意可以再花時間造一批假資料驗一次。
3. `.bin` 是整包借過去（不逐一解析每支捷徑指到哪個套件），目前掃過確認沒問題，但這不是完全嚴謹的保證，以後如果 `.bin` 出現指向本機額外套件的捷徑，這裡不會擋到——出現機率低，但寫在這裡供參考。
