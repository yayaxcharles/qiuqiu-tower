# 內容擴充第二批事件圖 B 組：鍵名與檔名對照（給程式代理接線用）

美術代理 art4，2026-09-23。分支 `c0923-art4`（worktree `F:\ClaudeWork\qq-art4`，從 `c0923-int` `3448f06e` 開出）。
範圍＝劇本 `design2_事件劇本.md` **第五節**（關卡限定 9 篇）＋**第七節**（條件選項 8 條，只有新選項的結果圖）。第三、四、六節是 art3 的，不在這裡。

**共 156 張，檔案都已照最終檔名放進 `public/assets/bg/`，全部「只放檔、沒登記素材清單」**（派工單：程式接線時一次登記）。
- 規格：560×420、RGBA 透明底、WebP quality 80（同第一批事件圖）。
- 生圖工具 `tools/gen_content_batch2_events_b.py`：`keys` 印得出同一份鍵名清單；`register` 一次登記（見第三段）。
- 選定紀錄 `tools/motion-art-source/c2eb/picks.json`（每張的鍵、檔名、所屬事件 `event`、畫面 `stem`、角色 `hero`、位元組、雜湊）。

## 一、命名規則（跟第一批完全一樣）
- 主圖：球球版 `bg/event_<代號>`，菲菲／噹噹／封封版 `bg/event_<角色>_<代號>`（`eventArtKey(id, hero)`）。
- 結果圖：選項的 `resultArt` 寫 `'<事件代號>_r<選項序號>'`（0 起算，`tools/event_result_art.test.ts` 逼這個格式），四隻各自那張由 `eventArtKey` 找到。
- **程式寫 `choices` 的順序要跟下表一樣**，不然結果圖錯位。「無效果」與「進戰鬥」的選項不配圖（`shouldHaveArt`）。
- `data-art-cast`：每一篇四隻都齊、每一張只畫那一隻主角 → 現有規則（有菲菲版＝球球版推 `['ninja']`）直接成立，不用改。
- 條件選項：新選項**加在 `choices` 最後**，新索引＝既有選項數（我對過 `events.ts`：守衛 2、三花貓 3、白貓 2、重門 2、商人 3、影子 2、小黑貓 2、廚房 3，跟劇本第七節表一致）。既有事件的圖一張都沒動（`git diff --name-status` 只有新增）。

## 二、每一張的鍵名
### 牢裡的山賊 `cell_bandit`（第五節 L1（塔下石牢，`acts:[1]`））
| 選項 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_cell_bandit` | `bg/event_feifei_cell_bandit` | `bg/event_dangdang_cell_bandit` | `bg/event_fengfeng_cell_bandit` | 鐵欄牢房、火把；灰黑虎斑山賊（臉上貼布、脖子掛斷鐵鏈）隔欄杆遞皺紙；牆上爪刻地圖（線＋叉）；角色站欄外 |
| ①撬開鎖放牠出來 | `cell_bandit_r0` | `bg/event_cell_bandit_r0` | `bg/event_feifei_cell_bandit_r0` | `bg/event_dangdang_cell_bandit_r0` | `bg/event_fengfeng_cell_bandit_r0` | 牢門開著、山賊笑著拍肩；角色低頭看手上的紙，紙上只有一個紅貓爪印 |
| ②挖出藏貨，不放牠 | `cell_bandit_r1` | `bg/event_cell_bandit_r1` | `bg/event_feifei_cell_bandit_r1` | `bg/event_dangdang_cell_bandit_r1` | `bg/event_fengfeng_cell_bandit_r1` | 角色揹魚乾袋從撬開的地磚旁站起；牢裡山賊抓欄杆張大嘴 |
| ③不理牠 | 不配 | | | | | 無效果，不配圖 |

### 老鼠開的澡堂 `rat_bathhouse`（第五節 L2（塔下石牢））
| 選項 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_rat_bathhouse` | `bg/event_feifei_rat_bathhouse` | `bg/event_dangdang_rat_bathhouse` | `bg/event_fengfeng_rat_bathhouse` | 地窖澡堂：石牆、冒奶白蒸氣的木桶、櫃台、行李架；老鼠掌櫃穿圍裙瞇眼搓手；門口木牌只畫熱氣記號 |
| ①付 20 條好好泡一場 | `rat_bathhouse_r0` | `bg/event_rat_bathhouse_r0` | `bg/event_feifei_rat_bathhouse_r0` | `bg/event_dangdang_rat_bathhouse_r0` | `bg/event_fengfeng_rat_bathhouse_r0` | 角色泡木桶、頭頂小毛巾；前景小老鼠翻行囊捏走一個小瓶子 |
| ②抱著行囊蹲門邊 | `rat_bathhouse_r1` | `bg/event_rat_bathhouse_r1` | `bg/event_feifei_rat_bathhouse_r1` | `bg/event_dangdang_rat_bathhouse_r1` | `bg/event_fengfeng_rat_bathhouse_r1` | 角色抱行囊坐門邊被蒸氣吹得瞇眼、掌櫃瞪著（噹噹版：他在扶正門上的木牌） |
| ③假裝去泡、盯櫃台 | 不配 | | | | | 進戰鬥，不配圖 |

