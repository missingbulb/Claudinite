// Python-packaging knowledge the two optional-dependency checks share: which
// packages THIS repo declared optional, and how a distribution name maps to the
// import name a .py file would write. This is policy specific to the rules, not
// engine mechanism (that lives in checks/lib per the #351 lesson) — so it stays
// here beside the rules, imported by both. The checks runner only loads
// checks.mjs, so this module is inert to skill discovery.

// The distribution names under [project.optional-dependencies] in a
// pyproject.toml's text. Line-based (the engine carries no TOML parser): find
// the section header, and until the next top-level [header] collect the leading
// package token of every quoted requirement string. Inside that section every
// quoted token is a requirement (the extra-group keys — `yamnet = [ ... ]` —
// are unquoted), so this needs no value/key discrimination. Handles the
// standard table form (grounded in missingbulb/LaughCounter). The rarer inline
// form — `optional-dependencies = { extra = [...] }` under [project] — is not
// parsed: a safe false-negative (nothing flagged), never a false-positive.
export function optionalDistNames(tomlText) {
  const names = new Set();
  let inSection = false;
  for (const raw of tomlText.split('\n')) {
    const header = /^\s*\[([^\]]+)\]/.exec(raw);
    if (header) { inSection = header[1].trim() === 'project.optional-dependencies'; continue; }
    if (!inSection) continue;
    for (const m of raw.matchAll(/["']([^"']+)["']/g)) {
      const name = /^[A-Za-z0-9][A-Za-z0-9._-]*/.exec(m[1].trim());
      if (name) names.add(name[0].toLowerCase());
    }
  }
  return names;
}

// The import top-level package name(s) a set of dist names could appear as.
// Conservative: the name itself, plus '-'/'.' → '_' (the PEP 503-ish normal
// form, e.g. tensorflow-hub → tensorflow_hub). A dist whose import name is
// unrelated to its name (Pillow→PIL, opencv-python→cv2, scikit-learn→sklearn,
// PyYAML→yaml) is deliberately NOT mapped — so it simply isn't flagged, a safe
// false-negative, never a false-positive on an unrelated top-level import.
export function importNamesFor(distSet) {
  const imports = new Set();
  for (const d of distSet) {
    imports.add(d);
    imports.add(d.replace(/[-.]/g, '_'));
  }
  return imports;
}

// The top-level package names an `import`/`from` statement pulls in, lowercased
// for comparison against importNamesFor's set. `from a.b import c` → a (a
// relative `from . import x` yields nothing); `import a.b as x, c` → a, c.
// Callers strip trailing comments before passing the line.
export function topPackagesOf(importLine) {
  const line = importLine.trim();
  let m;
  if ((m = /^from\s+([.\w]+)\s+import\b/.exec(line))) {
    return m[1].startsWith('.') ? [] : [m[1].split('.')[0].toLowerCase()];
  }
  if ((m = /^import\s+(.+)$/.exec(line))) {
    return m[1].split(',')
      .map((part) => part.trim().split(/\s+as\s+/)[0].trim().split('.')[0].toLowerCase())
      .filter((name) => name && !name.startsWith('.'));
  }
  return [];
}
