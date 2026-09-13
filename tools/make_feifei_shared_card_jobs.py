# -*- coding: utf-8 -*-
"""菲菲版的「共用牌」牌面工單（2026-09-12，使用者：「全部分家」）。

她抽得到的 98 張共用牌現在用的是球球的圖（貓抓、亮出爪子、鐵頭功…）。
使用者要的是**每一張都有她自己的圖，效果完全一樣**。

做法：**沿用那 98 張原本的提示詞，只換角色**。
原本的提示詞早就調到位了（大物件＋貓各佔多少、填滿畫面、縮圖可讀、綠幕），
重寫 98 段只會弄丟那些調整。所以這支程式做的是：

  1. 從 `tools/codex_jobs/*.json` 撈出每張牌原本的提示詞
  2. 把裡面**描述球球的那兩段**換成菲菲（外觀來自 `art_rules.feifei_look()`，只有一份）
  3. 把輸出檔名改成 `card_feifei_<牌號>.png`

「大物件是什麼、貓在做什麼」那兩句原樣保留——那是這張牌的識別，換角色不該換。

跑法：
  python tools/make_feifei_shared_card_jobs.py
  python tools/codex_gen.py tools/codex_jobs/feifei_shared_cards.json --ref tools/ref/feifei_ref.png
"""
import argparse
import glob
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import feifei_look  # noqa: E402

OUT = ROOT / "tools" / "codex_jobs"

# 原本提示詞裡描述球球的兩塊。第一塊在「照參考圖的比例」清單裡，第二塊是獨立一段。
TABBY_IN_LIST = re.compile(
    r"   - Same grey tabby markings[^\n]*\n(?:\s+same[^\n]*\n)?", re.I)
TABBY_PARA = re.compile(
    r"The cat: light grey tabby fur[^\n]*\n(?:[^\n]*\n)?(?=\n)", re.I)

# 她的替代文字（放進原本那兩塊的位置，保持前後文的縮排與語氣）
HER_IN_LIST = (
    "   - She is a SIAMESE cat girl, not a grey tabby: creamy off-white fur with a dark seal-brown mask\n"
    "     over the muzzle and around the eyes, dark brown ears, paws and tail, bright BLUE almond eyes,\n"
    "     a plum-purple short kimono jacket with tied-back sleeves, a black sash, dark leggings, and a\n"
    "     belt of small bamboo needle-tubes. She has NO navy headband.\n"
    "   - On top of her head: a dark brown FRINGE over her forehead between and in front of her ears,\n"
    "     tied behind with a PLUM-PURPLE bow, and a short spiky PONYTAIL sticking up and back from the tie.\n"
    "     The fringe must be visible from the front - without it the hair reads as nothing.\n"
    "   - Her ears are pointed but NOT oversized (at most a third of her head's height), and her face is\n"
    "     round but NOT WIDE - do not puff her cheeks out sideways.\n")


def her_paragraph() -> str:
    """取代「The cat: light grey tabby fur…」那一段。外觀只從 art_rules 拿一份。"""
    return feifei_look() + "\n"


def convert(prompt: str, cid: str) -> str:
    p = prompt
    p = TABBY_IN_LIST.sub(HER_IN_LIST, p, count=1)
    p = TABBY_PARA.sub(her_paragraph(), p, count=1)
    # 開頭那句「showing a grey tabby cat ninja」也要換
    p = re.sub(r"showing a grey tabby cat ninja", "showing a Siamese cat girl ninja", p, flags=re.I)
    p = re.sub(r"a grey tabby cat ninja", "a Siamese cat girl ninja", p, flags=re.I)
    # 輸出檔名
    p = p.replace(f"card_{cid}.png", f"card_feifei_{cid}.png")
    # 保險：萬一某張的措辭不一樣、上面兩塊沒換到，就在結尾補一段（寧可重複也不要生成球球）
    if "SIAMESE" not in p.upper():
        p += "\n\nIMPORTANT - THE CHARACTER IS NOT A GREY TABBY:\n" + feifei_look()
    return p


