# -*- coding: utf-8 -*-
"""師妹（暹羅貓）的生圖工作檔——第三個角色，**不是球球換裝**。

使用者 2026-09-12 拍板：球球的師妹、大俠貓的女徒弟，暹羅貓。
牌組特色是毒暗器＋距離（原本寫給狼的「堆毒」概念移到她身上，狼稿作廢）。
名字未定（使用者要疊字），檔名一律用 `shimei_` 當前綴，定名之後只要改前綴不必重生。

**跟武士球球最大的不同：她是另一隻貓，不是同一隻換裝。**
所以參考圖只能當「畫風與比例」的範本，不能當「要畫這隻」的範本——
`art_rules.py` 檔頭第二個雷寫得很清楚：參考圖會被讀成「要畫這個」。
因此提示詞裡每一段都要明寫「這是**另一隻**貓，只照抄畫法與比例」。

兩階段（跟武士那次一樣）：
  1. `--looks`：先生四張定裝候選，人工挑一張 → 做成 `tools/ref/shimei_ref.png`
  2. 預設：照核可的定裝生 14 張立繪，`--ref tools/ref/shimei_ref.png`

跑法：
  python tools/make_shimei_art_jobs.py --looks
  python tools/codex_gen.py tools/codex_jobs/shimei_looks.json --ref tools/ref/球球設定表.png
  （挑好、合成參考圖之後）
  python tools/make_shimei_art_jobs.py
  python tools/codex_gen.py tools/codex_jobs/shimei_hero.json --ref tools/ref/shimei_ref.png
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from art_rules import FOES, STYLE, gear_rule

ROOT = Path(__file__).resolve().parents[1]

# ---------------------------------------------------------------------------
# 這隻貓長什麼樣
# ---------------------------------------------------------------------------
# 暹羅的重點色（深色臉、耳、四肢、尾巴＋奶白身）是**跟球球拉開距離的主要手段**：
# 球球是整隻淺灰虎斑，兩隻在連線版會同框，剪影與配色一定要一眼分得出來。
# 藍眼睛是第二個辨識點（球球是深色圓眼）。
LOOK = (
    "She is a chibi SIAMESE cat: creamy off-white body fur with dark seal-brown POINTS - a dark brown mask "
    "covering her muzzle and around the eyes, dark brown ears, dark brown paws and a dark brown tail. "
    "Bright blue almond eyes with glossy white highlights. Slim build with a narrow face and LARGE pointed "
    "ears, noticeably more slender and taller-eared than a round grey tabby. Small pink blush strokes on both "
    "cheeks. Head about as big as the whole body, short stubby limbs, no neck."
)

# 她是「暗器手」：滿身家當。球球是赤手空拳，這是第三個辨識點。
GEAR_LOOK = (
    "She wears a plum-purple short kimono jacket with the sleeves tied back by a cord, dark leggings, and a "
    "wide belt with a row of small bamboo tubes (her needle cases) across the small of her back. A folded "
    "cloth mask hangs loose around her neck, pulled down under her chin so her whole face is visible."
)

# 參考圖是球球的設定表。**每一張都要講這句**，不然模型會直接畫成球球。
NOT_THE_REF = (
    "IMPORTANT: the reference image shows a DIFFERENT character (a round grey tabby tom). Copy ONLY the "
    "drawing style from it - thick black outlines, flat cartoon colours, chibi proportions with a head about "
    "as big as the body, short stubby limbs, no neck, big glossy eyes. Do NOT copy his grey tabby fur, his "
    "face, his headband or his body shape. The cat you draw is the slender cream-and-brown Siamese girl "
    "described above. There is exactly ONE character in the picture."
)

GEAR = gear_rule("the plum-purple jacket, the belt of bamboo needle-tubes and the cloth mask around her neck")


def looks_jobs() -> dict[str, str]:
    """定裝候選：四個方向，挑一張當正本。"""
    variants = {
        "shimei_look_a": (
            "Pose: standing calmly in a ready stance, one paw resting on the bamboo tubes at her belt, "
            "a wary but polite look, ears up and alert."),
        "shimei_look_b": (
            "Pose: half-turned away and leaning back as if keeping her distance, holding a single slim dart "
            "up beside her face between two paws, one eye narrowed as she measures the throw."),
        "shimei_look_c": (
            "Pose: crouched low and small behind her own forearm, ears flattened, peeking out nervously - "
            "the pose of someone who really does not want to get hit."),
        "shimei_look_d": (
            "Pose: mid-throw, body twisted, one arm flung forward having just released a dart, the other arm "
            "out behind for balance, a determined little frown."),
    }
    jobs = {}
    for name, pose in variants.items():
        fid = f"{name}.png"
        jobs[fid] = (
            LOOK + "\n\n" + GEAR_LOOK + "\n\n" + pose +
            "\n\nFull body, three-quarter view facing RIGHT, feet at the very bottom edge of the picture, "
            "filling the frame vertically. Do not draw her floating.\n"
            "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no "
            "watermark, no border.\n"
            + NOT_THE_REF + "\n" + GEAR + FOES + STYLE +
            f"\nOutput 896x896 PNG. Save the image as {fid} in the current directory and report the path.")
    return jobs


# ---------------------------------------------------------------------------
# 立繪：跟球球同一套姿勢表，戰鬥畫面才換得過去
# ---------------------------------------------------------------------------
# 姿勢敘述照她的個性改寫：球球是「衝上去抓」，她是「退開了丟」。
# ★ 每加一個姿勢都要回頭問一次「有沒有哪條硬規則做不到」——
#   `art_rules.py` 檔頭記著這一晚踩了五次的教訓（規則跟姿勢打架）。
POSES = {
    'idle':    'standing lightly on her toes, weight on the back foot, one paw hovering over the needle tubes at her belt, watchful',
    'attack':  'flicking a slim dart forward with a sharp snap of the wrist, body still leaning AWAY from the target',
    'skill':   'holding a needle up in both paws and breathing on it, eyes lowered in concentration, coating it with something',
    'throw':   'winding back and hurling a handful of small darts forward in a spray, the other arm flung out for balance',
    'guard':   'both forearms crossed in front of her face, ears flat, braced and turned half away from the blow',
    'curl':    'crouched into a tight ball with her tail wrapped around herself, head tucked down, arms over her ears',
    'dodge':   'springing backwards off one foot with both arms up, eyes wide, motion streaks trailing in front of her',
    'hit':     'knocked backwards, both eyes squeezed shut the same way, mouth open in a yelp, small warm-gold stars around her head',
    'hurt':    'swaying on her feet, a bandage on one cheek, a big sweat drop, jacket torn at the sleeve, near tears but still standing',
    'win':     'holding one paw up beside her head in a small shy victory sign, eyes closed in a relieved smile',
    'lose':    'sitting slumped on the ground, ears down, empty needle tubes scattered at her feet, defeated',
    'hungry':  'holding an empty rice bowl in both paws, drooling, hungry pleading eyes',
    'power':   'a warm golden aura blazing around her, needles hovering in a ring at her back, eyes fierce and narrowed',
    'stealth': 'pulling the cloth mask up over her muzzle with one paw and shrinking behind it, only the blue eyes showing',
}

FRAMING_DEFAULT = ("\n\nFull body, FACING RIGHT (she looks and moves toward the right edge of the picture), feet at "
                   "the very bottom edge of the picture, do not draw her floating. Fill the frame vertically.")
FRAMING = {
    # 縮成一團沒有站姿也沒有明確朝向，硬套預設會跟姿勢打架（做姆斯時連掛三次）
    'curl': ("\n\nThe curled-up ball is the whole silhouette, resting on the ground, filling the frame, with her "
             "head, limbs and tail tucked in. Do not draw her floating."),
    # 坐在地上就沒有「腳貼底邊」可言
    'lose': ("\n\nFull body seated on the ground, facing RIGHT, her seat and feet at the very bottom edge of the "
             "picture, filling the frame. Do not draw her floating."),
}


def hero_jobs() -> dict[str, str]:
    jobs = {}
    for pose, text in POSES.items():
        fid = f'hero_shimei_{pose}.png'
        jobs[fid] = (
            LOOK + " " + GEAR_LOOK +
            "\n\nPose: " + text + FRAMING.get(pose, FRAMING_DEFAULT) +
            "\nKeep the exact same character design as the reference image - only the pose and expression "
            "differ. There is exactly ONE character in the picture: no second cat, nobody else.\n"
            "Draw everything SOLID and OPAQUE. Nothing else in the picture: no ground line, no shadow, no "
            "scenery, no text, no letters, no watermark, no border.\n"
            + GEAR + FOES + STYLE +
            f"\nOutput 896x896 PNG. Save the image as {fid} in the current directory and report the path.")
    return jobs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--looks', action='store_true', help='生定裝候選（第一階段）')
    args = ap.parse_args()

    if args.looks:
        jobs, name = looks_jobs(), 'shimei_looks.json'
    else:
        jobs, name = hero_jobs(), 'shimei_hero.json'
    out = ROOT / 'tools' / 'codex_jobs' / name
    out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(jobs)} 張工作檔 → {out.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
