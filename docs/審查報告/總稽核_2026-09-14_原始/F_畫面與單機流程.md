# F：畫面與單機流程稽核報告（2026-09-14）

範圍：`git diff main..coop -- src/ui src/main.ts index.html`（33 檔，+3490/−416）。唯讀審查，未修改任何檔案。

## 狀態圖（球球玩家視角）

```
main（單機現況）：
標題 --新的一局--> newRun() --序章(球球專屬影片+4張幻燈片)--> 地圖
      --續玩----> continueRun() 讀存檔 -------------------> 地圖
      --貼局面碼--> decodeRun -> continueRun(該局) --------> 地圖
地圖 <-backToMap()存檔-> {戰鬥｜事件｜罐頭鋪｜貓窩｜紙箱} --> 過關(回滿血/秘寶) --> 下一關地圖
第三關關主 --> 結局(球球專屬結尾影片+2張幻燈片) --> 結算(result)
（教學＝combat.ts 內的三步疊層，1關1F、localStorage 旗標，非獨立畫面）

coop（本次要併回的版本，球球玩家等效路徑）：
標題 --新的一局--> **heroselect(新增)**[預設選中球球，不點也能直接出發] --> newRun() --> 同上
      --續玩----> continueRun()（不經過 heroselect，讀存檔 hero 直接還原）--> 地圖
      --貼局面碼--> 同 main，不經過 heroselect
      --兩個人一起玩--> **lobby(新增)**：pick→hosting/joining→connected/failed
      --暗碼 mimi36985 再按開始--> **debug(新增)**：唯讀頁+可跳臨時場景(sandbox，不存檔)
拓樸差異只有一站：heroselect（見中-1）。其餘節點對只選球球的玩家而言進出口不變。
```

## 問題清單（中）

1. **首載圖片體積翻倍，main 才 9.66MB(99.6%用量) → coop 18.36MB(189.3%，超預算 8.66MB)**——實跑 `python tools/check_size.py` 兩邊 dist 得證。根因：`src/ui/assets.ts:244-257` 的 `preloadArt()` 對 `sprites/icons/cards` 三組完全沒有分角色過濾（只有 `bg` 組用 `deferredBgKeys()` 篩），而 `tools/dump_monster_acts.test.ts`（產生 `docs/分關載入.json` 給 check_size.py 用）只處理 `monsters` 和 `bg` 兩組，`sprites/icons/cards` 從未進過分關名單。實測菲菲專屬鍵：sprites 31 張（100% 算首載）、icons 3 張（100%）、cards 149 張（100%，跟任務給的數字一致）、bg 125 張中 69 張已靠 `_r\d+$` 規則歸零（結果圖）但仍有 56 張算首載；菲菲首載圖片總計約 7.25MB。且 `preloadArt()` 在 `main.ts` 的 `boot()` 一開場（尚未選角）就呼叫，此時無法用「這局選誰」過濾。**修法**：把兩位角色專屬鍵（`hero/feifei_*`、`card/feifei_*`、`icon/*_feifei_*`、`bg/event_feifei_*` 等）從 `preloadArt()` 的首發全部跳過，另做一支 `preloadHeroArt(hero)` 在 `app.ts` 的 `newRun()`(167行 `setLocalHero` 之後)、`continueRun()`(205行)、`lobby.ts` 的 `begin()`(91行) 這三處已呼叫 `setLocalHero` 的地方接著呼叫；`tools/dump_monster_acts.test.ts` 要**在那之後**才跟著補上 sprites/icons/cards 的分流邏輯，不然就是該檔案自己註解警告過的「美化數字」而非修正高估。

2. **「新的一局」多了一次畫面切換**——`title.ts` main:59 `app.newRun(seed.value, level)` 直接開局；coop:60 改成 `app.show('heroselect', {seed, difficulty})`，多一站才進 `newRun`。標記：**刻意**（為了讓玩家選菲菲），非副作用；heroselect.ts:42 預設 `chosen='ninja'` 且卡片預設就是選中狀態，所以只多「看一眼、點一次出發鈕」，不需要真的選角。

3. **`heroSpriteUrls()`（assets.ts:42-49）不分角色**，回傳全部 `hero/*` 鍵（球球+菲菲共約 50+ 張），被 `app.ts:361` 的 `warmEncounter(..., heroSpriteUrls())` 在**每場戰鬥開打前**整批送進暖圖佇列——單機玩家從頭到尾只會用到一半，卻在第一場戰鬥時跟魔物立繪搶下載名額（`preload.ts` 原本的排序註解就在講這個優先序很敏感）。**修法**：`heroSpriteUrls()` 加參數，只回傳「這局實際登場角色」的姿勢圖。

## 問題清單（低／資訊性）

4. 程式體積 main 已超標（367.8KB/200KB，183.9%），coop 再加約 125KB 到 493.4KB——非本次新增的崩壞，是既有技術債被加重，多數為 heroselect/lobby/debug 與連線程式碼；`rtc-*.js` 有 `modulepreload`（確認過 `dist/index.html`），故此增量對單機玩家是真的會下載，不是統計假象。
5. `npx vitest run tests/ui tools`：**46 檔中 2 檔失敗、201 通過、3 跳過**（206 條）。失敗的 `tools/_audit_load.test.ts`、`tools/_audit_sim.test.ts` 經查 `git ls-files` **未受版控**，檔頭自寫「總稽核用的臨時檔…用完刪掉」，靠 `AUDIT_DIR`/`AUDIT_OUT` 環境變數運作，本環境未設定才噴 `undefined` 路徑——與本次併版邏輯無關，建議事後清掉避免誤判。`npx tsc --noEmit -p .` 乾淨、無輸出。
6. `index.html` 兩分支**完全無 diff**（字型、meta、音樂皆未變動）；`__BUILD_TAG__` 只用在 `src/net/code.ts`（連線握手版本比對），單機流程不會碰到。標題仍寫「球球參上」，加了菲菲後未更新，屬命名細節非流程問題。