def collect() -> dict[str, str]:
    """從所有舊工作檔撈出每張牌原本的提示詞（先出現的優先，重生用的修正檔在後面會蓋掉）。"""
    got: dict[str, str] = {}
    for f in sorted(glob.glob(str(OUT / "*.json"))):
        try:
            j = json.loads(pathlib.Path(f).read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(j, dict):
            continue
        for k, v in j.items():
            if not isinstance(v, str) or not k.startswith("card_") or k.startswith("card_feifei"):
                continue
            if k.startswith("card_paper_"):
                continue
            got[k[len("card_"):-len(".png")]] = v     # 後面的檔會蓋掉前面的＝用最新那版
    return got


# ---------------------------------------------------------------------------
# 逐張修正：轉換出來之後再補一刀
# ---------------------------------------------------------------------------
# **一定要寫在這裡，不要直接改產生出來的 JSON**——那個檔案每次重跑就整個蓋掉，
# 2026-09-12 手改「縮一團」之後隔天重跑就被洗掉了。
SCENE_FIX: dict[str, tuple[str, str]] = {
    # 縮一團：原本只寫「毛毯堆成圓頂」，模型把她整個埋進一坨繩子裡，貓完全看不見
    #（球球那張寫的是「棉被裹成繭、貓佔畫面 40%」，一眼看得懂）。
    "suoyituan": (
        "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in WARM TAUPE: "
        "a thick taupe woollen blanket bunched into a dome",
        "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in DEEP PLUM PURPLE: a thick "
        "quilted blanket, rumpled and puffy, wrapped up and over her into a cocoon. **It is a blanket, "
        "not a ball of yarn or rope** - draw smooth quilted panels with stitched seams, never coiled "
        "strands.\n"
        "   **HER HEAD AND FACE MUST BE FULLY VISIBLE**, poking out of the top of the cocoon with her "
        "eyes shut tight and her ponytail and bow showing. If the blanket covers her face the picture "
        "is wrong - a viewer must be able to tell at a glance that there is a cat curled up in there"),

    # ---- 改了名字就要改動作（2026-09-13 使用者回報「連環針卻在用腳踢」）----
    #
    # 這是**換角色沒換乾淨**的另一種：牌名表 `FEIFEI_CARD_NAME` 把球球的招式改成她的
    #（連環踢→連環針、醉拳→亂針、鐵砂掌→毒砂），但生圖的場景敘述是照球球那份轉的，
    # 只換了長相沒換動作。結果牌面寫「連環針」，圖裡她在飛踢。
    #
    # **怎麼找出來的**：比對牌名表裡「原名有動作字（踢／拳／掌／爪…）、新名沒有」的那幾張，
    # 9 張裡有 3 張圖真的還在演舊動作。判準寫在下面的 `action_renamed()`，
    # 以後再改名字會自己喊。
    "lianhuan": (
        "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in VIVID ORANGE: three "
        "overlapping crescent-shaped kick arcs stacked in a fan, each with motion streaks",
        "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in VIVID ORANGE: a rapid VOLLEY "
        "OF SLIM DARTS - six or seven bamboo-tubed needles flying in a tight fan, each trailing a long "
        "orange motion streak behind it, the nearest ones big and sharp. **She is THROWING, not "
        "kicking**: her throwing paw is snapped forward and open, her feet stay planted on the ground. "
        "Do not draw kick arcs, crescents or legs in the air"),
    "zuiquan": (
        "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in WINE RED: a fat wine-red "
        "gourd flask tipped over, with a thick wobbly splash coming out",
        "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in WINE RED: a WILD SCATTER OF "
        "NEEDLES flung out all at once - a dozen slim darts sprayed in every direction at messy, uneven "
        "angles, some tumbling end over end, wine-red motion streaks behind them. It should read as "
        "'a fistful thrown without aiming', not a neat volley. **No wine gourd, no flask, no liquid**"),
    "tieshazhang": (
        "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in SANDY OCHRE AND IRON GREY: a "
        "flat grey handprint slammed down, with a wide fan of ochre sand grains blasting out from under it",
        "1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in SANDY OCHRE AND SICKLY GREEN: "
        "a wide billowing CLOUD OF POISONED SAND thrown from her paw - a broad fan of ochre grains with "
        "sickly green vapour curling through it, spreading out and away from her. She has just flung it "
        "underarm, paw open and low. **No handprint, no palm strike, no slammed hand shape** - it is "
        "sand she threw, not a hand that hit"),
}


def action_renamed() -> set[str]:
    """她的牌名把原本的**動作**換掉的那幾張。

    判準很粗但夠用：原名裡有身體部位或打擊動作的字（踢、拳、掌、爪…），
    她的新名字裡沒有——那就表示招式本身換了，圖多半還在演舊的。
    球球「連環踢」→她「連環針」就是這樣，圖裡她照樣在飛踢。

    回傳的是**候選**不是錯誤：有些換了名字圖本來就對（`qinna` 擒拿手→絆索，
    圖畫的是繩索，本來就沒有手）。所以呼叫端只是提醒，不中止。
    """
    src = (ROOT / "src" / "content" / "cards.ts").read_text(encoding="utf-8")
    blk = src[src.index("FEIFEI_CARD_NAME"):]
    hits: set[str] = set()
    for cid, newname, old in re.findall(r"^\s*(\w+):\s*'([^']+)',\s*//\s*(.+)$", blk, re.M):
        act = "踢拳掌爪抓咬撞踩擒摔肘膝尾"
        if any(a in old for a in act) and not any(a in newname for a in act):
            hits.add(cid)
    return hits


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只產前 N 張（試水溫用）")
    args = ap.parse_args()

    # 她抽得到哪些共用牌——由 `tools/_feifei_shared.json` 提供（由 npm 的測試匯出，見 README）
    listing = OUT.parent / "_feifei_shared.json"
    if not listing.exists():
        raise SystemExit(f"缺 {listing}：先跑 `npx vitest run tests/_export_shared.test.ts` 匯出清單")
    ids: list[str] = json.loads(listing.read_text(encoding="utf-8"))

    prompts = collect()
    jobs, missing = {}, []
    for cid in ids:
        if cid not in prompts:
            missing.append(cid)
            continue
        t = convert(prompts[cid], cid)
        fix = SCENE_FIX.get(cid)
        if fix:
            if fix[0] not in t:
                raise SystemExit(f"SCENE_FIX['{cid}'] 對不上原文了，來源提示詞改過——先看一眼再更新")
            t = t.replace(fix[0], fix[1], 1)
        jobs[f"card_feifei_{cid}.png"] = t
    if args.limit:
        jobs = dict(list(jobs.items())[:args.limit])

    # **改了名字就要改動作**（2026-09-13 使用者回報「連環針卻在用腳踢」）。
    #
    # 牌名表把球球的招式改掉時（連環踢→連環針），場景敘述不會自己跟著變——
    # 它是照球球那份轉的，只換長相不換動作。症狀是牌面寫針、圖裡在踢，
    # **測試全綠、畫面正常**，只有人眼看得出來。
    # 這裡把「原名有動作字、新名換掉了」的挑出來，沒有 SCENE_FIX 就喊。
    for cid in sorted(action_renamed()):
        if f"card_feifei_{cid}.png" in jobs and cid not in SCENE_FIX:
            print(f"  ⚠ {cid}：她的牌名把原本的動作換掉了，但圖的敘述沒改——"
                  f"看一下要不要加 SCENE_FIX")

    name = "feifei_shared_cards_pilot.json" if args.limit else "feifei_shared_cards.json"
    (OUT / name).write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 張 → tools/codex_jobs/{name}")
    if missing:
        print(f"  找不到原本提示詞的 {len(missing)} 張（要自己補）：{missing}")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/" + name + " --ref tools/ref/feifei_ref.png")


if __name__ == "__main__":
    main()
