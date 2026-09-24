# 推前審查（唯讀）：`coop..w0923-int`（HEAD `3054127d`）

審查人：唯讀審查代理，2026-09-23。沒有改倉庫任何檔、沒有 checkout／stash／commit／build／全套測試。

## 結論一句話

**沒找到「高」**（會壞遊戲、卡死、存檔壞、連線分岔的）。三處手動解的衝突都對。找到的都是「低」或「資訊」，共 6 條，列在最後，可以推完再修。

---

## 我做了哪些檢查（證據）

- `npx tsc --noEmit -p .`：零錯誤。
- 指定測試檔跑了四批，共 **81 個檔、701 條，全綠**：
  - 合併相關：`coop_story_art`、`coop_slides`、`coop_leave_0923`、`story_overlay_0923`、`seat_feedback_0923`、`polish_0923`、`applied_guard_0923`、`mate_here_0923`、`phone_landscape_0923`、`background_finish_0923`、`motion_result`、`hero_video`、`fengfeng_wiring`、`coop_partner_lines_0923`
  - 連線與引擎：`tests/net` 整個資料夾、`coop.help`、`curse_log_0923`、`fengfeng_0923`、`combat_batch_hold`、`coop_screen_flow`、`combat_motion_flow`、`projectiles`、`toss_motion`
  - 其他：`tests/content` 整個資料夾、`node_import_declarations`、`audit_fixes_0914`
  - 每批跑完 `git status` 都是乾淨的。
- **合併有沒有漏東西**：寫了一支腳本（`review_tmp\lostlines.py`，輸出在 `review_tmp\lostlines_out.txt`），把七條分支 `coop..分支` 的每一行新增，拿去整合分支的同一檔案裡找。
  - 找不到的行全部是「被後來那一筆刻意蓋掉」的舊寫法，沒有一行是合併時弄丟的：
    - 劇情那邊的 `after`／`hasCoopScene` 被主控改成 `done`＋`STORY_LITERAL`；
    - 修正那邊的牌名、圖鑑三元式被整理那邊的 `Record<Hero,…>` 取代；
    - 整理分支底下那份舊版 polish 被 polish 後面的提交蓋過；
    - 建置那邊的「暫用小圖示」註解被美術那邊換掉。
  - 分支刪掉的行，也沒有一行在整合分支裡又冒出來。
- **大小預算**：用主控 12:07 打好的 `dist`（HEAD 是 11:56 提交的，我假設這份 dist 是 HEAD 打的）跑 `python tools/check_size.py`（只讀）：
  - 首載程式 673.6／680 KB（99.1%）
  - 樣式 92.3%
  - 圖片 97.1%
  - 首載總計 11.08／11.30 MB（98.0%）
  - 結果「大小 OK」。
- **素材路徑**：寫了一支腳本（`review_tmp\unref.py`）檢查：
  - 清單 2027 條路徑在 `public/` 全部存在；
  - 清單分類裡沒有任何動作圖（雷 7 沒踩）；
  - 四個 `*-motion-data.json` 引用的圖都在（含四張擲出圖），飛爪那張在 `public/assets/motion/projectile/`；
  - 未引用圖只有 favicon 和兩張封封 `_r2`，那兩張在 coop 版本裡就有了，不是這批造成的。

---

## 六個重點逐條結論

### 1. 兩邊各自對、合起來錯？（`settle`、`playMotion`、飛行物命中、同伴牌讓位、按住放大）——沒找到高／中

- **`settle` 擋下／被刺那段**：`guarded = myFeedback.blocked - (heldHere?.block ?? 0)` 語意正確。
  - 被刺那一下走 `damagePlayer(direct, throughBlock)`，那一支也會呼叫 `noteBlocked`（`actions.ts:244`），所以 `blockedTotal` 已經含被刺時蜷縮擋掉的量，扣掉延後那一份剛好。
  - `thornPricks` 的正規式沒有句首錨點，連線時帶名字的句子「球球的蜷縮擋下了」也抓得到。
  - 單機時結果跟 polish 原本的 `blockedAmount(fresh, '蜷縮擋下了')` 一樣。
