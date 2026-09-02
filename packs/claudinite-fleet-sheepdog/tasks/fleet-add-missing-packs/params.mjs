// The task's PARAMETERS — the one place that decides what this run is, and the only
// module either half consults for it.
//
// WHY PARAMETERS AT ALL. This task used to be one thing: a weekly fleet-wide scan that
// converged an issue per member whose SHAPE fingerprinted packs its declaration did not
// carry. That is a discovery loop, and it answers only the question "what might a member
// want". The owner's other question — "put THIS pack on THESE repos with THIS config,
// now" — has the same second stage (adopt-pack against a member, one reviewed PR) and a
// completely different first stage: nothing is being suspected, because the answer was
// already decided. Parameterising the task is what lets one task carry both, instead of a
// second task that would duplicate the agent stage to change the work list's provenance.
//
// NO DEFAULTS, DELIBERATELY. Neither parameter has a fallback here: an unset one is an
// error that fails the run before anything is read or written. Both call sites therefore
// state what they want, in full:
//
//   the weekly run   task.json's `code_work` command line — `--scan-for-needed-packs=true
//                    --repos=all-covered-members`, which is the declaration saying, in the
//                    file a reader opens first, exactly what the cadence does.
//   a FORCED run     a hand-created item's Context (`CLAUDINITE_CONTEXT`, parsed by
//                    the pack's param-bag.mjs), which the code-work subprocess inherits.
//                    Context parameters WIN over the command line, because the whole
//                    point of a hand-created item is to run this task as something
//                    other than what the weekly declaration says.
//
// A default would defeat both: the reason the fleet-wide scan is safe is that it is
// spelled out where it is scheduled, and the reason a force is safe is that every repo it
// touches was typed by a human. `all-covered-members` is a KEYWORD, not a default — the
// weekly run sends it explicitly, so no call site can reach the fleet by omission.
//
// Pure: parsing and validation only, no I/O, no environment reads. The worker hands it
// `argv` and the parsed Context parameters; every rejection is a thrown Error whose
// message is the fix.

// The literal a caller sends to mean "every covered, non-dormant member under the
// configured owner" — the scan's fleet-wide scope, said out loud.
export const ALL_MEMBERS = 'all-covered-members';

// A list value is SPACE-separated, never comma-separated: the parameter bag splits keys
// on commas (`param-bag.mjs`), so a comma inside a value would silently become a second,
// unknown key. Both call sites use the same splitter so the two are never subtly
// different.
const list = (raw) => String(raw ?? '').split(/\s+/).map((s) => s.trim()).filter(Boolean);

// `--flag=value` command-line pairs, the form task.json's `code_work` string uses. Anything
// not in that shape is a typo worth failing on rather than ignoring.
export function parseArgv(argv = []) {
  const out = {};
  for (const arg of argv) {
    const m = /^--([a-z][a-z0-9-]*)=(.*)$/.exec(String(arg));
    if (!m) throw new Error(`unrecognised code_work argument \`${arg}\` — expected \`--<name>=<value>\``);
    out[m[1]] = m[2];
  }
  return out;
}

// `true` / `false` and nothing else. A boolean parameter that accepted "1", "yes" or the
// mere presence of the key would make `SCAN_FOR_NEEDED_PACKS=false` read as on — the one
// misreading that turns a targeted force into a fleet-wide sweep.
function bool(name, raw) {
  const v = String(raw).trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new Error(`${name} must be exactly \`true\` or \`false\` (got \`${raw}\`)`);
}

// `<packId>.<key>=<value>` — the shape both the config and the answer entries take in the
// parameter bag, where a comma cannot appear in a value. Keys may be dotted
// (`pack.a.b=v` → `{ a: { b: 'v' } }`) so a nested config is expressible without JSON.
function entry(kind, raw) {
  const text = String(raw).trim();
  const eq = text.indexOf('=');
  if (eq === -1) throw new Error(`${kind} entry \`${raw}\` is not \`<pack-id>.<key>=<value>\``);
  const path = text.slice(0, eq).trim();
  const value = text.slice(eq + 1).trim();
  const dot = path.indexOf('.');
  if (dot <= 0 || dot === path.length - 1) throw new Error(`${kind} entry \`${raw}\` names no pack — expected \`<pack-id>.<key>=<value>\``);
  if (!value) throw new Error(`${kind} entry \`${raw}\` has an empty value`);
  return { pack: path.slice(0, dot), keyPath: path.slice(dot + 1).split('.'), value };
}

