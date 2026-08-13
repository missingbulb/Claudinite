import { finding } from '../../../../engine/checks/helpers/findings.mjs';

// Pack discovery EAGERLY IMPORTS the pack tree: `discoverPacks` imports every
// `packs/<name>/pack.mjs` on disk and `scanSkillChecks` imports every
// `<pack>/skills/<skill>/checks.mjs` beside it — before activation is consulted,
// so a repo that declares none of them still loads all of them. Any module in
// that import graph is therefore re-entered while it is still evaluating, if it
// is also the process entry point. A `await` at the entry block's own statement
// level holds that evaluation open forever: the re-import can never resolve, the
// await never settles, and Node exits 13 ("unsettled top-level await") having run
// nothing. #581 shipped exactly that — `interview.mjs check` deadlocked in every
// repo, in every declaration, and the SessionStart orchestrator's fail-soft
// swallowed it as a merely-absent note.
//
// The invariant is static: no module reachable from a pack manifest or a skill
// checks manifest may await at the top level of its CLI-entry block. The safe
// form starts the work AFTER evaluation completes — `run().catch(...)`.
//
// PARSED, NOT GREPPED (the skill's rule): a bare grep for `await` in `packs/`
// hits every async function in the corpus, and a grep for the entry guard hits
// the seven CLI workers that legitimately await at top level and are NOT in the
// discovery graph. This walks the graph from the real manifests, with comments
// and string bodies blanked first, and judges only the entry block.

const SEED = /^(?:\.claudinite\/local\/packs|packs)\/[^/]+\/(?:pack\.mjs|skills\/[^/]+\/checks\.mjs)$/;
// The CLI-entry idiom the corpus uses: `import.meta.url === pathToFileURL(...)`.
const ENTRY = /import\.meta\.url\s*===/;
const AWAIT = /(?:^|[^\w.$])await[\s(]/;
// Static imports only — a DYNAMIC import() is what makes the cycle harmless, so
// it is deliberately not followed.
const IMPORT = /(?:^|\n)\s*import\s+(?:[^;'"]*?from\s*)?['"]([^'"]+)['"]/g;

// `source` with comment text blanked, and — when `strings` is set — string and
// template bodies too (newlines kept, so line numbers never shift). The entry
// block is judged with strings blanked, so prose describing the trap or a code
// sample in a template literal cannot fire it; the import walk needs the
// specifiers intact, so it reads the comments-only form.
function blank(source, { strings = true } = {}) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      out += c;
      i += 1;
      while (i < source.length && source[i] !== c) {
        if (source[i] === '\\') { out += strings ? '  ' : source.slice(i, i + 2); i += 2; continue; }
        out += strings ? (source[i] === '\n' ? '\n' : ' ') : source[i];
        i += 1;
      }
      out += source[i] ?? '';
      i += 1;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

// `a/b/../c.mjs` → `a/c.mjs`. Repo-relative posix paths only.
function resolveFrom(fromFile, spec) {
  const parts = fromFile.split('/').slice(0, -1).concat(spec.split('/'));
  const out = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  return out.join('/');
}

// The entry block's own text: from the `{` after the guard to its matching `}`.
// Returns null when the guard has no block (a one-line `if` cannot hold an await
// that matters here, and mis-slicing would be worse than staying quiet).
function entryBlock(code) {
  const at = code.search(ENTRY);
  if (at === -1) return null;
  const open = code.indexOf('{', at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return { text: code.slice(open, i + 1), open };
    }
  }
  return null;
}

const rule = {
  id: 'pack-discovery-entry-await',
  severity: 'blocking',
  description: 'No module a pack manifest or skill checks.mjs imports awaits at the top level of its CLI-entry block',
  doc: '.claudinite/local/packs/claudinite/RULES.md',
  why: 'pack discovery imports every pack.mjs and skills/*/checks.mjs on disk before activation is consulted, so such a module is re-imported mid-evaluation when it is also the entry point — the top-level await then never settles and Node exits 13 having run nothing, silently (#581)',

  run(ctx) {
    const seeds = ctx.tracked.filter((f) => SEED.test(f)).sort();
    if (seeds.length === 0) return []; // no pack tree here — nothing to judge
    const tracked = new Set(ctx.tracked);

    const seen = new Set();
    const queue = [...seeds];
    const out = [];
    while (queue.length > 0) {
      const file = queue.shift();
      if (seen.has(file)) continue;
      seen.add(file);
      const source = ctx.read(file);
      if (source === null) continue;
      const code = blank(source);

      const block = entryBlock(code);
      // An `async` inside the block means an async function or IIFE owns the
      // await, which does not hold module evaluation open — stay quiet rather
      // than guess at nesting. Conservative by design: this rule blocks, so it
      // may only fire on the shape it is certain about.
      if (block && AWAIT.test(block.text) && !/(?:^|[^\w.$])async[\s(]/.test(block.text)) {
        const line = code.slice(0, block.open + block.text.search(AWAIT)).split('\n').length;
        out.push(finding(rule, {
          file,
          line,
          what: `${file} awaits at the top level of its CLI-entry block, and pack discovery imports it`,
          fix: 'start the work after module evaluation completes instead — `doWork(...).catch((e) => process.stderr.write(...))` — never `await doWork(...)` at the top level of the entry block',
        }));
      }

      for (const m of blank(source, { strings: false }).matchAll(IMPORT)) {
        const spec = m[1];
        if (!spec.startsWith('.')) continue;
        const target = resolveFrom(file, spec);
        if (tracked.has(target)) queue.push(target);
      }
    }
    return out;
  },
};

export default rule;
