# 連線層獨立審查（B）2026-09-14

倉庫 `F:\ClaudeWork\qiuqiu-coop`，分支 `coop`。唯讀，未改任何檔案。

**結論**：單機路徑守得住（見第五節，逐一核對 123 個呼叫點，0 個會在 `session` 為 null 時丟例外或改變單機行為）。
找到 **高 1 條、中 3 條、低 6 條**。沒有找到會讓兩台狀態分岔的路徑。

---

## 一、高

### 高-1　連不起來時畫面什麼都不說，大廳永遠停在「正在接上…」
`src/net/rtc.ts:64-71`（`whenOpen`）、`84-90`（`hostRoom.accept`）、`99-107`（`joinRoom`）

`wrap()` 裡才掛 `connectionstatechange` 與 `close` 的監聽，而 `wrap()` 要等 `whenOpen(ch)` 解出來才會被呼叫。
`whenOpen` 只有在資料通道丟 `error` 時才拒絕——**ICE 談判失敗不會觸發它**。

- 主機：貼上回應碼 → `accept()` → `await whenOpen(ch)`。連不起來時這個承諾**永遠不會有結果**，
  `lobby.ts` 的 `.catch(fail)` 就永遠不會被叫到，畫面停在「正在接上…」，紅色橫幅也不會出現。
- 加入的人：`ready = got.then(...)`，`got` 等的是 `datachannel` 事件；連不起來就永遠不會來，
  畫面停在「把這串回應碼傳回去給對方」，看起來像在正常等待。
- 兩條路都**沒有逾時**。玩家唯一的出路是自己按「← 回標題」，但畫面沒有任何字告訴他該這麼做。

這不是 TURN／對稱型 NAT 那個問題（那個不在範圍內），是**錯誤回報的缺口**：任何原因連不起來都一樣無聲。

一句修法：在 `hostRoom`／`joinRoom` 建 `pc` 的當下就掛 `connectionstatechange`
（`failed`／`closed` 時 reject），並給 `whenOpen`／`got` 各加一個 20 秒逾時，讓 `lobby.ts` 的 `fail()` 接住。

---

## 二、中

### 中-1　紅色橫幅撕不掉，會跟著蓋到之後的單機那一局
`src/ui/screens/lobby.ts:57-69`、樣式 `src/ui/styles/screens.css:1467`

`troubleBanner` 把橫幅 `append` 到 `document.body`，**全專案沒有任何一行會移除 `.net-trouble`**
（grep `net-trouble` 只有兩個寫入點、一個樣式）。它是 `position: fixed; top: 0; z-index: 9999`。

情境：連線分岔或斷線 → 橫幅出現 → 玩家走結算畫面按「回到村子」→ 標題 → 「新的一局」（單機）。
`leaveCoop()` 只清了 `app.coop` 與 `app.seat`，橫幅照樣壓在畫面最上緣，寫著「連線出問題：…」。
不重新整理頁面就消不掉。狀態沒被改到，但這是併回 `main` 之後唯一一個「單機看得到連線遺留物」的地方。

一句修法：`App.leaveCoop()` 裡加一行 `document.querySelector('.net-trouble')?.remove()`。

### 中-2　貓窩：最後一個做完的那台會排兩個回地圖的計時器
`src/ui/screens/rest.ts:79` 與 `240`

`onRunApplied` 的迴圈裡先呼叫 `afterAction()`，那支在 `allDone()` 成立時排了一個 900／1500 毫秒的
`app.backToMap()`；迴圈結束後 `line 240` 又排了一個 700 毫秒的。於是最後完成的那位會跑兩次
`backToMap()` → 兩次 `show('map')`，地圖被連畫兩次（第二次把第一次註冊的 `onPick` 蓋掉、再排一次補跑）。
目前不會壞掉（`save()` 在連線局本來就直接 return，補跑有 `replayed` 擋著），但這是靠兩層保險互相掩護。

另外這兩個計時器都**沒有進 `app.disposers`**，而單機那條（`line 81-82`）有。換畫面之後照樣會響。

一句修法：`afterAction` 在連線分支不要自己排，統一交給 `line 240-241`，並把它推進 `app.disposers`。

### 中-3　`hold()` 有三條路會漏掉配對的 `release()`
`src/ui/screens/combat.ts:1763`（`step()` 開頭的 `app.cs !== cs` 早退）、`2451`（收牌計時器的早退）

`onApplied` 裡 `session.hold()` 之後，只有 `runEnemyTurn` 正常跑完（`1757`／`1771`）才會 `release()`。
畫面在魔物回合中途被接手（有人倒下 → `checkOver` → 1.3 秒後 `afterCombat` 把 `app.cs` 設成 null）時，
`step()` 直接 return，會話就一直 `held`。

