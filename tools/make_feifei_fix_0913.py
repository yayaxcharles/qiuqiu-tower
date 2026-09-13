# -*- coding: utf-8 -*-
"""2026-09-13 下午使用者實測回報的七張重做。

| 檔案 | 壞在哪 |
|---|---|
| card_feifei_lianhuan | 牌名叫「連環針」，圖裡她在飛踢（照球球「連環踢」畫的） |
| card_feifei_zuiquan | 牌名叫「絕學·亂針」，圖裡是個酒葫蘆（球球是「醉拳」） |
| card_feifei_tieshazhang | 牌名叫「絕學·毒砂」，圖裡是個大手掌印（球球是「鐵砂掌」） |
| event_feifei_daxia_teach | 書本斜著、她在旁邊往上看；應該書正對她、她低頭正眼看書 |
| event_feifei_chest_closed | 頭髮塌成一頂咖啡色鍋蓋、臉的比例跑掉，完全不像她 |
| event_feifei_chest_open | 同上 |
| event_feifei_chest_empty | 同上 |

**牌面那三張**由 `make_feifei_shared_card_jobs.py` 的 `SCENE_FIX` 修好了，這裡直接取。

**紙箱那三張的根因值得記**：`chest_closed` 是拿**她自己的** `chest_open` 當參考圖畫的
（續集圖的做法），而 `chest_open` 本身就已經跑版了——錯誤就這樣傳下去。
所以這裡三張一律改用設定表 `tools/ref/feifei_ref.png`（那張是乾淨的，逐張確認過），
不互相參考。

**為什麼這三張特別容易跑**：它們都是「一隻貓佔半個畫面」的大特寫，頭在畫面裡很大，
模型就會把頭髮畫得很細、細到變成一整頂假髮。所以除了 `feifei_look()` 之外，
再加一句「頭部照參考圖一比一抄」。

用法：
  python tools/make_feifei_fix_0913.py
  python tools/codex_gen.py tools/codex_jobs/feifei_fix_0913.json
  （**不要帶 --ref**：每一筆自己帶）
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import STYLE, feifei_look  # noqa: E402

JOBS = ROOT / "tools" / "codex_jobs"
OUT = JOBS / "feifei_fix_0913.json"
REF = "tools/ref/feifei_ref.png"

CARDS = ["lianhuan", "zuiquan", "tieshazhang"]

# 大特寫專用的補強：頭部一比一抄參考圖。
# `feifei_look()` 已經把瀏海／結／馬尾三部分寫清楚了，但在大特寫裡模型還是會
# 「把它畫得更漂亮」——多加一句「不要詮釋，照抄」比再描述一次有效。
HEAD_COPY = (
    "**HER HEAD IS A ONE-TO-ONE COPY OF THE ATTACHED REFERENCE SHEET.** Do not reinterpret it, do not "
    "make it prettier, do not add volume. Look at the reference and match: the dark brown FRINGE is a "
    "few short ragged points over her forehead and nothing more - the rest of the top of her skull is "
    "BARE CREAM FUR with the two ears rising straight out of it. The PLUM-PURPLE BOW sits on top "
    "between the ears, about as wide as one ear. The PONYTAIL is a small spiky tuft behind the bow with "
    "visible background in the gap between it and her skull. **If the brown covers the whole top and "
    "sides of her head it is wrong** - that is a wig, and she does not wear one.\n")

SCENES = {
    "event_feifei_daxia_teach.png":
        "A single scene illustration for a story event in a cute cartoon roguelike card game, landscape "
        "composition. THE ONLY CHARACTER IN THE PICTURE IS THE SIAMESE CAT GIRL.\n"
        + feifei_look() + HEAD_COPY +
        "\nWHAT THIS PICTURE SHOWS: a huge old technique manual lies OPEN AND FLAT on a low stone slab, "
        "**squarely facing the viewer** - both pages fully visible, the spine running left-to-right "
        "across the bottom of the picture, the pages filling the lower half of the frame. Hand-brushed "
        "squiggles fill the right page and a simple line drawing of a cat in a fighting stance fills "
        "the left.\n"
        "She is behind the book in the CENTRE of the picture, front paws resting flat on the open pages "
        "on either side, leaning in over it. **Her head is tipped DOWN and she is looking STRAIGHT AT "
        "THE PAGES** - her eyes point down at the book, not up, not sideways, not at the viewer. Her "
        "mouth is slightly open in concentration. The book is square to her, not tilted away.\n"
        "The composition is symmetrical and calm: book flat and centred at the bottom, cat centred "
        "above it.\n"
        "No text, no letters, no numbers, no watermark, no user interface, no border.\n"
        + STYLE +
        "Output 1024x768 PNG. Save the image as event_feifei_daxia_teach.png in the current directory "
        "and report the path.",

    "event_feifei_chest_closed.png":
        "A single scene illustration for a story event in a cute cartoon roguelike card game, landscape "
        "composition. THE ONLY CHARACTER IN THE PICTURE IS THE SIAMESE CAT GIRL.\n"
        + feifei_look() + HEAD_COPY +
        "\nWHAT THIS PICTURE SHOWS: a battered cardboard box sits CLOSED on the LEFT, its top flaps "
        "folded shut and taped down with a strip of pale packing tape across the middle. No light, no "
        "glow, no sparkles, no shredded paper - nothing has happened yet.\n"
        "She is crouched beside it on the RIGHT with both front paws pressed on the taped lid, leaning "
        "in, eyes wide and eager, about to tear it open. Mouth closed in a small excited smile, tail "
        "curled up behind her.\n"
        "No text, no letters, no numbers, no watermark, no user interface, no border.\n"
        + STYLE +
        "Output 1024x768 PNG. Save the image as event_feifei_chest_closed.png in the current directory "
        "and report the path.",

    "event_feifei_chest_open.png":
        "A single scene illustration for a story event in a cute cartoon roguelike card game, landscape "
        "composition. THE ONLY CHARACTER IN THE PICTURE IS THE SIAMESE CAT GIRL.\n"
        + feifei_look() + HEAD_COPY +
        "\nWHAT THIS PICTURE SHOWS: the cardboard box on the LEFT has just been torn open and a wide "
        "column of warm GOLDEN light blasts straight up out of it with sparkles, shredded packing paper "
        "flying out around the rim. **Leave the middle of the light column empty** - a treasure icon "
        "gets placed there afterwards, so nothing may overlap it.\n"
        "She is on the RIGHT, one paw still on the box flap, leaning back a little with her eyes wide "
        "and her mouth open in delight, lit warm from the side by the golden light.\n"
        "The light is GOLDEN-YELLOW and ORANGE, never green.\n"
        "No text, no letters, no numbers, no watermark, no user interface, no border.\n"
        + STYLE +
        "Output 1024x768 PNG. Save the image as event_feifei_chest_open.png in the current directory "
        "and report the path.",

    "event_feifei_chest_empty.png":
        "A single scene illustration for a story event in a cute cartoon roguelike card game, landscape "
        "composition. THE ONLY CHARACTER IN THE PICTURE IS THE SIAMESE CAT GIRL.\n"
        + feifei_look() + HEAD_COPY +
        "\nWHAT THIS PICTURE SHOWS: a battered cardboard box lies tipped over on its side on the LEFT, "
        "completely EMPTY, flaps torn open, a drift of shredded packing paper spilling out across the "
        "floor. No light, no glow, no sparkles anywhere - this is the anticlimax.\n"
        "She sits slumped on the floor on the RIGHT beside it, shoulders dropped, ears flattened, one "
        "paw still resting on the box, wearing a flat deadpan disappointed look. **The shredded paper "
        "stays on the floor and on the box - none of it lands on her head or covers her hair.**\n"
        "Quiet, dim, cool mood.\n"
        "No text, no letters, no numbers, no watermark, no user interface, no border.\n"
        + STYLE +
        "Output 1024x768 PNG. Save the image as event_feifei_chest_empty.png in the current directory "
        "and report the path.",
}


def main() -> None:
    cards = json.loads((JOBS / "feifei_shared_cards.json").read_text(encoding="utf-8"))
    jobs: dict[str, dict] = {}
    for cid in CARDS:
        k = f"card_feifei_{cid}.png"
        if k not in cards:
            raise SystemExit(f"!! feifei_shared_cards.json 裡沒有 {k}——先跑 make_feifei_shared_card_jobs.py")
        jobs[k] = {"prompt": cards[k], "ref": REF}
    for k, p in SCENES.items():
        jobs[k] = {"prompt": p, "ref": REF}

    # 自檢：三張牌的動作真的換掉了嗎（SCENE_FIX 沒生效的話這裡會抓到）。
    #
    # **要找的是舊的場景敘述整句，不是關鍵字**：第一版寫成找 "kick arcs"，
    # 結果新敘述裡的反向護欄「Do not draw kick arcs…」自己撞上去，誤報。
    # 換角度想，這條檢查跟第九個雷是同一件事——檢查要說對它在找什麼。
    must_gone = {
        "card_feifei_lianhuan.png": "three overlapping crescent-shaped kick arcs stacked in a fan",
        "card_feifei_zuiquan.png": "a fat wine-red gourd flask tipped over",
        "card_feifei_tieshazhang.png": "a flat grey handprint slammed down",
    }
    must_have = {
        "card_feifei_lianhuan.png": "VOLLEY OF SLIM DARTS",
        "card_feifei_zuiquan.png": "WILD SCATTER OF NEEDLES",
        "card_feifei_tieshazhang.png": "CLOUD OF POISONED SAND",
    }
    for k, phrase in must_gone.items():
        if phrase in jobs[k]["prompt"]:
            raise SystemExit(f"!! {k} 還留著舊的場景敘述「{phrase[:40]}…」——SCENE_FIX 沒套上")
        if must_have[k] not in jobs[k]["prompt"]:
            raise SystemExit(f"!! {k} 沒有新的場景敘述「{must_have[k]}」——SCENE_FIX 沒套上")
    # 自檢：每一筆都帶設定表，不可以互相參考（紙箱那三張就是這樣傳染的）
    bad = [k for k, v in jobs.items() if v["ref"] != REF]
    if bad:
        raise SystemExit(f"!! 這幾筆沒帶設定表：{bad}")

    OUT.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 張 → {OUT.relative_to(ROOT)}（全部帶 {REF}）")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_fix_0913.json")


if __name__ == "__main__":
    main()
