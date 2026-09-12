# -*- coding: utf-8 -*-
"""菲菲的過關與結局插圖八張（2026-09-12）。

**為什麼非做不可**：這八張原本兩個角色共用，而球球在每一張裡都是主角——
相擁那張他就在正中央被師父抱著。玩菲菲時文字寫「師父把她拉過去，摸了摸她的頭」，
畫面卻是球球撲進師父懷裡，比沒有圖還糟。`app.ts` 已經改成依角色取鍵
（`stillKey`），她這一份生好之前整段會退回純對白——那是對的退路。

場景要對得上**她的**台詞（`feifeiDialogue.actClear1／actClear2／victory`），不是球球的：
  - 她的過關一講的是「地上幾根被踩彎的針不是她的」「師兄的頭巾線頭」
  - 她的結局是**三個都回來了**，不是師徒重逢

CAST 與 TAIL 直接沿用序章那份（同一批角色、同一個畫風），不重寫一份——
外觀規則全專案只定義在 `art_rules.feifei_look()`（見那個檔案的第六個雷）。

用法：
  python tools/make_feifei_slides_jobs.py
  python tools/codex_gen.py tools/codex_jobs/feifei_slides.json --ref tools/ref/feifei_story_ref.png
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from make_feifei_story_jobs import CAST, TAIL  # noqa: E402

OUT = ROOT / "tools" / "codex_jobs"

SCENES = {
    # ---- 第一關過關（她的三句：踩彎的針不是她的／師兄的頭巾線頭／補藥收針貼著牆走）----
    "feifei_still_act1_stairs.png":
        "Inside the stone tower, torchlit. The guardian monster has just fallen and a stairway up is "
        "revealed in the wall. In the foreground on the flagstones lie several BENT metal darts that are "
        "NOT hers - twisted, trodden on. The SIAMESE GIRL crouches over them, one paw picking one up, "
        "looking puzzled. She is the subject, lit brighter than the background. Warm torch orange against "
        "cool stone.",
    "feifei_still_act1_fish.png":
        "Same torchlit stone corridor, wrecked: smashed barrels, a cracked wall, claw gouges - the mess "
        "the brother left behind. The SIAMESE GIRL stands holding up a frayed NAVY BLUE thread from a "
        "headband, pinched between two paws, staring at it with a flat exasperated expression. She is the "
        "only character in frame. Warm torchlight.",
    "feifei_still_act1_climb.png":
        "Bottom of the stairway. The SIAMESE GIRL has stopped to re-coat her darts: a small open vial in "
        "one paw, needles laid across her knee, sliding them one by one back into the bamboo tubes on her "
        "belt. She is NOT running - shoulders lowered, keeping close to the wall, one ear turned upward "
        "listening. Quiet, careful mood. Torchlight from below, dark stairwell above.",
    # ---- 第二關過關（她的三句：塔頂一聲長喵／師父的聲音那師兄呢／月光最後一段樓梯拉口罩）----
    "feifei_still_act2_smoke.png":
        "A defeated monster is dissolving into pale smoke at the edge of the frame. The SIAMESE GIRL has "
        "gone completely rigid mid-step, ears snapped upright, blue eyes wide, head turned toward the top "
        "of the tower - she has just heard something she recognises. Violet-tinged gloom, the smoke pale "
        "against it. She is the subject and clearly frightened.",
    "feifei_still_act2_voice.png":
        "The SIAMESE GIRL alone in a tall dark stairwell, looking up toward a distant violet glow far "
        "above. Her expression is worried, not hopeful - she is listening for a second voice that is not "
        "coming. One paw pressed flat against the cold wall. Deep blue and violet palette, a single shaft "
        "of light from above falling on her face.",
    "feifei_still_act2_moonstairs.png":
        "Moonlight falls across the last flight of stairs through a high window. The SIAMESE GIRL stands "
        "at the foot of them, one paw pulling the dark cloth mask up over her muzzle, the other checking "
        "the bamboo needle-tubes at her belt. Her tail is tucked. Cool silver-blue moonlight, long "
        "shadows, the stairs leading up into darkness.",
    # ---- 結局兩張（她的收尾是**三個都回來了**，不是師徒重逢）----
    "feifei_still_embrace.png":
        "Tower rooftop at sunrise, the violet miasma gone. The straw-hat MASTER (normal form, not "
        "corrupted) has pulled the SIAMESE GIRL against him and is patting her head with one big paw. She "
        "is stiff with surprise, eyes just starting to brim over, still gripping ONE last dart tightly in "
        "her paw. Behind them, off to one side, the small grey tabby brother sits slumped on the stone, "
        "exhausted and still panting, one paw raised in a weak wave. All THREE are in frame; she is the "
        "closest and largest. Warm golden dawn light.",
    "feifei_still_home.png":
        "Sunset on the path home through golden fields, seen from behind. Three cats walking: the grey "
        "tabby brother in front, bouncing and reaching up at the MASTER for a dried fish; the tall "
        "straw-hat MASTER in the middle, head tipped back laughing; and at the BACK, walking slowly, the "
        "SIAMESE GIRL, bending to pick up a dart from the path and slot it into her bamboo tube. The "
        "dark tower is small and far behind them. Warm orange sunset, long shadows, peaceful.",
}


def main() -> None:
    jobs = {fid: CAST + "\nWHAT THIS PICTURE SHOWS: " + text + TAIL.format(fid=fid)
            for fid, text in SCENES.items()}
    out = OUT / "feifei_slides.json"
    out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 張 → {out.relative_to(ROOT)}")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_slides.json "
          "--ref tools/ref/feifei_story_ref.png")


if __name__ == "__main__":
    main()
