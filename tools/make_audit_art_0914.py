# -*- coding: utf-8 -*-
"""總稽核 2026-09-14 逐張看圖抓到、使用者說「這些全都要改」的 16 張，重生工單。

| 批 | 檔案 | 問題 | 做法 |
|---|---|---|---|
| a | event_rescue_return_herb（開場） | 畫成村貓還魚，文字是布包 | 換場景句，明講「沒有魚」 |
| a | event_grindstone_r0 | 球球臉旁一塊亮綠色 | 補 STYLE 與「附近不准有綠色」 |
| a | event_noisy_kitchen（開場） | 蒸氣裡一塊亮綠色 | 蒸氣寫死乳白／暖金 |
| a | event_stuck_kitten（開場） | 文字有母貓、圖沒有 | 場景句補母貓（跟結果圖同一隻） |
| b | event_rescue_return_herb_r0 | 畫成還魚 | 照 a 的新開場圖當參考重畫（**要先進倉、重建參考圖**） |
| c | card_mabu、card_feifei_mabu | 「絕學·貓步」還是馬步蹲姿（牌 9/14 改名時圖沒跟著換） | 大物件與動作兩行都換成輕快的貓步 |
| c | card_feifei_fanzhua | 「反彈」畫成揮舞爪刃（她只用針） | 換成周身針刺、來拳被彈開 |
| d | 8 隻魔物的 `_attack` | 攻擊姿勢跟自己的待機判若兩物（帽子、配色、機身全變） | 附待機圖當參考、明講「同一隻、只有姿勢不同」 |

魔物那批的根因跟防禦姿勢那批（`build_block_queue.py`）一樣：沒附參考圖，每張長相都自己長。
這裡照它的做法：待機圖鋪白底存到 `tools/ref/monster_refs/<id>.png` 當參考，提示詞寫「跟參考圖同一隻」。

用法（一批跑完、進倉，再跑下一批；b 要等 a 的開場圖進倉並重建 `tools/ref/event_refs/rescue_return_herb.png`）：
  python tools/make_audit_art_0914.py a && python tools/codex_gen.py tools/codex_jobs/audit_art_0914_a.json
  python tools/add_event_art.py --strict event_grindstone_r0.png event_noisy_kitchen.png ; python tools/add_event_art.py event_rescue_return_herb.png event_stuck_kitten.png
  （重建 rescue_return_herb 與 stuck_kitten、noisy_kitchen 的參考圖）
  python tools/make_audit_art_0914.py b && …
  python tools/make_audit_art_0914.py c && … → add_card_art.py（feifei_mabu 用 --top，直立全身像）
  python tools/make_audit_art_0914.py d && … → add_sprite.py --group monsters monster_<id>_attack.png …
舊原稿一律先改名 `.previous-20260914c.png`（codex_gen 看到檔案在就跳過、還印成功）。
"""
import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from art_rules import NO_PANEL, STYLE  # noqa: E402
from make_event_result_jobs import ACTOR, HEAD, SAME_PLACE, TAIL as RESULT_TAIL  # noqa: E402

JOBS = ROOT / 'tools' / 'codex_jobs'
RAW = ROOT / 'tools' / 'codex_raw'
QIU_SHEET = 'tools/ref/球球設定表.png'
FF_SHEET = 'tools/ref/feifei_ref.png'
MONSTER_REFS = ROOT / 'tools' / 'ref' / 'monster_refs'

# 球球的長相護欄（跟 make_qiuqiu_fix_0914.py 同一段）：黑色圓點眼、不可以是黃色大眼
FACE = ("THE NINJA CAT'S LOOK (check this before finishing): he is a LIGHT GREY tabby with dark grey stripes, "
        "a WHITE muzzle and chin, pink inside his ears, and his eyes are simple round solid BLACK dots with one "
        "small white highlight each - exactly like the reference. Never give him yellow, golden, amber or green "
        "eyes, and never big realistic eyes with coloured irises. His head is big and round, his body short and "
        "chubby, in the navy ninja outfit with the navy headband and its two trailing tails.\n")
