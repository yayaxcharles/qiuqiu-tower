# -*- coding: utf-8 -*-
"""菲菲的鏡子走廊開場圖：鏡子裡要有一個假的師兄（使用者 2026-09-14 裁定）。

原本她的版本照球球那張寫「鏡子裡是好多個自己」，圖上也畫了一整排菲菲的倒影；
可是開打之後的對手是鏡中球球（球球形狀的黑影），文字、圖、戰鬥三段各講各的。
使用者裁定：對她來說鏡子裡是長得像師兄的假貨，她要打贏假的師兄。
文字已經改在 `src/content/dialogue.ts` 的 `FEIFEI_EVENT_TEXT`，這支只重生那張開場圖。

沿用原工單（`tools/codex_jobs/feifei_events.json`）的整份提示詞與參考圖，只換「Scene」那一行。
刻意寫進去的三件事（都是 `art_rules.py` 的雷）：
  - 鏡子玻璃寫成銀灰偏藍、不准綠：原圖的鏡面是淡綠色，綠幕去背時很容易被挖成破洞
  - 黑影寫成實心、不透明、沒有煙也沒有火焰：影球球立繪帶紫色煙，照抄會變成半透明的灰膜
  - 明講黑影不是灰虎斑、身上沒有深藍：原提示詞最後一句是「不准畫灰虎斑綁深藍頭巾的貓」，不寫清楚會跟黑影的頭巾打架
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(r'F:\ClaudeWork\qiuqiu-coop')
SRC = ROOT / 'tools/codex_jobs/feifei_events.json'
OUT = ROOT / 'tools/codex_jobs/feifei_mirror_0914.json'
NAME = 'event_feifei_mirror_hall.png'

OLD_SCENE = ('Scene: a corridor lined with tall mirrors on both sides, several reflections of the same grey ninja cat '
             'visible in them; the real cat stands in the middle looking uneasy')
NEW_SCENE = (
    'Scene: a long corridor lined with tall mirrors on both sides; the mirror glass is pale silvery blue-grey '
    '(NOT green). Several of the mirrors show HER own reflection. But in the one big mirror closest to her on the '
    'RIGHT, instead of her reflection stands a FAKE SENIOR BROTHER: a SHADOW impostor shaped like a round, chubby '
    'ninja cat - a completely SOLID, OPAQUE dark purple-black silhouette with no fur markings, wearing a headband '
    'whose two cloth tails flutter behind its head, small glowing violet eyes, both paws raised in a fighting stance, '
    'as if about to step out of the glass. It is NOT a grey tabby and wears nothing navy - it is pure dark shadow, '
    'with no smoke, no flames and no soft glow around it. The real Siamese cat girl stands in the middle of the '
    'corridor, turned toward that mirror, startled and uneasy, a bead of sweat on her face, holding one needle '
    'ready. No other characters')

jobs = json.loads(SRC.read_text(encoding='utf-8'))
job = jobs.get(NAME)
if not isinstance(job, dict) or 'prompt' not in job:
    raise SystemExit(f'{SRC.name} 裡找不到 {NAME} 的工單')
if OLD_SCENE not in job['prompt']:
    raise SystemExit('原提示詞的 Scene 那一行對不上：原工單被改過，先看過再改這支')
prompt = job['prompt'].replace(OLD_SCENE, NEW_SCENE, 1)
ref = job.get('ref', 'tools/ref/feifei_ref.png')

# 自檢一律中止（art_rules 第九個雷）
if not (ROOT / ref).exists():
    raise SystemExit(f'參考圖不在：{ref}')
if 'SHADOW' not in prompt or 'NOT green' not in prompt:
    raise SystemExit('新場景沒有換進去')
if (ROOT / 'tools/codex_raw' / NAME).exists():
    raise SystemExit(f'{NAME} 的舊原稿還在：先改名留底（例如 .previous-20260914.png），不然 codex_gen 會直接跳過')

OUT.write_text(json.dumps({NAME: {'prompt': prompt, 'ref': ref}}, ensure_ascii=False, indent=1), encoding='utf-8')
sys.stdout.write(f'1 張 → {OUT.name}（參考圖 {ref}）\n')
