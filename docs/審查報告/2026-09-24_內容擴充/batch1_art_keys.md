# 內容擴充第一批：圖的鍵名與檔名對照（給程式代理接線用）

美術代理 art1，2026-09-23。分支 `c0923-art1`（worktree `F:\ClaudeWork\qq-art1`）。
圖都已經照下表的**最終鍵名與檔名**放進 `public/`；程式這邊只要照表填 `art`、`resultArt`、飛行物設定。
**登記狀態**：圖示 28 張、事件圖 31 張已登記在 `public/assets/manifest.json`；**5 張球球版事件主圖檔案放好了、還沒登記**
（`bg/event_daxia_chest`、`bg/event_daxia_lastpage`、`bg/event_ninja_blue_headband`、`bg/event_ninja_target`、`bg/event_ninja_roof_shadow`，
原因與做法見第五段第 1 條）；飛行物照規矩不登記清單分類。
生圖工具 `tools/gen_content_batch1_art.py`（`keys` 子命令印得出同一份清單、`register` 登記那 5 張），飛行物 `tools/gen_projectile_art.py`（`thunder_bead`）。
提交：`04c6d248` 秘寶圖示＋工具、`c0b122a2` 忍具圖示、`18465be2` 飛行物、`b9495a85` 事件圖（分支 `c0923-art1`）。

---

## 一、查到的命名規則（接線前先看這一段）

### 秘寶、忍具圖示
- 秘寶 `RelicDef.art = 'codex/relic_<代號>'`，忍具 `PotionDef.art = 'codex/potion_<代號>'`（`tests/content/potions2.test.ts` 會查忍具的 `art` 要以 `codex/potion_` 開頭）。
- 清單分類 `icons`：`"codex/relic_<代號>": "assets/icons/relic_<代號>.webp"`。唯一的舊例外是起始秘寶藍頭巾（`blue_headband` → `relic_headband`）；這一批**全部是「代號＝檔名」**，沒有例外。
- 規格：128×128、透明底、WebP quality 80、主體長邊貼滿 128 置中（同 `tools/add_icons.py`、09-22 銅護臂）。遊戲裡顯示 32 像素（狀態列 `.hud-relic img`）與 42 像素（戰鬥忍具欄 `.combat .potion img`）。
- 載入：`preloadArt` 開場會把 `icons` 整組載完，只有 `heroOfKey` 認得的（目前只有封封的 `codex/relic_old_sword_tassel`）才延後到選角後。**所以這 28 張圖示現在算首載**（實測見第六段）。

### 事件主圖與結果圖
- 挑圖走 `src/ui/assets.ts` 的 `eventArtKey(id, hero)`：球球版 `bg/event_<代號>`，菲菲／噹噹／封封版 `bg/event_<角色>_<代號>`，沒有自己那張就退回球球版。
- 結果圖：選項的 `resultArt` 一律寫 `'<事件代號>_r<選項序號>'`（序號從 0 起算，`tools/event_result_art.test.ts` 逼這個格式），四隻各自那張由 `eventArtKey(resultArt, hero)` 找到 `bg/event_<角色>_<代號>_r<序號>`。
  「什麼都不做」與「進戰鬥」的選項**不配結果圖**（同一支測試的 `shouldHaveArt`：結果只剩旗標、或含 `fight`，就不該有 `resultArt`）。
- 角色專屬事件：代號本身帶角色前綴（`feifei_trace`、`dangdang_lining`），所以只有一個鍵 `bg/event_<代號>`；球球專屬這一批的代號是 `ninja_…`，鍵就是 `bg/event_ninja_…`。
- `data-art-cast`（`eventArtCast`，插圖裡畫了誰，照檔名推）：有 `feifei|dangdang|fengfeng` 前綴＝那一位；沒前綴但有菲菲版＝球球；兩者都沒有＝純場景。
  - 5F 兩版：四隻的版本都齊、每一張都只畫那一隻 → 球球版推出 `['ninja']`、其他三隻推出自己，**現有規則直接成立**。
  - 球球專屬三篇：`bg/event_ninja_…` 沒有菲菲版，現有規則會推成 `[]`（純場景），但圖裡其實有球球。**建議程式代理在 `eventArtCast` 的前綴正規式加上 `ninja`**（`/^bg\/event_(ninja|feifei|dangdang|fengfeng)_/`）。目前 `data-art-cast` 只拿來決定 5F 對白要不要放頭像，這三篇沒有對白，所以不改也不會出錯，只是標記不準。
