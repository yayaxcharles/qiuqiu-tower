# 審圖報告 第 9 包

**統計：共 46 張；重生 4 張（其中 1 張沒用到）、可忍 11 張、沒問題 31 張、拿不準 0 張。**

看法：46 張都疊在深色底上放大兩倍，用 Read 逐張看過；手、劍、紙上的圖、邊緣可疑處再裁局部放大四到六倍確認。另外用程式量了透明度分布（沒有整片半透明的灰膜）、殘留綠幕色、被圖框切平的直線邊。紙箱與問號格的文字照 `src/ui/screens/chest.ts`、`src/content/qmark-text.ts`、`src/content/blessing-text.ts`、`design3_大結構.md` 第 2-2、3-6 節對照。

## 重生

| 圖檔名 | 判定 | 問題（看到什麼、跟哪句文字衝突） | 重生時要畫成什麼 |
|---|---|---|---|
| event_feifei_rare_catnip_master_r0 | 重生 | 文字寫紙上「只畫著一隻大貓**捏針的手勢**，每一根指頭都擺得清清楚楚，旁邊還畫了一個**放鬆的手腕**」，接著「照著練……針一滑，扎進了自己的手背」。圖上紙面很大、看得很清楚，畫的卻是三隻全身在踢腿、奔跑的貓，完全沒有手勢、沒有手腕；菲菲手上也沒有針，只是跪著在看紙。 | 菲菲跪在貓形窩裡，一隻手指間捏著一根細針、手腕放鬆，另一隻手壓著攤在膝上的舊紙；紙上只畫一隻貓爪捏針的特寫手勢，旁邊一個放鬆手腕的小圖（線條圖，沒有字）。手背上一個小紅點、表情忍痛咬牙。窩裡一撮灰毛、旁邊倒著橘色酒葫蘆。 |
| event_fengfeng_rare_catnip_master_r0 | 重生 | 文字寫紙上「只畫著一隻大貓**出劍前先側身、讓開一步**的樣子，**劍尖旁邊**畫了一道小小的弧線」，接著「照著比了一遍又一遍……整個人往前撲，膝蓋磕在石台上」。圖上紙面畫的是兩隻在撲跳、趴伏的貓，**紙上根本沒有劍**；封封只是跪著看紙，劍收在腰後沒拔。講劍法的一段配一張沒有劍的圖，對不上。 | 封封在窩邊單膝跪地、身體前傾像剛撲出去收不住，右手確實握住拔出來的直劍劍柄（劍身完整、不浮空）；舊紙攤在身旁草地上（貼地，不浮起來），紙上畫一隻大貓側身讓開一步、手中劍的劍尖旁一道小弧線（線條圖，沒有字）。 |
| event_fengfeng_rare_catnip_master_r2 | 重生 | 文字第一句「封封**把劍放在窩邊**，在那個貓形的窩裡側身躺下」。圖上他仰躺睡著，**兩手把劍抱在胸前、爪子握著劍柄**，窩邊沒有劍。（若覺得抱劍睡比較像他，也可以改一句文字代替重生，例如「封封抱著劍，在那個貓形的窩裡側身躺下」。） | 封封側身蜷在貓形的窩裡睡著，身上蓋著幾根貓薄荷枝、月亮又大又圓；直劍連鞘**平放在窩邊的草地上**（整把貼地、跟他的手分開），劍穗垂在草上。旁邊可留橘色酒葫蘆。 |
| event_fengfeng_stuck_scabbard_r2 | 畫壞・**沒用到** | 目前沒有選項接這張。畫面裡**同時出現兩隻封封**（左邊一隻用布纏劍鞘、右邊一隻在拔劍），地上另外還躺著一把出鞘的劍，等於一張圖兩隻主角、兩把劍。不接到任何選項就不必重生；**絕對不能直接拿來當第三個選項的結果圖**。 | 若要給第三個選項（「沿鞘口挑出濕襯，暫時鬆開綁帶」）配圖：只畫一隻封封蹲著，一手從鞘口抽出一條濕布襯、另一手拿乾布蓋住鞘口，綁帶鬆鬆垂著；劍還在鞘裡，整把橫放在他膝上或地上，不浮空。 |

