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
//   legacy-task   a local pack whose scheduled task still declares the DEPRECATED
//                 task-level `session_scope` — the shape a consumer that predates
//                 the 2026-08-09 retirement still has on disk. It holds the
//                 retirement HARMLESS to such a member: red if the field ever
//                 stops validating or any future check starts blocking on it —
//                 the ways an un-migrated member would stop converging. What it
//                 does NOT cover is the routing itself: the rehearsal runs the
//                 vendor + the sweeps, never the scheduler, so that a lingering
//                 field still routes to the fleet label is a unit test's job
//                 (engine-tests/scheduler/session-scope.test.mjs).
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
// A fixture carries NO `claudinite.ref`. That is deliberate: apply-vendor-set's
// #328 anti-rewind guard compares the prior ref against the canon checkout's
// HEAD, and a fixture has no honest ancestor to name. Omitting it skips the
// guard — the same escape a first-adoption repo legitimately takes — and keeps
// the rehearsal about the converge rather than about git ancestry.

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
  maintenance: { delivery: 'auto-merge' },
  // `updated` is set per MODE by the runner (fresh vs stale), never here.
  claudinite: { updated: null },
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
const FIXTURE_TASK = `export default {
  id: 'fixture-task',
  frequency: 'weekly',
  precondition_signals: [],
  agent_model: 'none',
  expected_outcome: 'none',
  agent_preprocessing: 'node prepare.mjs',
  agent_preprocessing_timeout: 60,
  precondition() {
    return { run: false, reason: 'a rehearsal fixture never actually dispatches' };
  },
};
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

const OLD_SCHEDULER_WORKFLOW = `name: Claudinite scheduler

on:
  schedule:
    - cron: '10 * * * *'
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
        run: node .claudinite/shared/engine/scheduler/queue/tick.mjs

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
        run: node .claudinite/shared/engine/scheduler/queue/executor.mjs
`;

// The scheduler workflow as it stands on a member that has the DISPATCHING drain
// (§15.16) but not the gate (§15.30) — today's fleet shape. Its drain job has no
// `if` and its scheduler job maps no `outputs`, which is exactly the combination
// the gate's engine half must stay inert against.
const UNGATED_SCHEDULER_WORKFLOW = `name: Claudinite scheduler

on:
  schedule:
    - cron: '10 * * * *'
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
        run: node .claudinite/shared/engine/scheduler/queue/scheduler-run.mjs

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
        run: node .claudinite/shared/engine/scheduler/queue/executor.mjs
