# -*- coding: utf-8 -*-
"""2026-09-17 逐張對「句子寫幾個、圖上畫幾個」之後，**改字解不掉、只能重生**的五張（全是他的）。

掃法：把每個事件文字裡「數字＋量詞」的句子撈出來（兩個忍具、三塊銅片、一隻老鼠……），
只留數量**兩個以上**的，再把對應的插圖拼成聯絡表用眼睛逐張對。共 11 張要對，五張不合。

| 檔案 | 句子寫的 | 圖上畫的 |
|---|---|---|
| event_dangdang_lost_kitten_r0 | 小黑貓把**兩個忍具**塞給他 | 反過來——他遞一個紅罐子給小黑貓，忍具零個 |
| event_dangdang_noisy_kitchen_r1 | 取出**兩個忍具**，對照圖示檢查 | 兩根**木湯匙**，連旁邊的圖示卡畫的都是湯匙 |
| event_dangdang_medicine_cat_r0 | 三花貓取出**兩個忍具** | 他拿著**放大鏡**，忍具零個 |
| event_dangdang_catnip_field_r1 | 交給老貓，換回**兩個忍具** | 兩隻手上各一個銅器；另外兩位那張都有裝滿手裏劍的忍具箱 |
| event_dangdang_toolbox | **一隻**老鼠推車、箱角包**三塊**銅片、第四角只釘薄木板 | **兩隻**老鼠；銅片與薄木板那角完全沒畫 |

**前四張是同一個病根，而且是他的提示詞自己造成的**（球球與菲菲沒踩到）：
  - `ACTOR` 裡寫著「**NO thrown weapon, no blade**」——手裏劍正好是投擲武器，等於明文禁止畫忍具；
  - 又寫著「兩個銅護腕是角色本身、每張都要看得到」，於是模型把該拿的東西一律換成銅色器物。
  這兩條本來是為了擋「他變成拿刀的忍者」跟「護腕不見了」，在別的場景都對，只有**收下忍具**這種
  場合互相打架。修法不是拿掉那兩條（拿掉別的圖會走鐘），是**在這四張補一段例外**：
  忍具是別人給他的東西、不是他的武器，他收下但不使用。

第五張 `toolbox` 的提示詞本來就寫對了（「one small rat」「three of its corners are capped with
BRONZE PLATES and the fourth corner has only a thin pale plank」），是生成沒照做，重生一次即可，
但順手把數量那兩句加粗提到最前面。

**參考圖的紀律**（記憶 `reference_mus_art_pipeline`：續集的長相全靠參考圖，參考圖過期會抄到壞版本）：
前四張是續集圖，參考圖由 `his_ref` 照現行場景圖自動重建，比場景圖舊就會自己換掉。
第五張是場景圖本身，附的是他的角色參考圖。

用法（兩條線，多開會互相餓死——`codex_gen.py` 的坑 1）：

  python tools/make_fix_0917_jobs.py
  python tools/codex_gen.py tools/codex_jobs/fix_0917_a.json
  python tools/codex_gen.py tools/codex_jobs/fix_0917_b.json
  python tools/add_event_art.py event_dangdang_lost_kitten_r0.png event_dangdang_noisy_kitchen_r1.png \
      event_dangdang_medicine_cat_r0.png event_dangdang_catnip_field_r1.png event_dangdang_toolbox.png

**舊原稿一律先改名留底**（`codex_gen.py` 看到檔案在就跳過、還印成功，坑 7）。這支自己會做。
"""
import datetime as dt
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from make_dangdang_result_art_jobs import (  # noqa: E402
    ACTOR, HEAD, MANIFEST, MAY_MOVE, RAW, SAME_PLACE, TAIL, TEXT, his_ref,
)

JOBS = ROOT / "tools" / "codex_jobs"

# ---------------------------------------------------------------------------
# 忍具長什麼樣：照球球與菲菲那兩批既有的畫法（手裏劍＋黑色圓炸彈），數量寫死兩個。
# 這一段同時**解掉他自己提示詞裡的禁令**，不然模型照規矩畫不出手裏劍。
# ---------------------------------------------------------------------------
TOOLS = (
    "\n\n**THE TWO NINJA TOOLS - this is the part the old picture got wrong, so read it twice.**\n"
    "The sentence above says he ends up with TWO NINJA TOOLS, and they must be visible and countable "
    "at a glance: one flat grey FOUR-POINTED THROWING STAR and one round black BOMB with a short pale "
    "fuse. Exactly two, clearly separate from each other, not overlapping, not hidden behind a paw, "
    "not tucked away in a bag. Draw them big enough to recognise at 420 pixels wide.\n"
    "**THIS OVERRIDES THE 'no thrown weapon, no blade' RULE BELOW, and only for these two objects.** "
    "That rule is about how HE fights - he still fights with his forearms and never throws anything. "
    "These two tools are things somebody GIVES him: he is receiving them, looking at them or putting "
    "them away, never throwing one and never holding one like a weapon.\n"
    "**And they are NOT bronze.** His two bronze bracers stay on his forearms where they belong; the "
    "tools are a separate grey star and a separate black bomb. Do not turn the tools into bronze cups, "
    "bronze cuffs, bronze bells, wooden spoons, a magnifying glass, a bottle or a jar - every one of "
    "those has been drawn here by mistake before.\n")