NO_GREEN = ("**Nothing green anywhere on or near the characters** - no green blob, leaf, glow, haze or spark: "
            "steam and dust are creamy white or warm grey, sparks are warm amber. (The picture sits on a green "
            "screen; any green on the subject gets punched out and leaves a hole or a floating green blotch.)\n")


def load(name: str) -> dict:
    return json.loads((JOBS / name).read_text(encoding='utf-8'))


def prompt_of(v) -> str:
    return v if isinstance(v, str) else v['prompt']


def swap(text: str, old: str, new: str, who: str) -> str:
    n = text.count(old)
    if n != 1:
        raise SystemExit(f'!! {who}：要換的原文出現 {n} 次（應該剛好 1 次），來源工單改過了，先看一眼：\n   「{old[:90]}…」')
    return text.replace(old, new, 1)


def with_style(text: str, who: str, out_line: str = 'Output 1024x768 PNG.') -> str:
    if STYLE in text:
        return text
    return swap(text, out_line, STYLE + out_line, who)


# ---------------------------------------------------------------------------
batch = sys.argv[1] if len(sys.argv) > 1 else ''
jobs: dict[str, dict[str, str]] = {}

if batch == 'a':
    ev2 = load('events2.json')
    redo = load('event_redo_all.json')
    rres = load('event_result_redo.json')
    # 村貓的回禮（開場）：文字「牠捧出一個布包，又指了指腰間的磨刀工具」
    fid = 'event_rescue_return_herb.png'
    t = swap(prompt_of(redo[fid]),
             "Scene: a thin grey village cat with a freshly healed hind leg leaps happily out of a dark stairwell and "
             "presses a lucky charm made of dried fish strung on a red cord into the ninja cat hero's paws",
             "Scene: a thin grey village cat, its hind leg healed (a small bandage mark, but standing steady on the "
             "floor), leans out of a dark stairwell doorway and holds out a small tied CLOTH BUNDLE - a square of brown "
             "cloth knotted at the top with something small and round inside - toward the ninja cat hero with both "
             "paws; a small whetstone and a couple of sharpening tools hang from the village cat's belt. **There is "
             "NO fish and NO fish charm anywhere in this picture** - the gift is a wrapped cloth bundle, nothing else", fid)
    t = swap(t, 'Tell the story in one readable picture', FACE + 'Tell the story in one readable picture', fid)
    jobs[fid] = {'prompt': with_style(t, fid), 'ref': QIU_SHEET}
    # 磨刀石結果 0：臉旁一塊亮綠色
    fid = 'event_grindstone_r0.png'
    t = prompt_of(rres[fid])
    t = swap(t, '\n\n**WHO DOES WHAT**', ' ' + NO_GREEN + '\n\n**WHO DOES WHAT**', fid)
    jobs[fid] = {'prompt': with_style(t, fid), 'ref': rres[fid]['ref']}
    # 很吵的廚房（開場）：蒸氣裡一塊亮綠色
    fid = 'event_noisy_kitchen.png'
    t = swap(prompt_of(ev2[fid]),
             'steam and sparkles rising;',
             'thick creamy-white steam and small warm-amber sparkles rising (never green, never greenish);', fid)
    t = swap(t, 'Tell the story in one readable picture', FACE + NO_GREEN + 'Tell the story in one readable picture', fid)
    jobs[fid] = {'prompt': with_style(t, fid), 'ref': QIU_SHEET}
    # 卡住的小貓（開場）：文字有母貓
    fid = 'event_stuck_kitten.png'
    t = swap(prompt_of(ev2[fid]),
             'Scene: a tiny kitten with its head stuck between two railings, all four legs kicking in the air; the grey '
             'ninja cat pulls at it from behind with both paws',
             'Scene: a tiny orange kitten with its head stuck between two wooden railing bars, all four legs kicking in '
             'the air; its MOTHER - a plump grown-up ORANGE-AND-WHITE cat, clearly bigger than the kitten, with a calm, '
             'gentle face - kneels right beside it, holding the kitten\'s shoulders with both front paws and speaking '
             'softly to it; the grey ninja cat crouches behind the kitten with both paws on its little body, ready to '
             'help ease it out. **All three must be in the picture: the kitten, its mother and the ninja cat** - a '
             'picture without the mother is wrong', fid)
    t = swap(t, 'Tell the story in one readable picture', FACE + 'Tell the story in one readable picture', fid)
    jobs[fid] = {'prompt': with_style(t, fid), 'ref': QIU_SHEET}

