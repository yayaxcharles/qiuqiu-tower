#!/usr/bin/env python3
"""
把橫向捲軸（qiuqiu-side）用 Google Vids 生的球球動作片，裁成爪破魔塔主角用的逐格圖集（2026-09-28 球球試做）。

來源（唯讀）：F:/ClaudeWork/qiuqiu-side/vids/<片名>.mp4（1280×720、每秒 24 格、綠幕）。
  從原影片重新匯出（橫向捲軸那套只有約 190 像素高，太小）。

輸出：
  public/assets/motion/hero-vids/qiuqiu-<片>-d.webp   電腦版圖集（每秒 24 格）
  public/assets/motion/hero-vids/qiuqiu-<片>-m.webp   手機版圖集（每秒 12 格、解析度低一點）
  src/ui/hero-vids/qiuqiu.json                        格子資料（動態載入，不進開場程式；見 hero-vids.ts）

節奏：每個動作的總長＝現在那個動作的總長，命中（或出手）那一格落在現在寫死的命中時間上，
  所以程式端的時間表一個都不用改、回合不會變長。時間用「原速」寫（跟舊資料一樣），
  載入時照舊經 `speedUpMotions` 加快 1.5 倍（跑步、挨打不加速）。

大小：每支片先量第一格站直的高度，換算成「站直＝舊待機第 1 格的高度（253.15 CSS 像素）」，
  同一張參考圖生的片頭身比例一樣，所以頭的大小也跟舊待機一樣（聯絡表有並排對照）。
腳底：整支片用第一格的實心腳底當基準（原地動作）；衝刺每格對齊身體重心的左右位置（往前衝交給程式）。

用法：python tools/pack_hero_vids.py
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
VIDS = Path("F:/ClaudeWork/qiuqiu-side/vids")
OUT_IMG = ROOT / "public" / "assets" / "motion" / "hero-vids"
OUT_DATA = ROOT / "src" / "ui" / "hero-vids"

# 舊待機第 1 格畫出來的高度（CSS 像素）＝ rect 高 407 × scale 0.622（qiuqiu-motion-data.json 的 idle）
OLD_IDLE_CSS_HEIGHT = 407 * 0.622
MOTION_SPEED = 1.5
UNSCALED = {"run", "hurt"}   # 跑步（motion-speed.ts 的 UNSCALED_ACTIONS）、挨打（比照 hit-recoil-motion.ts 停 0.65 秒）不加速
QUALITY = 80
MAX_W = 4096
VARIANTS = {
    # 圖集放大倍數＝圖集 1 像素對畫面幾分之一 CSS 像素；電腦 1.6 倍（跟舊圖集差不多細），手機 1.2 倍
    "desktop": {"fps": 24, "over": 1.6, "suffix": "d"},
    "mobile": {"fps": 12, "over": 1.2, "suffix": "m"},
}

"""
keys＝[(來源第幾格, 原速秒數)…]：第一個是起點（0 秒），最後一個是收尾（＝現在那個動作的總長），
中間的是命中／出手那一格要落在的時間。每一段各自均分，所以中間那格一定剛好在那個時間開始。
"""
ACTIONS: dict[str, dict] = {
    # 貓抓 A：揮爪_v2a 第 30 格＝爪痕最大（橫向捲軸標的 hit 1.29 秒）；attack1 現在 0.30 秒、命中 70 毫秒
    # 收尾兩格接到第 72 格（退回架式），不然停在撲出去的姿勢、接回待機會一格跳回來（聯絡表第一版看到的）
    "attack1": {"clip": "揮爪_v2a", "keys": [(18, 0), (30, 0.07), (46, 0.18), (72, 0.30)]},
    # attack3 同一支片、起手拉長一點：0.42 秒、命中 100 毫秒
    "attack3": {"clip": "揮爪_v2a", "keys": [(12, 0), (30, 0.10), (48, 0.28), (72, 0.42)]},
    # 貓抓 B（2026-09-28 晚用 Google Flow 的 Omni 模型、4 秒、參考圖當開始影格生的：貓抓B_flow_omni_v1）：
    # 第 36 格＝爪痕在身前最大；第 60 格左右回到架式。attack2 原速 0.34 秒、命中 90；attack4 0.52 秒、命中 160
    "attack2": {"clip": "貓抓B_flow_omni_v1", "keys": [(24, 0), (36, 0.09), (44, 0.2), (60, 0.34)]},
    "attack4": {"clip": "貓抓B_flow_omni_v1", "keys": [(18, 0), (36, 0.16), (46, 0.34), (62, 0.52)]},
    # 空手擲：第 34 格出手（橫向捲軸標的 release 1.42 秒）；現在 0.71 秒、出手 240、命中 410 毫秒
    "toss": {"clip": "前投空手_v1", "keys": [(14, 0), (34, 0.24), (48, 0.52), (66, 0.71)],
             "impactTimes": [410], "releaseTimes": [240]},
    # 衝刺（衝刺_v1）試過、不收：衝的那段整隻拖著半透明的綠色殘影，去綠底後變成一團暗綠影子，
    # 收尾還是閉眼縮臉。維持舊圖，等 Vids 額度恢復再生一支「原地突進」（見 docs 規劃的待生清單）
    # 挨打（使用者 2026-09-28：換影片版）：第 4～8 格有飛進來的苦無，只留身體那一塊；總長照舊 0.65 秒，
    # 往後仰那段（第 9～20 格）占一半時間，看得清楚
    "hurt": {"clip": "受傷_v1", "keys": [(5, 0), (9, 0.1), (20, 0.45), (28, 0.65)], "solo": True},
    # 倒下：第 0～12 格是打過來的爆炸星，從第 13 格開始；現在 1.05 秒，最後躺平那格多停一下
    "defeat": {"clip": "倒下_v1", "keys": [(13, 0), (66, 0.8), (80, 1.05)], "solo": True},
    # 跑步：在第 14 格以後找頭尾最像的一圈（10～26 格），整圈壓成現在的 0.48 秒（腳步聲每 240 毫秒一步）
    "run": {"clip": "跑步_v1", "loop": (14, 95, 10, 26), "cycle": 0.48},
}


def extract(clip: str, tmp: Path) -> list[Path]:
    d = tmp / clip
    d.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(VIDS / f"{clip}.mp4"), str(d / "%03d.png")], check=True)
    return sorted(d.glob("*.png"))


def key_green(path: Path, solo: bool) -> np.ndarray:
    """綠幕→透明（跟 tools/chroma_key.py 的 key_out 同一套：綠度＝綠−max(紅,藍)，影片版門檻 130／200），回傳 RGBA 陣列"""
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    h, w, _ = rgb.shape
    rgb[int(h * 0.72):, int(w * 0.82):] = (0, 255, 0)   # Gemini 小星星浮水印
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    green = g - np.maximum(r, b)
    soft, hard = 130, 200
    alpha = np.clip(1 - (green - soft) / (hard - soft), 0, 1)
    alpha = (alpha * 255).astype(np.uint8)
    # 去綠邊：邊緣帶（透明區往內 2 像素）的綠壓到不超過紅藍
    band = ndimage.minimum_filter(alpha, size=5) < 255
    spill = band & (alpha > 0) & (g > np.maximum(r, b))
    g = np.where(spill, np.maximum(r, b), g)
    # 半透明殘影混到的綠也壓掉（橫向捲軸 export_sprites.py 的做法）
    g = np.minimum(g, np.maximum(r, b))   # 球球身上沒有綠色，全圖壓也不傷角色
    alpha = ndimage.minimum_filter(alpha, size=3)
    if solo:
        solid = ndimage.maximum_filter(alpha > 40, size=9)
        lab, n = ndimage.label(solid)
        if n > 1:
            sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
            keep = ndimage.maximum_filter(lab == (1 + int(np.argmax(sizes))), size=5)
            alpha = np.where(keep, alpha, 0).astype(np.uint8)
    return np.dstack([r, g, b, alpha]).astype(np.uint8)


def solid_foot(a: np.ndarray) -> int:
    rows = np.nonzero((a >= 128).sum(axis=1) >= 3)[0]
    return int(rows[-1]) + 1 if len(rows) else a.shape[0]


def centroid_x(a: np.ndarray) -> float:
    m = a > 200
    xs = np.nonzero(m)[1]
    return float(xs.mean()) if len(xs) else a.shape[1] / 2


def stand_height(a: np.ndarray) -> int:
    rows = np.nonzero((a > 128).any(axis=1))[0]
    return int(rows[-1] - rows[0] + 1)


def best_loop(frames: list[np.ndarray], lo: int, hi: int) -> tuple[int, int]:
    sig = [np.asarray(Image.fromarray(f).convert("L").resize((160, 90)), dtype=np.int16) for f in frames]
    best = (1e18, 0, lo)
    for s in range(len(frames)):
        for e in range(s + lo, min(len(frames) - 1, s + hi) + 1):
            d = float(np.abs(sig[s] - sig[e]).mean())
            if d < best[0]:
                best = (d, s, e)
    return best[1], best[2]


def plan(spec: dict, fps: int, action: str) -> list[tuple[float, float]]:
    """回傳 [(來源格（可小數）, 這格原速秒數)…]"""
    speed = 1.0 if action in UNSCALED else MOTION_SPEED
    if "loop" in spec:
        raise ValueError
    keys = spec["keys"]
    out: list[tuple[float, float]] = []
    for k in range(len(keys) - 1):
        (a, t0), (b, t1) = keys[k], keys[k + 1]
        n = max(1, round((t1 - t0) / speed * fps))
        last = k == len(keys) - 2
        for j in range(n):
            src = a + (b - a) * (j / (n - 1) if last and n > 1 else j / n)
            out.append((src, (t1 - t0) / n))
    return out


def main() -> None:
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    for old in OUT_IMG.glob("qiuqiu-*.webp"):
        old.unlink()
    data: dict = {
        "note": "由 tools/pack_hero_vids.py 產生，不要手改。時間是原速，載入時照舊加快 1.5 倍（unscaled 裡的不加速）。",
        "hero": "qiuqiu", "nativeHeight": 252, "unscaled": sorted(UNSCALED), "variants": {},
    }
    report = {}
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        cache: dict[tuple[str, bool], list[np.ndarray]] = {}

        def frames_of(clip: str, solo: bool) -> list[np.ndarray]:
            if (clip, solo) not in cache:
                paths = extract(clip, tmp) if not (tmp / clip).exists() else sorted((tmp / clip).glob("*.png"))
                cache[(clip, solo)] = [key_green(p, solo) for p in paths]
            return cache[(clip, solo)]

        # 每支片：第一格站直的高度 → 影片 1 像素＝幾 CSS 像素；第一格的腳底
        picks: dict[str, dict] = {}
        for action, spec in ACTIONS.items():
            fr = frames_of(spec["clip"], spec.get("solo", False))
            first = fr[0][..., 3]
            display = OLD_IDLE_CSS_HEIGHT / stand_height(first)
            base = {"display": display, "foot_y": solid_foot(first), "foot_x": centroid_x(first)}
            if "loop" in spec:
                s0, s1, lo, hi = spec["loop"]
                s, e = best_loop(fr[s0:s1], lo, hi)
                base["cycle"] = list(range(s0 + s, s0 + e))
            picks[action] = base

        for vname, v in VARIANTS.items():
            fps, over = v["fps"], v["over"]
            actions_out = {}
            by_clip: dict[str, dict[int, None]] = {}
            seq: dict[str, list[tuple[int, float]]] = {}
            for action, spec in ACTIONS.items():
                p = picks[action]
                if "loop" in spec:
                    cyc = p["cycle"]
                    n = max(4, round(spec["cycle"] * fps))
                    s = [(cyc[min(len(cyc) - 1, int(i * len(cyc) / n))], spec["cycle"] / n) for i in range(n)]
                else:
                    s = [(int(round(src)), dur) for src, dur in plan(spec, fps, action)]
                seq[action] = s
                for idx, _ in s:
                    by_clip.setdefault(spec["clip"], {})[idx] = None
            for clip, used in by_clip.items():
                owners = [a for a, sp in ACTIONS.items() if sp["clip"] == clip]
                solo = any(ACTIONS[a].get("solo") for a in owners)
                fr = frames_of(clip, solo)
                p = picks[owners[0]]
                pack = p["display"] * over
                cells = {}
                for idx in used:
                    im = Image.fromarray(fr[idx], "RGBA")
                    w, h = round(im.width * pack), round(im.height * pack)
                    im = im.resize((w, h), Image.LANCZOS)
                    bb = im.getchannel("A").point(lambda x: 255 if x > 8 else 0).getbbox() or (0, 0, 1, 1)
                    cells[idx] = (im.crop(bb), bb)
                x = y = row_h = width = 0
                place = {}
                for idx, (crop, _) in cells.items():
                    if x + crop.width > MAX_W:
                        x, y, row_h = 0, y + row_h + 2, 0
                    place[idx] = (x, y)
                    x += crop.width + 2
                    row_h = max(row_h, crop.height)
                    width = max(width, x)
                sheet = Image.new("RGBA", (width, y + row_h), (0, 0, 0, 0))
                for idx, (crop, _) in cells.items():
                    sheet.paste(crop, place[idx])
                tex = f"assets/motion/hero-vids/qiuqiu-{clip_slug(clip)}-{v['suffix']}.webp"
                sheet.save(ROOT / "public" / tex, "WEBP", quality=QUALITY, method=6)
                report[tex] = {"bytes": (ROOT / "public" / tex).stat().st_size, "size": list(sheet.size), "cells": len(cells)}
                for action in owners:
                    spec = ACTIONS[action]
                    pa = picks[action]
                    frames = []
                    for idx, dur in seq[action]:
                        crop, bb = cells[idx]
                        cx, cy = place[idx]
                        fx = centroid_x(fr[idx][..., 3]) if spec.get("anchor") == "centroid" else pa["foot_x"]
                        frames.append({
                            "rect": [cx, cy, crop.width, crop.height],
                            "pivot": [round(fx * pack - bb[0], 2), round(pa["foot_y"] * pack - bb[1], 2)],
                            "duration": round(dur, 6),
                            "src": idx,
                        })
                    entry = {"texture": tex, "scale": round(pa["display"] / pack, 6), "loop": "loop" in spec, "frames": frames}
                    for key in ("impactTimes", "releaseTimes"):
                        if key in spec:
                            entry[key] = spec[key]
                    actions_out[action] = entry
            data["variants"][vname] = {"fps": fps, "actions": {a: actions_out[a] for a in ACTIONS}}
    (OUT_DATA / "qiuqiu.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (ROOT / "tools" / "pack_hero_vids.report.json").write_text(json.dumps({
        "atlases": report,
        "scale": {a: round(picks[a]["display"], 5) for a in ACTIONS},
        "frames": {v: {a: len(data["variants"][v]["actions"][a]["frames"]) for a in ACTIONS} for v in VARIANTS},
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for vname in VARIANTS:
        total = sum(r["bytes"] for t, r in report.items() if t.endswith(f"-{VARIANTS[vname]['suffix']}.webp"))
        print(f"{vname}: {total / 1024 / 1024:.2f} MB")


SLUGS = {"揮爪_v2a": "claw", "貓抓B_flow_omni_v1": "clawb", "前投空手_v1": "toss", "受傷_v1": "hurt", "倒下_v1": "defeat", "跑步_v1": "run"}


def clip_slug(clip: str) -> str:
    return SLUGS[clip]


if __name__ == "__main__":
    main()