實際影響有限：`drain()` 是先判「這一場打完了沒」（`over`）再判 `held`，而下一場 `attach(cs)` 會把
`held` 設回 false，所以目前不會卡死。但這條保命線靠的是另一支的副作用，很脆。

一句修法：`checkOver()` 裡 `session?.attach(null)` 的同一行加上 `session?.release()`。

---

## 三、低

- **低-1**　`src/net/rtc.ts:52-54`：連線 `failed`／`disconnected` 只通知，**沒有 `pc.close()`**，
  `RTCPeerConnection` 不會釋放。`hostRoom()`／`joinRoom()` 中途失敗（貼錯碼、逾時）也一樣，
  大廳按「重來一次」會再開一個新的 `pc`，舊的留著。一句修法：`die()` 裡順手 `pc.close()`。
- **低-2**　`src/net/rtc.ts:53`：WebRTC 的 `disconnected` 是**可以自己恢復**的暫時狀態，這裡當成致命。
  現在沒有斷線重連，所以判死也說得通，但要知道這會把「網路抖一下」變成整局結束。
- **低-3**　`src/ui/screens/reward.ts:69-90` 與 `265`：`settleRelics`／`maybeGo` 讀的 `offers` 宣告在
  `line 265`，比它們早退的那一段（`line 155-171`，塔主信物）**晚**。若那個早退真的跑到，
  之後任何 `onPick('relic')`／`onRunApplied` 都會丟 `ReferenceError`（暫時性死區）。
  **未證實可達**：`app.ts:410` 對 `rewards.kind === '塔主'` 會提前 return 走過關畫面，
  所以 `reward.ts:154` 的 `r.kind === '塔主'` 目前是死路；`debug.ts` 的跳轉也只跳 rest／chest／shop／result。
  要確認得從除錯頁手動構一個塔主戰利品送進 `show('reward')`。一句修法：把 `const offers` 上移到回呼註冊之前。
- **低-4**　`src/ui/screens/actclear.ts:176` 與 `79`：同一件秘寶 `takeRelic` 被叫兩次（`rp.forEach` 一次、
  `done()` 裡又一次）。`takeRelic`（`run.ts`）第一行擋重複、沒有副作用，所以目前無害；
  但它讓兩台機器對自己那一件各多跑一次，哪天 `takeRelic` 改成非冪等就是分岔。
- **低-5**　`src/ui/screens/shop.ts:271`：`onRunApplied` 把不是 `done` 的動作一律播買賣音效，
  `swap`（換忍具，由 `potionswap.ts:63` 送出）會被誤播成「買到東西」的聲音。純音效。
- **低-6**　`src/net/code.ts`：連線碼裡沒有個資、路徑、存檔內容，只有 SDP。但 SDP 本身含**內網 IP 與
  STUN 問到的對外 IP**，玩家會把它貼進 LINE。這是手動貼碼這個設計的固有代價，不是 bug，
  只是「連線碼有沒有帶到不該帶的東西」這一題的誠實答案。

---

## 四、沒問題的項目（核對依據）

- **分岔來源**：`src/net/` 與 `src/engine/` 全域 grep `Math.random`／`Date.now`／`performance.now` → **0 筆**。
  畫面層只有三處：`combat.ts:661,2014`（音高抖動）、`shop.ts:33`（老闆台詞）、`lobby.ts:97`（主機挑種子，
  挑完就用 `start` 宣布出去），都不進遊戲狀態。`combat.ts` 的 `mateIdleMs()` 讀時間，但只決定一顆按鈕
  顯不顯示，真正收回合是按下去送出的 `force` 動作。
- **會推進亂數的畫面只進一次**：grep `show('shop'/'chest'/'actclear')` → 各只有 `app.enterNode`／`afterCombat`
  一個呼叫點，所以 `makeShop`／`openChestCoop`／`rollActRelics`／`rollActCardsPerSeat` 不會被重跑。
  會重畫的 `reward`／`event`／`map` 三支，重畫路徑上都沒有任何 `roll*`／`rng` 呼叫。
- **`runFingerprint` 的欄位**：亂數、難度、關／層／節點、`nextUid`、狀態、`event:`／`sequel:` 旗標、
  地圖每格排的事件、每位的角色／血／魚乾／移除價／倒下／牌組／秘寶／忍具都有。
  `pendingAfterFight` 沒算進去——但 `event.ts:448` 兩台都會設成同一份，而 `resolvePendingAfterFight`
  （`run.ts`）對**每個站著的座位**各跑一次，`forSeat` 只挑「提示寫給誰看」，不影響狀態。查證過不是分岔源。
- **`combatFingerprint`**：含亂數四個字、`phase`、預告招式 `move.label`、`poisonedBy`、
  菲菲三旗標與支援牌四旗標。狀態列有排序、牌堆不排序（順序有意義），都對。
