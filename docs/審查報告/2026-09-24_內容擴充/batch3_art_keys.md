# 內容擴充第三批：圖的鍵名與檔名對照（給程式代理接線用）

美術代理 art5，2026-09-23。分支 `c0923-art5`（worktree `F:\ClaudeWork\qq-art5`，從 `c0923-int` `3abe3e7c` 開出）。
圖面描述的唯一來源＝`design3_大結構.md`（第二～七節）＋`design3_主控裁決.md`（第 2 條大俠貓替代版、第 7 條秘寶代號照 design2）。
生圖工具 `tools/gen_content_batch3_art.py`；原檔在 `tools/motion-art-source/c3/`（png 不進版控，`prompts.json`、`picks.json` 進版控）。這份表是從工具定義與 `picks.json` 產生的（`scratchpad\content\art5\make_keys_doc.py`），不是手抄的；`python tools/gen_content_batch3_art.py keys` 也印得出同一份鍵名。

## 一、總數與登記

| 類 | 張數 | 清單分類 | 鍵名開頭 | 檔案位置 |
|---|---|---|---|---|
| 開局祝福物品圖示 | 15 | `icons` | `codex/bless_` | `public/assets/icons/` |
| 新秘寶圖示 | 9 | `icons` | `codex/relic_` | `public/assets/icons/` |
| 淨化版秘寶圖示 | 6 | `icons` | `codex/relic_…_pure` | `public/assets/icons/` |
| 客座店主立繪（3 位 × 3 表情） | 9 | `sprites` | `shop/keeper_<代號>` | `public/assets/sprites/shop/` |
| 行腳商立繪（3 表情） | 3 | `sprites` | `shop/merchant` | `public/assets/sprites/shop/` |
| 事件類（祝福主圖 4、問號格 12、稀有事件 68、神龕新結果 4） | 88 | `bg` | `bg/event_` | `public/assets/bg/` |
| **合計（本批）** | **130** | | | |
| 另：主控追加「店主的帳本」重畫 | 1 | 已登記的 `codex/relic_shop_abacus` | 覆蓋原檔 | `public/assets/icons/relic_shop_abacus.webp` |

- **一張都還沒登記素材清單**（派工單：接線時一次登記）。接線時跑一行：`python tools/gen_content_batch3_art.py register`（照 `picks.json` 併進 `public/assets/manifest.json`，兩格縮排、只加行；實測 `git diff` 133 加 3 減，減的 3 行只是三個分類原本最後一筆補逗號）。先看會登記什麼：`register --dry-run`。
- 「店主的帳本」`codex/relic_shop_abacus` 早就在清單裡（art2 登記的），這次只覆蓋檔案，`register` 不碰它。

## 二、命名規則

- 圖示：`codex/<檔名>`；秘寶檔名＝`relic_<秘寶代號>`，祝福物品檔名＝祝福代號本身（設計稿 2-2 的代號已經帶 `bless_`，例：`bless_rations` → `codex/bless_rations`）。128×128、透明、WebP q80。
- 淨化版：`codex/relic_<原件代號>_pure`（代號照設計稿 6-1 的 `…_pure`）。**例外一個**：魔氣殘片的代號是 `miasma_shard`（主控裁決 7），但 art2 的原件圖示檔名是 `relic_demon_shard`；淨化版是新檔，我照代號取 `relic_miasma_shard_pure`。所以接線時原件 `art: codex/relic_demon_shard`、淨化版 `art: codex/relic_miasma_shard_pure`，兩個前綴不一樣是刻意的。
- 立繪：`shop/keeper_<店主代號>`、`_happy`（成交）、`_no`（錢不夠），代號照設計稿 4-1（`tortoise`、`curio`、`junk`）；行腳商 `shop/merchant`、`_happy`、`_no`。332×420、透明、WebP q82（同 `add_sprite.py`），原圖面向左、腳底貼下緣，跟橘貓老闆 `shop/keeper` 一樣（遊戲裡照舊左右翻）。
- 事件圖：球球版 `bg/event_<代號>`、另三隻 `bg/event_<角色>_<代號>`（`eventArtKey` 的規矩）；結果圖 `<代號>_r<選項序號>`，序號照設計稿表格的選項順序、從 0 起；進戰鬥與無效果的選項不畫（`event_result_art.test.ts`）。560×420、透明、WebP q80。
- 問號格三種與祝福主圖**不是 `EventDef`**，鍵名只是沿用事件圖的命名（`q_ambush`、`q_merchant`、`q_roadbox`、`bless_bundle` 當代號）。要不要走 `eventArtKey` 由接線的人定；四隻都有自己的版本。