// Fold `<pack>.<dotted.key>=<value>` entries into `{ [pack]: { …nested } }`. Collisions
// throw: a run whose config depends on which of two entries was applied last is one whose
// declaration nobody can predict from the button that started it.
function foldEntries(kind, raws) {
  const out = {};
  for (const raw of raws) {
    const { pack, keyPath, value } = entry(kind, raw);
    let node = (out[pack] ??= {});
    for (const key of keyPath.slice(0, -1)) {
      node[key] ??= {};
      if (typeof node[key] !== 'object') throw new Error(`${kind} entries conflict on \`${pack}.${keyPath.join('.')}\``);
      node = node[key];
    }
    const leaf = keyPath[keyPath.length - 1];
    if (leaf in node) throw new Error(`${kind} entries conflict on \`${pack}.${keyPath.join('.')}\``);
    node[leaf] = value;
  }
  return out;
}

// Every parameter key whose name starts with `prefix` — `PACK_CONFIG`, `PACK_CONFIG_2`,
// `PACK_CONFIG_store`, … . The bag is a flat map with one value per key, so a run that
// sets two config keys on one pack needs two DISTINCT keys; the suffix is free-form
// because its only job is to make them distinct. Sorted, so the report and any error
// name them in a stable order.
function prefixed(params, prefix) {
  return Object.keys(params).filter((k) => k.startsWith(prefix)).sort().map((k) => params[k]);
}

// The whole contract: what this run is, resolved from the two call sites.
//
//   { scan, repos, allMembers, addPacks, packConfig, packAnswers, forced }
//
// `repos` is null when `allMembers` is true — a caller that wants the fleet gets the
// keyword's meaning, never a list it could accidentally treat as complete.
export function parseParams({ argv = [], params = {} } = {}) {
  const cli = parseArgv(argv);
  const pick = (flag, key) => (params[key] !== undefined ? params[key] : cli[flag]);

  const rawScan = pick('scan-for-needed-packs', 'SCAN_FOR_NEEDED_PACKS');
  if (rawScan === undefined) {
    throw new Error('scan_for_needed_packs was not sent. This parameter has no default: the weekly run '
      + 'sends `--scan-for-needed-packs=true` from task.json, and a forced run sends '
      + '`--context "SCAN_FOR_NEEDED_PACKS=false"` when the item is created.');
  }
  const scan = bool('scan_for_needed_packs', rawScan);

  const rawRepos = pick('repos', 'REPOS');
  if (rawRepos === undefined || !list(rawRepos).length) {
    throw new Error(`repos was not sent. This parameter has no default: send \`${ALL_MEMBERS}\` for the whole `
      + 'fleet (what the weekly run sends) or a space-separated list of repo names (bare `Name` or '
      + '`owner/Name`). Space-separated, not comma-separated — the parameter bag splits keys on commas.');
  }
  const names = list(rawRepos);
  const allMembers = names.includes(ALL_MEMBERS);
  if (allMembers && names.length > 1) {
    throw new Error(`repos mixes \`${ALL_MEMBERS}\` with explicit names (${names.join(', ')}) — send one or the other`);
  }

  const addPacks = list(pick('add-packs', 'ADD_PACKS'));
  const packConfig = foldEntries('PACK_CONFIG', prefixed(params, 'PACK_CONFIG'));
  const packAnswers = foldEntries('PACK_ANSWER', prefixed(params, 'PACK_ANSWER'));

  if (!scan && !addPacks.length) {
    throw new Error('this run would do nothing: scan_for_needed_packs is false and no packs were named. '
      + 'Send `ADD_PACKS=<pack-id> …` to force an addition, or `SCAN_FOR_NEEDED_PACKS=true` to sweep.');
  }
  // A force names its repos. `all-covered-members` is legitimate for the SCAN — it
  // suspects, and a suspicion is reviewed on its issue before anything is written — but
  // as a force it would push one pack onto every member under the owner from one text
  // box, which is the blast radius this guard exists to keep out of a typo's reach.
  if (addPacks.length && allMembers) {
    throw new Error(`forcing packs onto \`${ALL_MEMBERS}\` is refused — name the repos explicitly `
      + '(a mass addition is bounded by the list a human typed, never by a keyword)');
  }
  for (const [pack, cfg] of [...Object.entries(packConfig), ...Object.entries(packAnswers)]) {
    if (!addPacks.includes(pack)) {
      throw new Error(`config/answers were sent for \`${pack}\`, which is not in ADD_PACKS (${addPacks.join(', ') || 'empty'}) — `
        + `nothing would apply them (${JSON.stringify(cfg)})`);
    }
  }

  return {
    scan,
    allMembers,
    repos: allMembers ? null : names,
    addPacks,
    packConfig,
    packAnswers,
    // A run is FORCED when a Context parameter steered it — the flag the report leads
    // with, because "who asked for this" is the first thing a reader of an unattended
    // run's output needs to know.
    forced: Object.keys(params).length > 0,
  };
}
