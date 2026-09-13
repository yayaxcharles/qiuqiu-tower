# -*- coding: utf-8 -*-
"""重建劇情合參表 `tools/ref/feifei_story_ref.png`（2026-09-13）。

**為什麼要重建**：使用者實測「過關的圖她的頭髮都不對，跟其他圖不一樣」。
查下去發現不是提示詞的問題——**是參考圖本身**。舊的合參表右邊那隻菲菲
畫成雙手張開的姿勢，那個角度下**蝴蝶結完全看不到**、頭髮糊成一頂深棕色的帽、
馬尾也分不出來。12 張劇情與過關圖全部照它畫，所以有一半連結都沒有。

這就是「參考圖會被讀成『要畫這個』」（`art_rules.py` 第二個雷）的又一次：
附了圖就等於把那張圖的每一個細節都交出去，包含**它沒畫到的東西**。

**修法**：把菲菲那一格換成設定表 `feifei_ref.png` 的兩個站姿（蝴蝶結、瀏海、馬尾
三部分都清清楚楚），另外再加一顆頭部特寫。師父與球球那幾格原樣保留——
那些是別的角色的，沒有問題。

版面：
  上排＝原合參表砍掉最右邊那格（球球表情表 ＋ 師父兩個姿勢）
  下排＝菲菲兩個站姿 ＋ 一顆頭部特寫，都放大

用法：python tools/make_feifei_story_ref.py
舊檔會先改名成 `.previous-<日期>.png` 留底。
"""
import datetime
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[1]
REF = ROOT / "tools" / "ref"
OUT = REF / "feifei_story_ref.png"

# 舊合參表裡「菲菲那一格」從這個 x 開始（2000 寬的座標，量出來的）
FEIFEI_PANEL_X = 1540
# 設定表上兩隻的綠幕底色
GREEN = (0, 255, 0)


def drop_green(im: Image.Image, tol: int = 60) -> Image.Image:
    """綠幕換白底。合參表一律白底——模型讀白底比讀綠底穩（球球那張也是白的）。"""
    im = im.convert("RGB")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = px[x, y]
            if g - max(r, b) > tol:
                px[x, y] = (255, 255, 255)
    return im


def main() -> None:
    old = Image.open(OUT).convert("RGB")
    top = old.crop((0, 0, FEIFEI_PANEL_X, old.height))          # 砍掉舊的菲菲那格

    sheet = drop_green(Image.open(REF / "feifei_ref.png"))
    w, h = sheet.size
    left = sheet.crop((0, 0, w // 2, h))                        # 站姿
    right = sheet.crop((w // 2, 0, w, h))                       # 出招
    head = sheet.crop((int(w * 0.06), int(h * 0.02), int(w * 0.42), int(h * 0.52)))

    BOT_H = 460
    def fit(im: Image.Image) -> Image.Image:
        return im.resize((round(im.width * BOT_H / im.height), BOT_H), Image.LANCZOS)

    figs = [fit(left), fit(right), fit(head)]
    bot_w = sum(f.width for f in figs) + 40 * (len(figs) + 1)

    W = max(top.width, bot_w)
    H = top.height + BOT_H + 30
    out = Image.new("RGB", (W, H), (255, 255, 255))
    out.paste(top, (0, 0))
    x = 40
    for f in figs:
        out.paste(f, (x, top.height + 20))
        x += f.width + 40

    # 一條淡淡的分隔線，讓模型知道上下是兩組不同的東西
    d = ImageDraw.Draw(out)
    d.line([(0, top.height + 6), (W, top.height + 6)], fill=(200, 200, 200), width=2)

    stamp = datetime.date.today().strftime("%Y%m%d")
    OUT.rename(OUT.with_name(f"{OUT.stem}.previous-{stamp}-nobow.png"))
    out.save(OUT)
    print(f"新的合參表 {out.size} → {OUT.relative_to(ROOT)}")
    print(f"舊的留底：{OUT.stem}.previous-{stamp}-nobow.png")


if __name__ == "__main__":
    main()