## 三、每一張

### 3-1 開局祝福物品圖示 15（設計稿 2-5；「沾了魔氣的舊護腕」`bless_bracer` 直接用秘寶 `codex/relic_master_bracer`，不另畫）

| 代號（設計稿） | 名稱 | 清單鍵 | 檔案 | 設計稿 | 畫的是 |
|---|---|---|---|---|---|
| `bless_rations` | 乾糧袋 | `codex/bless_rations` | `public/assets/icons/bless_rations.webp` | 2-5 物品圖示 | 鼓鼓的麻布小袋、袋口露兩個飯糰和一條魚乾、紅繩打著大歪結 |
| `bless_coins` | 零錢袋 | `codex/bless_coins` | `public/assets/icons/bless_coins.webp` | 2-5 物品圖示 | 深藍布錢袋倒在一邊、袋口滑出一大把小魚乾 |
| `bless_potions` | 舊忍具袋 | `codex/bless_potions` | `public/assets/icons/bless_potions.webp` | 2-5 物品圖示 | 磨舊的皮革扁腰包（有蓋、黃銅扣）、紅綠藍三個瓶口探出來（跟圓的「忍具袋」分得開） |
| `bless_charm` | 護身符 | `codex/bless_charm` | `public/assets/icons/bless_charm.webp` | 2-5 物品圖示 | 深紅錦布圓底小護身符、正面繡金色貓爪印、上面一圈紅繩（跟方形的「護符」、手環「平安繩」分得開） |
| `bless_scissors` | 舊剪刀 | `codex/bless_scissors` | `public/assets/icons/bless_scissors.webp` | 2-5 物品圖示 | 握柄纏布的鐵剪刀、刀口微張、兩張剪下來的紙片飄著 |
| `bless_notes` | 練功筆記 | `codex/bless_notes` | `public/assets/icons/bless_notes.webp` | 2-5 物品圖示 | 翻開的線裝小冊、兩頁各一個小貓出招的墨畫（不寫字）、一支毛筆 |
| `bless_moves` | 一疊招式圖 | `codex/bless_moves` | `public/assets/icons/bless_moves.webp` | 2-5 物品圖示 | 三捲紙卷用紅繩綁成一疊、最上面那捲透出金光 |
| `bless_doodle` | 塗鴉本 | `codex/bless_doodle` | `public/assets/icons/bless_doodle.webp` | 2-5 物品圖示 | 翻開的舊本子、兩頁歪歪扭扭的貓招式塗鴉、中間兩支紅箭頭繞一圈（交換記號） |
| `bless_treasure` | 包得很緊的寶貝 | `codex/bless_treasure` | `public/assets/icons/bless_treasure.webp` | 2-5 物品圖示 | 深藍布層層包緊的小方塊、綁三道繩、布縫透金光 |
| `bless_stash` | 私房錢 | `codex/bless_stash` | `public/assets/icons/bless_stash.webp` | 2-5 物品圖示 | 灰褐小陶罐、罐口塞布、罐身一道裂縫看得到滿滿的小魚乾 |
| `bless_box` | 空的寶盒 | `codex/bless_box` | `public/assets/icons/bless_box.webp` | 2-5 物品圖示 | 黑紅漆木小盒打開、紅絨布中間一個空的凹槽（貓頭形） |
| `bless_bottom` | 包袱最底下 | `codex/bless_bottom` | `public/assets/icons/bless_bottom.webp` | 2-5 物品圖示 | 深藍布包袱口、一隻貓爪伸進去、幾點看不清的閃光（圖示裡唯一准畫爪子的一張） |
| `bless_dice` | 一顆骰子 | `codex/bless_dice` | `public/assets/icons/bless_dice.webp` | 2-5 物品圖示 | 白色大骰子、點數是紅色貓爪印（看得到的三面：1、2、3） |
| `bless_scroll` | 沒貼標籤的卷軸 | `codex/bless_scroll` | `public/assets/icons/bless_scroll.webp` | 2-5 物品圖示 | 麻繩綁的舊卷軸、軸頭褪色、沒有任何標記、紙邊一個問號形狀的摺痕（不是寫的字） |
| `bless_wine` | 一小瓶藥酒 | `codex/bless_wine` | `public/assets/icons/bless_wine.webp` | 2-5 物品圖示 | 褐色小陶瓶、瓶口塞紅布、瓶身一片空白方形紙籤（不寫字） |

### 3-2 新秘寶圖示 9（設計稿 7-2、7-4；代號照設計稿）

