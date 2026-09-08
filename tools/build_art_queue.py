# -*- coding: utf-8 -*-
"""
build_art_queue.py — 建 2026-09-08 補圖長隊的五份工單（不生圖，只寫 JSON）。

用法：python tools/build_art_queue.py
  產出（都在 tools/codex_jobs/）：
    hero_states2.json      球球第二批 4 張：翻肚待機、噎到待機、凝神（能力牌）、翻卷軸（抽牌）
    boss_moves2.json       師父 4 張：第二階段缺的頭槌、獅吼；第三階段缺的醉拳；真面目跪倒的戰敗圖 defeat3
    event_art3.json        事件插圖 5 張（原本沒插圖、只有文字的那五個）
    monster_hurt_act1.json 第一關魔物挨打圖 27 隻
    monster_hurt_rest.json 其餘魔物挨打圖 49 隻
  然後依序跑：for j in ...; do python tools/codex_gen.py tools/codex_jobs/$j.json; done

每一條工單自帶參考圖（codex_gen.py 2026-09-08 起支援 {"prompt","ref"}）：
  球球配 tools/ref/hero_combat_ref.png，師父配 boss_ref2.png，
  魔物各配自己的待機原稿 tools/codex_raw/monster_<id>_idle.png；沒原稿的老怪把遊戲裡的待機圖
  鋪白底存到 tools/ref/monster_refs/ 當參考。角色沒附參考圖每張長相都會不一樣（codex_gen.py 的坑 4）。
魔物的描述文字從 tools/codex_prompts/subjects.json 拿，沒有的就只寫「照參考圖那隻」——參考圖本來就會被讀成「要畫這個」。
"""
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
JOBS = ROOT / "tools" / "codex_jobs"
RAW = ROOT / "tools" / "codex_raw"
REFDIR = ROOT / "tools" / "ref" / "monster_refs"


def dump(name: str, jobs: dict) -> None:
    (JOBS / name).write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{name}: {len(jobs)} 張")


# ---------- 球球第二批 ----------
HERO_CH = ("The character: the small grey tabby kitten ninja from the reference image "
           "(dark navy ninja suit and headband, big round eyes).\n\nPose: ")
HERO_TAIL = (
    "\n\nFull body, facing RIGHT (toward the right edge of the picture), feet at the very bottom edge of the picture, "
    "do not draw it floating. Fill the frame vertically.\n"
    "Keep the exact same character design as the reference image (same face, same fur pattern, same clothing) - "
    "only the pose and expression differ.\n"
    "The action must be big and readable at small size: bold silhouette, strong shapes. Only ONE character in the picture.\n"
    "Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or see-through.\n"
    "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.\n"
    "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green on the character.\n"
    "Output 1024x1024 PNG. Save the image as {name} in the current directory and report the path.")
HERO2 = {
    "hero_ninja_dizzy.png": ("dazed and wobbly after being flipped over: standing with knees buckled and arms hanging loose, "
                             "eyes drawn as little spirals, mouth a wavy line, three tiny yellow stars circling above the head, "
                             "headband tails drooping"),
    "hero_ninja_choke.png": ("choking: both paws clutching his own throat, eyes bulging wide, cheeks puffed out, "
                             "tongue slightly out, a few small sweat drops flying off, knees bent"),
    "hero_ninja_focus.png": ("gathering inner power: standing straight and still, eyes closed calmly, both paws pressed "
                             "together in a ninja hand seal in front of the chest, a small ring of golden sparkles around "
                             "the body, headband tails floating upward"),
    "hero_ninja_scroll.png": ("reading a secret scroll: holding a partly unrolled paper scroll open with both paws at "
                              "chest height, one eyebrow raised, tail curled up with curiosity"),
}

# ---------- 師父 ----------
B2 = ("The character: the grey tabby cat kung-fu master from the reference image in his berserk form - torn ragged robe, "
      "straw hat, spiral hypnotised eyes, bared teeth, fur bristling, thin wisps of dark grey smoke rising off him.\n\nPose: ")
B3 = ("The character: the grey tabby cat kung-fu master from the reference image, but in his FINAL true form: the straw hat "
      "is gone (a torn ear and a scar across one eye now show), his eyes glow pure white with no pupils, his fur stands fully "
      "on end, the robe is shredded to the waist showing a muscular striped torso, black-purple ghost flames flicker around "
      "his paws and shoulders, claws fully out.\n\nPose: ")
