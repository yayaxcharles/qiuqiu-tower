# 第 6 包審圖結果

共 92 張：重生 7 張、可忍 16 張、沒問題 69 張、拿不準 0 張。

檢查方式：每張圖都貼到暗綠底色上、放大兩倍，逐張用眼睛看過；另外跑了一支小程式掃半透明灰膜、白邊、主體被圖框切到的情況（只有 `event_feifei_shortcut_scroll` 兩張碰到上緣，其餘沒有灰膜或白邊）。浮空窗框那兩張另外疊到遊戲的事件背景 `screen_event.webp` 上確認過，確實看得出是一塊窗框懸在空中。四隻主角的長相以 `sprites/hero/*_portrait.webp` 為準。

## 重生

| 圖檔名 | 判定 | 問題（看到什麼、跟哪句文字衝突） | 重生時要畫成什麼 |
|---|---|---|---|
| `event_grindstone` | 重生 | 球球吐著舌頭、很開心地在磨刀石上磨小刀，火花四濺。文字是「練這個會傷身，得想清楚喵」，還在猶豫、根本還沒動手；主圖等於先畫成「已經照做」。石頭上也看不到刻著的捨招法。 | 球球站或蹲在磨刀石旁，一爪托下巴，皺眉看著石面上刻的圖案（小人出招、打叉之類的圖，不要有字）；刀放在地上或收在身上，不要拿在手上磨。 |
| `event_feifei_grindstone` | 重生 | 菲菲吐舌、興高采烈地磨小刀。文字是「連身體都會練壞……這法子真的值得嗎？」，應該是擔心、遲疑，不是已經開始練。 | 菲菲站在磨刀石旁，雙手縮在胸前，擔心地看著石面上刻的招式圖案（不要有字）；手上不拿刀，刀具不出現或放在地上。 |
| `event_feifei_grindstone_r0` | 重生 | 菲菲一手拿小刀、一手抓石塊，衝勁十足地在石面上刻劃，還吐舌頭。文字是「磨到最後胸口發悶，喘得比平常還急」「胸口一直發虛，連站著都累」，圖完全沒有累或喘的樣子。 | 菲菲練完後跪坐在磨刀石旁，一爪按著胸口，張嘴喘氣（畫幾團呼出的白氣）、冒汗、眼神疲憊；小刀平放在石面上，手上不拿東西。 |
| `event_fengfeng_grindstone` | 重生 | 封封吐舌、開心地把小刀壓在磨刀石上磨。文字明寫「封封讀完，把手從石上拿開」「不是磨劍，是要改掉原來練熟的招式」，圖正好畫成他在磨。另外他頭後綁著紅布、脖子上沒有圍巾，造型像球球的頭巾換色。 | 封封站在磨刀石旁，一爪剛從刻字的石面收回、懸在身側，表情認真凝重地看著石上刻的招式圖案（不要有字）；直劍收在腰間鞘裡；紅圍巾圍在脖子上，頭上不綁布。 |
| `event_fengfeng_shortcut_scroll_r0` | 重生 | 封封空手擺出掌擊姿勢（是球球那張的換色），身上看不到劍。文字整段在講劍：「出手快了，收劍時卻接連卡住」「出得去，收不回來」。 | 封封在卷軸前，右爪握著直劍劍柄，劍身收到一半卡在腰間的劍鞘口，表情懊惱咬牙；紅圍巾；牆上卷軸畫的是分解動作的小人圖，不要有字。 |
| `event_pigeon_lost_r1` | 重生 | 右上角那扇鐵窗是一塊獨立的石框，底下沒有牆連到地面，整塊窗框懸在半空中（跟使用者抓到的「劍浮在半空」同一類）。其餘內容（鴿子飛走、忍具謝禮、信散一地）都對。 | 構圖照舊，但鐵窗要嵌在一面從地面砌上來的石牆上，牆要連到地板；鴿子從窗口鑽出去，斷掉的背帶掛在鐵條上；球球站在地上接住謝禮，地上散著信。 |
| `event_fengfeng_pigeon_lost_r1` | 重生 | 同上，右上角的窗框是一個浮在空中的方框，四周沒有牆，比球球那張更明顯。另外文字是「封封收劍，才看見地上還散著信」，圖是他仰頭接謝禮、劍一直在鞘裡，沒有收劍的動作。 | 鐵窗嵌在連到地面的石牆上，鴿子從窗口飛出，斷掉的背帶掛在鐵條上；封封右爪正把直劍收回腰間劍鞘，低頭看著一地散信、一臉錯愕；謝禮小包掉在他腳邊地上。 |

## 可忍

