#!/bin/sh
# 連線支援牌 18 張的牌面，球球版與菲菲版各一批（2026-09-13）。
# 一次只跑一批（codex_gen 規則 1），所以球球那批印出「結束：」才開菲菲那批。
#
# 生完進倉之後**還要手動把牌上的 `hidden` 拿掉**——那是「圖還沒生，先不進池子」的
# 暫存旗標，拿掉的時機沒有人會提醒你（`coopcards.test.ts` 有一條在盯著張數）。
set -u
cd /f/ClaudeWork/qiuqiu-coop
L=/c/Users/yayax/AppData/Local/Temp

integrate() {
  files=$(python - "$1" <<'PY' | tr -d '\r'
import json, pathlib, sys
raw = pathlib.Path('tools/codex_raw')
out = [k for k in json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')) if (raw / k).exists()]
sys.stdout.write('\n'.join(out))
PY
)
  if [ -n "$files" ]; then
    python tools/add_card_art.py $files || echo "!! 進倉失敗，等人看一眼"
  else
    echo "!! $1 一張都沒生出來"
  fi
}

rm -f $L/coop2_ninja.log
python tools/codex_gen.py --ref tools/ref/hero_combat_ref.png tools/codex_jobs/coop2_cards.json \
  > $L/coop2_ninja.log 2>&1
echo "== 球球版 18 張完 =="
tail -1 $L/coop2_ninja.log
integrate tools/codex_jobs/coop2_cards.json

rm -f $L/coop2_feifei.log
python tools/codex_gen.py --ref tools/ref/feifei_ref.png tools/codex_jobs/coop2_cards_feifei.json \
  > $L/coop2_feifei.log 2>&1
echo "== 菲菲版 18 張完 =="
tail -1 $L/coop2_feifei.log
integrate tools/codex_jobs/coop2_cards_feifei.json

echo "== 全部結束（記得把牌上的 hidden 拿掉）=="
