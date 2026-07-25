#!/usr/bin/env bash
# A.44 — second/third seed on the A.43 12h deep-end confirmation.
#
# Same binary, same flags, NO extra flags — identical to the run that produced
# sim-out/a43/confirm-*.  The sim's RNG is unseeded Math.random, so re-running
# the same command IS a new seed.  Together with the A.43 run this gives n=3
# per arm, which is what "median across seeds" needs.
#
# Question: does R collapse to ~1.0 over Loam d140->d150 on more than one seed,
# or was the identical 167/168 min a coincidence?
#
#   bash scripts/a44-seed2.sh
set -u
OUT="sim-out/a44-seeds"
mkdir -p "$OUT"
rm -f "$OUT/DONE.txt"

run() { # policy seed
  local policy="$1" seed="$2"
  local name="s${seed}-${policy}"
  npx tsx scripts/sim.ts --hours 12 --policy "$policy" --quiet --log 60 \
    --out "$OUT/$name.csv" --depthlog "$OUT/$name.depth.csv" \
    > /dev/null 2> "$OUT/$name.log"
}

for seed in 2 3; do
  run idle   "$seed" &
  run active "$seed" &
done
wait
echo "ALLDONE $(date -u +%FT%TZ)" > "$OUT/DONE.txt"
