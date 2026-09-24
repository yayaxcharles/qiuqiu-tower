# b3rare 報告：稀有事件 5 篇、沾了魔氣的秘寶與淨化、新秘寶 9＋淨化版 6（2026-09-24）

worktree `F:\ClaudeWork\qq-b3rare`，分支 `c0923-b3rare`，一筆提交 `9f052660`（從 `25952e4d` 開出）。
驗收：`npx tsc --noEmit -p .` 零錯誤；`npx vitest run` 339 檔全過、3169 條過、9 條略過，沒有 Errors 那一行；`docs/怪物工作檯.json`、`docs/牌池總表.json` 只差日期，已還原；`docs/事件文案.md`、`docs/分關載入.json`、`docs/秘寶量尺.md` 是真的重生，一起提交。

## 一、改了什麼

### 稀有事件（design3 第五節，新L）
- `src/content/events-rare.ts`（新檔）：五篇，球球那份文字照設計稿抄；`rare: { weight, miasmaWeight?, maxMiasma? }`（溫泉 3／有魔氣時 6、籤筒 3、大魔物 3、紫霧 2 且身上 2 件以上魔氣不放、大俠貓 2）；關數照表。**大俠貓那篇用主控裁決 2 的替代版**：開頭寫壓扁的貓形窩、一撮灰色帶深紋的毛、酒葫蘆、草裡摺起來的舊紙；①撿舊紙（上面只有大貓出招的墨畫）選絕學，掉血寫成照著練摔的；②葫蘆掉血寫成葫蘆上殘留的紫氣鑽進身體（圖上不用畫）；③在他壓出來的窩裡睡一覺。
- `src/content/events.ts:4,575`：併進 `events`；`events.ts:314-317` 倒了的神龕加條件選項【魔氣】（`requires: { kind: 'miasmaRelic' }`、`purify 1`、結果圖 `broken_shrine_r2`），加在最後、既有兩個選項沒動。
- `src/content/event-text-b3rare.ts`（新檔，延後載入那一塊）：菲菲、噹噹、封封三份整段、抽到之後的那一句（`LOTTERY_AFTER`＋`lotteryAfter`）、神龕的條件提示句（`EVENT_COND_HINTS_B3`）。`event-text.ts:2-13` 併進三張表，`condHint` 改成先查第三批再查第二批（第二批那張表一個字沒動）。
- 放置：`src/engine/run.ts:1515 placeRareEvent`——分支亂數 `<種子>|rare|<關>` 擲 25%，候選照權重抽、蓋掉一格非 5F 的事件格；`newRun`（:79）、`advanceAct`（:585）生完地圖後叫。`src/engine/map.ts:304` 一般佇列排掉 `rare`。`run.ts:161` `enterEvent` 遇到稀有事件不換後集。
- 事件畫面 `src/ui/screens/event.ts`：金牌「難得一見」（`markRare`，開場、結果、選牌三個畫面都掛）、開場播秘寶音、結果後面接「抽到之後的那一句」、抽獎也算「會掉血」的高難度提示。地圖 `src/ui/screens/map.ts:255` 走過的稀有事件那一格掛 `rare`（`map.css` 金色濾鏡）。

### 新效果（新F／新K／新M／新N／新O）
- `src/engine/types.ts`：`RelicPool` 加 `'淨化'`；`RunEffect` 加 `lottery {table, shared?}`、`purify {n: 1|'all', orRemove?}`、`loseAllPotions`、`relicMiasma {fallbackFish}`；`fight` 加 `pool?: '大魔物'`；`relicId` 加 `fallbackPool?`；`ChoiceCond` 加 `miasmaRelic`；`EventDef.rare`；秘寶掛鉤 `winPotion`、`restCardReward`、`qmarkNoAmbush`、`qmarkHeal`、`qmarkEvery`、`chestExtra`、`stampCard`。
- `run.ts applyRunEffects`：`lottery`（:1381；籤筒用整局亂數各自抽；大魔物②標 `shared`，用這一格的分支亂數，兩個座位抽到同一格）、`purify`（:1393；一件直接淨化、兩件以上回 `{ purify: [...] }` 讓玩家挑、紫霧沒得淨化改移除一張）、`loseAllPotions`、`relicMiasma`（淨化版也算有）、`fight.pool`（`eventElite` :1536，分支亂數，兩個座位同一組）、`relicId.fallbackPool`。
- `RunEffectOutcome` 加 `{ purify: string[] }`；事件畫面單人挑完當場淨化、連線走新投票種類 `evpurify`（`src/net/session.ts:23`），套用掛在 `take()`，沒得挑的投空票。
- `src/engine/eventcond.ts:79`：`miasmaRelic` 條件（養成型，任一位有就出現，「因為」那行寫帶著哪一件）。

