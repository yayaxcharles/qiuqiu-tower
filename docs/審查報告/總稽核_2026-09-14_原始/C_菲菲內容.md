# 菲菲內容一致性稽核報告（併回單機版前）

倉庫 `F:\ClaudeWork\qiuqiu-coop`，分支 `coop`。唯讀稽核，未修改／還原任何檔案。

## 問題清單（依嚴重度）

### 中（玩家看得到的球球痕跡 / 牌名不對）

1. `src/content/events.ts:73`（事件「留下買路財」打一場結果）：「球球護住魚乾袋，亮出爪子。」玩菲菲時機械換名成「菲菲護住魚乾袋，亮出爪子」——她丟針不亮爪。修法：改成不涉爪子的動作描述，或收進 `FEIFEI_EVENT_LINES` 整句換掉。
2. `src/content/events.ts:338`（事件「村貓的謝宴」結果）：「……吃到肚子圓得像顆球。」圓滾滾的身形比喻是球球的（她設定是瘦長）。修法同上。
3. `src/content/enemies.ts:90`（切磋的白貓 white_duelist 戰鬥台詞，不在原定範圍內，是追第 4 條既知殘留時額外挖到的）：「讓我看看你的爪子。」她從不亮爪。修法：改通用挑戰語，或依 hero 分兩種台詞。
4. `src/content/cards.ts`（`maoqiudan` 忍術·毛球彈／`ehou` 絕學·扼喉，定義在 720-744 行 `FEIFEI_CARD_NAME` 之外）：兩張都沒收進對照表。毛球彈拿掉「忍術·」前綴後仍是吐毛球的動作；扼喉沒有前綴可拿，她手上原封不動顯示「絕學·扼喉」，是掐脖子的手部動作。修法：仿照另外 11 張已改名的牌，各取一個貼她針／毒主題的名字補進 `FEIFEI_CARD_NAME`。

以上 4 條中，1／2／4 是 `docs/進度紀錄_2026-09-14夜間.md` 第六節「菲菲」清單第 2、3 條裡本來就點名、尚未處理的項目；本次在目前原始碼逐一核對確認仍存在，非憑印象。

### 低（其他／未證實）

5. `src/ui/screens/result.ts:65`：落敗訊息的死路備援寫死「球球倒下了。」。目前 `dialogue.defeat`／`feifeiDialogue.defeat` 都保證找得到對應角色的台詞，這行實際打不到，但沒有測試釘住這個假設，日後若改動兩份台詞漏改，玩菲菲落敗會真的印出球球。建議改用 `heroName(...)+'倒下了'`。（子代理讀完 `combat/result/rest/shop/chest/reward/event.ts` 七支畫面後回報，僅此一條，其餘六支皆乾淨——名牌／狀態列／戰報／插圖鍵全部正確呼叫 `cardNameFor`／`lineFor`／`castLineFor`／`heroPronoun`／`heroName`／`eventArtKey`。）
6. `src/ui/screens/heroselect.ts:76`：代表牌名稱用 `keyCard.name` 而非 `cardNameFor(keyCard, chosen)`，繞過慣例，也因變數名不是 `def` 而躲過 `hero_text_scan.test.ts` 的正則（該測試其實有掃到 `src/engine`、`src/content`，並非只掃 `src/ui`，但比對式本身認的是字面 `def.name}`）。`KEY_CARD`（heroselect.ts:22）兩邊各指向自己專屬的起手牌（貓抓／飛針），兩張的 `.name` 本來就是對的名字，**現在沒有顯示錯誤**，純粹是脆弱寫法＋測試涵蓋不到，列出來供留意。
7. `docs/菲菲_全部台詞_檢查用.md` 第 311、352、346、355、376 行（「小兄弟」×2、「看了球球一眼」、「看了球球一會」、「收拾他」）仍顯示球球痕跡，但追進原始碼發現**遊戲本身已經修好**：`src/content/dialogue.ts` 的 `FEIFEI_CAST_LINES`（1063-1069 行）已正確換成「小姑娘」「看了菲菲一眼／一會」「收拾她」，且確實接在真正的顯示路徑上（`src/ui/dialogue.ts:53`、`src/ui/screens/combat.ts:2281`），有 `tests/engine/feifei_night_0914.test.ts` 守著、目前綠燈。問題出在產生這份 doc 的 `tools/dump_feifei_lines.test.ts`（143-153 行）：「關主、換階段、上樓」那段只對 `speaker==='球球'` 的句子呼叫 `lineFor`，塔主／旁白句子原封不動推進輸出，沒呼叫 `castLineFor`，所以文件沒跟上真正的遊戲行為，會誤導看文件的人以為還沒修。**這是文件產生工具的盲點，不是遊戲的 bug**。修法：那段比照真正畫面的呼叫方式補上 `castLineFor`，再用 `DUMP_FEIFEI=1` 重新匯出一次。
8. 進度紀錄第六節「菲菲」清單另外兩條核對後仍未處理，但都屬效能／平衡而非球球痕跡：機器人評分表沒有她的專屬牌特例（`smartbot.ts` 內查無 feifei 相關字樣，起手牌永遠不刪、見血封喉估值可能算兩次）；開場固定預載她全部底圖不分玩家選誰（`src/ui/assets.ts` 的 `preloadArt` 對 sprites/cards/bg 一視同仁，沒有依角色篩選）。
9. `docs/角色三_菲菲_設計稿.md` 第四、九節仍寫她的起始秘寶「後撤步」是「開場 5 點蜷縮」，但 `src/content/relics.ts:6-18` 顯示 2026-09-13 已改版成「毒針袋：每回合開始給所有魔物 1 層中毒」；`src/engine/hero.ts:76` 的註解已同步新版、程式碼本身沒問題，只有這份設計稿沒更新（純文件過期，不影響遊戲）。

