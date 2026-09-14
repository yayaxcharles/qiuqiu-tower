# -*- coding: utf-8 -*-
"""兩張「幫同伴回血」的連線牌牌面工單（2026-09-15，使用者睡前交辦：「做個兩張幫另一個人回血的卡牌，名稱效果你想」）。

牌：
  yuganjijiu   魚乾急救（菲菲版叫「藥草急救」）  常見 忍術 1 費：同伴回復 6（升級 9）
  yiqichuankou 一起喘口氣                      罕見 絕學 2 費：同伴回復 9、自己回復 5（升級 12／7）

提示詞骨架沿用 `make_coop_card_jobs.prompt_for`（兩隻貓、誰幫誰寫死），菲菲版走 `make_coop2_card_jobs.to_feifei`。
魚乾那張菲菲版的道具換成藥草（她的牌名是藥草急救；一隻丟針下毒的貓不會隨身帶小魚乾）。

用法（一次一批）：
  python tools/make_heal_card_jobs.py
  python tools/codex_gen.py --ref tools/ref/hero_combat_ref.png tools/codex_jobs/heal_cards.json
  python tools/codex_gen.py --ref tools/ref/feifei_ref.png tools/codex_jobs/heal_cards_feifei.json
  python tools/add_card_art.py card_yuganjijiu.png card_yiqichuankou.png card_feifei_yuganjijiu.png card_feifei_yiqichuankou.png
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from make_coop_card_jobs import prompt_for  # noqa: E402
from make_coop2_card_jobs import to_feifei  # noqa: E402

OUT = ROOT / "tools" / "codex_jobs"

FISH = ("the LEFT cat kneels and holds out a small silvery dried fish glowing with a soft CORAL light, pressing it "
        "into the RIGHT cat's paws; the right cat sits slumped against the wall with one paw bandaged and eyes "
        "half closed, and a coral heart-shaped glow rises from the fish. The fish is going FROM the left cat TO "
        "the right cat - the left one is the helper, the right one is being healed.")
HERB = ("the LEFT cat kneels and holds out a small bundle of fresh green herbs tied with a red string, glowing with a "
        "soft CORAL light, pressing it into the RIGHT cat's paws; the right cat sits slumped against the wall with "
        "one paw bandaged and eyes half closed, and a coral heart-shaped glow rises from the herbs. The herbs are "
        "going FROM the left cat TO the right cat - the left one is the helper, the right one is being healed.")
BREATH = ("both cats sit on the floor back to back catching their breath, and the LEFT cat reaches up and holds a "
          "small glowing PALE SKY-BLUE paper lantern over the RIGHT cat's shoulder; soft sky-blue light wraps both "
          "of them, much brighter and larger around the right cat. The left cat is sharing its lantern light with "
          "the right cat - a quiet resting moment, no fighting.")

CARDS: dict[str, tuple[str, str]] = {
    "yuganjijiu": ("WARM CORAL", FISH),
    "yiqichuankou": ("PALE SKY BLUE", BREATH),
}


def main() -> None:
    ninja = {f"card_{cid}.png": prompt_for(cid, *CARDS[cid]) for cid in CARDS}
    feifei = {
        "card_feifei_yuganjijiu.png": to_feifei(prompt_for("yuganjijiu", "WARM CORAL", HERB), "yuganjijiu"),
        "card_feifei_yiqichuankou.png": to_feifei(prompt_for("yiqichuankou", *CARDS["yiqichuankou"]), "yiqichuankou"),
    }
    for fid in list(ninja) + list(feifei):
        if (ROOT / "tools" / "codex_raw" / fid).exists():
            raise SystemExit(f"{fid} 的原稿已經在了：要重生先改名留底，不然 codex_gen 會直接跳過")
    (OUT / "heal_cards.json").write_text(json.dumps(ninja, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "heal_cards_feifei.json").write_text(json.dumps(feifei, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"球球版 {len(ninja)} 張 → heal_cards.json；菲菲版 {len(feifei)} 張 → heal_cards_feifei.json")


if __name__ == "__main__":
    main()
