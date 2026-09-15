# -*- coding: utf-8 -*-
"""2026-09-15 使用者實機玩到、指名要改的 11 張重生，外加「鏡中菲菲」立繪五張新做。

寫法照 `make_audit_art_0914.py`：舊工單 `load()` 進來、`swap()` 換掉出問題的那幾句、
角色一律附參考圖，最後寫成 `tools/codex_jobs/fix_0915_<批>.json`。

| 批 | 檔案 | 使用者說的問題 | 做法 |
|---|---|---|---|
| a1 | event_broken_shrine、event_feifei_broken_shrine | 「貓神像下半身是歪的、也沒睜開眼」 | 場景句改成「整尊一體、上下對齊、端正地倒著、眼睛睜開」 |
| a1 | event_old_master_ghost、event_feifei_old_master_ghost | 「事件裡師父有鬍子，最終戰沒有」 | 硬規則「沒有鬍子」＋附有師父的合參表當參考 |
| a1 | event_feifei_daxia_teach、_r0 | 「師傅的絕學書本圖有點怪」 | 書改成她雙手捧著的線裝秘笈、頁面朝她、透視正常 |
| a1 | feifei_still_teach | 「後面球球的手畫壞了」 | 躺著的球球四肢寫死，加一條全圖數四肢的檢查 |
| a2 | 上面四個事件的 _r0／_r1（球球版與菲菲版共 8 張） | 續集要跟著新開場圖 | **等 a1 進倉、重建參考圖之後**才生 |
| b | card_feifei_meikandao | 掌心向外像眼罩 | 掌心朝內貼著臉、看到的是手背 |
| b | card_feifei_touchi | 兩隻手都在飯糰前面 | 一前一後，後面那隻被飯糰完全擋住 |
| b | card_feifei_shuaiguo | 頭身角度不對、鍋子與鍋蓋不對 | 頭身同向轉腰甩出；一個有柄圓鐵鍋＋同直徑圓蓋 |
| b | card_feifei_maoqiu | 毛球太大顆 | 毛球縮到她的頭的三分之一、佔畫面 15% 以下，貓放大 |
| c | monster_owl_sentry_idle | 待機臉朝向怪怪的 | 拿掉「頭幾乎轉到背後」，改朝左；附自己的攻擊圖當參考 |
| d | relic_coin_sword | 「不像銅錢組成的，像一堆眼睛」 | 六枚大方孔銅錢串成劍身、紅繩穿孔 |
| d | node_event | 「用一個毛線球，目前的有點怪」 | 乾淨毛線球，不要問號、不要臉 |
| e1 | monster_shadow_feifei_idle | 新做 | 照 shadow_cat 的工單，主角換菲菲 |
| e2 | monster_shadow_feifei_{attack,hurt,block,down} | 新做 | 參考圖換成 e1 進倉後重建的 `monster_refs/shadow_feifei.png` |
| f | 塔主池九件新秘寶的圖示 | 新做 | 照 `relic_icons_0902.json` 的範本，只換「畫什麼」那一行 |

用法（一批跑完、進倉、拼聯絡表，再跑下一批——`codex_gen.py` 的坑 1，多開沒有好處）：

  python tools/make_fix_0915_jobs.py a1 && python tools/codex_gen.py tools/codex_jobs/fix_0915_a1.json
  python tools/add_event_art.py event_broken_shrine.png event_feifei_broken_shrine.png \
      event_old_master_ghost.png event_feifei_old_master_ghost.png event_feifei_daxia_teach.png \
      event_feifei_daxia_teach_r0.png
  python tools/add_screen_bg.py feifei_still_teach.png
  python tools/make_fix_0915_jobs.py refs        # 砍掉舊參考圖、照新開場圖重建（a2 的前提）
  python tools/make_fix_0915_jobs.py a2 && python tools/codex_gen.py tools/codex_jobs/fix_0915_a2.json
  python tools/add_event_art.py event_broken_shrine_r0.png ...（八張）
  python tools/make_fix_0915_jobs.py b  && …  → python tools/add_card_art.py card_feifei_*.png
  python tools/make_fix_0915_jobs.py c  && …  → python tools/add_sprite.py --group monsters monster_owl_sentry_idle.png
  python tools/make_fix_0915_jobs.py d  && …  → python tools/add_icons.py --size 96 relic_coin_sword.png node_event.png
  python tools/make_fix_0915_jobs.py e1 && …
      cp public/assets/monsters/shadow_cat_idle.webp public/assets/monsters/shadow_feifei_idle.webp   # 種一張畫布
      python tools/add_sprite.py --group monsters monster_shadow_feifei_idle.png
  python tools/make_fix_0915_jobs.py e2 && …  → python tools/add_sprite.py --group monsters monster_shadow_feifei_{attack,hurt,block,down}.png
  python tools/make_fix_0915_jobs.py f  && …  → python tools/add_icons.py --size 96 relic_*.png

**舊原稿一律先改名成 `.previous-20260915.png`**（`codex_gen.py` 看到檔案在就跳過、還印成功，
坑 7 與 art_rules 第九個雷）。這支的自檢會擋著，不會讓你空轉一整批。

`add_sprite.py --group monsters` **不看 `--baseline`**，它固定拿 `<id>_idle.webp` 當畫布基準，
所以鏡中菲菲第一張要先把 `shadow_cat_idle.webp` 複製成 `shadow_feifei_idle.webp` 當種子
（大小就跟 shadow_cat 一致，是使用者指定的），進倉時會被真正的待機圖蓋掉。
"""
import json
import pathlib
import shutil
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from art_rules import FEIFEI_HAIR, FEIFEI_NOT_HUMAN, FEIFEI_PROPORTION, NO_PANEL, STYLE, feifei_look  # noqa: E402
from build_block_queue import BLOCK_POSE, BLOCK_TAIL  # noqa: E402
from make_event_result_jobs import ACTOR, HEAD, SAME_PLACE, TAIL as RESULT_TAIL  # noqa: E402
from make_feifei_result_art_jobs import ACTOR as FF_ACTOR, HEAD as FF_HEAD  # noqa: E402
from make_feifei_result_art_jobs import SAME_PLACE as FF_SAME, TAIL as FF_TAIL  # noqa: E402

JOBS = ROOT / 'tools' / 'codex_jobs'
RAW = ROOT / 'tools' / 'codex_raw'
PUB = ROOT / 'public'
STAMP = 'previous-20260915'

QIU_SHEET = 'tools/ref/球球設定表.png'
FF_SHEET = 'tools/ref/feifei_ref.png'
FF_STORY = 'tools/ref/feifei_story_ref.png'       # 球球＋師父＋墮化師父＋菲菲
QIU_STORY = 'tools/ref/劇情合參表.png'             # 球球表情表＋師父＋墮化師父
EVENT_REFS = ROOT / 'tools' / 'ref' / 'event_refs'
FF_EVENT_REFS = ROOT / 'tools' / 'ref' / 'event_refs_feifei'
MONSTER_REFS = ROOT / 'tools' / 'ref' / 'monster_refs'

# 球球的長相護欄（跟 make_audit_art_0914.py／make_qiuqiu_fix_0914.py 同一段）
FACE = ("THE NINJA CAT'S LOOK (check this before finishing): he is a LIGHT GREY tabby with dark grey stripes, "
        "a WHITE muzzle and chin, pink inside his ears, and his eyes are simple round solid BLACK dots with one "
        "small white highlight each - exactly like the reference. Never give him yellow, golden, amber or green "
        "eyes, and never big realistic eyes with coloured irises. His head is big and round, his body short and "
        "chubby, in the navy ninja outfit with the navy headband and its two trailing tails.\n")

# ---------------------------------------------------------------------------
# 使用者這次點名的幾段硬規則，寫在同一個地方，球球版與菲菲版共用
# ---------------------------------------------------------------------------
STATUE = (
    "**THE STATUE - read this part twice, it is what was wrong last time.** It is ONE SINGLE carved stone cat, "
    "complete and in one piece: head, chest, front paws, seated haunches and curled tail all belong to the same "
    "figure and all line up along ONE straight axis - exactly as if the statue had been standing upright on its "
    "base and somebody simply tipped the whole thing over. It has toppled neatly onto its side and leans against "
    "the fallen shrine, still in one piece and still tidy. **ITS EYES ARE OPEN** - two big round carved eyes "
    "looking calmly out of the stone face; never shut, never two closed curved lines, never blank. The damage is "
    "surface damage only: one thin crack line across its middle, another across one ear, and two or three small "
    "chipped spots on the stone. **Do NOT draw it as two separate broken chunks lying apart from each other, do "
    "NOT slide or rotate the upper body out of line with the lower body, and do NOT put a spare head, a loose "
    "limb or any extra piece of statue anywhere in the picture.** ")

