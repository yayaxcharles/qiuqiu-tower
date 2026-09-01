# 爪破魔塔：球球參上（Clawbreak Tower: Qiuqiu Arrives）

灰貓忍者「球球」爬一座魔物塔的牌組構築遊戲，玩法接近《殺戮尖塔》。純網頁、免安裝、不用開帳號，
整個遊戲就是一包靜態檔案，丟到 GitHub Pages 就能玩。

線上玩：<https://yayaxcharles.github.io/qiuqiu-tower/>
（要先照最後一節推上 GitHub 並把 Pages 打開，這個網址才會活。）

畫面 1280×720 橫向，視窗改變時整個等比縮放。電腦滑鼠操作，不支援手機。

---

## 怎麼玩

- 每回合開始吃飽三顆飯糰（就是能量），出牌吃掉飯糰；吃光了叫「餓扁了」，只剩不用飯糰的牌能打。
- 魔物頭上會寫牠下一步要做什麼，看著那個決定要打人還是先縮起來。
- 一共十五層，最頂樓是塔主。打贏魔物拿牌、小魚乾、秘寶；路上還有罐頭鋪買東西、
  貓窩打盹回血或磨爪升級一張牌、紙箱開寶物，以及各種事件。
- 畫面上看不懂的名詞，滑鼠移上去都有一句白話說明。

## 存檔是怎麼一回事

- 存檔放在瀏覽器自己的 `localStorage`（瀏覽器幫每個網站留的小置物櫃），也就是「這台電腦、這個瀏覽器」。
  換一台電腦、換一個瀏覽器、清掉瀏覽資料，存檔就沒了；它不會上傳到任何地方，作者也看不到。
- **只有一個節點結算完才存**：戰鬥的三選一獎勵挑完、事件／罐頭鋪／貓窩／紙箱收完尾，再加上序章播完那一次。
  走進節點的當下、戰鬥打到一半、獎勵還沒挑，通通不存。
- 所以打到一半把分頁關掉，下次按「續玩」會**從那一場戰鬥的開頭重打**；停在獎勵畫面時關掉也一樣，那場要重打。
  這是刻意的：戰鬥中途存下去，重整回來會有一堆對不上的狀態；乾脆整場重打，反而每次都對得起來。
- **死掉跟打贏塔主是當場定案**，不等結算畫面——那一刻存檔就被清掉了，關掉分頁再按「續玩」也救不回來。
  不這樣做的話，快死的時候關分頁就等於免費復活。

## 種子

- 一局裡所有的隨機——地圖長相、遇到哪些魔物、抽到什麼牌、獎勵給什麼、罐頭鋪進什麼貨——
  全部從同一顆「種子」（一段你自己打的字）長出來。
- 開始畫面有個輸入框可以自己填種子；留空的話就拿當下時間當種子。
- 同一顆種子＝從頭到尾一模一樣的一局。要重現一個怪狀況、或想跟別人比同一局，就把種子抄給對方。
  遊戲進行中種子印在畫面右上角，結算畫面也會再印一次。

---

## 開發

需要 Node 24（作者機器上是 24.15）與 Python 3.12（只有素材產線與大小檢查用得到）。第一次先裝套件：

```
npm install
```

| 想做什麼 | 打這個 |
|---|---|
| 邊改邊看 | `npm run dev`，然後開它印出來的網址（預設 `http://localhost:5173/qiuqiu-tower/`；5173 被別人佔走時 Vite 會自己換一個號碼，**以它印出來的那行為準**） |
| 跑全部測試 | `npm test` |
| 測試邊改邊跑 | `npm run test:watch` |
| 看平衡報告 | `npm run balance -- --reporter=verbose`（機器人自己打 500 局，印通關率、平均到達層數、平均牌組張數、陣亡樓層分布） |
| 打包成上線的樣子 | `npm run build`（先驗型別再打包，成品在 `dist/`） |
| 看打包後的成品 | `npm run preview`，開 `http://localhost:4173/qiuqiu-tower/` |
| 檢查檔案大小 | `npm run size`（等於 `python tools/check_size.py`，要先 `npm run build`） |

兩個容易踩到的地方：

- **平衡報告一定要加 `-- --reporter=verbose`。** Vitest 4 預設的報告器會把 `console.log` 吃掉，
  不加的話你只會看到「1 passed」，報告內容一行都印不出來。中間那個 `--` 是給 npm 看的，
  意思是「後面的參數不是給 npm，是要轉交給底下的指令」。
- **`npm run build` 已經包含型別檢查**（它是 `tsc --noEmit && vite build`），型別錯了會在打包前就擋下來，
  不用另外再跑一次 `npx tsc --noEmit`。

### 專案裡東西放哪