### 地窖裡的冬眠熊 `bear_cellar`（第五節 L3（塔下石牢））
| 選項 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_bear_cellar` | `bg/event_feifei_bear_cellar` | `bg/event_dangdang_bear_cellar` | `bg/event_fengfeng_bear_cellar` | 地窖：石牆、罐子架、稻草堆；冬眠熊（照 `hibernating_bear`，條紋睡帽圍巾）抱發光布包、被子滑一半；角色躡手躡腳 |
| ①抽出布包 | `bear_cellar_r0` | `bg/event_bear_cellar_r0` | `bg/event_feifei_bear_cellar_r0` | `bg/event_dangdang_bear_cellar_r0` | `bg/event_fengfeng_bear_cellar_r0` | 熊翻身把角色壓在肚子底下，只露頭和抱著布包的手 |
| ②替牠蓋好被子 | `bear_cellar_r1` | `bg/event_bear_cellar_r1` | `bg/event_feifei_bear_cellar_r1` | `bg/event_dangdang_bear_cellar_r1` | `bg/event_fengfeng_bear_cellar_r1` | 熊抱著角色睡、被子蓋好、另一手推出小罐子（噹噹版無奈睜眼） |
| ③搖醒牠 | 不配 | | | | | 進戰鬥，不配圖 |

### 書庫的梯子 `library_ladder`（第五節 M1（塔中木造，`acts:[2]`））
| 選項 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_library_ladder` | `bg/event_feifei_library_ladder` | `bg/event_dangdang_library_ladder` | `bg/event_fengfeng_library_ladder` | 木書架、滑軌梯子、紙燈籠；戴圓眼鏡的老貓管理員打瞌睡、櫃台小錢箱；最高層書背上大貓掌印；角色仰頭 |
| ①推著梯子爬到最高層 | `library_ladder_r0` | `bg/event_library_ladder_r0` | `bg/event_feifei_library_ladder_r0` | `bg/event_dangdang_library_ladder_r0` | `bg/event_fengfeng_library_ladder_r0` | 角色掛在飛馳的梯子上、一手抱三本書、速度線 |
| ②付押金讀完 | `library_ladder_r1` | `bg/event_library_ladder_r1` | `bg/event_feifei_library_ladder_r1` | `bg/event_dangdang_library_ladder_r1` | `bg/event_fengfeng_library_ladder_r1` | 角色趴在書上睡著、書頁一灘口水；管理員瞪著 |
| ③在書架中間睡一覺 | `library_ladder_r2` | `bg/event_library_ladder_r2` | `bg/event_feifei_library_ladder_r2` | `bg/event_dangdang_library_ladder_r2` | `bg/event_fengfeng_library_ladder_r2` | 角色在兩排書架間蓋薄毯睡（菲菲版旁邊一杯水） |

