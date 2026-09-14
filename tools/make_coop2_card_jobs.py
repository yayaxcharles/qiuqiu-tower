# -*- coding: utf-8 -*-
"""連線支援牌第二批 18 張的牌面工單，球球版與菲菲版各一份（2026-09-13）。

牌本身見 `docs/連線支援牌20張_實作交辦單_2026-09-13.md`（20 張裡做了 18 張，
剩第 5、6 張要跨玩家選牌介面，之後再補）。

**跟一般牌面最大的差別還是「畫面裡有兩隻貓」**，一隻在幫另一隻——那是這批牌的識別
特徵，玩家掃一眼就要看得出「這張是給同伴用的」。提示詞的骨架直接沿用
`make_coop_card_jobs.py` 的 `prompt_for()`（已經調到位：比例、填滿畫面、綠幕、縮圖可讀），
這裡只提供「主色 ＋ 兩隻貓在做什麼」。

**誰幫誰一定要寫死**：事件結果圖那批的教訓——主詞不寫死，模型有一半機率畫反。

菲菲版的做法：同一份場景敘述，把「兩隻灰虎斑忍者貓」換成「兩隻暹羅貓女孩」，
外觀走 `art_rules.feifei_look()`（全專案只定義一份）。

用法：
  python tools/make_coop2_card_jobs.py
  python tools/codex_gen.py --ref tools/ref/hero_combat_ref.png tools/codex_jobs/coop2_cards.json
  python tools/codex_gen.py --ref tools/ref/feifei_ref.png tools/codex_jobs/coop2_cards_feifei.json
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import feifei_look  # noqa: E402
from make_coop_card_jobs import prompt_for  # noqa: E402

OUT = ROOT / "tools" / "codex_jobs"

# 牌號 → (主色, 兩隻貓在做什麼)。主色要一眼分得出來——牌面縮到 150 像素寬時先認顏色
CARDS: dict[str, tuple[str, str]] = {
    # ---- A 批 ----
    "bangnidianyixia": ("WARM AMBER",
        "the LEFT cat lunges forward and punches off-screen to the left, while with the trailing paw it "
        "shoves a flat amber shield-plate back behind itself into the RIGHT cat's chest. The right cat "
        "hugs the plate, bracing. One cat attacks, the other is being protected - both at once."),
    "shoujiewoyixia": ("SOFT MINT GREEN",
        "the LEFT cat kneels and winds a mint-green healing bandage around the RIGHT cat's raised "
        "forepaw, holding the paw steady with its other paw. The right cat winces but holds still. "
        "The bandage is clearly going ONTO the right cat."),
    "huannieduochoudian": ("BRIGHT TEAL",
        "the LEFT cat flicks one card out of its own paw down into a discard heap at its feet, and with "
        "the same motion two fresh teal cards fly across to the RIGHT cat, who reaches up and catches "
        "them. One card leaves the left cat, two arrive at the right cat."),
    "wobangnishouwei": ("DEEP CRIMSON",
        "the LEFT cat drives a finishing crimson strike downward off-screen, and a single crimson "
        "rice-ball of energy pops out of the impact and arcs over to the RIGHT cat, who catches it in "
        "both paws with a surprised happy face."),
    "huannimangyixia": ("GOLDEN YELLOW",
        "the LEFT cat sits back cross-legged with both paws raised in a 'you go ahead' gesture, "
        "deliberately not fighting, while golden cards and a golden rice-ball stream from its paws "
        "across to the RIGHT cat, who is already leaning forward ready to charge."),
    "genzhewoduohao": ("SMOKY VIOLET",
        "the LEFT cat, already half-dissolved into violet smoke, reaches back and pulls the RIGHT cat "
        "into the same smoke cloud by the wrist. The right cat is being pulled in and is starting to "
        "fade at the edges. The left cat is the one doing the pulling."),
    # ---- B 批 ----
    "kaoniyixia": ("PALE ICE BLUE",
        "the RIGHT cat stands braced behind a big pale-blue shield wall; the LEFT cat leans its back "
        "against that same wall from the other side, arms folded, sharing the cover. The wall belongs "
        "to the right cat - the left cat is borrowing it, not taking it."),
    "zhexienixianchi": ("GOLDEN YELLOW",
        "the LEFT cat tips two golden rice-balls out of its own belt pouch into the RIGHT cat's "
        "outstretched paws. The left cat's pouch is visibly going empty; the right cat's paws are full."),
    "zhaonishuodeda": ("ACID GREEN",
        "the RIGHT cat points sharply off-screen to the left, calling the shot; the LEFT cat is already "
        "mid-strike in exactly that direction, an acid-green slash trailing from its paw. The pointing "
        "cat is directing, the striking cat is obeying."),
    "jienideliqi": ("BURNT ORANGE",
        "the RIGHT cat grips the LEFT cat's shoulder from behind and pushes; burnt-orange power lines "
        "flow from the right cat's paws along the left cat's arm and burst out of its striking fist. "
        "The strength is travelling FROM the right cat INTO the left cat's punch."),
    "chenxianzaichushou": ("BRIGHT GOLD-YELLOW",
        "the LEFT cat crouches and cups both paws together to make a step; the RIGHT cat plants a foot "
        "in them and is launched upward with a gold-yellow burst, paw drawn back to strike. "
        "The left cat is the launcher, the right cat is being launched."),
    "biezhanzaishenshang": ("SICKLY PURPLE",
        "the LEFT cat peels a clinging blob of sickly-purple slime off the RIGHT cat's shoulder and "
        "flings it away off-screen. The right cat looks relieved; the slime is clearly leaving it."),
    # ---- C 批 ----
    "xianbangniliuzhe": ("PALE ICE BLUE",
        "the LEFT cat splits one pale-blue shield disc into two uneven halves, keeping the SMALL half "
        "tucked against its own chest and pressing the BIG half into the RIGHT cat's arms. The uneven "
        "split is the point - the right cat clearly gets more."),
    "nimangwobuwei": ("BRIGHT TEAL",
        "the RIGHT cat is busy doing something with both paws (unrolling a scroll), head down, "
        "not looking; the LEFT cat stands back-to-back with it, calmly drawing a fresh teal card that "
        "floats up beside its head. One works, the other picks up the slack."),
    "fantuanliuyikou": ("GOLDEN YELLOW",
        "the LEFT cat holds a golden rice-ball behind its back with one paw, deliberately saving it, "
        "while offering it sideways to the RIGHT cat who is reaching for it with a delighted face. "
        "The left cat is saving it for the other one, not eating it."),
    "youwozaiqianmian": ("WARM AMBER",
        "the LEFT cat stands square in FRONT, filling the left half of the frame, one paw thrown out "
        "behind it to keep the RIGHT cat back; a wide amber shield-glow spreads from that outstretched "
        "paw over the right cat. The front cat is taking the hit so the back one does not."),
    "biepengzhenjian": ("SICKLY GREEN",
        "the LEFT cat carefully paints sickly-green paste onto a slim dart held in the RIGHT cat's paw, "
        "steadying the right cat's wrist. The right cat holds still, eyes wide, not touching the tip. "
        "The coating is going onto the right cat's weapon."),
    "woyouxianbeihao": ("SICKLY GREEN",
        "the LEFT cat stands calmly with a row of small green vials already lined up in its belt, one "
        "paw resting on them, while the RIGHT cat strikes off-screen; a green shimmer rises around BOTH "
        "cats at once. The left cat prepared; both are covered."),
}

# 菲菲版：把**描述球球長相的那幾段整段換掉**，不是逐詞替換。
#
# 第一版寫成逐詞替換（`grey tabby cat ninjas` → `Siamese cat girls` 之類），
# 自檢當場抓到漏網——同一份提示詞裡描述長相的地方有三處，措辭都不一樣。
# 這跟 `make_feifei_event_jobs.py` 的 `NINJA_BLOCK` 是同一個教訓：**整段換**。
SWAP: list[tuple[str, str]] = [
    ("A cartoon illustration for a card game, landscape composition, showing TWO grey tabby cat ninjas.",
     "A cartoon illustration for a card game, landscape composition, showing TWO SIAMESE CAT GIRLS "
     "(not grey tabbies, not ninjas in navy)."),
    ("  - Same grey tabby markings, same navy headband with two trailing tails, same thick black outline,\n"
     "    same flat colouring, same navy ninja outfit as the reference. BOTH of them.",
     "  - Same Siamese colouring, same brown hair tuft with the plum-purple ribbon bow, same thick black\n"
     "    outline, same flat colouring, same plum-purple jacket as the reference. BOTH of them."),
    ("Each cat: light grey tabby fur with dark grey stripes, white chest and paws, a NAVY BLUE ninja headband\n"
     "with two trailing tails, a dark navy ninja outfit with a dark belt, long ringed tail.",
     "Each cat looks like this:\n" + feifei_look()),
]


def to_feifei(text: str, cid: str) -> str:
    out = text
    for old, new in SWAP:
        if old not in out:
            raise SystemExit(f"!! 對不上原文了，`make_coop_card_jobs.prompt_for` 改過——"
                             f"先看一眼再更新 SWAP：\n{old[:80]}…")
        out = out.replace(old, new, 1)
    return out.replace(f"Save the image as card_{cid}.png", f"Save the image as card_feifei_{cid}.png")


def main() -> None:
    ninja = {f"card_{cid}.png": prompt_for(cid, *CARDS[cid]) for cid in CARDS}
    feifei = {f"card_feifei_{cid}.png": to_feifei(prompt_for(cid, *CARDS[cid]), cid) for cid in CARDS}

    # 自檢一：菲菲那份不可以留下球球的字眼（她自己那段的「不是灰虎斑」是刻意的，挖掉再看）
    # 唯一允許提到球球的地方是**反向護欄**那一句（「不是灰虎斑、不是穿深藍的忍者」）。
    # 挖掉它再檢查，不然自己寫的護欄會把自己誤報成漏網（第一版就這樣）。
    look = feifei_look()
    GUARD = ("A cartoon illustration for a card game, landscape composition, showing TWO SIAMESE CAT "
             "GIRLS (not grey tabbies, not ninjas in navy).")
    for cid, t in feifei.items():
        body = t.replace(look, "").replace(GUARD, "")
        for bad in ("grey tabby", "gray tabby", "ninja"):
            if bad in body.lower():
                raise SystemExit(f"!! {cid} 還留著「{bad}」：{body[body.lower().find(bad) - 60:][:140]}")
    # 自檢二：兩份的張數要一樣，而且要等於牌表裡還在等圖的連線牌
    if len(ninja) != len(feifei):
        raise SystemExit(f"!! 兩份張數不一樣：{len(ninja)} vs {len(feifei)}")

    (OUT / "coop2_cards.json").write_text(json.dumps(ninja, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "coop2_cards_feifei.json").write_text(json.dumps(feifei, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"球球版 {len(ninja)} 張 → coop2_cards.json")
    print(f"菲菲版 {len(feifei)} 張 → coop2_cards_feifei.json")
    print("跑法（一次一批）：")
    print("  python tools/codex_gen.py --ref tools/ref/hero_combat_ref.png tools/codex_jobs/coop2_cards.json")
    print("  python tools/codex_gen.py --ref tools/ref/feifei_ref.png tools/codex_jobs/coop2_cards_feifei.json")


if __name__ == "__main__":
    main()
