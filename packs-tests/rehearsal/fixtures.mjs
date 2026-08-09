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
//   legacy-task   a local pack whose scheduled task still declares the DEPRECATED
//                 task-level `session_scope`, and whose manifest declares no
//                 `sessionScope`. Every consumer pack in the fleet is that second
//                 shape today, so this is what holds the 2026-08-09 move of the
//                 executor scope onto the pack ADDITIVE. It goes red if the new
//                 manifest field is ever made required, and red if the
//                 deprecation check is ever raised to blocking — the two ways a
//                 member that has not migrated would stop converging. What it
//                 does NOT cover is the routing itself: the rehearsal runs the
//                 vendor + the sweeps, never the scheduler, so that the
//                 deprecated field still resolves to `fleet` is a unit test's job
//                 (engine-tests/scheduler/session-scope.test.mjs).
//
// A fixture carries NO `claudinite.ref`. That is deliberate: apply-vendor-set's
// #328 anti-rewind guard compares the prior ref against the canon checkout's
// HEAD, and a fixture has no honest ancestor to name. Omitting it skips the
// guard — the same escape a first-adoption repo legitimately takes — and keeps
// the rehearsal about the converge rather than about git ancestry.

// The declaration every fixture shares, plus its own packs.
const checks = (packs, extra = {}) => JSON.stringify({
  packs,
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
    why: 'a local pack with no `sessionScope` whose task still declares the deprecated `session_scope` — the un-migrated shape every consumer has today',
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
    name: 'dormant',
    why: 'a declared-dormant member: its mount falls behind BY DESIGN, never a failure',
    files: {
      'README.md': '# fixture-dormant\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics'], { dormant: true }),
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
