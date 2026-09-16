# -*- coding: utf-8 -*-
"""2026-09-16 事件結果圖逐張對句子之後，**改字解不掉、只能重生**的那幾張。

128 張結果圖跟句子逐張對過，多數對不上的已經靠改字解決。剩下這幾張是**圖本身缺東西**
或**畫錯世界觀**，改字反而會弄壞對得上的那一邊（同一句話對另一個角色那張圖是對的）。

| 批 | 檔案 | 問題 | 做法 |
|---|---|---|---|
| a | event_catnip_field_r1 | 畫面上只有球球抱著一把貓薄荷，**沒有看園的老貓、也沒有換到的忍具**；句子寫的是完整的交易 | 拿**菲菲那張對的**當構圖參考（老貓＋忍具箱＋遞出兩件忍具），把貓換成球球 |
| b | event_gambling_rats_r0、event_feifei_gambling_rats_r0 | 桌上倒出來的是**金幣**；這個遊戲的錢是**小魚乾**，沒有貨幣 | 加 `FISH` 硬規則，本錢一律畫成一堆小魚乾 |
| c | event_medicine_cat_r1 | 攤子上擺著三枚**金幣**（同上；她那版 `event_feifei_medicine_cat_r1` 沒有這個問題，不動） | 同上，金幣換成付掉的小魚乾 |

**不生的**（打開看過、判斷是誤報，理由寫在回報裡）：
  - `event_medicine_cat_r0`：攤子上那個是**空的木盒**，不是金幣。
  - `event_lost_kitten_r0`、`event_medicine_cat_r0`、`event_noisy_kitchen_r1`：句子寫「兩個忍具」，
    放大看**三張都畫了兩件**（手裏劍＋苦無），不是一件。

**參考圖的紀律**（記憶 `reference_mus_art_pipeline`：續集的長相全靠參考圖，參考圖過期就會抄到壞版本）：
  - b 批她那張的事件參考圖 `event_refs_feifei/gambling_rats.png` 比開場圖舊（09-13 對 09-14），
    先跑 `refs` 砍掉重建，`need_fresh_ref` 會擋著不讓你拿舊的去生。
  - a 批的參考圖是**現生的兩格合參表**：左＝球球的貓薄荷開場圖（他的長相＋這片田的顏色），
    右＝菲菲對的那張 r1（老貓、忍具箱、交易的構圖）。提示詞裡寫死「右邊那隻暹羅貓不准出現」。

用法（兩條線，多開會互相餓死——`codex_gen.py` 的坑 1）：

  python tools/make_fix_0916_jobs.py refs        # 重建 b 批的參考圖＋生 a 批的合參表
  python tools/make_fix_0916_jobs.py a && python tools/codex_gen.py tools/codex_jobs/fix_0916_a.json
  python tools/make_fix_0916_jobs.py b && python tools/codex_gen.py tools/codex_jobs/fix_0916_b.json
  python tools/make_fix_0916_jobs.py c && python tools/codex_gen.py tools/codex_jobs/fix_0916_c.json
  python tools/add_event_art.py event_catnip_field_r1.png event_gambling_rats_r0.png \
      event_feifei_gambling_rats_r0.png event_medicine_cat_r1.png

**舊原稿一律先改名成 `.previous-20260916.png`**（`codex_gen.py` 看到檔案在就跳過、還印成功，坑 7）。
下面的自檢會擋著，不會讓你空轉一整批。
"""
import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from art_rules import STYLE  # noqa: E402
from make_event_result_jobs import ACTOR, HEAD, SAME_PLACE, TAIL as RESULT_TAIL  # noqa: E402
from make_feifei_result_art_jobs import ACTOR as FF_ACTOR, HEAD as FF_HEAD  # noqa: E402
from make_feifei_result_art_jobs import SAME_PLACE as FF_SAME, TAIL as FF_TAIL  # noqa: E402

JOBS = ROOT / 'tools' / 'codex_jobs'
RAW = ROOT / 'tools' / 'codex_raw'
PUB = ROOT / 'public'
STAMP = 'previous-20260916'

EVENT_REFS = ROOT / 'tools' / 'ref' / 'event_refs'
FF_EVENT_REFS = ROOT / 'tools' / 'ref' / 'event_refs_feifei'
CATNIP_SHEET = ROOT / 'tools' / 'ref' / 'catnip_trade_ref.png'
FF_TEXT = JOBS / '_feifei_result_text.json'