- 5F 固定事件 `daxia_teach`（師父留下的秘笈）現在有 **8 張**：四隻各一張主圖＋一張 `_r0`（選項②「放回原位」沒有結果圖）。

### 丟出去的飛行物
- `src/ui/projectile-kinds.ts`：`ProjectileKind` 聯集加 `'thunder_bead'`、`POTION_PROJECTILE` 加 `thunder_bead: 'thunder_bead'`（左邊是忍具代號、右邊是飛行物種類）。
- `src/ui/projectile-flight.ts`：`PROJECTILE_LOOKS` 加一筆 `thunder_bead: { src: art('thunder_bead'), width: …, height: …, spin: 0, arc: … }`。圖檔長寬比見下表，大小請照煙霧彈、貓薄荷球那一類（圓的、拋出去的）抓。
- 圖檔 `public/assets/motion/projectile/thunder_bead.webp`，**不登記在清單分類**（動作圖登記了就進不了打包的 `files` 表、線上 404；`tests/ui/motion_manifest_guard.test.ts` 守著）。

### 延後下載名單是怎麼算的
- `docs/分關載入.json` 不是手寫的，是 `tools/dump_monster_acts.test.ts` 照執行期的規則算出來的（跑全套測試就會重生）；`tools/check_size.py` 拿它判斷哪些不算首載。
- 會被算成延後（值 0 或 2、3）的只有：結果圖（`_r<數字>` 結尾）、`heroOfKey` 認得的角色專屬鍵（`feifei|dangdang|fengfeng`）、只在第二三關出現的事件主圖（`events.ts` 的 `acts` 不含 1）。
- 其餘一律首載。這一批哪些會落在首載、要怎麼改才延後，見第五、六段。

---

## 二、秘寶圖示 18 張（`icons` 分類）

