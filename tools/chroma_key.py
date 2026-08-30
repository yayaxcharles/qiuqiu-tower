# -*- coding: utf-8 -*-
"""
chroma_key.py — 把 tools/codex_raw 的綠幕圖去背、去綠邊、縮到規格尺寸，存成 WebP 並更新 manifest.json。
用法：python tools/chroma_key.py [--check]
  背景圖（bg/*）不去背，只縮成 1280x720。
  manifest 是「讀進來再合併」：任務 1 寫的 cards／sprites／review 一律原樣保留，只新增 monsters／icons／bg
  與 codex/curl（同時登記在 sprites 與 cards）。
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
OUT = ROOT / "public" / "assets"
MANIFEST = OUT / "manifest.json"
SUBJECTS = json.loads((ROOT / "tools" / "codex_prompts" / "subjects.json").read_text(encoding="utf-8"))

# 色鍵門檻（綠度 = 綠 − max(紅,藍)）：≥ HARD 全透明、≤ SOFT 全不透明、中間線性收邊。
#
# 這兩個值是照 2026-08-30 試水圖量出來訂的，任務書原本寫 60／20，實測會出大事：
#   * 綠幕背景是「完全平整的純綠」——量過黃瓜怪與蜷縮兩張，背景 100% 落在綠度 255。
#   * 但主體自己也可以很綠。黃瓜怪的瓜身亮部是 rgb(95,197,46)＝綠度 102，
#     綠度 60 的門檻會把整條黃瓜當成背景挖掉，只剩黑描邊跟眼睛。
# 所以 SOFT 要高過「最綠的主體」（實測 102，留到 150 當餘裕），HARD 只要低過背景的 255 即可。
HARD = 220
SOFT = 150

# 去綠邊只作用在「離透明區 DESPILL_BAND 像素以內」的邊緣帶。
# 任務書原版是「凡綠度 > 0 就把綠壓到 max(紅,藍)」，那是全圖套用；碰到黃瓜怪這種綠色主體，
# 瓜身會被壓成灰橄欖色。綠邊只會出現在主體與綠幕交界的那幾個像素，所以限定在邊緣帶處理。
DESPILL_BAND = 2


def key_out(im: Image.Image) -> Image.Image:
    """綠幕→透明：以「綠減去紅藍的最大值」當綠度；綠度 ≥HARD 全透明、≤SOFT 全不透明、中間線性。
    接著只在邊緣帶把綠壓到不超過紅藍最大值（去綠邊，不動主體內部）；最後 alpha 收 1 像素。"""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    span = float(HARD - SOFT)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            greenness = g - max(r, b)
            if greenness >= HARD:
                px[x, y] = (0, 0, 0, 0)
            elif greenness > SOFT:
                t = (greenness - SOFT) / span
                px[x, y] = (r, g, b, int(a * (1 - t)))
    # 邊緣帶＝把透明區往主體內側推 DESPILL_BAND 像素後掃過的範圍
    alpha = im.getchannel("A")
    band = alpha.filter(ImageFilter.MinFilter(2 * DESPILL_BAND + 1))
    bp = band.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and bp[x, y] < 255 and g > max(r, b):
                px[x, y] = (r, max(r, b), b, a)
    alpha = alpha.filter(ImageFilter.MinFilter(3))
    im.putalpha(alpha)
    bbox = alpha.getbbox()
    return im.crop(bbox) if bbox else im


def process() -> dict:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {"cards": {}, "sprites": {}, "review": []}
    manifest.setdefault("cards", {}); manifest.setdefault("sprites", {}); manifest.setdefault("review", [])
    manifest.setdefault("monsters", {}); manifest.setdefault("icons", {}); manifest.setdefault("bg", {})
    missing = []
    for key, spec in SUBJECTS.items():
        src = RAW / (key.replace("/", "__") + ".png")
        if not src.exists():
            missing.append(key); continue
        group = spec["group"]
        im = Image.open(src)
        if group == "bg":
            name = key.split("/")[1]
            dst = OUT / "bg" / f"{name}.webp"
            dst.parent.mkdir(parents=True, exist_ok=True)
            # 用「填滿再置中裁切」而不是直接 resize：生圖模型不一定給得出 1792x1024，
            # 常見是 1536x1024（3:2）或 1024x1024，直接 resize 會把畫面橫向拉扁。
            ImageOps.fit(im.convert("RGB"), (1280, 720), Image.LANCZOS).save(dst, "WEBP", quality=80, method=6)
            manifest["bg"][f"bg/{name}"] = dst.relative_to(ROOT / "public").as_posix()
            continue
        im = key_out(im)
        size = int(spec["size"])
        if group == "icons":
            im.thumbnail((size, size))
            canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            # 底圖是全透明的空白畫布，所以直接整塊貼（含 alpha）就好、不要傳遮罩。
            # 傳 im 自己當遮罩會讓半透明邊緣的 alpha 被平方（a → a²/255），邊緣莫名變薄。
            canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
            im = canvas
        else:
            im.thumbnail((size * 2, size))
        name = key.split("/", 1)[1]
        dst = OUT / group / f"{name}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, "WEBP", quality=80, method=6)
        rel = dst.relative_to(ROOT / "public").as_posix()
        if group == "monsters":
            base, pose = name.rsplit("_", 1)
            manifest["monsters"].setdefault(f"codex/monster_{base}", {})[pose] = rel
        elif group == "icons":
            manifest["icons"][f"codex/{name}" if name.startswith(("relic_", "potion_")) else f"icon/{name}"] = rel
        else:
            # 同一個檔登記兩個群組：立繪用（戰鬥中蜷起來）與牌面用（「淡定」的牌圖）。
            # 兩邊指到同一個路徑，不會多佔體積。
            manifest["sprites"]["codex/curl"] = rel
            manifest["cards"]["codex/curl"] = rel
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"missing": missing}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--check", action="store_true"); args = ap.parse_args()
    r = process()
    if args.check and r["missing"]:
        sys.exit(f"尚缺 {len(r['missing'])} 張原圖：{r['missing']}")
    print(f"完成；尚缺原圖 {len(r['missing'])} 張")
