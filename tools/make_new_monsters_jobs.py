# -*- coding: utf-8 -*-
"""2026-09-02 補怪：塔中三隻、塔頂三隻的生圖工作檔。

使用者玩到塔中／塔頂一直遇到同樣的怪（單怪池只有 7／4 隻），混編配對治標，
這批是真的新怪、各帶一個既有怪沒有的路數。規格同 make_act23_jobs.py。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MID = """

It stands (or rests) on the ground with its feet at the very bottom edge of the picture - do not draw it floating.
Fill the frame vertically: the monster should reach nearly the top and the bottom of the image.
Readable at small size: bold silhouette, strong shapes, a clear cartoon face.
Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or see-through.
Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.
Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.
Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green in the monster
itself unless the description says so.
Output {SIZE} PNG. Save the image as {ID} in the current directory and report the path."""


def mon(name, desc, idle, attack, size='768x768'):
    head = ("A single cartoon monster for a cute game set in a cat ninja tower, full body, facing left.\n\n"
            "The monster: " + desc + "\n\nPose: ")
    out = {}
    for pose, text in (('idle', idle), ('attack', attack)):
        fid = "monster_%s_%s.png" % (name, pose)
        out[fid] = head + text + MID.replace('{SIZE}', size).replace('{ID}', fid)
    return out


jobs = {}

# ===== 塔中 =====
jobs.update(mon('kasa_obake',
    "a kasa-obake: an old oil-paper umbrella spirit, faded purple-red paper with a torn patch, one big round "
    "eye in the middle of the canopy, a long red tongue lolling from a wide grin, hopping on a single bare "
    "leg with a wooden geta sandal, two thin arms",
    "balancing on its one leg, umbrella half open, tongue out, leaning slightly",
    "spinning with the umbrella fully open like a whirling blade, tongue flying sideways, motion lines"))
jobs.update(mon('kappa',
    "a chubby kappa (river imp) with mossy olive-brown skin, a turtle shell on its back, a shallow water dish "
    "on top of its head brimming with water, webbed hands, a duck-like beak, a big cucumber tucked under one arm",
    "standing knees bent with hands on knees in a sumo crouch, beak set in a determined pout",
    "lunging forward with both webbed hands out to grapple, water splashing out of the head dish"))
jobs.update(mon('tofu_boy',
    "a tofu-kozo: a small child spirit wearing a huge conical bamboo hat that hides its eyes, a blue kimono, "
    "one big fang showing in a shy smile, holding out a tray with a wobbling white block of tofu with a red "
    "maple leaf on top",
    "holding the tofu tray out politely with both hands, head tilted",
    "flinging the tofu block off the tray toward the viewer, tofu mid-air wobbling, hat tipping back"))

# ===== 塔頂 =====
jobs.update(mon('tengu',
    "a karasu-tengu: a crow-headed mountain goblin with black feathers, a long beak, black wings folded on the "
    "back, wearing a yamabushi monk outfit with a tiny black cap and red pom-poms, holding a large feathered "
    "fan (hauchiwa), standing on tall one-tooth geta sandals",
    "standing tall with wings folded, fan resting on the shoulder, chin raised arrogantly",
    "wings spread wide, swinging the feather fan forward to blast a gust, feathers scattering"))
jobs.update(mon('fox_miko',
    "a white fox spirit shrine maiden standing upright on two legs, snow-white fur with red markings around "
    "the eyes, wearing a red-and-white miko outfit, holding a wand with folded paper streamers (gohei), "
    "two blue fox-fire flames floating beside her, a bushy white tail",
    "standing gracefully with the wand held vertically in front, eyes half closed, flames drifting",
    "sweeping the wand sideways as paper streamers whip out and the blue flames flare into small fox shapes"))
jobs.update(mon('armor_ghost',
    "a haunted empty suit of samurai cat armor with no body inside: black lacquered plates with red cords, a "
    "helmet with cat-ear shaped crests, two glowing red eyes floating in the dark hollow of the helmet, "
    "holding a big rectangular wooden shield in one gauntlet and a short spear in the other",
    "standing square behind the wooden shield, spear held upright, eyes glowing steadily",
    "thrusting the spear forward over the top of the shield, armor plates rattling apart slightly"))

out = ROOT / "tools" / "codex_jobs" / "new_monsters_0902.json"
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
print(out, len(jobs))
