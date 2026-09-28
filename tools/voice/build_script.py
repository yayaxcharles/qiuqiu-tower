# -*- coding: utf-8 -*-
r"""把盤點（lines_zh.json）＋譯稿（ja\<說話者>.json）＋譯名表（ja\glossary.json）組成
public/voice/script.json 與 docs/2026-09-28_日文配音台詞.md。**不呼叫任何語音合成服務。**

格式照 F:\ClaudeWork\qiuqiu-side\public\voice\script.json（meta／groups／lines），多幾個欄位：
- key：遊戲查表用的鍵＝「聲音角色|畫面上的中文」（見文件〈遊戲怎麼查〉）
- tier：story（主線過場）／bark（戰鬥與貓窩吐槽）／firstMeet（魔物初見吐槽），可以分批生
- batch：這一句排在哪一次請求（群組／第幾批）
- reading：pykakasi 從 tts 自動轉的平假名（**機器產生，沒人工校過**），回轉檢查用

用法：python tools/voice/build_script.py
"""
import hashlib, json, re, sys
from collections import OrderedDict
from pathlib import Path

import pykakasi

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
VD = ROOT / "tools" / "voice"
MAX_CHARS, MAX_LINES = 600, 45   # 一次請求的上限（理由見文件〈分批計畫〉）

G = json.loads((VD / "ja" / "glossary.json").read_text(encoding="utf-8"))
Z = json.loads((VD / "lines_zh.json").read_text(encoding="utf-8"))
kks = pykakasi.kakasi()