elif batch == 'b':
    # 村貓的回禮結果 0：照新開場圖畫。參考圖一定要比新開場圖晚做出來
    fid = 'event_rescue_return_herb_r0.png'
    ref = 'tools/ref/event_refs/rescue_return_herb.png'
    opening = ROOT / 'public' / 'assets' / 'bg' / 'event_rescue_return_herb.webp'
    if not (ROOT / ref).exists() or (ROOT / ref).stat().st_mtime < opening.stat().st_mtime:
        raise SystemExit(f'{ref} 還是舊的：先把新的開場圖進倉、重建這張參考圖再生')
    text = ('村貓解開布包，把珍藏的秘寶交給球球，還仔細包好了邊角。球球：「你有好好活著，就是最好的回禮喵。」'
            ' Show this as: the thin grey village cat stands on the floor in front of the stairwell doorway, the cloth '
            'bundle now UNWRAPPED in one paw (the empty square of brown cloth hanging from it), and holds out with the '
            'other paw the small treasure that was inside - a round polished amulet on a cord - toward the ninja cat, '
            'who receives it with both paws, eyes wide and touched. **NO fish and NO fish charm anywhere.**')
    t = HEAD.format(same=SAME_PLACE) + text + ACTOR + RESULT_TAIL.format(name=fid)
    t = swap(t, 'Tell the story in one readable picture', FACE + 'Tell the story in one readable picture', fid)
    jobs[fid] = {'prompt': with_style(t, fid), 'ref': ref}

elif batch == 'c':
    rest = load('recolour_rest.json')
    ffc = load('feifei_shared_cards.json')
    BIG_OLD = ('1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in CARAMEL BROWN: a caramel-coloured '
               'stone slab cracking under the weight pressed into it')
    BIG_NEW = ('1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in CARAMEL BROWN: a trail of glowing '
               'caramel-coloured cat PAW PRINTS sweeping across the picture in a light, bouncing curve - the nearest '
               'prints big and bright, the farthest small and fading - with a few short solid motion streaks between '
               'them: the marks of quick, silent, springy steps. **No stone slab, nothing cracking, nothing being '
               'pressed down**')
    ACT_OLD = '   What the cat is doing: in a deep wide horse stance on the slab, thighs low, fists at its hips, absolutely rooted'
    ACT_NEW = ('   What the cat is doing: caught mid-step at the head of that trail, up on the toes of one hind paw with '
               'the other hind paw lifted, body light and leaning forward, tail streaming out behind, a small confident '
               'smile - a quick, weightless cat\'s step. NOT crouching, NOT in a horse stance, NOT pressing down on '
               'anything')
    fid = 'card_mabu.png'
    t = swap(swap(prompt_of(rest[fid]), BIG_OLD, BIG_NEW, fid), ACT_OLD, ACT_NEW, fid)
    if NO_PANEL not in t:
        t = swap(t, 'Output 1024x820 PNG.', NO_PANEL + 'Output 1024x820 PNG.', fid)
    jobs[fid] = {'prompt': t, 'ref': QIU_SHEET}
    fid = 'card_feifei_mabu.png'
    t = swap(swap(prompt_of(ffc[fid]), BIG_OLD, BIG_NEW, fid), ACT_OLD, ACT_NEW.replace("cat's step", "kitten's step"), fid)
    if NO_PANEL not in t:
        t = swap(t, 'Output 1024x820 PNG.', NO_PANEL + 'Output 1024x820 PNG.', fid)
    jobs[fid] = {'prompt': t, 'ref': FF_SHEET}
    fid = 'card_feifei_fanzhua.png'
    t = swap(prompt_of(ffc[fid]),
             '1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in SILVER GREY: a fan of five gleaming '
             'silver claws flipped outward, splayed wide',
             '1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in SILVER GREY: a bristling RING OF LONG '
             'STEEL NEEDLES standing straight out from her body in every direction like a hedgehog\'s spines - each one '
             'a slim silver shaft with a sharp point and a tiny violet tip - and at the front of the ring one incoming '
             'blow (a big blunt warm-grey paw-shaped impact) bouncing back off the needle points with a bright SOLID '
             'amber spark: whatever hits her gets pricked and thrown back. **No claws, no claw blades, no metal talons, '
             'no knives anywhere in the picture**', fid)
    t = swap(t,
             '   What the cat is doing: flipping its paw over to reveal the claws, looking sideways at them with a small satisfied smirk',
             '   What the cat is doing: standing braced in the middle of that ring of needles, feet planted, both arms '
             'folded across her chest, chin down, calm and a little smug - she is not attacking, not swinging anything '
             'and not holding anything; the needles do the work', fid)
    if NO_PANEL not in t:
        t = swap(t, 'Output 1024x820 PNG.', NO_PANEL + 'Output 1024x820 PNG.', fid)
    jobs[fid] = {'prompt': t, 'ref': FF_SHEET}

