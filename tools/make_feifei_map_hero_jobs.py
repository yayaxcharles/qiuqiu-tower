# -*- coding: utf-8 -*-
"""菲菲在地圖上「你在這」的三顆頭像（2026-09-12）。

**這顆最該分家**：每次看地圖都看得到，而且它代表的就是「我」。
玩菲菲卻在地圖上看到球球，比事件插圖裡混到他還怪。程式那邊走 `assets.ts` 的 `mapHeroKey`，
生好就自動換過去，沒生好退回球球那顆（地圖上沒頭像會不知道自己走到哪，那更糟）。

姿勢照球球那三顆的節奏（新鮮／專注／戒備），但**換成她的反應**：
他是抬手仰望、大步向前、擺出架式；她是抱著竹筒探頭、貼著牆走、退半步先舉起針。
這不是裝飾——她的整個設定就是「不硬碰」，姿勢跟他一樣的話等於畫了另一隻球球。

用法：
  python tools/make_feifei_map_hero_jobs.py
  python tools/codex_gen.py tools/codex_jobs/feifei_map_hero.json
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import feifei_look  # noqa: E402

OUT = ROOT / "tools" / "codex_jobs" / "feifei_map_hero.json"
REF = "tools/ref/feifei_ref.png"

POSES = {
    "map_hero_feifei_low.png":
        "peeking forward with the bamboo needle-tubes hugged to her chest, ears half back, "
        "one paw steadying herself - nervous but going in, tail low",
    "map_hero_feifei_mid.png":
        "edging forward close to an unseen wall, shoulders down, one dart held ready low "
        "at her side, glancing sideways - careful, not charging",
    "map_hero_feifei_top.png":
        "half a step BACK with one paw raised holding a dart ready to throw and the other "
        "paw up as a warning - braced at a distance, not in a close-combat guard",
}

TEMPLATE = (
    "The character: the chibi SIAMESE cat girl from the reference image.\n"
    + feifei_look() +
    "\nPose: {pose}\n\n"
    "It is shown at about 40 pixels across in the game, so it must read from its silhouette alone: "
    "bold shape, high contrast, no fine detail. Her ponytail and bow must be visible in the silhouette. "
    "Full body, seen from the side or three-quarters, feet at the very bottom edge of the picture.\n"
    "Keep the exact same character design as the reference image (same face, same fur pattern, same clothing).\n"
    "Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent.\n"
    "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no watermark.\n"
    "Style: thick black outlines, flat colors, cute cartoon look, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. "
    "Nothing green on the character.\n"
    "Output 512x512 PNG. Save the image as {fid} in the current directory and report the path."
)


def main() -> None:
    jobs = {fid: {"prompt": TEMPLATE.format(pose=pose, fid=fid), "ref": REF}
            for fid, pose in POSES.items()}
    OUT.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 顆 → {OUT.relative_to(ROOT)}")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_map_hero.json")


if __name__ == "__main__":
    main()
