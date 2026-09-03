# -*- coding: utf-8 -*-
"""補動態用的立繪（2026-09-03 晚，使用者：「哪些怪物或主角動作圖片不夠做成動態，用生圖補足」）：
1. 每隻魔物一張「挨打」圖（monster_<id>_hurt.png）：一隻一個工作檔，用牠自己的待機圖當 --ref。
2. 球球兩張：施展忍術（hero_ninja_skill.png）、擲手裡劍（hero_ninja_throw.png），用球球設定表當 --ref。
3. 師父第三階段一張吼（boss_roar3.png），用 idle3 當 --ref。
跑法：python tools/make_hurt_jobs.py → tools/codex_jobs/hurt/*.json ＋ tools/ref/_hurt_refs/<id>.png（待機圖轉 PNG 當參考）
"""
import json, re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tools' / 'codex_jobs' / 'hurt'
REFS = ROOT / 'tools' / 'ref' / '_hurt_refs'
OUT.mkdir(parents=True, exist_ok=True); REFS.mkdir(parents=True, exist_ok=True)

TAIL = ("\nKeep the exact same character design, colours, proportions and art style as the reference - this is the same creature one moment later. "
        "Full body, facing LEFT like the reference, feet at the very bottom edge of the picture, fill the frame vertically.\n"
        "Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.\n"
        "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.\n"
        "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green on the character unless it is green in the reference.\n")

src = (ROOT / 'src' / 'content' / 'enemies.ts').read_text(encoding='utf-8')
defs = re.findall(r"\{ id: '([a-z0-9_]+)', name: '([^']+)', hp: \[\d+, \d+\], pool: '([^']+)', pattern: '\w+', size: '(\w+)', art: '([^']+)'", src)
manifest = json.loads((ROOT / 'public' / 'assets' / 'manifest.json').read_text(encoding='utf-8'))
mon = manifest.get('monsters', {})
enc = re.findall(r"\{ id: '([a-z0-9_]+)', pool: '([^']+)', enemies: \[([^\]]*)\](.*?)\},", src)
first_act = {}
for eid, pool, members, rest in enc:
    a = re.search(r"acts: \[([0-9, ]+)\]", rest)
    acts = [int(x) for x in a.group(1).split(',')] if a else [9]
    for m in re.findall(r"'([a-z0-9_]+)'", members): first_act[m] = min(first_act.get(m, 9), min(acts))

order = []
for mid, name, pool, size, art in defs:
    if art == 'daxia': continue
    entry = mon.get(art) or mon.get(art.replace('codex/', ''))
    if not entry or not entry.get('idle'): continue
    size_px = '768x768' if size == 'small' else '1024x1024'
    ref = REFS / f'{mid}.png'
    if not ref.exists():
        Image.open(ROOT / 'public' / entry['idle']).convert('RGBA').save(ref)
    fid = f'monster_{mid}_hurt.png'
    prompt = (f"The reference image is the idle pose of a cartoon monster ({name}) from a cute cat ninja tower game. "
              "Draw the SAME monster at the moment it gets HIT: recoiling backwards (to the right, since it faces left), body tilted back, "
              "eyes squeezed shut or wide in shock, mouth open in an 'ouch', a couple of small impact stars near the head. Clearly readable as 'taking damage' even at small size."
              + TAIL + f"Output {size_px} PNG. Save the image as {fid} in the current directory and report the path.")
    (OUT / f'{mid}.json').write_text(json.dumps({fid: prompt}, ensure_ascii=False, indent=1), encoding='utf-8')
    order.append((first_act.get(mid, 9), 0 if pool in ('弱', '中', '強') else 1, mid))
order.sort()
(OUT / '_order.txt').write_text('\n'.join(m for _, _, m in order), encoding='utf-8')

hero = {
    'hero_ninja_skill.png': ("The reference image is the character sheet of the hero cat Qiuqiu (grey tabby, dark-blue headband, dark ninja outfit). "
        "Draw the SAME character performing a ninja technique: standing firm facing RIGHT, both paws pressed together in a hand seal in front of the chest, "
        "eyes focused, a few leaves swirling around him, headband tails flying. Same design, colours, proportions and style as the sheet (the bottom-row full-body ninja-outfit look)."
        + TAIL.replace('facing LEFT like the reference', 'facing RIGHT') + "Output 1024x1024 PNG. Save the image as hero_ninja_skill.png in the current directory and report the path."),
    'hero_ninja_throw.png': ("The reference image is the character sheet of the hero cat Qiuqiu (grey tabby, dark-blue headband, dark ninja outfit). "
        "Draw the SAME character throwing a shuriken to the RIGHT: one arm fully extended forward, a single four-point steel shuriken just released with a motion streak, "
        "body leaning forward, determined face. Same design, colours, proportions and style as the sheet (the bottom-row full-body ninja-outfit look)."
        + TAIL.replace('facing LEFT like the reference', 'facing RIGHT') + "Output 1024x1024 PNG. Save the image as hero_ninja_throw.png in the current directory and report the path."),
}
(OUT / '_hero.json').write_text(json.dumps(hero, ensure_ascii=False, indent=1), encoding='utf-8')
boss = {'boss_roar3.png': ("The reference image is the FINAL form of the grey tabby kung-fu master cat (no hat, torn ear, scar over one eye, glowing white eyes, shredded robe, black-purple ghost flames). "
        "Draw the SAME character letting out a furious lion's roar: mouth wide open, head thrown slightly back, both paws clenched at the sides, flames flaring up, shockwave rings coming out of the mouth to the LEFT."
        + TAIL + "Output 1024x1024 PNG. Save the image as boss_roar3.png in the current directory and report the path.")}
(OUT / '_boss.json').write_text(json.dumps(boss, ensure_ascii=False, indent=1), encoding='utf-8')
print('魔物挨打圖', len(order), '張；球球 2 張；師父 1 張')
