# -*- coding: utf-8 -*-
"""噹噹（黑白賓士貓）的 G 批牌面工單——**共用牌的他版**，114 張。

這一批是什麼
------------
共用牌（沒有 `hero` 欄位、三個角色都抽得到的那些）現在玩噹噹的人看到的是**球球的圖**。
菲菲早就全部分家過一輪了（`make_feifei_shared_card_jobs.py`），這支是同一件事換他做。

清單**從 `public/assets/manifest.json` 撈**，不是手打的：凡是有 `card/feifei_<牌號>`、
而 `<牌號>` 又真的是一張**共用牌**（`src/content/cards.ts` 裡沒有 `hero` 欄位）的，
就代表那張牌需要角色分家的版本，他也要一張 `card/dangdang_<牌號>`。

  她那 146 個鍵 = 26 張她的專屬牌（`feifei_*` 本來就是牌號的一部分）
                 + 3 張帶 `hero` 的（`yingzi`／`biepengzhenjian`／`woyouxianbeihao`）
                 + **117 張共用牌的她版**

⚠️ **117 減 3 等於 114**，那 3 張是撞名的（見下面）。

⚠️ 撞名：三張共用牌永遠拿不到他自己的圖（這支刻意不生）
-------------------------------------------------------
**（已解，下面留著當教訓）** 他那三張專屬牌後來改了牌號（`dangdang_zhanzhuang` 站樁、
`dangdang_jieliqi` 借力…），`shared_ids()` 判撞名看的是「牌號還在不在」，所以三張現在都會進清單。
連環踢跟著 G 批生了；卸勁、護心兩張 2026-09-17 晚上才補（`--only jieli huxin`）。

`cardArtKey()` 的規則是「`card/X` → `card/dangdang_X`，有就用」。
**他的 29 張專屬牌的牌號本身就是 `dangdang_*` 開頭**（`dangdang_huxin` 站樁、
`dangdang_lianhuan` 連環撞、`dangdang_jieli` 借力），插圖鍵剛好等於
共用牌 `huxin`／`lianhuan`／`jieli` 換算出來的鍵：

  | 共用牌 | 換算出來的鍵 | 這個鍵已經被誰佔走 |
  |---|---|---|
  | `huxin` 絕學·護心 | `card/dangdang_huxin` | 他的專屬牌「站樁」 |
  | `lianhuan` 忍術·連環踢 | `card/dangdang_lianhuan` | 他的專屬牌「連環撞」 |
  | `jieli` 絕學·卸勁 | `card/dangdang_jieli` | 他的專屬牌「借力」 |

所以他抽到共用的「絕學·護心」時，牌面會顯示「站樁」那張圖。**這是 `src/` 那邊的問題**
（菲菲沒踩到純粹是因為她的專屬牌號本來就帶 `feifei_` 前綴），這支不碰 `src/`，
只是**不生這三張**——生了會直接蓋掉他三張專屬牌的圖，那比顯示錯圖更糟。

怎麼寫這些提示詞
----------------
**照菲菲那支的做法回收原本的提示詞，只換角色**（`make_feifei_shared_card_jobs.py` 的檔頭）：
那 114 段早就調到位了（大物件佔多少、貓佔多少、填滿畫面、縮圖可讀、綠幕），
重寫一次只會弄丟那些調整。所以這支做的是：

  1. 從 `tools/codex_jobs/*.json` 撈出每張牌**球球那版**的提示詞；
  2. 把描述球球的那兩塊（清單裡那一條＋獨立那一段）換成他，長相只從 `LOOK` 拿一份；
  3. 補上 B 批（`make_dangdang_card_jobs.py`）定下來的**兩條硬規則**——
     舊的提示詞寫的是「flat colors with subtle soft gradients」，那正好是 B 批踩過的兩個雷：
       - **特效一律要有黑外框的實心形狀**（沒有外框的柔光會暈進綠幕、去背去不掉，
         B 批的「穩住」量到 5.97% 可見像素帶綠）；
       - **兩個顏色之間不要漸層**（漸層會從綠色經過，B 批的「借力」整片變綠）。
  4. 逐張修正（`SCENE_FIX`）：動作與顏色。
  5. 輸出檔名改成 `card_dangdang_<牌號>.png`。

「大物件是什麼、貓在做什麼」那兩句**原樣保留**——那是這張牌的識別，換角色不該換。

動作怎麼換（最容易做過頭的地方）
--------------------------------
他的動作語彙是**護臂、拳、掌、站樁、硬碰硬、卸力、搬東西**；**不用暗器、不伸爪抓、不用毒**。
但是——**他的牌名跟球球一模一樣**（`cardNameFor()` 只有菲菲那一支分岔，沒有他的對照表），
所以判準只有一條：

  **名字沒改，圖就不能改到跟名字對不上。**

這正是菲菲那邊踩過的雷倒過來（她的「連環針」配了一張飛踢的圖，因為名字換了圖沒換）。
於是：

  - **名字點名了那個動作或那件武器的**（迴旋踢、拋爪、手裏劍亂舞、踩尾巴、毛球彈、
    九尾拳、鐵砂掌、獅吼功…）→ **原封不動**，只換長相。改了就變成「牌名寫踢、圖在打拳」。
  - **畫的是球球自己伸出爪子、而名字沒要求爪子的** → 換成護臂或拳掌
    （背刺、點穴手、落葉、刺蝟身、追擊、扼喉、聚葉成刀、幫你一把、你也抽一張、照你說的打）。
  - **頭帶**：他沒有頭帶，兩張寫到「headband tails」的改成腰帶尾。

`亮出爪子` 是唯一一張兩邊都對不齊的：名字有「爪」、圖畫的也是他自己的爪子。
依使用者「不伸爪抓」的明示改成握拳＋護臂發亮，**名字與圖的落差寫進交付報告**。

顏色：綠色一律換掉
------------------
`codex_gen.py` 坑 5——提示詞裡不要出現綠色。球球那批有 9 張主色寫的是綠、青綠或黃綠
（新鮮綠的腳印、薄荷綠的繃帶、酸綠的爪痕、青綠的牌…），畫在綠幕上等於自殺。
這支逐張換掉，換成的顏色寫在 `SCENE_FIX` 裡。
**他的青綠短褂不算特效**，這一句一定要留著，不然「整張不准有綠色」會跟他的衣服打架。

跑法
----
  python tools/make_dangdang_gcard_jobs.py                 # 產 8 份工作檔（分四小批、每批兩條線）
  python tools/codex_gen.py tools/codex_jobs/dangdang_gcards_1.json --ref tools/ref/dangdang_ref.png
  python tools/codex_gen.py tools/codex_jobs/dangdang_gcards_2.json --ref tools/ref/dangdang_ref.png
  （**一次最多兩條**，`codex_gen.py` 坑 1。跑完一小批先拼聯絡表看過再跑下一批。）

  只重生幾張：python tools/make_dangdang_gcard_jobs.py --only beici luoye --redo --lines 1
  （`--redo` 會把舊稿改名留底。不加的話 `codex_gen.py` 看到檔案已存在就整張空轉，
    印的還是「已存在跳過」、離開碼 0，看起來像成功——`art_rules.py` 第九個雷。）

**自檢一律不寫成 `SystemExit`**（使用者 2026-09-17 明示）：工作檔一定會先寫出去，
對不上的地方印成一塊醒目的清單。
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import NO_PANEL  # noqa: E402

RAW = ROOT / "tools" / "codex_raw"
JOBS = ROOT / "tools" / "codex_jobs"
REF = ROOT / "tools" / "ref" / "dangdang_ref.png"
MANIFEST = ROOT / "public" / "assets" / "manifest.json"
CARDS_TS = ROOT / "src" / "content" / "cards.ts"

# ---------------------------------------------------------------------------
# 他長什麼樣：跟 A／B 批**同一份**，指著參考圖配一張只寫正面的辨識清單
# ---------------------------------------------------------------------------
# 抄三份遲早有一份會漏（`art_rules.py` 第六個雷）。B 批那份寫在
# `make_dangdang_card_jobs.py` 的 `LOOK`，這裡是同樣一段換成適合「插進舊模板」的排版。
LOOK_PARA = (
    "THE CHARACTER is the black-and-white TUXEDO CAT in the attached reference image. "
    "**Copy his design straight from the reference** - the same fur pattern, the same clothes, the same "
    "colours, the same chibi proportions and the same drawing. Do not redesign him. These are the things "
    "players recognise him by, and every one of them belongs in your picture:\n"
    "black fur with a WHITE STRIPE running down the middle of his face, a white muzzle, a white chest, "
    "white paws and white feet; AMBER-GOLD eyes; a sleeveless TEAL-GREEN Chinese jacket with a cream "
    "border and dark toggle fastenings down the front; a BROWN cloth sash knotted at his waist with the "
    "ends hanging down; **a round BRONZE BRACER on EACH of his two forearms** - they are his weapon and "
    "the first thing players look for, so both of them are in every picture; dark trousers with cloth "
    "wrapped around each ankle. He has NO headband of any kind.\n"
    "HE FIGHTS WITH THOSE TWO BRACERS: he punches, blocks, sweeps and pushes with his forearms and palms. "
    "His paws stay rounded and closed - no claws out, nothing held in his paws unless this card says so.\n"
    "HIS EYES: amber-gold with a glossy white highlight; when both eyes show they match each other in size "
    "and shape, and from the side the far eye is behind his head, which is correct.\n")

# 清單裡那一條（原本是「Same grey tabby markings, same navy headband…」）。
# 縮排交給 `look_bullet()` 依原文補，單貓版是三格、雙貓版是兩格。
LOOK_BULLET_LINES = (
    "- He is a BLACK-AND-WHITE TUXEDO CAT, not a grey tabby: black fur with a WHITE STRIPE down the",
    "  middle of his face, a white muzzle, a white chest, white paws and white feet, AMBER-GOLD eyes.",
    "- He wears a sleeveless TEAL-GREEN Chinese jacket with a cream border and dark toggle fastenings,",
    "  a BROWN cloth sash knotted at his waist, dark trousers with cloth wrapped round each ankle.",
    "  **He has NO headband.**",
    "- **A round BRONZE BRACER on EACH of his two forearms** - they are his weapon and the first thing",
    "  players look for, so BOTH of them are visible in every picture.",
    "- Same thick black outline and same flat colouring as the reference.",
)


def look_bullet(pad: str) -> str:
    return "".join(f"{pad}{line}\n" for line in LOOK_BULLET_LINES)

# ---------------------------------------------------------------------------
# B 批定下來的兩條硬規則 + 平塗樣式。舊模板寫的是「flat colors with subtle soft gradients」，
# 那句正好同時踩到兩個雷，所以整句換掉。
# ---------------------------------------------------------------------------
STYLE_BLOCK = (
    "**NONE OF THE ENERGY IN THIS PICTURE MAY BE GREEN OR GREENISH.** Glows, shields, impacts, sparks, "
    "smoke, dust and motion streaks are drawn in the colours this card names, never green and never "
    "yellow-green. Never blend or fade one effect colour into another either - a gradient between two "
    "colours drifts through green on its way. (The picture sits on a green screen: anything green gets "
    "erased by the chroma key and leaves a hole.) His TEAL-GREEN jacket is part of his design and stays "
    "exactly as the reference draws it - the jacket is not an effect and this rule does not touch it.\n"
    "**EVERY EFFECT HAS A THICK BLACK OUTLINE ROUND ITS EDGE**, the same weight as the outline round the "
    "cat, and ends at that outline. Do not put a soft halo, bloom, haze or fading glow outside it: a soft "
    "edge blends into the green background and that blended ring survives the chroma key as a fluorescent "
    "green fringe.\n"
    "Style: thick black outlines, FLAT colours with only subtle soft shading - do NOT render it painterly, "
    "do NOT use heavy airbrushed shadows or a rendered-illustration look. Cute cartoon, not photorealistic.\n"
    "THE FACE ESPECIALLY: draw the face in FLAT blocks of colour with hard edges between them. Where the "
    "black fur and the white face stripe meet that is a CLEAN EDGE, never a soft airbrushed fade.\n")

# ---------------------------------------------------------------------------
# 要換掉的錨點（都在 90 張單貓版或 24 張雙貓版的模板裡逐字出現過，`main()` 會逐張驗）
# ---------------------------------------------------------------------------
HDR_ONE = "showing a grey tabby cat ninja in action."
HDR_TWO = "showing TWO grey tabby cat ninjas."
BULLET_RE = re.compile(
    r"^([ ]{2,3})- Same grey tabby markings, same navy headband with two trailing tails, same thick black outline,\n"
    r"[ ]+same flat colouring, same navy ninja outfit as the reference\.(?: BOTH of them\.)?\n", re.M)
PARA_ONE = ("The cat: light grey tabby fur with dark grey stripes, white chest and paws, narrow half-lidded eyes,\n"
            "a NAVY BLUE ninja headband with two trailing tails, a dark navy ninja outfit with a dark belt, "
            "long ringed tail.\n")
PARA_TWO = ("Each cat: light grey tabby fur with dark grey stripes, white chest and paws, a NAVY BLUE ninja headband\n"
            "with two trailing tails, a dark navy ninja outfit with a dark belt, long ringed tail.\n")
STYLE_OLD = "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.\n"
# 模板那條「大而圓的眼睛、**深色大瞳孔**」是照球球寫的，跟他的琥珀色眼睛打架
#（`art_rules.py` 檔頭第一條：規則寫太死會跟外觀敘述打架）。只拿掉瞳孔顏色那半句，
# 「大而圓、不要瞇瞇眼」留著——那是比例的要求，兩隻貓都適用。
# ★ 單貓版縮三格、雙貓版縮兩格，所以錨點一律用正規表示式抓縮排，不要寫死空白數
#（第一版寫死三格，24 張雙貓牌全部沒換到，自檢當場喊出來）。
EYES_RE = re.compile(r"^([ ]{2,3})- The eyes are LARGE and ROUND with big dark pupils\. "
                     r"Do not draw narrow slit eyes\.\n", re.M)
BG_LINE = "Background must be a solid pure green (#00FF00), completely flat, for chroma keying.\n"

# ---------------------------------------------------------------------------
# 逐張修正
# ---------------------------------------------------------------------------
# **一定要寫在這裡，不要直接改產生出來的 JSON**——那個檔案每次重跑就整個蓋掉
#（菲菲那支的檔頭寫過這個教訓，2026-09-12 手改的東西隔天重跑就被洗掉）。
#
# 每張是一串 (原文, 新文) 對，每一對在轉換後的提示詞裡要剛好出現一次；對不上會印出來。
SCENE_FIX: dict[str, list[tuple[str, str]]] = {
    # ===== 一、球球在伸自己的爪子，而牌名沒有要求爪子 → 換成護臂／拳／掌 =====
    "beici": [(
        "What the cat is doing: appearing right behind the shadow with claws out, striking the glowing "
        "slash mark on its back",
        "What the cat is doing: appearing right behind the shadow and driving one bronze-bracered forearm "
        "into the glowing slash mark on its back, elbow leading, the other fist pulled in tight at his "
        "chest. **No claws out** - the bracer is what lands")],
    "dianxue": [(
        "What the cat is doing: lunging with one arm fully extended and a single claw out, the claw tip "
        "planted exactly at the bright centre of the rings, its face set in fierce concentration",
        "What the cat is doing: lunging with one bracered arm fully extended and ONE knuckle pushed out "
        "ahead of the closed paw, that knuckle planted exactly at the bright centre of the rings, his face "
        "set in fierce concentration. **No claws out** - a single hard knuckle on the pressure point")],
    "luoye": [(
        "What the cat is doing: dropping through the leaves head-first with one claw extended, cutting "
        "through them",
        "What the cat is doing: dropping through the leaves head-first with one bronze-bracered forearm "
        "held out ahead of him, the bracer cutting a clean parting through them. **No claws out**")],
    "zhuiji": [(
        "What the cat is doing: sprinting flat-out along the trail, one arm outstretched with claws "
        "forward, chasing something off the edge of the picture",
        "What the cat is doing: sprinting flat-out along the trail, one bronze-bracered forearm "
        "outstretched with the fist forward, chasing something off the edge of the picture. "
        "**No claws out**")],
    "ehou": [(
        "What the cat is doing: lunging in and clamping one paw firmly on the throat of the shadow, the "
        "other paw raised with claws out, fierce expression",
        "What the cat is doing: lunging in and pinning the shadow's throat with one bronze-bracered "
        "FOREARM pressed hard across it, the other paw balled into a cocked fist ready to follow up, "
        "fierce expression. **No claws out anywhere**")],
    "fanzhua": [
        ("1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in SILVER GREY: a fan of five "
         "gleaming silver claws flipped outward, splayed wide",
         "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in SILVER GREY: a fan of five "
         "short gleaming silver SPIKES snapped up along the rim of a bronze bracer, splayed wide like a "
         "hedgehog's quills. **They are spikes on the armour, not claws on a paw**"),
        ("What the cat is doing: flipping its paw over to reveal the claws, looking sideways at them with "
         "a small satisfied smirk",
         "What the cat is doing: turning his bracered forearm over so the row of spikes snaps up along "
         "it, looking sideways at them with a small satisfied smirk. His paw stays rounded and closed"),
    ],
    "juye": [
        ("1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in OLIVE BRONZE: a fan of five "
         "bronze leaf-shaped blades spread out in an arc, edges gleaming",
         "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in WARM BRONZE AND CREAM: a fan "
         "of five bronze leaf-shaped blades spread out in an arc, edges gleaming"),
        ("What the cat is doing: flicking the blades out from between the toes of one raised paw, eyes "
         "locked forward",
         "What the cat is doing: sweeping one bronze-bracered forearm across in front of him so the five "
         "blades fan out off the rim of that bracer, eyes locked forward. **The blades come off the "
         "bracer, not from between his toes** - no claws out"),
    ],
    # 名字有「爪」、圖畫的也是他自己的爪——使用者「不伸爪抓」優先，落差寫進報告
    "liangzhua": [
        ("1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in PLATINUM WHITE: one huge "
         "white paw held up with all claws fully extended and gleaming",
         "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in PLATINUM WHITE: one huge "
         "white paw held up and balled into a tight fist, knuckles forward, with the round BRONZE BRACER "
         "on that forearm blazing with a hard platinum gleam and three short solid platinum spark-flecks "
         "snapping off it. **The paw is closed - no claws out**"),
        ("What the cat is doing: holding that paw up beside its own face, head tilted, giving a "
         "deliberately menacing stare",
         "What the cat is doing: holding that fist up beside his own face, head tilted, giving a "
         "deliberately menacing stare"),
    ],
    # ===== 二、雙貓（連線）牌裡球球在伸爪 =====
    "bangnisheme": [(
        "hot orange energy flows out of his paws into the right cat, whose claws flare bright orange and "
        "whose face lights up. The orange clearly starts at the left cat's paws and ends at the right "
        "cat's claws.",
        "hot orange energy flows out of his paws into the right cat, whose two BRONZE BRACERS flare "
        "bright orange and whose face lights up. The orange clearly starts at the left cat's paws and "
        "ends at the right cat's bracers. **Neither cat has claws out.**")],
    "niyechouyizhang": [(
        "the LEFT cat flicks a cream-coloured card across the frame with one claw",
        "the LEFT cat flicks a cream-coloured card across the frame off the back of one rounded paw, "
        "the bronze bracer on that forearm leading the flick (**no claws out**)")],
    # ===== 三、主色是綠、青綠或黃綠的 → 全部換掉（codex_gen.py 坑 5）=====
    # 畫在綠幕上的綠色特效，去背後就是一個洞。換成的顏色跟這張牌在講的事對得上就好。
    # 單貓版的模板**沒有**「The dominant colour of the picture is …」那一行（只有雙貓版有），
    # 所以這張只換大物件那一行。第一版照雙貓版寫，自檢當場喊「出現 0 次」。
    "wufeng": [(
        "rendered in CALM PALE TEAL: a wide still ring of pale teal water with not one ripple",
        "rendered in CALM PALE PERIWINKLE BLUE: a wide still ring of pale periwinkle-blue water with "
        "not one ripple")],
    "maoqiudan": [(
        "rendered in MUDDY GREY-GREEN: a giant matted hairball as big as the cat, with a few loose hair "
        "strands and a sickly greenish glow",
        "rendered in MUDDY BROWN-GREY AND MUSTARD OCHRE: a giant matted hairball as big as the cat, with "
        "a few loose hair strands and a sickly MUSTARD-OCHRE haze clinging round it in irregular wisps")],
    "cuiye": [(
        "rendered in SICKLY YELLOW-GREEN: a giant bulging throat-shaped blob with two large hairballs "
        "stuck inside it, swollen to double size, with sweat drops",
        "rendered in DEEP VIOLET: a giant bulging throat-shaped blob with two large hairballs stuck "
        "inside it, swollen to double size, with sweat drops")],
    "jienicailiangbu": [
        ("landing on a short flight of glowing pale-green paw-print stepping stones",
         "landing on a short flight of solid WARM AMBER GOLD paw-print stepping stones, each one a flat "
         "filled shape with a thick black outline"),
        ("The dominant colour of the picture is FRESH GREEN.",
         "The dominant colour of the picture is WARM AMBER GOLD."),
    ],
    "shoujiewoyixia": [
        ("winds a mint-green healing bandage around the RIGHT cat's raised forepaw",
         "winds a ROSE-CRIMSON healing bandage around the RIGHT cat's raised forepaw"),
        ("The dominant colour of the picture is SOFT MINT GREEN.",
         "The dominant colour of the picture is ROSE CRIMSON."),
    ],
    "huannieduochoudian": [
        ("two fresh teal cards fly across to the RIGHT cat",
         "two fresh CORNFLOWER-BLUE cards fly across to the RIGHT cat"),
        ("The dominant colour of the picture is BRIGHT TEAL.",
         "The dominant colour of the picture is BRIGHT CORNFLOWER BLUE."),
    ],
    "nimangwobuwei": [
        ("calmly drawing a fresh teal card that floats up beside its head",
         "calmly drawing a fresh CORNFLOWER-BLUE card that floats up beside his head"),
        ("The dominant colour of the picture is BRIGHT TEAL.",
         "The dominant colour of the picture is BRIGHT CORNFLOWER BLUE."),
    ],
    # 酸綠的爪痕：顏色與動作一起換（這張是「同伴指、我打」）
    "zhaonishuodeda": [
        ("the LEFT cat is already mid-strike in exactly that direction, an acid-green slash trailing from "
         "its paw",
         "the LEFT cat is already mid-strike in exactly that direction, a solid DEEP-VIOLET impact burst "
         "blooming off his bronze-bracered forearm (**no claws out** - the bracer is what lands)"),
        ("The dominant colour of the picture is ACID GREEN.",
         "The dominant colour of the picture is DEEP VIOLET."),
    ],
    # 「拋爪」的爪是**鉤爪這件工具**，不是他自己的爪子。牌名有「爪」所以工具留著，
    # 但要寫死是金屬鉤子，不然模型很容易改畫成他伸出爪子丟出去。
    "paozhao": [(
        "rendered in MUSTARD YELLOW: a mustard-yellow claw on a long taut line, thrown out and hooked "
        "into something off-frame",
        "rendered in MUSTARD YELLOW: a mustard-yellow metal GRAPPLING HOOK - a three-pronged iron claw on "
        "the end of a long taut rope - thrown out and hooked into something off-frame. **It is a tool "
        "made of metal, not the cat's own claws**")],
    # 第一版實際生出來**嘴邊那口白氣被畫成綠的**（2026-09-17 第一小批八張裡唯一的瑕疵）。
    # 病根：原文只寫「breath visible」沒指定顏色——`art_rules.py` 第三個雷寫得很清楚，
    # 沒指定顏色時模型會自己挑到綠色。所以把那口氣的顏色與外框都寫死。
    "dingshen": [(
        "braced low, breath visible, having just frozen it solid",
        "braced low, having just frozen it solid; one puff of CREAMY WHITE breath leaves his mouth, drawn "
        "as a solid flat shape with a THICK BLACK OUTLINE - that breath is never green and never "
        "see-through")],
    # 卸勁：球球那版是翡翠綠的太極漩渦，畫在綠幕上會被挖掉。這張是「蜷縮＋翻肚」，
    # 換成他牌面裡代表蜷縮的淡冰藍（B 批的顏色語彙）。
    "jieli": [(
        "rendered in JADE GREEN: a large swirling yin-yang shaped vortex of green energy with two curved "
        "arrows showing force being turned aside",
        "rendered in PALE ICE BLUE: a large swirling yin-yang shaped vortex of solid pale ice-blue energy "
        "with two curved arrows showing force being turned aside, every swirl a flat filled shape with a "
        "thick black outline")],
    # 護心：原文「尾巴蓋住鼻子」會把臉遮掉，跟下面「縮成一團」是同一個雷；
    # 縮起來時兩個護臂也最容易被畫丟，一起寫死。
    "huxin": [(
        "What the cat is doing: curled up inside the shield shape, tail over its nose, safe",
        "What the cat is doing: curled up snug inside the shield shape, safe, his tail wrapped round his "
        "feet. **HIS FACE MUST BE FULLY VISIBLE** with his eyes calmly closed - the tail does not cover it. "
        "His two forearms are folded in front of his chest so BOTH bronze bracers show")],
    # 「縮成一團」：球球那版的原文是「完全縮進毯子裡，只露出耳朵跟尾巴尖」，
    # 模型照做的結果就是**一坨看不出裡面有貓的棕色**（第一次生出來只看得到兩隻耳朵、
    # 一截尾巴、兩個護臂）。菲菲那批踩過一模一樣的雷、也是靠「臉一定要露出來」修好的
    #（`make_feifei_shared_card_jobs.py` 的 SCENE_FIX 第一條）。縮圖上要一眼看得懂有隻貓縮在裡面。
    "suoyituan": [(
        "What the cat is doing: rolled into a ball completely under the blanket so only its ears and the "
        "tip of its tail stick out",
        "What the cat is doing: curled into a ball with the blanket pulled up and over him like a cocoon. "
        "**HIS HEAD AND FACE MUST BE FULLY VISIBLE**, poking out of the front of the cocoon with his eyes "
        "shut tight and his ears up, and one bronze bracer hooked over the edge of the blanket holding it "
        "closed. If the blanket covers his face the picture is wrong - a viewer must be able to tell at a "
        "glance that there is a cat curled up in there")],
    # ===== 四、他沒有頭帶 =====
    "tieshazhang": [(
        "sand blowing back past its headband tails",
        "sand blowing back past the hanging ends of his brown sash")],
    "doumao": [(
        "eyes squeezed shut, headband tails whipping around",
        "eyes squeezed shut, the ends of his brown sash whipping around")],
    # ===== 五、球球丟出去的暗器，而牌名沒有點名那件武器 =====
    # 「失手了」講的是出手落空，不是「手裏劍掉了」——換成他掉了一片護臂，名字一樣成立
    "shishou": [
        ("rendered in ASH GREY: an ash-grey shuriken lying flat on the ground having missed, with a small "
         "puff of dust beside it",
         "rendered in ASH GREY: an ash-grey BRONZE BRACER PLATE lying flat on the ground where it came "
         "loose and fell, its torn strap beside it, with a small puff of dust"),
        ("What the cat is doing: staring down at the dropped shuriken with a flat blank face, one paw "
         "still frozen in the throw pose",
         "What the cat is doing: staring down at the dropped plate with a flat blank face, one forearm - "
         "now bare where that bracer should be - still frozen at the end of a punch that missed"),
        # 「a small puff of dust」沒寫顏色＝模型會自己挑到綠（第三個雷，`dingshen` 就中了）
        ("with a small puff of dust", "with a small puff of WARM GREY dust, drawn as a solid flat shape "
                                      "with a thick black outline"),
    ],
    "fanpu": [(
        "shaking dust off its paws",
        "shaking a few CREAMY WHITE dust flecks off his paws, each fleck a solid flat shape with a thick "
        "black outline")],
    # 「撒手鐧」＝把最後的傢伙也豁出去。他豁出去的就是自己的護臂，跟名字完全對得上
    "sashoujian": [
        ("rendered in GUNMETAL AND ORANGE: a gunmetal blade snapped off at the hilt, the broken piece "
         "flying forward with orange sparks",
         "rendered in BRONZE AND ORANGE: a BRONZE BRACER torn off its straps and hurled forward through "
         "the air, its cut straps still whipping behind it, trailing orange sparks"),
        ("What the cat is doing: having just thrown the broken blade, arm extended and empty hilt still "
         "in its other paw",
         "What the cat is doing: having just hurled his own bracer, that forearm fully extended and BARE, "
         "the other forearm still wearing its bracer"),
    ],
}

# 名字點名了動作或武器、所以**刻意不改**的那些（報告與自檢都用得到）
KEEP_ON_PURPOSE = {
    "huixuan": "忍術·迴旋踢——名字就是踢",
    "luanwu": "忍術·手裏劍亂舞——名字就是手裏劍",
    "paozhao": "忍術·拋爪——鉤爪是工具不是他的爪子，動作本來就沒有伸爪",
    "caiweiba": "忍術·踩尾巴——名字就是踩",
    "maoqiudan": "忍術·毛球彈——貓吐毛球，不是下毒（只換掉綠色）",
    "maoqiu": "吐毛球——同上",
    "tieshazhang": "絕學·鐵砂掌——本來就是掌，正好是他的語彙（只改頭帶）",
    "jiuweiquan": "絕學·九尾拳——本來就是拳",
    "bengquan": "絕學·崩拳——本來就是拳",
    "dieda": "絕學·貓爪抓——畫的是藥杵藥臼，圖裡本來就沒有爪子",
    "youcike": "有刺客——手裏劍是別人插在那裡的，不是他丟的",
    "tianmao": "舔毛／嘴饞／眼冒金星——伸舌頭是貓的動作，不在禁用清單裡",
}


def shared_ids() -> tuple[list[str], list[str], dict[str, str]]:
    """從 manifest 撈清單。回傳（要生的、撞名不生的、牌號→牌名）。

    判準完全照 `cardArtKey()`：有 `card/feifei_X` 就代表 X 這張牌需要角色分家。
    再用 `cards.ts` 把「她的專屬牌」與「帶 hero 欄位的」濾掉——那些不是共用牌。
    """
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    keys = m["cards"]
    src = CARDS_TS.read_text(encoding="utf-8")
    # 每一張牌定義：id 與（有沒有）hero
    defs: dict[str, str | None] = {}
    names: dict[str, str] = {}
    for line in src.splitlines():
        mo = re.search(r"\{ id: '([\w]+)', name: '([^']+)'", line)
        if not mo:
            continue
        hero = re.search(r"hero: '(\w+)'", line)
        defs[mo.group(1)] = hero.group(1) if hero else None
        names[mo.group(1)] = mo.group(2)
    want, clash = [], []
    for k in keys:
        if not k.startswith("card/feifei_"):
            continue
        base = k[len("card/feifei_"):]
        if base not in defs or defs[base] is not None:
            continue                                   # 她的專屬牌，或帶 hero 欄位的，不是共用牌
        # ★ 撞名的判準是「`dangdang_<牌號>` 本身就是**他一張專屬牌的牌號**」，
        #   不是「manifest 裡已經有這個鍵」——這一批進倉之後每一張都有那個鍵了，
        #   用後者判會把 114 張全部當成撞名（第一次重生 `suoyituan` 就被擋在門外）。
        (clash if f"dangdang_{base}" in defs else want).append(base)
    return sorted(want), sorted(clash), names


def collect() -> dict[str, str]:
    """從所有舊工作檔撈出每張牌**球球那版**的提示詞（後面的檔會蓋掉前面的＝用最新那版）。"""
    got: dict[str, str] = {}
    for f in sorted(glob.glob(str(JOBS / "*.json"))):
        try:
            j = json.loads(Path(f).read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(j, dict):
            continue
        for k, v in j.items():
            if not isinstance(v, str) or not k.startswith("card_"):
                continue
            if k.startswith(("card_feifei", "card_dangdang", "card_paper_")):
                continue
            got[k[len("card_"):-len(".png")]] = v
    return got


def convert(prompt: str, cid: str, warn: list[str]) -> str:
    p = prompt
    p = p.replace(HDR_ONE, "showing ONE black-and-white tuxedo cat in action.", 1)
    p = p.replace(HDR_TWO, "showing TWO black-and-white tuxedo cats.", 1)
    # 縮排照原文（單貓版三格、雙貓版兩格），不然換進去的清單會跟上下兩條對不齊
    mo = BULLET_RE.search(p)
    if mo:
        p = p[:mo.start()] + look_bullet(mo.group(1)) + p[mo.end():]
    else:
        warn.append(f"{cid}: 清單裡描述球球那一條沒換到")
    p, n = EYES_RE.subn(lambda m: f"{m.group(1)}- The eyes are LARGE and ROUND. "
                                  f"Do not draw narrow slit eyes.\n", p, count=1)
    if not n:
        warn.append(f"{cid}: 眼睛那一行沒換到（深色瞳孔會跟琥珀眼打架）")
    if PARA_ONE in p:
        p = p.replace(PARA_ONE, LOOK_PARA, 1)
    elif PARA_TWO in p:
        p = p.replace(PARA_TWO, "BOTH CATS ARE THE SAME CAT, TWICE. " + LOOK_PARA, 1)
    else:
        warn.append(f"{cid}: 描述球球那一段沒換到")
    if STYLE_OLD in p:
        p = p.replace(STYLE_OLD, STYLE_BLOCK, 1)
    else:
        warn.append(f"{cid}: 樣式那一行沒換到（兩條硬規則沒補上）")
    if "never as a block with straight edges" not in p:
        p = p.replace("Output 1024x820 PNG.", NO_PANEL + "Output 1024x820 PNG.", 1)
    p = p.replace(f"card_{cid}.png", f"card_dangdang_{cid}.png")
    return p


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="+", default=None, help="只出這幾張的工單（寫牌號）")
    ap.add_argument("--redo", action="store_true",
                    help="已經有舊稿的先改名留底，不然 codex_gen 會直接跳過那幾張")
    ap.add_argument("--lines", type=int, default=8, help="拆成幾份工作檔（預設 8＝四小批、每批兩條線）")
    ap.add_argument("--name", default="dangdang_gcards", help="工作檔檔名前綴")
    args = ap.parse_args()

    want, clash, names = shared_ids()
    prompts = collect()

    print(f"從 manifest 撈到共用牌的菲菲版 {len(want) + len(clash)} 張")
    if clash:
        print("\n" + "!" * 78)
        print(f"這 {len(clash)} 張**刻意不生**：牌號換算出來的鍵已經被他自己的專屬牌佔走了，")
        print("生下去會直接蓋掉那三張專屬牌的圖（詳見本檔檔頭）：")
        for c in clash:
            print(f"  共用牌 {c}（{names.get(c, '?')}）→ card/dangdang_{c} 已被專屬牌"
                  f"「{names.get('dangdang_' + c, '?')}」佔用")
        print("!" * 78 + "\n")

    only = args.only or want
    unknown = [c for c in only if c not in want]
    if unknown:
        print(f"!! 這幾張不在要生的清單裡：{unknown}")
        return
    if not REF.exists():
        print(f"!! 參考圖不存在：{REF.relative_to(ROOT)}")
        return

    warn: list[str] = []
    jobs: dict[str, str] = {}
    nofix: list[str] = []
    for cid in only:
        if cid not in prompts:
            warn.append(f"{cid}: 找不到球球那版的提示詞")
            continue
        t = convert(prompts[cid], cid, warn)
        for old, new in SCENE_FIX.get(cid, []):
            if t.count(old) != 1:
                warn.append(f"SCENE_FIX['{cid}'] 對不上原文（出現 {t.count(old)} 次，應該 1 次）："
                            f"{old[:60]}…")
                continue
            t = t.replace(old, new, 1)
        # 轉完還留著球球的長相字眼＝有東西沒換乾淨。
        # ★ 要找**原文**的字眼，不是「grey tabby」這種一般詞——我自己補的那條清單裡就寫著
        #   「not a grey tabby」，用一般詞查會 114 張全部喊、等於永遠紅的檢查
        #   （`art_rules.py` 第九個雷：留一條永遠紅的檢查比沒有檢查更糟）。
        for bad in ("Same grey tabby markings", "light grey tabby fur", "grey tabby cat ninja",
                    "NAVY BLUE ninja headband", "navy ninja outfit", "long ringed tail"):
            if bad in t:
                nofix.append(f"{cid}: 轉完還留著「{bad}」")
        jobs[f"card_dangdang_{cid}.png"] = t

    RAW.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M")
    exists = [fid for fid in jobs if (RAW / fid).exists()]
    if exists and args.redo:
        for fid in exists:
            old = RAW / fid
            old.rename(old.with_name(f"{old.stem}.prev-{stamp}.png"))
        print(f"舊稿改名留底 {len(exists)} 張（.prev-{stamp}.png）")
        exists = []

    JOBS.mkdir(parents=True, exist_ok=True)
    lines = max(1, args.lines)
    order = list(jobs)
    for i in range(lines):
        part = {n: jobs[n] for n in order[i::lines]}
        if not part:
            continue
        out = JOBS / f"{args.name}_{i + 1}.json"
        out.write_text(json.dumps(part, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(part):>3} 張 → {out.relative_to(ROOT)}")
    print(f"合計 {len(jobs)} 張")

    # 自檢：一律不中止（工作檔上面已經寫出去了），對不上的印成一塊
    if warn or nofix:
        print("\n" + "!" * 78)
        for w in warn + nofix:
            print("  " + w)
        print("!" * 78)
    else:
        print(f"每一張的四塊錨點都換到了，也沒有殘留球球的長相字眼")
    if exists:
        print("\n" + "!" * 78)
        print(f"這 {len(exists)} 張 tools/codex_raw 裡已經有舊稿，codex_gen.py 會直接跳過：")
        for fid in exists:
            print(f"  {fid}")
        print("要重生請加 --redo（會先改名留底）。")
        print("!" * 78)


if __name__ == "__main__":
    main()
