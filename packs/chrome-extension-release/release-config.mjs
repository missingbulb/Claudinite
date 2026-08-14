import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';

export default patternRule({
  id: 'cer/release-config',
  severity: 'blocking',
  description: '.github/release.config exists and sets exactly the required release keys',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'the release config is explicit with no defaults — a missing/typo\'d key would ship the wrong thing with no signal',
  checkKeyValueFile: [{
    file: '.github/release.config',
    keys: ['manifest_path', 'package_json_path', 'setup_command', 'test_command', 'ship_paths'],
    whenMissing: {
      what: 'missing — the release config is required and fully explicit (no defaults)',
      fix: 'create it with the required keys: {keys}',
    },
    whenLineNotKeyValue: {
      what: 'line is not KEY=value or a # comment: "{line}"',
      fix: 'use dotenv syntax — KEY=value, one per line',
    },
    whenKeyUnknown: {
      what: 'unknown key "{key}"',
      fix: 'valid keys: {keys}',
    },
    whenKeyMissing: {
      what: 'missing required key "{key}"',
      fix: 'add "{key}=..." (every key is explicit; "setup_command=" may be empty to mean no install)',
    },
  }],
});
