# -*- coding: utf-8 -*-
"""把《菲菲_劇情改寫表》填好的「改寫」欄寫回程式（2026-09-15）。

用法：
  python tools/apply_feifei_table.py docs/菲菲_劇情改寫表_2026-09-15.md [--dry]

規則：
  - 表由 `tools/dump_feifei_table.test.ts` 產生，旁邊的 `.keys.json` 記每個編號對應到哪個檔、哪個字串；
    這支只看 MD 的「編號」與最後一欄「改寫」，其餘欄位改了也不理。
  - 改寫欄空白、或跟原文一樣 → 跳過。
  - kind=literal：在該檔找到**剛好一次**的 '原文' 字串常值，換成 '改寫'；找不到或不只一次就列出來、不動。
  - kind=map-add：原本沒有她的版本，把 `'鍵': '改寫',` 加進對應的對照表最後（FEIFEI_BOSS_LINES／FEIFEI_EVENT_LINES／firstMeetFeifei）。
  - 寫完自己跑不了測試，記得 `npx vitest run tests/content` 與 `npx tsc --noEmit -p .`。
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def ts_lit(s: str) -> str:
    """字串寫成 TS 單引號常值（跟 dialogue.ts 一樣）"""
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def uncell(s: str) -> str:
    return s.replace("\\|", "|").strip()


def parse_md(md: pathlib.Path) -> dict[str, str]:
    """編號 → 改寫（只收有填的）"""
    out: dict[str, str] = {}
    for line in md.read_text(encoding="utf-8").splitlines():
        if not line.startswith("| "):
            continue
        cells = [c for c in re.split(r"(?<!\\)\|", line)]
        # 首尾是空字串（行首行尾的 |）
        cells = [c for c in cells[1:-1]]
        if len(cells) < 5:
            continue
        rid = cells[0].strip()
        if not re.fullmatch(r"[A-Z0-9]+-\d+", rid):
            continue
        new = uncell(cells[4])
        if new:
            out[rid] = new
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    md = pathlib.Path(sys.argv[1])
    dry = "--dry" in sys.argv
    keys = json.loads(md.with_suffix(".keys.json").read_text(encoding="utf-8"))
    by_id = {r["id"]: r for r in keys}
    filled = parse_md(md)
    print(f"表裡填了 {len(filled)} 句")

    files: dict[str, str] = {}
    problems: list[str] = []
    done = 0
    for rid, new in filled.items():
        r = by_id.get(rid)
        if not r:
            problems.append(f"{rid}: keys.json 裡沒有這個編號")
            continue
        if new == r["text"]:
            continue
        rel = r["file"]
        src = files.get(rel) or (ROOT / rel).read_text(encoding="utf-8")
        if r["kind"] == "literal":
            old = ts_lit(r["text"])
            n = src.count(old)
            if n != 1:
                problems.append(f"{rid}: 原文在 {rel} 出現 {n} 次（要剛好 1 次），沒改：{r['text'][:40]}…")
                continue
            src = src.replace(old, ts_lit(new), 1)
        elif r["kind"] == "map-add":
            m = r["map"]
            # 找對照表的開頭：export const NAME … = {   或   NAME: {（巢狀在 dialogue 物件裡）
            head = re.search(rf"(export const {m}\b[^\n]*=\s*\{{|\n\s*{m}:\s*\{{)", src)
            if not head:
                problems.append(f"{rid}: 在 {rel} 找不到對照表 {m}")
                continue
            # 從開頭往後找第一個「只有縮排＋}」的行當結尾
            close = re.compile(r"\n(\s*)\}", re.M).search(src, head.end())
            if not close:
                problems.append(f"{rid}: 對照表 {m} 找不到結尾")
                continue
            indent = close.group(1) + "  "
            entry = f"\n{indent}{ts_lit(r['key'])}: {ts_lit(new)},"
            src = src[: close.start()] + entry + src[close.start():]
        else:
            problems.append(f"{rid}: 不認得的 kind {r['kind']}")
            continue
        files[rel] = src
        done += 1

    for rel, src in files.items():
        if dry:
            print(f"（試跑）會改 {rel}")
        else:
            (ROOT / rel).write_text(src, encoding="utf-8", newline="\n")
            print(f"寫回 {rel}")
    print(f"改了 {done} 句；問題 {len(problems)} 條")
    for pr in problems:
        print("  !!", pr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
