# -*- coding: utf-8 -*-
"""噹噹（黑白賓士貓）的 B 批牌面工單——29 張專屬牌。

牌號與名字直接對 `src/content/cards.ts` 裡 `hero: 'dangdang'` 那 29 張，
輸出檔名一律 `card_<牌號>.png`，進倉之後鍵就是 `card/<牌號>`
（`tests/content/cards.test.ts` 盯著「插圖鍵就是自己的牌號」這條）。

怎麼寫這些提示詞
----------------
**跟 A 批立繪同一套做法**（`make_dangdang_hero_jobs.py` 的檔頭）：長相全部交給參考圖
`tools/ref/dangdang_ref.png`，提示詞只做三件事——

  1. 指著參考圖說「就是這隻，照抄，不要重新設計」；
  2. 列一張**只寫正面、不舉例**的辨識清單（白臉線、琥珀眼、青綠短褂加米白滾邊與盤扣、
     棕色腰帶、**兩隻銅護臂**、深色長褲纏踝）；
  3. 講**這張牌在做什麼**。

刻意不做：**不用舉例寫規則**（「不要畫成某某」會讓模型照著舉例畫），**不整隻重描**。

跟 A 批不一樣的地方（這是最容易踩的，`art_rules.py` 檔頭第一條：規則寫太死會跟姿勢打架）
------------------------------------------------------------------------------------
A 批的 `COMPACT`（「整張要比高窄、寬不到高的八成」）與 `FRAMING_DEFAULT`（「腳貼底邊」）
**一條都不能搬過來**：那兩條是為了 `add_sprite.py` 的 540×538 直立框寫的。
牌面是橫的 1024×820、而且 `add_card_art.py` 會**填滿**那個窗格，
畫成又高又窄的一隻貓等於左右兩邊全部被裁掉。所以牌面這邊要的是相反的東西：撐滿四個邊。

三種顏色就是他的三種資源（牌縮到 150 像素寬時，玩家先認顏色再認圖案）：

  | 顏色 | 代表 | 哪幾張 |
  |---|---|---|
  | 淡冰藍 | 蜷縮（擋） | 架盤、護臂格擋、鐵砂護腕、穩住、見招拆招、卸甲、硬扛、千斤墜 |
  | 橘紅 | 反彈（回敬） | 回敬、挑釁、迴力鏢、站樁、原樣奉還、以傷還傷 |
  | 金琥珀 | 打出去的力道 | 正拳、反手一記、連環撞、卸力掌、崩山掌、震盪波、鐵山靠、回馬掌 |

**消耗蜷縮那五張（卸力掌、崩山掌、震盪波、鐵山靠、捨身撞）一律畫成「藍盾碎開、碎片燒成金光飛出去」**
——那是他整套牌的識別：護住的姿勢被打出去，不是單純揮拳。
**反彈那五張（回敬、挑釁、迴力鏢、站樁、以傷還傷）一律畫成「挨了打再把力道頂回去」**，
不是主動出手。純防禦那五張（架盤、護臂格擋、硬扛、卸甲、穩住）是五種**不同的擋法**。

他**不用暗器、不伸爪抓**：動作只有護臂、拳、掌、站樁。

綠色的分寸（`codex_gen.py` 坑 5）：特效一律不准碰綠色系，但**他的青綠短褂是設計的一部分，
不算特效**——這一句一定要寫進去，不然「整張不准有綠色」會跟他的衣服打架。

跑法
----
  python tools/make_dangdang_card_jobs.py                  # 產兩份工作檔（分兩條線跑）
  python tools/codex_gen.py tools/codex_jobs/dangdang_cards_1.json --ref tools/ref/dangdang_ref.png
  python tools/codex_gen.py tools/codex_jobs/dangdang_cards_2.json --ref tools/ref/dangdang_ref.png
  （**一次最多兩條**，`codex_gen.py` 坑 1。）

  只重生幾張：python tools/make_dangdang_card_jobs.py --only dangdang_xieli dangdang_huima --redo
  （`--redo` 會把舊稿改名留底。不加的話 `codex_gen.py` 看到檔案已存在就整張空轉，
    印的還是「已存在跳過」、離開碼 0，看起來像成功——`art_rules.py` 第九個雷。）

**自檢不寫成 `SystemExit`**（使用者 2026-09-17 明示）：工作檔一定會寫出去，
已經有舊稿的那幾張印成一塊醒目的清單，要重生就加 `--redo`。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
# 「不要畫成一塊方形色板」只在 art_rules 定義一份（第十一個雷）
from art_rules import NO_PANEL  # noqa: E402

RAW = ROOT / "tools" / "codex_raw"
JOBS = ROOT / "tools" / "codex_jobs"
REF = ROOT / "tools" / "ref" / "dangdang_ref.png"

# ---------------------------------------------------------------------------
# 他長什麼樣：指著參考圖，配一張只寫正面的辨識清單（跟 A 批同一份，刻意不加細節）
# ---------------------------------------------------------------------------
LOOK = (
    "THE CHARACTER is the black-and-white TUXEDO CAT in the attached reference image. "
    "**Copy his design straight from the reference** - the same fur pattern, the same clothes, the same "
    "colours, the same chibi proportions (a big round head about as large as his whole body, a short squat "
    "body, short stubby legs, no neck, small rounded paws) and the same drawing. Do not redesign him.\n"
    "These are the things players recognise him by. Every one of them is in the reference and every one of "
    "them belongs in your picture:\n"
    "  - black fur, with a WHITE STRIPE running down the middle of his face, a white muzzle, a white chest, "
    "white paws and white feet;\n"
    "  - AMBER-GOLD eyes;\n"
    "  - a sleeveless TEAL-GREEN Chinese jacket with a cream border and dark toggle fastenings down the front;\n"
    "  - a BROWN cloth sash knotted at his waist with the ends hanging down;\n"
    "  - **a round BRONZE BRACER on EACH of his two forearms** - they are his weapon and the first thing "
    "players look for, so both of them are in every picture;\n"
    "  - dark trousers, with cloth wrapped around each ankle.\n"
    "Keep the same character design AND the same right-facing three-quarter angle as the reference image "
    "(both halves of it face right) - only the pose, the action and the expression differ.\n"
    "HE FIGHTS WITH THOSE TWO BRACERS: he punches, blocks, sweeps and pushes with his forearms and palms. "
    "His paws stay rounded and closed - no claws out, no thrown weapon, nothing held in his paws unless "
    "this card says so.\n"
    "HIS EYES: amber-gold with a glossy white highlight; when both eyes show they match each other in size "
    "and shape, and from the side the far eye is behind his head, which is correct.\n")

# ---------------------------------------------------------------------------
# 29 張：牌號 →（主色, 這張牌在做什麼）
# ---------------------------------------------------------------------------
CARDS: dict[str, tuple[str, str]] = {
    # ===== 起手 3 張 =====
    "dangdang_zhengquan": ("WARM AMBER GOLD",
        "he drives a straight punch to the RIGHT with everything he has: the near forearm is thrown out "
        "level with his shoulder so the bronze bracer leads, the fist crossing out past the right edge of "
        "the picture, the other paw pulled in tight at his chest, back leg braced. A big solid warm-golden "
        "impact burst blooms around that bracer and two short golden arcs curve behind it. He is at the "
        "lower left, shoulders driven forward."),
    "dangdang_jiapan": ("PALE ICE BLUE",
        "he crosses both bracered forearms into a tight X in front of his chest and face, and ONE BIG "
        "rounded slab of solid pale-blue shielding light swells out from the crossed bracers and wraps his "
        "whole upper body, filling most of the frame. His eyes look out steadily over the top of the guard. "
        "The shield IS the card - nothing else is happening."),
    "dangdang_huijing": ("HOT ORANGE-RED",
        "a fat hot-orange arrow comes in from the RIGHT, strikes his raised bronze bracer and is bent "
        "straight back the way it came - the bent arrow and its bright orange return-trail fill the upper "
        "half of the frame, pointing back out to the right. Three short orange-red spikes pop outward along "
        "the rim of that bracer. He is planted low at the lower left, unmoved, eyes narrowed."),

    # ===== 忍術・常見 8 張 =====
    "dangdang_xieli": ("WARM AMBER GOLD",
        "**he throws his own guard away as the attack.** The pale-blue shield that was covering his chest "
        "is shattering into pale-blue shards, and those shards sweep to the RIGHT and catch fire into a "
        "solid warm-golden blast that bursts off his outstretched palm. His near paw is pushed out flat "
        "with the bracer behind it, elbow still bent; the blue shards are clearly BEHIND the golden blast, "
        "turning into it. He is at the lower left, leaning into the push."),
    "dangdang_huben": ("PALE ICE BLUE",
        "he turns side-on and throws ONE bracered forearm up in front of his face while the other bracer "
        "guards his ribs; a thick, layered WALL of solid pale-blue shielding light stands up flat against "
        "that raised bracer and fills the right half of the frame like a door slammed shut. The bronze "
        "bracer is right at the centre of the wall, clearly the thing making it. He peers out from behind "
        "his elbow. This is a one-armed block, not a crossed guard."),
    "dangdang_yingpeng": ("WARM AMBER GOLD with ORANGE-RED",
        "his bronze bracer meets an incoming blow head-on: a small grey rat bandit at the far right swings "
        "a stick into his raised forearm, the two collide dead centre, and a hard solid warm-golden "
        "starburst of sparks explodes at the contact point. At the same moment three short orange-red "
        "spikes snap back out of that contact point toward the rat. Both of them are braced and neither "
        "gives ground."),
    "dangdang_tiesha": ("BRONZE with PALE ICE BLUE",
        "a big close-up of his forearm: he has gripped the strap of one bronze bracer with his other paw "
        "and is hauling it tight, the bracer huge in the middle of the frame with its buckle and straps "
        "clearly drawn. As it tightens a thin crisp ring of solid pale-blue light snaps out around the rim "
        "of the bracer. His head is at the upper left, looking down at his own arm with a small satisfied "
        "look. The bracer is the biggest thing in the picture."),
    "dangdang_tiaoxin": ("HOT ORANGE-RED",
        "he taunts: he slaps one bracer against the other with a bang, chin lifted, mouth open in a shout "
        "toward the RIGHT, and beckons with an open rounded paw. Big ragged hot-orange anger-bursts and "
        "bold orange 'come on' lines blaze outward from him and fill the frame. A small grey rat bandit at "
        "the far right edge is jumping with rage. He is enjoying this."),
    "dangdang_fanshou": ("WARM AMBER GOLD",
        "the SAME bracered forearm whips back and forth TWICE: two long solid warm-golden arcs cross each "
        "other in a big X across the whole frame, one sweeping from the upper left down to the lower right "
        "and the other sweeping back, with a small solid golden impact burst at the end of each. He is at "
        "the lower left with the arm still following through. TWO strokes, clearly two - that is the card."),
    # 第一版的兩圈光暈是「沒有外框的柔光」，暈進綠幕那一圈去綠邊掃不到，進倉後量到 5.97%
    # 的可見像素帶綠（`add_card_art.py` 2026-09-14 那段講的就是這件事）。改成有黑外框的實心環帶。
    "dangdang_wenzhu": ("PALE ICE BLUE",
        "he settles and refuses to move: feet planted wide, knees softly bent, both bracers sunk low and "
        "heavy at his sides, chin level, eyes calm and half-closed. TWO flat pale-blue BANDS circle him at "
        "waist height, one above the other, drawn as solid ribbons of flat pale blue with a THICK BLACK "
        "OUTLINE all the way round each of them, like two hoops - no glow, no haze, no soft light spilling "
        "off them. Two short solid golden arrows, each with its own thick black outline, point straight "
        "DOWN beside his feet. Everything about the picture is still and settled."),
    # 第一版整片特效被畫成**綠色**的治癒緞帶（進倉後 4.54% 的可見像素帶綠、最綠 229），
    # 在綠幕上等於自殺。病根有兩個：(1) 提示詞寫「藍變成玫瑰紅」＝要它畫一段漸層，
    # 模型就從藍經過青綠走到粉；(2)「回血」這個題材的預設畫法本來就是綠色的。
    # 改法：只給一個顏色、不要轉場、而且每一塊都要有黑外框。
    "dangdang_jieli": ("ROSE CRIMSON",
        "he cups both paws together in front of his chest and a big ROSE-CRIMSON healing light sits in "
        "them: three fat solid rose-crimson HEART shapes rise out of his paws and drift up past his "
        "shoulder, each heart drawn as a flat filled shape with a THICK BLACK OUTLINE. His eyes are closed "
        "and his face is relaxed and relieved. Four or five small flat PALE-BLUE shards, also with thick "
        "black outlines, tumble inward toward his paws and are being swallowed by the rose light - that is "
        "the guard he is spending. Rose-crimson and pale blue are the ONLY two colours in the effect; "
        "nothing fades from one into the other and nothing glows."),

    # ===== 忍術・罕見 11 張 =====
    "dangdang_bengshan": ("WARM AMBER GOLD",
        "the big version of throwing his guard away: he sinks his whole weight down and shoves BOTH palms "
        "out to the RIGHT together, and the entire pale-blue shield in front of him breaks apart into big "
        "chunky pale-blue slabs that hurtle to the right and blaze into ONE wide, thick, solid warm-golden "
        "shockwave filling the whole right half of the frame. Far bigger and heavier than a single palm "
        "strike. He is at the lower left, mouth open in a shout."),
    "dangdang_huili": ("HOT ORANGE-RED",
        "one thick hot-orange band curves out from his bracer, loops in a big arc all the way around the "
        "frame and comes back to him, with a bold arrowhead on the outgoing end and another on the "
        "returning end so the out-and-back path reads instantly. The looping band is the biggest thing in "
        "the picture. He stands at the lower left with one bracer raised, watching it come home. There is "
        "no enemy in this picture."),
    "dangdang_jiahou": ("BRONZE with PALE ICE BLUE",
        "a big close-up of one forearm being armoured up: a second, thicker bronze plate is being clamped "
        "on over the bracer he already wears, and a third plate is floating into place above it, so the "
        "bracer is visibly becoming twice as thick. Each plate carries its own thin ring of solid "
        "pale-blue light. The stacked bracer fills the middle of the frame; his head is at the upper left, "
        "looking at it with a pleased narrow-eyed smile."),
    "dangdang_yibi": ("HOT ORANGE-RED",
        "every orange-red spike that was stuck in him is torn loose at once, flipped around and sent "
        "straight back: a dense wide spray of solid hot-orange-red spikes storms out to the RIGHT and "
        "fills two thirds of the frame, all the points facing away from him. He is at the lower left with "
        "both palms shoved forward and a hard satisfied look on his face."),
    "dangdang_zhendang": ("WARM AMBER GOLD",
        "he slams both bracers down together and the shock goes out in every direction: THREE big solid "
        "warm-golden concentric rings blast outward from him and run right off all four edges of the "
        "frame, with pale-blue shards of his broken shield riding the innermost ring. He is in the very "
        "centre, crouched over the impact. THREE small dark shadowy rat shapes, one near each far corner, "
        "are being flipped over backwards by the rings - this one hits everybody."),
    "dangdang_jianzhao": ("PALE ICE BLUE with ORANGE-RED",
        "he reads the attack and brushes it aside: one bracered forearm sweeps outward and knocks a "
        "hot-orange incoming strike-line off course so it skids away over his shoulder, and along the "
        "whole length of that sweeping forearm a crisp band of solid pale-blue light blooms out in its "
        "wake. His eyes are wide open and locked on where the blow came from. Calm, exact, no wasted "
        "movement."),
    "dangdang_xiejia": ("PALE ICE BLUE with CREAM",
        "he sheds weight to move better: a heavy dull-grey slab of old armour plating has been unbuckled "
        "off his shoulder and is tumbling away at the lower right, and the moment it leaves him a big "
        "billow of solid pale-blue shielding light swells up around his shoulders and back. A single "
        "cream-coloured blank card floats up beside his head. He stands lighter and taller, one paw still "
        "on the buckle."),
    "dangdang_yingkang": ("PALE ICE BLUE",
        "he simply takes it: feet stamped wide apart, knees bent deep, BOTH bracered forearms shoved up "
        "over his head to hold up an enormous slab of solid pale-blue shielding light that lies across the "
        "whole top of the frame like a roof pressing down on him, drawn thick and layered with a crisp "
        "hard edge. His teeth are gritted and his head is down between his arms. The sheer size of the "
        "blue slab is the card."),
    "dangdang_lianhuan": ("WARM AMBER GOLD",
        "he barges in shoulder-first and hits TWICE: his bracered shoulder drives to the RIGHT, and two "
        "solid warm-golden impact bursts sit one behind the other along that line - a smaller one nearer "
        "him and a much bigger one further right. Three short straight solid golden speed lines trail "
        "close behind his back. He is low and charging, head tucked in."),
    "dangdang_huxin": ("HOT ORANGE-RED",
        "he holds a rooted standing-post stance and does not move at all: feet planted just outside his "
        "shoulders, knees sunk, both bracered forearms rounded into a circle held in front of his chest as "
        "if hugging a big invisible jar, back straight, eyes half-closed and steady. A dense collar of "
        "short solid orange-red spikes stands up all the way around his outline, following the shape of "
        "his body like the quills of a hedgehog. Utterly still, and covered in spikes."),
    "dangdang_jieshi": ("PALE ICE BLUE with ORANGE-RED",
        "the spikes become the shield: on the LEFT side of the frame the orange-red spikes covering him "
        "are folding down flat one by one and melting, and the melt runs across and down his body to the "
        "RIGHT where it pools into a thick ring of solid pale-blue shielding light banked up around his "
        "waist. Orange on one side, blue on the other, and a clear flowing band in between showing which "
        "way it goes. He presses both paws together in front of his chest."),

    # ===== 忍術・稀有 1 張 =====
    "dangdang_tongqiang": ("BRONZE COPPER",
        "he braces both bronze bracers outward and a whole WALL of stacked bronze bricks rises behind him "
        "and fills the entire frame edge to edge, each brick outlined and catching a warm copper sheen. "
        "A crisp rim of solid pale-blue light runs along the top of the wall and around his own outline. "
        "He stands in front of it in the centre, chin up, completely certain. The wall is the picture."),

    # ===== 絕學・稀有 6 張 =====
    "dangdang_tieshan": ("WARM AMBER GOLD",
        "everything he has, in one shoulder: he drops his head, turns his bracered shoulder into the "
        "target and rams RIGHT, and every last scrap of the pale-blue shield is being sucked into that "
        "shoulder and burning into ONE enormous solid golden-white impact blast that fills the right half "
        "of the frame. Three thick jagged solid golden cracks split outward from the point of impact. "
        "He is at the lower left, fully committed, nothing held back."),
    "dangdang_hubigong": ("BRONZE with PALE ICE BLUE and ORANGE-RED",
        "he stands still and works the technique: both bracered forearms pressed together upright in front "
        "of his chest, eyes closed, face calm, the engraved rings on the bronze lighting up one after "
        "another. Solid pale-blue shielding light pours off the LEFT bracer and short solid orange-red "
        "spikes sprout along the RIGHT bracer - two different things, one on each arm, each clearly its "
        "own colour. The ends of his sash lift gently."),
    "dangdang_huima": ("WARM AMBER GOLD with PALE ICE BLUE",
        "a backhand palm fired off without spending his guard: his weight rocks back onto the rear foot "
        "and he whips the near paw out to the RIGHT with the BACK of the paw leading and the bracer "
        "behind it, a solid warm-golden impact burst blooming off it. The crucial part: the rounded slab "
        "of pale-blue shielding light across his chest is still WHOLE and unbroken, not a shard missing - "
        "he paid nothing for that blow. His head is turned sharply to watch it land."),
    "dangdang_qianjin": ("PALE ICE BLUE with BRONZE",
        "he drops his weight like an anvil: knees deeply bent, both palms pressing straight down at his "
        "sides, body compressed, jaw set. THREE flattened solid pale-blue ripple rings spread out sideways "
        "from around his feet, one above the other, and a heavy bronze sheen hugs his whole outline as if "
        "he had turned to metal. Two short solid golden arrows point straight DOWN on either side of him. "
        "Immovable, heavy, planted."),
    "dangdang_yishang": ("HOT ORANGE-RED with CRIMSON",
        "the spikes turn nasty: the collar of orange-red spikes around him has grown long, thick and "
        "blade-like, every point burning deep crimson at the tip, and there are so many of them that they "
        "reach into all four corners of the frame. He stands in the middle with both bracered arms folded "
        "across his chest, eyes narrowed to slits and one corner of his mouth pulled into a hard little "
        "smile. Whoever hits him is going to regret it."),
    "dangdang_sheshen": ("HOT ORANGE-RED with WARM AMBER GOLD",
        "he throws his own body away to land it: both feet off the ground, bracered shoulder driving "
        "RIGHT, the entire pale-blue shield detonating into a huge solid warm-golden shockwave that fills "
        "the right half of the frame - and at the same time jagged hot-orange-red cracks tear open across "
        "his own shoulder and back, with drops of sweat flung off him. Teeth gritted, one eye screwed "
        "shut. He is hurting himself to do this and it shows."),
}

# ---------------------------------------------------------------------------
# 牌面共用的版面與畫法
# ---------------------------------------------------------------------------
# ★ A 批的 `COMPACT`（比高窄）與「腳貼底邊」**故意不搬過來**：那兩條是給 `add_sprite.py`
#   的 540×538 直立框用的，牌面是橫的而且會被 `add_card_art.py` 填滿，套過來會被裁掉兩側。
BODY = """A cartoon illustration for a card game, landscape composition, showing ONE cat.

