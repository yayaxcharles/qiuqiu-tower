# -*- coding: utf-8 -*-
"""
build_assets.py — 從 Dropbox 貼圖原圖產出遊戲素材。
  牌面：整張（含標題帶）→ 寬 400 WebP → public/assets/cards/<set>/<NN>.webp
  立繪：裁掉頂端標題帶 → 高 640 WebP → public/assets/sprites/<set>/<NN>.webp
  另產 public/assets/manifest.json 與 tools/out/review_sprites_<set>.png（抽查拼圖）。
用法：python tools/build_assets.py [--force] [--check]
  --force  忽略時間戳全部重做
  --check  只驗證產物齊全（給 CI／驗收用），不產圖
來源只讀；可重跑。
"""
import argparse
import json
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DROPBOX = Path(os.environ["USERPROFILE"]) / "Dropbox" / "08_軟體工具與遊戲" / "LINE貼圖" / "已上架"
SOURCES = {
    "ninja": DROPBOX / "忍者貓貓" / "20260801_彈1" / "RGBA原圖",
    "daxia": DROPBOX / "大俠貓貓篇" / "20260808_彈1" / "RGBA原圖",
}
OUT = ROOT / "public" / "assets"
REVIEW_DIR = ROOT / "tools" / "out"
OVERRIDES = ROOT / "tools" / "crop_overrides.json"
CARD_W = 400
SPRITE_H = 640
QUALITY = 70


def title_band_bottom(im: Image.Image) -> tuple[int, bool]:
    """回傳 (裁切線 y, 是否退路)。
    做法：標題帶在最上面，跟角色之間通常有一段完全透明的列。
    從頂端第一個不透明列往下找，找到連續 ≥4 列全透明就當作分界；只在上方 40% 內找。
    找不到就退路：裁掉 20% 高度，並標記人工檢查。"""
    alpha = im.getchannel("A")
    w, h = im.size
    row_opaque = [False] * h
    px = alpha.load()
    for y in range(h):
        for x in range(0, w, 2):          # 隔行取樣加速
            if px[x, y] > 16:
                row_opaque[y] = True
                break
    top = next((y for y in range(h) if row_opaque[y]), None)
    if top is None:
        return int(h * 0.2), True
    run = 0
    for y in range(top, int(h * 0.4)):
        if not row_opaque[y]:
            run += 1
            if run >= 4:
                return y + 1, False
        else:
            run = 0
    return int(h * 0.2), True


def save_webp(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=QUALITY, method=6)


def newer(src: Path, dst: Path) -> bool:
    return not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime


def build(force: bool) -> dict:
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    manifest = {"cards": {}, "sprites": {}, "review": []}
    for set_name, src_dir in SOURCES.items():
        if not src_dir.exists():
            sys.exit(f"找不到來源資料夾：{src_dir}")
        files = sorted(p for p in src_dir.glob("*.png") if p.stem[:2].isdigit())
        thumbs = []
        for src in files:
            key = f"{set_name}/{src.stem[:2]}"
            card_out = OUT / "cards" / set_name / f"{src.stem[:2]}.webp"
            sprite_out = OUT / "sprites" / set_name / f"{src.stem[:2]}.webp"
            manifest["cards"][key] = card_out.relative_to(ROOT / "public").as_posix()
            manifest["sprites"][key] = sprite_out.relative_to(ROOT / "public").as_posix()
            im = Image.open(src).convert("RGBA")
            if force or newer(src, card_out):
                card = im.copy()
                card.thumbnail((CARD_W, CARD_W * 4))
                save_webp(card, card_out)
            y, fallback = title_band_bottom(im)
            if key in overrides:
                y, fallback = int(overrides[key]), False
            if fallback:
                manifest["review"].append(key)
            if force or newer(src, sprite_out):
                sprite = im.crop((0, y, im.width, im.height))
                bbox = sprite.getchannel("A").getbbox()
                if bbox:
                    sprite = sprite.crop(bbox)
                sprite.thumbnail((SPRITE_H * 2, SPRITE_H))
                save_webp(sprite, sprite_out)
            t = Image.open(sprite_out).convert("RGBA")
            t.thumbnail((180, 160))
            thumbs.append(t)
        cols = 8
        rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new("RGBA", (cols * 180, rows * 160), (80, 80, 80, 255))
        for i, t in enumerate(thumbs):
            sheet.paste(t, ((i % cols) * 180, (i // cols) * 160), t)
        REVIEW_DIR.mkdir(parents=True, exist_ok=True)
        sheet.convert("RGB").save(REVIEW_DIR / f"review_sprites_{set_name}.png", quality=85)
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return manifest


def check() -> None:
    manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
    problems = []
    for group in ("cards", "sprites"):
        if len(manifest[group]) != 80:
            problems.append(f"{group} 應有 80 筆，實際 {len(manifest[group])}")
        for key, rel in manifest[group].items():
            p = ROOT / "public" / rel
            if not p.exists():
                problems.append(f"缺檔：{rel}")
            elif p.stat().st_size > 120_000:
                problems.append(f"太大（>120KB）：{rel}")
    if problems:
        sys.exit("\n".join(problems))
    print(f"ok：80 牌面、80 立繪，待人工檢查 {len(manifest['review'])} 張：{manifest['review']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        check()
    else:
        m = build(args.force)
        print(f"完成：{len(m['cards'])} 牌面、{len(m['sprites'])} 立繪；待人工檢查：{m['review']}")
