#!/usr/bin/env python3
"""
把橫向捲軸（qiuqiu-side）的魔物逐格動作，裁成爪破魔塔用的圖集（2026-09-28：先試做兩隻魔王，使用者看過說好，接著全接）。

來源（唯讀）：F:/ClaudeWork/qiuqiu-side/public/sprites/monsters/<id>/<動作>/NN.webp ＋ anims.json
  每格的 ax/ay 是腳底中線在那張圖裡的位置，圖都朝左（_meta.facing＝left，跟爪破魔塔的魔物同方向，不用翻）。

輸出：
  public/assets/motion/side/<來源>-<動作>.webp   一個動作一張圖集（打到那一場才下載，見 enemy-motion.ts）
  src/ui/side-motion/<kind>.json                 每一套一個小檔：格子位置／腳底／每格秒數（動態載入，不進開場程式）

一套只收用得到的動作。節奏規則（使用者 2026-09-28）：
  - 出招片段 ≤ 1.35 秒（太長就加快）
  - 一般魔物倒下 ≤ 0.85 秒（跟原本 0.8 秒溶解一起跑完，不拉長節奏）
  - 大魔物、塔主倒下可以演完整段爆炸（≤ 3 秒），打完等它演完才換場（combat.ts 的 LONG_DEATH）

用法：python tools/pack_side_motion.py [--src ...] [--only kind1,kind2]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "assets" / "motion" / "side"
OUT_DATA = ROOT / "src" / "ui" / "side-motion"
TOWER_ART = ROOT / "public" / "assets" / "monsters"

# 圖集比畫面大多少倍（retina 螢幕才不糊）；來源本身不夠大就不放大（來源多大就多大）
OVERSAMPLE = 1.2
# 塔主、大魔物的長倒下：火花、煙塵飛很開，圖集最大（鐵爪那張 4037×2624、解開約 40 MB），
# 而且一場只演一次、邊炸邊散，縮到 0.9 倍（稽核 2026-09-28 低-2）
OVERSAMPLE_LONG_DEATH = 0.9
QUALITY = 80
MAX_W = 4096
SRC_FPS = 24.0
BOX = {"small": (130, 150), "medium": (180, 210), "large": (230, 280)}

ATTACK_MAX_S = 1.35
DEATH_SHORT_S = 0.85
DEATH_LONG_MAX_S = 3.0


def idle(src, first=0, last=None, speed=0.75):
    return {"action": "idle", "src": src, "first": first, "last": last, "speed": speed, "loop": True}


def attack(src, first, last):
    return {"action": "attack", "src": src, "first": first, "last": last, "max_s": ATTACK_MAX_S}


def death(src, first, last, long=False):
    return {"action": "knockdown", "src": src, "first": first, "last": last, "long": long}


"""
display＝來源 1 像素在爪破魔塔戰場上畫成幾像素，**照頭的大小對舊立繪**（使用者鐵則：比頭不比外框）。
先照「整隻高度」自動算，再逐隻把舊圖與新圖並排看頭，差太多的手調（註明原因）。
lift＝腳底往上抬幾像素：舊立繪圖底有透明邊，照舊對齊；沒寫就照舊圖自動算。
size＝爪破魔塔那隻的框（small／medium／large），算 lift 用。
"""
KINDS: dict[str, dict] = {
    # ---- 2026-09-28 試做（使用者看過說好），數字不動 ----
    "iron_claw": {"src": "iron_claw", "display": 0.69, "lift": 2.7, "size": "large", "long": True,
                  "clips": [idle("walk"), attack("swipe", 20, 64)]},
    "iron_claw_p2": {"src": "iron_claw", "display": 0.63, "lift": 1.6, "size": "large", "long": True,
                     "clips": [idle("walk_p2"), attack("laser_p2", 12, 66), death("down_p2", 0, 62, long=True)]},
    "roomba_king": {"src": "roomba_king", "display": 0.57, "lift": 2.1, "size": "large", "long": True,
                    # 倒下第 0～5 格是橫向捲軸裡玩家的子彈飛進來，拿掉
                    "clips": [idle("drive", speed=1.0), attack("ram", 14, 58), death("down", 6, 70, long=True)]},

    # ---- 塔主（有第二階段；倒下只有第二階段的片段） ----
    # 第一階段那一套**不帶倒下**：一刀從第一階段打死（很少見）就照舊靜態倒下。
    # 原本借第二階段的爆炸，等於第一階段就要先載那張最大的圖集（稽核 2026-09-28 低-2）
    # 蛙大名：頭照舊圖比，第一階段 0.667 頭偏小 → 0.72
    "frog_daimyo": {"src": "frog_daimyo", "display": 0.72, "size": "large", "long": True,
                    "clips": [idle("walk"), attack("tongue", 2, 52)]},
    "frog_daimyo_p2": {"src": "frog_daimyo", "display": 0.694, "size": "large", "long": True, "art": "frog_daimyo_p2",
                       "clips": [idle("walk_p2"), attack("tongue_p2", 0, 56), death("down_p2", 0, 72, long=True)]},
    "orange_king": {"src": "orange_king", "display": 0.678, "size": "large", "long": True,
                    "clips": [idle("walk"), attack("throw", 8, 50)]},
    "orange_king_p2": {"src": "orange_king", "display": 0.678, "size": "large", "long": True, "art": "orange_king_p2",
                       "clips": [idle("walk_p2"), attack("jump_p2", 28, 72), death("down_p2", 2, 74, long=True)]},
    "tanuki_lord": {"src": "tanuki_lord", "display": 0.695, "size": "large", "long": True,
                    "clips": [idle("walk"), attack("leaf", 12, 46)]},
    # 倒下第 0 格是子彈飛進來的白線，從第 3 格開始
    "tanuki_lord_p2": {"src": "tanuki_lord", "display": 0.675, "size": "large", "long": True, "art": "tanuki_lord_p2",
                       "clips": [idle("walk_p2"), attack("stomp_p2", 4, 44), death("down_p2", 3, 75, long=True)]},

    # ---- 大魔物（倒下可以演完整段） ----
    "drum_tanuki": {"src": "drum_tanuki", "display": 0.62, "size": "medium", "long": True,
                    "clips": [idle("walk"), attack("attack", 0, 44), death("down", 0, 72, long=True)]},
    "guardian_statue": {"src": "guardian_statue", "display": 0.87, "size": "large", "long": True,
                        "clips": [idle("idle", speed=0.5), attack("attack", 10, 50), death("down", 0, 72, long=True)]},
    "iron_arhat": {"src": "iron_arhat", "display": 0.99, "size": "large", "long": True,
                   "clips": [idle("walk"), attack("attack", 22, 60), death("down", 0, 72, long=True)]},
    # 面具舞者：頭偏小 0.833 → 0.9
    "mask_dancer": {"src": "mask_dancer", "display": 0.9, "size": "medium", "long": True,
                    "clips": [idle("walk"), attack("attack", 8, 48), death("down", 0, 72, long=True)]},

    # ---- 一般魔物（倒下 ≤ 0.85 秒） ----
    # 使用者 2026-09-28 看過對照圖後退回舊圖的七隻（不接）：白狐巫女（畫風差太多）、紙鶴式神、蝌蚪兵、山豬頭目（輪廓差太多）、
    # 唐傘小僧、小掃把、狸小弟（沒有出招片段，使用者：不要新動作配舊出招圖）
    "armor_ghost": {"src": "armor_ghost", "display": 0.83, "size": "medium",
                    "clips": [idle("walk"), attack("attack", 24, 60), death("down", 0, 44)]},
    "kappa": {"src": "kappa", "display": 0.976, "size": "medium",
              # 倒下第 0～2 格有子彈飛進來的殘影，從第 3 格開始
              "clips": [idle("walk"), attack("attack", 2, 40), death("down", 3, 49)]},
    "lantern_ghost": {"src": "lantern_ghost", "display": 1.024, "size": "medium",
                      "clips": [idle("float"), attack("attack", 4, 44), death("down", 0, 54)]},
    "orange_bandit": {"src": "orange_bandit", "display": 0.964, "size": "medium",
                      "clips": [idle("idle", speed=0.5), attack("attack", 18, 56), death("down", 0, 48)]},
    "plated_beetle": {"src": "plated_beetle", "display": 1.2, "size": "medium",
                      "clips": [idle("crawl"), attack("attack", 20, 56), death("down", 0, 30)]},
    "tengu": {"src": "tengu", "display": 0.836, "size": "medium",
              "clips": [idle("fly"), attack("attack", 8, 46), death("down", 0, 54)]},
    "vacuum": {"src": "vacuum", "display": 1.2, "size": "medium",
               "clips": [idle("glide"), attack("attack", 22, 60), death("down", 0, 44)]},
    # 怨靈武者：出招前 10 格是從煙裡現身，從第 10 格開始
    "wraith_samurai": {"src": "wraith_samurai", "display": 0.774, "size": "medium",
                       "clips": [idle("walk"), attack("attack", 10, 42), death("down", 0, 44)]},
}


def auto_lift(kind: str, spec: dict) -> float:
    """舊立繪在框裡，身體最底下離框底幾像素（戰場座標）"""
    art = spec.get("art", spec["src"])
    im = Image.open(TOWER_ART / f"{art}_idle.webp").convert("RGBA")
    bw, bh = BOX[spec["size"]]
    k = min(bw / im.width, bh / im.height)
    bottom = im.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()[3]
    return round((im.height - bottom) * k, 2)


def texture_name(src_id: str, src_action: str) -> str:
    return f"assets/motion/side/{src_id}-{src_action}.webp"


def pick(n: int, clip: dict) -> tuple[list[int], float]:
    """挑哪幾格、每格幾秒"""
    first = clip["first"]
    last = n - 1 if clip["last"] is None else min(n - 1, clip["last"])
    count = last - first + 1
    if clip["action"] == "idle":
        step = 2 if count >= 16 else 1
        return list(range(first, last + 1, step)), round(step / SRC_FPS / clip["speed"], 4)
    if clip["action"] == "attack":
        step = 2
        idx = list(range(first, last + 1, step))
        natural = count / SRC_FPS
        speed = max(1.0, natural / clip["max_s"])
        return idx, round(step / SRC_FPS / speed, 4)
    # 倒下
    if clip["long"]:
        step = 2
        idx = list(range(first, last + 1, step))
        dur = min(step / SRC_FPS, DEATH_LONG_MAX_S / len(idx))
        return idx, round(dur, 4)
    step = max(1, round(count / 12))
    idx = list(range(first, last + 1, step))
    if idx[-1] != last:
        idx.append(last)
    return idx, round(DEATH_SHORT_S / len(idx), 4)


def pack_action(src_root: Path, src_id: str, action: str, idx: list[int], pack: float):
    meta = json.loads((src_root / src_id / "anims.json").read_text(encoding="utf-8"))[action]
    frames = [meta["frames"][i] for i in idx]
    cells = []
    for fr in frames:
        im = Image.open(src_root / src_id / action / fr["f"]).convert("RGBA")
        w, h = max(1, round(im.width * pack)), max(1, round(im.height * pack))
        if (w, h) != im.size:
            im = im.resize((w, h), Image.LANCZOS)
        box = im.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox() or (0, 0, 1, 1)
        crop = im.crop(box)
        cells.append((crop, fr["ax"] * pack - box[0], fr["ay"] * pack - box[1]))
    x = y = row_h = 0
    places = []
    width = 0
    for crop, _, _ in cells:
        if x + crop.width > MAX_W:
            x, y, row_h = 0, y + row_h + 2, 0
        places.append((x, y))
        x += crop.width + 2
        row_h = max(row_h, crop.height)
        width = max(width, x)
    sheet = Image.new("RGBA", (width, y + row_h), (0, 0, 0, 0))
    out = []
    for (crop, px, py), (cx, cy) in zip(cells, places):
        sheet.paste(crop, (cx, cy))
        out.append({"rect": [cx, cy, crop.width, crop.height], "pivot": [round(px, 2), round(py, 2)]})
    return sheet, out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="F:/ClaudeWork/qiuqiu-side/public/sprites/monsters")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    src_root = Path(args.src)
    only = set(filter(None, args.only.split(",")))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    written: dict[str, int] = {}
    report = {}
    for kind, spec in KINDS.items():
        if only and kind not in only:
            continue
        lift = spec.get("lift")
        if lift is None:
            lift = auto_lift(kind, spec)
        anims = json.loads((src_root / spec["src"] / "anims.json").read_text(encoding="utf-8"))
        actions = {}
        textures = set()
        for clip in spec["clips"]:
            name = clip["action"]
            display = spec.get(f"{name}_display", spec["display"])
            # 圖集比畫面大 OVERSAMPLE 倍，但不超過來源
            over = OVERSAMPLE_LONG_DEATH if clip.get("long") else OVERSAMPLE
            pack = min(1.0, display * over)
            n = len(anims[clip["src"]]["frames"])
            idx, duration = pick(n, clip)
            tex = texture_name(spec["src"], clip["src"])
            sheet, frames = pack_action(src_root, spec["src"], clip["src"], idx, pack)
            path = ROOT / "public" / tex
            if tex not in written:
                sheet.save(path, "WEBP", quality=QUALITY, method=6)
                written[tex] = path.stat().st_size
            textures.add(tex)
            actions[name] = {
                "texture": tex, "mirror": False, "scale": round(display / pack, 6), "loop": clip["loop"] if "loop" in clip else False,
                "frames": [{**f, "pivot": [f["pivot"][0], round(f["pivot"][1] + lift * pack / display, 2)], "duration": duration} for f in frames],
            }
            report.setdefault(kind, {})[name] = {"src": clip["src"], "frames": len(frames), "seconds": round(duration * len(frames), 2),
                                                "atlas": list(sheet.size)}
        data = {"native_height": 1, "default_height": 1, "mirror": False, "actions": actions}
        (OUT_DATA / f"{kind}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        report[kind]["_lift"] = lift
        report[kind]["_textures"] = sorted(textures)
    (ROOT / "tools" / "pack_side_motion.report.json").write_text(json.dumps({"kinds": report, "bytes": written}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"合計 {sum(written.values()) / 1024 / 1024:.2f} MB，{len(written)} 張圖集")


if __name__ == "__main__":
    main()