## 已核對、沒問題

- **舊存檔 hero 缺欄位**：`heroOf()`(`engine/hero.ts:34`)、`storyFor`/`lineFor`/`eventTextFor`(`content/dialogue.ts:651,1042-43,910-11`)、`cardArtKey`/`eventArtKey`/`mapHeroKey`/`heroSpriteKey`(`assets.ts`) 全部一致用「非 `'feifei'` 就當預設」或 `?? 'ninja'`；`save.ts` 的 `usablePlayer`(160行) 明確放行 `hero===undefined`，`migrateV1`(136-150行) 舊 v1 檔沒有 hero 欄位就整個不寫，不會塞錯值。**逐一讀了實作、不是只看註解**，未發現任何一處會炸。
- **`#stage` 的 data-\* 殘留**：全倉庫只有 4 處寫入（`app.ts:137,139,148` 三個在每次 `show()` 都重設；`rest.ts:31` 的 `data-restbg` 只搭配 `[data-screen="rest"]` 的 CSS 規則使用，離開貓窩畫面後殘留值不會外溢到別的畫面）。`screens.css:1137-1159` 的 `[data-hero="feifei"]` 規則比未限定 hero 的規則多一個屬性選擇器，特異度更高，不會被蓋掉也不會蓋錯球球那份。
- **除錯頁入口**：唯二進入點是 `title.ts:59`（打暗碼 `mimi36985` 才觸發）與 `app.ts:104`（只能從除錯頁內部的 sandbox Esc/跳轉觸發），沒有任何正常按鈕會誤觸；sandbox 局不存檔靠 `app.ts:243` 的 `save()` 守衛（`if (this.coop || this.sandbox) return;`），與 `debug.ts:221-230` 的 `jump()` 交叉核對一致。
- **無 WebRTC 環境按「我開房」**：`hostRoom`/`joinRoom`（`net/rtc.ts:74,94`）都是 `async function`，`RTCPeerConnection` 未定義時的同步例外會自動包成 rejected promise，`lobby.ts:199` 的 `.catch(fail)` 接住、顯示中文訊息＋「重來一次」鈕，不會白屏卡死，不影響標題或單機（未實機測試舊瀏覽器，此點標**未證實**，僅代碼路徑推演）。訊息文字籠統（沒明講「你的瀏覽器不支援」），小瑕疵。
- **「兩個人一起玩」按鈕位置**：`title.ts:105`，在 `title-books` 次要按鈕列（跟圖鑑同排），排在「新的一局／續玩」主列之下，不會誤觸。

## 實際打開核對過的檔案

`docs/交給另一個AI檢查_2026-09-14.md`、`index.html`、`src/main.ts`（兩分支）、`src/ui/app.ts`、`src/ui/screens/title.ts`（兩分支）、`src/ui/screens/heroselect.ts`、`src/ui/screens/lobby.ts`、`src/ui/screens/debug.ts`、`src/ui/assets.ts`、`src/ui/preload.ts`、`src/ui/cardview.ts`、`src/ui/cardtext.ts`、`src/ui/dialogue.ts`、`src/content/dialogue.ts`（`storyFor`/`lineFor`/`eventTextFor`/`castLineFor` 段）、`src/engine/hero.ts`、`src/engine/save.ts`（migration 段）、`src/net/rtc.ts`、`src/ui/storyslides.ts`、`src/ui/enemylayout.ts`/`heropose.ts`/`monsterpose.ts`（diff）、`src/ui/styles/screens.css`（貓窩定位段）、`tools/check_size.py`、`tools/dump_monster_acts.test.ts`、`tools/_audit_load.test.ts`/`_audit_sim.test.ts`、`public/assets/manifest.json`、`docs/分關載入.json`、`dist/index.html`。

## 跑過的指令

`git diff --stat main..coop -- src/ui src/main.ts index.html`；`git diff main..coop -- <各檔>`；`git show main:src/ui/screens/title.ts`；`npx vitest run tests/ui tools`（46 檔/206 條，2 檔失敗見上）；`npx tsc --noEmit -p .`（乾淨）；`python tools/check_size.py`（分別在 `qiuqiu-coop` 與 `qiuqiu-tower` 的既有 `dist/` 上跑，兩邊都非本次重新建置，coop 的 dist 比最新 commit 早約 4 分鐘，該 commit 只動了球球一張事件圖，不影響本報告數字）；python 腳本交叉比對 `manifest.json` 與 `分關載入.json` 算出各分類張數與位元組。

## 附註

發現倉庫裡 `docs/分關載入.json`、`docs/怪物工作檔.json`、`docs/牌池總表.json` 三個檔案在工作目錄有**未提交的修改**（非本次審查產生，開場 `git status` 已顯示）；本報告的 `分關載入.json` 分析是照工作目錄現況算的，未去比對 HEAD 版本差異，如有出入以此為準。
