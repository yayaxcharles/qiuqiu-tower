# -*- coding: utf-8 -*-
"""做一張球球的角色設定表，當生圖的參考圖用。

**為什麼需要**：之前的提示詞只用文字描述球球（「灰虎斑、深藍頭帶、瞇瞇眼…」），
生圖每次都自己想像一隻貓，所以七十八張牌上的球球長相全不一樣——
使用者的原話是「主角的長相問題，變形不統一了，姿勢動作倒是沒問題」。

`codex exec` 有 `-i <FILE>` 可以附參考圖。附上這張設定表，長相就鎖得住。

放三格：正面站姿（臉最清楚）、出招（動起來的比例）、臉部特寫（五官與頭帶的細節）。
白底不是綠幕——這張是給生圖看的參考，不是要去背的素材。

跑法：python tools/make_hero_ref.py
輸出：tools/ref/球球設定表.png
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tools/ref/球球設定表.png"

# 挑這三個姿勢：站姿看整體比例、出招看動態、特寫看臉
POSES = ["hero/idle", "hero/ninja_attack"]


def main() -> None:
    manifest = json.loads((ROOT / "public/assets/manifest.json").read_text(encoding="utf-8"))
    imgs = [Image.open(ROOT / "public" / manifest["sprites"][k]).convert("RGBA") for k in POSES]

    cell = 560
    pad = 24
    sheet = Image.new("RGBA", (cell * 3 + pad * 4, cell + pad * 2), (255, 255, 255, 255))

    for i, im in enumerate(imgs):
        c = im.crop(im.getbbox() or (0, 0, im.width, im.height))
        c.thumbnail((cell, cell), Image.LANCZOS)
        sheet.paste(c, (pad + i * (cell + pad) + (cell - c.width) // 2,
                        pad + (cell - c.height) // 2), c)

    # 第三格是臉部特寫：從站姿裁上半段再放大，五官與頭帶才看得清楚
    face = imgs[0].crop(imgs[0].getbbox() or (0, 0, imgs[0].width, imgs[0].height))
    fw, fh = face.size
    # 用整個寬度裁上半段，不要左右各切 12%——那樣會把臉的一邊切掉
    face = face.crop((0, 0, fw, int(fh * 0.45)))
    face.thumbnail((cell, cell), Image.LANCZOS)
    sheet.paste(face, (pad + 2 * (cell + pad) + (cell - face.width) // 2,
                       pad + (cell - face.height) // 2), face)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(OUT, quality=95)
    print(f"{OUT}　{sheet.size}　{OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
