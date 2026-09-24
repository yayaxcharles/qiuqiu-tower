# 封封引擎規則整合稽核

- 稽核日期：2026-09-20
- 規格來源：`docs/第四隻角色_封封_提案/封封_卡牌設計與實作交辦_2026-09-19.md`
- 稽核範圍：`src/engine/combat.ts`、`effects.ts`、`run.ts`、`types.ts`、`save.ts`、`hero.ts`、`src/content/cards.ts` 的封封牌，以及 `src/net` 的開局、重連與指紋路徑
- 排除範圍：劇情文字與圖片、戰鬥畫面演出、實體兩台裝置連線

## 結論

目前 32 張封封專屬牌的普通版與升級版資料、起手 10 張、舊劍穗、牌池與四張合作牌均符合規格。蓄氣由每位玩家各自保存；一張牌只取得一次支付快照，多段與全體傷害不會重複扣氣；影子分身的每次追加施放則建立新快照。出牌前條件、實際支付後條件、能力每本人回合一次、同名能力升級、倒下中止、雙席初始化、合作牌替代與飯糰封禁均已沿實際結算路徑核對。

稽核確認三項會改變遊戲結果的缺陷與一項提示缺陷。四項均已完成最小修正並以原重現複審；目前沒有未關閉的中度或高度問題。

## 已確認並修正的問題

### 中度一：引擎產生的倒下合作席無法通過存檔驗證

修正前，`finishCombat` 會把倒下席寫成 `down=true, hp=0`，但 `save.ts` 的 `usablePlayer` 拒絕所有 `hp<=0`。直接以兩席封封完成戰鬥、保存再載入，修正前得到：

```json
{"downSeatHp":0,"downSeatDown":true,"checkRun":false,"loadRun":false}
```

這是引擎資料契約矛盾。現行畫面刻意不保存合作局，因此不會由一般合作介面直接刪除進度；問題仍會使 `saveRun`、`checkRun`、`loadRun` 無法處理引擎本身產生的有效兩席狀態。

修正位於 `src/engine/save.ts:158`：`down===true` 時只允許 `hp===0`，其他玩家必須 `hp>0`，負生命與 `down=true, hp>0` 仍拒絕。原重現修正後得到：

```json
{"checkRun":true,"loadRun":true,"down":true,"hp":0,"revive":true,"revivedHp":22}
```

回歸測試位於 `tests/fengfeng_persistence.test.ts:57`，涵蓋 `finishCombat`、`saveRun/loadRun`、扶起，以及三種非法生命組合。

### 中度二：已生效的同名能力仍可再次付費並消耗手牌

修正前，`effects.ts` 雖不會疊加同名能力，但 `canPlay` 沒有在付費前拒絕。第二張同版能力會少一顆飯糰並進入消耗堆，能力數量仍只有一份：

```json
{"first":true,"canSecond":{"ok":true,"cost":1},"second":true,"energyBefore":8,"energyAfter":7,"powerCount":1,"inExhaust":true}
```

修正位於 `src/engine/combat.ts:379`：只預查本牌直接效果中的 `power.sameNameMax`，按 `cardId` 與 `trigger` 配對。同版或既有升級版會在扣飯糰、移牌與觸發能力之前拒絕；基礎版升級仍可取代，並由 `src/engine/effects.ts:498` 保留既有 `firedTurn`。

原重現修正後，第二張同版得到 `canPlay=false`、`playCard=false`，飯糰維持 8、牌留在手上、未進消耗堆，能力與觸發紀錄不變。另驗證基礎版可以升級，升級版生效後不能用基礎版降級。回歸測試位於 `tests/fengfeng_engine.test.ts:104`。

### 中度三：零蜷縮攻擊被下一擊支援強行製造傷害

規格要求下一擊加成只加入原牌已產生的第一個直接傷害；原牌因資源為零而沒有傷害事件時，加成要消耗，但不能憑空製造一擊。

修正前，封封以 3 點蓄氣使用「你從右邊上」給噹噹 9 點下一擊加成後，零蜷縮的「卸力掌」仍造成 9 點傷害：

```json
{"ok":true,"damage":9,"hits":[{"uid":1,"amount":9}]}
```

修正位於 `src/engine/effects.ts:685`：`damageSpendBlock` 的原始基礎值小於等於零時直接留下「沒有蜷縮可卸」紀錄並返回，不再以存在下一擊加成作例外。`playCard` 已在合法攻擊開始時取走加成，因此消耗語意保持不變。

原重現修正後得到：

```json
{"beforeBonus":9,"ok":true,"damage":0,"newHits":0,"bonusConsumed":true,"lastLog":"噹噹身上沒有蜷縮可卸"}
```

6 點蜷縮加 9 點支援仍造成 15 點傷害。回歸測試位於 `tests/fengfeng_coop.test.ts:90` 與 `tests/fengfeng_coop.test.ts:100`。

### 低度：隊友已結束時的拒絕理由不符合規格用語

修正前，活著隊友已按結束時使用「你從右邊上」，功能會正確拒絕且不扣資源，但回傳的是：

```json
{"ok":false,"reason":"下一擊準備沒有提高"}
```

規格要求此情形提示等待下一回合。修正後，只有「你從右邊上」的唯一存活隊友已結束而沒有可用受益者時，回傳明確的等待提示；既有同等或更高加成仍使用原本理由。「現在一起上」只要自己仍可提高，仍可合法施放。

## 規則核對矩陣