BOSS_TAIL = (
    "\n\nFull body, facing LEFT, feet at the very bottom edge of the picture, do not draw it floating. Fill the frame vertically.\n"
    "Keep the exact same character design as the reference image (same face, same fur pattern, same clothing) - only the pose,\n"
    "expression and the listed changes differ.\n"
    "Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or see-through.\n"
    "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.\n"
    "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green on the character.\n"
    "Output 1024x1024 PNG. Save the image as {name} in the current directory and report the path.")
BOSS = {
    "boss_headbutt2.png": B2 + ("launching forward head first in a wild charge, hat brim tipped down like a battering ram, "
                                "whole body stretched forward, smoke streaking behind"),
    "boss_roar2.png": B2 + ("a huge roar toward the left: mouth wide open showing all the teeth, eyes spiralling, "
                            "both fists clenched at the sides, three curved shockwave lines bursting from the mouth"),
    "boss_drunk3.png": B3 + ("a lurching drunken-boxing stance: one leg lifted, body swaying sideways, one clawed paw "
                             "dangling loose and the other raised crooked, flames wobbling with the sway, a mad grin"),
    # 2026-09-08 使用者要的第四張：真面目跪倒、鬼火熄滅（原本的 defeat 是第一階段戴斗笠的樣子，他其實是在第三階段倒下的）
    "boss_defeat3.png": ("The character: the grey tabby cat kung-fu master exactly as shown in the reference image - his true form: "
                         "no hat, a torn ear, a scar across one eye, fur standing on end, the robe shredded to the waist showing a "
                         "muscular striped torso, claws out. But the fight is over: his eyes are closed and exhausted (NO white glow), "
                         "and every ghost flame has gone out - NO flames anywhere on him, only two or three thin wisps of grey smoke "
                         "drifting up from his shoulders and paws.\n\nPose: "
                         "collapsed onto one knee with the other leg folded under him, one clawed paw planted flat on the ground "
                         "propping himself up, the other arm hanging limp, head bowed low, shoulders slumped, mouth slightly open "
                         "panting, tail lying flat on the ground - beaten but still dignified, facing LEFT"),
}
# 這張要照第三階段的待機原稿畫（真面目的長相），其他三張照 boss_ref2.png
BOSS_REF = {"boss_defeat3.png": "tools/codex_raw/boss_idle3.png"}
# 球球的擲姿重生：原稿手裡劍畫得太遠、整張比高還寬，貼進畫布只能縮 14%（稽核 2026-09-08 中-2）。
# 球球那批已經在跑、工單改不進去，搭師父這批的順風車（每條工單自帶參考圖，放哪個檔都一樣）
HERO_EXTRA = {
    "hero_ninja_throw2.png": HERO_CH + ("throwing a shuriken: side-on throwing stance, the throwing arm extended forward at "
                                        "shoulder height, the other paw pulled back, knees bent. The shuriken is SMALL (about the "
                                        "size of his paw) and drawn right at his fingertips, just leaving the paw - NOT far in front "
                                        "of him, no speed lines. The whole character must fit inside a square: not wider than it is tall")
                             + HERO_TAIL.format(name="hero_ninja_throw2.png"),
}

# ---------- 事件：拿既有事件範本，換掉 Scene 那一段 ----------
EVENTS = {
    "event_toll_again_paid.png": ("at a corner of the tower stairs, the scruffy orange tabby cat bandit has just dropped his "
                                  "wooden club on the floor in surprise, and is nervously holding out a small cloth bundle "
                                  "with both paws to the ninja cat hero, eyes shy and grateful"),
    "event_toll_again_fought.png": ("at a corner of the tower stairs, the scruffy orange tabby cat bandit stands with two more "
                                    "scruffy cat bandits beside him, all three gripping wooden clubs, all three with knees "
                                    "visibly trembling, trying to look tough at the ninja cat hero"),
    "event_rescue_return_herb.png": ("a thin grey village cat with a freshly healed hind leg leaps happily out of a dark "
                                     "stairwell and presses a lucky charm made of dried fish strung on a red cord into the "
                                     "ninja cat hero's paws"),
    "event_rescue_return_fish.png": ("a bone-thin, ragged village cat slumped against the stone wall of the tower, head lifted "
                                     "to look silently at the ninja cat hero, an empty torn fish-bundle wrapper on the floor "
                                     "beside it, dim and quiet mood"),
    "event_robin_feast.png": ("a warm stairwell landing where a group of scruffy village cats crowd around a big steaming pot "
                              "of fish soup over a small fire, all of them standing up and beaming to welcome the ninja cat "
                              "hero, one waving him over to sit"),
}

