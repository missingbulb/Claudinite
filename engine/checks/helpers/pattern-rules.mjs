import { finding } from './findings.mjs';

// The declarative pattern-check engine: a rule whose whole logic is "these
// patterns over these files" is DECLARED as data — `patternRule(spec)` compiles
// the spec into an ordinary `{ id, severity, description, doc, why, run(ctx) }`
// rule module the runner treats like any other. The engine owns only the
// walking (the mechanism/policy line line-scanning.mjs draws): every pattern,
// file filter, and failure text stays in the declaring spec. Spec keys are
// deliberately wordy — a declaration must read as the whole check without this
// header — and a declaration carries no comments: the pattern plus its
// what/why/fix text IS the check.
//
// Built for MANY such rules at once: however many pattern rules a run holds,
// the engine makes ONE pass over the scanned tree — each file is read once and
// its lines split once, with every subscribing rule's assertions evaluated in
// that single visit — and the per-context results are cached, so the first
// pattern rule the runner reaches pays for the whole family and the rest are
// lookups. Regexes must be non-global (`.test` on a /g regex is stateful).
//
// The spec vocabulary — everything beyond the rule metadata is optional:
//   scanFiles          which files the content assertions read: a RegExp over
//                      repo paths, or one exact path (read directly)
//   scanTracked        true = scan every git-tracked file (mode-independent);
//                      default is ctx.files (the run's scanned set —
//                      tracked+untracked minus vendored, and only the changed
//                      files under --changed)
//   excludeFiles       RegExp (or exact path) removing files from scope
//   relevantWhen       repo-level relevance, all parts must hold:
//                        pathExists / pathAbsent          a path present/absent
//                        trackedFileMatches               some tracked path matches
//                        noTrackedFileMatches             no tracked path matches
//                        repoContains                     some in-scope file's text
//                                                         matches — evaluated only
//                                                         if findings exist
//   whenMissing        { what, fix } — fires when an exact-path scanFiles is absent
//   maxLines           { limit, what, fix } — fires past `limit` lines, anchored there
//   skipLinesMatching  RegExp — lines it matches are invisible to matchLines
//   matchLines         [{ match, unlessLineMatches, whenFileMatches,
//                         unlessFileMatches, what, fix }]
//                      flag each line `match` hits (unless `unlessLineMatches`
//                      hits it too), in files where every `whenFileMatches`
//                      matches and `unlessFileMatches` does not; per line, the
//                      first matching assertion wins
//   checkEachFile      [{ relevantWhen, whenFileMatches, require, forbid, what, fix }]
//                      one finding per file: where every `whenFileMatches`
//                      matches, `require` must match / `forbid` must not
//                      (`whenFileMatches` takes one RegExp or a list)
//   repoWide           [{ unlessSomeFileMatches, flagFilesMatching,
//                         neverFlagFiles, what, fix }]
//                      unless some in-scope file matches `unlessSomeFileMatches`,
//                      flag every file (minus `neverFlagFiles`) satisfying a
//                      `flagFilesMatching` group — a list of all-must-match
//                      RegExp lists — anchored at the first group's first
//                      pattern's first matching line
//   requirePaths       [{ path, what, fix }] — each path must exist on disk
//   listedInFile       [{ eachTrackedPathMatching, listFile, asText, what, fix }]
//                      every tracked path the RegExp matches must appear in
//                      `listFile` as the `asText` template (capture groups
//                      interpolate); findings anchor on the list file, sorted,
//                      and an absent list file asserts nothing
//   coveredByGlobLine  [{ eachPathMatching, includeVendored, globFile,
//                         globLineMatching, what, fix }]
//                      every scanned path the RegExp matches (includeVendored:
//                      true widens to ctx.allFiles) must be covered — full path
//                      or basename — by the first-token glob of some
//                      non-comment `globFile` line matching `globLineMatching`;
//                      findings anchor on each uncovered path
//
// `what`/`fix` are templates: `{path}`, a named capture group's `{name}`, and
// `{match}` (a matchLines hit's text), `{lines}`/`{limit}` (maxLines) interpolate.

