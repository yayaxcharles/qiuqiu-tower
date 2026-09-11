# -*- coding: utf-8 -*-
"""
add_foreground.py — 戰場的前景層（畫面最下緣那一條碎石）進倉。

用法：python tools/add_foreground.py

為什麼不共用 add_screen_bg.py：那支會把圖 `fit` 成 1280x720，而前景是**寬條狀**
（1536x512），硬塞成 16:9 會把左右兩側裁掉一大塊、石頭也被拉扁。
前景只要維持比例縮到 1280 寬、貼在畫面下緣就好，上半部是透明的。

`crop=False` 是關鍵：前景的透明區域**就是它的一部分**（上半部要空著讓角色露出來）。
裁到主體邊界的話三張會各自被裁成不同高度，貼下緣時石頭的高度就對不齊了。
"""
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_art_inbox import INBOX, MANIFEST, OUT  # noqa: E402
from chroma_key import key_out  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
NAMES = ["bg_fore_low", "bg_fore_mid", "bg_fore_top"]
WIDTH = 1280


def main() -> None:
    man = json.loads(Path(MANIFEST).read_text(encoding="utf-8"))
    bg = man.setdefault("bg", {})
    for name in NAMES:
        src = RAW / f"{name}.png"
        if not src.exists():
            print(f"  ⚠ 找不到 {src.name}")
            continue
        im = key_out(Image.open(src).convert("RGBA"), crop=False)
        h = round(im.height * WIDTH / im.width)
        im = im.resize((WIDTH, h), Image.LANCZOS)
        # OUT 是 public/assets，圖要進 assets/**bg**/ 那一層——
        # 少了 bg/ 會寫到 assets/ 根目錄，manifest 指的路徑就找不到檔案。
        # 用 vite preview 測還會被單頁應用的萬用路由騙：它對不存在的路徑回 200＋HTML，
        # curl 看起來一切正常，瀏覽器才會在解碼時失敗（2026-09-11 踩到）
        out = Path(OUT) / "bg" / f"{name}.webp"
        im.save(out, "WEBP", quality=72, method=6)
        # 路徑要含 assets/ 前綴：`artUrl` 是 `BASE + manifest 值`，
        # 少了它會組出 /qiuqiu-tower/bg/... 直接 404（2026-09-11 第一版踩到）
        bg[f"bg/{name}"] = f"assets/bg/{name}.webp"
        shutil.copy2(src, Path(INBOX) / src.name)
        print(f"前景層 {out.name} {out.stat().st_size // 1024} KB（{WIDTH}x{h}）")
    Path(MANIFEST).write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")
    print("manifest.json 已併入")


if __name__ == "__main__":
    main()
