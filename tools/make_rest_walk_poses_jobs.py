# -*- coding: utf-8 -*-
"""貓窩三張＋過關走路一張，三隻貓各四張＝12 張（2026-09-18）。

為什麼補這四張
--------------
使用者盤點美術缺口時點名的兩處「玩家看得到、但畫面沒跟上」：

  1. **貓窩三件事長得一模一樣**：打盹回血、磨爪升級（她磨針、他調護臂）、扶起倒下的同伴，
     `screens/rest.ts` 的 `heroPortrait` 一律拿 `hero/<角色>_curl`（蜷成一團那張）。
  2. **過關走路的轉場用站姿**：`acttransition.ts` 走三秒的那段拿的是站姿圖，腳步聲有、腳沒動。

姿勢名（跟現有 31 個並列，全部走 `heroSpriteKey` 的三層退路，沒生的自動退回站姿）：

    nap      睡著（貓窩打盹之後）
    sharpen  磨爪／磨針／調護臂（貓窩升級之後，一隻一個版本）
    helpup   蹲下伸手扶人（連線版扶起倒下的同伴之後）
    walk     側面走路（過關轉場）

這批**不進戰鬥暖圖**（`assets.ts` 的 `HERO_NOT_IN_COMBAT`），戰鬥裡一張都用不到。

三隻的長相各自從哪裡來
----------------------
長相一律交給參考圖，提示詞只講「這個姿勢在做什麼」（`reference_mus_art_pipeline` 的教訓：
外觀寫得越細越會變成另一隻貓）：

    球球  tools/ref/hero_combat_ref.png   ＋ 一句辨識（灰虎斑、深藍忍者服與頭帶）
    菲菲  tools/ref/feifei_ref.png        ＋ `art_rules.feifei_look()`（她是從無到有生的，要整段）
    噹噹  tools/ref/dangdang_ref.png      ＋ `make_dangdang_hero_jobs` 的 LOOK/GEAR（只寫正面、不舉例）

跑法
----
    python tools/make_rest_walk_poses_jobs.py
    python tools/codex_gen.py tools/codex_jobs/rest_walk_a.json      # 一條線
    python tools/codex_gen.py tools/codex_jobs/rest_walk_b.json      # 另一條（最多兩條，坑 1）

  進倉：python tools/add_sprite.py --group hero hero_<角色>_<姿勢>.png
  ★ 睡著那張是躺著的，進倉後先 `--check` 看主體高度；比站姿高一截就用 `--scale` 壓回去
    （噹噹那批的教訓：蜷縮、翻肚沒壓就「變超大隻」）。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from art_rules import FEIFEI_FACE_RIGHT, FOES, STYLE, feifei_look  # noqa: E402
from make_dangdang_hero_jobs import GEAR, LOOK as DD_LOOK  # noqa: E402

JOBS = ROOT / 'tools' / 'codex_jobs'
RAW = ROOT / 'tools' / 'codex_raw'

# ---------------------------------------------------------------------------
# 三隻貓：前言、參考圖
# ---------------------------------------------------------------------------
NINJA_LOOK = (
    "The character: the small grey tabby kitten ninja from the reference image (dark navy ninja suit and "
    "headband, big round eyes). Copy his design straight from the reference - same face, same fur pattern, "
    "same clothes. Do not redesign him.\n")

HEROES: dict[str, tuple[str, str]] = {
    'ninja': (NINJA_LOOK, 'tools/ref/hero_combat_ref.png'),
    'feifei': (feifei_look() + '\n', 'tools/ref/feifei_ref.png'),
    'dangdang': (DD_LOOK + GEAR, 'tools/ref/dangdang_ref.png'),
}

# ---------------------------------------------------------------------------
# 四個姿勢。`{p}` 是那一隻的代名詞（his／her），照 `heroPronoun` 的分法
# ---------------------------------------------------------------------------
POSES: dict[str, str] = {
    # 貓窩打盹：跟 `curl`（縮成一團防禦、臉埋著）要分得開——這張是**睡著了**，躺著、放鬆、看得到臉
    'nap': ('fast asleep and completely relaxed, lying curled on {p} side on the ground with {p} head resting '
            'on {p} own front paws and {p} tail wrapped around in front of {p} feet. Both eyes are closed in '
            'two calm upward arcs, mouth a tiny contented smile, one ear flopped over. Three small SOLID '
            'round white bubbles float up above {p} head, each one bigger than the last, to show sleeping - '
            'they are plain circles with a thick outline, no letters and no words inside them. Peaceful and '
            'warm, not hurt and not collapsed'),
    'helpup': ('crouching down low on one knee and reaching a helping paw out forward and downward toward '
               'someone lying on the ground just off the bottom-right edge of the picture - that other cat is '
               'NOT drawn, only the reaching paw shows who this is for. The other paw is braced on {p} own '
               'knee, {p} body leans forward over the offered paw, {p} eyes are wide and warm with concern '
               'and {p} mouth is open saying something encouraging. Steady and reassuring, in a hurry to help '
               'but not panicking'),
    'walk': ('walking steadily forward toward the RIGHT in a clear side-on walking stride, caught mid-step: '
             'the near front paw reaching forward and just about to land, the far back paw pushed off behind '
             'so only its toes still touch the ground, body leaning very slightly forward, tail up and '
             'relaxed behind {p}, eyes looking ahead at where {p} is going, mouth in a small determined '
             'line. Unhurried and travelling - this is a long walk to the next floor, not a charge'),
}

# 磨東西那張：三隻磨的是不同的東西（引擎的 `sharpenVerb`：球球磨爪、菲菲磨針、噹噹調護臂）
SHARPEN: dict[str, str] = {
    'ninja': ('sharpening his claws: crouched on one knee over a flat grey WHETSTONE on the ground, one front '
              'paw pressed down on the stone with the claws of that paw spread out and drawn along it, the '
              'other paw steadying the stone, head tilted down and eyes narrowed in concentration, tongue tip '
              'poking out of the corner of his mouth, three tiny SOLID yellow spark shapes flicking off the '
              'stone where the claws scrape'),
    'feifei': ('honing one of her long needles: kneeling over a small flat grey WHETSTONE on the ground, the '
               'needle held level between both front paws and drawn along the stone, her head bent down close '
               'over the work, blue eyes narrowed in careful concentration, mouth a small firm line, three '
               'tiny SOLID yellow spark shapes flicking off where the needle meets the stone'),
    'dangdang': ('working on his own bronze bracer: sitting back on one heel with his left forearm held up '
                 'across his chest, his right paw pulling the strap of that bracer tight, a small metal tool '
                 'tucked in the right paw alongside the strap, head bent down watching his hands, amber eyes '
                 'narrowed in concentration, mouth a small firm line. Both bracers stay on his forearms'),
}

PRONOUN = {'ninja': 'his', 'feifei': 'her', 'dangdang': 'his'}

# 取景：躺著那張沒有「腳貼底邊」可言，跟菲菲那批的 belly 同一套寫法
FRAMING_DEFAULT = ("\n\nFull body, facing RIGHT (toward the right edge of the picture), feet at the very "
                   "bottom edge of the picture, do not draw it floating. Fill the frame vertically.")
FRAMING = {
    'nap': ("\n\nFull body lying on the ground, curled up compactly in the middle of the frame, resting on the "
            "very bottom edge and filling the frame about as much vertically as horizontally. The head is at "
            "the RIGHT side and the face is angled toward the RIGHT edge, never toward the left."),
    'sharpen': ("\n\nFull body crouching, facing RIGHT (toward the right edge of the picture), knees and paws "
                "resting on the very bottom edge of the picture, do not draw it floating. Fill the frame "
                "vertically - the whole figure is taller than it is wide."),
    'helpup': ("\n\nFull body crouching, facing RIGHT (toward the right edge of the picture), the knee and the "
               "feet resting on the very bottom edge of the picture. Fill the frame vertically - the reaching "
               "paw stays inside the picture and the whole figure is taller than it is wide."),
}

TAIL = (
    "\nKeep the exact same character design AND the same right-facing angle as the reference image - only the "
    "pose and expression differ. There is exactly ONE character in the picture: no second cat, nobody else.\n"
    "The action must be readable at small size: bold silhouette, strong shapes.\n"
    "Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or "
    "see-through.\n"
    "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no numbers, no "
    "watermark, no border.\n")


def build() -> dict[str, dict[str, dict[str, str]]]:
    lanes: dict[str, dict[str, dict[str, str]]] = {'a': {}, 'b': {}}
    for hero, (look, ref) in HEROES.items():
        for pose in ('nap', 'sharpen', 'helpup', 'walk'):
            text = SHARPEN[hero] if pose == 'sharpen' else POSES[pose].format(p=PRONOUN[hero])
            fid = f'hero_{hero}_{pose}.png'
            face = FEIFEI_FACE_RIGHT.rstrip() + ' ' if hero == 'feifei' and pose not in FRAMING else ''
            prompt = (
                look + "\nPose: " + text + FRAMING.get(pose, FRAMING_DEFAULT) + ' ' + face
                + TAIL + FOES + STYLE
                + f"\nOutput 1024x1024 PNG. Save the image as {fid} in the current directory and report the path.")
            lanes['a' if hero == 'ninja' or (hero == 'feifei' and pose in ('nap', 'sharpen')) else 'b'][fid] = {
                'prompt': prompt, 'ref': ref}
    return lanes


def main() -> None:
    lanes = build()
    seen = {fid for jobs in lanes.values() for fid in jobs}
    if len(seen) != 12:
        raise SystemExit(f'!! 應該是 12 張（3 隻 × 4 個姿勢），實際 {len(seen)}')
    # 自檢要能中止（art_rules 第九個雷）：舊稿還在的話 codex_gen 會直接跳過、整張空轉
    for fid in seen:
        if (RAW / fid).exists():
            raise SystemExit(f'{fid} 的原稿還在：先改名留底（例如 {Path(fid).stem}.v1.png）')
    for fid, job in ((f, j) for jobs in lanes.values() for f, j in jobs.items()):
        if not (ROOT / job['ref']).exists():
            raise SystemExit(f'{fid}：參考圖 {job["ref"]} 不在')
        if '#00FF00' not in job['prompt']:
            raise SystemExit(f'{fid}：少了綠幕那一句，去背會失敗')
        if 'no text, no letters' not in job['prompt']:
            raise SystemExit(f'{fid}：少了「不准有字」那一句')
    for lane, jobs in lanes.items():
        out = JOBS / f'rest_walk_{lane}.json'
        out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'{out.name}：{len(jobs)} 張 -> {", ".join(jobs)}')


if __name__ == '__main__':
    main()