# ---------- 魔物挨打 ----------
MON_TAIL = (
    "\n\nIt stands on the ground with its feet at the very bottom edge of the picture - do not draw it floating. "
    "Full body, facing LEFT. Fill the frame vertically.\n"
    "Keep the exact same creature design as the reference image (same face, same colours, same shapes, same clothing "
    "if any) - only the pose and expression differ. Only ONE creature in the picture.\n"
    "The recoil must be big and readable at small size: bold silhouette, strong shapes.\n"
    "Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or see-through.\n"
    "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.\n"
    "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green on the creature.\n"
    "Output 1024x1024 PNG. Save the image as {name} in the current directory and report the path.")
MON_POSE = ("\n\nPose: just took a heavy hit - recoiling back and away to the right, body twisted or squashed by the impact, "
            "eyes squeezed shut (or one eye shut), mouth open in a yelp of pain, a few short black impact lines at the "
            "point of impact")


def main() -> None:
    dump("hero_states2.json", {k: {"prompt": HERO_CH + v + HERO_TAIL.format(name=k), "ref": "tools/ref/hero_combat_ref.png"}
                               for k, v in HERO2.items()})
    dump("boss_moves2.json", {**{k: {"prompt": v + BOSS_TAIL.format(name=k), "ref": BOSS_REF.get(k, "tools/ref/boss_ref2.png")}
                                 for k, v in BOSS.items()},
                              **{k: {"prompt": v, "ref": "tools/ref/hero_combat_ref.png"} for k, v in HERO_EXTRA.items()}})

    tmpl = json.loads((JOBS / "event_art.json").read_text(encoding="utf-8"))["event_toll.png"]
    head, rest = tmpl.split("Scene:", 1)
    after_scene = rest.split("\n\n", 1)[1].replace("event_toll.png", "{name}")
    dump("event_art3.json", {k: head + "Scene: " + v + "\n\n" + after_scene.format(name=k) for k, v in EVENTS.items()})

    manifest = json.loads((ROOT / "public" / "assets" / "manifest.json").read_text(encoding="utf-8"))
    subjects = json.loads((ROOT / "tools" / "codex_prompts" / "subjects.json").read_text(encoding="utf-8"))
    src = (ROOT / "src" / "content" / "enemies.ts").read_text(encoding="utf-8")
    act1: set[str] = set()
    # 沒寫 acts 的遭遇各關都會用（事件對決的白貓就是），也算第一關；acts: [] 才是真的排除（稽核 2026-09-08 低-2）
    for m in re.finditer(r"\{ id: '[^']+', pool: '[^']+', enemies: \[([^\]]+)\]([^}]*)\}", src):
        acts = re.search(r"acts: \[([^\]]*)\]", m.group(2))
        if acts is None or "1" in acts.group(1).split(","):
            act1.update(re.findall(r"'([^']+)'", m.group(1)))
    # 被召喚／分裂出來的小怪（貓又尾巴、小團子）不在遭遇名單裡，但第一關就會冒出來
    act1.update(re.findall(r"(?:kind: 'summon'|splitInto: \{)[^}]*?enemyId: '([^']+)'", src))
    missing = [k.split("/")[-1][len("monster_"):] for k, poses in manifest["monsters"].items() if "hurt" not in poses]
    REFDIR.mkdir(parents=True, exist_ok=True)

    def mon_job(mid: str) -> tuple[str, dict]:
        name = f"monster_{mid}_hurt.png"
        raw = RAW / f"monster_{mid}_idle.png"
        if raw.exists():
            ref = str(raw.relative_to(ROOT)).replace("\\", "/")
        else:
            im = Image.open(ROOT / "public" / "assets" / "monsters" / f"{mid}_idle.webp").convert("RGBA")
            bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
            bg.paste(im, (0, 0), im)
            out = REFDIR / f"{mid}_idle.png"
            bg.convert("RGB").save(out)
            ref = str(out.relative_to(ROOT)).replace("\\", "/")
        desc = subjects.get(f"monsters/{mid}_idle", {}).get("subject")
        who = f"The creature: {desc}" if desc else "The creature: exactly the monster shown in the reference image."
        return name, {"prompt": who + MON_POSE + MON_TAIL.format(name=name), "ref": ref}

    first = [x for x in missing if x in act1]
    rest_m = [x for x in missing if x not in act1]
    dump("monster_hurt_act1.json", dict(mon_job(x) for x in first))
    dump("monster_hurt_rest.json", dict(mon_job(x) for x in rest_m))


if __name__ == "__main__":
    main()
