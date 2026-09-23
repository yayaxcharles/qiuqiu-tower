# 內容擴充第二批：事件插圖 A 組的鍵名與檔名對照（給程式代理接線用）

美術代理 art3，2026-09-23。分支 `c0923-art3`（worktree `F:\ClaudeWork\qq-art3`，從 `c0923-int` `3448f06e` 開出）。
範圍＝劇本 `design2_事件劇本.md` 第三節（郵差鴿 3 集）、第四節（影子 3 集）、第六節（連線限定 3 篇）。第五、七節是 art4 的。

- **85 張圖**已照最終檔名放進 `public/assets/bg/`（560×420、透明底、WebP quality 80，同既有事件圖）。
- **一張都還沒登記素材清單**。接線時在同一筆提交裡跑一行：
  `python tools/gen_content_batch2_events_a.py register`
  → 照 `tools/motion-art-source/c2a/picks.json` 併進 `public/assets/manifest.json` 的 `bg`，共 **88 個鍵**（85 張＋連線三篇 `_r1` 共用 `_r0` 的檔），兩格縮排、只加行（已實測：`git diff` 89 加 1 減，減的那行只是原本最後一筆補逗號）。
- 鍵名清單也印得出來：`python tools/gen_content_batch2_events_a.py keys`。
- 生圖工具 `tools/gen_content_batch2_events_a.py`；原檔與參考圖在 `tools/motion-art-source/c2a/`（png 不進版控，`prompts.json`、`picks.json` 進版控）。

---

## 一、命名規則（跟第一批一樣）

- 主圖：球球版 `bg/event_<代號>`，菲菲／噹噹／封封版 `bg/event_<角色>_<代號>`（`eventArtKey` 找不到自己那張就退回球球版）。
- 結果圖：選項的 `resultArt` 一律寫 `'<代號>_r<選項序號>'`（序號從 0 起算、照劇本表格的選項順序）；「進戰鬥」與「無效果」的選項不配圖（`tools/event_result_art.test.ts` 的 `shouldHaveArt`）。
- **條件選項加在最後**，它的序號就是最後那個（`pigeon_reply` ③＝`_r2`、`shadow_truth` ③＝`_r2`）。
- `data-art-cast`（`eventArtCast`，照檔名推畫了誰）：
  - 郵差鴿、影子兩條鏈：四隻都有自己的版本、每張只畫那一隻主角 → 現有規則直接成立（球球版推出 `['ninja']`）。圖裡的郵差鴿、老爺爺、影子不是主角貓，不在名單裡。
  - 連線三篇：只有 `bg/event_coop_*`、沒有角色版 → 現有規則推成 `[]`（純場景），**正確**，不用改。畫面上兩位立繪照劇本新7 由 `eventSidePortrait` 放兩邊（程式的事）。

## 二、事件鏈 A：迷路的郵差鴿（劇本第三節）

