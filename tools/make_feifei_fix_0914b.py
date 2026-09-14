# -*- coding: utf-8 -*-
"""2026-09-14 下午使用者逐張看菲菲的圖抓到的 15 張，重生工單。

| # | 檔案 | 使用者說的 | 查到的根因 |
|---|---|---|---|
| 1 | event_feifei_blocked_r0 | 卷軸上多一隻手，變成三隻手 | 文字是「揉著撞痛的肩膀，展開卷軸」：一隻揉肩、兩隻拿卷軸，模型就畫了三隻 |
| 2 | event_feifei_rat_stall_r0 | 飯糰的海苔變成綠色 | 開場圖的海苔是黑的，續集自己改色；提示詞沒講海苔什麼顏色 |
| 3 | event_feifei_sparring_cat_r1 | 白貓的手很奇怪 | 沒寫「用肩膀撞」，模型讓白貓伸手推；還把開場圖的道服、黑衣師弟弄丟 |
| 4 | event_feifei_sleeping_guard_r1 | 應該是穿過那扇門 | 文字「走過門邊時」，模型畫成站在守衛旁邊；門照開場圖關著 |
| 5 | event_feifei_stuck_kitten_r0 | 貓媽媽卡在欄杆內 | 開場圖沒有母貓（已知），續集自己補，補在欄杆裡面 |
| 6 | event_feifei_gambling_rats | 老鼠的手方向有問題 | 舉起來招手的爪子左右裝反、像人手 |
| 7 | event_feifei_fish_pond_r1 | 大魚尾巴在水池外 | 文字「尾巴掃上岸」，模型讓尾巴從池子外的地上長出來 |
| 8 | event_feifei_rescue_return_herb_r1 | 村貓的動作錯 | 開場圖是村貓從樓梯間撲出來遞魚乾，續集照抄（附圖過期） |
| 9 | card_feifei_bangnidianyixia | 改成一邊攻擊、一邊丟盾牌給另一個 | 原稿是「出拳＋把盾板往後塞進對方胸口」，兩隻黏在一起 |
| 10 | card_feifei_tianmao | 舔毛不可愛 | 大物件是「一條巨大的舌頭」，還一腳朝天 |
| 11 | card_feifei_shuaiguo | 鍋蓋不對 | 只寫「蓋子飛開」，沒講是同一個鍋的蓋子 |
| 12 | card_feifei_touchi | 穿過飯糰 | 沒講爪子在飯糰外面，手臂插進飯糰裡 |
| 13 | card_feifei_tiebushan | 手從盔甲穿出來 | 「鐵甲在身上合起來、一掌拍胸甲」，爪子直接從胸甲中間伸出 |
| 14 | card_feifei_zuiquan | 圖不符合「亂針」 | **牌改名時「貓在做什麼」那行沒換**（art_rules 第三類根因又一次）：還寫著抱酒葫蘆、鬥雞眼、醉了 |
| 15 | feifei_still_teach | 頭髮不對、師父長相不同 | 合參表說明寫師父「tall」→ 畫成瘦高長毛；她在畫面裡太小，頭髮細節塌掉 |

**參考圖一律照原本那張的慣例，而且每筆自己帶**（「一定要做好圖片跟角色的參照」，使用者 2026-09-14）：
  - #1～#5、#7、#8 結果圖：她自己那個事件的開場圖（`tools/ref/event_refs_feifei/<事件>.png`），先確認參考圖比開場圖新
  - #6 開場圖：**附目前這張開場圖本身**，要模型照畫、只修老鼠的爪子。
    不用設定表重生是因為它的結果圖（`gambling_rats_r0`）是照這張畫的，構圖一換兩張就對不上
  - #9～#14 牌面：她的設定表 `tools/ref/feifei_ref.png`
  - #15 劇情圖：劇情合參表＋她的定裝 `tools/ref/feifei_story_ref.png`

**做法**跟 `make_feifei_fix_0914.py` 一樣：原稿能沿用的只精準替換錯的那一行（`swap()` 對不上就停），
結果圖用 `make_feifei_result_art_jobs.py` 的模板重組，再補一段「Show this as」與「附圖過期、不要照抄」。

用法：
  python tools/make_feifei_fix_0914b.py
  python tools/codex_gen.py tools/codex_jobs/feifei_fix_0914b.json   （不要帶 --ref，每筆自己帶）
  舊原稿要先改名成 `<檔名>.previous-20260914b.png`，這支看到舊原稿還在就停（codex_gen 會直接跳過、還印成功）。
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import FEIFEI_NOT_FAT, FEIFEI_NOT_HUMAN, NO_PANEL, STYLE  # noqa: E402
from make_feifei_fix_0914 import job, leaks, swap  # noqa: E402
from make_feifei_result_art_jobs import (  # noqa: E402
    ACTOR, HEAD, MAY_MOVE, MOVES_ON, SAME_PLACE, TAIL as RESULT_TAIL)

JOBS = ROOT / "tools" / "codex_jobs"
RAW = ROOT / "tools" / "codex_raw"
OUT = JOBS / "feifei_fix_0914b.json"
TEXT = JOBS / "_feifei_result_text.json"
STORY_REF = "tools/ref/feifei_story_ref.png"
SHEET_REF = "tools/ref/feifei_ref.png"

EXPECTED = [
    "event_feifei_blocked_r0.png", "event_feifei_rat_stall_r0.png", "event_feifei_sparring_cat_r1.png",
    "event_feifei_sleeping_guard_r1.png", "event_feifei_stuck_kitten_r0.png", "event_feifei_gambling_rats.png",
    "event_feifei_fish_pond_r1.png", "event_feifei_rescue_return_herb_r1.png",
    "card_feifei_bangnidianyixia.png", "card_feifei_tianmao.png", "card_feifei_shuaiguo.png",
    "card_feifei_touchi.png", "card_feifei_tiebushan.png", "card_feifei_zuiquan.png",
    "feifei_still_teach.png",
]

# ---------------------------------------------------------------------------
# 結果圖：Show this as（插在玩家讀到的文字後面）
# ---------------------------------------------------------------------------
# 穿過門是換了位置，要用 MAY_MOVE 的開頭（SAME_PLACE 會叫它「照附圖的道具」把門關著畫）
MOVES_HERE = {"sleeping_guard_r1"}

RESULT_SHOW: dict[str, str] = {
    "blocked_r0":
        "the Siamese cat girl sits on the floor at the foot of the junk pile, on the far side she has just "
        "tumbled down to, with a few loose planks and pebbles scattered around her. One of her paws is pressed "
        "to her own sore shoulder and she winces with one eye squeezed shut; her OTHER paw holds the ninja "
        "scroll, only half unrolled, resting across her lap. **She has exactly TWO arms and TWO paws - one on "
        "her shoulder, one on the scroll.** Nothing else touches the scroll: no third paw, no extra hand "
        "holding its other end, no hand growing out of the scroll or out of the junk pile. Count the paws "
        "before finishing.\n"
        "**OUT OF DATE IN THE ATTACHED PICTURE - DO NOT COPY:** her standing upright beside the pile looking up "
        "at it - she has already fallen and sat down.",
    "rat_stall_r0":
        "the Siamese cat girl stands beside the rat's cart holding a half-eaten rice ball in both paws, one bite "
        "missing from it, her cheeks full, looking at the rat with a worried, uncertain face. The shabby rat "
        "has turned away from her and hunches over its cart, busily straightening the rice balls with its eyes "
        "lowered, pointedly NOT looking at her.\n"
        "**THE RICE BALLS:** white rice triangles, each with a band of solid BLACK nori seaweed wrapped around "
        "the bottom - flat, very dark charcoal black, exactly as in the attached picture. The nori is BLACK on "
        "every single rice ball, including the one in her paws. It is never a bright colour, never light, never "
        "glowing, never a leaf.",
    "sparring_cat_r1":
        "at the foot of the short flight of stone stairs, the WHITE cat - wearing the same cream martial-arts "
        "robe with a black belt as in the attached picture - has just rammed the Siamese cat girl on purpose "
        "WITH ITS SHOULDER: its arms stay FOLDED across its chest, it leans in shoulder-first with a smug face. "
        "The girl has already squeezed past it and is scrambling up the first steps, one paw clutching her "
        "bumped shoulder, eyes shut tight in pain, a small burst of impact lines at that shoulder. The BLACK "
        "junior cat from the attached picture stands a step back beside the white cat, arms folded, watching. "
        "**The white cat's arms are FOLDED - it does not reach out, grab, push or stretch a paw toward her.** "
        "The bump is shoulder against shoulder. Every cat has exactly two arms and two ordinary cat paws.\n"
        "**OUT OF DATE IN THE ATTACHED PICTURE - DO NOT COPY:** the three of them standing apart facing each "
        "other - she is already past the white cat and on the stairs.",
    "sleeping_guard_r1":
        "the big orange guard cat is still fast asleep, slumped against the wooden door frame exactly as in the "
        "attached picture, snoring, its fat money pouch at its belt. The heavy wooden door beside it now stands "
        "HALF OPEN on the side the guard is not leaning on, leaving a narrow gap between the guard's shoulder "
        "and the door frame - and the Siamese cat girl is slipping sideways THROUGH that doorway: one foot "
        "already over the threshold on the far side of the door, the other foot lifted high to step over a "
        "loose, tilted floor tile, her body turned sideways to fit the gap, both paws held close to her chest, "
        "eyes half closed, breathing slowly and evenly. Two loose cracked floor tiles lie in front of the "
        "doorway. **She is going THROUGH the door, not standing beside it and not walking away from it.**\n"
        "**OUT OF DATE IN THE ATTACHED PICTURE - DO NOT COPY:** the door shut tight, and her standing outside "
        "it next to the guard.",
    "stuck_kitten_r0":
        "the kitten is free now. Everyone is on the SAME, OPEN side of the wooden railing, in FRONT of it - the "
        "railing stands empty behind them, with nobody inside it and nobody between its bars. The kitten's "
        "MOTHER sits beside the Siamese cat girl and dabs ointment from a small clay medicine jar onto an old "
        "wound on the girl's forearm, which the girl holds out to her. A small tied bundle of dried fish sits on "
        "the ground between them, the mother's thank-you gift. The freed orange kitten stands at the girl's "
        "feet, safe, looking up at her, and she looks down at it with a gentle, worried face, her other paw "
        "resting lightly on its head.\n"
        "**ONE CHARACTER IS MISSING FROM THE ATTACHED PICTURE AND MUST BE ADDED:** the kitten's MOTHER - a "
        "plump grown-up ORANGE-AND-WHITE cat, clearly bigger than the kitten, with a calm, kind face.\n"
        "**OUT OF DATE IN THE ATTACHED PICTURE - DO NOT COPY:** the kitten wedged between the railing bars and "
        "the girl pulling it out. Nobody is stuck any more, and **the mother is NOT behind or inside the "
        "railing** - she sits outside it, right next to the girl.",
    "fish_pond_r1":
        "the pond water churns and splashes. A HUGE dark blue-grey fish is INSIDE the pond - its big body a dark "
        "shape just under the churning water in the MIDDLE of the ring of stones - and its thick tail lashes up "
        "OUT OF THE WATER, arching over the stone rim toward the bank. **The tail grows out of the water inside "
        "the pond**: its base is in the splashing water within the ring of stones, joined to the fish's body. "
        "It never rises from the ground outside the pond and never lies loose on the bank. The splashes are "
        "solid creamy white. The Siamese cat girl is scrambling away along the bank, hugging the basket of dried "
        "fish to her chest with both paws, mid-run, eyes squeezed shut, a few water droplets flying off her. "
        "The small fat fish from the attached picture are still in the pond.",
    "rescue_return_herb_r1":
        "the grey village cat has come all the way out of the stairwell and STANDS on the floor with both feet "
        "on the ground, a step away from the Siamese cat girl, calm and serious, a small sharpening whetstone "
        "tucked into its belt. It points with one paw at her outstretched throwing arm - right at her elbow, "
        "the spot where she paused too long. The girl holds a throwing stance: one paw extended forward with a "
        "single needle between her claws, the other paw pulled back, feet planted, looking along her own arm at "
        "the spot the village cat is pointing to, concentrating hard.\n"
        "**OUT OF DATE IN THE ATTACHED PICTURE - DO NOT COPY:** the village cat leaping or flying out of the "
        "stairwell doorway, and the string of dried fish being handed over. Here nobody jumps and nobody holds "
        "fish: the village cat stands still on the floor and only points.",
}

# ---------------------------------------------------------------------------
# #6 開場圖：照附圖（目前這張）重畫，只修老鼠的爪子
# ---------------------------------------------------------------------------
GAMBLING_REDRAW = (
    "A single scene illustration for a story event in a cute cartoon roguelike card game, landscape composition.\n\n"
    "**THIS IS A CORRECTED REDRAW OF THE ATTACHED PICTURE.** Redraw the attached picture as closely as you can - "
    "the SAME three brown rats, the SAME upturned bowl with its blue stripe, the SAME Siamese cat girl standing on "
    "the right in the same pose, the SAME colours, sizes and layout. Change ONLY the rats' paws, which are drawn "
    "wrong in the attached picture.\n\n"
    "Scene: three rats crouched around an upturned bowl in a corner, waving the Siamese cat girl over; the cat "
    "stands over them with narrowed eyes.\n\n"
    "**THE ONE THING TO FIX - THE RATS' PAWS.** In the attached picture the rats' raised paws are twisted the "
    "wrong way round, like a left hand stuck on a right arm. Here every paw sits naturally at the end of its own "
    "arm and points the way that arm reaches: the beckoning paws are raised toward the cat girl with the PALM "
    "facing HER and the fingers curling back toward the rat in a 'come over here' wave; a paw resting on the "
    "bowl lies flat on top of it with its fingers pointing forward over the edge. Rat paws are small pink rodent "
    "paws with four short fingers - NOT human hands with a thumb. No bent-back wrists, no backwards palms, no "
    "extra paws: each rat has exactly two arms.\n\n"
    "**THE CAT GIRL STAYS EXACTLY AS IN THE ATTACHED PICTURE**, including the tuft of dark brown hair on top of "
    "her head with the PLUM-PURPLE RIBBON BOW and the short ponytail.\n"
    + FEIFEI_NOT_HUMAN + FEIFEI_NOT_FAT)

# ---------------------------------------------------------------------------
# #9 雙人牌：換「WHAT IS HAPPENING」那段
# ---------------------------------------------------------------------------
BANG_OLD = (
    "the LEFT cat lunges forward and punches off-screen to the left, while with the trailing paw it shoves a flat "
    "amber shield-plate back behind itself into the RIGHT cat's chest. The right cat hugs the plate, bracing. One "
    "cat attacks, the other is being protected - both at once.")
BANG_NEW = (
    "the LEFT cat lunges toward the left edge and flings a spray of steel needles off-screen to the left with one "
    "paw - that is her attack - while at the same moment her other paw TOSSES a round amber shield back over her "
    "shoulder through the air toward the RIGHT cat. The shield is in mid-flight in the open gap between them, "
    "trailing a warm amber arc. The RIGHT cat stands a couple of steps away and reaches up with both paws to "
    "catch it, relieved. **Keep a clear gap of background between the two cats - they do not touch**, and "
    "nobody punches: the left cat THROWS. One cat attacks, the other is being protected - both at once.")

# ---------------------------------------------------------------------------
# #10～#14 共用牌：「大物件」與「貓在做什麼」照需要換
# ---------------------------------------------------------------------------
# 牌面模板裡臉上的深棕色寫成 mask——那個字在她身上只准指脖子那塊布（art_rules 的說明），順手換掉
MASK_OLD = "a dark seal-brown mask\n     over the muzzle and around the eyes"
MASK_NEW = "dark seal-brown face markings\n     over the muzzle and around the eyes"

CARD_FIX: dict[str, list[tuple[str, str]]] = {
    "tianmao": [
        ("1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in SALMON PINK: a broad salmon-pink tongue "
         "curled upward, huge and unmistakable",
         "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in SALMON PINK: a cheerful burst of big, "
         "solid salmon-pink HEARTS and small solid creamy-white sparkle stars floating up around her in an arc - "
         "the happy glow of a freshly groomed kitten. The hearts are flat and opaque with thick black outlines. "
         "**There is no giant tongue anywhere in the picture**"),
        ("   What the cat is doing: licking its own raised forearm with that tongue, eyes shut, one leg stuck "
         "straight up",
         "   What the cat is doing: sitting down neatly, holding one front paw up beside her cheek and licking it "
         "with just the small TIP of a little pink tongue, eyes happily closed in two contented curves, a tiny "
         "blush - a cute kitten grooming herself. **The tongue is SMALL**: only a little pink tip showing past "
         "her lips, never a long or huge tongue, never bigger than her paw. Both legs stay tucked under her; no "
         "leg sticks up in the air"),
    ],
    "shuaiguo": [
        ("1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in COPPER ORANGE: a copper cooking pot "
         "flying through the air upside down, lid separating from it",
         "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in COPPER ORANGE: a copper cooking pot "
         "flying through the air upside down, and ITS OWN LID popping off its mouth. The lid is the matching lid "
         "of THAT pot: the same copper colour, a shallow round dome exactly as wide as the pot's rim, with a small "
         "round knob in its centre, flying right next to the pot's open mouth so it clearly belongs to it. "
         "Exactly ONE pot and ONE lid - the lid is not smaller, not flat, not a different colour, not a plate or "
         "a frying pan"),
    ],
    "touchi": [
        ("   What the cat is doing: caught in the act of taking that bite: its mouth is on the rice ball at the bite "
         "mark, cheeks bulging, eyes swivelled sideways guiltily as if it has just been caught",
         "   What the cat is doing: caught in the act of taking that bite: she holds the rice ball from the OUTSIDE "
         "with both paws pressed flat on its surface, her mouth at the bite mark, cheeks bulging, eyes swivelled "
         "sideways guiltily as if she has just been caught. **Her paws and arms stay OUTSIDE the rice ball** - no "
         "part of her pokes into it, through it or out the other side; the rice ball is solid and whole apart "
         "from the one bite"),
    ],
    "tiebushan": [
        ("1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in GUNMETAL IRON GREY: a huge glowing suit "
         "of iron-grey armour plating shaped like a vest, with rivets and a metallic sheen",
         "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in GUNMETAL IRON GREY: a huge iron-grey "
         "ARMOUR VEST with rivets and a warm golden metallic sheen, worn over her jacket - one solid closed "
         "breastplate covering her chest and belly, with two round ARMHOLES at the shoulders"),
        ("   What the cat is doing: standing proudly puffing out its chest while the iron plating snaps closed "
         "around its torso, one paw thumping the chest plate",
         "   What the cat is doing: standing proudly with her chest puffed out, wearing that armour vest: BOTH of "
         "her arms come out of the vest's ARMHOLES at the shoulders, one paw thumps the OUTSIDE of the chest plate "
         "and the other paw rests on her hip. **Her arms and paws never pass through the armour** - no paw "
         "poking out of the middle of the breastplate, no arm going through the metal; the plate is solid"),
    ],
    "zuiquan": [
        ("   What the cat is doing: staggering with the gourd hooked on one paw, eyes crossed, weaving off balance, "
         "clearly drunk",
         "   What the cat is doing: she has just flung that whole fistful of needles WITHOUT AIMING - her throwing "
         "paw swept wide and open at the end of the throw, her other paw raised by her cheek, one foot hopping - "
         "with a nervous, hopeful grimace, peeking sideways as if hoping at least one of them hits. Her eyes are "
         "her normal BLUE eyes with pupils and a highlight, both looking the same way. **She is NOT drunk and "
         "NOT dizzy**: no crossed eyes, no spiral eyes, no tongue sticking out, no gourd, no staggering"),
    ],
}
CARD_SOURCE = {
    "tianmao": "feifei_shared_cards.json", "shuaiguo": "feifei_shared_cards.json",
    "touchi": "feifei_shared_cards.json", "tiebushan": "feifei_shared_cards.json",
    "zuiquan": "feifei_fix_0913.json",   # 9/13 修過一次（大物件已換成亂撒的針），現行那張是它生的
}

# ---------------------------------------------------------------------------
# #15 劇情圖
# ---------------------------------------------------------------------------
MASTER_OLD = "  (2) a tall calm straw-hat kung-fu cat in a cream robe with a black belt - the MASTER, normal form."
MASTER_NEW = (
    "  (2) the MASTER, normal form: a big ROUND, CHUBBY cat with light-grey fur and dark stripes, a white muzzle "
    "and chest, a huge round head on a short plump body - the same cute chibi proportions as the others, only "
    "bigger - a wide conical straw hat, a cream robe with a black belt, and a calm face with gently half-closed "
    "eyes.")
TEACH_OLD = (
    "WHAT THIS PICTURE SHOWS: Warm late-afternoon light in a wooden dojo courtyard. The straw-hat MASTER (normal "
    "form) stands calmly with one paw raised, mid-lesson. The little SIAMESE GIRL kneels close in front of him, "
    "listening hard, blue eyes wide, a row of needles laid out neatly on the mat in front of her. Off to one side "
    "and further back, the small grey tabby brother sprawls bored on his back, not listening. She is the closest "
    "and largest figure and clearly the subject. Cozy orange light.")
TEACH_NEW = (
    "WHAT THIS PICTURE SHOWS: Warm late-afternoon light in a wooden dojo courtyard. On the right, the MASTER in "
    "his normal form - drawn exactly like character (2) on the reference sheet - sits calmly with one paw raised, "
    "mid-lesson. In the left half, close to the viewer and LARGE (her head and body together take up about half "
    "the height of the picture), the little SIAMESE GIRL kneels in front of him, turned three-quarters toward the "
    "viewer so that her face, her FRINGE, her BOW and her PONYTAIL are all clearly visible, listening hard, blue "
    "eyes wide, a row of needles laid out neatly on the mat in front of her. Far behind them and small, the "
    "striped brother - character (1) - sprawls bored on his back, not listening. Exactly these three characters. "
    "Cozy orange light.\n"
    "**COPY HER HEAD FROM THE LARGE CLOSE-UP OF HER FACE on the bottom right of the reference sheet**: a few short "
    "brown fringe points over her forehead, bare cream fur on the rest of the top of her skull, the plum-purple "
    "bow between her ears, the small spiky ponytail behind it.\n"
    "**THE MASTER MUST MATCH THE SHEET**: round and chubby like character (2). He is NOT thin, NOT tall and lanky, "
    "NOT long-haired or shaggy, NOT yellow-eyed and NOT smug. The corrupted form (3) does NOT appear in this "
    "picture: no spiral violet eyes, no torn robe, no violet miasma.")

# 換完不可以還在的舊敘述
MUST_GONE = {
    "card_feifei_tianmao.png": "huge and unmistakable",
    "card_feifei_shuaiguo.png": "lid separating from it",
    "card_feifei_touchi.png": "its mouth is on the rice ball at the bite",
    "card_feifei_tiebushan.png": "snaps closed around its torso",
    "card_feifei_zuiquan.png": "clearly drunk",
    "card_feifei_bangnidianyixia.png": "punches off-screen",
    "feifei_still_teach.png": "a tall calm straw-hat",
}


def main() -> None:
    jobs: dict[str, dict] = {}

    # 文案過期就不要生（跟 make_feifei_fix_0914.py 同一條）
    newest = max((ROOT / "src" / "content" / f).stat().st_mtime for f in ("events.ts", "dialogue.ts"))
    if not TEXT.exists() or TEXT.stat().st_mtime < newest:
        raise SystemExit(f"!! {TEXT.name} 比 events.ts／dialogue.ts 舊。先跑：\n"
                         "   UPDATE_FEIFEI_TEXT=1 npx vitest run tools/feifei_result_text.test.ts")
    text = json.loads(TEXT.read_text(encoding="utf-8"))
    manifest = json.loads((ROOT / "public" / "assets" / "manifest.json").read_text(encoding="utf-8"))

    def result_ref(eid: str, who: str) -> str:
        ref = f"tools/ref/event_refs_feifei/{eid}.png"
        scene = manifest["bg"].get(f"bg/event_feifei_{eid}")
        if not scene or not (ROOT / ref).exists():
            raise SystemExit(f"!! {who}：她的開場圖或參考圖不存在（{scene}／{ref}）")
        if (ROOT / "public" / scene).stat().st_mtime > (ROOT / ref).stat().st_mtime:
            raise SystemExit(f"!! {who}：開場圖比參考圖新——參考圖過期，續集會照舊圖畫。先重建 {ref}")
        return ref

    # ---- #1～#5、#7、#8 結果圖 ----
    for rkey, show in RESULT_SHOW.items():
        if rkey not in text:
            raise SystemExit(f"!! {TEXT.name} 裡沒有 {rkey}——事件的 resultArt 改名了？")
        eid = re.sub(r"_r[01]$", "", rkey)
        name = f"event_feifei_{rkey}.png"
        head = HEAD.format(same=MAY_MOVE if (rkey in MOVES_ON or rkey in MOVES_HERE) else SAME_PLACE)
        t = head + text[rkey] + ACTOR + RESULT_TAIL.format(name=name)
        t = swap(t, "\n\n**WHO DOES WHAT**", " Show this as: " + show + "\n\n**WHO DOES WHAT**", name)
        t = swap(t, "Output 1024x768 PNG.", STYLE + "Output 1024x768 PNG.", name)
        jobs[name] = {"prompt": t, "ref": result_ref(eid, name)}

    # ---- #6 開場圖（附目前這張，只修爪子）----
    key = "event_feifei_gambling_rats.png"
    t = swap(GAMBLING_REDRAW + RESULT_TAIL.format(name=key), "Output 1024x768 PNG.",
             STYLE + "Output 1024x768 PNG.", key)
    jobs[key] = {"prompt": t, "ref": result_ref("gambling_rats", key)}

    # ---- #9 雙人牌 ----
    key = "card_feifei_bangnidianyixia.png"
    src = job("coop2_cards_feifei.json", key)
    t = swap(src["prompt"], BANG_OLD, BANG_NEW, key)
    if NO_PANEL not in t:
        t = swap(t, "Output 1024x820 PNG.", NO_PANEL + "Output 1024x820 PNG.", key)
    jobs[key] = {"prompt": t, "ref": SHEET_REF}

    # ---- #10～#14 共用牌 ----
    for cid, fixes in CARD_FIX.items():
        key = f"card_feifei_{cid}.png"
        t = job(CARD_SOURCE[cid], key)["prompt"]
        for old, new in fixes:
            t = swap(t, old, new, key)
        if MASK_OLD in t:
            t = swap(t, MASK_OLD, MASK_NEW, key)
        if NO_PANEL not in t:
            t = swap(t, "Output 1024x820 PNG.", NO_PANEL + "Output 1024x820 PNG.", key)
        jobs[key] = {"prompt": t, "ref": SHEET_REF}

    # ---- #15 劇情圖 ----
    key = "feifei_still_teach.png"
    src = job("feifei_fix_0913b.json", key)
    if src["ref"] != STORY_REF:
        raise SystemExit(f"!! {key}：原稿附的不是劇情合參表（{src['ref']}），慣例對不上，先看一眼")
    t = swap(src["prompt"], MASTER_OLD, MASTER_NEW, key)
    t = swap(t, TEACH_OLD, TEACH_NEW, key)
    jobs[key] = {"prompt": t, "ref": STORY_REF}

    # ======================= 自檢：一律 SystemExit =======================
    if set(jobs) != set(EXPECTED) or len(jobs) != len(EXPECTED):
        raise SystemExit(f"!! 應該剛好這 15 張。少了 {sorted(set(EXPECTED) - set(jobs))}，"
                         f"多了 {sorted(set(jobs) - set(EXPECTED))}")
    jobs = {k: jobs[k] for k in EXPECTED}   # 照檔頭表格的順序生，看進度時對得上號
    for k, v in jobs.items():
        p = v["prompt"]
        if not (ROOT / v["ref"]).exists():
            raise SystemExit(f"!! {k}：參考圖不存在 {v['ref']}")
        if (RAW / k).exists():
            raise SystemExit(f"!! {k}：舊原稿還在 codex_raw——先改名成 {k[:-4]}.previous-20260914b.png"
                             "（不然 codex_gen 會直接跳過、還印成功）")
        if f"Save the image as {k} in the current directory" not in p:
            raise SystemExit(f"!! {k}：存檔指令的檔名跟工單的鍵對不上")
        bad = leaks(p)
        if bad:
            raise SystemExit(f"!! {k} 有禁字不在否定句裡（或 green 不在綠幕指令裡）：\n   " + "\n   ".join(bad[:5]))
        if not k.startswith("feifei_still_") and NO_PANEL not in p:
            raise SystemExit(f"!! {k}：綠幕圖少了「不要畫成方形色板」（NO_PANEL）")
        if k.startswith("event_") and STYLE not in p:
            raise SystemExit(f"!! {k}：事件圖少了 STYLE（光、煙、氣的顏色規則）")
        if k.startswith("event_") and "BLUE" not in p:
            raise SystemExit(f"!! {k}：少了「眼睛是藍的」那條（FEIFEI_NOT_HUMAN）")
        if k.startswith("card_") and "mask\n     over the muzzle" in p:
            raise SystemExit(f"!! {k}：臉上的深棕色還寫成 mask")
    for k, old in MUST_GONE.items():
        if old in jobs[k]["prompt"]:
            raise SystemExit(f"!! {k}：舊的錯誤敘述「{old}」還在——替換沒套上")
    for rkey in RESULT_SHOW:
        p = jobs[f"event_feifei_{rkey}.png"]["prompt"]
        if text[rkey] not in p:
            raise SystemExit(f"!! event_feifei_{rkey}.png：少了玩家讀到的文字")
    if MAY_MOVE not in jobs["event_feifei_sleeping_guard_r1.png"]["prompt"]:
        raise SystemExit("!! sleeping_guard_r1：要穿過門，開頭得用 MAY_MOVE（SAME_PLACE 會叫它照附圖把門關著畫）")

    OUT.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    sys.stdout.write(f"{len(jobs)} 張 → {OUT.relative_to(ROOT)}\n"
                     "跑法：python tools/codex_gen.py tools/codex_jobs/feifei_fix_0914b.json（不要帶 --ref）\n")


if __name__ == "__main__":
    main()
