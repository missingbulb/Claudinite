import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import suddenTermination from '../../packs/macos/sudden-termination-vs-teardown.mjs';

const run = (root) => suddenTermination.run(buildContext({ root, mode: 'all' }));

const DELEGATE = `import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationWillTerminate(_ notification: Notification) {
    AudioHub.shared.stop()
  }
}
`;

const plist = (body) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Fixture</string>
${body}
</dict>
</plist>
`;

const app = (files) => makeRepo({ changed: { 'Sources/App/AppDelegate.swift': DELEGATE, ...files } });

test('sudden-termination-vs-teardown: flags the key set true in an app with terminate teardown', () => {
  const root = app({
    'Resources/Info.plist': plist('  <key>NSSupportsSuddenTermination</key>\n  <true/>'),
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'sudden-termination-vs-teardown');
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'Resources/Info.plist');
    assert.equal(findings[0].line, 7);
    assert.match(findings[0].fix, /remove the NSSupportsSuddenTermination key/);
  } finally { cleanup(root); }
});

test('sudden-termination-vs-teardown: an installTap tap counts as teardown to lose', () => {
  // No delegate method at all — the tap alone registers the IOProc the rule protects.
  const root = makeRepo({ changed: {
    'Sources/App/AudioHub.swift': 'engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: fmt) { _, _ in }\n',
    'Info.plist': plist('  <key>NSSupportsSuddenTermination</key>\n  <true/>'),
  } });
  try {
    assert.equal(run(root).length, 1);
  } finally { cleanup(root); }
});

test('sudden-termination-vs-teardown: NOT flagged when the key is <false/> (FP guard)', () => {
  // Declaring the key false is the explicit opt-OUT — the safe state, never a finding.
  const root = app({
    'Resources/Info.plist': plist('  <key>NSSupportsSuddenTermination</key>\n  <false/>'),
  });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('sudden-termination-vs-teardown: NOT flagged when the app runs nothing at terminate (FP guard)', () => {
  // The rule is conditional: an app with no teardown keeps the launch/logout
  // optimisation, and the key is a legitimate declaration.
  const root = makeRepo({ changed: {
    'Sources/App/main.swift': 'import AppKit\nNSApplication.shared.run()\n',
    'Info.plist': plist('  <key>NSSupportsSuddenTermination</key>\n  <true/>'),
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('sudden-termination-vs-teardown: NOT flagged when only a comment names the teardown (FP guard)', () => {
  const root = makeRepo({ changed: {
    'Sources/App/main.swift': '// we deliberately implement no applicationWillTerminate here\nimport AppKit\n',
    'Info.plist': plist('  <key>NSSupportsSuddenTermination</key>\n  <true/>'),
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('sudden-termination-vs-teardown: NOT flagged when the key is only named in prose (FP guard)', () => {
  // Only *.plist is in scope: a doc explaining the trap must stay quiet.
  const root = app({
    'docs/lifecycle.md': 'Never add NSSupportsSuddenTermination — see the pack.\n',
    'Resources/Info.plist': plist('  <key>LSUIElement</key>\n  <true/>'),
  });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});
