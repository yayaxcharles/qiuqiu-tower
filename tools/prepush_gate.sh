#!/bin/sh
# 推上線之前的閘門（2026-09-14）。由 .git/hooks/pre-push 呼叫，不用手動跑。
#
# 為什麼要有這個：2026-09-13 一天之內部署紅了八次，線上停在凌晨那一版一整天。
# 八次的病根分兩種，這支擋第一種、`tools/deploy.sh` 擋第二種：
#
#   1. **推出去的東西本身就是紅的。** 除錯畫面那筆（`19f36ce`）在本機根本沒跑完測試就推了，
#      掃描測試在雲端當場紅；而且就算本機跑過，我看結果用的是 `tail -3`，剛好把紅的那行截掉。
#   2. **推完沒看部署。** `git push` 成功只代表檔案傳上去了，雲端的測試跟打包紅了照樣是「推成功」。
#
# 這裡的做法是**在「要推的那一筆提交」上**跑一次跟雲端 `deploy.yml` 一樣的兩步
#（`npm test`、`npm run build`），紅了就不讓它推出去。
#
# **為什麼不直接在工作目錄跑**：工作目錄裡常常有還沒提交的東西（生到一半的圖、改到一半的檔）。
# 最常見的雲端紅燈是「新檔案忘了 git add」——工作目錄有、提交裡沒有，本機跑當然是綠的。
# 所以另開一個暫時的工作目錄，只放那一筆提交的內容。
#
# **node_modules 只借鎖檔裡有的那些套件**（2026-09-23 稽核 中-2；`tools/build_gate_node_modules.mjs`），
# 不是借整份本機的 node_modules。本機這份裝了 8 個鎖檔沒列的套件（`@types/node`、`happy-dom`
# 那些），借整份的話「測試或工具用到沒宣告的 node: 函式」「測試偷用 happy-dom」這兩種錯，
# 閘門會綠、要到雲端 `npm ci`（照鎖檔裝，沒有那 8 個）之後才紅——閘門就形同虛設。
# 照鎖檔逐一連結（不重裝，還是用 junction，只是連到個別套件不是整個資料夾），一次推送多花的時間是毫秒級的。
#
# 只擋會觸發部署的推送：推到 coopdeploy 或 origin 的 main。其他分支照常推。
# 真的要跳過（例如只改文件又急著推）：git push --no-verify —— 但那樣就是自己負責。

set -u
remote="$1"
case "$remote" in
  coopdeploy|origin) ;;
  *) exit 0 ;;
esac

zero=0000000000000000000000000000000000000000
sha=""
while read -r local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_ref" = "refs/heads/main" ] && [ "$local_sha" != "$zero" ]; then
    sha="$local_sha"
  fi
done
[ -n "$sha" ] || exit 0

top=$(git rev-parse --show-toplevel)
common=$(cd "$(git rev-parse --git-common-dir)" && pwd)
tmp="$(cygpath -u "$TEMP")/qiuqiu_gate_$$"
log="$tmp.log"
short=$(git rev-parse --short "$sha")
# 鉤子是被 git 叫起來的，環境裡可能帶著指向「這個」工作目錄的 GIT_DIR；
# 不清掉的話，暫時工作目錄裡跑的任何 git 指令都會跑回原本那份
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX

cleanup() {
  cd "$top" || return
  # 先拆掉借來的套件連結、確認拆乾淨了才刪整個暫時工作目錄：
  # `node_modules` 底下每個套件、連同 `.bin`，各自是一個指到主資料夾的 junction；
  # 用 Node 自己的 `fs.rmSync` 刪（不是 `rm -rf`／`git worktree remove` 直接刪），
  # 是因為實測過 `fs.rmSync` 對 Windows junction 只會拆連結本身、不會順著連結
  # 把主資料夾裡真正的套件內容一起刪掉——這件事以前是用「整個 node_modules 就是
  # 一個大 junction」的寫法閃開，現在改成逐套件連結，這條安全網要跟著搬過來。
  if [ -e "$tmp/node_modules" ]; then
    node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true })" \
      "$(cygpath -w "$tmp/node_modules")" >/dev/null 2>&1
  fi
  if [ -e "$tmp/node_modules" ]; then
    echo "[推送閘門] 拆不掉借來的 node_modules 連結，暫時工作目錄先留著沒刪：$tmp"
    return
  fi
  git worktree remove --force "$tmp" >/dev/null 2>&1
  git worktree prune >/dev/null 2>&1
}
trap cleanup EXIT

echo "[推送閘門] 在 $short 上跑測試與打包（跟雲端一樣的兩步），約一到兩分鐘…"
git worktree prune >/dev/null 2>&1
git worktree add --detach "$tmp" "$sha" >/dev/null 2>&1 || { echo "[推送閘門] 開暫時工作目錄失敗"; exit 1; }

cd "$tmp" || exit 1
# 照這一筆提交自己的 package-lock.json 建 node_modules（見上面檔頭說明）；
# 來源路徑要轉成 Windows 形式——Node 是原生 Windows 執行檔，看不懂 Git Bash 的 `/f/...`
if ! node tools/build_gate_node_modules.mjs "$(cygpath -m "$top/node_modules")" > "$log" 2>&1; then
  echo "[推送閘門] ✗ 建立鎖檔限定的 node_modules 失敗："
  cat "$log"
  exit 1
