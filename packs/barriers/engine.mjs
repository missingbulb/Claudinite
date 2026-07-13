import { finding } from '../../checks/lib/findings.mjs';

// The barriers detection engine — language-agnostic enforcement of a directed
// folder-access graph. A *barrier edge* forbids the files under one folder from
// referencing another; the engine finds every crossing reference.
//
// The one idea that keeps it precise and technology-agnostic: **the repo tree is
// the oracle.** A candidate reference (an import specifier, a path in a comment, a
// bare filename) only counts when it *resolves to a real tracked path* inside the
// barred folder. An English word that merely happens to be a folder's name never
// resolves, so it never fires — no per-language parser, no allowlist of file
// types, and near-zero false positives. See packs/barriers/README.md, including
// its "Known limitations" section for the reference forms this does not resolve.
//
// Exported for composition: another pack imports `defineBarrier` (or the lower
// `normalizeEdges` + `barrierFindings`) and contributes a fixed barrier as one of
// its own `rules`, the same way packs already share the checks/ engine lib.

export const DEFAULT_DOC = 'packs/barriers/README.md';

// --- path helpers (posix; both separators accepted on input) ----------------

// A folder/target prefix as the config author wrote it → a bare posix prefix:
// backslashes folded, a leading "./" or "/" and any trailing "/" stripped, and a
// lone "." (repo root) collapsed to "". '*' is the isolation wildcard and passes
// through untouched. A prefix that collapses to "" is rejected by normalizeEdges
// (an empty prefix would match every path), never silently enforced.
export function normPrefix(p) {
  if (p === '*') return '*';
  const s = String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  return s === '.' ? '' : s;
}

// Join `rel` onto `base` and resolve "." / ".." segments, posix-style. Returns
// null when the path escapes the repo root (a leading "..") — such a reference
// points outside the tree and is not resolvable here.
function normJoin(base, rel) {
  const parts = (base ? base.split('/') : []).concat(rel.split('/'));
  const out = [];
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else return null; // escaped the repo root
    } else out.push(seg);
  }
  return out.join('/');
}

// `path` is inside folder `prefix` (or is it). '' matches everything; '*' never
// matches here (it is handled as the isolation wildcard, not a real prefix).
export function under(path, prefix) {
  if (prefix === '') return true;
  if (prefix === '*') return false;
  return path === prefix || path.startsWith(`${prefix}/`);
}

// A bare filename carries an extension. The cap tolerates long real suffixes
// (`.properties`, `.stylesheet`) while still requiring a letter-led extension.
const hasExt = (base) => /\.[A-Za-z][A-Za-z0-9]{0,19}$/.test(base);

// Extension/index completion, for extension-less import specifiers (`../server/db`
// → server/db.ts) and directory imports (`../server` → server/index.ts). Applied
// only to slash-based path attempts — NOT to the dotted-module conversion, which
// completes with Python extensions alone (see resolveRef).
const TRY_EXT = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.less', '.py', '.go', '.rb', '.java', '.rs', '.php', '.html', '.vue', '.svelte'];
const TRY_INDEX = ['/index.js', '/index.mjs', '/index.ts', '/index.tsx', '/index.jsx'];

// --- repo index (built once per run) ----------------------------------------

// Every tracked path, every directory prefix, and a basename→paths map (for the
// unique-filename layer). Built from ctx.tracked so a reference resolves against
// the whole repo, not just the changed set.
export function buildIndex(ctx) {
  const files = new Set();
  const dirs = new Set();
  const byBase = new Map();
  for (const raw of ctx.tracked) {
    const f = raw.replace(/\\/g, '/');
    files.add(f);
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    const base = parts[parts.length - 1];
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(f);
  }
  return { files, dirs, byBase };
}