NO_BEARD = (
    "**THE MASTER HAS NO BEARD, NO MOUSTACHE, NO WHISKERS-TUFT ON THE CHIN - a clean grey tabby face exactly "
    "like the reference.** His muzzle is short and smooth and his chin is bare fur; nothing hangs below his "
    "mouth. A long white beard is the single most common mistake on this character and it is always wrong. ")
FF_NO_BEARD = (
    "**THE GHOST MASTER HAS NO BEARD, NO MOUSTACHE AND NO TUFT OF HAIR ON HIS CHIN.** His muzzle is short and "
    "smooth and his chin is bare fur, exactly as he is drawn in the attached picture; nothing hangs below his "
    "mouth. A long white beard on him is always wrong. ")

BOOK = (
    "**THE BOOK.** It is a thread-bound Chinese manual: soft aged-cream paper, a worn indigo cloth cover and a "
    "row of stitching down the spine. **She holds it OPEN in BOTH front paws, up in front of her chest** - one "
    "paw under each half, the spine running vertically between her paws, the open pages tilted back toward her "
    "face so she is looking down into them. Ordinary, simple perspective: we see the book slightly from the side "
    "and slightly from above, the two pages forming a shallow V, the near page a little foreshortened. **The "
    "pages face HER, not us**, the way a real book faces the person holding it - from our camera we see the "
    "backs and the top edges of the pages plus a narrow slice of the printed side of the far page, and the "
    "content on that slice stands the right way up FOR HER. On that slice: one small line drawing of a cat in a "
    "martial-arts stance with two dotted arrows, and two short columns of brush strokes beside it (abstract "
    "squiggles, never real letters). The book is about as tall as her head and no bigger - a book she can hold, "
    "**not** a lectern, not a giant tome, not a slab lying on the ground. **Do NOT stand the book up on the "
    "floor, do NOT lay it flat on a step with the cat behind it, do NOT draw it floating by itself, and do NOT "
    "turn the page content upright toward the camera.** ")


# ---------------------------------------------------------------------------
def load(name: str) -> dict:
    return json.loads((JOBS / name).read_text(encoding='utf-8'))


def prompt_of(v) -> str:
    return v if isinstance(v, str) else v['prompt']


def swap(text: str, old: str, new: str, who: str) -> str:
    n = text.count(old)
    if n != 1:
        raise SystemExit(f'!! {who}：要換的原文出現 {n} 次（應該剛好 1 次），來源工單改過了，先看一眼：\n   「{old[:110]}…」')
    return text.replace(old, new, 1)


def with_style(text: str, who: str, out_line: str = 'Output 1024x768 PNG.') -> str:
    if STYLE in text:
        return text
    return swap(text, out_line, STYLE + out_line, who)


def upgrade_look(text: str, who: str) -> str:
    """把舊工單裡的菲菲外觀補成現行的 `feifei_look()`。

    `feifei_events.json` 那批是 `FEIFEI_NOT_HUMAN` 還沒加上「眼睛一定是藍的」那段之前寫的，
    比例與頭髮兩段則已經是現行版。**只補差的那一段**，不要整塊重貼——
    整塊重貼會把工單裡針對該張調過的字也蓋掉。
    """
    if FEIFEI_PROPORTION not in text or FEIFEI_HAIR not in text:
        raise SystemExit(f'!! {who}：來源工單的菲菲外觀不是現行版（比例或頭髮那段對不上），先看一眼再決定怎麼補')
    if FEIFEI_NOT_HUMAN in text:
        return text
    head_para = FEIFEI_NOT_HUMAN.split('**HER EYES ARE BLUE')[0]
    return swap(text, head_para, FEIFEI_NOT_HUMAN, who)


def white_ref(src: pathlib.Path, dst: pathlib.Path) -> str:
    """把去背過的 webp 鋪白底存成 PNG 當參考圖（跟 0914 魔物那批同一個做法）。"""
    dst.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.paste(im, (0, 0), im)
    bg.convert('RGB').save(dst)
    return dst.relative_to(ROOT).as_posix()


def rebuild_event_ref(eid: str, feifei: bool) -> str:
    """事件參考圖照**現行的**開場圖重建。續集的長相全靠它，舊的一定要砍掉重來。"""
    manifest = json.loads((PUB / 'assets' / 'manifest.json').read_text(encoding='utf-8'))
    key = f'bg/event_feifei_{eid}' if feifei else f'bg/event_{eid}'
    path = manifest['bg'].get(key)
    if not path:
        raise SystemExit(f'!! manifest 裡沒有 {key}，開場圖還沒進倉')
    out = (FF_EVENT_REFS if feifei else EVENT_REFS) / f'{eid}.png'
    rel = white_ref(PUB / path, out)
    scene_m = (PUB / path).stat().st_mtime
    if out.stat().st_mtime < scene_m:
        raise SystemExit(f'!! {rel} 還是比場景圖舊')
    return rel


def need_fresh_ref(ref: str, eid: str, feifei: bool) -> str:
    """續集開工單前先確認參考圖比開場圖新（抄 `make_feifei_result_art_jobs.py` 的擋法）。"""
    manifest = json.loads((PUB / 'assets' / 'manifest.json').read_text(encoding='utf-8'))
    key = f'bg/event_feifei_{eid}' if feifei else f'bg/event_{eid}'
    scene = manifest['bg'].get(key)
    p = ROOT / ref
    if not p.exists():
        raise SystemExit(f'!! 參考圖不在：{ref}　先跑 `python tools/make_fix_0915_jobs.py refs`')
    if not scene:
        raise SystemExit(f'!! manifest 裡沒有 {key}')
    if p.stat().st_mtime < (PUB / scene).stat().st_mtime:
        raise SystemExit(f'!! {ref} 比開場圖舊（續集會照著舊圖畫）：先跑 `python tools/make_fix_0915_jobs.py refs`')
    return ref


def qiu_result(fid: str, eid: str, text: str) -> dict:
    """球球的事件結果圖：照 `make_event_result_jobs.py` 同一套組出來。"""
    ref = need_fresh_ref(f'tools/ref/event_refs/{eid}.png', eid, feifei=False)
    t = HEAD.format(same=SAME_PLACE) + text + ACTOR + RESULT_TAIL.format(name=fid)
    t = swap(t, 'Tell the story in one readable picture', FACE + 'Tell the story in one readable picture', fid)
    return {'prompt': with_style(t, fid), 'ref': ref}


def ff_result(fid: str, eid: str, text: str) -> dict:
    """菲菲的事件結果圖：照 `make_feifei_result_art_jobs.py` 同一套組出來。"""
    ref = need_fresh_ref(f'tools/ref/event_refs_feifei/{eid}.png', eid, feifei=True)
    t = FF_HEAD.format(same=FF_SAME) + text + FF_ACTOR + FF_TAIL.format(name=fid)
    return {'prompt': with_style(t, fid), 'ref': ref}


# ---------------------------------------------------------------------------
batch = sys.argv[1] if len(sys.argv) > 1 else ''
jobs: dict[str, dict[str, str]] = {}

if batch == 'refs':
    # a1 的開場圖進倉之後跑這支：砍掉舊參考圖、照新圖重建。a2 才生得出對得上的續集。
    out = []
    for eid in ('broken_shrine', 'old_master_ghost'):
        for ff in (False, True):
            d = (FF_EVENT_REFS if ff else EVENT_REFS) / f'{eid}.png'
            if d.exists():
                d.unlink()
            out.append(rebuild_event_ref(eid, ff))
    sys.stdout.write('重建參考圖：\n  ' + '\n  '.join(out) + '\n')
    raise SystemExit(0)