- **`app.ts` 序章**：`playSlides(proSlides, done)`／`playDialogue(pro, done, undefined, STORY_LITERAL)`，兩邊的意圖都保住了。
- **`storyslides.ts` 匯入**：`fengfeng-dialogue` 本來就被 `dialogue.ts` 靜態匯入，不會多出分包，也不會新增循環相依。
  - 六組搭檔的圖鍵跟清單逐一對得上（`coopStoryKey` 照字母排序：dangdang < feifei < fengfeng < ninja）。
- **`playMotion`**：polish 的殘影收尾、近戰接非近戰平順退回，跟 net、tidy 沒有交集。
  - 退回途中被 `idleMotion` 收掉時，圖層會拿掉，下一招一定重設 `transform`，不會留下位移。
- **飛行物命中回呼**：`playProjectile` 用畫面刷新回呼驅動，第一幀一定是非同步的，所以 `revealThorns` 在迴圈後面才指定也來得及。
  - 目標節點不見時，`--thornFlights` 照樣會減。
  - 戰鬥結束時，清理那段（`combat.ts:952` 起）會把 `motionPendingStatus`／`motionPendingPlayer` 一起清掉。
- **丟擲牌等飛到才掛狀態 × 美術的空手擲出**：`throwing` 等於 `shot !== undefined`，所以 `throwFlight` 成立時一定會進 `playThrow` 那一段，不會出現「掛了等待卻永遠等不到」。
  - `toss` 的出手時點是從靜態匯入的動作資料讀的，擲出圖還沒下載時也算得出來。
  - 替身動作和 `throwElapsed`／`playThrow` 用的是同一個動作變數，算出來的時點一致。
- **同伴牌讓位**：純樣式（`:has()`），跟其他分支沒有交集。舊瀏覽器不支援 `:has()` 只是不讓位，不會出錯。
- **按住放大**：見第 5 點。

### 2. 連線決定性——沒找到會分岔的

- **畫面層沒寫引擎狀態**：掃過 `src/ui` 的整份差異，沒有對 `cs`／玩家／魔物欄位的指定。
  - `shownEnemy`／`shownPlayer` 都是展開成新物件，不動原本的狀態。
  - 唯一動到引擎的是 `rescueEnemyTurn`，而且是刻意的：它的走法跟 `endTurn` 一模一樣，兩台會停在同一個地方。
- **`blockedTotal`／`dodgedTotal`**：
  - 寫的地方只有 `actions.ts` 三處擋下、一處閃過；
  - 讀的地方只有 `seat-feedback.ts`；
  - `net/hash.ts` 是逐欄列出來算的，沒收這兩個；
  - 戰報也不進指紋，`hash.ts` 對旗標只收 `event:`／`sequel:` 開頭的。
- **`here` 進場訊息**：
  - 只用來決定「能不能替同伴收回合」，不影響正常流程，所以一台在序章、一台已經進場時**不會卡**。
  - 同伴比我先進場也沒問題：`mateFight` 記的是收到過的最大場次，我進場之後拿自己的 `fight` 去比。
  - 房號中繼斷線再接回：斷線期間送的訊息排在 `HISTORY` 裡，接回時會補送，所以 `here` 不會掉。
  - 中繼（`worker/src/index.ts`）不看訊息內容，原樣轉送，不用改中繼。
- **舊版分頁接新版分頁**：會被清楚擋下，不會靜靜壞掉。
  - 中繼比對打包編號，對不上就用 4400 拒絕，畫面寫「版本不一樣…兩邊都重新整理」；
  - 貼碼直連時，`unpackSignal` 比對打包編號，對不上就丟錯誤訊息；
  - 雲端的打包編號是 `GITHUB_SHA`，每一版都不同。
- **規則改動的相容性**：藏鋒取高、雜牌不觸發、飯糰忍具變灰都改在引擎裡，兩台都跑同一版（上一條已經保證），不會分岔。
  - `pickable` 多擋起手牌不會改變抽獎的亂數消耗：所有呼叫端都指定了「忍術／絕學／壞毛病」池，起手牌本來就不在候選名單裡。

