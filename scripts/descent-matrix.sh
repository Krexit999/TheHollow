#!/usr/bin/env bash
# A.42 — the descent measurement matrix.
#
# Two arms (idle, active), three seeds each, ONE binary, whatever extra flags
# you pass applied to every run — so a baseline and a treatment differ by the
# flag and nothing else. Every arm writes a depth log (first-arrival time per
# depth), which is what time-to-depth is actually made of. Read the ratio with
# scripts/descent-ratio.ts.
#
#   bash scripts/descent-matrix.sh 12 g55 --bay 55
#   bash scripts/descent-matrix.sh 12 g40
set -u
HOURS="${1:-12}"
TAG="${2:-base}"
shift 2 || true
OUT="sim-out/descent"
mkdir -p "$OUT"

run() { # policy seed extra...
  local policy="$1" seed="$2"; shift 2
  local name="${TAG}-${policy}on-${seed}"
  npx tsx scripts/sim.ts --hours "$HOURS" --policy "$policy" --quiet --log 60 \
    --out "$OUT/$name.csv" --depthlog "$OUT/$name.depth.csv" "$@" \
    > /dev/null 2> "$OUT/$name.log"
}

for seed in 1 2 3; do
  run idle   "$seed" "$@" &
  run active "$seed" "$@" &
done
wait
echo "matrix done: $TAG ${HOURS}h extra='$*'"
