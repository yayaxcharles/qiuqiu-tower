# -*- coding: utf-8 -*-
"""菲菲 26 張牌的牌面工單（2026-09-12）。

沿用球球牌面那套已經調到位的提示詞（比例、填滿畫面、綠幕、縮圖可讀），
換掉的只有三件事：

1. **主角是另一隻貓**——暹羅、梅紫短和服、竹筒針袋。`art_rules.py` 第二個雷：
   參考圖會被讀成「要畫這個」，所以每一張都要明講「照參考圖那隻暹羅貓畫」。
2. **主色要一眼分得出來**：她的牌面縮到 150 像素寬時，玩家先認顏色再認圖案。
   毒是 **VENOM GREEN 不能用**（綠幕會把它吃掉，`codex_gen.py` 坑 5）——
   毒一律畫成 **深紫（VIOLET）** 或 **芥末黃（MUSTARD）**，這是這批最容易踩的一條。
3. **距離要畫得出來**：她的牌一半在講「離遠一點」。那批一律畫成
   「她在畫面一邊、魔物在另一邊，中間空出來」的構圖，縮圖也讀得懂。

用法：
  python tools/make_feifei_card_jobs.py
  python tools/codex_gen.py tools/codex_jobs/feifei_cards.json --ref tools/ref/feifei_ref.png
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "tools" / "codex_jobs"

# 牌號（去掉 feifei_ 前綴）→（主色, 畫什麼）
CARDS: dict[str, tuple[str, str]] = {
    # ---- 起手 ----
    "feizhen": ("MUSTARD YELLOW",
        "she flicks ONE slim dart forward with a snap of the wrist; the dart streaks across the frame "
        "trailing a mustard-yellow arc, and a small puff of mustard vapour bursts where it will land. "
        "She is on the left, leaning back away from the throw."),
    "tuikai": ("PALE ICE BLUE",
        "she springs backwards off one foot with both forearms raised, pale-blue motion streaks fanning "
        "out in front of her and a curled pale-blue shield-glow wrapping her shoulders. Big backward "
        "arrow of light behind her showing she is MOVING AWAY from the viewer's right."),
    "yuanshe": ("BRIGHT AMBER",
        "a long amber sight-line runs the whole width of the picture: she is small and braced at the far "
        "LEFT edge with one arm extended, and the dart is already most of the way across, growing bigger "
        "and brighter as it goes. The empty distance between her and the far side IS the subject."),
    "cuidu": ("DEEP VIOLET",
        "she holds a single long needle upright in both paws and breathes on it; a thick deep-violet "
        "droplet runs down the needle and a violet vapour curl rises from it. Her eyes are lowered in "
        "concentration and the needle fills the centre of the frame, huge."),
    # ---- 常見 ----
    "lianzhen": ("MUSTARD YELLOW",
        "THREE darts in a tight diagonal line streak across the frame one after another, each trailing a "
        "mustard arc, all aimed at the same spot. She is at the lower left, arm still following through."),
    "sazhen": ("MUSTARD YELLOW",
        "she flings a WIDE fan of a dozen small darts outward from one paw; the darts spread across the "
        "whole upper frame like a spray, each with a short mustard trail. She is low and left, body "
        "twisted from the throw."),
    "lakai": ("PALE ICE BLUE",
        "a simple, bold image: she skips backwards on her toes with both paws up, and a big pale-blue "
        "chevron arrow sweeps behind her across the frame. Nothing else - the backwards motion IS the card."),
    "tieqiang": ("SLATE BLUE-GREY",
        "she presses her back flat against a big slab of slate-grey wall that fills the right half of the "
        "frame, arms spread against it, peeking left. A pale-blue shield-glow runs along the wall behind "
        "her shoulders."),
    "moyao": ("DEEP VIOLET",
        "she drags a needle through a small open pot of thick deep-violet paste held in her other paw; "
        "the pot and the needle are large in the centre, violet paste stringing between them."),
    "tanlu": ("CREAM PAPER",
        "she peers around a corner with only her head, one paw and one big blue eye showing; a cream "
        "coloured card floats up beside her head, and a pale-blue arrow marks her backing away."),
    "suoshou": ("PALE ICE BLUE",
        "she snatches both paws back against her chest, shoulders hunched, eyes squeezed shut, and a "
        "rounded pale-blue shield-glow puffs up around her like a cushion."),
    "shouhua": ("HOT ORANGE with RED",
        "a fumble: a dart flies off at a wild angle in a hot-orange streak, and a second dart has nicked "
        "HER OWN paw - a small red mark and a spray of red drops beside it. Her face is a wide-eyed "
        "'oh no', not a determined frown. The wild orange streak dominates the frame."),
    # ---- 罕見 ----
    "cuidugai": ("DEEP VIOLET",
        "a fat violet droplet hangs off the tip of a needle that crosses the whole frame diagonally; "
        "thick violet fumes boil off it. She is small at the far lower-left, at arm's length from it."),
    # 原本是「催化」（翻倍），跟共用的「絕學·催噎」撞牌所以砍掉重做成「散毒」（把毒分出去）
    "sandu": ("DEEP VIOLET",
        "one shadowy enemy shape on the LEFT is wreathed in a thick violet cloud, and that cloud is being "
        "DRAGGED sideways across the frame in long violet streamers toward TWO other shadowy shapes on the "
        "RIGHT, staining them violet as it arrives. Bold violet arrows follow the streamers so the direction "
        "reads instantly. She is small at the bottom-left, one paw sweeping the cloud outward."),
    "zhenyu": ("DEEP VIOLET",
        "dozens of darts rain DOWNWARD across the entire frame from the top edge, each trailing a violet "
        "streak, filling the sky. She is a small figure at the bottom-left with one arm still raised."),
    "taoshengsuo": ("ROPE BROWN with PALE BLUE",
        "she is yanked backwards and up out of frame by a taut rope, feet leaving the ground, pale-blue "
        "wind streaks rushing past her; the rope runs from her waist diagonally off the top-left corner. "
        "Her face is relieved."),
    "duwu": ("DEEP VIOLET",
        "a low bank of thick, SOLID violet fog rolls across the bottom two-thirds of the frame, opaque "
        "and billowing, with small violet skull-shaped curls in it. She stands on a ledge above it, "
        "mask pulled up over her muzzle, looking down at it."),
    "jianxue": ("CRIMSON with VIOLET",
        "a single needle strikes a glowing violet mark, and the violet bursts outward into a huge crimson "
        "shockwave ring that fills the frame - the poison detonating all at once. She is small at the far "
        "left, arm extended, leaning away from the blast."),
    "banxian": ("ROPE BROWN",
        "a taut tripwire runs corner to corner across the frame at ankle height with a small bell on it; "
        "a snarling shadowy paw is caught in it mid-stumble. She crouches at the far left holding the "
        "other end of the wire, already backing away."),
    "tianzhen": ("DEEP VIOLET with RED",
        "she licks the flat of a needle held up beside her muzzle - her tongue out, eyes screwed shut, "
        "cheeks flushed, violet fumes rising off the needle AND off her own breath. A few red sweat drops. "
        "It is clearly a bad idea and she knows it."),
    "quansale": ("MUSTARD YELLOW with VIOLET",
        "panic: she upends the whole bamboo tube and EVERY needle she owns sprays outward in a huge "
        "explosive burst filling the entire frame, mustard and violet streaks in every direction. "
        "Her eyes are wide and her mouth open in a yell. Empty bamboo tubes tumble beside her."),
    # ---- 稀有 ----
    "qianzhen": ("DEEP VIOLET",
        "a ring of a dozen needles hovers in the air around her, all points turned outward, each dripping "
        "one violet droplet. She stands in the centre with her paws lowered and her eyes narrowed - calm, "
        "for once. The ring fills the frame."),
    "juma": ("SLATE BLUE-GREY",
        "a barricade of crossed bamboo spikes fills the lower half of the frame, points outward; she "
        "crouches safely behind it, and a shadowy paw is stopped short on the far side, recoiling. "
        "The barricade is the biggest thing in the picture."),
    "yudu": ("SICKLY VIOLET",
        "a fallen shadowy enemy shape bursts into a big cloud of SOLID violet spores, and the spores "
        "stream outward in arcs toward two other shadowy shapes at the edges of the frame, staining them "
        "violet. She watches from the far left, mask up."),
    "yizhen": ("CRIMSON with WHITE",
        "extreme close-up of ONE needle at the moment it sinks into a glowing crimson point, a stark "
        "white flash radiating from the contact. The needle runs the full diagonal of the frame. "
        "She is a tiny silhouette at the far corner, arm extended."),
    "buyaoguolai": ("HOT ORANGE with RED",
        "she screams and hurls everything forward with both arms while throwing herself backwards - a "
        "huge hot-orange blast of darts erupts from her paws and fills two thirds of the frame, and she "
        "is tumbling away from it at the bottom-left corner with red scrape marks on her arm and tears "
        "at the corners of her eyes. Terror and force at the same time."),
}

BODY = """A cartoon illustration for a card game, landscape composition.