{look}
There is exactly ONE cat in this picture: no second cat, nobody else.
Draw him big enough that his face reads clearly when the picture is shrunk to 150 pixels wide.

WHAT IS HAPPENING - follow this exactly:
{doing}

The dominant colour of the picture is {colour}. That effect should be the loudest thing in the frame, so
that the card reads from its colour alone at thumbnail size.

COLOUR MEANINGS, so the whole set reads as one system: PALE ICE BLUE is his guard, HOT ORANGE-RED is the
force he throws back at whoever hit him, WARM AMBER GOLD is the force he puts out himself, BRONZE is his
bracers. Use the colours this card names and stay off the others.

**NONE OF THE ENERGY IN THIS PICTURE MAY BE GREEN OR GREENISH.** Glows, shields, impacts, sparks, smoke,
dust and motion streaks are drawn in the colours named above, never green and never yellow-green. Never
blend or fade one effect colour into another either - a gradient between two colours drifts through green
on its way. (The picture sits on a green screen: anything green gets erased by the chroma key and leaves a
hole.) His TEAL-GREEN jacket is part of his design and stays exactly as the reference draws it - the
jacket is not an effect and this rule does not touch it.
**EVERY EFFECT HAS A THICK BLACK OUTLINE ROUND ITS EDGE**, the same weight as the outline round the cat,
and ends at that outline. Do not put a soft halo, bloom, haze or fading glow outside it: a soft edge blends
into the green background and that blended ring survives the chroma key as a fluorescent green fringe.

