# -*- coding: utf-8 -*-
"""
add_screen_bg.py — 把幾張新的節點畫面底圖進倉，**不動同組其他張**。

用法：python tools/add_screen_bg.py screen_rest_b.png screen_shop_mid_c.png ...
  來源先找 tools/codex_raw/，找不到再找 tools/art_inbox/。
  輸出 public/assets/bg/<名>.webp（1280x720、WebP 品質 66），併進 manifest 的 bg["bg/<名>"]，
  並把原稿複製一份進 tools/art_inbox/，整批重跑 build_art_inbox.py 才不會漏掉它。

為什麼不直接跑 build_art_inbox.py：那支會把收件匣裡兩百張 WebP 全部重新編碼一遍
（2026-09-06 踩過，所有素材的內容都變了、玩家的快取整批失效，實測第一場戰鬥掉到 47 fps）。
補幾張就只碰那幾張。

規格跟 build_art_inbox.py 的「畫面底圖」那一段完全一致（`ImageOps.fit` 到 1280x720、
quality=66、method=6）；那邊改了這邊要跟著改，不然整批重跑時同一張圖會換一次大小。
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
INBOX = ROOT / "tools" / "art_inbox"
OUT = ROOT / "public" / "assets" / "bg"
MANIFEST = ROOT / "public" / "assets" / "manifest.json"

SIZE = (1280, 720)
QUALITY = 66


def find(name: str) -> Path | None:
    for base in (RAW, INBOX):
        p = base / name
        if p.exists():
            return p
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="+", help="檔名（含 .png），例如 screen_rest_b.png")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest.setdefault("bg", {})
    OUT.mkdir(parents=True, exist_ok=True)

    missing: list[str] = []
    total = 0
    for name in args.names:
        src = find(name)
        if src is None:
            missing.append(name)
            continue
        stem = src.stem
        dst = OUT / f"{stem}.webp"
        ImageOps.fit(Image.open(src).convert("RGB"), SIZE, Image.LANCZOS).save(
            dst, "WEBP", quality=QUALITY, method=6)
        manifest["bg"][f"bg/{stem}"] = dst.relative_to(MANIFEST.parent.parent).as_posix()
        kb = dst.stat().st_size / 1024
        total += kb
        print(f"{stem}.webp {kb:.1f} KB")
        # 原稿留一份在收件匣，整批重跑才追得回來
        if src.parent != INBOX:
            shutil.copy2(src, INBOX / src.name)

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n共 {len(args.names) - len(missing)} 張，{total:.1f} KB")
    if missing:
        print("找不到：" + "、".join(missing))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
