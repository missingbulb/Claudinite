// canon-curation task: migrations-retire — the migration TTL ARCHIVER
// (per-project-scheduling redesign). `agent_model: 'none'` with
// `agent_preprocessing: 'node worker.mjs'`: the whole pass is deterministic code
// the scheduler runs as a subprocess — no agent, no dispatch issue. It moves any
// migration record past its 7-day TTL from `active_migrations/` to the canon-only
// `migrations-old/` archive (still applies for backfill; stops shipping + stops
// tolerating), delivered as one PR. No fleet status and no fleet PAT — the decision
// is a pure age comparison over the canon's own records. Canon-only pack, so it
// runs only on the canon's scheduler.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'migrations-retire',
  frequency: 'daily+1h',                 // a daily housekeeping sweep — the 05:00 slot
  precondition_signals: [],              // no signal — the worker reads the canon's own migration records
  agent_model: 'none',                   // pure code — no agent (agent-preprocessing DESIGN §4)
  expected_outcome: 'open-pr',           // stages the archival move as one reviewable PR
  agent_instructions: 'task.md',         // vestigial for a none task; the real work is the preprocessing command
  agent_preprocessing: 'node worker.mjs',
  agent_preprocessing_timeout: 180,      // a handful of REST calls (read/create/delete per aged record) — a tight bound

  // Fire daily+1h unconditionally: the worker compares each active record's age to
  // the TTL and no-ops cheaply when nothing has aged out. A code precondition can't
  // read the canon's migration records (it's pure sync over collected signals), so
  // the age check lives in the worker.
  precondition() {
    return { run: true, reason: 'daily migration-TTL sweep (the worker archives only records past the 7-day TTL)' };
  },
};
