# -*- coding: utf-8 -*-
"""
add_sprite.py — 把新的立繪（綠幕 PNG）照**既有畫布**去背進倉，不動同組其他張。

用法：python tools/add_sprite.py [--group boss|hero] [--baseline idle1] 檔名.png [...]
  來源在 tools/codex_raw/，輸出到 public/assets/sprites/<group>/<名>.webp，並併進 manifest.json。
  預設 --group boss --baseline idle1；球球的招式圖用 --group hero --baseline ninja_attack。

為什麼不直接丟 build_art_inbox.py：那支把同組的圖放進「同一張共用畫布」，畫布尺寸是
**當下收件匣裡那幾張的最大值**。原稿早就不在收件匣，只丟新圖進去會算出另一個尺寸，
新圖跟舊圖在畫面上就對不齊（同一個框、不同比例，換姿勢角色會忽大忽小——正是共用畫布要防的事）。
這裡改成讀一張現成的 webp 當基準：畫布多大、主體底邊離畫布底幾個像素，全部照它貼。
球球的立繪分兩批、畫布不一樣（待機 1005×1037、出招 640×625），所以基準要自己挑同一批的。
去背門檻沿用 chroma_key.key_out 的預設，跟原本進倉的一樣。
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chroma_key import key_out  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
MANIFEST = ROOT / "public" / "assets" / "manifest.json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="+", help="tools/codex_raw 裡的檔名，例如 boss_hurt1.png、hero_ninja_kick.png")
    ap.add_argument("--group", default="boss", choices=("boss", "hero"))
    ap.add_argument("--baseline", default=None, help="同組的一張現成 webp 檔名（不含副檔名），畫布照它；預設 boss=idle1、hero=ninja_attack")
    ap.add_argument("--refit", action="store_true",
                    help="來源改成同組現成的 webp（已去背），把主體高度縮放到跟基準圖一樣、貼回基準畫布。"
                         "球球的待機批畫布 1005×1037、出招批 640×625，同一個框裡貓會差兩成（使用者 2026-09-08：忽大忽小），用這個把站姿全部對齊")
    args = ap.parse_args()
    group = args.group
    out_dir = ROOT / "public" / "assets" / "sprites" / group
    baseline = out_dir / f"{args.baseline or ('idle1' if group == 'boss' else 'ninja_attack')}.webp"
    if not baseline.exists():
        sys.exit(f"基準圖不存在：{baseline}")
    names = args.names
    base = Image.open(baseline)
    cw, ch = base.size
    bbox_b = base.getbbox() or (0, 0, cw, ch)
    bottom_pad = ch - bbox_b[3]
    base_h = bbox_b[3] - bbox_b[1]   # 基準圖主體多高：--refit 把來源的主體縮到這個高度
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for raw_name in names:
        if args.refit:
            src = out_dir / (raw_name if raw_name.endswith(".webp") else f"{raw_name}.webp")
            if not src.exists():
                print(f"找不到 {src}，略過")
                continue
            im = Image.open(src).convert("RGBA")
            im = im.crop(im.getbbox() or (0, 0, im.width, im.height))
            k = base_h / im.height
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            raw_name = f"{group}_{src.stem}.png"   # 讓後面的命名邏輯照舊
        else:
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
        if stem.startswith(f"{group}_"):
            stem = stem[len(group) + 1:]
        dst = out_dir / f"{stem}.webp"
        canvas.save(dst, "WEBP", quality=82, method=6)
        manifest["sprites"][f"{group}/{stem}"] = dst.relative_to(ROOT / "public").as_posix()
        print(f"立繪 {group}/{stem}.webp {dst.stat().st_size // 1024} KB（畫布 {cw}x{ch}、底邊留 {bottom_pad}，跟 {baseline.stem} 對齊）")
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print("manifest.json 已併入")


if __name__ == "__main__":
    main()