### A1 `pigeon_lost` 迷路的郵差鴿（第一關，塔下石牢）：四隻 × 3＝12
| 劇本 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_pigeon_lost` | `bg/event_feifei_pigeon_lost` | `bg/event_dangdang_pigeon_lost` | `bg/event_fengfeng_pigeon_lost` | 石牢高處小鐵窗卡著胖郵差鴿（深藍郵差帽歪一邊、背帶纏在鐵條上），地上散著信、前面那封郵票位置是貓腳印；角色在窗下仰頭（菲菲、封封手上各撿著一封，噹噹瞇眼看扣環） |
| ① 爬上去解背帶 | `pigeon_lost_r0` | `bg/event_pigeon_lost_r0` | `bg/event_feifei_pigeon_lost_r0` | `bg/event_dangdang_pigeon_lost_r0` | `bg/event_fengfeng_pigeon_lost_r0` | 角色蹲著疊信、手背一兩道細紅痕（沒畫血），鴿子站在疊好的信上挺胸、帽子扶正 |
| ② 勾斷背帶讓牠先飛 | `pigeon_lost_r1` | `bg/event_pigeon_lost_r1` | `bg/event_feifei_pigeon_lost_r1` | `bg/event_dangdang_pigeon_lost_r1` | `bg/event_fengfeng_pigeon_lost_r1` | 鴿子從鐵窗飛出去的背影、斷掉的背帶掛在鐵條上；角色一手接住落下的小布包、一手伸向滿地的信，表情「欸？」 |
| ③ 不管牠 | 不配 | | | | | |

### A2 `pigeon_grandpa` 給爺爺的信（第二關，塔中閣樓）：四隻 × 4＝16
| 劇本 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_pigeon_grandpa` | `bg/event_feifei_pigeon_grandpa` | `bg/event_dangdang_pigeon_grandpa` | `bg/event_fengfeng_pigeon_grandpa` | 閣樓斜屋頂、舊木箱堆、圓窗月光、紙燈籠；鴿子停在木樑上一邊翅膀纏著布垂下；戴圓眼鏡的老虎斑貓拿著只畫爪印郵票的信；角色站在梯子口剛遞完信 |
| ① 念信給爺爺聽 | `pigeon_grandpa_r0` | `bg/event_pigeon_grandpa_r0` | `bg/event_feifei_pigeon_grandpa_r0` | `bg/event_dangdang_pigeon_grandpa_r0` | `bg/event_fengfeng_pigeon_grandpa_r0` | 坐在老貓旁攤信念（信紙只有小孩畫的兩顆柿子和蝴蝶結）：球球尷尬抓頭、老貓笑到瞇眼；菲菲眼眶泛淚、老貓拍她的手；噹噹手拿小鉗子、老貓眼鏡已扶正；封封平靜念 |
| ② 替爺爺寫回信 | `pigeon_grandpa_r1` | `bg/event_pigeon_grandpa_r1` | `bg/event_feifei_pigeon_grandpa_r1` | `bg/event_dangdang_pigeon_grandpa_r1` | `bg/event_fengfeng_pigeon_grandpa_r1` | 矮木箱當桌、紙筆硯台，角色握筆、老貓在旁口述並扶著角色手腕；紙上不寫字，只有各自的記號（球球小魚乾、菲菲小花、噹噹戳破的一個點、封封旁邊一封只畫爪印的信封） |
| ③ 交到手上就走 | `pigeon_grandpa_r2` | `bg/event_pigeon_grandpa_r2` | `bg/event_feifei_pigeon_grandpa_r2` | `bg/event_dangdang_pigeon_grandpa_r2` | `bg/event_fengfeng_pigeon_grandpa_r2` | 角色爬下梯子的背影、懷裡一小包小魚乾；上面老貓把信貼到眼鏡前慢慢讀 |