# 球球的長相護欄（跟 make_fix_0915_jobs.py／make_audit_art_0914.py 同一段）
FACE = ("THE NINJA CAT'S LOOK (check this before finishing): he is a LIGHT GREY tabby with dark grey stripes, "
        "a WHITE muzzle and chin, pink inside his ears, and his eyes are simple round solid BLACK dots with one "
        "small white highlight each - exactly like the reference. Never give him yellow, golden, amber or green "
        "eyes, and never big realistic eyes with coloured irises. His head is big and round, his body short and "
        "chubby, in the navy ninja outfit with the navy headband and its two trailing tails.\n")

# ---------------------------------------------------------------------------
# 這個世界的錢是小魚乾。**沒有貨幣**——金幣、銀幣、銅錢、鈔票一律是錯的。
# 使用者 2026-09-16 點名：賭桌上倒出來的是金幣、藥攤上也擺著金幣。
# ---------------------------------------------------------------------------
FISH = (
    "\n\n**THE MONEY IN THIS WORLD IS DRIED FISH - THERE ARE NO COINS.** Anything that is staked, paid, "
    "won, counted or left lying as payment in this picture is a heap of small DRIED FISH: each one a stiff "
    "little amber-and-orange dried fish about as long as a cat's paw, with a blunt head, one small dark "
    "round eye, a line of fine rib marks down its side and a stiff forked tail. They lie loose in an untidy "
    "pile, overlapping each other at different angles, some on their side and some on their back. "
    "**Do NOT draw gold coins, silver coins, copper cash, round metal discs, coin stacks, gold nuggets, "
    "banknotes, gems or a money pouch anywhere in this picture** - not on the table, not on the counter, "
    "not in anybody's paw and not on the ground. Coins in this game are always wrong.\n")

# --- a：貓薄荷園的交易（球球版）-------------------------------------------------
# 他那張的開場圖裡**沒有老貓**（只有他自己滾在葉子裡），所以續集沒得抄；
# 老貓、忍具箱、交易的構圖全部來自菲菲對的那張 r1。兩張拼成一份合參表。
CATNIP_HEAD = (
    "A single scene illustration for a story event in a cute cartoon roguelike card game, landscape "
    "composition.\n\n"
    "**THE ATTACHED PICTURE IS A REFERENCE SHEET WITH TWO PANELS SIDE BY SIDE. It is not one picture to "
    "copy whole - read both panels and take different things from each.**\n"
    "  - **LEFT PANEL - the HERO and the PLACE.** A small chibi GREY TABBY cat ninja in a navy outfit with a "
    "navy headband, flopped on his back in the catnip field. He is the hero of the picture you are drawing: "
    "copy his design exactly - light grey tabby fur with dark grey stripes, white muzzle and chin, round "
    "solid black dot eyes, big round head, short chubby body, navy wrap outfit and navy headband with two "
    "trailing tails. The left panel also shows the PLACE: a thick bed of catnip - tall purple flower spikes "
    "and big broad purple leaves. That same plant and those same purple colours fill the picture you are "
    "drawing.\n"
    "  - **RIGHT PANEL - the OTHER CHARACTER and the PROPS.** The same event drawn for a different hero. "
    "Copy from it: the OLD GARDENER CAT (a big fluffy long-haired GINGER cat in a brown robe, his eyes "
    "closed in a happy smile, a thick cream ruff around his neck and a bushy ginger tail), the OPEN WOODEN "
    "CHEST of ninja tools sitting on the ground, and the general staging of the trade - the two of them "
    "facing each other across the middle of the field, handing things over.\n"
    "  - **THE BROWN-AND-CREAM SIAMESE CAT GIRL WITH THE PURPLE RIBBON BOW IN THE RIGHT PANEL MUST NOT "
    "APPEAR.** She is a different game character and she is not in this story. The grey tabby ninja from the "
    "left panel takes her place. There are EXACTLY TWO characters in the picture you are drawing: the grey "
    "tabby ninja and the old ginger gardener cat. No Siamese cat, no purple bow, no plum-purple jacket.\n\n"
    "What happens now: ")

