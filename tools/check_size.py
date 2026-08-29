# -*- coding: utf-8 -*-
"""check_size.py — 檢查 dist/ 有沒有超出規格 §8.5 的大小預算。跑之前先 `npm run build`。

用法：
    python tools/check_size.py          # 印出表格，超標就非零離開
    npm run size                        # 同上

離開碼：0＝在預算內、1＝有類別超標、2＝沒有 dist/（還沒建置，無從檢查）。

預算數字（2026-08-30 版）
------------------------
規格 §8.5 現行寫的是：程式 ≤150 KB、樣式 ≤30 KB、圖片 ≤5 MB、總計 ≤5.5 MB。

任務書裡曾寫成圖片 3.5 MB、總計 4 MB，那是還沒生出真的素材以前的估算值，已經作廢，**不要照那個改回去**。
這裡真正要守住的底線是「別變成 Godot 網頁版那種 15～20 MB、還要伺服器另外加特殊標頭才跑得動的東西」，
不是某個精確到小數點的數字。素材全部到齊之後要再跑一次，那次才算數。

單位一律用 1 KB = 1000 位元組、1 MB = 1000 KB，跟 Vite 建置時印的數字同一套，方便對照。
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"

# 類別 → (中文標籤, 上限位元組)；上限 None 代表不列管，只是列出來讓總計對得起來
CATEGORIES: dict[str, tuple[str, int | None]] = {
    "js": ("程式", 150_000),
    "css": ("樣式", 30_000),
    "img": ("圖片", 5_000_000),
    "other": ("其他", None),
    "total": ("總計", 5_500_000),
}

IMAGE_SUFFIXES = {".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".avif"}


def classify(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".js":
        return "js"
    if suffix == ".css":
        return "css"
    if suffix in IMAGE_SUFFIXES:
        return "img"
    return "other"


def human(n: int) -> str:
    """位元組轉成看得懂的字串。1 MB 以下用 KB，以上用 MB。"""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f} MB"
    return f"{n / 1000:.1f} KB"


def scan(dist: Path) -> tuple[dict[str, int], dict[str, int], list[tuple[int, Path]]]:
    sizes = {k: 0 for k in CATEGORIES}
    counts = {k: 0 for k in CATEGORIES}
    files: list[tuple[int, Path]] = []
    for p in dist.rglob("*"):
        if not p.is_file():
            continue
        n = p.stat().st_size
        kind = classify(p)
        sizes[kind] += n
        counts[kind] += 1
        sizes["total"] += n
        counts["total"] += 1
        files.append((n, p))
    return sizes, counts, files


def main() -> int:
    if not DIST.exists():
        print("找不到 dist/ 資料夾——還沒建置就沒東西可以量。", file=sys.stderr)
        print("請先跑：npm run build", file=sys.stderr)
        return 2

    sizes, counts, files = scan(DIST)
    if counts["total"] == 0:
        print("dist/ 是空的——建置可能失敗了，請重跑 npm run build 看有沒有錯誤訊息。", file=sys.stderr)
        return 2

    over: list[str] = []
    print(f"大小預算檢查（{DIST}）")
    print("類別  檔數        大小        上限      用量")
    for key, (label, limit) in CATEGORIES.items():
        size = sizes[key]
        if limit is None:
            print(f"{label}  {counts[key]:>4}  {human(size):>10}           —         —")
            continue
        pct = size / limit * 100
        flag = "  ← 超標" if size > limit else ""
        print(f"{label}  {counts[key]:>4}  {human(size):>10}  {human(limit):>10}  {pct:5.1f}%{flag}")
        if size > limit:
            over.append(f"{label} {human(size)} > {human(limit)}")

    if over:
        print()
        print("超過預算：" + "；".join(over), file=sys.stderr)
        print("dist/ 裡最大的幾個檔案：", file=sys.stderr)
        for n, p in sorted(files, reverse=True)[:5]:
            print(f"  {human(n):>10}  {p.relative_to(DIST).as_posix()}", file=sys.stderr)
        print(
            "怎麼瘦身：圖片超標就把 WebP 品質往下調（tools/build_assets.py、tools/chroma_key.py 裡的 quality），"
            "或把魔物、立繪的輸出尺寸降一級；程式超標就先查是不是把 src/content 的資料重複打包進去了。",
            file=sys.stderr,
        )
        return 1

    print()
    print("大小 OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
