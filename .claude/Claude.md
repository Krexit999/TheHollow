# Token discipline

- Read PILLARS.md and LEDGER.md every session. Nothing else by default. Read only the
  SPEC.md sections the phase touches. Never read BUILD_LOG.md unless you need a
  specific appendix.

- QUERY graphify-out/graph.json with a script (node -e / jq). Never read it into
  context. Use it to find call sites and consumers before grepping or opening files,
  then open only what it points at. Never regenerate the graph — append a "since last
  graph" section to GRAPH_REPORT.md instead. The graph is a stale claim, not evidence:
  verify before acting.

- Long sims write results to sim-out/<name>.md and exit. NEVER use a monitor or wake to
  collect them — a wake reloads the entire context to retrieve a few numbers. Read the
  file at the start of the next session.

- Run only the verification the phase actually needs. Skip the sim suite unless balance
  changed. State what you skipped and why.

- Match effort to the work. Architecture, diagnosis, and design decisions get real
  thinking. Mechanical follow-through — wiring recipe edges, adding content rows,
  applying an approved pattern — does not. Don't re-derive an approved plan.

- Reports: terse. What changed, what broke, what's unbuilt. Don't restate the plan,
  re-explain approved design, or quote code back.

- Delegate heavy reads to a Haiku subagent and take only its summary into the main
  context. Applies to: sim outputs, error logs, coverage reports, graph queries, and
  any file over ~500 lines. Never read those directly.