## 可忍

| 圖檔名 | 瑕疵 |
|---|---|
| event_feifei_rare_catnip_master_r2 | 文字寫「像小時候午睡那樣**縮成一團**」，圖上是仰躺、腿伸直。其他都對（貓形窩、枝子蓋身、月亮、灰毛、葫蘆）。 |
| event_dangdang_rare_catnip_master_r0 | 紙上畫的是幾個出拳架勢的剪影，意思接近「站好承力的架勢」，但文字說的「後腳跟旁邊往外指的小箭頭」沒畫；噹噹只是跪著看紙，沒畫出挪腳練力的樣子。 |
| event_dangdang_rare_catnip_master_r1 | 台詞是「葫蘆裂了。我修好了再還您」，文字也寫「葫蘆底裂了一道縫」，圖上的葫蘆看不到裂縫（底部被手臂擋住）。 |
| event_dangdang_rare_catnip_master_r2 | 文字寫「側身躺下」，圖上是仰躺四腳朝天。 |
| event_chest_closed | 球球是舊版長相：毛色偏冷灰白、咖啡色大眼帶星星反光；現在的立繪與問號格那三張是奶油白底灰褐紋、黑眼。一眼還認得出是球球。 |
| event_chest_open | 同上，球球是舊版長相。 |
| event_chest_empty | 同上，球球是舊版長相。 |
| event_feifei_chest_open | 光柱兩側的光暈帶一圈黃綠色（像綠幕去背沒去乾淨的色偏）；菲菲腳邊、箱子右側有一小團半透明的灰藍色污漬。 |
| event_dangdang_chest_open | 箱子左上角蓋子縫裡留著一小塊鮮綠色三角（綠幕殘留，約 3×4 像素，放大才看得到）。 |
| event_fengfeng_chest_empty | 右邊尾巴的尾端被圖框切成一條垂直直線（約 80 像素高），畫面上看起來尾巴被截掉一段。 |
| event_fengfeng_q_ambush | 「按住劍柄」有做到，但只看得到劍柄與劍穗，劍鞘完全被身體擋住，乍看像握著一截短柄。 |

**共通備註（沒算進上面）**：四張 `chest_open` 的光柱頂端都是一條硬直線（球球、菲菲、噹噹那三張是被圖框頂端切平，封封那張在圖內就收成一條平邊，看起來像倒梯形色塊）。這是當初「光柱裡留空給秘寶站」的構圖，四張一致，秘寶疊上去的位置（左 33%／噹噹 29%／封封 41%、上 22%）都落在光柱裡，沒有對不上。

## 沒問題

event_rare_catnip_master, event_rare_catnip_master_r0, event_rare_catnip_master_r1, event_rare_catnip_master_r2,
event_feifei_rare_catnip_master, event_feifei_rare_catnip_master_r1,
event_dangdang_rare_catnip_master,
event_fengfeng_rare_catnip_master, event_fengfeng_rare_catnip_master_r1,
event_bless_bundle, event_feifei_bless_bundle, event_dangdang_bless_bundle, event_fengfeng_bless_bundle,
event_feifei_chest_closed, event_feifei_chest_empty, event_dangdang_chest_closed, event_dangdang_chest_empty, event_fengfeng_chest_closed, event_fengfeng_chest_open,
event_q_ambush, event_q_merchant, event_q_roadbox,
event_feifei_q_ambush, event_feifei_q_merchant, event_feifei_q_roadbox,
event_dangdang_q_ambush, event_dangdang_q_merchant, event_dangdang_q_roadbox,
event_fengfeng_q_merchant, event_fengfeng_q_roadbox,
event_fengfeng_fallen_rack_r2（沒用到；畫的是第三個選項「按緊劍鞘補片、跨過碎木」的情境，沒有畫壞）
