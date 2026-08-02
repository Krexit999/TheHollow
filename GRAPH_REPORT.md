# GRAPH REPORT

The graph is never regenerated (project rule). This file records what has changed
since it was built, so a query against it can be corrected rather than trusted.

## SINCE LAST GRAPH

`graphify-out/graph.json` carries `built_at_commit: 147814a` — **the initial
commit, 94 commits back.** Everything below was written after it and therefore
has **no node in the graph at all**:

| Not in the graph | Why it matters |
|---|---|
| `src/engine/systems/plant.ts` | Flow/Surge, the Hearth, machine tiers |
| `src/engine/systems/roll.ts` | the Roll — contents, clearance, visibility |
| `src/engine/systems/standoff.ts` | combat |
| `src/engine/systems/crusher.ts` | the Loam bootstrap's second machine |
| `src/ui/components/roll.tsx`, `plant.tsx`, `standoff.tsx` | their panels |

### The failure this caused

An audit for "state populated on render rather than on tick" queried the graph's
`ensure*` node list. It returned six entries — `ensureContentLoaded`,
`ensurePlots`, `ensureNpc`, `ensureStateShape`, `ensureSized`, `ensurePolarity` —
and **none of the three slices the audit was actually about**. That reads as
"audited, nothing found". It was not a gap in the query; the three files did not
exist when the graph was built.

The graph did not lie about anything it knew. It was asked a question about a
part of the codebase it has never seen, and a stale index answers that question
with silence, which is indistinguishable from a pass.

### The repair

Not a better graph query — **`scripts/audit-ensure.ts`**, which reads `src/`
directly and is repeatable:

```bash
npx tsx scripts/audit-ensure.ts
```

It reports every optional self-initialising slice (`state.x ??= defaultX()`),
every `ensure*` and whether any of its call sites is on the engine tick path,
and every reader that falls back to a plausible empty value without ensuring
first. It exits non-zero if a slice is reachable only from a render path — the
exact shape of the Roll/hazard-0 bug.

One note on the instrument itself: its first run flagged `contentsOf` as an
unguarded fallback, because the comment above `contentsOf` quotes the old
unguarded line in order to explain the fix. It strips comments now. An audit
that reads its own documentation as code flags every bug it has already fixed,
forever.

### Standing rule

Use the graph to find where to *look*, never to conclude what is *there* — and
before concluding "not found", check `built_at_commit` against `git rev-list
--count <commit>..HEAD`.
