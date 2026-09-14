# -*- coding: utf-8 -*-
"""球球的事件插圖重生（使用者 2026-09-14 逐張看除錯頁抓到的）。

  1. `event_rescue_r1`（江湖救急，選「收下小魚乾」）：受傷的村貓畫成三隻手兩隻腳
  2. `event_gambling_rats`＋`_r0`（賭博的老鼠）：球球長相不對——眼睛畫成黃色大眼，跟設定表的黑色圓點眼不一樣
  3. `event_heavy_door`＋`_r0`＋`_r1`（很重的門）：球球長相不對

開場圖原本的工單在 `tools/codex_jobs/events2.json`，當時是命令列帶 `--ref 球球設定表.png`（提交 ddcb2e4），
沒記在工單裡；這次每筆自己帶參考圖。結果圖的工單在 `event_result_art.json`，參考圖是
`tools/ref/event_refs/<事件>.png`（由開場圖做成的），**所以開場圖重生之後結果圖得跟著重生**，
不然續集會照舊的長相再畫一次（`art_rules.py` 第十個雷：續集的長相全靠參考圖）。

分兩批，一批跑完、進倉、重建參考圖，才能跑下一批：
  python tools/make_qiuqiu_fix_0914.py a   → 兩張開場圖＋村貓那張（村貓的開場圖沒問題，參考圖照舊）
  python tools/make_qiuqiu_fix_0914.py b   → 賭博的老鼠、很重的門的三張結果圖（會檢查參考圖已經照新開場圖重建）

提示詞沿用原工單，只在「Tell the story」那段前面補一段要求，理由：
  - 眼睛寫明是黑色圓點加一點白光、明講「不可以是黃色／金色的眼睛」（只寫要什麼、不寫不可以變成什麼，模型照樣會畫歪）
  - 村貓寫明四肢各兩隻、一共四隻
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(r'F:\ClaudeWork\qiuqiu-coop')
JOBS = ROOT / 'tools' / 'codex_jobs'
RAW = ROOT / 'tools' / 'codex_raw'
REF_SHEET = 'tools/ref/球球設定表.png'
ANCHOR = 'Tell the story in one readable picture'

FACE = ("THE NINJA CAT'S LOOK (check this before finishing): he is a LIGHT GREY tabby with dark grey stripes, "
        "a WHITE muzzle and chin, pink inside his ears, and his eyes are simple round solid BLACK dots with one "
        "small white highlight each - exactly like the reference. Never give him yellow, golden, amber or green "
        "eyes, and never big realistic eyes with coloured irises. His head is big and round, his body short and "
        "chubby, in the navy ninja outfit with the navy headband and its two trailing tails.\n")
LIMBS = ("THE INJURED VILLAGE CAT has exactly TWO front paws and TWO back legs - four limbs in total. "
         "Do not draw a third arm or an extra paw; the bandaged limb is one of those four.\n")


def load(name: str) -> dict:
    return json.loads((JOBS / name).read_text(encoding='utf-8'))


def prompt_of(v) -> str:
    return v if isinstance(v, str) else v['prompt']


def patched(prompt: str, extra: str, fid: str) -> str:
    if ANCHOR not in prompt:
        raise SystemExit(f'{fid}：原提示詞找不到「{ANCHOR}」那一段，工單格式變了，先看過再改這支')
    return prompt.replace(ANCHOR, extra + ANCHOR, 1)


batch = sys.argv[1] if len(sys.argv) > 1 else ''
jobs: dict[str, dict[str, str]] = {}
if batch == 'a':
    ev2 = load('events2.json')
    res = load('event_result_art.json')
    for fid in ['event_gambling_rats.png', 'event_heavy_door.png']:
        jobs[fid] = {'prompt': patched(prompt_of(ev2[fid]), FACE, fid), 'ref': REF_SHEET}
    fid = 'event_rescue_r1.png'
    jobs[fid] = {'prompt': patched(prompt_of(res[fid]), FACE + LIMBS, fid), 'ref': res[fid]['ref']}
elif batch == 'b':
    res = load('event_result_art.json')
    for fid in ['event_gambling_rats_r0.png', 'event_heavy_door_r0.png', 'event_heavy_door_r1.png']:
        ref = res[fid]['ref']
        eid = fid[len('event_'):].rsplit('_r', 1)[0]
        opening = ROOT / 'public' / 'assets' / 'bg' / f'event_{eid}.webp'
        # 參考圖一定要比新的開場圖晚做出來，不然續集會照舊長相畫（自檢要中止，art_rules 第九個雷）
        if not (ROOT / ref).exists() or (ROOT / ref).stat().st_mtime < opening.stat().st_mtime:
            raise SystemExit(f'{ref} 還是舊的：先把新的 event_{eid} 進倉、刪掉這張參考圖再重建（見 make_event_result_jobs.py）')
        jobs[fid] = {'prompt': patched(prompt_of(res[fid]), FACE, fid), 'ref': ref}
else:
    raise SystemExit('要指定批次：a（開場圖＋村貓）或 b（結果圖）')

for fid, job in jobs.items():
    if not (ROOT / job['ref']).exists():
        raise SystemExit(f'{fid} 的參考圖不在：{job["ref"]}')
    if (RAW / fid).exists():
        raise SystemExit(f'{fid} 的舊原稿還在：先改名留底（.previous-20260914.png），不然 codex_gen 會直接跳過')
    if 'BLACK dots' not in job['prompt']:
        raise SystemExit(f'{fid}：眼睛那段沒有補進去')

out = JOBS / f'qiuqiu_fix_0914_{batch}.json'
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
sys.stdout.write(f'{len(jobs)} 張 → {out.name}\n')