| 路徑 | 裝什麼 |
|---|---|
| `src/engine/` | 遊戲規則本體：亂數、地圖、戰鬥、效果、獎勵、存檔。不碰畫面 |
| `src/ui/` | 畫面：九個畫面在 `src/ui/screens/`，樣式在 `src/ui/styles/` |
| `src/content/` | 所有內容資料：牌、秘寶、忍具、魔物、事件、對白、名詞表 |
| `tests/` | Vitest 測試 |
| `tools/` | Python 素材產線與大小檢查 |
| `public/assets/` | 遊戲實際載入的圖，加上一份 `manifest.json` 對照表 |
| `docs/superpowers/` | 設計文件與兩份施工計畫 |

**改數值不用動程式。** 牌的傷害、魔物的血量、事件的獎懲、罐頭鋪的價格這些通通在 `src/content/` 裡，
改完存檔、`npm test` 跑過就好。引擎只認 `src/content/` 給的資料，不會把數字寫死在自己身上。

設計文件（規則、名詞、平衡目標、大小預算的原始出處）在
`docs/superpowers/specs/2026-08-29-qiuqiu-tower-design.md`；
兩份施工計畫（A：引擎與內容；B：畫面、美術、部署）在 `docs/superpowers/plans/`。

---

## 素材產線

圖分兩路來，兩路都會把結果寫進 `public/assets/manifest.json`，遊戲只認這份對照表。

**一、從 LINE 貼圖轉出來的牌面與立繪**

```
python tools/build_assets.py
```

來源是作者 Dropbox 裡「忍者貓貓」與「大俠貓貓」兩包貼圖的原圖，**唯讀，而且只存在作者自己的機器上**。
別台電腦跑這支會找不到來源，這是預期中的——`public/assets/` 裡產好的 WebP 已經進版控，
不重生素材的話完全不需要跑它。每張圖的裁切線記在 `tools/crop_overrides.json`，可以重現。

**二、用 Codex 生的魔物、圖示、背景**

```
python tools/codex_run.py     # 呼叫 Codex 一張一張生，綠幕背景，原圖落在 tools/codex_raw/
python tools/chroma_key.py    # 去綠幕、去綠邊、縮到規格尺寸、存成 WebP、更新 manifest
```

加上 `--check`（`python tools/chroma_key.py --check`）一樣會把已經生好的原圖處理掉，
差別是清單上還缺原圖沒生時，它會非零離開並報出還缺哪幾張，適合放在流程裡當關卡。
每張圖的提示詞在 `tools/codex_prompts/`，也都進版控，重生得出同一張。

Python 一律用 UTF-8 跑，Windows 下建議先設環境變數再跑：`$env:PYTHONUTF8=1`。

---

## 部署到 GitHub Pages

`.github/workflows/deploy.yml` 已經寫好了：只要推到 `main` 分支，GitHub 就會自己
`npm ci` → `npm test` → `npm run build`，再把 `dist/` 發布到 GitHub Pages。
測試沒過就不會發布，所以線上版不會出現跑不動的東西。

第一次要由你（帳號的主人）做這幾步，這台機器上沒有 `gh` 指令，也不該代為登入，所以代跑不了：

1. **先把工作中的分支合併回 `main`。** 工作流只認 `main`，推到別的分支不會觸發。

2. **把專案推上 GitHub。** 兩種做法選一種：
   - 裝 GitHub 官方指令工具：`winget install GitHub.cli`，接著 `gh auth login`，
     然後在專案資料夾裡 `gh repo create qiuqiu-tower --public --source . --push`。
   - 或是在 GitHub 網頁上先開一個空的公開儲存庫叫 `qiuqiu-tower`（**不要**勾選自動產生 README），
     再回到專案資料夾打：

     ```
     git remote add origin https://github.com/yayax/qiuqiu-tower.git
     git push -u origin main
     ```

3. **把 Pages 打開。** 到儲存庫的 Settings → Pages → Build and deployment → Source，選「GitHub Actions」。
   這一步只能在網頁上按，工作流檔案自己開不了它；沒開就推上去的話，前面建置與測試都會過，
   卡在最後發布那一步失敗。

4. **看它跑完。** 儲存庫的 Actions 分頁會有一筆「部署到 GitHub Pages」，綠勾之後開
   <https://yayax.github.io/qiuqiu-tower/>。第一次大概要等一兩分鐘。

**如果你的 GitHub 帳號不叫 `yayax`，或儲存庫想取別的名字**：網址會跟著變成
`https://<你的帳號>.github.io/<儲存庫名稱>/`，而且 `vite.config.ts` 裡的 `base: '/qiuqiu-tower/'`
要改成 `/<儲存庫名稱>/`，本檔案裡的網址也一起改。這個 `base` 是「所有圖片和程式檔的網址前綴」，
沒對上的話線上版會開出一片空白（圖跟程式都 404）。改完重跑一次 `npm run build` 確認。

之後每次想更新線上版，就是把改動推到 `main`，其他都自動。
也可以到 Actions 分頁手動按「Run workflow」重跑一次。
