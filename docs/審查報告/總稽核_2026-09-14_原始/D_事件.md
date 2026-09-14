# D 事件系統稽核報告（2026-09-14）

倉庫 `F:\ClaudeWork\qiuqiu-coop`，分支 `coop`。唯讀稽核，未修改／還原任何檔案。

## 一、42 個事件逐一結論

| id | 結論 |
|---|---|
| feifei_trace | 標籤／outcome／旗標核對一致；`feifei_chasing` 旗標沒人讀，但事件文案已於 9/14 改成如實描述效果的標籤，屬已知空旗標，非結算問題 |
| feifei_brew | 一致；稀有絕學池對菲菲有 16 張，不缺牌 |
| feifei_pouch | 一致 |
| feifei_signal | 一致；`addCard 'shibai'`＝「睡過頭」，正規壞毛病牌 |
| daxia_teach | 一致；絕學池兩職業都 ≥12 張，`chooseCard n:3` 夠抽 |
| toll | 數字/旗標一致；**中-1**：戰鬥結果文字「亮出爪子」對菲菲是動作殘留 |
| robin | 一致 |
| rescue | 一致 |
| blocked | 一致 |
| seclusion | 一致 |
| hidden_box | 一致；`addCard 'zhongji'`＝「中計了」對得上標籤 |
| sunbath | 一致 |
| rat_stall | 一致；`gamble p:0.5` 對「50%」 |
| lost_kitten | 一致 |
| old_well | 一致 |
| broken_shrine | 一致；`addCard 'zouhuo'`＝「走火入魔」對得上 |
| sparring_cat | 一致（9/14 已改字，`FEIFEI_EVENT_LINES` 同步更新） |
| cat_tower | 一致 |
| lost_scroll | 一致 |
| noisy_kitchen | 一致 |
| mirror_hall | 一致；菲菲版整句改寫（`FEIFEI_EVENT_TEXT`）三句全覆蓋，鏡中球球剪影不會露出 |
| sleeping_guard | 查證後排除疑慮：`fish 70` 寫在 `fight` 外層看似會提前發，但 `applyRunEffects` 的 deferred 機制（`run.ts:1008-1019`）會把它跟 `fight` 一起延到打贏才發，跟標籤「勝利後」一致，非 bug |
| medicine_cat | 一致 |
| stuck_kitten | 一致 |
| gambling_rats | 一致；`gamble p:0.7` 對「70%」 |
| heavy_door | 一致 |
| old_master_ghost | 一致（「升級一張牌」故意不寫「至多」，使用者 2026-09-11 裁定） |
| catnip_field | 一致 |
| weapon_rack | 一致 |
| crying_wall | 一致 |
| fish_pond | 一致 |
| training_hall | 同 sleeping_guard：`relic '大魔物'` 寫在 `fight` 外層，一樣被 deferred 機制延到打贏才發，非 bug |
| moon_window | 一致 |
| greedy_merchant | 一致；`addCard 'neili'`＝「內力不足」對得上 |
| toll_again_paid | 一致 |
| toll_again_fought | 一致；`orange_bandit_pair`（`acts:[]`）只被本事件直接引用，不進一般戰鬥池 |
| rescue_return_herb | 一致 |
| rescue_return_fish | 數字/文字一致；**低-1**：`addCard 'dazed_card'`（眼冒金星）是 `combatOnly` 戰鬥雜牌，詳下 |
| robin_feast | 數字一致；**中-2**：結果文字「肚子圓得像顆球」是球球名字的哏，菲菲版沒意義 |
| moving_rat | 一致 |
| grindstone | 一致；`maxHp n:-8` 只夾住當前生命不超過新上限，不會額外扣血 |
| shortcut_scroll | 一致 |

## 二、問題清單

