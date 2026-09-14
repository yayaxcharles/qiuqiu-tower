# A 稽核：引擎與資料表（coop → main 併回前）

範圍：`git diff main..coop -- src/engine src/content/{cards,enemies,relics,potions,events,glossary}.ts`
立場：唯讀、只找錯。**倉庫裡沒有新增、修改或刪除任何檔案。**

## 一句話結論

**單機球球（`hero:'ninja'`、一個人）在戰鬥裡唯一被改掉的東西是「影子分身」這一張牌。**
把球球拿得到的 108 張牌各帶三張打同一場固定戰、逐字比對兩個分支，124 行裡只有 `yingzi` 那行不同。
真正會咬人的是**存檔鍵前綴沒改回來**——併回當天老玩家的進度與紀錄會靜靜消失。

---

## 高

**高-1　存檔鍵前綴仍是連線版的，併回會清掉所有人的進度與紀錄**
`src/engine/save.ts:25`　`const PREFIX = 'qiuqiu-tower-coop'`
情境：coop 併上 main、部署到 `/qiuqiu-tower/`。遊戲去讀 `qiuqiu-tower-coop/run`（沒人寫過）→
進行中那一局讀不到、「續玩」是灰的；`.../best`、`/difficulty`、`/difficulty-unlocked` 同理，
最佳成績與選過的難度全部歸零。舊資料還躺在 `qiuqiu-tower/*`，但沒有程式去讀，玩家也看不到任何說明。
修法：併回時把這一行改回 `'qiuqiu-tower'`（檔案裡的註解就是這樣交代的）；
`vite.config.ts` 的 `base: '/qiuqiu-tower-coop/'` 也要一起改回去，否則資源全 404。
全庫只有這兩處依賴前綴（`src/` 內 `grep qiuqiu-tower` 只命中 `save.ts`；音效、音量、
教學旗標 `qiuqiu.tutorial` 是另一組鍵，不受影響）。

## 中

**中-1　影子分身整張換掉，單機球球拿到的是另一張牌**
`src/content/cards.ts:445-447`
main：2 費能力，`power/onKill{抽 1、爪力 +1}`，升級再加回 3 血。
coop：**3 費**、`echoFirst`（每回合第一張牌再打一次），升級降為 2 費。
這是整份 diff 裡唯一會改變單機球球戰鬥結果的東西（驗證第 3 條）。
有佐證：`tests/engine/bot.test.ts:48` 的錨值連同註解一起重錄（`turns 48→68、kills 6→11`），
註記「2026-09-12 使用者指定」。修法：不是錯，但請使用者確認單機版也要換；要留舊版就得分角色開兩張牌。

**中-2　事件「不重複＋後集優先」會改掉單機第二、三關的地圖**
`src/engine/run.ts:103`（`chooseNode` 多叫一次 `enterEvent`）、`run.ts:122-137`、`run.ts:515`、
`src/engine/map.ts:315-319`
第一關完全沒變（`fresh === eligible`、一樣只洗一次牌，實測地圖逐字相同）；
但 `enterEvent` 會寫下 `event:<事件>` 旗標，第二關起 `rng.shuffle(fresh)` 洗的是較短的陣列，
消耗的亂數次數跟 main 不同 → **同一顆種子第二、三關的地圖、遭遇、獎勵全部位移**；
`fresh.length < slots` 時還會洗兩次（main 只洗一次），位移更大。
刻意的（註解寫「使用者 2026-09-14」），但請確認使用者知道這條也套用在單機。

**中-3　「噎到」全面改名「中毒」，是單機玩家看得到的改動**
`src/engine/types.ts:21`、`statuses.ts:22-27`、`content/glossary.ts:31`、`enemies.ts`（13 處）、
`potions.ts`（`pepper`、`double_back`）、`cards.ts`（多處）、`mimic.ts:8`
機制一字沒改（`tickPoison` 同一套、`DEBUFFS` 順序也沒動），但名字在單機也跟著換。
全庫沒有漏網的舊字串（`src/` 只剩 `combat.css` 一行註解）。修法：只要使用者點頭。