THE CHARACTER: the slender chibi SIAMESE cat girl from the attached reference sheet - creamy off-white body
fur with a dark seal-brown mask over her muzzle and around the eyes, dark brown ears, paws and tail, bright
BLUE almond eyes with glossy highlights, a narrow face and LARGE pointed ears, small pink blush strokes on
her cheeks. She wears a PLUM-PURPLE short kimono jacket with the sleeves tied back, dark leggings, a wide
belt with a row of small bamboo needle-tubes across the small of her back, and a cloth mask hanging loose
around her neck.
COPY THE REFERENCE EXACTLY - same fur colours, same jacket, same blue eyes, same chibi proportions (head
about as big as the body, short stubby limbs, no neck), same thick black outlines and flat colouring.
She is NOT a grey tabby, she does NOT wear a headband. There is exactly ONE cat in the picture.
Draw her big enough that her face reads clearly when the picture is shrunk to 150 pixels wide.

WHAT IS HAPPENING - follow this exactly:
{doing}

The dominant colour of the picture is {colour}. The effect should be the loudest thing in the frame, so
that the card reads from its colour alone at thumbnail size.

**NOTHING IN THIS PICTURE MAY BE GREEN OR GREENISH.** Poison, venom, fumes, vapour and mist are drawn
DEEP VIOLET or MUSTARD YELLOW here, never green. (The picture sits on a green screen: anything green gets
erased by the chroma key and leaves a hole.)