elif batch == 'a1':
    ev2 = load('events2.json')
    ffev = load('feifei_events.json')
    ffb = load('feifei_fix_0914b.json')

    # --- 1. 破損的神龕（球球版）：神像整尊一體、端正地倒著、眼睛睜開 -------------
    fid = 'event_broken_shrine.png'
    t = swap(prompt_of(ev2[fid]),
             'Scene: a small toppled shrine against a wall with a cat statue broken in two halves, a few dried '
             'fish laid out as offerings; the grey ninja cat crouches beside it, hesitating',
             'Scene: a small wooden shrine toppled over against a wall, one WHOLE carved stone cat statue lying '
             'tipped on its side in front of it, and a few dried fish laid out as offerings; the grey ninja cat '
             'crouches beside the statue, one paw half raised, hesitating.\n' + STATUE, fid)
    t = swap(t, 'Tell the story in one readable picture', FACE + 'Tell the story in one readable picture', fid)
    jobs[fid] = {'prompt': with_style(t, fid), 'ref': QIU_SHEET}

    # --- 2. 破損的神龕（菲菲版） -------------------------------------------------
    fid = 'event_feifei_broken_shrine.png'
    t = swap(prompt_of(ffev[fid]),
             'Scene: a small toppled shrine against a wall with a cat statue broken in two halves, a few dried '
             'fish laid out as offerings; the Siamese cat girl crouches beside it, hesitating',
             'Scene: a small wooden shrine toppled over against a wall, one WHOLE carved stone cat statue lying '
             'tipped on its side in front of it, and a few dried fish laid out as offerings; the Siamese cat girl '
             'crouches beside the statue, one paw half raised, hesitating.\n' + STATUE, fid)
    jobs[fid] = {'prompt': with_style(upgrade_look(t, fid), fid), 'ref': FF_SHEET}

    # --- 3. 師父的殘影（球球版）：一律沒有鬍子，附有師父的合參表 -----------------
    fid = 'event_old_master_ghost.png'
    t = swap(prompt_of(ev2[fid]),
             'Scene: a translucent-looking but SOLIDLY drawn pale blue figure of an old cat in a straw hat '
             'sitting on a stair, half turned; the grey ninja cat stands below, looking up at it',
             'Scene: the GHOST OF THE OLD MASTER sits on a stone stair, half turned, one paw resting on his '
             'knee, looking down; the grey ninja cat stands below, looking up at him. The ghost is the MASTER '
             'himself - the big grey tabby cat in the wide conical straw hat, the cream robe and the black belt, '
             'exactly as he is drawn on the attached reference sheet - only recoloured entirely in pale ghostly '
             'blue, and drawn SOLID and opaque (never see-through), with a few soft pale wisps trailing off his '
             'edges.\n' + NO_BEARD +
             '**WHAT IS ON THE REFERENCE SHEET**: (1) on the left, a grid of small expressions of the chibi GREY '
             'TABBY NINJA in the navy headband and navy outfit - that is the hero standing below; (2) in the '
             'middle, the MASTER in his straw hat, cream robe and black belt - that is who the ghost is; (3) on '
             'the right, the same master CORRUPTED, bristling and spiral-eyed - **he does NOT appear in this '
             'picture at all**: no bristling fur, no spiral eyes, no smoke, no torn robe. Exactly TWO characters '
             'in the picture.', fid)
    t = swap(t, 'Tell the story in one readable picture', FACE + 'Tell the story in one readable picture', fid)
    jobs[fid] = {'prompt': with_style(t, fid), 'ref': QIU_STORY}

    # --- 4. 師父的殘影（菲菲版） -------------------------------------------------
    fid = 'event_feifei_old_master_ghost.png'
    t = swap(prompt_of(ffev[fid]),
             'Scene: a translucent-looking but SOLIDLY drawn pale blue figure of an old cat in a straw hat '
             'sitting on a stair, half turned; the Siamese cat girl stands below, looking up at it',
             'Scene: the GHOST OF THE OLD MASTER sits on a stone stair, half turned, one paw resting on his '
             'knee, looking down; the Siamese cat girl stands below, looking up at him. The ghost is the MASTER '
             'himself - drawn exactly like character (2) on the attached reference sheet, the big grey tabby cat '
             'in the wide conical straw hat, the cream robe and the black belt - only recoloured entirely in pale '
             'ghostly blue, and drawn SOLID and opaque (never see-through), with a few soft pale wisps trailing '
             'off his edges.\n'
             '**THE MASTER HAS NO BEARD, NO MOUSTACHE AND NO TUFT OF HAIR ON HIS CHIN**: his muzzle is short and '
             'smooth and his chin is bare fur, exactly as the reference sheet draws him. A long white beard on '
             'him is always wrong.\n'
             '**WHAT IS ON THE REFERENCE SHEET**: (1) a small chibi grey tabby ninja in a navy headband - **he '
             'does NOT appear in this picture**; (2) the MASTER in his straw hat, cream robe and black belt - '
             'that is who the ghost is; (3) the same master CORRUPTED, bristling and spiral-eyed - **he does NOT '
             'appear either**; (4) the SIAMESE CAT GIRL - she is the hero of this picture. Exactly TWO characters '
             'in the picture: the pale blue ghost master and the Siamese cat girl.', fid)
    jobs[fid] = {'prompt': with_style(upgrade_look(t, fid), fid), 'ref': FF_STORY}

    # --- 5／6. 師父的絕學（開場與結果）：書改成她雙手捧著的線裝秘笈 --------------
    # 舊工單 `feifei_daxia_orient.json` 的外觀段是比較舊的版本，直接拿**她自己另一個事件**
    # 的工單當模板（那份的外觀段就是現行的 `feifei_look()`），只換場景句與存檔檔名。
    base = prompt_of(ffev['event_feifei_old_master_ghost.png'])
    OLD_SCENE = ('Scene: a translucent-looking but SOLIDLY drawn pale blue figure of an old cat in a straw hat '
                 'sitting on a stair, half turned; the Siamese cat girl stands below, looking up at it')
    for fid, doing in (
        ('event_feifei_daxia_teach.png',
         'The Siamese cat girl has just found the manual on a stone step of the tower and has picked it up: ears '
         'up, blue eyes wide and curious, leaning her face in over the open pages, the tip of her tail curled '
         'with interest. She is the only character in the picture.'),
        ('event_feifei_daxia_teach_r0.png',
         'The Siamese cat girl is studying the manual hard: brow furrowed, face leaning closer to the open pages, '
         'one ear flicked back, one hind paw shifting into the first half of a stance as she tries to copy what '
         'she reads. A couple of small warm-amber motion arcs show her trying the move. She is the only character '
         'in the picture.'),
    ):
        t = swap(base, OLD_SCENE, 'Scene: ' + doing + '\n' + BOOK, fid)
        t = swap(t, 'Save the image as event_feifei_old_master_ghost.png', f'Save the image as {fid}', fid)
        jobs[fid] = {'prompt': with_style(upgrade_look(t, fid), fid), 'ref': FF_SHEET}

    # --- 7. 教導那張劇情圖：後面躺著的球球四肢畫壞了 ----------------------------
    fid = 'feifei_still_teach.png'
    t = swap(prompt_of(ffb[fid]),
             'Far behind them and small, the striped brother - character (1) - sprawls bored on his back, not '
             'listening.',
             'Far behind them and small, the striped brother - character (1) - lies on his BACK on the boards, '
             'bored and not listening: head turned to one side, and ALL FOUR of his paws relaxed and clearly '
             'drawn as simple round cat paws - his two front paws resting loosely on his chest, his two hind '
             'legs flopped over to one side, his one striped tail lying beside him. **Count him before you '
             'finish: exactly two front legs, two hind legs, one tail and nothing else** - no extra paw, no '
             'spare arm, no limb growing out of his belly, no doubled or twisted leg, no second tail.', fid)
    t = swap(t, '\nFull scene illustration with background',
             '\n**LIMB CHECK BEFORE YOU FINISH**: every cat in this picture has exactly four legs, four paws and '
             'one tail. Point at each limb of each of the three characters and count them. An extra or missing '
             'paw anywhere - even on a small background figure - makes the picture wrong.\n'
             '\nFull scene illustration with background', fid)
    jobs[fid] = {'prompt': t, 'ref': 'tools/ref/feifei_story_ref.png'}

