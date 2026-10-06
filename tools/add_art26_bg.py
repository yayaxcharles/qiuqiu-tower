# -*- coding: utf-8 -*-
"""
add_art26_bg.py — 2026-10-06 美術改版（背景線）的新背景進倉：戰鬥背景與地圖中層。**不動任何舊素材**。

用法：
  python tools/add_art26_bg.py battle <原稿.png> <鍵名> <牆腳y>   # 例：battle raw/art26_low_1.png art26_low_1 560
  python tools/add_art26_bg.py mapmid <原稿.png> <鍵名> [壓暗倍率]  # 例：mapmid raw/art26_mapmid_1.png art26_mapmid 0.8

戰鬥背景（跟 `add_screen_bg.py` 同一個出口：public/assets/bg/<鍵名>.webp、manifest 的 bg["bg/<鍵名>"]），差在兩件事：
  1. **自己裁、不置中裁**：原稿 1536x1024（3:2）縮到 1280 寬之後高 853，要裁掉 133 像素才是 16:9。
     置中裁的話牆腳落在哪裡看運氣；這裡照「原稿上量到的牆腳 y」裁，讓牆腳落在舞台 y=388——
     角色的腳固定踩在 403（`screenbg.ts` 的 `BG_ZOOM` 說明），腳比牆腳低 15 像素＝站在地板前緣、不是浮在牆前。
     所以新背景一律 100% 鋪、不用在 `BG_ZOOM` 登記放大率（放大會糊）。
  2. **品質 85**（`recompress_webp.py` 的規矩；`add_screen_bg.py` 是 66）：使用者 09-29「不降精美」、新背景不得比現有的糊。
     代價是一張大約是舊背景的兩三倍大，但新背景全部不在開場載（`bgacts.ts` 的 `art26Keys`），不算首載。

地圖中層：原稿直式 1024x1536，等比放大到高 1704（地圖捲軸內容的高，`map.ts` 的 `INNER_H`），取中間 680 寬
（`map.css` 的 `.map-mid` 放在 x=300～980，兩側牆中間那一片黑），再
  - 壓暗：亮度乘 `DARK`，並把飽和度收一點，讓節點與路線疊上去還清楚（對比度數字寫在報告裡）；
  - 左右各 `EDGE` 像素淡出成透明、上下各 60 像素淡出：跟兩側牆、上下端自然接起來；
存成帶透明的 WebP（顏色 85、透明層 90）。

**不寫 tools/art_inbox/**：那個資料夾不進版控，`build_art_inbox.py` 整批重跑時也不該把這幾張用 66 的品質重壓一遍。
原稿留在主資料夾 `tools/codex_raw/美術方向_1006/bg/`（不進版控），提示詞在同資料夾 `prompts.json`。

manifest 照原本的格式寫回（縮排 2、結尾換行），新鍵加在 bg 那一組最後面：diff 只會多幾行。
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "bg"
MANIFEST = ROOT / "public" / "assets" / "manifest.json"

FLOOR_TARGET = 388      # 牆腳落在舞台的這一條線（角色腳底 403）
MAP_H = 1704            # 地圖捲軸內容高（map.ts：PAD*2 + (FLOORS-1)*SPACING）
MAP_W = 680             # map.css .map-mid 的寬
EDGE = 120              # 左右淡出寬
DARK = 0.55             # 地圖中層壓暗倍率


def register(stem: str, dst: Path) -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["bg"][f"bg/{stem}"] = dst.relative_to(MANIFEST.parent.parent).as_posix()
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def battle(src: Path, stem: str, floor_src: float) -> None:
    im = Image.open(src).convert("RGB")
    k = 1280 / im.width
    im = im.resize((1280, round(im.height * k)), Image.LANCZOS)
    top = round(floor_src * k - FLOOR_TARGET)
    top = max(0, min(top, im.height - 720))
    im = im.crop((0, top, 1280, top + 720))
    dst = OUT / f"{stem}.webp"
    im.save(dst, "WEBP", quality=85, method=6)
    register(stem, dst)
    print(f"{stem}.webp {dst.stat().st_size / 1024:.1f} KB（裁掉上緣 {top} 像素，牆腳落在 {floor_src * k - top:.0f}）")


def mapmid(src: Path, stem: str, dark: float = DARK) -> None:
    im = Image.open(src).convert("RGB")
    k = MAP_H / im.height
    im = im.resize((round(im.width * k), MAP_H), Image.LANCZOS)
    left = (im.width - MAP_W) // 2
    im = im.crop((left, 0, left + MAP_W, MAP_H))
    im = ImageEnhance.Color(im).enhance(0.8)
    im = ImageEnhance.Brightness(im).enhance(dark)
    alpha = Image.new("L", im.size, 255)
    px = alpha.load()
    for x in range(MAP_W):
        ax = min(1.0, min(x, MAP_W - 1 - x) / EDGE)
        for y in range(MAP_H):
            ay = min(1.0, min(y, MAP_H - 1 - y) / 60)
            a = ax * ay
            px[x, y] = round(255 * a * a * (3 - 2 * a))   # 平滑淡出
    rgba = im.convert("RGBA")
    rgba.putalpha(alpha)
    dst = OUT / f"{stem}.webp"
    rgba.save(dst, "WEBP", quality=85, alpha_quality=90, method=6)
    register(stem, dst)
    print(f"{stem}.webp {dst.stat().st_size / 1024:.1f} KB")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    kind, src, stem, *rest = sys.argv[1:]
    if kind == "battle":
        battle(Path(src), stem, float(rest[0]))
    elif kind == "mapmid":
        mapmid(Path(src), stem, float(rest[0]) if rest else DARK)
    else:
        print("第一個參數要是 battle 或 mapmid")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
