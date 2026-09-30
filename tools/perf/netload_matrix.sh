#!/usr/bin/env sh
# 慢網路修正（2026-09-30 netload）前後對照：同一套流程、同一台機器、冷快取、HTTP/1.1。
#   sh tools/perf/netload_matrix.sh <插旗版資料夾> <輸出夾> [情境...]
# 情境：n16 r16 n08 r08 f20 hr08（n＝正常節奏、r＝急性子；16＝1.6 Mbps/150 ms、08＝0.8 Mbps/300 ms、f20＝20 Mbps/40 ms 急性子；
#   hr08＝HTTP/2 急性子 0.8 Mbps，要 PERF_CERT_DIR 放自簽的 key.pem／cert.pem，不進倉庫；
#   q20＝同 c20 但封面出來 0.3 秒就按（網速還在量）；c20 c16 c08＝續玩：先存一局、清快取、封面出來 1.5 秒按「續玩」，量到地圖為止，網速同 f20／16／08）
# 只開本機網址（audio_trace.mjs 自己起伺服器、連接埠由系統挑，不會撞到別的代理）。
DIST="$1"; OUT="$2"; shift 2
SCEN="${*:-n16 r16 n08 r08 f20}"
for s in $SCEN; do
  for hero in ninja feifei; do
    case "$s" in
      n16) M=1.6; R=150; RUSH=0 ;;
      r16) M=1.6; R=150; RUSH=1 ;;
      n08) M=0.8; R=300; RUSH=0 ;;
      r08) M=0.8; R=300; RUSH=1 ;;
      f20) M=20;  R=40;  RUSH=1 ;;
      hr08) M=0.8; R=300; RUSH=1 ;;
      c20) M=20;  R=40;  RUSH=1 ;;
      c16) M=1.6; R=150; RUSH=1 ;;
      c08) M=0.8; R=300; RUSH=1 ;;
      q20) M=20;  R=40;  RUSH=1 ;;
    esac
    if [ "$RUSH" = 1 ]; then
      export PERF_TITLE_WAIT=300 PERF_SELECT_WAIT=300 PERF_MAP_WAIT=300 PERF_CLICK_GAP=800
    else
      unset PERF_TITLE_WAIT PERF_SELECT_WAIT PERF_MAP_WAIT PERF_CLICK_GAP
    fi
    case "$s" in h*) export PERF_H2=1 ;; *) unset PERF_H2 ;; esac
    case "$s" in c*) export PERF_CONTINUE=1 PERF_TITLE_WAIT=1500 ;; q*) export PERF_CONTINUE=1 PERF_TITLE_WAIT=300 ;; *) unset PERF_CONTINUE ;; esac
    echo "=== $s $hero ==="
    PERF_DIST="$DIST" PERF_HERO="$hero" PERF_MBPS="$M" PERF_RTT="$R" node tools/perf/audio_trace.mjs "$OUT" "${s}_${hero}" 2>&1 | grep -v '^\s*$' | tail -6
  done
done
