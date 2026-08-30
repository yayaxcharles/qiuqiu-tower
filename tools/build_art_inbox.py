# -*- coding: utf-8 -*-
"""
build_art_inbox.py — 把 tools/art_inbox 交來的素材處理成遊戲用檔，並併進 manifest.json。
用法：python tools/build_art_inbox.py

  地圖底圖  map_tall.png    → public/assets/bg/map_tall.webp（1280x1704，跟著捲軸捲）
  節點圖示  map_node_*.png  → public/assets/icons/node_*.webp（綠幕去背，96x96）
  畫面底圖  screen_*.png    → public/assets/bg/screen_*.webp（1280x720）
  牌的底紋  card_paper_*.png → public/assets/bg/card_paper_*.webp（256x256，可平鋪）
  面板角花  frame_corner.png → public/assets/icons/corner_{tl,tr,bl,br}.webp（去背後自動鏡射出四個角）
  腳印      map_path.png     → public/assets/icons/paw.webp（去背、轉成朝右，放進 3:2 的框留出間距）

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

    # 地圖底圖跟著捲軸捲，所以尺寸就是捲軸內容的大小 1280x1704
    # （= 上下留白 96×2 ＋ 十四段樓層間距 108，見 src/ui/screens/map.ts）。
    # 早期的 16:9 版 map_bg.png 已停用：拉成 1704 高會變形，只能固定不動，
    # 結果是爬十五層看到的景一模一樣。
    bg_src = INBOX / "map_tall.png"
    if bg_src.exists():
        dst = OUT / "bg" / "map_tall.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        # fit 而不是 resize：交來的圖不見得剛好那個比例，直接 resize 會把畫面拉變形
        ImageOps.fit(Image.open(bg_src).convert("RGB"), (1280, 1704), Image.LANCZOS).save(
            dst, "WEBP", quality=80, method=6)
        manifest["bg"]["bg/map_tall"] = dst.relative_to(OUT.parent).as_posix()
        print(f"地圖底圖 map_tall.webp {dst.stat().st_size // 1024} KB")
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

    # 牌的底紋：近乎純色的紙紋，縮到 256 當平鋪磚。品質給高一點——這種平坦漸層
    # 壓太狠會出現一圈一圈的色帶，而檔案本來就只有幾 KB，省不了什麼。
    for src in sorted(INBOX.glob("card_paper_*.png")):
        name = src.stem.replace("card_paper_", "")
        dst = OUT / "bg" / f"card_paper_{name}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        Image.open(src).convert("RGB").resize((256, 256), Image.LANCZOS).save(
            dst, "WEBP", quality=92, method=6)
        manifest["bg"][f"bg/card_paper_{name}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"牌底紋 card_paper_{name}.webp {dst.stat().st_size // 1024} KB")

    # 面板角花：只生左上角那一片，其餘三角由這裡鏡射出來（省三次生圖，也保證四角完全對稱）
    corner_src = INBOX / "frame_corner.png"
    if corner_src.exists():
        base = key_out(Image.open(corner_src))
        base.thumbnail((96, 96), Image.LANCZOS)
        flips = {
            "tl": base,
            "tr": base.transpose(Image.FLIP_LEFT_RIGHT),
            "bl": base.transpose(Image.FLIP_TOP_BOTTOM),
            "br": base.transpose(Image.FLIP_LEFT_RIGHT).transpose(Image.FLIP_TOP_BOTTOM),
        }
        for tag, im in flips.items():
            dst = OUT / "icons" / f"corner_{tag}.webp"
            dst.parent.mkdir(parents=True, exist_ok=True)
            im.save(dst, "WEBP", quality=88, method=6)
            manifest["icons"][f"icon/corner_{tag}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"角花 corner_*.webp ×4 {(OUT / 'icons' / 'corner_tl.webp').stat().st_size // 1024} KB/張")

    # 腳印：地圖上的路徑改用腳印串起來。
    # 原圖的腳掌朝上，先順時針轉 90 度變成朝右——畫面那邊會把整條路徑轉到線的角度，
    # 「朝右」等於「朝行進方向」，轉過去才會像沿著路走。
    # 再放進一個很寬的透明框：平鋪時多出來的那段空白就是腳印之間的間距。
    # 框寬 130 對腳印 50，等於腳印只佔三分之一——一開始用 3:2 的框，
    # 八十條路徑的腳印擠在一起像壁紙，拉開之後才像一串腳印。
    paw_src = INBOX / "map_path.png"
    if paw_src.exists():
        paw = key_out(Image.open(paw_src)).rotate(-90, expand=True)
        paw.thumbnail((50, 50), Image.LANCZOS)
        cell = Image.new("RGBA", (130, 56), (0, 0, 0, 0))
        cell.paste(paw, ((130 - paw.width) // 2, (56 - paw.height) // 2), paw)
        dst = OUT / "icons" / "paw.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        cell.save(dst, "WEBP", quality=88, method=6)
        manifest["icons"]["icon/paw"] = dst.relative_to(OUT.parent).as_posix()
        print(f"腳印 paw.webp {dst.stat().st_size // 1024} KB")

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
