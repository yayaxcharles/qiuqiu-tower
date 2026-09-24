# 內容擴充第二批：秘寶、忍具圖示的代號與鍵名對照（給程式代理接線用）

美術代理 art2，2026-09-23。分支 `c0923-art2`（worktree `F:\ClaudeWork\qq-art2`，從 `c0923-int` 開出）。
圖都已經照下表放進 `public/assets/icons/`、登記在 `public/assets/manifest.json` 的 `icons` 分類；程式這邊只要照表填 `art`。
提案第⑤節「第二批」**沒有給代號**，下表的代號是我取的（小寫英文底線）；要改名請在接線前講，改名要連檔名、清單鍵一起改（`tools/gen_content_batch2_art.py` 的 `ICON_JOBS`）。
生圖工具 `tools/gen_content_batch2_art.py`（`keys` 子命令印得出同一份清單），飛行物走 `tools/gen_projectile_art.py`（`daze_incense`）。

## 規則（跟第一批一樣）
- 秘寶 `RelicDef.art = 'codex/relic_<代號>'`，忍具 `PotionDef.art = 'codex/potion_<代號>'`；這一批全部「代號＝檔名」，沒有例外。
- 128×128、透明底、WebP quality 80；一般圖示長邊貼滿 128 置中。
- **載入方式改了**：秘寶與忍具圖示（`codex/relic_*`、`codex/potion_*`，新舊全部）開場不載、**進入一局才補**（`src/ui/assets.ts` 的 `isItemIcon`／`itemIconUrls`，`src/ui/preload.ts` 的 `preloadHeroArt`）。
  新秘寶、新忍具只要 `art` 照表寫，就自動走這一套，不用另外登記延後名單；`docs/分關載入.json` 跑全套測試會自己把它們記成 0。

## 計數型 5 件：右下角留給數字
- 圖示右下角 **44×44（128 像素座標）完全透明**，東西畫在其他地方（挑圖時用程式找「不碰那一角的最大縮放、最靠中間的位置」，存檔後再驗一次 alpha ≤ 8）。
- 照殺戮尖塔：**數字由程式疊**，圖上沒有任何字。狀態列 32 像素時那一角約 11 像素、戰鬥 42 像素時約 14 像素，放一位數剛好。
- 建議疊法：`.hud-relic` 設 `position: relative`，數字放 `right: 0; bottom: 0`，白字、黑色描邊、粗體、11 像素上下。預覽圖（假數字）見 `scratchpad\content\art2\sheets\c2_counter_1x.png`、`_3x.png`。

| 代號 | 名稱 | 池 | 清單鍵（`RelicDef.art`） | 檔案 | 畫的是 |
|---|---|---|---|---|---|
| wooden_dummy | 木人樁 | 常見 | `codex/relic_wooden_dummy` | `public/assets/icons/relic_wooden_dummy.webp` | 詠春木人樁：木柱＋三支木臂＋一支腳、方木座（跟舊的「木樁」`wood_post` 那截貓臉木頭分得開） |
| hourglass | 沙漏 | 常見 | `codex/relic_hourglass` | `public/assets/icons/relic_hourglass.webp` | 深色木框三柱沙漏、金黃沙子上下各半 |
| incense_stick | 線香 | 大魔物 | `codex/relic_incense_stick` | `public/assets/icons/relic_incense_stick.webp` | 青瓷香碗插一根刻金環的紅香、頂端冒白煙（跟忍具「先手香」那把紅香、秘寶「不眠香爐」的銅爐分得開） |
| dart_case | 暗器匣 | 大魔物 | `codex/relic_dart_case` | `public/assets/icons/relic_dart_case.webp` | 黑漆描金小木匣、正面三孔各伸出一枚鋼鏢尖 |
| piggy_bank | 撲滿 | 常見 | `codex/relic_piggy_bank` | `public/assets/icons/relic_piggy_bank.webp` | 粉紅陶瓷小豬撲滿、背上投幣孔插著一枚方孔錢（跟「零錢罐」那個橘色陶罐分得開） |

## 其他秘寶 11 件

| 代號 | 名稱 | 池・偏誰 | 清單鍵（`RelicDef.art`） | 檔案 | 畫的是 |
|---|---|---|---|---|---|
| full_moon_sword | 滿月劍意 | 塔主・封封 | `codex/relic_full_moon_sword` | `public/assets/icons/relic_full_moon_sword.webp` | 一把直劍斜立在金黃滿月前、月旁幾道光芒 |
| sheath_pendant | 收鞘墜 | 大魔物・封封 | `codex/relic_sheath_pendant` | `public/assets/icons/relic_sheath_pendant.webp` | 入鞘的直劍（深棕漆鞘）、鞘環用紅繩吊一枚貓掌紋金墜 |
| five_poison_manual | 五毒譜 | 塔主・菲菲 | `codex/relic_five_poison_manual` | `public/assets/icons/relic_five_poison_manual.webp` | 紫色線裝厚書、封面一隻黃蠍子圖、書角滴黃綠毒液（封面沒有字） |
| iron_wall | 鐵壁 | 大魔物・噹噹 | `codex/relic_iron_wall` | `public/assets/icons/relic_iron_wall.webp` | 一段鉚釘鐵板牆、牆頂一排鋼刺 |
| clone_scroll | 影分身卷軸 | 塔主・球球 | `codex/relic_clone_scroll` | `public/assets/icons/relic_clone_scroll.webp` | 深藍軸頭的忍者卷軸、身後兩個紫黑色的卷軸殘影 |
| member_card | 會員卡 | 罐頭鋪限定 | `codex/relic_member_card` | `public/assets/icons/relic_member_card.webp` | 金邊米色卡片、左半紅貓掌印、右半一個沙丁魚罐頭圖、角上綁紅繩（沒有字） |
| shop_abacus | 店主的算盤 | 罐頭鋪限定 | `codex/relic_shop_abacus` | `public/assets/icons/relic_shop_abacus.webp` | 整把深棕木框算盤、角上擱一枚方孔錢（舊的「算盤珠」只是一排珠子，靠整框分） |
| wholesale_crate | 批發箱 | 罐頭鋪限定 | `codex/relic_wholesale_crate` | `public/assets/icons/relic_wholesale_crate.webp` | 松木板條箱、麻繩提把、裝滿紅藍紫橘各色小藥瓶 |
| demon_shard | 魔氣殘片 | 事件限定 | `codex/relic_demon_shard` | `public/assets/icons/relic_demon_shard.webp` | 暗紅紫色的尖銳晶石碎片、裡面透紅光、周圍紫紅魔氣 |
| bandit_iou | 山賊的欠條 | 事件限定 | `codex/relic_bandit_iou` | `public/assets/icons/relic_bandit_iou.webp` | 皺巴巴的空白紙條、正中一個紅貓掌印、被一把小刀釘著、旁邊兩枚銅錢（沒有字） |
| master_wood_sword | 師父的舊木劍 | 事件限定・師門套組 | `codex/relic_master_wood_sword` | `public/assets/icons/relic_master_wood_sword.webp` | 磨舊的木製直劍、劍身幾處缺口、握把纏褪色藏青布、劍尾綁紅繩（跟酒葫蘆那條紅繩同色，套組認得出來） |

