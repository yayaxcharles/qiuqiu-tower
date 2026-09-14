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
elif batch == 'c':
    # 江湖救急開場圖：村貓伸出去的手臂底下卡著一小塊深綠色（去背去不掉，原稿已經不在）。使用者 2026-09-14「生」。
    # **附目前這張本身重畫、只拿掉那塊**：兩張結果圖（rescue_r0、今天剛重生的 rescue_r1）是照這張畫的，換構圖就對不上。
    # 參考圖 event_refs/rescue.png 就是這張開場圖鋪白底；生完進倉後要照新圖重建（續集的長相全靠它）
    fid = 'event_rescue.png'
    ref = 'tools/ref/event_refs/rescue.png'
    opening = ROOT / 'public' / 'assets' / 'bg' / 'event_rescue.webp'
    if (ROOT / ref).stat().st_mtime < opening.stat().st_mtime:
        raise SystemExit(f'{ref} 比開場圖舊：它應該就是目前這張開場圖鋪白底，先重建再生')
    jobs[fid] = {'prompt': (
        "A single scene illustration for a story event in a cute cartoon roguelike card game, landscape composition.\n\n"
        "**THIS IS A CORRECTED REDRAW OF THE ATTACHED PICTURE.** Redraw the attached picture as closely as you can - the "
        "SAME injured village cat lying on its side with its bandaged leg, the SAME ninja cat, the SAME pouch of dried "
        "fish and the SAME bottle of herbal medicine, with the SAME poses, colours, sizes and layout. Change ONLY the one "
        "mistake described below.\n\n"
        "Scene: an injured village cat lying on its side with a bandaged leg, weakly pushing forward two things - a small "
        "pouch of dried fish and a bottle of herbal medicine - for the grey ninja cat to choose from\n\n"
        "**THE ONE THING TO FIX:** in the attached picture a small dark green blotch with two grey spots is stuck in the "
        "gap UNDER the village cat's outstretched front leg, between its chest and the fish pouch. It is a drawing "
        "mistake, not an object in the story. Remove it completely: that gap is plain flat background, and where the "
        "village cat's body is, it is simply its own fur. Nothing dark or shaded fills that gap. The medicine bottle "
        "and its leaf stay exactly as they are in the attached picture.\n"
        "THE INJURED VILLAGE CAT has exactly TWO front paws and TWO back legs - four limbs in total, the bandaged leg is "
        "one of them. No extra paw anywhere.\n"
        "THE NINJA CAT stays exactly as in the attached picture: his eyes are simple round solid BLACK dots with one "
        "small white highlight each - never yellow, golden or coloured irises - with the navy headband and its two "
        "trailing tails and the navy ninja outfit.\n\n"
        "Tell the story in one readable picture: clear staging, strong silhouettes, expressive faces, only what the\n"
        "scene needs. It will be shown about 420 pixels wide, so no fine detail that disappears when shrunk.\n"
        "Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon storybook look,\n"
        "not photorealistic. Warm torch-lit tower interior lighting unless the scene says otherwise.\n"
        "No text, no letters, no numbers, no watermark, no user interface, no border.\n"
        "Background must be a solid pure green (#00FF00), completely flat, for chroma keying - draw only the\n"
        "characters and the few props the scene needs, standing on nothing. Anything else that is green or dark "
        "green gets erased by the chroma key and leaves a hole or a blotch, so do not paint any green shadow or "
        "green shape between the characters.\n"
        "Output 1024x768 PNG. Save the image as event_rescue.png in the current directory and report the path."),
        'ref': ref}
else:
    raise SystemExit('要指定批次：a（開場圖＋村貓）、b（結果圖）或 c（江湖救急開場圖拿掉那塊綠）')

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
