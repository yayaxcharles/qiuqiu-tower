# -*- coding: utf-8 -*-
"""噹噹的 F 批（一）——38 個共用事件的場景插圖＋紙箱那三張，共 41 張（2026-09-17）。

要生哪些：**從 manifest 撈，不要用猜的**
----------------------------------------
凡是 `bg` 裡有 `bg/event_feifei_<X>` 的，就代表那一篇需要角色分家的版本
（`src/ui/assets.ts` 的 `eventArtKey()`：有他自己的就用他的，沒有就退回球球那張）。
**但有一個坑**：她那四篇專屬事件的編號本身就叫 `feifei_brew`／`feifei_pouch`／
`feifei_signal`／`feifei_trace`，所以鍵長得一模一樣是 `bg/event_feifei_brew`——
那是「她的專屬事件的本圖」，不是「共用事件的她版」。噹噹一輩子觸發不到那四篇，
生了就是 12 張沒人用的孤兒圖。這支的 `wanted()` 把那 12 個扣掉。

  菲菲那一櫃 113 張 − 她的專屬 12 張 = 101 張要生
    這一支：場景 41 張（共用事件 38 篇 ＋ 紙箱 chest_closed／chest_open／chest_empty）
    另一支：結果圖 60 張（`make_dangdang_result_art_jobs.py`，做法是「照他的場景圖畫續集」）

畫面要對得上**他那一版**的文字
------------------------------
`src/content/dialogue.ts` 的 `DANGDANG_EVENT_TEXT` 有他自己的 121 段，跟球球是不同的字：
他先看東西壞在哪裡——門歪了想扶正，箱子擋路就搬開，遇到人先問要不要幫忙。
每一段提示詞上面都貼著**他讀到的那一段原文**（`tools/dangdang_event_text.json`，
由 `DUMP_DANGDANG=1 npx vitest run tools/dump_dangdang_events.test.ts` 從
`eventTextFor('dangdang', ...)` 匯出的，不是照球球那版抄的）。

**取景照球球那張既有的、只在兩種情況下改**（省得整批重新設計、也讓三個角色的同一篇事件
看起來是同一個地方，結果圖的續集才接得上）：
  1. 他那一版的文字跟球球不一樣（38 篇裡有 11 篇：`daxia_teach` `sunbath` `old_master_ghost`
     `blocked` `hidden_box` `training_hall` `mirror_hall` `moon_window` `shortcut_scroll`
     `fish_pond` `grindstone`）；
  2. 球球做得到、他做不到——**他不用暗器、不伸爪抓、不拿刀**。
     `grindstone` 球球在磨刀，他沒有刀，改成蹲著讀石頭旁邊刻的字；
     `weapon_rack` 球球踮腳取兵器，他只看旁邊那三幅演招圖。

兩個規則打架，照 E 批的解法
---------------------------
  1. **護臂可以卸下來**：A 批的 `GEAR` 寫死「永遠不脫」，可是 `sunbath` 他那一版
     就是「護臂得先卸下，放到旁邊」。照 E 批改寫成「衣服腰帶不脫；護臂只有文字明說時才卸，
     卸下來的那隻一定還在畫面裡」——直接 import E 批那一份，不抄第二份。
  2. **地要小、邊緣不規則**：事件圖是去背的，東西放地上就得有一小塊地，
     但方方正正的一塊地板就踩到 `art_rules.NO_PANEL`（不要畫成一塊方形色板）。

兩條硬規則（B 批牌面學到的，進倉量到殘綠才補上）
------------------------------------------------
  1. **特效一律要有黑外框的實心形狀**——沒有外框的柔光會暈進綠幕，去背去不掉。
  2. **兩個顏色之間不要漸層**——漸層會從綠色經過。
  兩條都在 E 批的 `EFFECTS` 裡，這支 import 過來。
  分寸：**他的青綠短褂是設計的一部分，不算特效**，不寫這句「整張不准有綠色」會跟衣服打架。

三個場景要自己的開頭（`art_rules.py` 檔頭第一條：規則寫太死會跟姿勢敘述打架）
-----------------------------------------------------------------------------
通用開頭寫著「不准有第二隻賓士貓、不准出現戴斗笠的貓」，可是——
  - `mirror_hall`：鏡子裡照的**就是**第二隻、第三隻他。→ `HEAD_MIRROR`
  - `old_master_ghost`：畫面裡**就是**大俠貓（戴斗笠）。→ `HEAD_MASTER`＋合參表當參考圖
  - `lost_kitten`：地上坐著一隻**全黑**的小貓，很容易被畫成縮小版的他。→ `HEAD_KITTEN`

跑法
----
  python tools/make_dangdang_shared_event_jobs.py                   # 預設分 4 小批
  python tools/codex_gen.py tools/codex_jobs/dangdang_shared_1.json --ref tools/ref/dangdang_ref.png
  （**一次最多兩條**，`codex_gen.py` 坑 1。每一筆自己帶參考圖，`--ref` 只是保險。）

  只重生幾張：python tools/make_dangdang_shared_event_jobs.py --only sunbath grindstone --redo
  （`--redo` 會把舊稿改名留底。不加的話 `codex_gen.py` 看到檔案已存在就整張空轉，
    印的還是「已存在跳過」、離開碼 0，看起來像成功——`art_rules.py` 第九個雷。）

**自檢不寫成 `SystemExit`**（使用者 2026-09-17 明示）：工作檔一定會寫出去，
撈出來的清單跟這支寫的對不上、已經有舊稿的，各印成一塊醒目的清單。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import STYLE  # noqa: E402
from make_dangdang_hero_jobs import LOOK  # noqa: E402
from make_dangdang_event_jobs import EFFECTS, GEAR_EVENT  # noqa: E402
from make_dangdang_story_jobs import CAST  # noqa: E402

RAW = ROOT / "tools" / "codex_raw"
JOBS = ROOT / "tools" / "codex_jobs"
REF = ROOT / "tools" / "ref" / "dangdang_ref.png"
REF_STORY = ROOT / "tools" / "ref" / "dangdang_story_ref.png"
MANIFEST = ROOT / "public" / "assets" / "manifest.json"
TEXT = ROOT / "tools" / "dangdang_event_text.json"

# 她那四篇專屬事件（編號自己就叫 feifei_xxx，所以鍵跟「共用事件的她版」長得一樣）
HER_OWN = ("brew", "pouch", "signal", "trace")

# ---------------------------------------------------------------------------
# 開頭：指著參考圖說「就是這隻」，再排除會被畫錯的角色
# ---------------------------------------------------------------------------
_OPEN = ("A single scene illustration for a story event in a cute cartoon roguelike card game, landscape "
         "composition. THE MAIN CHARACTER IS THE BLACK-AND-WHITE TUXEDO CAT in the attached reference "
         "image.\n")

HEAD = (_OPEN + LOOK +
        "Never draw a second tuxedo cat, and never put a grey tabby ninja, a straw-hat cat or a "
        "purple-jacketed Siamese girl in his place.\n")

# 鏡子走廊：鏡中那幾隻**就是**他，通用那句「不准有第二隻賓士貓」會跟場景打架
HEAD_MIRROR = (_OPEN + LOOK +
               "**THE ONLY OTHER TUXEDO CATS IN THIS PICTURE ARE HIS OWN REFLECTIONS INSIDE THE "
               "MIRRORS.** There is no second real cat standing in the corridor: every other tuxedo cat "
               "you draw is flat inside a mirror frame. Never put a grey tabby ninja, a straw-hat cat or "
               "a purple-jacketed Siamese girl in his place.\n")

# 迷路的小黑貓：地上那隻是**全黑**的小貓，沒有白臉線、沒有短褂，很容易被畫成縮小版的他
HEAD_KITTEN = (_OPEN + LOOK +
               "**THE OTHER CAT IN THIS PICTURE IS A TINY ALL-BLACK KITTEN**, much smaller than him, "
               "solid black fur with NO white face stripe, NO white chest, NO jacket, NO sash and NO "
               "bracers - it must not look like a small copy of him. Never put a grey tabby ninja, a "
               "straw-hat cat or a purple-jacketed Siamese girl in his place.\n")

# 師父的影子：畫面裡就是大俠貓（戴斗笠），通用那句會打架；改用劇情合參表當參考圖
HEAD_MASTER = ("A single scene illustration for a story event in a cute cartoon roguelike card game, "
               "landscape composition.\n" + CAST +
               "In THIS picture only two characters appear: DANGDANG and the MASTER's ghost. Qiuqiu and "
               "Feifei are NOT in it, and the corrupted form is NOT in it.\n")

# ---------------------------------------------------------------------------
# 結尾：尺寸、去背的分寸、那一小塊地
# ---------------------------------------------------------------------------
TAIL = (
    "\nTell the story in one readable picture: clear staging, strong silhouettes, expressive faces, only "
    "what the scene needs. It will be shown about 420 pixels wide, so no fine detail that disappears when "
    "shrunk. Draw him big enough that his face reads clearly at that size.\n"
    "IMPORTANT about any writing in this scene: brush marks and scratches only - abstract squiggles that "
    "read as writing from a distance. Never draw real letters, words, numbers or recognisable characters "
    "of any language.\n"
    "Nothing is in the picture except him, the other characters this scene names and the props this "
    "scene names: no room, no ceiling, no scenery, no text, no watermark, no user interface, no border.\n"
    # 去背的圖，主體以外全是綠幕；東西放地上就得有一小塊地。**邊緣要不規則**，
    # 方方正正的一塊地板就是 `art_rules.NO_PANEL` 那條「不要畫成一塊方形色板」。
    "If the scene puts something on the ground, draw a SMALL PATCH of stone floor under him, just big "
    "enough to hold him and those things, with a ragged irregular edge that fades to nothing - not a "
    "full floor, and never a slab with straight edges or square corners.\n"
    + STYLE + EFFECTS + GEAR_EVENT +
    "Output 1024x768 PNG. Save the image as {fid} in the current directory and report the path."
)

# ---------------------------------------------------------------------------
# 41 張。鍵照 `src/content/events.ts` 的事件編號（紙箱那三張照 `ui/screens/chest.ts`）。
# 中文註解是**他讀到的那一段**；跟球球不一樣的地方標了「★他版」。
# ---------------------------------------------------------------------------
SCENES: dict[str, str] = {
    # ===== 此路不通 =====
    # ★他版：「垃圾堆把樓梯堵住了，最上面還插著一塊新牌子。破木板下露出半卷忍術卷軸；
    #          旁邊的小走道很窄，卻還能繞過去。」（球球那版是他叉腰在打量）
    "blocked":
        "A tall pile of junk and broken crates blocking a stone stairway, with a freshly nailed plain "
        "wooden sign board standing up on top of it. Low down on the near side, HALF A ROLLED PAPER "
        "SCROLL pokes out from under a split plank. Along the right-hand edge a NARROW side passage "
        "squeezes past the pile - clearly too tight to walk straight through, but passable sideways. "
        "Dangdang stands at the foot of the pile with both bracered forearms down at his sides, head "
        "tipped back, working out the way round: his eyes are on the narrow gap, not on the pile. He is "
        "the only cat in the picture.",

    # ===== 倒了的神龕 =====
    # 「一座小神龕倒在牆邊，貓神像摔成兩截。翻倒的供盤旁散著一大把小魚乾，神像的眼睛在暗處泛著微光。」
    "broken_shrine":
        "A small wooden shrine toppled over against a low section of stone wall, ONE WHOLE carved stone "
        "cat statue lying tipped on its side in front of it, a spilled offering dish and a big scatter of "
        "dried fish beside it. Dangdang crouches beside the statue, one rounded paw half raised, "
        "hesitating, brows drawn. **THE STATUE - read this part twice.** It is ONE SINGLE carved stone "
        "cat, complete and in one piece: head, chest, front paws, seated haunches and curled tail all "
        "belong to the same figure and all line up along ONE straight axis, exactly as if the statue had "
        "been standing upright and somebody simply tipped the whole thing over. **ITS EYES ARE OPEN** - "
        "two big round carved eyes looking calmly out of the stone face, each with a small solid "
        "cream-white glint drawn inside a thick black outline; never shut, never blank, and never a soft "
        "glow. The damage is surface damage only: one thin crack across its middle, another across one "
        "ear, two or three small chipped spots. Do NOT draw it as two separate broken chunks lying apart, "
        "do NOT rotate the upper body out of line with the lower body, and do NOT put a spare head or a "
        "loose limb anywhere in the picture.",

    # ===== 好高的貓抓柱 =====
    # 「一根貓抓柱直抵天花板，頂端掛著一個落滿灰的小包。柱身滿是深淺不一的抓痕，
    #  底部有幾道排得特別整齊，像是一套出爪的次序。」
    "cat_tower":
        "An enormously tall scratching post running right off the top of the picture, its surface covered "
        "in old claw marks of every depth; near the BASE several marks are lined up in a neat tidy row, "
        "clearly deliberate, like a written sequence. A small DUSTY CLOTH POUCH hangs from a peg high up "
        "the post. Dangdang is a short way up the post, hugging it with BOTH bracered forearms wrapped "
        "round it and one hind foot jammed against it, hauling himself up by grip and squeeze alone - his "
        "paws stay rounded and closed, no claws out. He is looking up at the pouch above him, jaw set. He "
        "is the only cat in the picture.",

    # ===== 一整片貓薄荷 =====
    # 「門後是一整片茂盛的貓薄荷，葉間浮著薄薄的紫霧。濃香一湧上來，噹噹就忍不住想往裡滾。
    #  看園的老貓指了指身旁的忍具箱……」
    "catnip_field":
        # ★ `STYLE` 那條「霧氣一律暖金／米白／暖灰」跟稿子寫的「紫霧」打架。紫色對去背沒有風險
        #   （危險的只有綠），所以照 `art_rules.py` 的解法**明寫成一條例外**，不要讓兩句話對撞。
        "A thick bed of lush catnip plants filling the lower half of the picture, with thin wisps of pale "
        "VIOLET haze floating between the leaves - each wisp drawn as a solid free-form shape with its "
        "own thick black outline, never a soft fading cloud. **That violet haze is the one deliberate "
        "exception to the warm-colour rule further down: it stays VIOLET, solid and black-outlined, and "
        "it is never green or greenish.** Dangdang has flopped over onto his back "
        "among the leaves, all four paws in the air, both bronze bracers still on his forearms, eyes "
        "closed in a dizzy blissful grin, tail flopped out. He is the only cat in the picture.",

    # ===== 紙箱（不是事件，是寶箱畫面；`ui/screens/chest.ts` 走同一支 eventArtKey）=====
    "chest_closed":
        "A battered cardboard box sitting on the floor on the LEFT, STILL SEALED: its top flaps are "
        "folded shut and taped down with a strip of pale packing tape across the middle. Nothing is "
        "coming out of it - no light, no sparkles, no paper. Dangdang crouches on the RIGHT beside it "
        "with BOTH rounded paws pressed flat on the taped lid, leaning his weight in, ears up, eyes wide "
        "and eager, about to shove it open. He is the only cat in the picture.",
    "chest_open":
        "A battered cardboard box sitting on the floor on the LEFT, its top flaps just ripped wide open "
        "and packing paper spilling over its sides. A WIDE CONE OF SOLID WARM-GOLDEN TREASURE LIGHT "
        "bursts straight UP out of the open box - drawn as one solid flat golden shape with a thick black "
        "outline all the way round it, with four or five separate solid golden sparkle shapes around its "
        "edge, each with its own black outline. No haze, no bloom and no fading edge anywhere on it. "
        "Dangdang crouches on the RIGHT beside the box, both rounded paws still gripping one torn flap, "
        "leaning in, eyes wide and shining, mouth open in delight. He is the only cat in the picture.",
    "chest_empty":
        "A battered cardboard box lying tipped over on its side on the LEFT, completely empty, its flaps "
        "torn open and a drift of shredded packing paper spilling out across the floor. There is NO light "
        "and NO sparkle anywhere. Dangdang sits slumped on the floor on the RIGHT beside it, shoulders "
        "dropped, ears flattened, one rounded paw still resting on the box, a couple of shredded paper "
        "strips draped over his head, wearing a flat deadpan disappointed look. Quiet, anticlimactic "
        "mood. He is the only cat in the picture.",

    # ===== 會哭的牆 =====
    # 「牆面的水痕像一張哭臉，細細的聲音反覆說著：『別上去……』旁邊的殘字記著，這是昔日護塔者
    #  留在石中的一縷意念。牆腳另有一塊鬆動的藏物磚，縫裡露出布包的一角。」
    "crying_wall":
        "A section of damp stone wall. The water running down it has stained the stone into the rough "
        "shape of a CRYING FACE - two long wet streaks running down from two dark hollows like tears, "
        "and a downturned mouth line below - drawn as solid pale cream-white shapes with their own thick "
        "black outlines, never see-through and never fading out. A few scratched marks are worn into the "
        "stone beside it (abstract squiggles, not real writing). Down at the FOOT of the wall one brick "
        "sits loose and pushed out, with the CORNER OF A CLOTH BUNDLE showing in the gap behind it. "
        "Dangdang stands close against the wall with ONE bracered forearm pressed flat on the stone and "
        "the SIDE OF HIS HEAD laid against it, one ear flat to the wall, eyes closed, listening hard - "
        "his other bracered forearm hangs at his side. He is the only cat in the picture.",

    # ===== 師父留下的秘笈 =====
    # ★他版：「噹噹接著翻開剛才撿到的秘笈。封面已經起毛，裡面有三幅還能看清的圖。」
    #        （球球那版是秘笈落在樓梯間、他翻開來往後找幾頁）
    "daxia_teach":
        "Dangdang sits on a low stone step holding an old martial-arts manual OPEN across both rounded "
        "paws, its cloth cover scuffed and fraying at the corners. On the open page are THREE small "
        "brush-drawn stick figures in three different stances, in a row - abstract squiggly brush marks, "
        "not real writing - and they are clearly the only legible thing left on the page. He is looking "
        "down at them with his brows lifted and his mouth slightly open: he can read these three. His "
        "open canvas tool bag sits on the step beside him. He is the only cat in the picture.",

    # ===== 養魚的池子 =====
    # ★他版：「池裡游著幾條肥魚，旁邊放了一籃小魚乾。噹噹剛蹲下，水底就掠過一道比他還寬的黑影。」
    #        （球球那版是伸爪去撈、連忙縮手）
    # 第一版走鐘：池子佔了整張、他縮到左邊一小隻，黑影只是水裡一抹灰，420 像素寬時根本看不出來。
    # 改法照 `art_rules.py` 第五個雷——**講它在畫面上佔哪一塊**，不是只給名字。
    "fish_pond":
        "**DANGDANG IS THE BIGGEST THING IN THIS PICTURE**, crouched low in the FOREGROUND at the right, "
        "filling most of the height of the frame, seen from the side. In front of him, taking the LEFT "
        "half, is the near rim of a small stone pond with three fat lazy fish near the surface; a woven "
        "basket of dried fish sits on the rim beside him. Both his rounded paws are planted on the stone "
        "rim and he has NOT reached into the water; he has rocked back on his haunches, ears up, eyes "
        "wide, whole body still. **Just under the surface, right in front of his face, one huge DARK "
        "SHAPE is sliding past**: a solid DARK WARM GREY silhouette with a thick black outline and a "
        "ragged irregular edge, no fading and no transparency, **clearly WIDER than he is TALL** so it "
        "reads instantly as something enormous. It is the second thing you notice after him. He is the "
        "only cat in the picture.",

    # ===== 賭博的老鼠 =====
    # 「幾隻老鼠圍著矮桌蹲在角落，桌上倒扣著一個碗。看到噹噹，牠們連忙招手……」
    "gambling_rats":
        "Three small grey RATS crouched around a low wooden table in a corner with a single bowl turned "
        "upside down on it; one rat is waving Dangdang over with both paws, the others grin up at him. "
        "Dangdang stands over the table with both bracered forearms folded across his chest, weight back "
        "on one leg, eyes narrowed - not buying it. Four characters: him and the three small rats.",

    # ===== 很貪心的商人 =====
    # 「戴眼鏡的灰貓攤開布包，露出幾件秘寶和忍具……牠把布角一翻，露出一行小字：會留下內力不足的毛病。」
    "greedy_merchant":
        "A sleek plain GREY cat merchant in small round spectacles and a long dark merchant's robe (no "
        "headband, no bracers, no straw hat) has spread a CLOTH BUNDLE open across a low crate, showing "
        "three or four small treasures and hand tools laid out on it, and is gesturing at them with one "
        "paw, smiling far too wide - while his other paw is quietly holding down a folded-back CORNER of "
        "the cloth with a line of tiny scratched marks on it (abstract squiggles, not real writing). "
        "Dangdang stands facing him with one rounded paw clamped over the small drawstring fish pouch on "
        "his own sash and the other bracered forearm half raised, eyeing that folded corner sideways, "
        "unconvinced. Two characters only.",

    # ===== 磨利我的刀 =====
    # ★他版：「磨刀石旁刻著一套捨招法，起頭寫著『招多不如招熟』，下面又警告：強改熟招會傷及身體根基。
    #          噹噹讀到這裡，停住了。」（球球那版是跪著磨刀、火花直噴——**他沒有刀**）
    "grindstone":
        "A big old whetstone leaning against a section of stone wall, its top worn into a deep hollow "
        "from years of use. Carved down the wall beside it is a column of brush-like scratched marks - "
        "abstract squiggles, not real writing. Dangdang is down on ONE KNEE in front of the carving with "
        "one bracered forearm resting on top of the whetstone and his other rounded paw stopped halfway "
        "up toward the wall - he has STOPPED reading partway down, mouth a flat line, brows drawn hard "
        "together, thinking it over. He holds no blade and there is no blade anywhere in the picture. Two "
        "or three crumpled paper talismans lie on the floor beside the stone. He is the only cat in the "
        "picture.",

    # ===== 很重的門 =====
    # 「厚重的石門卡在門框裡，只留下一道能伸進爪子的細縫……」
    "heavy_door":
        "A massive stone door jammed in its frame, open only a narrow crack, with solid warm-golden light "
        "spilling out through the gap - drawn as a flat solid golden wedge shape with its own thick black "
        "outline, no haze and no fading edge. Dangdang has his SHOULDER and one bracered forearm driven "
        "flat against the door, the other bracer braced on the frame, both feet stamped wide and skidding "
        "back, teeth gritted, shoving with everything he has. He is the only cat in the picture.",

    # ===== 深藏不露 =====
    # ★他版：「牆縫裡卡著一個小箱子，上面貼著紙條，只寫了『深藏不露』四個字。
    #          噹噹看了看箱蓋，沒有立刻伸手。」（球球那版是猶豫著伸手去拿、左右張望）
    "hidden_box":
        "A small wooden box wedged tight into a crack in a stone wall at head height, with a small square "
        "paper note stuck on its lid - only four short abstract brush marks on the note, not real "
        "writing. Dangdang stands squarely in front of it with BOTH rounded paws held down at his sides, "
        "deliberately NOT reaching for it, head tipped to one side, one brow up, reading the lid and "
        "taking his time. He is the only cat in the picture.",

    # ===== 迷路的小黑貓 =====
    # 「一隻小黑貓坐在樓梯上抹眼淚，頭上的忍者頭巾太大，滑下來遮住眼睛。
    #  『我找不到集合的房間了……』噹噹替牠掀起頭巾……」
    "lost_kitten":
        "A tiny ALL-BLACK KITTEN sits on a stone step crying, wearing a navy ninja headband far too big "
        "for it that has slid down over its eyes; two fat cream-white tear drops hang on its cheeks, each "
        "with its own thick black outline. Dangdang has crouched right down to its level and is lifting "
        "the front of the headband up clear of its eyes with one rounded paw, his other bracered forearm "
        "resting on his knee, his face gentle and unhurried. Two characters only.",

    # ===== 掉在地上的卷軸 =====
    # 「一卷沒署名的卷軸掉在階梯上，潦草的字旁畫著三段忍術圖解……」
    "lost_scroll":
        "A rolled paper scroll lying abandoned on a stone stair, half unrolled so its untidy scrawled "
        "brush marks show, with three small figure diagrams drawn down one side. Dangdang has picked it "
        "up in both rounded paws and holds it up close, head forward, eyes narrowed to slits, squinting "
        "at the messy writing. He is the only cat in the picture.",

    # ===== 賣藥的三花貓 =====
    # 「一隻三花貓在牆邊擺攤，一邊放著混裝的忍具，一邊排著祖傳補身藥……」
    "medicine_cat":
        "A CALICO cat (white with orange and black patches, no headband, no bracers) sits behind a small "
        "stall board: a jumbled box of small tools on one side, a tidy row of coloured medicine bottles "
        "on the other. She is gesturing at her wares with a big sales-pitch grin. Dangdang stands at the "
        "stall turning one bottle over close to his face with both rounded paws, eyeing it warily. Two "
        "characters only.",

    # ===== 鏡子走廊 =====
    # ★他版：「走廊兩側排滿鏡子。噹噹往前走，其中一面的影子卻慢了半拍；
    #          等他停住，裡面的影子反而抬起手，擺出迎戰的架勢。」
    "mirror_hall":
        "Three tall standing MIRRORS in a row facing us, their frames side by side across the picture. "
        "Dangdang stands in front of them, STOCK STILL, both rounded paws down at his sides, head turned "
        "toward the middle mirror, ears back and eyes wide. The reflections in the two outer mirrors "
        "match him exactly - standing still, paws down. **The reflection in the MIDDLE mirror does not "
        "match**: that one has both bracered forearms crossed up in a fighting guard in front of its "
        "face, shoulders dropped, ready to fight. Every other tuxedo cat in this picture is flat inside a "
        "mirror frame; only one real cat stands in the corridor.",

    # ===== 看得到月亮的窗 =====
    # ★他版：「圓窗透進月光，照著窗台上的空碗。碗底刻著一隻睡著的小貓，旁邊留出一小塊能坐的地方。
    #          噹噹：『碗倒洗得乾淨，是給誰留的？』」
    "moon_window":
        "A round stone window with a FULL MOON framed in the middle of it - the moon drawn as one flat "
        "solid pale-cream disc with a thick black outline, no halo and no fading glow. An empty ceramic "
        "BOWL stands on the wide window sill, tipped slightly toward us so we can see a small SLEEPING "
        "KITTEN carved into the bottom of it. Dangdang sits on the sill in the clear space beside the "
        "bowl, one rounded paw resting on the bowl's rim, looking down into it rather than out at the "
        "moon, his face puzzled and thoughtful. He is the only cat in the picture.",

    # ===== 換家的老鼠 =====
    # 「一隻老鼠背著大布包……一邊說要交換，一邊伸手摸向他腰間的袋子。」
    "moving_rat":
        "A plump brown RAT with a huge cloth bundle strapped to its back crouches on a stone stair, its "
        "belongings spread out around it. One paw is held out toward Dangdang offering a swap, while its "
        "OTHER paw is already sneaking toward the small pouch on Dangdang's sash. Dangdang stands facing "
        "it with one rounded paw clamped protectively over that pouch and the other bracered forearm "
        "half up, ears back, unsure. Two characters only.",

    # ===== 很吵的廚房 =====
    # 「爐上的湯鍋咕嚕作響，蒸氣把鍋蓋頂得直跳……旁邊還放著一盒供人取用的備用忍具。」
    "noisy_kitchen":
        "A cluttered cooking corner: a big iron pot on a small stove with its lid bouncing right off the "
        "rim, and thick STEAM boiling up out of it - the steam drawn as three or four solid cream-white "
        "free-form puffs, each with its own thick black outline and a ragged irregular edge, never a soft "
        "fading cloud and never a square block. A small open wooden box of spare tools sits beside the "
        "stove. Dangdang stands up on tiptoe peering over the pot rim with his nose right in the steam, "
        "nose twitching, ears up. He is the only cat in the picture.",

    # ===== 師父的影子 =====
    # ★他版：「樓梯上坐著一個很像大俠貓的背影。噹噹正要出聲，對方轉過來，臉卻只是一片模糊。
    #          影子抬手點了點胸口，深吸一口氣，再把前爪平平送出。噹噹看清了：它是在示範動作。」
    #        （球球那版是影子坐著訓話，他站在下面聽）
    "old_master_ghost":
        "The GHOST OF THE MASTER sits half-turned on a stone stair: the big straw-hat cat in his cream "
        # ★ 鬼魂是「淡藍」，跟 `STYLE` 那條「發光一律暖金／米白／暖灰」打架。藍色對去背沒風險
        #   （危險的只有綠），照 `art_rules.py` 的解法明寫成一條例外。
        "robe and black belt, recoloured entirely in pale ghostly blue, drawn SOLID and opaque with thick "
        "black outlines and three or four separate pale wisps trailing off his edges, each wisp a solid "
        "shape with its own black outline. **His pale BLUE colour is the one deliberate exception to the "
        "warm-colour rule further down - it stays blue, solid and black-outlined, and it is never green "
        "or greenish.** **HIS FACE IS BLANK** - a flat featureless pale-blue face "
        "under the hat brim with no eyes, no nose and no mouth drawn on it, and hard clean edges, never "
        "blurred or faded. He is DEMONSTRATING A MOVE: one paw taps his own chest, his chest is filled "
        "with a held breath, and his other forepaw is pushed straight out FLAT AND LEVEL in front of him. "
        "**THE MASTER HAS NO BEARD AND NO MOUSTACHE** - nothing hangs below where his mouth would be. "
        "Dangdang stands below on the lower step looking up, and he has just understood: his own near "
        "bracered forearm has started to copy that flat level push, his eyes wide and fixed on the "
        "ghost's paw. Exactly two characters in the picture.",

    # ===== 古井 =====
    # 「塔內天井中央有一口古井，水面映著噹噹探頭的模樣。井邊立著木牌……」
    "old_well":
        "A round stone well with a plain wooden sign board on a post beside it. Dangdang leans right over "
        "the rim with both bracered forearms braced on the stonework, head down, looking at HIS OWN "
        "REFLECTION in the dark water below - the reflection shows the same tuxedo face looking back up "
        "at him, drawn flat inside the circle of water. Only one real cat is in the picture.",

    # ===== 可疑的飯糰攤 =====
    # 「一隻老鼠推著攤車叫賣，飯糰上還留著牙印……牠悄悄把咬過的一面轉向背後。」
    "rat_stall":
        "A scruffy grey RAT behind a little wooden food cart stacked with rice balls, each one with an "
        "obvious BITE MARK taken out of it; the rat grins far too wide and is quietly turning one rice "
        "ball so the bitten side faces away. Dangdang leans in over the cart with both rounded paws on "
        "its edge, one eye screwed half shut, squinting doubtfully at the rice balls. Two characters "
        "only.",

    # ===== 江湖救急 =====
    # 「噹噹把受傷的村貓救到安全的角落，替牠包好傷口。村貓緩過氣，拿出一包小魚乾和一罐備用的貓草藥……」
    "rescue":
        "An injured VILLAGE CAT (a plain little house cat in simple brown work clothes, no headband, no "
        "bracers) lies propped on its side with one hind leg freshly wrapped in white bandage, weakly "
        "pushing TWO things forward across the floor for Dangdang to choose between: a small drawstring "
        "pouch of dried fish, and a small clay bottle of herbal medicine. Dangdang crouches in front of "
        "them with his open canvas tool bag and a half-used roll of bandage beside his foot, looking down "
        "at the two offerings, one rounded paw hovering between them. Two characters only.",

    # ===== 欠村貓的那一份 =====
    # 「瘦得見骨的村貓靠著牆，抬頭看他，腳邊只剩一個空掉的魚乾包。」
    "rescue_return_fish":
        "A bone-thin ragged VILLAGE CAT slumped against a section of stone wall, head lifted to look "
        "silently up at Dangdang, an empty torn fish-bundle wrapper on the floor beside it. Dangdang "
        "stands in front of it with both rounded paws down and his ears dropped, looking back at it, "
        "saying nothing. Dim and quiet mood, no golden light anywhere. Two characters only.",

    # ===== 村貓的回禮 =====
    # 「腳傷已好的村貓從樓梯間探出頭……牠捧出布包，又指了指腰間的磨刀工具。」
    "rescue_return_herb":
        "A thin grey VILLAGE CAT with a freshly healed hind leg comes bounding happily out of a dark "
        "stairwell mouth and presses a lucky charm - dried fish strung on a red cord - into Dangdang's "
        "rounded paws with both of its own; its other elbow points down at a small set of SHARPENING "
        "TOOLS hanging at its belt. Dangdang is caught mid-step, both paws closing round the charm, ears "
        "up, a small surprised smile. Two characters only.",

    # ===== 分糧救急 =====
    # 「幾隻村貓縮在角落，肚子餓得咕嚕叫……噹噹停下腳步，摸了摸自己的魚乾袋。」
    "robin":
        "Three thin hungry VILLAGE CATS huddled together in a corner with empty paws and drooping ears, "
        "looking up hopefully. Dangdang has stopped in front of them, weight settled back, one rounded "
        "paw resting on the small drawstring fish pouch tied to his own sash and the other hanging at his "
        "side - he has not opened it yet, he is deciding. Four characters: him and the three plain "
        "village cats.",

    # ===== 村貓的謝宴 =====
    # 「村貓圍著一鍋魚湯，全都站起來招呼他。」
    "robin_feast":
        "A group of four scruffy VILLAGE CATS crowded round a big steaming pot of fish soup over a small "
        "fire - the steam drawn as solid cream-white free-form puffs, each with its own thick black "
        "outline and a ragged edge. All of them are up on their feet beaming to welcome Dangdang, one "
        "waving him over to a free place by the pot with both paws. Dangdang has just arrived at the edge "
        "of the group, one bracered forearm half raised in greeting, ears up, a small pleased smile. Five "
        "characters: him and the four plain village cats.",

    # ===== 閉關 =====
    # 「樓梯旁有間安靜的小房間，牆上刻滿練招留下的爪痕。噹噹推上門，總算找到一處能喘口氣的地方。」
    "seclusion":
        "A quiet corner of a small training room: two sections of stone wall meeting, both covered in "
        "deep old claw marks from years of practice, and a plain wooden door standing in one of them. "
        "Dangdang has just pushed the door shut behind him - one rounded paw still flat on the door - and "
        "has turned to look round the marked walls, shoulders coming down, his face going quiet with "
        "respect. He is the only cat in the picture.",

    # ===== 速成的卷軸 =====
    # ★他版：「牆上的卷軸墨跡未乾，大字寫著『一練就會』，下面只有一行『後果自負』。
    #          噹噹往下找了找，沒有更多說明。」（球球那版是踮腳讀最上面那行）
    "shortcut_scroll":
        "A long paper scroll nailed open flat against a section of stone wall, unrolled all the way down "
        "to the floor and covered in hurried scrawled brush marks, with one fat black drop of wet ink "
        "still running down it. Dangdang is down at the BOTTOM of the scroll, crouched low with one "
        "bracered forearm braced on the wall and the other rounded paw following the very last line "
        "along, head down and brows drawn - he has read to the end and there is nothing more there. He is "
        "the only cat in the picture.",

    # ===== 睡著的守衛 =====
    # 「一隻大橘貓靠著門邊打盹，腰間的錢袋鼓鼓的……身旁還留著一條能夠側身通過的窄路。」
    "sleeping_guard":
        "A huge fat ORANGE cat fast asleep sitting against a wooden door, a ring of keys and a fat coin "
        "purse hanging at its belt, one solid cream-white snore bubble at its nose drawn with its own "
        "thick black outline. A narrow gap is left between it and the door frame. Dangdang is tiptoeing "
        "through that gap on the tips of his hind feet, body turned sideways, both bracered forearms held "
        "up tight against his own chest so they cannot knock anything, cheeks puffed, holding his breath. "
        "Two characters only.",

    # ===== 硬要切磋的白貓 =====
    # 「一隻白貓抱著手臂擋住樓梯……噹噹想從旁邊走，白貓也跟著橫跨一步，硬是不肯讓路。」
    "sparring_cat":
        "A lean WHITE cat stands in the middle of the way with its arms folded and a cocky grin, and it "
        "has just stepped SIDEWAYS to cut Dangdang off again. Dangdang is caught mid-sidestep, weight on "
        "one foot, leaning the way he was trying to go past, one bracered forearm out for balance, "
        "looking at the white cat with flat unimpressed patience. Two characters only.",

    # ===== 卡住的小貓 =====
    # 「一隻小貓把頭伸進欄杆後縮不回來，後腳踩著地面，急得尾巴直甩。」
    "stuck_kitten":
        "A tiny tabby KITTEN with its head stuck between two wooden railings, its hind feet scrabbling on "
        "the floor and its tail lashing. Dangdang stands behind it with both rounded paws round the "
        "kitten's middle, leaning back, heels dug in, hauling steadily - a careful pull, not a yank. Two "
        "characters only.",

    # ===== 曬太陽 =====
    # ★他版：「窗縫透進陽光，在地上照出一塊暖暖的地方。噹噹坐得進去，護臂卻得先卸下，放到旁邊。」
    #        （球球那版是伸著懶腰走進光斑——**他要先卸護臂**，這就是 E 批那條例外用得上的地方）
    "sunbath":
        "A warm patch of sunlight lying on a stone floor, drawn as one flat solid warm cream-gold shape "
        "with a thick black outline and a ragged irregular edge - no fading and no soft glow - just big "
        "enough for one cat to sit in. **BOTH bronze bracers are OFF**: they are set down neatly side by "
        "side on the floor just outside the patch of light, buckle straps hanging loose, and both of them "
        "are clearly visible. Dangdang is settling down into the middle of the light with his BARE black "
        "forearms and white paws showing, one paw tucked under, eyes half closed, ears relaxed, thoroughly "
        "content. He is the only cat in the picture.",

    # ===== 留下買路財 =====
    # 「轉角站著一隻橘貓山賊，手裡的木棒比牠還長。『留下買路財！』牠喊得很大聲，兩條腿卻抖個不停。」
    "toll":
        "A plump ORANGE tabby cat bandit blocks the way, holding a wooden staff much longer than itself "
        "up in both paws and shouting at the top of its voice - mouth wide open - while its knees visibly "
        "knock together and three short solid judder lines with their own black outlines shake beside its "
        "legs. Dangdang stands facing it with both bracered forearms folded across his chest, weight "
        "settled, completely unimpressed. Two characters only.",

    # ===== 山賊帶朋友來了 =====
    # 「那隻橘貓山賊又站在轉角，這回帶了一群拿木棒的幫手。『上次是我大意！今天我們人多！』
    #  牠往前一步，身後的幫手卻一起往後縮。」
    "toll_again_fought":
        "The same scruffy ORANGE tabby cat bandit has taken ONE BIG STEP FORWARD, club up in both paws, "
        "mouth wide open shouting, chest out. **Behind him his two helpers are doing the opposite**: two "
        "more scruffy cat bandits leaning back and away, clubs sagging, ears flat, one half hidden "
        "behind the other, with short solid judder lines beside their knees. Dangdang faces the three of "
        "them with one bracered forearm raised across his body and the other drawn back at his waist, "
        "feet planted wide, completely steady. Four characters: him and the three cat bandits.",

    # ===== 山賊再現 =====
    # 「轉角又是那隻橘貓山賊。牠看見噹噹，趕緊把木棒放到一旁……牠捧出一個包裹，這次沒有擋路。」
    "toll_again_paid":
        "The same scruffy ORANGE tabby cat bandit has QUICKLY SET HIS WOODEN CLUB DOWN to one side - it "
        "leans against the wall behind him, well out of the way - and has stepped aside so the way past "
        "is clear. He holds a small cloth-wrapped PARCEL out toward Dangdang with both paws, head "
        "ducked, eyes shy and grateful, ears folded back. Dangdang stands in front of him with one "
        "rounded paw coming out to take it, brows up, mildly surprised. Two characters only.",

    # ===== 空的練功房 =====
    # ★他版：「練功房的地板上印著交錯的足跡。木樁人立在牆邊，後方櫃門沒關緊。噹噹沿足跡看了一圈。
    #          噹噹：『進來兩步，轉出去一步……有人在這裡練過。』」（球球那版是站進足跡裡照著擺架勢）
    "training_hall":
        "A patch of worn wooden training-hall floor with a trail of CROSSING FOOTPRINTS worn into the "
        "boards, curving away from us. A wooden practice dummy post stands at the back against a short "
        "section of wall, and behind it a cupboard door hangs slightly AJAR. Dangdang is walking slowly "
        "along the line of prints, bent forward at the waist, one rounded paw pointing down at the trail "
        "and his eyes following it ahead of him - he is READING the prints, not standing in them or "
        "copying a stance. He is the only cat in the picture.",

    # ===== 兵器架 =====
    # 「牆邊的兵器架積滿灰，大多數武器都已生鏽。幾件保養較好的兵器旁留著三幅演招圖；
    #  一隻推著空車的老鼠正探頭打量。」（球球那版踮腳取下一把兵器——**他不用兵器**）
    "weapon_rack":
        "A dusty wooden wall rack holding a row of weapons, most of them rusty, two or three still "
        "clean and gleaming. Pinned on the wall beside them are THREE small brush-drawn figure "
        # ★「兩隻護臂都要看得見」跟「手背在背後」打架（`art_rules.py` 檔頭第一條）。
        #   背在背後的話兩隻銅護臂全被身體擋住，那是他最招牌的東西。改成抱胸，一樣是「不去碰兵器」。
        "diagrams in a row. Dangdang stands in front of the rack with both bracered forearms folded "
        "across his chest and his head tipped up, studying the three diagrams - he does NOT touch the "
        "weapons and holds nothing. A small grey RAT with an empty handcart peers in from the right, "
        "sizing up the rusty ones. Two characters: him and the one small rat.",
}

# 這幾張要換開頭（理由見檔頭「三個場景要自己的開頭」）
SPECIAL_HEAD = {"mirror_hall": HEAD_MIRROR, "lost_kitten": HEAD_KITTEN, "old_master_ghost": HEAD_MASTER}
# 這張要換參考圖：畫面裡有大俠貓，單人設定表上沒有他
SPECIAL_REF = {"old_master_ghost": REF_STORY}


def wanted() -> list[str]:
    """該生哪幾張場景圖：菲菲那一櫃扣掉她自己那四篇，再扣掉結果圖。"""
    bg = json.loads(MANIFEST.read_text(encoding="utf-8"))["bg"]
    hers = [k[len("bg/event_feifei_"):] for k in bg if k.startswith("bg/event_feifei_")]
    own = re.compile(r"^(%s)(_r\d+)?$" % "|".join(HER_OWN))
    return sorted(x for x in hers if not own.match(x) and not re.search(r"_r\d+$", x))


def build(only: list[str]) -> dict[str, dict]:
    jobs: dict[str, dict] = {}
    for name in only:
        fid = f"event_dangdang_{name}.png"
        head = SPECIAL_HEAD.get(name, HEAD)
        ref = SPECIAL_REF.get(name, REF)
        jobs[fid] = {
            "prompt": head + "\nWHAT THIS PICTURE SHOWS: " + SCENES[name] + TAIL.format(fid=fid),
            "ref": str(ref.relative_to(ROOT)).replace("\\", "/"),
        }
    return jobs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='+', default=None, help='只出這幾張的工單（寫事件編號）')
    ap.add_argument('--redo', action='store_true',
                    help='已經有舊稿的先改名留底，不然 codex_gen 會直接跳過那幾張')
    ap.add_argument('--lines', type=int, default=4, help='拆成幾份工作檔（跑的時候一次最多兩條線）')
    ap.add_argument('--name', default=None, help='工作檔檔名前綴（預設 dangdang_shared）')
    args = ap.parse_args()

    only = args.only or list(SCENES)
    unknown = [n for n in only if n not in SCENES]
    if unknown:
        print(f"!! 沒有這幾張：{unknown}")
        print(f"   可用的：{' '.join(SCENES)}")
        return

    for p in (REF, REF_STORY):
        if not p.exists():
            print(f"!! 參考圖不存在：{p.relative_to(ROOT)}")
            return

    jobs = build(only)
    RAW.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime('%Y%m%d-%H%M')
    exists = [fid for fid in jobs if (RAW / fid).exists()]
    if exists and args.redo:
        for fid in exists:
            old = RAW / fid
            old.rename(old.with_name(f"{old.stem}.prev-{stamp}.png"))
        print(f"舊稿改名留底 {len(exists)} 張（.prev-{stamp}.png）")
        exists = []

    JOBS.mkdir(parents=True, exist_ok=True)
    prefix = args.name or 'dangdang_shared'
    lines = max(1, args.lines)
    names = list(jobs)
    for i in range(lines):
        part = {n: jobs[n] for n in names[i::lines]}
        if not part:
            continue
        out = JOBS / f"{prefix}_{i + 1}.json"
        out.write_text(json.dumps(part, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f"{len(part):>2} 張 → {out.relative_to(ROOT)}")
    print(f"合計 {len(jobs)} 張")

    # 自檢一：這支寫的清單跟 manifest 撈出來的對不對得上。不中止（工作檔上面已經寫出去了）
    want = wanted()
    missing = [n for n in want if n not in SCENES]
    orphan = [n for n in SCENES if n not in want]
    if missing or orphan:
        print("\n" + "!" * 70)
        if missing:
            print(f"她有、這支沒有（{len(missing)} 張，生完他還是退回球球那張）：{' '.join(missing)}")
        if orphan:
            print(f"這支有、她沒有（{len(orphan)} 張，多半是打錯字，生了也沒人用）：{' '.join(orphan)}")
        print("!" * 70)
    else:
        print(f"清單對得上 manifest 撈出來的 {len(want)} 張場景圖")

    # 自檢二：每一張都要有他那一版的文案對照（紙箱那三張不是事件，沒有文案是正常的）
    if TEXT.exists():
        text = json.loads(TEXT.read_text(encoding='utf-8'))
        nodoc = [n for n in SCENES if n not in text and not n.startswith('chest_')]
        if nodoc:
            print(f"\n!! 這 {len(nodoc)} 張在 {TEXT.name} 裡查不到他的文案，畫面對不對得上沒人驗："
                  f"{' '.join(nodoc)}")
    else:
        print(f"\n!! {TEXT.name} 不在。先跑："
              "\n   DUMP_DANGDANG=1 npx vitest run tools/dump_dangdang_events.test.ts")

    # 自檢三：舊稿擋路
    if exists:
        print("\n" + "!" * 70)
        print(f"這 {len(exists)} 張 tools/codex_raw 裡已經有舊稿，codex_gen.py 會直接跳過、不會重生：")
        for fid in exists:
            print(f"  {fid}")
        print("要重生請加 --redo（會先改名留底），或自己把舊稿改名。")
        print("!" * 70)


if __name__ == '__main__':
    main()