師門套組另兩件「師父的斗笠」`master_hat`、「塔主的酒葫蘆」`master_gourd` 早就有圖（`codex/relic_master_hat`、`codex/relic_master_gourd`），這次沒動。

## 忍具 6 支

| 代號 | 名稱 | 稀有度・偏誰 | 清單鍵（`PotionDef.art`） | 檔案 | 畫的是 | 丟出去？ |
|---|---|---|---|---|---|---|
| revive_incense | 回魂香 | 稀有 | `codex/potion_revive_incense` | `public/assets/icons/potion_revive_incense.webp` | 銅三腳座上一盤蚊香狀的盤香、煙往上捲成一顆金色愛心 | 否（點香） |
| bento | 便當 | 常見 | `codex/potion_bento` | `public/assets/icons/potion_bento.webp` | 藍底白點的包袱巾包著便當、頂上打結、插一雙筷子（秘寶「分食便當」是打開的漆盒，分得開） | 否（吃） |
| demon_mirror | 照妖鏡 | 罕見 | `codex/potion_demon_mirror` | `public/assets/icons/potion_demon_mirror.webp` | 紅漆八角八卦鏡、邊框八組長短橫槓（卦象，不是字）、鏡面射出一道金光 | 否（舉起來照） |
| transfer_pill | 傳功丹 | 常見・連線 | `codex/potion_transfer_pill` | `public/assets/icons/potion_transfer_pill.webp` | 打開的青花瓷丹盒、裡面兩顆金丹、一縷金氣往上分成兩股 | 否 |
| swap_talisman | 替換符 | 罕見 | `codex/potion_swap_talisman` | `public/assets/icons/potion_swap_talisman.webp` | 紫邊淡黃符紙、中間兩支紅箭頭繞成一圈（交換的記號，沒有字） | 否 |
| daze_incense | 迷魂香 | 稀有 | `codex/potion_daze_incense` | `public/assets/icons/potion_daze_incense.webp` | 包一圈白紙的紫色香丸、頂上一點火星、冒出粉紫色螺旋煙 | **是（我判斷的，見下）** |

### 飛行物 1 張：迷魂香
- 判斷：迷魂香是「單體、丟向一隻魔物、改牠的目標」的狀態忍具，跟貓薄荷球、定身釘同一類（2026-09-22 起這類一律用丟的），所以圖示畫成一顆香丸、另做一張飛行中的圖。**要不要真的走「丟」由接線的人定**；不走的話這張圖不會被用到，也不佔首載。
- 照妖鏡我判斷是舉起來照、不是丟的（鏡子不會丟出去），**沒有做飛行物**；其餘四支都是自己用的。
- 接線（同火雷珠）：`src/ui/projectile-kinds.ts` 的 `ProjectileKind` 加 `'daze_incense'`、`POTION_PROJECTILE` 加 `daze_incense: 'daze_incense'`；`src/ui/projectile-flight.ts` 的 `PROJECTILE_LOOKS` 加一筆。

| 飛行物種類 | 檔案（不登記清單分類） | 圖檔大小 | 建議 `PROJECTILE_LOOKS` |
|---|---|---|---|
| `daze_incense` | `public/assets/motion/projectile/daze_incense.webp` | 112×89 | 照貓薄荷球的比例抓：`width: 58, height: 46, spin: 0, arc: 50`；香丸在右前、煙往左上拖，只順著飛行方向擺頭、不要轉 |

## 接線時要注意
1. **圖鑑還沒有兩個新池的分區**：`src/ui/itemcompendium.ts` 的 `RELIC_POOLS` 只有 起始／常見／大魔物／塔主，`pool` 寫成「罐頭鋪限定」「事件限定」的秘寶**不會出現在圖鑑裡**。要加分區（`RELIC_POOLS` 與 `POOL_NOTE` 各補兩個）。師門套組「集到幾件」也是這支要做。
2. 計數型的數字角落見上面第二段；圖本身沒有字，數字一定要程式疊。
3. 這批圖示現在沒有秘寶、忍具會用到（資料還沒接），`public/` 裡是「有圖、沒人用」；清單衛生測試只查事件圖的孤兒、不查圖示，所以不會紅。接線時照表填 `art` 即可。
