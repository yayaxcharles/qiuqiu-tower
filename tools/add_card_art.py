# -*- coding: utf-8 -*-
"""
add_card_art.py — 把幾張新的牌面圖進倉，**不動同組其他張**。

用法：python tools/add_card_art.py card_feifei_feizhen.png card_feifei_tuikai.png ...
  來源先找 tools/codex_raw/，找不到再找 tools/art_inbox/。
  輸出 public/assets/cards/card/<牌號>.webp，併進 manifest 的 cards["card/<牌號>"]，
  並把原稿複製一份進 tools/art_inbox/（整批重跑 build_art_inbox.py 才不會漏掉它）。

為什麼不直接跑 build_art_inbox.py：那支把**收件匣裡所有牌面**放進「同一張共用畫布」，
而畫布尺寸是當下所有圖的最大值。補幾張進去會算出另一個尺寸，**119 張舊牌全部要重編碼**——
玩家的快取整批失效（2026-09-06 踩過，第一場戰鬥掉到 47 fps），而且每張貓的相對大小也會跟著變。

這裡改成讀一張現成的 webp 當基準（預設 `sanjo`）：**輸出尺寸照它，而且一律填滿**
（去背裁到主體 → 等比放大到蓋滿這個框 → 多出來的裁掉）。留白的話那張牌並排時會小一圈、
四周露出底紋，一眼就看得出是後來補的。去背門檻沿用 `chroma_key` 的 CARD_* 那組
（牌面的特效本身就偏綠，用一般門檻會被挖得坑坑洞洞）。
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chroma_key import CARD_BAND, CARD_HARD, CARD_SOFT, key_out  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
INBOX = ROOT / "tools" / "art_inbox"
OUT = ROOT / "public" / "assets"
MANIFEST = OUT / "manifest.json"


def cover(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    """**填滿**目標框（多出來的裁掉），不是「塞進去留白」。

    牌面那個窗格是固定大小的，現有 119 張全部是滿版；留白的那張並排時會小一圈、
    四周露出底紋，一眼就看得出是後來補的（2026-09-12 實機看到「遠射」就是這樣）。
    """
    box = im.getbbox()
    if box:
        im = im.crop(box)
    k = max(size[0] / im.width, size[1] / im.height)
    im = im.resize((max(size[0], round(im.width * k)), max(size[1], round(im.height * k))), Image.LANCZOS)
    left = (im.width - size[0]) // 2
    top = (im.height - size[1]) // 2
    return im.crop((left, top, left + size[0], top + size[1]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", help="codex_raw 或 art_inbox 裡的檔名")
    ap.add_argument("--baseline", default="sanjo", help="拿哪一張現成的牌面當基準（預設貓抓）")
    # 2026-09-12 踩到：菲菲那批的綠幕是 rgb(3,250,10)＝綠度 240，比舊那批（255）髒一點，
    # 卡在 CARD_HARD=248 底下 → 背景沒被挖掉、只被去綠邊壓成**灰色**，整張牌像糊了一層水泥。
    # 所以門檻要能逐批調。她的牌面刻意一點綠都沒有（毒畫成紫或芥末黃），放低很安全。
    ap.add_argument("--soft", type=int, default=CARD_SOFT, help=f"綠度 ≤ 這個值＝完全不透明（預設 {CARD_SOFT}）")
    ap.add_argument("--hard", type=int, default=CARD_HARD, help=f"綠度 ≥ 這個值＝完全透明（預設 {CARD_HARD}）")
    args = ap.parse_args()

    base_path = OUT / "cards" / "card" / f"{args.baseline}.webp"
    if not base_path.exists():
        raise SystemExit(f"找不到基準牌面：{base_path}")
    target = Image.open(base_path).size
    print(f"基準 {args.baseline}：畫布 {target[0]}x{target[1]}（新牌一律填滿這個框）")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    done = 0
    for name in args.files:
        src = RAW / name
        if not src.exists():
            src = INBOX / name
        if not src.exists():
            print(f"  找不到 {name}，跳過")
            continue
        cid = src.stem[len("card_"):] if src.stem.startswith("card_") else src.stem
        keyed = key_out(Image.open(src), args.soft, args.hard, CARD_BAND)
        canvas = cover(keyed, target)
        dst = OUT / "cards" / "card" / f"{cid}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(dst, "WEBP", quality=78, method=6)
        manifest.setdefault("cards", {})[f"card/{cid}"] = dst.relative_to(OUT.parent).as_posix()
        if not (INBOX / src.name).exists():
            shutil.copy2(src, INBOX / src.name)
        print(f"牌面 card/{cid}.webp {dst.stat().st_size // 1024} KB")
        done += 1

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"共 {done} 張，manifest.json 已併入")


if __name__ == "__main__":
    main()