**中-4　`canPlay` 多了一道 `p.ready` 關卡，單機靠畫面的計時器解**
`src/engine/combat.ts:358`　`if (p.ready) return { ok: false, reason: '已經結束回合了' };`
main 沒有這道關。「撒手鐧」「先睡了」（`kind:'endTurn'`）改成只把出牌的人標 `ready`，
真正收回合交給呼叫端；單機那一側是 `src/ui/screens/combat.ts:1601` 的
`if (allReady(cs)) window.setTimeout(... onEndTurn())`。
情境：那個 `setTimeout` 這一拍沒跑到（覆蓋層打斷、畫面重建、例外），手牌就整排點不動、
理由寫「已經結束回合了」，而單機沒有「撤回結束」可以救。main 不可能發生這件事。
修法：單機路徑在 `playCard` 之後同步收回合，不要依賴計時器。（畫面層歸另一位稽核，這裡只記引擎新增的擋點。）

## 低

**低-1　同一張牌兩段「給自己蜷縮」會被併成一次算，貓步只算一次**
`src/engine/effects.ts:76-84`（`flushSelfBlock`）、`183`
`gainBlock` 每次都套一次 `computeBlock`＝`base + 貓步`（`statuses.ts:37`）；main 兩段套兩次、
coop 併成一次只套一次，炸毛的 `Math.floor` 也從兩次變一次（4+4 相同、5+5 不同）。
現在**兩邊都沒有任何一張牌在同一個 `effects` 陣列裡放兩個 `block`**（110／163 張全掃，各 0 筆），
所以目前沒有影響——是留給未來的坑。修法：補一條把「兩段 block 的牌」釘住預期值的測試。

**低-2　四張共用牌被標成 `hero:'ninja'`，順便把武士也鎖在門外**
`src/content/cards.ts:248`（分身術）、`356`（鐵頭功）、`454`（沾衣十八跌）、`511`（地裂陣）
用意是「不要給菲菲」，但 `hero:'ninja'` 同時排掉 `samurai`。兩個分支的 `src/ui` 都沒有讓玩家選武士
（main 的 `src/ui` 內 `grep samurai` 0 命中），所以現在沒有實害；武士哪天上場就會少四張牌。
修法：改用 `notFor: ['feifei']`（`src/engine/types.ts:282` 已有這欄位，紙袋與影披風就是這樣寫的）。

**低-3　兩張牌與八段事件文案在單機也換了字**
`cards.ts:327` 忍術·吸貓大法→忍術·回復卷軸、`cards.ts:375` 絕學·馬步→絕學·貓步；
`events.ts` 的 `blocked`、`hidden_box`、`sunbath`（選項標籤）、`sparring_cat`、`lost_scroll`、
`noisy_kitchen`、`shortcut_scroll` 文案改寫，`grindstone` 標題「磨到只剩一把刀」→「磨利我的刀」。
效果、數值、旗標一律沒動（正規化後逐字比對過）。純文案，列出來讓使用者確認是他改的。

**低-4　決定性：新檔有被盯到，`src/net/hash.ts` 沒有，也沒人擋模組層級可變狀態**
`tools/engine_pure.test.ts` 用 `readdirSync(src/engine)` 掃全目錄，所以 `coopscale.ts`、`runplayer.ts`、
`vote.ts` **自動涵蓋**，不必另外加名單（這條寫得好）。三個缺口：
(a) 掃描範圍不含 `src/net/`——`hash.ts` 現在乾淨（查過無 `Math.random`／`Date.now`／`performance.now`），
但沒有東西擋下一次；(b) 沒有測試擋模組層級可變狀態，現況只有 `save.ts:37 let store`（倉庫代理，無害）；
(c) 沒有測試擋迭代順序相依。迭代順序我逐處看過：`combat.ts:162/439/442/915`、`map.ts:42/177/334/412`、
`rewards.ts:79/85/146`、`vote.ts:19`、`run.ts:279` 都是由陣列建出來的 `Set`／`Map`（插入序＝決定性）；
`combat.ts:809` 的 `Object.entries(ph.drainPlayerPerTurn)` 吃 `enemies.ts` 字面量的鍵序，也決定性；
`hash.ts:34` 自己有 `.sort()`。**目前沒有違規**，缺的是護欄。

