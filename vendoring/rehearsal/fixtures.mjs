// Fixture CONSUMERS for the baselining rehearsal (#593 phase 2).
//
// Each is a minimal repo in one of the shapes the fleet actually has, expressed
// as a path -> content map. They exist so a canon PR can be asked the question
// canon CI otherwise cannot answer: *if this change reached a consumer tonight,
// would that consumer still work?*
//
// Canon CI proves the canon is healthy, and that is not evidence about members —
// the canon's own packs are always already migrated, so a change that breaks
// every consumer passes it cleanly. #555 did exactly that.
//
// WHAT A SHAPE IS FOR. Not variety for its own sake: each shape is a distinct
// way the engine can break, drawn from a failure that really happened.
//
//   local-rules   a local pack with scoped rules and a bundled skill — the #555
//                 shape. A manifest contract change lands here first.
//   prose-only    a local pack with no rules at all: the manifest still has to
//                 validate, and a pack contributing zero rules must not be
//                 mistaken for a pack that failed to load.
//   canon-packs   no local pack. Isolates canon-side breakage from local-pack
//                 breakage, so a red rehearsal says which.
//   canon-home    a SECOND canon: a member declaring `claudinite-canon-curation`
//                 over a `packs/` shelf of its own. That pack's rules are blocking
//                 and they police a shelf, so the shape they can turn red is a repo
//                 that keeps one — which the canon home itself always satisfies and
//                 therefore proves nothing about. This is the only fixture whose
//                 tree carries a shelf, and it is what says the curation pack is a
//                 pack any canon can declare rather than one repo's local content.
//   dormant       a member that declares itself dormant. Its mount falls behind
//                 BY DESIGN, and the rehearsal must not read that as failure.
//   versioned-local
//                 a local pack that declares the manifest's `version` field. Local
//                 packs are repo-owned and versionless by contract, so the fleet
//                 shape this covers is the OTHER direction: a member that adopts a
//                 newly-added optional field must not be rejected by an engine that
//                 defines it. The vocabulary is closed, so every widening of it is
//                 only additive on paper until a consumer's own manifest carries the
//                 new key through validation. It carries `seedOps` and
//                 `adoptionHandover` for the same reason — and note that a LOCAL pack
//                 declaring either does nothing, because only the install flow reads
//                 them and local packs have no install; the fixture proves the
//                 manifest VALIDATES, which is the half a member can be broken by.
//                 It carries the field in BOTH spellings — the legacy integer and the
//                 date-anchored `<day>.<n>` (#1100) — because a widening that only
//                 accepts the new one rejects every member not touched since.
//                 Every future widening of the vocabulary belongs here too.
//                 `hidden` sits here on the same terms: it decides only whether the
//                 CANON's catalog names a pack, so a local one carrying it does nothing
//                 either, and validation is the half that could turn a member red.
//                 The dated pack also bundles a skill forcing itself for files (#1648): a
//                 consumer's own path-scoped skill must mount, index and load.
//   legacy-task   a local pack whose scheduled task still declares the DEPRECATED
//                 task-level `session_scope` — the shape a consumer that predates
//                 the 2026-08-09 retirement still has on disk. It holds the
//                 retirement HARMLESS to such a member: red if the field ever
//                 stops validating or any future check starts blocking on it —
//                 the ways an un-migrated member would stop converging. What it
//                 does NOT cover is the routing itself: the rehearsal runs the
//                 vendor + the sweeps, never the scheduler, so that a lingering
//                 field still routes to the fleet label is a unit test's job
//                 (packs/claudinite-tasks/test/session-scope.test.mjs).
//   code-work-env   a local pack whose agentless task carries a WORKER — the half no
//                 other shape has, and the half `task-code-work-env` (blocking, core)
//                 judges. A member's task code is member-owned and nothing converges
//                 it, so a rule that reads it can turn a member red overnight through
//                 no act of its own; this shape holds that harmless by carrying a
//                 worker that reads the code-work contract's variables and nothing else,
//                 which is what every member's task code already does. Its doc is a
//                 README rather than a `task.md` for the same reason from the other
//                 side: that is the shape `task-md-only-when-agentic` mandates, and
//                 the fixture is what proves the rule stays silent on it.
//   doc-commands  a member whose local pack RULES.md tells a reader what to run. A
//                 runnable command in prose is member-authored and nothing converges
//                 it, so `runnable-doc-commands` (blocking, basics) can turn a member
//                 red through no act of its own; this shape carries the four command
//                 shapes a member writes — a mount path, a repo-relative script, a
//                 bare filename, and a placeholder-rooted path naming a file it has —
//                 and says the rule stays silent on all of them.
//   references     a member on the writing-pack-prose references convention:
//                 marked rules resolving to a references.md, a `check:` entry,
//                 and unmarked legacy rules beside them. `references-integrity`
//                 (blocking, growth) reads member-authored prose, so this shape
//                 is what says a migrated member and an unmigrated one both stay
//                 green.
//   codes-an-extension
//                 a member declaring chrome-extension with a manifest and NO release
//                 pipeline. The pack absorbed chrome-extension-release (#1057), so its
//                 release rules — six of them blocking, and each asking for a file
//                 (release config, privacy page, README sections) — now reach every
//                 extension repo instead of only the ones that declared the release
//                 pack. This shape is what says the shipping gate holds them off a
//                 repo that only codes one; without it, canon CI proves nothing,
//                 because the canon publishes no extension.
//   growth-member a member enrolled in the growth lifecycle, carrying the local
//                 packs its capture runs write. The growth stages ship blocking
//                 work rules scoped to those runs, so this is the shape that
//                 answers whether an enrolled member's ORDINARY converge stays
//                 green under them.
//   old-workflows a member still holding the PREVIOUS shape of its two workflow
//                 files. `.github/workflows/` is the one path a converge cannot
//                 push — it is staged and lands as a PR somebody merges — so every
//                 workflow change spends an unbounded window with members running
//                 the old copy against the new engine. This shape is what says that
//                 window is harmless rather than assumed to be: it carries the
//                 pre-§15.16 workflow (whose drain RAN an executor inside the
//                 scheduler's concurrency group, with task secrets stamped into it)
//                 beside a current mount — and, since #877, one that still names
//                 the retired `tick.mjs` entry point the rename left a shim at.
//                 Its executor copy is the pre-#1119 one, triggering on the legacy
//                 ready spelling alone: a workflow's event trigger names labels
//                 LITERALLY, so a member on the old copy stops seeing label events
//                 the moment the engine writes the canonical spelling, and what this
//                 shape says is that such a member still converges — the hourly
//                 scheduler dispatch is the guaranteed delivery, and the lost event
//                 is latency, never work.
//   thin-workflows a member already holding the workflow shape this fleet is moving
//                 TO: no inline program at all, every job a single-line
//                 `run: node <module>` naming a file in the mount. It is
//                 `old-workflows` from the other end — that shape asks whether a
//                 member left behind still converges, this one asks whether a member
//                 that arrived does. The hazard it covers is specific to the shape:
//                 a workflow that names its logic by literal path is broken by a
//                 vendor set that does not ship that path, and the break is a queue
//                 that quietly stops draining rather than anything that goes red.
//   ungated-drain a member holding the workflow shape the fleet is ON today, which
//                 is a different question from `old-workflows`' museum piece: its
//                 scheduler DISPATCHES the executor (post-§15.16) but does so
//                 unconditionally, mapping no job output, because the drain gate
//                 (§15.30) arrived after its copy did. The engine it converges to
//                 writes a `pickable` output nothing there reads and drains the
//                 queue in one run — so what this shape says is that the gate's
//                 producer is inert where its consumer is missing, and such a
//                 member keeps its previous behaviour (an executor every hour)
//                 rather than losing its drain to an `if` it does not have.
//   custom-anchor-hour
//                 a member that moved `taskScheduler.dailyHour` off the default. Both
//                 of the cron's hours are derived from it now (DESIGN §17), so this
//                 is the shape that says the converge reads the repo's own schedule
//                 rather than stamping a constant. Getting it wrong is silent: the
//                 workflow parses, the runs happen, and every task simply fires
//                 before its anchor and lands a day late, forever.
//   pre-rules-index
//                 a member in the shape EVERY member has the night #807 reaches it:
//                 a CLAUDE.md of its own, no rules index, no import, no merge
//                 attribute. Nothing carries those to a member except the converge
//                 itself, and `rules-index-current` is blocking — so if the converge
//                 did not write all three in the same pass, this member goes red
//                 overnight through no act of its own. That is the whole question a
//                 migration record would otherwise have to answer, which is why this
//                 shape is the honest alternative to one here. It keeps its own
//                 CLAUDE.md content so the converge is also shown NOT to clobber a
//                 repo's instructions on its way in.
//
// A fixture's INSTALLED VERSIONS are set per MODE by the runner, never here — they
// are what selects migration records, and what the #328 anti-rewind guard compares
// against the canon checkout's own numbers. Both modes stay at or below canon, so
// the guard never fires and the rehearsal stays about the converge.
//
// ONE FIXTURE SPELLS THE SETTINGS FILE THE OLD WAY (`legacy-settings-name`), which
// is the shape every member is in until the #1252 rename record reaches it. The
// tolerance for that name is not a fixture detail: it is what the whole fleet runs
// on for the window between the engine landing and each member's own converge.

