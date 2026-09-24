# 動作資產交付說明

本文件是 `F:/ClaudeWork/qiuqiu-coop-motion-20260920` 對 `F:/ClaudeWork/qiuqiu-coop` 的隔離交付說明，僅列本輪確認可供合併的新文件與工具。原始大型圖片保留於隔離工作區，不列入檔案清單，也不覆蓋主專案來源。

## 路徑與啟動

- 原始圖根目錄：`F:/ClaudeWork/qiuqiu-coop-motion-20260920/tools/motion-art-source`
- 正式素材：`public/assets/motion/`、`public/assets/sprites/`、`public/assets/bg/`、`public/assets/cards/`、`public/assets/monsters/`、`public/assets/icons/`
- 動作版啟動：`powershell -ExecutionPolicy Bypass -File tools/launch-complete-motion.ps1 -NoBrowser`
- 一般入口維持原演出；要啟用新動作時使用 `?motion=1`。預覽入口使用 `?motion-preview`。
- 直接開啟專案根目錄的 `launch-complete-motion.cmd` 可試打四位角色，再點「用新動作闖塔」進入正常遊戲。

## 明列交付清單

`tools/motion-extra-base-hashes.json` 的 `files` 欄位列出 49 個本輪新增項目，全部以 `null` 表示主專案在盤點時沒有同名檔案；其原有三筆基準值保持不變。清單包含：

- 動作與角色規格：`docs/dangdang-motion-assets.json`、`docs/dangdang-motion-plan.json`、`docs/enemy-motion-assets.json`、`docs/feifei-motion-assets.json`、`docs/feifei-motion-integration.md`、`docs/qiuqiu-complete-motion-plan.md`、`docs/qiuqiu-extra-motion-assets.json`。
- 封封規格、劇情與素材報告：`docs/fengfeng-asset-intake.json`、`docs/fengfeng-effect-api.md`、`docs/fengfeng-engine-code-audit.md`、`docs/fengfeng-event-art-overview-01.webp` 至 `docs/fengfeng-event-art-overview-06.webp`、`docs/fengfeng-event-art-progress.json`、`docs/fengfeng-event-art-validation.json`、`docs/fengfeng-extra-card-art.json`、`docs/fengfeng-extra-sprite-art.json`、`docs/fengfeng-extra-story-art.json`、`docs/fengfeng-integration-contract.md`、`docs/fengfeng-missing-story-art.json`、`docs/fengfeng-motion-assets.json`、`docs/fengfeng-motion-plan.json`、`docs/fengfeng-story-art-map.json`、`docs/fengfeng-story-art-progress.json`、`docs/fengfeng-story-wide-art.json`。
- 稽核與計畫文件：`docs/motion-code-audit.md`、`docs/motion-merge-tool-audit.md`、`docs/motion-size-audit.md`、`docs/motion-visual-qa.md`。
- 動作工具與設定：`tools/integrate_fengfeng_assets.py`、`tools/launch-complete-motion.ps1`、`tools/merge_motion_copy.py`、`tools/motion-base-hashes.json`、`tools/motion-extra-base-hashes.json`、`tools/pack_companion_motion.py`、`tools/pack_fengfeng_event_art.py`、`tools/pack_fengfeng_extra_story.py`、`tools/pack_fengfeng_missing_story_art.py`、`tools/pack_fengfeng_pair_cards.py`、`tools/pack_fengfeng_shadow_relic.py`、`tools/pack_fengfeng_story_assets.py`、`tools/pack_fengfeng_story_wide.py`、`tools/pack_qiuqiu_extra_motion.py`、`tools/port_enemy_motion.py`。
- 測試與其直接規格依賴：`tests/ui/companion_motion.test.ts`、`docs/dangdang-motion-plan.json`、`docs/fengfeng-motion-plan.json`。該測試直接匯入這兩份計畫文件。
- 本文件：`docs/motion-delivery.md`。

## 同名檔案與排除項目

下列主專案同名檔案已核對，未加入新增清單：`docs/qiuqiu-motion-assets.json`、`docs/qiuqiu-motion-preview.md`、`tools/launch-motion-preview.ps1`、`tools/port_qiuqiu_motion.py`、`tools/manifest_hygiene.test.ts`、`tools/dump_monster_acts.test.ts`。其中前五項與來源同雜湊；`tools/dump_monster_acts.test.ts` 會重製 `docs/分關載入.json`，因此該產物交由主專案測試重新產生。

`tools/event_result_art.test.ts` 在主專案已有同名測試；該檔不列入交付清單、不覆蓋主專案版本，隔離工作區的暫時測試差異由根代理恢復為主專案版本。

`docs/事件文案.md`、`docs/分關載入.json`、`docs/牌池總表.json` 不列入交付清單；它們是主專案已有的產物，待合併後由既有傾印測試重新產生。歷次 `docs/motion-merge-*.json`、`out/`、`node_modules/`、`dist/` 及大型原始圖也不列入。

## 驗證邊界

- 交付清單整理階段沒有修改遊戲程式。原有三筆雜湊與 `conditionalFiles` 保持原值。
- 根代理另外核對 `tools/coop_screen_flow.test.ts` 與 `tools/dangdang_stills.test.ts` 的必要差異：保留回合確認／暫停的順序驗證，並把封封素材排除於噹噹回退球球圖的計數。這兩筆加入目前主專案雜湊及獨立捕捉時間，不冒充開工時基準。
- 合併後應先保留主專案既有三份傾印文件，再依既有測試重新產生，避免用隔離工作區產物覆蓋主專案變更。
