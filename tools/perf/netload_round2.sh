#!/usr/bin/env sh
# 慢網路修正第二輪（2026-10-01）量測：整組一次＋三項要附中位數的格子重跑。
#   PERF_CERT_DIR=<憑證夾> sh tools/perf/netload_round2.sh
O=tools/perf/out_netload
sh tools/perf/netload_matrix.sh dist-instr-after $O/after6 n16 r16 n08 r08 f20 hr08 c16 c08 q20 > $O/after6.log 2>&1
# 第 3 項：快網路 20 Mbps 前後各 5 次（after6 算後的第 1 次）
for i in 1 2 3 4 5; do sh tools/perf/netload_matrix.sh dist-instr-before $O/rep/before_$i f20 >> $O/rep.log 2>&1; done
for i in 2 3 4 5; do sh tools/perf/netload_matrix.sh dist-instr-after $O/rep/after_$i f20 >> $O/rep.log 2>&1; done
# 第 1 項：HTTP/2 慢網路主角空白，前後各 3 次（before2／after6 算第 1 次）
for i in 2 3; do sh tools/perf/netload_matrix.sh dist-instr-before $O/rep/before_$i hr08 >> $O/rep.log 2>&1; done
for i in 2 3; do sh tools/perf/netload_matrix.sh dist-instr-after $O/rep/after_$i hr08 >> $O/rep.log 2>&1; done
# 第 2 項：快網路、封面 0.3 秒按續玩，前後各 3 次（cont_before／after6 算第 1 次）
for i in 2 3; do sh tools/perf/netload_matrix.sh dist-instr-before $O/rep/before_$i q20 >> $O/rep.log 2>&1; done
for i in 2 3; do sh tools/perf/netload_matrix.sh dist-instr-after $O/rep/after_$i q20 >> $O/rep.log 2>&1; done
echo done >> $O/rep.log