### 3. 存檔——單機一切照舊

- 三處都加了「局面是兩人局就不寫」：`save()`（`app.ts:323`）、戰鬥收場記成績（`app.ts:534`）、結算畫面（`result.ts:36`）。單機永遠是 `players.length === 1`，行為不變。
- 舊存檔（第 1 版）在 `save.ts` 讀檔時會先搬進 `players[0]`，而且驗證要求 `players` 至少一位，所以 `.players.length` 不會碰到 undefined。
- 單機要開兩人局，只有「貼局面碼」這一條路。可是連線時狀態列的分享鈕只給種子（`hud.ts:181` 傳 `undefined`），做不出兩人局的局面碼，所以實際上走不到。
- 拿掉的 `UNLOCK_KEY`、`damageDealt` 都不進存檔。`CombatState` 本來就不存檔。
- 「新的一局」、「續玩」、連線開局三個入口都改叫 `adoptRun`，前後等價：
  - `setLocalHero`／`setSfxHero` 收到 `undefined` 都當球球；
  - 座位先設好才同步劇情情境；
  - 除錯頁是在 `leaveCoop` 之後才指定臨時局，不會被新的 `leaveCoop` 清掉。

### 4. 新素材——都在，首載在預算內

- 新增的 32 個檔都在 `public/`，清單路徑沒有一條落空，動作圖也沒有登記在分類裡。
- 24 張連線劇情圖不會被開場預載拉進首載：`heroArtUrls` 會跳過 `bg/<角色>_coop_` 開頭的鍵。
- 預算都在上限內，但首載程式只剩 6.4 KB 的餘裕（見資訊-6）。

### 5. 按住放大的觸控處理——不會吃掉滑鼠點擊

- 滑鼠按下就直接返回，從不裝上攔點擊的監聽，所以桌機完全不受影響。
- 手指輕點不到 320 毫秒就放開，計時器會被取消，點擊照常出牌。
- 攔截用的是「捕獲階段＋停止傳遞」。依現行 DOM 規格，事件打到節點本身時，捕獲監聽先執行，而且會擋住同一節點後面的一般監聽，所以 `cardNode` 的 `onClick` 不會被觸發（`dragplay.ts` 用同一招，已經在實機驗過）。
- 有兩個小邊角，列在低-3。

### 6. 會丟例外的新路徑——沒找到

- 檢查過這些新路徑：
  - 空陣列：`coopSlides`／`groupsAtBreaks` 都先處理空的情況；
  - 查不到的：`enemyChips` 的 `def`、`shownPlayer`、`refreshPlayerStatus`、`thornPricks`、`potionBlockedReason`；
  - 全部 35 支忍具的 `effects` 都不是空陣列，所以不會被 `every` 誤判擋下；
  - `showPeek` 各種找不到節點的情況；
  - `video.ts` 的收尾閉包：`watchdog` 在同一個函式裡同步宣告，閉包是之後才被叫到，不會踩到「還沒宣告」。
- 劇情疊層的「提早返回」都在登記之前；`unlockScreen` 在鎖為 0 時不會減成負數。

---

## 發現（全部是低或資訊）

