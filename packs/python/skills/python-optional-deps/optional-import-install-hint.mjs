import { finding } from '../../../../engine/checks/helpers/findings.mjs';
import { optionalDistNames, importNamesFor, topPackagesOf } from './pyproject.mjs';

// When a lazy import of an optional dependency is guarded with
// `try: import … except ImportError:` and the guard re-raises, the re-raise
// should carry an actionable install hint naming the exact extra — otherwise
// the user hits a bare ModuleNotFoundError from deep inside a backend instead
// of "pip install pkg[extra]". This flags a guard around a declared-optional
// import whose except-body re-raises with no `pip install` hint anywhere in it.
// Repo-state on purpose: an unhelpful guard is a live defect however long ago
// it merged. Advisory: whether a message names the *exact* extra is a wording
// judgment, so this nudges rather than blocks.
//
// RELEVANCE FIRST (see engine/checks/README.md "Adding a rule"): same gate as the
// sibling top-level rule — the repo must declare optional dependencies in a
// pyproject.toml, and a block is only in scope when ITS OWN try-body imports one
// of those exact packages (so an unrelated `except ImportError` — a fallback
// import, a feature probe — is never touched). Test files and the skill's own
// dir are excluded.
//
// Out of scope, documented, never a false-positive: a probe guard that sets a
// flag instead of re-raising (`except ImportError: HAVE_TF = False`) has no
// `raise`, so it is not flagged — that availability-probe shape (and its
// `# noqa: F401`) is the residue the python pack's RULES.md keeps as prose.
const SELF = 'skills/python-optional-deps/';
const PY_EXT = /\.py$/;
const TESTISH = /(^|\/)(tests?|__tests__)\/|(^|\/)(test_[^/]*|conftest)\.py$|_test\.py$/;
const PYPROJECT = /(^|\/)pyproject\.toml$/;

const indentOf = (s) => s.length - s.trimStart().length;
const isImport = (s) => /^\s*(import|from)\s/.test(s);

// Each try/except ImportError block in `text` whose try-body imports a package
// in `importNames` and whose except-body re-raises with no `pip install` hint,
// as { line } at the offending raise.
function offendingGuards(text, importNames) {
  const lines = text.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const mtry = /^(\s*)try\s*:/.exec(lines[i]);
    if (!mtry) continue;
    const base = mtry[1].length;
    // try-body: indented lines up to the dedent that ends the block
    let j = i + 1;
    let importsOptional = false;
    for (; j < lines.length; j++) {
      if (lines[j].trim() === '') continue;
      if (indentOf(lines[j]) <= base) break;
      const code = lines[j].split('#')[0];
      if (isImport(code) && topPackagesOf(code).some((p) => importNames.has(p))) importsOptional = true;
    }
    if (!importsOptional) continue;
    if (j >= lines.length || indentOf(lines[j]) !== base || !/^\s*except\b.*\bImportError\b/.test(lines[j])) continue;
    // except-body
    let raiseLine = null;
    let hasHint = false;
    for (let k = j + 1; k < lines.length; k++) {
      if (lines[k].trim() === '') continue;
      if (indentOf(lines[k]) <= base) break;
      if (/\bpip install\b/.test(lines[k])) hasHint = true;
      if (raiseLine === null && /^\s*raise\b/.test(lines[k])) raiseLine = k + 1;
    }
    if (raiseLine !== null && !hasHint) hits.push({ line: raiseLine });
  }
  return hits;
}

function optionalImportNames(ctx) {
  const optional = new Set();
  for (const f of ctx.files.filter((f) => !f.startsWith(SELF) && PYPROJECT.test(f))) {
    for (const n of optionalDistNames(ctx.read(f) ?? '')) optional.add(n);
  }
  return optional.size ? importNamesFor(optional) : null;
}

const rule = {
  id: 'python-optional-import-install-hint',
  severity: 'advisory',
  description: 'A guarded optional import that re-raises does so with a `pip install` hint naming the extra, not a bare ImportError',
  doc: 'skills/python-optional-deps/SKILL.md',
  why: 'a `try/except ImportError` guard that re-raises without an install hint leaves the user a bare ModuleNotFoundError from deep inside a backend instead of the exact `pip install pkg[extra]` that fixes it',

  run(ctx) {
    const importNames = optionalImportNames(ctx);
    if (!importNames) return [];
    const out = [];
    const pyFiles = ctx.files.filter((f) => !f.startsWith(SELF) && PY_EXT.test(f) && !TESTISH.test(f));
    for (const file of pyFiles) {
      const text = ctx.read(file);
      if (text === null) continue;
      for (const { line } of offendingGuards(text, importNames)) {
        out.push(finding(rule, {
          file, line,
          what: 're-raises a missing optional dependency without a `pip install` hint',
          fix: 'raise ImportError from the caught error with a message naming the exact extra — e.g. pip install "pkg[extra]" — so the failure tells the user how to fix it',
        }));
      }
    }
    return out;
  },
};

export default rule;
