# -*- coding: utf-8 -*-
"""2026-09-17 使用者逐張看過他的事件插圖，點名要重畫的 17 張。

多數是**畫壞了**（手臂接不上身體、東西浮在空中、小貓少一條腿），少數是**跟句子對不上**
（撞肩膀沒畫出來、擠過去了、兩張的同一個東西長得不一樣）。改字解不掉，只能重生。

| 檔案 | 壞在哪（使用者原話） |
|---|---|
| robin_r0 | 右邊噹噹的手怪怪的 |
| daxia_teach、daxia_teach_r0 | 那本秘笈太長了不太合理 |
| blocked_r0 | 手上的捲軸壞掉了 |
| broken_shrine、broken_shrine_r0 | 兩張的貓神像身體結構不同；`_r0` 該是修好的完整的，無尾綴那張是壞掉的 |
| sparring_cat_r1 | 不像被白貓撞肩膀 |
| cat_tower_r0、cat_tower_r1 | 噹噹的手都壞掉了 |
| lost_scroll、lost_scroll_r0 | 兩張的卷軸都壞了，而且兩張得一致 |
| noisy_kitchen、_r0、_r1 | 鍋蓋不該浮在空中（`_r0` 另外還有手穿模） |
| sleeping_guard | 應該是「面對門、想從橘貓身邊過去但還沒過去」，這張已經擠過去了 |
| stuck_kitten | 小貓的後腳壞掉變成三隻腿 |
| training_hall_r0 | 姿勢有問題 |

順手補的兩件（看圖時一起發現的，同一張重生就一起修，不另外開一批）：
  - `stuck_kitten` 的句子寫「**牠媽媽正扶著牠的肩膀**」，圖上根本沒有媽媽，只有噹噹跟小貓。
  - `noisy_kitchen_r1` 同時還在修「兩個忍具畫成木湯匙」（見 `make_fix_0917_jobs.py`），
    兩段修正都要帶上，不然修好鍋蓋又把忍具畫回湯匙。

**分兩波跑，順序不能顛倒。** 續集圖（`_rN`）是照場景圖的參考圖畫的，場景圖沒先修好進倉，
續集就會照著壞掉的舊版重畫一次（記憶 `reference_mus_art_pipeline`：參考圖過期會抄到壞版本）。
  - 第一波 12 張＝六張場景圖 ＋ 六張不依賴這次改動的續集圖
  - 第二波 5 張＝場景圖被改掉的那幾張的續集（參考圖由 `his_ref` 照新的場景圖重建）

用法（兩條線，多開會互相餓死——`codex_gen.py` 的坑 1）：

  python tools/make_fix_0917b_jobs.py 1
  python tools/codex_gen.py tools/codex_jobs/fix_0917b_1a.json     # 兩條線平行
  python tools/codex_gen.py tools/codex_jobs/fix_0917b_1b.json
  python tools/add_event_art.py <第一波 12 張>.png
  python tools/make_fix_0917b_jobs.py 2                            # 這時參考圖才會照新場景圖重建
  python tools/codex_gen.py tools/codex_jobs/fix_0917b_2a.json
  python tools/codex_gen.py tools/codex_jobs/fix_0917b_2b.json
  python tools/add_event_art.py <第二波 5 張>.png

做法是**把既有的工單挖出來、在尾巴接一段修正**，不重寫提示詞：原本對的地方（他的長相、
綠幕、去背、不准寫字那些）一個字都不要動，只加「這張哪裡畫錯了、該怎麼畫」。
"""
import datetime as dt
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from make_dangdang_result_art_jobs import MANIFEST, RAW, his_ref  # noqa: E402
from make_fix_0917_jobs import TOOLS as NINJA_TOOLS  # noqa: E402

JOBS = ROOT / "tools" / "codex_jobs"
ANCHOR = "Output 1024x768 PNG."

HEAD = ("\n\n=== FIX THIS - THE PREVIOUS VERSION OF THIS PICTURE WAS REJECTED ===\n"
        "Everything above still applies. What follows is what went wrong last time and what to draw "
        "instead. Get this right before anything else.\n")

# 他的手臂畫壞是這批最常見的病（七張裡有四張），所以獨立成一段，該用的都接上去。
ARMS = (
    "**HIS ARMS ARE DRAWN WRONG IN THE OLD VERSION - THIS IS THE MAIN THING TO FIX.**\n"
    "Build each arm so it makes sense: it starts at his SHOULDER, on the side of his body at the top "
    "of his chest - never out of his head, his neck, his back or the middle of his chest. From the "
    "shoulder comes the upper arm, then the round BRONZE BRACER worn around the forearm like a thick "
    "cuff, then the paw at the end of that forearm. **Exactly two arms, exactly two bracers, exactly "
    "two paws** - one bracer per arm, never two bracers stacked on the same arm, never a spare bracer "
    "floating free, never a paw that is not joined to an arm, and never an arm that disappears behind "
    "his own body and comes out somewhere impossible. Each paw is a simple rounded mitten shape with "
    "no separate fingers. If an arm would be hidden by his body at this angle, turn him slightly so "
    "both arms read clearly rather than drawing a broken one.\n")

