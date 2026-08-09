import { posix } from 'node:path';
import { finding } from '../../../../engine/checks/helpers/findings.mjs';

// `docs/` is canon-maintainer reference and sits OUTSIDE the vendor set: a
// consumer's mount carries the declared packs' own directories plus the engine,
// never the canon's `docs/` tree. So a link written from a file under
// `packs/<pack>/` — prose a session reads, a README, a task doc — resolves to
// nothing in every repo that mounts the pack, while resolving perfectly here,
// which is why the class reaches `main` unnoticed (#424). The reference-integrity
// rule cannot cover it: that one is work-scoped and sees only paths the branch
// itself deletes, and `docs/` is never deleted.
//
// Scope is the shared canon only — `packs/<pack>/…`, the tree that ships. The
// canon home's own local packs (`.claudinite/local/packs/`) are never vendored
// anywhere, so a `docs/` link from one resolves for its only reader. `packs/README.md`
// is likewise out of scope: it sits at the root of the tree rather than inside a
// pack directory, so no vendor walk ever picks it up.
//
// Home-only by declaration: canon-curation is declared solely in the canon home
// repo, which gates this rule for free.
const LINK = /\]\(\s*<?([^)>\s]+?)>?\s*\)/g;
const IN_PACK = /^packs\/[^/]+\/.+/;
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

// Every markdown link target on `line`, resolved to a repo-relative path.
// Anchors, in-page fragments and absolute/external targets carry no repo path.
function linkTargets(file, line) {
  const dir = posix.dirname(file);
  const out = [];
  for (const [, raw] of line.matchAll(LINK)) {
    const target = raw.split('#')[0];
    if (!target || target.startsWith('/') || EXTERNAL.test(target)) continue;
    out.push(posix.normalize(posix.join(dir, target)));
  }
  return out;
}

const rule = {
  id: 'pack-no-docs-link',
  severity: 'blocking',
  description: 'No file under packs/<pack>/ links into the canon docs/ tree — docs/ is outside the vendor set',
  doc: '.claudinite/local/packs/claudinite/RULES.md',
  why: 'docs/ is not vendored, so the link resolves here and dangles in every consumer that mounts the pack',

  run(ctx) {
    const findings = [];
    for (const file of ctx.files) {
      if (!IN_PACK.test(file)) continue;
      const text = ctx.read(file);
      if (text === null) continue;
      text.split('\n').forEach((line, i) => {
        for (const target of linkTargets(file, line)) {
          if (!target.startsWith('docs/')) continue;
          findings.push(finding(rule, {
            file, line: i + 1,
            what: `links to ${target}, which no consumer's mount carries`,
            fix: 'drop the link — name the document in plain text, or point at docs/ from the issue or PR instead',
          }));
        }
      });
    }
    return findings;
  },
};

export default rule;