`;

export const FIXTURES = [
  {
    name: 'local-rules',
    why: 'a local pack with scoped rules and a bundled skill — the #555 shape',
    files: {
      'README.md': '# fixture-local-rules\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics', 'local/fixture-local']),
      '.claudinite/local/packs/fixture-local/pack.mjs': PACK_LOCAL_RULES,
      '.claudinite/local/packs/fixture-local/demo-rule.mjs': DEMO_RULE,
      '.claudinite/local/packs/fixture-local/RULES.md': '# fixture-local\n\nNo standing rules.\n',
      '.claudinite/local/packs/fixture-local/skills/fixture-skill/SKILL.md':
        '---\nname: fixture-skill\ndescription: A rehearsal fixture skill. Never invoked.\n---\n\nNothing to do.\n',
      '.claudinite/local/packs/fixture-local/tasks/fixture-task/task.mjs': FIXTURE_TASK,
    },
  },
  {
    name: 'prose-only',
    why: 'a local pack carrying no rules — zero rules must not look like a failed load',
    files: {
      'README.md': '# fixture-prose-only\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics', 'local/fixture-prose']),
      '.claudinite/local/packs/fixture-prose/pack.mjs': PACK_PROSE_ONLY,
      '.claudinite/local/packs/fixture-prose/RULES.md': '# fixture-prose\n\nNo standing rules.\n',
    },
  },
  {
    name: 'legacy-task',
    why: 'a local pack whose task still declares the deprecated `session_scope` — the shape a consumer predating the retirement still has on disk',
    files: {
      'README.md': '# fixture-legacy-task\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics', 'local/fixture-legacy']),
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
      '.claudinite-checks.json': checks(['basics', 'local/fixture-code-work']),
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
    name: 'versioned-local',
    why: 'local packs declaring the manifest version fields in BOTH spellings — proves the widened vocabulary validates on a CONSUMER-authored manifest, not only on the canon\'s own',
    files: {
      'README.md': '# fixture-versioned\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics', 'local/fixture-versioned', 'local/fixture-dated']),
      '.claudinite/local/packs/fixture-versioned/pack.mjs': PACK_VERSIONED,
      '.claudinite/local/packs/fixture-versioned/RULES.md': '# fixture-versioned\n\nNo standing rules.\n',
      '.claudinite/local/packs/fixture-dated/pack.mjs': PACK_DATED,
      '.claudinite/local/packs/fixture-dated/RULES.md': '# fixture-dated\n\nNo standing rules.\n',
    },
  },
  {
    name: 'convention-local',
    why: 'a local pack declaring no id, prose, badge or skills — the manifest a consumer writes once the tree answers for them (#1246); its prose must still load and its skill must still mount',
    files: {
      'README.md': '# fixture-convention\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics', 'local/fixture-convention']),
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
      '.claudinite-checks.json': checks(['basics']),
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
      '.claudinite-checks.json': checks(['basics', 'chrome-extension']),
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
      '.claudinite-checks.json': checks(['basics']),
    },
  },
  {
    name: 'jwt-consumer',
    why: 'a member declaring the jwt technology pack over clean JWT source — the pack\'s blocking skill checks are opt-in, and this proves a member that opts in converges green',
    files: {
      'README.md': '# fixture-jwt-consumer\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics', 'jwt']),
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
      '.claudinite-checks.json': checks(['basics', 'product-wiki']),
      // The two fixed paths product-wiki-layout requires; a sink-first scaffold
      // with no wiki pages yet is a legitimate adoption state, and it keeps the
      // page-grammar checks quiet (a wiki page is structural: a README.md at
      // depth >= 2 outside the sink).
      'product-wiki/README.md': '# product\n\nThe product research root.\n',
      'product-wiki/product-requirements/README.md': '# Product requirements\n\nThe reviewed sink.\n',
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
      '.claudinite-checks.json': checks([
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
    name: 'dashboard-digest',
    why: 'a member declaring `claudinite-dashboard` for the page alone — the shape that inherits the fleet-digest task, and with it two blocking checks nobody there asked for, so this proves a conforming member (a plain-text brief, a fixture date outside the fleet\'s year range) converges green rather than going red overnight',
    files: {
      'README.md': '# fixture-dashboard-digest\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics', 'claudinite-dashboard']),
      // A landed brief in the shape the task writes: no heading, no markdown bullet,
      // no link syntax, a bare URL. This is what `digest-plain-text` is quiet on, and
      // the file the check exists for — a member holds the series, not the canon.
      'digests/2026-08-17.md': [
        'Fleet operations — 2026-08-17',
        '',
        "Yesterday's biggest work:",
        '',
        '• fixture-owner/alpha — #12 Refresh recovers from partial API failures. https://github.com/fixture-owner/alpha/pull/12',
        '',
      ].join('\n'),
      // A member's own test naming a digests/ path, dated in the year the rule steers
      // toward: 1999 can never collide with a real brief, so the rule stays inert.
      'dev/digest-path.test.mjs': [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        "test('a brief path is built from its date', () => {",
        "  assert.equal(`digests/${'1999-01-02'}.md`, 'digests/1999-01-02.md');",
        '});',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'dashboard-contributor',
    why: 'a member whose OWN local pack contributes to the dashboard — `descriptor-usable` is blocking, and a member holds descriptors the canon never sees, so this proves a conforming one (a declared widget, a fleet card that can be one line and names what it counts) converges green rather than going red overnight on a rule nobody there asked for',
    files: {
      'README.md': '# fixture-dashboard-contributor\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics', 'claudinite-dashboard']),
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
    name: 'macos-app',
    why: 'a member declaring the macos pack over a conforming Mac app — the pack\'s two exit-path rules are blocking, and this proves an app in the shape they are about (AppKit, a capture tap, terminate-time teardown) converges green rather than going red overnight on a rule nobody asked for',
    files: {
      'README.md': '# fixture-macos-app\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics', 'macos']),
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
      '.claudinite-checks.json': checks(['basics', 'local/fixture-declared']),
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
      '.claudinite-checks.json': checks(['basics'], { dormant: true }),
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
      '.claudinite-checks.json': JSON.stringify({
        packs: ['basics'],
        taskScheduler: { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 },
        maintenance: { delivery: 'auto-merge' },
        claudinite: { updated: null },
      }, null, 2) + '\n',
    },
  },
  {
    name: 'old-workflows',
    why: 'a member still holding the previous workflow shape — the window every workflow change opens, since `.github/workflows/` is the one path a converge cannot push',
    files: {
      'README.md': '# fixture-old-workflows\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics']),
      '.github/workflows/claudinite-scheduler.yml': OLD_SCHEDULER_WORKFLOW,
      '.github/workflows/claudinite-executor.yml': OLD_EXECUTOR_WORKFLOW,
    },
  },
  {
    name: 'ungated-drain',
    why: 'the workflow shape the fleet is on TODAY: a dispatching drain with no gate and no job output — the window the drain gate (§15.30) opens, where the engine writes a verdict the member\'s own copy cannot read',
    files: {
      'README.md': '# fixture-ungated-drain\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics']),
      '.github/workflows/claudinite-scheduler.yml': UNGATED_SCHEDULER_WORKFLOW,
    },
  },
  {
    name: 'growth-member',
    why: 'a member enrolled in the growth lifecycle, with the local packs its capture runs write',
    files: {
      'README.md': '# fixture-growth-member\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics', 'claudinite-growth', 'local/fixture-local']),
      '.claudinite/local/packs/fixture-local/pack.mjs': PACK_LOCAL_RULES,
      '.claudinite/local/packs/fixture-local/demo-rule.mjs': DEMO_RULE,
      '.claudinite/local/packs/fixture-local/RULES.md': '# fixture-local\n\nNo standing rules.\n',
      '.claudinite/local/packs/fixture-local/skills/fixture-skill/SKILL.md':
        '---\nname: fixture-skill\ndescription: A rehearsal fixture skill. Never invoked.\n---\n\nNothing to do.\n',
    },
  },
];

// The two MODES. `stale` is the half that answers "does baselining work WITH a
// migration": migration notes are selected against the stamp's DAY, so a fixture
// pinned in the past forces selection to actually fire. A record that is missing,
// misdated, or not idempotent shows up here and nowhere else.
export const MODES = [
  { name: 'fresh', updated: new Date().toISOString(), why: 'the ordinary nightly path — no note should select' },
  { name: 'stale', updated: '2026-01-01T00:00:00.000Z', why: 'forces migration selection: every note applies' },
];