### A3 `pigeon_reply` 風裡的回信（第三關，塔頂夜空）：四隻 × 4＝16
| 劇本 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_pigeon_reply` | `bg/event_feifei_pigeon_reply` | `bg/event_dangdang_pigeon_reply` | `bg/event_fengfeng_pigeon_reply` | 塔頂石台、欄杆、滿月、被風吹斜的布幡；鴿子羽毛亂、沒戴帽子，靠在角色腳邊抱著舊布包裹，角色蹲下去接 |
| ① 收下謝禮 | `pigeon_reply_r0` | `bg/event_pigeon_reply_r0` | `bg/event_feifei_pigeon_reply_r0` | `bg/event_dangdang_pigeon_reply_r0` | `bg/event_fengfeng_pigeon_reply_r0` | 角色捧著半包在舊布裡、透出金光的東西（不畫成特定秘寶），鴿子在旁挺胸 |
| ② 退回謝禮、只留畫 | `pigeon_reply_r1` | `bg/event_pigeon_reply_r1` | `bg/event_feifei_pigeon_reply_r1` | `bg/event_dangdang_pigeon_reply_r1` | `bg/event_fengfeng_pigeon_reply_r1` | 靠欄杆坐著看蠟筆畫、鴿子靠著睡著；畫中畫是小孩畫的：球球紅色大蝴蝶結頭巾、菲菲拿超長的針、噹噹方塊身體＋兩塊銅手臂、封封比身體長的劍（畫中不寫字） |
| ③【回信】拆第二張紙 | `pigeon_reply_r2` | `bg/event_pigeon_reply_r2` | `bg/event_feifei_pigeon_reply_r2` | `bg/event_dangdang_pigeon_reply_r2` | `bg/event_fengfeng_pigeon_reply_r2` | 照小孩的畫擺招式：球球空中轉圈＋金色旋風、菲菲撒針成一片金色星點、噹噹雙臂擋風（鴿子躲在背後）、封封收劍時落葉捲成一圈；地上攤著那張畫 |

## 三、事件鏈 B：影子的真面目（劇本第四節）

### B1 `shadow_loose` 影子不見了（第一關，塔下石牢）：四隻 × 3＝12
| 劇本 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_shadow_loose` | `bg/event_feifei_shadow_loose` | `bg/event_dangdang_shadow_loose` | `bg/event_fengfeng_shadow_loose` | 火把在左、角色腳下地板乾乾淨淨沒有影子；對面牆上是跟角色同輪廓的**平面剪影**（深紫灰；頭巾結／蝴蝶結馬尾／護臂／劍看得出來）在練招；角色愣住指著牆 |
| ① 追上去 | `shadow_loose_r0` | `bg/event_shadow_loose_r0` | `bg/event_feifei_shadow_loose_r0` | `bg/event_dangdang_shadow_loose_r0` | `bg/event_fengfeng_shadow_loose_r0` | 石階上坐著揉痛處（球球額頭、菲菲膝蓋含淚、噹噹膝蓋、封封肩膀），轉角牆上的剪影回頭看 |
| ② 拿火把照回腳下 | `shadow_loose_r1` | `bg/event_shadow_loose_r1` | `bg/event_feifei_shadow_loose_r1` | `bg/event_dangdang_shadow_loose_r1` | `bg/event_fengfeng_shadow_loose_r1` | 角色舉著從牆上拿下的火把（空的鐵架留在牆上），腳下拖出一片正常的影子，擺出招式、表情「原來如此」 |
| ③ 不管它 | 不配 | | | | | |

### B2 `shadow_study` 偷練的影子（第二關，塔中練功房）：四隻 × 2＝8
| 劇本 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_shadow_study` | `bg/event_feifei_shadow_study` | `bg/event_dangdang_shadow_study` | `bg/event_fengfeng_shadow_study` | 前景紙拉門、角色在門外偷看；門內站起來的影子（深紫灰實體、兩點淡紫眼，比影子魔物溫和）對著木樁人（照 `wood_dummy`）練招：球球爪痕、菲菲針釘在同一點、噹噹護臂頂住、封封劍尖停在木樁前 |
| ① 推門打一場 | 不配（進戰鬥） | | | | | |
| ② 躲在門外看完 | `shadow_study_r1` | `bg/event_shadow_study_r1` | `bg/event_feifei_shadow_study_r1` | `bg/event_dangdang_shadow_study_r1` | `bg/event_fengfeng_shadow_study_r1` | 天將亮、紙門半開，影子從窗口離開的背影；角色在門邊學著比同一個招式 |

注意 ②的結果圖是 `_r1` 不是 `_r0`。
**新9（單人球球第二集換成屋頂那篇 `ninja_roof_shadow`）**：做了之後球球不會遇到這篇、這篇又只在單人排，所以球球版兩張實際上不會被看到。仍照畫一套：`EventDef.art`／`eventArtKey` 的底鍵就是 `bg/event_shadow_study`，而且萬一新9 沒做或被拿掉，球球照樣有自己的圖。屋頂那篇的圖是第一批 art1 做的，這一批沒動。

### B3 `shadow_truth` 影子的真面目（第三關，塔頂夜空）：四隻 × 3＝12
| 劇本 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_shadow_truth` | `bg/event_feifei_shadow_truth` | `bg/event_dangdang_shadow_truth` | `bg/event_fengfeng_shadow_truth` | 大月亮、通往上層的石階籠在不透明紫霧裡；影子（實體、淡紫眼）站在石階上抱著師父的舊木劍；角色在下方石台仰頭 |
| ① 攔下它打一場 | 不配（進戰鬥） | | | | | |
| ② 跟它要木劍 | `shadow_truth_r1` | `bg/event_shadow_truth_r1` | `bg/event_feifei_shadow_truth_r1` | `bg/event_dangdang_shadow_truth_r1` | `bg/event_fengfeng_shadow_truth_r1` | 影子已經不在，角色雙手捧著木劍低頭、平靜又有點鼻酸（球球、噹噹眼角一滴淚），腳下是淡淡的正常影子 |
| ③【看過它練】陪它練完 | `shadow_truth_r2` | `bg/event_shadow_truth_r2` | `bg/event_feifei_shadow_truth_r2` | `bg/event_dangdang_shadow_truth_r2` | `bg/event_fengfeng_shadow_truth_r2` | 影子抱著木劍走上石階的背影、半截沒進紫霧；角色在下方維持收勢、抬頭目送 |

