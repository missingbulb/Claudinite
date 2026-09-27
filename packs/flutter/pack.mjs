// Flutter and Dart practice: prose, two forbidden-pattern checks over the shipped
// Dart tree, two path-forced skills, and the Flutter SDK a cloud session needs.
// Fingerprint: a pubspec.yaml at the repo root or one directory down, never deeper.
export default {
  version: '60927.2',
  minEngineVersion: '60927.1',
  ruleRoutingGuidance: {
    belongs: 'widget-tree architecture, ports and fakes, widget-test and golden mechanics, pub and analyze toolchain habits for Flutter',
    excludes: 'native Android or iOS module concerns — android and ios; store shipping — play-store-release, app-store-release',
  },
  pitch: 'Flutter code drifts toward widgets that call plugins directly and golden tests that hang or render boxes. This pack gives Claude Code sessions about a dozen rules for keeping plugins behind ports, making anything that fetches injectable, guarding async lifecycles, and keeping flutter analyze at zero issues. Its skills cover widget and golden test mechanics and telling a real dependency change from pubspec lockfile churn, while a few checks catch network fetches inside the widget tree before they reach review.',
  relevanceDetector: { about: 'pubspec.yaml (at the repo root or one directory down)', paths: /^([^/]+\/)?pubspec\.yaml$/ },
  // The Flutter SDK isn't in the Claude Code Web base image, so a cloud session
  // can't run `flutter test` / analyze / golden regen without it. This declares
  // how the environment installs it (aggregated into environment-setup-command.sh) and
  // how the SessionStart check asserts it — see engine/pack_loader/env-requirements.mjs.
  env: {
    label: 'Flutter SDK',
    setup: [
      'if [ ! -x /opt/flutter/bin/flutter ]; then',
      '  git clone --depth 1 -b stable https://github.com/flutter/flutter.git /opt/flutter',
      'fi',
      'ln -sf /opt/flutter/bin/flutter /usr/local/bin/flutter',
      'ln -sf /opt/flutter/bin/dart /usr/local/bin/dart',
      'git config --global --add safe.directory /opt/flutter || true',
      'flutter --version || true',
      'flutter precache || true   # warm host engine artifacts so the first test is fast',
    ].join('\n'),
    probe: 'command -v flutter >/dev/null 2>&1',
  },
};
