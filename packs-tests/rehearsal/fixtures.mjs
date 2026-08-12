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
//                 new key through validation.
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

const PACK_VERSIONED = `export default {
  id: 'fixture-versioned',
  version: 3,
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
    name: 'versioned-local',
    why: 'a local pack declaring the manifest version fields — proves the widened vocabulary validates on a CONSUMER-authored manifest, not only on the canon\'s own',
    files: {
      'README.md': '# fixture-versioned\n\nA rehearsal fixture.\n',
      '.claudinite-checks.json': checks(['basics', 'local/fixture-versioned']),
      '.claudinite/local/packs/fixture-versioned/pack.mjs': PACK_VERSIONED,
      '.claudinite/local/packs/fixture-versioned/RULES.md': '# fixture-versioned\n\nNo standing rules.\n',
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
    name: 'sheepdog-enforcer',
    why: 'the fleet-enforcer shape: a repo declaring `sheepdog` with a packSeeds entry AND its own declaration of the seeded pack — the two configs a blocking rule now requires to agree, proving a conforming enforcer converges green',
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
          id: 'sheepdog',
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
