# -*- coding: utf-8 -*-
"""生圖提示詞的共用硬規則。

2026-09-04 做姆斯（已廢棄的第二角色）那晚，十幾次失敗換來的。物種無關，做任何角色的
立繪與牌面都適用——把 gear_rule()／STYLE／FOES 串進提示詞即可。

★ 最重要的教訓：規則寫得越死，越要把所有姿勢掃一遍問「有沒有哪個做不到這條」。
  一晚踩四次——格擋（「躲在舉起的殼後面」撞上「殼長在背上」，殼跑到頭上當帽子）、
  縮殼（「眼睛從前開口露出」撞上「殼只從背後看到」，生成直接失敗）、
  挨打（「眼睛用力閉緊」撞上「大圓瞳孔加高光」，失敗）、
  縮殼第二次（通用取景「全身朝右腳貼底邊」撞上「整隻在殼裡沒有腳」，又失敗兩次）。
  做不到的要嘛給規則加例外、要嘛改姿勢敘述、要嘛給那個姿勢自己的取景（FRAMING 字典）。
  2026-09-05 武士球球又踩第五次：勝利姿勢「拳頭高舉」連掛兩次——舉高的手臂加上很高的
  金鍬形兜，跟取景要求的「全身入鏡＋腳貼底邊＋填滿畫面」擠不下。改成「手舉在頭側」就過。
  **辨識訊號：同一張連續失敗兩次以上（不是偶發的 60 秒快速失敗），就是打架，不是運氣。**

★ 第二個雷：參考圖會被讀成「要畫這個」，不只是「照這個畫風」。拿隊友的立繪當比例基準，
  三張序章圖全被塞進一隻隊友；拿掉之後模型改成複製第二隻主角。要明寫「畫面裡只有一個角色」。

★ 第四個雷（2026-09-12 做菲菲時踩的）：**參考圖會被讀走的不只是長相，還有角度。**
  菲菲的參考圖左半放了一張正面站姿，結果 `idle` 連生兩次都畫成正面、頭還轉向左——
  提示詞裡 "FACING RIGHT" 寫了兩次、還加寫「鼻子與視線指向右邊緣」，全部輸給那張圖。
  改成兩半都用朝右的三分之三側面之後一次就過。
  **做法：參考圖裡不要放任何一張跟目標朝向不同的圖**，而且提示詞要明講
  「連角度也要跟參考圖一樣」——只說「角色設計一樣」模型只會抄長相。
  辨識訊號：同一張連兩次都是同一種錯（不是隨機的錯），八成是參考圖在教它，不是提示詞不夠重。

★ 第五個雷（2026-09-12 給菲菲加馬尾時踩的）：**「加一個配件」要講的是它在畫面上佔哪個位置，
  不是它叫什麼名字。** 第一輪寫「在頭頂後方紮一條短馬尾」，生出來確實有一撮頭髮在後腦，
  但正面完全看不到——使用者的原話：「頭髮沒有涵蓋前面，而且都太後面了看不太出來」。
  同一個詞（馬尾）在模型腦裡可以是「只有後面那一撮」，也可以是「瀏海＋紮起來＋尾巴」。
  **改法：拆成看得到的幾塊各講一次**，並且點名「這一塊在臉的前面，從這個角度看得到；
  沒有它整撮頭髮等於不存在」。配件是為了剪影才加的，看不到就沒有意義。

★ 第六個雷（同一天，同一隻）：**「跟另一個角色分開」的敘述會一路漂移，要配一句「但不可以變成什麼」。**
  菲菲的提示詞為了跟球球（圓胖灰虎斑）區隔，寫了「明顯比他瘦長、耳朵更高」。
  一開始還好，但後續批次把「頭跟身體差不多大、四肢短短的、沒有脖子」那句漏掉之後，
  只剩「瘦長」這個方向，就一路瘦下去——使用者的原話：「原本比較小隻可愛，你變得比較成人」。
  **改法：區隔只寫「哪一個特徵不同」（窄鼻樑、大尖耳），比例那幾句每一批都要完整重貼，
  而且要寫反向護欄（「畫得像成貓就是錯的」）。** 只給方向不給邊界，二十張之後一定跑掉。

★ 第七個雷（2026-09-13，使用者玩到才發現）：**規則只寫「要有什麼」，沒寫「不可以變成什麼」。**
菲菲的頭髮規則把瀏海、蝴蝶結、馬尾三部分都描述清楚了，但整整十幾張圖還是塌成
「一頂咖啡色的鍋蓋、馬尾看不見、蝴蝶結縮到針孔大」——因為模型照著「頭上有一撮深棕色毛髮」
畫出來的最省力解，就是把整顆頭塗成棕色。**描述性的規則會被最省力的解法繞過去，
一定要配一段「這樣畫就是錯的」**（同一個道理第六個雷已經講過一次，換個地方又踩）。
現在補了四條：不可以是鍋蓋頭／不可以是一坨看不出三部分的棕色／蝴蝶結要有兩個環且跟耳朵一樣寬／
不可以是披肩長髮。另外馬尾要求「跟頭的輪廓之間看得到背景」——那是最好檢查的一條。

★ 第八個雷（2026-09-13 總覽稽核）：**一張一張看不會發現，要把整批拼成一張大圖才看得出來。**
她的 210 張圖全部拼成分批的大圖之後，只有 5 張壞掉——但那 5 張是**新的兩種壞法**，
兩種都是既有規則沒有反面的地方：
  1. **變成獸耳人**（`card_feifei_xuli`、`event_feifei_toll_again_paid`）：暹羅貓的深棕面罩不見了，
     臉變成一張人類女孩的臉再插兩隻貓耳。規則只說「臉上有深棕色面罩」，沒說「不可以是人臉」。
  2. **膨脹成球**（`event_feifei_signal_r1`）：規則寫「矮短圓、小肥貓」，模型就一路胖下去——
     跟第六個雷寫的「比球球瘦會一路瘦下去」是同一件事，只是方向相反，這次是自己的形容詞害的。
兩條反向護欄都補進 `FEIFEI_BODY` 與 `FEIFEI_PROPORTION` 了。
**流程上的教訓：每一批生完要做總覽拼圖，不要等使用者玩到。**拼圖腳本一次看 20～30 張，
標上檔名，壞的一眼就跳出來；同時也抓到 3 個沒人引用的比稿中途檔混進 `manifest.json`
（`tools/manifest_hygiene.test.ts` 現在擋著）。

★ 第九個雷（2026-09-13 同一天，稽核代理抓的）：**自檢只 print 不中止＝等於沒有自檢。**
`make_feifei_event_jobs.py` 的自檢從一開始就在喊「有 61 張提到球球卻沒被轉到」，
喊了好幾天沒人處理——因為那行印在一長串輸出的中間，而且**喊的理由是錯的**
（說「NINJA_BLOCK 少認一種格式」，真相是結果圖那類根本沒有外觀敘述、不歸那支管）。
使用者玩到「迷路的小黑貓」選完看見球球，才知道整整 60 張沒轉。
三條連帶的規矩：
  1. 自檢要嘛 `SystemExit`，要嘛就別寫——留一條「永遠紅的檢查」比沒有檢查更糟，
     因為下一個人會學會忽略它。
  2. 自檢的**訊息要說對原因**。說錯原因會把人帶去修錯的地方。
  3. **重生前一定要先把舊稿改名留底**：`codex_gen.py` 看到輸出檔已存在就跳過，
     所以「重生 5 張走鐘圖」那一批原本會整批空轉，而且印的是
     「結束：完成 0、失敗 0、已存在跳過 5」、離開碼 0——看起來像成功。

★ 第十個雷（2026-09-13，同一晚第三次）：**Python 的 `print()` 餵給 Git Bash 的殼，
每個項目屁股都會多一個 `\r`。** Windows 上 `print()` 寫的是 `\r\n`，
而殼的命令替換 `$(...)` 只吃掉**最後**的換行，`\r` 留著。於是
`for f in $files` 拿到的每個檔名都是 `xxx.png\r`，`add_event_art.py` 的
`name.endswith(".png")` 全部不成立——**只有最後一個檔會成功**。
症狀有夠難看出來：排程印「收了 60 張」，實際只進倉 1 張，而且 `manifest.json`
確實多了一筆，所以連「完全沒動」都稱不上。61 張結果圖跑了五個半小時，
中間九輪的自動進倉幾乎全部白做。
修法兩道都要：Python 端改用 `sys.stdout.write('\n'.join(...))`，
殼這邊再 `| tr -d '\r'` 一次。這是同一晚第三個「Windows 上的殼」的雷
（另外兩個在記憶池：`reference_bash_tool_backslash_collapse`、
`reference_wait_for_process_windows`）。

★ 第三個雷：綠幕上任何綠色或半透明的東西，去背後都會變成破洞。光是禁「不要寫綠色」不夠——
  沒指定顏色時模型會自己挑到綠色（86 張牌裡 22 張寫「發光」、12 張寫「霧氣煙塵」都中招）。
"""