- **事件「打一場」不會只有一個人進戰鬥**：擔心的是某個座位拿到 `fight`、另一個拿到 `needs`。
  查 `src/content/events.ts` 三個 `gamble`（`117`／`133`／`219`）的 win／lose 分支裡**都沒有** `fight`
  或任何 pending 效果，所以同一份效果清單對每個座位算出來的種類一定一樣。這靠的是內容、不是程式擋著。
- **搶標與撞件**：商店 `canApplyRun`（`runaction.ts:79-80`）的重整條件跟 `reshuffleShop` 一致；
  搶輸的那則不發號碼、不算分岔。秘寶撞件走 `settleRelicPicks` 擲骰，兩台同一顆亂數。
- **倒下的人**：`vote.ts` 的 `onlyStanding` 在六個結算點（map／event／reward×3／chest／actclear）全部有呼叫，
  `allVoted` 跳過倒下的座位；`canApplyRun` 對倒下只放行 `done`／`relic`／`swap`／被扶。
- **`hold()` 期間的請求**：`session.ts:540` 會比對 `turn`，上一回合的請求回 `drop` 不編號。
- **訊息大小／解析**：線上只傳幾十位元組的 JSON，指紋壓成八位十六進位。`rtc.ts:43-50` 的 `JSON.parse`
  包在 try／catch，解不開就當成版本不同斷線。`code.ts` 的 `pump` 把寫入側的 promise 接住了。
- **版本標記**：`code.ts:92-94` 打包編號不同就在貼碼當下擋下並講人話，`tests/net/code.test.ts` 有測。

---

## 五、單機路徑逐一核對（使用者最在意的那條）

核對方式：`grep -rnE "app\.coop|this\.coop|\bcoop\b"` 掃 `src/ui`，扣掉牌定義的 `def.coop`／`c.coop`
（那是「雙人專屬牌」的欄位，跟會話無關）得 **99 個呼叫點**，再加 `combat.ts` 的 **24 處 `session`**，
共 **123 個**。逐一看過守衛形式：

| 形式 | 個數 | 單機（null）時 |
|---|---|---|
| `if (app.coop) { … }`／`const coop = app.coop; if (coop)` | 最多數 | 整段跳過 |
| `app.coop ? A : B`／`!!app.coop && …` | 次多 | 走 B／得 false |
| `this.coop?.x()`／`session?.x()` | 5 + 6 | 不呼叫 |
| `if (!session) return local();`（`combat.ts:375`、`shop.ts:69`、`rest.ts:47`） | 3 | 直接呼叫引擎 |
| `if (!this.coop)`（`app.ts:243,408`、`result.ts:37`） | 3 | 照舊存檔／記成績 |

**有問題的：0 個。** 沒有任何一條會在 `session` 為 null 時丟例外，也沒有任何一條讓投票結算、
`players.length` 判斷或「座位 0 是我」的假設漏進單機：

- `app.seat` 在 `newRun()`／`continueRun()`／結算畫面的「回到村子」／除錯頁跳轉四個入口都先叫 `leaveCoop()` 歸零。
- 單機的 `run.players` 長度是 1，`me(run, 0)` 永遠拿得到。
- `settleVotes`／`allVoted`／`onlyStanding` 只在 `if (coop)` 分支裡被呼叫過（六個結算點全部確認），
  單機一次都不擲那顆骰，亂數走向跟併入前一樣。
- `coopHpMul`（`coopscale.ts:38-41`）一人回查表第一格 `1`，`combat.ts:71` 乘進去等於沒乘。
- `actclear.ts:41` 單機走 `rollActCards`（舊那支）、連線才走 `rollActCardsPerSeat`；
  `chest.ts:42` 單機 `offers` 是 `[]`、走原本的 `openChest`。兩支都保住了單機的亂數走向。
- 佐證：`npx vitest run tests/engine tests/ui` → **107 檔 915 條全綠**；`npx tsc --noEmit -p .` → 乾淨。

---

## 六、坑 2 結論表：連線回呼是否註冊在早退之前