### 送上樓的便當 `tower_kitchen`（第五節 M2（塔中木造））
| 選項 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_tower_kitchen` | `bg/event_feifei_tower_kitchen` | `bg/event_dangdang_tower_kitchen` | `bg/event_fengfeng_tower_kitchen` | 木造廚房、灶台蒸氣、便當架（盒蓋只畫向上箭頭）；五隻繫小圍裙的小飯糰怪僵住；角色在門口 |
| ①當場吃一個 | `tower_kitchen_r0` | `bg/event_tower_kitchen_r0` | `bg/event_feifei_tower_kitchen_r0` | `bg/event_dangdang_tower_kitchen_r0` | `bg/event_fengfeng_tower_kitchen_r0` | 角色坐灶邊捧便當大口吃、飯糰怪圍觀 |
| ②包一個帶走 | `tower_kitchen_r1` | `bg/event_tower_kitchen_r1` | `bg/event_feifei_tower_kitchen_r1` | `bg/event_dangdang_tower_kitchen_r1` | `bg/event_fengfeng_tower_kitchen_r1` | 角色背上一個布包便當、飯糰怪排成一排鞠躬 |
| ③幫牠們包便當 | `tower_kitchen_r2` | `bg/event_tower_kitchen_r2` | `bg/event_feifei_tower_kitchen_r2` | `bg/event_dangdang_tower_kitchen_r2` | `bg/event_fengfeng_tower_kitchen_r2` | 角色一起捏飯糰排便當（球球的飯糰有貓耳、噹噹身後的架子修好了） |

### 木人巷 `wooden_men_alley`（第五節 M3（塔中木造））
| 選項 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_wooden_men_alley` | `bg/event_feifei_wooden_men_alley` | `bg/event_dangdang_wooden_men_alley` | `bg/event_fengfeng_wooden_men_alley` | 木造長廊、兩排木人（照 `wood_dummy`，關節齒輪）、紙燈籠、地上刻腳印、牆上木板；木人手臂揮到角色鼻尖前 |
| ①一口氣走過 | `wooden_men_alley_r0` | `bg/event_wooden_men_alley_r0` | `bg/event_feifei_wooden_men_alley_r0` | `bg/event_dangdang_wooden_men_alley_r0` | `bg/event_fengfeng_wooden_men_alley_r0` | 巷尾最後一個木人的手停在鼻尖前、頭頂彈出貓掌小旗；角色頭上腫包／瘀青（噹噹版馬步沒退） |
| ②鑽機關底下撿零件 | `wooden_men_alley_r1` | `bg/event_wooden_men_alley_r1` | `bg/event_feifei_wooden_men_alley_r1` | `bg/event_dangdang_wooden_men_alley_r1` | `bg/event_fengfeng_wooden_men_alley_r1` | 角色從機關底下鑽出、抱齒輪零件和暗器、臉上沾機油 |
| ③關總開關 | 不配 | | | | | 進戰鬥，不配圖 |

### 掉下來的星星 `fallen_star`（第五節 T1（塔頂夜空，`acts:[3]`））
| 選項 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_fallen_star` | `bg/event_feifei_fallen_star` | `bg/event_dangdang_fallen_star` | `bg/event_fengfeng_fallen_star` | 夜空石台、缺一角的星座、發光星形石頭冒熱氣、燒出小坑、倒下的銅星象儀；角色蹲著看 |
| ①撿起來帶走 | `fallen_star_r0` | `bg/event_fallen_star_r0` | `bg/event_feifei_fallen_star_r0` | `bg/event_dangdang_fallen_star_r0` | `bg/event_fengfeng_fallen_star_r0` | 角色捧著包布的星星燙得表情扭曲 |
| ②澆涼刮星屑 | `fallen_star_r1` | `bg/event_fallen_star_r1` | `bg/event_feifei_fallen_star_r1` | `bg/event_dangdang_fallen_star_r1` | `bg/event_fengfeng_fallen_star_r1` | 星星冒白煙變灰金、角色用爪尖／針／銼刀（抹護臂）／劍尖刮亮粉，帶一道金光 |
| ③丟回天上 | `fallen_star_r2` | `bg/event_fallen_star_r2` | `bg/event_feifei_fallen_star_r2` | `bg/event_dangdang_fallen_star_r2` | `bg/event_fengfeng_fallen_star_r2` | 投擲收勢抬頭、星座補齊那顆最亮、暖光束灑下（噹噹版星象儀已扶正） |

### 風鈴長廊 `wind_chimes`（第五節 T2（塔頂夜空））
| 選項 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_wind_chimes` | `bg/event_feifei_wind_chimes` | `bg/event_dangdang_wind_chimes` | `bg/event_fengfeng_wind_chimes` | 屋簷下木造長廊掛滿風鈴（照秘寶「風鈴」圖示：小鈴＋白紙條）被風吹斜；盡頭一個啞的、鈴舌掉在地上；角色捂耳 |
| ①閉眼聽完一整套 | `wind_chimes_r0` | `bg/event_wind_chimes_r0` | `bg/event_feifei_wind_chimes_r0` | `bg/event_dangdang_wind_chimes_r0` | `bg/event_fengfeng_wind_chimes_r0` | 角色盤坐閉眼、神情平靜（封封劍橫在膝上） |
| ②跟著鈴聲練步法 | `wind_chimes_r1` | `bg/event_wind_chimes_r1` | `bg/event_feifei_wind_chimes_r1` | `bg/event_dangdang_wind_chimes_r1` | `bg/event_fengfeng_wind_chimes_r1` | 角色頂風擺步法 |
| ③修好啞掉的風鈴帶走 | `wind_chimes_r2` | `bg/event_wind_chimes_r2` | `bg/event_feifei_wind_chimes_r2` | `bg/event_dangdang_wind_chimes_r2` | `bg/event_fengfeng_wind_chimes_r2` | 角色手上提一個藍色小風鈴、身後整排風鈴靜止下垂 |