fi
cat "$log"

if ! npx vitest run > "$log" 2>&1; then
  echo "[推送閘門] ✗ 測試紅了，這次不推。紅的是："
  grep -E "FAIL |Test Files |Tests " "$log" | head -20
  echo "（完整輸出：$(cygpath -w "$log")）"
  exit 1
fi
grep -E "Test Files |Tests " "$log"

# 型別檢查加 --preserveSymlinks（2026-09-23 稽核低-2 驗證時另外抓到的坑，不在原稽核清單上）。
# **為什麼要多這一步**：`node_modules` 底下是逐套件連結回主資料夾的 junction，
# tsc 預設遇到連結會解回它的真實路徑，於是從「真實路徑」往上找 node_modules 時，
# 又摸到主資料夾自己那份完整的 node_modules——裡面有本機多裝、鎖檔沒有的
# `@types/node`，型別檢查就在本機悄悄撿到它，跟雲端不一樣還是看不出來。
# 用 LF 副本＋這面旗子模擬雲端時，才真的抓到 `process`／`__dirname` 兩個全域沒宣告
# （`tools/node-build.d.ts` 已經補上）。下面這行本來就會被 `npm run build` 的
# `tsc --noEmit` 再跑一次（沒有這面旗子），這裡是刻意加嚴、不是重複。
if ! npx tsc --noEmit -p . --preserveSymlinks >> "$log" 2>&1; then
  echo "[推送閘門] ✗ 型別檢查沒過（用 --preserveSymlinks 模擬雲端沒有連結可以借型別），這次不推："
  grep -E "error TS" "$log" | head -20
  echo "（完整輸出：$(cygpath -w "$log")）"
  exit 1
fi

# 打包編號用這一筆提交（雲端的 Actions 用 GITHUB_SHA，是同一個值）：兩邊打出來的主程式才會一模一樣，
# `tools/deploy.sh` 第三步比對檔名才有意義（2026-09-14 用時間當編號，第三步必定對不上）
# 網址路徑照要推的遠端帶（`vite.config.ts` 的 `SITE_NAME`）：連線版倉庫是 qiuqiu-tower-coop、單機版是 qiuqiu-tower。
# 雲端照 GITHUB_REPOSITORY 決定同一個值，兩邊主程式才會一模一樣。
# 傳倉庫名不傳路徑：Git Bash 會把「/qiuqiu-tower/」這種環境變數換成 Windows 路徑（實測變 /Program Files/Git/…）
case "$remote" in
  coopdeploy) site_name=qiuqiu-tower-coop ;;
  *) site_name=qiuqiu-tower ;;
esac
if ! BUILD_TAG="$sha" SITE_NAME="$site_name" npm run build >> "$log" 2>&1; then
  echo "[推送閘門] ✗ 打包失敗（型別或 vite），這次不推："
  grep -E "error|Error" "$log" | head -20
  echo "（完整輸出：$(cygpath -w "$log")）"
  exit 1
fi

# 打包完檢查首載預算（2026-09-23 稽核 低-1；`tools/check_size.py`）。
# **這台或雲端沒有 python 就跳過，不可判紅**——2026-09-13 就是檢查工具（當時是 check_haze.py）
# 在雲端跑不動、被錯判成「抓到問題」，部署整整停了一天。check_size.py 本身只用標準函式庫，
# 不像 check_haze.py 還要賭 Pillow／numpy 在不在，但一樣先確認有 python 可跑，跑不動就用警告帶過。
size_py=""
for cand in python python3 py; do
  if command -v "$cand" >/dev/null 2>&1; then size_py="$cand"; break; fi
done
if [ -z "$size_py" ]; then
  echo "[推送閘門] ⚠ 這台找不到 python，跳過首載大小檢查（tools/check_size.py）——自己找時間手動跑一次"
else
  size_out=$("$size_py" tools/check_size.py 2>&1); size_rc=$?
  if [ "$size_rc" -eq 1 ]; then
    echo "[推送閘門] ✗ 首載大小超出預算，這次不推："
    echo "$size_out"
    exit 1
  elif [ "$size_rc" -ne 0 ]; then
    echo "[推送閘門] ⚠ 首載大小檢查跑不動（離開碼 $size_rc，不是超標，不判紅），自己找時間看一下："
    echo "$size_out" | tail -8
  fi
fi

# 中繼（worker/）不在 vite 與根 tsconfig 的範圍裡，跟雲端一樣另外查型別（審查 2026-09-15 中-1：CI 有、閘門沒有＝閘門綠、雲端紅）
if ! (cd worker && npx wrangler types >> "$log" 2>&1 && npx tsc --noEmit -p tsconfig.json >> "$log" 2>&1); then
  echo "[推送閘門] ✗ 中繼（worker/）型別檢查沒過，這次不推："
  grep -E "error|Error" "$log" | tail -20
  exit 1
fi

# 記下這一筆打出來的主程式檔名，`tools/deploy.sh` 部署完拿去跟線上比
main_js=$(ls dist/assets/ | grep -E '^main-.*\.js$' | head -1)
echo "$sha $main_js" > "$common/qiuqiu_gate_last"
echo "[推送閘門] ✓ 綠的，放行（主程式 $main_js）"
rm -f "$log"
exit 0