const REGISTRY = [];
const scans = new WeakMap();

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole));
const excluded = (path, exclude) =>
  exclude != null && (exclude instanceof RegExp ? exclude.test(path) : path === exclude);

function relevant(ctx, when) {
  if (!when) return true;
  if (when.pathExists && !ctx.exists(when.pathExists)) return false;
  if (when.pathAbsent && ctx.exists(when.pathAbsent)) return false;
  if (when.trackedFileMatches && !ctx.tracked.some((f) => when.trackedFileMatches.test(f))) return false;
  if (when.noTrackedFileMatches && ctx.tracked.some((f) => when.noTrackedFileMatches.test(f))) return false;
  return true; // repoContains resolves after the pass, and only when findings exist
}

function globToRe(glob) {
  return new RegExp(
    `^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`
  );
}

// The tree/index assertions — they match paths and read at most one index file,
// so they run directly per rule rather than riding the content pass.
function assertTreeShape(ctx, j) {
  const s = j.spec;
  for (const a of s.requirePaths ?? []) {
    if (ctx.exists(a.path)) continue;
    const vars = { path: a.path };
    j.out.push(finding(j.rule, { file: a.path, what: fill(a.what, vars), fix: fill(a.fix, vars) }));
  }

  for (const a of s.listedInFile ?? []) {
    const list = ctx.read(a.listFile);
    if (list === null) continue;
    const missing = new Map();
    for (const path of ctx.tracked) {
      const m = a.eachTrackedPathMatching.exec(path);
      if (!m) continue;
      const vars = { path, ...(m.groups ?? {}) };
      const token = fill(a.asText, vars);
      if (!missing.has(token) && !list.includes(token)) missing.set(token, vars);
    }
    for (const [, vars] of [...missing].sort(([t1], [t2]) => t1.localeCompare(t2))) {
      j.out.push(finding(j.rule, { file: a.listFile, what: fill(a.what, vars), fix: fill(a.fix, vars) }));
    }
  }

  for (const a of s.coveredByGlobLine ?? []) {
    const globs = (ctx.read(a.globFile) ?? '').split('\n')
      .filter((line) => a.globLineMatching.test(line) && !line.trim().startsWith('#'))
      .map((line) => globToRe(line.trim().split(/\s+/)[0]));
    for (const path of a.includeVendored ? ctx.allFiles : ctx.files) {
      const m = a.eachPathMatching.exec(path);
      if (!m) continue;
      const base = path.slice(path.lastIndexOf('/') + 1);
      if (globs.some((re) => re.test(path) || re.test(base))) continue;
      const vars = { path, ...(m.groups ?? {}) };
      j.out.push(finding(j.rule, { file: path, what: fill(a.what, vars), fix: fill(a.fix, vars) }));
    }
  }
}

