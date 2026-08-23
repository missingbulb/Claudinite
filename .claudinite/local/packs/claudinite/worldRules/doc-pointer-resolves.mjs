import { finding } from '../../../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../../../engine/checks/helpers/code-scanning.mjs';

// A coded rule module's `doc:` field is never opened by any code — it only
// renders into a finding's `More:` line when the rule actually fires (see
// pattern-rules.mjs's own header). A file move or rename that leaves a
// sibling rule's `doc:` pointing at the old path is invisible until a session
// happens to trip that rule and follow the link — which can be indefinitely.
//
// The corpus spells a `doc:` value two ways, inconsistently: repo-root-relative
// ('packs/basics/RULES.md') and pack-relative ('skills/repo-text-sweeps/SKILL.md',
// resolved against the rule's own pack directory). Nothing in the engine ever
// resolves either spelling, so this check accepts whichever interpretation
// resolves — it is not the arbiter of which convention an author meant, only
// of whether the pointer reaches a real file under either one.
const SEED = /^(?:\.claudinite\/local\/packs|packs)\/.+\.mjs$/;
const TEST_PATH = /(^|\/)test\//;
// Anchored at the start of a line (indentation only before it) — the shape
// every real `doc:` field declaration takes, an object-literal key on its own
// line — so a `doc:` substring sitting mid-line inside an unrelated string or
// template literal (this file's own failure-message text, for instance) is
// never mistaken for the field.
const DOC_FIELD = /^[ \t]*doc:\s*(['"])((?:(?!\1).)*)\1/gm;
const PACK_ROOT = /^(\.claudinite\/local\/packs\/[^/]+|packs\/[^/]+)\//;

const rule = {
  id: 'doc-pointer-resolves',
  severity: 'blocking',
  description: "A rule module's doc: field resolves to a real file, repo-root-relative or relative to the rule's own pack",
  doc: '.claudinite/local/packs/claudinite/RULES.md',
  why: 'a `doc:` pointer is never opened by any code, only rendered into a finding\'s More: line when the rule fires — a stale one left by an unrelated file move can sit broken indefinitely with nothing to catch it',

  run(ctx) {
    const out = [];
    for (const file of ctx.tracked.filter((f) => SEED.test(f) && !TEST_PATH.test(f))) {
      const source = ctx.read(file);
      if (source === null) continue;
      const code = stripComments(source);
      const packRoot = PACK_ROOT.exec(file)?.[1] ?? null;
      PACK_ROOT.lastIndex = 0;
      for (const m of code.matchAll(DOC_FIELD)) {
        const value = m[2];
        if (/^https?:\/\//.test(value)) continue;
        const rootRelative = ctx.exists(value);
        const packRelative = packRoot !== null && ctx.exists(`${packRoot}/${value}`);
        if (rootRelative || packRelative) continue;
        const line = code.slice(0, m.index).split('\n').length;
        out.push(finding(rule, {
          file, line,
          what: `doc: "${value}" resolves to nothing, repo-root-relative or relative to ${packRoot ?? 'this file\'s pack'}`,
          fix: `point doc: at the prose's current path, or drop the field if the rule now states its own case`,
        }));
      }
    }
    return out;
  },
};

export default rule;
