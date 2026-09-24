# -*- coding: utf-8 -*-
"""噹噹的 F 批（二）——共用事件的「結果圖」60 張＋紙箱還沒打開那張（2026-09-17）。

做法跟菲菲那支（`make_feifei_result_art_jobs.py`）同一套，因為那一套是驗過的：
**把他自己的該事件場景插圖當參考圖附上去，叫模型「照著附圖重畫，只改正在發生的事」**，
所以提示詞裡**不貼整包長相敘述**——貼了會跟「照附圖重畫」打架
（`art_rules.py` 檔頭第一條：規則寫太死會跟姿勢敘述打架）。
參考圖擋不住的那幾種走鐘才單獨寫成反向護欄（護臂、不伸爪、特效要有黑外框）。

**所以這支一定要等場景圖先生完**（`make_dangdang_shared_event_jobs.py`）。
場景圖還沒進倉的，這支會把那幾張列出來、跳過，不會拿球球或菲菲的圖去當參考——
附錯圖等於整張畫成別隻貓，那是這條產線最貴的一種錯。

文字用**他讀到的那一版**
------------------------
`tools/dangdang_event_text.json` 是從 `eventTextFor('dangdang', ...)` 匯出的
（`DUMP_DANGDANG=1 npx vitest run tools/dump_dangdang_events.test.ts`），
不是球球那版。他那 121 段是稿子逐篇重寫的，同一篇事件他做的事跟球球不一樣——
`blocked_r0` 球球是腳一滑滾下去，他是腳下木板翻起把他摔到另一側。
**文案過期就不要生**：這支自己比 `events.ts` 的修改時間，舊了就停下來叫人重匯。

兩條硬規則（B 批牌面學到的）一樣要貼
------------------------------------
  1. **特效一律要有黑外框的實心形狀**——沒有外框的柔光會暈進綠幕，去背去不掉。
  2. **兩個顏色之間不要漸層**——漸層會從綠色經過。
  加上綠色的分寸：**他的青綠短褂是設計的一部分，不算特效**。
  三條都在 E 批的 `EFFECTS` 裡，這支 import 過來，不抄第二份。

跑法
----
  DUMP_DANGDANG=1 npx vitest run tools/dump_dangdang_events.test.ts   # 先更新文案
  python tools/make_dangdang_result_art_jobs.py                       # 預設分 4 小批
  python tools/codex_gen.py tools/codex_jobs/dangdang_result_1.json
  （**不要帶 --ref**：每一筆自己帶該事件的參考圖，命令列的會蓋掉。一次最多兩條。）

  只重生幾張：python tools/make_dangdang_result_art_jobs.py --only sunbath_r0 --redo

**自檢不寫成 `SystemExit`**（使用者 2026-09-17 明示）：工作檔一定會寫出去；
場景圖還沒好的、參考圖比場景圖舊的、已經有舊稿的，各印成一塊醒目的清單。
唯一會擋下來不寫檔的是「文案比 events.ts 舊」——那會讓整批畫的事情跟玩家讀到的對不上，
而且是靜音的（圖照生、測試照綠），生完才發現等於整批白做。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import NO_PANEL  # noqa: E402
from make_dangdang_event_jobs import EFFECTS  # noqa: E402

RAW = ROOT / "tools" / "codex_raw"
JOBS = ROOT / "tools" / "codex_jobs"
REFDIR = ROOT / "tools" / "ref" / "event_refs_dangdang"
MANIFEST = ROOT / "public" / "assets" / "manifest.json"
TEXT = ROOT / "tools" / "dangdang_event_text.json"
EVENTS_TS = ROOT / "src" / "content" / "events.ts"

# 她那四篇專屬事件（編號自己就叫 feifei_xxx），噹噹觸發不到，不在這一批
HER_OWN = ("brew", "pouch", "signal", "trace")

# 這幾張的結果文字本來就會離開原場景（跟菲菲那支同一份名單，改要一起改）
MOVES_ON = {
    "lost_kitten_r0", "lost_kitten_r1", "heavy_door_r0",
    "blocked_r0", "sparring_cat_r1", "rescue_return_fish_r1",
}

SAME_PLACE = (
    "**THIS IS A SEQUEL TO THE ATTACHED PICTURE.** The attached picture is the same event a moment "
    "earlier. Keep the SAME place, the SAME characters, the SAME props, the SAME colours and the "
    "SAME lighting - redraw them exactly as they appear there. Only what is HAPPENING changes. "
    "Do not invent a new location and do not change any character design.")
MAY_MOVE = (
    "**THIS IS A SEQUEL TO THE ATTACHED PICTURE.** The attached picture is the same event a moment "
    "earlier. Keep the SAME characters, the SAME colours and the SAME lighting, and redraw every "
    "character exactly as they appear there. The place may move on if the scene below says so "
    "(a few steps away, through a gap, round a corner) - follow the scene, but keep it the same "
    "kind of place.")

HEAD = ("A single scene illustration for a story event in a cute cartoon roguelike card game, "
        "landscape composition.\n\n{same}\n\nWhat happens now: ")

# 他版。**代名詞全部是 he／him**，而且要點名哪一隻是他——附圖裡多半還有村貓、老鼠、山賊。
ACTOR = (
    "\n\n**WHO DOES WHAT**: the text above is written from the point of view of DANGDANG, the hero - "
    "he is the BLACK-AND-WHITE TUXEDO CAT in the teal-green jacket with the brown sash and the two "
    "round BRONZE BRACERS, exactly as drawn in the attached picture. Read it carefully and make sure "
    "the RIGHT character performs the action - if he drinks, eats, picks up, hands over, repairs or "
    "practises something, it must be HIM doing it, not the other character. Getting this backwards is "
    "the single most common mistake here.\n"
    "**HE MUST BE VISIBLY DOING SOMETHING.** Not standing and waving, not just watching - show him "
    "mid-action, his whole body committed to it. If the text says he braces something, his feet are "
    "planted wide and his forearms are driven into it; if he practises, he is mid-stance; if he "
    "receives something, both paws are closing around it; if he is hurt, it shows on his face and in "
    "how he is standing.\n"
    # 參考圖擋不住的三種走鐘（菲菲那批是臉變人臉、身體吹成球；他的是這三種）
    "**HIS TWO BRONZE BRACERS ARE THE CHARACTER, NOT A PROP.** One on each forearm, both of them "
    "somewhere we can see in every picture - worn on his arms, or, when the text above says he has "
    "taken one off, held in his paw or set down beside him exactly where the text puts it. Never draw "
    "three, never draw only one, never move one to a different part of his body, and never replace him "
    "with a grey tabby cat in a navy ninja outfit or with a Siamese cat girl in a purple jacket.\n"
    "**HE FIGHTS AND WORKS WITH HIS FOREARMS AND PALMS**: he punches, blocks, braces, pushes, carries "
    "and repairs. His paws stay rounded and closed - NO claws out, no thrown weapon, no blade. He may "
    "hold the everyday objects the text names (a tool, a hammer, a bowl, a bundle, a scroll).\n"
    "**HE IS A SMALL CHIBI CAT, NOT A PERSON.** Big round head about as large as his whole body, short "
    "squat body, short stubby legs, no neck, small rounded paws, a furry muzzle with whiskers, "
    "AMBER-GOLD eyes and a WHITE STRIPE down the middle of his black face. Do NOT draw a human or "
    "anime face with a flat skin-coloured cheek and cat ears on top, and do NOT stretch him into an "
    "adult realistic cat.\n")

TAIL = (
    "\n\nIMPORTANT about any writing in this scene: brush marks and scratches only - abstract squiggles "
    "that read as writing from a distance. Never draw real letters, words, numbers or recognisable "
    "characters of any language.\n"
    "Tell the story in one readable picture: clear staging, strong silhouettes, expressive faces, only "
    "what the scene needs. It will be shown about 420 pixels wide, so no fine detail that disappears "
    "when shrunk.\n"
    "Style: thick black outlines, FLAT colours with only subtle soft shading - do NOT render it "
    "painterly and do NOT use heavy airbrushed shadows. Cute cartoon storybook look, not photorealistic. "
    "Where two fur colours meet that is a CLEAN EDGE, never a soft airbrushed fade.\n"
    "No text, no letters, no numbers, no watermark, no user interface, no border.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying - draw only "
    "the characters and the few props the scene needs. If something has to sit on the ground, draw a "
    "SMALL PATCH of stone floor under it with a ragged irregular edge that fades to nothing - not a "
    "full floor, and never a slab with straight edges or square corners.\n"
    + NO_PANEL + EFFECTS +
    "Output 1024x768 PNG. Save the image as {name} in the current directory and report the path.")

# 紙箱「還沒打開」那張不是結果圖，是場景圖，但它一樣沒有文案、一樣得跟「打開後」那張同一個箱子，
# 所以跟菲菲那支一樣放在這裡走續集的路（參考圖是**他的**「打開後」那張）。
CHEST_CLOSED = (
    "The attached reference image is the SAME SCENE this picture must show, one moment EARLIER.\n"
    "Match it exactly: same cardboard box in the same place and the same size, same cat on the same "
    "side at the same scale, SAME CHARACTER DESIGN - he is a chibi BLACK-AND-WHITE TUXEDO CAT with a "
    "white stripe down the middle of his face, a white muzzle, white chest and white paws, AMBER-GOLD "
    "eyes, a sleeveless TEAL-GREEN Chinese jacket with a cream border, a BROWN sash at his waist and a "
    "round BRONZE BRACER on EACH forearm - same thick black outlines, same flat colours, same cute "
    "cartoon style, same camera angle, same composition and same framing. Never draw a grey tabby cat "
    "in a navy ninja outfit.\n\n"
    "What is different: the box is STILL SEALED and has NOT been opened yet. Its top flaps are folded "
    "shut and taped down with a strip of pale packing tape across the middle. There is NO light, NO "
    "glow, NO sparkles and NO shredded paper spilling out - none of that has happened yet.\n"
    "He is crouched beside the box with both rounded paws pressed flat on the taped lid, leaning his "
    "weight in, ears up, eyes wide and eager, about to shove it open. Mouth closed in a small keen "
    "smile.\n\n"
    "Cute cartoon storybook style, thick black outlines, flat colours with subtle soft shading, not "
    "photorealistic. Nothing else in the picture: no room, no scenery, no text, no letters, no "
    "watermark.\n"
    "Draw everything SOLID and OPAQUE - flat filled colour. Nothing transparent or see-through.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green "
    "on the box. His teal-green jacket is part of his design and stays exactly as the reference draws "
    "it.\n"
    "Output 1024x768 PNG. Save the image as event_dangdang_chest_closed.png in the current directory "
    "and report the path.")


def his_ref(eid: str, bg: dict) -> Path | None:
    """他的該事件場景插圖鋪白底存成 PNG。白底是照球球與菲菲那兩批的做法，換色會影響模型讀圖。

    場景圖還沒進倉就回 None——**絕不拿球球或菲菲的圖代打**，附錯圖等於整張畫成別隻貓。
    """
    path = bg.get(f"bg/event_dangdang_{eid}")
    if not path:
        return None
    REFDIR.mkdir(parents=True, exist_ok=True)
    ref = REFDIR / f"{eid}.png"
    src = ROOT / "public" / path
    # 場景圖後來被修過的話，快取的參考圖要跟著換（菲菲那批「續集抄到舊場景」就是這樣來的）
    if not ref.exists() or ref.stat().st_mtime < src.stat().st_mtime:
        im = Image.open(src).convert("RGBA")
        white = Image.new("RGBA", im.size, (255, 255, 255, 255))
        white.paste(im, (0, 0), im)
        white.convert("RGB").save(ref)
    return ref


def wanted(text: dict) -> list[str]:
    """該生哪幾張結果圖：菲菲那一櫃的 `_r<N>`，扣掉她自己那四篇。"""
    bg = json.loads(MANIFEST.read_text(encoding="utf-8"))["bg"]
    hers = [k[len("bg/event_feifei_"):] for k in bg if k.startswith("bg/event_feifei_")]
    own = re.compile(r"^(%s)(_r\d+)?$" % "|".join(HER_OWN))
    return sorted(x for x in hers if not own.match(x) and re.search(r"_r\d+$", x))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='+', default=None, help='只出這幾張的工單（寫 resultArt 名字）')
    ap.add_argument('--redo', action='store_true', help='已經有舊稿的先改名留底')
    ap.add_argument('--lines', type=int, default=4, help='拆成幾份工作檔（跑的時候一次最多兩條線）')
    ap.add_argument('--name', default=None, help='工作檔檔名前綴（預設 dangdang_result）')
    args = ap.parse_args()

    # 唯一會擋下來的一條：文案過期。生出來的圖會跟玩家讀到的字對不上，而且完全靜音
    if not TEXT.exists() or TEXT.stat().st_mtime < EVENTS_TS.stat().st_mtime:
        print(f"!! {TEXT.name} 比 events.ts 舊（或不存在）。先跑：")
        print("   DUMP_DANGDANG=1 npx vitest run tools/dump_dangdang_events.test.ts")
        return
    text = json.loads(TEXT.read_text(encoding='utf-8'))
    bg = json.loads(MANIFEST.read_text(encoding="utf-8"))["bg"]

    # `chest_closed` **預設不在這一批**：場景那支已經自己畫了一張（有完整的敘述）。
    # 這裡留一條續集的路，是因為那張唯一的風險是「箱子跟打開後那張長得不一樣」——
    # 對照聯絡表看出來對不上時，用 `--only chest_closed --redo` 走這條重畫，
    # 參考圖就是他自己的 `chest_open`，箱子一定接得上。
    want = wanted(text)
    only = args.only or want
    unknown = [n for n in only if n != "chest_closed" and n not in text]
    if unknown:
        print(f"!! 這幾個鍵在遊戲裡查不到：{' '.join(unknown)}")
        print(f"   可用的長這樣：{' '.join(want[:5])} …")
        return

    jobs: dict[str, dict] = {}
    noscene: list[str] = []
    for key in only:
        eid = "chest_open" if key == "chest_closed" else re.sub(r"_r\d+$", "", key)
        ref = his_ref(eid, bg)
        if ref is None:
            noscene.append(key)
            continue
        name = f"event_dangdang_{key}.png"
        if key == "chest_closed":
            prompt = CHEST_CLOSED
        else:
            head = HEAD.format(same=MAY_MOVE if key in MOVES_ON else SAME_PLACE)
            prompt = head + text[key]['dangdang'] + ACTOR + TAIL.format(name=name)
        jobs[name] = {"prompt": prompt, "ref": str(ref.relative_to(ROOT)).replace("\\", "/")}

    RAW.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime('%Y%m%d-%H%M')
    exists = [fid for fid in jobs if (RAW / fid).exists()]
    if exists and args.redo:
        for fid in exists:
            old = RAW / fid
            old.rename(old.with_name(f"{old.stem}.prev-{stamp}.png"))
        print(f"舊稿改名留底 {len(exists)} 張（.prev-{stamp}.png）")
        exists = []

    JOBS.mkdir(parents=True, exist_ok=True)
    prefix = args.name or 'dangdang_result'
    lines = max(1, args.lines)
    names = list(jobs)
    for i in range(lines):
        part = {n: jobs[n] for n in names[i::lines]}
        if not part:
            continue
        out = JOBS / f"{prefix}_{i + 1}.json"
        out.write_text(json.dumps(part, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f"{len(part):>2} 張 → {out.relative_to(ROOT)}")
    print(f"合計 {len(jobs)} 張（該生 {len(only)} 張）")

    # 自檢一：場景圖還沒好的，這一批就少那幾張——**不拿別隻貓的圖代打**
    if noscene:
        print("\n" + "!" * 70)
        print(f"這 {len(noscene)} 張的場景圖還沒進倉，沒有東西可以當參考，這次跳過：")
        print("  " + " ".join(noscene))
        print("先把場景圖生完進倉（make_dangdang_shared_event_jobs.py → add_event_art.py），再跑一次這支。")
        print("!" * 70)

    # 自檢二：舊稿擋路
    if exists:
        print("\n" + "!" * 70)
        print(f"這 {len(exists)} 張 tools/codex_raw 裡已經有舊稿，codex_gen.py 會直接跳過、不會重生：")
        for fid in exists:
            print(f"  {fid}")
        print("要重生請加 --redo（會先改名留底），或自己把舊稿改名。")
        print("!" * 70)


if __name__ == '__main__':
    main()
