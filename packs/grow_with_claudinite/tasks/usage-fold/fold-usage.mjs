// The usage FOLD's counting and folding core (skill-usage-metrics DESIGN §4, §5).
// Every function here is pure and individually tested; worker.mjs is the I/O shell
// that reads the logs branch, calls these, and delivers the result.
//
// The questions this answers, one tested function each:
//   - which skills did a captured session LOAD, and how often;
//   - what workload was that against (captures, merges, sessions, user messages,
//     user commands) — the denominators without which a raw load count cannot
//     distinguish healthy-rare from broken.
//
// Zeros are implicit throughout: a mounted skill with no loads simply has no key.
// The zero set is derived by the consumer, diffing against the repo's mounted
// skills — which is exactly what makes "this skill never loads" visible at all.

// The one non-builtin import: the engine surface a pack may build on
// (pack-independence). "Which skills does this repo mount" has exactly one home —
// the pack registry — and asking it here is what keeps the fold's answer identical
// to what the SessionStart hook actually mounted.
import { loadPacks, isActive, bundledSkillSources } from '../../../../engine/pack_loader/pack-registry.mjs';

// --- entry classification -----------------------------------------------------
// Every shape below was verified against real captured transcripts on a
// conversation-logs branch, not inferred from the harness docs.

// A genuine human turn. POSITIVE test, deliberately: the transcript stamps a
// typed-by-a-person turn with `origin: { kind: 'human' }`, and everything else a
// user-role entry can be — a tool result, an injected/meta turn, a subagent's
// sidechain traffic, a compaction summary, a slash-command expansion, and (the one
// that matters most here) a scheduled-task firing, which carries
// `origin: { kind: 'task-notification', subkind: 'scheduled-trigger' }` — simply
// lacks that stamp. Testing FOR the human marker rather than against a list of
// automated ones means a new automated entry shape is excluded the day it appears
// instead of silently inflating the denominator.
//
// The honest boundary: an older harness wrote no `origin` at all. Those turns count
// as non-human, so a repo's very old captures under-report userMessages rather than
// over-reporting them. This is the most fragile line in the fold, which is why it is
// one function with a fixture per shape it excludes.
export function isUserMessage(entry) {
  return entry?.type === 'user' && entry?.origin?.kind === 'human';
}

// A user-typed slash command. The harness expands `/name args` into a user entry
// whose string content opens with a `<command-name>` tag — the tag is the marker,
// so prose that merely mentions a slash command never counts. Returns the bare
// command name (no leading slash), or null.
const COMMAND_RE = /<command-name>\s*\/?([A-Za-z0-9:_-]+)\s*<\/command-name>/;
export function commandName(entry) {
  if (entry?.type !== 'user') return null;
  const content = entry?.message?.content;
  if (typeof content !== 'string') return null;
  return COMMAND_RE.exec(content)?.[1] ?? null;
}

// Skill names loaded by an assistant entry: every `Skill` tool_use block's
// `input.skill`. Sidechain (subagent) entries are included by the caller — a
// subagent loading a skill is a load.
export function skillToolLoads(entry) {
  if (entry?.type !== 'assistant') return [];
  const content = entry?.message?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((b) => b?.type === 'tool_use' && b?.name === 'Skill' && typeof b?.input?.skill === 'string')
    .map((b) => b.input.skill);
}

