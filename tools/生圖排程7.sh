#!/bin/sh
# 收尾第三輪（2026-09-13 04:10）。取代排程 5／6——那兩支被稽核抓到四個洞，整支重寫。
#
# 順序：走鐘 5 張重生 → 事件結果圖 61 張。**一次只跑一批**（codex_gen 規則 1）。
#
# 稽核抓到、這一版修掉的（原因寫在各段旁邊）：
#   高-1 那 5 張的原稿還在 codex_raw，codex_gen 會「已存在跳過」＝整批空轉
#        → 已在跑這支之前把原稿改名成 .previous-20260913.png 留底
#   高-2 xuli 是牌面，看門狗看到 webp 已存在就不再收 → 這裡自己叫 add_card_art.py
#   中-12 用萬用字元收圖會掃到她專屬事件的舊圖（包含那張膨脹成球的 signal_r1），
#        每 15 分鐘重推一次 → 改成「工單的鍵 ∩ codex_raw 實際有的」
#   低-13 `ls a b c && cd ../..` 只要缺一個檔就不會 cd 回去，下一行在錯的目錄跑
#        → 改成把 cd 包在命令替換的子殼裡
#   低-14 生圖整批夭折時 log 不會有「結束：」，`until` 會等到天亮
#        → 開跑前先刪舊 log，等待迴圈加次數上限
set -u
cd /f/ClaudeWork/qiuqiu-coop
L=/c/Users/yayax/AppData/Local/Temp

# 依工單的鍵，列出 codex_raw 裡真的存在、而且還沒進倉的那些（留底檔不算）。
#
# **不可以用 `print()`**（2026-09-13 踩到）：Windows 上的 Python 會把每行結尾寫成
# `\r\n`，殼的命令替換只吃掉最後的換行、`\r` 會留在每個檔名屁股後面，
# 於是 `add_event_art.py` 的 `name.endswith(".png")` 全部不成立，
# 整批印「檔名要是 event_<事件編號>.png，略過」——只有最後一個檔會成功。
# 症狀很難看出來：印的是「收了 60 張」，實際上只進去 1 張。
# 所以這裡用 `sys.stdout.write` 自己接 `\n`，並且在殼這邊再 `tr -d '\r'` 一次。
#
# 順便加「還沒進倉的才列」：原本每一輪都把整批重新去背一次，
# 60 張 1024x768 純 Python 逐像素跑，是後來系統記憶體吃緊的主因。
pending() {
  python - "$1" <<'PY' | tr -d '\r'
import json, pathlib, sys
sys.path.insert(0, 'tools')
from manifest_io import read_for_scan          # 寫的人正在覆寫時會自己重試，不會整輪空轉
raw = pathlib.Path('tools/codex_raw')
m = read_for_scan()
out = []
for k in json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')):
    src = raw / k
    if not src.exists() or '.previous-' in k:
        continue
    dst = pathlib.Path('public') / m['bg'].get('bg/' + k[:-4], '')
    # **判準是「原稿比成品新」不是「還沒進倉」**（2026-09-13 稽核 高-1）。
    # 「重生」這件事的定義就是「鍵已經在 manifest 裡、但圖是壞的」，
    # 用「還沒進倉」當條件的話重生批次永遠收不到，腳本還會印「已經收乾淨了」。
    if 'bg/' + k[:-4] not in m['bg'] or not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime:
        out.append(k)
sys.stdout.write('\n'.join(out))
PY
}

# 等一批生圖收尾。$1＝log、$2＝最多等幾分鐘。回傳 1 代表等爆了。
wait_batch() {
  n=0
  until grep -q '^結束：' "$1" 2>/dev/null; do
    n=$((n + 1))
    if [ "$n" -gt "$2" ]; then
      echo "!! 等了 $2 分鐘還沒看到「結束：」，那批可能整個夭折了，看一下 $1"
      return 1
    fi
    sleep 60
  done
  return 0
}

# ---- 第一批：走鐘 5 張 ----
rm -f $L/feifei_offmodel.log
python tools/codex_gen.py tools/codex_jobs/feifei_offmodel_redo.json \
  --ref tools/ref/feifei_ref.png > $L/feifei_offmodel.log 2>&1
echo "== 走鐘 5 張重生完 =="
tail -1 $L/feifei_offmodel.log

files=$(pending tools/codex_jobs/feifei_offmodel_redo.json)
evs=$(echo "$files" | grep '^event_' || true)
cards=$(echo "$files" | grep '^card_' || true)
[ -n "$evs" ] && { python tools/add_event_art.py $evs || echo "!! 事件圖進倉失敗"; }
# 牌面自己收：看門狗只收「還沒有 webp」的，xuli 早就有一張舊的，它不會再碰
[ -n "$cards" ] && { python tools/add_card_art.py $cards || echo "!! 牌面進倉失敗"; }

# ---- 第二批：事件結果圖 61 張（約五個半小時，邊生邊收）----
rm -f $L/feifei_result.log
python tools/codex_gen.py tools/codex_jobs/feifei_result_art.json > $L/feifei_result.log 2>&1 &
GEN=$!

while kill -0 $GEN 2>/dev/null; do
  sleep 900
  files=$(pending tools/codex_jobs/feifei_result_art.json)
  if [ -n "$files" ]; then
    # 印的是 `add_event_art.py` 自己報的「已併入 N 筆」，**不是待收清單的長度**
    #（2026-09-13 稽核 中-4）：逐檔跳過不影響清單長度，`\r` 那個雷就是被這個假數字
    # 藏了五個半小時。它現在有圖沒進倉就會離開碼非 0，所以失敗也看得到。
    if python tools/add_event_art.py $files >> $L/feifei_result_integrate.log 2>&1; then
      echo "$(date +%H:%M) $(grep -c '^事件插圖' $L/feifei_result_integrate.log) 張（累計）"
    else
      echo "$(date +%H:%M) !! 有圖沒進倉，看 $L/feifei_result_integrate.log"
    fi
  fi
done
wait $GEN 2>/dev/null || true

echo "== 生圖結束 =="
tail -1 $L/feifei_result.log
files=$(pending tools/codex_jobs/feifei_result_art.json)
if [ -n "$files" ]; then
  python tools/add_event_art.py $files || echo "!! 最後這輪進倉失敗，等人看一眼"
else
  echo "（沒有待收的，前面幾輪已經收乾淨了）"
fi
echo "== 全部結束 =="
