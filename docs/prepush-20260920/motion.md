# 合作版推送前動作程式稽核

日期：2026-09-20。專案：`F:\ClaudeWork\qiuqiu-coop`。任務提供的基準：`28d48f598cbf023ff23f249eece9e6e6cd6d031a`。

本輪重新讀取目前程式，並參閱 `docs/motion-code-audit.md`；未將舊文件的通過結論當作本輪證據。初始為唯讀稽核，根代理後續明確授權僅修正本輪重現的兩項問題及必要回歸測試。未執行暫存、提交、推送、遠端操作或單人版操作；未撤回其他人的同步修改。

## 結論

重現兩項中度缺陷，均已最小修正並以先失敗、後通過的回歸測試驗證。本輪動作範圍未再確認其他可觸發缺陷。以下是程式執行與自動測試結論，並非真人連線或瀏覽器肉眼演出驗收。

## 一、單張延遲確認遺失近戰原始行程：中度，已修正

- 精確位置：`src/ui/screens/combat.ts:3533`、`:3565`、`:3583`、`:3586`。影響鏈為 `idleMotion()` 的 `:566` 清除行程，以及 `:2952` 起的延伸波次恢復。
- 可觸發情境：客戶端噹噹打出「肉球連擊」（`roubao`，對應 `rapid_combo`）。單波預演於 520 毫秒收招；主機的單張確認於 600 毫秒到達，兩波實際總長為 760 毫秒。此時演員的 `state.trip` 已由正常收招清掉。
- 修正前行為：單張確認只讀取 `localMotion.trip.plan.approachMs`，沒有將原本的 `trip` 傳入 `settle()`。恢復分支雖正確辨識同一代次並續播，卻呼叫 `playMotion(..., trip=undefined)`，使 `state.away=false`，餘下近戰在我方原位演出。補批路徑本來有保存行程，因此僅測補批或純時間函式會漏掉此問題。
- 執行證據：系統暫存重現程式抽取當時正式程式的 `idleMotion()`、單張確認分支及恢復分支執行，得到原行程 `dx=300`、確認 `impactElapsed=600`，但恢復的 `trip=undefined`。正式回歸測試修前在 `state.away` 應為 `true`、實為 `false` 處失敗。
- 最小修法：單張確認增加 `ownMotionTrip`，保留 `localMotion.trip`，傳入自己的 `motionTrip`；收到較新動作時的代次守衛保持原樣，補批路徑不變。
- 修後證據：回歸測試透過真實 `playMotion()` 驗證演員維持 `active=true`、`away=true`，原點仍為 `{x:100,y:200}`、位移仍為 `dx=300`，且行程延長到 760 毫秒。

## 二、合作倒下席在戰勝後被強制播放勝利：中度，已修正

- 精確位置：`src/ui/screens/combat.ts:3142`。
- 可觸發情境：合作戰鬥一席 `down=true`、`hp=0`，另一席擊敗最後敵人。勝利收尾計時到達後，原本對所有已接入動作的角色呼叫 `playMotion(..., 'win', ..., reactive=true)`。
- 修正前行為：`reactive=true` 允許直接播放，倒下席因此變成 `active=true/action='win'`，短暫站起慶祝，待動作結束再回到倒下狀態。這與待機解析函式本來將 `down` 優先於 `won` 的規則不一致。
- 執行證據：抽取真實 `checkOver()` 與 `playMotion()` 後，以一席倒下、一席存活執行，修前兩席均收到 `win`；新增回歸測試分別將座位 0、座位 1 設為倒下，均在預期 `defeat`、實為 `win` 處失敗。
- 最小修法：勝利播放迴圈增加 `!q.down`，保留存活席原本的勝利流程。
- 修後證據：兩席參數案例均確認倒下席保持 `defeat` 且非主動播放，存活席為 `win` 且正在播放。

## 修正檔案

- `src/ui/screens/combat.ts`：本輪最小差異為新增 5 行、刪改 3 行。
- `tests/ui/combat_motion_flow.test.ts`：新增 3 項整合分支回歸測試。測試使用 Vite 既有轉譯工具執行目前戰鬥畫面的原始函式及分支，驗證演員狀態、位置與呼叫資料；沒有將字串存在與否當成修正通過。

## 已核對範圍

- 戰鬥整合：`src/ui/screens/combat.ts` 的角色建立、狀態掛載、呼吸恢復、近戰位移、出牌、命中、反應、倒下、勝利、單張確認、合作補批、排隊等待及離場清理。
- 共用逐格：`frame-motion.ts`；球球動作：`qiuqiu-motion.ts`、`qiuqiu-combat-motion.ts`、`qiuqiu-choreography.ts`、`qiuqiu-melee.ts`、`qiuqiu-shuriken.ts`、`qiuqiu-motion-effects.ts`。
- 其餘動作：`companion-motion.ts`、`enemy-motion.ts`、`feifei-needles.ts`、`feifei-needle-patterns.ts`、`attack-impact-accent.ts`、`motion-preview.ts` 的播放與切換清理。
- 樣式：動作畫布、近戰層、同伴動作、敵人動作及 `combat.css` 的呼吸與朝向相關差異。
- 核對結果：玩家演員以座位隔離；命中計畫、血條待扣量及投射物目標以敵人 UID 隔離；`canAct()` 沒有因角色動作正在播放而新增出牌鎖；近戰行程同時受牌種與角色招式判定限制；離場集中清除動作計時器、投射物與演員；已確認的本機代次守衛及補批實際開始時間計算仍保留。
- 怪物朝向：逐格演員依動作的 `mirror` 設定繪製，未發現本輪新增的朝向程式缺陷。赤鬼受傷靜態圖在正式建置雜湊名稱下無法匹配 CSS 的問題由根代理另行重現與修正，本代理未碰該 CSS，亦未宣稱已完成其正式建置瀏覽器驗收。

## 本輪實際驗證

1. 修正前先執行 `npx vitest run tests/ui/combat_motion_flow.test.ts`：3 項均在預期的行為斷言失敗，非載入或測試架設錯誤。
2. 修正後，12 個直接相關測試檔、162 項全部通過：`combat_motion_flow`、`frame_motion_idle`、`qiuqiu_motion`、`qiuqiu_combat_motion`、`qiuqiu_choreography`、`qiuqiu_melee`、`qiuqiu_shuriken`、`qiuqiu_motion_effects`、`companion_motion`、`feifei_needles`、`enemy_motion`、`attack_impact_accent`。
3. 試玩與轉場補充驗證：6 檔、73 項全部通過：`motion_preview`、`motion_preview_playback`、`motion_result`、`act_motion`、`acttransition_motion`、`main_motion_boot`。
4. 合計本輪修後執行 18 檔、235 項，全部通過。
5. `npx tsc --noEmit`：退出碼 0。

## 尚未確認事項

- 本代理沒有操作瀏覽器，故未將真人合作網路抖動、裝置縮放下的肉眼銜接、實際素材美術或正式建置版 CSS 呈現列為已驗收。
- 本代理沒有執行全套專案測試及正式打包；根代理正在協調整體推送驗證。本輪 18 檔結果不可替代全套結果。
- 暫存 `qiuqiu-coop-motion-repro.cjs` 保留修正前的缺陷斷言作為歷史重現腳本；它讀取即時原始碼，修正後不應再滿足錯誤狀態斷言。修正後重跑以正式新增測試為準。
