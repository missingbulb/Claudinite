import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

function sh(root, cmd, args, { allowFail = false, input = undefined } = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, input });
  if (r.status !== 0 && !allowFail) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}): ${r.stderr}`);
  }
  return r.status === 0 ? r.stdout : null;
}

const git = (root, ...args) => sh(root, 'git', args);
const gitTry = (root, ...args) => sh(root, 'git', args, { allowFail: true });

function resolveBaseRef(root) {
  for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
    if (gitTry(root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`) !== null) return ref;
  }
  return null;
}

function lines(out) {
  return (out || '').split('\n').filter(Boolean);
}

// Files git marks vendored or generated (linguist-vendored / linguist-generated in
// .gitattributes) — third-party or machine-written content, not the project's own
// code. `buildContext` drops these from the default `ctx.files`, so every check that
// reasons about "the project's code" skips them for free: a suppression marker inside
// a recorded fixture, a placement "violation" in a generated artifact, and a dangling
// link in a vendored doc are none of them the project's decision. `git check-attr`
// honors .gitattributes patterns/precedence natively (paths on stdin so a large repo
// can't overflow the arg list). The unfiltered set stays on `ctx.allFiles` for the one
// check that reasons *about* generated files (generated-merge-driver).
function vendoredSet(root, files) {
  const set = new Set();
  if (!files.length) return set;
  const out = sh(root, 'git', ['check-attr', '--stdin', 'linguist-vendored', 'linguist-generated'],
    { allowFail: true, input: files.join('\n') + '\n' });
  for (const line of (out || '').split('\n')) {
    const m = /^(.*): (?:linguist-vendored|linguist-generated): (.*)$/.exec(line);
    if (m && m[2] === 'set') set.add(m[1]);
  }
  return set;
}

// The complete set of top-level settings .claudinite-checks.json may carry. A key
// outside this set is a typo or a stale name — a settings error as real as invalid
// JSON, caught at load so it can't silently change nothing. `packConfig` is the
// legacy home of per-pack parameters — still honored while the fleet migrates to
// pack-entry `config` (the baselining folds it in), no longer documented.
export const CONFIG_KEYS = ['packs', 'rules', 'accept', 'sharedConstants', 'packConfig', 'maintenance'];

// The properties a `packs` entry object may carry: the pack's parameters
// (`config`), and the rule overrides / acceptances that exist BECAUSE this pack
// is declared (`rules`, `accept` — they may name any rule; the entry is their
// provenance). `via` is written by resolveDeclaredPacks on materialized
// dependencies (packs/registry.mjs).
export const PACK_ENTRY_KEYS = ['id', 'config', 'rules', 'accept', 'via'];

