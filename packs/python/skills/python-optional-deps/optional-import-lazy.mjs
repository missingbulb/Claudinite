import { finding } from '../../../../engine/checks_helpers/findings.mjs';
import { optionalDistNames, importNamesFor, topPackagesOf } from './pyproject.mjs';

// A declared-optional dependency imported at module top level runs at
// `import <pkg>` time — dragging the heavy/native stack (TensorFlow, Torch, a
// native binding) into the dependency-free core and breaking every path for
// anyone who installed the package without that extra. The import belongs
// inside the function/method/__init__ that uses it, so importing the package
// stays cheap. Repo-state on purpose: a leaked top-level import is a live
// core-breakage however long ago it merged.
//
// RELEVANCE FIRST (see engine/README.md "Adding a rule"): a skill check runs on
// EVERY repo, so the gate is what makes the signal false-positive-free — the
// repo must declare optional dependencies in a pyproject.toml
// ([project.optional-dependencies] is the ONLY place a package is DECLARED
// optional), and only those exact packages are in scope. Then, in the project's
// own .py files (test files excluded — a backend-specific test legitimately
// top-level-imports its extra behind an importorskip; the skill's own dir
// excluded so its fixtures never self-flag), a module-top-level (column-0, so
// outside any def/class/try) import of a declared-optional package is the
// violation.
//
// Out of scope, documented, never a false-positive: a top-level import GUARDED
// by try/except is indented (never column 0) so it is not flagged here — that
// shape belongs to the sibling install-hint rule; and a dist whose import name
// is unrelated to its dist name is not mapped (see pyproject.mjs), so it is not
// flagged either.
const SELF = 'skills/python-optional-deps/';
const PY_EXT = /\.py$/;
const TESTISH = /(^|\/)(tests?|__tests__)\/|(^|\/)(test_[^/]*|conftest)\.py$|_test\.py$/;
const PYPROJECT = /(^|\/)pyproject\.toml$/;
const TOP_LEVEL_IMPORT = /^(import|from)\s/; // column 0 — no leading whitespace

function optionalImportNames(ctx) {
  const optional = new Set();
  for (const f of ctx.files.filter((f) => !f.startsWith(SELF) && PYPROJECT.test(f))) {
    for (const n of optionalDistNames(ctx.read(f) ?? '')) optional.add(n);
  }
  return optional.size ? importNamesFor(optional) : null;
}

const rule = {
  id: 'python-optional-import-top-level',
  severity: 'blocking',
  description: 'A declared-optional dependency is imported lazily (inside the code that needs it), never at module top level',
  doc: 'skills/python-optional-deps/SKILL.md',
  why: 'a top-level import runs at `import <pkg>` time, so a package the project itself declared optional drags its heavy/native stack into the dependency-free core and breaks every path for anyone who installed without that extra',

  run(ctx) {
    const importNames = optionalImportNames(ctx);
    if (!importNames) return [];
    const out = [];
    const pyFiles = ctx.files.filter((f) => !f.startsWith(SELF) && PY_EXT.test(f) && !TESTISH.test(f));
    for (const file of pyFiles) {
      const text = ctx.read(file);
      if (text === null) continue;
      text.split('\n').forEach((ln, i) => {
        if (!TOP_LEVEL_IMPORT.test(ln)) return;
        const pkg = topPackagesOf(ln.split('#')[0]).find((p) => importNames.has(p));
        if (pkg) out.push(finding(rule, {
          file, line: i + 1,
          what: `imports the optional dependency "${pkg}" at module top level`,
          fix: 'move the import inside the function/method/__init__ that uses it (guarded by try/except ImportError), so `import <pkg>` stays dependency-free',
        }));
      });
    }
    return out;
  },
};

export default rule;