| 代號 | 名稱 | 清單鍵（`RelicDef.art`） | 檔案 | 畫的是 |
|---|---|---|---|---|
| `herb_basket` | 藥簍 | `codex/relic_herb_basket` | `public/assets/icons/relic_herb_basket.webp` | 竹編小背簍、麻繩揹帶、簍口露綠葉與紅、藍兩個藥瓶口 |
| `dream_pillow` | 夢枕 | `codex/relic_dream_pillow` | `public/assets/icons/relic_dream_pillow.webp` | 圓滾滾淡藍小枕頭、金線繡一彎月亮兩顆星、枕邊露出一張牌的角 |
| `peace_cord` | 平安繩 | `codex/relic_peace_cord` | `public/assets/icons/relic_peace_cord.webp` | 麻花紅繩手環、中間一顆金色貓爪珠、兩個小紅流蘇 |
| `scout_staff` | 探路杖 | `codex/relic_scout_staff` | `public/assets/icons/relic_scout_staff.webp` | 彎彎的舊木杖、杖頭掛小紙燈籠與小布包（計數型：右下角 44×44 留空） |
| `box_in_box` | 箱中箱 | `codex/relic_box_in_box` | `public/assets/icons/relic_box_in_box.webp` | 打開的紙箱裡一個小紙箱、再裡面一個更小的透出金光（計數型：右下角 44×44 留空） |
| `miasma_lantern` | 魔氣燈籠 | `codex/relic_miasma_lantern` | `public/assets/icons/relic_miasma_lantern.webp` | 暗紫紙燈籠、裡面紫火、穗子冒一縷紫煙 |
| `demon_seal` | 鎮魔符 | `codex/relic_demon_seal` | `public/assets/icons/relic_demon_seal.webp` | 黃色長條符紙、紅色大貓爪印與彎曲紅符紋（不是字）、下緣一小撮紅穗（跟上緣掛穗、畫劍的「劍意符」分得開） |
| `stamp_card` | 集章卡 | `codex/relic_stamp_card` | `public/assets/icons/relic_stamp_card.webp` | 藍色摺頁小冊、三個圓框：橘爪章、紫爪章、一個空的虛線圈；沒有繩子 |
| `master_bracer` | 沾了魔氣的舊護腕 | `codex/relic_master_bracer` | `public/assets/icons/relic_master_bracer.webp` | 褪色深藍布纏成的舊護腕、邊緣磨毛、綁帶打大歪結、暗紫污漬、冒一縷紫煙（純布、沒有金屬扣） |

### 3-3 淨化版秘寶圖示 6（設計稿 6-1、6-6、7-4；`edit` 附原件的圖、只改顏色與設計稿寫的細節，外形照原件）

| 淨化版代號 | 名稱 | 清單鍵 | 檔案 | 原件圖示 | 改了什麼 |
|---|---|---|---|---|---|
| `miasma_charm_pure` | 清心護符 | `codex/relic_miasma_charm_pure` | `public/assets/icons/relic_miasma_charm_pure.webp` | `codex/relic_miasma_charm` | 符紙換米白、紋路淡青、紫煙換成幾縷白煙，紅繩照舊 |
| `blood_dagger_pure` | 解契短刀 | `codex/relic_blood_dagger_pure` | `public/assets/icons/relic_blood_dagger_pure.webp` | `codex/relic_blood_dagger` | 刀身換乾淨銀白、刃上一道反光、刀尖的血滴拿掉、旁邊一個金色閃光，白布握把照舊 |
| `black_cat_mask_pure` | 白貓面具 | `codex/relic_black_cat_mask_pure` | `public/assets/icons/relic_black_cat_mask_pure.webp` | `codex/relic_black_cat_mask` | 底色黑換白，金眼框與紅蝴蝶結照舊 |
| `miasma_shard_pure` | 月光晶石 | `codex/relic_miasma_shard_pure` | `public/assets/icons/relic_miasma_shard_pure.webp` | `codex/relic_demon_shard` | 暗紅紫晶石換淡藍白、內光換白光、周圍魔氣換成月白光暈（實心畫） |
| `miasma_lantern_pure` | 長明燈 | `codex/relic_miasma_lantern_pure` | `public/assets/icons/relic_miasma_lantern_pure.webp` | `codex/relic_miasma_lantern` | 紙面換米白、火換暖金色、穗子乾淨沒有煙（外形照魔氣燈籠） |
| `master_bracer_pure` | 大俠貓的舊護腕 | `codex/relic_master_bracer_pure` | `public/assets/icons/relic_master_bracer_pure.webp` | `codex/relic_master_bracer` | 污漬與紫煙拿掉、布恢復乾淨深藍、邊上一圈淡金光（大歪結照舊） |