| 代號 | 名稱 | 清單鍵（`RelicDef.art`） | 檔案 | 畫的是 |
|---|---|---|---|---|
| snake_fang | 蛇牙墜 | `codex/relic_snake_fang` | `public/assets/icons/relic_snake_fang.webp` | 紫繩吊著的白色蛇牙、牙尖一滴黃綠毒液 |
| miasma_sachet | 毒霧香囊 | `codex/relic_miasma_sachet` | `public/assets/icons/relic_miasma_sachet.webp` | 酒紅繡金雲紋香囊、袋口冒黃綠毒霧 |
| herb_cauldron | 藥王鼎 | `codex/relic_herb_cauldron` | `public/assets/icons/relic_herb_cauldron.webp` | 三足金銅小鼎、滿滿冒泡的黃綠毒湯、兩片紫藥草 |
| anvil | 鐵砧 | `codex/relic_anvil` | `public/assets/icons/relic_anvil.webp` | 木墩上的黑鐵砧、靠著一把銅頭錘、兩點火花 |
| knee_guard | 順勢護膝 | `codex/relic_knee_guard` | `public/assets/icons/relic_knee_guard.webp` | 銅製圓頂護膝片鉚在皮墊上、兩條皮帶扣 |
| iron_weight_belt | 千斤墜腰帶 | `codex/relic_iron_weight_belt` | `public/assets/icons/relic_iron_weight_belt.webp` | 捲成圈的皮腰帶、帶扣用鐵鍊吊著一顆大鐵墜 |
| whet_stone | 磨劍石 | `codex/relic_whet_stone` | `public/assets/icons/relic_whet_stone.webp` | 木座上的雙層磨刀石、一截劍刃斜靠、接觸點一顆金星 |
| tassel_knot | 劍穗結 | `codex/relic_tassel_knot` | `public/assets/icons/relic_tassel_knot.webp` | 紅色盤長結＋白玉環＋金黃流蘇（舊劍穗是紅流蘇，靠顏色分） |
| qi_gourd | 養氣葫蘆 | `codex/relic_qi_gourd` | `public/assets/icons/relic_qi_gourd.webp` | 青瓷葫蘆、腰繫紅繩、瓶口冒一縷金色氣 |
| bamboo_tube | 竹筒 | `codex/relic_bamboo_tube` | `public/assets/icons/relic_bamboo_tube.webp` | 帶木塞與背繩的粗竹筒水壺、兩滴水 |
| startle_bell | 驚弓鈴 | `codex/relic_startle_bell` | `public/assets/icons/relic_startle_bell.webp` | 小木弓的弦中間吊一顆銅鈴、旁邊有晃動線 |
| shadow_band | 影忍頭帶 | `codex/relic_shadow_band` | `public/assets/icons/relic_shadow_band.webp` | 黑色忍者頭帶＋鐵護額、帶尾拖著紫黑影子 |
| sleepless_censer | 不眠香爐 | `codex/relic_sleepless_censer` | `public/assets/icons/relic_sleepless_censer.webp` | 三足銅香爐、蓋孔透出炭火、兩縷香煙、爐身刻一隻睜大的眼 |
| greedy_pouch | 銅臭錢袋 | `codex/relic_greedy_pouch` | `public/assets/icons/relic_greedy_pouch.webp` | 撐滿方孔銅錢的粗布錢袋、袋口綁兩串銅錢 |
| renounce_beads | 斷念珠 | `codex/relic_renounce_beads` | `public/assets/icons/relic_renounce_beads.webp` | 斷了線的木念珠手串、幾顆珠子掉出來 |
| mad_sheath | 狂刀鞘 | `codex/relic_mad_sheath` | `public/assets/icons/relic_mad_sheath.webp` | 裂開的血紅漆刀鞘、纏破布、冒橘紅火焰狀的氣 |
| shared_bento | 分食便當 | `codex/relic_shared_bento` | `public/assets/icons/relic_shared_bento.webp` | 從中間隔成兩半、兩邊菜色一樣的漆便當盒＋兩雙筷子 |
| bond_knot | 同心結 | `codex/relic_bond_knot` | `public/assets/icons/relic_bond_knot.webp` | 兩個心形紅繩圈交纏成一個結、下垂一紅一金兩條流蘇 |

## 三、忍具圖示 10 張（`icons` 分類）＋飛行物 1 張

| 代號 | 名稱 | 清單鍵（`PotionDef.art`） | 檔案 | 畫的是 |
|---|---|---|---|---|
| qi_tea | 提神茶 | `codex/potion_qi_tea` | `public/assets/icons/potion_qi_tea.webp` | 紅褐色陶茶壺、壺嘴冒金色螺旋氣 |
| sword_talisman | 劍意符 | `codex/potion_sword_talisman` | `public/assets/icons/potion_sword_talisman.webp` | 黃紙紅框符咒、中間畫一把紅色直劍（沒有字） |
| spread_powder | 散毒粉 | `codex/potion_spread_powder` | `public/assets/icons/potion_spread_powder.webp` | 撕開一角的白紙藥包、黃綠毒粉噴出分成三團 |
| needle_salve | 千針膏 | `codex/potion_needle_salve` | `public/assets/icons/potion_needle_salve.webp` | 白瓷藥膏罐裝紫色毒膏、插著三根金針 |
| iron_oil | 鐵布衫油 | `codex/potion_iron_oil` | `public/assets/icons/potion_iron_oil.webp` | 像鎧甲一樣鉚釘銅箍的鐵油壺、瓶口滴一滴油 |
| payback_powder | 以牙還牙粉 | `codex/potion_payback_powder` | `public/assets/icons/potion_payback_powder.webp` | 橘紅布袋裝滿尖刺狀紅粉、束口綁一顆白色獠牙 |
| dive_straw | 潛水竹管 | `codex/potion_dive_straw` | `public/assets/icons/potion_dive_straw.webp` | 從一小灘水裡斜伸出來的細竹管、旁邊冒泡泡 |
| decoy_doll | 替身人偶 | `codex/potion_decoy_doll` | `public/assets/icons/potion_decoy_doll.webp` | 綁藍頭巾的灰貓布偶、背後一縷煙 |
| thunder_bead | 火雷珠 | `codex/potion_thunder_bead` | `public/assets/icons/potion_thunder_bead.webp` | 金屬籠框的暗紅漆圓珠、引信著火、周圍黃色電花 |
| share_half | 分你一半 | `codex/potion_share_half` | `public/assets/icons/potion_share_half.webp` | 掰成兩半的大白包子、中間冒熱氣 |

