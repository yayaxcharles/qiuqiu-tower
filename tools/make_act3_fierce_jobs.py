# -*- coding: utf-8 -*-
"""第三關六隻小怪「改兇版」立繪（2026-09-03 使用者：「第三關的小怪感覺像是第一關的，形象也是……越上層怪物越強越兇狠」）。
同一個 id、同一個名字，只換立繪：狐巫女、月蛾女王、地藏石偶（月兔、貓頭鷹哨兵、紙鶴改降到塔中，不重畫）。
其餘（夜豹、魔氣團、天狗、鎧甲武者、幻狐、赤鬼、升上來的墨貓／甲蟲／鼠將軍／法師）本來就夠兇，不動。
跑法：python tools/make_act3_fierce_jobs.py → tools/codex_jobs/act3_fierce.json（檔名跟原圖一樣，接進去就是換掉）
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MID = """

It stands (or hovers) with its feet at the very bottom edge of the picture - do not draw it floating in the middle.
Fill the frame vertically: the monster should reach nearly the top and the bottom of the image.
Readable at small size: bold silhouette, strong shapes, a clear face with a menacing expression.
Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or see-through.
Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.
Style: thick black outlines, flat colors with subtle soft gradients, stylised cartoon look (same style as a cute cat ninja game),
but this one is a top-of-the-tower monster: intimidating, battle-worn, dark palette with one glowing accent colour. Not photorealistic.
Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green in the monster
itself unless the description says so.
Output {SIZE} PNG. Save the image as {ID} in the current directory and report the path."""


def mon(name, desc, idle, attack, size='1024x1024'):
    head = ("A single cartoon monster for a cat ninja tower game, full body, facing left. This is a fierce high-floor monster: "
            "it must look dangerous, powerful and menacing - NOT cute.\n\nThe monster: " + desc + "\n\nPose: ")
    out = {}
    for pose, text in (('idle', idle), ('attack', attack)):
        fid = "monster_%s_%s.png" % (name, pose)
        out[fid] = head + text + MID.replace('{SIZE}', size).replace('{ID}', fid)
    return out


jobs = {}
jobs.update(mon('fox_miko',
    "a nine-tailed demon fox shrine maiden: tall, white-and-crimson miko robes torn at the hem, a cracked white fox mask over her face "
    "with glowing eyes behind it, nine tails wreathed in black-and-blue fox fire, long black claws, holding a ritual staff with black paper streamers",
    "standing still with the staff planted, tails spread wide, fox fire flickering",
    "thrusting the staff to the left as black fox fire roars forward"))
jobs.update(mon('moon_moth_queen',
    "a monstrous moth queen: a large furry dark body, four clawed arms, jagged black-and-violet wings with red moon-shaped eyespots, "
    "glowing white compound eyes, feathery antennae, poisonous glittering dust drifting off the wings",
    "wings spread wide and upright, arms raised, looming",
    "lunging to the left with claws out and wings beating a cloud of poison dust"))
jobs.update(mon('jizo_golem',
    "a corrupted stone jizo statue come alive: cracked grey stone body with red light glowing from the cracks, an angry carved face "
    "with burning red eyes, broken chains around the wrists, moss and blood-red cloth, huge stone fists",
    "standing squarely with both stone fists clenched, cracks glowing",
    "slamming a giant stone fist down to the left, ground shattering"))

out = ROOT / 'tools' / 'codex_jobs' / 'act3_fierce.json'
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
print(out, len(jobs), '張')