FILL THE WHOLE FRAME. The picture is shown inside a short, almost-square window on the card, so a wide flat
composition wastes most of it. Spread the drawing into the corners so it reaches the top edge, the bottom
edge and both sides, and draw him roughly as tall as the picture rather than a small figure sitting on a
baseline.
Bold and readable at thumbnail size: strong silhouette, high contrast, no fine detail that disappears when
shrunk. Draw everything SOLID and OPAQUE - flat filled colour. Nothing may be transparent or see-through.
Nothing else in the picture: no ground, no shadow, no scenery, no text, no letters, no numbers, no
watermark, no border.
Any enemy that appears is a small grey rat bandit or a small dark shadowy shape near the edge of the frame,
never another cat that looks like him.
Style: thick black outlines, FLAT colours with only subtle soft shading - do NOT render it painterly, do NOT
use heavy airbrushed shadows or a rendered-illustration look. Cute cartoon, not photorealistic.
THE FACE ESPECIALLY: draw the face in FLAT blocks of colour with hard edges between them. Where the black
fur and the white face stripe meet that is a CLEAN EDGE, never a soft airbrushed fade.
Background must be a solid pure green (#00FF00), completely flat, for chroma keying.
{nopanel}Output 1024x820 PNG. Save the image as card_{cid}.png in the current directory and report the path."""


def ids_in_cards_ts() -> list[str]:
    """`src/content/cards.ts` 裡 `dd_` 開頭的牌號。

    打錯一個字的下場是「生了一張永遠沒人用的孤兒圖」，而且
    `tests/content/cards.test.ts` 那條「插圖鍵就是自己的牌號」會紅——
    但要等圖生完好幾個小時才發現。所以在產工單的當下就對一次。
    """
    import re
    src = (ROOT / "src" / "content" / "cards.ts").read_text(encoding="utf-8")
    return re.findall(r"id: '(dd_[a-z]+)'", src)


def build(only: list[str]) -> dict[str, str]:
    jobs: dict[str, str] = {}
    for cid in only:
        colour, doing = CARDS[cid]
        jobs[f"card_{cid}.png"] = BODY.format(look=LOOK, doing=doing, colour=colour, cid=cid,
                                              nopanel=NO_PANEL)
    return jobs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='+', default=None, help='只出這幾張的工單（寫牌號）')
    ap.add_argument('--redo', action='store_true',
                    help='已經有舊稿的先改名留底，不然 codex_gen 會直接跳過那幾張')
    ap.add_argument('--lines', type=int, default=2, help='拆成幾份工作檔（一次最多兩條線）')
    ap.add_argument('--name', default=None, help='工作檔檔名前綴（預設 dangdang_cards）')
    args = ap.parse_args()

    only = args.only or list(CARDS)
    unknown = [c for c in only if c not in CARDS]
    if unknown:
        print(f"!! 沒有這幾張牌：{unknown}")
        print(f"   可用的：{' '.join(CARDS)}")
        return

    if not REF.exists():
        print(f"!! 參考圖不存在：{REF.relative_to(ROOT)}　先跑 python tools/make_dangdang_ref.py")
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
    prefix = args.name or 'dangdang_cards'
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

    # 自檢一：牌號有沒有跟 cards.ts 對上。不中止（工作檔上面已經寫出去了），但要印得夠大聲
    want = ids_in_cards_ts()
    missing = [c for c in want if c not in CARDS]
    orphan = [c for c in CARDS if c not in want]
    if missing or orphan:
        print("\n" + "!" * 70)
        if missing:
            print(f"cards.ts 有、這支沒有（{len(missing)} 張，生完會缺圖）：{' '.join(missing)}")
        if orphan:
            print(f"這支有、cards.ts 沒有（{len(orphan)} 張，生了也沒人用）：{' '.join(orphan)}")
        print("!" * 70)
    else:
        print(f"牌號對得上 cards.ts 的 {len(want)} 張")

    # 自檢二：舊稿擋路
    if exists:
        print("\n" + "!" * 70)
        print(f"這 {len(exists)} 張 tools/codex_raw 裡已經有舊稿，codex_gen.py 會直接跳過、不會重生：")
        for fid in exists:
            print(f"  {fid}")
        print("要重生請加 --redo（會先改名留底），或自己把舊稿改名。")
        print("!" * 70)


if __name__ == '__main__':
    main()