**中-1** `src/content/events.ts:73`（toll 選項二結果）／`eventTextFor` 機械換字後菲菲仍講「亮出爪子」。她的戰鬥風格是丟毒針不是用爪（`docs/交給另一個AI檢查_2026-09-14.md` 開頭即定義），此句在 9/14 進度紀錄「還沒做的」清單裡已被開發者自己列為待改（跟「肚子圓得像顆球」同一條，見下）。修法：比照 88 句引號台詞的作法，把這句敘述也收進整句替換表，或至少把「亮出爪子」改成中性動作。

**中-2** `src/content/events.ts:338`（robin_feast 選項一結果）／敘述句「吃到肚子圓得像顆球」機械換成菲菲後保留「像顆球」的哏，讀起來像巧合而非球球名字的雙關，跟「亮出爪子」是同一批開發者已知、尚未處理的殘留（`docs/進度紀錄_2026-09-14夜間.md` 第六節）。修法：改一個不靠「球」字的比喻。

**低-1** `src/content/events.ts:333`（rescue_return_fish 選項二）／`addCard cardId:'dazed_card'` 把 `combatOnly:true` 的「眼冒金星」永久塞進玩家牌組。`src/engine/types.ts:235` 附近的註解與 `src/engine/hero.ts:105-111` 的 `pickable()` 都明講這張牌「任何池子都不進、不會出現在事件」，`compendium.ts:46-55` 與 `debug.ts:107` 的「我的牌」清單也把它濾掉——結果是玩家牌組裡真的多一張圖鑑與除錯頁都查不到的牌。**這不是新發現**：`docs/審查報告/程式稽核_2026-09-04午後.md` 低-7 十天前就抓過同一行（當時事件名稱不同，同一個 `dazed_card` 引用），當時已建議「改塞正規壞毛病（如 `shibai`）或接受並改注解」，兩者都沒做，維持低分。修法二選一：換成 `shibai`／`zhongji` 等正規壞毛病牌；或接受現狀並把 `types.ts` 的 combatOnly 注解改掉，不要再說「不會出現在事件」。

**未發現高嚴重度問題**（結算炸掉／給錯東西／連線兩台不同）。

## 三、查過沒問題，附依據

- **圖片資產**：42 個開場圖 `bg/event_<id>`、68 個 `resultArt` 鍵，球球版與（38 個共用事件對應的）菲菲版全部存在於 `public/assets/manifest.json`，且全部指向硬碟上真實存在的檔案（腳本核對，0 缺漏）。缺圖時的退路（`src/ui/assets.ts:158-163` `eventArtKey`／`event.ts:85-88` `eventArt`）是「菲菲版缺就退回球球版，球球版缺就整塊不顯示」，不會顯示灰剪影。
- **事件排隊／前後集／不重複／職業限定**：`run.ts` 的 `enterEvent`（122-136）、`advanceAct`（514-516）與 `map.ts` 的 `generateMap`（`eligible` 過濾 302-319）三處邏輯跟 `docs/進度紀錄_2026-09-14夜間.md` 第七節描述完全對得上；`fixedFloor` 全庫只有 `daxia_teach` 一個；5 個 `requiresFlag` 都對得到某個選項寫入的同名旗標（僅 `feifei_chasing` 是有意保留的空旗標）。
- **戰鬥遭遇 id**：`toll`／`sleeping_guard` 用的 `orange_bandit`、`gambling_rats` 用的 `rats3`、`training_hall` 用的 `wood_dummy`、`sparring_cat` 用的 `white_duelist`、`mirror_hall` 用的 `mirror_duel` 全部存在於 `enemies.ts`，且都有 `_a2`／`_a3` 加強版（`run.ts:1118` 的 `${encounterId}_a${act}` 會自動換），二三關重遇不會停在第一關強度。
- **連線投票結算**（`ui/screens/event.ts` ＋ `engine/vote.ts`）：選項投票同則直接採用、不同擲骰（`settleVotes`）；`costFish` 兩人各付各的（`event.ts:470-471`）；`heal`／`damage`／`fish`／`relic`／`addRandomCard` 等效果對每個站著的座位各跑一次、各自抽各自的（`event.ts:483-484`）；倒下的人不能投票、不計入 `allVoted`、也不跑效果（`iDown`、`onlyStanding`）；有人倒下時選到「打一場」，倒下那台會照站著那位的戰鬥結果進場（`fightOf`，`event.ts:500`）。沒發現會兩台分岔的路徑。
- **牌池／秘寶池**：實際計算（腳本核對 `cards.ts`／`relics.ts`），事件用到的 `絕學`／`忍術`／`壞毛病` 各稀有度、`常見`／`大魔物` 兩個秘寶池，兩個角色可抽張數最少的組合是「絕學·稀有」對球球 12 張，其餘都在兩位數，沒有池子見底風險。
- **`docs/事件文案.md`**：逐字比對過，538 行內容與目前 `events.ts` 完全同步，含 9/14 當天才改的「意味不明」「墊著布」「亮出爪子」（原句仍在，因為這份文件是照原文產生，不代表已修正）等最新字句，沒有過期段落。
- **`debug.ts` 事件頁**：`renderEvents()`（71-102 行）只用 `!e.hero || e.hero === hero` 過濾，球球看 38 個、菲菲看 42 個（38 共用＋4 專屬），沒有依 `acts`／`requiresFlag`／`fixedFloor` 再篩掉任何事件，兩個職業都攤得到全部事件與每個選項的結果圖。