// Does `p` name a real tracked file or directory (allowing extension/index and
// Sass-partial completion)? Returns the concrete resolved path, or null.
function matchTree(p, index) {
  if (!p) return null;
  if (index.files.has(p)) return p;
  if (index.dirs.has(p)) return p;
  for (const ext of TRY_EXT) if (index.files.has(p + ext)) return p + ext;
  for (const idx of TRY_INDEX) if (index.files.has(p + idx)) return p + idx;
  // Sass/SCSS underscore partials: dir/name → dir/_name.scss (imported without the _).
  const slash = p.lastIndexOf('/');
  const partial = `${p.slice(0, slash + 1)}_${p.slice(slash + 1)}`;
  for (const ext of ['.scss', '.sass']) if (index.files.has(partial + ext)) return partial + ext;
  return null;
}

// --- candidate extraction ---------------------------------------------------

// Quoted string contents (import specifiers, require paths, config values, JSON).
const QUOTED = /'([^'\n]+)'|"([^"\n]+)"|`([^`\n]+)`/g;
// Unquoted path-ish tokens (comments, Markdown, plain prose): a relative path, a
// multi-segment slash path, or a bare filename that carries an extension.
const PATHISH = /(?:\.{1,2}[\\/])[\w.@+\-\\/]+|[\w@+\-][\w.@+\-]*(?:[\\/][\w.@+\-]+)+|[\w@+\-][\w.@+\-]*\.[A-Za-z][A-Za-z0-9]{0,19}/g;
const URLISH = /^(?:[a-z][a-z0-9+.\-]*:)?\/\//i; // http://, https://, //cdn, mailto: handled below

