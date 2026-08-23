import { fileURLToPath } from 'node:url';
import { ruleTester } from '../../../engine-tests/helpers.mjs';
import { loadDeclaredChecks } from '../../../engine/checks/helpers/pattern-rules.mjs';

const suddenTermination = loadDeclaredChecks(
  fileURLToPath(new URL('../../../packs/macos', import.meta.url)),
).find((r) => r.id === 'sudden-termination-vs-teardown');

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

const SUDDEN_TRUE = plist('  <key>NSSupportsSuddenTermination</key>\n  <true/>');

ruleTester(suddenTermination, {
  flagged: {
    'the key set true in an app with terminate teardown': {
      files: { 'Sources/App/AppDelegate.swift': DELEGATE, 'Resources/Info.plist': SUDDEN_TRUE },
      // The declared form judges the whole plist (the key/value pair spans
      // lines), so the finding anchors at the file, not a line.
      at: [{
        file: 'Resources/Info.plist', line: null, severity: 'blocking',
        fix: /remove the NSSupportsSuddenTermination key/,
      }],
    },
    'an installTap tap alone counts as teardown to lose (no delegate method at all)': {
      files: {
        'Sources/App/AudioHub.swift':
          'engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: fmt) { _, _ in }\n',
        'Info.plist': SUDDEN_TRUE,
      },
      at: [{ file: 'Info.plist' }],
    },
  },
  clean: {
    'the key set <false/> is the explicit opt-OUT, never a finding (FP guard)': {
      files: {
        'Sources/App/AppDelegate.swift': DELEGATE,
        'Resources/Info.plist': plist('  <key>NSSupportsSuddenTermination</key>\n  <false/>'),
      },
    },
    'an app that runs nothing at terminate keeps the optimisation (FP guard)': {
      files: {
        'Sources/App/main.swift': 'import AppKit\nNSApplication.shared.run()\n',
        'Info.plist': SUDDEN_TRUE,
      },
    },
    'a comment naming the teardown is not teardown (FP guard)': {
      files: {
        'Sources/App/main.swift': '// we deliberately implement no applicationWillTerminate here\nimport AppKit\n',
        'Info.plist': SUDDEN_TRUE,
      },
    },
    'the key named only in prose stays quiet — *.plist is the whole scope (FP guard)': {
      files: {
        'Sources/App/AppDelegate.swift': DELEGATE,
        'docs/lifecycle.md': 'Never add NSSupportsSuddenTermination — see the pack.\n',
        'Resources/Info.plist': plist('  <key>LSUIElement</key>\n  <true/>'),
      },
    },
  },
});
