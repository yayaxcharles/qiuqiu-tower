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
import re
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chroma_key import key_out  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "codex_raw"
MANIFEST = ROOT / "public" / "assets" / "manifest.json"


BOX_ASPECT = {"small": 130 / 150, "medium": 180 / 210, "large": 230 / 280}
BOX_OVERRIDE = {"armadillo_pup": 1.0}   # 跟 combat.ts 的 SPRITE_SIZE_OVERRIDE 一致
_SIZES: dict[str, str] | None = None


def box_aspect(mid: str) -> float:
    """這隻魔物在遊戲裡的立繪框長寬比（寬÷高），從 enemies.ts 的 size 讀"""
    global _SIZES
    if _SIZES is None:
        src = (ROOT / "src" / "content" / "enemies.ts").read_text(encoding="utf-8")
        _SIZES = dict(re.findall(r"\{ id: '([^']+)'[^\n]*?size: '(small|medium|large)'", src))
    if mid in BOX_OVERRIDE:
        return BOX_OVERRIDE[mid]
    if mid not in _SIZES:
        print(f"  （{mid} 在 enemies.ts 找不到 size，畫布比例照 medium；共用圖的像 lantern_twin、shadow_kitten 是正常的）")
    return BOX_ASPECT[_SIZES.get(mid, "medium")]