FILL THE WHOLE FRAME. The picture is shown inside a short, almost-square window on the card, so a wide flat
composition wastes most of it. Spread the drawing into the corners so it reaches the top edge, the bottom
edge and both sides.
Bold and readable at thumbnail size: strong silhouette, high contrast, no fine detail that disappears when
shrunk. Draw everything SOLID and OPAQUE - flat filled colour. Nothing may be transparent or see-through.
Nothing else in the picture: no ground, no shadow, no text, no letters, no numbers, no watermark, no border.
Any enemy that appears is a small dark shadowy shape or a small grey rat, near the edge - never another cat
that looks like her.
Style: thick black outlines, flat colours with only subtle soft shading, cute cartoon, not photorealistic.
Background must be a solid pure green (#00FF00), completely flat, for chroma keying.
Output 1024x820 PNG. Save the image as card_feifei_{cid}.png in the current directory and report the path."""


def main() -> None:
    jobs = {f"card_feifei_{cid}.png": BODY.format(doing=doing, colour=colour, cid=cid)
            for cid, (colour, doing) in CARDS.items()}
    out = OUT / "feifei_cards.json"
    out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 張 → {out.relative_to(ROOT)}")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_cards.json --ref tools/ref/feifei_ref.png")


if __name__ == "__main__":
    main()
