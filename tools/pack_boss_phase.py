# -*- coding: utf-8 -*-
"""把師父二、三階段的新姿勢與球球的狀態立繪收進**既有的共用畫布**。

build_art_inbox.py 的 hero／boss 畫布是「用收件匣裡的圖重算」的，只丟幾張新圖進去會算出另一個尺寸，
換姿勢時整隻貓忽大忽小。這支改成：讀既有立繪（boss/idle1、hero/ninja）的畫布大小當基準，
新圖去背後底部對齊置中貼上去；主體比畫布高就等比縮到剛好。

用法：python tools/pack_boss_phase.py            （收 tools/codex_raw 裡的 boss_*2.png、boss_*3.png、hero_ninja_power/hurt.png）
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chroma_key import key_out   # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
OUT = ROOT / "public" / "assets"
MANIFEST = OUT / "manifest.json"

JOBS = {
    # 檔名 → (群組, 立繪鍵)
    "boss_palm2.png": ("boss", "palm2"), "boss_drunk2.png": ("boss", "drunk2"), "boss_guard2.png": ("boss", "guard2"),
    "boss_idle3.png": ("boss", "idle3"), "boss_headbutt3.png": ("boss", "headbutt3"),
    "boss_palm3.png": ("boss", "palm3"), "boss_guard3.png": ("boss", "guard3"),
    "hero_ninja_power.png": ("hero", "ninja_power"), "hero_ninja_hurt.png": ("hero", "ninja_hurt"),
}
BASE = {"boss": "boss/idle1", "hero": "hero/ninja"}   # 畫布大小照這兩張


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    sizes = {g: Image.open(OUT.parent / manifest["sprites"][k]).size for g, k in BASE.items()}
    pad = 10
    done = 0
    for fname, (group, key) in JOBS.items():
        src = RAW / fname
        if not src.exists():
            print(f"  還沒生：{fname}")
            continue
        im = key_out(Image.open(src))
        cw, ch = sizes[group]
        # 主體比畫布高（或寬）就等比縮小到剛好塞得下，維持底部對齊的腳底位置
        scale = min(1.0, (ch - pad * 2) / im.height, (cw - pad * 2) / im.width)
        if scale < 1.0:
            im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        canvas.paste(im, ((cw - im.width) // 2, ch - pad - im.height), im)
        dst = OUT / "sprites" / group / f"{key}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(dst, "WEBP", quality=82, method=6)
        manifest["sprites"][f"{group}/{key}"] = dst.relative_to(OUT.parent).as_posix()
        print(f"立繪 {group}/{key}.webp {dst.stat().st_size // 1024} KB（主體 {im.width}x{im.height}，畫布 {cw}x{ch}）")
        done += 1
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"收進 {done} 張，manifest 已更新")


if __name__ == "__main__":
    main()
