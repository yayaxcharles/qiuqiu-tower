# -*- coding: utf-8 -*-
"""
build_variant_art.py — 產「同一個地方換個角落」的變體工單（2026-09-10，使用者要求）。

用法：python tools/build_variant_art.py
  產出（都在 tools/codex_jobs/）：
    node_screens_bc.json   節點畫面背景 18 張（貓窩／罐頭鋪／紙箱 × 三關 × 各再兩款）
    map_icons_bc.json      地圖節點圖示 14 張（七種 × 各再兩款）
    map_hero.json          地圖上的球球 3 張（一關一款，取代現在那個爪印）

**每一張都附現有的圖當參考圖**（使用者 2026-09-10 明示：「一定要參照現有圖片，
之前會生出跟現有的圖完全不同的畫面出來」）。參考圖先轉成 PNG 放在 `tools/ref/` 底下——
`codex exec -i` 吃 PNG 最穩（webp 餵進去不一定認得）。

為什麼要變體：戰鬥背景每一關有三張（`low`／`low_b`／`low_c`，`screenbg.ts` 用樓層輪流挑），
節點畫面卻是一關一張。同一關打三場怪牆會換，睡三次貓窩卻永遠是同一間房。
地圖節點圖示同理——一關十五層會看到五六個戰鬥節點，全長一樣。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JOBS = ROOT / "tools" / "codex_jobs"

# ---------- 節點畫面背景 ----------
BG_TAIL = (
    "\n\nCute cartoon storybook interior, thick black outlines, flat colors with subtle soft gradients, "
    "not photorealistic. Overall tone should be dim and low-contrast so that a light interface panel can sit "
    "on top of it and stay readable. Keep the very centre of the image simple - it will be covered by a panel - "
    "and place the interesting scenery toward the left, right, top and bottom edges. "
    "No characters, no creatures, no text, no letters, no watermark. Output 1920x1080 PNG, full bleed, no border. "
    "Save the result as {name}.")
# 貓窩專用的硬規則：球球的立繪是**釘死在畫面左側**的（`screens.css` 的 `.scene-portrait`：
# left 34、bottom 150、高 330 → 舞台座標 x 34～334、腳底 y 570），所以床一定要畫在那個位置，
# 不然會變成「球球睡在地上、床在對面」（使用者 2026-09-10 看了 `screen_rest_c` 之後指出）。
BED_RULE = (
    "\n\nHARD LAYOUT RULE - the game composites the cat character sprite onto the LEFT side of this "
    "picture, standing on the floor, so: the round cat bed MUST be drawn on the floor in the LEFT "
    "QUARTER of the image, with its centre about 15% in from the left edge and about 75% of the way "
    "down from the top. The cat must be able to lie in it. Everything else in the room can move around, "
    "but the bed stays there. Do not put the bed in the middle or on the right.")

BG_HEAD = (
    "The attached reference image is the SAME ROOM this picture must show. "
    "Match it exactly: same architecture, same materials, same colour palette, same light sources, "
    "same time of day, same brush style and line weight. This is not a new place - it is the same place "
    "seen from a different corner, so a player walking in would recognise it immediately.\n\n"
    "What is different this time: ")

# 三關的場景（跟現有那九張同一套：塔下石室、塔中木造和室、塔頂夜晚石台）
NODE_SCENES = {
    "screen_rest": {
        "_b": "look at the opposite corner of the same stone cellar - the fireplace is out of frame and the light now comes from a "
              "low stone alcove on the left, a rolled sleeping mat leans against the wall, "
              "a wooden tea tray with an upturned cup sits on the floor, and the firelight now comes in from "
              "off the left edge rather than from a hearth in frame",
        "_c": "look along the same stone cellar from the other end - a deep window slot high in the wall lets in "
              "a cool shaft of light that mixes with the warm firelight, the fireplace is now on the RIGHT, "
              "a stack of straw cushions and a hanging bundle of dried fish occupy the right side",
    },
    "screen_rest_mid": {
        "_b": "look at the opposite corner of the same wooden tatami room - an open paper sliding door showing dark timber beyond takes the right side, a folded futon and a small brazier stand "
              "where the low table was, and one paper lantern hangs closer to the viewer",
        "_c": "look along the same tatami room from the other end - a shoji window wall with soft light behind it "
              "fills the right side, a tea set and a stack of cushions sit on the mats, "
              "a low wooden shelf runs along the right wall",
    },
    "screen_rest_top": {
        "_b": "look at the opposite corner of the same night rooftop - the moon is now low and off to one side, two braziers instead of one, a rolled mat "
              "and a small stack of blankets weighed down by a stone",
        "_c": "look along the same night rooftop from the other end - a stone stair head and a weathered wooden "
              "rail take the right side, the brazier is on the right too, "
              "the sky shows more stars and a thin band of cloud",
    },
    "screen_shop": {
        "_b": "look at the opposite corner of the same stone cellar shop - the shelves of fish tins now run along "
              "the far wall, a stack of crates and a hanging balance scale take one side, "
              "a rolled straw mat and a barrel of dried fish stand near the front",
        "_c": "look along the same stone cellar shop from the other end - a low wooden counter with a cash box "
              "and an abacus fills one side, tins stacked in a pyramid, "
              "bundles of dried fish hanging from a beam overhead",
    },
    "screen_shop_mid": {
        "_b": "look at the opposite corner of the same wooden shop - the tall tin shelves are now on the far side, "
              "a noren curtain hangs in a doorway, sacks and a wooden crate sit in front, "
              "one paper lantern closer to the viewer",
        "_c": "look along the same wooden shop from the other end - a long low counter with an abacus and a "
              "stack of paper bags runs across one side, shelves behind it, "
              "strings of dried fish hanging from the beams",
    },
    "screen_shop_top": {
        "_b": "look at the opposite corner of the same night rooftop stall - the shelves of tins now stand "
              "against the parapet with the moon behind them, a folding stool and a lantern on a pole, "
              "a crate of tins open in front",
        "_c": "look along the same night rooftop stall from the other end - a cloth awning on bamboo poles over "
              "the stall, tins stacked on a low table, a brazier warming a kettle, "
              "the city of rooftops faintly visible beyond the parapet",
    },
    "screen_chest": {
        "_b": "look at the opposite corner of the same stone corridor - the cardboard box now sits against a "
              "closed iron-banded door with the light falling from a torch bracket on the left, "
              "loose straw and a broken crate around it",
        "_c": "look along the same stone corridor from the other end - the box sits at the foot of a short "
              "flight of worn steps, a shaft of light from a grating overhead, "
              "barrels and a coil of rope along the wall",
    },
    "screen_chest_mid": {
        "_b": "look at the opposite corner of the same wooden corridor - the cardboard box sits beside a paper "
              "sliding door left slightly open, the light shaft now falls from the right, "
              "a stack of folded cloth and a broom leaning against the wall",
        "_c": "look along the same wooden corridor from the other end - the box sits under a low wooden shelf, "
              "a round window casts a pale circle of light on the floorboards, "
              "a rolled tatami mat propped in the corner",
    },
    "screen_chest_top": {
        "_b": "look at the opposite corner of the same night rooftop - the cardboard box sits against the stone "
              "parapet with the moon high and to one side, a coil of rope and a weathered crate beside it",
        "_c": "look along the same night rooftop from the other end - the box sits at the top of a stone stair, "
              "moonlight raking across the flagstones, a stone lantern and a low wall behind",
    },
}

# ---------- 地圖節點圖示 ----------
ICON_TAIL = (
    "\n\nIt is shown at about 40 pixels across in the game, so it must read from its silhouette and its main "
    "colour alone: one bold shape, high contrast, no fine detail, no small parts.\n"
    "Draw it SOLID and OPAQUE - flat filled colour with a little soft shading. Nothing transparent or see-through.\n"
    "Nothing else in the picture: no character, no ground, no shadow, no text, no letters, no numbers, no watermark.\n"
    "Style: thick black outlines, flat colors, cute cartoon look, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green in the object.\n"
    "Output 512x512 PNG. Save the image as {name} in the current directory and report the path.")
ICON_HEAD = (
    "The attached reference image is the CURRENT icon for this map node type. "
    "Match it exactly: same silhouette weight, same colour palette, same outline thickness, same level of "
    "simplification, same cute cartoon style. A player must read the new one as the SAME KIND of node at a glance - "
    "it is a sibling of the reference, not a replacement.\n\n"
    "Draw a different object of the same meaning: ")

MAP_ICONS = {
    "node_fight": ("a pair of crossed bamboo training swords", "a single cat paw print with three claw slashes through it"),
    "node_elite": ("a horned demon mask with a fierce grin", "a skull-shaped iron helmet with two curved horns"),
    "node_event": ("a folded paper fortune slip tied to a twig", "a small hanging paper lantern with a question-mark-free blank face"),
    "node_shop": ("a stack of three fish tins tied with string", "a small cloth money pouch with a fish-bone clasp"),
    "node_rest": ("a rolled-up futon with a folded blanket on top", "a steaming teacup beside a round floor cushion"),
    "node_chest": ("a taped-shut cardboard box with one flap curling up", "a wooden crate with straw poking out of the lid"),
    "node_boss": ("a conical straw hat with a torn brim", "a clenched cat paw wrapped in a fighting bandage"),
}

# ---------- 地圖上的球球 ----------
HERO_MAP_TAIL = (
    "\n\nIt is shown at about 40 pixels across in the game, so it must read from its silhouette alone: "
    "bold shape, high contrast, no fine detail. Full body, seen from the side or three-quarters, "
    "feet at the very bottom edge of the picture.\n"
    "Keep the exact same character design as the reference image (same face, same fur pattern, same clothing).\n"
    "Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent.\n"
    "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no watermark.\n"
    "Style: thick black outlines, flat colors, cute cartoon look, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green on the character.\n"
    "Output 512x512 PNG. Save the image as {name} in the current directory and report the path.")
MAP_HERO = {
    "map_hero_low.png": "standing alert with one paw raised, looking up the tower - fresh and eager, tail up",
    "map_hero_mid.png": "walking forward with a determined stride, one paw forward - halfway up, focused",
    "map_hero_top.png": "crouched low and ready, both paws up in a fighting guard - near the top, braced for the master",
}


def dump(name: str, jobs: dict) -> None:
    (JOBS / name).write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{name}: {len(jobs)} 張")


def main() -> None:
    bg: dict = {}
    for base, variants in NODE_SCENES.items():
        for suffix, what in variants.items():
            name = f"{base}{suffix}.png"
            # 貓窩多一條硬規則：床一定要在左四分之一（球球的立繪就疊在那裡）
            rule = BED_RULE if base.startswith("screen_rest") else ""
            bg[name] = {"prompt": BG_HEAD + what + rule + BG_TAIL.format(name=name),
                        "ref": f"tools/ref/bg_refs/{base}.png"}
    dump("node_screens_bc.json", bg)

    icons: dict = {}
    for base, (b, c) in MAP_ICONS.items():
        for suffix, what in (("_b", b), ("_c", c)):
            name = f"{base}{suffix}.png"
            icons[name] = {"prompt": ICON_HEAD + what + ICON_TAIL.format(name=name),
                           "ref": f"tools/ref/icon_refs/{base}.png"}
    dump("map_icons_bc.json", icons)

    hero = {k: {"prompt": "The character: the small grey tabby kitten ninja from the reference image "
                          "(dark navy ninja suit and headband, big round eyes).\n\nPose: " + v
                          + HERO_MAP_TAIL.format(name=k),
                "ref": "tools/ref/hero_combat_ref.png"} for k, v in MAP_HERO.items()}
    dump("map_hero.json", hero)
    print(f"\n合計 {len(bg) + len(icons) + len(hero)} 張，全部帶參考圖")


if __name__ == "__main__":
    main()
