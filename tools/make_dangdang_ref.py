# -*- coding: utf-8 -*-
"""做噹噹的生圖參考圖（`codex exec -i` 用）。

輸出：`tools/ref/dangdang_ref.png`（兩格並排，都朝右，綠幕底）。

**為什麼要自己拼一張，不直接餵資料夾裡那張三視圖**
------------------------------------------------
1. `art_rules.py` 第四個雷：**參考圖會被讀走的不只是長相，還有角度。**
   三視圖的左邊那格朝左、中間那格朝正面，菲菲就是被這種圖教成正面站姿，
   提示詞寫兩次 "FACING RIGHT" 都輸給參考圖。所以這裡**只收朝右的那兩格**。
2. 概念稿的底是淺米白，生圖會連背景一起抄。產線要的是純綠幕（去背用），
   所以底換成 #00FF00：從四邊做洪水填充（背景跟角色之間有很粗的黑外框，不會漏進去），
   順手把腳下那團接地陰影一起吃掉——提示詞本來就禁止畫影子。

來源（都是使用者已經認可的稿）：
  左格＝`01_角色與角度/角色提案_噹噹_正面與左右側面_2026-09-16.png` 最右邊那格（朝右側面全身）
  右格＝`02_戰鬥動作_側面修正版/01_攻擊.png`（朝右出拳，兩隻銅護臂都看得到）

跑法：python tools/make_dangdang_ref.py
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DESIGN = ROOT / "docs" / "噹噹_角色設計"
OUT = ROOT / "tools" / "ref" / "dangdang_ref.png"

GREEN = (0, 255, 0)
STEP = 26         # 跟「隔壁那個已經算背景的像素」差多少以內就一起算背景
LIGHT = 150       # 最暗的一個通道要亮過這個值。角色四周都有很粗的黑外框（三個通道都 <80），
                  # 這一條就是圍牆：洪水爬不過黑線，所以不會滲進白手套或米白滾邊


def key_to_green(im: Image.Image) -> Image.Image:
    """從四邊洪水填充，把跟邊界相連的淺色背景（含接地陰影）換成純綠。

    比的是**隔壁像素**不是起點像素：腳下那團接地陰影是一路漸層下去的
    （米白 253,250,237 → 影子 225,214,202），拿起點當基準會在漸層中途停住、
    在腳邊留一圈米白半圓。生圖會把那圈當成「要畫影子」照抄，而提示詞明明禁止影子。
    """
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    h, w, _ = a.shape
    done = np.zeros((h, w), dtype=bool)
    fill = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def push(y: int, x: int) -> None:
        if not done[y, x]:
            done[y, x] = True
            if a[y, x].min() >= LIGHT:
                fill[y, x] = True
                q.append((y, x))

    for x in range(w):
        push(0, x)
        push(h - 1, x)
    for y in range(h):
        push(y, 0)
        push(y, w - 1)
    while q:
        y, x = q.popleft()
        here = a[y, x]
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not done[ny, nx]:
                done[ny, nx] = True
                there = a[ny, nx]
                if there.min() >= LIGHT and int(np.abs(there - here).sum()) <= STEP:
                    fill[ny, nx] = True
                    q.append((ny, nx))
    out = a.copy()
    out[fill] = GREEN
    return Image.fromarray(out.astype(np.uint8), "RGB")


def tight(im: Image.Image, pad: int = 12) -> Image.Image:
    """裁到角色外框（綠底之外的部分），四周留一點邊。"""
    a = np.asarray(im).astype(int)
    keep = ~((a[..., 1] > 200) & (a[..., 0] < 80) & (a[..., 2] < 80))
    ys, xs = np.where(keep)
    y0, y1 = max(0, ys.min() - pad), min(im.height, ys.max() + 1 + pad)
    x0, x1 = max(0, xs.min() - pad), min(im.width, xs.max() + 1 + pad)
    return im.crop((x0, y0, x1, y1))


def main() -> None:
    three = Image.open(DESIGN / "01_角色與角度" / "角色提案_噹噹_正面與左右側面_2026-09-16.png")
    # 三格的 x 區段是量出來的（(61,483) 朝左、(517,1012) 正面、(1049,1468) 朝右）。
    # **只取最右邊那格**，朝左與正面那兩格絕對不能進參考圖（第四個雷）。
    side_right = three.crop((1030, 60, 1500, 1000))
    attack = Image.open(DESIGN / "02_戰鬥動作_側面修正版" / "01_攻擊.png")

    tiles = [tight(key_to_green(side_right)), tight(key_to_green(attack))]

    cell_h = 860
    scaled = []
    for im in tiles:
        k = cell_h / im.height
        scaled.append(im.resize((max(1, round(im.width * k)), cell_h), Image.LANCZOS))
    pad = 24
    w = sum(im.width for im in scaled) + pad * (len(scaled) + 1)
    sheet = Image.new("RGB", (w, cell_h + pad * 2), GREEN)
    x = pad
    for im in scaled:
        sheet.paste(im, (x, pad))
        x += im.width + pad
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)
    sys.stdout.write(f"{OUT}　{sheet.size}　{OUT.stat().st_size // 1024} KB\n")


if __name__ == "__main__":
    main()
