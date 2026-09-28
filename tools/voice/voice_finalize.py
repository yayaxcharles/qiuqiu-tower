# -*- coding: utf-8 -*-
r"""爪破魔塔日文配音收尾：每句挑最好的一版 → 修頭尾靜音 → 響度統一 → 單聲道 mp3 → 查表檔 → 試聽檔。

改寫自 F:\ClaudeWork\qiuqiu-side\tools\voice\voice_finalize.py（原檔不動）。
用法（系統 Python，在專案資料夾）：python tools\voice\voice_finalize.py [--no-asr]

- 範圍：台詞表裡 tier 不是 firstMeet 的句子（魔物初見那 444 句還沒生成）。
- 候選：vids\_audio\voice_work\<群組>\try<100 以上>\clips\<id>.wav（切得合理、有檢查結果的才算），
  挑念錯分數最低的；tools\voice\verdicts.json 可人工改判（讀音轉換造成的假錯），picks.json 可指定版本。
- 成品：public\voice\<群組>\<id>.mp3（單聲道 24 kHz 48 kbps，響度照台詞表各群組的 lufs）。
- 查表檔：public\voice\voice-map.json＝{ key（群組|畫面中文）: {file, dur} }，只收判定合格的句子；
  不合格的另列在 tools\voice\voice_excluded.json。
- 試聽：vids\_audio\試聽_正式\ 每個主角一支約兩分鐘（主線照遊戲順序挑、後面接幾句吐槽）＋配角一支（全部），
  各附一份清單（時間｜中文｜日文）。
"""
import json
import math
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).parent
PROJ = HERE.parents[1]
WORK = PROJ / "vids" / "_audio" / "voice_work"
VOUT = PROJ / "public" / "voice"
PREV = PROJ / "vids" / "_audio" / "試聽_正式"
TMP = WORK / "_final_tmp"
S = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
VERD = json.loads((HERE / "verdicts.json").read_text(encoding="utf-8"))
PICKS = json.loads((HERE / "picks.json").read_text(encoding="utf-8")) if (HERE / "picks.json").exists() else {}
NO_ASR = "--no-asr" in sys.argv
SKIP_TIERS = {"firstMeet"}
MAIN = ["ninja", "feifei", "dangdang", "fengfeng"]
if TMP.exists():
    shutil.rmtree(TMP)
TMP.mkdir(parents=True)


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")


def dur_of(p):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)]).stdout)


def loudness(p):
    """短句直接量整合響度不準（量測區塊 0.4 秒），把句子接成四遍再量。"""
    r = run(["ffmpeg", "-hide_banner", "-stream_loop", "3", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"])
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    return float(m[-1]) if m else None


def verdict(line_id, tryn):
    v = VERD.get(line_id)
    return v if isinstance(v, dict) and v.get("try") == tryn else None


def is_bad(line_id, score, tryn):
    v = verdict(line_id, tryn)
    return (not v["ok"]) if v else score > 0.25


def candidates(line):
    out = []
    for tdir in sorted((WORK / line["group"]).glob("try*"), key=lambda p: int(p.name[3:])):
        tryn = int(tdir.name[3:])
        if tryn < 100:  # try0～2 是定聲音前的試聽，不算
            continue
        clip, ck, sp = tdir / "clips" / f"{line['id']}.wav", tdir / "check_out.json", tdir / "split.json"
        if not (clip.exists() and ck.exists() and sp.exists()):
            continue
        spl = json.loads(sp.read_text(encoding="utf-8"))["lines"].get(line["id"])
        res = json.loads(ck.read_text(encoding="utf-8")).get(line["id"])
        if not spl or not spl["ok"] or not res:
            continue
        v = verdict(line["id"], tryn)
        out.append({"try": tryn, "clip": clip, "res": res, "bad": is_bad(line["id"], res["score"], tryn),
                    "doubt": bool(v and v.get("doubt"))})
    return out


def finalize_one(line, c):
    G = S["groups"][line["group"]]
    (VOUT / line["group"]).mkdir(parents=True, exist_ok=True)
    mp3 = VOUT / line["group"] / f"{line['id']}.mp3"
    t1 = TMP / f"{line['id']}_trim.wav"
    trim = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01:detection=peak,areverse,"
            "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04:detection=peak,areverse")
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(c["clip"]), "-af", trim, str(t1)])
    if not t1.exists() or dur_of(t1) < 0.08:  # 修過頭（整句被當成靜音）就用原切片
        shutil.copy(c["clip"], t1)
    L = loudness(t1)
    gain = G["lufs"] - L if L is not None else 0.0
    t3 = TMP / f"{line['id']}_lvl.wav"
    for _ in range(3):  # 限幅會把峰值多的句子壓小聲，量一次、補差額，最多補三輪、最多多加 4 dB
        chain = [f"volume={gain:.2f}dB", "alimiter=limit=0.75:level=false",
                 "afade=t=in:d=0.005,areverse,afade=t=in:d=0.025,areverse"]
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(t1), "-af", ",".join(chain), "-c:a", "pcm_f32le", str(t3)])
        L3 = loudness(t3)
        if L3 is None or abs(G["lufs"] - L3) < 0.5:
            break
        gain = min(gain + (G["lufs"] - L3), (G["lufs"] - L if L is not None else 0.0) + 4.0)
    r = run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(t3), "-ac", "1", "-ar", "24000",
             "-c:a", "libmp3lame", "-b:a", "48k", "-map_metadata", "-1", str(mp3)])
    if r.returncode:
        raise RuntimeError(f"{line['id']} 轉檔失敗：{r.stderr[-300:]}")
    return {"try": c["try"], "bad": c["bad"], "doubt": c["doubt"], "score": c["res"]["score"],
            "hyp_clip": c["res"]["hyp"], "tries": c["n"], "dur": round(dur_of(mp3), 2), "lufs": loudness(mp3),
            "file": f"voice/{line['group']}/{line['id']}.mp3", "bytes": mp3.stat().st_size}


