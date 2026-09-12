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

FEIFEI_BODY = (
    "She is a chibi SIAMESE cat girl: creamy off-white body fur with a dark seal-brown mask over her "
    "muzzle and around the eyes, dark brown ears, paws and tail, bright BLUE almond eyes with glossy "
    "white highlights, small pink blush strokes on both cheeks. She wears a plum-purple short kimono "
    "jacket with the sleeves tied back by cords, a black sash, dark leggings, a wide belt with a row of "
    "small bamboo needle-tubes, and a dark cloth collar/mask around her neck.\n")

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
    "  (3) a short spiky PONYTAIL sticking up and back from the tie.\n"
    "Drawn as solid flat shapes with thick black outlines, not wispy strands. The hair is attached to her "
    "head and moves with it - never detached, never doubled, never swapped to the other side. If a pose "
    "hides part of it, it is simply hidden; do not relocate it.\n")

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
