#!/bin/sh
# 2026-09-13 傍晚：連線牌 36 張整批排成聯絡表用眼睛看完，抓到 5 張要重做。
#
#   球球版 2：card_huannimangyixia（畫成兩隻大眼睛的胖幼貓，完全不是球球）
#             card_genzhewoduohao（紫煙畫成四邊筆直的方形色板，去背去不掉）
#   菲菲版 3：card_feifei_kaoniyixia（左邊那隻沒有蝴蝶結）
#             card_feifei_zhaonishuodeda（頭髮變成頭頂沖天辮，對不上參考圖）
#             card_feifei_tieshazhang（沙塵跟紫煙同一個毛病，方形色板）
#
# 提示詞已經重新長過，含 art_rules 新加的 NO_PANEL 那一段。
# 舊原稿已改名 .previous-2026-09-13.png 留底——不留底的話 codex_gen 會「已存在跳過」，
# 整批空轉還印成功（第九個雷）。
set -u
cd /f/ClaudeWork/qiuqiu-coop
L=/c/Users/yayax/AppData/Local/Temp

integrate() {
  files=$(python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
sys.stdout.write('\n'.join(d))          # 不要用 print：Windows 會多一個 \r（第十個雷）
" "$1" | tr -d '\r')
  # shellcheck disable=SC2086
  python tools/add_card_art.py $files
}

rm -f $L/coop2_redo2_n.log
python tools/codex_gen.py --ref tools/ref/hero_combat_ref.png tools/codex_jobs/coop2_redo2_ninja.json \
  > $L/coop2_redo2_n.log 2>&1
echo "== 球球版 2 張完 =="
tail -1 $L/coop2_redo2_n.log
integrate tools/codex_jobs/coop2_redo2_ninja.json

rm -f $L/coop2_redo2_f.log
python tools/codex_gen.py --ref tools/ref/feifei_ref.png tools/codex_jobs/coop2_redo2_feifei.json \
  > $L/coop2_redo2_f.log 2>&1
echo "== 菲菲版 3 張完 =="
tail -1 $L/coop2_redo2_f.log
integrate tools/codex_jobs/coop2_redo2_feifei.json

# 進倉之後一定要再掃一次灰膜：牌面那一櫃是今天才補進 check_haze 的（第十二個雷）
python tools/check_haze.py
echo "== 重做批結束（記得再排一次聯絡表用眼睛看）=="
