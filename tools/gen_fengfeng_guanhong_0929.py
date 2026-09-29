"""絕學·氣貫長虹（2026-09-29 新牌）的牌面：借用 qiuqiu-coop/tools/gen_fengfeng_qi_cards_0925.py 的提示詞與流程，
輸出放在暫存區（不動倉庫的清單），挑好再放進副本。
用法：python gen_guanhong.py refs | gen [--note ...] | pick <第幾次>
"""
import sys
from pathlib import Path
sys.path.insert(0, 'F:/ClaudeWork/qiuqiu-coop/tools')
import gen_fengfeng_qi_cards_0925 as g  # noqa: E402
from PIL import Image  # noqa: E402

OUT = Path('C:/Users/yayax/AppData/Local/Temp/claude/C--Users-yayax/586bf34b-7da0-4f66-b652-57d4af48e903/scratchpad/guanhong')
g.SOURCE = OUT
g.REF = OUT / '_ref'
g.PROMPTS = OUT / 'prompts.json'
g.CARDS = {
    'fengfeng_guanhong': ('fengfeng_duanliu', 'RADIANT WHITE-GOLD WITH A FAINT RAINBOW SHEEN',
        'strict side view facing RIGHT, he stands in a long, low, perfectly straight forward lunge and drives his jian '
        'straight ahead with both paws; ALL of his stored breath bursts out along the blade as ONE enormous, perfectly '
        'straight beam of sword-energy that shoots from the sword tip all the way to the RIGHT edge of the picture, '
        'like a long rainbow piercing the sky: a thick white-gold core with a thin, soft rainbow shimmer along its edges. '
        'A few pale gold wisps of breath swirl around his body and flow INTO the sword. His eyes are narrowed and '
        'utterly focused, mouth closed in a determined line. The beam is the biggest thing in the picture but it must '
        'NOT cover his face, paws or sword.'),
}

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    cmd = sys.argv[1]
    if cmd == 'refs':
        g.refs()
    elif cmd == 'gen':
        note = sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == '--note' else ''
        print(g.generate('fengfeng_guanhong', note))
    elif cmd == 'pick':
        n = int(sys.argv[2])
        g.fit(Image.open(OUT / f'fengfeng_guanhong.try{n}.png')).save(OUT / 'fengfeng_guanhong.webp', 'WEBP', quality=78, method=6)
        print('ok', (OUT / 'fengfeng_guanhong.webp').stat().st_size // 1024, 'KB')
