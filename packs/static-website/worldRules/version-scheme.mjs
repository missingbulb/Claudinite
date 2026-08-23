import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { VERSION_RE, readVersion } from '../stubs/actions/bump-site-version/bump.mjs';
import { parseConfig } from '../stubs/actions/read-site-config/read-config.mjs';
import { CONFIG_PATH } from './site-config.mjs';

// The date-anchored version — `<major>.<ymmdd>.<n>`, released as `v…` — is the
// standard's one number, and it is only worth anything if every record of it in
// the repo says the same thing. The bump writes them together (validating all of
// them before writing any); this catches the hand edit that touched one, and the
// version that isn't the scheme at all.
//
// The scheme itself — what ymmdd means, why the year digit is there, how the day
// counter and the decade wrap work — lives with the code that computes it, in
// stubs/actions/bump-site-version/bump.mjs, which is where VERSION_RE and the
// version reader are imported from: one definition, no second copy to drift.
const rule = {
  id: 'sw/version-scheme',
  severity: 'blocking',
  description: 'Every declared version record carries the same <major>.<ymmdd>.<n> version',
  doc: 'packs/static-website/skills/static-site-releases/SKILL.md',
  why: 'a version that is off-scheme cannot be bumped (the release fails), and records that disagree ship a number that matches nothing that was released',

  run(ctx) {
    const configText = ctx.read(CONFIG_PATH);
    if (configText === null) return [];
    const { values } = parseConfig(configText);
    const files = (values.get('version_files') ?? '').split(/\s+/).filter(Boolean);
    if (!files.length) return [];

    const out = [];
    let first = null;
    for (const file of files) {
      const text = ctx.read(file);
      if (text === null) {
        out.push(finding(rule, {
          file: CONFIG_PATH,
          what: `version_files names "${file}", which does not exist`,
          fix: `create the version record, or drop it from version_files`,
        }));
        continue;
      }
      let version;
      try {
        version = readVersion(file, text);
      } catch (err) {
        out.push(finding(rule, { file, what: err.message, fix: 'give the file a "version" field, or drop it from version_files' }));
        continue;
      }
      if (!VERSION_RE.test(version)) {
        out.push(finding(rule, {
          file,
          what: `version "${version}" is not <major>.<ymmdd>.<n> — ymmdd is the last digit of the year then MMDD (e.g. 1.61231.3 for 2026-12-31)`,
          fix: 'set the version to the scheme by hand once; every release after that is the pipeline\'s bump',
        }));
        continue;
      }
      if (first === null) first = { file, version };
      else if (version !== first.version) {
        out.push(finding(rule, {
          file,
          what: `version "${version}" disagrees with ${first.file}'s "${first.version}"`,
          fix: 'make every version record carry the same version — the bump writes them together, so a disagreement is a hand edit',
        }));
      }
    }
    return out;
  },
};

export default rule;
