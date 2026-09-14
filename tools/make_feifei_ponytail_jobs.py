# -*- coding: utf-8 -*-
"""菲菲加馬尾的試作四張（2026-09-12 晚，使用者拿了一張範例圖問「會比較好嗎」）。

**為什麼加**：球球靠頭帶那兩條飄帶認人；她現在只靠配色（奶白深棕 vs 灰虎斑）跟耳朵形狀，
牌面縮到 150 像素寬時配色會糊掉，**突出輪廓**的東西才認得出來。馬尾正好補這一格。

**為什麼要先試**：使用者問「會不會不好生圖」。真正會出事的不是站姿，是
「把頭埋起來」的那幾個姿勢——`art_rules.py` 檔頭記著踩過五次的坑就是「規則跟姿勢打架」。
所以這四張刻意排成：兩張定裝挑樣式、兩張最難的姿勢驗可行性。

**參考圖用現有的 `feifei_ref.png`**（她自己、朝右）。使用者給的那張範例是正面、臉朝左，
不能直接當參考圖——參考圖會連角度一起教（第四個雷）。

跑法：
  python tools/make_feifei_ponytail_jobs.py
  python tools/codex_gen.py tools/codex_jobs/feifei_ponytail.json --ref tools/ref/feifei_ref.png
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import FOES, STYLE  # noqa: E402

OUT = ROOT / "tools" / "codex_jobs"

SAME = (
    "This is the SAME cat as the attached reference: a slender chibi SIAMESE cat girl, creamy off-white "
    "body fur with a dark seal-brown mask over her muzzle and around the eyes, dark brown ears, paws and "
    "tail, bright BLUE almond eyes, narrow face, LARGE pointed ears, small pink blush strokes on her "
    "cheeks. Plum-purple short kimono jacket with tied-back sleeves, dark leggings, a wide belt with a row "
    "of small bamboo needle-tubes, and a cloth mask hanging loose around her neck. "
    "Keep the exact same character design AND the same right-facing three-quarter angle as the reference - "
    "her muzzle, nose and gaze all point toward the RIGHT edge.\n"
)

# 馬尾是「長在頭上的東西」，規矩跟裝備一樣——不然它會在不同姿勢裡飄走、換邊、變成兩條
PONYTAIL_RULE = (
    "THE PONYTAIL: it is attached to her head and moves with it. It never detaches, never floats beside "
    "her, never swaps to the other side, and never appears twice. **If a pose hides it behind her head or "
    "body, it is simply hidden - do not relocate it to somewhere it can be seen.** The bow sits where the "
    "ponytail is tied and never floats free of it.\n"
    "THE EYES: both eyes look the same way as each other, same size, same shape - large blue almond eyes "
    "with one glossy white highlight each. If the pose calls for closed or squeezed-shut eyes, close BOTH "
    "the same way. Never cross-eyed, never one eye bigger or higher.\n"
)

HIGH = ("She now has a SHORT DARK-BROWN PONYTAIL tied HIGH on the top-back of her head, sticking up and "
        "back in a small spiky tuft, tied with a small PLUM-PURPLE ribbon bow at its base. The bow sits "
        "between and slightly behind her ears.")
LOW = ("She now has a DARK-BROWN PONYTAIL tied LOW at the back of her head, at the nape, hanging down and "
       "back past her shoulder in a soft tuft, tied with a small PLUM-PURPLE ribbon bow at its base.")

JOBS = {
    # ---- 兩張定裝：挑樣式 ----
    "feifei_pony_high.png": (HIGH, "Pose: standing lightly on her toes, weight on the back foot, one paw "
                                   "hovering over the needle tubes at her belt, watchful."),
    "feifei_pony_low.png": (LOW, "Pose: standing lightly on her toes, weight on the back foot, one paw "
                                 "hovering over the needle tubes at her belt, watchful."),
    # ---- 兩張最難的姿勢：驗可行性 ----
    # 出招：身體扭轉、頭甩動——馬尾最容易在這裡跑到另一邊或多出一條
    "feifei_pony_attack.png": (HIGH, "Pose: flicking a slim dart forward with a sharp snap of the wrist, "
                                     "body twisted and still leaning AWAY from the target, head turned "
                                     "sharply so the ponytail swings."),
    # 縮成一團：整顆頭埋進去——這種姿勢最容易逼模型把馬尾硬挪到看得到的地方
    "feifei_pony_curl.png": (HIGH, "Pose: crouched into a tight ball with her tail wrapped around herself, "
                                   "head tucked down between her arms, arms over her ears. The curled-up "
                                   "ball is the whole silhouette, resting on the ground."),
}

FRAMING = ("\n\nFull body, feet at the very bottom edge of the picture, filling the frame vertically. "
           "Do not draw her floating. Nothing else in the picture: no ground line, no shadow, no scenery, "
           "no text, no letters, no watermark, no border. There is exactly ONE character in the picture.\n")
CURL_FRAMING = ("\n\nThe curled-up ball is the whole silhouette, resting on the ground, filling the frame. "
                "Her face is tucked down but still angled toward the RIGHT edge. Do not draw her floating. "
                "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no border. "
                "There is exactly ONE character in the picture.\n")


def main() -> None:
    jobs = {}
    for fid, (look, pose) in JOBS.items():
        jobs[fid] = (SAME + "\n" + look + "\n\n" + pose
                     + (CURL_FRAMING if "curl" in fid else FRAMING)
                     + PONYTAIL_RULE + FOES + STYLE
                     + f"\nOutput 896x896 PNG. Save the image as {fid} in the current directory and report the path.")
    out = OUT / "feifei_ponytail.json"
    out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 張 → {out.relative_to(ROOT)}")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_ponytail.json --ref tools/ref/feifei_ref.png")


if __name__ == "__main__":
    main()
