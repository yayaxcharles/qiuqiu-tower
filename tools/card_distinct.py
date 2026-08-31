# -*- coding: utf-8 -*-
"""量牌面「認不認得出來」。

牌組構築遊戲要在半秒內掃過整手牌。2026-08-31 量到的問題：78 張全是同一隻貓、
同一套深藍忍者服、白底、置中，各張主色的標準差只有 R15 G13 B13——
整副牌顏色一模一樣，每張都得讀字才知道是什麼。

這支腳本把那件事變成數字，改完可以直接比。三個指標：
  1. 主色標準差：各張平均色彩的離散程度。**越大越好**，代表顏色分得開。
  2. 最近鄰距離：每張跟最像的三張的平均差距。**越大越好**。
  3. 最像的幾對：直接點名還在撞的。

用法：python tools/card_distinct.py [--sheet]
  --sheet 另外輸出一張 78 格的一覽表到 tools/out/screens/qa-allcards.png
"""
import argparse
import itertools
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def load() -> dict[str, Path]:
    m = json.loads((ROOT / "public/assets/manifest.json").read_text(encoding="utf-8"))
    return {k.replace("card/", ""): ROOT / "public" / v for k, v in sorted(m["cards"].items())}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", action="store_true")
    args = ap.parse_args()
    cards = load()

    # 縮到 16x16 再比：比的是「一眼掃過去的印象」，不是細節。
    # 乘上透明度＝把透明的地方算成黑，不然主體外的空白會把差距稀釋掉。
    sig, mean_rgb = {}, {}
    for cid, p in cards.items():
        im = Image.open(p).convert("RGBA")
        a = np.asarray(im).astype(float)
        vis = a[:, :, 3] > 60
        if vis.sum():
            mean_rgb[cid] = a[:, :, :3][vis].mean(axis=0)
        s = np.asarray(im.resize((16, 16), Image.LANCZOS)).astype(float)
        al = s[:, :, 3] / 255
        sig[cid] = np.concatenate([(s[:, :, i] * al).ravel() for i in range(3)])

    ks = list(sig)
    M = np.array([sig[k] for k in ks])
    D = np.abs(M[:, None, :] - M[None, :, :]).mean(axis=2)
    np.fill_diagonal(D, 1e9)
    near = np.sort(D, axis=1)[:, :3].mean(axis=1)

    h = np.array(list(mean_rgb.values()))
    print(f"牌面共 {len(ks)} 張")
    print("主色標準差（越大越好）：R%.0f G%.0f B%.0f" % tuple(h.std(axis=0)))
    print(f"最近鄰距離：平均 {near.mean():.1f}、最差 {near.min():.1f}（越大越好）")

    pairs = sorted((D[i, j], ks[i], ks[j]) for i, j in itertools.combinations(range(len(ks)), 2))
    print("\n還在撞的前八對：")
    for d, x, y in pairs[:8]:
        print(f"  {d:5.1f}  {x} ／ {y}")

    print("\n最容易認錯的前八張：")
    for i in np.argsort(near)[:8]:
        print(f"  {near[i]:5.1f}  {ks[i]}")

    if args.sheet:
        cols, cw, ch = 13, 92, 74
        rows = (len(ks) + cols - 1) // cols
        out = Image.new("RGB", (cols * cw, rows * ch), (246, 239, 227))
        for i, cid in enumerate(ks):
            im = Image.open(cards[cid]).convert("RGBA")
            im.thumbnail((cw - 6, ch - 6), Image.LANCZOS)
            cell = Image.new("RGBA", (cw, ch), (255, 255, 255, 255))
            cell.paste(im, ((cw - im.width) // 2, (ch - im.height) // 2), im)
            out.paste(cell.convert("RGB"), ((i % cols) * cw, (i // cols) * ch))
        dst = ROOT / "tools/out/screens/qa-allcards.png"
        dst.parent.mkdir(parents=True, exist_ok=True)
        out.save(dst)
        print(f"\n一覽表 → {dst}")


if __name__ == "__main__":
    main()
