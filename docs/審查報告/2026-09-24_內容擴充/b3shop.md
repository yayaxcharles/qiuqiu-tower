# b3shop 報告：罐頭鋪店主輪替（design3 第四節＋主控裁決第 1 條）

worktree `F:\ClaudeWork\qq-b3shop`，分支 `c0923-b3shop`，一筆提交 `644b3408`（從 `c0923-b3base` `25952e4d` 開出）。
驗收：`npx tsc --noEmit -p .` 0 錯誤；`npx vitest run` 338 檔、3164 條通過、9 條跳過、**沒有 Errors 那一行**；照雷 5 收拾（`怪物工作檯.json`、`牌池總表.json`、`事件文案.md` 只差日期／換行，已還原；`分關載入.json` 真的重生，已提交）。

## 一、做了什麼

| 項目 | 檔案:行號 | 說明 |
|---|---|---|
| 誰顧店 | `src/engine/run.ts:92` `assignKeepers`、`:107` `keeperOf`；呼叫點 `newRun`（:80）、`advanceAct`（:600） | 地圖生成完，每間罐頭鋪用分支亂數 `<種子>|keeper|<關>|<格子>` 擲：橘貓老闆 1/2、三位客座各 1/6；由低樓層往上擲，同一關已有這位客座就改回橘貓老闆。**不推整局亂數**。只寫客座（沒寫＝橘貓老闆） |
| 型別 | `src/engine/types.ts:847` `MapNode.keeper?: KeeperId`、`KeeperId` | 可選欄位，舊存檔＝橘貓老闆 |
| 店主表 | `src/content/keepers.ts`（新） | 名字、立繪鍵、木牌、地圖說明、格數、池子、私藏規則、忍具保底、各類倍率、放生倍率、服務、地圖頭像裁切框。**橘貓老闆那一列＝改版前寫死的數字**（有測試守：同種子貨架與亂數走向逐字相同） |
| 貨架 | `run.ts:1012` 起 `makeShop`、`:949` 起 `reshuffleShop`、`:1089` `ensurePotionFloor` | 婆婆：牌 3、常見 1、忍具 6（保底 1 稀有 2 罕見，重整也保證）、不擺私藏。掌櫃：牌 3、常見 2＋大魔物 1（第二關起 2）＋私藏**一定有**（限定池拿光改一件大魔物）、忍具 1。阿福：牌 5／6 一定一張升級、常見 1、忍具 2、不擺私藏。橘貓老闆私藏照舊五成（裁決第 1 條） |
| 價錢 | `run.ts:1135` `MIN_PRICE`、`:1141` `keeperMulFor`、`priceFor`；`:1197` `removePrice(run, seat, shop?)`、`buyRemove(…, shop?)` | 店主倍率只乘那一類（婆婆忍具 ×0.75、掌櫃秘寶 ×1.1），全部相乘最後捨入一次、**最低 5 條**；阿福放生 ×0.5 進位到 5 的倍數，之後照舊漲 25（會員卡不漲） |
| 阿福換招 | `run.ts:1221` `shopService`、`:1229` `swapCandidates`、`:1240` `canSwap`、`:1251` `buySwap` | 40 條、一間一次（`shop.serviced`）；原地換成同職業罕見以上的忍術牌（壞毛病換常見）、不同名、不帶升級；抽法用分支亂數 `<種子>|keeperswap|<關>|<格子>|<座位>` |
| 連線 | `src/net/runaction.ts:20`（`{ t:'buy', k:'swap', u }`）、scrub 帶貨架；`src/net/hash.ts:134`（`kp[…]` 有才串）；`src/engine/save.ts:217` | 兩台同一顆種子擲出同一批店主；指紋收店主；存檔讀到認不得的店主只丟那一格 |
| 機器人 | `src/engine/smartbot.ts:1435` `keeperDetour`、`:1451` `keeperServices`、`:1465` `keeperPotions`；`coopbot.ts`、`bot.ts` | 繞路加分：阿福＋15（廢牌 ≥2）、掌櫃＋15（錢 ≥150）、婆婆＋10（忍具 <2）。阿福：廢牌 ≥1 且錢 ≥ 半價＋40 就放生、還有評分 ≤2 的牌且錢 ≥100 就換招。婆婆：忍具 <3 支且錢 ≥ 價＋30 就買最便宜那支。掌櫃照舊（6 分門檻） |
| 台詞（延後模組） | `src/content/shop-text.ts`（新，打包成 5.5 KB 獨立一塊）、`src/ui/shop-text-loader.ts`（新） | 三位的碎念各 6、初見旁白、欠條、四隻 × 三位的進店／離店／買太多、換招四句。地圖上有客座那一間時地圖畫面就在背景抓；罐頭鋪畫面**不靜態載它**（有測試守） |
| 罐頭鋪畫面 | `src/ui/screens/shop.ts` | 名牌、三個表情立繪照店主（`<鍵>_happy`／`_no` 退回招呼圖）；木牌掛在新牌架子上緣右邊；第一次見到＝正上方一條旁白＋對白框「店主一句／自己回一句」；之後＝碎念一句；買滿 3 樣（放生、服務算、重整不算）換「買太多」；離店回地圖吐司講一句；欠條那句客座講自己的；阿福的第三顆鈕「舊招換新招」、放生鈕寫（半價）；劃掉的原價含掌櫃加價 |
| 地圖 | `src/ui/screens/map.ts:268`（頭像）、`:423`（預抓）、`:433` `keeperHead`；`src/ui/styles/map.css:245` | 客座那間的罐頭圖示右下角疊一顆 30 像素圓頭像（從招呼立繪裁，裁切框在 `KEEPERS[..].head`），滑上去「今天顧店：…」＋招牌；橘貓老闆那間不疊 |
| 用到才下載 | `src/ui/assets.ts:140` `isGuestKeeperArt`、`:571`（開場跳過）；`src/ui/preload.ts:217` `mapKeeperArtUrls`／`preloadMapKeepers`；`tools/dump_monster_acts.test.ts` | 三位九張開場不載，這一關地圖上有那一位才抓那一位三張（跟事件主圖同一組、留參照）。橘貓老闆三張、行腳商三張不動 |
| 樣式 | `screens.css:1198–1210`、`phone.css:69–75` | 木牌、兩行對白改成名牌與店主那句同一行（框高跟一行字時差不多）、四顆鈕時縮一號；手機橫拿再收框頂留白與行高 |