elif batch in ('a2', 'a3'):
    # 續集：一定要等 a1 的開場圖進倉、`refs` 重建過參考圖之後才生（長相全靠參考圖）
    #
    # a3 是 a2 的重生：`event_feifei_old_master_ghost_r1` 第一次把飄走的招式卷軸畫成
    # **綠色的光暈**——綠幕上的綠光去背後只剩一圈黃綠，跟球球版的琥珀色對不上
    #（`art_rules` 第三個雷：沒指定顏色時模型會自己挑到綠色）。下面那句 AMBER 就是補指定。
    SAME_STATUE = (
        ' **THE STATUE IS THE SAME STATUE AS IN THE ATTACHED PICTURE**: the same carved face, the same OPEN '
        'eyes, the same crack lines and the same chipped spots, and it is still ONE single statue in one piece. '
        'Do not redesign it, do not close its eyes, and do not break it into separate chunks.')
    jobs['event_broken_shrine_r0.png'] = qiu_result(
        'event_broken_shrine_r0.png', 'broken_shrine',
        '球球扶起神龕，把兩截神像小心拼好。神像亮了一下，一股暖流沿著爪尖傳進胸口，讓牠的氣息更穩。'
        '球球：「坐好了，下次可別再摔下來喵。」'
        ' Show this as: the ninja cat has set the little shrine back upright against the wall and is easing the '
        'cat statue back ONTO ITS BASE with both paws, steadying it - the statue now stands UPRIGHT and straight '
        'instead of lying tipped over. A soft warm-amber glow rises off the stone.' + SAME_STATUE)
    jobs['event_broken_shrine_r1.png'] = qiu_result(
        'event_broken_shrine_r1.png', 'broken_shrine',
        '球球捲起供品就走，神像的微光卻化成一縷冷氣鑽進牠胸口，攪得氣息忽快忽慢。'
        '球球：「供品還附贈這個，怎麼不先寫清楚喵。」'
        ' Show this as: the ninja cat is walking away with the dried fish gathered up in both paws, glancing back '
        'over his shoulder with an uneasy face, while a thin pale-blue wisp curls off the statue and into his '
        'chest. The statue stays exactly where it was, still lying tipped on its side.' + SAME_STATUE)
    jobs['event_old_master_ghost_r0.png'] = qiu_result(
        'event_old_master_ghost_r0.png', 'old_master_ghost',
        '球球跟著指點放慢吐納，重新練穩一招，原本急促的氣息也沉了下來。'
        '球球：「連嫌我太急的口氣都一樣，真讓貓想頂嘴喵。」' + ' ' + NO_BEARD.replace(
            'exactly like the reference', 'exactly like the master in the attached picture'))
    jobs['event_old_master_ghost_r1.png'] = qiu_result(
        'event_old_master_ghost_r1.png', 'old_master_ghost',
        '球球抬爪打住，把那套動作從頭試了一遍，索性把兩招硬留著的都放下了。模糊的身影靜靜看著牠。'
        '球球：「不合步子的招，留著只會一直急喵。」'
        ' Show this as: the ninja cat has lowered both paws and stepped back, and TWO glowing paper move-scrolls '
        'are drifting up and away from him, already fading at the edges. The ghostly master watches without '
        'moving.' + ' ' + NO_BEARD.replace('exactly like the reference',
                                           'exactly like the master in the attached picture'))
    jobs['event_feifei_broken_shrine_r0.png'] = ff_result(
        'event_feifei_broken_shrine_r0.png', 'broken_shrine',
        '菲菲扶起神龕，把兩截神像小心拼好。神像亮了一下，一股暖流沿著爪尖傳進胸口，讓牠的氣息更穩。'
        '菲菲：「我幫你放穩一點……這樣就不會倒了吧？」'
        ' Show this as: she has set the little shrine back upright against the wall and is easing the cat statue '
        'back ONTO ITS BASE with both paws, steadying it - the statue now stands UPRIGHT and straight instead of '
        'lying tipped over. A soft warm-amber glow rises off the stone.' + SAME_STATUE)
    jobs['event_feifei_broken_shrine_r1.png'] = ff_result(
        'event_feifei_broken_shrine_r1.png', 'broken_shrine',
        '菲菲捲起供品就走，神像的微光卻化成一縷冷氣鑽進牠胸口，攪得氣息忽快忽慢。'
        '菲菲：「胸口怎麼涼涼的……對不起，我不該拿的。」'
        ' Show this as: she is walking away with the dried fish gathered up in both paws, glancing back over her '
        'shoulder with a guilty face, while a thin pale-blue wisp curls off the statue and into her chest. The '
        'statue stays exactly where it was, still lying tipped on its side.' + SAME_STATUE)
    jobs['event_feifei_old_master_ghost_r0.png'] = ff_result(
        'event_feifei_old_master_ghost_r0.png', 'old_master_ghost',
        '菲菲跟著指點放慢吐納，重新練穩一招，原本急促的氣息也沉了下來。'
        '菲菲：「你說話好像師父……我有慢下來，這樣對嗎？」' + ' ' + FF_NO_BEARD)
    jobs['event_feifei_old_master_ghost_r1.png'] = ff_result(
        'event_feifei_old_master_ghost_r1.png', 'old_master_ghost',
        '菲菲抬爪打住，把那套動作從頭試了一遍，索性把兩招硬留著的都放下了。模糊的身影靜靜看著牠。'
        '菲菲：「有些招我用起來太勉強……先不練了。」'
        ' Show this as: she has lowered both paws and stepped back, and TWO glowing paper move-scrolls are '
        'drifting up and away from her, already fading at the edges. The ghostly master watches without moving.'
        ' **THE SCROLLS GLOW WARM AMBER GOLD** - the paper is cream, the light around it is a rich honey-amber, '
        'and the flame-like wisps peeling off their edges are the same warm amber. **Nothing about the scrolls '
        'may be green, yellow-green, lime, olive or chartreuse** - a greenish glow is punched out by the chroma '
        'key and leaves a hole.'
        + ' ' + FF_NO_BEARD)
    if batch == 'a3':
        jobs = {k: v for k, v in jobs.items() if k == 'event_feifei_old_master_ghost_r1.png'}

