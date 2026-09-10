# -*- coding: utf-8 -*-
"""
build_down_queue.py — 建「大魔物與塔主的倒地圖」工單（不生圖，只寫 JSON）。

用法：python tools/build_down_queue.py
  產出 tools/codex_jobs/monster_down.json，然後：
    python tools/codex_gen.py --max-wait-hours 40 tools/codex_jobs/monster_down.json

使用者 2026-09-11：「給大魔物與關主各一張倒地圖（趴著、眼睛變叉）很棒 做。」

**為什麼只給大魔物與塔主**：一般魔物一場打掉五六隻，每一隻都演一次倒地會變成過場稅
（使用者的鐵則：拉長節奏的動畫一律不做）。大魔物與塔主一局只遇得到幾隻，
那一下「打贏了」的實感是換得起的。16 隻大魔物＋10 隻塔主＝26 張，
其中只有 10 隻在第一關遇得到、其餘 16 張走分關載入。

規約完全沿用 `build_block_queue.py`（那批 45 張人眼驗過）：
- 每條工單自帶參考圖，優先用該怪的待機原稿 `tools/codex_raw/monster_<id>_idle.png`，
  沒原稿的把遊戲裡的待機圖鋪白底存到 `tools/ref/monster_refs/`。
  **角色不附參考圖每張長相都會不一樣**，這是這個專案踩最多次的坑。
- 提示詞裡不提「綠色」、不要半透明（去背後會整張帶綠）。
- 橫躺型魔物（黃瓜、大黃瓜）要交代「保持跟參考圖一樣的朝向與長寬比例」，
  不然模型會把牠立起來變短——挨打那批踩過。

倒地圖跟挨打圖要**一眼分得出來**：挨打是還站著、在痛；倒地是已經趴平、不會再站起來。
所以這裡把「趴平」「四肢攤開」「眼睛變叉」寫死，並明講不要痛苦的表情。
"""
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
JOBS = ROOT / "tools" / "codex_jobs"
RAW = ROOT / "tools" / "codex_raw"
REFDIR = ROOT / "tools" / "ref" / "monster_refs"

DOWN_POSE = (
    "\n\nPose: DEFEATED and lying flat on the ground - the fight is over and it has gone down. "
    "Its body is sprawled out flat along the bottom of the picture, belly or side down, limbs "
    "(or whatever it has instead) flopped loosely out to the sides, head resting on the ground. "
    "Both eyes are drawn as two simple X shapes - two crossed lines each, the classic cartoon "
    "knocked-out eyes - and the mouth hangs open in a small slack circle or a limp wavy line. "
    "It is completely limp: nothing is tensed, nothing is braced, nothing is held up. "
    "This is comic defeat, not suffering: no pain lines, no tears, no blood, no wounds, "
    "no impact stars, no motion streaks. It must look clearly DIFFERENT from 'being hit' "
    "at a single glance - 'being hit' is still standing and still in the fight; this one is done.")
DOWN_TAIL = (
    "\n\nIt lies flat with its body along the very bottom edge of the picture - do not draw it "
    "floating and do not stand it up. Full body, head pointing LEFT. "
    "Because it is lying down it will be much wider than it is tall: fill the frame horizontally, "
    "and leave the upper part of the picture empty.\n"
    "Keep the exact same creature design as the reference image (same face, same colours, same shapes, "
    "same clothing if any) - only the pose and expression differ. Only ONE creature in the picture.\n"
    "Keep the same colours and proportions as the reference: if the creature already lies down or sprawls "
    "in the reference, keep its shape exactly that way - do NOT make it smaller or rounder.\n"
    "The defeat must be readable at small size: bold silhouette, strong shapes, the two X eyes big and clear.\n"
    "Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or see-through.\n"
    "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.\n"
    "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green on the creature.\n"
    "Output 1024x1024 PNG. Save the image as {name} in the current directory and report the path.")


def main() -> None:
    manifest = json.loads((ROOT / "public" / "assets" / "manifest.json").read_text(encoding="utf-8"))
    subjects = json.loads((ROOT / "tools" / "codex_prompts" / "subjects.json").read_text(encoding="utf-8"))
    src = (ROOT / "src" / "content" / "enemies.ts").read_text(encoding="utf-8")

    # 只挑大魔物與塔主。師父走自己那套 sprites（`combat.ts` 另一條路），不在這批
    arts = {a for p, a in re.findall(r"pool: '([^']+)'[^\n]*?art: 'codex/monster_([a-z0-9_]+)'", src)
            if p in ("大魔物", "塔主")}

    REFDIR.mkdir(parents=True, exist_ok=True)

    def job(mid: str) -> tuple[str, dict]:
        name = f"monster_{mid}_down.png"
        raw = RAW / f"monster_{mid}_idle.png"
        if raw.exists():
            ref = str(raw.relative_to(ROOT)).replace("\\", "/")
        else:
            im = Image.open(ROOT / "public" / "assets" / "monsters" / f"{mid}_idle.webp").convert("RGBA")
            bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
            bg.paste(im, (0, 0), im)
            out = REFDIR / f"{mid}_idle.png"
            bg.convert("RGB").save(out)
            ref = str(out.relative_to(ROOT)).replace("\\", "/")
        desc = subjects.get(f"monsters/{mid}_idle", {}).get("subject")
        who = f"The creature: {desc}" if desc else "The creature: exactly the monster shown in the reference image."
        return name, {"prompt": who + DOWN_POSE + DOWN_TAIL.format(name=name), "ref": ref}

    # 已經有 down 圖的跳過（重跑這支不會重生）
    todo = sorted(m for m in arts if "down" not in manifest["monsters"].get(f"codex/monster_{m}", {}))
    jobs = dict(job(x) for x in todo)
    out = JOBS / "monster_down.json"
    out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"monster_down.json: {len(jobs)} 張（大魔物與塔主共 {len(arts)} 隻，已有圖的跳過）")


if __name__ == "__main__":
    main()
