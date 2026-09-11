# -*- coding: utf-8 -*-
"""菲菲的序章四張劇情圖（2026-09-12）。

換角色就換整份序章——同一座塔，另一隻貓的理由。球球是「我要把師父帶回家」，
菲菲是「師父跟師兄都沒回來」。台詞在 `src/content/dialogue.ts` 的 `feifeiDialogue.prologue`，
這四張要跟那四句對得上。

**只有這四張非換不可**：其餘場景（塔、魔物、忍具、罐頭鋪、貓窩）跟誰在爬無關，共用。

參考圖用 `tools/ref/feifei_story_ref.png`（劇情合參表 ＋ 菲菲定裝，白底）：
一張圖裡要有球球、師父（平時／中魔兩態）跟菲菲，序章四張的角色才不會各長各的。

用法：
  python tools/make_feifei_story_jobs.py
  python tools/codex_gen.py tools/codex_jobs/feifei_story.json --ref tools/ref/feifei_story_ref.png
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "tools" / "codex_jobs"

# 參考圖裡有四個角色，每一張都要講清楚誰是誰——不講的話模型會把菲菲畫成球球換色
CAST = (
    "The attached reference sheet has FOUR characters, left to right:\n"
    "  (1) a small chibi GREY TABBY cat ninja with a navy headband and navy outfit - this is the BROTHER "
    "STUDENT (Qiuqiu). He is NOT the main character of these pictures.\n"
    "  (2) a tall calm straw-hat kung-fu cat in a cream robe with a black belt - the MASTER, normal form.\n"
    "  (3) the same master CORRUPTED - bristling fur, spiral violet eyes, violet miasma smoking off him.\n"
    "  (4) a slender chibi SIAMESE cat girl: creamy off-white body with dark seal-brown mask, ears, paws "
    "and tail, bright BLUE almond eyes, large pointed ears, a PLUM-PURPLE short kimono jacket with "
    "tied-back sleeves, dark leggings, a belt of small bamboo needle-tubes at the small of her back, and "
    "a cloth mask hanging loose around her neck. **SHE is the main character of every picture below.**\n"
    "Draw each character exactly as the reference shows them. Never give the Siamese girl grey tabby fur, "
    "a navy headband, or the brother's round body - she is a different cat, slimmer, with a narrow face.\n"
)

TAIL = (
    "\n\nFull scene illustration with background, landscape 1280x720. "
    "No text, no letters, no watermark, no border.\n"
    "Style: thick black outlines, FLAT colours with only subtle soft shading - not painterly, no heavy "
    "airbrushed shadows. Cute cartoon, not photorealistic. Faces in flat blocks of colour with hard edges "
    "between them, never a blurry gradient.\n"
    "Draw everything SOLID and OPAQUE - nothing transparent or see-through.\n"
    "Output 1280x720 PNG. Save the image as {fid} in the current directory and report the path."
)

SCENES = {
    # 第一句：師父那句「打得到人又不被打到，才叫功夫」。她記了三年，球球當耳邊風
    "feifei_still_teach.png":
        "Warm late-afternoon light in a wooden dojo courtyard. The straw-hat MASTER (normal form) stands "
        "calmly with one paw raised, mid-lesson. The little SIAMESE GIRL kneels close in front of him, "
        "listening hard, blue eyes wide, a row of needles laid out neatly on the mat in front of her. "
        "Off to one side and further back, the small grey tabby brother sprawls bored on his back, not "
        "listening. She is the closest and largest figure and clearly the subject. Cozy orange light.",
    # 第二句：紫光落下、師父中魔、球球追上去
    "feifei_still_corrupt.png":
        "Night. A tall ominous pagoda tower glows violet at its top and dark violet miasma pours down into "
        "the MASTER, who is on his knees clutching his head, fur bristling, eyes turning violet - draw him "
        "as the CORRUPTED form from the reference. In the foreground, the SIAMESE GIRL has frozen mid-step "
        "with both paws over her mouth, ears flat, utterly terrified. The grey tabby brother is already "
        "running past her toward the tower, a blur, his headband tails streaming. Cold blue-violet palette.",
    # 第三句：三天了，門口的針一根沒動
    "feifei_still_wait.png":
        "Dawn, three days later. The SIAMESE GIRL sits alone on the wooden step of the empty dojo, knees "
        "pulled up, staring out at the distant dark tower on the horizon. Two empty sleeping mats behind "
        "her in the doorway. A single dart is stuck in the post beside her. Quiet pale morning light, "
        "muted colours, a lot of empty space around her so the frame feels lonely. She is small in a wide "
        "shot but clearly the subject, lit brighter than her surroundings.",
    # 第四句：我很怕痛。可是總不能三個都不回來吧
    "feifei_still_depart.png":
        "Dawn at the huge gate of the dark pagoda tower, low angle so the tower looms enormous. The "
        "SIAMESE GIRL stands with her back half turned to the viewer, looking up at it, one paw pulling "
        "the cloth mask up over her muzzle, the other resting on the bamboo needle-tubes at her belt. Her "
        "tail is tucked low and her shoulders are tense - she is frightened and going in anyway. "
        "Morning light behind the tower.",
}


def main() -> None:
    jobs = {fid: CAST + "\nWHAT THIS PICTURE SHOWS: " + text + TAIL.format(fid=fid)
            for fid, text in SCENES.items()}
    out = OUT / "feifei_story.json"
    out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} 張 → {out.relative_to(ROOT)}")
    print("跑法：python tools/codex_gen.py tools/codex_jobs/feifei_story.json "
          "--ref tools/ref/feifei_story_ref.png")


if __name__ == "__main__":
    main()