### 3-4 店主與行腳商立繪 12（設計稿 4-6；行腳商也用在 3-7 問號格）

| 店主 | 招呼（`shop/<鍵>`） | 成交（`_happy`） | 錢不夠（`_no`） | 畫面（設計稿） | 頭寬（畫布像素，目標 153） |
|---|---|---|---|---|---|
| 玳瑁婆婆（`tortoise`） | `shop/keeper_tortoise` | `shop/keeper_tortoise_happy` | `shop/keeper_tortoise_no` | 玳瑁老婆婆（臉一半黑一半橘）、深紫短褂、褪色深綠圍裙口袋插滿小瓶、脖子掛木藥牌；招呼＝舉小瓶對光瞇一隻眼、一手扶腰；成交＝瞇眼笑露小尖牙比「好」；錢不夠＝雙手叉腰搖頭皺眉 | 153 / 153 / 153 |
| 長毛掌櫃（`curio`） | `shop/keeper_curio` | `shop/keeper_curio_happy` | `shop/keeper_curio_no` | 金吉拉銀白長毛、綠眼、深綠長袍＋黑馬褂、瓜皮帽、右眼金框單片眼鏡細金鍊；招呼＝一手雞毛撢子、一手托紅布上一團光（不畫成秘寶）；成交＝閉眼笑、微微鞠躬、鏡片閃一下；錢不夠＝撢子橫擋胸前、皺眉抿嘴 | 153 / 153 / 153 |
| 阿福（`junk`） | `shop/keeper_junk` | `shop/keeper_junk_happy` | `shop/keeper_junk_no` | 緬因貓棕虎斑、耳尖長毛、下巴一圈鬃毛、補丁藏青短褂、麻繩腰帶、背大麻布袋（露刀柄、破鍋把、一捲繩）；招呼＝一手搔後腦、一手提補過的鐵鍋；成交＝仰頭大笑拍肚子；錢不夠＝抓頭苦笑攤手 | 145 / 147 / 150 |
| 行腳商（`merchant`） | `shop/merchant` | `shop/merchant_happy` | `shop/merchant_no` | 短腿奶茶色貓、芥末黃頭巾（不是深藍）、草蓑衣、綁腿、比他高一個頭的木背架（抽屜、布包、瓶子、一串魚乾）；招呼＝一手扶背帶一手舉高招呼；成交＝比大拇指、單腳跳起；錢不夠＝兩手一攤、背架歪向一邊 | 153 / 153 / 153 |

- 設計圖先定稿（`_ref/design_<代號>.png`，不進 public），三個表情都附它＋橘貓老闆的招呼圖（只取畫風、細節量與頭的大小）。
- **頭的大小**：設計稿「頭的大小跟橘貓老闆一樣（比頭不比外框）」。橘貓老闆的頭寬（鼻子那一列、臉頰外緣到外緣、不含耳朵）在 332×420 畫布上量到約 150～155，目標取 153。每張新立繪在原檔上畫兩條直線對著臉頰量頭寬，照比例縮到 153、腳底貼下緣、水平置中。**阿福**（身體最大隻）照 153 縮會比 420 高，工具只准頭再縮到 95%（`--fit`），三張實際 145～150（95～98%），剛好頂滿 420 高。量法有 ±3% 左右的誤差（臉頰毛的邊緣要人判斷）。
- 並排驗收圖（遊戲實際大小：高 290、左右翻、墊罐頭鋪背景）：`scratchpad\content\art5\sheets\c3_shop_side_by_side_1x.png`。

### 3-5 事件類 88 張

### `bless_bundle`：2-5 開局祝福主圖 `bless_bundle`

| 張 | `resultArt`／用途 | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖（祝福畫面底圖） | （主圖） | `bg/event_bless_bundle` | `bg/event_feifei_bless_bundle` | `bg/event_dangdang_bless_bundle` | `bg/event_fengfeng_bless_bundle` | 清晨塔門口，巨大石門半開、門縫透淡紫光，門檻上幾條小魚乾；深藍布包袱攤開一半、裡面只有鼓鼓的幾團（不畫任何物品），一角打著又大又歪的結（球球抬頭望塔頂、菲菲捧起包袱一角含淚、噹噹低頭研究結、封封單膝跪地劍放身邊） |

### `q_ambush`：3-7 伏擊 `q_ambush`（3-6 開頭文字）

