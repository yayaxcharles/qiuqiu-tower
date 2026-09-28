#!/usr/bin/env python3
"""
主角 Vids 動作的逐格膠卷（聯絡表）：每個動作一列新、一列舊，照遊戲裡實際播的時間每 50 毫秒取一格，
畫在同一條腳底線上、同一個縮放（預設高度 252），最左邊放舊待機第 1 格當大小基準。

用法：python tools/hero_vids_sheet.py <輸出.png> [desktop|mobile] [qiuqiu|feifei|dangdang|fengfeng]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
UI = ROOT / "src" / "ui"
STEP_MS = 50
CELL_W, CELL_H, BASE_Y = 230, 330, 300
SPEED = 1.5
NAMES = {"attack1": "貓抓 A（attack1）", "attack3": "貓抓 A 長（attack3）", "attack2": "貓抓 B（attack2）", "attack4": "貓抓 B 長（attack4）", "toss": "空手擲（toss）", "dash": "衝刺（dash）",
         "hurt": "挨打（hurt）", "defeat": "倒下（defeat）", "run": "跑（run，循環）", "seal": "結印（seal）", "guard": "防禦（guard）",
         "win": "勝利（win）", "focus": "凝神（focus）", "shuriken": "彈針（shuriken）", "punch": "正拳（punch）", "palm": "推掌（palm）",
         "shoulder": "肩撞（shoulder）", "slash": "平斬（slash）", "sheath": "收刀（sheath）", "thrust": "突刺（thrust）"}
OLD_FILES = {
    "qiuqiu": ("qiuqiu-motion-data.json", "qiuqiu-extra-motion-data.json", "qiuqiu-attack-motion-data.json"),
    "feifei": ("feifei-motion-data.json",),
    "dangdang": ("dangdang-motion-data.json", "dangdang-attack-motion-data.json"),
    "fengfeng": ("fengfeng-motion-data.json", "fengfeng-attack-motion-data.json"),
}


def load_old(hero: str) -> dict:
    acts = {}
    for f in OLD_FILES[hero]:
        acts.update(json.loads((UI / f).read_text(encoding="utf-8"))["actions"])
    hit = json.loads((UI / "hit-recoil-motion-data.json").read_text(encoding="utf-8"))["heroes"][hero]
    acts["hurt"] = {"texture": hit["texture"], "scale": hit["scale"], "loop": False,
                    "frames": [{"rect": hit["rect"], "pivot": hit["pivot"], "duration": 0.65}]}
    return acts


def timeline(motion: dict, scaled: bool) -> list[tuple[float, dict]]:
    t, out = 0.0, []
    for fr in motion["frames"]:
        d = fr["duration"] * 1000 / (SPEED if scaled else 1)
        out.append((t, fr))
        t += d
    return out + [(t, None)]


def frame_at(tl, ms: float):
    cur = tl[0][1]
    for t, fr in tl[:-1]:
        if t <= ms:
            cur = fr
    return cur


images: dict[str, Image.Image] = {}


def draw(canvas: Image.Image, motion: dict, fr: dict, cx: int) -> None:
    tex = motion["texture"]
    if tex not in images:
        images[tex] = Image.open(ROOT / "public" / tex).convert("RGBA")
    x, y, w, h = fr["rect"]
    s = motion["scale"]
    cell = images[tex].crop((x, y, x + w, y + h)).resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    px, py = fr["pivot"]
    canvas.alpha_composite(cell, (round(cx - px * s), round(BASE_Y - py * s)))


def main() -> None:
    out = Path(sys.argv[1])
    variant = sys.argv[2] if len(sys.argv) > 2 else "desktop"
    hero = sys.argv[3] if len(sys.argv) > 3 else "qiuqiu"
    new = json.loads((UI / "hero-vids" / f"{hero}.json").read_text(encoding="utf-8"))
    unscaled = set(new["unscaled"])
    acts = new["variants"][variant]["actions"]
    old = load_old(hero)
    font = ImageFont.truetype("C:/Windows/Fonts/msjh.ttc", 18)
    rows = []
    for action, motion in acts.items():
        for label, m, scaled in (("新", motion, action not in unscaled), ("舊", old[action], action not in ("run", "hurt"))):
            tl = timeline(m, scaled)
            total = tl[-1][0]
            n = int(total // STEP_MS) + 1
            row = Image.new("RGBA", ((n + 1) * CELL_W, CELL_H), (74, 78, 96, 255))
            dr = ImageDraw.Draw(row)
            draw(row, old["idle"], old["idle"]["frames"][0], CELL_W // 2)
            dr.text((6, 4), f"{label}｜{NAMES.get(action, action)}｜{total:.0f} ms", fill="white", font=font)
            dr.text((6, CELL_H - 24), "舊待機（基準）", fill=(200, 200, 200), font=font)
            for i in range(n):
                ms = i * STEP_MS
                fr = frame_at(tl, ms)
                cx = (i + 1) * CELL_W + CELL_W // 2
                draw(row, m, fr, cx)
                dr.text(((i + 1) * CELL_W + 6, CELL_H - 24), f"{ms} ms", fill="white", font=font)
            dr.line((0, BASE_Y, row.width, BASE_Y), fill=(255, 80, 80, 160), width=1)
            rows.append(row)
    W = max(r.width for r in rows)
    sheet = Image.new("RGBA", (W, sum(r.height + 6 for r in rows)), (30, 30, 36, 255))
    y = 0
    for r in rows:
        sheet.alpha_composite(r, (0, y))
        y += r.height + 6
    sheet.convert("RGB").save(out, quality=88)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