## 四、測試結果

`npx vitest run tests/content tests/engine/event_variety_0914.test.ts tests/engine/coop_event_relic_hero.test.ts`
→ **21 個測試檔全過、121 條測試全過、0 失敗**（1.04s）。

## 五、實際打開核對過的檔案／跑過的指令

檔案：`docs/交給另一個AI檢查_2026-09-14.md`、`docs/進度紀錄_2026-09-14夜間.md`、`src/content/events.ts`（全）、`src/engine/types.ts`（全）、`src/engine/run.ts`（enterEvent/advanceAct/applyRunEffects/resolvePendingAfterFight 段落）、`src/engine/map.ts`（全）、`src/ui/screens/event.ts`（全）、`src/engine/vote.ts`（全）、`src/ui/assets.ts`（eventArtKey 等段落）、`src/content/dialogue.ts`（`FEIFEI_EVENT_LINES`／`FEIFEI_EVENT_TEXT`／`eventTextFor` 段落）、`src/ui/screens/debug.ts`（1-110 行）、`docs/事件文案.md`（全）、`public/assets/manifest.json`（腳本讀取）、`src/content/enemies.ts`（grep）、`src/content/cards.ts`（grep＋腳本解析）、`src/content/relics.ts`（腳本解析）、`src/engine/hero.ts`（pickable）、`src/ui/compendium.ts`（grep）、`docs/審查報告/程式稽核_2026-09-04午後.md`（低-7 段落，交叉比對 dazed_card 舊案）。

指令：`git branch --show-current`／`git log`／`git status`（前後各一次）；三支 node 腳本分別核對「manifest 圖片鍵是否存在＋是否有實體檔」「卡池/秘寶池按 hero 過濾後的張數」；`npx vitest run tests/content tests/engine/event_variety_0914.test.ts tests/engine/coop_event_relic_hero.test.ts`。

## 附註

稽核途中發現工作目錄多出 `tools/_audit_load.test.ts`、`tools/_audit_sim.test.ts` 兩個未追蹤檔案（建立於 17:17，早於本次稽核所有寫入動作）。本次稽核全程唯讀，未建立、修改這兩個檔案，判斷是併行跑在同一倉庫的其他稽核／子代理留下的暫存腳本（`docs/交給另一個AI檢查_2026-09-14.md` 本身就教「在 tools/ 下開 _xxx.test.ts，用完記得刪」），原樣保留未動。