| 飛行物種類 | 檔案（不登記清單分類） | 圖檔大小 |
|---|---|---|
| `thunder_bead` | `public/assets/motion/projectile/thunder_bead.webp` | 112×72（跟貓薄荷球 `nip_ball` 一樣；建議 `PROJECTILE_LOOKS` 照它寫 `width: 58, height: 37, spin: 0, arc: 50`） |

畫面是往右飛：引信在後（左）著火、小電花與火星往左拖，所以程式只順著飛行方向擺頭、不要轉（同煙霧彈）。

## 四、事件圖 36 張（`bg` 分類）

選項序號照提案的選項順序（0 起算）。**程式代理寫 `choices` 時順序要跟這裡一樣**，不然結果圖會錯位。
標 ★ 的是**檔案已放好、還沒登記清單**的 5 張（接線時跑 `python tools/gen_content_batch1_art.py register`）。

### 師父的舊木箱 `daxia_chest`（第二關 5F 固定）：四隻 × 3 張＝12
| 選項 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | ★`bg/event_daxia_chest` | `bg/event_feifei_daxia_chest` | `bg/event_dangdang_daxia_chest` | `bg/event_fengfeng_daxia_chest` | 木造樓梯轉角一只包鐵角的舊木箱，箱蓋刻一個大貓掌印（師父的記號），鎖已經彈開；角色蹲著要掀蓋 |
| ①翻出箱底的秘笈（絕學三選一） | `daxia_chest_r0` | `bg/event_daxia_chest_r0` | `bg/event_feifei_daxia_chest_r0` | `bg/event_dangdang_daxia_chest_r0` | `bg/event_fengfeng_daxia_chest_r0` | 箱蓋大開，從箱底捧出一本舊秘笈，攤開是三幅貓的招式圖 |
| ②帶走箱裡的舊忍具（2 支忍具） | `daxia_chest_r1` | `bg/event_daxia_chest_r1` | `bg/event_feifei_daxia_chest_r1` | `bg/event_dangdang_daxia_chest_r1` | `bg/event_fengfeng_daxia_chest_r1` | 空箱旁，兩手各舉一件舊忍具（煙霧彈、藥葫蘆） |
| ③蓋回去（無） | 不配 | | | | | |

### 最後一頁 `daxia_lastpage`（第三關 5F 固定）：四隻 × 4 張＝16
| 選項 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | ★`bg/event_daxia_lastpage` | `bg/event_feifei_daxia_lastpage` | `bg/event_dangdang_daxia_lastpage` | `bg/event_fengfeng_daxia_lastpage` | 塔頂夜裡的石階、石欄杆、一盞石燈籠；階上落著一頁撕下的秘笈（墨跡還亮），角色彎腰要撿 |
| ①照著最後一頁練（絕學三選一） | `daxia_lastpage_r0` | `bg/event_daxia_lastpage_r0` | `bg/event_feifei_daxia_lastpage_r0` | `bg/event_dangdang_daxia_lastpage_r0` | `bg/event_fengfeng_daxia_lastpage_r0` | 紙頁用小石頭壓在階上，角色照著紙上那一招擺架勢（球球爪擊、菲菲彈針、噹噹馬步推護臂、封封出劍） |
| ②摺進衣襟、想著師父教過的（升級至多 2 張） | `daxia_lastpage_r1` | `bg/event_daxia_lastpage_r1` | `bg/event_feifei_daxia_lastpage_r1` | `bg/event_dangdang_daxia_lastpage_r1` | `bg/event_fengfeng_daxia_lastpage_r1` | 坐在階上閉眼微笑，把紙頁摺小塞進衣襟、手按在胸口，頭邊三顆小金星 |
| ③收好不看（回復 10 點生命） | `daxia_lastpage_r2` | `bg/event_daxia_lastpage_r2` | `bg/event_feifei_daxia_lastpage_r2` | `bg/event_dangdang_daxia_lastpage_r2` | `bg/event_fengfeng_daxia_lastpage_r2` | 紙頁收進腰間小袋，靠著石欄杆坐著喝竹筒水、鬆一口氣 |