CATNIP_SCENE = (
    "\n\n**STAGING - this is the part the old picture got wrong, so read it twice.** The trade must be "
    "visible: the picture has to show all THREE of these things at once.\n"
    "  (1) **THE NINJA HANDING OVER THE LEAVES.** He stands on one side of the field, leaning forward, "
    "holding out a fat bundle of freshly picked young catnip - purple leaves and flower spikes gathered "
    "together and bound at the stems with a twist of straw - pushing it toward the gardener with both front "
    "paws. He is giving it away, not hugging it to his chest.\n"
    "  (2) **THE OLD GARDENER CAT TAKING IT.** He stands facing the ninja, close enough to reach, one paw "
    "already closing around the bundle of leaves.\n"
    "  (3) **THE TWO NINJA TOOLS COMING BACK.** With his other paw the gardener holds out TWO tools toward "
    "the ninja: one round black bomb with a short pale fuse, and one flat grey four-pointed throwing star. "
    "**Exactly two tools, clearly separate from each other and countable at a glance** - not one, not three, "
    "and not hidden behind a paw. Beside the gardener the open wooden chest sits on the ground with more "
    "throwing stars, round bombs and rolled scrolls packed inside it, so it is obvious where the tools came "
    "from.\n"
    "The ninja looks pleased and grateful; the gardener smiles with his eyes closed. Both cats stand upright "
    "on their hind legs, the catnip bed spreading around their feet and behind them.\n")

# --- b：老鼠賭局（兩個角色）-----------------------------------------------------
GAMBLE_SCENE = (
    "\n\n**WHAT IS ON THE TABLE.** The stake is DRIED FISH, poured out in a loose heap on the low table "
    "next to the overturned bowl, with a few more scattered around it. The bowl has just been tipped up - "
    "hold it as one plain pale ceramic bowl with a blue band, the same bowl as in the attached picture. "
    "The rats crowd in around the heap of dried fish; the hero leans right in over the table to look, "
    "eyes fixed on what the bowl was covering.\n")

# --- c：賣藥的三花貓（球球版）---------------------------------------------------
MEDICINE_SCENE = (
    "\n\n**WHAT IS ON THE COUNTER.** He has already paid, so the payment lies on the wooden counter top "
    "near the front edge: a small loose heap of DRIED FISH, five or six of them piled up and overlapping. "
    "That heap is the ONLY payment in the picture. The rest of the counter is exactly as in the attached "
    "picture - the row of corked potion bottles in their different colours and the stall's wooden frame "
    "and awning behind the calico cat.\n")


def load_ff_text() -> dict:
    """她那邊的結果文字正本（由 `tools/feifei_result_text.test.ts` 從 `eventTextFor` 匯出）。"""
    events_ts = ROOT / 'src' / 'content' / 'events.ts'
    if not FF_TEXT.exists() or FF_TEXT.stat().st_mtime < events_ts.stat().st_mtime:
        raise SystemExit(f'!! {FF_TEXT.name} 比 events.ts 舊（或不存在）。先跑：\n'
                         '   UPDATE_FEIFEI_TEXT=1 npx vitest run tools/feifei_result_text.test.ts')
    return json.loads(FF_TEXT.read_text(encoding='utf-8'))


def qiu_text(key: str) -> str:
    """從 `events.ts` 撈球球那句結果文字（正本只有一份，不要手抄）。"""
    import re
    src = (ROOT / 'src' / 'content' / 'events.ts').read_text(encoding='utf-8')
    m = re.search(r"result: '([^']*)', resultArt: '" + key + "'", src)
    if not m:
        raise SystemExit(f'!! events.ts 裡找不到 resultArt: {key}（鍵改過了？）')
    return m.group(1)


def swap(text: str, old: str, new: str, who: str) -> str:
    n = text.count(old)
    if n != 1:
        raise SystemExit(f'!! {who}：要換的原文出現 {n} 次（應該剛好 1 次）：\n   「{old[:110]}…」')
    return text.replace(old, new, 1)


def with_style(text: str, who: str) -> str:
    return text if STYLE in text else swap(text, 'Output 1024x768 PNG.', STYLE + 'Output 1024x768 PNG.', who)


def white_ref(src: pathlib.Path, dst: pathlib.Path) -> str:
    """去背過的 webp 鋪白底存成 PNG 當參考圖（跟 0914／0915 那兩批同一個做法）。"""
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
    if out.stat().st_mtime < (PUB / path).stat().st_mtime:
        raise SystemExit(f'!! {rel} 還是比場景圖舊')
    return rel


