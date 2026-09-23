# -*- coding: utf-8 -*-
"""把《<角色>_劇情改寫表》填好的「改寫」欄寫回程式（2026-09-15）。

用法：
  python tools/apply_story_table.py docs/菲菲_劇情改寫表_2026-09-15.md [--dry]
  python tools/apply_story_table.py docs/球球_劇情改寫表_2026-09-15.md [--dry]

規則（表由 `tools/dump_story_table.test.ts` 產生，旁邊的 `.keys.json` 記每個編號怎麼寫回；這支只看 MD 的「編號」與最後一欄「改寫」）：
  - 改寫欄空白、或跟原文一樣 → 跳過。
  - literal：在該檔找到 '原文' 字串常值換成 '改寫'。**當成句子的只准剛好 1 處**（2026-09-16 起，兩個角色都一樣）；
    當成對照表鍵（'原句':）的那幾處一起換——球球的原句是菲菲對照表 FEIFEI_BOSS_LINES／FEIFEI_EVENT_TEXT 的鍵。球球在 events.ts 的句子改了之後，
    event-text.ts 裡拿整句當鍵的（FEIFEI_EVENT_TEXT）與拿引號裡那句當鍵的（FEIFEI_EVENT_LINES）也一起換鍵（2026-09-23 從 dialogue.ts 搬過去）。
  - map-add：原本沒有她的版本，把 `'鍵': '改寫',` 加進對照表最後（找配對的收尾大括號，跳過字串與註解；**不認得正規表達式常值**，表裡別放）。
  - blurb：選角小傳（`blurb: '…' + '…',`）整個運算式換成一個常值。
  - 球球講的話句尾要有「喵」：沒有的列出來、不寫（跟程式的 qiuqiuLineOk 同一條規矩）。
  - 寫完自己跑不了測試，記得 `npx vitest run tests/content` 與 `npx tsc --noEmit -p .`。
"""
import json
import pathlib
import re
import sys

# 主控台是 cp950 時印中文會整支崩在寫檔之前（倉庫記憶：看似跑過、其實沒更新）；這台剛好是 UTF-8 所以沒炸，工作機沒驗過
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPOKEN = re.compile(r"(?:球球|菲菲)：「(.+?)」", re.S)


def ts_lit(s: str) -> str:
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def uncell(s: str) -> str:
    return s.replace("\\|", "|").strip()


def meow_ok(text: str) -> bool:
    """球球講的話（引號裡的、或整句都是他講的）句尾要有喵"""
    said = SPOKEN.findall(text)
    parts = said if said else [text]
    return all(re.search(r"喵$", re.sub(r"[！？。…～、,.!?]+$", "", p)) for p in parts)


