#!/usr/bin/env bash
# A.42 — the descent measurement matrix.
#
# Four arms, three seeds each, ONE binary: idle and active, with THE SETTLING
# on (the shipped tuning, or whatever $SETTLE names) and off (the pre-A.42
# curve, bit-identical to the A.41 baselines). Every arm writes a depth log —
# first-arrival time per depth — which is what time-to-depth is actually made
# of. Read the ratio with scripts/descent-ratio.ts.
#
#   bash scripts/descent-matrix.sh <hours> <tag> [settle-spec]
set -u
HOURS="${1:-12}"
TAG="${2:-base}"
SETTLE="${3:-}"
OUT="sim-out/descent"
mkdir -p "$OUT"

run() { # policy arm seed extra-args...
  local policy="$1" arm="$2" seed="$3"; shift 3
  local name="${TAG}-${policy}${arm}-${seed}"
  npx tsx scripts/sim.ts --hours "$HOURS" --policy "$policy" --quiet --log 60 \
    --out "$OUT/$name.csv" --depthlog "$OUT/$name.depth.csv" "$@" \
    > /dev/null 2> "$OUT/$name.log"
}

for seed in 1 2 3; do
  run idle   off "$seed" --settle off &
  run active off "$seed" --settle off &
  if [ -n "$SETTLE" ]; then
    run idle   on "$seed" --settle "$SETTLE" &
    run active on "$seed" --settle "$SETTLE" &
  else
    run idle   on "$seed" &
    run active on "$seed" &
  fi
done
wait
echo "matrix done: $TAG ${HOURS}h settle='${SETTLE:-shipped}'"
