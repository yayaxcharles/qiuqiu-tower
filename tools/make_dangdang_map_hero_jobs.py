# -*- coding: utf-8 -*-
"""噹噹在地圖上「你在這」的三顆頭像（2026-09-17，稽核 中-2 抓到的缺口）。

**這顆最該分家**：每次看地圖都看得到，而且它代表的就是「我」。
玩噹噹卻在地圖上看到球球，比事件插圖裡混到他還怪。程式走 `assets.ts` 的 `mapHeroKey`，
生好就自動換過去（有鍵就用），沒生好退回球球那顆——所以這三顆沒有的話不會破圖，只是認錯人。

姿勢照球球那三顆的節奏（新鮮／專注／戒備），但**換成他的反應**：
球球是抬手仰望、大步向前、擺架式；菲菲是抱竹筒探頭、貼牆走、退半步舉針；
**他是護臂在前擋著看、沉肩推門式前進、雙臂交叉架住**。
這不是裝飾——他整套的識別就是「用護臂接下來」，姿勢跟球球一樣的話等於畫了另一隻球球。

用法：
  python tools/make_dangdang_map_hero_jobs.py
  python tools/codex_gen.py tools/codex_jobs/dangdang_map_hero.json
  python tools/add_icons.py map_hero_dangdang_low.png map_hero_dangdang_mid.png map_hero_dangdang_top.png
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "tools" / "codex_jobs" / "dangdang_map_hero.json"
REF = "tools/ref/dangdang_ref.png"

# 他的長相護欄。跟牌面那批同一套寫法（`make_dangdang_card_jobs.py` 檔頭）：
# 只寫正面、不舉例，長相交給參考圖。
LOOK = (
    "He is a chibi BLACK-AND-WHITE tuxedo cat: black head, back and limbs, a white blaze down the "
    "muzzle, white chest, white paws, amber eyes. He wears a teal short jacket with cream trim and "
    "frog buttons, a brown sash tied at the waist, dark trousers wrapped at the ankles, and "
    "**a brass arm guard on EACH forearm** - the arm guards are the thing you recognise him by, so "
    "both of them must be visible.\n"
)

POSES = {
    "map_hero_dangdang_low.png":
        "standing square and looking up the tower with one arm guard raised in front of his chest, "
        "the other paw resting on the sash - watching first, not rushing in",
    "map_hero_dangdang_mid.png":
        "walking forward with his shoulder dropped and the leading arm guard held out ahead of him, "
        "as if leaning into a door - steady, taking up space",
    "map_hero_dangdang_top.png":
        "braced with BOTH arm guards crossed in front of his face and chest, knees bent, weight "
        "settled - ready to take the hit rather than dodge it",
}

TEMPLATE = (
    "The character: the chibi black-and-white tuxedo cat from the reference image.\n"
    + LOOK +
    "\nPose: {pose}\n\n"
    "It is shown at about 40 pixels across in the game, so it must read from its silhouette alone: "
    "bold shape, high contrast, no fine detail. The two arm guards must be readable in the "
    "silhouette. Full body, seen from the side or three-quarters, feet at the very bottom edge of "
    "the picture.\n"
    "Keep the exact same character design as the reference image (same face, same fur pattern, "
    "same clothing).\n"
    "Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent.\n"
    "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no watermark.\n"
    "Style: thick black outlines, flat colors, cute cartoon look, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. "
    "Nothing green on the character.\n"
    "Output 512x512 PNG. Save the image as {fid} in the current directory and report the path."
)


def main() -> None:
    if not (ROOT / REF).exists():
        raise SystemExit(f"!! 參考圖不在：{REF}")
    jobs = {}
    for fid, pose in POSES.items():
        if (ROOT / "tools" / "codex_raw" / fid).exists():
            sys.stdout.write(f"{fid} 已經有原稿，這次不生（要重生先改名留底）\n")
            continue
        jobs[fid] = {"prompt": TEMPLATE.format(pose=pose, fid=fid), "ref": REF}
    OUT.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    sys.stdout.write(f"{len(jobs)} 顆 → {OUT.relative_to(ROOT)}\n")


if __name__ == "__main__":
    main()
