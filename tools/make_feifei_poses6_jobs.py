# -*- coding: utf-8 -*-
"""補菲菲缺的六個姿勢（2026-09-12，使用者：「123 都做」）。

球球有 31 個姿勢，她只有 14。缺的會退到她最接近的一張（不會破圖），但有六個差很多：

  down    倒下——**一局只會死一次，那是情緒最重的一刻**。26 隻大魔物與塔主都有倒地圖，
          球球也有，她沒有，現在退到「站著垂頭」的落敗圖，完全不是同一件事。
  choke   中毒待機——她自己會中毒（舔針、全撒了），現在看不出來。
  claw/kick/dash/punch → 她沒有爪擊踢技，改成**丟針的四種變化**：
          單發精準、一次三根、由上往下砸、貼身彈指。球球 2026-09-08 分家就是為了
          「三十幾張攻擊牌全長一樣」，她也會遇到同一個問題。

其餘 11 個（belly/lazy/puff/iron/dizzy/eat/focus/scroll/roar/taiji/qinggong）先不補，
等實際玩起來覺得單調再說。
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(r'F:\ClaudeWork\qiuqiu-coop')
sys.path.insert(0, str(ROOT / 'tools'))
from art_rules import FEIFEI_FACE_RIGHT, FOES, STYLE, feifei_look  # noqa: E402

POSES = {
    # 一局只會死一次，那一拍要夠重
    'down': ('lying collapsed on the ground on her side, eyes closed into little crosses, one paw still '
             'reaching weakly forward, needles scattered around her, an empty bamboo tube rolled away, '
             'the bow on her hair slipped crooked'),
    # 她自己也會中毒（舔針、全撒了）
    'choke': ('doubled over with one paw clutching her throat and the other over her mouth, eyes watering, '
              'cheeks puffed, small violet vapour curls rising around her head'),
    # ---- 丟針的四種變化（取代球球的爪擊／踢技／衝撞／拳）----
    'claw': ('sighting carefully down her outstretched arm with one eye shut, releasing ONE needle with a '
             'precise flick of two fingers - a small, controlled, unshowy motion'),
    'kick': ('fanning THREE needles out between the fingers of one paw and whipping them away together in '
             'a spread, arm sweeping across her body'),
    'dash': ('up on the balls of her feet with her arm raised high overhead, slamming a needle DOWNWARD '
             'from above, her whole small weight behind it'),
    'punch': ('close in and flinching away even as she does it - jabbing a needle forward at arm\'s length '
              'with her face turned aside and one eye squeezed shut, clearly hating being this near'),
}

FRAMING_DEFAULT = ("\n\nFull body. " + FEIFEI_FACE_RIGHT.rstrip()
                   + " Feet at the very bottom edge of the picture, do not draw her floating. "
                     "Fill the frame vertically.")
FRAMING = {
    # 倒在地上就沒有「腳貼底邊」可言，整個身體橫躺填滿畫面
    'down': ("\n\nFull body lying on the ground, her body filling the frame horizontally, resting on the "
             "very bottom edge. Her face is angled toward the RIGHT edge, never toward the left. "
             "Do not draw her floating."),
}

jobs = {}
for pose, text in POSES.items():
    fid = f'hero_feifei_{pose}.png'
    jobs[fid] = (
        feifei_look() + "\n\nPose: " + text + FRAMING.get(pose, FRAMING_DEFAULT) +
        "\nKeep the exact same character design AND the same right-facing three-quarter angle as the "
        "reference image (both halves of it face right) - only the pose and expression differ. "
        "There is exactly ONE character in the picture: no second cat, nobody else.\n"
        "Draw everything SOLID and OPAQUE. Nothing else in the picture: no ground line, no shadow, no "
        "scenery, no text, no letters, no watermark, no border.\n"
        + FOES + STYLE +
        f"\nOutput 896x896 PNG. Save the image as {fid} in the current directory and report the path.")

out = ROOT / 'tools/codex_jobs/feifei_poses6.json'
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'{len(jobs)} 張 → {out.name}：{list(POSES)}')