// One file visited once for every subscribing rule: whole-text assertions and
// repo-wide bookkeeping first, then a single walk of the lines shared by all
// the rules' line assertions.
function visit(ctx, subs, path, text) {
  let split = null;
  const lines = () => (split ??= text.split('\n'));
  const lineJobs = [];

  for (const j of subs) {
    const s = j.spec;
    if (s.maxLines && lines().length > s.maxLines.limit) {
      const vars = { lines: lines().length, limit: s.maxLines.limit };
      j.out.push(finding(j.rule, {
        file: path, line: s.maxLines.limit + 1,
        what: fill(s.maxLines.what, vars), fix: fill(s.maxLines.fix, vars),
      }));
    }
    for (const a of s.checkEachFile ?? []) {
      if (a.relevantWhen && !relevant(ctx, a.relevantWhen)) continue;
      if (!arr(a.whenFileMatches).every((re) => re.test(text))) continue;
      if (a.forbid ? a.forbid.test(text) : !a.require.test(text)) {
        j.out.push(finding(j.rule, { file: path, what: a.what, fix: a.fix }));
      }
    }
    for (const st of j.repoStates) {
      if (st.a.unlessSomeFileMatches.test(text)) st.satisfied = true;
      if (excluded(path, st.a.neverFlagFiles)) continue;
      const group = st.a.flagFilesMatching.find((g) => g.every((re) => re.test(text)));
      if (group) {
        const at = lines().findIndex((ln) => group[0].test(ln));
        st.hits.push({ file: path, line: at === -1 ? null : at + 1, what: st.a.what, fix: st.a.fix });
      }
    }
    const eligible = (s.matchLines ?? []).filter((a) =>
      arr(a.whenFileMatches).every((re) => re.test(text)) && !a.unlessFileMatches?.test(text));
    if (eligible.length) lineJobs.push({ j, eligible });
  }

  if (!lineJobs.length) return;
  lines().forEach((ln, i) => {
    for (const { j, eligible } of lineJobs) {
      if (j.spec.skipLinesMatching?.test(ln)) continue;
      for (const a of eligible) {
        const m = ln.match(a.match);
        if (!m || a.unlessLineMatches?.test(ln)) continue;
        const vars = { match: m[0] };
        j.out.push(finding(j.rule, {
          file: path, line: i + 1, what: fill(a.what, vars), fix: fill(a.fix, vars),
        }));
        break;
      }
    }
  });
}

function results(ctx) {
  let res = scans.get(ctx);
  if (res) return res;
  res = new Map();
  scans.set(ctx, res);

  const jobs = [];
  for (const rule of REGISTRY) {
    const out = [];
    res.set(rule, out);
    if (!relevant(ctx, rule.spec.relevantWhen)) continue;
    jobs.push({
      rule, spec: rule.spec, out,
      repoStates: (rule.spec.repoWide ?? []).map((a) => ({ a, satisfied: false, hits: [] })),
    });
  }

  for (const j of jobs) {
    assertTreeShape(ctx, j);
    if (typeof j.spec.scanFiles !== 'string') continue;
    const text = ctx.read(j.spec.scanFiles);
    if (text === null) {
      if (j.spec.whenMissing) {
        j.out.push(finding(j.rule, { file: j.spec.scanFiles, what: j.spec.whenMissing.what, fix: j.spec.whenMissing.fix }));
      }
      continue;
    }
    visit(ctx, [j], j.spec.scanFiles, text);
  }

  const swept = jobs.filter((j) => j.spec.scanFiles instanceof RegExp);
  if (swept.length) {
    const scanned = new Set(ctx.files);
    const tracked = new Set(ctx.tracked);
    for (const path of [...ctx.files, ...ctx.tracked.filter((f) => !scanned.has(f))]) {
      const subs = swept.filter((j) =>
        (j.spec.scanTracked ? tracked : scanned).has(path) &&
        j.spec.scanFiles.test(path) && !excluded(path, j.spec.excludeFiles));
      if (!subs.length) continue;
      const text = ctx.read(path);
      if (text !== null) visit(ctx, subs, path, text);
    }
  }

  for (const j of jobs) {
    for (const st of j.repoStates) {
      if (!st.satisfied) for (const h of st.hits) j.out.push(finding(j.rule, h));
    }
    const marker = j.spec.relevantWhen?.repoContains;
    if (marker && j.out.length &&
        !ctx.files.some((f) => !excluded(f, j.spec.excludeFiles) && marker.test(ctx.read(f) ?? ''))) {
      j.out.length = 0;
    }
  }
  return res;
}

export function patternRule(spec) {
  const rule = {
    id: spec.id,
    severity: spec.severity,
    description: spec.description,
    doc: spec.doc,
    why: spec.why,
    spec,
    run(ctx) { return results(ctx).get(rule); },
  };
  REGISTRY.push(rule);
  return rule;
}
