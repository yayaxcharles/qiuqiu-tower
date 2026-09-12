# -*- coding: utf-8 -*-
"""菲菲新增兩個專屬事件的結果圖（2026-09-13）。

文字由另一位 AI 寫（`docs/菲菲_劇情文字_交回稿_2026-09-13.md`），數值與圖這邊做。
四張：破掉的針袋 A／B、牆後的暗號 A／B。

**不能只寫事件標題就叫模型畫**：結果圖畫的是「選了這個之後發生什麼」，
所以每一張都要把那一刻的動作寫出來（她的手在做什麼、表情怎樣、旁邊有什麼）。

外觀規則一律 `art_rules.feifei_look()`，全專案只定義一份。

用法：
  python tools/make_feifei_new_event_jobs.py
  python tools/codex_gen.py tools/codex_jobs/feifei_new_events.json --ref tools/ref/feifei_ref.png
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import STYLE, feifei_look  # noqa: E402

OUT = ROOT / "tools" / "codex_jobs" / "feifei_new_events.json"

HEAD = (
    "A single scene illustration for a story event in a cute cartoon roguelike card game, "
    "landscape composition. THE ONLY CHARACTER IN THE PICTURE IS THE SIAMESE CAT GIRL.\n"
    + feifei_look()
)

TAIL = (
    "\nTell the story in one readable picture: clear staging, strong silhouette, expressive face, "
    "only what the scene needs. It will be shown about 420 pixels wide, so no fine detail that "
    "disappears when shrunk.\n"
    "No text, no letters, no numbers, no watermark, no user interface, no border.\n"
    + STYLE +
    "Output 1024x768 PNG. Save the image as {fid} in the current directory and report the path."
)

SCENES = {
    # 破掉的針袋 A：布條拿來補袋子，手上的傷沒處理
    "event_feifei_pouch_r0.png":
        "She sits on the floor winding a clean cloth strip tightly around a split leather needle pouch, "
        "pulling the wrap snug with her teeth and one paw. The pouch is back in one piece and no needle "
        "tips poke out any more. Her OTHER paw is still scraped and unbandaged, held a little away from "
        "her body. Her face is calm but tired - she has decided, and it cost her something. A few bamboo "
        "needle-tubes lie beside her on the stone floor.",
    # 破掉的針袋 B：布條拿來包紮，挑掉會刺出來的針
    "event_feifei_pouch_r1.png":
        "She has wrapped the clean cloth strip around her own scraped paw as a bandage and is tying it off "
        "with her teeth. Beside her, the split needle pouch lies open and a small handful of darts she "
        "picked out of it are set aside on the floor, clearly separated from the pouch. She looks down at "
        "the bandage with a guilty, apologetic expression - relieved but a bit ashamed of the waste.",
    # 牆後的暗號 A：飛針卡進齒輪，針彎了
    "event_feifei_signal_r0.png":
        "A heavy iron mechanism of interlocking gears is jammed in the middle of the picture, one of her "
        "slim darts wedged hard between two cog teeth and visibly BENT. She has just pulled a small sack "
        "of dried fish out from under the mechanism and is holding it against her chest, staring at the "
        "ruined dart with a flat, disappointed look - not scared, just let down. The wall behind is "
        "silent and dark.",
    # 牆後的暗號 B：袖子墊著撐開機關，手被刮傷
    "event_feifei_signal_r1.png":
        "She is crouched beside the same iron mechanism with her plum sleeve pulled down over one paw, "
        "using it as a pad to hold the metal plates apart. The sack of dried fish is out and tucked under "
        "her arm, but the edge of the plate has cut her - a thin red scratch on her wrist and a wince on "
        "her face, eyes squeezed half shut. Her head is turned AWAY from the wall behind her.",
}


def main() -> None:
    jobs = {fid: HEAD + "\nWHAT THIS PICTURE SHOWS: " + text + TAIL.format(fid=fid)
            for fid, text in SCENES.items()}
    OUT.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 張 → {OUT.relative_to(ROOT)}")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_new_events.json "
          "--ref tools/ref/feifei_ref.png")


if __name__ == "__main__":
    main()