### 魔氣與淨化（第六節，新K）
- `src/content/relics.ts`（檔尾新段）：`MIASMA_PURE` 表（六件→淨化版）、`isMiasma`、`MIASMA_NOTE`。**既有四件的條目一個字都沒動**（避開 bal），哪幾件算魔氣只寫在這張表；`relicLongText` 對這六件補「（沾了魔氣：可以淨化（貓窩、玳瑁婆婆、某些事件））」。塔主池四件代價型、貪吃錢袋、山賊的欠條不在表上。
- `run.ts:1555 purifyRelic`：原地換代號、照兩件 `maxHp` 差調整（血契短刀 +12 上限與當前）。
- 貓窩：`rest(run, '淨化', …, relicId)`（`run.ts:786`）；`src/net/runaction.ts` 的 `rest` 動作加 `r`、`canApplyRun` 驗身上有那件；`src/ui/screens/rest.ts` 身上有魔氣秘寶才出現「點一炷清心香」（兩件以上跳 `src/ui/purifypick.ts` 挑選窗，可「先不要」）；點完演旁白＋角色一句（`src/content/purify-text.ts`），那一格圖示閃白金光。
- 狀態列 `src/ui/hud.ts`：沾了魔氣的左上角小紫火（`.hud-relic.miasma`）；圖鑑 `src/ui/itemcompendium.ts` 淨化版跟在原件下面一格、身上沒有的畫剪影（`淨化` 池不自成一區，`RELIC_POOLS` 那一行沒動）。

### 新秘寶 9＋淨化版 6（第七節，新P）
- `relics.ts` 檔尾新段（舊條目沒動）：常見 +4（藥簍、夢枕、平安繩、探路杖）、大魔物 +2（箱中箱、魔氣燈籠）、塔主 +1（鎮魔符）、罐頭鋪 +1（集章卡）、事件 +1（沾了魔氣的舊護腕）；淨化版 6。池子 起始 4／常見 42／大魔物 35／塔主 31／罐頭鋪 4／事件 4＝120，另淨化 6（資料表 126 筆）。圖示鍵照 art5，魔氣殘片原件照舊 `relic_demon_shard`、淨化版 `relic_miasma_shard_pure`。
- 藥簍 `run.ts:1676 herbBasket`（`finishCombat` :541 叫）：單人把戰利品忍具換成罕見以上；兩個人時只有帶的那位保證有（`CombatRewards.potionPerSeat`，`rewards.ts`；`reward.ts:324,350` 各拿各的那一支）。分支亂數。
- 夢枕 `restCardChoices`／`takeRestCard`（:1659、:1666，分支亂數、一格一次）；連線新動作 `restCard`；貓窩打盹之後先挑牌，連線時帶夢枕的人挑完才算做完。
- 平安繩：`chooseNode`（:101，多了 `notes`／`viewer` 兩個可選參數）走進事件格回 5 點，`app.ts enterNode` 用公告講。**「不會變伏擊」與探路杖計數照主控對齊通知交給問號格那條線讀掛鉤、自己數**，我這邊原本寫的 `qmarkNoAmbush()`／`scoutStaffTick()` 兩支已經拿掉（避免數兩次）。
- 箱中箱 `chestBonus`（:1698）**接在 `openChest`（:825）與 `openChestCoop`（:842）裡面**（主控對齊：路邊紙箱走這兩支就自動吃得到）；多給的寫進可選的 `bonus` 陣列給畫面講；連線時攤出來的兩件先排除；次數記在 `counters.box_in_box`，`counters.ts` 顯示剩幾次、用完 `relicSpent` 變灰。
- 集章卡 `stampVisit`（:1638）：走進罐頭鋪（`chooseNode`）與買到它的那一間（`buyRelic`）蓋章，店主讀 `MapNode.keeper`（沒有那一欄＝橘貓老闆），四位各一個位元、集滿三個給塔主秘寶並九折（`shopMulFor`）。
- 鎮魔符、魔氣燈籠、舊護腕全用既有掛鉤。

