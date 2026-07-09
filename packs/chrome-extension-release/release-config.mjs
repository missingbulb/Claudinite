import { finding } from '../../checks/lib/findings.mjs';

// `.github/release.config` is OPTIONAL — a single-package repo whose layout
// matches the defaults omits it entirely. When present, every key must be one
// the read-release-config action understands; a typo would otherwise be silently
// ignored (falling back to the default) and ship the wrong thing. This check is
// the guard that turns a misspelled key into a failed review. Keep KNOWN_KEYS in
// sync with .github/actions/read-release-config/read-config.mjs.
const KNOWN_KEYS = new Set([
  'manifest_path',
  'package_json_path',
  'setup_command',
  'test_command',
  'build_command',
  'zip_name',
  'zip_path',
  'ship_paths',
]);

const rule = {
  id: 'cer/release-config',
  severity: 'blocking',
  description: 'Every key in .github/release.config must be one the read-release-config action understands',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'an unrecognized key is silently ignored — the run would fall back to the default and ship the wrong thing',

  run(ctx) {
    const text = ctx.read('.github/release.config');
    if (text === null) return []; // optional file

    const out = [];
    text.split('\n').forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const eq = line.indexOf('=');
      if (eq === -1) {
        out.push(finding(rule, {
          file: '.github/release.config', line: i + 1,
          what: `line is not KEY=value or a # comment: "${line}"`,
          fix: 'use dotenv syntax — KEY=value, one per line',
        }));
        return;
      }
      const key = line.slice(0, eq).trim();
      if (!KNOWN_KEYS.has(key)) {
        out.push(finding(rule, {
          file: '.github/release.config', line: i + 1,
          what: `unknown key "${key}"`,
          fix: `use one of: ${[...KNOWN_KEYS].join(', ')}`,
        }));
      }
    });
    return out;
  },
};

export default rule;