def need_fresh_ref(ref: str, eid: str, feifei: bool) -> str:
    """續集開工單前先確認參考圖比開場圖新（抄 `make_feifei_result_art_jobs.py` 的擋法）。"""
    manifest = json.loads((PUB / 'assets' / 'manifest.json').read_text(encoding='utf-8'))
    key = f'bg/event_feifei_{eid}' if feifei else f'bg/event_{eid}'
    scene = manifest['bg'].get(key)
    p = ROOT / ref
    if not p.exists():
        raise SystemExit(f'!! 參考圖不在：{ref}　先跑 `python tools/make_fix_0916_jobs.py refs`')
    if not scene:
        raise SystemExit(f'!! manifest 裡沒有 {key}')
    if p.stat().st_mtime < (PUB / scene).stat().st_mtime:
        raise SystemExit(f'!! {ref} 比開場圖舊（續集會照著舊圖畫）：先跑 `python tools/make_fix_0916_jobs.py refs`')
    return ref


def build_catnip_sheet() -> str:
    """兩格合參表：左＝球球的貓薄荷開場圖，右＝菲菲對的那張 r1（老貓＋忍具箱＋交易構圖）。

    右邊那格**一定要用現行的那張**（記憶 `reference_mus_art_pipeline`：參考圖過期會抄到壞版本），
    所以直接從 manifest 讀，不要寫死路徑。
    """
    manifest = json.loads((PUB / 'assets' / 'manifest.json').read_text(encoding='utf-8'))
    srcs = []
    for key in ('bg/event_catnip_field', 'bg/event_feifei_catnip_field_r1'):
        path = manifest['bg'].get(key)
        if not path:
            raise SystemExit(f'!! manifest 裡沒有 {key}')
        srcs.append(PUB / path)

    H = 560
    panels = []
    for s in srcs:
        im = Image.open(s).convert('RGBA')
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
        bg.paste(im, (0, 0), im)
        im = bg.convert('RGB')
        panels.append(im.resize((round(im.width * H / im.height), H), Image.LANCZOS))

    gap = 24
    W = sum(p.width for p in panels) + gap * 3
    out = Image.new('RGB', (W, H + gap * 2), (255, 255, 255))
    x = gap
    for p in panels:
        out.paste(p, (x, gap))
        x += p.width + gap
    CATNIP_SHEET.parent.mkdir(parents=True, exist_ok=True)
    out.save(CATNIP_SHEET)

    newest = max(s.stat().st_mtime for s in srcs)
    if CATNIP_SHEET.stat().st_mtime < newest:
        raise SystemExit('!! 合參表還是比來源圖舊')
    return CATNIP_SHEET.relative_to(ROOT).as_posix()


# ---------------------------------------------------------------------------
batch = sys.argv[1] if len(sys.argv) > 1 else ''
jobs: dict[str, dict[str, str]] = {}

if batch == 'refs':
    out = [rebuild_event_ref('gambling_rats', feifei=True),
           rebuild_event_ref('gambling_rats', feifei=False),
           rebuild_event_ref('medicine_cat', feifei=False),
           build_catnip_sheet()]
    sys.stdout.write('重建參考圖：\n  ' + '\n  '.join(out) + '\n')
    raise SystemExit(0)

elif batch == 'a':
    # 貓薄荷園・採一把去換（球球版）：補上看園的老貓與換回來的兩個忍具
    fid = 'event_catnip_field_r1.png'
    if not CATNIP_SHEET.exists():
        raise SystemExit('!! 合參表不在：先跑 `python tools/make_fix_0916_jobs.py refs`')
    t = (CATNIP_HEAD + qiu_text('catnip_field_r1') + CATNIP_SCENE + ACTOR
         + RESULT_TAIL.format(name=fid))
    t = swap(t, 'Tell the story in one readable picture', FACE + 'Tell the story in one readable picture', fid)
    jobs[fid] = {'prompt': with_style(t, fid), 'ref': CATNIP_SHEET.relative_to(ROOT).as_posix()}