### 魔氣結晶 `miasma_crystal`（第五節 T3（塔頂夜空））
| 選項 | `resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|
| 主圖 | — | `bg/event_miasma_crystal` | `bg/event_feifei_miasma_crystal` | `bg/event_dangdang_miasma_crystal` | `bg/event_fengfeng_miasma_crystal` | 夜空石台、裂縫裡紫色尖晶（照秘寶「魔氣殘片」圖示）、四周紫霜、遠處塔頂紫霧；角色蹲著手停半空（封封照文字握劍柄不伸手） |
| ①收進懷裡 | `miasma_crystal_r0` | `bg/event_miasma_crystal_r0` | `bg/event_feifei_miasma_crystal_r0` | `bg/event_dangdang_miasma_crystal_r0` | `bg/event_fengfeng_miasma_crystal_r0` | 腳邊積水倒影的眼睛是紫的，本體眼睛照原色（球球黑、菲菲藍、噹噹與封封琥珀） |
| ②一擊敲碎 | `miasma_crystal_r1` | `bg/event_miasma_crystal_r1` | `bg/event_feifei_miasma_crystal_r1` | `bg/event_dangdang_miasma_crystal_r1` | `bg/event_fengfeng_miasma_crystal_r1` | 結晶碎成紫砂、冷風弧線把角色掀倒坐地 |
| ③包起來丟下塔 | 不配 | | | | | 無效果，不配圖 |

### 條件選項 8 條（第七節）：只有新選項的結果圖，四隻各一張
| 既有事件 | 新選項（條件標籤） | 新索引／`resultArt` | 球球 | 菲菲 | 噹噹 | 封封 | 畫面 |
|---|---|---|---|---|---|---|---|
| 睡著的守衛 `sleeping_guard` | 七-1【隱身】藏在影子裡摸走錢袋 | 2／`sleeping_guard_r2` | `bg/event_sleeping_guard_r2` | `bg/event_feifei_sleeping_guard_r2` | `bg/event_dangdang_sleeping_guard_r2` | `bg/event_fengfeng_sleeping_guard_r2` | 牆角暗影裡只露眼睛與一隻爪，爪子勾著大橘貓腰間錢袋；大橘貓打呼、鼻涕泡 |
| 賣藥的三花貓 `medicine_cat` | 七-2【毒】讓她拿你的毒試新解藥 | 3／`medicine_cat_r3` | `bg/event_medicine_cat_r3` | `bg/event_feifei_medicine_cat_r3` | `bg/event_dangdang_medicine_cat_r3` | `bg/event_fengfeng_medicine_cat_r3` | 角色坐攤前伸手讓三花貓餵解藥、青臉冷汗；三花貓一手藥匙、一手小本子 |
| 硬要切磋的白貓 `sparring_cat` | 七-3【反彈】站著不動，讓他撞 | 2／`sparring_cat_r2` | `bg/event_sparring_cat_r2` | `bg/event_feifei_sparring_cat_r2` | `bg/event_dangdang_sparring_cat_r2` | `bg/event_fengfeng_sparring_cat_r2` | 白貓被彈飛坐地、頭上繞金星；角色站穩（球球抱胸、菲菲閉眼發抖、噹噹馬步護臂、封封劍鞘擋身前）；黑衣師弟笑彎腰 |
| 很重的門 `heavy_door` | 七-4【蓄氣】一擊劈斷門閂 | 2／`heavy_door_r2` | `bg/event_heavy_door_r2` | `bg/event_feifei_heavy_door_r2` | `bg/event_dangdang_heavy_door_r2` | `bg/event_fengfeng_heavy_door_r2` | 石門半開、斷成兩截的門閂在地上；角色收勢（爪擊、射針、推掌、收劍）；門內寶箱發光 |
| 很貪心的商人 `greedy_merchant` | 七-5【小魚乾 150】整包買下 | 3／`greedy_merchant_r3` | `bg/event_greedy_merchant_r3` | `bg/event_feifei_greedy_merchant_r3` | `bg/event_dangdang_greedy_merchant_r3` | `bg/event_fengfeng_greedy_merchant_r3` | 灰貓商人捧一大堆小魚乾一臉不敢置信；角色抱大布包（秘寶、忍具露出），布包角夾著商人的眼鏡 |
| 師父的影子 `old_master_ghost` | 七-6【師門】把斗笠戴到影子頭上 | 2／`old_master_ghost_r2` | `bg/event_old_master_ghost_r2` | `bg/event_feifei_old_master_ghost_r2` | `bg/event_dangdang_old_master_ghost_r2` | `bg/event_fengfeng_old_master_ghost_r2` | 影子戴上真的草斗笠（照秘寶「師父的斗笠」圖示）、臉像大俠貓；手按球球頭／扶菲菲拿針的手／腳尖點噹噹腳跟／兩指比劍示範給封封 |
| 迷路的小黑貓 `lost_kitten` | 七-7【鈴鐺】把鈴鐺繫在牠的頭巾上 | 2／`lost_kitten_r2` | `bg/event_lost_kitten_r2` | `bg/event_feifei_lost_kitten_r2` | `bg/event_dangdang_lost_kitten_r2` | `bg/event_fengfeng_lost_kitten_r2` | 小黑貓頭巾上繫金鈴（照秘寶「鈴鐺」圖示）笑著搖頭；一群小黑貓撲上來抱角色；角色手上一個忍具 |
| 很吵的廚房 `noisy_kitchen` | 七-8【忍具滿了】留一個換一碗加料的 | 3／`noisy_kitchen_r3` | `bg/event_noisy_kitchen_r3` | `bg/event_feifei_noisy_kitchen_r3` | `bg/event_dangdang_noisy_kitchen_r3` | `bg/event_fengfeng_noisy_kitchen_r3` | 角色捧碗吃得很滿足、碗裡一大塊肉；旁邊備用品盒裡一個忍具、一張只畫貓爪的小紙條 |

## 三、接線時要做的事
1. **登記**：`python tools/gen_content_batch2_events_b.py register`（不給名字＝156 張全部；可以只給幾個檔名分批登記；`--dry-run` 先看筆數）。寫法同第一批：清單兩格縮排、只加新行（實測 diff 157 加 1 減，減的那一行是原本最後一筆補逗號）。
2. **登記要跟 `events.ts` 接線同一筆提交**：我實測過「先登記、事件還沒接」→ `tools/manifest_hygiene.test.ts`「事件插圖沒有沒人用的孤兒」會紅（156 張全被當孤兒）。事件與條件選項一接好、`resultArt` 照上表寫，這條就綠，不需要暫放名單。
3. **首載**（2026-09-23 實測，登記後跑 `dump_monster_acts` 重生 `docs/分關載入.json` 再 `npm run build && python tools/check_size.py`）：
   - 156 張裡 147 張被算成延後（值 0：結果圖與三隻他版）。
   - **沒被算延後的是 9 張球球版主圖**（`bg/event_<代號>`，共 420.8 KB）：因為事件還沒進 `events.ts`，執行期規則不知道它們屬於哪一關。圖片 9.04 → 9.46 MB、首載總計 9.71 → 10.13 MB，都還在預算內（10.60／11.30）。事件照劇本寫 `acts` 接好、`dump_monster_acts` 重生之後，這 9 張應該照「事件主圖照地圖現抓」的規則離開首載——**接線後請再跑一次 `check_size.py` 確認**。
   - 沒登記的現在：這 156 張在打包後落在「未引用圖」，不算首載（圖片 9.04 MB、首載總計 9.71 MB，跟開分支前一樣）。
4. 條件選項的三張秘寶參考：風鈴長廊③畫的是秘寶「風鈴」`codex/relic_wind_chime` 的樣子；師父的影子新結果圖的斗笠照 `codex/relic_master_hat`；小黑貓新結果圖的鈴鐺照 `codex/relic_bell`；魔氣結晶的晶石照 art2 做的 `codex/relic_demon_shard`（劇本寫的代號是 `miasma_shard`，art2 取成 `demon_shard`，兩邊名字要主控對一下，圖是同一顆）。
