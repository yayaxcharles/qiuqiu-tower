# -*- coding: utf-8 -*-
"""2026-09-13 下午第二批：全圖自檢抓到的 14 張。

**自檢是怎麼做的**（下次照這個做）：把她的 121 張事件與劇情圖、131 張牌面，
全部拼成**每張 500 像素寬**的大圖（牌面 300）逐批看。之前用 190～320 像素看過一輪，
漏掉了紙箱那三張——壞掉的圖在小尺寸下都「還行」，要夠大才看得出臉不一樣。

抓到的：

| 檔案 | 壞在哪 |
|---|---|
| event_feifei_sunbath_r0／r1 | **眼睛畫成棕色**（她是藍眼睛）。規則只寫了「要藍」沒寫「不可以是棕」 |
| feifei_still_*（12 張） | 頭髮塌成一塊棕斑、**一半連蝴蝶結都沒有** |

**劇情那 12 張的根因是參考圖**：舊的 `feifei_story_ref.png` 裡，菲菲那一格畫的是
雙手張開的姿勢，那個角度**看不到蝴蝶結**、頭髮糊成一頂棕色的帽。12 張全照它畫，
所以整批都缺結。參考圖已由 `tools/make_feifei_story_ref.py` 重建
（換成設定表的兩個站姿＋一顆頭部特寫，三部分都看得一清二楚）。

這支產生的工單**一律附新的合參表**，並且每一張都貼上
`feifei_look()`（含新加的「眼睛一定是藍的」反向護欄）＋「頭部照參考圖一比一抄」。

用法：
  python tools/make_feifei_story_ref.py      # 先重建參考圖（只要跑一次）
  python tools/make_feifei_fix_0913b.py
  python tools/codex_gen.py tools/codex_jobs/feifei_fix_0913b.json
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import feifei_look  # noqa: E402
from make_feifei_fix_0913 import HEAD_COPY  # noqa: E402

JOBS = ROOT / "tools" / "codex_jobs"
OUT = JOBS / "feifei_fix_0913b.json"
STORY_REF = "tools/ref/feifei_story_ref.png"
SHEET_REF = "tools/ref/feifei_ref.png"

# 劇情與過關圖的來源工單。這兩支的場景敘述沒問題（使用者沒嫌過構圖），
# 壞的只有長相，所以**場景照抄、只換外觀那一段**。
STORY_JOBS = ["feifei_slides.json", "feifei_story.json"]

# 曬太陽那兩張的場景敘述（從 feifei_result_art 那批取，重跑產生器會因為
# 「已經有圖」而跳過，所以這裡直接從現行工單撈；撈不到就照這份重寫）
SUNBATH = {
    "event_feifei_sunbath_r0.png":
        "She has flopped over onto her side in the warm patch of sunlight on the wooden floor, "
        "completely relaxed, one paw curled up, eyes half shut in contentment. The sunbeam on the floor "
        "is shaped like a cat's face.",
    "event_feifei_sunbath_r1.png":
        "She sits up in the warm patch of sunlight rubbing one eye with the back of a paw, just woken "
        "and still sleepy, little motion marks beside her head. The sunbeam on the floor is shaped like "
        "a cat's face.",
}

HEAD = ("A single scene illustration for a story event in a cute cartoon roguelike card game, landscape "
        "composition. THE ONLY CHARACTER IN THE PICTURE IS THE SIAMESE CAT GIRL.\n")
TAIL = ("\nTell the story in one readable picture: clear staging, strong silhouette, expressive face, "
        "only what the scene needs.\n"
        "No text, no letters, no numbers, no watermark, no user interface, no border.\n"
        "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon storybook "
        "look, not photorealistic.\n"
        "Background must be a solid pure green (#00FF00), completely flat, for chroma keying - draw "
        "only the character and the few props the scene needs, standing on nothing.\n"
        "Output 1024x768 PNG. Save the image as {fid} in the current directory and report the path.")

# 舊工單裡的外觀段長這樣（`feifei_look()` 的舊版）——整段換成現在的版本。
# 認不出來的話就**不要猜**，直接把新的外觀段插在最前面，重複一次比漏掉好。
OLD_LOOK_START = "She is a chibi SIAMESE cat girl:"


def swap_look(text: str) -> str:
    """把舊的外觀段換成現在的 `feifei_look()` ＋ 頭部一比一抄。"""
    new = feifei_look() + HEAD_COPY
    i = text.find(OLD_LOOK_START)
    if i < 0:
        return new + "\n" + text                      # 認不出來就補在前面
    # 舊外觀段一路到「**PROPORTIONS」那段結束為止都換掉；找不到結尾就只換第一句
    j = text.find("\n\n", i)
    return text[:i] + new + (text[j:] if j > 0 else "")


def main() -> None:
    jobs: dict[str, dict] = {}

    for f in STORY_JOBS:
        p = JOBS / f
        if not p.exists():
            raise SystemExit(f"!! 找不到 {f}——先跑 make_feifei_slides_jobs.py／make_feifei_story_jobs.py")
        for k, v in json.loads(p.read_text(encoding="utf-8")).items():
            t = v["prompt"] if isinstance(v, dict) else v
            jobs[k] = {"prompt": swap_look(t), "ref": STORY_REF}

    for fid, scene in SUNBATH.items():
        jobs[fid] = {"prompt": HEAD + feifei_look() + HEAD_COPY +
                     "\nWHAT THIS PICTURE SHOWS: " + scene + TAIL.format(fid=fid),
                     "ref": SHEET_REF}

    # 自檢一：每一張都要有三條反向護欄（漏一條就等於白重生）
    for fid, v in jobs.items():
        for guard in ("HER EYES ARE BLUE", "NOT A GIRL WITH CAT EARS",
                      "WHAT THE HAIR MUST NOT BECOME", "ONE-TO-ONE COPY"):
            if guard not in v["prompt"]:
                raise SystemExit(f"!! {fid} 少了護欄「{guard}」")
    # 自檢二：劇情那批要附**重建過的**合參表，不是設定表——那幾張裡有師父與球球
    story = [k for k in jobs if k.startswith("feifei_still_")]
    if len(story) != 12:
        raise SystemExit(f"!! 劇情圖應該是 12 張，只收到 {len(story)}：{sorted(story)}")
    bad = [k for k in story if jobs[k]["ref"] != STORY_REF]
    if bad:
        raise SystemExit(f"!! 這幾張沒附合參表：{bad}")

    OUT.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 張 → {OUT.relative_to(ROOT)}（劇情 {len(story)} ＋ 曬太陽 2）")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_fix_0913b.json")


if __name__ == "__main__":
    main()