def gear_rule(items: str) -> str:
    """裝備固定規則。`items` 描述這個角色身上不可移動的東西，例如
    "the lacquered shoulder plates, the horned helmet and the back banner"。"""
    return (
        "WORN GEAR: " + items + " - these are attached to his body, they move and tilt together with it, and "
        "they never detach, never float beside him, never become separate objects he holds or stands next to, "
        "never swap to another part of the body, and never appear twice. If a pose hides a piece behind him, "
        "it is simply hidden - do not relocate it.\n"
        "THE EYES: both eyes look the same way as each other, same size, same shape - large dark round pupils "
        "with one glossy white highlight, slightly droopy upper eyelids. If the pose calls for closed or "
        "squeezed-shut eyes, close BOTH the same way - the rule is that the two eyes always match each other. "
        "Never cross-eyed, never one eye bigger or higher, never blank, never a different pupil colour. "
        "His gaze points the way his head is turned.\n")


STYLE = (
    "Any glow, aura, sheen, sparkle, magical light, mist, smoke, steam, breath, dust cloud, shockwave or water "
    "in this picture must be WARM GOLDEN AMBER, CREAMY WHITE or WARM GREY - never green, never greenish - and "
    "drawn solid and opaque, never see-through. (The picture sits on a green screen: anything green or "
    "transparent gets erased by the chroma key and leaves a hole.)\n"
    "Style: thick black outlines, FLAT colours with only subtle soft shading - do NOT render it painterly, "
    "do NOT use heavy airbrushed shadows or a rendered-illustration look. Cute cartoon, not photorealistic.\n"
    # 2026-09-12 菲菲第一批 14 張每張臉都比球球「厚」：參考圖那半張本來就有噴槍陰影。
    # 通用的「平塗」不夠，臉是最顯眼的地方，要單獨再講一次。
    "THE FACE ESPECIALLY: draw the face in FLAT blocks of colour with hard edges between them. Where two fur "
    "colours meet that is a CLEAN EDGE, never a soft airbrushed fade and never a blurry gradient. No shaded "
    "blob around the muzzle, no glow on the cheeks.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying.\n")