### 欄杆上的藍頭巾 `ninja_blue_headband`（球球，第一、二關）：3 張
| 選項 | `resultArt` | 鍵 | 畫面 |
|---|---|---|---|
| 主圖 | — | ★`bg/event_ninja_blue_headband` | 石階木欄杆柱上綁著一條褪色的淡藍頭巾，球球伸手去摸（他自己頭上那條是深藍） |
| ①綁在手腕上（最大生命 +6） | `ninja_blue_headband_r0` | `bg/event_ninja_blue_headband_r0` | 把淡藍頭巾一圈圈纏在左手腕上綁緊 |
| ②撕成繃帶（回復 18 點生命） | `ninja_blue_headband_r1` | `bg/event_ninja_blue_headband_r1` | 坐在階上把頭巾撕成布條包紮手臂 |
| ③留著給師父認路（無） | 不配 | | |

### 滿是刀痕的木靶 `ninja_target`（球球，第一、二關）：3 張
| 選項 | `resultArt` | 鍵 | 畫面 |
|---|---|---|---|
| 主圖 | — | ★`bg/event_ninja_target` | 木架上的圓木靶插滿舊手裏劍、靶心磨得發亮，球球摸著下巴抬頭看 |
| ①練到天黑（升級 1 張、失去 6 點生命） | `ninja_target_r0` | `bg/event_ninja_target_r0` | 靶架上掛起點亮的燈籠，球球一身擦傷、臉上貼布、滿頭汗，正把手裏劍射進靶心 |
| ②撿還能用的暗器（隨機罕見忍術牌） | `ninja_target_r1` | `bg/event_ninja_target_r1` | 從靶上拔下三枚還能用的手裏劍拿在手上端詳，地上兩枚斷掉的 |
| ③走開（無） | 不配 | | |

### 屋頂上的影子 `ninja_roof_shadow`（球球，第二、三關）：2 張
| 選項 | `resultArt` | 鍵 | 畫面 |
|---|---|---|---|
| 主圖 | — | ★`bg/event_ninja_roof_shadow` | 夜裡的瓦屋頂，影球球（紫黑煙霧身、發光紫眼、影子頭巾，照魔物 `shadow_cat` 的樣子）在高處屋簷上跑，球球蹲在低處抬頭愣住 |
| ①追上去（打一場） | 不配（進戰鬥的選項不配結果圖） | | |
| ②躲著看它的招式（自選移除 1 張） | `ninja_roof_shadow_r1` | `bg/event_ninja_roof_shadow_r1` | 球球躲在屋脊後只露出頭和爪子偷看，遠處影球球在練飛踢 |

注意 ②的結果圖是 `_r1` 不是 `_r0`（序號照選項位置）。

---

## 五、接線時要做的事（照順序）

1. **登記那 5 張球球版主圖**：`python tools/gen_content_batch1_art.py register`（照 `tools/motion-art-source/c1/picks.json` 併進清單，兩格縮排格式、只加 5 行）。
   為什麼現在沒登記：這幾篇還不在 `events.ts`，球球版主圖沒有角色前綴、不是結果圖、也不在任何一關的 `bgKeysForAct` 裡，一登記就被 `preloadArt` 算成**每個人的首載**（5 張共 210 KB），
   而且實測會讓推送閘門超標（見第六段）。**登記之前先做完下面第 2、3 條，否則閘門會紅。**
