# -*- coding: utf-8 -*-
"""噹噹的劇情合參表 `tools/ref/dangdang_story_ref.png`（2026-09-17，D 批用）。

**為什麼要另外做一張**：`codex_gen.py` 的 `-i` 只吃一張圖，而他的十二張劇情幻燈片裡
同時會出現五個角色（噹噹、球球、菲菲、大俠貓平時／中魔）。只附 `dangdang_ref.png`
的話，其他四隻就是模型自己想像的——菲菲那批的教訓（`art_rules.py` 第二個雷）是
「沒附圖＝每張各長各的」，附了圖＝那張圖裡的每個細節都交出去。

版面（沿用 `make_feifei_story_ref.py` 的做法，一律白底——模型讀白底比讀綠底穩）：
  上排＝`feifei_story_ref.png` 的上半（球球表情表 ＋ 大俠貓平時 ＋ 大俠貓中魔）
  下排＝菲菲站姿一格 ＋ **噹噹兩格放最大**（他是主角，要最顯眼）

刻意**不放**菲菲的頭部特寫與出招那兩格：這張表是給劇情圖用的，她在他的故事裡是配角，
三格放大會把她推成主角（第二個雷的反面——參考圖裡誰佔得多，模型就畫誰）。

用法：python tools/make_dangdang_story_ref.py
"""
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[1]
REF = ROOT / "tools" / "ref"
OUT = REF / "dangdang_story_ref.png"

# `feifei_story_ref.png` 上下兩排的分界（`make_feifei_story_ref.py` 算出來的：H = top + 460 + 30）
FEIFEI_SHEET_TOP_H = 954 - 460 - 30

TOP_W = 1800      # 上排寬度
BOT_H = 620       # 下排高度
GAP = 40


def drop_green(im: Image.Image, tol: int = 60) -> Image.Image:
    """綠幕換白底。合參表一律白底（`make_feifei_story_ref.py` 的結論）。"""
    im = im.convert("RGB")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = px[x, y]
            if g - max(r, b) > tol:
                px[x, y] = (255, 255, 255)
    return im


def fit_h(im: Image.Image, h: int) -> Image.Image:
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def main() -> None:
    story = Image.open(REF / "feifei_story_ref.png").convert("RGB")
    top = story.crop((0, 0, story.width, FEIFEI_SHEET_TOP_H))
    top = top.resize((TOP_W, round(top.height * TOP_W / top.width)), Image.LANCZOS)

    ff = drop_green(Image.open(REF / "feifei_ref.png"))
    ff = fit_h(ff.crop((0, 0, ff.width // 2, ff.height)), BOT_H)      # 只取站姿那半
    dd = fit_h(drop_green(Image.open(REF / "dangdang_ref.png")), BOT_H)

    bot_w = ff.width + dd.width + GAP * 3
    W = max(TOP_W, bot_w)
    H = top.height + BOT_H + GAP
    out = Image.new("RGB", (W, H), (255, 255, 255))
    out.paste(top, ((W - top.width) // 2, 0))
    x = (W - (ff.width + dd.width + GAP)) // 2
    out.paste(ff, (x, top.height + GAP // 2))
    out.paste(dd, (x + ff.width + GAP, top.height + GAP // 2))

    d = ImageDraw.Draw(out)
    d.line([(0, top.height + 4), (W, top.height + 4)], fill=(200, 200, 200), width=2)
    out.save(OUT)
    print(f"劇情合參表 {out.size} → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
