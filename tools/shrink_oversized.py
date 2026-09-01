# -*- coding: utf-8 -*-
"""把存得比顯示尺寸大太多的圖就地縮小重壓。

**為什麼需要這支**：`build_art_inbox.py` 只重建「原圖在 `tools/art_inbox` 裡」的素材。
最早那批魔物立繪是更早的管線做的、原圖不在那裡，所以打包腳本再怎麼改都碰不到它們，
一直維持 793x640 這種尺寸——畫面上最大只顯示 230x280。

這支直接讀已經去背好的 webp、縮到「兩倍顯示尺寸」再存回去。
會有二次壓縮的損失，但這些圖在畫面上只有兩三百像素，看不出來。

跑法：python tools/shrink_oversized.py [--dry]
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

# 每個資料夾的上限＝畫面上最大顯示尺寸的兩倍（給高解析度螢幕留餘裕）
# monsters：`.unit.size-large .sprite` 是 230x280
# sprites ：球球 270x300、塔主同框
CAPS = {
    "monsters": (460, 560),
    "sprites": (560, 620),
}
QUALITY = 74


def main() -> None:
    dry = "--dry" in sys.argv
    saved = 0
    n = 0
    for folder, (mw, mh) in CAPS.items():
        for f in sorted((ROOT / "public/assets" / folder).rglob("*.webp")):
            im = Image.open(f).convert("RGBA")
            if im.width <= mw and im.height <= mh:
                continue
            before = f.stat().st_size
            im.thumbnail((mw, mh), Image.LANCZOS)
            if not dry:
                im.save(f, "WEBP", quality=QUALITY, method=6)
            after = f.stat().st_size if not dry else before
            print(f"  {f.relative_to(ROOT / 'public/assets')}　"
                  f"{before // 1024} KB → {after // 1024} KB　{im.size}")
            saved += before - after
            n += 1
    print(f"{'（試跑）' if dry else ''}縮了 {n} 張，省下 {saved / 1048576:.2f} MB")


if __name__ == "__main__":
    main()