### 機器人（`src/engine/smartbot.ts`、`coopbot.ts`）
- `eventValue`：`lottery` 各格估值×機率、`purify` 用量尺「淨化版−原件」的事件分（`purifyGain`）、`loseAllPotions` 每支 −7、`relicMiasma` 候選平均、`fallbackPool` 那池平均、`fight.pool` 再扣 15。
- 挑一件淨化：`bestPurify`（淨化後分數多最多）；貓窩 `restPurifyPick`（收益 ≥1.5 層、血 ≥ 六成、不是 44F 才淨化）；夢枕 `takePillowCard`；集章卡 `nodeScore` 罐頭鋪 +15（這位店主還沒蓋過）。

## 二、測試（新三檔）與反向變紅
- `tests/engine/content_batch3_rare_0923.test.ts`（31 條）、`tests/content/content_batch3_rare_text_0923.test.ts`（11 條）、`tests/ui/content_batch3_rare_ui_0923.test.ts`（15 條）。
- 改了既有測試（數字跟著新內容走）：`relics.test.ts`（126 筆＝120＋淨化 6、各池件數）、`events.test.ts`（78 篇；`fight.pool` 改驗那一關那一池有遭遇、抽獎的子效果也走一遍）、`eventfight_act.test.ts`（排掉 `fight.pool`）、`content_batch2_mechanics.test.ts`（限定池各 4 件）、`bot.test.ts`（bal-453 定錨重錄：秘寶池變大，抽到的東西不同）、`manifest_hygiene.test.ts`（`BATCH3_PENDING` 拿掉 `broken_shrine_r2` 與 `rare_*` 17 筆）；`tools/codex_jobs/_feifei_result_text.json` 用 `UPDATE_FEIFEI_TEXT=1` 重生。
- 反向變紅：寫了腳本 `scratchpad\content\b3rare\redcheck.py`，把修正暫時改回壞寫法、跑指定測試、再還原，18 條全部紅：拿掉 `map.ts` 的 `!e.rare`、拿掉 `enterEvent` 保護、稀有事件改整局亂數、拿掉 `shared`、大魔物池改整局亂數、藥簍不接、淨化不調最大生命、箱中箱不接在 `openChest`、連線不排除攤出來的、集章卡不打折、箱中箱不記次數、平安繩不回血、叫醒大魔物不扣 15、封封講喵、大俠貓本人出場、抽到之後少一隻、神龕提示句漏一隻、事件畫面不投淨化空票。

## 三、量尺（`RULER=relics RULER_ONLY=<15 件>`，四隻各 600 局，約 3.5 分鐘）
層差（平均多爬幾層；± 約 0.4～0.7）：

| 秘寶 | 球球 | 菲菲 | 噹噹 | 封封 | 設計稿預估 |
|---|---|---|---|---|---|
| 藥簍（常見） | +4.0 | +3.7 | +5.0 | +4.2 | +1～2 → **偏強**（常見池中位約 +1.5） |
| 夢枕（常見） | +1.3 | −0.2 | −0.2 | +0.3 | +1 → 偏弱（機器人多半不拿） |
| 平安繩（常見） | +2.5 | +2.0 | +2.0 | +1.4 | +0.5～1；**只量到回血**，不伏擊要合併後重量 |
| 探路杖（常見） | +0.7 | +0.3 | +0.1 | +0.2 | 我這條線沒有問號格變化，**量不出來** |
| 箱中箱（大魔物） | +1.8 | +2.9 | +2.2 | +2.7 | +2 |
| 魔氣燈籠（大魔物） | +2.7 | +2.4 | +2.9 | +2.4 | +2～3 |
| 鎮魔符（塔主） | +5.1 | +7.3 | +5.6 | +5.1 | +4～6（沒超過 +8，不用改對關主無效） |
| 集章卡（罐頭鋪） | −0.1 | −0.1 | −0.3 | −0.1 | 我這條線只有橘貓老闆、集不滿，**量不出來** |
| 舊護腕（事件） | +6.3 | +1.2 | +3.2 | +4.4 | +3～4 |