| 張 | `resultArt`／用途 | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 揭曉圖（伏擊） | （主圖） | `bg/event_q_ambush` | `bg/event_feifei_q_ambush` | `bg/event_dangdang_q_ambush` | `bg/event_fengfeng_q_ambush` | 昏暗樓梯轉角（石牆＋木樑），兩側影子裡四五雙黃眼睛撲出來，只畫深黑剪影與眼睛、不畫成特定魔物（球球炸毛跳起、菲菲背貼牆、噹噹架起護臂、封封按劍退半步） |

### `q_merchant`：3-7 行腳商 `q_merchant`（3-6 開頭文字）

| 張 | `resultArt`／用途 | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 揭曉圖（行腳商） | （主圖） | `bg/event_q_merchant` | `bg/event_feifei_q_merchant` | `bg/event_dangdang_q_merchant` | `bg/event_fengfeng_q_merchant` | 樓梯轉角，行腳商（照設計圖：短腿奶茶色貓、芥末黃頭巾、草蓑衣、木背架掛抽屜布包瓶子魚乾）坐在台階上舉手招呼（球球湊近看抽屜、菲菲躲欄杆柱後探頭、噹噹指著背架一條鬆掉的繩子、封封點頭打招呼） |

### `q_roadbox`：3-7 路邊紙箱 `q_roadbox`（3-6 開頭文字）

| 張 | `resultArt`／用途 | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 揭曉圖（路邊紙箱，紙箱畫面第一段的底圖） | （主圖） | `bg/event_q_roadbox` | `bg/event_feifei_q_roadbox` | `bg/event_dangdang_q_roadbox` | `bg/event_fengfeng_q_roadbox` | 樓梯邊角落一個舊紙箱（照既有紙箱圖的紙箱）、箱蓋上粗線畫的笑臉（不是字）、上方一道暖光（球球尾巴翹起、菲菲伸手指敲箱子、噹噹歪頭看箱底、封封一手扶箱蓋） |

### `rare_hot_spring`：第五節 R1「冒著熱氣的溫泉」圖面

| 張 | `resultArt`／用途 | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | （主圖） | `bg/event_rare_hot_spring` | `bg/event_feifei_rare_hot_spring` | `bg/event_dangdang_rare_hot_spring` | `bg/event_fengfeng_rare_hot_spring` | 半塌石室、地板湧出冒白煙的溫泉、大石頭圍池、竹筒引水、木桶、牆上木板刻泡湯貓（線條）、紙燈籠；角色蹲池邊伸手試水溫 |
| ① 整隻跳進去泡 | `rare_hot_spring_r0` | `bg/event_rare_hot_spring_r0` | `bg/event_feifei_rare_hot_spring_r0` | `bg/event_dangdang_rare_hot_spring_r0` | `bg/event_fengfeng_rare_hot_spring_r0` | 只露頭泡在池裡一臉享受、水面幾顆紫色泡泡正在破、池邊泡水的行囊、兩三個瓶子漂在水上（噹噹的護臂擱池邊、工具袋掉水裡；封封的劍靠石壁） |
| ② 先把行囊放好再泡 | `rare_hot_spring_r1` | `bg/event_rare_hot_spring_r1` | `bg/event_feifei_rare_hot_spring_r1` | `bg/event_dangdang_rare_hot_spring_r1` | `bg/event_fengfeng_rare_hot_spring_r1` | 泡到胸口靠池邊石頭、水面淡紫煙散掉；東西擺高處（球球魚乾袋掛木樁、菲菲竹筒行囊在最高的石頭上、噹噹工具袋掛木樁繞兩圈、封封劍靠石壁行囊在三步外的石頭上） |
| ③ 只泡腳想招式 | `rare_hot_spring_r2` | `bg/event_rare_hot_spring_r2` | `bg/event_feifei_rare_hot_spring_r2` | `bg/event_dangdang_rare_hot_spring_r2` | `bg/event_fengfeng_rare_hot_spring_r2` | 坐池邊泡腳、眼睛一亮（球球比劃爪子、菲菲膝上排針擦乾、噹噹用濕布擦護臂的鏽、封封劍橫膝上擦劍） |

### `rare_fortune_sticks`：第五節 R2「塔裡的籤筒」圖面（③ 無效果不配）