elif batch == 'b':
    shared = load('feifei_shared_cards.json')
    fix = load('feifei_fix_0914b.json')

    # --- 5. 我什麼都沒看到：掌心朝內貼著臉，看到的是手背 ------------------------
    fid = 'card_feifei_meikandao.png'
    t = swap(prompt_of(shared[fid]),
             '1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in CLEAN WHITE AND SILVER: two '
             'oversized white cat paws, spread wide and pressed flat like blinkers',
             '1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in CLEAN WHITE AND SILVER: her own '
             'two oversized front paws clamped over her own eyes. **THE PALMS FACE INWARD, pressed against her '
             'face** - what the viewer sees is the BACKS of her paws: plain pale fur, no pink paw pads, no toe '
             'beans, no splayed-open toes. They are touching her face, half hidden behind her own cheeks and '
             'brow, the way a person claps their hands over their eyes because they do not want to look. **Do '
             'NOT turn the palms outward toward the viewer, do NOT show the pink pads, and do NOT hold the paws '
             'out in front of her face like goggles, blinkers or a mask**', fid)
    t = swap(t,
             '   What the cat is doing: the paws are ITS OWN - it is sitting up and clapping both of its big '
             'white paws over its own eyes, head tilted away, with one eye peeking through the gap between two '
             'toes',
             '   What the cat is doing: the paws are HER OWN - she sits up and claps both front paws flat over '
             'her own eyes, palms against her face, elbows out to the sides, head tilted and turned away, with '
             'one blue eye peeking through the narrow gap between two toes. Her arms run visibly from her '
             'shoulders up to her face, so it is obvious the paws belong to her', fid)
    jobs[fid] = {'prompt': t, 'ref': FF_SHEET}

    # --- 6. 偷吃術：一隻手在前、一隻手在後被飯糰擋住 ----------------------------
    fid = 'card_feifei_touchi.png'
    t = swap(prompt_of(fix[fid]),
             '   What the cat is doing: caught in the act of taking that bite: she holds the rice ball from the '
             'OUTSIDE with both paws pressed flat on its surface, her mouth at the bite mark, cheeks bulging, '
             'eyes swivelled sideways guiltily as if she has just been caught. **Her paws and arms stay OUTSIDE '
             'the rice ball** - no part of her pokes into it, through it or out the other side; the rice ball is '
             'solid and whole apart from the one bite',
             '   What the cat is doing: caught in the act of taking that bite: she is GRIPPING the rice ball '
             'with both paws, **one paw in FRONT of it and one paw BEHIND it**. The near paw is drawn ON TOP of '
             'the rice ball, toes curled over its front surface so we see the whole paw. The far paw is HIDDEN '
             'BEHIND the rice ball: only her wrist and a little of her forearm show past the far edge, and the '
             'paw itself is completely covered by the rice ball. That front-and-behind grip is the whole point '
             'of this picture - **do NOT draw both paws in front of the rice ball side by side**, and do not let '
             'any part of her poke through it; the rice ball is solid and whole apart from the one bite. Her '
             'mouth is at the bite mark, cheeks bulging, eyes swivelled sideways guiltily as if she has just '
             'been caught', fid)
    jobs[fid] = {'prompt': t, 'ref': FF_SHEET}

    # --- 7. 甩鍋術：頭身同向、一個有柄圓鐵鍋＋同直徑圓蓋 ------------------------
    fid = 'card_feifei_shuaiguo.png'
    t = swap(prompt_of(fix[fid]),
             '1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in COPPER ORANGE: a copper cooking '
             'pot flying through the air upside down, and ITS OWN LID popping off its mouth. The lid is the '
             'matching lid of THAT pot: the same copper colour, a shallow round dome exactly as wide as the '
             "pot's rim, with a small round knob in its centre, flying right next to the pot's open mouth so it "
             'clearly belongs to it. Exactly ONE pot and ONE lid - the lid is not smaller, not flat, not a '
             'different colour, not a plate or a frying pan',
             '1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in DARK IRON GREY: exactly ONE '
             'round cast-iron cooking pan tumbling through the air - a single deep round-bottomed pan with ONE '
             'straight wooden handle sticking out of its rim - together with ITS OWN round LID knocked loose '
             'just beside it. The lid is a plain round dome of the same dark iron, **EXACTLY THE SAME DIAMETER '
             "as the pan's rim**, with one small round knob in the middle, tumbling at a slight angle a short "
             "distance from the pan's open mouth so that a player sees at a glance that the two belong together. "
             '**Exactly ONE pan and exactly ONE lid and nothing else**: the lid is not smaller than the pan, not '
             'larger, not flat like a plate, not a second pan; no other pots, bowls, spoons, food or steam '
             'anywhere in the picture', fid)
    t = swap(t,
             '   What the cat is doing: having just hurled the pot away over its shoulder, both paws still up, '
             'whistling innocently',
             '   What the cat is doing: she has just hurled that pan away from her. **Her head and her body face '
             'THE SAME WAY** - she has twisted from the waist and swung both arms across her body in one '
             'continuous follow-through, so her shoulders, chest, hips and head all turn together along the arc '
             'of the throw, and her muzzle and gaze point the same way her chest points. Weight on the front '
             'foot, the back paw up on its toes, tail streaming out the other way for balance, eyes shut and '
             'whistling innocently. **Do NOT twist her head one way while her body faces another, and do NOT '
             'stand her square to the viewer with only her arms moving**', fid)
    jobs[fid] = {'prompt': t, 'ref': FF_SHEET}

    # --- 8. 吐毛球：毛球縮小、貓放大 --------------------------------------------
    fid = 'card_feifei_maoqiu.png'
    t = swap(prompt_of(shared[fid]),
             'TWO THINGS SHARE THE FRAME, and BOTH must be large:',
             'TWO THINGS SHARE THE FRAME - the CAT is the big one here:', fid)
    t = swap(t,
             '1. THE BIG OBJECT - fills roughly 50% of the picture, rendered in SICKLY MUSTARD YELLOW: a big '
             'damp mustard-coloured hairball on the floor',
             '1. THE OBJECT - deliberately SMALL, rendered in SICKLY MUSTARD YELLOW: one neat oval ball of damp '
             'matted fur, just coughed out and still hanging in the air a little in front of her open mouth, '
             'with two or three loose strands trailing off it and a couple of short solid motion arcs behind it. '
             '**ITS SIZE IS THE POINT: the hairball is only about ONE THIRD as wide as her head, and it takes up '
             'well under 15% of the picture.** Do NOT draw a huge mound, a haystack or a pile of fur, do NOT let '
             'it cover her body, her paws or the floor, and do NOT make it the biggest thing in the frame', fid)
    t = swap(t,
             '2. THE CAT - fills roughly 40% of the picture, drawn EXACTLY like the cat in the attached '
             'reference sheet.',
             '2. THE CAT - she is the main subject and fills MOST of the picture (roughly 70% of it), drawn '
             'EXACTLY like the cat in the attached reference sheet.', fid)
    t = swap(t,
             '   What the cat is doing: hunched over and retching, ears flat, eyes squeezed shut',
             '   What the cat is doing: hunched forward and retching, both front paws braced on the ground, ears '
             'flat, eyes squeezed shut, mouth wide open with that small hairball just leaving it. She is BIG in '
             'the frame: her head, body, both front paws and her tail are all clearly visible and none of her is '
             'buried under the hairball', fid)
    jobs[fid] = {'prompt': t, 'ref': FF_SHEET}

elif batch == 'c':
    # --- 9. 貓頭鷹哨兵待機：頭朝前、跟全部魔物一樣朝左；附自己的攻擊圖當參考 ----
    act23 = load('act23_monsters.json')
    fid = 'monster_owl_sentry_idle.png'
    ref = white_ref(PUB / 'assets' / 'monsters' / 'owl_sentry_attack.webp', MONSTER_REFS / 'owl_sentry.png')
    t = swap(prompt_of(act23[fid]),
             'The monster: a round horned owl night sentry wearing a tiny iron helmet and a scarf, huge '
             'unblinking golden eyes, wings folded like a cloak, perched upright',
             'The monster: EXACTLY the owl shown in the reference image - the same species, the same face, the '
             'same huge golden eyes, the same little iron helmet, the same scarf, the same feather colours and '
             'markings. This is the SAME owl a moment BEFORE it attacks, not a different owl: a round horned owl '
             'night sentry, wings folded down like a cloak, perched upright. Before finishing, compare with the '
             'reference: if the helmet, the scarf or the feather colours changed, it is wrong', fid)
    t = swap(t, 'Pose: perched bolt upright, eyes wide, head turned almost backwards',
             'Pose: perched bolt upright and alert, wings folded, eyes wide and staring. **Its head faces '
             'straight FORWARD, the same way its body faces - toward the LEFT edge of the picture.** Its beak '
             'and both eyes point left and we see the left-facing three-quarter view of its face, exactly the '
             'way every other monster in this game is drawn. **Do NOT turn, twist or rotate its head backwards, '
             'over its shoulder, to the right, or straight out at the viewer** - the twisted head was what was '
             'wrong with the last version', fid)
    jobs[fid] = {'prompt': t, 'ref': ref}

elif batch in ('d', 'd2'):
    # d2＝只重生銅錢劍。第一版的方孔銅錢畫對了，但整把劍細長成一條（96 高只有 23 寬），
    # 縮到遊戲裡的 40 像素只剩一條線，認不出來。舊圖的比例大約是 1:2，所以補一句把它寫死。
    relics = load('relic_icons_0902.json')
    # --- 10. 銅錢劍：六枚大方孔銅錢、紅繩穿孔，不要像一堆眼睛 --------------------
    fid = 'relic_coin_sword.png'
    t = swap(prompt_of(relics[fid]),
             'The object: a small sword made of old chinese copper coins tied together with red thread',
             'The object: a short sword whose BLADE is built out of SIX big square-holed Chinese copper coins '
             'threaded on a red cord. Each coin is a fat round disc of warm orange-brown copper with a clearly '
             'visible SQUARE HOLE punched through its centre, and the six coins are stacked in one straight '
             'vertical column, each overlapping the next like fallen dominoes, to make the blade. The red cord '
             'runs down through the square holes and ties off in a small red tassel at the tip. At the top the '
             'cord is wound into a short handle with a simple straight crossguard. **The coins must be BIG and '
             'FEW - six of them, each about a fifth of the whole length, each with its square hole plainly '
             'visible.** Do NOT draw a dense cluster of many small circles, do NOT draw round holes, and do NOT '
             'draw anything that could be mistaken for a row of eyes.\n'
             '**SHAPE OF THE WHOLE ICON**: this is a short, STOUT sword, not a thin needle - its total '
             'height is only about TWICE its width. The coins are big fat discs, each about one third as '
             'wide as the whole icon, and the handle and crossguard are short and broad. Do NOT draw a long '
             'slender blade', fid)
    # 這張刻意**不附參考圖**（原本那批也沒有）：道具圖示是單一物件，附一張現成圖示
    # 只會被讀成「畫這個」（`art_rules` 第二個雷），而這次要的正是換一種畫法。
    jobs[fid] = {'prompt': t}

    # --- 11. 地圖事件節點圖示：乾淨的毛線球，不要問號、不要臉 -------------------
    # 舊工單已遺失，照 `map_icons_bc.json` 的節點圖示範本重寫；參考圖用現在這張，
    # 只借它的線條粗細、配色與在畫面裡的大小，內容明講不要問號。
    fid = 'node_event.png'
    jobs[fid] = {'prompt': (
        'The attached reference image is the CURRENT icon for this map node type. Keep its style exactly: the '
        'same thick black outline weight, the same flat cartoon colouring, the same level of simplification, and '
        'the same generous size within the frame. A player must read the new one as the SAME KIND of node at a '
        'glance.\n\n'
        'Draw ONE clean BALL OF YARN and nothing else: a round ball wound from a single WARM ROSE-PINK yarn (the '
        'same pink family as the reference), its wrapping shown as four or five bold, clearly separated curved '
        'lines crossing the ball - no more than that - with a slightly darker pink for the strands that pass '
        'behind. One short loose end of the same yarn hangs down from the lower side of the ball in a simple, '
        'relaxed curve with a tiny curl at its tip.\n'
        '**What must NOT be in this picture**: no question mark, no punctuation of any kind, no letters, no '
        'numbers, no eyes, no face, no cat, no knitting needles, no second ball, no basket, no sparkles, no '
        'shadow. The loose end is a plain hanging thread - **do NOT bend it into the shape of a question mark** '
        'or any other symbol. One ball, one colour of yarn, one short loose end.\n\n'
        'It is shown at about 40 pixels across in the game, so it must read from its silhouette and its main '
        'colour alone: one bold shape, high contrast, no fine detail, no small parts.\n'
        'Draw it SOLID and OPAQUE - flat filled colour with a little soft shading. Nothing transparent or '
        'see-through.\n'
        'Nothing else in the picture: no character, no ground, no shadow, no text, no letters, no numbers, no '
        'watermark.\n'
        'Style: thick black outlines, flat colors, cute cartoon look, not photorealistic.\n'
        'Background must be a solid pure green (#00FF00), completely flat, for chroma keying. Nothing green in '
        'the object.\n'
        f'Output 512x512 PNG. Save the image as {fid} in the current directory and report the path.'),
        'ref': 'tools/ref/icon_refs/node_event.png'}
    if batch == 'd2':
        jobs = {k: v for k, v in jobs.items() if k == 'relic_coin_sword.png'}