**木劍四份（六張）是同一把**：先生一張設計圖定稿（`_ref/design_wood_sword.png`），每張都附它——淺褐木色、劍柄纏褪色藍布、劍尾紅繩、劍身中段一片銅片兩顆釘、劍尖纏白布。
第二批圖示 `codex/relic_master_wood_sword`（art2 做的，並排看過）畫的是淺木＋藏青布握把＋紅繩、劍身較寬，**沒有銅片與白布**；事件圖照劇本多了那兩個細節，兩者整體看得出是同一把，但不是逐項一致。要完全一致的話是圖示那邊補（圖示只有 32～42 像素，銅片和白布幾乎看不到，我判斷不必）。

## 四、連線限定三篇（劇本第六節）：純場景、圖裡不畫主角

| 篇 | 劇本 | `resultArt` | 鍵 | 檔 | 畫面 |
|---|---|---|---|---|---|
| `coop_rope_bridge` 只撐得住一個人的橋（第一關） | 主圖 | — | `bg/event_coop_rope_bridge` | `event_coop_rope_bridge.webp` | 深溝上的爛木板吊橋、對岸刻魔物臉的寶箱、橋頭木樁綁繩子、木樁上刻一個貓腳印（不寫字） |
| | ① 座位 0 拿 | `coop_rope_bridge_r0` | `bg/event_coop_rope_bridge_r0` | `event_coop_rope_bridge_r0.webp` | 寶箱開著空了、繩子繃直磨出毛邊、木樁旁兩道爪子拖痕 |
| | ② 座位 1 拿 | `coop_rope_bridge_r1` | `bg/event_coop_rope_bridge_r1` | **同 `event_coop_rope_bridge_r0.webp`** | （同一個場面） |
| | ③ 一起拆橋板 | `coop_rope_bridge_r2` | `bg/event_coop_rope_bridge_r2` | `event_coop_rope_bridge_r2.webp` | 吊橋完整、只少橋頭兩塊板；樓梯口的舊貨攤靠著兩塊木板 |
| `coop_seesaw` 翹翹板升降台（第二關） | 主圖 | — | `bg/event_coop_seesaw` | `event_coop_seesaw.webp` | 齒輪轉軸上的大木翹翹板，一頭翹到木架旁（架上一個布包、一個小木盒），一頭貼地、地板刻貓腳印 |
| | ① | `coop_seesaw_r0` | `bg/event_coop_seesaw_r0` | `event_coop_seesaw_r0.webp` | 一高一低、上方木架空了、低的那頭旁邊一個打開的小魚乾袋 |
| | ② | `coop_seesaw_r1` | `bg/event_coop_seesaw_r1` | **同 `event_coop_seesaw_r0.webp`** | （同一個場面） |
| | ③ 一起玩 | `coop_seesaw_r2` | `bg/event_coop_seesaw_r2` | `event_coop_seesaw_r2.webp` | 翹翹板停在水平、兩邊座位磨亮、兩個被坐扁的軟墊、一條毛巾 |
| `coop_shooting_star` 只許一個願（第三關） | 主圖 | — | `bg/event_coop_shooting_star` | `event_coop_shooting_star.webp` | 塔頂石台、有一深一淺兩個凹爪印的許願石（側面刻兩個小爪印符號、不寫字），金色流星劃過來 |
| | ① | `coop_shooting_star_r0` | `bg/event_coop_shooting_star_r0` | `event_coop_shooting_star_r0.webp` | 只有一個爪印在發光、流星已經劃到遠方 |
| | ② | `coop_shooting_star_r1` | `bg/event_coop_shooting_star_r1` | **同 `event_coop_shooting_star_r0.webp`** | （同一個場面） |
| | ③ 一起按 | `coop_shooting_star_r2` | `bg/event_coop_shooting_star_r2` | `event_coop_shooting_star_r2.webp` | 兩個爪印一樣亮、流星尾巴分成兩道 |

