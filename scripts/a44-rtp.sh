#!/usr/bin/env bash
# A.44 checkpoint 4 — THE FIRST HONEST FOUR-LAYER RTP.
#
# Pillar 6 has only ever been verified for the Collapse layer. Three things
# blocked the rest, all fixed now:
#   1. one global pending claim, so the ~15-minute rung starved the ~12-hour ones
#   2. `original` looked up in the shell being LANDED IN, where it is 0 by
#      definition after a cross-shell reset — Breach could not record a sample
#      even with the slot free
#   3. the policy never dispatched `spiral` at all
#
# And the numbers must come from a REAL climb. `--scenario recursion` primes
# depthRecords before the clock starts, which backfilled every first-arrival to
# ~1s and made RTP read 433–813%: the instrument fed the answer it measures.
# Seeded depths are now marked unmeasurable, so these runs earn their peaks.
#
# 48h reaches Breach 1 at ~12h and gives the later, faster breaches room to
# stack toward a Recursion. Two arms only — CPU saturation produced an
# unreproducible test flake last checkpoint.
#
#   bash scripts/a44-rtp.sh
set -u
OUT="sim-out/a44-rtp"
mkdir -p "$OUT"
rm -f "$OUT/DONE.txt"

run() { # policy
  local policy="$1"
  npx tsx scripts/sim.ts --hours 48 --policy "$policy" --combat optimal \
    --quiet --log 120 --income \
    --out "$OUT/$policy.csv" --depthlog "$OUT/$policy.depth.csv" \
    > /dev/null 2> "$OUT/$policy.log"
}

run active &
run idle &
wait
echo "ALLDONE $(date -u +%FT%TZ)" > "$OUT/DONE.txt"
