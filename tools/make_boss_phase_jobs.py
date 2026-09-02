# -*- coding: utf-8 -*-
"""師父（走火入魔的大俠貓）第二、三階段的專屬姿勢，與球球兩張狀態立繪。

使用者 2026-09-02：「師傅三個階段外觀都一樣」——第二階段其實有一張走火入魔待機（idle2），
但出招的姿勢全部借第一階段的圖，打起來看不出換了階段；第三階段連待機都沒有。
這裡補：第二階段三個出招姿勢（沿用 idle2 的破衣＋漩渦眼造型，參考圖 boss_ref2.png）、
第三階段待機＋三個出招（新造型：斗笠飛掉、毛全炸開、眼睛發白光、黑紫氣焰，參考圖 boss_ref.png 只給臉與衣著），
球球兩張：爪力堆高的「氣勢」與血量見底的「掛彩」（參考圖 hero_combat_ref.png）。

--ref 是整批套用的，所以拆成三個工作檔，跑的時候各附各的參考圖：
  python tools/codex_gen.py tools/codex_jobs/boss_phase2.json --ref tools/ref/boss_ref2.png
  python tools/codex_gen.py tools/codex_jobs/boss_phase3.json --ref tools/ref/boss_ref.png
  python tools/codex_gen.py tools/codex_jobs/hero_states.json --ref tools/ref/hero_combat_ref.png
產出用 tools/pack_boss_phase.py 收進既有的共用畫布（不能走 build_art_inbox，它只會用收件匣裡的圖重算畫布）。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TAIL = """

Full body, facing LEFT, feet at the very bottom edge of the picture, do not draw it floating. Fill the frame vertically.
Keep the exact same character design as the reference image (same face, same fur pattern, same clothing) - only the pose,
expression and the listed changes differ.
Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or see-through.
Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.
Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.
Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green on the character.
Output {SIZE} PNG. Save the image as {ID} in the current directory and report the path."""


def job(fid, body, size):
    return body + TAIL.replace('{SIZE}', size).replace('{ID}', fid)


P2 = ("The character: the grey tabby cat kung-fu master from the reference image in his 'gone berserk' form - "
      "torn ragged robe, straw hat, spiral hypnotised eyes, bared teeth, fur bristling, thin wisps of dark smoke "
      "rising off him.\n\nPose: ")
boss2 = {
    "boss_palm2.png": job("boss_palm2.png", P2 + "lunging forward with a flurry of open-paw palm strikes, both paws blurred with motion lines, teeth bared", '1024x1024'),
    "boss_drunk2.png": job("boss_drunk2.png", P2 + "staggering wildly like a drunken boxer, body twisted mid-spin, one paw up one paw down, spiral eyes wide", '1024x1024'),
    "boss_guard2.png": job("boss_guard2.png", P2 + "crouching low with both forearms crossed in front of the face in an iron guard, a faint golden bell-shaped shimmer around him", '1024x1024'),
}

P3 = ("The character: the grey tabby cat kung-fu master from the reference image, but in his FINAL true form: the straw "
      "hat is gone (a torn ear and a scar across one eye now show), his eyes glow pure white with no pupils, his fur "
      "stands fully on end, the robe is shredded to the waist showing a muscular striped torso, black-purple ghost "
      "flames flicker around his paws and shoulders, claws fully out.\n\nPose: ")
boss3 = {
    "boss_idle3.png": job("boss_idle3.png", P3 + "standing perfectly still in a low wide horse stance, arms slightly out, radiating menace", '1024x1024'),
    "boss_headbutt3.png": job("boss_headbutt3.png", P3 + "launching forward head first in a devastating charge, whole body stretched horizontal, flames trailing behind", '1024x1024'),
    "boss_palm3.png": job("boss_palm3.png", P3 + "a single huge two-palm thrust toward the viewer's left, arms fully extended, a shockwave ring of purple flame around the paws", '1024x1024'),
    "boss_guard3.png": job("boss_guard3.png", P3 + "sitting cross-legged in meditation mid-air a few centimetres above the ground, paws in a mudra, flames sinking calm around him, eyes still glowing", '1024x1024'),
}

H = ("The character: the small grey tabby kitten ninja from the reference image (dark navy ninja suit and headband, "
     "big round eyes).\n\nPose: ")
hero = {
    "hero_ninja_power.png": job("hero_ninja_power.png", H + "crouched low in a fierce fighting stance, both claws out and glowing orange-gold, a small golden aura around the body, eyes narrowed and blazing with determination", '896x896'),
    "hero_ninja_hurt.png": job("hero_ninja_hurt.png", H + "battered and panting: headband slipped over one eye, a cross-shaped plaster on the cheek, fur scuffed and dusty, standing hunched with paws on knees, small sweat drops, but still stubborn", '896x896'),
}

for name, jobs in (("boss_phase2.json", boss2), ("boss_phase3.json", boss3), ("hero_states.json", hero)):
    out = ROOT / "tools" / "codex_jobs" / name
    out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out, len(jobs))