lines = [l for l in S["lines"] if l["tier"] not in SKIP_TIERS]
jobs, pending = [], []
for line in lines:
    cands = candidates(line)
    if not cands:
        pending.append(line["id"])
        continue
    if line["id"] in PICKS:
        c = next(x for x in cands if x["try"] == PICKS[line["id"]])
    else:
        c = min(cands, key=lambda x: (x["bad"], x["res"]["score"], x["try"]))
    c["n"] = len(cands)
    jobs.append((line, c))
with ThreadPoolExecutor(8) as ex:
    outs = list(ex.map(lambda jc: finalize_one(*jc), jobs))
report = {line["id"]: o for (line, _), o in zip(jobs, outs)}
done = [line for line, _ in jobs]
print(f"轉好 {len(done)} 句；沒有候選 {len(pending)} 句")

# 成品再回轉一次：修頭尾有沒有切到字
if done and not NO_ASR:
    items = [{"id": l["id"], "wav": str(VOUT / l["group"] / f"{l['id']}.mp3"), "lang": l["lang"], "ref": l["text"],
              "reading": l.get("reading", ""), "alt_reading": []} for l in done]
    cf, of = TMP / "final_check.json", TMP / "final_check_out.json"
    cf.write_text(json.dumps({"items": items, "out": str(of)}, ensure_ascii=False), encoding="utf-8")
    subprocess.run([sys.executable, str(HERE / "voice_check.py"), str(cf)], stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL)
    fin = json.loads(of.read_text(encoding="utf-8")) if of.exists() else {}
    for k, v in fin.items():
        report[k]["hyp_final"] = v["hyp"]
        report[k]["score_final"] = v["score"]

# 查表檔（只收合格）＋不合格清單
vmap, excluded = {}, []
for l in done:
    rp = report[l["id"]]
    if rp["bad"]:
        excluded.append({"id": l["id"], "key": l["key"], "text": l["text"], "tts": l["tts"], "try": rp["try"],
                         "score": rp["score"], "hyp": rp["hyp_clip"]})
    else:
        vmap[l["key"]] = {"file": rp["file"], "dur": rp["dur"]}
