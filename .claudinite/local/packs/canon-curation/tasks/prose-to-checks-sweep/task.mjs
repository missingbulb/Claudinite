// canon-curation task: prose-to-checks-sweep — mine the corpus's EXISTING prose
// (pack RULES.md, skill SKILL.md) for always-testable rules the conversion missed
// and convert the strongest ones (per-project-scheduling DESIGN §6, table 2).
// NOT fleet-scoped — a canon-local task over the canon's OWN prose, so it declares
// no signals and reaches no other repo. Daily per owner decision (§11.8): it works
// the standing backlog a slice at a time, and no-ops cheaply once the backlog runs
// dry (the worker finds nothing convertible and opens no PR).
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'prose-to-checks-sweep',
  frequency: 'daily',                    // the 04:00 slot — daily backlog work (owner decision §11.8)
  precondition_signals: [],              // canon-local: it mines the STANDING corpus, not a windowed signal
  agent_model: 'opus',                   // judging convertibility and authoring checks + fixtures is heavy judgment
  expected_outcome: 'open-pr',           // converts prose to checks in an owner-approved PR
  agent_instructions: 'task.md',
  agent_execution_timeout: 2700,         // reading the corpus + authoring a check with fixtures — generous bound

  // The backlog is pre-existing prose that no day's commits create or clear, so
  // there is no windowed trigger to gate on — the task fires daily and the worker
  // works whatever convertible prose remains, opening a PR only when it converts
  // something. A dry corpus is a cheap no-op (find nothing → open nothing), which
  // is the throttle; a code precondition can't cheaply know the backlog is empty.
  precondition() {
    return { run: true, reason: 'daily prose-to-checks backlog sweep (no-ops cheaply when the corpus is dry)' };
  },
};
