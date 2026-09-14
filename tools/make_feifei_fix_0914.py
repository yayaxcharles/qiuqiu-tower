# -*- coding: utf-8 -*-
"""2026-09-14 稽核代理逐張看圖抓到的 13 張走鐘圖，重生工單。

| # | 檔案 | 壞在哪 |
|---|---|---|
| 1 | feifei_still_act1_stairs | 地上倒著的「魔物」是戴斗笠、米白道服、灰虎斑的師父（中魔那一態） |
| 2 | feifei_still_act2_smoke | 化成煙的也是同一個斗笠師父 |
| 3 | feifei_still_home | 她走在師父與球球**前面**更遠處；台詞寫的是「菲菲走在最後面」 |
| 4 | card_feifei_jiuweiquan | 牌名「絕學·九尾針」，圖是一串九個金色拳頭 |
| 5 | card_feifei_cuiye | 牌名「絕學·毒發」，圖是卡著兩顆毛球的黃綠色喉嚨腫塊 |
| 6 | card_feifei_caiweiba | 牌名「釘尾巴」（她怕痛不靠近，用針釘），圖是她站在尾巴上踩 |
| 7 | card_feifei_fantuanfenni | 兩隻菲菲腦後都飄著球球的深藍頭巾 |
| 8 | event_feifei_stuck_kitten_r1 | 沒有母貓，小貓已經在欄杆外歡呼 |
| 9 | event_feifei_catnip_field_r1 | 選的是「採葉交換」，她卻是蚊香眼嗑茫（像另一個選項「進去打滾」） |
| 10 | event_feifei_greedy_merchant_r1 | 選的是「灌功試驗」，圖是兩人拉扯蓋布托盤，沒有灌功 |
| 11 | event_feifei_lost_kitten_r1 | 小黑貓頭巾還蓋著眼睛、掛著眼淚，她陪著一起跑 |
| 12 | event_feifei_rescue_return_fish | 開場圖先演了選項：她已經蹲下遞魚乾，也沒有藥罐 |
| 13 | event_feifei_sparring_cat | 開場圖沒有黑衣師弟 |

**根因分三類，下次寫提示詞先想這三條**：

1. **參考圖裡有什麼，模型就可能畫什麼**（art_rules 第二個雷）。
   #1、#2 附的劇情合參表上，唯一長得像「魔物」的就是中魔的師父，提示詞只寫「守關的魔物倒下」，
   模型就從表上挑了他。改法：把魔物寫成**具體、而且不是貓**的樣子，再明講「表上四個角色只有她在這張」。
   結果圖 #8～#11 是同一件事換個方向：續集照附圖（她的開場圖）重畫，開場圖裡**沒有**的角色
   （母貓、看園老貓）就不會出現，開場圖裡**過期的狀態**（她在拉小貓、蚊香眼打滾、頭巾蓋眼、
   托盤夾在兩人中間）會被照抄。改法：補一段英文「Show this as」把畫面寫死，再列
   「附圖裡缺、要加上」與「附圖裡過期、不要照抄」。
   球球那份當初由 `_fix_vague_result_art.py` 補過英文說明（灌功那張就有），
   `make_feifei_result_art_jobs.py` 轉成她的版本時只取中文，沒帶過來。
2. **敘述句互相打架**。#3 原稿同時寫「從背後看」與「塔在他們身後很遠」——從背後看的話塔在鏡頭這一側、
   進不了畫面，模型只好把塔放到他們前進的方向，「她在最後面」也就跟著跑到最前面。
   改法：改成**側面取景**、從右到左寫死順序、塔在左邊地平線。
3. **牌改了名字，場景沒跟著改**。#4、#5、#6 的場景還是球球那張（拳、喉嚨卡毛球、踩）。
   `make_feifei_shared_card_jobs.action_renamed()` 沒喊，因為它比對的動作字裡有「尾」：
   九尾拳→九尾針、踩尾巴→釘尾巴，新名字都還留著「尾」，被當成動作沒換；催噎→毒發則原名就不含動作字。
   另外那支 `SCENE_FIX` 只換「1. THE BIG OBJECT」那一行，「What the cat is doing」那行還留著球球的動作
   （連環針那張到現在還寫著空中三連踢），**這裡兩行都換**。
   #7 是雙人牌前半段抄了兩段球球長相、最後才補一句「不是灰虎斑」——一句否定贏不了前面兩段具體描述。
   照 `make_coop2_card_jobs.SWAP` 的做法**整段換掉**，再加一條「誰都沒有頭巾」。

#12、#13 是開場圖本身錯：#12 先演了選項；#13 原稿場景句只有白貓
（她的 `_v2` 那版有師弟，`codex_raw` 裡還在，但比稿時留下的是沒有師弟那張）。

**綠幕那六張（#8～#13）另外補貼 `STYLE`**：原稿結尾沒有「光、煙、氣一律暖金／乳白／暖灰、實心」那條，
#10 要畫一道灌進去的氣，不指定顏色模型會自己挑到綠色（第三個雷）。

**做法**：能沿用原稿的，只精準替換錯的那一段（`swap()` 要原文剛好出現一次，對不上就停）；
#3 的場景段、#7 的長相段、#8～#11 的畫面說明是重寫。原稿來源：
  - #1～#3：`feifei_fix_0913b.json`（現在這三張原稿就是它生的）
  - #4～#6：`feifei_shared_cards.json`；#7：`feifei_cards_missing.json`
  - #8～#11：原工單已被 `make_feifei_result_art_jobs.py` 重跑時清空（git 2a6b40d 那版還看得到），
    這裡用那支的同一組模板（HEAD／ACTOR／TAIL）加現行的 `_feifei_result_text.json` 重組——
    文字是玩家現在讀到的版本（#9、#10 的台詞在原圖生完之後被使用者改寫過）
  - #12、#13：`feifei_events.json`

**參考圖照原本那張的慣例**：#1～#3 劇情合參表、#4～#7 設定表、#8～#11 她自己的開場圖（續集做法）、
#12～#13 設定表。#7 原本是命令列帶 `--ref` 生的、沒留紀錄，這裡照牌面慣例用設定表。

**重生之後要跟著處理的**：#12、#13 換了開場圖，它們的續集（`rescue_return_fish_r0／r1`、
`sparring_cat_r1`）是照舊開場圖畫的；`tools/ref/event_refs_feifei/` 的快取也要刪掉重建，
不然之後的續集會照舊圖畫（`make_feifei_result_art_jobs.py` 的自檢會喊）。

用法：
  python tools/make_feifei_fix_0914.py
  python tools/codex_gen.py tools/codex_jobs/feifei_fix_0914.json
  （**不要帶 --ref**：每一筆自己帶）
  舊原稿 2026-09-14 已改名成 `<檔名>.previous-20260914.png`。要再重生一次，得先再改名一次
  （`codex_gen.py` 看到檔案在就跳過、還印成功——第九個雷）。
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import NO_PANEL, STYLE  # noqa: E402
from make_coop2_card_jobs import SWAP as COOP2_SWAP  # noqa: E402
from make_feifei_result_art_jobs import (  # noqa: E402
    ACTOR, HEAD, MAY_MOVE, MOVES_ON, SAME_PLACE, TAIL as RESULT_TAIL)
from make_feifei_slides_jobs import SCENES as SLIDE_SCENES  # noqa: E402

JOBS = ROOT / "tools" / "codex_jobs"
OUT = JOBS / "feifei_fix_0914.json"
TEXT = JOBS / "_feifei_result_text.json"
STORY_REF = "tools/ref/feifei_story_ref.png"
SHEET_REF = "tools/ref/feifei_ref.png"

EXPECTED = [
    "feifei_still_act1_stairs.png", "feifei_still_act2_smoke.png", "feifei_still_home.png",
    "card_feifei_jiuweiquan.png", "card_feifei_cuiye.png", "card_feifei_caiweiba.png",
    "card_feifei_fantuanfenni.png",
    "event_feifei_stuck_kitten_r1.png", "event_feifei_catnip_field_r1.png",
    "event_feifei_greedy_merchant_r1.png", "event_feifei_lost_kitten_r1.png",
    "event_feifei_rescue_return_fish.png", "event_feifei_sparring_cat.png",
]


def swap(text: str, old: str, new: str, who: str) -> str:
    """精準替換：原文片段要剛好出現一次。出現零次＝來源改過；出現兩次＝不知道該換哪一個。兩種都停。"""
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"!! {who}：要換掉的原文出現 {n} 次（應該剛好 1 次）——來源工單改過了，"
                         f"先看一眼再更新這支：\n   「{old[:90]}…」")
    return text.replace(old, new, 1)


_loaded: dict[str, dict] = {}


def job(name: str, key: str) -> dict:
    """從來源工單取一筆，統一成 {prompt, ref}。字串格式的工單 ref 是 None（當初靠命令列 --ref）。"""
    if name not in _loaded:
        p = JOBS / name
        if not p.exists():
            raise SystemExit(f"!! 找不到來源工單 {name}")
        _loaded[name] = json.loads(p.read_text(encoding="utf-8"))
    if key not in _loaded[name]:
        raise SystemExit(f"!! {name} 裡沒有 {key}——來源工單被重跑蓋掉了？")
    v = _loaded[name][key]
    return {"prompt": v, "ref": None} if isinstance(v, str) else {"prompt": v["prompt"], "ref": v.get("ref")}


# ---------------------------------------------------------------------------
# #1～#3 劇情幻燈片（附劇情合參表：球球、師父平時／中魔、她）
# ---------------------------------------------------------------------------
# 排除師父的那句兩張共用。**特徵要寫看得見的**（斗笠、米白道服、黑腰帶、條紋灰毛、紫色漩渦眼），
# 只寫「不是師父」模型不知道要避開什麼。
NOT_MASTER = (
    "**IT IS NOT A CAT AND IT IS NOT THE MASTER.** Do NOT draw the straw-hat master from the reference "
    "sheet anywhere in this picture, in either of his forms - no straw hat, no cream robe, no black belt, "
    "no striped grey fur, no spiral violet eyes. ")
ONLY_HER = "Of the four characters on the reference sheet, ONLY the Siamese girl appears in this picture."

HOME_SCENE = (
    "Sunset on the path home through golden fields, seen from the SIDE: the path runs straight across the "
    "picture from left to right, and all three cats walk along it toward the RIGHT edge, heading home, all at "
    "about the same distance from the viewer so nobody is hidden and nobody is shrunk into the far distance. "
    "The dark tower they have left behind stands small on the horizon at the far LEFT. Their order along the "
    "path, from right to left:\n"
    "  - FRONT (on the right, leading the way): the BROTHER - character (1) on the reference sheet - bouncing "
    "along and reaching up at the master for a dried fish;\n"
    "  - MIDDLE: the tall straw-hat MASTER, head tipped back, laughing loudly;\n"
    "  - LAST (on the left, the one closest to the tower, a few steps behind the other two): the SIAMESE GIRL, "
    "bending down to pick one of her needles up off the path and slide it into the bamboo tube at her belt.\n"
    "**She walks at the BACK of the line.** She is NOT ahead of the other two and NOT further along the path "
    "than them - if she is nearer to home than the master, the picture is wrong. She is still the subject: "
    "fully visible, face clearly shown, lit warm by the sunset.\n"
    "The master is in his NORMAL form, NOT the corrupted form from the reference sheet: no spiral violet eyes, "
    "no torn robe, no violet miasma.\n"
    "Warm orange sunset, long shadows, peaceful.")

STILL_FIX: dict[str, list[tuple[str, str]]] = {
    "feifei_still_act1_stairs.png": [(
        "The guardian monster has just fallen and a stairway up is revealed in the wall.",
        "The guardian monster of this floor has just been beaten and a stairway up is revealed in the wall. "
        "The beaten monster lies slumped against the far wall in the BACKGROUND, small and half in shadow: a "
        "hulking shaggy BEAST with rust-red fur, two stubby horns, a wide toothy jaw and X-shaped knocked-out "
        "eyes, its edges already crumbling away into a drifting wisp of warm grey smoke. " + NOT_MASTER +
        "At this point in the story nobody has beaten the master - he is still waiting at the top of the "
        "tower. " + ONLY_HER)],
    "feifei_still_act2_smoke.png": [(
        "A defeated monster is dissolving into pale smoke at the edge of the frame.",
        "A defeated monster is dissolving into pale warm-grey smoke at the edge of the frame: a big "
        "round-bellied OGRE-LIKE brute with a lumpy slate-blue hide and one broken horn, only its head and "
        "one limp arm still solid, the rest already drifting away as smoke. " + NOT_MASTER +
        "The master is only a VOICE from the top of the tower in this picture - he is not seen. " + ONLY_HER)],
    # 整段場景重寫（理由見檔頭第 2 條）
    "feifei_still_home.png": [(SLIDE_SCENES["feifei_still_home.png"], HOME_SCENE)],
}

# ---------------------------------------------------------------------------
# #4～#6 共用牌：「大物件」與「貓在做什麼」**兩行都換**（SCENE_FIX 只換第一行，第二行會打架）
# ---------------------------------------------------------------------------
CARD_FIX: dict[str, list[tuple[str, str]]] = {
    "jiuweiquan": [
        ("1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in NINE-TAIL AMBER: nine amber fists "
         "arranged in an arc all punching the same way",
         "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in WARM AMBER: NINE long slim steel "
         "NEEDLES arranged in an arc, all flying the same way, each trailing a long solid amber motion streak "
         "behind it, the nearest ones big and sharp. **They are NEEDLES, not fists** - thin shafts with sharp "
         "points and a small bamboo-wrapped grip. Do not draw fists, knuckles, punches or paw prints anywhere"),
        ("   What the cat is doing: at the centre of the arc throwing the real punch, the other eight echoing it",
         "   What the cat is doing: at the centre of the arc, her throwing paw snapped forward and open, having "
         "just flung all nine needles at once; her feet stay planted. She is THROWING, not punching"),
    ],
    # 毒一律深紫（make_feifei_card_jobs.py 的慣例）。原稿主色寫的是 SICKLY YELLOW-GREEN，整行換掉
    "cuiye": [
        ("1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in SICKLY YELLOW-GREEN: a giant bulging "
         "throat-shaped blob with two large hairballs stuck inside it, swollen to double size, with sweat drops",
         "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in DEEP VIOLET: POISON ERUPTING all at "
         "once - a big lumpy cloud of fat, SOLID, opaque violet bubbles boiling up out of one needle stuck in "
         "the middle of it, the bubbles swelling to TWICE their size as they rise and bursting into violet "
         "splashes at the rim, drawn with thick black outlines. It is poison flaring up and nothing else: "
         "**no throat shape, no swollen blob with things stuck inside it, no hairballs, no sweat drops**"),
        ("   What the cat is doing: pressing both paws hard on the blob and squeezing so it swells even bigger, "
         "with a mischievous grin",
         "   What the cat is doing: she has just flicked that needle into it and is leaning back AWAY from the "
         "eruption, her throwing paw still stretched out toward it (the edge of the bubbles may overlap that "
         "paw), ears back and eyes wide - she keeps her distance from poison. She does not hug, squeeze or "
         "press anything"),
    ],
    # 模板要求「貓跟大物件要重疊、互動」，跟「腳不碰尾巴」會打架——所以明講這張的互動是那根針
    "caiweiba": [
        ("1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in HOT CORAL: one huge coral-coloured "
         "tail being stamped flat under a paw, kinked hard at the point of impact",
         "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in HOT CORAL: one huge coral-coloured "
         "MONSTER tail (not hers - her own tail stays dark brown) sweeping across the picture, its end PINNED "
         "down by one long steel needle driven straight through it, the tail kinked hard and bristling at the "
         "pin, a few beads of violet poison at the wound"),
        ("   What the cat is doing: standing with one hind paw planted firmly on the tail, looking down at it "
         "with a flat unimpressed face",
         "   What the cat is doing: standing well back from the tail with both feet planted, her throwing paw "
         "still stretched out toward the pin, a short motion streak running from that paw to the needle, a "
         "flat unimpressed face. **Her feet do NOT touch the tail** - she does not stand on it, step on it or "
         "stamp on it; keep a clear gap of background between her feet and the tail. On this card the thrown "
         "needle is how she interacts with the object"),
    ],
}

# #7 雙人牌：SWAP 換完長相之後再補這一條（她的頭上只有耳朵跟頭髮）
NO_HEADBAND = (
    "\n  - NEITHER cat wears a headband of any kind: no navy headband, no cloth band around the head, no long\n"
    "    ribbon tails streaming out behind the head. The only things on their heads are the ears and the hair\n"
    "    (fringe, plum-purple bow, short ponytail).")
APPENDED_LOOK = "\n\nIMPORTANT - THE CHARACTER IS NOT A GREY TABBY:\n"   # 原稿結尾補的那段，整段拿掉

# ---------------------------------------------------------------------------
# #8～#11 結果圖：模板重組＋「Show this as」（插在中文敘述後面，跟 _fix_vague_result_art.py 同一個位置）
# ---------------------------------------------------------------------------
RESULT_SHOW: dict[str, str] = {
    # 開場圖沒有母貓、而且她在拉小貓——兩件事都要蓋過去
    "stuck_kitten_r1":
        "the kitten is still wedged in the gap between the wooden railing bars, but now its MOTHER is right "
        "beside it, holding its shoulders in both front paws and gently TURNING it sideways so that one "
        "shoulder slips through the gap after the other - the kitten is halfway out, body twisted. A step "
        "away from them, NOT touching either of them, the Siamese cat girl stands in a practice stance "
        "copying that same sideways shoulder-turn with her own body - shoulders rotated, one paw sliding "
        "forward - eyes narrowed in concentration, small motion lines around her showing the turn.\n"
        "**ONE CHARACTER IS MISSING FROM THE ATTACHED PICTURE AND MUST BE ADDED:** the kitten's MOTHER - a "
        "plump grown-up ORANGE-AND-WHITE cat, clearly bigger than the kitten, with a calm, gentle face. The "
        "mother is the one freeing the kitten.\n"
        "**OUT OF DATE IN THE ATTACHED PICTURE - DO NOT COPY:** the cat girl pulling the kitten out by its "
        "body. Here she does NOT hold, pull or touch the kitten, and the kitten is NOT already free and "
        "cheering outside the railing.",
    # 開場圖畫的是她蚊香眼打滾，續集照抄了；看園老貓開場圖裡沒有，上一版只畫出一隻手
    "catnip_field_r1":
        "the Siamese cat girl stands upright on her feet at the edge of the catnip, wide awake and "
        "clear-headed, her nose wrinkled and a small frown at the strong smell. She has just handed a neat "
        "bundle of fresh catnip sprigs to the OLD GARDEN-KEEPER CAT, who holds the bundle in one paw, and with "
        "his other paw he passes her two small ninja tools from his open wooden supply box - a little round "
        "smoke bomb and a small four-pointed shuriken. Both of her paws are closing around the two tools.\n"
        "**ONE CHARACTER IS MISSING FROM THE ATTACHED PICTURE AND MUST BE ADDED:** the OLD GARDEN-KEEPER CAT - "
        "a stooped elderly cat with pale ginger fur, bushy white eyebrows and a long white chin beard, in a "
        "plain brown work robe, standing beside the open wooden supply box. Draw all of him inside the "
        "picture, not cut off at the edge.\n"
        "**OUT OF DATE IN THE ATTACHED PICTURE - DO NOT COPY:** her rolling on her back in the catnip with "
        "spiral eyes and a dazed open-mouthed grin - that was the temptation, and this time she did NOT give "
        "in. Her eyes here are normal round BLUE eyes with pupils and a white highlight, NOT spirals; she is "
        "NOT lying, rolling or sitting in the plants, and she does NOT look dizzy or blissed out.",
    # 灌功＝把氣灌「進」她身上（球球那張畫成從他身上抽出來，這裡照使用者要的方向）
    "greedy_merchant_r1":
        "the grey merchant cat in round spectacles is just finishing his power-infusion test on her. She "
        "stands with her back turned toward him (her face still clearly visible to the viewer), and he presses "
        "one paw flat against her BACK, between her shoulder blades; a thick band of WARM GOLDEN AMBER energy, "
        "solid and opaque, flows out of his palm INTO her back. With his other paw he holds his tray out past "
        "her side with the cloth cover off, and the promised relic - one round golden amulet - sits on it "
        "right in front of her. She is bent forward a little, frowning hard, one paw pressed to her chest, "
        "with small wobbly zigzag marks around her chest showing that her breathing and energy have been "
        "thrown out of rhythm.\n"
        "**OUT OF DATE IN THE ATTACHED PICTURE - DO NOT COPY:** the covered tray held out between them at "
        "arm's length. Nobody is pulling or tugging anything: she does NOT grab the tray, and there is NO "
        "tug-of-war.",
    # 開場圖頭巾蓋著眼睛、在哭——續集照抄；MAY_MOVE 又讓她跟著跑走
    "lost_kitten_r1":
        "the little black kitten has pushed its oversized headband UP onto its forehead, so both of its eyes "
        "are uncovered and bright, and it is running off happily ON ITS OWN toward a corner of the stone "
        "stairway at the edge of the picture, smiling, its tears gone. The Siamese cat girl STAYS where she "
        "was beside the step, leaning forward and pointing firmly with one outstretched paw toward that "
        "corner to show the kitten the way. On the ground at her feet lies a small tied cloth bundle of dried "
        "fish that the kitten left behind for her.\n"
        "**OUT OF DATE IN THE ATTACHED PICTURE - DO NOT COPY:** the headband covering the kitten's eyes, and "
        "its tears. The cat girl does NOT run along with the kitten and does NOT carry or lead it - she stays "
        "put and only points.",
}

# ---------------------------------------------------------------------------
# #12、#13 事件開場圖（還沒選選項）
# ---------------------------------------------------------------------------
OPEN_FIX: dict[str, list[tuple[str, str]]] = {
    "event_feifei_rescue_return_fish.png": [
        ("Scene: a bone-thin, ragged village cat slumped against the stone wall of the tower, head lifted to "
         "look silently at the Siamese cat girl, an empty torn fish-bundle wrapper on the floor beside it, dim "
         "and quiet mood",
         "Scene: a bone-thin, ragged village cat sits against the stone wall of the tower - its old wound has "
         "healed (no bandages), but it is clearly starving - holding a small brown clay MEDICINE JAR against "
         "its chest in both paws, the last thing it has left, and looking up at the Siamese cat girl with a "
         "brave, wobbly smile it is forcing out anyway. An empty torn fish-bundle wrapper lies on the floor "
         "beside it. The Siamese cat girl STANDS a step away facing it, both paws EMPTY and held close to her "
         "own chest, looking at the village cat with a worried face. **Nothing has been decided yet:** she is "
         "NOT crouching, NOT reaching out, and NOT holding out or handing over a bag of fish, food or anything "
         "else. Dim and quiet mood"),
        # 轉換時漏掉的代名詞（留著 he 會讓模型去找一隻公貓，見 make_feifei_result_art_jobs.py 的 ACTOR）
        ("the thing he is looking at", "the thing she is looking at"),
    ],
    # 師弟那句沿用她的 `_v2` 原稿（也是球球現行那張的寫法），補上「擋住樓梯」與「師弟不能省」
    "event_feifei_sparring_cat.png": [
        ("Scene: a lean WHITE cat standing in the middle of the path with its arms folded and a cocky look; the "
         "Siamese cat girl faces it in a ready stance",
         "Scene: a lean WHITE cat standing at the foot of a short flight of stone stairs with its arms folded "
         "and a cocky look, blocking the way up, and right beside it a slightly smaller BLACK cat (its junior "
         "sparring partner: plain dark clothes, a small red sash, no ninja headband) also standing with arms "
         "folded, looking eager; the Siamese cat girl faces the two of them in a ready stance. Left to right: "
         "the black junior, the white cat, then the Siamese cat girl on the right. All three cats must be "
         "clearly visible in the picture - **the black junior is NOT optional**; a picture with only the white "
         "cat and the girl is wrong"),
    ],
}

# ---------------------------------------------------------------------------
# 自檢用的字表
# ---------------------------------------------------------------------------
# 「green」只准出現在綠幕指令本身、STYLE 的「never green」、長相規則裡「眼睛不可以是綠的」那句
GREEN_OK = (
    "Background must be a solid pure green (#00FF00)",
    "The green background must stay pure green everywhere it shows",
    "coloured backdrop on top of the green",
    "never green, never greenish",
    "The picture sits on a green screen",
    "Do NOT draw brown, amber, gold, green or dark eyes on her",
)
# grey tabby／navy headband 唯一准出現在非否定句的地方：劇情合參表的角色說明第 (1) 條。
# 那條拿掉的話，模型分不清表上哪隻是她、哪隻是師兄（make_feifei_story_jobs.py 的 CAST）。
LEGEND_OK = ("(1) a small chibi GREY TABBY cat ninja with a navy headband and navy outfit - this is the BROTHER",)
NEG = re.compile(r"\b(?:not|never|no|nor|without)\b", re.I)
WORDS = {
    "green": re.compile(r"\bgreen(?:ish)?\b", re.I),
    "grey tabby": re.compile(r"\bgr[ea]y tabby\b", re.I),
    "navy headband": re.compile(r"\bnavy headband\b", re.I),
}
# #1～#3 一定要有的「排除師父造型」否定句
NOT_MASTER_MARK = {
    "feifei_still_act1_stairs.png": "IT IS NOT THE MASTER",
    "feifei_still_act2_smoke.png": "IT IS NOT THE MASTER",
    "feifei_still_home.png": "NOT the corrupted form",
}
# 換完不可以還在的舊敘述（找整句裡最有辨識度的一段，不找單字——單字會撞上新寫的否定句）
MUST_GONE = {
    "feifei_still_act1_stairs.png": "The guardian monster has just fallen",
    "feifei_still_act2_smoke.png": "dissolving into pale smoke at the edge",
    "feifei_still_home.png": "seen from behind",
    "card_feifei_jiuweiquan.png": "nine amber fists",
    "card_feifei_cuiye.png": "hairballs stuck inside it",
    "card_feifei_caiweiba.png": "stamped flat under a paw",
    "card_feifei_fantuanfenni.png": "two trailing tails",
    "event_feifei_rescue_return_fish.png": "head lifted to look silently",
    "event_feifei_sparring_cat.png": "cocky look; the Siamese cat girl faces it",
}


def leaks(prompt: str) -> list[str]:
    """逐句找禁字。green 看白名單；grey tabby／navy headband 要嘛同一句前面有否定詞，要嘛是合參表說明。

    切句先切換行再切句點：寧可把一句話切斷而誤報（會停下來、看得到），
    也不要把兩句併成一句、讓前一句的 not 放過後一句的漏網。
    """
    bad = []
    for line in prompt.split("\n"):
        for s in re.split(r"(?<=[.!?;])\s+", line):
            for word, rx in WORDS.items():
                for m in rx.finditer(s):
                    if word == "green":
                        ok = any(f in s for f in GREEN_OK)
                    else:
                        ok = any(f in s for f in LEGEND_OK) or bool(NEG.search(s[:m.start()]))
                    if not ok:
                        bad.append(f"「{word}」：{s.strip()[:120]}")
    return bad


def main() -> None:
    jobs: dict[str, dict] = {}

    # ---- #1～#3 ----
    for key, fixes in STILL_FIX.items():
        src = job("feifei_fix_0913b.json", key)
        t = src["prompt"]
        if SLIDE_SCENES[key] not in t:
            raise SystemExit(f"!! {key}：原稿裡找不到 make_feifei_slides_jobs.SCENES 那段場景——兩邊對不上")
        for old, new in fixes:
            t = swap(t, old, new, key)
        if src["ref"] != STORY_REF:
            raise SystemExit(f"!! {key}：原稿附的不是劇情合參表（{src['ref']}），慣例對不上，先看一眼")
        jobs[key] = {"prompt": t, "ref": STORY_REF}

    # ---- #4～#6 ----
    for cid, fixes in CARD_FIX.items():
        key = f"card_feifei_{cid}.png"
        t = job("feifei_shared_cards.json", key)["prompt"]
        for old, new in fixes:
            # 2026-09-14 晚已回寫進 make_feifei_shared_card_jobs.SCENE_FIX：來源工單重跑出來就是修好的，直接放行
            if old not in t and new in t:
                continue
            t = swap(t, old, new, key)
        jobs[key] = {"prompt": t, "ref": SHEET_REF}

    # ---- #7 ----
    key = "card_feifei_fantuanfenni.png"
    t = job("feifei_cards_missing.json", key)["prompt"]
    if t.count(APPENDED_LOOK) != 1:
        raise SystemExit(f"!! {key}：找不到結尾補的那段「IMPORTANT - THE CHARACTER IS NOT A GREY TABBY」")
    t = t[:t.index(APPENDED_LOOK)]
    if not t.endswith("and report the path."):
        raise SystemExit(f"!! {key}：拿掉結尾那段之後不是停在存檔指令，原稿結構跟預期不一樣")
    for old, new in COOP2_SWAP:
        t = swap(t, old, new, key)
    t = swap(t, COOP2_SWAP[1][1], COOP2_SWAP[1][1] + NO_HEADBAND, key)
    t = swap(t, "Output 1024x820 PNG.", NO_PANEL + "Output 1024x820 PNG.", key)
    jobs[key] = {"prompt": t, "ref": SHEET_REF}

    # ---- #8～#11 ----
    # 文案過期就不要生（跟 make_feifei_result_art_jobs.py 同一條，多看 dialogue.ts：她的台詞對照表在那裡）
    newest = max((ROOT / "src" / "content" / f).stat().st_mtime for f in ("events.ts", "dialogue.ts"))
    if not TEXT.exists() or TEXT.stat().st_mtime < newest:
        raise SystemExit(f"!! {TEXT.name} 比 events.ts／dialogue.ts 舊（或不存在）。先跑：\n"
                         "   UPDATE_FEIFEI_TEXT=1 npx vitest run tools/feifei_result_text.test.ts")
    text = json.loads(TEXT.read_text(encoding="utf-8"))
    manifest = json.loads((ROOT / "public" / "assets" / "manifest.json").read_text(encoding="utf-8"))
    for rkey, show in RESULT_SHOW.items():
        if rkey not in text:
            raise SystemExit(f"!! {TEXT.name} 裡沒有 {rkey}——事件的 resultArt 改名了？")
        eid = re.sub(r"_r[01]$", "", rkey)
        name = f"event_feifei_{rkey}.png"
        ref = f"tools/ref/event_refs_feifei/{eid}.png"
        scene = manifest["bg"].get(f"bg/event_feifei_{eid}")
        if not scene or not (ROOT / ref).exists():
            raise SystemExit(f"!! {name}：她的開場圖或參考圖不存在（{scene}／{ref}）")
        # 參考圖是開場圖的快取；開場圖換過而快取沒換，續集會照舊圖畫
        if (ROOT / "public" / scene).stat().st_mtime > (ROOT / ref).stat().st_mtime:
            raise SystemExit(f"!! {name}：開場圖比參考圖新——刪掉 {ref} 再跑 make_feifei_result_art_jobs.py 重建")
        head = HEAD.format(same=MAY_MOVE if rkey in MOVES_ON else SAME_PLACE)
        t = head + text[rkey] + ACTOR + RESULT_TAIL.format(name=name)
        t = swap(t, "\n\n**WHO DOES WHAT**", " Show this as: " + show + "\n\n**WHO DOES WHAT**", name)
        t = swap(t, "Output 1024x768 PNG.", STYLE + "Output 1024x768 PNG.", name)
        jobs[name] = {"prompt": t, "ref": ref}

    # ---- #12、#13 ----
    for key, fixes in OPEN_FIX.items():
        src = job("feifei_events.json", key)
        t = src["prompt"]
        for old, new in fixes:
            t = swap(t, old, new, key)
        t = swap(t, "Output 1024x768 PNG.", STYLE + "Output 1024x768 PNG.", key)
        if src["ref"] != SHEET_REF:
            raise SystemExit(f"!! {key}：原稿附的不是設定表（{src['ref']}），慣例對不上，先看一眼")
        jobs[key] = {"prompt": t, "ref": SHEET_REF}

    # ======================= 自檢：一律 SystemExit =======================
    if list(jobs) != EXPECTED:
        raise SystemExit(f"!! 應該剛好這 13 張、照表的順序。少了 {sorted(set(EXPECTED) - set(jobs))}，"
                         f"多了 {sorted(set(jobs) - set(EXPECTED))}")
    for k, v in jobs.items():
        p = v["prompt"]
        if not (ROOT / v["ref"]).exists():
            raise SystemExit(f"!! {k}：參考圖不存在 {v['ref']}")
        if f"Save the image as {k} in the current directory" not in p:
            raise SystemExit(f"!! {k}：存檔指令的檔名跟工單的鍵對不上")
        bad = leaks(p)
        if bad:
            raise SystemExit(f"!! {k} 有禁字不在否定句裡（或 green 不在綠幕指令裡）：\n   " + "\n   ".join(bad[:5]))
        if not k.startswith("feifei_still_") and NO_PANEL not in p:
            raise SystemExit(f"!! {k}：綠幕圖少了「不要畫成方形色板」（NO_PANEL，第十一個雷）")
        if k.startswith("event_") and STYLE not in p:
            raise SystemExit(f"!! {k}：事件圖少了 STYLE（光、煙、氣的顏色規則，第三個雷）")
    for k, mark in NOT_MASTER_MARK.items():
        if mark not in jobs[k]["prompt"]:
            raise SystemExit(f"!! {k}：少了排除師父造型的否定句「{mark}」")
    for k, old in MUST_GONE.items():
        if old in jobs[k]["prompt"]:
            raise SystemExit(f"!! {k}：舊的錯誤敘述「{old}」還在——替換沒套上")
    for rkey in RESULT_SHOW:
        p = jobs[f"event_feifei_{rkey}.png"]["prompt"]
        if text[rkey] not in p or "OUT OF DATE IN THE ATTACHED PICTURE" not in p:
            raise SystemExit(f"!! event_feifei_{rkey}.png：少了玩家讀到的文字或「附圖過期」那段")

    OUT.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 張 → {OUT.relative_to(ROOT)}")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_fix_0914.json（不要帶 --ref，每筆自己帶）")


if __name__ == "__main__":
    main()