## 二、測試（新增 2 檔、改 3 檔）

- `tests/engine/content_batch3_keepers.test.ts`（37 條）：擲店主（只罐頭鋪、同位客座一關一間、機率 50/16.7×3、不推整局亂數、連線與單機同一批、過關也擲）；四位貨架格數／池子／私藏／保底／升級牌；橘貓老闆與改版前逐字相同；**design3 4-3 算例表 7 例逐例**（34／27／14／9／220／330／165）＋阿福放生 100→50（後漲 125）、125→62.5→65；店主倍率只乘那一類、最低 5 條、實際開店標價、買下去扣的＝標價；換招（四隻、原地、不帶升級、不同名、分支亂數、一間一次、壞毛病換常見、別家不能換、連線放行判準）；舊存檔讀回、認不得的店主丟掉、指紋收店主；機器人繞路加分、阿福放生＋換招、聰明機器人 12 局跑完。
- `tests/ui/keepers_0923.test.ts`（15 條）：台詞一句不缺、球球句尾喵、另三隻與店主不帶喵、噹噹封封不叫師父；台詞模組只准延後載入；載入器同時一次、失敗重來；客座九張認得（橘貓老闆三張、行腳商三張不算）；地圖上有哪位才抓哪位；畫面原始碼規矩（立繪鍵、名牌、放生價一份、服務鈕位置、買太多門檻、離店吐司兩條路、地圖頭像與說明、頭框不出圖）。
- `tools/dump_monster_acts.test.ts`：九張客座立繪記 0（不算首載），橘貓老闆三張照舊首載。
- 改別人的測試（都是我這條線的規則造成，照規矩更新）：`tests/engine/bot.test.ts` 定錨 bal-453 重錄（**確認過**：把 `newRun` 的 `assignKeepers` 暫時拿掉，兩條定錨都回到上一版的數；bal-369 一個數字都沒動）；`content_batch2_mechanics.test.ts` 帳本＋批發箱＋零錢罐那條加上最低 5 條；`relic_counter_0923.test.ts` 罐頭鋪原始碼形狀（欠條改走 `greet`→`sayDebt`、放生價算一次 `releaseCost`）。