// The declaration every fixture shares, plus its own packs.
//
// `core` is prepended to every fixture's list because it is mandatory and every
// real member carries it — the 2026-08-14 forced pass put it in all 11
// non-dormant members and the canon home (#842). A fixture declaring only
// `basics` would model a shape the fleet no longer has, and would model it in
// the one direction that hides a regression: the `requires` closure vendors
// core's content either way, so the mount looks complete while `isActive` reads
// false, and every rule and task the pack owns silently does not run. The
// `core-undeclared` fixture below pins that shape deliberately, once, instead of
// it being every fixture's accidental default.
const checks = (packs, extra = {}) => JSON.stringify({
  packs: packs.includes('claudinite-lifecycle') ? packs : ['claudinite-lifecycle', ...packs],
  taskScheduler: { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 },
  // The installed versions are written per MODE by the runner (fresh vs stale).
  ...extra,
}, null, 2) + '\n';

const PACK_LOCAL_RULES = `import demo from './demo-rule.mjs';

export default {
  id: 'fixture-local',
  ruleRoutingGuidance: {
    belongs: 'the fixture project\\'s own invariants, for rehearsal purposes only',
    excludes: 'anything portable — that belongs in a canon pack',
  },
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [demo],
  workRules: [],
  skills: ['fixture-skill'],
};
`;

const DEMO_RULE = `const rule = {
  id: 'fixture-demo',
  severity: 'advisory',
  description: 'A rehearsal fixture rule that never fires',
  doc: 'RULES.md',
  why: 'it exists so the rehearsal can tell a pack that loaded from one that did not',
  run() { return []; },
};
export default rule;
`;

// The one pack a fixture publishes rather than runs — content on a second canon's
// shelf. It carries the two things the curation rules read of shelf content: a
// `version` (the whole delivery signal) and prose that narrates no enforcement.
const PACK_SHELF = `export default {
  version: '60831.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'the fixture canon\\'s own published practice, for rehearsal purposes only',
    excludes: 'anything about running a canon — that is the curation pack',
  },
  detect: null,
  marker: null,
  prose: 'RULES.md',
};
`;

const PACK_PROSE_ONLY = `export default {
  id: 'fixture-prose',
  ruleRoutingGuidance: {
    belongs: 'judgment this fixture project carries as prose, with no deterministic half',
    excludes: 'anything a check could enforce — that becomes a rule instead',
  },
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [],
  workRules: [],
};
`;

// A well-formed local task, declared entirely inside its own tasks/<name>/
// folder — exercises basics' scheduled-task shape rules (task-declaration-shape,
// task-declaration-matches-folder) against a consumer that actually schedules
// something, which no other fixture does (a task under `.claudinite/shared/` is
// canon-owned and structurally out of ctx.files, so it proves nothing about a
// consumer's OWN task). `id` deliberately equals its directory name and
// `agent_model: 'none'` keeps the fixture minimal (no agent_instructions to wire).
// The DATA form (task.json), which is what a member converges to; the two legacy
// fixtures below keep the module form a member may still carry.
const FIXTURE_TASK = `{
  "$schema": "../../../../../shared/packs/claudinite-tasks/task.schema.json",
  "id": "fixture-task",
  "description": "A rehearsal fixture task; it never runs.",
  "frequency": "weekly",
  "precondition_signals": [],
  "agent_model": "none",
  "expected_outcome": "none",
  "agent_preprocessing": "node prepare.mjs",
  "agent_preprocessing_timeout": 60
}
`;

const PACK_VERSIONED = `export default {
  id: 'fixture-versioned',
  version: 3,
  minEngineVersion: 1,
  hidden: true,
  seedOps: [{ template: 'RULES.md', dest: 'SEEDED-BY-FIXTURE.md' }],
  adoptionHandover: [{ step: 'Flip the fixture switch', breaks: 'nothing — this pack is a rehearsal fixture', done: 'never; nobody adopts a fixture' }],
  ruleRoutingGuidance: {
    belongs: 'the fixture project\\'s own invariants, for rehearsal purposes only',
    excludes: 'anything portable — that belongs in a canon pack',
  },
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [],
  workRules: [],
};
`;

// The same shape one format on: a local pack declaring the DATE-ANCHORED version
// the corpus writes from 2026-08-20 (#1100). It sits beside the legacy-integer one
// above rather than replacing it, because the widening is only real if BOTH spellings
// validate — a member's own manifest may carry either for as long as the tolerance
// lasts, and an engine that accepted only the new one would reject every consumer
// that has not been touched since.
const PACK_DATED = `export default {
  id: 'fixture-dated',
  version: '60820.1',
  minEngineVersion: 1,
  ruleRoutingGuidance: {
    belongs: 'the fixture project\\'s own invariants, for rehearsal purposes only',
    excludes: 'anything portable — that belongs in a canon pack',
  },
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [],
  workRules: [],
};
`;

