// canon-curation task: migrations-retire — the fleet-wide migration RETIRE pass
// (per-project-scheduling DESIGN §6, table 2). `agent_model: 'none'` with
// `agent_preprocessing: 'node worker.mjs'`: the whole pass is deterministic code
// the scheduler runs as a subprocess — no agent, no dispatch issue. It probes the
// fleet for each migration's legacy shape and, for any migration the whole fleet
// has left behind AND demonstrably converged past (per-repo stamp quiescence),
// stages an irreversible retirement as ONE never-auto-merged PR the canon's own CI
// gates. Fleet-scoped: runs only on the canon repo's scheduler (canon-only pack).
//
// Self-contained (imports nothing): the whole contract is this default export. The
// worker owns the fleet reads (a subprocess can't receive the collected signals),
// so this task declares no precondition_signals — it fires daily+1h and the worker
// no-ops cheaply when nothing is proven retirable.

export default {
  id: 'migrations-retire',
  frequency: 'daily+1h',                 // the 05:00 slot — after the night's baselining stamps advance (DESIGN §2)
  precondition_signals: [],              // the worker enumerates the fleet itself over FLEET_GITHUB_TOKEN
  agent_model: 'none',                   // pure code — no agent (agent-preprocessing DESIGN §4)
  expected_outcome: 'open-pr',           // stages retirement as one CI-gated PR, never auto-merged
  agent_instructions: 'task.md',         // vestigial for a none task; the real work is the preprocessing command
  agent_preprocessing: 'node worker.mjs',
  agent_preprocessing_timeout: 600,      // enumerate the fleet + probe each migration across every member — a wide REST-read bound

  // Fire daily+1h unconditionally: the retire decision needs cross-repo probing
  // that only the worker (with the fleet PAT) can do, and a precondition is pure
  // sync code over the collected signals — it can't enumerate the fleet. The
  // worker is the guard: it retires nothing unless the whole fleet is proven
  // converged-and-quiet, and a dry run is a cheap no-op.
  precondition() {
    return { run: true, reason: 'daily fleet migration-retire probe (the worker retires only a proven-quiescent migration)' };
  },
};