elif batch == 'b':
    # 老鼠賭局・押下去：桌上的本錢是小魚乾，不是金幣
    fid = 'event_gambling_rats_r0.png'
    ref = need_fresh_ref('tools/ref/event_refs/gambling_rats.png', 'gambling_rats', feifei=False)
    t = (HEAD.format(same=SAME_PLACE) + qiu_text('gambling_rats_r0') + FISH + GAMBLE_SCENE + ACTOR
         + RESULT_TAIL.format(name=fid))
    t = swap(t, 'Tell the story in one readable picture', FACE + 'Tell the story in one readable picture', fid)
    jobs[fid] = {'prompt': with_style(t, fid), 'ref': ref}

    fid = 'event_feifei_gambling_rats_r0.png'
    ref = need_fresh_ref('tools/ref/event_refs_feifei/gambling_rats.png', 'gambling_rats', feifei=True)
    t = (FF_HEAD.format(same=FF_SAME) + load_ff_text()['gambling_rats_r0'] + FISH + GAMBLE_SCENE + FF_ACTOR
         + FF_TAIL.format(name=fid))
    jobs[fid] = {'prompt': with_style(t, fid), 'ref': ref}

elif batch == 'c':
    # 賣藥的三花貓・買補身藥（球球版）：攤子上那三枚金幣換成付掉的小魚乾
    fid = 'event_medicine_cat_r1.png'
    ref = need_fresh_ref('tools/ref/event_refs/medicine_cat.png', 'medicine_cat', feifei=False)
    t = (HEAD.format(same=SAME_PLACE) + qiu_text('medicine_cat_r1') + FISH + MEDICINE_SCENE + ACTOR
         + RESULT_TAIL.format(name=fid))
    t = swap(t, 'Tell the story in one readable picture', FACE + 'Tell the story in one readable picture', fid)
    jobs[fid] = {'prompt': with_style(t, fid), 'ref': ref}

else:
    raise SystemExit(
        '用法：python tools/make_fix_0916_jobs.py <批>\n'
        '  refs 重建 b／c 批的事件參考圖，並拼出 a 批的兩格合參表（先跑這個）\n'
        '  a    貓薄荷園的交易（球球版）——補老貓與兩個忍具\n'
        '  b    老鼠賭局兩張（球球版＋菲菲版）——金幣換小魚乾\n'
        '  c    賣藥的三花貓 r1（球球版）——金幣換小魚乾')

# ======================= 自檢：一律 SystemExit =======================
for fid, job in jobs.items():
    if not (ROOT / job['ref']).exists():
        raise SystemExit(f'{fid} 的參考圖不在：{job["ref"]}')
    if (RAW / fid).exists():
        raise SystemExit(f'{fid} 的舊原稿還在：先改名留底（.{STAMP}.png），'
                         '不然 codex_gen 會直接跳過、還印成功（坑 7）')
    if f'Save the image as {fid}' not in job['prompt']:
        raise SystemExit(f'{fid}：存檔指令的檔名跟工單的鍵對不上')
    if job['prompt'].count('Save the image as') != 1:
        raise SystemExit(f'{fid}：提示詞裡有兩句存檔指令，換檔名時漏換了一句')
    if STYLE not in job['prompt']:
        raise SystemExit(f'{fid}：事件圖少了 STYLE')
    # 菲菲的圖裡不可以留下球球（`make_feifei_result_art_jobs.py` 的自檢同一條）
    if 'feifei' in fid:
        p = job['prompt']
        for ok in ('Never replace her with a grey tabby cat in a navy ninja outfit.',):
            p = p.replace(ok, '')
        for bad in ('grey tabby', 'gray tabby', '球球', 'ninja cat', 'NINJA CAT'):
            if bad in p:
                raise SystemExit(f'{fid}：菲菲的提示詞裡還留著「{bad}」，會被畫成球球')
    # 這批的重點：世界觀裡沒有貨幣。b／c 兩批一定要帶 FISH
    if fid in ('event_gambling_rats_r0.png', 'event_feifei_gambling_rats_r0.png',
               'event_medicine_cat_r1.png') and 'THERE ARE NO COINS' not in job['prompt']:
        raise SystemExit(f'{fid}：少了「沒有貨幣」那段硬規則，還是會畫成金幣')

out = JOBS / f'fix_0916_{batch}.json'
out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
sys.stdout.write(f'{len(jobs)} 張 → {out.name}\n')
for fid, job in jobs.items():
    sys.stdout.write(f'  {fid}  ← {job["ref"]}\n')