def table_close(src: str, open_brace: int) -> int:
    """從對照表的 `{` 往後找配對的 `}`，跳過字串與註解（總稽核 2026-09-16 戊 M2：
    原本找「第一個單獨成行的 }」，表尾前的說明註解裡有一行 } 就會把新句插進註解、還回報成功）。找不到回 -1。"""
    depth = 0
    i = open_brace
    n = len(src)
    while i < n:
        c = src[i]
        if c in "'\"`":
            q = c
            i += 1
            while i < n and src[i] != q:
                i += 2 if src[i] == "\\" else 1
        elif src.startswith("//", i):
            i = src.find("\n", i)
            if i < 0:
                return -1
        elif src.startswith("/*", i):
            i = src.find("*/", i)
            if i < 0:
                return -1
            i += 1
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def parse_md(md: pathlib.Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in md.read_text(encoding="utf-8").splitlines():
        if not line.startswith("| "):
            continue
        cells = re.split(r"(?<!\\)\|", line)[1:-1]
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

    def load(rel: str) -> str:
        return files.get(rel) or (ROOT / rel).read_text(encoding="utf-8")

    for rid, new in filled.items():
        r = by_id.get(rid)
        if not r:
            problems.append(f"{rid}: keys.json 裡沒有這個編號")
            continue
        old_text = r["text"]
        if new == old_text:
            continue
        hero = r.get("hero", "feifei")
        rel = r["file"]
        # 球球講的話句尾要有喵（旁白那類沒有引號的整句不查：VN 旁白、事件整句只查引號裡）
        if hero == "ninja" and r["who"] in ("球球", "旁白／球球") and r["kind"] != "blurb":
            if r["who"] == "球球" and not meow_ok(new):
                problems.append(f"{rid}: 球球的話句尾要有「喵」，沒寫：{new[:40]}…")
                continue
            if r["who"] == "旁白／球球" and SPOKEN.search(new) and not meow_ok(new):
                problems.append(f"{rid}: 引號裡球球的話句尾要有「喵」，沒寫：{new[:40]}…")
                continue
        src = load(rel)
        kind = r["kind"]
        if kind == "literal":
            old = ts_lit(old_text)
            n = src.count(old)
            # 當成對照表鍵（'原句':）的那幾處可以有很多個，那是菲菲的版本要跟著換鍵；**當成值的只准剛好一處**——
            # 原本球球整檔全部取代不設防，某句剛好跟別處無關的字串一樣就會被靜靜一起改掉（總稽核 2026-09-16 戊 H1）
            as_key = src.count(old + ":")
            as_value = n - as_key
            if as_value != 1:
                problems.append(f"{rid}: 原文在 {rel} 當成句子出現 {as_value} 次（要剛好 1 次；另有 {as_key} 處是對照表的鍵），沒改：{old_text[:40]}…")
                continue
            src = src.replace(old, ts_lit(new))
            files[rel] = src
            # 球球的句子當菲菲對照表的鍵：events.ts 的整句與引號裡那句都要同步過去
            # 那兩張對照表 2026-09-23 搬到 event-text.ts（0-1 事件文字分包）
            if hero == "ninja" and rel.endswith("events.ts"):
                d = load("src/content/event-text.ts")
                d2 = d.replace(ts_lit(old_text) + ":", ts_lit(new) + ":")
                oi, ni = SPOKEN.search(old_text), SPOKEN.search(new)
                if oi and ni and oi.group(1) != ni.group(1):
                    d2 = d2.replace(ts_lit(oi.group(1)) + ":", ts_lit(ni.group(1)) + ":")
                if d2 != d:
                    files["src/content/event-text.ts"] = d2
        elif kind == "map-add":
            m = r["map"]
            # 容許型別斷言：`firstMeetFeifei: <Record<string, string>>{`（總稽核 2026-09-16 戊 M1：原本這張表永遠找不到）
            head = re.search(rf"(export const {m}\b[^\n]*=\s*\{{|\n\s*{m}:\s*(?:<[^{{\n]*>\s*)?\{{)", src)
            if not head:
                problems.append(f"{rid}: 在 {rel} 找不到對照表 {m}")
                continue
            close_at = table_close(src, head.end() - 1)
            if close_at < 0:
                problems.append(f"{rid}: 對照表 {m} 找不到結尾")
                continue
            line_start = src.rfind("\n", 0, close_at) + 1
            indent = re.match(r"[ \t]*", src[line_start:close_at]).group(0) + "  "
            entry = f"{indent}{ts_lit(r['key'])}: {ts_lit(new)},\n"
            src = src[:line_start] + entry + src[line_start:]
            files[rel] = src
        elif kind == "blurb":
            pat = re.compile(rf"(hero: '{hero}'[\s\S]*?blurb: )((?:'(?:[^'\\]|\\.)*'\s*\+?\s*)+),")
            m2 = pat.search(src)
            if not m2:
                problems.append(f"{rid}: 在 {rel} 找不到 {hero} 的 blurb")
                continue
            src = src[: m2.start(2)] + ts_lit(new) + src[m2.end(2):]
            files[rel] = src
        else:
            problems.append(f"{rid}: 不認得的 kind {kind}")
            continue
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
