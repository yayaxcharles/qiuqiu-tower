共 89 張：重生 1 張、可忍 15 張、沒問題 73 張、拿不準 0 張。

審法：每張都疊在深青色底上放大兩倍，用 Read 逐張看過，只要是跟劍柄、爪子、懸空物、邊緣裁切有關的疑點，都再局部放大確認。四隻貓的長相拿 `sprites/hero/*_portrait.webp` 對照過，89 張都沒有畫錯貓、也沒有混進別隻主角。

## 重生／拿不準

| 圖檔名 | 判定 | 問題（看到什麼、跟哪句文字衝突） | 重生時要畫成什麼 |
|---|---|---|---|
| `event_feifei_wind_chimes_r0` | 重生 | 菲菲盤腿坐著、閉眼，兩隻手平放在膝蓋上，竹筒還掛在腰帶上，手裡什麼都沒拿。這跟文字第一句的主要姿勢「菲菲閉上眼睛，**抱著竹筒**靜靜地聽」對不上，等於違反了第 3 條「文字寫她抱著，爪子就要真的抓住」。畫面本身不怪，是這包裡最輕的一種重生。 | 菲菲一個人盤腿坐在風鈴長廊的木地板上，閉著眼睛、表情放鬆；兩隻手把她的竹筒直立抱在胸前，爪子確實環抱住竹筒。頭上的屋簷垂掛一排風鈴，其他照原圖。 |

## 可忍

| 圖檔名 | 瑕疵 |
|---|---|
| `event_fengfeng_wind_chimes_r1` | 文字最後一拍是「劍也跟著帶出一道風」，圖上的劍卻一直插在腰間的鞘裡，爪子只停在劍柄上方、沒有握住。整體走步的動作是對的，但沒畫出揮劍。（可忍裡最接近重生的一張） |
| `event_dangdang_wind_chimes_r0` | 左上角柱子頂端和橫樑被切成一條平直的線、沒有描邊，看起來像被裁掉一截。 |
| `event_fengfeng_wind_chimes_r2` | 欄杆後面留著一塊夜空背景（月亮和雲），疊到遊戲場景上會多出一塊天空。 |
| `event_dangdang_wind_chimes_r2` | 欄杆後面留著一截深藍色的樹叢剪影背景，情況同上，但比較小。 |
| `event_miasma_crystal_r0` | 文字說「球球抱緊行囊，往後退了一步」，圖上沒有行囊（結晶收在胸口、水窪倒影的紫眼都有畫到）。 |
| `event_miasma_crystal_r1` | 文字說結晶「碎成一地紫色的砂」，但右邊還立著一大塊完整的結晶。 |
| `event_dangdang_miasma_crystal` | 文字是「摸了摸旁邊蒙霜的石頭」，圖上爪子卻懸在結晶正上方，像要去拿結晶，有一點先演了選項一。 |
| `event_coop_rope_bridge_r0` | 懸崖正面有三塊尖石浮在半空、沒有連到崖壁。 |
| `event_coop_seesaw_r0` | 跟主圖不是同一台機關：主圖是單根柱子加木架，結果圖變成兩根柱子撐一根橫梁的門形架子，前後對照會覺得換了一台。 |
| `event_rare_fortune_sticks_r0` | 籤被搖得飛到頭頂高處（有畫動態線），文字是「一支籤『啪』地掉在桌上」。 |
| `event_feifei_rare_fortune_sticks_r0` | 同上，籤飛到頭上；另外文字說她「才慢慢搖」，圖上卻是瞇眼用力猛搖。 |
| `event_dangdang_rare_fortune_sticks_r0` | 同上，籤飛到頭頂上方。 |
| `event_dangdang_rare_sleeping_hoard_r1` | 那根「破槍」兩端都有槍頭（變成雙頭槍），而且蓋在金魚上面；文字說的是第二件「底下壓著一根破槍」，位置剛好相反。 |
| `event_feifei_rare_miasma_whisper_r1` | 文字說「菲菲閉上眼睛，用盡力氣喊」，圖上她睜大眼睛在喊。 |
| `event_fengfeng_rare_miasma_whisper_r0` | 拿來挑東西的劍鞘畫得很短，像一截木棍，尖端也沒碰到那樣發光的東西（東西還浮在霧裡）；文字是「用劍鞘把那樣東西挑出紫霧」。 |

## 沒問題

