# -*- coding: utf-8 -*-
"""菲菲的「事件結果圖」（2026-09-13）。

**為什麼漏了這一整類**：`make_feifei_event_jobs.py` 是靠「認出球球的外觀敘述段落」
來決定哪張要轉的，而結果圖**整類都沒有外觀敘述**——它們的做法是把該事件的原插圖
當參考圖附上去，叫模型「照著附圖裡的角色重畫，只改正在發生的事」。沒有外觀段，
`NINJA_BLOCK` 就一張都認不出來，於是 60 張結果圖一張都沒轉。

那支的自檢**有抓到**（它最後會印「!! 有 61 張提到球球卻沒被轉到」），
只是那行印在一長串輸出的中間，沒人看到——所以這裡再記一次教訓：
**自檢印出來不算數，要嘛讓它 SystemExit，要嘛有人真的讀完。**
使用者踩到的症狀是：玩菲菲選完「迷路的小黑貓」，結果圖裡是球球。

**這支跟球球那支（`make_event_result_jobs.py`）差在三個地方**：
  1. 參考圖換成**她的**同一事件插圖（`tools/ref/event_refs_feifei/<id>.png`）。
     這是最關鍵的一條：提示詞裡沒有外觀敘述，角色長相**全部**來自參考圖，
     附錯圖就等於整張畫成球球。
  2. 「發生什麼事」那段中文換成她讀到的版本，來源是
     `tools/codex_jobs/_feifei_result_text.json`（由 `tools/feifei_result_text.test.ts`
     從 `eventTextFor` 匯出，正本只有一份，見那支的檔頭）。
  3. 「WHO DOES WHAT」那段講的是她，代名詞跟著改。

用法：
  UPDATE_FEIFEI_TEXT=1 npx vitest run tools/feifei_result_text.test.ts   # 先更新文案
  python tools/make_feifei_result_art_jobs.py
  python tools/codex_gen.py tools/codex_jobs/feifei_result_art.json
  （**不要帶 --ref**：每一筆自己帶該事件的參考圖，命令列的會蓋掉）
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from art_rules import FEIFEI_NOT_FAT, FEIFEI_NOT_HUMAN  # noqa: E402

JOBS = ROOT / "tools" / "codex_jobs"
REFDIR = ROOT / "tools" / "ref" / "event_refs_feifei"
OUT = JOBS / "feifei_result_art.json"
TEXT = JOBS / "_feifei_result_text.json"

# 球球那支的原始工單。她這邊照同一份轉，只換參考圖、中文與代名詞。
SRC_JOBS = ["event_result_art.json", "event_result_pilot.json", "event_result_redo.json"]

# 這幾張的結果文字本來就會離開原場景（跟球球那支同一份名單，改要一起改）
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

# 球球那段的她版。**代名詞全部改掉**——留著 him／he 會讓模型去找一隻公貓。
ACTOR = (
    "\n\n**WHO DOES WHAT**: the text above is written from the point of view of the SIAMESE CAT GIRL "
    "hero - she is the cream-and-brown cat in the plum-purple jacket with the purple ribbon bow on her "
    "head, exactly as drawn in the attached picture. Read it carefully and make sure the RIGHT "
    "character performs the action - if the cat girl drinks, eats, picks up, hands over or practises "
    "something, it must be HER doing it, not the other character. "
    "Getting this backwards is the single most common mistake here.\n"
    "**THE CAT GIRL MUST BE VISIBLY DOING SOMETHING.** Not standing and waving, not just watching - "
    "show her mid-action, her whole body committed to it. If the text says she drinks, her head is "
    "tipped back with the bottle at her mouth; if she practises, she is mid-stance; if she receives "
    "something, both paws are closing around it.\n"
    "**SHE KEEPS HER HAIR.** The tuft of dark brown hair on top of her head with the PLUM-PURPLE "
    "RIBBON BOW is part of the character, not a prop - it is there in the attached picture and it must "
    "be there in this one too, the same size and on the same side. Never replace her with a grey "
    "tabby cat in a navy ninja outfit.\n"
    # 這兩條是 2026-09-13 總覽稽核抓到的兩種走鐘。**參考圖擋不住這兩種**——
    # 模型會「照著附圖的構圖重畫」，卻在重畫的過程中把臉改成人臉、把身體吹成一顆球。
    # 所以整包 `feifei_look()` 不能貼（會跟「照附圖重畫」打架），但這兩條反向護欄要貼。
    + FEIFEI_NOT_HUMAN + FEIFEI_NOT_FAT)

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

# 紙箱「還沒打開」那張不是結果圖，是場景圖，但它一樣沒有外觀敘述、一樣靠參考圖，
# 所以也一樣漏掉了。這張的參考是**她的**「打開後」那張。
CHEST_CLOSED = (
    "The attached reference image is the SAME SCENE this picture must show, one moment EARLIER.\n"
    "Match it exactly: same cardboard box in the same place and the same size on the left, same kitten "
    "on the right at the same scale, SAME CHARACTER DESIGN - she is a chibi SIAMESE cat girl, creamy "
    "off-white fur with a dark seal-brown mask over her muzzle and around her blue eyes, dark brown "
    "ears, paws and tail, a plum-purple short kimono jacket, and a tuft of dark brown hair on top of "
    "her head tied with a PLUM-PURPLE RIBBON BOW - same thick black outlines, same flat colours, same "
    "cute cartoon style, same camera angle, same composition and same framing. Never draw a grey tabby "
    "cat in a navy ninja outfit.\n\n"
    "What is different: the box is STILL SEALED and has NOT been opened yet. Its top flaps are folded "
    "shut and taped down with a strip of pale packing tape across the middle. There is NO light, NO "
    "glow, NO sparkles and NO shredded paper spilling out - none of that has happened yet.\n"
    "She is crouched beside the box with both front paws pressed on the taped lid, leaning in, eyes "
    "wide and eager, about to tear it open. Mouth closed in an excited little smile, tail curled up "
    "with anticipation.\n\n"
    + FEIFEI_NOT_HUMAN + FEIFEI_NOT_FAT +
    "\nCute cartoon storybook style, thick black outlines, flat colours with subtle soft shading, not "
    "photorealistic. Nothing else in the picture: no floor line, no shadow on the ground, no scenery, "
    "no text, no letters, no watermark.\n"
    "Draw everything SOLID and OPAQUE - flat filled colour. Nothing transparent or see-through.\n"
    "Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green "
    "on the box or on the character.\n"
    "Output 1024x768 PNG. Save the image as event_feifei_chest_closed.png in the current directory and "
    "report the path.")

# 轉完不可以留下的字眼（她的提示詞裡唯一允許提到球球的地方是「不要畫成他」那句反向護欄）
ALLOWED_NINJA = ("Never replace her with a grey tabby cat in a navy ninja outfit.",
                 "Never draw a grey tabby cat in a navy ninja outfit.")
LEFTOVER = re.compile(r"grey tabby|gray tabby|Qiuqiu|球球|ninja cat|NINJA CAT", re.I)


def her_ref(eid: str, manifest: dict) -> str:
    """她的該事件插圖鋪白底存成 PNG。白底是照球球那批的做法，換色會影響模型讀圖。"""
    REFDIR.mkdir(parents=True, exist_ok=True)
    ref = REFDIR / f"{eid}.png"
    if not ref.exists():
        path = manifest["bg"].get(f"bg/event_feifei_{eid}")
        if not path:
            raise SystemExit(f"!! {eid} 沒有她的場景插圖，續集沒東西可參考——先生場景圖")
        im = Image.open(ROOT / "public" / path).convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.paste(im, (0, 0), im)
        bg.convert("RGB").save(ref)
    return str(ref.relative_to(ROOT)).replace("\\", "/")


def main() -> None:
    manifest = json.loads((ROOT / "public" / "assets" / "manifest.json").read_text(encoding="utf-8"))

    # **文案過期就不要生**（2026-09-13 稽核 中-6）。`_feifei_result_text.json` 是從
    # `events.ts` 匯出的，有人改了事件的結果文字卻沒重匯，圖裡演的就會跟玩家讀到的對不上——
    # 而那是**靜音**的：圖照生、測試照綠，要並排看才知道。所以這裡自己比時間戳。
    events_ts = ROOT / "src" / "content" / "events.ts"
    if not TEXT.exists() or TEXT.stat().st_mtime < events_ts.stat().st_mtime:
        raise SystemExit(
            f"!! {TEXT.name} 比 events.ts 舊（或不存在）。先跑：\n"
            "   UPDATE_FEIFEI_TEXT=1 npx vitest run tools/feifei_result_text.test.ts")
    text = json.loads(TEXT.read_text(encoding="utf-8"))

    # **要生哪幾張，看的是遊戲內容不是舊工單**（2026-09-13 稽核 高-3）。
    # 第一版從三個 job 檔的鍵推，結果漏掉 `catnip_field_r1`——那張的工單鍵還是舊名
    # （`catnip_field_take`），新名字只活在 `events.ts` 與 manifest 裡。
    # 漏掉的症狀：玩菲菲在貓草田選第二個選項，結果圖是球球，而且腳本一聲都不吭。
    # `_feifei_result_text.json` 是從 `events.ts` 匯出的，它才是正本。
    want = sorted(text)

    # 舊工單裡有、但遊戲裡查不到的死名字，印出來提醒（不影響產出）
    dead: list[str] = []
    for f in SRC_JOBS:
        p = JOBS / f
        if not p.exists():
            continue
        for k in json.loads(p.read_text(encoding="utf-8")):
            if not k.startswith("event_"):
                continue
            key = k[len("event_"):-len(".png")]
            if re.search(r"_r[01]$|_take$", key) and key not in text and key not in dead:
                dead.append(key)

    # `--redo <鍵>...`：已經有圖也照樣重開工單。
    # 用在「續集是照著一張後來被修掉的場景圖畫的」——參考圖過期，圖本身沒壞，
    # 所以上面那條「場景圖比參考圖新」的檢查抓得到，但預設的「已經有圖就跳過」
    # 會讓它永遠重生不了（2026-09-13 moon_window 與 toll_again_paid 就是這樣）。
    redo: set[str] = set()
    if "--redo" in sys.argv:
        redo = set(sys.argv[sys.argv.index("--redo") + 1:])
        print(f"指定重做：{'、'.join(sorted(redo))}")

    jobs: dict[str, dict] = {}
    skipped: list[str] = []
    for key in want:
        if key not in redo and f"bg/event_feifei_{key}" in manifest["bg"]:
            skipped.append(key)            # 已經有她的圖，重跑不重生
            continue
        eid = re.sub(r"_r[01]$", "", key)
        name = f"event_feifei_{key}.png"
        head = HEAD.format(same=MAY_MOVE if key in MOVES_ON else SAME_PLACE)
        jobs[name] = {"prompt": head + text[key] + ACTOR + TAIL.format(name=name),
                      "ref": her_ref(eid, manifest)}

    if "bg/event_feifei_chest_closed" not in manifest["bg"]:
        jobs["event_feifei_chest_closed.png"] = {
            "prompt": CHEST_CLOSED, "ref": her_ref("chest_open", manifest)}

    # 自檢一：轉完不可以留下球球
    bad = {}
    for k, v in jobs.items():
        p = v["prompt"]
        for ok in ALLOWED_NINJA:
            p = p.replace(ok, "")
        hits = LEFTOVER.findall(p)
        if hits:
            bad[k] = hits[:3]
    if bad:
        print("轉換後還有球球的字眼，沒有寫出檔案：")
        for k, hits in list(bad.items())[:10]:
            print(f"  {k}: {hits}")
        raise SystemExit(1)

    # 自檢二：參考圖的**內容**要等於現行的場景圖。
    #
    # 第一版寫成「路徑裡有沒有 event_refs_feifei/」——`her_ref()` 回傳的一定有，
    # 那條恆真、一次都擋不到東西（2026-09-13 稽核 中-7）。真正要擋的是另一件事：
    # `her_ref()` 只要檔案在就用快取，所以**場景圖換過、ref 沒跟著換**的時候，
    # 續集會照著舊場景畫。症狀是玩家看到選項前後的畫面對不上（人物換了衣服、場景換了顏色）。
    stale: list[str] = []
    for k, v in jobs.items():
        eid = re.sub(r"^event_feifei_|_r[01]\.png$|\.png$", "", k)
        eid = "chest_open" if k == "event_feifei_chest_closed.png" else eid
        scene = manifest["bg"].get(f"bg/event_feifei_{eid}")
        if not scene:
            stale.append(f"{k}：查不到場景圖 bg/event_feifei_{eid}")
            continue
        if (ROOT / "public" / scene).stat().st_mtime > (ROOT / v["ref"]).stat().st_mtime:
            stale.append(f"{k}：場景圖比參考圖新，參考圖是舊的（刪掉 {v['ref']} 重跑）")
    if stale:
        print("參考圖對不上現行的場景圖，沒有寫出檔案：")
        for s in stale[:10]:
            print(f"  {s}")
        raise SystemExit(1)

    OUT.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 張 → {OUT.relative_to(ROOT)}")
    print(f"  已經有她的圖、跳過 {len(skipped)} 張")
    if dead:
        print(f"  舊工單裡這 {len(dead)} 個名字在遊戲裡查不到（不影響產出，順手提醒）：")
        for k in dead:
            print(f"    {k}")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_result_art.json"
          "（不要帶 --ref，每筆自己帶）")


if __name__ == "__main__":
    main()
