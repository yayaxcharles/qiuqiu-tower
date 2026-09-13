# -*- coding: utf-8 -*-
"""菲菲的事件插圖（2026-09-12）。

**為什麼要做**：76 張事件／畫面插圖裡有 54 張把球球畫進去了（大俠傳功那張他就趴在秘笈上）。
玩菲菲時讀到的故事是她的、圖卻是他。跟結局那八張同一類問題。

**為什麼是轉換不是重寫**：那 54 段場景敘述講的是「這座塔發生的事」，換個主角照樣成立
（跟 `eventTextFor` 機械替換文案同一個判斷）。重寫 54 段的風險反而更高——
每段都是一次走鐘的機會，而場景本身根本沒有要改的理由。所以這支只做三件事：
  1. 把球球的外觀段整段換成 `art_rules.feifei_look()`
  2. 把場景敘述裡指涉主角的詞換成她
  3. 輸出檔名改成 `event_feifei_<編號>`（**前綴的位置有講究**，見 `rename`）

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
REF = "tools/ref/feifei_ref.png"   # 每一筆都自己帶，不靠命令列的 --ref

# 球球的外觀段。**有三種格式**（不同時期產的工單），三種都要認。
# 漏認一種的後果不是報錯，是**那一批默默不轉**：第一版只認第一種，少掉 26 張；
# 第二版加了第二種，還是少掉 77 張（結果圖 `_r0`／`_r1` 整類都是第三種），
# 是使用者玩到紙箱看見球球才發現的。
#   一：整段把他的毛色裝束寫出來，結尾「long ringed tail.」＋換行
#   二：只寫「照附的參考圖畫」，靠 `--ref` 帶圖進去
#   三：同樣寫毛色裝束但**接在同一行**、結尾是「not a different cat.」
# 三種都整段換掉，不是逐詞替換。
#
# 加新格式時**一定要重跑 `檢查漏網.py` 式的比對**（見 `main` 最後印出來的數字）：
# 「工單裡提到球球的張數」要等於「轉出來的張數」，差多少就是漏認多少。
NINJA_BLOCK = re.compile(
    r"The grey tabby cat ninja hero, when present, looks like this:.*?long ringed tail\.\n"
    r"|THE CAT: whenever the grey tabby cat ninja appears.*?stretch its body out\.\n"
    r"|The grey tabby cat ninja hero is EXACTLY the character in the attached reference image:.*?not a different cat\.\s*",
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


def rename(fid: str) -> str:
    """`event_toll.png` → `event_feifei_toll.png`（理由見 `convert`）。"""
    return "event_feifei_" + fid[len("event_"):]


def convert(text: str, fid: str) -> str:
    out = NINJA_BLOCK.sub(FEIFEI_BLOCK, text)
    for a, b in ACTOR:
        out = out.replace(a, b)
    # 存檔指令裡的檔名也要換
    # 檔名是 `event_feifei_<編號>` **不是** `feifei_event_<編號>`：
    # `add_event_art.py` 砍掉開頭的 `event_` 當事件編號，再組成 `bg/event_<編號>`，
    # 而畫面那邊 `eventArtKey` 找的正是 `bg/event_feifei_<編號>`。前綴擺錯位置就對不上。
    return out.replace(f"Save the image as {fid}", f"Save the image as {rename(fid)}")


def prompt_of(v: object) -> str:
    """工單的值有兩種：**字串**（就是提示詞）或 **{prompt, ref} 物件**。

    第一版寫成「不是字串就跳過」，於是 77 張物件格式的工單（結果圖 `_r0`／`_r1` 整類、
    紙箱那三張）**連看都沒看**就被丟掉——使用者玩到紙箱看見球球才發現。
    這是漏最多的一次，比少認一種提示詞格式還嚴重。
    """
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        pv = v.get("prompt")
        return pv if isinstance(pv, str) else ""
    return ""


def main() -> None:
    src: dict[str, str] = {}
    for f in sorted(JOBS.glob("*.json")):
        if f.name.startswith("feifei_"):
            continue                                   # 她自己的那幾批不轉
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            # **壞掉的工單不可以靜靜跳過**（2026-09-13 稽核 中-8）。
            # 存成帶 BOM 或多一個逗號，這個檔就同時從「要轉的」與「自檢該喊的」兩邊消失，
            # 自檢因此照樣印過關——而少轉的那批要等使用者玩到才會發現。
            raise SystemExit(f"!! 工單 {f.name} 解析不了：{e}"
                             "　（常見原因：存成 UTF-8 with BOM、或 JSON 多一個逗號）")
        if not isinstance(d, dict):
            continue
        for k, v in d.items():
            if not k.startswith("event_") or k.startswith("event_feifei_"):
                continue
            t = prompt_of(v)
            if not t or not NINJA_BLOCK.search(t):
                continue                               # 圖裡本來就沒有他，不用生
            src[k] = t                                 # 同名後蓋前：_v2 那種修正版會贏

    # 一律附她的參考圖（物件格式原本各自帶球球的參考圖，那張不能留）
    jobs = {rename(k): {"prompt": convert(v, k), "ref": REF} for k, v in src.items()}

    def outside(v: str) -> str:
        return v.replace(FEIFEI_BLOCK, "")

    bad = {k: LEFTOVER.findall(outside(v['prompt']))[:3] for k, v in jobs.items() if LEFTOVER.search(outside(v['prompt']))}
    review = sorted(k for k, v in jobs.items() if REVIEW.search(outside(v['prompt'])))
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
    # **自檢：有沒有整批默默漏認**（兩次都栽在這裡，所以寫成程式不靠眼睛）。
    # 「工單裡提到球球的事件圖」應該等於「轉出來的張數」，差多少就是 NINJA_BLOCK 少認幾種格式。
    loose = re.compile(r"grey tabby|gray tabby|Qiuqiu|ninja cat|cat ninja|grey ninja", re.I)
    should = set()
    for f in sorted(JOBS.glob("*.json")):
        if f.name.startswith("feifei_"):
            continue
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            # **壞掉的工單不可以靜靜跳過**（2026-09-13 稽核 中-8）。
            # 存成帶 BOM 或多一個逗號，這個檔就同時從「要轉的」與「自檢該喊的」兩邊消失，
            # 自檢因此照樣印過關——而少轉的那批要等使用者玩到才會發現。
            raise SystemExit(f"!! 工單 {f.name} 解析不了：{e}"
                             "　（常見原因：存成 UTF-8 with BOM、或 JSON 多一個逗號）")
        if not isinstance(d, dict):
            continue
        for k, v in d.items():
            t = prompt_of(v)
            if t and k.startswith("event_") and not k.startswith("event_feifei_") and loose.search(t):
                should.add(k)
    # **結果圖那一整類不歸這支管**（2026-09-13）。它們沒有外觀敘述、靠附原插圖當參考，
    # 所以 `NINJA_BLOCK` 一張都認不出來——那不是「少認一種格式」，是另一種工單。
    # 交給 `make_feifei_result_art_jobs.py`，這裡把它已經涵蓋的扣掉再比。
    #
    # 為什麼要扣：這條自檢本來就一直在喊「有 61 張沒轉到」，喊了好幾天沒人處理，
    # 因為訊息混在一長串輸出裡、而且**喊的是錯的原因**（說少認格式，其實是別支的事）。
    # 一條永遠紅的檢查等於沒有檢查。
    # **口徑是「manifest 裡有沒有她的圖」，不是「有沒有開工單」**（2026-09-13 稽核 中-8）。
    # 看工單的話有兩個壞處：一是工單開了圖沒生出來照樣算過關；
    # 二是等圖都生完、重跑那支產生器時它會因為「已經有圖、跳過」而輸出空的工單檔，
    # 這條又會紅起來喊「61 張沒轉到」——正是這次要修掉的毛病復發。
    # 看 manifest 兩個方向都對，而且跟 `tools/feifei_stills.test.ts` 同一個口徑。
    mf = json.loads((ROOT / "public" / "assets" / "manifest.json").read_text(encoding="utf-8"))
    covered = {f"event_{k[len('bg/event_feifei_'):]}.png"
               for k in mf["bg"] if k.startswith("bg/event_feifei_")}
    # 還沒生出來、但工單已經開好的也算（不然這條在生圖那幾小時會一直紅）
    rp = JOBS / "feifei_result_art.json"
    if rp.exists():
        for k in json.loads(rp.read_text(encoding="utf-8")):
            covered.add("event_" + k[len("event_feifei_"):])
    # 遊戲裡查不到的舊工單名字（`catnip_field_take` 用的 resultArt 早就改成 `catnip_field_r1`）
    DEAD = {"event_catnip_field_take.png"}

    gap = sorted(should - set(src) - covered - DEAD)
    if gap:
        print(f"!! 有 {len(gap)} 張提到球球卻沒被轉到——NINJA_BLOCK 少認一種格式：")
        for k in gap[:12]:
            print(f"   {k}")
        raise SystemExit(1)
    print(f"自檢過關：工單裡提到球球的 {len(should)} 張，"
          f"這支轉了 {len(src)} 張、結果圖那支涵蓋 {len(covered)} 張、死名字 {len(DEAD)} 張")

    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_events.json "
          "--ref tools/ref/feifei_ref.png")


if __name__ == "__main__":
    main()
