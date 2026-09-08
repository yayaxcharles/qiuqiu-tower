# -*- coding: utf-8 -*-
"""
add_boss_sprite.py — 把一張新的塔主立繪（綠幕 PNG）照**既有畫布**去背進倉，不動其他 18 張。

用法：python tools/add_boss_sprite.py boss_hurt1.png [boss_hurt2.png ...]
  來源在 tools/codex_raw/，輸出到 public/assets/sprites/boss/<名>.webp，並併進 manifest.json。

為什麼不直接丟 build_art_inbox.py：那支把 boss_*.png 放進「同一張共用畫布」，畫布尺寸是
**當下收件匣裡那幾張的最大值**。第一階段的原稿早就不在收件匣，只丟三張新圖進去會算出另一個尺寸，
新圖跟舊圖在畫面上就對不齊（同一個框、不同比例，換姿勢貓會忽大忽小——正是共用畫布要防的事）。
這裡改成讀一張現成的 boss webp 當基準：畫布多大、主體底邊離畫布底幾個像素，全部照它貼。
去背門檻沿用 chroma_key.key_out 的預設，跟原本進倉的一樣。
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chroma_key import key_out  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
OUT = ROOT / "public" / "assets" / "sprites" / "boss"
MANIFEST = ROOT / "public" / "assets" / "manifest.json"
BASELINE = OUT / "idle1.webp"   # 畫布尺寸與底邊留白都照它


def main() -> None:
    names = sys.argv[1:]
    if not names:
        sys.exit("用法：python tools/add_boss_sprite.py boss_hurt1.png [...]")
    base = Image.open(BASELINE)
    cw, ch = base.size
    bottom_pad = ch - (base.getbbox() or (0, 0, cw, ch))[3]
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for raw_name in names:
        src = RAW / raw_name
        if not src.exists():
            print(f"找不到 {src}，略過")
            continue
        im = key_out(Image.open(src))
        # 比畫布還大（寬過 740 或高過 659）就等比縮到塞得進去：挨打姿勢通常橫得比較開，縮一點無妨；
        # 不縮的話貼進去會被切掉一截
        max_w, max_h = cw - 20, ch - bottom_pad - 5
        if im.width > max_w or im.height > max_h:
            k = min(max_w / im.width, max_h / im.height)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            print(f"  {raw_name} 比畫布大，等比縮到 {im.size}")
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        canvas.paste(im, ((cw - im.width) // 2, ch - bottom_pad - im.height), im)
        stem = Path(raw_name).stem
        if stem.startswith("boss_"):
            stem = stem[len("boss_"):]
        dst = OUT / f"{stem}.webp"
        canvas.save(dst, "WEBP", quality=82, method=6)
        manifest["sprites"][f"boss/{stem}"] = dst.relative_to(ROOT / "public").as_posix()
        print(f"立繪 boss/{stem}.webp {dst.stat().st_size // 1024} KB（畫布 {cw}x{ch}、底邊留 {bottom_pad}，跟 idle1 對齊）")
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print("manifest.json 已併入")


if __name__ == "__main__":
    main()
