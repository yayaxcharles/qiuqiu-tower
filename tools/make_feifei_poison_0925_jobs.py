# -*- coding: utf-8 -*-
"""菲菲補爪力牌的缺那三張毒系牌（2026-09-25 使用者裁定）的牌面工單。

| 檔案 | 牌 | 畫面要講的事 |
|---|---|---|
| card_feifei_buyizhen.png | 補一針（常見攻擊） | 魔物已經中毒、身上冒紫泡，她再補射一根針過去 |
| card_feifei_kanzhun.png  | 看準破綻（罕見技能） | 瞇眼盯著中毒的魔物，找牠身上的空隙 |
| card_feifei_yuesa.png    | 越撒越順手（稀有能力） | 邊走邊輕鬆撒毒粉，很上手的樣子 |

做法照 2026-09-14 那批菲菲牌面（`make_feifei_fix_0914b.py` 的 #9～#14）：
  - 參考圖＝她的設定表 `tools/ref/feifei_ref.png`，每筆自己帶（跑 codex_gen 不用再給 --ref）
  - 版型＝「兩樣東西一起佔滿畫面」（大物件＋貓），長相整段用 `art_rules.feifei_look()`，不自己抄
  - 毒一律畫成深紫或芥末黃、畫面不准有綠（綠幕去背會挖成破洞，`art_rules` 第三個雷）

用法：
  python tools/make_feifei_poison_0925_jobs.py
  python tools/codex_gen.py tools/codex_jobs/feifei_poison_0925.json
  python tools/add_card_art.py card_feifei_buyizhen.png card_feifei_kanzhun.png card_feifei_yuesa.png
（這批綠幕是純綠 255，用預設門檻、不用 --despill；去背後量過沒有偏綠的像素。）
重生前先把 `tools/codex_raw/` 裡的舊原稿改名（`<檔名>.previous-<日期>.png`），codex_gen 看到舊檔在就跳過。

**manifest 別讓 add_card_art 整份重寫**：它走 `manifest_io.merge`，會用一格縮排把整份重寫
（倉庫裡是兩格），差異變成兩千多行。這批是跑完之後把 manifest 還原，
再只在 cards 區 `card/feifei_yudu` 那一行後面插三行（跟近期批次「只插新行」同一個做法）。
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import NO_PANEL, feifei_look  # noqa: E402

OUT = ROOT / "tools" / "codex_jobs" / "feifei_poison_0925.json"
SHEET_REF = "tools/ref/feifei_ref.png"

HEAD = ("A cartoon illustration for a card game, landscape composition, showing a Siamese cat girl ninja in action.\n\n"
        "TWO THINGS SHARE THE FRAME, and BOTH must be large:\n")

# 跟 0914b 那批牌面同一段（「照設定表的比例」那幾句是那批修好的，不改字）
CAT = (
    "2. THE CAT - fills roughly 40% of the picture, drawn EXACTLY like the cat in the attached reference sheet.\n"
    "   COPY THE REFERENCE'S PROPORTIONS. This is the part that keeps going wrong, so be strict about it:\n"
    "   - The head is BIG and ROUND - roughly as large as the whole body. Do not draw a small head.\n"
    "   - The eyes are LARGE and ROUND with big dark pupils. Do not draw narrow slit eyes.\n"
    "   - The muzzle is TINY, the body is short and chubby. Do not stretch the body out or make it look like a\n"
    "     real cat's anatomy. It is a chibi mascot, not a realistic animal.\n"
    "   - She is a SIAMESE cat girl, not a grey tabby: creamy off-white fur with dark seal-brown face markings\n"
    "     over the muzzle and around the eyes, dark brown ears, paws and tail, bright BLUE almond eyes,\n"
    "     a plum-purple short kimono jacket with tied-back sleeves, a black sash, dark leggings, and a\n"
    "     belt of small bamboo needle-tubes. She has NO navy headband.\n"
    "   - On top of her head: a dark brown FRINGE over her forehead between and in front of her ears,\n"
    "     tied behind with a PLUM-PURPLE bow, and a short spiky PONYTAIL sticking up and back from the tie.\n"
    "     The fringe must be visible from the front - without it the hair reads as nothing.\n"
    "   - Her ears are pointed but NOT oversized (at most a third of her head's height), and her face is\n"
    "     round but NOT WIDE - do not puff her cheeks out sideways.\n"
    "   Draw it big enough that its face reads clearly when the picture is shrunk to 150 pixels wide.\n"
    "   The cat and the big object must overlap and clearly interact - the cat is doing something TO or WITH the\n"
    "   object, never just standing beside it.\n"
    "   She has exactly TWO arms and TWO rounded paws - count them before finishing. No extra hand, no floating paw.\n")

TAIL = (
    "\nFILL THE WHOLE FRAME. The picture is shown inside a short, almost-square window on the card, so a wide flat\n"
    "composition wastes most of it. Do NOT stand the two elements side by side in a horizontal row with empty bands\n"
    "above and below them. Instead overlap them and spread them into the corners so that the drawing reaches the top\n"
    "edge, the bottom edge and both sides. The cat should be roughly as tall as the picture, not a short figure\n"
    "sitting on the baseline.\n\n"
    "Bold and readable at thumbnail size: strong silhouette, high contrast, no fine detail that disappears when shrunk.\n"
    "The whole picture should read at a glance from its dominant colour and its overall shape.\n"
    "Draw everything SOLID and OPAQUE - flat filled colour. Nothing may be transparent, translucent or see-through.\n"
    "Nothing else in the picture: no ground, no shadow, no text, no letters, no numbers, no symbols, no watermark, no border.\n"
    "**NOTHING IN THIS PICTURE MAY BE GREEN OR GREENISH.** Poison, venom, bubbles, powder, fumes and mist are drawn\n"
    "DEEP VIOLET or MUSTARD YELLOW here, never green. (The picture sits on a green screen: anything green gets\n"
    "erased by the chroma key and leaves a hole.)\n"
    "Any enemy that appears is a small grey rat, clearly smaller than her - never another cat and never anything that\n"
    "looks like her.\n"
    "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying.\n"
    + NO_PANEL)

# 檔名 → (主色, 大物件, 貓在做什麼)
CARDS: dict[str, tuple[str, str, str]] = {
    # 補一針：重點是「牠本來就中毒了」——紫泡泡要一眼看得出來，針只有一根
    "card_feifei_buyizhen.png": (
        "DEEP VIOLET",
        "a small grey rat enemy on the right side that is ALREADY BADLY POISONED: its fur tinted a sickly violet, "
        "dizzy swirly eyes, tongue lolling, and big round DEEP VIOLET poison bubbles boiling up off its whole body "
        "and popping in the air above it, with a few violet drips. Exactly ONE slim needle is streaking into its "
        "side, trailing a short MUSTARD-YELLOW motion streak, and a small violet splash bursts where it hits. "
        "**Only ONE needle in the whole picture** - this is a single extra jab, not a volley",
        "she stands on the left, turned toward the rat, and has JUST flicked that one needle with a quick, precise "
        "snap of her wrist - her throwing paw is stretched out toward the rat, fingers still open from the release, "
        "her other paw resting on the needle-tubes at her belt. One eye narrowed in a small knowing, slightly "
        "mischievous smile, as if saying 'one more for good measure'. Her eyes are her normal BLUE eyes with pupils "
        "and a highlight."),
    # 看準破綻：重點是「盯」——她沒有出手，只在找空隙；視線要畫得出來
    "card_feifei_kanzhun.png": (
        "MUSTARD YELLOW",
        "a small grey rat enemy on the right side that is CLEARLY ALREADY POISONED: blotchy DEEP VIOLET patches "
        "soaking into its grey fur, a queasy, woozy face with droopy eyes, and DEEP VIOLET poison bubbles clinging to "
        "its fur and drifting up off it - at a glance it must read as 'this one is sick with poison', not as a "
        "healthy rat standing next to some bubbles. On its side ONE bright MUSTARD-YELLOW star-shaped glint marks "
        "the gap in its guard. Two or three bold MUSTARD-YELLOW dashed sight-lines run straight from her eye across "
        "the picture to that glint, like the line of her gaze made visible. The rat is looking away and has not "
        "noticed her yet",
        "she crouches low on the left, leaning forward, and STARES at the rat with her eyes NARROWED to a sharp, "
        "focused squint - both eyes narrowed the same way, but her BLUE irises and pupils are still clearly visible "
        "through the squint. One paw is raised in front of her chest holding a single needle between two claws, "
        "ready but not thrown yet; the other paw is pressed flat on the ground to steady her. Her ears are pricked "
        "forward and her mouth is a small determined line. She is not attacking yet - she is picking the moment."),
    # 越撒越順手：重點是「輕鬆」——一邊走一邊撒，連看都不用看，一點都不緊張
    "card_feifei_yuesa.png": (
        "DEEP VIOLET",
        "a long, wide sweeping ARC of DEEP VIOLET poison powder she is scattering, curling from her paw up over the "
        "top of the picture and down across the right side, made of many small solid violet specks and puffs with "
        "irregular edges, raining down on two or three tiny grey rats near the bottom-right corner who are coughing "
        "and waving their paws",
        "she STROLLS casually across the picture from left to right, mid-step, completely relaxed and pleased with "
        "herself: eyes half-closed in a content, confident smile, chin up, humming. With one paw she tosses a pinch "
        "of violet powder out to the side WITHOUT EVEN LOOKING at where it goes; the other paw holds a small open "
        "cloth pouch of powder against her hip. It is effortless, like she has done this a thousand times - no "
        "effort lines, no tension, no fighting stance."),
}


def main() -> None:
    jobs: dict[str, dict[str, str]] = {}
    for name, (colour, obj, doing) in CARDS.items():
        prompt = (HEAD
                  + f"1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in {colour}: {obj}\n"
                  + CAT
                  + f"   What the cat is doing: {doing}\n\n"
                  + feifei_look()
                  + TAIL
                  + f"Output 1024x820 PNG. Save the image as {name} in the current directory and report the path.")
        jobs[name] = {"prompt": prompt, "ref": SHEET_REF}
    OUT.write_text(json.dumps(jobs, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"寫出 {OUT.relative_to(ROOT)}：{len(jobs)} 張")


if __name__ == "__main__":
    main()
