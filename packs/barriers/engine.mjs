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
// types, and near-zero false positives. See packs/barriers/README.md.
//
// Exported for composition: another pack imports `defineBarrier` (or the lower
// `normalizeEdges` + `barrierFindings`) and contributes a fixed barrier as one of
// its own `rules`, the same way packs already share the checks/ engine lib.

export const DEFAULT_DOC = 'packs/barriers/README.md';

// --- path helpers (posix; both separators accepted on input) ----------------

// A folder/target prefix as the config author wrote it → a bare posix prefix:
// backslashes folded, a leading "./" and any trailing "/" stripped. '*' is the
// isolation wildcard and passes through untouched.
export function normPrefix(p) {
  if (p === '*') return '*';
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
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
  if (prefix === '' ) return true;
  if (prefix === '*') return false;
  return path === prefix || path.startsWith(`${prefix}/`);
}

const hasExt = (base) => /\.[A-Za-z][A-Za-z0-9]{0,7}$/.test(base);

// Extension/index completion, for extension-less import specifiers (`../server/db`
// → server/db.ts) and directory imports (`../server` → server/index.ts).
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

// Does `p` name a real tracked file or directory (allowing extension/index
// completion)? Returns the concrete resolved path, or null.
function matchTree(p, index) {
  if (p === null || p === '') return null;
  if (index.files.has(p)) return p;
  if (index.dirs.has(p)) return p;
  for (const ext of TRY_EXT) if (index.files.has(p + ext)) return p + ext;
  for (const idx of TRY_INDEX) if (index.files.has(p + idx)) return p + idx;
  return null;
}

// --- candidate extraction ---------------------------------------------------

// Quoted string contents (import specifiers, require paths, config values, JSON).
const QUOTED = /'([^'\n]+)'|"([^"\n]+)"|`([^`\n]+)`/g;
// Unquoted path-ish tokens (comments, Markdown, plain prose): a relative path, a
// multi-segment slash path, or a bare filename that carries an extension.
const PATHISH = /(?:\.{1,2}[\\/])[\w.@+\-\\/]+|[\w@+\-][\w.@+\-]*(?:[\\/][\w.@+\-]+)+|[\w@+\-][\w.@+\-]*\.[A-Za-z][A-Za-z0-9]{0,7}/g;
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
// order: relative-to-file, repo-root-relative, Python-style dotted module, and the
// unique-basename layer (a bare `name.ext` that exactly one tracked file carries).
export function resolveRef(candidate, fromDir, index) {
  const c = candidate.replace(/\\/g, '/');
  const attempts = [];

  if (c.startsWith('./') || c.startsWith('../')) {
    attempts.push(normJoin(fromDir, c));
  } else if (c.startsWith('/')) {
    attempts.push(normJoin('', c.slice(1)));
  } else {
    if (c.includes('/')) attempts.push(normJoin('', c)); // repo-root relative
    attempts.push(normJoin(fromDir, c)); // implicitly-relative to the file
    // Python-style dotted module: a.b.c → a/b/c. Attempted for any no-slash
    // dotted token — `mod.py` vs `pkg.mod` is undecidable from the text, so the
    // tree arbitrates: whichever interpretation names a real path wins (a bare
    // filename.ext that names nothing here falls through to the unique-basename
    // layer below).
    if (!c.includes('/') && c.includes('.') && /^[A-Za-z_][\w.]*[A-Za-z0-9_]$/.test(c)) {
      attempts.push(normJoin('', c.replace(/\./g, '/')));
    }
  }
  for (const p of attempts) {
    const hit = matchTree(p, index);
    if (hit) return hit;
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

// Turn author-written barrier specs into normalized edges, collecting shape
// errors as { what, fix } for the caller to surface as blocking findings.
//   { from, to, allow?, reason? }        one directed ban
//   { between: [a, b], allow?, reason? } sugar → both directions
//   to may be '*' — isolation: `from` may reference nothing outside itself/allow
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
    const allow = Array.isArray(spec.allow) ? spec.allow.map(normPrefix) : [];
    const reason = typeof spec.reason === 'string' ? spec.reason : null;
    const mk = (from, to) => ({ from: normPrefix(from), to: to === '*' ? '*' : normPrefix(to), allow, reason });

    if (Array.isArray(spec.between)) {
      if (spec.between.length !== 2 || spec.between.some((s) => typeof s !== 'string' || !s.trim())) {
        errors.push({ what: `${at} "between" must be two folder paths`, fix: 'use "between": ["clientDir", "serverDir"]' });
        return;
      }
      const [a, b] = spec.between;
      edges.push(mk(a, b), mk(b, a));
      return;
    }
    if (typeof spec.from !== 'string' || !spec.from.trim() || typeof spec.to !== 'string' || !spec.to.trim()) {
      errors.push({ what: `${at} needs string "from" and "to" (or a "between" pair)`, fix: 'add "from" and "to" folder paths, or a "between": [a, b]' });
      return;
    }
    const edge = mk(spec.from, spec.to);
    if (edge.to !== '*' && (edge.from === edge.to || under(edge.to, edge.from) || under(edge.from, edge.to))) {
      errors.push({ what: `${at}: "from" (${edge.from}) and "to" (${edge.to}) overlap`, fix: 'a folder cannot be barred from itself or an ancestor/descendant — pick disjoint folders' });
      return;
    }
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
