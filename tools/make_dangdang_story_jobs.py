# -*- coding: utf-8 -*-
"""噹噹的 D 批劇情幻燈片工單——12 張（2026-09-17）。

**鍵是從 `src/ui/storyslides.ts` 撈的，不是猜的**：
  序章四張寫死在 `prologueSlides`：`dangdang_still_shop` / `_gate` / `_send` / `_depart`；
  過關與結局六張走 `stillKey('dangdang', ...)` 翻成 `bg/dangdang_<名字>`，
  名字在 `actClearSlides`（`still_act1_stairs` / `_fish` / `_climb`、
  `still_act2_smoke` / `_voice` / `_moonstairs`）與 `endingSlides`
  （`still_embrace`、`still_home`）。合計 12 個鍵，下面的檔名一個對一個。

**每一張配的是哪幾句，是跑出來的不是照稿子抄的**：
    npx vitest run <暫時的 dump 測試>   →   prologueSlides('dangdang') 等三支
他的序章有十八句、而且 `dialogue.ts` 標了 `slideBreak` 切點，所以切法跟球球、菲菲不同
（球球五句對四張、他是 6/3/5/4）。照稿子的段落猜一定會錯配。

跟 A、B 兩批最大的差別
----------------------
這批**不是綠幕去背的**：走 `add_screen_bg.py` 進倉（`ImageOps.fit` 到 1280x720、WebP 66），
所以要的是**整張畫滿的場景圖、含背景**，跟菲菲那十二張同一個規格
（`make_feifei_story_jobs.py`）。`art_rules.STYLE` 裡那套綠幕規矩一條都不要貼過來——
貼了會要求「背景是純綠色」，正好跟「要有背景」打架。

參考圖 `tools/ref/dangdang_story_ref.png`（`make_dangdang_story_ref.py` 產）：
一張表裡有五個角色，不然球球、菲菲、大俠貓每張各長各的（`art_rules.py` 第二個雷）。

跑法
----
  python tools/make_dangdang_story_ref.py          # 先做合參表（只要做一次）
  python tools/make_dangdang_story_jobs.py
  python tools/codex_gen.py tools/codex_jobs/dangdang_story_1.json --ref tools/ref/dangdang_story_ref.png
  python tools/codex_gen.py tools/codex_jobs/dangdang_story_2.json --ref tools/ref/dangdang_story_ref.png
  （**一次最多兩條**，`codex_gen.py` 坑 1。）

  只重生幾張：python tools/make_dangdang_story_jobs.py --only shop gate --redo
  （`--redo` 會把舊稿改名留底。不加的話 `codex_gen.py` 看到檔案已存在就整張空轉，
    印的還是「已存在跳過」、離開碼 0，看起來像成功——`art_rules.py` 第九個雷。）

**自檢不寫成 `SystemExit`**（使用者 2026-09-17 明示）：工作檔一定會寫出去，
對不上 `storyslides.ts` 的、已經有舊稿的，各印成一塊醒目的清單。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

RAW = ROOT / "tools" / "codex_raw"
JOBS = ROOT / "tools" / "codex_jobs"
REF = ROOT / "tools" / "ref" / "dangdang_story_ref.png"

# ---------------------------------------------------------------------------
# 合參表上有五個角色，每一張都要點名誰是誰——不講的話模型會挑最大的那隻當主角
# ---------------------------------------------------------------------------
CAST = (
    "The attached reference sheet has FIVE characters. Draw each of them exactly as the sheet shows.\n"
    "  TOP ROW, left block: a small chibi GREY TABBY cat ninja with a navy headband and navy outfit - this "
    "is QIUQIU, a friend. He is never the main character of these pictures.\n"
    "  TOP ROW, middle: a tall calm straw-hat kung-fu cat in a cream robe with a black belt - the MASTER "
    "(called Daxia Mao). This is his NORMAL form.\n"
    "  TOP ROW, right: the same master CORRUPTED - bristling fur, spiral violet eyes, violet miasma "
    "smoking off him. Only draw this form where the scene says corrupted.\n"
    "  BOTTOM ROW, left: a chibi SIAMESE cat girl in a plum-purple jacket with a purple bow in her hair - "
    "this is FEIFEI, a friend. She is never the main character either.\n"
    "  BOTTOM ROW, right (the two big figures): **DANGDANG, the BLACK-AND-WHITE TUXEDO CAT - HE is the "
    "main character of every picture below.**\n"
    "DANGDANG's design, copied straight from those two big figures: black fur with a WHITE STRIPE down "
    "the middle of his face, a white muzzle, a white chest and white paws; AMBER-GOLD eyes; a sleeveless "
    "TEAL-GREEN Chinese jacket with a cream border and dark toggle fastenings; a BROWN cloth sash knotted "
    "at his waist; **a round BRONZE BRACER on EACH of his two forearms** (they are his weapon and the "
    "first thing players look for, so both are in every picture); dark trousers with cloth wrapped round "
    "each ankle. Chibi proportions: a big round head about as large as his whole body, a short squat "
    "body, short stubby legs, no neck, small rounded paws.\n"
    "Never give Dangdang grey tabby fur, a navy headband, a straw hat or a purple jacket - he is his own "
    "cat. Never draw a second tuxedo cat.\n"
    "VILLAGE CATS, where a scene calls for them, are ordinary plain little house cats in simple brown or "
    "grey work clothes - no headband, no bracers, no straw hat, clearly not any of the five above.\n"
)

TAIL = (
    "\n\nFull scene illustration with background, landscape 1280x720. "
    "No text, no letters, no numbers, no watermark, no border.\n"
    "Style: thick black outlines, FLAT colours with only subtle soft shading - not painterly, no heavy "
    "airbrushed shadows. Cute cartoon, not photorealistic. Faces in flat blocks of colour with hard edges "
    "between them, never a blurry gradient - where Dangdang's black fur meets his white face stripe that "
    "is a CLEAN EDGE.\n"
    "Draw everything SOLID and OPAQUE - nothing transparent or see-through.\n"
    "Output 1280x720 PNG. Save the image as {fid} in the current directory and report the path."
)

# ---------------------------------------------------------------------------
# 12 張：短名 → 這張圖畫什麼
#
# 每一段後面的中文註解是**遊戲裡實際配到這張圖的台詞**（跑 `prologueSlides` 等三支印出來的，
# 不是照稿子的段落猜的）。改圖之前先對一次那幾句。
# ---------------------------------------------------------------------------
SCENES: dict[str, str] = {
    # ===== 序章四張（十八句，切成 6／3／5／4）=====
    # 球球拖斷木樁來／「這次不是從你補的地方斷的喵」／「你把另一頭也打斷了」／
    # 菲菲把竹筒放到桌上、試扣環／「這個也麻煩你。針我都拿出來了」／「放這邊。你們吃過飯再來拿」
    "shop":
        "Daytime outside DANGDANG's little repair shop at the edge of a cat village: a wooden workbench "
        "under an awning, mended pots and tools hanging on the wall behind, wood shavings on the ground. "
        "DANGDANG crouches in the middle of the picture with a thick wooden training post that has SNAPPED "
        "IN TWO, turning one broken half over in his paws to look at the break; his bronze hammer is set "
        "down on the ground beside his foot. QIUQIU stands at one side still dragging the other broken "
        "half by its end, chest out, pointing at the break, very pleased with himself. FEIFEI stands at "
        "the workbench setting a slim BAMBOO TUBE down on it, one paw on its little clasp. All three are "
        "in frame; Dangdang is the closest and largest and is clearly the subject. Warm ordinary "
        "afternoon sunlight, peaceful everyday mood - nothing scary is happening yet.",
    # 那天夜裡魔塔冒出來、大俠貓中魔奔向塔頂、球球追在後面、魔物撞歪村口的門／
    # 噹噹架起護臂攔住魔物讓村貓先過、等最後一隻小貓進門才推回門閂／「糧袋放進屋，別堆在門邊」
    "gate":
        "Night at the village gate, the moment of the disaster. A tall sinister pagoda TOWER has risen "
        "far away on the horizon, glowing violet at its top, and dark violet miasma hangs around it. "
        "DANGDANG is the big figure in the foreground, planted side-on just outside the wooden village "
        "gate with BOTH bronze bracers crossed in a hard X in front of him, holding back two or three "
        "small grey rat monsters that are lunging at him. The gate's wooden frame is knocked crooked and "
        "one plank hangs loose. Behind him, two ordinary VILLAGE CATS clutching sacks of grain hurry "
        "through the gap, and a tiny kitten is just stepping inside. Tiny and far away at the foot of the "
        "tower, two small silhouettes run toward it: a tall straw-hat cat and a little grey tabby chasing "
        "after him - draw them small and distant, barely more than shapes. Cold blue-violet night, with "
        "warm lantern light spilling from inside the gate onto Dangdang.",
    # 第三天，菲菲背著行囊來到門口，噹噹正替門框補釘／「你要去找球球？」／
    # 「還有師父。他們三天都沒回來了」／「外面的木橋缺了一塊，從左邊走」／「知道了。村裡就拜託你了」
    "send":
        "Morning three days later, at the repaired village gate. DANGDANG stands beside the gatepost with "
        "his bronze hammer stopped in mid-air in one paw and the other paw resting on the frame - he has "
        "just paused his work; a row of bright new nails is driven into the mended frame and a small open "
        "tin of spare nails sits on the ground by his feet. FEIFEI stands just outside the gate with a "
        "travelling bundle on her back, turned back to look at him, her face serious and set. Behind her "
        "the road leads away across a small wooden bridge with ONE plank missing from it, toward the dark "
        "tower on the far horizon. Only these two characters. Pale clear morning light, quiet and a "
        "little heavy.",
    # 傍晚兩隻村貓扛來木料接過錘子、最後一車糧食推進屋／「這邊交給我們。你去吧」／
    # 噹噹帶上工具袋、扣好護臂，走到塔下回頭看，村口已經點起燈／「球球，菲菲，我來了」
    "depart":
        "Dusk at the foot of the enormous dark pagoda TOWER, low angle so the tower looms overhead. "
        "DANGDANG stands at the bottom of its stone steps with his back half turned to us, a canvas TOOL "
        "BAG slung over his shoulder, one paw pulling the strap of a bronze bracer tight - and he has "
        "turned his head to look BACK over his shoulder, away from the tower, toward the distant village "
        "where a little row of warm lantern lights has just been lit in the blue evening. His face is "
        "calm and settled, not afraid. He is the closest and largest figure. Purple-and-orange sunset sky "
        "behind the tower, long shadows.",

    # ===== 第一關過後三張 =====
    # 關主倒下後，噹噹在樓梯旁看見幾只空糧箱。其中一只補著銅片，邊角還有他敲過的釘痕
    "act1_stairs":
        "Inside the stone tower, torchlit. The floor guardian has just fallen - a last wisp of pale smoke "
        "dissolving at the very edge of the frame - and a stairway up is revealed in the wall. Stacked "
        "and tipped over beside the foot of the stairs are several empty wooden GRAIN CRATES, lids off, "
        "nothing left inside. DANGDANG has stopped walking and stands looking down at one particular "
        "crate whose corner is capped with a patch of BRONZE SHEET. His ears are forward and his "
        "expression is recognition - he knows this box. He is the subject, lit brighter than the "
        "background. Warm torch orange against cool grey stone.",
    # 「這些果然被搬到塔裡了。」
    "act1_fish":
        "Close in on the same torchlit stone corridor. DANGDANG crouches on one knee and has tipped the "
        "bronze-patched wooden GRAIN CRATE onto its side in both paws so he can look at its corner: a "
        "neat row of HAMMER-DRIVEN NAIL MARKS in the wood, his own work. The crate is empty except for a "
        "few broken scraps of dried fish rattling in the bottom. His brows are drawn together, jaw set - "
        "this is what he came to find out and he does not like it. He is the only character in frame. "
        "Warm torchlight, deep shadows behind him.",
    # 他把堵在階梯上的空箱移到牆邊／扶手上有爪痕、往上幾階散著幾點沒乾的藥汁／
    # 「是菲菲帶的藥。她應該沒走遠。」／他沿著樓梯往上走，轉過彎後停下來聽；上面傳來重物撞地的悶響
    "act1_climb":
        "A turn of the tower's stone staircase. The empty crates that were blocking the steps are now "
        "stacked neatly against the wall at the bottom. DANGDANG has stopped halfway up, one foot on the "
        "step above, his whole body gone still and ONE EAR SWIVELLED UPWARD, listening hard; one paw "
        "rests on the wooden handrail, and three fresh CLAW GOUGES are scored across that rail right "
        "under his paw. A few steps above him, several small wet dark-green SPLASHES of spilled medicine "
        "glisten on the stone. The stairs above him curve up into darkness. Torchlight from below throws "
        "his shadow up the steps. He is the only character in frame.",

    # ===== 第二關過後三張 =====
    # 噹噹走上平台，塔頂忽然傳來低吼，扶手跟著震了一下。他聽出那是大俠貓的聲音
    "act2_smoke":
        "A stone landing high in the tower. A defeated monster is dissolving into pale smoke at the edge "
        "of the frame. DANGDANG has frozen mid-step the instant he came up onto the landing: both ears "
        "snapped bolt upright, amber eyes wide, head tilted back and turned up toward the top of the "
        "tower; one paw is still gripping the wooden handrail, and dust is shaking up off that rail in "
        "little flecks. Far above, violet light seeps down the stairwell. His face says he RECOGNISES "
        "that voice. He is the subject and clearly shaken. Violet-tinged gloom, the smoke pale against it.",
    # 「大俠貓！是我，噹噹！」
    "act2_voice":
        "DANGDANG alone at the bottom of a tall dark stairwell, shouting upward with everything he has: "
        "head thrown back, mouth wide open, one rounded paw cupped beside his muzzle, the other bracer "
        "braced flat against the cold stone wall, leaning his whole weight forward. Far above him a "
        "distant violet glow marks the top of the tower, and one narrow shaft of light falls from it "
        "across his upturned face. Deep blue and violet palette. He is the only character in frame.",
    # 沒有回答。低吼聲漸漸停了，階梯間只剩穿過石縫的風聲／「聲音就在上面。還得再走一段」／
    # 他拉住鬆動的扶手，試過踏板，往更高的樓層走去
    "act2_moonstairs":
        "Cold moonlight falls across the last flight of stone stairs through a high narrow window. "
        "DANGDANG stands at the foot of them, testing his way: one paw gripping a wooden handrail that is "
        "visibly LOOSE - its post leaning, two nails sprung up out of the wood - while he puts his weight "
        "carefully onto the first tread, leaning forward, ears up, face set and quiet. Thin ribbons of "
        "draught blow through the cracks in the stonework. The stairs lead up into darkness. Silver-blue "
        "moonlight, long shadows. He is the only character in frame.",

    # ===== 結局兩張 =====
    # 紫光熄了、噹噹鬆開肩膀／「承讓」／卸下護臂發現布墊濕透、菲菲遞來乾布／
    # 「您再打下去，我這對護臂就得重做了」／大俠貓看見銅面凹痕，托起他的手腕／球球挪過來、菲菲扶著他……
    "embrace":
        "The tower rooftop at sunrise, the violet miasma gone. The straw-hat MASTER in his NORMAL form "
        "(calm face, cream robe, no violet, no bristling fur) has gone down on one knee and is holding "
        "DANGDANG's wrist gently up in both big paws, head bent, looking at the DENTS beaten into the "
        "bronze bracer. Dangdang stands in front of him, shoulders finally dropped and loose, his OTHER "
        "bracer already unbuckled and set down by his feet; his face is tired and relieved. Just behind "
        "them QIUQIU is shuffling over with FEIFEI steadying him by the shoulder, both watching. All four "
        "are in frame; Dangdang is the closest and largest. Warm golden dawn light across the stone "
        "rooftop.",
    # 四個人回到村口、村貓拉開新補的門、有人端熱湯出來／「門閂還差一根釘子，我吃完就補」／
    # 「我幫你扶門喵」／「先把手伸過來。繃帶都濕了」／噹噹把手交給菲菲，另一手接過湯碗，球球蹲在旁邊講個不停
    "home":
        "Evening at the village gate, everyone home. The newly mended wooden gate stands open with a "
        "lantern hanging on it. DANGDANG sits on a low bench just inside, holding a steaming bowl of soup "
        "in one paw and stretching his OTHER arm out to FEIFEI, who crouches in front of him unwinding a "
        "soaked bandage from his wrist. QIUQIU squats beside them in the middle of telling a story, both "
        "front paws up in the air acting it out, mouth going. The MASTER in his normal form stands behind "
        "holding the gate open, and an ordinary VILLAGE CAT is coming out of the house carrying a soup "
        "pot. Dangdang is the closest and largest figure. Warm orange lantern light, everyone safe, a "
        "noisy happy little scene.",
}

# 檔名 → 幻燈片鍵。`storyslides.ts` 那三支取的鍵長這樣，對不上就是生了一張沒人用的孤兒圖
KEY_OF = {name: f"bg/dangdang_still_{name}" for name in SCENES}


def keys_in_storyslides() -> list[str]:
    """把 `src/ui/storyslides.ts` 會取到的 12 個鍵**從原始碼撈出來**，不靠記憶。

    序章那四個是寫死的字串；過關與結局那八個走 `stillKey()`，所以要把陣列裡的名字
    加上 `bg/dangdang_` 前綴。打錯一個字的下場是「生了一張永遠沒人用的孤兒圖」，
    而且遊戲裡那一段會靜靜退回純對白——測試全過、線上不報錯，只有玩家覺得少了圖。

    **只從 `actClearSlides` 那一行以後開始掃裸名字**：`prologueSlides` 裡還有球球那條線的
    `['still_teach', 'still_corrupt', 'still_rush', 'still_depart']`，那四個**不走 `stillKey`**
    （他自己的序章是另一份寫死的 `dangdang_still_*`），整份掃的話會誤報成「少生三張」。
    """
    src = (ROOT / "src" / "ui" / "storyslides.ts").read_text(encoding="utf-8")
    keys = ["bg/" + n for n in re.findall(r"'(dangdang_still_[a-z0-9_]+)'", src)]
    tail = src[src.index("export function actClearSlides"):]          # 這行以後才是走 stillKey 的
    for names in re.findall(r"\[('still_[a-z0-9_]+'(?:,\s*'still_[a-z0-9_]+')*)\]", tail):
        for n in re.findall(r"'(still_[a-z0-9_]+)'", names):
            keys.append(f"bg/dangdang_{n}")
    return keys


BODY = "{cast}\nWHAT THIS PICTURE SHOWS: {scene}{tail}"


def build(only: list[str]) -> dict[str, str]:
    jobs: dict[str, str] = {}
    for name in only:
        fid = f"dangdang_still_{name}.png"
        jobs[fid] = BODY.format(cast=CAST, scene=SCENES[name], tail=TAIL.format(fid=fid))
    return jobs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='+', default=None, help='只出這幾張的工單（寫短名，例如 shop gate）')
    ap.add_argument('--redo', action='store_true',
                    help='已經有舊稿的先改名留底，不然 codex_gen 會直接跳過那幾張')
    ap.add_argument('--lines', type=int, default=2, help='拆成幾份工作檔（一次最多兩條線）')
    ap.add_argument('--name', default=None, help='工作檔檔名前綴（預設 dangdang_story）')
    args = ap.parse_args()

    only = args.only or list(SCENES)
    unknown = [n for n in only if n not in SCENES]
    if unknown:
        print(f"!! 沒有這幾張：{unknown}")
        print(f"   可用的：{' '.join(SCENES)}")
        return

    if not REF.exists():
        print(f"!! 合參表不存在：{REF.relative_to(ROOT)}　先跑 python tools/make_dangdang_story_ref.py")
        return

    jobs = build(only)
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
    prefix = args.name or 'dangdang_story'
    lines = max(1, args.lines)
    names = list(jobs)
    for i in range(lines):
        part = {n: jobs[n] for n in names[i::lines]}
        if not part:
            continue
        out = JOBS / f"{prefix}_{i + 1}.json"
        out.write_text(json.dumps(part, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f"{len(part):>2} 張 → {out.relative_to(ROOT)}")
    print(f"合計 {len(jobs)} 張")

    # 自檢一：鍵有沒有跟 storyslides.ts 對上。不中止（工作檔上面已經寫出去了），但要印得夠大聲
    want = keys_in_storyslides()
    mine = set(KEY_OF.values())
    missing = [k for k in want if k not in mine]
    orphan = sorted(mine - set(want))
    if missing or orphan:
        print("\n" + "!" * 70)
        if missing:
            print(f"storyslides.ts 有、這支沒有（{len(missing)} 張，生完會缺圖）：{' '.join(missing)}")
        if orphan:
            print(f"這支有、storyslides.ts 沒有（{len(orphan)} 張，生了也沒人用）：{' '.join(orphan)}")
        print("!" * 70)
    else:
        print(f"鍵對得上 storyslides.ts 的 {len(want)} 個")

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
