# -*- coding: utf-8 -*-
"""
build_art_inbox.py — 把 tools/art_inbox 交來的素材處理成遊戲用檔，並併進 manifest.json。
用法：python tools/build_art_inbox.py

  地圖底圖  map_bg.png      → public/assets/bg/map.webp（1280x720）
  節點圖示  map_node_*.png  → public/assets/icons/node_*.webp（綠幕去背，96x96）
  畫面底圖  screen_*.png    → public/assets/bg/screen_*.webp（1280x720）

manifest 一律「讀進來再合併」：其他工具寫的鍵原樣保留，只新增 bg/map 與 icon/node_*。
去背沿用 chroma_key.py 的 key_out（門檻是照實際素材量出來的，不要在這裡另訂一套）。
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chroma_key import key_out   # noqa: E402  沿用同一套門檻與去綠邊

ROOT = Path(__file__).resolve().parents[1]
INBOX = ROOT / "tools" / "art_inbox"
OUT = ROOT / "public" / "assets"
MANIFEST = OUT / "manifest.json"

ICON_PX = 96      # 節點顯示 44 像素，備 2 倍給高解析度螢幕
ICON_FILL = 0.94  # 去背裁到邊界後，主體要佔滿方框的比例


def fit_square(im: Image.Image, px: int, fill: float) -> Image.Image:
    """把去背後的主體等比縮進正方形畫布並置中。
    去背已經裁到不透明範圍，所以這裡只管縮放與留白，不再猜主體在哪。"""
    inner = int(px * fill)
    w, h = im.size
    s = min(inner / w, inner / h)
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    canvas.paste(im, ((px - im.width) // 2, (px - im.height) // 2), im)
    return canvas


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    for k in ("cards", "sprites", "monsters", "icons", "bg"):
        manifest.setdefault(k, {})
    manifest.setdefault("review", [])

    missing = []

    bg_src = INBOX / "map_bg.png"
    if bg_src.exists():
        dst = OUT / "bg" / "map.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        # fit 而不是 resize：交來的圖不見得剛好 16:9，直接 resize 會把畫面拉變形
        ImageOps.fit(Image.open(bg_src).convert("RGB"), (1280, 720), Image.LANCZOS).save(
            dst, "WEBP", quality=80, method=6)
        manifest["bg"]["bg/map"] = dst.relative_to(OUT.parent).as_posix()
        print(f"底圖 map.webp {dst.stat().st_size // 1024} KB")
    else:
        missing.append(bg_src.name)

    # 畫面底圖：品質壓 74（比地圖底圖低一階）。七張一起進來，用 80 會吃掉圖片預算的餘裕，
    # 而這幾張中央本來就被面板蓋住、實際看得到的只有邊緣景物，壓一階看不太出來。
    for src in sorted(INBOX.glob("screen_*.png")):
        name = src.stem.replace("screen_", "")
        dst = OUT / "bg" / f"screen_{name}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        ImageOps.fit(Image.open(src).convert("RGB"), (1280, 720), Image.LANCZOS).save(
            dst, "WEBP", quality=74, method=6)
        manifest["bg"][f"bg/screen_{name}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"畫面底圖 screen_{name}.webp {dst.stat().st_size // 1024} KB")

    for src in sorted(INBOX.glob("map_node_*.png")):
        name = src.stem.replace("map_node_", "")
        dst = OUT / "icons" / f"node_{name}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        fit_square(key_out(Image.open(src)), ICON_PX, ICON_FILL).save(
            dst, "WEBP", quality=88, method=6)
        manifest["icons"][f"icon/node_{name}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"圖示 node_{name}.webp {dst.stat().st_size // 1024} KB")

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"完成；尚缺 {len(missing)} 張：{missing}")


if __name__ == "__main__":
    main()
