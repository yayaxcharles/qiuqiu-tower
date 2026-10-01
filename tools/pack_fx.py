#!/usr/bin/env python3
"""
魔物特效圖層的共用特效（2026-10-01 Flow 新生：大爆炸、小爆炸、煙霧），裁成爪破魔塔用的圖集。

來源（唯讀）：F:/ClaudeWork/爪破_大冒險素材盤點_20261001/新片段/fx/<名>/NN.webp ＋ anim.json
  每格都是同一個大小的整張畫面（已去背、四邊淡出），anchor＝特效中心在圖裡的位置（每格都一樣）。

輸出：
  public/assets/motion/fx/<名>.webp     一支特效一張圖集（用到才下載，見 src/ui/fx-layer.ts）
  src/ui/fx/sprites/<名>.json           格子位置／中心點／每格秒數（動態載入，不進開場程式）

畫質：圖集用來源原尺寸（不縮），只裁掉每格四周的透明邊；每 2 格取 1 格（跟魔物片段同一個節奏），
頭尾幾乎全空的格子不收（見 FX 的 first／last，對照 新片段/_總覽/fx_<名>.png）。
用的時候照「特效提示」（src/ui/fx/cues.json）的 scale 放大縮小。

用法：python tools/pack_fx.py [--src ...] [--only blast_large,smoke]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "assets" / "motion" / "fx"
OUT_DATA = ROOT / "src" / "ui" / "fx" / "sprites"
QUALITY = 80
MAX_W = 4096
SRC_FPS = 24.0
STEP = 2

# first／last：要收的格號（含頭尾，來源資料夾裡的格號）。
FX: dict[str, dict] = {
    # 大爆炸 v2：第 0～2 格只有一個小亮點；第 85 格以後只剩零星幾粒黑煙渣
    "blast_large": {"first": 3, "last": 84},
    # 小爆炸：第 64 格起畫面全空
    "blast_small": {"first": 0, "last": 62},
    # 煙霧（來源已從影片第 14 格起取，前面 Flow 自己加的白色爆星不在裡面）：第 71 格以後只剩細渣
    "smoke": {"first": 0, "last": 70},
    # ---- 師父（2026-10-01 Flow 新生，使用者核准「走火入魔特效」）：兩支都是可循環的片段（來源已挑好頭尾最像的兩格），整段收 ----
    # 黑氣：黑色帶暗紫邊的煙柱，從底部往上捲（待機、出招時疊在身上；換階段放大爆發）
    "daxia_black_qi": {"first": 0, "last": 71},
    # 閉關氣場：淡金白色圓環慢慢轉、金色光點往上飄。來源背景留了一層很淡的粉色霧（綠幕反推顏色的殘留），
    # 打包時把「透明度低、不帶金色」的那一層壓淡（`fade_haze`），圓環與光點不動
    "daxia_seclude_aura": {"first": 0, "last": 50, "fade_haze": True},
}


def fade_haze(im: Image.Image) -> Image.Image:
    """閉關氣場的粉色霧：透明度 < 100、綠不比藍多（金色的綠明顯比藍多，霧是灰粉、綠藍差不多）的像素，透明度乘 0.2"""
    import numpy as np
    a = np.array(im)
    rgb = a[..., :3].astype(int)
    haze = (a[..., 3] > 0) & (a[..., 3] < 100) & (rgb[..., 1] - rgb[..., 2] < 10)
    a[..., 3] = np.where(haze, (a[..., 3].astype(int) * 0.2).astype(np.uint8), a[..., 3])
    return Image.fromarray(a, "RGBA")


def pack(src_root: Path, name: str, spec: dict) -> tuple[Image.Image, dict]:
    meta = json.loads((src_root / name / "anim.json").read_text(encoding="utf-8"))
    ax, ay = meta["anchor"]
    idx = list(range(spec["first"], spec["last"] + 1, STEP))
    cells = []
    for i in idx:
        im = Image.open(src_root / name / f"{i:02d}.webp").convert("RGBA")
        if spec.get("fade_haze"):
            im = fade_haze(im)
        box = im.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox() or (0, 0, 1, 1)
        crop = im.crop(box)
        cells.append((crop, ax - box[0], ay - box[1]))
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
    frames = []
    duration = round(STEP / SRC_FPS, 4)
    for (crop, px, py), (cx, cy) in zip(cells, places):
        sheet.paste(crop, (cx, cy))
        frames.append({"rect": [cx, cy, crop.width, crop.height], "pivot": [round(px, 2), round(py, 2)], "duration": duration})
    data = {
        "texture": f"assets/motion/fx/{name}.webp",
        # 來源 1 像素畫成戰場上幾像素（再乘上提示裡的 scale）
        "scale": 1,
        # 整張畫面（含四邊的細火星）原本多大，給提示估大小用
        "size": meta["size"],
        "frames": frames,
    }
    return sheet, data


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="F:/ClaudeWork/爪破_大冒險素材盤點_20261001/新片段/fx")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    only = set(filter(None, args.only.split(",")))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    for name, spec in FX.items():
        if only and name not in only:
            continue
        sheet, data = pack(Path(args.src), name, spec)
        path = OUT_DIR / f"{name}.webp"
        sheet.save(path, "WEBP", quality=QUALITY, method=6)
        (OUT_DATA / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{name}: {len(data['frames'])} 格，圖集 {sheet.size[0]}×{sheet.size[1]}，{path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
