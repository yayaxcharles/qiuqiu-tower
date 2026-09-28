#!/usr/bin/env python3
"""
把橫向捲軸（qiuqiu-side）的兩隻魔王逐格動作，裁成爪破魔塔用的圖集（2026-09-28 試做）。

來源（唯讀）：F:/ClaudeWork/qiuqiu-side/public/sprites/monsters/<id>/<動作>/NN.webp ＋ anims.json
  每格的 ax/ay 是腳底中線在那張圖裡的位置，圖都朝左（跟爪破魔塔的魔物同方向，不用翻）。

輸出：
  public/assets/motion/bosses/<kind>-<動作>.webp   一個動作一張圖集（開打那一刻才下載，見 enemy-motion.ts）
  src/ui/boss-motion-data.json                      格子位置／腳底／每格秒數，格式跟 enemy-motion-data.json 一樣

只收用得到的動作，而且**隔一格取一格**（等於橫向捲軸手機版的 12 格／秒）：
  兩套（桌機 24、手機 12）要多一份程式判斷、桌機多下載一倍，換到的只是爆炸更滑一點；這一輪先只做一套。

用法：python tools/pack_boss_motion.py [--src F:/ClaudeWork/qiuqiu-side/public/sprites/monsters]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "assets" / "motion" / "bosses"
OUT_DATA = ROOT / "src" / "ui" / "boss-motion-data.json"

# 圖集比畫面大多少倍（retina 螢幕才不糊）。靜態立繪大約 1.76 倍，這裡 1.2 倍換下載量與記憶體（手機橫放實際約 1.6 倍，會略軟）
OVERSAMPLE = 1.2
QUALITY = 80
MAX_W = 4096

"""
display＝來源 1 像素在爪破魔塔戰場上畫成幾像素。**照頭的高度對舊立繪量出來的**
（使用者鐵則：大小比頭）：
  鐵爪第一階段 舊圖頭高約 197 像素 × 0.568（框裡縮放）＝ 112；來源頭高約 163 → 0.69
  鐵爪第二階段 舊圖頭高約 160 × 0.568 ＝ 91；來源約 145 → 0.63（舊版變身後本來就小一號，照舊）
  掃地機器人王 舊圖機身（不含王冠）約 193 × 0.568；來源約 191 → 0.57
lift＝腳底往上抬幾像素（戰場座標）：舊立繪的圖底有一點透明邊，腳離框底 1.6～2.7 像素（2026-09-28 本機實量），照舊對齊
clips：(爪破的動作, 來源動作, 起, 迄(含), 播放倍速, 循環)
"""
KINDS = {
    "iron_claw": {
        "src": "iron_claw", "display": 0.69, "lift": 2.7,
        "clips": [
            ("idle", "walk", 0, 27, 0.75, True),
            ("attack", "swipe", 20, 64, 1.5, False),
            ("knockdown", "down_p2", 0, 62, 1.0, False),
        ],
        # 第一階段就被一刀打死（沒經過變身）時，倒地借第二階段的爆炸：外殼炸開正好接得上
        "knockdown_display": 0.63,
    },
    "iron_claw_p2": {
        "src": "iron_claw", "display": 0.63, "lift": 1.6,
        "clips": [
            ("idle", "walk_p2", 0, 50, 0.75, True),
            ("attack", "laser_p2", 12, 66, 1.5, False),
            ("knockdown", "down_p2", 0, 62, 1.0, False),
        ],
    },
    "roomba_king": {
        "src": "roomba_king", "display": 0.57, "lift": 2.1,
        "clips": [
            ("idle", "drive", 0, 15, 1.0, True),
            ("attack", "ram", 14, 58, 1.5, False),
            # 第 0～5 格是橫向捲軸裡玩家的子彈飛進來，爪破這邊沒有那顆子彈，從第 6 格開始
            ("knockdown", "down", 6, 70, 1.0, False),
        ],
    },
}
STEP = 2          # 隔一格取一格
SRC_FPS = 24.0


def texture_name(kind: str, src_action: str) -> str:
    return f"assets/motion/bosses/{KINDS[kind]['src']}-{src_action}.webp"


def pack_action(src_root: Path, src_id: str, action: str, first: int, last: int, pack: float):
    meta = json.loads((src_root / src_id / "anims.json").read_text(encoding="utf-8"))[action]
    frames = meta["frames"][first:last + 1:STEP]
    cells = []
    for fr in frames:
        im = Image.open(src_root / src_id / action / fr["f"]).convert("RGBA")
        w, h = max(1, round(im.width * pack)), max(1, round(im.height * pack))
        im = im.resize((w, h), Image.LANCZOS)
        box = im.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox() or (0, 0, 1, 1)
        crop = im.crop(box)
        cells.append((crop, fr["ax"] * pack - box[0], fr["ay"] * pack - box[1]))
    # 一排排擺（shelf），寬度不超過 MAX_W
    x = y = row_h = 0
    places = []
    width = 0
    for crop, _, _ in cells:
        if x + crop.width > MAX_W:
            x, y, row_h = 0, y + row_h + 2, 0
        places.append((x, y))
        x += crop.width + 2
        row_h = max(row_h, crop.height)
        width = max(width, x)
    sheet = Image.new("RGBA", (width, y + row_h), (0, 0, 0, 0))
    out = []
    for (crop, px, py), (cx, cy) in zip(cells, places):
        sheet.paste(crop, (cx, cy))
        out.append({"rect": [cx, cy, crop.width, crop.height], "pivot": [round(px, 2), round(py, 2)]})
    return sheet, out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="F:/ClaudeWork/qiuqiu-side/public/sprites/monsters")
    args = ap.parse_args()
    src_root = Path(args.src)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written: dict[str, int] = {}
    data: dict = {"kinds": {}}
    for kind, spec in KINDS.items():
        actions = {}
        for (name, src_action, first, last, speed, loop) in spec["clips"]:
            display = spec.get(f"{name}_display", spec["display"])
            pack = display * OVERSAMPLE
            tex = texture_name(kind, src_action)
            sheet, frames = pack_action(src_root, spec["src"], src_action, first, last, pack)
            path = ROOT / "public" / tex
            if tex not in written:
                sheet.save(path, "WEBP", quality=QUALITY, method=6)
                written[tex] = path.stat().st_size
                print(f"{tex}: {sheet.width}x{sheet.height}, {len(frames)} 格, {written[tex] / 1024:.0f} KB")
            duration = round(STEP / SRC_FPS / speed, 4)
            actions[name] = {
                "texture": tex, "mirror": False, "scale": round(1 / OVERSAMPLE, 6), "loop": loop,
                "frames": [{**f, "pivot": [f["pivot"][0], round(f["pivot"][1] + spec["lift"] * OVERSAMPLE, 2)], "duration": duration} for f in frames],
            }
        # 沒有受擊片段：挨打時照舊演待機，紅閃＋抖動由 combat.css 的 `.unit.hit .enemy-motion` 負責
        actions["hurt"] = {**actions["idle"]}
        data["kinds"][kind] = {"native_height": 1, "default_height": 1, "mirror": False, "actions": actions}
    OUT_DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"合計 {sum(written.values()) / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
