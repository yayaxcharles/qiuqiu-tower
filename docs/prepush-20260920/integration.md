# 合作版推送前介面整合稽核

稽核目標：F:\ClaudeWork\qiuqiu-coop。基準 HEAD：
28d48f598cbf023ff23f249eece9e6e6cd6d031a。工作樹有其他代理的未提交修改，本次只讀，沒有修改正式程式、素材、測試或提交。

## 結論

指定介面與封封劇情路由的針對性測試通過，未發現可由目前程式碼證明的封封卡面、立繪鍵、故事配對或換場清理錯誤。工具交付仍有下列可重現問題，其中素材工具來源缺失、舊故事封裝檢查失配、封封入庫檢查失配會阻斷「在合作版重新驗證或重建」。

## 已確認缺陷

### INT-01｜中｜素材封裝工具在合作版不能重跑

合作版的工具以專案根目錄相對路徑尋找來源，但來源只存在文件所指的隔離工作區
F:\ClaudeWork\qiuqiu-coop-motion-20260920\tools\motion-art-source，合作版本身沒有這些目錄。

目前可重現的失敗工具與證據如下：

- tools/pack_companion_motion.py:66-68 尋找 tools/motion-art-source/fengfeng/actions.json；執行 fengfeng 時以 FileNotFoundError 結束。
- tools/pack_qiuqiu_extra_motion.py:8,30-31 尋找 tools/motion-art-source/qiuqiu/guard.png；執行以 FileNotFoundError 結束。
- tools/pack_fengfeng_event_art.py:27,136-144；--check 回報缺少 FG-EX1-R03 來源。
- tools/pack_fengfeng_extra_story.py:5-11；在第 7 行找不到 story-prompts.json。
- tools/pack_fengfeng_missing_story_art.py:20,142；--check 在 story-missing-v2 的第一張來源處以 FileNotFoundError 結束。
- tools/pack_fengfeng_pair_cards.py:6-12 與 tools/pack_fengfeng_shadow_relic.py:6-12；前三者還硬編本機生成圖目錄 C:/Users/yayax/.codex/generated_images/...，執行以 WinError 3 結束。
- tools/pack_fengfeng_story_wide.py:9-16；在第 15 行找不到 prompts.json。

最小修法：為所有封裝工具加入統一的 --source-root（或明確讀取交付說明中的隔離根目錄），並在執行前做來源預檢；移除個人生成圖絕對路徑，改由參數或已入庫來源提供。若大型原圖刻意不進版控，工具至少必須能在文件指定的隔離根目錄重現，且合作版的檢查指令要能明確提示來源位置。

### INT-02｜中｜舊故事封裝檢查與正式輸出規格矛盾

tools/pack_fengfeng_story_assets.py:30 固定 TARGET=(1280, 720)，:147 又要求輸出尺寸等於該值。實際執行
python tools/pack_fengfeng_story_assets.py --check
立即失敗：

輸出尺寸錯誤：public/assets/bg/fengfeng_still_return.webp (1672, 941)

目前正式 16:9 寬幅輸出已是 1672×941；該工具仍是舊的 1280×720 模糊側框封裝器。最小修法：更新檢查器與目前正式寬幅轉換規格，或將這支舊工具明確標為歷史工具並移出合作版交付清單；不能讓 --check 對已接受的正式檔回報失敗。

### INT-03｜中｜封封入庫檢查的來源與正式封面位元不一致

tools/integrate_fengfeng_assets.py:327-328 強制提案來源與正式輸出 SHA-256 完全相同。執行
python tools/integrate_fengfeng_assets.py --check
在第一張封面即失敗：

- 提案來源 docs/第四隻角色_封封_提案/07_整合用WebP/fengfeng_cover.webp：
  D536503960BA399BE52A76294C3C8714B5043DCC1FA54249037B38DC98BB31BC
- 正式檔 public/assets/sprites/hero/fengfeng_cover.webp：
  8174A18BF7C14F01C8CAB8CEF72C8867DC53D568B83E1C08577F73F01F6EB6F4

最小修法：由素材所有者確認哪一份是正式正本，更新來源、正式檔與入庫報告的對應；保留精確雜湊檢查，不應直接放寬檢查。

### INT-04｜中｜合作版交付說明的完整動作啟動器指向單人站

docs/motion-delivery.md:9 把 tools/launch-complete-motion.ps1 列為動作版啟動方式，但該檔案在
tools/launch-complete-motion.ps1:4-5,24 使用：