// Load and validate the project's settings. Validity is checked at load — the
// moment Claudinite reads the file — and every problem is collected into `errors`
// (each `{ what, fix }`), the runner's single settings-validity gate. A wrong
// property name, malformed JSON, and a wrong pack name are all equally settings
// errors; unknown *pack* names need the registry, so the runner adds those (it
// holds the known-pack list). On unparsable/misshaped JSON the usable fields fall
// back to empty so the rest of a sweep still runs, with the error reported.
//
// The returned shape is NORMALIZED: `packs` is plain ids, `rules` and `accept`
// are the top-level and per-entry settings merged (an entry-sourced acceptance
// carries `pack: <id>` as provenance; conflicting severity overrides are a
// settings error), and `packConfig` is the per-pack parameter view — each
// entry's `config`, overlaid on the legacy top-level key. Checks and env
// machinery read this one shape regardless of which form the file used.
export function loadConfig(root) {
  const path = join(root, '.claudinite-checks.json');
  const empty = { packs: [], packEntries: [], rules: {}, accept: [], sharedConstants: [], packConfig: {}, errors: [] };
  if (!existsSync(path)) return empty;

  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { ...empty, errors: [{ what: `.claudinite-checks.json is not valid JSON: ${e.message}`, fix: 'fix the JSON syntax' }] };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...empty, errors: [{ what: '.claudinite-checks.json must be a JSON object', fix: 'wrap the settings in an object: { "packs": [ ... ] }' }] };
  }

  const errors = [];
  for (const key of Object.keys(raw)) {
    if (!CONFIG_KEYS.includes(key)) {
      errors.push({ what: `unknown setting "${key}"`, fix: `remove it or fix the name — valid settings: ${CONFIG_KEYS.join(', ')}` });
    }
  }

  // --- packs: each entry a pack id or { id, config?, rules?, accept?, via? } ---
  const packs = [];
  const packEntries = [];
  for (const entry of Array.isArray(raw.packs) ? raw.packs : []) {
    if (typeof entry === 'string') {
      packs.push(entry);
      packEntries.push({ id: entry });
      continue;
    }
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push({ what: `packs entry ${JSON.stringify(entry)} is neither a pack id nor an entry object`, fix: 'declare a pack as "name" or { "id": "name", ... }' });
      continue;
    }
    if (typeof entry.id !== 'string') {
      errors.push({ what: `packs entry ${JSON.stringify(entry)} has no "id"`, fix: 'give the entry an "id": the pack name' });
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (!PACK_ENTRY_KEYS.includes(key)) {
        errors.push({ what: `unknown property "${key}" on the "${entry.id}" pack entry`, fix: `remove it or fix the name — valid entry properties: ${PACK_ENTRY_KEYS.join(', ')}` });
      }
    }
    const badShape = (prop, expected) =>
      errors.push({ what: `"${prop}" on the "${entry.id}" pack entry must be ${expected}`, fix: `fix or remove the entry's "${prop}"` });
    const normalized = { id: entry.id };
    if (entry.config !== undefined) {
      if (entry.config !== null && typeof entry.config === 'object' && !Array.isArray(entry.config)) normalized.config = entry.config;
      else badShape('config', 'an object of the pack\'s parameters');
    }
    if (entry.rules !== undefined) {
      if (entry.rules !== null && typeof entry.rules === 'object' && !Array.isArray(entry.rules)) normalized.rules = entry.rules;
      else badShape('rules', 'an object of per-rule severity overrides');
    }
    if (entry.accept !== undefined) {
      if (Array.isArray(entry.accept)) normalized.accept = entry.accept;
      else badShape('accept', 'an array of acceptance entries');
    }
    packs.push(entry.id);
    packEntries.push(normalized);
  }

  // --- rules: top-level and per-entry merged; a conflict is a settings error,
  // never a silent last-writer-wins — two packs (or a pack and the top level)
  // disagreeing about a rule's severity is a decision the project must make.
  const rules = {};
  const ruleSource = {};
  const mergeRules = (overrides, source) => {
    for (const [ruleId, severity] of Object.entries(overrides)) {
      if (ruleId in rules && rules[ruleId] !== severity) {
        errors.push({
          what: `rule "${ruleId}" is set to "${rules[ruleId]}" by ${ruleSource[ruleId]} and "${severity}" by ${source}`,
          fix: 'make the overrides agree, or keep the rule on one of them',
        });
        continue;
      }
      rules[ruleId] = severity;
      ruleSource[ruleId] = source;
    }
  };
  if (raw.rules && typeof raw.rules === 'object') mergeRules(raw.rules, 'the top-level "rules"');
  for (const entry of packEntries) {
    if (entry.rules) mergeRules(entry.rules, `the "${entry.id}" pack entry`);
  }

  // --- accept: top-level entries, then each pack entry's stamped with its
  // provenance (`pack: <id>` — which declaration motivated the exemption).
  const accept = Array.isArray(raw.accept) ? [...raw.accept] : [];
  for (const entry of packEntries) {
    for (const a of entry.accept ?? []) accept.push({ ...a, pack: entry.id });
  }

  // --- packConfig view: per-pack parameters — e.g. the dirs a repo's
  // package.json lives in for the node pack's env install. Entry `config` is
  // the home; the legacy top-level key stays readable underneath it.
  const packConfig = raw.packConfig && typeof raw.packConfig === 'object' && !Array.isArray(raw.packConfig) ? { ...raw.packConfig } : {};
  for (const entry of packEntries) {
    if (entry.config !== undefined) packConfig[entry.id] = entry.config;
  }

  return {
    packs,
    packEntries,
    rules,
    accept,
    sharedConstants: Array.isArray(raw.sharedConstants) ? raw.sharedConstants : [],
    packConfig,
    errors,
  };
}

