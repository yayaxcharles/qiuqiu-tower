"""第二輪試作：A 風格的另外兩張牌（看像不像、一致不一致）＋兩款新按鈕。只存暫存區。"""
import subprocess, sys, time
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
IMAGE_GEN = Path.home() / '.codex/skills/codex-ppt/scripts/image_gen.py'
OUT = Path(__file__).resolve().parent / 'trials'

共同 = ('Art style: cosy cartoon game, thick dark outlines, flat colours with soft cel shading, warm and hand-made, '
       'never sleek or photoreal. ')
A框 = ('Full design mock-up of ONE playing card for a Chinese-martial-arts cat deck-building game, portrait 2:3, '
      'shown flat and centred on a plain dark grey background. Frame: deep vermilion lacquered wooden frame with brass '
      'corner studs and a thin gold inner line. Layout from top to bottom: a round gold cost badge in the top-left '
      'corner with the number {cost}; a large illustration window taking the upper 55% of the card showing {scene}; '
      'a red-and-gold cloth name banner with knotted tassels and the Chinese name 「{name}」; a rules-text plaque of '
      'aged cream washi paper with the Chinese text 「{text}」; a dark red bottom ribbon with gold characters 「{type}」. '
      'Chinese characters must be correct and crisp. Illustration backdrop: a painted misty ink-wash scene in warm light '
      'that fully fills the window. ')
工單 = {
    'card_A2_dan_ding.png': A框.format(
        cost=1, name='淡定', type='技能', text='獲得 5 點蜷縮。',
        scene='the same cute grey tabby cat ninja with a blue headband, curled up calmly on a round blue cushion with '
              'eyes half closed, a faint blue protective glow around it; backdrop a quiet temple courtyard at dawn') + 共同,
    'card_A3_feifei_needle.png': A框.format(
        cost=1, name='飛針', type='攻擊', text='造成 4 點傷害，並給予 1 層中毒。',
        scene='a cute seal-point Siamese cat (cream body, dark brown face mask, ears and paws, blue eyes) in a purple '
              'ninja outfit with a pink hair bow, throwing three glowing green poison needles; backdrop a bamboo forest '
              'at dusk') + 共同,
    'buttons_lacquer_set.png': (
        'UI asset sheet for a Chinese-martial-arts cat card game, on a plain dark grey background. Four rounded '
        'rectangular buttons stacked vertically, each shown in three states side by side (normal / hovered with a soft '
        'gold glow / pressed darker): '
        '1) black lacquer with a thin gold inlay line and tiny gold cloud-pattern corners; '
        '2) deep vermilion lacquer with a gold inlay line, matching a red lacquer card frame; '
        '3) dark walnut wood with a carved gold-leaf border; '
        '4) aged bronze metal plate with a hammered texture and riveted gold edge. '
        'All EMPTY in the middle (no text, no icons), flat centre area, elegant and premium, matching a vermilion '
        'lacquer-and-gold card frame. ' + 共同),
    'buttons_paper_set.png': (
        'UI asset sheet for a cosy Chinese-martial-arts cat card game, on a plain dark grey background. Three '
        'rounded rectangular buttons stacked vertically, each shown in three states side by side (normal / hovered '
        'glowing / pressed darker): '
        '1) a folded cream paper talisman strip with a red seal stamp at the left end and a thin ink border; '
        '2) a dark indigo cloth banner with gold thread edges and a small knotted tassel at each end; '
        '3) a smooth river-stone slab, dark grey-green, with a thin carved gold line. '
        'All EMPTY in the middle (no text, no icons), flat stretchable centre, refined and calm. ' + 共同),
}
for 名, 提示 in 工單.items():
    出 = OUT / 名
    if 出.exists():
        print('已有', 名); continue
    t = time.time()
    大小 = '1024x1536' if 名.startswith('card_') else '1536x1024'
    cmd = [sys.executable, str(IMAGE_GEN), 'generate', '--backend', 'codex-oauth', '--model', 'gpt-image-1.5',
           '--size', 大小, '--quality', 'high', '--prompt', 提示, '--out', str(出), '--force']
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    print(名, 'ok' if r.returncode == 0 and 出.exists() else '失敗 ' + (r.stderr or r.stdout)[-400:], f'{time.time() - t:.0f} 秒', flush=True)
