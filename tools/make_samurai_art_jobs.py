# -*- coding: utf-8 -*-
"""武士球球（第二個職業）的立繪生圖工作檔。

角色＝同一隻球球換上大鎧，不是新角色。使用者 2026-09-05 定案：**去背旗、大袖縮一半**
（背旗會把貓擠小——實測含旗佔框 504×625、去旗 478×625、忍者 421×625，含旗那版頭明顯小一圈）。

參考圖用 tools/ref/samurai_combined_ref.png：左半＝核可的大鎧定裝（甲冑的正本），右半＝忍者立繪（臉、虎斑、平塗畫法的正本）。
第一批 13 張全是白臉——提示詞寫了 "a WHITE face" 被讀成整張臉全白，而且定裝圖本身就淡化了虎斑；改雙參考＋明寫虎斑才修好。
硬規則來自 tools/art_rules.py——那是做姆斯那晚十幾次失敗換來的，檔頭有兩個最貴的教訓。
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from art_rules import FOES, STYLE, gear_rule

ROOT = Path(__file__).resolve().parents[1]

HERO = ("Qiuqiu the samurai: a chibi grey tabby cat - light grey fur with darker grey TABBY STRIPES that stay "
        "clearly visible on his FACE: three dark grey stripes across the top of the head (peeking out under the "
        "helmet brim) and two short grey stripes on each cheek, exactly like the cat on the RIGHT half of the "
        "reference image. Only his muzzle, chin, chest and paws are white. Pink inner ears, big round dark eyes with glossy white highlights, small "
        "pink blush strokes on both cheeks, a NAVY BLUE headband with two long trailing tails. Head about as big "
        "as the whole body, short stubby limbs, no neck. He wears deep red lacquered O-YOROI scale armour laced "
        "with navy cords and gold trim, MODEST-SIZED shoulder plates (about half the size of ceremonial ones, so "
        "they never cover his arms or face), armoured skirt plates, and a black kabuto helmet with a golden "
        "crescent crest pushed back so the navy headband still shows across his brow. NO back banner, no flag, "
        "no pole - the armour design is exactly the LEFT half of the reference image; the face, fur markings and "
        "flat cartoon rendering are exactly the RIGHT half.")

GEAR = gear_rule("the red lacquered chest armour, the shoulder plates, the armoured skirt plates and the "
                 "kabuto helmet with its golden crescent crest")

POSES = {
    'idle':   'standing calmly in a relaxed ready stance, paws loose at his sides, a small confident look',
    'attack': 'lunging forward and driving a straight punch ahead, shoulder leading, body committed to the blow',
    'skill':  'both paws raised in front of the chest weaving a technique, chin lifted, focused',
    'throw':  'winding back and hurling something forward with one paw, the other arm flung out for balance',
    'guard':  'braced low behind his forearm and shoulder plate, knees bent, taking an incoming blow head-on',
    'curl':   'crouched into a tight ball behind his armour, head tucked down, arms wrapped around his knees',
    'dodge':  'leaning sharply back on one foot, eyes wide in surprise, motion streaks behind him',
    'hit':    'knocked backwards, both eyes squeezed shut the same way, small warm-gold stars around his head',
    'hurt':   'battered and swaying, a bandage on one cheek, a sweat drop, armour scuffed, but still on his feet',
    # 「拳頭高舉」連掛兩次：舉高的手臂加上本來就很高的金鍬形兜，跟「全身入鏡＋腳貼底邊＋填滿畫面」
    # 擠不下（今晚第五次踩到「規則跟姿勢打架」）。改成手舉在頭側，意思一樣但塞得進去。
    'win':    'standing tall and proud with one fist raised in triumph beside his head, beaming with a wide happy smile',
    'lose':   'sitting slumped on the ground, head hanging low, one shoulder plate cracked, sad',
    'hungry': 'holding an empty rice bowl in both paws, drooling, hungry pleading eyes',
    'power':  'a warm golden aura blazing around him, armour glowing, fists clenched, eyes fierce',
}

# 取景：預設全身朝右、腳貼底邊。`curl` 縮成一團沒有站姿也沒有明確朝向，
# 硬套預設會跟姿勢打架（做姆斯時這一項連掛三次），所以另給一套。
FRAMING_DEFAULT = ("\n\nFull body, FACING RIGHT (he looks and moves toward the right edge of the picture), feet at "
                   "the very bottom edge of the picture, do not draw him floating. Fill the frame vertically.")
FRAMING = {'curl': ("\n\nThe curled-up armoured ball is the whole silhouette, resting on the ground, filling the "
                    "frame, with his head and limbs tucked in. Do not draw him floating.")}

jobs = {}
for pose, text in POSES.items():
    fid = f'hero_samurai_{pose}.png'
    jobs[fid] = (HERO + "\n\nPose: " + text + FRAMING.get(pose, FRAMING_DEFAULT) +
                 "\nKeep the exact same character and armour design as the reference image - only the pose and "
                 "expression differ. There is exactly ONE character in the picture: no cat companion, no second "
                 "samurai, nobody else.\n"
                 "Draw everything SOLID and OPAQUE. Nothing else in the picture: no ground line, no shadow, no "
                 "scenery, no text, no letters, no watermark, no border.\n"
                 + GEAR + FOES + STYLE +
                 f"\nOutput 896x896 PNG. Save the image as {fid} in the current directory and report the path.")

out = ROOT / 'tools' / 'codex_jobs' / 'samurai_hero.json'
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'{len(jobs)} 張立繪工作檔 → {out.relative_to(ROOT)}')