| # | 嚴重度 | 位置 | 觸發情境 | 為什麼會錯 | 建議修法 | 信心 |
|---|---|---|---|---|---|---|
| 低-1 | 低 | `src/ui/screens/combat.ts:3370`、`:3374`（同型還有 `:3210`） | 同一位在前一個丟擲物還沒飛到時，又丟第二張打到帶刺的魔物（出牌不鎖演出，`canAct` 不看動作，約 0.3 秒內連出兩張就會發生） | `motionPendingPlayer.set` 直接**蓋掉**第一下還沒演的量（不像 `motionPendingDamage` 是累加）：①第二次結算時血條先掉第一下的量；②第一下飛到時 `delete` 刪掉的是第二下的暫存，飄的卻是第一下的數字；③第二下飛到時 `delete` 回 false 就直接返回，第二下的「擋住 N／-N」、紅閃永遠不演。血條最後是對的，只是中間飄的數字和閃光對不上。狀態那張表（`:3210`）同樣是蓋掉，連丟兩次時第一下的狀態會提早亮 | `hp`／`block` 改成累加；每一趟記一個序號，飛到時只扣自己那份、扣完才刪 | 可能（讀程式推的，沒實機重現） |
| 低-2 | 低（設計取捨，主控已裁定過） | `src/net/session.ts:382`、`combat.ts:997` | 同伴停在序章、塔頂段落、關主門、事件結果頁掛機不點 | 同伴沒進場就一律不准替他收回合，也沒有上限，所以同伴掛在劇情裡時，這邊只能等，或是回標題 | 可以接受的話不動；想保留一條退路，就給「沒進場」另一個比較長的上限（例如三分鐘），並在按鈕旁寫「同伴還在看劇情」 | 確認（照程式） |
| 低-3 | 低 | `src/ui/cardpeek.ts:97-104`、`:107` | ①按住超過系統長按門檻（安卓約 0.4～0.5 秒、iOS 更長）：瀏覽器改送右鍵選單（已經擋掉），不送點擊，攔截要到放開後 450 毫秒才撤，這段時間內再點同一張牌，那一下會被吃掉；②觸控筆遇到瀏覽器作廢這一下（`pointercancel`）時沒有 `touchend`，攔截一直留著，下一次任何地方放開再等 450 毫秒才撤，這段時間內那一下也被吃掉；③320 毫秒比系統長按短，0.32～0.5 秒的慢點會變成放大、不出牌 | 攔截靠「等 450 毫秒」撤，沒有在「新的一次按下」時撤 | 在 `pointerdown` 開頭、還沒放大時先 `disarm()`（新的一下就不該被上一次攔）。③如果使用者覺得慢點變成放大很煩，把 `PEEK_HOLD_MS` 調到 450 左右 | 可能（沒有真手機，推論） |
| 低-4 | 低 | `combat.ts:3842`→`:3861`；`combat.ts:2648-2649`、`:2702` | ①最後一個舉手的那一批，在算出 `completedTurn` 之前就丟例外（例如 `matePlays`）；②`startEnemyTurn` 在 `beginEnemyTurn` 之前就丟例外（`snap`） | ①外層防護拿不到收尾那一支，只做 `release()`，這台就一直不跑魔物回合；②救援那段看 `cs.enemyActing` 是 false，就不補跑魔物回合。兩種都會讓兩台分岔、跳紅色橫幅（net 報告寫過「寧可跳紅色橫幅」，所以不算靜靜壞掉）。出事的機率極低 | 救援時多判一種情況：`allReady(cs) && !cs.pending && cs.phase === 'player' && !cs.enemyActing` 成立，就照 `endTurn(cs)` 補跑一次。外層把 `completedTurn` 的判斷挪到最前面 | 可能（機率很低） |
| 資訊-5 | 資訊 | `tools/check_size.py`，首載程式 | 下一批台詞或程式進來 | 首載程式 673.6／680 KB，只剩 6.4 KB。推送閘門現在會跑這項檢查，下一次加字就會被擋下 | 先想好分包或調預算，別等推的時候才撞到 | 確認（實跑） |
| 資訊-6 | 資訊 | `src/net/ws.ts:168` | 前景分頁主執行緒一直卡（每拍都晚半拍以上），同時線真的斷了 | 每一拍晚掉的時間都被扣掉，這時要等約 1.6 倍時間才會報斷線（原本約 3.5 秒）。只是晚一點報，不會不報 | 不用改；真要修，就給每一拍能扣的量設上限 | 可能 |

## 沒做的與原因

- 依規定沒有跑全套測試和打包。大小預算用的是主控 12:07 打好的 `dist`：我**假設**它就是 HEAD `3054127d` 打出來的，沒有另外驗證。
- 沒有開瀏覽器或真手機實機驗證（這次交辦是讀程式審查）。低-1、低-3 是推論，不是重現出來的。
- 雲端型別檢查（沒有 `@types/node`、加 `--preserveSymlinks`）沒有模擬，這一項由推送閘門在推的時候會自己跑。只掃過新測試有沒有用到沒宣告的 `node:` 函式和 `process`，沒發現問題。