# ---------------------------------------------------------------------------
# 菲菲的外觀：**只在這裡定義一次**
# ---------------------------------------------------------------------------
# 2026-09-12 的教訓（第六個雷）：同一段外觀敘述本來抄在三個生圖腳本裡
#（立繪、牌面、劇情圖），其中一份漏掉「頭跟身體差不多大、四肢短短的」那句，
# 那一批就整個瘦掉、變成成貓。抄三份＝遲早有一份會漏。
# 要改她的長相**只改這裡**，三個腳本 import 過去。

# ★ 這兩條單獨命名，因為**結果圖那批只貼這兩條、不貼整包長相**（2026-09-13）。
# 結果圖的做法是附上該事件她自己的插圖、叫模型「照著重畫、只改正在發生的事」，
# 再貼一整段長相敘述會跟「照附圖重畫」打架（記憶 `reference_mus_art_pipeline`
# 的「規則寫太死會跟姿勢敘述打架」）。但參考圖擋不住這兩種走鐘，所以這兩條要貼。
FEIFEI_NOT_HUMAN = (
    "**SHE IS A CAT, NOT A GIRL WITH CAT EARS.** Her whole head is a cat's head: a furry muzzle with a "
    "small pink nose and whisker dots, whiskers, and the dark seal-brown Siamese face markings covering "
    "that muzzle and wrapping around both eyes - those markings are what make her readable, so they are "
    "never faded out or left off. Do NOT draw a human or anime girl's face with a flat skin-coloured "
    "cheek, a human nose, a human chin or human lips and then add cat ears on top. Do NOT give her "
    "human hands or human feet; she has rounded paws. If you cannot see the brown face markings and the "
    "muzzle, it is the wrong character.\n"
    # 2026-09-13 自檢抓到：`sunbath_r0`／`r1` 兩張的眼睛畫成棕色。規則寫了「bright BLUE」，
    # 但沒有反面——而暹羅貓的臉是深棕色的，模型很容易把眼睛跟著調成同一個色系。
    # 這是第七個雷同一個道理的第三次：描述性的規則會被最省力的解法繞過去。
    "**HER EYES ARE BLUE. ALWAYS.** Bright sky-blue irises with a glossy white highlight - the single "
    "brightest, most saturated thing on her face. Do NOT draw brown, amber, gold, green or dark eyes on "
    "her; the dark seal-brown fur around her eyes makes brown irises disappear into the face and she "
    "stops being recognisable. If her eyes are not clearly BLUE, it is the wrong character.\n")