EACH = "Each line is a separate line of dialogue; leave about one second of silence between lines. Natural Tokyo Japanese, anime style."
GROUPS = OrderedDict([
 ("ninja", dict(name="球球", name_ja="キュウキュウ", voice="leda", lufs=-16,
   why="沿用《球球大冒險》同一個聲音：Leda（年輕、活潑、音調偏高），演女聲優配的少年",
   style="A cute, energetic boy ninja cat, about ten years old, with an anime boy voice performed by a female voice actor. Brave, impatient and a little cheeky, but soft and tearful when he talks about his master. The 'nya' at line ends is cute and natural. Battle cries are short and punchy; lines ending with …… are weak and out of breath. " + EACH)),
 ("feifei", dict(name="菲菲", name_ja="フェイフェイ", voice="achernar", lufs=-16,
   why="Achernar（柔和、輕聲、音調偏高的女聲）→ 怕痛、說話先道歉的師妹",
   style="A timid young Siamese cat girl, about ten, the ninja boy's junior. She is scared of pain, speaks softly, stutters when nervous, apologizes first and often trails off, but keeps going out of love for her master and senior brother. Gentle, slightly breathy anime girl voice; never shouts except in sudden fright. " + EACH)),
 ("dangdang", dict(name="噹噹", name_ja="ダンダン", voice="iapetus", lufs=-16,
   why="Iapetus（清楚、俐落、中低音男聲）→ 話少、講實際事的修理匠",
   style="A young tuxedo cat craftsman in his late teens who repairs things at the village gate and fights with copper arm guards. Few words, short blunt sentences, practical and steady; dry, low-key, but quietly caring. Calm young male anime voice; battle lines are firm, not shouted. " + EACH)),
 ("fengfeng", dict(name="封封", name_ja="フォンフォン", voice="schedar", lufs=-16,
   why="Schedar（平穩、均衡的中低音男聲）→ 冷靜、先看四周再開口的劍客",
   style="A calm orange-and-white swordsman cat, a young courier who escorts medicine and food over the mountain roads. Quiet, composed and gentle; checks the surroundings before speaking; never panics. Soft, even young male anime voice with a warm undertone. " + EACH)),
 ("daxia", dict(name="大俠貓（師父／走火入魔的塔主）", name_ja="大侠猫", voice="ja-jp-storyteller-4", lufs=-15,
   why="日文內建聲音「49 歲、東京腔、哲學家」的低音男聲 → 只講四字決め台詞的武俠師父",
   style="An old martial-arts master cat. He only speaks short, weighty set phrases like a wuxia hero's catchphrase. When possessed by evil energy he is cold and distant; after waking he is warm and dignified. Deep, slow, resonant male voice. Each line is a separate line of dialogue; leave about one second of silence between lines. Natural Japanese.")),
 ("nekomata", dict(name="貓又婆婆", name_ja="猫又ばあさん", voice="ja-jp-assistant-6", lufs=-16,
   why="日文內建聲音「74 歲、東京腔、祖父母」的女聲 → 勸孩子回頭的老婆婆",
   style="An old two-tailed cat granny (nekomata) guarding the first floor. Kind but stern, like a grandmother scolding a grandchild to go home; she calls herself 'baba'. Aged, warm, slightly raspy voice. " + EACH)),
 ("iron_claw", dict(name="鐵爪機關貓", name_ja="鉄爪からくり猫", voice="algenib", lufs=-15,
   why="沿用《球球大冒險》同一隻：Algenib（沙啞、厚重的低音男聲）",
   style="A menacing mechanical cat war machine: deep, metallic, cold, flat robotic delivery. Natural Japanese.")),
 ("orange_king", dict(name="橘皮大王", name_ja="ミカン大王", voice="fenrir", lufs=-15,
   why="沿用《球球大冒險》同一隻：Fenrir（激動、高能量的男聲）",
   style="A fat, pompous orange cat bandit king who calls himself 'wagahai'; booming, arrogant, theatrical anime boss voice. Angry lines roar; defeat lines are pathetic and whiny. " + EACH)),
 ("cowcat_boss", dict(name="奶牛貓二當家", name_ja="ウシ猫の副頭領", voice="alnilam", lufs=-15,
   why="Alnilam（堅定、有命令感的中低音男聲）→ 山寨副頭領",
   style="A tough black-and-white cow-pattern cat, second-in-command of the tower's gang. Rough, cocky, a little boastful; gruff delinquent-boss speech. Defeat lines are grudging. " + EACH)),
 ("tanuki_lord", dict(name="狸大人", name_ja="タヌキ様", voice="enceladus", lufs=-15,
   why="沿用《球球大冒險》同一隻：Enceladus（帶氣音、輕聲的低音男聲）",
   style="A sly old tanuki lord who offers drinks to trick travelers; smug, teasing, with a sneaky chuckle ('hoh hoh'); old-man speech. The transformation shout is dramatic. " + EACH)),
 ("persian_lady", dict(name="波斯大小姐", name_ja="ペルシャお嬢様", voice="despina", lufs=-15,
   why="Despina（平順、圓潤、有點高傲感的女聲）→ 大小姐",
   style="A haughty, spoiled Persian cat young lady (ojou-sama) who speaks with '~desu wa' and calls herself 'watakushi'. Elegant, condescending, shrill when ordering servants; sulky when defeated. " + EACH)),
 ("frog_daimyo", dict(name="蛙大名", name_ja="カエル大名", voice="algieba", lufs=-15,
   why="沿用《球球大冒險》同一隻：Algieba（平順、從容的低音男聲）",
   style="A pompous old frog feudal lord (daimyo) who speaks old-fashioned samurai Japanese ('washi', '~ja') and croaks 'geko'; self-important but honorable. " + EACH)),
 ("dragon_cat", dict(name="沉睡的龍貓", name_ja="眠れる竜猫", voice="charon", lufs=-15,
   why="Charon（沉穩的低音男聲）→ 被吵醒的巨龍",
   style="A huge dragon cat just woken from a long sleep: slow, drowsy, deep rumbling and quietly menacing. Natural Japanese.")),
 ("hex_abbot", dict(name="詛咒老住持", name_ja="呪いの老住職", voice="ja-jp-training-4", lufs=-15,
   why="日文內建聲音「63 歲、東京腔」的低音男聲 → 老住持",
   style="An old Buddhist abbot cat cursed by evil energy; calls himself 'sessou'. Solemn, measured and eerie while cursed; tired and sincere once freed. " + EACH)),
 ("villager", dict(name="村貓", name_ja="村の猫", voice="sulafat", lufs=-17,
   why="Sulafat（溫暖、親切的女聲）→ 照顧傷者的村貓（《球球大冒險》村貓甲也是這個聲音）",
   style="A kind village cat lady looking after the wounded; worried but reassuring, warm motherly tone. " + EACH)),
 ("ninja_boss", dict(name="黑貓忍者頭目", name_ja="黒猫忍者の頭目", voice="ja-jp-tutor-2", lufs=-16,
   why="日文內建聲音「36 歲、東京腔、冷靜自信」的男聲 → 冷淡的忍者頭目",
   style="A defeated black cat ninja chief giving a cold, quiet warning. Low, calm, serious male voice. Natural Japanese.")),
])