export function buildContext({ root, mode = 'changed', baseOverride = null }) {
  root = resolve(root);
  const baseRef = baseOverride || resolveBaseRef(root);
  const mergeBase = baseRef ? (gitTry(root, 'merge-base', 'HEAD', baseRef) || '').trim() || null : null;
  // Diffing against HEAD keeps uncommitted work in scope even when no base branch resolves.
  const diffBase = mergeBase || 'HEAD';

  const tracked = lines(gitTry(root, 'ls-files'));
  const untracked = lines(gitTry(root, 'ls-files', '--others', '--exclude-standard'));

  let scanned;
  if (mode === 'all') {
    scanned = [...tracked, ...untracked];
  } else {
    const vsBase = lines(gitTry(root, 'diff', '--name-only', '--diff-filter=d', diffBase));
    scanned = [...new Set([...vsBase, ...untracked])];
  }
  // Every in-scope regular file, vendored/generated included.
  const allFiles = scanned.filter((f) => existsSync(join(root, f)) && statSync(join(root, f)).isFile());
  // The default sweep excludes vendored/generated files, so `ctx.files` is the
  // project's OWN authored code and every check skips them for free (see vendoredSet).
  const vendored = vendoredSet(root, allFiles);
  const files = allFiles.filter((f) => !vendored.has(f));

  const deleted = mergeBase ? lines(gitTry(root, 'diff', '--name-only', '--diff-filter=D', mergeBase)) : [];

  let commits = [];
  if (mergeBase) {
    const out = gitTry(root, 'log', '--format=%s%n%b%x00', `${mergeBase}..HEAD`);
    commits = (out || '').split('\0').map((m) => m.trim()).filter(Boolean);
  }

  const branch = (gitTry(root, 'rev-parse', '--abbrev-ref', 'HEAD') || '').trim();

  return {
    root,
    mode,
    baseRef,
    mergeBase,
    files,
    allFiles,
    tracked,
    deleted,
    commits,
    branch,
    config: loadConfig(root),

    exists: (path) => existsSync(join(root, path)),
    read(path) {
      try { return readFileSync(join(root, path), 'utf8'); } catch { return null; }
    },

    // File content at the scoping base (the merge-base with the base branch), or
    // null if the file didn't exist there or no base resolves. Lets a delta
    // check compare structured state — e.g. a manifest's permission set — against
    // the baseline precisely, immune to text-diff line noise (JSON trailing
    // commas make appending an array element re-touch the previous line).
    readBase(path) {
      if (!mergeBase) return null;
      return gitTry(root, 'show', `${mergeBase}:${path}`);
    },

    // Added lines of one file relative to the scoping base (untracked file = every line).
    addedLines(file) {
      if (!tracked.includes(file)) {
        const text = this.read(file);
        return text === null ? [] : text.split('\n').map((t, i) => ({ line: i + 1, text: t }));
      }
      const out = gitTry(root, 'diff', '-U0', diffBase, '--', file);
      const added = [];
      let lineNo = 0;
      for (const l of (out || '').split('\n')) {
        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
        if (hunk) { lineNo = Number(hunk[1]); continue; }
        if (l.startsWith('+') && !l.startsWith('+++')) { added.push({ line: lineNo, text: l.slice(1) }); lineNo += 1; }
        else if (!l.startsWith('-')) lineNo += l ? 1 : 0;
      }
      return added;
    },

    // Merge commits the current change introduces — those on HEAD's first-parent
    // chain since the merge-base with the base branch (the squash-only effect
    // check, scoped to the work). Empty when no base resolves or the branch is
    // even with it; pre-existing merges already on the base are out of range.
    introducedMergeCommits() {
      if (!mergeBase) return [];
      const out = gitTry(root, 'log', '--merges', '--first-parent', '--format=%h %s', `${mergeBase}..HEAD`);
      return lines(out).map((l) => {
        const i = l.indexOf(' ');
        return { sha: l.slice(0, i), subject: l.slice(i + 1) };
      });
    },

    // Fixed-string search across tracked files; git grep exits 1 on no match.
    grepTracked(needle) {
      const out = gitTry(root, 'grep', '-n', '-F', needle, '--', '.');
      return lines(out).map((l) => {
        const m = /^([^:]+):(\d+):(.*)$/.exec(l);
        return m ? { file: m[1], line: Number(m[2]), text: m[3] } : null;
      }).filter(Boolean);
    },
  };
}

export const pathDepth = (p) => (p === '.' || p === '' ? [] : p.split(sep));