# 「矮短圓」是她的正面敘述，模型照著畫最省力的解就是一路胖下去（第六個雷的反方向）。
# **判準要寫看得見的東西**：四肢分不分得出來。原本寫「還是要看得出腰」被稽核打回——
# 在一顆頭那麼大的軀幹上要畫出腰，模型只能把身體拉長，那正好觸發「一路瘦下去」。
FEIFEI_NOT_FAT = (
    "**AND SHE MUST NOT INFLATE.** 'Chubby' means a short squat kitten, NOT a ball. You must still be "
    "able to point at two separate arms and two separate legs with a clear gap of background between "
    "them and her body - limbs sunk into a round mass is wrong. Do NOT balloon her torso wider than her "
    "head and do NOT give her a sagging belly. **If she looks like a fat cat instead of a small kitten, "
    "it is wrong** - she is light on her feet, that is her whole fighting style.\n")

"""★ `mask` 這個字在她身上**只能指脖子那塊布**（2026-09-13 稽核 中-11）。

臉上那片深棕色一律寫 `face markings`／`points`。兩個都叫 mask 的話，模型會把臉上那片
畫成一塊布口罩、或把脖子那塊布畫成臉上的斑——而她的招牌動作正好是「把口罩拉上來」，
混掉會很明顯。
"""
FEIFEI_BODY = (
    "She is a chibi SIAMESE cat girl: creamy off-white body fur with dark seal-brown SIAMESE FACE "
    "MARKINGS over her muzzle and around the eyes, dark brown ears, paws and tail, bright BLUE almond "
    "eyes with glossy white highlights, small pink blush strokes on both cheeks. She wears a plum-purple "
    "short kimono jacket with the sleeves tied back by cords, a black sash, dark leggings, a wide belt "
    "with a row of small bamboo needle-tubes, and a dark cloth collar/face-covering around her neck "
    "(that cloth is the only 'mask' she wears - it sits at her throat, never on her face markings).\n"
    + FEIFEI_NOT_HUMAN)

