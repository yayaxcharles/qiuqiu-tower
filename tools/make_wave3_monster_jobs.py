# -*- coding: utf-8 -*-
"""怪物擴充・第三波（2026-09-04）的生圖工作檔：14 個立繪鍵 × 待機／出手＝28 張，兩個菁英再各一張挨打＝30 張。

規格同 make_wave2_monster_jobs.py（面朝左、綠幕去背、滿版、實心不透明）。跑法：
  python tools/make_wave3_monster_jobs.py            → tools/codex_jobs/monsters_wave3.json
  背景腳本 art_wave3.sh 一張一張生（額度撞牆就等），生完自動接入並拿掉遭遇的 hidden。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MID = """

It stands (or floats just above) the ground with its feet at the very bottom edge of the picture.
Fill the frame vertically: the monster should reach nearly the top and the bottom of the image.
Readable at small size: bold silhouette, strong shapes, a clear cartoon face.
Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or see-through.
Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.
Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.
ANATOMY RULE: count the limbs before finishing - exactly the number described, no extra arms or legs.
Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green in the monster
itself unless the description says so.
Output {SIZE} PNG. Save the image as {ID} in the current directory and report the path."""

HURT = "at the moment it gets HIT: recoiling backwards (to the right, since it faces left), body tilted back, eyes squeezed shut or wide in shock, mouth open in an 'ouch', a couple of small impact stars near the head"


def mon(name, desc, idle, attack, size='768x768', hurt=False):
    head = ("A single cartoon monster for a cute game set in a cat ninja tower (Japanese yokai flavour), full body, facing left.\n\n"
            "The monster: " + desc + "\n\nPose: ")
    out = {}
    poses = [('idle', idle), ('attack', attack)] + ([('hurt', HURT)] if hurt else [])
    for pose, text in poses:
        fid = "monster_%s_%s.png" % (name, pose)
        out[fid] = head + text + MID.replace('{SIZE}', size).replace('{ID}', fid)
    return out


jobs = {}
# ===== 塔中（和風妖怪） =====
jobs.update(mon('snow_cat',
    "a slender pale-blue-white cat yokai in a white kimono with snowflake patterns, long white hair with frost on the tips, "
    "calm half-closed icy blue eyes, a faint cold mist around her paws; two arms, two legs",
    "standing gracefully, one paw raised with a wisp of frost, exhaling a small puff of white breath",
    "leaning forward blowing a big cone of icy breath to the LEFT, hair whipping back"))
jobs.update(mon('fortune_cat',
    "a chubby white-and-orange maneki-neko lucky cat, red collar with a golden bell, a big gold coin held against its belly, "
    "one paw raised in the classic beckoning pose, painted-ceramic look but alive; two arms, two legs",
    "sitting upright beckoning with the raised paw, smug half-smile",
    "hurling a shower of gold coins to the LEFT with both paws, bell swinging, eyes gleaming"))
jobs.update(mon('lantern_fish',
    "a round deep-sea anglerfish yokai floating in the air, dark navy scales, a glowing orange lure lantern dangling from its head, "
    "a wide mouth full of tiny needle teeth, small fins; no arms or legs",
    "hovering just above the ground with the lantern glowing softly, mouth slightly open",
    "lunging to the LEFT with jaws wide open and the lantern flaring bright"))
jobs.update(mon('puppeteer',
    "a thin hunched cat puppeteer in a dark hooded robe, face hidden except two glinting eyes, long thin fingers with glowing "
    "red strings hanging from them, a small wooden puppet dangling from one hand; two arms, two legs",
    "standing hunched, fingers spread with strings hanging, the puppet dangling limp",
    "both hands thrust to the LEFT pulling the strings taut, robe flaring, the puppet flung forward"))
jobs.update(mon('puppet',
    "a small jointed wooden marionette cat, ball joints, painted face with round eyes and a red mouth, "
    "two red strings rising from its shoulders; two arms, two legs",
    "standing stiffly with arms dangling, head tilted",
    "swinging a wooden fist to the LEFT, joints clicking, one leg raised", size='512x512'))
jobs.update(mon('shuten_imp',
    "a short stocky red oni imp with two small horns, wild black hair, a tiger-stripe loincloth, red cheeks from drinking, "
    "a big sake gourd in one hand and a sake bottle in the other; two arms, two legs",
    "standing wobbly with a happy drunk grin, gourd raised to drink",
    "smashing the sake bottle down to the LEFT with a wild yell, gourd swinging"))
jobs.update(mon('lantern_twin',
    "a paper lantern yokai: a cylindrical red-and-white paper lantern with a mischievous painted face, a single orange flame "
    "glowing inside, two thin stick-like legs and two stick arms; exactly two arms, two legs",
    "standing on its stick legs, flame glowing steadily, cheeky grin",
    "leaning to the LEFT with the flame flaring out of its mouth like a fireball", size='512x512'))
# ===== 塔頂（魔氣） =====
jobs.update(mon('miasma_crows',
    "a swirling flock of black crows fused into one monster-shaped mass, dozens of glowing red eyes, wisps of dark purple miasma "
    "trailing off the feathers, a few crows peeling away at the edges; wings only, no arms or legs",
    "hovering just above the ground as a dense flock shaped like a hunched beast, eyes glaring",
    "the flock surging to the LEFT as a spear of crows, beaks open"))
jobs.update(mon('crow_small',
    "a small tight flock of five black crows with glowing red eyes and faint purple miasma, flying as one clump; wings only",
    "hovering low in a loose ball, wings half spread",
    "darting to the LEFT with beaks open", size='512x512'))
jobs.update(mon('wraith_samurai',
    "an empty suit of dark samurai armour animated by a ghostly purple flame where the head should be, tattered cape, "
    "a long katana held in gauntleted hands, faint purple smoke rising from every gap; two arms, two legs",
    "standing in a low ready stance, katana held low, flame flickering in the helmet",
    "mid-slash to the LEFT with the katana leaving a purple arc, cape flying"))
jobs.update(mon('twin_hound',
    "a big two-headed black demon dog with glowing purple eyes, both heads snarling, spiked collar shared between the necks, "
    "muscular body, purple miasma dripping from the fangs; two heads, four legs",
    "standing with both heads low and growling, hackles raised",
    "pouncing to the LEFT with both jaws wide open, front legs outstretched", size='1024x1024'))
jobs.update(mon('guardian_statue',
    "a massive ancient stone guardian statue of a fierce cat-lion, cracked grey stone with glowing purple runes in the cracks, "
    "moss patches, stone armour plates, sitting on a stone pedestal base; two arms, two legs",
    "sitting upright on its pedestal like a temple guardian, eyes glowing purple, perfectly still",
    "rising up and slamming a huge stone fist down to the LEFT, cracks flaring with purple light", size='1024x1024', hurt=True))
jobs.update(mon('mask_dancer',
    "a slender cat dancer in a flowing black-and-red kimono with long sleeves, wearing a white smiling Noh mask, "
    "two more masks (an angry red one and a crying blue one) hanging at the hip, holding a folding fan; two arms, two legs",
    "poised on one foot in a dance pose, fan open, the smiling mask facing the viewer",
    "spinning to the LEFT mid-dance, sleeves and fan sweeping, the angry red mask now on the face", size='1024x1024', hurt=True))

out = ROOT / 'tools' / 'codex_jobs' / 'monsters_wave3.json'
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
print(len(jobs), '張 →', out)
