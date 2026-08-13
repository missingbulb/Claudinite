import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import signalRouting from '../../packs/macos/signal-teardown-routing.mjs';

const run = (root) => signalRouting.run(buildContext({ root, mode: 'all' }));

const DELEGATE = `import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ n: Notification) { AudioHub.shared.start() }
}
`;

const HUB = `import AVFoundation

final class AudioHub {
  static let shared = AudioHub()
  func start() {
    engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: fmt) { _, _ in }
  }
}
`;

const ROUTING = `import AppKit

let signalSources = [SIGTERM, SIGINT, SIGHUP].map { sig -> DispatchSourceSignal in
  signal(sig, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
  source.setEventHandler { NSApp.terminate(nil) }
  source.resume()
  return source
}
`;

const app = (files) => makeRepo({ changed: {
  'Sources/App/AppDelegate.swift': DELEGATE,
  'Sources/App/AudioHub.swift': HUB,
  ...files,
} });

test('signal-teardown-routing: flags a capture app that routes no signals at all', () => {
  const root = app({});
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'signal-teardown-routing');
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'Sources/App/AudioHub.swift');
    assert.equal(findings[0].line, 6);
    assert.match(findings[0].what, /nothing in the sources routes termination signals/);
    assert.match(findings[0].fix, /makeSignalSource/);
  } finally { cleanup(root); }
});

test('signal-teardown-routing: flags a signal nothing in the sources names', () => {
  const root = app({
    'Sources/App/main.swift': ROUTING.replace(', SIGHUP', ''),
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /SIGHUP appears nowhere/);
    assert.match(findings[0].fix, /SIGHUP/);
  } finally { cleanup(root); }
});

test('signal-teardown-routing: flags SIG_IGN called only after resume()', () => {
  const root = app({
    'Sources/App/main.swift': `import AppKit

let signalSources = [SIGTERM, SIGINT, SIGHUP].map { sig -> DispatchSourceSignal in
  let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
  source.setEventHandler { NSApp.terminate(nil) }
  source.resume()
  signal(sig, SIG_IGN)
  return source
}
`,
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 6);
    assert.match(findings[0].what, /SIG_IGN\) only after resume/);
  } finally { cleanup(root); }
});

test('signal-teardown-routing: flags a resumed source with no SIG_IGN anywhere', () => {
  const root = app({
    'Sources/App/main.swift': ROUTING.replace('  signal(sig, SIG_IGN)\n', ''),
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /without ever calling signal\(…, SIG_IGN\)/);
  } finally { cleanup(root); }
});

test('signal-teardown-routing: clean when all three are routed and SIG_IGN precedes resume', () => {
  const root = app({ 'Sources/App/main.swift': ROUTING });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('signal-teardown-routing: NOT flagged for a command-line tool (FP guard)', () => {
  // No NSApplication: there is no NSApp.terminate to route into, and this rule
  // has no opinion about how a CLI handles signals.
  const root = makeRepo({ changed: { 'Sources/tool/main.swift': HUB } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('signal-teardown-routing: NOT flagged for an app that installs no tap (FP guard)', () => {
  // No tap, no IOProc to abandon — an app with nothing at stake is not this
  // rule's business, however it handles signals.
  const root = makeRepo({ changed: { 'Sources/App/AppDelegate.swift': DELEGATE } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('signal-teardown-routing: accepts sigaction as routing (FP guard)', () => {
  const root = app({
    'Sources/App/main.swift': `import AppKit
var action = sigaction()
for sig in [SIGTERM, SIGINT, SIGHUP] { sigaction(sig, &action, nil) }
`,
  });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('signal-teardown-routing: an unrelated resume() above the setup is not the ordering bug (FP guard)', () => {
  const root = app({
    'Sources/App/main.swift': `import AppKit

URLSession.shared.dataTask(with: url) { _, _, _ in }.resume()

${ROUTING}`,
  });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('signal-teardown-routing: NOT flagged when only a comment describes the routing (FP guard)', () => {
  // Comments are stripped: prose naming makeSignalSource is not an implementation,
  // so the app still reads as unrouted rather than as correctly routed.
  const root = app({
    'Sources/App/main.swift': `import AppKit
// TODO: route SIGTERM/SIGINT/SIGHUP with DispatchSource.makeSignalSource and SIG_IGN
NSApplication.shared.run()
`,
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /nothing in the sources routes termination signals/);
  } finally { cleanup(root); }
});