FIX: dict[str, str] = {
    # ---- 手臂壞掉 ----
    "robin_r0": ARMS + (
        "He sits back against the wall on the right of the picture, resting: one arm hangs loose at "
        "his side, the other is raised so he can knead his own aching shoulder - that paw rests ON "
        "TOP OF the opposite shoulder, and the arm it belongs to is clearly attached below it.\n"),
    "cat_tower_r0": ARMS + (
        "He has just landed at the foot of the tall scratching post, the small cloth bundle held "
        "against his chest in ONE paw. His OTHER foreleg is the hurt one: he holds it slightly away "
        "from his body, and a short raw graze shows on it where the rope scraped him. Both arms and "
        "both bracers are plain to see and both join his shoulders properly.\n"),
    "cat_tower_r1": ARMS + (
        "He is part way up the tall scratching post, climbing down a step at a time with the bundle. "
        "**Both forepaws grip the post** - each one wrapped round the wood from its own arm, the "
        "bracer on each forearm just behind the paw. No third limb, no loose bracer floating beside "
        "him. Draw the swipe marks on the post as marks cut into the wood, not as white streaks "
        "flying loose in the air around him.\n"),
    "training_hall_r0": ARMS + (
        "He is mid-stance on the practice floor, working through a turn: knees bent, weight low, one "
        "foot forward on the painted pawprint trail. One forearm is driven forward at chest height "
        "and the other is pulled back beside his ribs - the classic bracing stance. Both arms come "
        "out of his shoulders and stay in front of us; neither one crosses behind his head.\n"),
    # ---- 東西畫壞 ----
    "daxia_teach": (
        "**THE MANUAL IS THE WRONG SHAPE.** In the old version it is a long wide slab, far too big "
        "for him to hold. Draw a normal small BOOK: an old cloth-bound manual roughly as wide as his "
        "own head and a little taller than it is wide, held open in both paws so we see two facing "
        "pages. Its cover is worn and fraying at the corners. On the open pages are THREE small "
        "stick-figure drawings of a cat in three different fighting stances - three, countable at a "
        "glance, drawn as simple dark silhouettes. Nothing else on the pages.\n"),
    "blocked_r0": (
        "**THE SCROLL IN HIS PAW IS MALFORMED.** Draw a proper rolled paper scroll: a rectangle of "
        "cream paper rolled around a plain wooden rod at EACH end, the rods sticking out a little "
        "past the paper on both sides, the paper partly unrolled so a strip of it shows. The edges "
        "are straight and the roll is even - not a floppy shapeless blob, not torn, not crumpled. "
        "He grips one rod in his paw and holds it clear of his body so we can see the whole thing.\n"),
    "lost_scroll": (
        "**THE SCROLL IS THE POINT OF THIS PICTURE AND IT IS DRAWN WRONG.** Draw it as a proper "
        "rolled paper scroll: cream paper rolled around a plain wooden rod at EACH end, the rods "
        "sticking out past the paper on both sides, unrolled just enough to show the middle. Straight "
        "edges, even roll, no tears and no crumpling. Across the open part run THREE separate panels "
        "side by side, divided by two thin ruled lines: each panel holds one simple dark stick-figure "
        "cat in a fighting stance, with a few abstract brush squiggles beside it standing in for "
        "handwriting. Three panels, countable at a glance.\n"),
    # ---- 神像兩張要一致 ----
    "broken_shrine": (
        "**THE STATUE MUST BE THE SAME STATUE AS IN THE 'REPAIRED' PICTURE, ONLY BROKEN.** Draw a "
        "pale grey stone CAT STATUE in the classic SITTING pose - sitting upright on its haunches, "
        "forepaws straight down in front of its chest, tail curled round its feet, a round head with "
        "simple carved eyes and ears. In THIS picture it has SNAPPED CLEANLY IN TWO across the "
        "middle: the head-and-chest half has toppled off and lies tipped over on the ground beside "
        "the base, and the lower half - haunches, feet and curled tail - still sits upright where it "
        "always was. **Two pieces, one clean break, and both halves are unmistakably parts of that "
        "same sitting statue** - not a different lying-down cat, not a shapeless lump, not rubble. "
        "Its carved eyes give off a faint warm amber glow in the shadow.\n"),
    "broken_shrine_r0": (
        "**THE STATUE MUST BE THE SAME STATUE AS IN THE ATTACHED 'BROKEN' PICTURE, NOW WHOLE AGAIN.** "
        "Same pale grey stone cat in the same classic SITTING pose, same size, same carved face, same "
        "curled tail - but standing upright and complete on its base, the two halves put back "
        "together. A thin joining line still shows across its middle where the break was. He has both "
        "paws on it, steadying it after setting it straight.\n"),
    # ---- 動作跟句子對不上 ----
    "sparring_cat_r1": (
        "**THE SHOULDER BARGE HAS TO BE VISIBLE - the old version just has the two of them standing "
        "there.** Catch the moment of contact: he is squeezing past the WHITE CAT toward the "
        "staircase, and the white cat has just driven its shoulder hard into his. Their two shoulders "
        "are pressed together in the middle of the picture. He is knocked off balance - body twisted "
        "away from the hit, one foot lifted off the step, teeth gritted, ears flat, eyes screwed "
        "shut. The white cat leans its weight in with a flat unimpressed look, arms NOT folded - it "
        "is using its body, not posing. Small impact marks at the point where the shoulders meet.\n"),
    "sleeping_guard": (
        "**HE HAS NOT GOT PAST YET - the old version already shows him through.** Put him on the NEAR "
        "side of the sleeping ginger cat, still out in the open, facing the closed door he wants to "
        "reach. He is sizing up the narrow gap between the sleeping cat and the door frame: body "
        "turned side-on ready to edge through, one paw raised mid-step and not yet set down, weight "
        "held back, ears up, watching the sleeping cat's face. He is not touching it and no part of "
        "him is in the gap yet. The big ginger cat dozes against the door frame with its fat purse at "
        "its waist, and the narrow gap beside it is clearly open and clearly empty.\n"),
    "stuck_kitten": (
        "**TWO THINGS ARE WRONG HERE.**\n"
        "  (1) **THE KITTEN'S BACK LEGS.** The old version left it with three legs. The striped "
        "tabby kitten has FOUR legs: its head is pushed through between two railings so we see it "
        "from the far side, and on this side its body, BOTH back legs and BOTH front legs are all "
        "visible and all joined to its body - both back paws planted flat on the ground, braced, "
        "pushing. Count them before finishing.\n"
        "  (2) **ITS MOTHER IS MISSING.** The sentence says its mother is steadying it by the "
        "shoulders. Add her: a grown striped tabby cat the same colouring as the kitten, crouched "
        "beside it with both paws on the kitten's shoulders, leaning in and talking to it quietly, "
        "her face worried but calm. THREE characters in this picture - Dangdang, the kitten and its "
        "mother.\n"),
    # ---- 鍋蓋浮在空中（三張同一個毛病）----
    "noisy_kitchen": (
        "**THE POT LID MUST NOT FLOAT IN THE AIR.** In the old version it hangs unsupported beside "
        "the pot. The steam is shoving it, so draw it still ON the pot: tipped up at an angle on the "
        "near rim, one edge resting on the rim and the other lifted, with steam escaping through the "
        "gap underneath. It stays touching the pot the whole time. Do not draw a second lid anywhere, "
        "and do not draw it hovering, flying or hanging in mid-air.\n"),
    "noisy_kitchen_r0": (
        "**TWO THINGS ARE WRONG HERE.**\n"
        "  (1) **THE POT LID MUST NOT FLOAT IN THE AIR.** Draw it tipped up at an angle resting on "
        "the near rim of the pot, one edge on the rim and the other lifted, steam escaping through "
        "the gap. It stays touching the pot. No second lid, nothing hovering.\n"
        "  (2) **HIS PAWS PASS THROUGH THE BOWL.** He is drinking the soup: the bowl is held clear of "
        "his face in BOTH paws, one on each side, each paw resting against the OUTSIDE of the bowl "
        "with the bowl's rim drawn over the paw where they overlap. No paw sinks into the bowl, no "
        "paw comes out the far side of it, and the bowl is not stuck to his chin. "
        + ARMS),
    "noisy_kitchen_r1": (
        "**THE POT LID MUST NOT FLOAT IN THE AIR.** Draw it tipped up at an angle resting on the near "
        "rim of the pot, one edge on the rim and the other lifted, steam escaping through the gap. "
        "It stays touching the pot. No second lid, nothing hovering.\n"),
    # ---- 續集：秘笈與卷軸要跟修好的場景圖一致 ----
    "daxia_teach_r0": (
        "**THE MANUAL IS THE WRONG SHAPE IN THE OLD VERSION - it is a long wide slab.** Copy the book "
        "from the attached picture exactly: a small old cloth-bound manual roughly as wide as his own "
        "head, worn and fraying at the corners, with THREE small dark stick-figure cats in fighting "
        "stances drawn across the two open pages. Here he has pressed it FLAT on the ground with one "
        "paw and is holding up his other forearm, copying one of the three stances.\n"),
    "lost_scroll_r0": (
        "**THE SCROLL MUST BE THE SAME SCROLL AS IN THE ATTACHED PICTURE.** Cream paper rolled around "
        "a plain wooden rod at EACH end, straight edges, even roll, no tears; THREE panels side by "
        "side divided by two thin ruled lines, each holding one simple dark stick-figure cat in a "
        "stance with abstract brush squiggles beside it. Here it is spread open on the ground with "
        "his brown TOOL BAG set on one corner to hold it down, and he leans over it pointing at the "
        "middle panel. Three panels, countable at a glance - not a wide map, not a chart of circles "
        "and dots.\n"),
}