// A CONSUMER-AUTHORED manifest that declares none of what its directory already
// says (#1246). The convention is additive — every fixture beside this one still
// spells `id` and `prose` and must keep loading — so the widening is only real if
// BOTH shapes converge green on a member's own pack, which is what this pairs with
// the ones above.
const PACK_BY_CONVENTION = `export default {
  ruleRoutingGuidance: {
    belongs: 'the fixture project\\'s own invariants, for rehearsal purposes only',
    excludes: 'anything portable — that belongs in a canon pack',
  },
  detect: null,
  marker: null,
  worldRules: [],
  workRules: [],
};
`;

const PACK_LEGACY_TASK = `export default {
  id: 'fixture-legacy',
  ruleRoutingGuidance: {
    belongs: 'the fixture project\\'s own scheduled work, for rehearsal purposes only',
    excludes: 'anything portable — that belongs in a canon pack',
  },
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [],
  workRules: [],
};
`;

// Deliberately declares the deprecated task-level scope AND no pack-level one —
// the exact shape a consumer that has not migrated still has on disk.
const LEGACY_TASK = `export default {
  id: 'legacy-scoped',
  frequency: 'weekly',
  precondition_signals: [],
  agent_model: 'sonnet',
  expected_outcome: 'none',
  agent_instructions: 'task.md',
  session_scope: 'fleet',
  agent_execution_timeout: 600,
  precondition() {
    return { run: false, reason: 'a rehearsal fixture task — never runs' };
  },
};
`;

const PACK_CODE_WORK_ENV = `export default {
  id: 'fixture-code-work',
  ruleRoutingGuidance: {
    belongs: 'the fixture project\\'s own scheduled work, for rehearsal purposes only',
    excludes: 'anything portable — that belongs in a canon pack',
  },
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [],
  workRules: [],
};
`;

const CODE_WORK_TASK = `export default {
  id: 'code-work-only',
  frequency: 'daily',
  precondition_signals: [],
  agent_model: 'none',
  expected_outcome: 'none',
  code_work: 'node worker.mjs',
  code_work_timeout: 60,
  precondition() {
    return { run: false, reason: 'a rehearsal fixture task — never runs' };
  },
};
`;

// Reads the code-work contract and nothing else — the shape a member's own worker
// has. `task-code-work-env` is blocking, so a member carrying a worker like this
// must stay green the night that rule arrives.
const CODE_WORK_WORKER = `const item = process.env.CLAUDINITE_ITEM || '';
const root = process.env.CLAUDINITE_REPO_ROOT;
const params = process.env.CLAUDINITE_CONTEXT ?? '';
console.log(\`fixture [#\${item}] \${root} \${params.length}\`);
`;

const PACK_DOC_COMMANDS = `export default {
  id: 'fixture-doc-commands',
  ruleRoutingGuidance: {
    belongs: 'the fixture project\\'s own runbooks, for rehearsal purposes only',
    excludes: 'anything portable — that belongs in a canon pack',
  },
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [],
  workRules: [],
};
`;

// A member's own runbook, carrying every command shape a member writes.
// `runnable-doc-commands` is blocking, so each of these must read as fine: the
// mount path resolves under the vendored tree, the repo-relative script and the
// bare filename are the member's own business, and the placeholder-rooted command
// names a file this member really has.
const DOC_COMMANDS_RUNBOOK = `# fixture-doc-commands

Sweep the repo: \`node .claudinite/shared/engine/checks/check_the_world.mjs\`.

Build it: \`node tools/build.mjs\`, and from inside a task directory, \`node worker.mjs\`.

From anywhere in the checkout, \`node <root>/tools/build.mjs\` does the same.
`;

const PACK_REFERENCES = `export default {
  id: 'fixture-references',
  ruleRoutingGuidance: {
    belongs: 'the fixture project\\'s own conventions, for rehearsal purposes only',
    excludes: 'anything portable — that belongs in a canon pack',
  },
  detect: null,
  marker: null,
  prose: 'RULES.md',
  worldRules: [],
  workRules: [],
};
`;

// A member's rules in the three states the writing-pack-prose references
// convention leaves them: marked and resolving, multi-cited, and unmarked
// (legacy — the convention is opt-in per rule, so this is most of the fleet).
// \`references-integrity\` is blocking, so each must read as fine.
const REFERENCES_RULES = `# fixture-references

- **Doing the settled thing** — do it the settled way. (1)

- **Doing the doubly-argued thing** — the way both incidents point. (1, 4)

- **Doing the obvious thing** — its consequence clause is the whole reason, so no marker.
`;

const REFERENCES_DOC = `# References

- **(RULES-1)** The other way failed twice; retire when the platform accepts it.
- **(RULES-4)** A second incident, kept under its original stable number.
- **(check:fixture-declared-check)** Why the pack's own check exists.
`;

const REFERENCES_DECLARED_CHECK = `[
  { "id": "fixture-declared-check", "severity": "advisory",
    "failureMessage": "a rehearsal fixture check that never fires",
    "scanFiles": "/(^|\\\\/)no-such-file-ever$/", "maxLines": 100000 }
]
`;

const OLD_SCHEDULER_WORKFLOW = `name: Claudinite scheduler

on:
  schedule:
    - cron: '10 4,16 * * *'
  workflow_dispatch:
    inputs:
      wake:
        description: 'Task ids to run now'
        required: false
        type: string

concurrency:
  group: claudinite-tick
  cancel-in-progress: false

permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: write

jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - name: Instantiate, ready and reclaim work items
        env:
          GITHUB_TOKEN: \${{ github.token }}
          CLAUDINITE_WAKE: \${{ inputs.wake }}
        run: node .claudinite/shared/packs/claudinite-tasks/queue/scheduler-run.mjs

  drain:
    needs: tick
    runs-on: ubuntu-latest
    timeout-minutes: 50
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - name: Drain the queue
        env:
          GITHUB_TOKEN: \${{ github.token }}
          # claudinite:secrets
        run: node .claudinite/shared/packs/claudinite-tasks/queue/executor.mjs
`;

// The thin shape: no inline program anywhere, every job a single-line
// `run: node <module>`. Held as a literal rather than read off the stub on
// purpose — this is a MEMBER's copy, which converges on its own schedule, so it
// has to be able to differ from whatever the canon ships today.
const THIN_SCHEDULER_WORKFLOW = `name: Claudinite scheduler

on:
  schedule:
    - cron: '10 4,16 * * *'
  workflow_dispatch:
    inputs:
      wake:
        description: 'Task ids to run now'
        required: false
        type: string

concurrency:
  group: claudinite-scheduler-run
  cancel-in-progress: false

permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: write

jobs:
  scheduler-run:
    runs-on: ubuntu-latest
    outputs:
      pickable: \${{ steps.run.outputs.pickable }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - id: run
        env:
          GITHUB_TOKEN: \${{ github.token }}
          CLAUDINITE_WAKE: \${{ inputs.wake }}
          CLAUDINITE_TASKS_SUSPEND_ALL: \${{ vars.CLAUDINITE_TASKS_SUSPEND_ALL }}
        run: node .claudinite/shared/packs/claudinite-tasks/queue/scheduler-run.mjs

  drain:
    needs: scheduler-run
    if: needs.scheduler-run.outputs.pickable == 'true'
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - env:
          GITHUB_TOKEN: \${{ github.token }}
        run: node .claudinite/shared/packs/claudinite-tasks/queue/drain-dispatch.mjs

  report-failure:
    needs: [scheduler-run, drain]
    if: >-
      always()
      && (needs.scheduler-run.result == 'failure' || needs.drain.result == 'failure')
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - env:
          GITHUB_TOKEN: \${{ github.token }}
        run: node .claudinite/shared/packs/claudinite-tasks/queue/workflow-failure.mjs
`;

