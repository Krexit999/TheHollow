#!/usr/bin/env bash
# A.44 — BREACH RTP, right-sized.
#
# Supersedes the 48h attempt, killed at 4h50m wall without finishing. That run
# was budgeted from a 12h Loam-only projection (~67 min) and undercounted by
# 4x+: past Breach 1 the run enters Ferrite and beyond, where far more systems
# tick per sim-second. So size to the BAND actually wanted.
#
# Breach 1 lands at ~11.8h (measured, sim-out/a43). 16h clears it with room for
# the arrival to resolve its return-to-peak, without paying for a Recursion the
# run almost certainly cannot reach anyway (7 breaches). If a Recursion does
# land, it is taken; the run is NOT stretched to force one.
#
# Two arms only — CPU saturation produced an unreproducible test flake earlier
# in this phase.
#
# The RTP instrument now records per-layer (A.44 checkpoint 4): one pending
# claim per rung, `original` supplied from the shell LEFT, and the Spiral
# dispatched at all. NO --scenario anywhere: a stipulated biography is
# disqualified from pillar-6 ratios and the sim refuses to print them.
#
#   bash scripts/a44-breach-rtp.sh
set -u
OUT="sim-out/a44-breach"
mkdir -p "$OUT"
rm -f "$OUT/DONE.txt"

run() { # policy
  local policy="$1"
  npx tsx scripts/sim.ts --hours 16 --policy "$policy" --combat optimal \
    --quiet --log 60 --income \
    --out "$OUT/$policy.csv" --depthlog "$OUT/$policy.depth.csv" \
    > /dev/null 2> "$OUT/$policy.log"
}

run active &
run idle &
wait
echo "ALLDONE $(date -u +%FT%TZ)" > "$OUT/DONE.txt"