event_wind_chimes, event_wind_chimes_r0, event_wind_chimes_r1, event_wind_chimes_r2, event_feifei_wind_chimes, event_feifei_wind_chimes_r1, event_feifei_wind_chimes_r2, event_dangdang_wind_chimes, event_dangdang_wind_chimes_r1, event_fengfeng_wind_chimes, event_fengfeng_wind_chimes_r0, event_miasma_crystal, event_feifei_miasma_crystal, event_feifei_miasma_crystal_r0, event_feifei_miasma_crystal_r1, event_dangdang_miasma_crystal_r0, event_dangdang_miasma_crystal_r1, event_fengfeng_miasma_crystal, event_fengfeng_miasma_crystal_r0, event_fengfeng_miasma_crystal_r1, event_coop_rope_bridge, event_coop_rope_bridge_r2, event_coop_seesaw, event_coop_seesaw_r2, event_coop_shooting_star, event_coop_shooting_star_r0, event_coop_shooting_star_r2, event_rare_hot_spring, event_rare_hot_spring_r0, event_rare_hot_spring_r1, event_rare_hot_spring_r2, event_feifei_rare_hot_spring, event_feifei_rare_hot_spring_r0, event_feifei_rare_hot_spring_r1, event_feifei_rare_hot_spring_r2, event_dangdang_rare_hot_spring, event_dangdang_rare_hot_spring_r0, event_dangdang_rare_hot_spring_r1, event_dangdang_rare_hot_spring_r2, event_fengfeng_rare_hot_spring, event_fengfeng_rare_hot_spring_r0, event_fengfeng_rare_hot_spring_r1, event_fengfeng_rare_hot_spring_r2, event_rare_fortune_sticks, event_rare_fortune_sticks_r1, event_feifei_rare_fortune_sticks, event_feifei_rare_fortune_sticks_r1, event_dangdang_rare_fortune_sticks, event_dangdang_rare_fortune_sticks_r1, event_fengfeng_rare_fortune_sticks, event_fengfeng_rare_fortune_sticks_r0, event_fengfeng_rare_fortune_sticks_r1, event_rare_sleeping_hoard, event_rare_sleeping_hoard_r0, event_rare_sleeping_hoard_r1, event_feifei_rare_sleeping_hoard, event_feifei_rare_sleeping_hoard_r0, event_feifei_rare_sleeping_hoard_r1, event_dangdang_rare_sleeping_hoard, event_dangdang_rare_sleeping_hoard_r0, event_fengfeng_rare_sleeping_hoard, event_fengfeng_rare_sleeping_hoard_r0, event_fengfeng_rare_sleeping_hoard_r1, event_rare_miasma_whisper, event_rare_miasma_whisper_r0, event_rare_miasma_whisper_r1, event_feifei_rare_miasma_whisper, event_feifei_rare_miasma_whisper_r0, event_dangdang_rare_miasma_whisper, event_dangdang_rare_miasma_whisper_r0, event_dangdang_rare_miasma_whisper_r1, event_fengfeng_rare_miasma_whisper, event_fengfeng_rare_miasma_whisper_r1

## 補充說明（判定依據，給決定要不要改的人看）

1. **三個連線事件（吊橋、翹翹板、流星）的九張圖，全部只畫場景、一隻貓都沒有。** 畫面上有打開的寶箱、磨破的繩子、地上的抓痕、發亮的爪印、被拆掉的橋板等等，用東西來交代「選了之後發生什麼」。這符合第 6 條「共用圖不要畫出特定主角」，所以清單上標的「沒有自己的版本，看到的是球球那張」其實不成立：看到的不是球球，是一張空場景，因此沒有算成「缺版本」。唯一的代價是，文字寫「球球踩了一下第一塊木板」「回頭看同伴」這類在場的動作，圖上看不到人。如果使用者希望連線圖也要有角色，這九張就得整批換做法，不是個別重生能解決的。
2. **風鈴長廊有好幾張屋簷只有一邊有柱子，另一邊挑空伸出去**（例如 `event_wind_chimes_r2`、`event_feifei_wind_chimes`、`event_dangdang_wind_chimes_r1`）。九張排成縮圖一起看時完全看不出怪，所以沒有列進可忍。
3. **菲菲的「竹筒」各張畫法不一樣**：大部分是腰帶上那排金色竹節，`event_feifei_miasma_crystal_r1` 則是一支綠色、綁著繩子的竹水筒。單看任何一張都沒錯，但如果要重生 `event_feifei_wind_chimes_r0`，最好先決定竹筒統一用哪一種畫法。
4. 邊緣檢查：每張都疊在深色底上看過，沒發現白邊或灰膜。另外用程式掃描是否有平直的裁切邊，只抓到 `event_dangdang_wind_chimes_r0` 屋頂那一條（已列入可忍）；其他被標出來的平直邊，放大確認後都是有描邊的地板或柱子，不是被裁掉的。
