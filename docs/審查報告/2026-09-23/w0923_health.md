# 爪破魔塔 程式碼健康度審查（代號 health，2026-09-23）

- 倉庫：`F:\ClaudeWork\qq-int`，分支 `w0923-int`。
- **基準提交是 `ae25b7e8`**：我開始看的時候是 `f12b3269`，審查途中主控合併了 `w0923-polish`（`combat.ts` 多了約 60 行）。下面所有行號都已經照 `ae25b7e8` 重新對過。
- 這一輪只看不改：倉庫一個檔都沒動，`git status` 乾淨。只跑了 `npx tsc --noEmit -p .`（零錯誤）；沒有跑全套測試（會重寫 `docs/` 兩個檔）。
- 分析腳本都在 `scratchpad\w0923\health_tmp\`：函式長度 `fnlen.mjs`、`codelines.py`；沒人用的匯出 `unused_exports.mjs`；註解點名已不存在的名字 `stale_refs.py`；只寫不讀的欄位 `write_only_fields.py`；測試抽樣 `test_smells.py`；另外用倉庫自帶的打包器（`bundle.mjs`）真的跑了幾支引擎腳本（`*_entry.ts`）來驗證。

---

## 一、結論先講

1. **有一個已經確認、玩家看得到的錯誤，就是「同一件事兩處各寫一份、一邊改了一邊沒跟」**：畫面拿引擎戰報的字串開頭（「蜷縮擋下了」）來決定要不要演出。09-15 引擎在連線時把這行改成「球球的蜷縮擋下了」，畫面沒跟著改。所以**從 09-15 起，連線時自己被擋下攻擊，「擋住 N」的飄字、盾牌光、「鏘」一聲全都不見**。已經用引擎實跑確認（見 H-1）。
2. **角色清單散在 23 個檔、大約 60 處**。其中大多數寫成「沒列到就默默當球球」：加第五隻貓時會安靜地出錯，不會報錯，測試也照樣綠。過去真的出過四次同一類事故（見 H-2）。這是可維護性最大的風險，而且可以一小塊一小塊收，每塊都有編譯器幫忙把關。
3. `combat.ts` 是熱點：一個 3,734 行的閉包（closure，就是「函式裡面包函式」，裡面的變數整場戰鬥共用）、39 個 `let` 可變狀態，18 天從 1,514 行長到 4,135 行，09-15 以來 38 筆提交動過它。**但這一輪不建議拆它**：有 30 個測試檔讀它的原始碼文字，其中 11 個是照縮排切下一段再執行的（今天的 `polish_0923` 也是），一拆就大面積變紅，而且紅的原因跟行為無關（見 H-5、第四節）。
4. 註解跟程式不符的有 10 條，最容易誤導人的是「毒針袋」：三個地方的註解寫「每回合給 1 層毒」，實際是「開場給 3 層」（見 H-6）。
5. 死碼不多（在暫存區開了未使用變數檢查，整個 `src` 只報一處），但有幾個「看起來有在用、其實沒有」的：`cs.damageDealt` 只寫不讀、存檔的解鎖紀錄永遠寫不到、魔物逐格動作的角色白名單永遠為真，另外封封有四組台詞寫好了但沒接上（見 H-7）。
6. 好消息：以整句台詞當鍵的十張對照表，700 多個鍵**全部**還對得到原句；共用事件裡提到「球球」的 103 句，三隻換完以後都沒有漏出「球球」（兩項都實跑腳本確認）。台詞這一路目前是乾淨的。

---

## 二、量化

### 函式長度前 15 名（含巢狀；括號內是扣掉註解與空行後的程式行數）

| # | 位置 | 總行數（程式） | 判斷 |
|---|---|---|---|
| 1 | `src/ui/screens/combat.ts:402-4135` 戰鬥畫面閉包 | 3734（2554） | **管太多事**：演出、動作、連線套用、教學、暖圖、快捷鍵全在同一個閉包裡，39 個 `let` 共用 |
| 2 | `src/engine/effects.ts:138-754` `applyOne` | 617（461） | 79 個分支的效果直譯器，有 `never` 守門（漏接新效果會在編譯時擋），**不用動** |
| 3 | `src/ui/screens/combat.ts:2906-3462` `settle` | 557（462） | **管太多事**：姿勢優先序、逐格反應、魔物受擊、飄字、音效、台詞、提示都在這一支；改一條常碰到別條 |
| 4 | `src/ui/screens/event.ts:122-674` 事件畫面閉包 | 553（312） | 大多是巢狀小函式；問題在裡面藏了引擎規則（見 H-4） |
| 5 | `src/engine/smartbot.ts:300-819` `evaluate` | 520（334） | 平衡量測用的估值，有 `never` 守門，**不用動** |
| 6 | `src/ui/screens/reward.ts:33-438` 戰利品閉包 | 406（229） | 偏大，自身 264 行，之後再說 |
| 7 | `src/ui/screens/combat.ts:3748-4038` `onApplied` | 291（255） | **管太多事**：連線動作套用＋重播＋演出排隊；今天低-2 的例外防護就是補在這裡 |
| 8 | `src/ui/screens/map.ts:114-404` 地圖閉包 | 291（166） | 自身 220 行，之後再說 |
| 9 | `src/ui/frame-motion.ts:54-311` `createFrameMotionSet` | 258（214） | 工廠函式，結構清楚，不用動 |
| 10 | `src/ui/screens/shop.ts:27-284` 罐頭鋪閉包 | 258（160） | 可接受 |
| 11 | `src/ui/screens/chest.ts:25-280` 紙箱閉包 | 256（136） | 可接受 |
| 12 | `src/ui/screens/rest.ts:50-303` 貓窩閉包 | 254（167） | 可接受 |
| 13 | `src/ui/screens/debug.ts:50-300` 除錯頁閉包 | 251（209） | 開發工具，不用動 |
| 14 | `src/engine/map.ts:144-393` `generateMap` | 250（202） | 地圖產生器，有決定性測試守，不用動 |
| 15 | `src/engine/combat.ts:426-642` `playCard` | 217（115） | 程式其實只有 115 行，其餘是註解，可接受 |

超過 100 行的函式 43 支、超過 200 行的 17 支（全部 2,435 支）。

### `combat.ts` 的成長

| 日期 | 行數 |
|---|---|
| 09-05 | 1,514 |
| 09-10 | 1,968 |
| 09-15 | 2,654 |
| 09-20 | 3,686 |
| 09-22 | 3,992 |
| 09-23（`ae25b7e8`） | 4,135 |

### 測試讀原始碼的程度

- 46 個測試檔讀原始碼文字（`?raw` 或 `readFileSync('src/…')`）；**其中 30 個讀 `combat.ts`**。
- 11 個測試檔用「開頭字串到結尾字串」從 `combat.ts` 切出一段，編譯後用 `new Function` 執行，再手動塞 20～40 個假的外部變數。切點包含縮排，例如 `'    session.onApplied((applied) => {\n      const turn: AppliedTurn = {};'`（`tests/ui/applied_guard_0923.test.ts:28`）。

---

## 三、發現清單（照對玩家與未來修改的風險排序）

### H-1　畫面靠「戰報字串」判斷演出：連線時自己的擋下演出整個不見（確認，玩家看得到）

- **問題**：引擎的戰報句子同時被畫面拿來當訊號。句子改了，畫面不會報錯，只會安靜地不演。
- **證據**
  - 引擎：`src/engine/actions.ts:215-217` `whose()` 連線時回 `球球的`；`:237`、`:247`、`:253` 寫 `` `${whose(cs, p)}蜷縮擋下了 ${absorbed} 點` ``（09-15 `47876ccd` 加的名字）。
  - 畫面（09-02／09-08 寫的）：`src/ui/screens/combat.ts:3386` `blockedAmount(fresh, '蜷縮擋下了')`（飄「擋住 N」＋盾牌光＋鏘）、`:2947` 靜態格擋姿勢、`:3020` 逐格格擋反應的後備判斷，三處都用 `startsWith('蜷縮擋下了')`。
  - 實跑（`health_tmp/blocklog_entry.ts`）：單人戰報「蜷縮擋下了 6 點」→ 畫面認得；連線戰報「球球的蜷縮擋下了 6 點」→ `startsWith` 回 `false`。
  - 同一類的還有：`combat.ts:3352` `includes('塞進你的')`、`:3353` `includes('的身法') || includes('拍散') || includes('震散')` 兩道光都打在**自己**那格（`:3348` `MINE`），可是連線時被塞牌、被看破的可能是**同伴**（引擎 `actions.ts:204` 連線時還是寫「塞進你的」、`:911`／`:928` 寫同伴的名字）→ 同伴中招，光出現在我身上。`:2932` `includes(`${heroName(my())}閃過了`)` 在同角色雙人時，同伴閃過也會讓我擺閃避姿勢。
  - 全檔大約 12 處用戰報文字判斷（`:2932`、`:2947`、`:3020`、`:3151`、`:3224`、`:3352`、`:3353`、`:3358`、`:3379`、`:3386`，外加 `blockedAmount` 對魔物那條）。`tests/engine/blocklog.test.ts:25` 只測單人的句子，連線這條沒有測試守。
- **為什麼是風險**：任何人改戰報措辭（這個專案常改文案）都會讓演出安靜消失；連線版的畫面回饋已經缺了一週。
- **建議改法**（外科手術式，不動整個 `settle`）：
  1. 最小修法：引擎匯出一支產生前綴的小函式（例如 `blockLogPrefix(cs, p)`，引擎寫戰報與畫面比對都叫它），畫面改成 `blockedAmount(fresh, blockLogPrefix(cs, my()))`；`:2947`、`:3020` 同樣處理。
  2. 塞牌、看破那兩道光改看**狀態差**：`snap` 已經有自己的 `growth`、`stealth`，牌堆張數也拿得到，不必讀字串。
  3. 同角色雙人時字串分不出座位；要徹底解決得讓引擎像 `cs.hits` 那樣記一份「誰擋了幾點」的結構化紀錄，那是中等改動，可以之後做。
- **改動大小**：小～中（引擎一處＋`combat.ts` 四五處）。
- **優先度**：**值得現在做**。

### H-2　角色清單散在 23 個檔、約 60 處，多數漏改時默默退回球球

- **問題**：`HEROES`（`src/engine/hero.ts:34`）與 `HERO_NAME`（`:52`，唯一用 `Record<Hero, …>` 寫、漏了會編譯失敗的一張）之外，其他地方各自手寫角色清單或 `if` 連鎖。
- **過去真的出過的事**（全都寫在程式的註解裡）：存檔驗證寫死兩個角色、選菲菲的存檔被刪（09-12，`hero.ts:29-33`）；大廳解析角色一個一個 `if`、加入的人默默變球球（09-17，`lobby.ts:127-129`）；結局牌組傾向漏排封封的起手牌（09-22，`content/dialogue.ts:2515`）；大廳只換了圖沒換聲音（推前審查 高-1，`lobby.ts:133`）。
- **現在還埋著的**（加第五隻貓時會怎樣）：

| 位置 | 現在的寫法 | 漏改時 |
|---|---|---|
| `src/engine/types.ts:308、378、675、724、780` | 手寫 `'ninja' \| 'feifei' \| 'dangdang' \| 'fengfeng'` 五份 | 編譯會擋，但要改五處 |
| `src/engine/hero.ts:79` `heroPronoun` | 只有 `feifei` 回「她」 | 新的母貓被叫「他」 |
| `hero.ts:85-90` `startRelicFor` | `if` 連鎖 | 默默拿藍頭巾 |
| `hero.ts:105` `SHARPEN_VERB` | `Record<string, string>` | 默默寫「磨爪」 |
| `src/content/cards.ts:1099-1104` `cardNameFor`、`:1163-1168` `starterDeckFor` | `if` 連鎖 | 球球的牌名、球球的起手十張 |
| `src/content/dialogue.ts:1561-1563` `storyFor`、`:2145-2154` `eventTextFor`、`:2292-2296` `lineFor`、`:2468-2470` `castLineFor` | `if` 連鎖 | 整局播球球的劇本 |
| `content/dialogue.ts:2505`、`:2516` `deckLeaning` | 第二派與四副起手牌手列 | 09-22 已經漏過封封一次 |
| `src/ui/compendium.ts:36-39` `poolNameFor` | 三元式 | 圖鑑分區名 |
| `src/ui/dialogue.ts:27-31` `heroSpeaker`、`:62-68` `portraitHero` | 名字的第二、第三份 | 木牌寫「球球」、頭像對不上 |
| `src/ui/assets.ts:93-100、105、114-118、142-145、181-183、310-314` | 手列清單與正規表示式裡寫死三隻 | 新貓的圖不被認成他的專屬圖：首載多抓、選角後不補載、事件插圖判斷錯 |
| `src/ui/acttransition.ts:38、60`、`src/ui/preload.ts:138-143` | 白名單 | 過關走路沒有逐格動作、預載不載 |
| `src/ui/storyslides.ts:19-24` `stillKey`、`:69-76` 序章四張 | `if` 連鎖 | **默默播球球的劇情圖**，跟這個檔自己訂的「寧可少一段幻燈片，不要放別人的故事」相反；`preload.ts:125` 的預載卻照通則抓 `bg/<新貓>_still_*`，兩邊不一致 |
| `src/ui/companion-motion.ts:494、497、524、605` | `kind === 'dangdang' ? dangdangMotions : fengfengMotions`（排除菲菲之後的「其他」） | 新同伴默默拿到**封封的動作表** |
| `src/ui/qiuqiu-combat-motion.ts:162-164` `qiuqiuEnemyMotionAllowed` | 四隻白名單 | 新貓單人局，**魔物逐格動作整個關掉**（詳見 H-7） |
| `qiuqiu-combat-motion.ts:189-197` `qiuqiuVictoryLinger` | 四行各寫一隻 | 勝利收場時間少算 |
| `src/ui/screens/combat.ts:486-495` `motionSourceFor`、`:552`、`:600-619` 四段幾乎一樣的預載、`:3018` | 白名單與複製貼上 | 新貓沒有逐格動作 |
| `src/ui/screens/debug.ts:81、151` | 只認菲菲的換句機制 | 除錯頁對噹噹、封封永遠不會標「⚠️ 還在用球球的句子」（對玩家無害，但除錯頁會說謊） |
| `src/content/dialogue.ts:13` `DialogueLine.speaker` | 名字聯集 | 編譯會擋 |

  另外 `localHero()`（`assets.ts:248`）型別是 `string` 不是 `Hero`，所以畫面層傳來傳去都失去型別檢查，`acttransition.ts:56` 還得 `as Hero` 硬轉。
- **為什麼是風險**：這一類錯「不報錯、不破圖、測試照樣綠，只有玩家看得出來」——這句話在程式註解裡出現過好幾次。
- **建議改法**（分四小塊，每塊獨立提交）：
  1. `types.ts` 五份聯集改成一份 `Hero`（型別放在 `types.ts`，`hero.ts` 轉出去，型別互相引用沒問題）。
  2. 引擎與內容層的 `if` 連鎖改成 `Record<Hero, …>` 表：起始秘寶、起手牌、牌名表、磨爪動詞、代名詞、圖鑑分區名；`deckLeaning` 的起手牌集合改成 `HEROES.flatMap(starterDeckFor)`。`storyFor`／`lineFor` 那幾支分派比較複雜，可以只把「角色 → 表」收成 `Record`，換句邏輯不動。
  3. 畫面層的清單與正規表示式從 `HEROES` 產生；`heroSpeaker` 改叫 `heroName`；`portraitHero` 用 `HERO_NAME` 反查；`storyslides` 的圖鍵改通則（非球球就 `bg/<角色>_…`，跟 `preload.ts:125` 同一條），序章四張改成 `Record<Hero, string[]>`；`localHero()` 改成回 `Hero`。
  4. `companion-motion.ts` 的三元式改成 `Record<CompanionMotionKind, …>`（動作表、波次裁切、近戰表），`combat.ts:600-619` 四段預載收成一個迴圈。
- **改動大小**：大（跨檔），但每一塊都是機械式替換，行為不變。
- **優先度**：**值得現在做**（第 1、2、4 塊風險最低；第 3 塊碰到 `combat.ts` 要跑全套測試確認沒有切片測試受影響）。

### H-3　「本機這一位是誰」存在三個模組各一份，五個入口各自同步

- **問題**：`assets.ts:248` `localHeroId`、`audio.ts:36` `sfxHero`、`content/dialogue.ts:923` `coopStory`（外加 `assets.ts:249` 搭檔），都是模組層級變數，要一起設才對。
- **證據**：同一串「設圖、設聲、設劇情、補載圖」寫了三份：`src/ui/app.ts:188-191`（新的一局）、`app.ts:264-268`（續玩）、`src/ui/screens/lobby.ts:132-135`（連線開局）；另外 `debug.ts:261-262、293`、`motion-preview.ts:310-311、424-425、487-488` 也各自成對呼叫。`lobby.ts:133` 的註解就是「推前審查 高-1：只設了圖沒設聲」——這條已經漏過一次。
  另一個順序陷阱：`setLocalHero` 會把搭檔清成 `undefined`（`assets.ts:250-253`），而 `app.show()` 是先設搭檔再畫畫面（`app.ts:165-167`）；目前三個入口都在畫面切換前呼叫，所以沒出事，但以後有人在畫面裡呼叫 `setLocalHero` 就會把搭檔洗掉。
- **為什麼是風險**：加新入口（例如之後的「觀戰」「重新連線」）很容易只設一半。
- **建議改法**：在 `app.ts` 收一支 `adoptRun(run, seat)`，裡面做這四件事；三個入口改叫它。`setLocalHero` 參數改成 `Hero`。
- **改動大小**：小～中（`app.ts`＋`lobby.ts`）。
- **優先度**：值得現在做（改動小，風險低）。

### H-4　事件選項的規則寫在畫面裡，三個機器人各抄一份，而且已經不一樣

- **問題**：「付小魚乾、倒下的人不付、付不起扣到 0、有沒有可交換的秘寶、打一場先把獎勵存進 `pendingAfterFight`」這些是遊戲規則，卻寫在事件畫面（註解自己也說「小魚乾由畫面扣，引擎的 `applyRunEffects` 不管 `costFish`」）。
- **證據**：`src/ui/screens/event.ts:496-508`（扣魚）、`:178-183` `exchangeBlockReason`（交換秘寶的條件，只有畫面有）、`:482` 畫面直接寫 `app.run.pendingAfterFight`；機器人：`src/engine/bot.ts:105-107`（只挑買得起的）、`src/engine/coopbot.ts:323-334`、`src/engine/smartbot.ts:1212-1213`、`:1111`，三份各自扣魚、各自存 `pendingAfterFight`，都沒有交換秘寶的檢查。
- **為什麼是風險**：平衡全靠 `smartbot` 量（程式註解一再寫「改完要跑 smartRun 對照」）。事件規則一改，要同時改四處，漏一處就是「機器人玩的跟玩家玩的不是同一套」，數字會悄悄偏。目前交換秘寶那條因為引擎 `run.ts:1082` 自己有擋，還沒造成偏差。
- **建議改法**：在 `engine/run.ts` 收兩支：`eventChoiceBlocked(run, choice, seats)` 與 `payEventCost(run, choice, seats)`，畫面和三個機器人都叫它們。
- **改動大小**：中（跨四檔）。
- **優先度**：之後再說（下一輪第一個）。事件畫面牽涉連線投票流程，這一輪已經有很多改動進來，先不要同時碰。

### H-5　`combat.ts` 巨型閉包與 `settle`

- **問題**：一個 3,734 行的閉包，裡面分成：動作系統（`:460-930`）、連線暫存狀態（`:930-1010`）、瞄準／提示／教學／暖圖（`:1010-1300`）、畫面組件（`:1300-1860`）、手牌與整頁重畫（`:1880-2240`）、出牌與收牌（`:2246-2530`）、回合流程與連線演出排隊（`:2526-2800`）、秘寶閃光（`:2809-2905`）、`settle`（`:2906-3462`）、收場與關主換階段（`:3477-3652`）、連線掛鉤（`:3675-4038`）。39 個 `let` 加上一堆 `Map`／`Set` 全部互相讀寫。
- **為什麼是風險**：每一批修正都往這裡加（38 筆提交），合併時也最常衝突；`settle` 一支就決定姿勢、逐格反應、魔物受擊、飄字、音效、台詞，改一條很容易改到別條的時序。
- **建議改法**：這一輪**不拆**（理由見第四節）。改成「止血」規矩：新邏輯一律先寫成純函式放進獨立模組（像 `qiuqiu-combat-motion.ts` 那樣），`combat.ts` 只接線；H-1 的修法也照這個方向，把「從戰報／狀態差判斷要演什麼」抽成可以單獨測的純函式。
- **改動大小**：拆的話是大；止血規矩是零成本。
- **優先度**：不要動（這一輪）。

### H-6　註解跟程式不符（逐條附證據）

| # | 位置 | 註解說 | 程式實際 |
|---|---|---|---|
| 1 | `src/engine/hero.ts:83` | 菲菲是毒針袋（每回合開始給所有魔物 1 層中毒） | `src/content/relics.ts:18-19` 是 `combatStart` 給 **3 層**（`d373249e`「毒針袋改成開場給三層，之後不再每回合給」） |
| 2 | `src/content/relics.ts:6-16` | 改成「每回合開始時給所有魔物 1 層中毒」，還解釋這 1 層在長戰鬥的價值 | 同上，整段理由已經不成立 |
| 3 | `src/engine/combat.ts:260` | 每回合開始的掛鉤（毒針袋、鐵砂袋、靈貓鈴） | 毒針袋已經不是每回合的掛鉤 |
| 4 | `src/ui/qiuqiu-combat-motion.ts:161` | 敵人逐格目前只跟著球球的動作模式啟用 | `:163` 四隻都放行，等於只看 `enabled` |
| 5 | `src/engine/hero.ts:118-122` | 「三道關卡」，列了四條 | `:125` 還有第五條：只替封封擋起手牌（見 H-7） |
| 6 | `src/engine/save.ts:276` | 通關紀錄仍照舊寫（`UNLOCK_KEY`） | `:294` 條件 `unlockedDifficulty() <= level` 永遠不成立（`unlockedDifficulty()` 固定回最高級），**從來沒寫過** |
| 7 | `src/engine/types.ts:1118`、`src/engine/actions.ts:593` | `damageDealt` 給「魔物散掉時要不要發獎」用、「魔物散掉時的獎勵門檻看它」 | 那條規則已經拿掉（`src/engine/run.ts:380` 自己寫「這條之前是…」），全倉庫沒有人讀它 |
| 8 | `src/engine/effects.ts:299` | 先把量記在 `pendingSelfBlock` | 實際欄位叫 `ctx.selfBlockPool`（`:301`，同名欄位 `:248` 也在用） |
| 9 | `src/ui/screens/combat.ts:2547` | 收牌與魔物回合交給 `onAllReady()` | 沒有這支函式；實際在 `session.onApplied` 那一段看 `allReady` |
| 10 | `src/ui/preload.ts:168-169、184` | `combat.ts` 的 `warmAll` | 已經拆成 `warmHeroes`／`warmEnemies`，`warmAll` 不存在 |

  次要：`combat.ts:128` 還在講已經搬走的 `COLLECT_WAIT`；`src/ui/storyslides.ts` 同一段「稽核 2026-09-17 中-3」的註解一字不差出現兩次（`actClearSlides` 與 `endingSlides` 上方）。
- **為什麼是風險**：第 1 條在 `hero.ts`，檔頭自己說「這一行是查角色設定最先讀到的地方，寫錯會被後面每一場會話沿用」；拿它去做平衡判斷會算錯。第 6、7 條會讓人以為某個功能還在運作。
- **建議改法**：只改註解（第 6、7 條連死碼一起拿掉，見 H-7）。
- **改動大小**：小。
- **優先度**：**值得現在做**。

### H-7　死碼與「永遠為真／假」

| 位置 | 狀況 | 建議 |
|---|---|---|
| `src/engine/types.ts:1122` `CombatState.damageDealt`、`actions.ts:593`、`combat.ts:66` | 只寫不讀（腳本掃過全部狀態介面，只有這一個是真的只寫） | 整個拿掉（戰鬥狀態不存檔、連線指紋 `net/hash.ts` 也沒用到） |
| `src/engine/save.ts:294`、`:35` `UNLOCK_KEY` | 條件永遠為假 | 拿掉這行與常數，註解改成「不再記」 |
| `src/ui/qiuqiu-combat-motion.ts:162-164` | 對現有四隻永遠為真；**但對第五隻為假**，是個反向陷阱 | 改成直接看 `enabled`，同步改 `tests/ui/qiuqiu_combat_motion.test.ts:133-137` |
| `src/engine/hero.ts:125` `c.hero === 'fengfeng' && c.pool === '起手'` | 目前沒有任何呼叫端會拿起手池的牌來問（獎勵、罐頭鋪、事件只抽「忍術」「絕學」「壞毛病」），所以這條沒有作用；而且只替封封擋，其他三隻的起手牌問 `pickable` 回 `true`，兩邊還各有測試釘住（`tests/fengfeng_cards.test.ts:47` vs `tests/engine/coop.help.test.ts:249-251`、`tests/engine/feifei.test.ts:76`） | 二選一：拿掉這條並把 FG-T19 改成測「獎勵抽不到」；或改成四隻都擋、同步改兩條舊測試。要主控決定 |
| `src/content/fengfeng-dialogue.ts:150` `fengfengRetryLines`、`:502` `fengfengShopkeeper`、`:503` `fengfengRevivedLines`、`:1356-1435` `fengfengChats`（80 行搭檔閒聊） | 匯出了、全倉庫沒人用（測試也沒有） | **不是單純刪**：這是寫好但沒接上的台詞。噹噹的重整台詞有註明「引擎沒有那個時機，先不收」（`content/dialogue.ts:833-837`），封封這四組沒有任何說明。請使用者決定接上還是刪掉 |
| `src/engine/actions.ts:129` `gainBlock(cs, …)` | 參數 `cs` 沒用到 | 不急 |
| 約 15 支只在自己檔案裡用的匯出（例如 `run.ts` 的 `heroesIn`、`shopCardCount`，`projectile-flight.ts` 的 `playProjectile`） | 多掛了 `export` | 不急，清單在 `health_tmp/unused_exports.txt` |

  在暫存區複製 `tsconfig` 開 `noUnusedLocals`／`noUnusedParameters` 掃整個 `src`，只報上面那個 `cs`，區域死碼很乾淨。
- **改動大小**：小。
- **優先度**：前三條值得現在做；封封台詞與 `pickable` 那條要主控或使用者裁定。

### H-8　狀態清單抄了兩份：新狀態加進去會不顯示

- **證據**：`src/ui/screens/combat.ts:106` `STATUS_ORDER` 一字不差等於 `:281` `GOOD_STATUS` 接 `:282` `BAD_STATUS`。狀態列只照 `STATUS_ORDER` 畫（`:1382`）。`STATUS_ICON`（`:91`）是 `Record<StatusName, …>`，漏了會編譯失敗，但另外三份陣列不會。
- **為什麼是風險**：加新狀態時補了圖示、忘了補陣列，魔物或玩家身上掛著那個狀態，畫面上永遠不顯示，也不算好壞光。
- **建議改法**：寫一張 `Record<StatusName, 'good' | 'bad'>`，三份陣列都從它產生（順序照現在的寫死）。
- **改動大小**：小（`combat.ts` 開頭 30 行內）。
- **優先度**：值得現在做。

### H-9　錯誤處理不一致

- `src/engine/save.ts:235-243` `loadRun`：驗不過或解析丟例外就 `clearSave()`，**一行紀錄都不留**；`hasSave()`（`:244`）也走這條，而標題畫面一次重畫會叫它四次（`src/ui/screens/title.ts:27、29、31、115`），所以「看一下有沒有存檔」本身就會刪檔。刪檔是設計（註解有寫理由），但哪天內容改名讓舊存檔全部驗不過，玩家的進度會無聲消失，開發端也查不到原因。建議：刪之前 `console.warn` 一行（最好帶是哪一條驗不過）。小改動，值得現在做。
- `src/ui/hud.ts:276` 分享按鈕也呼叫 `loadRun()`，順帶有刪檔的副作用。低。
- 其他：瀏覽器儲存一律包 `try/catch`、連線路徑的例外一律 `console.error`、各畫面進場都有「沒有局面就退回」的防護，整體算一致。

### H-10　其他重複（低風險，之後再說）

- 「這張圖還沒生好」的判斷 `url.startsWith('data:')` 散在約 45 處；同一支 `icon()` 小函式在 `reward.ts:28-31`、`shop.ts:22-25`、`potionswap.ts:31-34` 各寫一次。建議 `assets.ts` 匯出 `isPlaceholder()`。
- 「網址有沒有 `?motion=0`」解析三份：`qiuqiu-motion.ts:189-192`、`acttransition.ts:26-29`（為了動態載入刻意複製）、`preload.ts:136`（寫法還略有不同）。
- 「照角色動態載入逐格動作」四份：`combat.ts:600-619`、`acttransition.ts:31-44`、`preload.ts:136-147`、`motion-preview.ts:317-331`。
- 「蓄力不加倍穿透、只加倍第一個打人效果」三份：`actions.ts:800-820`（正本）、`intentpreview.ts:30-35`（09-16 修正過）、`smartbot.ts:161-176`（還是每一下都 ×2）。實跑確認目前九隻會蓄力的魔物沒有一招含兩個以上打人效果，所以**還沒造成偏差**，但三份已經寫法不同。
- `run.ts:76` 與 `:243` 起手牌加入邏輯一模一樣寫兩次。
- 畫面切換參數沒有型別（`app.show(name, props: unknown)`，各畫面 11 處 `props as …` 硬轉）。
- 連線投票種類是自由字串（`src/net/session.ts:489、494、503、518`，九種：`map`、`card`、`relic`、`rwup`、`event`、`evlearn`、`evcard`、`actcard`、`actrelic`），拼錯一個字就是投票永遠湊不齊。改成聯集型別只動型別、不動線上格式。小，值得順手做。
- `run.flags` 同時裝畫面用的旗標（`seen:`、`prologue`，畫面在 `app.ts:218、359、451` 直接寫）與引擎規則用的旗標（`event:`、`sequel:`、`relic_seen:`）；連線指紋只收 `event:`／`sequel:`（`net/hash.ts:115`），`relic_seen:` 會影響秘寶抽選卻不在指紋裡。這條偏連線，交給連線那一路判斷。
- 圖鑑分區名：噹噹叫「拳腳」、封封叫「劍術」，菲菲還叫「忍術」（`compendium.ts:36-39`），可是她的牌名早就拿掉「忍術·」。是不是也要換，要問使用者。

### H-11　測試抽樣

- **跟原始碼文字綁死**：見第二節的數字。例子：`tests/ui/flow_fixes_0922.test.ts:147-152` 斷言 `map.ts` 裡要有一字不差的 `"if (choices.has(n.id) && !iDown) cls.push('choice');"`；`tests/ui/mate_sprite.test.ts:40-47` 斷言某個常數是照某個變數組出來的。這類測試「改名、換行就紅，行為壞了但字還在就綠」。這是專案刻意的做法（雲端不能用瀏覽器模擬環境），不算錯，但它是「這一輪不要拆 `combat.ts`」的主因。
- **會空轉的寫法**：`tests/engine/mimic_name.test.ts:34`、`:47` 開頭都是 `if (!m) return;`（「這場沒有鏡中球球就跳過」）。實跑確認現在兩條都有學到兩張牌、斷言真的有跑；但哪天遭遇 `mirror_duel_a2` 改名，兩條都會安靜變成空轉。建議改成 `expect(m).toBeDefined()`。小。
- **測試釘住了不一致**：見 H-7 的 `pickable`。
- **守得好的**：台詞對照表 700 多個鍵全部對得到原句、共用事件換角色不漏「球球」（本報告實跑）；角色相關的新測試大多用 `HEROES` 迴圈（`tests/content/coop_partner_lines_0923.test.ts`、`victory_slides.test.ts` 等），加第五隻貓時這些會自己擴大範圍。

---

## 四、建議這一輪做的整理清單（照順序，共 10 條）

每條都要照共同規則：`npx tsc --noEmit -p .` 零錯誤、`npx vitest run` 全綠（跑完照雷 5 收拾 `docs/` 兩個檔），修錯誤的要補一條會反向變紅的測試。

1. **H-1 連線擋下演出**
   - 做法：引擎匯出前綴小函式，畫面 `combat.ts:2947、3020、3386` 改用它；`:3352-3353` 改看自己的狀態差。
   - 驗收：新測試用 `newCoopRun(…,'ninja','feifei')` 實跑一次被擋的攻擊，斷言畫面用的判斷（抽成純函式）對座位 0 回 N、對座位 1 回 0；把判斷改回 `startsWith('蜷縮擋下了')` 時測試變紅。`tests/engine/blocklog.test.ts` 照舊綠。
2. **H-6 註解十條**
   - 做法：只改註解。
   - 驗收：`grep -rn "每回合開始給所有魔物 1 層\|每回合開始時給所有魔物 1 層\|pendingSelfBlock\|onAllReady\|warmAll\|FADE_REWARD_MIN.*用" src` 沒有結果（`run.ts:380` 那句歷史說明除外）；全套測試綠（有些測試斷言原始碼文字，改註解也要跑）。
3. **H-7 死碼三條**
   - 做法：拿掉 `damageDealt`（三處）、`save.ts` 的解鎖寫入與 `UNLOCK_KEY`；`qiuqiuEnemyMotionAllowed` 改成只看 `enabled`（或整支拿掉、呼叫端直接用 `motionEnabled`），同步改它的測試。
   - 驗收：`grep -rn "damageDealt\|UNLOCK_KEY" src` 沒有結果；tsc、全套綠。
4. **H-2 第 1 塊：`types.ts` 五份角色聯集收成一份 `Hero`**
   - 驗收：`grep -rn "'ninja' | 'feifei' | 'dangdang' | 'fengfeng'" src` 只剩定義那一行；tsc 零錯誤。
5. **H-2 第 2 塊：引擎與內容層的角色 `if` 連鎖改成 `Record<Hero, …>`**（起始秘寶、起手牌、牌名表、磨爪動詞、代名詞、圖鑑分區名、`deckLeaning` 的起手集合改用 `HEROES`）
   - 驗收：在本機暫時把 `Hero` 多加一個假角色（不提交），`tsc` 必須在上面每一張表都報錯（證明漏改會被擋）；拿掉假角色後 tsc、全套綠，畫面文字零變化。
6. **H-2 第 4 塊：`companion-motion.ts` 三元式改成表，`combat.ts:600-619` 四段預載收成迴圈**
   - 驗收：`grep -n "? dangdangMotions : fengfengMotions" src/ui/companion-motion.ts` 沒有結果；同樣做一次假角色實驗；`tests/ui/companion_motion.test.ts`、`card_motion_coverage.test.ts`、`combat_no_old_pose.test.ts` 與全套綠。
7. **H-2 第 3 塊：畫面層清單從 `HEROES` 產生**（`assets.ts` 六處、`acttransition.ts`、`preload.ts`、`storyslides.ts` 圖鍵通則、`ui/dialogue.ts` 兩支改用 `HERO_NAME`、`localHero()` 回 `Hero`）
   - 驗收：`grep -rnE "feifei\|dangdang\|fengfeng" src/ui/assets.ts src/ui/acttransition.ts src/ui/preload.ts` 沒有結果；`storyslides` 對現有四隻產生的圖鍵跟改之前一模一樣（寫一條測試把四隻的序章、過關、結局圖鍵列出來比對）；全套綠。
8. **H-3 本機角色同步收成 `app.adoptRun(run, seat)`**
   - 驗收：`grep -n "setSfxHero(" src/ui/app.ts src/ui/screens/lobby.ts` 只剩 `adoptRun` 裡那一行；新的一局、續玩、連線開局三條路實機各走一次，貓叫、立繪、劇情都對（主控代驗）。
9. **H-8 狀態清單**
   - 驗收：三份陣列由一張 `Record<StatusName, 'good' | 'bad'>` 產生；新測試斷言產生出來的順序等於現在寫死的那串（改掉任何一格就紅）；假狀態實驗時 tsc 報錯。
10. **連線投票種類改聯集型別**（`net/session.ts` 四支函式的 `kind`）
    - 驗收：tsc 零錯誤；在任一畫面把 `'evcard'` 故意拼錯時 tsc 報錯（實驗後改回）；線上訊息格式不變（`tests/net/*.test.ts` 全綠）。

**五分鐘級、可以順手做的**：`loadRun` 刪檔前留一行警告（H-9）；`mimic_name.test.ts` 的 `if (!m) return` 改成斷言（H-11）；`storyslides.ts` 重複的那段註解拿掉一份。

**要主控或使用者先裁定的**：封封四組沒接上的台詞要接還是刪（H-7）；`pickable` 起手牌那條往哪邊統一（H-7）；菲菲的圖鑑分區要不要改名（H-10）。

---

## 五、不建議這一輪做的大重構

1. **拆 `combat.ts`（或拆 `settle`、`onApplied`）**：30 個測試檔讀它的原始碼，其中 11 個照縮排切一段出來、塞 20～40 個假變數執行。只要把函式搬出閉包、換縮排、改名，這些測試就會成批變紅，而紅的原因是「字串找不到」，不是行為錯——驗收會失去意義。加上連線演出的時序（`hold`／`release`、遠端演出排隊、逐格動作的收尾）交錯在閉包變數之間，又沒有瀏覽器層的自動測試，拆壞了只有實機玩才看得出來。先照 H-5 的「止血」規矩，等測試逐步改成測純函式之後，再一段一段搬。
2. **把 `effects.ts` 的 `applyOne`（79 個分支）改成查表**：有 `never` 守門，拆了只是換寫法，沒有降低風險。
3. **重寫 `smartbot.evaluate`**：它量出來的數字是之前每一次平衡裁定的基準，重寫會讓歷史對照全部失效。
4. **把「球球＝`hero` 欄位不寫」改成一律寫 `'ninja'`**：牽動存檔格式、局面碼、舊存檔相容與約 30 處 `?? 'ninja'`；收益是少一類錯，但用 `Hero` 型別在邊界收斂（H-2 第 3 塊的 `localHero()`）就能拿到大部分好處。
5. **台詞表改用編號當鍵**：現在 700 多個鍵全部對得到原句、而且有測試守，改編號要動全部劇本檔，得不償失。
6. **把三隻同伴的出牌動作規則（`companionCardAction`）合併成一套**：三隻的差異就是設計本身，合併很容易改到某張牌的動作。
7. **事件選項規則搬進引擎（H-4）**：值得做，但它碰連線投票流程，建議排在下一輪、單獨一批做並實機驗兩台。