# ★ 這一段每一批都要完整貼上，而且**要有反向護欄**。只寫「比球球瘦」會一路瘦下去。
FEIFEI_PROPORTION = (
    "**PROPORTIONS - as important as the colours.** She is a SMALL, ROUND, CUTE KITTEN mascot: her HEAD "
    "is BIG and ROUND, roughly as large as her whole body; her LEGS are SHORT and STUBBY; her body is "
    "SHORT and SQUAT; she has NO NECK; her paws are small and rounded. "
    "Do NOT make her slim, do NOT give her long legs, do NOT draw adult or realistic cat anatomy, "
    "do NOT stretch her body or make her tall. **If she looks like a grown-up cat, it is wrong** - she "
    "should look small, chubby and cute.\n"
    "**HER EARS: pointed and triangular like a Siamese.** Each ear is about one quarter to one third the "
    "height of her head - clearly shorter than her face, but ALWAYS CLEARLY VISIBLE as two pointed "
    "triangles standing up off the top of her head. Do NOT draw ears as tall as her head (they would "
    "dominate the silhouette), and do NOT shrink them into small rounded nubs either - tiny ears on a "
    "big round head is exactly what makes her read as a different, fatter cat.\n"
    "**HER FACE: round but NOT WIDE.** Her head is round from the front, but her cheeks must not bulge "
    "out sideways and her muzzle stays narrow and neat. **Her head is very slightly TALLER than it is "
    "wide** - if you find yourself drawing it wider than tall, it is already wrong. "
    "Do NOT puff her cheeks out past the line of her ears - a face that spreads sideways reads as fat "
    "and breaks the proportions, even when the body is right.\n"
    "So: small and chubby in the BODY and LIMBS, but the FACE stays a tidy round shape with a narrow "
    "muzzle. Those two are not the same thing.\n"
    + FEIFEI_NOT_FAT +
    "Her narrow muzzle and the ear SHAPE (triangular, not rounded) are the only features that differ "
    "from a round grey tabby; everything else is short and round.\n")

# ★ 配件要講「在畫面上佔哪一塊」，不是講它叫什麼（第五個雷）
FEIFEI_HAIR = (
    "**HER HAIR.** A tuft of dark seal-brown hair grows on top of her head, in three parts that must ALL "
    "be visible:\n"
    "  (1) a FRINGE lying forward over her FOREHEAD, between and in front of her ears, its ragged tips "
    "coming down toward her eyebrows - this part is on the FRONT of her head and must be clearly visible "
    "from this angle; without it the hair reads as nothing at all;\n"
    "  (2) the hair gathered and tied behind the fringe, with a PLUM-PURPLE ribbon BOW at the tie, on the "
    "near side of her head;\n"
    "  (3) a short spiky PONYTAIL sticking up and back from the tie, **clearly separated from the outline "
    "of her head** - background must be visible in the gap between the ponytail and her skull, so that it "
    "reads as a tail of hair and not as more head.\n"
    "Drawn as solid flat shapes with thick black outlines, not wispy strands. The hair is attached to her "
    "head and moves with it - never detached, never doubled, never swapped to the other side. If a pose "
    "hides part of it, it is simply hidden; do not relocate it.\n"
    "**WHAT THE HAIR MUST NOT BECOME** (this is the part that keeps going wrong, so check it):\n"
    "  - NOT a bowl cut, helmet or mop of hair covering the whole top and sides of her skull. The hair is "
    "a fringe plus a tied ponytail, NOT a wig. Her ears rise out of bare head, not out of hair.\n"
    "  - NOT a shapeless brown lump. If you cannot point at the fringe, the bow and the ponytail as three "
    "separate things, it is wrong.\n"
    "  - The BOW is never optional and never decoration-sized: draw it as a proper ribbon bow with two "
    "loops and a knot, roughly as wide as one of her ears, sitting on TOP of her head between the ears. "
    "A missing or pea-sized bow is the single most common mistake on this character.\n"
    "  - NOT long flowing hair down her back or over her shoulders.\n")

# 她大部分時間面向右（跟球球一致）。`idle` 那種站著不動的最容易漂成正面，所以釘死鼻子與視線
FEIFEI_FACE_RIGHT = (
    "Her muzzle, nose and gaze all point toward the RIGHT edge of the picture - you should see the "
    "right-hand side of her face and the line of her cheek. She never looks toward the left edge and "
    "never looks straight out at the viewer. Her tail trails off to the LEFT behind her.\n")


def feifei_look() -> str:
    """菲菲的完整外觀敘述。每一批生圖都用這一支，不要自己抄一份。"""
    return FEIFEI_BODY + "\n" + FEIFEI_PROPORTION + "\n" + FEIFEI_HAIR


FOES = (
    "If any enemy appears, it is a small grey rat or a small orange tabby bandit cat - NEVER another copy of "
    "the hero and never anything that looks like him. Enemies stay small and near the edges so the hero is "
    "clearly the main subject filling the centre.\n")