// --- check activations ---------------------------------------------------------
// The conformance checks are the other half of the picture, and the more valuable
// half: a check that FAILS is a win — the finding lands back in the session and the
// agent corrects before the work leaves. So the questions here are "how often did
// each scope actually run" and "how often did it catch something", and the second
// one is the one that matters.
//
// Neither runner writes a metrics file, so both are read off the marks they already
// leave in the transcript. There are exactly three, and each was verified against
// real captured logs:
//
//   1. The Stop hook's `hooklog` line — `<iso> run=<id> Stop: done exit=<n> <reason>`
//      — reaches the transcript because hooklog mirrors to stderr and the harness
//      records hook stderr. This is the ONLY mark that survives a PASSING run, which
//      is what makes work-scope run counts (not just failure counts) possible at all.
//   2. `report-findings`' summary line — `N blocking, M advisory (<scope> scope: …)`
//      — names its own scope and survives the `| tail` an agent usually pipes
//      through. It is printed ONLY when there were findings, so it counts failures
//      and finding volume, never runs.
//   3. The runner's own invocation in a Bash command (`node …/check_the_world.mjs`),
//      which is how the world scope runs — its Stop-hook sibling does not exist,
//      because the world sweep is wired into the test/CI flow, not the hook.
//
// STATED BOUNDARY: this counts what the SESSION saw. A world sweep that ran in CI
// left no mark in any transcript and is invisible here; so is a hook killed before
// it logged. Every number below is therefore a floor on activations — never an
// over-count, which is the direction that keeps "the checks caught N things" honest.

// The Stop hook's completion line. `reason` distinguishes the three outcomes the
// hook itself declares: `checks-passed`, `blocking-findings`, `loop-guard-relent`
// (blocking findings that survived two fix attempts — a failure that prints no
// findings block, so it must be read from here), and `runner-error` (the checks did
// not run at all, which is an anti-win masquerading as a quiet day).
const HOOK_DONE_RE = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) run=(\S+) Stop: done exit=(\d+) ?([a-z-]*)/g;
export function hookCheckRuns(text) {
  return [...String(text ?? '').matchAll(HOOK_DONE_RE)]
    .map((m) => ({ stamp: `${m[1]} ${m[2]}`, exit: Number(m[3]), reason: m[4] || null }));
}