HERO_ZH = {"ninja": "球球", "feifei": "菲菲", "dangdang": "噹噹", "fengfeng": "封封"}
BOSS_ZH = Z["bossNames"]
SCENE_ZH = {"prologue": "序章", "actClear1": "第一關過關", "actClear2": "第二關過關", "topScene": "塔頂門外",
            "defeat": "落敗", "victory": "結局", "secretScroll": "5F 秘笈", "afterFirstElite": "打倒黑貓忍者頭目後",
            "restBeforeBoss1": "第一關關主前夜", "restBeforeBoss2": "第二關關主前夜", "restBeforeBoss3": "第三關關主前夜",
            "bossPhase2Generic": "精英換階段（通用）", "bossPhase3Generic": "第三階段（通用）"}
BARK_ZH = {"battleStart": "開戰", "battleWin": "打贏", "hungry": "餓", "lowHp": "低血", "chest": "紙箱", "restNap": "貓窩打盹",
           "restNapRestless": "打盹沒睡著（香爐）", "restSharpen": "貓窩磨爪", "revive": "拍醒同伴", "ambush": "伏兵"}


def scene(c):
    """ninja/bossIntro:nekomata#0 → 球球線・貓又婆婆開場"""
    hero, rest = c.split("/", 1)
    rest = rest.split("#")[0]
    if rest.startswith("bark:"):
        s = "吐槽・" + BARK_ZH.get(rest[5:], rest[5:])
    elif rest.startswith("firstMeet:"):
        s = "初見・" + BOSS_ZH.get(rest[10:], rest[10:])
    elif rest.startswith("result:"):
        s = "結算畫面（通關）"
    elif rest.startswith("victory:master:"):
        s = "結局・師父醒來第一句（" + rest[15:] + "）"
    elif rest.startswith(("bossIntro:", "bossPhase2:", "bossPhase3:", "bossDefeat:")):
        k, b = rest.split(":")
        s = BOSS_ZH.get(b, b) + {"bossIntro": "開場", "bossPhase2": "第二階段", "bossPhase3": "第三階段", "bossDefeat": "倒下"}[k]
    else:
        s = SCENE_ZH.get(rest, rest)
    return f"{HERO_ZH[hero]}線・{s}"


def tier(ctxs):
    if all("/firstMeet:" in c for c in ctxs):
        return "firstMeet"
    if all("/bark:" in c for c in ctxs):
        return "bark"
    return "story"


def reading(tts):
    s = "".join(x["hira"] for x in kks.convert(tts))
    return re.sub(r"[！？!?。…～〜―—「」『』（）()\s]+", "", s).strip("、")


def ja_len(s):
    return len(re.sub(r"\s", "", s))


lines, per = [], OrderedDict((g, []) for g in GROUPS)
for sp in GROUPS:
    tr = json.loads((VD / "ja" / f"{sp}.json").read_text(encoding="utf-8"))
    tmap = {t["zh"]: t for t in tr}
    for l in (x for x in Z["lines"] if x["speaker"] == sp):
        t = tmap[l["text"]]
        key = f"{sp}|{l['text']}"
        per[sp].append({
            "id": f"{sp}_{hashlib.sha1(key.encode('utf-8')).hexdigest()[:8]}",
            "group": sp, "role": GROUPS[sp]["name"], "lang": "ja",
            "text": l["text"], "zh": l["text"], "ja": t["ja"], "tts": t["tts"], "reading": reading(t["tts"]),
            "key": key, "tier": tier(l["ctx"]), "event": l["ctx"],
        })