elif batch == 'f':
    # --- 塔主池九件新秘寶的圖示（2026-09-15 追加）--------------------------------
    # `src/content/relics.ts` 已經寫好了，圖示鍵是 `codex/relic_<id>`。
    # 工單直接沿用 `relic_icons_0902.json` 的範本（只換「畫什麼」那一行與存檔檔名），
    # 這樣線條粗細、尺寸、取景跟現有 60 件完全一致。
    #
    # ★ 茶碗與玉佩原本指定的是**綠色**（深綠釉、翠玉）。綠色寫進提示詞等於自找麻煩：
    #   圖是畫在綠幕上要去背的，綠色主體會被挖成破洞（`codex_gen.py` 坑 5）。
    #   兩件都改成**偏藍的青碧色（teal）**：看起來還是同一種古樸的釉色與玉色，
    #   但綠減紅藍的差值接近 0，去背不會咬到它。
    relics = load('relic_icons_0902.json')
    TMPL = prompt_of(relics['relic_potion_bag.png'])
    OBJ = ('The object: a small brown leather pouch with a drawstring, three little potion bottle necks '
           'poking out of the top')
    NEW_RELICS = {
        'relic_master_hat.png':
            'the old master\'s woven bamboo travelling hat: one wide, low cone of pale tan woven bamboo seen '
            'slightly from the side, its weave suggested by a few bold diagonal lines and a darker band around '
            'the brim, with a black cloth chin-strap hanging in a loose curve from each side. Nothing inside '
            'it, nobody wearing it',
        'relic_iron_palm_wraps.png':
            'a pair of dark charcoal-grey cat paw wraps - hand bindings for an iron-palm fighter: strips of '
            'dark cloth wound around a rounded cat paw shape, with three small dark iron plates riveted across '
            'the knuckles, a loose end of cloth trailing off one wrist, and a scatter of a few coarse sand '
            'grains clinging to them. Two wraps, one slightly behind the other',
        'relic_master_teacup.png':
            'a plain, elegant tea bowl glazed in DEEP TEAL BLUE (a blue-leaning, almost slate colour - never a '
            'grass, lime, mint or emerald tone): a wide low bowl on a small round foot, a paler rim highlight, '
            'and one single curl of creamy-white steam rising from it',
        'relic_jade_pendant.png':
            'a round jade disc pendant carved in DEEP TEAL stone (a blue-leaning polished stone - never a '
            'grass, lime, mint or emerald tone): a thick ring of jade with a CAT PAW PRINT carved boldly in '
            'its centre - one big pad and four toe beans - hanging from a red cord that is tied above it in a '
            'chunky decorative knot with two short tassels',
        'relic_master_gourd.png':
            'a wine gourd: a classic double-bulbed bottle gourd in warm orange-brown, the small bulb on top '
            'and the big bulb below, a red cord tied in a knot around its waist with the two ends hanging '
            'down, and a pale wooden stopper plugged into its neck',
        'relic_lucky_cat.png':
            'a small white ceramic lucky cat figurine sitting upright: a round white cat with a gold collar '
            'and a gold bell, its RIGHT front paw raised high beside its head, and clutched against its chest '
            'a small gold plaque shaped like a dried fish. Simple painted face, red ear insides, gold trim',
        'relic_tiger_claws.png':
            'a charm of three curved tiger claws hung side by side in a row from a single brown leather cord: '
            'each claw a thick crescent of creamy bone, dark at its base and polished bright at its sharp '
            'tip, the middle one hanging lowest, with a small knot in the cord above each claw',
        'relic_iron_shirt.png':
            'a neatly folded short jacket in deep navy blue, seen from the front as a tidy folded square with '
            'its collar and one folded sleeve visible, and sewn onto the chest a round iron mirror-plate - a '
            'plain polished dark-steel disc with a highlight along its upper edge',
        'relic_moon_mirror.png':
            'a round antique bronze hand mirror held upright: a warm bronze disc with a decorated rim, its '
            'polished face showing a pale CRESCENT MOON against a deep indigo night, and a short handle below '
            'wrapped in strips of pale cloth with the ends tucked in',
    }
    for fid, desc in NEW_RELICS.items():
        t = swap(TMPL, OBJ, 'The object: ' + desc, fid)
        t = swap(t, 'Save the image as relic_potion_bag.png', f'Save the image as {fid}', fid)
        jobs[fid] = {'prompt': t}

elif batch == 'h':
    # --- 球球版「師父留下的秘笈」結果圖：書要跟開場圖同一本（2026-09-15 使用者回報）----
    # 開場圖裡是一本**深藍布面、燙金邊**的線裝秘笈攤在石台上；舊的結果圖卻畫成另一本
    # （米色封面、藍框、大了一圈）。改成當續集畫：參考圖用**現行開場圖**重建，
    # 提示詞明講「是同一本書」。
    #
    # 菲菲那一對（`event_feifei_daxia_teach` 與 `_r0`）批 a 剛重生過，兩張並排看過：
    # 同一本深藍布面線裝書、同樣的五針裝訂、同樣雙手捧著的拿法——不用重生。
    d = EVENT_REFS / 'daxia_teach.png'
    if d.exists():
        d.unlink()
    rebuild_event_ref('daxia_teach', feifei=False)
    fid = 'event_daxia_teach_r0.png'
    jobs[fid] = qiu_result(
        fid, 'daxia_teach',
        '球球攤開秘笈，比對三招的圖解。球球：「這字還是老樣子，幸好師父有畫圖喵。」'
        ' Show this as: the ninja cat leans over the open manual with one paw resting on the page, looking '
        'from one move diagram to the next and comparing them, brows knitted in concentration. The spread '
        'he has turned to now carries THREE small cat-stance diagrams across the two pages, each a little '
        'brush-drawn cat figure with a couple of dotted arrows, with columns of brush strokes between them.'
        ' **THE MANUAL IS THE SAME BOOK AS IN THE ATTACHED PICTURE**: the same binding, the same cover '
        'colour and pattern, the same size relative to the cat, the same aged paper and the same page '
        'layout, resting in the same place and held the same way - only the moment differs. Do not '
        'redesign the book, do not make it bigger or smaller, do not change its cover, and do not swap it '
        'for a different volume.')

