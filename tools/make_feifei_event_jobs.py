# -*- coding: utf-8 -*-
"""菲菲的事件插圖（2026-09-12）。

**為什麼要做**：76 張事件／畫面插圖裡有 54 張把球球畫進去了（大俠傳功那張他就趴在秘笈上）。
玩菲菲時讀到的故事是她的、圖卻是他。跟結局那八張同一類問題。

**為什麼是轉換不是重寫**：那 54 段場景敘述講的是「這座塔發生的事」，換個主角照樣成立
（跟 `eventTextFor` 機械替換文案同一個判斷）。重寫 54 段的風險反而更高——
每段都是一次走鐘的機會，而場景本身根本沒有要改的理由。所以這支只做三件事：
  1. 把球球的外觀段整段換成 `art_rules.feifei_look()`
  2. 把場景敘述裡指涉主角的詞換成她
  3. 輸出檔名加 `feifei_` 前綴（對上 `assets.ts` 的 `eventArtKey`）

**跑完一定要驗**：這支自己會檢查輸出裡還有沒有殘留的球球字眼，有就整批不寫出來。

用法：
  python tools/make_feifei_event_jobs.py
  python tools/codex_gen.py tools/codex_jobs/feifei_events.json --ref tools/ref/feifei_ref.png
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import feifei_look  # noqa: E402

JOBS = ROOT / "tools" / "codex_jobs"
OUT = JOBS / "feifei_events.json"

# 球球的外觀段。**有兩種格式**（不同時期產的工單），兩種都要認：
#   舊：整段把他的毛色裝束寫出來
#   新：只寫「照附的參考圖畫」，靠 `--ref` 帶圖進去
# 兩種都整段換掉，不是逐詞替換
NINJA_BLOCK = re.compile(
    r"The grey tabby cat ninja hero, when present, looks like this:.*?long ringed tail\.\n"
    r"|THE CAT: whenever the grey tabby cat ninja appears.*?stretch its body out\.\n",
    re.S)

FEIFEI_BLOCK = (
    "THE CAT: the main character is a SIAMESE CAT GIRL (not a grey tabby, not a ninja in navy).\n"
    "Draw her EXACTLY like the cat in the attached reference sheet.\n"
    + feifei_look() +
    "She is the hero of this story. Never draw a grey tabby cat with a navy headband in her place.\n"
)

# 場景敘述裡指涉主角的說法。**由長到短**，不然短的會先吃掉長的一部分
ACTOR = [
    ("the grey tabby cat ninja hero", "the Siamese cat girl"),
    ("the grey tabby cat ninja", "the Siamese cat girl"),
    ("the grey tabby ninja cat", "the Siamese cat girl"),
    ("the cat ninja hero", "the Siamese cat girl"),
    ("the ninja cat hero", "the Siamese cat girl"),
    ("the grey tabby cat", "the Siamese cat girl"),
    ("the cat ninja", "the Siamese cat girl"),
    ("the ninja cat", "the Siamese cat girl"),
    ("the ninja hero", "the Siamese cat girl"),
    ("the hero cat", "the Siamese cat girl"),
    ("the grey ninja cat", "the Siamese cat girl"),
    ("the grey tabby", "the Siamese cat girl"),
    ("Qiuqiu", "the Siamese cat girl"),
    ("his headband", "her hair bow"),
]
# **不要**把「the headband」也列進來：迷路小貓那張的場景是**小貓自己**戴著一條
# 過大的忍者頭巾，那是故事內容不是主角的裝束，換掉會把事件講的事改掉。

# 殘留檢查：轉完還出現這些就是漏了。
# **要先把她自己那段挖掉再檢查**——`feifei_look()` 故意寫著「跟圓滾滾的灰虎斑相比，
# 只有臉型和耳朵不同」，那是做區隔用的，不是沒換到（第一版就誤判成整批失敗）。
# 硬擋：這幾個詞只可能指球球，出現就是漏了
LEFTOVER = re.compile(r"grey tabby|gray tabby|Qiuqiu", re.I)
# 軟提醒：頭巾與忍者裝**可能**是別的角色的（迷路小貓戴著過大的頭巾、黑貓忍者一整群），
# 所以不硬擋，只印出來讓人看一眼
REVIEW = re.compile(r"ninja headband|navy headband|ninja outfit", re.I)


def convert(text: str, fid: str) -> str:
    out = NINJA_BLOCK.sub(FEIFEI_BLOCK, text)
    for a, b in ACTOR:
        out = out.replace(a, b)
    # 存檔指令裡的檔名也要換
    return out.replace(f"Save the image as {fid}", f"Save the image as feifei_{fid}")


def main() -> None:
    src: dict[str, str] = {}
    for f in sorted(JOBS.glob("*.json")):
        if f.name.startswith("feifei_"):
            continue                                   # 她自己的那幾批不轉
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(d, dict):
            continue
        for k, v in d.items():
            if not isinstance(v, str) or not k.startswith("event_"):
                continue
            if k.startswith("event_feifei_"):
                continue
            if not NINJA_BLOCK.search(v):
                continue                               # 圖裡本來就沒有他，不用生
            src[k] = v                                 # 同名後蓋前：_v2 那種修正版會贏

    jobs = {f"feifei_{k}": convert(v, k) for k, v in src.items()}

    def outside(v: str) -> str:
        return v.replace(FEIFEI_BLOCK, "")

    bad = {k: LEFTOVER.findall(outside(v))[:3] for k, v in jobs.items() if LEFTOVER.search(outside(v))}
    review = sorted(k for k, v in jobs.items() if REVIEW.search(outside(v)))
    if bad:
        print("轉換後還有球球的字眼，沒有寫出檔案：")
        for k, hits in list(bad.items())[:10]:
            print(f"  {k}: {hits}")
        raise SystemExit(1)

    OUT.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 張 → {OUT.relative_to(ROOT)}")
    if review:
        print(f"這 {len(review)} 張的場景裡還有「頭巾／忍者裝」，看一眼是不是別的角色的：")
        for k in review:
            print(f"  {k}")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_events.json "
          "--ref tools/ref/feifei_ref.png")


if __name__ == "__main__":
    main()