const THIN_EXECUTOR_WORKFLOW = `name: Claudinite executor

on:
  issues:
    types: [labeled]
  workflow_dispatch:
    inputs:
      continuation_depth:
        required: false
        type: string

permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: write

jobs:
  execute:
    if: >-
      github.event_name == 'workflow_dispatch'
      || github.event.label.name == 'task:status:waiting-for-executor'
      || github.event.label.name == 'task:ready'
      || github.event.label.name == 'task:urgent'
    runs-on: ubuntu-latest
    timeout-minutes: 350
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - env:
          GITHUB_TOKEN: \${{ github.token }}
          CLAUDINITE_TASKS_SUSPEND_ALL: \${{ vars.CLAUDINITE_TASKS_SUSPEND_ALL }}
          # claudinite:secrets
        run: node .claudinite/shared/packs/claudinite-tasks/queue/executor.mjs

  continue-the-chain:
    needs: execute
    if: failure() || cancelled()
    runs-on: ubuntu-latest
    permissions:
      actions: write
      issues: write
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - env:
          GITHUB_TOKEN: \${{ github.token }}
          CLAUDINITE_CONTINUATION_DEPTH: \${{ inputs.continuation_depth }}
        run: node .claudinite/shared/packs/claudinite-tasks/queue/executor-continuation.mjs
`;

// The scheduler workflow as it stands on a member that has the DISPATCHING drain
// (§15.16) but not the gate (§15.30). Its drain job has no
// `if` and its scheduler job maps no `outputs`, which is exactly the combination
// the gate's engine half must stay inert against.
const UNGATED_SCHEDULER_WORKFLOW = `name: Claudinite scheduler

on:
  schedule:
    - cron: '10 4,16 * * *'
  workflow_dispatch:
    inputs:
      wake:
        description: 'Task ids to run now'
        required: false
        type: string

concurrency:
  group: claudinite-scheduler-run
  cancel-in-progress: false

permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: write

jobs:
  scheduler-run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - name: Instantiate, ready and reclaim work items
        env:
          GITHUB_TOKEN: \${{ github.token }}
          CLAUDINITE_WAKE: \${{ inputs.wake }}
          CLAUDINITE_TASKS_SUSPEND_ALL: \${{ vars.CLAUDINITE_TASKS_SUSPEND_ALL }}
        run: node .claudinite/shared/packs/claudinite-tasks/queue/scheduler-run.mjs

  drain:
    needs: scheduler-run
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            await github.rest.actions.createWorkflowDispatch({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'claudinite-executor.yml',
              ref: context.payload.repository?.default_branch
                ?? context.ref.replace('refs/heads/', ''),
            });
`;

// The executor workflow as it stood before the vocabulary migration (#1119):
// triggering on the legacy ready spelling only, and reporting a dead chain with no
// origin or park label on the issue it files.
const OLD_EXECUTOR_WORKFLOW = `name: Claudinite executor

on:
  issues:
    types: [labeled]
  workflow_dispatch:
    inputs:
      continuation_depth:
        required: false
        type: string

permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: write

jobs:
  execute:
    if: >-
      github.event_name == 'workflow_dispatch'
      || github.event.label.name == 'task:ready'
      || github.event.label.name == 'task:urgent'
    runs-on: ubuntu-latest
    timeout-minutes: 350
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - name: Pick up and execute ready work
        env:
          GITHUB_TOKEN: \${{ github.token }}
          # claudinite:secrets
        run: node .claudinite/shared/packs/claudinite-tasks/queue/executor.mjs
`;

// A member whose live executor still stamps its secrets by NAME, and sets no bag.
// Held literally for the same reason the shapes above are: `.github/workflows/` is
// the one path a converge cannot push, so this is what every member has between the
// engine that reads a bag converging and its own workflow landing by human-merged
// PR (#1301). The engine must resolve `CCR_ROUTINE_TOKEN` from the plain
// environment here, or #1296 happens again from the other direction.
// A member whose live executor carries the ONE-LINE SECRET BAG — the #1301 shape.
// Held literally for the same reason every workflow shape here is: `.github/workflows/`
// is the one path a converge cannot push, so this is what a member that converged
// between #1301 and #1336 still has, and it moves only by human-merged PR. GitHub
// parks every run of it behind an approval, which is why it is going away — but until
// each member's PR lands, the engine must still resolve `CCR_ROUTINE_TOKEN` out of the
// bag rather than the environment, or the reversal wedges the fleet from the other
// side exactly as #1296 did.
const BAG_EXECUTOR_WORKFLOW = `name: Claudinite executor

on:
  issues:
    types: [labeled]
  workflow_dispatch:

permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: write

jobs:
  execute:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Pick up and execute ready work
        env:
          GITHUB_TOKEN: \${{ github.token }}
          CLAUDINITE_SECRETS: \${{ toJSON(secrets) }}
        run: node .claudinite/shared/packs/claudinite-tasks/queue/executor.mjs
`;

const STAMPING_EXECUTOR_WORKFLOW = `name: Claudinite executor

on:
  issues:
    types: [labeled]
  workflow_dispatch:

permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: write

jobs:
  execute:
    if: >-
      github.event_name == 'workflow_dispatch'
      || github.event.label.name == 'task:ready'
    runs-on: ubuntu-latest
    timeout-minutes: 350
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - name: Pick up and execute ready work
        env:
          GITHUB_TOKEN: \${{ github.token }}
          CLAUDINITE_TASKS_SUSPEND_ALL: \${{ vars.CLAUDINITE_TASKS_SUSPEND_ALL }}
          # claudinite:secrets
          CCR_ROUTINE_TOKEN: \${{ secrets.CCR_ROUTINE_TOKEN }}
        run: node .claudinite/shared/packs/claudinite-tasks/queue/executor.mjs
`;

// A member whose live executor already carries the repository-variable bag (#1492) —
// the far side of that PR, where `stamping-executor` above is the near side every
// member sits on until its own lands. The line is STATIC: no converge writes it and no
// declaration moves it, so what this proves is that a member carrying it converges green
// and that nothing in the engine requires its absence.
const VARS_BAG_EXECUTOR_WORKFLOW = STAMPING_EXECUTOR_WORKFLOW
  .replace('          # claudinite:secrets\n',
    '          CLAUDINITE_VARS: \${{ toJSON(vars) }}\n          # claudinite:secrets\n');