elif batch == 'g':
    # --- 菲菲的封面「參上」貼圖（2026-09-15 追加）--------------------------------
    # 使用者：「封面球球的很華麗有背景，菲菲的比較單調」。球球那張是 LINE 貼圖風：
    # 背後一團米黃色爆炸雲、上面毛筆體「參上」兩個大字、四周黃色速度線。
    #
    # `codex_gen.py` 的 `-i` 只吃一張圖，所以這裡把**兩張參考拼成一張**：
    # 上半＝球球的封面（只借版面與貼圖風格），下半＝菲菲設定表（借長相）。
    # 綠幕一律換成白底——模型讀白底比讀綠底穩（`make_feifei_story_ref.py` 的結論）。
    cover = PUB / 'assets' / 'sprites' / 'hero' / 'cover.webp'
    if not cover.exists():
        raise SystemExit(f'!! 找不到球球的封面 {cover}')
    ref_path = ROOT / 'tools' / 'ref' / 'feifei_cover_ref.png'
    top = Image.open(cover).convert('RGBA')
    bg = Image.new('RGBA', top.size, (255, 255, 255, 255))
    bg.paste(top, (0, 0), top)
    top = bg.convert('RGB').resize((700, 700), Image.LANCZOS)
    bot = Image.open(ROOT / FF_SHEET).convert('RGB')
    px = bot.load()                                    # 綠幕換白底
    for y in range(bot.height):
        for x in range(bot.width):
            r, g, b = px[x, y]
            if g - max(r, b) > 60:
                px[x, y] = (255, 255, 255)
    bot = bot.resize((1400, 700), Image.LANCZOS)
    sheet = Image.new('RGB', (1400, 1400), (255, 255, 255))
    sheet.paste(top, (350, 0))
    sheet.paste(bot, (0, 700))
    sheet.save(ref_path)

    fid = 'hero_feifei_cover.png'
    jobs[fid] = {'prompt': (
        'A LINE-sticker style cover illustration of a cute cartoon cat ninja character.\n\n'
        '**THE ATTACHED REFERENCE SHEET HAS TWO HALVES, AND THEY ARE USED FOR DIFFERENT THINGS.**\n'
        '  (1) THE TOP HALF is the existing cover of ANOTHER character. It is the STYLE AND LAYOUT '
        'TEMPLATE: copy its composition exactly - a big puffy CREAM-AND-TAN EXPLOSION CLOUD bursting '
        'outward behind the character and filling most of the square, a few small tan rubble chunks and '
        'short dark speed dashes flying out of it, two large brush-written characters across the top, a '
        'thick yellow brush underline swiping beneath them, and three short yellow speed dashes in each '
        'of the top corners. Same thick black outlines, same flat sticker colouring, same square framing, '
        'same big friendly proportions. **Do NOT draw the grey striped cat from the top half** - he is '
        'only there to show you the layout.\n'
        '  (2) THE BOTTOM HALF is THE CHARACTER you must draw: the Siamese cat girl ninja, shown twice. '
        'Copy her design from there exactly.\n\n'
        'So: the top half\'s picture, with the bottom half\'s character standing in it.\n\n'
        'HER POSE: a big confident VICTORY pose in the very centre, in front of the cloud, filling the '
        'middle of the square - standing with her weight on one foot, one arm thrown up high above her '
        'head with the paw making a cheerful V sign, the other paw on her hip, chest out, tail curling up '
        'behind her, eyes bright and a wide happy open-mouthed grin. Lively and bouncy, not stiff.\n\n'
        'THE TWO BRUSH CHARACTERS: copy the SAME two Japanese kanji that appear across the top of the '
        'reference, in the same brush-script shapes, the same size, the same place and the same order - '
        'trace them from the reference stroke for stroke. They are written in soft CREAM WHITE with a thin '
        'darker outline, sitting above and behind the cloud. **Exactly TWO characters, nothing else** - no '
        'extra characters, no letters, no numbers, no signature, no watermark. If you cannot reproduce the '
        'two shapes exactly as drawn in the reference, copy them as pure shapes rather than inventing '
        'different ones.\n\n'
        'HER LOOK (copy it from the bottom half of the reference):\n' + feifei_look() +
        '\nEverything is drawn SOLID and OPAQUE - flat filled colour with thick black outlines and only '
        'subtle soft shading. Nothing transparent or see-through. The explosion cloud, the rubble, the '
        'dashes, the lettering and the character are the whole picture - no ground line, no shadow under '
        'her, no scenery, no border, no frame.\n'
        'The cloud and the sparks are CREAM, TAN and WARM AMBER YELLOW - never green, never greenish.\n'
        'Background must be a solid pure green (#00FF00), completely flat, for chroma keying: the green '
        'shows only around the outside of the cloud. Nothing green on the cloud, the lettering or the '
        'character.\n'
        f'Output 1024x1024 PNG. Save the image as {fid} in the current directory and report the path.'),
        'ref': ref_path.relative_to(ROOT).as_posix()}

elif batch in ('e1', 'e2'):
    sc = load('shadow_cat.json')
    # 鏡中球球的「影子化」那一段，主角換成菲菲。剪影是玩家唯一認得出她的線索，所以
    # 蝴蝶結與馬尾要留在輪廓上（`art_rules` 第五個雷：配件要講它在畫面上佔哪一塊）。
    FF_SHADOW = (
        'The monster: a SHADOW CLONE of the Siamese cat girl ninja in the attached reference image - the SAME '
        'proportions and the SAME silhouette as the reference (a big round head roughly as large as her whole '
        'body, a short squat body, short stubby legs, pointed triangular ears, the short kimono jacket, the sash '
        'and the belt of little needle-tubes, and on top of her head the tuft of hair with its RIBBON BOW and '
        'the short spiky PONYTAIL behind it), but made ENTIRELY of solid dark violet-black smoke: no fur '
        'markings, no face markings, no cream fur, no purple jacket colour - just a flat near-black silhouette '
        'with wisps of dark violet smoke curling off her head, ears, ponytail and tail, and two glowing pale '
        'violet eyes with tiny bright pupils. Clearly the same character, turned evil.\n'
        '**HER SILHOUETTE IS THE ONLY WAY PLAYERS RECOGNISE HER**: the BOW on top of her head and the spiky '
        'PONYTAIL behind it must both stand clear of the outline of her head, with background visible in the gap '
        'between the ponytail and her skull, and her ears stay two pointed triangles. A shadow with a plain '
        'round head is the wrong character.\n'
        '**SHE IS A SMALL, SHORT, ROUND KITTEN SHAPE** - do not draw a tall, slim or grown-up cat, do not give '
        'her long legs, and do not inflate her into a featureless ball: you must still be able to point at two '
        'arms and two legs.')
    OLD_MON = ('The monster: a SHADOW CLONE of the grey tabby cat ninja in the attached reference sheet - the '
               'SAME proportions as the reference (big round head as large as the body, tiny muzzle, short '
               'chubby body, headband with two trailing tails), but made ENTIRELY of solid dark violet-black '
               'smoke: no fur markings, flat near-black silhouette with wisps of dark smoke curling off the '
               'head, ears and tail, and two glowing pale violet eyes with tiny bright pupils. Clearly the same '
               'character, turned evil.')

    if batch == 'e1':
        fid = 'monster_shadow_feifei_idle.png'
        t = swap(prompt_of(sc['monster_shadow_cat_idle.png']), OLD_MON, FF_SHADOW, fid)
        t = swap(t, 'Pose: standing in a ready ninja stance, smoke drifting upward off its shoulders',
                 'Pose: standing in a ready ninja stance, weight low, one paw held low with a slim smoke-needle '
                 'pinched between two claws, the other paw up in front of her chest, smoke drifting upward off '
                 'her shoulders', fid)
        t = swap(t, 'Save the image as monster_shadow_cat_idle.png', f'Save the image as {fid}', fid)
        jobs[fid] = {'prompt': t, 'ref': FF_SHEET}
    else:
        ref_p = MONSTER_REFS / 'shadow_feifei.png'
        idle_webp = PUB / 'assets' / 'monsters' / 'shadow_feifei_idle.webp'
        if not idle_webp.exists():
            raise SystemExit('!! 待機圖還沒進倉：先跑 e1、進倉，再跑 e2（續集的長相全靠它）')
        ref = white_ref(idle_webp, ref_p)
        SAME_ONE = ('The creature: EXACTLY the monster shown in the reference image - the same shadow Siamese '
                    'kitten, the same silhouette, the same bow and ponytail on her head, the same two glowing '
                    'violet eyes, the same smoke wisps. This is the same creature one moment later, NOT a '
                    'different creature.')
        TALL = ('Fill the frame from the very top to the very bottom: she must be AT LEAST AS TALL as in the '
                'reference image, with her head at the same height or higher. Show the action with an upright, '
                'stepping or rearing pose - NOT by stretching her sideways or crouching lower. A wide, flat pose '
                'gets shrunk to fit in the game and she looks smaller the moment she acts; that is wrong.\n')

        # 攻擊：照 shadow_cat 的工單換主角與姿勢，再加上「不可以比待機矮」（0914 的 e 批教訓）
        fid = 'monster_shadow_feifei_attack.png'
        t = swap(prompt_of(sc['monster_shadow_cat_attack.png']), OLD_MON, FF_SHADOW + '\n' + SAME_ONE, fid)
        t = swap(t, 'Pose: lunging forward with one smoke-claw swiping wide, a trail of smoke behind the arm',
                 'Pose: ATTACKING - standing tall and stepping forward onto her front paw, one arm snapped '
                 'forward at head height flicking a long smoke-needle at the enemy, the other arm swept back '
                 'behind her, a trail of dark smoke streaming off the throwing arm. She stays upright and does '
                 'not crouch', fid)
        t = swap(t, 'Fill the frame vertically: the monster should reach nearly the top and the bottom of the '
                    'image.\n', TALL, fid)
        t = swap(t, 'Save the image as monster_shadow_cat_attack.png', f'Save the image as {fid}', fid)
        jobs[fid] = {'prompt': t, 'ref': ref}

        # 挨打：照 hurt/shadow_cat.json
        hurt = load('hurt/shadow_cat.json')
        fid = 'monster_shadow_feifei_hurt.png'
        t = swap(prompt_of(hurt['monster_shadow_cat_hurt.png']),
                 'The reference image is the idle pose of a cartoon monster (影球球) from a cute cat ninja tower '
                 'game.',
                 'The reference image is the idle pose of a cartoon monster (影菲菲, the shadow clone of the '
                 'Siamese cat girl ninja) from a cute cat ninja tower game.', fid)
        t = swap(t, 'Keep the exact same character design, colours, proportions and art style as the reference',
                 'Keep the exact same character design, colours, proportions and art style as the reference - '
                 'including the RIBBON BOW and the spiky PONYTAIL standing clear of the outline of her head, '
                 'which are the only way players tell her apart from the other shadow', fid)
        t = swap(t, 'Save the image as monster_shadow_cat_hurt.png', f'Save the image as {fid}', fid)
        jobs[fid] = {'prompt': t, 'ref': ref}

        # 防禦：照 build_block_queue 的 BLOCK_POSE／BLOCK_TAIL
        fid = 'monster_shadow_feifei_block.png'
        t = SAME_ONE + (
            ' Keep the RIBBON BOW and the spiky PONYTAIL standing clear of the outline of her head - they are '
            'the only way players tell her apart from the other shadow.') + BLOCK_POSE + BLOCK_TAIL.format(name=fid)
        t = swap(t, 'Full body, facing LEFT. Fill the frame vertically.\n', 'Full body, facing LEFT. ' + TALL, fid)
        jobs[fid] = {'prompt': t, 'ref': ref}

        # 倒地：照 monster_down.json
        down = load('monster_down.json')
        fid = 'monster_shadow_feifei_down.png'
        t = swap(prompt_of(down['monster_shadow_cat_down.png']),
                 'The creature: exactly the monster shown in the reference image.',
                 SAME_ONE + ' Keep the RIBBON BOW and the spiky PONYTAIL readable on her head even as she lies '
                            'collapsed - they are the only way players tell her apart from the other shadow.', fid)
        t = swap(t, 'Save the image as monster_shadow_cat_down.png', f'Save the image as {fid}', fid)
        jobs[fid] = {'prompt': t, 'ref': ref}

