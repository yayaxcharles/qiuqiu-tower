# -*- coding: utf-8 -*-
"""菁英擴充（2026-09-03）的生圖工作檔：9 隻菁英＋2 種召喚小怪 × 待機／出手 = 22 張。規格同 make_wave2_monster_jobs.py。
跑法：python tools/make_elite_jobs.py → tools/codex_jobs/elites.json
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


def mon(name, desc, idle, attack, size='1024x1024'):
    head = ("A single cartoon elite monster for a cute game set in a cat ninja tower, full body, facing left. "
            "It should look tougher and more imposing than an ordinary monster.\n\nThe monster: " + desc + "\n\nPose: ")
    out = {}
    for pose, text in (('idle', idle), ('attack', attack)):
        fid = "monster_%s_%s.png" % (name, pose)
        out[fid] = head + text + MID.replace('{SIZE}', size).replace('{ID}', fid)
    return out


jobs = {}
# ===== 第一關 =====
jobs.update(mon('wild_boar',
    "a huge wild boar chieftain with dark bristly fur, two big curved tusks, a scarred snout, a red rope belt with a bell, small angry red eyes",
    "standing squarely, snorting steam from the nose, pawing the ground",
    "charging to the left head-down with tusks forward, dust flying"))
jobs.update(mon('paper_tiger',
    "a tiger made of folded orange paper with black painted stripes, creased angular body like origami, one edge slightly torn, fierce painted eyes",
    "standing tall and stiff like a paper figure, chest puffed out",
    "pouncing to the left with paper claws spread, paper edges rustling", size='768x768'))
jobs.update(mon('drum_tanuki',
    "a fat tanuki drummer wearing a festival happi coat and a twisted headband, a big taiko drum strapped to its belly, two drumsticks, sly smile",
    "standing with drumsticks raised, waiting for the beat",
    "slamming both drumsticks down on the drum, a huge shockwave ring to the left", size='768x768'))
# ===== 第二關 =====
jobs.update(mon('iron_arhat',
    "an iron statue of a cat arhat (Buddhist warrior monk): rusty dark-iron body with riveted plates, a stern serene face, prayer beads, one fist raised, moss in the joints",
    "standing in a rooted horse stance, fist ready, plates gleaming",
    "driving a huge iron palm strike to the left, rivets popping with light"))
jobs.update(mon('shadow_spider',
    "a large spider woven from black shadow threads, eight thin legs, a pale mask-like face with many small glowing eyes, hanging from a silk thread",
    "hovering on its thread just above the ground, legs folded",
    "lunging to the left spitting a burst of sticky white silk", size='768x768'))
jobs.update(mon('drunk_dog',
    "a shiba inu drunken-fist master in a loose open kimono, red cheeks, half-closed eyes, holding a big sake gourd, wobbly stance",
    "swaying tipsily with the gourd raised, hiccup bubble",
    "a wild swinging punch to the left with the gourd flying, sake splashing", size='768x768'))
# ===== 第三關 =====
jobs.update(mon('oni_general',
    "an oni war general: blue-black skin, a single horn, a lacquered samurai helmet with golden crest, full armour with red cords, a massive spiked iron club",
    "standing commanding with the club planted, pointing forward",
    "a sweeping overhead smash of the club to the left, ground cracking"))
jobs.update(mon('imp',
    "a tiny blue imp with one horn, a loincloth, a small wooden spear, mischievous grin",
    "standing with the spear, bouncing", "jabbing the spear to the left", size='512x512'))
jobs.update(mon('mirror_sage',
    "a tall elegant cat sage whose body is a living mirror: silver reflective robes, a bronze mirror for a face showing a faint cat reflection, long sleeves, floating just above the ground",
    "standing serenely, sleeves folded, mirror face glowing softly",
    "a beam of white mirror light shooting to the left from the mirror face"))
jobs.update(mon('mirror_shard',
    "a floating jagged shard of silver mirror with a small cat-eye reflection inside it, sharp edges",
    "hovering, glinting", "darting to the left point-first with light streaks", size='512x512'))
jobs.update(mon('void_cat',
    "a large cat made of night sky: pitch-black body with tiny stars inside it, glowing violet eyes and claws, edges dissolving into wisps but drawn SOLID, a torn violet scarf",
    "sitting upright, half its body fading into starry mist",
    "lunging to the left with violet claws, black flames trailing"))

out = ROOT / 'tools' / 'codex_jobs' / 'elites.json'
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
print(out, len(jobs), '張')
