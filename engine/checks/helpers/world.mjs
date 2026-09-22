import { stripComments } from './code-scanning.mjs';
import { workflowFiles } from './github-workflows.mjs';
import { isActive } from '../../pack_loader/pack-registry.mjs';

// The check-the-world surface over ctx - what a rule that audits repo state is
// handed, the way `work.mjs` is what a rule that judges the change is handed.
// `runRule` dispatches on the rule's scope, so which surface a rule receives is
// decided in exactly one place.
//
// It is a BAG, destructured rather than reached into: a rule's `run({ sources,
// activePacks })` names what it reads in its signature, and a reader knows the
// rule's whole appetite without reading its body.
//
// TWO KINDS OF KEY, and the difference is the point:
//
//   - THE READINGS are ctx's own surface, delegated unchanged. They are here so
//     the bag is a superset of the context it wraps: a rule this canon has never
//     seen - a member's own local pack, written against `ctx` - keeps working
//     verbatim, and the surface's conformance test pins that.
//   - THE INSTRUMENTS are what every rule was building for itself out of those
//     readings: the scanned corpus with its comments already stripped, the active
//     packs, the repo's workflows, a file parsed as JSON, a directory listing off
//     the run's own file list. Each was written out by hand in a dozen rules, and
//     a rule that re-derives one is a rule that can get it subtly wrong.
//
// Mechanism only: a rule still owns its patterns, its file filters and its
// failure text, and nothing here decides anything about a finding - severity,
// grace and whether a finding blocks stay the runner's and the reporter's.
//
// ONE SURFACE PER CONTEXT, which is what makes it a RUN's instruments rather
// than a rule's. Its own derivations (the stripped sources) are then shared by
// every rule in the sweep instead of recomputed per rule - and so are the
// per-run memos the scanning helpers keep, which key a WeakMap on the object
// they are handed (reference-scanning's index, pattern-rules' scans). Handing
// each rule a fresh bag would silently rebuild the reference index once per
// barrier rule.
const surfaces = new WeakMap();
export const world = (ctx) => {
  if (!surfaces.has(ctx)) surfaces.set(ctx, build(ctx));
  return surfaces.get(ctx);
};

const build = (ctx) => {
  // Stripping comments is a character walk over the whole file, and sixteen rules
  // ask for the same source files - so the answer is computed once per file per
  // run. `ctx.read` is already cached the same way; this is the derivation beside
  // it.
  const code = new Map();
  const codeOf = (file, text) => {
    if (!code.has(file)) code.set(file, stripComments(text));
    return code.get(file);
  };

  // A path filter, written as a RegExp or a predicate. Absent admits everything.
  const admits = (select) => {
    if (select === undefined || select === null) return () => true;
    return typeof select === 'function' ? select : (f) => select.test(f);
  };

  const parse = (text) => {
    if (text === null) return null;
    try { return JSON.parse(text); } catch { return null; }
  };

  return {
    // ---- the readings: ctx's own surface, delegated ----
    get root() { return ctx.root; },
    get mode() { return ctx.mode; },
    get baseRef() { return ctx.baseRef; },
    get mergeBase() { return ctx.mergeBase; },
    get files() { return ctx.files; },
    get allFiles() { return ctx.allFiles; },
    get changedFiles() { return ctx.changedFiles; },
    get tracked() { return ctx.tracked; },
    get untracked() { return ctx.untracked ?? []; },
    get deleted() { return ctx.deleted; },
    get branch() { return ctx.branch; },
    get commits() { return ctx.commits; },
    get config() { return ctx.config; },
    // The discovered pack objects, attached by the runner - checks run
    // synchronously and cannot re-discover packs themselves.
    get packs() { return ctx.packs ?? []; },
    // The clock, where a caller injected one (a declared check's age windows read
    // it); undefined means the real one, which is that caller's `?? Date.now()`.
    get now() { return ctx.now; },
    read: (path) => ctx.read(path),
    readBase: (path) => ctx.readBase(path),
    exists: (path) => ctx.exists(path),
    grepTracked: (needle) => ctx.grepTracked(needle),
    addedLines: (file) => ctx.addedLines(file),
    removedLines: (file) => ctx.removedLines(file),
    commitsWithFiles: () => ctx.commitsWithFiles(),
    introducedMergeCommits: () => ctx.introducedMergeCommits(),
    conversation: () => ctx.conversation(),
    sessionEntries: () => (ctx.sessionEntries?.() ?? ctx.conversation() ?? []),

    // ---- the instruments ----

    // The files `select` admits, each already read and ready to scan. `select` is
    // a RegExp over the path or a predicate; `from` is the list to draw them out
    // of, the run's scanned set unless a rule needs another (`tracked` for a file
    // the sweep's own filters drop, `allFiles` to include generated ones).
    //
    // A file that cannot be read is simply absent, so a rule needs no null guard.
    // Each record carries four views of the same file, the last three computed
    // only if asked for:
    //   `text`  the file as written
    //   `code`  the same file with its comments stripped - the view a rule
    //           matching a forbidden token must scan, since a comment that merely
    //           NAMES the token is describing the code, not doing it
    //   `json`  it parsed, or null where it is not JSON
    //   `line`  the 1-based line of an index INTO `code`
    sources: (select, from) => {
      const wanted = admits(select);
      const out = [];
      for (const file of from ?? ctx.files) {
        if (!wanted(file)) continue;
        const text = ctx.read(file);
        if (text === null) continue;
        out.push({
          file,
          text,
          get code() { return codeOf(file, text); },
          get json() { return parse(text); },
          line: (index) => codeOf(file, text).slice(0, index).split('\n').length,
        });
      }
      return out;
    },

    // The paths `select` admits - `sources` for a rule that wants the names alone.
    filesMatching: (select, from) => (from ?? ctx.files).filter(admits(select)),

    // One file parsed as JSON: null where it is absent, unreadable or unparsable,
    // which are one answer to every caller here (a file that does not parse is the
    // loader's finding, never a scanning rule's).
    json: (path) => parse(ctx.read(path)),

    // The packs this repo's declaration actually activates - the registry the
    // runner discovered, filtered the way the runner filters it.
    activePacks: () => (ctx.packs ?? []).filter((p) => isActive(p, ctx.config)),

    // This pack's declared parameters, or undefined where it declared none.
    packConfig: (id) => ctx.config?.packConfig?.[id],

    // The repo's GitHub Actions workflow files.
    workflows: () => workflowFiles(ctx),

    // The names one segment below `path`, drawn from the run's own file list so a
    // walk sees exactly what the sweep sees - or null where nothing is under it.
    listDir: (path) => {
      const names = new Set();
      const prefix = `${path}/`;
      for (const f of ctx.files) {
        const n = f.replace(/\\/g, '/');
        if (n.startsWith(prefix)) names.add(n.slice(prefix.length).split('/')[0]);
      }
      return names.size ? [...names] : null;
    },
  };
};
