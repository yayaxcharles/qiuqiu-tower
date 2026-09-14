# -*- coding: utf-8 -*-
"""把目前全部的牌匯出成一份 Markdown，給另一位 AI 設計新牌用（2026-09-13 使用者交辦）。

**重點是連線專用牌**：使用者想多要幾張「兩個人一起打才拿得到」的牌。

為什麼用腳本匯而不是手寫：牌表 480 行還在動，手抄一份隔天就對不上，
而且對不上是**靜音的**——那位 AI 會照著舊資料設計，設計完才發現效果名不存在。
這支直接讀 `src/content/cards.ts`，跑一次就是當下的真相。

用法：python tools/dump_cards_md.py
輸出：docs/牌表_給設計用.md
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "牌表_給設計用.md"
TMP = ROOT / "tools" / "_cards_dump.json"

# 用 vitest 把牌表與說明文字匯出來——`describeCard` 是 TypeScript，
# Python 這邊自己拼一份的話遲早跟畫面上顯示的分岔（這個專案犯過同型的錯）。
EXPORT = '''import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cards, FEIFEI_CARD_NAME } from '../src/content/cards';
import { describeCard } from '../src/ui/cardtext';

describe('匯出牌表', () => {
  it('寫成 JSON', () => {
    const out = cards.map((c) => ({
      id: c.id, name: c.name, feifeiName: (FEIFEI_CARD_NAME as Record<string, string>)[c.id] ?? null,
      cost: c.cost, type: c.type, rarity: c.rarity, pool: c.pool, hero: c.hero ?? null,
      coop: c.coop ?? false, target: c.target ?? null, hidden: c.hidden ?? false,
      text: describeCard(c, false), upText: describeCard(c, true),
      upCost: c.upgrade?.cost ?? c.cost,
    }));
    writeFileSync('tools/_cards_dump.json', JSON.stringify(out, null, 1), 'utf-8');
  });
});
'''


def rows(cs: list[dict], show_feifei: bool = False) -> list[str]:
    head = "| 牌名 | 費 | 類 | 稀有度 | 效果 | 升級後 |"
    sep = "|---|---|---|---|---|---|"
    if show_feifei:
        head = "| 牌名（球球） | 牌名（菲菲） | 費 | 類 | 稀有度 | 效果 | 升級後 |"
        sep = "|---|---|---|---|---|---|---|"
    out = [head, sep]
    for c in cs:
        up = f"{c['upText']}" + (f"（{c['upCost']} 費）" if c["upCost"] != c["cost"] else "")
        same = up.replace("＋", "") == c["text"].replace("＋", "")
        cells = [c["name"]]
        if show_feifei:
            cells.append(c["feifeiName"] or "—")
        cells += [str(c["cost"]), c["type"], c["rarity"], c["text"], "（同左）" if same else up]
        out.append("| " + " | ".join(x.replace("\n", "　") for x in cells) + " |")
    return out


def main() -> None:
    test = ROOT / "tests" / "_dump_cards.test.ts"
    test.write_text(EXPORT, encoding="utf-8")
    try:
        r = subprocess.run(["npx", "vitest", "run", "tests/_dump_cards.test.ts"],
                           cwd=ROOT, capture_output=True, text=True, shell=True)
        if not TMP.exists():
            print(r.stdout[-2000:], r.stderr[-2000:])
            raise SystemExit("!! 匯出失敗，看上面的輸出")
    finally:
        test.unlink(missing_ok=True)

    cs = json.loads(TMP.read_text(encoding="utf-8"))
    TMP.unlink(missing_ok=True)

    coop = [c for c in cs if c["coop"]]
    feifei = [c for c in cs if c["hero"] == "feifei" and not c["coop"]]
    ninja_only = [c for c in cs if c["hero"] == "ninja" and not c["coop"]]
    shared = [c for c in cs if not c["hero"] and not c["coop"] and c["pool"] != "壞毛病"]
    curses = [c for c in cs if c["pool"] == "壞毛病"]

    doc = (ROOT / "docs" / "_牌表說明_前言.md")
    md: list[str] = []
    md.append(doc.read_text(encoding="utf-8") if doc.exists() else "")
    md.append(f"\n## 一、連線專用牌（現有 {len(coop)} 張）\n")
    md.append("**這是這份文件的重點。** `coop: true` 代表只有兩人以上的局，"
              "獎勵與罐頭鋪才會出現這些牌。\n")
    md += rows(coop, show_feifei=True)
    md.append(f"\n## 二、兩個角色共用的牌（{len(shared)} 張）\n")
    md.append("同一張牌，菲菲看到的是另一個名字（欄位二）。效果完全相同。\n")
    md += rows(shared, show_feifei=True)
    md.append(f"\n## 三、菲菲專屬（{len(feifei)} 張）\n")
    md += rows(feifei)
    md.append(f"\n## 四、球球專屬（{len(ninja_only)} 張）\n")
    md += rows(ninja_only)
    md.append(f"\n## 五、壞毛病（詛咒牌，{len(curses)} 張）\n")
    md += rows(curses)

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"{len(cs)} 張 → {OUT.relative_to(ROOT)}")
    print(f"  連線 {len(coop)}、共用 {len(shared)}、菲菲 {len(feifei)}、"
          f"球球 {len(ninja_only)}、壞毛病 {len(curses)}")


if __name__ == "__main__":
    main()