| 張 | `resultArt`／用途 | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | （主圖） | `bg/event_rare_fortune_sticks` | `bg/event_feifei_rare_fortune_sticks` | `bg/event_dangdang_rare_fortune_sticks` | `bg/event_fengfeng_rare_fortune_sticks` | 樓梯轉角紅漆小供桌：歪倒的竹籤筒、散在桌上的籤、兩片紅筊、投錢小木箱；牆上一排小抽屜畫魚、月亮、爪印、葫蘆、星星（不寫字）；小油燈（球球眼睛發亮、菲菲雙手握胸前、噹噹拉開抽屜研究滑軌、封封站直看抽屜） |
| ① 投 25 條求一支籤 | `rare_fortune_sticks_r0` | `bg/event_rare_fortune_sticks_r0` | `bg/event_feifei_rare_fortune_sticks_r0` | `bg/event_dangdang_rare_fortune_sticks_r0` | `bg/event_fengfeng_rare_fortune_sticks_r0` | 閉眼雙手搖籤筒、一支籤飛到半空；背後一格抽屜半開透光（不畫抽到什麼） |
| ② 投 60 條誠心求籤 | `rare_fortune_sticks_r1` | `bg/event_rare_fortune_sticks_r1` | `bg/event_feifei_rare_fortune_sticks_r1` | `bg/event_dangdang_rare_fortune_sticks_r1` | `bg/event_fengfeng_rare_fortune_sticks_r1` | 對籤筒拜、木箱裡堆滿小魚乾、一支籤從筒口慢慢冒出來 |

### `rare_sleeping_hoard`：第五節 R3「睡著的大魔物」圖面（③ 進戰鬥不配）

| 張 | `resultArt`／用途 | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | （主圖） | `bg/event_rare_sleeping_hoard` | `bg/event_feifei_rare_sleeping_hoard` | `bg/event_dangdang_rare_sleeping_hoard` | `bg/event_fengfeng_rare_sleeping_hoard` | 昏暗倉房、寶物山（小魚乾、破兵器、木箱、光點）、山頂一團模糊的大黑影只露兩條閉著的發光眼縫和鼻涕泡（不畫成任何現有魔物）；角色躲門縫偷看（封封版木箱有商隊記號） |
| ① 輕輕拿走最上面那一件 | `rare_sleeping_hoard_r0` | `bg/event_rare_sleeping_hoard_r0` | `bg/event_feifei_rare_sleeping_hoard_r0` | `bg/event_dangdang_rare_sleeping_hoard_r0` | `bg/event_fengfeng_rare_sleeping_hoard_r0` | 抱著一團發光的東西踮腳退出門口，背後黑影還在打呼（封封順手掩門） |
| ② 再多拿一件 | `rare_sleeping_hoard_r1` | `bg/event_rare_sleeping_hoard_r1` | `bg/event_feifei_rare_sleeping_hoard_r1` | `bg/event_dangdang_rare_sleeping_hoard_r1` | `bg/event_fengfeng_rare_sleeping_hoard_r1` | 一手抱一件、一手伸向第二件，全身僵住冒冷汗；黑影鼻子抽動、鼻涕泡快破，眼睛仍閉著（醒沒醒不畫；噹噹那件壓在破槍底下） |

### `rare_miasma_whisper`：第五節 R4「紫霧裡的聲音」圖面（③ 無效果不配）

| 張 | `resultArt`／用途 | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | （主圖） | `bg/event_rare_miasma_whisper` | `bg/event_feifei_rare_miasma_whisper` | `bg/event_dangdang_rare_miasma_whisper` | `bg/event_fengfeng_rare_miasma_whisper` | 塔中木造走廊盡頭，地板裂縫流出紫霧捲成一團、中央一點尖角形紫光（不畫成特定秘寶）、霧的邊緣捲成一隻大貓的側臉輪廓；角色站在這一頭耳朵往後壓 |
| ① 伸手拿霧裡的東西 | `rare_miasma_whisper_r0` | `bg/event_rare_miasma_whisper_r0` | `bg/event_feifei_rare_miasma_whisper_r0` | `bg/event_dangdang_rare_miasma_whisper_r0` | `bg/event_fengfeng_rare_miasma_whisper_r0` | 手伸進紫霧、霧順著手臂纏上來、掌心一團紫光；霧裡大貓輪廓的嘴角往上彎（封封用連鞘的劍把紫光挑出來） |
| ② 對著紫霧大喊 | `rare_miasma_whisper_r1` | `bg/event_rare_miasma_whisper_r1` | `bg/event_feifei_rare_miasma_whisper_r1` | `bg/event_dangdang_rare_miasma_whisper_r1` | `bg/event_fengfeng_rare_miasma_whisper_r1` | 張大嘴大喊、喊聲畫成奶白色弧線、紫霧被衝散縮回裂縫、大貓輪廓不見了 |

