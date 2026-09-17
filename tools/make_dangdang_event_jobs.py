# -*- coding: utf-8 -*-
"""噹噹的 E 批事件插圖工單——四篇專屬事件的 4 張場景圖 ＋ 9 張結果圖（2026-09-17）。

鍵怎麼來的（**照 `src/content/events.ts` 抄，不要自己取名**）
------------------------------------------------------------
  場景圖：事件畫面靠事件編號自動找圖（`ui/screens/event.ts` 的 `artUrl('bg', 'bg/event_<id>')`），
          所以檔名就是 `event_<事件 id>.png` → 進倉後的鍵是 `bg/event_<事件 id>`。
  結果圖：`resultArt` 已經寫死在資料裡（`dangdang_lining_r0` 那一串），
          檔名 `event_<resultArt>.png` → 鍵 `bg/event_<resultArt>`。
          `tools/event_result_art.test.ts` 盯著「鍵在 manifest 裡、檔案真的在」，
          而 `eventArt()` 查不到鍵是**靜靜回空字串**——打錯一個字就是那個選項沒圖、
          測試全過、線上不報錯，只有玩家覺得怪。所以下面的名字是從 `events.ts` 撈出來對過的。

**每一張畫的是那段文字在講的事**。這個專案被回報過好幾次「事件圖跟文字對不上」，
所以每一段提示詞上面都貼著它對應的中文原文（`events.ts` 的 `text` 或 `result`），
改圖之前先對一次那段字。結果圖畫的是「選了這個之後發生什麼」，不是事件標題。

跟 D 批相反：**這一批是綠幕去背的**
------------------------------------
走 `add_event_art.py` 進倉（去背、不裁、縮到 560x420），所以背景要純綠、主體要挖得乾淨。
兩條是 B 批（牌面）才學到的，一定要沿用：
  1. **沒有黑外框的柔光會暈進綠幕，去背去不掉**——特效一律畫成有黑外框的實心形狀。
     （`dangdang_wenzhu` 第一版的兩圈光暈，進倉後量到 5.97% 的可見像素帶綠。）
  2. **兩個顏色之間不要漸層**——漸層會從綠色經過。
     （`dangdang_jieli` 第一版寫「藍變成玫瑰紅」，模型從藍經過青綠走到粉，4.54% 帶綠。）
還有一條是綠色的分寸：**他的青綠短褂是設計的一部分，不算特效**，
不寫這句的話「整張不准有綠色」會跟他的衣服打架（`make_dangdang_card_jobs.py` 檔頭）。

長相一律交給參考圖 `tools/ref/dangdang_ref.png`，辨識清單直接 import A 批那一份
（`make_dangdang_hero_jobs.LOOK` / `GEAR`）——**全專案只定義一份**，抄三份遲早有一份會漏
（`art_rules.py` 第六個雷）。

跑法
----
  python tools/make_dangdang_event_jobs.py
  python tools/codex_gen.py tools/codex_jobs/dangdang_events_1.json --ref tools/ref/dangdang_ref.png
  python tools/codex_gen.py tools/codex_jobs/dangdang_events_2.json --ref tools/ref/dangdang_ref.png
  （**一次最多兩條**，`codex_gen.py` 坑 1。）

  只重生幾張：python tools/make_dangdang_event_jobs.py --only dangdang_lining_r0 --redo
  （`--redo` 會把舊稿改名留底。不加的話 `codex_gen.py` 看到檔案已存在就整張空轉，
    印的還是「已存在跳過」、離開碼 0，看起來像成功——`art_rules.py` 第九個雷。）

**自檢不寫成 `SystemExit`**（使用者 2026-09-17 明示）：工作檔一定會寫出去，
對不上 `events.ts` 的、已經有舊稿的，各印成一塊醒目的清單。
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

RAW = ROOT / "tools" / "codex_raw"
JOBS = ROOT / "tools" / "codex_jobs"
REF = ROOT / "tools" / "ref" / "dangdang_ref.png"

HEAD = (
    "A single scene illustration for a story event in a cute cartoon roguelike card game, landscape "
    "composition. THE MAIN CHARACTER IS THE BLACK-AND-WHITE TUXEDO CAT in the attached reference image.\n"
    + LOOK +
    "Never draw a second tuxedo cat, and never put a grey tabby ninja, a straw-hat cat or a "
    "purple-jacketed Siamese girl in his place.\n"
)

# ★ A 批的 `GEAR` **不能整段搬過來**（`art_rules.py` 檔頭第一條：規則寫太死會跟姿勢敘述打架）。
#   那一段寫「兩隻護臂永遠不會脫下來、不會變成他手上拿的東西」，那是為了戰鬥姿勢寫的；
#   但這四篇事件有一半的劇情**就是在講他把護臂卸下來**（磨手的護臂卸開扣帶、一掌留下的凹痕拿在手上擦、
#   歪掉的門框把護臂卸下來卡進門底），而且他還要拿鉗子、銅錘、抹布、湯碗。
#   照搬的話會是姆斯那晚同一種失敗：同一張連掛兩次、模型把護臂硬長回手臂上。
#   所以這裡改寫成「衣服與腰帶不會脫、護臂只有這段文字明說時才卸下、卸下來的那隻一定還在畫面裡」。
GEAR_EVENT = (
    "WORN GEAR: the teal jacket and the brown sash are attached to his body - they move and tilt with "
    "him, they never come off and never appear twice.\n"
    "THE TWO BRONZE BRACERS: he wears one on each forearm. **Some of these scenes say he has taken one "
    "off - when the scene says so, that is correct and you must draw it off.** In every picture BOTH "
    "bracers are somewhere we can see: worn on his arms, or the loose one held in his paw or set down "
    "beside him exactly where the scene puts it. Never draw three, never draw only one, and never move "
    "one to a different part of his body.\n"
    "HIS PAWS: rounded and closed, no claws out. He may hold the tools and objects this scene names "
    "(pliers, a hammer, a rag, a cloth, a bowl) - he carries no bladed weapon.\n"
    "HIS EYES: amber-gold with a glossy white highlight. When both eyes show they match each other in "
    "size and shape; from the side the far eye is behind his head and that is correct. His gaze points "
    "the way his head is turned.\n"
)

# ★ B 批（牌面）才學到的兩條，加上綠色的分寸。`STYLE` 只講「特效不要綠、要實心」，
#   沒講「要有黑外框」與「不要漸層」——那兩條是 2026-09-17 進倉量到殘綠才補上的。
EFFECTS = (
    "**EVERY EFFECT HAS A THICK BLACK OUTLINE ROUND ITS EDGE**, the same weight as the outline round the "
    "cat, and ends at that outline. Do not put a soft halo, bloom, haze or fading glow outside it: a soft "
    "edge blends into the green background and that blended ring survives the chroma key as a fluorescent "
    "green fringe.\n"
    "Never blend or fade one colour into another either - a gradient between two colours drifts through "
    "green on its way.\n"
    "His TEAL-GREEN jacket is part of his design and stays exactly as the reference draws it - the jacket "
    "is not an effect and the no-green rule does not touch it.\n"
)

TAIL = (
    "\nTell the story in one readable picture: clear staging, strong silhouette, expressive face, only "
    "what the scene needs. It will be shown about 420 pixels wide, so no fine detail that disappears when "
    "shrunk. Draw him big enough that his face reads clearly at that size.\n"
    "Nothing is in the picture except him and the props this scene names: no room, no ceiling, no "
    "scenery, no text, no letters, no numbers, no watermark, no user interface, no border.\n"
    # 事件圖是去背的，主體以外全是綠幕；東西放地上就得有一小塊地。菲菲那批也是這樣畫的
    #（`event_feifei_pouch_r0` 腳下就一小塊碎石地）。**邊緣要不規則**，方方正正的一塊地板
    # 就是 `art_rules.NO_PANEL` 那條「不要畫成一塊方形色板」。
    "If the scene puts something on the ground, draw a SMALL PATCH of stone floor under him, just big "
    "enough to hold him and those things, with a ragged irregular edge that fades to nothing - not a "
    "full floor, and never a slab with straight edges or square corners.\n"
    + STYLE + EFFECTS + GEAR_EVENT +
    "Output 1024x768 PNG. Save the image as {fid} in the current directory and report the path."
)

# ---------------------------------------------------------------------------
# 13 張。鍵名照 `src/content/events.ts`，中文註解是那張圖對應的原文。
# ---------------------------------------------------------------------------
SCENES: dict[str, str] = {
    # ===== 磨手的護臂 =====
    # 「噹噹抬起左手，護臂裡忽然一陣刺痛。他卸開扣帶，發現布墊已磨穿，銅邊在手腕上刮出一道紅痕。
    #  噹噹：『難怪越戴越疼。』工具袋裡還有一塊厚布，也放著包紮用的藥布。
    #  他把兩樣攤到膝上，試著屈伸手腕。」
    "dangdang_lining":
        "He sits cross-legged on a patch of stone floor with ONE bronze bracer taken off: its buckle "
        "straps hang open and he holds it tipped toward us in one paw so we can see the cloth padding "
        "inside WORN RIGHT THROUGH - a ragged hole in the lining with bare bronze behind it. The bare "
        "wrist of his other arm has a single angry RED SCRAPE across it, and he is flexing that paw open "
        "and shut, looking down at it with his brows drawn together. Laid out across his knees are the "
        "two things he has to choose between: a folded pad of THICK BROWN CLOTH and a roll of WHITE "
        "MEDICINE BANDAGE. His open canvas tool bag sits beside him. The arm that is holding the loose "
        "bracer still wears its own bracer, so both bracers are visible.",
    # 「噹噹把厚布折進護臂，磨平刮手的銅邊。他重新扣好，靠著牆試推幾次，將原先太緊的扣帶放鬆一格。
    #  噹噹：『這樣手腕才轉得動。剛才綁太死了。』」
    "dangdang_lining_r0":
        "Both bracers are back on and he is testing the repair: he leans forward and pushes BOTH rounded "
        "paws flat against a short section of stone wall at the right of the picture, elbows bent, one "
        "foot braced behind him, pressing into it a few times. On the near bracer the buckle strap is "
        "clearly done up ONE HOLE LOOSER, with a visible gap of slack leather past the buckle, and the "
        "brown cloth padding shows as a neat lip at the rim. A small metal file and the leftover scrap of "
        "thick brown cloth lie on the floor by his foot. His face is satisfied and businesslike.",
    # 「噹噹拿藥布敷住傷處，把護臂放在旁邊。等疼痛減輕，他活動手指，墊入厚布，再鬆鬆扣回去。
    #  噹噹：『先別磨到傷口。重新調整，等下一次休息。』」
    "dangdang_lining_r1":
        "He sits on the stone floor with the scraped wrist WRAPPED IN WHITE BANDAGE tied off in a small "
        "knot, spreading and closing the fingers of that paw to test it, shoulders dropped in relief and "
        "his eyes half closed - the pain has eased. In his other paw he holds the bracer that came off, "
        "the thick brown cloth now tucked inside it and its straps done up loose and slack, not "
        "yet worn. A small clay medicine jar with its lid off stands on the floor beside him. That paw "
        "still wears its own bracer, so both bracers are visible.",

    # ===== 偷走的工具箱 =====
    # 「一隻老鼠推著板車經過，車上壓著一只舊木箱。箱角包了三塊銅片，第四角卻只釘著薄木板。
    #  噹噹攔住車……老鼠掀開箱子，看見斷柄鉗，耳朵頓時垂了下來，扶著歪斜的車輪說……
    #  輪軸已經歪了……噹噹摸了摸痠痛的肩膀。」
    "dangdang_toolbox":
        "A small grey RAT in a ragged tunic stands beside a wooden HANDCART whose near wheel is visibly "
        "buckled and leaning inward. On the cart sits a battered old WOODEN TOOL CHEST: three of its "
        "corners are capped with BRONZE PLATES and the fourth corner has only a thin pale plank nailed "
        "over it - draw that mismatched corner clearly. The rat has just flipped the lid open with one "
        "paw and inside lies a pair of PLIERS WITH HALF ITS HANDLE SNAPPED OFF; the rat's ears have "
        "drooped flat and it has a paw on the bent wheel. Dangdang stands facing the cart with one "
        "bracered forearm held out level to stop it, and his other paw rubbing his own aching shoulder. "
        "Two characters only - him and the one small rat.",
    # 「噹噹取回鉗子和銅錘，把箱子裡能用的幾件收進工具袋，借鉗子扳正護臂翹起的邊。
    #  他試著出手，手腕終於不再被卡住。噹噹：『工具我拿走了。那個空箱給你裝零件。』」
    "dangdang_toolbox_r0":
        "He has just finished the job: the broken-handled PLIERS are still gripped in one paw, held down "
        "by his hip, and he shoots the other bracered forearm out in front of him to test it, wrist "
        "turning freely, a small pleased narrow-eyed look on his face. On that bracer the rim that was "
        "peeled up is now pressed flat. His open canvas TOOL BAG sits on the floor by his feet with a "
        "BRONZE HAMMER handle sticking out of it, and the emptied wooden chest stands behind it with its "
        "lid open. He is the only character in the picture.",
    # 「噹噹抬住車板，讓老鼠抽出歪掉的輪軸，再一起把它敲正。放下車時，他腰側猛地一疼，
    #  只能扶著車緩氣。老鼠把工錢遞來。噹噹：『下次先卸貨。這樣抬，腰真受不了。』」
    "dangdang_toolbox_r1":
        "The handcart is back down on the ground with its wheel now straight and true. Dangdang is bent "
        "over beside it, one paw gripping the edge of the cart to hold himself up and the other pressed "
        "hard against his own lower back, one eye screwed shut and his teeth showing - his back has just "
        "gone on him. A big sweat drop hangs beside his head. The small grey RAT stands up on its "
        "hind legs in front of him holding out a little drawstring pouch of dried fish in both paws as "
        "payment. A bronze hammer and the old bent axle lie on the ground between them.",

    # ===== 一掌留下的凹痕 =====
    # 「噹噹靠著空房裡的木柱歇腳，擦去護臂上的灰。新刮痕底下，有一處早已磨圓的凹痕。
    #  他用拇指按了按，想起村裡的一次練習……樓上的腳步聲讓噹噹回過神。」
    "dangdang_old_dent":
        "He is resting, leaning his shoulder against a thick square WOODEN PILLAR. One bracer is off and "
        "held up close in front of him in one paw; a grubby RAG hangs from his other paw where he has "
        "stopped wiping it. His THUMB is pressed into one particular mark on the bronze face - a SMOOTH, "
        "OLD, ROUNDED DENT, clearly older and softer-edged than the fresh bright scratches around it. His "
        "eyes are unfocused and looking past the bracer, his mouth a quiet line: he is remembering "
        "something. The paw holding it still wears its own bracer, so both bracers are visible. His tool "
        "bag is set down against the foot of the pillar. He is the only character in the picture - draw "
        "nobody else, no memory, no second scene.",
    # 「噹噹把兩腳挪開，對著木柱練習承力，再把手往前送。做到最後幾次，腳下總算沒再打滑。
    #  噹噹：『對，就是這個位置。』」
    "dangdang_old_dent_r0":
        "He is drilling the stance against the same thick WOODEN PILLAR: feet planted WIDE APART, well "
        "outside his shoulders, knees sunk low, back straight, shoulder dropped in behind one bracered "
        "forearm which is pressed against the pillar and being driven forward. His other paw is drawn "
        "back at his waist. His eyes are down on his own back foot, his face concentrated and pleased. "
        "Two short solid cream-white scuff arcs, each with its own thick black outline, mark the floor "
        "behind his heels where he used to slide. He is the only character in the picture.",
    # 「噹噹試過幾個熟悉的動作。有一招每次使到一半，身子就會往前栽。他收回手，決定不再用它。
    #  噹噹：『這招配不上我的站法，換掉。』」
    "dangdang_old_dent_r1":
        "He has stopped mid-technique and pulled the reaching forearm back in against his chest, weight "
        "settled firmly back over his heels, while his other rounded paw is held out flat and low in a "
        "clear 'no more of that one' gesture, pushing something away. Lying on the floor under that paw "
        "is a single blank CREAM-COLOURED CARD, plain and wordless, being slid aside and away from him. "
        "His eyes are half-lidded and his mouth is set: he has decided. He is the only character in the "
        "picture.",

    # ===== 歪掉的門框 =====
    # 「走廊旁的倉房傳來呼喊。兩隻村貓困在裡面，門框被倒下的橫梁壓歪了，只能推出一道細縫……
    #  牆側有扇小窗，貓能鑽出來，箱子卻過不去……他試著推門，才撐開一點，橫梁就往下沉，他連忙抽回手。」
    "dangdang_jammed_gate":
        "A heavy wooden STOREROOM DOOR shoved crooked in its frame, with a massive fallen ROOF BEAM lying "
        "slanted across the top of the frame and crushing it down. The door is open only a HAND'S-WIDTH "
        "CRACK, and squeezed into that crack are the faces of two ordinary little VILLAGE CATS (plain "
        "house cats in simple brown work clothes, no headbands, no bracers) with one paw reaching out. "
        "Dangdang crouches in front of the door and has just SNATCHED his bracered forearm back from the "
        "gap, rocking away from it, because the beam has sunk another inch - a puff of splinters and "
        "wood dust bursts from where it bit down. His ears are back and his eyes are wide and alert. In "
        "the wall beside the door is a SMALL HIGH WINDOW, too small for a crate.",
    # 「噹噹頂住門框，讓村貓一箱箱往外拖。最後一箱過去時，他手臂已抖得厲害，肩頭也被粗木磨破。
    #  村貓分出小魚乾，替他裝好。噹噹：『箱子先移走，別再堵著門。』」
    "dangdang_jammed_gate_r0":
        "He is holding the whole weight up: both bracered forearms shoved straight above his head against "
        "the sagging beam and door frame, feet stamped wide, knees bent deep, teeth gritted, head down "
        "between his arms - and his arms are SHAKING, drawn with short solid judder lines beside them, "
        "each with its own thick black outline. A raw RED GRAZE is scraped across the top of one "
        "shoulder where the rough beam has been rubbing. Below him one small VILLAGE CAT is dragging the "
        "last wooden GRAIN CRATE out through the gap while a second village cat holds up a little pouch "
        "of dried fish for him. Three characters: him and the two plain village cats.",
    # 「噹噹卸下一隻護臂，卡進門底。三人趁空隙搬出糧箱和牆邊的布包；村貓拿出包裡的秘寶，送給他道謝。
    #  護臂抽出時已被壓歪，噹噹敲了幾下，勉強戴回去，出手卻總卡住。噹噹：『變形了。這樣下去，連手都轉不順。』」
    "dangdang_jammed_gate_r1":
        "Afterwards. He is wearing the bracer that was used as the wedge and it is visibly WRECKED: the "
        "bronze is squashed out of round, flattened on one side and buckled at the rim. He has thrown "
        "that forearm forward to punch and it has JAMMED HALFWAY - the arm stopped short, the wrist "
        "locked, drawn with two short solid cream-white stutter marks and their own thick black "
        "outlines. He is scowling down at the ruined bracer. A bronze hammer lies on the floor beside a "
        "rescued wooden GRAIN CRATE and an open cloth BUNDLE with a small ornate BRONZE BELL treasure "
        "resting on it - the thank-you gift. He is the only cat in the picture.",
    # 「噹噹站到窗外，接住先鑽出來的村貓，再扶另一隻落地。牠們看見他手上有傷，拿隨身的藥替他擦好。
    #  噹噹：『箱子就先留著。這裡沒工具，硬搬會出事。』」
    "dangdang_jammed_gate_r2":
        "Outside the small high WINDOW in the stone wall, which stands open and empty now. Both little "
        "VILLAGE CATS are out: one has just landed and Dangdang still has a steadying paw under its arm, "
        "the other stands up on tiptoe in front of him holding a small clay MEDICINE JAR and dabbing at "
        "the scrapes on the back of his paw, which he has turned over and is holding out for them. He is "
        "looking down at them with his ears relaxed and a small quiet smile. Three characters: him and "
        "the two plain village cats. No crates - those were left behind.",
}


def result_arts_in_events_ts() -> tuple[list[str], list[str]]:
    """`src/content/events.ts` 裡噹噹那四篇的事件編號與 `resultArt` 名字。

    打錯一個字的下場是「生了一張永遠沒人用的孤兒圖」，而那個選項的結果畫面會靜靜沒有插圖
    （`eventArt()` 查不到就回空字串）。所以在產工單的當下就對一次。
    """
    src = (ROOT / "src" / "content" / "events.ts").read_text(encoding="utf-8")
    ids = re.findall(r"id: '(dangdang_[a-z_]+)', title:", src)
    arts = re.findall(r"resultArt: '(dangdang_[a-z_]+_r\d+)'", src)
    return ids, arts


def build(only: list[str]) -> dict[str, str]:
    jobs: dict[str, str] = {}
    for name in only:
        fid = f"event_{name}.png"
        jobs[fid] = (HEAD + "\nWHAT THIS PICTURE SHOWS: " + SCENES[name] + TAIL.format(fid=fid))
    return jobs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='+', default=None,
                    help='只出這幾張的工單（寫事件編號或 resultArt，例如 dangdang_lining_r0）')
    ap.add_argument('--redo', action='store_true',
                    help='已經有舊稿的先改名留底，不然 codex_gen 會直接跳過那幾張')
    ap.add_argument('--lines', type=int, default=2, help='拆成幾份工作檔（一次最多兩條線）')
    ap.add_argument('--name', default=None, help='工作檔檔名前綴（預設 dangdang_events）')
    args = ap.parse_args()

    only = args.only or list(SCENES)
    unknown = [n for n in only if n not in SCENES]
    if unknown:
        print(f"!! 沒有這幾張：{unknown}")
        print(f"   可用的：{' '.join(SCENES)}")
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
    prefix = args.name or 'dangdang_events'
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

    # 自檢一：名字有沒有跟 events.ts 對上。不中止（工作檔上面已經寫出去了），但要印得夠大聲
    ids, arts = result_arts_in_events_ts()
    want = ids + arts
    missing = [n for n in want if n not in SCENES]
    orphan = [n for n in SCENES if n not in want]
    if missing or orphan:
        print("\n" + "!" * 70)
        if missing:
            print(f"events.ts 有、這支沒有（{len(missing)} 張，生完會缺圖）：{' '.join(missing)}")
        if orphan:
            print(f"這支有、events.ts 沒有（{len(orphan)} 張，生了也沒人用）：{' '.join(orphan)}")
        print("!" * 70)
    else:
        print(f"名字對得上 events.ts 的 {len(ids)} 篇事件與 {len(arts)} 張結果圖")

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