淨化的收益（淨化版−原件，層）：魔氣護符 +0.9／+3.8／+3.2／+4.5；血契短刀 +3.5／+4.0／+6.0／+3.6；黑貓面具 +0.9／+1.1／+1.6／+2.0；魔氣殘片 +0.9／+1.5／+0.1／+1.7；舊護腕 +3.1／+4.3／+3.8／+3.4；魔氣燈籠 +2.5／+1.5／+2.0／+2.7（球球／菲菲／噹噹／封封）。
- 分數表寫進 `src/engine/relic-ratings.json`、`docs/秘寶量尺.md`（`tools/relic_ruler.ts` 報表加一區「淨化」）。**注意**：重量時基準也重跑了、月光晶石只加最大生命被當成錨點，「一層幾分」8→7.9，所以舊條目的 `ev` 全部小幅變了（`d` 沒變）；bal 也在改這個檔，合併一定衝突，照主控說的合併後重算。

## 四、重複感（`smartRun` 加觀察點，四隻各 600 局；腳本 `scratchpad\content\b3rare\_b3rare_sim.test.ts`，沒提交）
| 角色 | 地圖有稀有事件 | 整局走進過一篇 | 走到 45F／通關那幾局 | 每關走完時遇到 |
|---|---|---|---|---|
| 球球 | 25.2% | 19.0% | 42.9%（98 局） | 11／17／17% |
| 菲菲 | 25.0% | 18.5% | 40.4%（89 局） | 13／17／11% |
| 噹噹 | 25.0% | 16.5% | 39.1%（64 局） | 13／12／16% |
| 封封 | 24.1% | 14.8% | 29.2%（48 局） | 14／10／4% |
設計稿估「完整一局約三成、機器人平均長度約 16%」，量到的差不多（完整局樣本少，± 大）。

