import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { parseVersion, compareVersions } from '../../../engine/version.mjs';
import { VERSIONS_FILENAME, rowVersions } from '../workRules/pack-version-bumped.mjs';

// VERSIONS.md ROWS RUN NEWEST-FIRST — a new row goes at the top, immediately
// under the header. Nothing states or holds that today: rows get appended
// wherever the writing session happened to land, so a long file's tail drifts
// out of sequence and a reader can no longer tell whether a number near the
// bottom is old or merely misplaced. `packs/claudinite-tasks/VERSIONS.md`
// carried exactly that shape — descending from 60831.9 to 60824.1, then four
// rows trailing out of order — before this rule sorted it (#1542).
//
// WORLD SCOPE, because ordering is a property of the whole file, not of any
// one diff: a session appending one row in the right place cannot see that an
// earlier session already left the tail scrambled.
const rule = {
  id: 'pack-version-log-ordered',
  severity: 'blocking',
  description: 'A pack\'s VERSIONS.md rows run strictly descending by version, newest first',
  doc: 'packs/claudinite-canon-curation/README.md',
  why: 'a reader trusts a VERSIONS.md row\'s position to say its age; once the tail drifts out of sequence a number near the bottom could be old or merely misplaced, and nothing short of re-deriving the order from the numbers themselves can tell which (#1542)',

  run(ctx) {
    const findings = [];
    const logs = ctx.files.filter((f) => f.startsWith('packs/')
      && f.endsWith(`/${VERSIONS_FILENAME}`) && f.split('/').length === 3);
    for (const file of logs) {
      const claims = rowVersions(ctx.read(file)).filter((c) => parseVersion(c.version));
      for (let i = 1; i < claims.length; i += 1) {
        const prev = claims[i - 1];
        const curr = claims[i];
        if (compareVersions(curr.version, prev.version) > 0) {
          findings.push(finding(rule, {
            file,
            line: curr.line,
            what: `version ${curr.version} sits below ${prev.version} (line ${prev.line}) but is newer — VERSIONS.md rows must run newest-first`,
            fix: `move the row for ${curr.version} above line ${prev.line}, so rows descend by version top to bottom`,
          }));
        }
      }
    }
    return findings;
  },
};

export default rule;