### `rare_catnip_master`：第五節 R5「掉進貓薄荷田的大俠貓」＋主控裁決第 2 條（替代版，大俠貓本人不出場，圖面照裁決改寫，見第四段）

| 張 | `resultArt`／用途 | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | （主圖） | `bg/event_rare_catnip_master` | `bg/event_feifei_rare_catnip_master` | `bg/event_dangdang_rare_catnip_master` | `bg/event_fengfeng_rare_catnip_master` | 塔頂夜空滿月、石台邊一大片貓薄荷（淡綠葉、小白花），中間壓出一個大貓形的窩（人已經不在）、窩裡一撮灰色虎斑毛、田邊倒著大俠貓的酒葫蘆（照 `relic_master_gourd`）、草裡半藏一張摺起來的舊紙；沒有大俠貓、沒有別的角色（球球張嘴蹲著、菲菲摀嘴含淚、噹噹呆站、封封按劍停步） |
| ① 撿他掉的一頁筆記（選絕學） | `rare_catnip_master_r0` | `bg/event_rare_catnip_master_r0` | `bg/event_feifei_rare_catnip_master_r0` | `bg/event_dangdang_rare_catnip_master_r0` | `bg/event_fengfeng_rare_catnip_master_r0` | 跪坐在壓扁的窩裡、雙手捧著那頁舊筆記看得眼睛發亮，紙上只有大貓示範招式的墨畫（不寫字）、身邊小金光點 |
| ② 撿起他滾落的酒葫蘆 | `rare_catnip_master_r1` | `bg/event_rare_catnip_master_r1` | `bg/event_feifei_rare_catnip_master_r1` | `bg/event_dangdang_rare_catnip_master_r1` | `bg/event_fengfeng_rare_catnip_master_r1` | 雙手把橘色葫蘆（紅繩）抱在胸前、低頭看著它，站在空空的窩旁 |
| ③ 在他壓出來的窩裡睡一覺（回滿血） | `rare_catnip_master_r2` | `bg/event_rare_catnip_master_r2` | `bg/event_feifei_rare_catnip_master_r2` | `bg/event_dangdang_rare_catnip_master_r2` | `bg/event_fengfeng_rare_catnip_master_r2` | 蜷在比自己大很多的貓形草窩裡睡著、鼻子一個睡泡泡、身上蓋幾枝貓薄荷、滿月在上，溫暖安靜 |

### `broken_shrine_r2`：6-5「倒了的神龕」條件選項【魔氣】結果圖 `broken_shrine_r2`（參考圖②＝那一隻既有的 `broken_shrine` 主圖）

| 張 | `resultArt`／用途 | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| ③【魔氣】把沾了魔氣的東西供在神龕前 | `broken_shrine_r2` | `bg/event_broken_shrine_r2` | `bg/event_feifei_broken_shrine_r2` | `bg/event_dangdang_broken_shrine_r2` | `bg/event_fengfeng_broken_shrine_r2` | 兩截貓神像中間的供盤上一團紫光（不畫成特定秘寶）、神像眼睛亮金色、紫霧一縷一縷被吸進神像裂縫（球球、菲菲、噹噹跪坐合十；菲菲那團下面墊著白手帕、噹噹的供盤底下墊了木楔；封封站著雙手垂下） |

## 四、「掉進貓薄荷田的大俠貓」替代版的圖面（主控裁決 2，改寫過的；**文字代理請照這份對圖**）

原設計稿的圖面有大俠貓本人（四腳朝天、紫金雙色眼、半坐起來扶正姿勢、並排看月亮）。照裁決改成本人不出場，四張的圖面改寫如下（四隻都照這個畫）：
- **主圖**：塔頂夜空滿月、石台邊一大片貓薄荷（淡綠葉子、小白花）。田中間的貓薄荷被壓出一個**大貓形狀的窩**（像有一隻大貓在這裡四腳朝天打過滾，幾根莖折斷了），人已經不在。窩裡一**撮灰色帶深灰紋的毛**（大俠貓的毛色，照關主立繪）。田邊倒著**酒葫蘆**（照秘寶圖示：橘色葫蘆、紅繩）。草裡半藏一張**摺起來的舊紙**（①那頁筆記）。角色在田邊：球球張嘴蹲著、菲菲摀嘴含淚、噹噹呆站、封封按劍停步。
- **①（`_r0`）撿他掉的一頁筆記**：角色跪坐在壓扁的窩裡，雙手捧著那頁舊紙、看得眼睛發亮；紙上只有**大貓示範招式的墨畫**（不寫字）。
- **②（`_r1`）撿起他滾落的酒葫蘆**：角色雙手把葫蘆抱在胸前、低頭看著它，站在空空的窩旁。**沒畫受傷**（原版手臂那道紅痕是大俠貓的爪子劃的，本人不在就拿掉了；選項若照舊「最多失去 8 點生命」，文字要自己交代原因，圖不會跟它打架）。
- **③（`_r2`）在他壓出來的窩裡睡一覺**：角色蜷在比自己大很多的貓形草窩裡睡著、鼻子一個睡泡泡、身上蓋幾枝貓薄荷、滿月在上，溫暖安靜。
- 三張結果圖裡葫蘆與那撮毛多半還在畫面裡（①③沒拿葫蘆），這跟文字不衝突；①的傷（最多失去 12 點生命）同樣沒畫。