**兩鍵同檔**：主控裁決 5 說「測試不允許就複製」。我查過並實測：`tools/event_result_art.test.ts` 只查「鍵在清單、檔案存在」，沒有「一個檔只能一個鍵」的規矩；登記後跑全套（加上模擬接線）沒有任何一條因此變紅。所以沒複製，`register` 直接把 `_r1` 指到 `_r0` 的檔。`vite-asset-hash` 照檔名改名、清單兩個鍵會指到同一個帶雜湊的網址，下載一次。

## 五、接線時要做的事（照順序）

1. **事件接進 `events.ts`（含 `resultArt`、選項順序照上表）與登記清單放在同一筆提交**：`python tools/gen_content_batch2_events_a.py register`。
   - 為什麼要同一筆：只登記不接線，`tools/manifest_hygiene.test.ts`「事件插圖沒有沒人用的孤兒」會把 88 個鍵全部當孤兒而紅（實測）；而且主圖要靠 `bgacts.ts` 的 `eventMainKeys()`（照 `events.ts` 列）才會離開首載——沒接線就登記，**9 張底圖（球球版 6 張主圖＋連線 3 張主圖，共 349 KB）會算成每個人的首載**（實測 `docs/分關載入.json` 只收進另外 76 個檔）。接線之後這 9 張照地圖現抓、結果圖點到才載、角色版照 `heroOfKey` 選角後補，首載 +0。
   - 所以這一批**沒有**加「程式接線前暫放」名單：沒登記就不會被當孤兒（孤兒檢查只看清單裡的鍵），現在全綠。
2. **已經先處理好的**：`tools/feifei_stills.test.ts`、`tools/dangdang_stills.test.ts` 的「退回球球的事件圖只准變少」已經把 `bg/event_coop_` 當成不算缺口（純場景、四隻看同一張）。不改的話登記後兩條各多 12 張缺口而紅（實測）。這是永久規則。
3. 實測（登記＋把 9 篇暫時塞進孤兒檢查的名單模擬接線，沒提交）：`manifest_hygiene`、`feifei_stills`、`dangdang_stills` 18 條全綠；只登記不模擬接線跑全套：2750 條只紅孤兒那 1 條。
4. `eventArtCast` 不用改（見第一段）。
5. 影子鏈 B2 的新9：見第三段 B2 的說明，圖這邊不用多做。

## 六、實測數字（2026-09-23，分支 HEAD `dfc20dd6`）

| 項目 | 數字 |
|---|---|
| 圖 | 85 張、共 3.40 MB（平均 41 KB，29～60 KB；第一批 36 張平均 42 KB） |
| 清單鍵 | 88 個（85＋連線 `_r1` 三個共用鍵） |
| 首載（現在沒登記） | `npm run build && python tools/check_size.py`：圖片 9.04／10.60 MB（85.2%）、首載總計 9.71／11.30 MB（85.9%），大小 OK；新圖都在「未引用圖」那一欄 |
| 登記＋接線後 | 首載 +0（主圖照地圖現抓、結果圖點到才載、角色版選角後補） |
| 只登記沒接線（不要這樣做） | 首載 +349 KB（9 張底圖），孤兒檢查紅 |