**低-5　單機也會被填 `potionMissedSeats`**
`src/engine/run.ts:415-417`：忍具收不下時單機同時設 `potionMissedSeats=[0]` 與 `potionMissed`。
`src/ui/screens/reward.ts:295` 兩條都讀，行為正確，但同一件事有兩個來源，之後容易改一邊漏一邊。

---

## 沒問題的項目（附核對依據）

| 項目 | 結論 | 依據 |
|---|---|---|
| 單機球球的牌池 | **完全一致**：108 張，起手 3／忍術 61／絕學 36／壞毛病 8，逐張相同，兩個方向的差集都是空的 | 依 `pickable` 重算兩邊牌表 |
| 新增的 53 張牌 | 28 張 `coop:true`（單機 `players<2` 擋掉）＋25 張 `hero:'feifei'`，**一張都進不了單機球球的池**（兩人局才多 25 張） | 同上 |
| 起手十張、起始秘寶 | 不變（`STARTER_DECK` 逐字相同、`startRelicFor('ninja')`＝`blue_headband`） | `cards.ts:760`、`hero.ts`＋引擎定錨 |
| `hidden` 標記 | 兩邊都是 0 張 | `grep -c "hidden: true"` |
| 新秘寶「毒針袋」`backstep` | `pool:'起始'`；`rollRelic` 只抽 常見／大魔物／塔主，事件也沒有指定 `'起始'` → 球球永遠抽不到 | `relics.ts:18`、`run.ts` 的 `CHEST_POOLS`、`grep pool: '起始'` |
| `notFor`（紙袋、影披風） | `relicOk` 對球球一律放行，候選與 main 相同 | `rewards.ts` 的 `relicOk`＋定錨的三池輸出 |
| 魔物數值 | **一項都沒改**：`enemies.ts` 那 34 行全是「噎到→中毒」與註解 | 完整 diff 逐 hunk |
| 秘寶／忍具數值 | 既有項目的數字一項沒動；`potions.ts` 只有兩處改名 | 完整 diff |
| 事件結算 | 既有事件的 `outcome` 一項沒改，只有文案（低-3） | 完整 diff |
| 地圖產生（第一關） | **逐字相同**：菲菲的 4 個事件被 `e.hero` 濾掉、陣列順序不變、只洗一次牌 | 引擎定錨（含結束後的 rng 狀態） |
| 獎勵抽選／商店／紙箱／過關三選一 | 逐字相同（`rollRewards` 的亂數消耗順序也沒變） | 引擎定錨 41 行 0 差異 |
| 存檔相容（main v1 → coop） | **7 種 main 真的會產生的形狀全部吃得下**，欄位逐一搬對、最上層 0 殘留 | 跨分支測試（驗證第 5 條） |
| 反向（coop v2 → main） | 被拒（main 只認 `version:1`）→ `loadRun` 會 `clearSave()`。已寫在 `save.ts:13-24`；併回後不再是問題，但**過渡期不要讓玩家在兩個網址間來回** | 同一支測試 |
| best／unlock／difficulty 格式 | `BestRecord` 四個欄位與 `better()` 完全沒動，只有鍵前綴不同（高-1） | diff |
| `pickVictim` | 只剩一位候選時**完全不擲骰**，單機亂數走向不變 | `actions.ts:698-711`＋定錨 |
| 引擎有無 `Math.random`／讀時間 | 無（`engine_pure.test.ts` 全綠，含三個新檔） | `npx vitest run` |