2. **5F 兩版的主圖要延後**：`bgacts.ts` 的 `bgKeysForAct` 是照事件的 `acts` 把 `bg/event_<代號>` 分到各關。第二關那版要只落在第二關、第三關那版只落在第三關
   （例如 `acts: [2]`、`acts: [3]`，或 5F 改成「每關一個」之後在這裡另外處理），主圖才會進延後名單。不處理的話那兩張（36.9＋42.5 KB）算首載。
   （如果第〇批 0-2「事件主圖照這一關的地圖預載」先做完，事件主圖整批離開首載，這條與下一條就自然解決。）
3. **球球專屬三篇的主圖**：`ninja_roof_shadow`（第二、三關）照 `acts` 自然延後；`ninja_blue_headband`、`ninja_target`（第一、二關）的主圖會算**每個人**的首載（`heroOfKey` 不認得 `ninja`，40.4＋51.9 KB）。
   建議 `heroOfKey` 把 `bg/event_ninja_` 開頭的鍵認成 `'ninja'`：開場不載、選了球球才由 `heroArtUrls` 補，`dump_monster_acts.test.ts` 也會跟著把它們算成 0。
   `heroSpriteUrls` 那類 `?? 'ninja'` 的判斷只看 `hero/` 開頭的鍵，不受影響；`tests/ui/preload_hero.test.ts` 要一起看。
4. **暫放名單要拿掉**：`tools/manifest_hygiene.test.ts` 的 `PENDING_C1`（第一批程式接線前暫放）。事件一進 `events.ts`，同檔的「暫放名單裡的事件都還沒接線」那條就會紅，提醒你把名單刪掉。
5. **`eventArtCast` 認 `ninja` 前綴**（見第一段），讓球球專屬三篇的 `data-art-cast` 是 `ninja`。
6. **資料欄位**：秘寶 `art: 'codex/relic_<代號>'`、忍具 `art: 'codex/potion_<代號>'`、`choices` 的順序與 `resultArt` 照第四段；火雷珠的飛行物照第三段。

## 六、實測數字（2026-09-23，`npm run build && python tools/check_size.py`，分支 HEAD `b9495a85`）

| 項目 | 數字 |
|---|---|
| 秘寶圖示 18 張 | 108.5 KB（這一批 28 張平均 6.2 KB、3.4～8.6 KB；舊的 41 張 128 像素圖示平均 4.3 KB、2.5～10.9 KB） |
| 忍具圖示 10 張 | 65.4 KB |
| 事件圖 36 張 | 1.52 MB（平均 42 KB；首載只有登記後的那 5 張主圖，其餘延後） |
| 飛行物 1 張 | 5.9 KB（按需動作，不算首載） |
| 首載圖片（本分支） | **10.46 / 10.60 MB（98.7%）**，比開分支前多 174 KB（28 張圖示；`preloadArt` 會載整組 `icons`，沒有延後機制） |
| 首載總計（本分支） | **11.25 / 11.30 MB（99.5%）**，只剩約 50 KB |
| 如果 5 張主圖也登記、又沒做第 2、3 條 | 圖片 10.67 MB、總計 11.46 MB，**兩項都超標**（實測過一次才決定先不登記） |
| 只做第 2 條、沒做第 3 條就登記 | 約多 92 KB 首載 → 總計約 11.34 MB，仍會超標 |

**需要主控拍板**：圖示 174 KB 目前算首載（派工單寫「新圖一律延後」，但圖示沒有現成的延後管道）。
要延後的話，鎖角色的六件可以比照舊劍穗在 `heroOfKey` 特例化（`whet_stone`、`tassel_knot`、`qi_gourd`、`qi_tea`、`sword_talisman` → 封封；`iron_weight_belt` → 噹噹，共 34.4 KB），
其餘共用的要改 `preloadArt`（例如圖示改成選角後才載）。首載總計只剩 50 KB 餘裕，第二批的圖示進來前一定要處理。