| 規則 | 實作證據 | 結果 |
|---|---|---|
| 32 張牌與升級資料 | `src/content/cards.ts:920-1011`；`tests/fengfeng_cards.test.ts` 逐張核對識別字、費用、牌型、稀有度、牌池與效果 | 通過 |
| 起手與起始秘寶 | `starterDeckFor('fengfeng')` 為平斬 4、護身 4、吐納 2；`old_sword_tassel` 的開戰效果為蓄氣 2 | 通過 |
| 蓄氣每人獨立、上限 12 | `PlayerCombat.qi` 為席位欄位；`gainQi` 夾在 0 至 12；雙封封測試分別支付 | 通過 |
| 每張牌只支付一次 | `src/engine/effects.ts:52` 以 `ctx.qiSpent` 快取；多段與全體迴圈共用同一個 `EffectCtx` | 通過 |
| 傷害前先支付 | `damageSpendQi` 在進入目標與段數迴圈前呼叫 `spendQi`；反彈致倒下測試確認已扣氣，後續抽牌與回氣停止 | 通過 |
| 出牌前與支付後條件 | `playCard` 在效果前保存 `qiBefore`、`allyBlockBefore`；`ifSpentQiAtLeast` 讀同次 `qiSpent` | 通過 |
| 複製與追加施放 | 原牌與每次影子分身建立各自 `EffectCtx`；3 點蓄氣的平斬依序花 2、1，合計造成 16，原卡只移牌一次 | 通過 |
| 能力每本人回合一次 | `firedTurn` 與共同玩家階段的 `cs.turn` 配對；隊友出牌、準備切換與連線狀態不會重置 | 通過 |
| 同名能力取高 | `canPlay` 先拒絕同版與降級；基礎升級由 `power` 分支取代並保留 `firedTurn` | 通過 |
| 藏鋒從下一回合生效 | 能力在本回合開始後才加入，只有下一次 `turnStart` 會執行 | 通過 |
| 倒下與戰鬥結束 | `damagePlayer`、`markCombatWon`、`finishCombat` 清除蓄氣、下一擊與飯糰封禁；施放者倒下後效果與能力獎勵停止 | 通過 |
| 兩席與角色初始化 | `newCoopRun` 按每席角色發起手牌與秘寶，牌號共用遞增；`beginCombat` 對加入席走同一套開戰秘寶 | 通過 |
| 孤身與隊友倒下替代 | `ally` 與出牌快照均選另一個存活席，找不到時回自己；四張合作牌的自用數字已測 | 通過 |
| 隊友已結束 | 蜷縮支援仍可給；需要下一張攻擊的支援會拒絕，且提示等待下一回合 | 通過 |
| 隊友斷線 | 連線狀態只暫停本機操作與顯示橫幅，不改 `CombatState` 的存活席，因此受益者不切回自己 | 通過（原始碼與會話測試） |
| 下一擊第一段第一目標 | 加成在第一個 `attackable` 目標使用一次；多段與全體測試分別只增加一次 | 通過 |
| 下一擊零資源攻擊 | 合法攻擊先消耗加成；`damageSpendBlock` 原始值為零時不建立傷害事件 | 通過 |
| 「現在一起上」取大 | 至少一位受益者能提高才可施放；每席以 `Math.max` 保存，不相加 | 通過 |
| 集中精神 | 所有新增飯糰走 `gainEnergy`；封禁只使新增量為零，不扣現有飯糰；轉移在受益者封禁時不扣贈送者 | 通過 |
| 重連與對帳 | 傳輸層補送動作而不重建戰鬥；戰鬥指紋包含每席的蓄氣、下一擊、飯糰封禁、能力版本與 `firedTurn` | 通過（原始碼與會話測試） |
| 戰後保存與扶起 | 有效倒下席 `down=true, hp=0` 可保存、載回並由 `revivePartner` 扶起；非法生命組合拒絕 | 通過 |

能力效果在原牌與既有反應完成後執行，且不會回到 `playCard`，因此不遞迴。現行「循息」只回應技能牌，「收勢」與「連息」只回應攻擊牌；後兩者的蜷縮與抽牌在目前規則下互不改變彼此結果。稽核沒有把未造成可觀察差異的未來風險列成缺陷。

## 驗證

完成修正後執行的主要驗證如下：

```text
npx vitest run tests/fengfeng_cards.test.ts tests/fengfeng_engine.test.ts tests/fengfeng_coop.test.ts tests/fengfeng_persistence.test.ts tests/fengfeng_mimic.test.ts tests/net/runaction.test.ts tests/net/session.test.ts tests/engine/coop_join_firstturn.test.ts tests/engine/coop_card_pool.test.ts
```

結果為 9 個測試檔、91 項測試全部通過，耗時 535 毫秒。`npx tsc --noEmit` 亦以狀態碼 0 完成。零蜷縮修正另連同噹噹既有測試執行 5 個測試檔、60 項測試，全部通過。

另以獨立的 Vite 伺服器端模組重現腳本直接呼叫引擎，複驗倒下席保存、同名能力拒絕、基礎版升級、升級版降級拒絕，以及零蜷縮支援。這些數字來自實際執行，不是只比對原始碼字串。

本次沒有操作瀏覽器，也沒有以實體兩台裝置進行中途斷線。重連結論的證據界線是：`src/net/ws.ts` 的訊息歷史補送、`CoopSession` 沿用同一份戰鬥狀態、狀態指紋涵蓋封封欄位，以及既有會話測試的離線／回線序列。視覺演出與兩台裝置的最終體驗由另一路實機驗收負責。
