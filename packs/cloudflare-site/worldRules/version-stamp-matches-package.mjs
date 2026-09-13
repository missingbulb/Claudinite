import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { parseWranglerConfig, publishedDir, wranglerConfigPath } from '../lib.mjs';

// WHY. A published page names the released version in a `title="version …"`
// attribute, so a visitor can say which build they are looking at. That number is a
// copy of `package.json`'s version — the single source the release bumps — and a
// copy that drifts is worse than no number at all: it names a build that is not the
// one being served, and nothing about the page looks wrong.
//
// The copy is generated, not hand-maintained: `bump-version.mjs` writes the version
// into `package.json` and stamps it into every published page, in the same run. This
// rule is that generator's drift guard — it fires on what a hand-edit, a
// half-applied release, or a page added without the stamp all look like.
//
// SCOPE. Every tracked `.html` under the published directory that carries a stamp.
// A page without one has made no claim to check.

const STAMP = /title="version ([^"]*)"/g;

const rule = {
  id: 'cloudflare-site/version-stamp-matches-package',
  severity: 'blocking',
  since: '2026-09-13',
  description: "A published page's version stamp must carry package.json's version",
  doc: 'packs/cloudflare-site/RULES.md',
  why: 'the stamp is the only place a visitor can read which build they are on, and a stale copy names a build that was never served',

  run(ctx) {
    const pkg = ctx.read('package.json');
    if (pkg === null) return [];
    let version;
    try { version = JSON.parse(pkg).version; } catch { return []; }
    if (!version) return [];

    const configPath = wranglerConfigPath(ctx.tracked);
    const dir = configPath && publishedDir(parseWranglerConfig(ctx.read(configPath)), configPath);
    if (!dir) return [];

    const out = [];
    const pages = [...new Set([...ctx.tracked, ...(ctx.files || [])])]
      .filter((f) => f.startsWith(`${dir}/`) && f.endsWith('.html'));

    for (const page of pages) {
      const text = ctx.read(page);
      if (text === null) continue;
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        for (const [, stamped] of line.matchAll(STAMP)) {
          if (stamped === version) continue;
          out.push(finding(rule, {
            file: page,
            line: i + 1,
            what: `the page names version ${stamped}, but package.json says ${version}`,
            fix: 'run the pack\'s bump with --stamp-only — it stamps every published page from package.json and consumes no version number; never hand-edit either side',
          }));
        }
      });
    }

    return out;
  },
};

export default rule;
