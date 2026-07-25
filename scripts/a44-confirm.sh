#!/usr/bin/env bash
# A.44 confirmation — the re-rated ladder + the fixed horizon, 12h, both arms.
#
# One binary, one flag apart on the horizon basis, so the deep-end question
# (checkpoint 3) gets a baseline measured by the SAME code as the treatment.
# Two seeds per cell: this project has been wrong from n=1 twice.
#
# Answers:
#   - what Breach 1 actually pays now (the `ladder:` line)
#   - whether the deep-end crawl moves once permanent income is not starved
#   - RTP per layer under the re-rate
#
#   bash scripts/a44-confirm.sh
set -u
OUT="sim-out/a44-confirm"
mkdir -p "$OUT"
rm -f "$OUT/DONE.txt"

run() { # policy horizon seed
  local policy="$1" horizon="$2" seed="$3"
  local name="${policy}-${horizon}-s${seed}"
  npx tsx scripts/sim.ts --hours 12 --policy "$policy" --horizon "$horizon" \
    --quiet --log 60 --income \
    --out "$OUT/$name.csv" --depthlog "$OUT/$name.depth.csv" \
    > /dev/null 2> "$OUT/$name.log"
}

for seed in 1 2; do
  run idle   income "$seed" &
  run active income "$seed" &
done
wait
for seed in 1 2; do
  run idle   field "$seed" &
  run active field "$seed" &
done
wait
echo "ALLDONE $(date -u +%FT%TZ)" > "$OUT/DONE.txt"