**反向變紅**（`scratchpad\content\b3shop_work\redcheck.py`：逐條把修正改回壞寫法、跑三個測試檔、一定還原）20 條全部變紅：店主倍率沒乘、最低 5 條拿掉、婆婆阿福也擺私藏、掌櫃私藏回到五成、同位客座不只一間、擲店主改推整局亂數、指紋沒收店主、存檔不清壞店主、開場照載客座立繪、分關清單沒記、阿福放生不打折、連線換招不驗、橘貓老闆忍具格數變了、婆婆開店沒保底、婆婆重整沒保底、換招帶著升級、阿福沒保證升級牌、買太多門檻錯、機器人不為阿福繞路、地圖不抓店主立繪。

## 三、實機（Playwright，`vite preview --port 5421`，`?debug`、每個 context 全新暫存設定檔，沒碰正式網站）

腳本 `scratchpad\content\b3shop_pw\`（`shop.js` 單人、`coop.js` 連線），截圖 `scratchpad\content\b3shop_shots\`，都自己用 Read 看過。

- 單人桌機：球球／菲菲／噹噹／封封各逛四位店主（除錯手段：前三間罐頭鋪排成婆婆、掌櫃、阿福，第四間橘貓老闆），每隻 105～106 項全過；另跑第二關（球球）、第三關（菲菲）貨架格數。驗：開場沒下載客座立繪、地圖出來只抓這張地圖上有的那幾位、排了三位後三位都抓了、台詞模組在地圖上就抓了；地圖三顆頭像與滑上去的說明；名牌、立繪是這位的且載好、成交換 `_happy`；每一格畫面價錢＝定價×店主倍率×特價（最低 5），特價劃掉的原價含加價；點得到三樣、扣的錢＝標價；買太多換對白；阿福換招扣 40、原地換一張、提示一行、鈕變灰、放生寫半價；婆婆身上沒魔氣秘寶不出淨化鈕；離店回地圖吐司；第二次見到婆婆只剩碎念；主控台 0 錯誤 0 個 404。
- 手機橫拿（844×390、觸控）：球球第一關、噹噹第二關、封封第三關，105～110 項全過。
- 立繪會不會擋貨架：拿實機量到的立繪框與每一格的矩形，用原圖透明度逐像素算（三個表情都算，`b3shop_work\overlap.py`）：**9 種版面 × 4 位 × 3 表情，重疊 0 像素**，最近距離桌機 8.7～138、手機 4.7（橘貓老闆，改版前就是這個數）。四位的立繪框同一個位置、同一個大小（210×266，腳底同一條線），頭寬照美術量的 153／150～155（原圖）＝遊戲裡約 97 像素。
- 連線：球球開房＋菲菲加入走進阿福那間（19/19）、噹噹開房＋封封加入走進婆婆那間（18/18）：兩台地圖上的店主一樣、同一位名牌與立繪、**兩台算出來的兩份貨架（含價錢）JSON 一模一樣**、各回自己那一句；開房買秘寶＋換招、加入買忍具＋半價放生之後兩台整局帳一樣；兩人按逛好了一起回地圖、各講離店那句；沒有斷線橫幅、主控台 0 錯誤。
- 對照表（「四位店主在罐頭鋪實際畫面」）：`b3shop_shots\sheets\shops_ninja.png`、`shops_feifei.png`、`shops_dangdang.png`、`shops_fengfeng.png`、`shops_ninja_phone.png`、`shops_ninja_act2.png`；立繪並排 `portraits_ninja.png`；地圖頭像 `maps_ninja.png`。

## 四、首載（`SITE_NAME=qiuqiu-tower-coop npm run build` ＋ `python tools/check_size.py`，大小 OK）

| | 開分支那一筆 | 這條線 | 差 |
|---|---|---|---|
| 首載程式 | 631.2 KB | 638.4 KB（93.9%） | +7.2 KB（店主表、店主邏輯；台詞 5.5 KB 另成延後一塊） |
| 樣式 | 114.3 KB | 116.0 KB（96.7%） | +1.7 KB |
| 圖片 | 9.86 MB | 9.61 MB（90.7%） | −0.25 MB（客座九張延後） |
| 首載總計 | 10.62 MB | 10.37 MB（91.7%） | −0.25 MB |

說明：程式、樣式的「開分支那一筆」是把 `25952e4d` 的原始碼匯出到暫存區另外打包量的（照 `check_size.py` 同一套判法）；圖片那欄用重生過的分關清單（跑全套測試會多記 94 張早就該延後的圖），所以跟主控派工單寫的 11.15／11.89 MB（用舊清單量）不是同一個基準。

## 五、沒做的與原因

1. **婆婆的「請婆婆淨化」鈕沒接**：淨化那條線（b3rare）已經寫好給這裡接的介面——`canPurifyAtShop`／`purifyAtShop`／`PURIFY_PRICE`／`shop.purified`（`engine/run.ts`）、連線動作 `{ t: 'purify', seat, id }`（`net/runaction.ts`、`session.ts` 的 `isShopAction`）、挑選窗 `showPurifyPick`（`ui/purifypick.ts`）、台詞 `TORTOISE_PURIFY_LINE`／`purifyLine`／`tortoisePurifyLabel`（`content/purify-text.ts`）。我一開始自己寫了一份，看到那邊的之後整份拿掉，免得合併時兩份打架。這個分支婆婆那間不出淨化鈕（本來就沒有魔氣秘寶，畫面上看不出差別）。**合併後要補的程式碼**（照 b3rare 工作目錄 09-24 凌晨的版本寫，名稱變了要跟著改）：
   - `ui/screens/shop.ts` 的 `serviceBtn()` 開頭加：
     ```ts
     if (svc?.kind === 'purify') {
       const list = miasmaRelicsOf(run, seat);
       if (!list.length) return '';
       const go = (id: string | null): void => { if (!id) return; pendingPurify = id;
         if (act({ t: 'purify', seat, id }, () => purifyAtShop(run, shop, id, seat)) && !coop) afterPurify(); };
       const btn = el('button', { class: 'btn', onclick: () => (list.length === 1 ? go(list[0]!) : showPurifyPick(list, go, { cancellable: true })) },
         shop.purified ? '這間已經淨化過了' : tortoisePurifyLabel(PURIFY_PRICE));
       if (iDown || !list.some((id) => canPurifyAtShop(run, shop, id, seat))) btn.setAttribute('disabled', 'disabled');
       return btn;
     }
     ```
     `afterPurify()`：`notice(「原件」淨化成「淨化版」了。)`（淨化版名字用 `MIASMA_PURE[id]`）、`talk = { text: TORTOISE_PURIFY_LINE, reply: purifyLine(hero) }`、`countBuy(); play('upgrade'); setMood('happy'); if (!coop) render();`；`onRunApplied` 迴圈加 `else if (one.a.seat === seat && one.a.t === 'purify') afterPurify();`。
   - b3rare 的 `canApplyRun` `'purify'` 那條加 `&& shop.keeper === 'tortoise'`（那邊註解寫「由店主輪替那條線在畫面上擋」，引擎也擋比較保險）。
   - `engine/smartbot.ts` 的 `keeperServices` 加婆婆那段（淨化後多 ≥1.5 層、錢 ≥130 就 `purifyAtShop`，收益＝`relicRating(MIASMA_PURE[id]) − relicRating(id)`）；`keeperDetour` 婆婆那條改回 `p.potions.length < 2 || miasmaRelicsOf(run, seat).length > 0 ? 10 : 0`。
2. **行腳商的三張立繪沒延後**：那是問號格那條（b3qmark）的，`isGuestKeeperArt` 刻意不認 `shop/merchant*`。那三張約 110 KB 還在首載，要那條線自己延後。

## 六、需要主控決定

1. **婆婆的六格忍具排成一排（跟秘寶一起七格），沒有排成設計稿的兩排三格**：第一輪實機照兩排三格做，第二排整排沉到對白框底下、點不到，第一排的價錢也被對白壓住（那一輪的截圖被之後重跑蓋掉了，數字在：貨架底邊 791、對白框頂 470）。現行版見 `b3shop_shots\ninja\shop_tortoise_enter.png`；七格並排沿用第二批「店長私藏」那一級的格子大小。
2. **初見旁白放畫面正上方那一條（`notice`），不放進對白框**：對白框只擠得下兩行（店主一句＋自己回一句），三行框頂就壓到貨架最下面那排價錢（手機橫拿更明顯）。帶欠條的第一次進門，欠條那句晚 2.8 秒才講，兩條不疊。
3. **第二次以後見到同一位只講碎念、自己不回話**（進店那組對話只在第一次）：設計稿同時寫了「碎念取代 `dialogue.shopkeeper`」和「進店＝店主一句＋角色回一句」，我照「第一次＝初見旁白＋進店對話、之後＝碎念」拆。要每次都演進店對話的話改 `openingTalk` 一行。
4. **算例表最後一例（阿福、125、帶會員卡 → 65）跟現在的會員卡對不上**：設計稿照 design2 的「凍結在拿到時的價錢」算，第二批主控裁定後會員卡是「一律 40 條」，所以帶卡在阿福那裡是 40×0.5＝**20**。測試照現在的規則寫，「62.5 進位到 65」那個進位另外用不帶卡的 125 驗了。
5. **最低 5 條對橘貓老闆也生效**（設計稿的算式寫在四位共用的那一段）：只有疊到兩三條的極端情況會變，改了一條第二批的測試（帳本＋批發箱＋零錢罐原本算到 4 條）。
6. **阿福換招的抽法跟祝福「塗鴉本」（b3bless 的 `blessing.ts` 私有 `transformCard`）是同一條新C規則寫了兩份**：兩邊都原地換、罕見以上、壞毛病換常見；我這邊多排除「顯示名字相同」、用分支亂數，那邊用整局亂數分支。要不要合成一支由主控定。
7. **機器人定錨**：四條線合併後要再重錄一次（每條線各自錄的值合起來就不成立）。
8. **樣式 116.0／120 KB**：這條線 +1.7 KB，四條合起來可能超；裁決第 8 條（先整理、不夠調 130）照舊。
9. 集章卡（b3rare）要知道「這一間是哪位店主」：用 `shop.keeper`（沒寫＝橘貓老闆）或 `keeperOf(currentNode(run))`。

## 七、誠實說明

- 實機的價錢核對是拿「引擎開出來的貨架資料」對「畫面上印的數字」，不是另外手算；手算的逐例核對在單元測試（算例表）。
- 手機橫拿是 Chrome 模擬（844×390、觸控、`data-device="phone"`），不是真手機。
- 地圖頭像的裁切框是我在原圖上量、裁出來看過才定的；美術換圖要跟著改 `KEEPERS[..].head`。
- 改 Playwright 腳本時有一次用了 Bash heredoc 跑 Python 小改（暫存區的腳本、內容沒有反斜線，改完有跑過驗證）；倉庫裡的檔一律用 Write／Edit 改。

## 八、`git log --oneline 25952e4d..HEAD`（`coop..HEAD` 會連第〇～二批一起列出來，本分支只有這一筆）

```
644b3408 內容擴充第三批（b3shop）：罐頭鋪店主輪替——橘貓老闆一半、玳瑁婆婆／長毛掌櫃／阿福各六分之一，地圖上看得到臉
```