// A member whose live executor triggers on the CANONICAL ready spelling alone — the
// file a converge writes from today's stub, once the legacy trigger came out (#1119).
// `THIN_EXECUTOR_WORKFLOW` above is the same file with `task:ready` still beside it:
// between the two sits every member, because `.github/workflows/` moves only by
// human-merged PR. Both shapes must converge green, and this is the far side.
const CANONICAL_READY_EXECUTOR_WORKFLOW = THIN_EXECUTOR_WORKFLOW
  .replace("      || github.event.label.name == 'task:ready'\n", '');

export const FIXTURES = [
  {
    name: 'local-rules',
    why: 'a local pack with scoped rules and a bundled skill — the #555 shape',
    files: {
      'README.md': '# fixture-local-rules\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'local/fixture-local']),
      '.claudinite/local/packs/fixture-local/pack.mjs': PACK_LOCAL_RULES,
      '.claudinite/local/packs/fixture-local/demo-rule.mjs': DEMO_RULE,
      '.claudinite/local/packs/fixture-local/RULES.md': '# fixture-local\n\nNo standing rules.\n',
      '.claudinite/local/packs/fixture-local/skills/fixture-skill/SKILL.md':
        '---\nname: fixture-skill\ndescription: A rehearsal fixture skill. Never invoked.\n---\n\nNothing to do.\n',
      '.claudinite/local/packs/fixture-local/tasks/fixture-task/task.json': FIXTURE_TASK,
    },
  },
  {
    name: 'prose-only',
    why: 'a local pack carrying no rules — zero rules must not look like a failed load',
    files: {
      'README.md': '# fixture-prose-only\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'local/fixture-prose']),
      '.claudinite/local/packs/fixture-prose/pack.mjs': PACK_PROSE_ONLY,
      '.claudinite/local/packs/fixture-prose/RULES.md': '# fixture-prose\n\nNo standing rules.\n',
    },
  },
  {
    name: 'legacy-task',
    why: 'a local pack whose task still declares the deprecated `session_scope` — the shape a consumer predating the retirement still has on disk',
    files: {
      'README.md': '# fixture-legacy-task\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'local/fixture-legacy']),
      '.claudinite/local/packs/fixture-legacy/pack.mjs': PACK_LEGACY_TASK,
      '.claudinite/local/packs/fixture-legacy/RULES.md': '# fixture-legacy\n\nNo standing rules.\n',
      '.claudinite/local/packs/fixture-legacy/tasks/legacy-scoped/task.mjs': LEGACY_TASK,
      '.claudinite/local/packs/fixture-legacy/tasks/legacy-scoped/task.md':
        '# legacy-scoped\n\nA rehearsal fixture task. Its precondition never fires.\n',
    },
  },
  {
    name: 'code_work-env',
    why: 'a local pack whose task carries a worker — the member-owned code `task-code-work-env` reads, and the half no other shape has',
    files: {
      'README.md': '# fixture-code-work-env\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'local/fixture-code-work']),
      '.claudinite/local/packs/fixture-code-work/pack.mjs': PACK_CODE_WORK_ENV,
      '.claudinite/local/packs/fixture-code-work/RULES.md': '# fixture-code-work\n\nNo standing rules.\n',
      '.claudinite/local/packs/fixture-code-work/tasks/code-work-only/task.mjs': CODE_WORK_TASK,
      '.claudinite/local/packs/fixture-code-work/tasks/code-work-only/worker.mjs': CODE_WORK_WORKER,
      // An agentless task's doc is a README — `task.md` is the spec an agent
      // session reads, and `task-md-only-when-agentic` (blocking, growth) turns a
      // folder carrying one red. This is the shape a member holds afterwards, so
      // the fixture is what says the rule does not fire on it.
      '.claudinite/local/packs/fixture-code-work/tasks/code-work-only/README.md':
        '# code-work-only\n\nA rehearsal fixture task. Its worker never runs.\n',
    },
  },
  {
    name: 'doc-commands',
    why: 'a local pack whose runbook names commands to run — the member-authored prose `runnable-doc-commands` reads, in every shape a member writes it',
    files: {
      'README.md': '# fixture-doc-commands\n\nA rehearsal fixture.\n',
      'tools/build.mjs': 'console.log(\'fixture build\');\n',
      '.claudinite-settings.json': checks(['basics', 'local/fixture-doc-commands']),
      '.claudinite/local/packs/fixture-doc-commands/pack.mjs': PACK_DOC_COMMANDS,
      '.claudinite/local/packs/fixture-doc-commands/RULES.md': DOC_COMMANDS_RUNBOOK,
    },
  },
  {
    name: 'references',
    why: 'a local pack on the writing-pack-prose references convention — markers resolving to references.md entries, a check: entry, and unmarked legacy rules; the member-authored prose `references-integrity` (blocking, growth) reads',
    files: {
      'README.md': '# fixture-references\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['claudinite-growth', 'local/fixture-references']),
      '.claudinite/local/packs/fixture-references/pack.mjs': PACK_REFERENCES,
      '.claudinite/local/packs/fixture-references/RULES.md': REFERENCES_RULES,
      '.claudinite/local/packs/fixture-references/references.md': REFERENCES_DOC,
      '.claudinite/local/packs/fixture-references/declared-checks.json': REFERENCES_DECLARED_CHECK,
    },
  },
  {
    name: 'versioned-local',
    why: 'local packs declaring the manifest version fields in BOTH spellings — proves the widened vocabulary validates on a CONSUMER-authored manifest, not only on the canon\'s own',
    files: {
      'README.md': '# fixture-versioned\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'local/fixture-versioned', 'local/fixture-dated']),
      '.claudinite/local/packs/fixture-versioned/pack.mjs': PACK_VERSIONED,
      '.claudinite/local/packs/fixture-versioned/RULES.md': '# fixture-versioned\n\nNo standing rules.\n',
      '.claudinite/local/packs/fixture-dated/pack.mjs': PACK_DATED,
      '.claudinite/local/packs/fixture-dated/RULES.md': '# fixture-dated\n\nNo standing rules.\n',
      '.claudinite/local/packs/fixture-dated/skills/fixture-dated-skill/SKILL.md':
        '---\nname: fixture-dated-skill\ndescription: A rehearsal fixture skill. Never invoked.\nmetadata:\n  force-load-on-file-edits-paths:\n    - "scoped/**"\n---\n\nNothing to do.\n',
    },
  },
  {
    name: 'convention-local',
    why: 'a local pack declaring no id, prose, badge or skills — the manifest a consumer writes once the tree answers for them (#1246); its prose must still load and its skill must still mount',
    files: {
      'README.md': '# fixture-convention\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'local/fixture-convention']),
      '.claudinite/local/packs/fixture-convention/pack.mjs': PACK_BY_CONVENTION,
      '.claudinite/local/packs/fixture-convention/RULES.md': '# fixture-convention\n\nNo standing rules.\n',
      '.claudinite/local/packs/fixture-convention/skills/fixture-convention-skill/SKILL.md':
        '---\nname: fixture-convention-skill\ndescription: A rehearsal fixture skill. Never invoked.\n---\n\nNothing to do.\n',
    },
  },
  {
    name: 'pre-rules-index',
    why: 'a member as it stands the night #807 arrives — its own CLAUDE.md, no rules index, no import — proving the converge lands all three and the new blocking rule finds them',
    files: {
      'README.md': '# fixture-pre-rules-index\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics']),
      // A repo's own instructions, which the converge must preserve while adding
      // its one import line — a member's CLAUDE.md is the member's.
      'CLAUDE.md': '# fixture-pre-rules-index\n\nBuild with `make`. Run `make test` before committing.\n',
      '.gitattributes': 'usage.GENERATED.json merge=ours\n',
    },
  },
  {
    name: 'codes-an-extension',
    why: 'an extension repo that does not publish — the shape the chrome-extension collapse newly exposes to the release rules, which must stay inert on it',
    files: {
      'README.md': '# fixture-codes-an-extension\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'chrome-extension']),
      // A manifest is the pack's whole fingerprint, so the pack is active here; what
      // must not fire is everything gated on shipping.
      'manifest.json': JSON.stringify({ manifest_version: 3, name: 'fixture', version: '0.1.0' }, null, 2) + '\n',
    },
  },
  {
    name: 'canon-packs',
    why: 'no local pack at all — isolates canon-side breakage from local-pack breakage',
    files: {
      'README.md': '# fixture-canon-packs\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics']),
    },
  },
  {
    name: 'jwt-consumer',
    why: 'a member declaring the jwt technology pack over clean JWT source — the pack\'s blocking skill checks are opt-in, and this proves a member that opts in converges green',
    files: {
      'README.md': '# fixture-jwt-consumer\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'jwt']),
      // Clean under all five jwt checks: algorithms pinned, audience and issuer
      // bound, secret from the environment, expiry set, no "none" anywhere.
      'server/auth.js': `const jwt = require('jsonwebtoken');

const BINDINGS = { audience: 'api://fixture', issuer: 'https://fixture.example' };

function issue(sub) {
  return jwt.sign({ sub }, process.env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn: '15m', ...BINDINGS,
  });
}

function check(token) {
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ['HS256'], ...BINDINGS,
  });
}

module.exports = { issue, check };
`,
    },
  },
  {
    name: 'product-wiki-consumer',
    why: 'a member declaring the product-wiki standard over its scaffold, no config object on the entry — the skeleton check is declared data and the takes-no-config guard is its own coded rule, and this proves a member that adopted the standard converges green across that split',
    files: {
      'README.md': '# fixture-product-wiki-consumer\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'product-wiki']),
      // The two fixed paths product-wiki-layout requires; a sink-first scaffold
      // with no wiki pages yet is a legitimate adoption state, and it keeps the
      // page-grammar checks quiet (a wiki page is structural: a README.md at
      // depth >= 2 outside the sink).
      'product-wiki/README.md': '# product\n\nThe product research root.\n',
      'product-wiki/product-requirements/README.md': '# Product requirements\n\nThe reviewed sink.\n',
    },
  },
  {
    name: 'canon-home',
    why: 'a second canon: a member declaring `claudinite-canon-curation` over a `packs/` shelf of its own, proving the curation pack\'s blocking rules are silent on a conforming shelf that is not this repo',
    files: {
      'README.md': '# fixture-canon-home\n\nA rehearsal fixture.\n',
      // `barriers` is the curation pack's `requires`; declaring it explicitly is what
      // a real canon's file looks like after adoption resolves the closure.
      '.claudinite-settings.json': checks(['basics', 'barriers', 'claudinite-canon-curation']),
      // The shelf. A member's own `packs/` is NOT discovered as canon content (the
      // engine reads a canon's packs from the mount root), so this pack never
      // activates here — it is published content, and what the curation rules
      // police. Conforming on every count: a version with its VERSIONS.md row,
      // prose that names none of its own rules, imports that stay inside the pack.
      'packs/fixture-shelf/pack.mjs': PACK_SHELF,
      'packs/fixture-shelf/RULES.md': '# fixture-shelf\n\n- **Publishing a shelf pack** — say what it is for in one line.\n',
      'packs/fixture-shelf/VERSIONS.md': '# Version history\n\n| Version | Date | What changed |\n|---|---|---|\n| 60831.1 | 2026-08-31 | First version. |\n',
      'packs/fixture-shelf/README.md': '# fixture-shelf\n\nA rehearsal fixture pack on a fixture canon\'s shelf.\n',
    },
  },
  {
    name: 'sheepdog-enforcer',
    why: 'the fleet-enforcer shape: a repo declaring `claudinite-fleet-sheepdog` with a packSeeds entry AND its own declaration of the seeded pack — the two configs a blocking rule now requires to agree, proving a conforming enforcer converges green',
    files: {
      'README.md': '# fixture-sheepdog-enforcer\n\nA rehearsal fixture.\n',
      // The enforcer states the seeded pack's config twice, exactly as a real one
      // does: once for the fleet (packSeeds) and once for itself. They agree, which
      // is the conforming shape — the fixture proves the rule is inert on it, not
      // that the rule works (its own see-it-fail fixture does that). It names the
      // fixture itself as the store and holds no store directory, so the store rules
      // resolve and stay quiet the way they do in any member that only reads one.
      '.claudinite-settings.json': checks([
        'basics',
        {
          id: 'claudinite-fleet-sheepdog',
          config: {
            owner: 'fixture-owner',
            kind: 'user',
            packSeeds: [{ id: 'claude-code-web-users-support', config: { repo: 'fixture-owner/fixture-store' } }],
          },
        },
        { id: 'claude-code-web-users-support', config: { repo: 'fixture-owner/fixture-store' } },
      ]),
    },
  },
  {
    name: 'dashboard-contributor',
    why: 'a member whose OWN local pack contributes to the dashboard — `descriptor-usable` is blocking, and a member holds descriptors the canon never sees, so this proves a conforming one (a declared widget, a fleet card that can be one line and names what it counts) converges green rather than going red overnight on a rule nobody there asked for',
    files: {
      'README.md': '# fixture-dashboard-contributor\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'claudinite-dashboard']),
      // A local pack's own descriptor, in the shape the reader accepts: every id a
      // view selects resolves, the fleet card is a kind that fits one line, and it
      // carries the noun that keeps it from rendering as a bare number.
      '.claudinite/local/packs/fixture-metrics/dashboard.json': JSON.stringify({
        widgets: [
          { id: 'checked', kind: 'window', label: 'samples checked', noun: 'samples' },
          { id: 'best', kind: 'stat', label: 'best score', noun: 'pts' },
        ],
        repo: ['checked', 'best'],
        fleet: { member: 'checked' },
      }, null, 2) + '\n',
      // …and the values its own task writes, which nothing checks but which is the
      // half a reader of this fixture will look for.
      '.claudinite/local/dashboard/fixture-metrics.GENERATED.json': JSON.stringify({
        generatedAt: '1999-01-02T00:00:00Z',
        values: { checked: { value: 12, previous: 9, window: '1w' }, best: { value: 84 } },
      }, null, 2) + '\n',
    },
  },
  {
    name: 'tidy-repo-member',
    why: 'a member declaring tidy-repo, whose improve-comments skill ships a BLOCKING gate over the repo\'s own source — the gate is silent unless a branch carries the pass\'s pinned commit subject, and this proves an ordinary member converges green rather than going red overnight on a rule nobody there asked for',
    files: {
      'README.md': '# fixture-tidy-repo-member\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'tidy-repo']),
      // Ordinary source with ordinary comments: the shape the gate must stay inert
      // on. A member converges on its default branch and never writes the pass's
      // commit subject, so nothing here should engage the rule — which is exactly
      // the claim a member's green run has to make. (That it FIRES is proved by its
      // own see-it-fail fixtures in the pack's tests.)
      'src/app.mjs': `// The one place the retry budget is stated; the poller below reads it rather
// than carrying a second copy.
export const MAX_ATTEMPTS = 3;

export function attempt(fn) {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try { return fn(); } catch { /* the last failure is the one that throws */ }
  }
  throw new Error('exhausted');
}
`,
    },
  },
  {
    name: 'macos-app',
    why: 'a member declaring the macos pack over a conforming Mac app — the pack\'s two exit-path rules are blocking, and this proves an app in the shape they are about (AppKit, a capture tap, terminate-time teardown) converges green rather than going red overnight on a rule nobody asked for',
    files: {
      'README.md': '# fixture-macos-app\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'macos']),
      // The fingerprint the pack detects on, near the root as the marker requires.
      'Package.swift': `// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "FixtureApp",
  platforms: [.macOS(.v13)],
  targets: [.executableTarget(name: "FixtureApp")]
)
`,
      // Deliberately the shape BOTH checks engage on — an AppKit app that installs
      // a capture tap and tears down at terminate — so the fixture proves the rules
      // are inert on a conforming member rather than passing because it dodged the
      // gates. (That they FIRE is proved by their own see-it-fail fixtures.)
      'Sources/FixtureApp/AppDelegate.swift': `import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationWillTerminate(_ notification: Notification) {
    Capture.shared.stop()
  }
}
`,
      'Sources/FixtureApp/Capture.swift': `import AVFoundation

final class Capture {
  static let shared = Capture()
  private let engine = AVAudioEngine()

  func start(format: AVAudioFormat) {
    engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: format) { _, _ in }
  }

  func stop() {
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
  }
}
`,
      // SIG_IGN before resume(), all three catchable signals routed into terminate.
      'Sources/FixtureApp/main.swift': `import AppKit

let delegate = AppDelegate()
NSApplication.shared.delegate = delegate

let signalSources = [SIGTERM, SIGINT, SIGHUP].map { sig -> DispatchSourceSignal in
  signal(sig, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
  source.setEventHandler { NSApp.terminate(nil) }
  source.resume()
  return source
}

NSApplication.shared.run()
`,
      // No NSSupportsSuddenTermination: the app has teardown that must run.
      'Resources/Info.plist': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>FixtureApp</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSMicrophoneUsageDescription</key>
  <string>Analyses audio on this Mac.</string>
</dict>
</plist>
`,
    },
  },
  {
    name: 'local-declared-checks',
    why: 'a local pack carrying its own declared-checks.json — in a LEGACY spelling (checkParsedFile) and with in-cap messages: proves a member\'s declarations keep loading across vocabulary merges and stay green under declared-check-messages',
    files: {
      'README.md': '# fixture-declared\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'local/fixture-declared']),
      '.claudinite/local/packs/fixture-declared/pack.mjs': PACK_PROSE_ONLY.replace(/fixture-prose/g, 'fixture-declared'),
      '.claudinite/local/packs/fixture-declared/RULES.md': '# fixture-declared\n\nNo standing rules.\n',
      '.claudinite/local/packs/fixture-declared/declared-checks.json': `${JSON.stringify([
        {
          id: 'fixture-declared-manifest',
          severity: 'advisory',
          failureMessage: 'a fixture declaration in the legacy checkParsedFile spelling',
          checkParsedFile: [{
            file: 'package.json',
            whenFieldPresent: 'never.present',
            requireField: 'never.required',
            what: 'never fires',
            fix: 'nothing to do',
          }],
        },
      ], null, 2)}\n`,
    },
  },
  {
    name: 'dormant',
    why: 'a declared-dormant member: its mount falls behind BY DESIGN, never a failure',
    files: {
      'README.md': '# fixture-dormant\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics'], { dormant: true }),
    },
  },
  {
    name: 'core-undeclared',
    why: 'a member whose declaration never got `core` — the shape the three dormant repos are frozen in: it must still converge GREEN, because a pack that is mounted but undeclared runs nothing, including the rule that would have reported it',
    files: {
      'README.md': '# fixture-core-undeclared\n\nA rehearsal fixture.\n',
      // The one fixture that bypasses the `checks()` helper's `core` prepend, on
      // purpose. `claudinite-lifecycle-declared` became blocking in #844, and the question a
      // consumer-safe change has to answer is whether that severity can turn a
      // member red overnight. It cannot, and this is the proof rather than the
      // argument: activation reads the literal `packs` list, so in the only repo
      // shape where the rule would fire, the rule does not run at all.
      //
      // What this member DOES lose is real and is the accepted cost recorded in
      // #842 — `core` owns the `update` task since #844, so an undeclared member
      // has no self-refresh and nothing able to deliver it one. The repair is one
      // manual edit to its `packs` array. Green here means "not broken by the
      // severity", never "fully functional".
      '.claudinite-settings.json': JSON.stringify({
        packs: ['basics'],
        taskScheduler: { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 },
      }, null, 2) + '\n',
    },
  },
  {
    name: 'legacy-settings-name',
    why: 'a member still carrying `.claudinite-checks.json` — the shape EVERY member is in between the #1252 engine landing and its own converge running the rename record. Nothing but the engine reads that name, so if any reader lost the tolerance, this member reads as un-adopted: no packs, no tasks, no delivery preference, and a green run to show for it',
    files: {
      'README.md': '# fixture-legacy-settings-name\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics']),
    },
  },
  {
    name: 'old-workflows',
    why: 'a member still holding the previous workflow STRUCTURE — a non-dispatching drain, no gate — the window every workflow change opens, since `.github/workflows/` is the one path a converge cannot push',
    files: {
      'README.md': '# fixture-old-workflows\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics']),
      '.github/workflows/claudinite-scheduler.yml': OLD_SCHEDULER_WORKFLOW,
      '.github/workflows/claudinite-executor.yml': OLD_EXECUTOR_WORKFLOW,
    },
  },
  {
    name: 'custom-anchor-hour',
    why: "a member that moved its `taskScheduler.dailyHour` off the default — both cron hours are a function of that value now (DESIGN §17), so a converge that ignored it would fire this repo's scheduler at hours no anchor lands on and run every task a day late, forever, with nothing going red",
    files: {
      'README.md': '# fixture-custom-anchor-hour\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics'], {
        taskScheduler: { dailyHour: 9, weeklyDay: 'Wed', monthlyDay: 1 },
      }),
      // Its own anchor, not the default: dailyHour 9 means 9 and 21, and a fixture carrying
      // 4,16 here would pass the shape check while contradicting what it exists to prove.
      '.github/workflows/claudinite-scheduler.yml': OLD_SCHEDULER_WORKFLOW.replace("'10 4,16 * * *'", "'10 9,21 * * *'"),
    },
  },
  {
    name: 'bag-executor',
    why: 'a member whose live executor still carries the one-line `CLAUDINITE_SECRETS` bag — the window every member sits in between #1301 landing and its own workflow being repointed by #1336, and the shape whose secrets must still resolve out of the bag',
    files: {
      'README.md': '# fixture-bag-executor\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics'], {
        taskScheduler: { endpoints: { default: { url: 'https://example.invalid/fire', tokenSecret: 'CCR_ROUTINE_TOKEN' } } },
      }),
      '.github/workflows/claudinite-scheduler.yml': THIN_SCHEDULER_WORKFLOW,
      '.github/workflows/claudinite-executor.yml': BAG_EXECUTOR_WORKFLOW,
    },
  },
  {
    name: 'stamping-executor',
    why: 'a member whose live executor passes its secrets by NAME — the shape the fleet is on again after #1336 reversed the one-line bag, and the one whose secrets must resolve from the plain environment',
    files: {
      'README.md': '# fixture-stamping-executor\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics'], {
        taskScheduler: { endpoints: { default: { url: 'https://example.invalid/fire', tokenSecret: 'CCR_ROUTINE_TOKEN' } } },
      }),
      '.github/workflows/claudinite-scheduler.yml': THIN_SCHEDULER_WORKFLOW,
      '.github/workflows/claudinite-executor.yml': STAMPING_EXECUTOR_WORKFLOW,
    },
  },
  {
    name: 'vars-bag-executor',
    why: 'a member whose live executor carries the one-line `CLAUDINITE_VARS` bag — the far side of #1492, where `stamping-executor` is the near side; its repo variables must reach task code out of the bag, and the converge must leave the static line alone',
    files: {
      'README.md': '# fixture-vars-bag-executor\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics'], {
        taskScheduler: { endpoints: { default: { url: 'https://example.invalid/fire', tokenSecret: 'CCR_ROUTINE_TOKEN' } } },
      }),
      '.github/workflows/claudinite-scheduler.yml': THIN_SCHEDULER_WORKFLOW,
      '.github/workflows/claudinite-executor.yml': VARS_BAG_EXECUTOR_WORKFLOW,
    },
  },
  {
    name: 'canonical-ready-executor',
    why: "a member whose live executor triggers on `task:status:waiting-for-executor` alone — the far side of the #1119 window, once its own PR landed the workflow with the legacy `task:ready` trigger removed; the queue must still reach it, and nothing in the engine may still require the legacy string to be in a member's file",
    files: {
      'README.md': '# fixture-canonical-ready-executor\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics']),
      '.github/workflows/claudinite-scheduler.yml': THIN_SCHEDULER_WORKFLOW,
      '.github/workflows/claudinite-executor.yml': CANONICAL_READY_EXECUTOR_WORKFLOW,
    },
  },
  {
    name: 'thin-workflows',
    why: 'a member already on the thin workflow shape, whose every job names an engine module by literal path — the shape the fleet is moving to, and the one a vendor set that stopped shipping one of those modules would break silently, with a queue that just stops draining',
    files: {
      'README.md': '# fixture-thin-workflows\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics']),
      '.github/workflows/claudinite-scheduler.yml': THIN_SCHEDULER_WORKFLOW,
      '.github/workflows/claudinite-executor.yml': THIN_EXECUTOR_WORKFLOW,
    },
  },
  {
    name: 'ungated-drain',
    why: 'the workflow shape the fleet is on TODAY: a dispatching drain with no gate and no job output — the window the drain gate (§15.30) opens, where the engine writes a verdict the member\'s own copy cannot read',
    files: {
      'README.md': '# fixture-ungated-drain\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics']),
      '.github/workflows/claudinite-scheduler.yml': UNGATED_SCHEDULER_WORKFLOW,
    },
  },
  {
    name: 'landing-member',
    why: 'a member running scheduled work under the auto-merge policy engine: claudinite-tasks declared, so the vendored automerge-policy-scope rule (blocking, work scope) rides the mount and loads in the two-root layout — proving the policy machinery arrives inert on a member whose branches stamp no arming trailer',
    files: {
      'README.md': '# fixture-landing-member\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'claudinite-tasks']),
      '.github/workflows/claudinite-scheduler.yml': THIN_SCHEDULER_WORKFLOW,
      '.github/workflows/claudinite-executor.yml': CANONICAL_READY_EXECUTOR_WORKFLOW,
    },
  },
  {
    name: 'growth-member',
    why: 'a member enrolled in the growth lifecycle, with the local packs its capture runs write',
    files: {
      'README.md': '# fixture-growth-member\n\nA rehearsal fixture.\n',
      '.claudinite-settings.json': checks(['basics', 'claudinite-growth', 'local/fixture-local']),
      '.claudinite/local/packs/fixture-local/pack.mjs': PACK_LOCAL_RULES,
      '.claudinite/local/packs/fixture-local/demo-rule.mjs': DEMO_RULE,
      '.claudinite/local/packs/fixture-local/RULES.md': '# fixture-local\n\nNo standing rules.\n',
      '.claudinite/local/packs/fixture-local/skills/fixture-skill/SKILL.md':
        '---\nname: fixture-skill\ndescription: A rehearsal fixture skill. Never invoked.\n---\n\nNothing to do.\n',
    },
  },
];

// The two MODES, stated as what the fixture has INSTALLED. `stale` is the half that
// answers "does the converge work WITH a migration": records are selected by version
// range, so a fixture pinned below every record's own version forces selection to
// actually fire. A record that is missing, misversioned, or not idempotent shows up
// here and nowhere else.
//
// The stale numbers are date-anchored and dated well before the corpus rather than
// the legacy plain integers: a legacy integer is a version the format still PARSES
// but nothing may declare, so a fixture writing one fails the declaration's own
// shape rule instead of exercising the records it was pinned low to reach.
//
// `fresh` names no versions at all rather than today's: a fixture stamped at canon's
// current numbers would have to be re-edited on every release to keep meaning "up to
// date", and an unstamped repo is the shape a first adoption actually has. Neither
// mode may sit ABOVE canon — that is the rewind the #328 guard refuses, and a
// fixture is not the place to rehearse it.
export const MODES = [
  { name: 'fresh', installed: null, why: 'the ordinary path — nothing versioned selects' },
  { name: 'stale', installed: { engineVersion: '50101.1', packVersion: '50101.1' }, why: 'forces record selection: every versioned record applies' },
];