def report(group: str, raw_name: str, out_dir: Path, base_h: int, mid: str | None, pose: str | None) -> None:
    """量一張已進倉的圖：主體高度跟基準差幾 %、帶綠像素、半透明像素。差超過 5% 或帶綠超過 0.05% 標 ⚠"""
    import numpy as np
    if group == "monsters":
        dst = out_dir / f"{mid}_{pose}.webp"
    else:
        stem = Path(raw_name).stem
        stem = stem[len(group) + 1:] if stem.startswith(f"{group}_") else stem
        dst = out_dir / f"{stem}.webp"
    if not dst.exists():
        print(f"  {dst.name}: 還沒進倉")
        return
    im = Image.open(dst).convert("RGBA")
    a = np.asarray(im).astype(int)
    opaque = a[..., 3] > 32
    greenish = int((opaque & (a[..., 1] > a[..., 0] + 40) & (a[..., 1] > a[..., 2] + 40)).sum())
    semi = int(((a[..., 3] > 32) & (a[..., 3] < 224)).sum())
    bb = im.getbbox() or (0, 0, 1, 1)
    h = bb[3] - bb[1]
    diff = (h - base_h) / base_h * 100
    flag = " ⚠高度" if abs(diff) > 5 else ""
    flag += " ⚠帶綠" if greenish > max(20, opaque.sum() * 0.0005) else ""
    print(f"  {dst.name:28s} 主體高 {h:4d}（基準 {base_h}，{diff:+.1f}%） 帶綠 {greenish:4d} 半透明 {semi:5d}{flag}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="+", help="tools/codex_raw 裡的檔名，例如 boss_hurt1.png、hero_ninja_kick.png")
    ap.add_argument("--group", default="boss", choices=("boss", "hero", "monsters"),
                    help="monsters＝每隻照自己的 <id>_idle.webp 貼，輸出 public/assets/monsters/<id>_<pose>.webp")
    ap.add_argument("--check", action="store_true", help="只量不寫：每張在遊戲框裡畫多高、帶綠與半透明像素，對照基準")
    ap.add_argument("--baseline", default=None, help="同組的一張現成 webp 檔名（不含副檔名），畫布照它；預設 boss=idle1、hero=ninja_attack")
    ap.add_argument("--refit", action="store_true",
                    help="來源改成同組現成的 webp（已去背），把主體高度縮放到跟基準圖一樣、貼回基準畫布。"
                         "球球的待機批畫布 1005×1037、出招批 640×625，同一個框裡貓會差兩成（使用者 2026-09-08：忽大忽小），用這個把站姿全部對齊")
    args = ap.parse_args()
    group = args.group
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for raw_name in args.names:
        # 每張各自決定基準：boss／hero 用 --baseline，monsters 用該怪自己的 idle
        if group == "monsters":
            stem0 = Path(raw_name).stem
            m = re.match(r"monster_(.+)_(idle|attack|hurt|block)$", stem0)
            if not m:
                print(f"檔名要是 monster_<id>_<idle|attack|hurt|block>.png：{raw_name}，略過")
                continue
            mid, pose = m.group(1), m.group(2)
            out_dir = ROOT / "public" / "assets" / "monsters"
            baseline = out_dir / f"{mid}_idle.webp"
        else:
            out_dir = ROOT / "public" / "assets" / "sprites" / group
            baseline = out_dir / f"{args.baseline or ('idle1' if group == 'boss' else 'ninja_attack')}.webp"
            mid = pose = None
        if not baseline.exists():
            print(f"基準圖不存在：{baseline}，略過 {raw_name}")
            continue
        base = Image.open(baseline)
        cw, ch = base.size
        if group == "monsters":
            # 待機畫布多半貼著待機姿勢裁得很窄，挨打姿勢張手後傾比較寬，塞進窄框只能整隻縮小（老鼠 320→204，
            # 稻草人 560→315）。畫布放寬到遊戲框的長寬比（高度不動）：遊戲用 object-fit: contain 把圖貼進固定框，
            # 寬到框的比例為止都不會讓畫出來的高度變小，超過才會。框的尺寸見 combat.css 的 .unit.size-*
            cw = max(cw, round(ch * box_aspect(mid)))
        bbox_b = base.getbbox() or (0, 0, cw, ch)
        bottom_pad = ch - bbox_b[3]
        base_h = bbox_b[3] - bbox_b[1]   # 基準圖主體多高：--refit 把來源的主體縮到這個高度
        if args.check:
            report(group, raw_name, out_dir, base_h, mid, pose)
            continue
        if args.refit:
            src = out_dir / (f"{mid}_{pose}.webp" if group == "monsters" else (raw_name if raw_name.endswith(".webp") else f"{raw_name}.webp"))
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
        # 塔主／球球的大畫布留 20 像素邊；魔物畫布只有兩三百寬，20 像素會白白把圖壓矮 4～8%（稽核 2026-09-09 低-1），
        # 而且待機圖本來就貼邊、遊戲用 object-fit: contain 不會裁，魔物只留 2
        if group == "monsters":
            max_w, max_h = cw - 2, ch - bottom_pad
        else:
            max_w, max_h = cw - 20, ch - bottom_pad - 5
        if im.width > max_w or im.height > max_h:
            k = min(max_w / im.width, max_h / im.height)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            print(f"  {raw_name} 比畫布大，等比縮到 {im.size}")
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        canvas.paste(im, ((cw - im.width) // 2, ch - bottom_pad - im.height), im)
        if group == "monsters":
            dst = out_dir / f"{mid}_{pose}.webp"
            canvas.save(dst, "WEBP", quality=72, method=6)   # 跟 build_art_inbox 的魔物品質一致
            manifest.setdefault("monsters", {}).setdefault(f"codex/monster_{mid}", {})[pose] = dst.relative_to(ROOT / "public").as_posix()
            print(f"魔物 {mid}/{pose}.webp {dst.stat().st_size // 1024} KB（畫布 {cw}x{ch}，跟 {mid}_idle 對齊）")
            continue
        stem = Path(raw_name).stem
        if stem.startswith(f"{group}_"):
            stem = stem[len(group) + 1:]
        dst = out_dir / f"{stem}.webp"
        canvas.save(dst, "WEBP", quality=82, method=6)
        manifest["sprites"][f"{group}/{stem}"] = dst.relative_to(ROOT / "public").as_posix()
        print(f"立繪 {group}/{stem}.webp {dst.stat().st_size // 1024} KB（畫布 {cw}x{ch}、底邊留 {bottom_pad}，跟 {baseline.stem} 對齊）")
    if args.check:
        return
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print("manifest.json 已併入")


if __name__ == "__main__":
    main()
