# -*- coding: utf-8 -*-
"""
build_block_queue.py — 建「甲包」的四份工單（不生圖，只寫 JSON）。

用法：python tools/build_block_queue.py
  產出（都在 tools/codex_jobs/）：
    monster_block_common.json 一般會格擋的魔物（弱／中／強／召喚），防禦姿勢
    monster_block_elite.json  大魔物與塔主的防禦姿勢
    status_icons2.json        六個沒圖示的狀態：縮殼、飛行、鱗甲、沉睡、消散、虛化
    shopkeeper2.json          罐頭鋪老闆兩張表情：成交、錢不夠
  然後一批一批跑（codex_gen.py 的坑 1，一次只跑一批）：
    for j in monster_block_common monster_block_elite status_icons2 shopkeeper2; \
      do python tools/codex_gen.py --max-wait-hours 40 tools/codex_jobs/$j.json; done

為什麼要防禦姿勢：`MonsterPose` 型別裡本來就有 `block`，但一張都沒生過，
`combat.ts` 選圖也只認出招／挨打／待機。魔物縮起來擋你那一拍，畫面上牠還是站得直挺挺的待機圖，
只有旁邊多一個「防禦 14」的小牌子——玩家看不出這回合不該硬打。

沿用挨打那批的規約（`build_art_queue.py`）：
- 每條工單自帶參考圖：優先用該怪的待機原稿 `tools/codex_raw/monster_<id>_idle.png`，
  沒原稿的把遊戲裡的待機圖鋪白底存到 `tools/ref/monster_refs/`。角色沒附參考圖每張長相都會不一樣（坑 4）。
- 魔物的描述文字從 `tools/codex_prompts/subjects.json` 拿；**57 隻裡有 51 隻沒有條目**，
  全部走退路那句「exactly the monster shown in the reference image」。每條工單都帶參考圖，
  參考圖本來就會被讀成「要畫這個」，所以沒描述也畫得對（前四張人眼驗過）。
- 提示詞裡不提「綠色」、不要半透明（坑 5）——虛化那個圖示尤其要注意，它的意思就是半透明，
  但畫成半透明會讓綠幕從身體裡透出來，去背後整張帶綠。改用「實心淡色＋錯位殘影」表達。

挨打那批的教訓也帶過來：橫躺型魔物（黃瓜、大黃瓜）如果不特別交代，模型會把牠立起來變短。
所以尾巴那段寫死「保持跟參考圖一樣的朝向與長寬比例」。
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


# ---------- 魔物防禦姿勢 ----------
BLOCK_POSE = (
    "\n\nPose: BRACING against an incoming blow - it has NOT been hit, it is not in pain. "
    "It hunkers down low and makes itself compact and solid, weight settled, leaning slightly into the attack. "
    "If the creature has arms or paws, both are raised and crossed in front of its face and chest like a shield; "
    "if it has no arms or limbs, it pulls everything in tight and turns its toughest, thickest side to the front. "
    "Eyes OPEN, narrowed and set - never closed, never crying out. Mouth shut in a hard line. "
    "No impact stars, no pain lines, no motion streaks: this must read as 'guarding' and must look clearly "
    "DIFFERENT from 'being hit' at a single glance")
BLOCK_TAIL = (
    "\n\nIt stands on the ground with its feet at the very bottom edge of the picture - do not draw it floating. "
    "Full body, facing LEFT. Fill the frame vertically.\n"
    "Keep the exact same creature design as the reference image (same face, same colours, same shapes, same clothing "
    "if any) - only the pose and expression differ. Only ONE creature in the picture.\n"
    "Keep the same overall orientation and proportions as the reference: if the creature lies down, sprawls, or is "
    "wider than it is tall in the reference, keep it exactly that way - do NOT stand it up and do NOT make it shorter.\n"
    "The guard must be big and readable at small size: bold silhouette, strong shapes.\n"
    "Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or see-through.\n"
    "Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.\n"
    "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green on the creature.\n"
    "Output 1024x1024 PNG. Save the image as {name} in the current directory and report the path.")


# ---------- 六個狀態圖示 ----------
# 一律照 icons2.json 的單物件圖示範本，只換中間那句「畫什麼」。
ICON_HEAD = "A single game status icon, one object only, centred, drawn as flat cartoon art.\n\nThe object: "
ICON_TAIL = (
    "\n\nIt is shown at about 40 pixels across in the game, so it must read from its silhouette and its main colour "
    "alone: one bold shape, high contrast, no fine detail, no small parts.\n"
    "Draw it SOLID and OPAQUE - flat filled colour with a little soft shading. Nothing transparent or see-through.\n"
    "Nothing else in the picture: no hand, no character, no ground, no shadow, no text, no letters, no numbers, "
    "no watermark.\n"
    "Style: thick black outlines, flat colors, cute cartoon look, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green in the object.\n"
    "Output 512x512 PNG. Save the image as {name} in the current directory and report the path.")

STATUS_ICONS = {
    # 縮殼：第一次被打痛就縮回殼裡，長出防禦
    "status_curl.png": (
        "a small animal curled up into a tight defensive ball, seen from the side, so that only its rounded "
        "armoured back shows - warm chestnut brown with a few thick banded plates across it, a stubby striped "
        "tail tucked in at the bottom, one small ear folded flat against the ball. A closed, compact, "
        "unbreakable-looking sphere"),
    # 飛行：在天上飛，攻擊只打得到一半
    "status_fly.png": (
        "a pair of spread bird wings, one on each side, seen from the front, feathers fanned out and lifted "
        "upward, pale cream white with soft grey-blue tips and a thick dark outline. Symmetrical, wide, and "
        "clearly airborne"),
    # 鱗甲：回合結束長出防禦，被打痛剝落一層
    "status_plate.png": (
        "a rounded patch of overlapping armour scales, like the hide of a dragon, arranged in three neat "
        "staggered rows, each scale a rounded teal-blue plate with a paler highlight along its top edge and a "
        "thick dark outline. Hard, layered and interlocking"),
    # 沉睡：睡著了什麼都不做，打痛牠會醒
    "status_sleep.png": (
        "a soft floppy night cap, the classic long cone-shaped sleeping cap with a folded brim and a round "
        "fluffy pompom drooping off its tip, dusty indigo blue with a cream brim and pompom. Slouched and "
        "sleepy-looking"),
    # 消散：再過幾回合自己散掉
    "status_fade.png": (
        "a small rounded ghostly blob whose lower half is breaking apart and rising away as a scatter of "
        "separate round dots of decreasing size, pale lavender with a dusty violet shadow and a thick dark "
        "outline. The top half is still whole and solid, the bottom half has come apart into drifting pieces"),
    # 虛化：身體半透明，每一下最多受 1 點傷
    # 不能真的畫半透明（坑 5：綠幕會從身體裡透出來，去背後帶綠）。改用「實心淡色本體＋錯位殘影」表達。
    "status_phase.png": (
        "a simple rounded cat head shape drawn twice, offset from each other like a double exposure: the front "
        "one solid pale ice-blue with a thick dark outline and two narrow closed-looking eyes, and behind it, "
        "shifted up and to the right, a second copy of the same shape drawn as a flat solid slightly darker "
        "blue-grey silhouette with no face. Two hard-edged solid layers, out of register - an after-image, "
        "nothing faded or blurred"),
}


# ---------- 罐頭鋪老闆兩張表情 ----------
# 現有 shop/keeper 是招呼的中性表情，補「成交」與「錢不夠」。
# 提示詞照 shopkeeper.json 那張的角色描述，只換 Pose 那一段，畫布之後用 add_sprite.py 照 keeper.webp 貼。
KEEPER_CH = (
    "A single cartoon shopkeeper character for a cute game set in a cat ninja tower, full body, facing left.\n\n"
    "The character: exactly the plump ginger orange tabby cat merchant in the reference image - same face, same "
    "colours, same short indigo shop coat with rolled-up sleeves, same beige apron tied at the waist, same coin "
    "pouch on the belt, same thick striped tail.\n\nPose: ")
KEEPER_TAIL = (
    "\nIt stands on the ground with its feet at the very bottom edge of the picture - do not draw it floating. "
    "Fill the frame vertically. Readable at small size (it will be shown about 150 pixels wide): bold silhouette, "
    "strong shapes, no fine detail that disappears when shrunk.\n"
    "Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or see-through.\n"
    "Nothing else in the picture: no counter, no shelves, no goods, no ground line, no shadow, no scenery, "
    "no text, no letters, no numbers, no watermark, no border.\n"
    "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying.\n"
    "Output 768x1024 PNG. Save the image as {name} in the current directory and report the path.")
KEEPER = {
    # 買賣成交那一拍
    "shop_keeper_happy.png": (
        "delighted at a sale just closed - both paws cupped together in front of his chest holding a small pile "
        "of dried fish coins up towards his face, eyes squeezed into two happy upward curves, a huge open "
        "grin, whiskers pushed up by the smile, tail standing straight up behind him"),
    # 小魚乾不夠的時候
    "shop_keeper_no.png": (
        "politely refusing - one paw raised palm-forward at chest height in a clear 'no, sorry' stop gesture, "
        "the other paw scratching the back of his head, head tilted, mouth pulled into an apologetic sheepish "
        "wince, eyebrows raised, tail drooping down behind him"),
}


def can_block(body: str) -> bool:
    """
    這隻**有沒有可能**身上出現防禦點數。有可能就該有防禦圖——只要 `block > 0`，
    `monsterPose` 就會去要那張圖，沒生的話牠縮著擋你的時候畫面上還是站得直挺挺的待機圖。

    答案是**每一隻都有可能**（2026-09-10 查證，使用者：「魔物防禦圖還缺 45 隻就補上吧」）。
    原本只認「招式有 block 效果，或身上帶縮殼／鐵布衫／鱗甲」，漏掉三種來源：
      - **遭遇修飾詞「疲憊的」**（`content/modifiers.ts`）：開場直接給 8 點防禦，
        而修飾詞是**地圖生成時抽在任何一個一般怪與菁英節點上的**（`map.ts:364`）——
        這一條就讓全部的怪都可能擋。
      - **盾陣**（`blockAllies`）：鼠大將、蛙大名、鬼將、傀儡師、紙燈籠雙子・乙 幫**全隊**上防禦。
      - **關主前綴**（`run.ts` 的 `BOSS_PREFIXES`）：「疲憊的」三成五機率掛在塔主身上。
    所以這支不再挑人，全部都生。留著這個函式是為了保留上面這段查證。
    """
    return True


def main() -> None:
    manifest = json.loads((ROOT / "public" / "assets" / "manifest.json").read_text(encoding="utf-8"))
    subjects = json.loads((ROOT / "tools" / "codex_prompts" / "subjects.json").read_text(encoding="utf-8"))
    src = (ROOT / "src" / "content" / "enemies.ts").read_text(encoding="utf-8")

    # 哪些美術鍵會擋：從魔物定義切塊，id → art，挑出會擋的
    blockers: set[str] = set()
    for chunk in re.split(r"\n  \{(?= id: ')", src):
        m = re.match(r" id: '([a-z0-9_]+)'.*?art: '([^']+)'", chunk, re.S)
        if not m or not can_block(chunk):
            continue
        art = m.group(2)
        if art == "daxia":      # 師父走自己那套 sprites，不在這批
            continue
        if art in manifest["monsters"]:
            blockers.add(art.split("/")[-1][len("monster_"):])

    # 一般魔物先生、大魔物與塔主後生：一般魔物每一局都會遇到好幾隻，先做完就先看得到效果。
    # （不照關數分是因為關數要看遭遇表，關主那些沒寫 acts、會被算成第一關，排出來的順序反而不對）
    common_art = {a for p, a in re.findall(r"pool: '([^']+)'[^\n]*?art: 'codex/monster_([a-z0-9_]+)'", src)
                  if p in ("弱", "中", "強", "召喚")}

    REFDIR.mkdir(parents=True, exist_ok=True)

    def mon_job(mid: str) -> tuple[str, dict]:
        name = f"monster_{mid}_block.png"
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
        return name, {"prompt": who + BLOCK_POSE + BLOCK_TAIL.format(name=name), "ref": ref}

    # 已經有 block 圖的跳過（重跑這支不會重生）
    todo = sorted(m for m in blockers if "block" not in manifest["monsters"][f"codex/monster_{m}"])
    first = [x for x in todo if x in common_art]
    rest = [x for x in todo if x not in common_art]
    dump("monster_block_common.json", dict(mon_job(x) for x in first))
    dump("monster_block_elite.json", dict(mon_job(x) for x in rest))
    dump("status_icons2.json", {k: ICON_HEAD + v + ICON_TAIL.format(name=k) for k, v in STATUS_ICONS.items()})
    # 老闆的參考圖：codex 的 -i 吃 PNG 最穩，現成的 keeper 是 webp，先鋪白底轉一張出來
    keeper_ref = ROOT / "tools" / "ref" / "shop_keeper_ref.png"
    if not keeper_ref.exists():
        im = Image.open(ROOT / "public" / "assets" / "sprites" / "shop" / "keeper.webp").convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.paste(im, (0, 0), im)
        bg.convert("RGB").save(keeper_ref)
    dump("shopkeeper2.json", {k: {"prompt": KEEPER_CH + v + KEEPER_TAIL.format(name=k),
                                  "ref": "tools/ref/shop_keeper_ref.png"} for k, v in KEEPER.items()})
    print(f"\n會擋的魔物 {len(blockers)} 隻，這次要生 {len(todo)} 張"
          f"（一般 {len(first)}、大魔物與塔主 {len(rest)}）")


if __name__ == "__main__":
    main()