WAVE1 = ["daxia_teach", "broken_shrine", "lost_scroll", "noisy_kitchen", "sleeping_guard",
         "stuck_kitten", "robin_r0", "blocked_r0", "sparring_cat_r1", "cat_tower_r0",
         "cat_tower_r1", "training_hall_r0"]
WAVE2 = ["daxia_teach_r0", "broken_shrine_r0", "lost_scroll_r0", "noisy_kitchen_r0",
         "noisy_kitchen_r1"]


def find_job(fid: str) -> dict:
    """既有工單挖出來。同名出現在多份檔案時取**最新的那一份**（後來修過的那批）。"""
    hits = [p for p in sorted(JOBS.glob("*.json")) if f'"{fid}"' in p.read_text(encoding="utf-8")]
    if not hits:
        raise SystemExit(f"!! 找不到 {fid} 的工單")
    best = max(hits, key=lambda p: p.stat().st_mtime)
    v = json.loads(best.read_text(encoding="utf-8"))[fid]
    return v if isinstance(v, dict) else {"prompt": v, "ref": ""}


def main() -> None:
    wave = sys.argv[1] if len(sys.argv) > 1 else ""
    if wave not in ("1", "2"):
        raise SystemExit("用法：python tools/make_fix_0917b_jobs.py <1|2>\n"
                         "  1  六張場景圖＋六張不受影響的續集圖（先跑這波，跑完要進倉）\n"
                         "  2  場景圖改掉的那五張續集（參考圖會照新的場景圖重建）")
    names = WAVE1 if wave == "1" else WAVE2
    bg = json.loads(MANIFEST.read_text(encoding="utf-8"))["bg"]
    jobs: dict[str, dict[str, str]] = {}

    for eid in names:
        fid = f"event_dangdang_{eid}.png"
        job = find_job(fid)
        prompt = job["prompt"]
        if prompt.count(ANCHOR) != 1:
            raise SystemExit(f"!! {fid}：找不到唯一的 {ANCHOR!r}，工單格式變了")
        extra = HEAD + FIX[eid]
        # 忍具那段也要一起帶（不然修好鍋蓋又把兩個忍具畫回木湯匙）。
        # 挖到的可能已經是 `make_fix_0917_jobs.py` 出的那份、裡面就有這一段，別接第二次。
        if eid == "noisy_kitchen_r1" and NINJA_TOOLS.strip() not in prompt:
            extra += NINJA_TOOLS
        prompt = prompt.replace(ANCHOR, extra + "\n" + ANCHOR, 1)

        ref = job.get("ref", "")
        if "_r" in eid:
            # 續集圖的參考圖照**現行的**場景圖重建。第二波的場景圖剛換過，這一步是重點。
            base = eid.rsplit("_r", 1)[0]
            p = his_ref(base, bg)
            if p is None:
                raise SystemExit(f"!! {base} 的場景圖不在倉裡")
            ref = str(p.relative_to(ROOT)).replace("\\", "/")
        jobs[fid] = {"prompt": prompt, "ref": ref}

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M")
    kept = 0
    for fid in jobs:
        old = RAW / fid
        if old.exists():
            old.rename(old.with_name(f"{old.stem}.prev-{stamp}.png"))
            kept += 1
    if kept:
        sys.stdout.write(f"舊稿改名留底 {kept} 張（.prev-{stamp}.png）\n")

    ns = list(jobs)
    for i, part in enumerate((ns[0::2], ns[1::2])):
        out = JOBS / f"fix_0917b_{wave}{'ab'[i]}.json"
        out.write_text(json.dumps({n: jobs[n] for n in part}, ensure_ascii=False, indent=1),
                       encoding="utf-8")
        sys.stdout.write(f"{len(part)} 張 → {out.relative_to(ROOT)}\n")
    sys.stdout.write("進倉指令：\n  python tools/add_event_art.py " + " ".join(ns) .replace("event", "event") + "\n")


if __name__ == "__main__":
    main()
