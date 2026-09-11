# -*- coding: utf-8 -*-
"""九張連線牌的牌面工單。

跟一般牌面最大的差別：**畫面裡有兩隻球球**——一隻在幫另一隻。
那正是這批牌的識別特徵，玩家掃一眼就要看得出「這張是給隊友用的」。

沿用 `new_cards2.json` 那套已經調到位的提示詞（比例、填滿畫面、綠幕、縮圖可讀），
只把「大物件＋貓」換成「兩隻貓」，並且把**誰幫誰**寫死——
事件結果圖那批的教訓：主詞不寫死，模型有一半機率畫反。

用法：
  python tools/make_coop_card_jobs.py           # 產完整的九張
  python tools/make_coop_card_jobs.py --pilot   # 只產三張試水溫
  python tools/codex_gen.py --ref tools/ref/hero_combat_ref.png tools/codex_jobs/coop_cards.json
"""
import argparse
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "tools" / "codex_jobs"

# 牌號 → (主色, 兩隻貓在做什麼)
# 主色要一眼分得出來：牌面縮到 150 像素寬時，玩家先認顏色再認圖案
CARDS: dict[str, tuple[str, str]] = {
    "fenyiban": (
        "PALE ICE BLUE",
        "the two cats crouch shoulder to shoulder facing the viewer, and ONE BIG pale-blue curled "
        "shield-glow wraps around BOTH of them at once, like a single blanket pulled over two heads. "
        "Both cats look out from under it with the same determined face. Neither is giving it to the other "
        "- they are sharing one thing.",
    ),
    "ninaqudang": (
        "PALE ICE BLUE",
        "the LEFT cat shoves a big round pale-blue cushion of shielding light across to the RIGHT cat "
        "with both paws, arms fully extended; the RIGHT cat catches it against his chest and is pushed "
        "back a step by the weight. The cushion is clearly LEAVING the left cat and ARRIVING at the right cat.",
    ),
    "nixianduo": (
        "SMOKY VIOLET",
        "the LEFT cat has just thrown a smoke ball at the RIGHT cat's feet; the RIGHT cat is already "
        "half-dissolved into a swirl of violet-grey smoke, only his headband and one paw still solid. "
        "The left cat is fully solid and is the one who threw it.",
    ),
    "wolaidang": (
        "DEEP NAVY with RED",
        "the FRONT cat plants himself square to the viewer with both arms spread wide, filling the frame, "
        "while the SECOND cat crouches small behind his back, peeking out. Sharp RED attack lines converge "
        "from the top corners onto the FRONT cat's chest - every one of them aimed at him, none at the one behind.",
    ),
    "bangnisheme": (
        "HOT ORANGE",
        "the LEFT cat presses both paws flat on the RIGHT cat's back and pushes; hot orange energy flows "
        "out of his paws into the right cat, whose claws flare bright orange and whose face lights up. "
        "The orange clearly starts at the left cat's paws and ends at the right cat's claws.",
    ),
    "jienicailiangbu": (
        "FRESH GREEN",
        "the LEFT cat cups both paws into a step and BOOSTS the RIGHT cat upward; the right cat is mid-air "
        "above him, landing on a short flight of glowing pale-green paw-print stepping stones. "
        "The left cat stays on the ground looking up.",
    ),
    "niyechouyizhang": (
        "CREAM PAPER",
        "the LEFT cat flicks a cream-coloured card across the frame with one claw; the card spins in the air "
        "trailing a cream arc, and the RIGHT cat is already reaching up with both paws to catch it, "
        "eyes wide. The card is clearly in flight between them.",
    ),
    "wobangnipaidiao": (
        "MURKY PURPLE",
        "the RIGHT cat is slumped with three murky-purple blobs clinging to his shoulders and head; "
        "the LEFT cat swats them off with a big sweep of one paw, and the blobs are flying away in pieces. "
        "The left cat is the one doing the swatting, the right cat is the one being cleaned.",
    ),
    "fantuanfenni": (
        "WHITE RICE with SEAWEED BLACK",
        "the LEFT cat tosses a big white triangular rice ball (onigiri, with a black seaweed band) "
        "underarm across to the RIGHT cat; the rice ball is in mid-air, large and unmistakable, and the "
        "RIGHT cat is catching it with both paws and beaming. The left cat's own paws are now empty.",
    ),
}

PILOT = ["wolaidang", "bangnisheme", "fantuanfenni"]


def prompt_for(card_id: str, colour: str, doing: str) -> str:
    return f"""A cartoon illustration for a card game, landscape composition, showing TWO grey tabby cat ninjas.

**THERE ARE TWO CATS IN THIS PICTURE, AND THEY ARE HELPING EACH OTHER.** This is the whole point of the
card - a player looking at a thumbnail must instantly see "two of them, one is doing something for the other".
Draw BOTH cats large. Do not draw one tiny cat in a corner.

BOTH CATS are drawn EXACTLY like the cat in the attached reference sheet - same cat, twice.
COPY THE REFERENCE'S PROPORTIONS. This is the part that keeps going wrong, so be strict about it:
  - The head is BIG and ROUND - roughly as large as the whole body. Do not draw a small head.
  - The eyes are LARGE and ROUND with big dark pupils. Do not draw narrow slit eyes.
  - The muzzle is TINY, the body is short and chubby. Do not stretch the body out or make it look like a
    real cat's anatomy. It is a chibi mascot, not a realistic animal.
  - Same grey tabby markings, same navy headband with two trailing tails, same thick black outline,
    same flat colouring, same navy ninja outfit as the reference. BOTH of them.
Draw them big enough that both faces read clearly when the picture is shrunk to 150 pixels wide.

WHAT IS HAPPENING - follow this exactly, including WHICH cat does WHICH part:
{doing}

The dominant colour of the picture is {colour}. The effect between the two cats should be the loudest
thing in the frame, so that the card reads from its colour alone at thumbnail size.

Each cat: light grey tabby fur with dark grey stripes, white chest and paws, a NAVY BLUE ninja headband
with two trailing tails, a dark navy ninja outfit with a dark belt, long ringed tail.

FILL THE WHOLE FRAME. The picture is shown inside a short, almost-square window on the card, so a wide flat
composition wastes most of it. Do NOT stand the two cats side by side in a horizontal row with empty bands
above and below them. Overlap them and spread them into the corners so that the drawing reaches the top edge,
the bottom edge and both sides. The cats should be roughly as tall as the picture, not two short figures
sitting on the baseline.

Bold and readable at thumbnail size: strong silhouette, high contrast, no fine detail that disappears when shrunk.
Draw everything SOLID and OPAQUE - flat filled colour. Nothing may be transparent, translucent or see-through.
Nothing else in the picture: no ground, no shadow, no text, no letters, no numbers, no watermark, no border.
Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.
Background must be a solid pure green (#00FF00), completely flat, for chroma keying.
Output 1024x820 PNG. Save the image as card_{card_id}.png in the current directory and report the path."""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pilot", action="store_true", help="只產三張試水溫")
    args = ap.parse_args()

    ids = PILOT if args.pilot else list(CARDS)
    jobs = {f"card_{cid}.png": prompt_for(cid, *CARDS[cid]) for cid in ids}
    name = "coop_cards_pilot.json" if args.pilot else "coop_cards.json"
    (OUT / name).write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{name}：{len(jobs)} 張")
    print("跑法：python tools/codex_gen.py --ref tools/ref/hero_combat_ref.png tools/codex_jobs/" + name)


if __name__ == "__main__":
    main()
