# -*- coding: utf-8 -*-
"""總覽稽核抓到的 5 張走鐘圖，重生一次（2026-09-13）。

**怎麼抓到的**：把她的 210 張圖照類別拼成分批的大圖（牌面 4 張、事件 3 張、
立繪 1 張），標上檔名一次看 20～30 張。一張一張點開看是看不出來的——
壞掉的那幾張單看都「還行」，並排才知道臉不一樣。詳見 `art_rules.py` 第八個雷。

**五張各自壞在哪**（重生時要盯的就是這幾點）：
  card_feifei_xuli             變成獸耳人：暹羅面罩不見、臉是人類女孩的臉
  event_feifei_toll_again_paid 同上，另外頭髮塌成兩坨咖啡色
  event_feifei_signal_r1       膨脹成球：臉橫向撐開、身體變一坨
  event_feifei_brew_r0         鍋蓋頭：瀏海蓋滿整個頭頂、蝴蝶結被擠到旁邊
  event_feifei_chest_empty     頭髮變成白色一坨，看不出瀏海／結／馬尾三部分

前四張的提示詞直接從**重建過的** job 檔取（`art_rules.py` 補了兩條反向護欄之後
重跑 `make_feifei_*_jobs.py`，新規則就在裡面了）。`brew_r0` 沒有產生器、
提示詞只存在 `feifei_event_art.json` 裡，所以這裡照那份的場景敘述重組一份。

用法：
  python tools/make_feifei_offmodel_redo.py
  python tools/codex_gen.py tools/codex_jobs/feifei_offmodel_redo.json --ref tools/ref/feifei_ref.png
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import STYLE, feifei_look  # noqa: E402

JOBS = ROOT / "tools" / "codex_jobs"
OUT = JOBS / "feifei_offmodel_redo.json"

# 從已經帶新規則的 job 檔取，鍵 → 來源檔
FROM_JOBS = {
    "card_feifei_xuli.png": "feifei_shared_cards.json",
    "event_feifei_toll_again_paid.png": "feifei_events.json",
    "event_feifei_chest_empty.png": "feifei_events.json",
    "event_feifei_signal_r1.png": "feifei_new_events.json",
}

# brew_r0 沒有產生器，場景敘述照抄原 job，外觀規則換成現在的
BREW_R0_SCENE = (
    "She grinds a clump of purple-backed leaves into paste in a small stone mortar, then paints a thin "
    "coat onto a needle held in her other paw. A tiny smear of the paste has got onto her own paw and "
    "that paw has gone numb and stiff. Warm lamplight, violet paste."
)


def build_brew_r0() -> str:
    fid = "event_feifei_brew_r0.png"
    return (
        "A single scene illustration for a story event in a cute cartoon roguelike card game, "
        "landscape composition. THE ONLY CHARACTER IN THE PICTURE IS THE SIAMESE CAT GIRL.\n"
        + feifei_look()
        + "\nWHAT THIS PICTURE SHOWS: " + BREW_R0_SCENE + "\n"
        "The picture shows this one moment only. There is exactly ONE cat in the picture (no second cat, "
        "nobody else). Draw everything SOLID and OPAQUE.\n"
        "No text, no letters, no numbers, no watermark, no user interface, no border.\n"
        + STYLE +
        f"Output 1024x768 PNG. Save the image as {fid} in the current directory and report the path."
    )


def main() -> None:
    jobs: dict[str, object] = {}
    for fid, src in FROM_JOBS.items():
        d = json.loads((JOBS / src).read_text(encoding="utf-8"))
        if fid not in d:
            raise SystemExit(f"!! {src} 裡沒有 {fid}——job 檔是不是改過鍵名了？")
        jobs[fid] = d[fid]
    jobs["event_feifei_brew_r0.png"] = build_brew_r0()

    # 自檢：兩條新的反向護欄必須每一張都有，不然這一輪等於白重生
    for fid, v in jobs.items():
        p = v["prompt"] if isinstance(v, dict) else v
        for guard in ("NOT A GIRL WITH CAT EARS", "MUST NOT INFLATE", "WHAT THE HAIR MUST NOT BECOME"):
            if guard not in p:
                raise SystemExit(f"!! {fid} 少了護欄「{guard}」——是不是忘了重跑 make_feifei_*_jobs.py？")

    OUT.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 張 → {OUT.relative_to(ROOT)}（三條護欄都在）")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_offmodel_redo.json "
          "--ref tools/ref/feifei_ref.png")


if __name__ == "__main__":
    main()