# 誰把東西交給誰。四張的方向不一樣，弄反是這批最常見的錯（他那張小黑貓的就是反的）。
GIVER = {
    "lost_kitten_r0": (
        "**DIRECTION OF THE HANDOVER:** the small BLACK KITTEN is the one giving. It pushes the two "
        "tools into his paws with both of its front paws; he is crouched down taking them, both his "
        "rounded paws closing around them. He is NOT handing the kitten anything.\n"),
    "noisy_kitchen_r1": (
        "**WHERE THEY COME FROM:** an open wooden SPARE-TOOLS BOX sits on the floor beside the stove "
        "with more throwing stars and round bombs packed inside. He has lifted two of them out and "
        "holds one in each paw, turning them to look, glancing at the small painted instruction card "
        "propped against the box. **That card shows a THROWING STAR and a BOMB drawn on it** - not "
        "spoons, not ladles, not cooking utensils.\n"),
    "medicine_cat_r0": (
        "**DIRECTION OF THE HANDOVER:** the CALICO CAT behind the stall is the one giving. She holds "
        "the two tools out across the counter toward him; he leans in and takes them, peering closely "
        "at the markings on them. He holds no magnifying glass and no lens - he looks with his own "
        "eyes, brought right up close.\n"),
    "catnip_field_r1": (
        "**BOTH HALVES OF THE TRADE ARE IN THE PICTURE:** with one paw he pushes a fat bundle of "
        "freshly picked catnip toward the OLD GARDENER CAT; with his other paw he is taking the two "
        "tools the gardener holds out to him. Beside the gardener an open WOODEN CHEST sits on the "
        "ground with more throwing stars and round bombs packed inside, so it is obvious where the "
        "tools came from.\n"),
}

# 第五張：老鼠與板車。數量那兩句提到最前面，加粗。
TOOLBOX = (
    "\n\n**COUNT THESE TWO THINGS BEFORE YOU FINISH - the old picture got both of them wrong.**\n"
    "  (1) **EXACTLY ONE RAT.** One small grey rat in a ragged tunic, and no other rodent anywhere in "
    "the picture. The old version drew two. There are TWO characters in this picture in total: "
    "Dangdang and that one rat.\n"
    "  (2) **THE CHEST'S FOUR CORNERS ARE THE POINT OF THIS SCENE.** The battered wooden tool chest on "
    "the cart has BRONZE CORNER PLATES on THREE of its corners - flat bronze caps wrapped over the "
    "corner and fixed with visible round studs - and its FOURTH corner has no bronze at all, just a "
    "thin pale plank nailed roughly across it. Turn the chest so that the bare fourth corner and at "
    "least two of the bronze ones are facing us, and draw the mismatch plainly: he recognises his own "
    "chest by it, so if a viewer cannot see it the picture has failed.\n")


def stamp_old(names: list[str]) -> None:
    """舊原稿改名留底。不做的話 `codex_gen.py` 看到檔案在就跳過、還印成功（坑 7）。"""
    s = dt.datetime.now().strftime("%Y%m%d-%H%M")
    kept = 0
    for fid in names:
        old = RAW / fid
        if old.exists():
            old.rename(old.with_name(f"{old.stem}.prev-{s}.png"))
            kept += 1
    if kept:
        sys.stdout.write(f"舊稿改名留底 {kept} 張（.prev-{s}.png）\n")


def main() -> None:
    text = json.loads(TEXT.read_text(encoding="utf-8"))
    bg = json.loads(MANIFEST.read_text(encoding="utf-8"))["bg"]
    jobs: dict[str, dict[str, str]] = {}

    for eid, extra in GIVER.items():
        fid = f"event_dangdang_{eid}.png"
        ref = his_ref(eid.rsplit("_r", 1)[0], bg)
        if ref is None:
            raise SystemExit(f"!! {eid} 的場景圖不在倉裡，沒有東西可以當參考")
        same = MAY_MOVE if eid == "lost_kitten_r0" else SAME_PLACE
        prompt = (HEAD.format(same=same) + text[eid]["dangdang"] + TOOLS + "\n" + extra
                  + ACTOR + TAIL.format(name=fid))
        jobs[fid] = {"prompt": prompt, "ref": str(ref.relative_to(ROOT)).replace("\\", "/")}

    # 第五張是場景圖，工單格式跟結果圖不同：直接把既有那份挖出來改，別重寫一份。
    src = JOBS / "dangdang_events_2.json"
    old = json.loads(src.read_text(encoding="utf-8"))["event_dangdang_toolbox.png"]
    anchor = "WHAT THIS PICTURE SHOWS:"
    if old.count(anchor) != 1:
        raise SystemExit("!! toolbox 的工單格式變了，找不到 WHAT THIS PICTURE SHOWS")
    ref = ROOT / "tools" / "ref" / "dangdang_ref.png"
    if not ref.exists():
        cands = sorted((ROOT / "tools" / "ref").glob("dangdang*.png"))
        if not cands:
            raise SystemExit("!! 找不到他的角色參考圖 tools/ref/dangdang*.png")
        ref = cands[0]
    jobs["event_dangdang_toolbox.png"] = {
        "prompt": old.replace(anchor, TOOLBOX.strip() + "\n\n" + anchor, 1),
        "ref": str(ref.relative_to(ROOT)).replace("\\", "/"),
    }

    stamp_old(list(jobs))

    names = list(jobs)
    for i, part in enumerate((names[0::2], names[1::2])):
        out = JOBS / f"fix_0917_{'ab'[i]}.json"
        out.write_text(json.dumps({n: jobs[n] for n in part}, ensure_ascii=False, indent=1),
                       encoding="utf-8")
        sys.stdout.write(f"{len(part)} 張 → {out.relative_to(ROOT)}\n")


if __name__ == "__main__":
    main()