## 沒問題的項目（一行帶過＋核對依據）

- `FEIFEI_CARD_NAME`／`cardNameFor` 前綴規則：讀過整份對照表＋實作，忍術·正確拿掉、絕學·正確保留；`tests/content/feifei_cardname.test.ts` 4 條全過。
- 牌標記一致性（hero／coop／hidden）：整份 `cards.ts` 讀過一遍，找不到任何殘留 `hidden: true`；鐵頭功／沾衣十八跌／地裂陣已收回 `hero: 'ninja'`；`cards.test.ts`、`coopcards.test.ts` 全過。
- 起手牌與起始秘寶：`FEIFEI_STARTER_DECK`＋`startRelicFor` 在 `engine/hero.ts`、`content/relics.ts` 對應一致。
- `inHeroCollection`／圖鑑：讀過 `compendium.ts` 全文＋`cards.ts` 判準函式，起手區特判正確，不會混進球球專屬起手牌。
- 卡牌圖鍵：寫小程式比對 `cards.ts` 全部 142 張她拿得到的牌 vs `manifest.json`——**116 張共用牌全部都有 `card/feifei_<id>`，零張退回球球圖**。
- 立繪：`manifest.json` 的 `hero/feifei_*` 有 31 個姿勢，跟球球的 31 個一對一對齊，全部到齊——推翻設計稿「只畫好 14 個」的舊敘述，現況已補完。
- 事件插圖：寫程式比對 42 個事件（38 共用＋4 她專屬）、共 68 個選項結果圖，**開場圖與結果圖零缺漏**；過關結局用到的 `bg/feifei_still_*` 共 12 張全部存在（原定範圍寫「13 張」，核對 `storyslides.ts` 程式實際只引用 12 張，未發現缺圖，應為敘述誤差）。
- 地圖頭像：`icon/map_hero_feifei_{low,mid,top}` 三顆全部存在。
- `deckLeaning` 毒流判準：讀過函式本體，`watchPoisonHit`／`poisonAllyNextAttack`／能力牌(`power`)裡的毒／`feifei_fenshen` 的 `step` 疊毒都有算到；`tests/content/deck_leaning_0914.test.ts` 專門測過能力牌毒霧那條、綠燈。（`damageByStatus`／`execByStatus`／`spreadStatus` 這三張「消耗既有毒」的牌沒算進去，是否該算屬設計取捨，未證實為錯，僅供留意。）
- `glossary.ts`：全文讀過，說明一律用「你」不指名角色，無殘留。
- `storyslides.ts`：全文讀過，`stillKey` 依角色換前綴、切點用結構化旗標而非比對字串，無殘留。
- `combat/result/rest/shop/chest/reward/event.ts` 七支畫面：子代理逐檔全文讀完（含 2520 行的 `combat.ts`），除第 5 條外無其他發現。
- `docs/菲菲_全部台詞_檢查用.md` 全文掃過「球球｜喵｜小兄弟｜收拾他｜讓我看看你的爪子｜亮出爪子｜肚子圓得像顆球」：除第 7 條那 5 行（文件過期非遊戲問題）與第 1、2 條對應的那兩行外，其餘出現的「球球」都是合理引用（序章旁白講她師兄本人、結局旁白兩人同框、「影球球／鏡中球球」是她師兄的假貨這個怪物本來就該叫這名字）。

## 實際打開核對過的檔案／跑過的指令

檔案：`docs/角色三_菲菲_設計稿.md`、`docs/菲菲_全部台詞_檢查用.md`（全文＋關鍵詞掃描）、`docs/進度紀錄_2026-09-14夜間.md`、
`src/content/cards.ts`、`src/content/dialogue.ts`、`src/content/events.ts`、`src/content/relics.ts`（節錄）、`src/content/enemies.ts`（節錄）、
`src/content/glossary.ts`、`src/engine/hero.ts`、`src/ui/storyslides.ts`、`src/ui/compendium.ts`、`src/ui/assets.ts`、
`src/ui/screens/heroselect.ts`（節錄）、`tools/hero_text_scan.test.ts`、`tools/rest_lines_scan.test.ts`、`tools/dump_feifei_lines.test.ts`；
子代理全文讀完 `src/ui/screens/{combat,result,rest,shop,chest,reward,event}.ts`。另寫唯讀 node 腳本比對 `public/assets/manifest.json`
與 `cards.ts`／`events.ts` 的圖鍵覆蓋率（未寫入任何檔案）。

指令：
`npx vitest run tests/content tools/hero_text_scan.test.ts tools/rest_lines_scan.test.ts` → 21 檔、114 測試，全綠。
`npx vitest run`（全專案，額外確認）→ 163 檔通過／2 檔失敗／2 檔跳過，1196 測試通過／3 跳過；失敗的 `tools/_audit_load.test.ts`、
`tools/_audit_sim.test.ts` 與菲菲內容無關（需要外部 `AUDIT_DIR`／`OUT` 環境變數的舊稽核暫存腳本，檔頭自己寫「用完刪掉」），不算進本次範圍。
未跑帶 `DUMP_FEIFEI=1`／`UPDATE_FEIFEI_TEXT=1` 的測試。