| 畫面 | 早退在哪 | 回呼註冊在哪 | 結論 |
|---|---|---|---|
| combat | `308`（`!run \|\| !cs` → `show('map')`） | `2410-2461`；`attach(cs)` 在 `2519` 最後 | ✅ 早退會換畫面，換了就清乾淨 |
| map | `116`（`!run` → `show('title')`） | `131` `onPick` | ✅ |
| event | `119`（`!run`）、`126`（`!ev` → `show('map')`） | `607` `onPick`；`take()` 內 `507` 換掛 | ✅ |
| reward | `36`（`!run`）、**`170`（塔主信物頁）** | `116` `onRunApplied`、`140` `onPick` | ✅ 註冊在 `170` 之前（低-3 是另一件事） |
| shop | `29`（`!run`） | `267` `onRunApplied`，`render()` 在 `278` | ✅ 中間沒有早退 |
| rest | `32`（`!run`） | `214` `onRunApplied`，`show()` 在 `248` | ✅ |
| chest | `28`（`!run`）、**`141`（沒開的箱子那一段）** | `83-104` | ✅ 註冊在 `141` 之前 |
| actclear | `36`（`!run`）、**`202`（關主信物頁）** | `166-180` | ✅ 註冊在 `202` 之前 |
| lobby | 無 | `startCoop` 裡 `onStartRun`；先到的開局訊息由 `pendingStart` 補跑 | ✅ |
| result | `19`（`!run`） | 不註冊任何回呼（只讀 `app.coop`） | ✅ 不適用 |
| heroselect | 無 | 完全沒有連線程式碼（連線選角在大廳） | ✅ 不適用 |

三個真正危險的（reward／chest／actclear，都有「先演一段再 return」）**都已經修對了**。

---

## 七、測試品質

`npx vitest run tests/net` → **8 檔 87 條全綠**（0.7 秒）。

抽查沒有恆真斷言：都用「動作前後的指紋比對」或「對照組」在斷言，
`hostorder.test.ts:70` 甚至專門放了一條「先確認這個情境真的吃順序（不然下一條等於什麼都沒測）」。
`session.test.ts:170-184` 重送同一則請求時，先斷言第一次真的改變了狀態、第二次沒有——方向是對的。

五個坑的守備：

| 坑 | 有沒有測試守著 |
|---|---|
| 1　收尾裡不可以 `clearPicks` | **沒有**。純畫面層規約，沒有任何檢查 |
| 2　回呼要註冊在早退之前 | **沒有**。同上，只能靠人眼（上面第六節那張表） |
| 3　單一插槽會被蓋掉 | 間接：`coop_flow_0914.test.ts:214-244` 反覆重新註冊，但測的是補跑不是覆蓋 |
| 4　主機的動作同步套用 | **沒有直接的**。`session.test.ts:60-65` 隱含（主機一送出對面就同步了），但沒有一條會在「旗標擺在動作之後」時變紅 |
| 5　客戶端慢一拍（`drop`／`inflight`） | `drop` 有：`session.test.ts:186-206`、`coop_flow_0914.test.ts:144,195`。`inflight` 是畫面層的，**沒有測** |

另外 `tests/ui/` 底下 **29 支測試沒有一支碰連線**（grep `coop` 在 `tests/ui` → 0 筆）。
也就是說：連線層的**會話邏輯**測得很紮實，**畫面接線**（坑 1～4 全部住在這裡）一條測試都沒有。
坑 1、2、4 都曾經真的壞過，而它們今天靠的只有註解。

---

## 八、實際打開核對過的檔案

`docs/連線版_接這裡.md`、`docs/交給另一個AI檢查_2026-09-14.md`、
`src/net/session.ts`、`lockstep.ts`、`hash.ts`、`transport.ts`、`rtc.ts`、`action.ts`、`runaction.ts`、
`code.ts`、`nettest.ts`、
`src/engine/vote.ts`、`runplayer.ts`、`coopscale.ts`、`run.ts`（`rest`／`takeRelic`／`addCard`／
`resolvePendingAfterFight` 四支）、
`src/ui/app.ts`、`hud.ts`、`potionswap.ts`、
`src/ui/screens/lobby.ts`、`map.ts`、`event.ts`、`reward.ts`、`chest.ts`、`rest.ts`、`shop.ts`、
`actclear.ts`、`result.ts`、`heroselect.ts`、`combat.ts`（6 個區段）、`debug.ts`、
`src/ui/styles/screens.css`（`.net-trouble`）、`src/content/events.ts`（三個 `gamble`）、
`tests/net/session.test.ts`、`tests/net/coop_flow_0914.test.ts`。共 **34 個檔**。

## 九、跑過的指令

```
git status --short / git branch --show-current / git log --oneline -15
npx vitest run tests/net          → 8 檔 87 條全綠，exit 0
npx vitest run tests/engine tests/ui → 107 檔 915 條全綠
npx tsc --noEmit -p .             → 乾淨，exit 0
```

## 十、附帶回報（不是我做的）

審查開始時 `git status` 只有三個 `M docs/*.json`；結束時多了兩個**未追蹤**的檔案
`tools/_audit_load.test.ts`、`tools/_audit_sim.test.ts`。我全程唯讀、沒有寫過任何檔，
應該是同時在跑的另一位審查代理留下的暫存測試（`tools/` 會被 vitest 一起掃到）。請主對話決定要不要刪。