elif batch == 'i':
    # --- 貓頭鷹受傷、防禦（2026-09-15 傍晚，使用者：「有問題你都重生」）：舊圖是沒有角的頭盔、顏色也偏淺，
    #     跟新的待機／攻擊（有兩支角、紫圍巾）判若兩隻。附**新的待機圖**當參考，提示詞把角與圍巾寫死。
    #     防禦圖原本是 build_block_queue.py 現場組的（沒有留工單），這裡照它的 BLOCK_POSE／BLOCK_TAIL 再組一次 ----
    from build_block_queue import BLOCK_POSE, BLOCK_TAIL  # noqa: E402
    ref = white_ref(PUB / 'assets' / 'monsters' / 'owl_sentry_idle.webp', MONSTER_REFS / 'owl_sentry_idle.png')
    same = ('The creature: exactly the monster shown in the reference image. It wears the SAME small iron helmet '
            'with TWO curved horns and the SAME dark purple scarf as the reference, with the same brown feather '
            'colours and markings and the same huge golden eyes. Before finishing, compare with the reference: '
            'if the horns, the scarf or the feather colours are missing or changed, it is wrong.')
    hurt = load('monster_hurt_rest.json')
    fid = 'monster_owl_sentry_hurt.png'
    t = swap(prompt_of(hurt[fid]), 'The creature: exactly the monster shown in the reference image.', same, fid)
    jobs[fid] = {'prompt': t, 'ref': ref}
    fid = 'monster_owl_sentry_block.png'
    jobs[fid] = {'prompt': same + BLOCK_POSE + BLOCK_TAIL.format(name=fid), 'ref': ref}

else:
    raise SystemExit(
        '要指定批次：\n'
        '  a1   事件開場六張＋教導劇情圖（先跑這批）\n'
        '  refs a1 進倉後重建事件參考圖\n'
        '  a2   事件結果圖八張（要等 refs）\n'
        '  b    牌面四張\n'
        '  c    貓頭鷹哨兵待機\n'
        '  d    銅錢劍與事件節點圖示\n'
        '  e1   鏡中菲菲待機\n'
        '  e2   鏡中菲菲出招／挨打／防禦／倒地（要等 e1 進倉）\n'
        '  f    塔主池九件新秘寶的圖示')

# ======================= 自檢：一律 SystemExit =======================
for fid, job in jobs.items():
    if job.get('ref') and not (ROOT / job['ref']).exists():
        raise SystemExit(f'{fid} 的參考圖不在：{job["ref"]}')
    if (RAW / fid).exists():
        raise SystemExit(f'{fid} 的舊原稿還在：先改名留底（.{STAMP}.png），'
                         '不然 codex_gen 會直接跳過、還印成功（坑 7）')
    if f'Save the image as {fid}' not in job['prompt']:
        raise SystemExit(f'{fid}：存檔指令的檔名跟工單的鍵對不上')
    if job['prompt'].count('Save the image as') != 1:
        raise SystemExit(f'{fid}：提示詞裡有兩句存檔指令，換檔名時漏換了一句')
    if fid.startswith('event_') and STYLE not in job['prompt']:
        raise SystemExit(f'{fid}：事件圖少了 STYLE')
    if fid.startswith('card_') and NO_PANEL not in job['prompt']:
        raise SystemExit(f'{fid}：牌面少了 NO_PANEL')
    # 菲菲的圖裡不可以留下球球（`make_feifei_result_art_jobs.py` 的自檢一同一條）。
    # 允許的只有「不要畫成他」那句反向護欄，以及師父那兩張明講他不出現的段落。
    # **例外**：`feifei_still_teach` 是三個角色的合照，球球本來就該在畫面裡（他躺在後面），
    # 這一張的球球敘述是正確的內容，不是漏轉。
    if 'feifei' in fid and fid != 'feifei_still_teach.png':
        p = job['prompt']
        for ok in ('Never replace her with a grey tabby cat in a navy ninja outfit.',
                   'Never draw a grey tabby cat in a navy ninja outfit.',
                   'She is the hero of this story. Never draw a grey tabby cat with a navy headband in her place.',
                   'Her narrow muzzle and the ear SHAPE (triangular, not rounded) are the only features that '
                   'differ from a round grey tabby; everything else is short and round.',
                   'a grey tabby cat with a navy headband',
                   '(not a grey tabby, not a ninja in navy)',
                   'She is a SIAMESE cat girl, not a grey tabby:',
                   'not a grey tabby, not a ninja in navy',
                   'the big grey tabby cat in the wide conical straw hat',
                   '(1) a small chibi grey tabby ninja in a navy headband - **he does NOT appear in this picture**',
                   'the Siamese cat girl ninja',
                   'the shadow clone of the Siamese cat girl ninja',
                   'a SHADOW CLONE of the Siamese cat girl ninja',
                   'a cute cat ninja tower game',
                   'a cute game set in a cat ninja tower',
                   'ninja stance',
                   'the striped brother',
                   'a small chibi GREY TABBY cat ninja with a navy headband'):
            p = p.replace(ok, '')
        for bad in ('grey tabby', 'gray tabby', '球球', 'ninja cat', 'NINJA CAT'):
            if bad in p:
                raise SystemExit(f'{fid}：菲菲的提示詞裡還留著「{bad}」，會被畫成球球')

out = JOBS / f'fix_0915_{batch}.json'
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
sys.stdout.write(f'{len(jobs)} 張 → {out.name}\n')
for fid, job in jobs.items():
    sys.stdout.write(f'  {fid}  ← {job.get("ref") or "（不附參考圖）"}\n')