## 五、實機（Playwright，`vite preview --port 5431`，每個 context 全新暫存設定檔，只開本機）
- 單人四隻各跑一遍 `scratchpad\content\b3rare\pw\solo.js`：五篇開頭＋每個選項重開一次按下去（含抽獎、挑一件淨化、紫霧沒魔氣改移除、叫醒大魔物到「開打」）、神龕【魔氣】、貓窩清心香（兩件挑一件）、夢枕、箱中箱、地圖金色問號＋紫火。自動檢查 球球 92／菲菲 107／噹噹 107／封封 107 條全過，沒有頁面錯誤、沒有 404。
- 連線 `pw\coop.js`（菲菲開房＋球球加入）：兩人都兩件各自挑、只有一位兩件另一位投空票、大魔物②兩台同一格、貓窩一人清心香一人夢枕，20 條全過、兩台帳一樣、沒有斷線橫幅。
- 截圖在 `scratchpad\content\b3rare\shots\<角色>\`（每隻另有 `sheets\` 兩張一組的聯絡表）。**每張主圖與結果圖我都用 Read 看過**：圖文對得上、四隻都是自己的版本（主圖／結果圖的 `data-art-cast` 也逐張驗過）。看到的兩點：①大魔物那團黑影在暗色事件底圖上不太明顯（原圖看得清楚，是透明底疊在暗底上）；②有收穫的選項（溫泉③、大俠貓①升級與學招）牌卡疊在結果圖前面，把人物遮住，這是既有版面規則，沒改。
- 實機看到後修掉的：抽獎提示「中籤。；回復了…」句尾重複標點（提示改成不帶句號）；清心香灰字對菲菲、封封寫成「磨爪」（改用 `sharpenVerb`）；挑選窗補「淨化時最大生命 +12」。

## 六、首載（`SITE_NAME=qiuqiu-tower-coop npm run build && python tools/check_size.py`）
| | 起點 `25952e4d` | 我這條線 |
|---|---|---|
| 首載程式 | 631.2 KB | **655.8／680 KB（96.4%）**，+24.6 KB |
| 樣式 | 114.3 KB | 115.0／120 KB |
| 首載圖片 | 11.15 MB（超標） | 9.64／10.60 MB |
| 首載總計 | 11.89 MB（超標） | 10.41／11.30 MB |
- 圖片降 1.5 MB 大多**不是我的功勞**：起點的 `docs/分關載入.json` 沒重生，130 張新圖全被算進首載；我這條線跑全套測試重生之後，本來就延後的那些才算對。我自己的部分是五篇主圖接進 `events.ts` 後照地圖現抓。祝福物品圖示、店主立繪、祝福主圖、問號格三種的球球版仍在首載，是另外三條線的。
- **首載程式 +24.6 KB 偏多**：其中約 11 KB 是五篇稀有事件的球球文字（`events-rare.ts` 跟其他事件一樣在主程式裡），其餘是引擎與貓窩畫面。四條合併後若超過 680，要嘛把稀有事件的球球文字搬進延後那一塊（要改引擎讀文字的方式），要嘛調上限。

## 七、給另外三條線的介面
- **店主輪替 b3shop（玳瑁婆婆「請婆婆淨化」）**：`run.ts` 的 `PURIFY_PRICE`（90）、`canPurifyAtShop(run, shop, relicId, seat)`、`purifyAtShop(run, shop, relicId, seat, notes?)`（付錢、淨化、`shop.purified = true`，一間一次；`ShopStock` 多了 `purified?`）；連線動作 `{ t: 'purify', seat, id }` 已加在 `runaction.ts`（`canApplyRun` 要在店裡），`session.ts` 的 `isShopAction` 也收了它。**「是不是婆婆顧店」由你們在畫面判斷**（引擎不看店主）。兩件以上叫 `ui/purifypick.ts` 的 `showPurifyPick(ids, cb, { cancellable: true })`；按鈕字 `tortoisePurifyLabel(PURIFY_PRICE)`、婆婆那句 `TORTOISE_PURIFY_LINE`、角色那句 `purifyLine(hero)`（`content/purify-text.ts`）。罐頭鋪畫面我沒動。集章卡讀 `MapNode.keeper` 的四個代號（orange／tortoise／curio／junk，照設計稿），`shopMulFor` 多乘集滿後的九折（一行）。
- **問號格 b3qmark**：稀有事件看 `eventById[id]?.rare`；平安繩 `qmarkNoAmbush`、探路杖 `qmarkEvery` 你們讀、你們數。**`counters.ts` 我讓探路杖圖示顯示 `counters['scout_staff']`**——你們的計數若不是存在 `RunPlayer.counters[秘寶代號]`，合併時要對齊那一行。平安繩回血在 `chooseNode` 看的是節點型別 `事件`，變成伏擊／行腳商的格子若型別仍是事件就照樣回。路邊紙箱走 `openChest`／`openChestCoop` 就吃得到箱中箱；要講多給了什麼，傳第二（連線是第一）個參數的陣列。
- **開局祝福 b3bless**：`lottery` 的形狀在我這裡定了（`{ kind: 'lottery', table: [{ w, tier, effects }], shared?: true }`，`tier` 是提示那一句），你們若也加了一份要合成一份；「沾了魔氣的舊護腕」`master_bracer`（事件池）在我這裡定義。

## 八、沒做的與原因
- 婆婆的畫面與按鈕：派工單指定只寫介面（見上）。
- 平安繩「不會變伏擊」、探路杖：主控對齊通知交給問號格那條線；在我這條線兩件的量尺因此不準。
- 集章卡在我這條線集不滿（只有橘貓老闆），量尺量不出來。
- 圖鑑的剪影只看這一局身上有沒有（沒有「曾經拿過」的跨局紀錄）。
- 淨化那一格圖示的白金光只有在狀態列顯示得到那一件時才看得到（最多畫 8 件）。

## 九、需要主控決定的事
1. 「掉進貓薄荷田的大俠貓」標題沿用，但替代版裡大俠貓不在場；要不要改名（例：「大俠貓打過滾的貓薄荷田」）。
2. 首載程式 655.8／680 KB（見第六段）。
3. 藥簍量到 +3.7～+5.0 層，是常見池裡偏強的；要不要降（例：只保證有、不升罕見，或漲價）。另外它對關主戰也發（設計稿寫「打贏戰鬥時」，我照字面）。
4. 夢枕量到約 0（機器人常不拿三選一的牌）；要不要加強（例：可以挑升級版）。
5. 分數表的舊條目 `ev` 因重算「一層幾分」而小幅變動，合併時跟 bal 一起重算。
6. 大俠貓那篇我用 grep 查過四隻主線（塔頂、吼聲、酒葫蘆、貓薄荷、打滾、第一次見等字）沒有衝突；沒有逐句讀完四隻全部主線。語氣上一點：主線寫塔頂傳來痛苦的吼聲，這篇是「他剛在這裡打過滾」，我讓四隻都用疑問或驚訝的口吻帶過，沒加新身世。

## git log
```
git log --oneline 25952e4d..HEAD
9f052660 內容擴充第三批（b3rare）：稀有事件 5 篇、沾了魔氣的秘寶與淨化、新秘寶 9 件＋淨化版 6 件
```
（`git log --oneline coop..HEAD` 會連同起點之前還沒進 coop 的第二、三批合併一起列出，最上面一筆是上面這筆。）