# 分批：同一群組依 story → bark → firstMeet 排，累計到 MAX_CHARS 或 MAX_LINES 就切下一批
ORDER = {"story": 0, "bark": 1, "firstMeet": 2}
batches = OrderedDict()
for sp, xs in per.items():
    xs.sort(key=lambda x: ORDER[x["tier"]])   # 穩定排序：同一層保持劇情順序
    n, chars, cnt = 1, 0, 0
    for x in xs:
        c = ja_len(x["tts"])
        if cnt and (chars + c > MAX_CHARS or cnt >= MAX_LINES):
            n, chars, cnt = n + 1, 0, 0
        x["batch"] = f"{sp}/{n:02d}"
        chars += c; cnt += 1
        b = batches.setdefault(x["batch"], {"group": sp, "lines": 0, "chars": 0, "tiers": set()})
        b["lines"] += 1; b["chars"] += c; b["tiers"].add(x["tier"])
    lines += xs

ids = [l["id"] for l in lines]
assert len(ids) == len(set(ids)), "id 撞號"
for b in batches.values():
    b["tiers"] = sorted(b["tiers"], key=ORDER.get)

meta = {
    "title": "爪破魔塔 日文配音台詞表",
    "date": "2026-09-28",
    "model": "gemini-3.8-flash-tts",
    "scope": "主線過場（序章、過關、塔頂、關主開場／換階段／倒下、秘笈、關主前夜、落敗、結局、結算那句）＋戰鬥與貓窩吐槽（含魔物初見）。不含旁白、隨機事件、商店、問號、連線雙人文字、連線劇情。",
    "note": "text＝畫面字幕（中文，照舊）；ja＝日文台詞；tts＝實際送去念的文字（專名與難讀字改假名）；reading＝pykakasi 由 tts 自動轉的平假名（機器產生、沒人工校過，回轉檢查用）；key＝遊戲查表鍵「聲音角色|畫面上的中文」；event＝出現在哪些場景（角色/場景#第幾句）；tier＝story／bark／firstMeet；batch＝排在哪一次請求。",
    "source": "tools/voice/dump_lines.ts 實跑 storyFor／lineFor／castLineFor 盤出最終文字（tools/voice/lines_zh.json），依（聲音角色, 中文）去重",
    "batch_limit": {"chars": MAX_CHARS, "lines": MAX_LINES},
    "names": G["names"],
}
groups = OrderedDict()
for sp, g in GROUPS.items():
    groups[sp] = {"role": sp, "name": g["name"], "name_ja": g["name_ja"], "lang": "ja", "voice": g["voice"],
                  "split": "align", "lufs": g["lufs"], "why": g["why"], "style": g["style"]}
