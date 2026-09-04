// Red-first coverage for swift-toolchain-gate.
//
// The comment cases are the ones worth pinning in both directions. A script that
// gets this right tends to document the trap directly above the gated call, so a
// scan that does not strip `#` comments flags the warning instead of a violation;
// and a commented-out gate must not be credited as a gate either.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import toolchainGate from '../worldRules/swift-toolchain-gate.mjs';

const runOn = (files) => {
  const root = makeRepo({ changed: files });
  try {
    return toolchainGate.run(buildContext({ root, mode: 'all' }));
  } finally { cleanup(root); }
};

const quiet = (files) => {
  const findings = runOn(files);
  assert.deepEqual(findings, [], `expected silence, got ${JSON.stringify(findings, null, 2)}`);
};

test('flags an ungated Swift probe in a shell script', () => {
  const findings = runOn({
    'scripts/diagnose.sh': `#!/bin/bash
if command -v swift >/dev/null 2>&1; then
  swift run Diagnose
fi
`,
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'swift-toolchain-gate');
  assert.equal(findings[0].severity, 'blocking');
  assert.equal(findings[0].file, 'scripts/diagnose.sh');
  assert.equal(findings[0].line, 2);
  assert.match(findings[0].fix, /xcode-select -p/);
});

test('quiet when xcode-select gates the probe on the same line', () => {
  quiet({
    'scripts/diagnose.sh': `#!/bin/bash
if xcode-select -p >/dev/null 2>&1 && command -v swift >/dev/null 2>&1; then
  swift run Diagnose
fi
`,
  });
});

// Same-or-earlier, not same-line: a gate several lines up is as good as an `&&`.
test('quiet when the gate sits earlier in the script', () => {
  quiet({
    'scripts/diagnose.sh': `#!/bin/bash
xcode-select -p >/dev/null 2>&1 || { echo "no developer tools; skipping"; exit 0; }
command -v swift >/dev/null 2>&1 && swift run Diagnose
`,
  });
});

test('quiet on a comment that merely documents the trap', () => {
  quiet({
    'scripts/diagnose.sh': `#!/bin/bash
# NOTE: command -v swift is NOT a usable test — /usr/bin/swift is a stub.
xcode-select -p >/dev/null 2>&1 || exit 0
`,
  });
});

test('a commented-out gate does not count as a gate', () => {
  const findings = runOn({
    'scripts/diagnose.sh': `#!/bin/bash
# xcode-select -p >/dev/null 2>&1 || exit 0
command -v swift >/dev/null 2>&1 && swift run Diagnose
`,
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
});

test('folds a backslash continuation and reports the line the command started on', () => {
  const findings = runOn({
    'scripts/diagnose.sh': `#!/bin/bash
command -v \\
  swift >/dev/null 2>&1 && swift run Diagnose
`,
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
});

// `swiftlint` and `swift-format` are other tools that merely start with the word.
test('quiet on a probe for a differently-named tool', () => {
  quiet({
    'scripts/lint.sh': `#!/bin/bash
command -v swiftlint >/dev/null 2>&1 && swiftlint
`,
  });
});

test('workflow YAML is in scope', () => {
  const findings = runOn({
    '.github/workflows/diagnose.yml': `name: Diagnose
jobs:
  run:
    steps:
      - run: command -v swift && swift build
`,
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, '.github/workflows/diagnose.yml');
});