- /qiuqiu-tower/
- SITE_NAME='qiuqiu-tower'

合作版的正確預覽啟動器 tools/launch-motion-preview.ps1:4-5,24 則使用
/qiuqiu-tower-coop/ 與 SITE_NAME='qiuqiu-tower-coop'。
因此照交付文件執行完整動作啟動器，會啟動單人網址，不是本次稽核目標。最小修法：把合作版啟動器與文件統一指向 qiuqiu-tower-coop；若該檔案刻意保留給單人版，應從合作版交付說明移除。

### UI-01｜中｜延遲畫面載入失敗後沒有可操作的復原路徑

src/ui/lazy-screen.ts:28-30 的拒絕分支只以 root.replaceChildren 顯示
「畫面載入失敗，請重新整理再試。」；沒有重新整理按鈕、回標題按鈕，也沒有呼叫 app.show。
因此 combat、lobby 或 debug 的動態分塊載入失敗時，使用者會停在只含文字的錯誤頁，只能操作瀏覽器重新整理。

最小修法：在同一錯誤頁加入重新整理與回標題按鈕，並保留請求序號及目前畫面守衛。動作試玩入口
src/main.ts:59-71 已有按鈕式退路，這個修正應與其一致。

### UI-02｜低｜首載解碼失敗仍被記成已暖機

src/ui/assets.ts:427-432 捕捉 Image.decode() 失敗後繼續，:435-437 卻對整批 urls 呼叫 markWarmed(urls)。
src/ui/preload.ts:102 會跳過 warmed 中的網址，因此只要首載有一張圖因暫時性網路或解碼錯誤失敗，後續 preloadAct、preloadHeroArt 或遭遇預熱就不會再嘗試該網址。

最小修法：只把成功完成解碼的網址加入 warmed；失敗網址保留未暖機狀態，讓下一個預載階段可以重試。此項影響主要是失敗後的延遲顯示，未觀察到會使遊戲完全中止。

### TOOL-01｜中｜寬幅故事封裝器沒有唯讀檢查或明確套用閘門

tools/pack_fengfeng_story_wide.py 沒有 argparse 或 --check。:22 會無條件以生成檔覆寫保留來源，
:32-33 只在備份不存在時備份舊正式檔，:33-38 再直接覆寫正式輸出與報告。當隔離來源可用時，重跑一次就可能把已接受版本替換掉，而且第二次重跑不會再建立新的舊檔備份。

最小修法：加入只讀 --check 與明確 --apply；套用前比較來源與既有輸出雜湊，並每次以唯一備份保存舊輸出。這項與 INT-01 的來源缺失不同，即使來源補回，破壞性預設仍存在。

## 已核對且未發現具體缺陷的範圍

- src/main.ts：一般入口、?motion=1、?motion-preview 的分流與動作試玩失敗畫面。
- src/ui/app.ts、assets.ts、preload.ts、lazy-screen.ts、acttransition.ts：延遲畫面、素材網址、封封角色預載、靜態退路與轉場清理。
- src/ui/storyslides.ts 及 dialogue、cardtext、cardview、compendium：封封單人與 ninja／feifei／dangdang 三種合作配對、雙席方向、幻燈片鍵、角色牌面與說話者。
- screens/title、heroselect、lobby、event、result、actclear：封封入口、事件圖鍵與結果頁清理。
- tools/merge_motion_copy.py：預設唯讀盤點，套用需要對應報告與雜湊驗證；未列為缺陷。

## 驗證

- 指定介面／內容／工具測試：14 個測試檔、88 項通過。
- npx tsc --noEmit：通過，無輸出。
- 本輪 16 個 Python 工具以 python -m py_compile：全部通過。
- 負向工具驗證已如 INT-01、INT-02、INT-03 所列；這些失敗是稽核發現，不當作通過。
- 已確認 HEAD 正確；工作樹仍有其他代理的未提交修改，本輪沒有還原或覆寫。

## 尚未核對／限制

- 未開瀏覽器，沒有宣稱 ?motion=1 或 ?motion-preview 的實機畫面、網路斷線與動作視覺品質已通過。
- combat.ts、動畫控制器、引擎與根代理已另行稽核的三項引擎修正不在本輪深查。
- 沒有重新建置或改寫 dist；建置與容量結果沿用根代理已提供的獨立驗證，不把它們當成本輪新測試。
