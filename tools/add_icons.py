# -*- coding: utf-8 -*-
"""
add_icons.py — 把幾張新的綠幕圖示去背進倉，**不動同組其他張**。

用法：python tools/add_icons.py [--size 128] [--check] status_curl.png status_fly.png ...
  來源在 tools/codex_raw/，輸出到 public/assets/icons/<名>.webp，並併進 manifest.json。
  manifest 的鍵跟 chroma_key.py 一致：`relic_`／`potion_` 開頭走 `codex/<名>`，其餘走 `icon/<名>`。

為什麼不直接跑 chroma_key.py：那支是「照 subjects.json 從頭重跑一遍」，
69 個條目全部會重新去背、重新壓縮、重新寫進 manifest。魔物那一支的畫布規則
（`im.thumbnail((size * 2, size))`）跟 add_sprite.py 的不一樣，重跑會把剛剛照待機圖對齊好的
姿勢又推回舊規則，四個姿勢就對不齊了。只補幾張圖示，就只碰那幾張。

去背門檻、置中畫布的作法都直接沿用 chroma_key，不另外抄一份。
"""
import argparse
import json
from pathlib import Path

from PIL import Image

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from chroma_key import key_out  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
OUT = ROOT / "public" / "assets" / "icons"
MANIFEST = ROOT / "public" / "assets" / "manifest.json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="+", help="tools/codex_raw 裡的檔名，例如 status_curl.png")
    ap.add_argument("--size", type=int, default=128, help="輸出的方形畫布邊長；狀態圖示是 128")
    ap.add_argument("--check", action="store_true", help="只量不寫：帶綠與半透明像素、主體佔畫布幾成")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest.setdefault("icons", {})
    size = args.size
    wrote = 0
    for raw_name in args.names:
        src = RAW / (raw_name if raw_name.endswith(".png") else f"{raw_name}.png")
        if not src.exists():
            print(f"找不到：{src}，略過")
            continue
        im = key_out(Image.open(src))
        im.thumbnail((size, size))
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        # 底圖是全透明的空白畫布，直接整塊貼（含 alpha），不要傳遮罩——
        # 傳自己當遮罩會讓半透明邊緣的 alpha 被平方，邊緣莫名變薄（chroma_key 那邊的教訓）
        canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
        name = src.stem

        if args.check:
            px = canvas.load()
            green = weak = solid = 0
            for y in range(canvas.height):
                for x in range(canvas.width):
                    r, g, b, a = px[x, y]
                    if a == 0:
                        continue
                    solid += 1
                    if a < 250:
                        weak += 1
                    if g > max(r, b) + 30:
                        green += 1
            fill = solid / (size * size)
            flag = " ⚠帶綠" if green > solid * 0.005 else ""
            print(f"  {name:18s} 主體佔畫布 {fill * 100:4.1f}%　帶綠 {green:4d}　半透明 {weak:5d}{flag}")
            continue

        dst = OUT / f"{name}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(dst, "WEBP", quality=80, method=6)
        key = f"codex/{name}" if name.startswith(("relic_", "potion_")) else f"icon/{name}"
        manifest["icons"][key] = dst.relative_to(ROOT / "public").as_posix()
        wrote += 1
        print(f"圖示 {name}.webp {dst.stat().st_size // 1024} KB（{size}x{size}）→ manifest 鍵 {key}")

    if args.check:
        return
    # 一張都沒處理就別碰 manifest：內容雖然一樣，但白白動了檔案時間戳，git 也會多一筆假改動
    if not wrote:
        print("沒有任何圖示進倉，manifest.json 不動")
        return
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print("manifest.json 已併入")


if __name__ == "__main__":
    main()