## 五、接線時要注意（實測過的）

1. **登記要跟接線同一筆**：只登記不接線，`tools/manifest_hygiene.test.ts`「事件插圖沒有沒人用的孤兒」會把 88 個 `bg` 鍵全部當孤兒而紅（實測；其他 4 支相關測試 `feifei_stills`、`dangdang_stills`、`dump_monster_acts`、`event_result_art` 全綠）。問號格三種、祝福主圖不在 `events.ts` 裡，孤兒檢查要另外認得它們（或接線時由畫面程式引用）。
2. **首載**：實測「只登記、什麼都不接」→ `check_size.py` 首載圖片 9.04 → **9.86 MB**（93.1%）、首載總計 9.72 → **10.55 MB**（93.4%），還在預算內但多了 0.81 MB。多出來的 36 張是：
   - 祝福物品圖示 15 張（94 KB）：`codex/bless_*` 不在 `isItemIcon`（`src/ui/assets.ts` 只認 `codex/relic_`、`codex/potion_`），`preloadArt` 開場就會載。設計稿 2-1 說「序章播放時背景抓」→ 要把 `bless_` 加進延後的判斷，或另走祝福畫面的延後模組。
   - 店主與行腳商立繪 12 張（354 KB）：`sprites` 分類開場就載。設計稿 4-4 說「只在這一關地圖上有他那一間時才背景抓」→ 要照店主延後。
   - 沒有角色前綴的球球版主圖 9 張（361 KB）：5 篇稀有事件的主圖接進 `events.ts` 後會被 `eventMainKeys()` 延後；祝福主圖與問號格三種（4 張、138 KB）不是 `EventDef`，要自己處理。
   - 其餘 94 張（結果圖、三隻他版、秘寶與淨化版圖示）本來就走延後（`docs/分關載入.json` 會多 94 筆、全部記 0）。
3. **店主表情的退路**：`src/ui/screens/shop.ts` 現在寫死 `shop/keeper_${mood}` → `shop/keeper`。換成 `shop/<店主鍵>_${mood}` → `shop/<店主鍵>` 即可（鍵名就是照這個規則取的）；注意 `shop/keeper_happy` 這種舊鍵跟 `shop/keeper_tortoise` 前綴一樣，不要用「開頭是 `shop/keeper_`」來判斷是不是表情。
4. **地圖頭像**（設計稿 4-4「從立繪自動裁頭」）：三位的頭都在畫布上半、頭寬約 150 像素；阿福頂滿上緣（耳尖長毛在 y=0）。裁的框請實際看一次 `c3_shop_side_by_side_1x.png` 再定。
5. **計數型**：探路杖、箱中箱右下角 44×44 完全透明（存檔後驗過 alpha ≤ 8），數字由程式疊（同 art2 的做法，預覽 `c3_counter_3x.png`）。集章卡設計稿沒說要留角落，沒留。
6. **淨化版在圖鑑**：設計稿 6-1「跟在原件下面一格、沒拿過的畫剪影」——圖示都是實心透明底，剪影可以直接用 alpha 做。
7. 灰膜檢查 `python tools/check_haze.py`：掃 2391 張、0 張灰膜（含本批 88 張事件圖與 12 張立繪）。

## 六、實測數字（2026-09-23）

| 分類 | 張數 | 大小 |
|---|---|---|
| `icons` | 30 | 183.6 KB（平均 6.1 KB） |
| `sprites` | 12 | 354.1 KB（平均 29.5 KB） |
| `bg` | 88 | 4046.4 KB（平均 46.0 KB） |

- 沒登記時 `npm run build && python tools/check_size.py`：首載圖片 9.04／10.60 MB（85.2%）、首載總計 9.72／11.30 MB（86.1%），跟開分支前一樣（新圖都落在「未引用圖」）。
- 模擬登記（量完已還原清單與 docs）：數字見第五段第 2 條。
