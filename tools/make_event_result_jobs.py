# -*- coding: utf-8 -*-
"""
make_event_result_jobs.py — 建「事件結果圖」的生圖工單（不生圖，只寫 JSON）。

用法：python tools/make_event_result_jobs.py
  產出 tools/codex_jobs/event_result_art.json，然後：
    python tools/codex_gen.py --max-wait-hours 40 tools/codex_jobs/event_result_art.json

使用者 2026-09-11：「事件的結果圖全做」。

**為什麼要結果圖**：選完之後插圖還是同一張，選了哪個都一樣——文字寫得很細
（村貓哭了、山賊深深鞠躬），畫面卻沒動，選擇沒有視覺後果。

**哪些選項要配**（判準跟 `tools/event_result_art.test.ts` 的 `shouldHaveArt` 一致，改要一起改）：
  - 有非旗標的 `outcome`，**或** `costFish > 0`（付了錢就是發生了事）
  - 但「進戰鬥」的不配：選完就切到戰鬥畫面，結果圖沒機會出現

**每張都附該事件自己的原插圖當參考**（`tools/ref/event_refs/<id>.png`，由這支順便產生）。
不是附球球的設定表——附原插圖的話，結果圖跟原圖是同一個場景、同一批角色、同一套配色，
接得起來。實測有效：試水溫三張的角色與場景完全延續。

踩過的坑（都寫死在提示詞裡）：
  - **主詞會搞反**：文字寫「球球喝下貓草藥」，第一版畫成村貓在喝。
  - **球球會變成旁觀者**：只是站著揮手，看不出他做了那件事。
  - **「不要換場景」跟某些結果文字打架**：小黑貓被送回同伴身邊、球球鑽過空隙上樓——
    那幾張本來就會換地方，寫死不准換會讓該發生的事畫不出來
    （記憶 `reference_mus_art_pipeline` 記過的「規則寫太死會跟姿勢敘述打架」）。
    所以 `MOVES_ON` 列出來的那幾張改用寬鬆版。
"""
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
JOBS = ROOT / "tools" / "codex_jobs"
REFDIR = ROOT / "tools" / "ref" / "event_refs"

# 這幾張的結果文字本來就會離開原場景，不能寫死「不准換地方」
MOVES_ON = {
    "lost_kitten_r0", "lost_kitten_r1", "heavy_door_r0",
    "blocked_r0", "sparring_cat_r1", "rescue_return_fish_r1",
}

SAME_PLACE = (
    "**THIS IS A SEQUEL TO THE ATTACHED PICTURE.** The attached picture is the same event a moment "
    "earlier. Keep the SAME place, the SAME characters, the SAME props, the SAME colours and the "
    "SAME lighting - redraw them exactly as they appear there. Only what is HAPPENING changes. "
    "Do not invent a new location and do not change any character design.")
MAY_MOVE = (
    "**THIS IS A SEQUEL TO THE ATTACHED PICTURE.** The attached picture is the same event a moment "
    "earlier. Keep the SAME characters, the SAME colours and the SAME lighting, and redraw every "
    "character exactly as they appear there. The place may move on if the scene below says so "
    "(a few steps away, through a gap, round a corner) - follow the scene, but keep it the same "
    "kind of place.")

HEAD = ("A single scene illustration for a story event in a cute cartoon roguelike card game, "
        "landscape composition.\n\n{same}\n\nWhat happens now: ")

ACTOR = (
    "\n\n**WHO DOES WHAT**: the text above is written from the point of view of the ninja cat "
    "(the small grey tabby in the navy outfit). Read it carefully and make sure the RIGHT character "
    "performs the action - if the ninja cat drinks, eats, picks up, hands over or practises something, "
    "it must be the NINJA CAT doing it, not the other character. "
    "Getting this backwards is the single most common mistake here.\n"
    "**THE NINJA CAT MUST BE VISIBLY DOING SOMETHING.** Not standing and waving, not just watching - "
    "show him mid-action, his whole body committed to it. If the text says he drinks, his head is "
    "tipped back with the bottle at his mouth; if he practises, he is mid-stance; if he receives "
    "something, both paws are closing around it.")

TAIL = (
    "\n\nIMPORTANT about any writing in this scene: brush marks and scratches only - abstract squiggles "
    "that read as writing from a distance. Never draw real letters, words, numbers or recognisable "
    "characters of any language.\n"
    "Tell the story in one readable picture: clear staging, strong silhouettes, expressive faces, only "
    "what the scene needs. It will be shown about 420 pixels wide, so no fine detail that disappears "
    "when shrunk.\n"
    "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon storybook look, "
    "not photorealistic. Warm torch-lit tower interior lighting unless the scene says otherwise.\n"
    "No text, no letters, no numbers, no watermark, no user interface, no border.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying - draw only "
    "the characters and the few props the scene needs, standing on nothing.\n"
    "Output 1024x768 PNG. Save the image as {name} in the current directory and report the path.")


def main() -> None:
    src = (ROOT / "src" / "content" / "events.ts").read_text(encoding="utf-8")
    manifest = json.loads((ROOT / "public" / "assets" / "manifest.json").read_text(encoding="utf-8"))
    REFDIR.mkdir(parents=True, exist_ok=True)

    starts = [m.start() for m in re.finditer(r"\n  \{ id: '[a-z0-9_]+', title: '", src)] + [len(src)]
    jobs: dict[str, dict] = {}
    skipped: list[str] = []
    for i in range(len(starts) - 1):
        piece = src[starts[i]:starts[i + 1]]
        eid = re.search(r"\{ id: '([a-z0-9_]+)'", piece).group(1)
        for j, part in enumerate(re.split(r"\{ label: '", piece)[1:]):
            m = re.search(r"resultArt: '([a-z0-9_]+)'", part[:1200])
            res = re.search(r"result: '([^']*)'", part)
            if not m or not res:
                continue
            key = m.group(1)
            if key != f"{eid}_r{j}":
                raise SystemExit(f"命名對不上：{key} 應該是 {eid}_r{j}")
            # 已經有圖的跳過（重跑這支不會重生）
            if f"bg/event_{key}" in manifest["bg"]:
                skipped.append(key)
                continue
            # 參考圖：該事件的原插圖鋪白底
            ref = REFDIR / f"{eid}.png"
            if not ref.exists():
                path = manifest["bg"].get(f"bg/event_{eid}")
                if not path:
                    raise SystemExit(f"{eid} 連原插圖都沒有，先生原插圖")
                im = Image.open(ROOT / "public" / path).convert("RGBA")
                bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
                bg.paste(im, (0, 0), im)
                bg.convert("RGB").save(ref)
            name = f"event_{key}.png"
            head = HEAD.format(same=MAY_MOVE if key in MOVES_ON else SAME_PLACE)
            jobs[name] = {
                "prompt": head + res.group(1) + ACTOR + TAIL.format(name=name),
                "ref": str(ref.relative_to(ROOT)).replace("\\", "/"),
            }

    out = JOBS / "event_result_art.json"
    out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{out.name}: {len(jobs)} 張（已有圖跳過 {len(skipped)}：{'、'.join(skipped) or '無'}）")
    print(f"  其中 {len(MOVES_ON & {k[6:-4] for k in jobs})} 張用「可以換地方」的寬鬆版")


if __name__ == "__main__":
    main()