// Every reference candidate on one line, de-duplicated, cleaned of wrapping
// punctuation, URLs and query/hash tails dropped.
export function candidatesOn(line) {
  const raw = new Set();
  let m;
  QUOTED.lastIndex = 0;
  while ((m = QUOTED.exec(line)) !== null) raw.add(m[1] ?? m[2] ?? m[3]);
  PATHISH.lastIndex = 0;
  while ((m = PATHISH.exec(line)) !== null) raw.add(m[0]);

  const out = new Set();
  for (let c of raw) {
    c = c.trim().replace(/[?#].*$/, ''); // drop query string / anchor
    c = c.replace(/^[([{<'"`]+/, '').replace(/[)\]}>'"`.,;:]+$/, ''); // wrapping punctuation
    if (!c) continue;
    if (URLISH.test(c) || c.startsWith('mailto:')) continue;
    out.add(c);
  }
  return [...out];
}

// Resolve one candidate string, seen in a file whose directory is `fromDir`, to a
// concrete tracked path — or null when it names nothing in the repo. Tries, in
// order: file-relative, repo-root-relative, Python-style dotted module, and the
// unique-basename layer (a bare `name.ext` that exactly one tracked file carries).
export function resolveRef(candidate, fromDir, index) {
  const c = candidate.replace(/\\/g, '/');
  const attempts = [];

  if (c.startsWith('./') || c.startsWith('../')) {
    attempts.push(normJoin(fromDir, c));
  } else if (c.startsWith('/')) {
    attempts.push(normJoin('', c.slice(1)));
  } else {
    // File-relative first: a local reference that stays within `from` resolves
    // here and is (correctly) not a crossing — preferring it over the repo-root
    // interpretation avoids a false crossing when both paths happen to exist.
    attempts.push(normJoin(fromDir, c));
    if (c.includes('/')) attempts.push(normJoin('', c)); // repo-root relative
  }
  for (const p of attempts) {
    const hit = matchTree(p, index);
    if (hit) return hit;
  }

  // Python-style dotted module: a.b.c → a/b/c, completed with PYTHON extensions
  // ONLY. JS/TS/… never address modules with dots — there a `receiver.method()`
  // call is member access, not a module path — so restricting completion to
  // `.py`/`__init__.py` keeps the tree from fabricating a `db/query.js` match for
  // a `db.query(...)` call. The genuinely-ambiguous Python case still resolves.
  if (!c.includes('/') && c.includes('.') && /^[A-Za-z_][\w.]*[A-Za-z0-9_]$/.test(c)) {
    const d = normJoin('', c.replace(/\./g, '/'));
    if (d) {
      if (index.files.has(d)) return d;
      if (index.dirs.has(d)) return d;
      if (index.files.has(`${d}.py`)) return `${d}.py`;
      if (index.files.has(`${d}/__init__.py`)) return `${d}/__init__.py`;
    }
  }

  // Unique filename-with-extension: a bare `tokenStore.ts` mentioned anywhere
  // resolves only when exactly one tracked file carries that basename (no
  // collision → no false positive). The owner-scoped filename layer.
  if (!c.includes('/') && hasExt(c)) {
    const paths = index.byBase.get(c);
    if (paths && paths.length === 1) return paths[0];
  }
  return null;
}

// --- edge normalization -----------------------------------------------------

// A single normalized edge's shape problem, or null if it is well-formed. Shared
// by the direct and `between` forms so neither can slip past validation.
function edgeProblem(edge, at) {
  if (edge.from === '') {
    return { what: `${at}: "from" must name a real subfolder`, fix: 'name the folder to guard, e.g. "client" (not "", ".", or "/")' };
  }
  if (edge.to === '') {
    return { what: `${at}: "to" must name a real subfolder, or "*"`, fix: 'name the barred folder, or use "*" for isolation' };
  }
  if (edge.allow.some((a) => a === '' || a === '*')) {
    return { what: `${at}: every "allow" entry must name a real folder`, fix: 'remove the empty/"*" allow entry (it would disable the barrier), or name a shared folder' };
  }
  if (edge.to !== '*' && (edge.from === edge.to || under(edge.to, edge.from) || under(edge.from, edge.to))) {
    return { what: `${at}: "from" (${edge.from}) and "to" (${edge.to}) overlap`, fix: 'a folder cannot be barred from itself or an ancestor/descendant — pick disjoint folders' };
  }
  return null;
}

// Turn author-written barrier specs into normalized edges, collecting shape
// errors as { what, fix } for the caller to surface as blocking findings.
//   { from, to, allow?, reason? }        one directed ban
//   { between: [a, b], allow?, reason? } sugar → both directions
//   to may be '*' — isolation: `from` may reference nothing outside itself/allow
//   allow may be a string (one folder) or an array of them
export function normalizeEdges(specs) {
  const edges = [];
  const errors = [];
  if (!Array.isArray(specs)) {
    return { edges, errors: [{ what: 'barrier rules must be an array', fix: 'set "rules" to an array of barrier entries' }] };
  }
  specs.forEach((spec, i) => {
    const at = `barrier rule #${i + 1}`;
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      errors.push({ what: `${at} must be an object`, fix: 'use { "from": "...", "to": "..." } or { "between": ["a","b"] }' });
      return;
    }

    // allow: a string is single-folder shorthand; anything else non-array is an error.
    let allowRaw;
    if (spec.allow === undefined) allowRaw = [];
    else if (typeof spec.allow === 'string') allowRaw = [spec.allow];
    else if (Array.isArray(spec.allow)) allowRaw = spec.allow;
    else {
      errors.push({ what: `${at}: "allow" must be a folder path or an array of them`, fix: 'use "allow": "shared" or "allow": ["shared", "contracts"]' });
      return;
    }
    if (allowRaw.some((a) => typeof a !== 'string')) {
      errors.push({ what: `${at}: every "allow" entry must be a string`, fix: 'each allow entry names a folder path' });
      return;
    }
    const allow = allowRaw.map(normPrefix);
    const reason = typeof spec.reason === 'string' ? spec.reason : null;
    const mk = (from, to) => ({ from: normPrefix(from), to: to === '*' ? '*' : normPrefix(to), allow, reason });

    if (Array.isArray(spec.between)) {
      if (spec.between.length !== 2 || spec.between.some((s) => typeof s !== 'string' || !s.trim())) {
        errors.push({ what: `${at} "between" must be two folder paths`, fix: 'use "between": ["clientDir", "serverDir"]' });
        return;
      }
      const [a, b] = spec.between;
      const e1 = mk(a, b);
      const e2 = mk(b, a);
      const prob = edgeProblem(e1, at) || edgeProblem(e2, at);
      if (prob) { errors.push(prob); return; }
      edges.push(e1, e2);
      return;
    }
    if (typeof spec.from !== 'string' || !spec.from.trim() || typeof spec.to !== 'string' || !spec.to.trim()) {
      errors.push({ what: `${at} needs string "from" and "to" (or a "between" pair)`, fix: 'add "from" and "to" folder paths, or a "between": [a, b]' });
      return;
    }
    const edge = mk(spec.from, spec.to);
    const prob = edgeProblem(edge, at);
    if (prob) { errors.push(prob); return; }
    edges.push(edge);
  });
  return { edges, errors };
}

// --- the scan ---------------------------------------------------------------

// Is a reference that resolved to `r` a violation of `edge`, for a guarded file
// under edge.from? References within `from` itself and within any `allow` folder
// are always fine; '*' bars everything else, a named `to` bars only that folder.
function violates(edge, r) {
  if (under(r, edge.from)) return false;
  if (edge.allow.some((a) => under(r, a))) return false;
  return edge.to === '*' ? true : under(r, edge.to);
}

function describe(edge, raw, r) {
  const landing = edge.to === '*'
    ? `"${r}", outside the isolated folder "${edge.from}"`
    : `"${r}", inside the barred folder "${edge.to}"`;
  return `references "${raw}" → resolves to ${landing}`;
}

// Run the given edges over the context, returning findings. `rule` supplies id /
// severity / doc for each finding (so both the config-driven check and a
// composed pack rule share one implementation).
export function barrierFindings(ctx, edges, rule) {
  if (!edges.length) return [];
  const index = buildIndex(ctx);
  const out = [];
  const seen = new Set();
  const readCache = new Map();
  const read = (f) => {
    if (!readCache.has(f)) readCache.set(f, ctx.read(f));
    return readCache.get(f);
  };

  for (const edge of edges) {
    const guarded = ctx.files.filter((f) => under(f.replace(/\\/g, '/'), edge.from));
    for (const file of guarded) {
      const text = read(file);
      if (text === null) continue;
      const fromDir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const raw of candidatesOn(lines[i])) {
          const r = resolveRef(raw, fromDir, index);
          if (r === null || !violates(edge, r)) continue;
          const key = `${file}:${i + 1}:${r}:${edge.from}>${edge.to}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const allowHint = edge.allow.length
            ? `route shared code through an allowed folder (${edge.allow.join(', ')})`
            : 'route shared code through a shared/contracts folder both sides may use';
          out.push(finding(rule, {
            file,
            line: i + 1,
            what: describe(edge, raw, r),
            why: edge.reason || rule.why,
            fix: `${allowHint}, remove the reference, or accept it in .claudinite-checks.json with a reason if the crossing is deliberate`,
          }));
        }
      }
    }
  }
  return out;
}

// Emit a spec/shape error as a blocking finding pinned at the settings file.
export function specFinding(rule, { what, fix }) {
  return finding(rule, {
    file: '.claudinite-checks.json',
    line: null,
    what: `barriers config: ${what}`,
    why: 'a malformed barrier declaration silently enforces nothing',
    fix,
    severity: 'blocking',
  });
}

// Compose a barrier as a standalone rule — for a pack that contributes a fixed
// graph (import this, add the result to its `rules`).
export function defineBarrier({ id, edges, severity = 'blocking', doc = DEFAULT_DOC, description, why }) {
  const norm = normalizeEdges(edges);
  const rule = {
    id,
    severity,
    doc,
    description: description || 'Files under a guarded folder must not reference a barred folder',
    why: why || 'a folder barrier encodes an architectural boundary; a crossing reference erodes it silently',
    run(ctx) {
      const out = norm.errors.map((e) => specFinding(rule, e));
      out.push(...barrierFindings(ctx, norm.edges, rule));
      return out;
    },
  };
  return rule;
}