## 實際驗證（五項行為對照，全部逐字比對）

1. **引擎定錨 41 行**：`newRun`（難度 1/3/5 的血、魚、牌組、秘寶＋整張地圖）、`generateMap` act 1/2/3
   （含結束後的 rng 狀態）、`rollCardChoices` 三池各 12 張、`rollRelic` 三池各 12 件、`rollRewards`
   三種各 4 次、`makeShop`（難度 1/4）、`openChest`、`rollActCards`／`rollActRelics`、`beginCombat`
   三場的魔物血量與起手手牌 → **0/41 不同**。
2. **固定戰鬥 44 場**（4 套牌 × 10 隻魔物＋8 件秘寶各一場）→ 除了「噎到→中毒」字樣與 `yingzi` 那套牌，
   回合數、血量、蜷縮、擊倒、出牌數**一字不差**。
3. **逐張掃全牌表**：108 張球球拿得到的牌各帶 3 張（其中 2 張升級）打同一場固定戰 →
   **124 行只有 `solo yingzi` 一行不同**。
4. **整局機器人 `playRun` 120 局**（同一支 `bot.ts` 策略）→ **118/120 完全相同**；
   不同的是 `audit-27`、`audit-116`。分歧只能來自上面列出的改動，但**逐局歸因未證實**——
   要證實得把機器人的牌組軌跡印出來，我不願為此在倉庫裡加檔案。
5. **存檔跨分支**：用 main 的引擎產生 7 種存檔（開局未走／走過幾步／難度 5／明寫 `hero:'ninja'`／
   `hero:'samurai'`／缺 flags+trail+act+difficulty 的老檔／`advanceAct` 後的關卡交界 `currentNode:null`），
   丟進 coop 的 `checkRun` → **7/7 通過**，`players[0]` 的 hp／maxHp／fish／removeCost／deck／relics／
   potions／hero 全對，最上層殘留欄位 0 個。

## 打開核對過的檔案

`src/engine/`：`save.ts`、`run.ts`、`map.ts`、`rewards.ts`、`hero.ts`、`effects.ts`、`actions.ts`、
`combat.ts`、`statuses.ts`、`types.ts`、`coopscale.ts`、`runplayer.ts`、`vote.ts`、`bot.ts`、`mimic.ts`
`src/content/`：`cards.ts`、`enemies.ts`、`relics.ts`、`potions.ts`、`events.ts`、`glossary.ts`
其他：`src/net/hash.ts`、`src/net/action.ts`、`src/ui/screens/reward.ts`、`src/ui/screens/combat.ts`、
`tools/engine_pure.test.ts`、`tests/engine/bot.test.ts`、`vite.config.ts`、`docs/交給另一個AI檢查_2026-09-14.md`
main 端一律走 `git show main:<路徑>` 或唯讀掛載 `F:\ClaudeWork\qiuqiu-tower`。

## 跑過的指令

```
npx vitest run                    # 163 檔通過／2 略過；1196 條通過／3 略過；11.3 秒
npx tsc --noEmit                  # 離開碼 0，無錯誤
git diff main..coop -- <範圍>     # 逐 hunk 閱讀
```

跨分支對照用的是放在**暫存區**的 vitest 設定（`scratchpad/vt.config.mjs`、`vt2.config.mjs`），
把 `@t`／`@m`／`@c` 別名指到兩個工作目錄的 `src`；測試檔也都在暫存區。
順帶回報：`F:\ClaudeWork\qiuqiu-tower` 目前有別人留下的 `tools/_audit_*.test.ts` 與
`docs/怪物工作檯.json` 的改動，我沒有碰；coop 這邊 `docs/*.json` 的三處變動是 `npx vitest run` 的副作用。