out = {"meta": meta, "groups": groups, "batches": batches, "lines": lines}
(ROOT / "public" / "voice").mkdir(parents=True, exist_ok=True)
(ROOT / "public" / "voice" / "script.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=list), encoding="utf-8")

# ---- 統計 ----
def stat(filt):
    xs = [l for l in lines if filt(l)]
    bs = {l["batch"] for l in xs}
    return len(xs), sum(ja_len(l["tts"]) for l in xs), sum(ja_len(l["ja"]) for l in xs)

print(f"總句數 {len(lines)}；請求數（600 字／45 句一批）{len(batches)}")
for sp in GROUPS:
    xs = per[sp]
    print(f"  {sp:13s} {len(xs):4d} 句  ja {sum(ja_len(x['ja']) for x in xs):5d} 字  tts {sum(ja_len(x['tts']) for x in xs):5d} 字  批次 {len({x['batch'] for x in xs})}")
for t in ORDER:
    n, c, cj = stat(lambda l: l["tier"] == t)
    print(f"  tier {t:9s} {n:4d} 句 ja {cj} 字 tts {c} 字")

# ---- 文件 ----
def esc(s):
    return s.replace("|", "｜").replace("\n", " ")

doc = []
A = doc.append
A("# 爪破魔塔 日文配音台詞表（2026-09-28）\n")
A("範圍（使用者裁定）：**只配主線過場與戰鬥吐槽**，不配旁白、隨機事件、商店、問號、連線雙人文字。念日文、畫面字幕照舊是中文。")
A("這一版只是台詞稿，**還沒生成任何聲音、沒呼叫任何語音服務**。正本是 `public/voice/script.json`（本檔由 `tools/voice/build_script.py` 產生，改譯稿改 `tools/voice/ja/<角色>.json` 再重跑）。\n")
A("## 句數與字數\n")
A("| 群組 | 角色 | 句數 | 日文字數 | 送念字數 | 請求數 |")
A("|---|---|---|---|---|---|")
for sp, g in GROUPS.items():
    xs = per[sp]
    A(f"| {sp} | {g['name']} | {len(xs)} | {sum(ja_len(x['ja']) for x in xs)} | {sum(ja_len(x['tts']) for x in xs)} | {len({x['batch'] for x in xs})} |")
A(f"| **合計** | | **{len(lines)}** | **{sum(ja_len(l['ja']) for l in lines)}** | **{sum(ja_len(l['tts']) for l in lines)}** | **{len(batches)}** |\n")
A("分層（可以分天生）：")
for t, zh in (("story", "主線過場"), ("bark", "戰鬥與貓窩吐槽"), ("firstMeet", "魔物初見吐槽")):
    n, c, cj = stat(lambda l, t=t: l["tier"] == t)
    nb = len({l["batch"] for l in lines if l["tier"] == t})
    A(f"- {zh}（{t}）：{n} 句、日文 {cj} 字")
A("")
A("## 日文譯名\n")
A("| 中文 | 日文 | 念法 | 備註 |")
A("|---|---|---|---|")
for n in G["names"]:
    A(f"| {n['zh']} | {n['ja']} | {n['tts']} | {n.get('note', '')} |")
A("")
A("## 每個角色用的聲音\n")
A("| 群組 | 角色 | 聲音 | 為什麼選它 |")
A("|---|---|---|---|")
for sp, g in GROUPS.items():
    A(f"| {sp} | {g['name']}（{g['name_ja']}） | `{g['voice']}` | {g['why']} |")
A("")
minor = [sp for sp in GROUPS if sp not in HERO_ZH]
hero_req = len({b for b in batches if b.split('/')[0] in HERO_ZH})
A("## 分批計畫（一次請求念多少句）\n")
A(f"- 同一個聲音的台詞併成一次請求，生完用強制對齊（stable-ts 把原稿逐字對上音檔）切回每一句，跟《球球大冒險》同一套。")
A(f"- 上限訂 **{MAX_CHARS} 個日文字或 {MAX_LINES} 句**（先到先切）。根據：《球球大冒險》最大一批是 43 句、313 字、念出來 60 秒，狸大人 10 句 137 字是 32 秒，推得日文每秒約 6 字、每句再加約 1 秒停頓；"
  f"講課產線上限 700 個中文字（約 1.8 分鐘），理由是 Google 論壇官方回覆「單次生成超過幾分鐘音質會變差」。600 字＋45 句的停頓約 2～2.5 分鐘，還在安全範圍。")
A(f"- 照這個上限：四位主角 {hero_req} 次、關主與配角 {len(minor)} 次（每個聲音至少一次，句子再少也省不掉），**合計 {len(batches)} 次**。")
A("- 放寬會更省，但沒實測過：900 字／65 句約 37 次、1200 字／90 句約 33 次（都要 3～4 分鐘一段，超過講課產線驗證過的長度；而且《球球大冒險》的 `voice_gen.py` 等回應只等 120 秒，要先放寬）。建議先用 600 字生一批主角台詞，聽音質、看對齊結果，再決定要不要放寬。")
A("- 分層生：先生主線過場（story），再生吐槽（bark），魔物初見（firstMeet）最多、最後生。每句的 `tier` 與 `batch` 欄位已經標好。")
A("- 關主與配角 12 個聲音各只有 1～8 句，一個聲音一次請求是下限。Gemini 有「一次請求兩個說話者」的模式，理論上可以兩隻關主併一次（12 次變 6 次），但《球球大冒險》沒用過、對齊也要改寫，先不算進計畫。\n")
A("## 遊戲怎麼查到該播哪一句\n")
A("- 每句的 `key`＝「聲音角色|畫面上那一句中文」，例如 `ninja|看招喵！`、`nekomata|老婆子還沒拿出真本事呢。`。中文是 `lineFor`／`castLineFor` 換過之後、真的顯示在畫面上的那一句，不是原始碼裡的樣板。")
A("- 只拿中文查不夠：`有伏兵跳出來了！` 這一句菲菲、噹噹、封封都會講，要靠聲音角色分開。")
A("- 聲音角色怎麼判斷：主角＝本機這一位（`localHero()`，劇本寫「球球」但非字面播時就是本機角色）；字面播的過場照說話者（球球→ninja、菲菲→feifei、噹噹→dangdang、封封→fengfeng）；「大俠貓」→daxia；「塔主」＝這一場的關主 id（師父 tower_master 算 daxia）；「村貓」→villager；「黑貓忍者頭目」→ninja_boss。")
A("- 要接的地方（這一版**還沒實作**）：")
A("  1. `src/ui/dialogue.ts` 的 `playDialogue` 裡的 `render()`：`text.textContent = l.text` 那一行之後播這一句；換句或關掉對白框時停掉上一句。「塔主」要知道是哪一隻：`SpeakerCast` 目前只帶名字與頭像，要多帶關主 id（`app.ts` 關主開場與倒下兩處、`combat.ts` 的 `bossPhaseTalk`）。")
A("  2. `src/ui/dialogue.ts` 的 `toast()`（戰鬥、紙箱、貓窩吐槽）與 `bubbleAt`／`bubbleOverUnit`（關主換階段從頭上冒的那句）：呼叫端手上都有說話者名字，名字轉聲音角色（主角名→角色、關主名→關主 id）；關主倒下時名牌可能帶「暴怒的」前綴，建議改傳 id 不要靠名字。")
A("  3. 幻燈片 `src/ui/slides.ts` 的 `playSlides` 顯示台詞的地方，同 1。")
A("  4. 查表檔：生成後另出一份 `public/voice/index.json`（`key`→音檔路徑），遊戲開局載入；查不到就不播（旁白、事件、沒配的句子照舊安靜）。\n")
A("## 沒有配、或沒辦法事先列出來的句子\n")
A("- **連線劇情**：兩人同隊時整段換掉的序章、過關、結局、師父那場接話，以及逐句換口的混搭句，實跑盤點後比單人多 148 句（球球 40、菲菲 42、噹噹 35、封封 31）。範圍說不配連線文字，所以沒收；連線時這些句子會沒有聲音。")
A("- **帶變數的句子**：過關拿到關主信物那兩句（`關主留下的東西……「秘寶名」到手了喵！`、`…是「秘寶名」！這就是塔主的信物喵！`，在 `actclear.ts`、`reward.ts`）裡面嵌了秘寶名稱，每位主角 2 種樣板 × 秘寶數量，沒有列。打完事件的「打贏了，拿到秘寶…」是系統提示，也沒列。")
A("- **通用換階段的舞台指示**：`（氣勢整個變了）`、`（魔氣直往天上冒）`（噹噹、封封版改寫成「對手突然換了架勢…」這種描述），不是誰在說話，沒配。主角在同一場講的那句（例：`看來還沒打完喵。`）有配。")
A("- **走不到的**：通用關主開場（每隻關主都有專屬開場）、封封／噹噹的「養好傷再出發」句（程式註明還沒接線）、封封短句表裡 ATTACK／BLOCK／CHARGE／HURT／TARGET／MONEY／SHOP／REVIVED 幾組（程式沒有地方用）。")
A("- **範圍外**：旁白、隨機事件、商店老闆、問號、祝福選擇那句、貓窩淨化那句、魔物自己開場的台詞（`enemies.ts` 的 line／lines）、選角畫面的介紹。\n")
for sp, g in GROUPS.items():
    A(f"## {g['name']}（{g['name_ja']}）— {len(per[sp])} 句\n")
    A("| 中文 | 日文 | 場景 |")
    A("|---|---|---|")
    for x in per[sp]:
        sc = "；".join(dict.fromkeys(scene(c) for c in x["event"]))
        more = "" if len(x["event"]) <= 4 else f"（等 {len(x['event'])} 處）"
        A(f"| {esc(x['text'])} | {esc(x['ja'])} | {esc(sc)}{more} |")
    A("")
DOC = ROOT / "docs" / "2026-09-28_日文配音台詞.md"
DOC.write_text("\n".join(doc) + "\n", encoding="utf-8")
print("→", DOC)