| 圖檔名 | 瑕疵 |
|---|---|
| `event_fengfeng_grindstone_r0` | 內容對（按胸口喘、三把刀平放在石上、劍收在鞘裡），但紅布是綁在頭後面、脖子上沒有圍巾，造型偏離封封的「紅圍巾」。 |
| `event_dangdang_grindstone` | 石碑上刻的是一串像草書的彎曲筆畫，看起來像字（雖然讀不出來）；規則是只能有圖案。動作與文字相符。 |
| `event_dangdang_grindstone_r0` | 畫的是噹噹冒汗喘氣、正使勁推著磨刀石，比較像「練到一半很吃力」；文字是「練完後……休息許久也沒能回到原來的狀態」。同一塊石碑也有像字的刻痕。 |
| `event_shortcut_scroll` | 球球張大嘴一臉驚喜，跟台詞「練了會怎樣，怎麼不寫清楚喵？」的質疑語氣不太合。 |
| `event_feifei_shortcut_scroll` | 石柱頂端被圖框切平（碰到上緣），疊到畫面上會看到一刀切齊的柱頂。 |
| `event_feifei_shortcut_scroll_r0` | 同上，石柱頂端被圖框切平。 |
| `event_fengfeng_shortcut_scroll` | 封封一臉驚喜歡呼，跟台詞「出了什麼問題，連一句都不肯寫？」的不滿語氣相反；文字說他翻到卷軸背面，圖沒有翻的動作。 |
| `event_dangdang_pigeon_lost_r1` | 文字是「從工具袋拿出鉗子，一下剪斷背帶……噹噹低頭看著一地的信」；圖上沒有鉗子，噹噹是抬頭接謝禮。 |
| `event_fengfeng_pigeon_lost_r0` | 文字說「封封把劍鞘靠在牆邊」才攀上去，圖上劍仍掛在他腰後。其餘（綁成幾疊的信、手臂擦傷、鴿子站在信上）都對。 |
| `event_pigeon_grandpa` | 鴿子停在閣樓裡的木樑上，但台詞是「翅膀扭到了，飛不上閣樓」；看起來像鴿子也在閣樓上。 |
| `event_feifei_pigeon_grandpa` | 同上，鴿子在閣樓木樑上。 |
| `event_dangdang_pigeon_grandpa` | 同上，鴿子在閣樓木樑上。 |
| `event_fengfeng_pigeon_grandpa` | 同上，鴿子在閣樓木樑上。 |
| `event_feifei_shadow_study_r1` | 文字是「菲菲縮在門外……跟著在袖子裡比了比」；圖上她站在屋裡、真的把一根針射出去，不像躲在門外偷偷比畫。 |
| `event_dangdang_shadow_study_r1` | 文字是「噹噹靠在門外……默默記下那個時機」；圖上他站在屋裡擺架式出拳。 |
| `event_fengfeng_shadow_study_r1` | 文字是「封封站在門外……跟著在心裡走了一遍」；圖上他在屋裡實際做收劍動作。 |

## 沒問題

`event_grindstone_r0`、`event_shortcut_scroll_r0`、`event_dangdang_shortcut_scroll`、`event_dangdang_shortcut_scroll_r0`、
`event_pigeon_lost`、`event_pigeon_lost_r0`、`event_feifei_pigeon_lost`、`event_feifei_pigeon_lost_r0`、`event_feifei_pigeon_lost_r1`、`event_dangdang_pigeon_lost`、`event_dangdang_pigeon_lost_r0`、`event_fengfeng_pigeon_lost`、
`event_pigeon_grandpa_r0`、`event_pigeon_grandpa_r1`、`event_pigeon_grandpa_r2`、`event_feifei_pigeon_grandpa_r0`、`event_feifei_pigeon_grandpa_r1`、`event_feifei_pigeon_grandpa_r2`、`event_dangdang_pigeon_grandpa_r0`、`event_dangdang_pigeon_grandpa_r1`、`event_dangdang_pigeon_grandpa_r2`、`event_fengfeng_pigeon_grandpa_r0`、`event_fengfeng_pigeon_grandpa_r1`、`event_fengfeng_pigeon_grandpa_r2`、
`event_pigeon_reply`、`event_pigeon_reply_r0`、`event_pigeon_reply_r1`、`event_pigeon_reply_r2`、`event_feifei_pigeon_reply`、`event_feifei_pigeon_reply_r0`、`event_feifei_pigeon_reply_r1`、`event_feifei_pigeon_reply_r2`、`event_dangdang_pigeon_reply`、`event_dangdang_pigeon_reply_r0`、`event_dangdang_pigeon_reply_r1`、`event_dangdang_pigeon_reply_r2`、`event_fengfeng_pigeon_reply`、`event_fengfeng_pigeon_reply_r0`、`event_fengfeng_pigeon_reply_r1`、`event_fengfeng_pigeon_reply_r2`、
`event_shadow_loose`、`event_shadow_loose_r0`、`event_shadow_loose_r1`、`event_feifei_shadow_loose`、`event_feifei_shadow_loose_r0`、`event_feifei_shadow_loose_r1`、`event_dangdang_shadow_loose`、`event_dangdang_shadow_loose_r0`、`event_dangdang_shadow_loose_r1`、`event_fengfeng_shadow_loose`、`event_fengfeng_shadow_loose_r0`、`event_fengfeng_shadow_loose_r1`、
`event_shadow_study`、`event_shadow_study_r1`、`event_feifei_shadow_study`、`event_dangdang_shadow_study`、`event_fengfeng_shadow_study`、
`event_shadow_truth`、`event_shadow_truth_r1`、`event_shadow_truth_r2`、`event_feifei_shadow_truth`、`event_feifei_shadow_truth_r1`、`event_feifei_shadow_truth_r2`、`event_dangdang_shadow_truth`、`event_dangdang_shadow_truth_r1`、`event_dangdang_shadow_truth_r2`、`event_fengfeng_shadow_truth`、`event_fengfeng_shadow_truth_r1`、`event_fengfeng_shadow_truth_r2`

（附註：`event_fengfeng_shadow_loose` 文字提到「放下水袋」，圖上沒畫水袋；屬於可省略的細節，不列入瑕疵。）