elif batch in ('d', 'e'):
    MONSTER_REFS.mkdir(parents=True, exist_ok=True)
    if batch == 'd':
        ATTACKS = {
            'catgrass_bug': 'lunging forward with its jaws wide open to BITE, body stretched toward the left, its leaf-blades raised',
            'hibernating_bear': 'rearing up and swinging one huge paw down in a heavy SLAP, mouth open in a roar, its hat and scarf flying back',
            'rat': 'springing forward to GNAW, front teeth bared, little paws thrust out, its paper hat still on its head',
            'roomba_king': 'charging forward with its spinning brushes whirling into a blur, crown tilted, eyes fierce',
            'stone_lion': 'rearing back on its hind legs and slamming one heavy stone forepaw down toward the left, mouth open in a roar, a few stone chips flying',
            'tadpole': 'lunging forward to BITE with its mouth open and its tail whipping up behind it, its little hat still on',
            'vacuum': 'ramming forward nozzle-first with a burst of motion lines, its hose swung up like a blade',
            'puppeteer': 'thrusting a long needle forward with one hand while the other hand jerks the puppet strings taut, robe swirling',
        }
        HEIGHT = 'Fill the frame vertically.\n'
    else:
        # e（2026-09-14 深夜，使用者：「有些怪物攻擊時的動作變得比待機小」）：d 批這三張畫成**橫向撲出**
        #（老鼠伏低刺矛、貓草蟲趴平張口、傀儡師針伸長），主體比寬還高不了，add_sprite 塞進待機的畫布
        # 只能整隻縮小——遊戲裡一出招就矮一截（老鼠 84%、傀儡師 86%、貓草蟲 88%）。
        # 修法在**姿勢**：出招改成直立、後仰、抬高，提示詞明講「至少跟參考圖一樣高」。
        # 其他五隻（熊、掃地機、石獅、蝌蚪、吸塵器）都在 97%～101%，不動。
        ATTACKS = {
            'rat': 'rearing up TALL on its hind legs to its full height, body upright and stretched upward, both little '
                   'paws thrusting its wooden spear forward at the enemy, front teeth bared, its paper hat still on its '
                   'head; the figure is clearly taller than it is wide',
            'catgrass_bug': 'rearing the front third of its grassy body UP high, jaws wide open to BITE, the rest of its '
                            'body still stretched along the ground exactly as long as in the reference; it must stand as '
                            'tall as the reference or taller, never flatter',
            'puppeteer': 'standing TALL and upright at full height, one hand raised high above its head yanking the puppet '
                         'strings taut, the other hand thrusting a long needle forward at chest height, robe swirling; the '
                         'wooden puppet dangles beside it; the figure is clearly taller than it is wide',
        }
        HEIGHT = ('Fill the frame from the very top to the very bottom: the creature must be AT LEAST AS TALL as in the '
                  'reference image, with its head at the same height or higher and its body the same size. Show the attack '
                  'with an upright, rearing or stepping pose - NOT by stretching the body sideways, leaning far forward or '
                  'crouching lower. A wide, flat pose gets shrunk to fit in the game and the monster looks smaller the '
                  'moment it attacks; that is wrong.\n')
    for mid, desc in ATTACKS.items():
        idle = ROOT / 'public' / 'assets' / 'monsters' / f'{mid}_idle.webp'
        if not idle.exists():
            raise SystemExit(f'{mid} 沒有待機圖 {idle}')
        ref = MONSTER_REFS / f'{mid}.png'
        im = Image.open(idle).convert('RGBA')
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
        bg.paste(im, (0, 0), im)
        bg.convert('RGB').save(ref)
        fid = f'monster_{mid}_attack.png'
        jobs[fid] = {'prompt': (
            'A single monster character for a cute cartoon roguelike card game, full body, facing LEFT.\n\n'
            'The creature: EXACTLY the monster shown in the reference image - the same species, the same face, the same '
            'colours, the same shapes, the same hat, clothing, markings and props. This is the same creature one moment '
            'later, NOT a different creature. Before finishing, compare with the reference: if the hat, the outfit, the '
            'body colour or the eyes changed, it is wrong.\n\n'
            f'Pose: ATTACKING - {desc}. The attack must read at a glance (strong forward motion, a few short solid '
            'motion lines), but keep the design identical to the reference.\n\n'
            'It stands on the ground with its feet at the very bottom edge of the picture - do not draw it floating. '
            'Full body, facing LEFT. ' + HEIGHT +
            'Keep the same overall orientation and proportions as the reference: if the creature lies down, sprawls, or '
            'is wider than it is tall in the reference, keep it exactly that way - do NOT stand it up and do NOT make it '
            'shorter. Only ONE creature in the picture.\n'
            'Draw everything SOLID and OPAQUE - flat filled colour with soft shading. Nothing transparent or see-through.\n'
            'Nothing else in the picture: no ground line, no shadow, no scenery, no text, no letters, no watermark, no border.\n'
            'Style: thick black outlines, flat colors with subtle soft gradients, cute cartoon look, not photorealistic.\n'
            'Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green on the creature.\n'
            f'Output 1024x1024 PNG. Save the image as {fid} in the current directory and report the path.'),
            'ref': ref.relative_to(ROOT).as_posix()}
else:
    raise SystemExit('要指定批次：a（事件開場與結果）、b（村貓回禮結果，等 a 進倉）、c（牌面）、d（魔物攻擊）、e（d 批畫矮的三張重生）')

# ======================= 自檢：一律 SystemExit =======================
for fid, job in jobs.items():
    if not (ROOT / job['ref']).exists():
        raise SystemExit(f'{fid} 的參考圖不在：{job["ref"]}')
    if (RAW / fid).exists():
        raise SystemExit(f'{fid} 的舊原稿還在：先改名留底（.previous-20260914c.png），不然 codex_gen 會直接跳過')
    if f'Save the image as {fid}' not in job['prompt']:
        raise SystemExit(f'{fid}：存檔指令的檔名跟工單的鍵對不上')
    if fid.startswith('event_') and STYLE not in job['prompt']:
        raise SystemExit(f'{fid}：事件圖少了 STYLE')
    if fid.startswith('card_') and NO_PANEL not in job['prompt']:
        raise SystemExit(f'{fid}：牌面少了 NO_PANEL')
out = JOBS / f'audit_art_0914_{batch}.json'
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
sys.stdout.write(f'{len(jobs)} 張 → {out.name}\n')