// `report-findings`' summary line, which names the scope it ran. Anchored to the
// line start so a doc or a fixture quoting the shape mid-sentence never counts.
const SUMMARY_RE = /^(\d+) blocking, (\d+) advisory \((work|world) scope: /gm;
export function checkSummaries(text) {
  return [...String(text ?? '').matchAll(SUMMARY_RE)]
    .map((m) => ({ scope: m[3], blocking: Number(m[1]), advisory: Number(m[2]) }));
}

// The rendered header of one finding — `[BLOCKING] <rule>  <file>` — which is where
// the RULE ID lives. Per-rule counts are the actionable end of this: "which rule
// catches something, and how often". They are lossier than the summary totals (an
// agent that pipes the run through `tail -3` keeps the summary and drops the
// headers), so both are kept and a gap between them is visible truncation.
const HEADER_RE = /^\[(BLOCKING|ADVISORY)\] ([a-z0-9][a-z0-9-]*) {2}/gm;
export function findingHeaders(text) {
  return [...String(text ?? '').matchAll(HEADER_RE)]
    .map((m) => ({ severity: m[1] === 'BLOCKING' ? 'blocking' : 'advisory', rule: m[2] }));
}

// Runner invocations inside one Bash command. Requires `node` and the `.mjs` on the
// same shell word run — so `grep -i check_the_world` never counts — and the
// separator class stops one match from swallowing a second runner on the same line.
const INVOKE_RE = /\bnode\b[^\n;|&]*?\bcheck_the_(work|world)\.mjs\b/g;
export function checkInvocations(command) {
  const counts = { work: 0, world: 0 };
  for (const m of String(command ?? '').matchAll(INVOKE_RE)) counts[m[1]] += 1;
  return counts;
}

// The transcript entries that can carry check output, reduced to the text to read
// and the source that produced it. Four shapes, all verified against real captures:
// the hook's blocking feedback (an `isMeta` user turn), the harness's
// `stop_hook_summary` (which repeats that same stderr), the passing hook's
// `hook_success` attachment, and a Bash tool result — paired back to its command so
// a Read of a file that merely CONTAINS this vocabulary is never mistaken for a run.
//
// The first two are the same hook execution recorded twice, so hook texts dedupe on
// the `hooklog` stamps they carry — the one identity that is stable across both
// shapes and unique per execution (its own timestamp, to the second).
export function checkOutputs(entries) {
  const bashById = new Map();
  for (const entry of entries) {
    if (entry?.type !== 'assistant') continue;
    for (const block of entry?.message?.content ?? []) {
      if (block?.type === 'tool_use' && block?.name === 'Bash' && typeof block?.input?.command === 'string') {
        bashById.set(block.id, block.input.command);
      }
    }
  }

  const out = [];
  const seenHooks = new Set();
  const hook = (text) => {
    const key = hookCheckRuns(text).map((r) => r.stamp).join('|');
    if (key && seenHooks.has(key)) return;      // the same execution, recorded twice
    if (key) seenHooks.add(key);
    out.push({ source: 'hook', text, command: null });
  };

  for (const entry of entries) {
    if (entry?.type === 'system' && entry?.subtype === 'stop_hook_summary') {
      hook((entry.hookErrors ?? []).join('\n'));
    } else if (entry?.type === 'attachment' && entry?.attachment?.hookEvent === 'Stop') {
      hook(`${entry.attachment.stderr ?? ''}\n${entry.attachment.stdout ?? ''}`);
    } else if (entry?.type === 'user' && entry?.isMeta === true && typeof entry?.message?.content === 'string') {
      if (entry.message.content.includes('Stop hook feedback')) hook(entry.message.content);
    } else if (entry?.type === 'user' && Array.isArray(entry?.message?.content)) {
      for (const block of entry.message.content) {
        if (block?.type !== 'tool_result') continue;
        const command = bashById.get(block.tool_use_id);
        if (command === undefined) continue;    // not a Bash result — not a runner run
        const result = entry.toolUseResult;
        const text = typeof result === 'string' ? result : `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`;
        out.push({ source: 'bash', text, command });
      }
    }
  }
  return out;
}

// An empty per-scope check row. Uniform across scopes so folding is one loop:
// `runs` is observed activations, `failures` the subset that reported at least one
// blocking finding, `errors` the runs where the runner itself could not launch, and
// `blocking`/`advisory` the finding VOLUME summed over those runs (a rule blocking
// twice across two runs counts twice — the question is how often the checks caught
// something, not how many distinct problems existed).
const emptyScope = () => ({ runs: 0, failures: 0, errors: 0, blocking: 0, advisory: 0 });

// Count check activations across one capture file's entries.
//
// Runs are counted from the marks that a PASSING run also leaves — hook completion
// lines, and Bash invocations — never from the summary line, which only a run with
// findings prints. Where a runner ran without its command naming it (a `make test`
// step that wraps it), the summary lines in its output are the floor: hence the
// `max` — the two signals are alternative views of the same runs, not additive ones.
export function countChecks(entries) {
  const checks = {};
  const checkFindings = {};
  const scope = (name) => (checks[name] ??= emptyScope());
  const finding = (rule, severity) => {
    (checkFindings[rule] ??= { blocking: 0, advisory: 0 })[severity] += 1;
  };

  for (const { source, text, command } of checkOutputs(entries)) {
    const summaries = checkSummaries(text);

    if (source === 'hook') {
      // The hook only ever runs the WORK scope, and its completion line is the run.
      for (const run of hookCheckRuns(text)) {
        const work = scope('work');
        work.runs += 1;
        if (run.reason === 'runner-error') work.errors += 1;
        // A relent prints the reason instead of the findings, so its failure is
        // visible here and nowhere else.
        if (run.reason === 'loop-guard-relent') work.failures += 1;
      }
      for (const s of summaries) if (s.blocking > 0) scope(s.scope).failures += 1;
    } else {
      const invoked = checkInvocations(command);
      for (const name of ['work', 'world']) {
        const reported = summaries.filter((s) => s.scope === name);
        const runs = Math.max(invoked[name], reported.length);
        if (runs === 0) continue;
        scope(name).runs += runs;
        scope(name).failures += reported.filter((s) => s.blocking > 0).length;
      }
    }

    for (const s of summaries) {
      const row = scope(s.scope);
      row.blocking += s.blocking;
      row.advisory += s.advisory;
    }
    for (const f of findingHeaders(text)) finding(f.rule, f.severity);
  }
  return { checks, checkFindings };
}

// --- per-file counting ---------------------------------------------------------

// Count one capture file's entries. `mounted` is the set of skill names this repo
// mounts; a typed `/command` counts as a skill load only when it names one of them,
// which is what keeps the built-in CLI commands (`/model`, `/clear`, …) out.
//
// Stated overlap: a typed `/merge-to-main` counts in BOTH userCommands and
// skillLoads. One event, two axes, both true.
export function countEntries(entries, mounted = new Set()) {
  const skillLoads = {};
  let userMessages = 0;
  let userCommands = 0;
  const load = (name) => { skillLoads[name] = (skillLoads[name] ?? 0) + 1; };

  for (const entry of entries) {
    for (const name of skillToolLoads(entry)) load(name);
    if (isUserMessage(entry)) userMessages += 1;
    const command = commandName(entry);
    if (command !== null) {
      userCommands += 1;
      if (mounted.has(command)) load(command);
    }
  }
  return { userMessages, userCommands, skillLoads, ...countChecks(entries) };
}

// --- day buckets ---------------------------------------------------------------

// An empty day row — the shape every counter folds through.
const emptyDay = () => ({
  captures: 0, merges: 0, sessions: 0, userMessages: 0, userCommands: 0, skillLoads: {},
  checks: {}, checkFindings: {},
});

function addLoads(into, from) {
  for (const [name, n] of Object.entries(from)) into[name] = (into[name] ?? 0) + n;
}

// The check maps fold the same way skillLoads do — key-wise, zeros implicit — only
// with a fixed-shape counter object under each key instead of a bare number.
function addCounters(into, from) {
  for (const [key, row] of Object.entries(from ?? {})) {
    const target = (into[key] ??= Object.fromEntries(Object.keys(row).map((k) => [k, 0])));
    for (const [field, n] of Object.entries(row)) target[field] = (target[field] ?? 0) + n;
  }
}

// Recompute the day rows from scratch, from the live capture files. `files` is
// `[{ date, issue, sessionId, counts }]` — one entry per capture file in the raw
// window, `counts` being that file's `countEntries` result.
//
// Stateless by construction: a day is a pure function of the files stamped with it,
// so there is no ingest ledger, no double-count risk, and a counting-bug fix
// self-heals the entire visible window on its next run.
export function foldDays(files) {
  const days = {};
  const sessionsByDay = {};
  for (const file of files) {
    const day = (days[file.date] ??= emptyDay());
    day.captures += 1;
    if (file.issue > 0) day.merges += 1;      // issue 0 = a capture with no merge behind it
    day.userMessages += file.counts.userMessages;
    day.userCommands += file.counts.userCommands;
    addLoads(day.skillLoads, file.counts.skillLoads);
    addCounters(day.checks, file.counts.checks);
    addCounters(day.checkFindings, file.counts.checkFindings);
    (sessionsByDay[file.date] ??= new Set()).add(file.sessionId);
  }
  // Distinct sessions, not capture count: one session can capture more than once
  // (a merge, then the session-end tail).
  for (const [date, set] of Object.entries(sessionsByDay)) days[date].sessions = set.size;
  return days;
}

// --- week buckets --------------------------------------------------------------

// The ISO-8601 week a UTC date falls in, `YYYY-Www`. ISO weeks start Monday and
// belong to the year containing their Thursday — computed, never approximated,
// because an off-by-one here would silently mis-file a whole week's row.
export function isoWeek(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;                 // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3);              // the week's Thursday
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const offset = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - offset + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// The days to fold into weeks this run: every completed day strictly after the
// watermark and strictly before today, in order. Days close strictly in order, so a
// single monotone watermark is the WHOLE exactly-once mechanism — no ingest ledger.
// `today` is excluded because its capture files are still arriving.
export function daysToFold(days, foldedThrough, today) {
  return Object.keys(days)
    .filter((d) => d < today && (!foldedThrough || d > foldedThrough))
    .sort();
}

// Add one day row into its week row, append-once. Weeks carry `days` — how many day
// rows they absorbed — so a fold outage longer than the raw retention window
// declares its own hole (`days: 5`) instead of silently under-reporting.
//
// `sessionDays` rather than `sessions`: every counter here sums exactly under
// folding EXCEPT a distinct-session count (a session spanning two days is distinct
// in each), so the week-level field is named for what it actually is — the sum of
// the day-level distinct counts — rather than claiming a precision folding cannot
// give.
export function addDayToWeek(week, day) {
  const w = week ?? {
    days: 0, captures: 0, merges: 0, sessionDays: 0, userMessages: 0, userCommands: 0,
    skillLoads: {}, checks: {}, checkFindings: {},
  };
  w.days += 1;
  w.captures += day.captures;
  w.merges += day.merges;
  w.sessionDays += day.sessions;
  w.userMessages += day.userMessages;
  w.userCommands += day.userCommands;
  addLoads(w.skillLoads, day.skillLoads);
  // A week folded before the checks were counted has no `checks` key at all —
  // default rather than crash, so the first fold after this shipped extends the
  // existing weeks instead of refusing to advance the watermark past them.
  addCounters((w.checks ??= {}), day.checks);
  addCounters((w.checkFindings ??= {}), day.checkFindings);
  return w;
}

// --- the whole file ------------------------------------------------------------

export const USAGE_VERSION = 1;

// Sorted keys throughout, so a recompute that found nothing new produces a
// byte-identical file and the delivery opens no PR.
function sortKeys(obj) {
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
}

function sortRow(row) {
  return {
    ...row,
    skillLoads: sortKeys(row.skillLoads),
    checks: sortKeys(row.checks ?? {}),
    checkFindings: sortKeys(row.checkFindings ?? {}),
  };
}

// Fold one run: day rows recomputed from `files` (the live raw window), week rows
// carried forward from `prior` and advanced by every day that closed since the
// watermark. Pure — the caller supplies today's UTC date and the prior file.
//
// The two tiers answer different questions and are kept honest by different
// mechanisms: days are cheap to be wrong about (recomputed every run, so a fix
// heals them), weeks are not (frozen once folded — re-freezing would need raw data
// the retention TTL deliberately destroyed), so weeks only ever absorb days that
// have closed and can no longer change.
export function foldUsage({ files, prior = {}, today }) {
  const days = foldDays(files);
  const weeks = structuredClone(prior.weeks ?? {});
  let foldedThrough = prior.foldedThrough ?? null;

  for (const date of daysToFold(days, foldedThrough, today)) {
    const key = isoWeek(date);
    weeks[key] = addDayToWeek(weeks[key], days[date]);
    foldedThrough = date;
  }

  return {
    version: USAGE_VERSION,
    foldedThrough,
    days: sortKeys(Object.fromEntries(Object.entries(days).map(([k, v]) => [k, sortRow(v)]))),
    weeks: sortKeys(Object.fromEntries(Object.entries(weeks).map(([k, v]) => [k, sortRow(v)]))),
  };
}

// --- the mounted-skill set -----------------------------------------------------

// The skill names this repo mounts, from the PACK REGISTRY — never from
// `.claude/skills/`, which is gitignored session state an Action checkout does not
// carry at all. Fails soft to an empty set: with no mounted set, a typed `/command`
// still counts as a userCommand and simply never counts as a skill load.
export async function mountedSkillNames(root, config) {
  try {
    const active = (await loadPacks({ localRoot: root })).filter((p) => isActive(p, config));
    return new Set(bundledSkillSources(active).keys());
  } catch { return new Set(); }
}