(VOUT / "voice-map.json").write_text(json.dumps(vmap, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
(HERE / "voice_excluded.json").write_text(json.dumps({"excluded": excluded, "no_candidate": pending},
                                                     ensure_ascii=False, indent=1), encoding="utf-8")
(HERE / "_final_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1, default=str), encoding="utf-8")

# ---- 試聽檔 ----
ACT_BOSSES = [["nekomata", "iron_claw", "orange_king"], ["cowcat_boss", "tanuki_lord", "persian_lady", "frog_daimyo"],
              ["armadillo_king", "dragon_cat", "hex_abbot"]]
ORDER = ["prologue", "afterFirstElite", "secretScroll"]
for a, bosses in enumerate(ACT_BOSSES, 1):
    ORDER.append(f"restBeforeBoss{a}")
    for b in bosses:
        ORDER += [f"bossIntro:{b}", f"bossPhase2:{b}", f"bossDefeat:{b}"]
    ORDER.append(f"actClear{a}")
ORDER += ["topScene", "bossIntro:tower_master", "bossPhase2:tower_master", "bossPhase3:tower_master",
          "bossPhase2Generic", "bossPhase3Generic", "victory", "victory:master", "result:victoryTeaser", "defeat"]


def game_pos(l):
    best = (len(ORDER), 0)
    for e in l["event"]:
        scene, _, n = e.split("/", 1)[1].partition("#")
        base = next((o for o in ORDER if scene == o), None) or next((o for o in ORDER if scene.startswith(o)), None)
        if base is not None:
            best = min(best, (ORDER.index(base), int(n) if n.isdigit() else 0))
    return best


def spread(ls, secs):
    """照順序均勻挑，總長約 secs 秒。"""
    tot = sum(report[l["id"]]["dur"] + 0.5 for l in ls)
    if tot <= secs:
        return ls
    k = tot / secs
    return [l for i, l in enumerate(ls) if math.floor(i / k) != math.floor((i - 1) / k) or i == 0]


gap = TMP / "gap.wav"
run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.5", str(gap)])


def build_preview(name, ls, with_role=False):
    lst, rows, t = [], [], 0.0
    for l in ls:
        rp = report[l["id"]]
        w = TMP / f"{l['id']}_dec.wav"
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(PROJ / "public" / rp["file"]), "-ar", "24000", "-ac", "1",
             str(w)])
        d = dur_of(w)
        who = f"{S['groups'][l['group']]['name'].split('（')[0]}｜" if with_role else ""
        rows.append(f"{int(t // 60):02d}:{t % 60:05.2f}｜{who}{l['text']}｜{l['ja']}"
                    + ("｜（不合格，查表檔沒收）" if rp["bad"] else ""))
        lst += [f"file '{w.as_posix()}'", f"file '{gap.as_posix()}'"]
        t += d + 0.5
    cc = TMP / f"concat_{name}.txt"
    cc.write_text("\n".join(lst), encoding="utf-8")
    out = PREV / f"{name}.mp3"
    r = run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(cc),
             "-c:a", "libmp3lame", "-b:a", "64k", str(out)])
    if r.returncode:
        sys.exit(r.stderr[-400:])
    head = [f"{name}（{len(ls)} 句，共 {t:.0f} 秒；句與句之間 0.5 秒空白）", "格式：時間｜" + ("角色｜" if with_role else "")
            + "畫面中文｜日文台詞", ""]
    (PREV / f"{name}_清單.txt").write_text("\n".join(head + rows) + "\n", encoding="utf-8")
    print(f"試聽 {out.name}：{len(ls)} 句、{t:.0f} 秒")


PREV.mkdir(parents=True, exist_ok=True)
by_group = {}
for l in done:
    by_group.setdefault(l["group"], []).append(l)
for g in MAIN:
    ls = by_group.get(g, [])
    story = sorted([l for l in ls if l["tier"] == "story"], key=game_pos)
    bark = [l for l in ls if l["tier"] == "bark"]
    nm = S["groups"][g]["name"]
    build_preview(f"{nm}_主線加吐槽", spread(story, 90) + spread(bark, 30))
sup = sorted([l for l in done if l["group"] not in MAIN], key=lambda l: (game_pos(l), l["group"]))
build_preview("配角全部", sup, with_role=True)

tot = sum(p.stat().st_size for p in VOUT.rglob("*.mp3"))
nbad = sum(v["bad"] for v in report.values())
reg = [k for k, v in report.items() if v.get("score_final") is not None and v["score_final"] > 0.25 and not v["bad"]]
print(f"\n合格 {len(vmap)} 句、不合格 {nbad} 句、沒有候選 {len(pending)} 句；public\\voice 的 mp3 合計 {tot / 1024 / 1024:.2f} MB")
print(f"查表檔 voice-map.json {(VOUT / 'voice-map.json').stat().st_size / 1024:.1f} KB")
if reg:
    print("成品再回轉分數超過 25% 的合格句（可能修頭尾切到字，或只是讀音轉換）：")
    for k in reg:
        print(f"  {k} {report[k]['score_final']}（切片時 {report[k]['score']}）「{report[k].get('hyp_final')}」")
