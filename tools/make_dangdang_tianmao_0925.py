# -*- coding: utf-8 -*-
"""
噹噹「舔毛」牌面重生（2026-09-25 使用者：「太醜了」）。

原本那張照 `make_dangdang_gcard_jobs.py` 的「兩個大東西各佔一半」寫法，大物件寫的是
「一條佔半張圖、捲起來的巨大鮭魚粉舌頭」，畫出來就是一大條舌頭橫過畫面，很怪。
這一版只換構圖那一段：噹噹佔大半張、窩在暖橘色的軟墊光上舒服地舔前掌，**舌頭只露出一小點**；
角色描述、綠幕去背、描邊與配色規則照原本那一份（從 dangdang_gcards_3.json 讀出來沿用）。

用法：python tools/make_dangdang_tianmao_0925.py  → 產生 tools/codex_jobs/dangdang_tianmao_0925.json
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent
KEY = 'card_dangdang_tianmao.png'
src = json.loads((ROOT / 'codex_jobs' / 'dangdang_gcards_3.json').read_text(encoding='utf-8'))[KEY]

head_end = src.index('TWO THINGS SHARE THE FRAME')
char_at = src.index('THE CHARACTER is')
fill_at = src.index('FILL THE WHOLE FRAME.')
bold_at = src.index('Bold and readable at thumbnail size')

opening = 'A cartoon illustration for a card game, landscape composition, showing ONE black-and-white tuxedo cat calmly grooming himself.\n\n'
composition = """THE PICTURE:
The cat fills about 70% of the picture. He is curled up comfortably on a soft, puffy cushion of warm light
drawn in CREAM and WARM ORANGE (like a cosy nap cloud, with a thick black outline round it), with a few small
four-pointed sparkles in white and pale orange around him, each sparkle outlined in black.
He is grooming himself the way a cat does: licking the back of his own raised white front paw, eyes gently shut
in a happy, relaxed little smile, a faint pink blush on his cheeks. One hind leg stretches out lazily.
**THE TONGUE IS TINY.** Only the small pink tip of a normal cat tongue shows, just touching his paw - smaller than
his paw. Do NOT draw a long, huge, thick or curling tongue, and do NOT let the tongue stick out across the picture.
The mood is sleepy and cute, not funny or gross.
COPY THE REFERENCE'S PROPORTIONS. This is the part that keeps going wrong, so be strict about it:
- The head is BIG and ROUND - roughly as large as the whole body. Do not draw a small head.
- The muzzle is TINY, the body is short and chubby. It is a chibi mascot, not a realistic animal.
- **A round BRONZE BRACER on EACH of his two forearms** stays visible, even on the paw he is licking.
Draw it big enough that its face reads clearly when the picture is shrunk to 150 pixels wide.

"""
fill = """FILL THE WHOLE FRAME. The picture is shown inside a short, almost-square window on the card.
The cat and his cushion of light together reach the top edge, the bottom edge and both sides; no empty bands.

"""
prompt = opening + composition + src[char_at:fill_at] + fill + src[bold_at:]
assert 'tongue curled upward, huge' not in prompt
out = ROOT / 'codex_jobs' / 'dangdang_tianmao_0925.json'
out.write_text(json.dumps({KEY: prompt}, ensure_ascii=False, indent=1), encoding='utf-8')
sys.stdout.write(f'wrote {out} ({len(prompt)} chars)\n')
