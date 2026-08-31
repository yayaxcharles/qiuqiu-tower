# -*- coding: utf-8 -*-
"""做一張球球的角色設定表，當生圖的參考圖用（`codex exec -i`）。

**為什麼需要**：之前的提示詞只用文字描述球球（「灰虎斑、深藍頭帶、瞇瞇眼…」），
生圖每次都自己想像一隻貓，所以七十八張牌上的主角長相全不一樣——
使用者的原話是「主角的長相問題，變形不統一了，姿勢動作倒是沒問題」。

**範本用 LINE 貼圖原圖，不用遊戲裡的立繪。** 那 40 張貼圖是球球的正本：
長相百分之百一致，而且**忍術那一整組牌名根本就是從貼圖來的**
（參上、淡定、我在這、千里眼、順風耳、交出來、出大事了、中計了、失手了…）。
遊戲裡的舊牌面反而有一半臉是跑掉的（威嚇那張是綠眼睛的寫實長毛貓），
放進參考圖等於教生圖繼續不一致，所以不放。

貼圖上面有標題文字，會裁掉——留著的話生圖會跟著把字畫進去。
貼圖來源資料夾唯讀，這裡只讀不寫。

跑法：python tools/make_hero_ref.py
輸出：tools/ref/球球設定表.png
"""
import json
import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tools/ref/球球設定表.png"
STICKERS = Path(os.environ.get("USERPROFILE", "")) / (
    r"Dropbox\08_軟體工具與遊戲\LINE貼圖\已上架\忍者貓貓\20260801_彈1\RGBA原圖")

# 挑臉清楚、姿勢有變化的：正面、側面、坐姿、動態、各種表情都要有，
# 生圖才知道這隻貓在不同角度與情緒下該長什麼樣。
PICKS = ["01", "02", "09", "11", "12", "16", "22", "23", "29", "32", "33", "40"]

# 貼圖上面約 22% 是標題文字。裁 26% 保險一點，寧可多切一點空白
CAPTION = 0.26


def main() -> None:
    if not STICKERS.is_dir():
        raise SystemExit(f"找不到貼圖原圖資料夾：{STICKERS}")

    tiles = []
    for name in PICKS:
        f = STICKERS / f"{name}.png"
        if not f.exists():
            print(f"  跳過（沒這張）：{f.name}")
            continue
        im = Image.open(f).convert("RGBA")
        im = im.crop((0, int(im.height * CAPTION), im.width, im.height))
        box = im.getbbox()
        tiles.append(im.crop(box) if box else im)

    # 貼圖幾乎都只戴頭帶沒穿忍者服，但遊戲裡的球球是穿整套的。
    # 補兩張遊戲立繪進來，衣服才有依據——體型跟臉照貼圖，衣服照立繪。
    manifest = json.loads((ROOT / "public/assets/manifest.json").read_text(encoding="utf-8"))
    for key in ("hero/ninja", "hero/ninja_attack"):
        rel = manifest["sprites"].get(key)
        if rel:
            im = Image.open(ROOT / "public" / rel).convert("RGBA")
            box = im.getbbox()
            tiles.append(im.crop(box) if box else im)

    cell, pad, cols = 420, 18, 4
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell + pad * (cols + 1),
                               rows * cell + pad * (rows + 1)), (255, 255, 255, 255))
    for i, im in enumerate(tiles):
        im.thumbnail((cell, cell), Image.LANCZOS)
        x = pad + (i % cols) * (cell + pad) + (cell - im.width) // 2
        y = pad + (i // cols) * (cell + pad) + (cell - im.height) // 2
        sheet.paste(im, (x, y), im)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(OUT, quality=95)
    print(f"{OUT}　{sheet.size}　{OUT.stat().st_size // 1024} KB　（{len(tiles)} 張貼圖）")


if __name__ == "__main__":
    main()
