#!/usr/bin/env node
// The sheepdog pack's fleet-USAGE sweep — the third cross-repo reach the pack adds,
// alongside the coverage census and the freshness sweep. Run by this pack's
// `fleet-usage` scheduled task (tasks/fleet-usage/), whose worker calls `main()`
// below as the task's `prework`, Action-side inside the enforcer repo's
// scheduler workflow where FLEET_GITHUB_TOKEN is reachable. Still runnable by hand
// (`node aggregate-fleet-usage.mjs`) via the CLI guard at the foot.
//
// WHY IT EXISTS. Each member folds ITS OWN skill-usage aggregate (the
// grow_with_claudinite pack's usage-fold task). A member can therefore answer "does
// this skill ever load HERE" — and cannot answer the question the promotion ladder
// actually asks, which is whether a skill earns its place ACROSS THE FLEET. A skill
// that never loads in one repo may simply not be that repo's subject; a skill that
// never loads in any of them is mis-described or should not be gated at all. Only
// something looking at every member at once can tell those apart, and looking at
// every member is the sheepdog's whole job.
//
// STATELESS FULL RECOMPUTE. Read each member's usage file at its default branch and
// rebuild the fleet file as a pure function of those inputs. Idempotent by
// definition, and it self-heals any past error — at this cardinality (repos ×
// skills × weeks, all small) there is nothing to optimize away.
//
// COVERAGE IS EXPLICIT — over the WHOLE fleet, not just the members. A member with
// no usage file (not folding yet) or an unreadable one is LISTED as absent,
// census-style, never silently skipped. A denominator with an invisible hole in it
// is worse than no denominator. A member that declares itself DORMANT is out of the
// denominator entirely — and listed under its own heading, because "not in the
// race" and "should be folding and isn't" are different facts and only one of them
// is a problem. Uncovered and out-of-scope (archived/fork/excluded) repos are named
// too, contributing to no number: the coverage section accounts for every repo
// under the owner, so no state can drop a repo out of the report.
//
// The canon knows mechanisms, never repos: no member is named anywhere here. The
// member set is enumerated at runtime from the enforcer's own sheepdog config,
// exactly as the census and the freshness sweep enumerate it.
//
// Dependency-free (global fetch, Node 20+); read-only toward every member — the only
// thing it writes is the enforcer repo's own aggregate, and that is delivered by the
// worker, not here.
//
// It lives IN its task's folder because nothing else uses it. What IS shared with
// the other two sweeps sits at the pack root: the cross-repo REST primitives
// (fleet-api.mjs) and the config reader (fleet-config.mjs).

import { pathToFileURL } from 'node:url';
import { makeGh, paged, readDeclaration, isDormant, DECLARATION } from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';
export const MEMBER_USAGE_PATH = '.claudinite/local/usage.GENERATED.json';
export const FLEET_USAGE_PATH = 'usage-fleet.GENERATED.json';
export const FLEET_VERSION = 2;

// The sampling population, stated in the file itself. This must not read as a
// census: a session whose container was reclaimed, or that crashed, never captured
// and is invisible to every number here.
export const SAMPLING_NOTE = 'Captured sessions only — sessions that merged, plus sessions that ended '
  + 'cleanly enough for the SessionEnd capture to fire. Reclaimed containers and crashes are invisible '
  + 'here, so these are SAMPLE counts, not a census of all work. The check counts are narrower still: '
  + 'they are what a session SAW. A CI run counts when the session pulled its job log in — which is '
  + 'what "the agent was in the loop on it" means — and a nightly or post-merge run nobody looked at '
  + 'does not, because nothing was corrected. CI can only see a run that PRINTED something, so its '
  + 'share is carried separately as ciRuns/ciFailures. Every check number is a floor on activations, '
  + 'never an over-count. The `tasks` rows are the ONE exception to all of the above: they come from '
  + "each member's scheduler run records rather than from a captured session, so they are a census of "
  + 'scheduled work — every due task of every run, whether or not any session was ever captured — '
  + 'bounded only by how far back that member has been folding them.';

// --- the pure aggregation -----------------------------------------------------

const sortKeys = (obj) => Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));

// Build the fleet file from `members` — `[{ repo, usage }]`, `usage` being that
// member's parsed aggregate — plus `absent`, the members that had none.
//
// GRAIN: full (week × repo × skill) for history, plus each member's current day
// window verbatim for the fast view. Nothing is pre-summed: every coarser view
// (a skill fleet-wide, a repo over time, this week across the fleet) stays derivable
// from this file, and a summary that threw away the grain would not.
//
// VERBATIM MEANS VERBATIM: a member's row is copied, never rewritten. The member's
// file declares how to read its own rows, and that declaration is carried beside them
// under `repos[repo]` — so this sweep needs no knowledge of the format at all, and
// the members' formats are free to move on their own schedule.
export function aggregate({ members, absent = [], dormant = [], uncovered = [], outOfScope = [], generatedAt }) {
  const weeks = {};
  const days = {};
  const repos = {};

  for (const { repo, usage } of members) {
    // ROWS PASS THROUGH UNTOUCHED, in both tiers. This sweep re-KEYS the fleet's rows
    // (by repo, and week × repo); it never re-interprets one. Each member's file is
    // self-describing — it declares the vocabulary its counter rows are spelled in —
    // so the member's own header is carried beside its rows under `repos` and a reader
    // decodes each repo's rows with that repo's header. Nothing here needs to import
    // the format, and nothing here can quietly restate one repo's numbers in another
    // repo's vocabulary.
    //
    // The week rows carry the member's counters as they came: skill loads, and the
    // conformance checks at the same grain and for the same reason — whether a rule
    // earns its place is a FLEET question. A rule that never fires in one repo may
    // just not be that repo's subject; a rule that never fires in ANY of them is
    // mis-described or worthless, and a rule that keeps firing everywhere is the
    // corpus's best-performing guard. Only a view across every member tells those
    // apart. The `tasks` rows answer the same question about scheduled work — a task
    // that skips in every member every day is a precondition that never fires; one
    // that fails across members is broken machinery, not a bad night.
    days[repo] = sortKeys(usage?.days ?? {});
    repos[repo] = {
      foldedThrough: usage?.foldedThrough ?? null,
      weeks: Object.keys(usage?.weeks ?? {}).length,
      // How to read this repo's rows: the format version its file declared, and the
      // counter vocabularies it declared with them. A member whose file predates the
      // header has `fields: null` — its rows are fully-spelled objects and need none.
      // The fleet is permanently mid-upgrade (members converge on their own nightly
      // cadence), so this is a standing fact about the file, not a migration artifact.
      format: Number(usage?.version ?? 1),
      fields: usage?.fields ?? null,
    };
    for (const [week, row] of Object.entries(usage?.weeks ?? {})) {
      (weeks[week] ??= {})[repo] = row;
    }
  }

  return {
    version: FLEET_VERSION,
    generatedAt,
    _note: SAMPLING_NOTE,
    coverage: {
      folding: Object.keys(repos).sort(),
      absent: [...absent].sort(),
      // Dormant members are OUT of the denominator, and named rather than dropped.
      // They are not an absence to chase — nobody is working there, so a skill that
      // never loads there says nothing about whether it earns its place — but a
      // reader comparing this file against the fleet's repo count needs to see where
      // the difference went. Absent means "should be folding and isn't"; dormant
      // means "not in the race at all".
      dormant: [...dormant].sort(),
      // The rest of the owner's repos, so the coverage section accounts for the WHOLE
      // fleet: uncovered repos (the census's subject — no member data to read) and
      // repos out of scope entirely (archived, forks, excluded — reason inline).
      // Neither contributes to any number; both are named so a reader can never
      // mistake "not a member" for "fell out of the file".
      uncovered: [...uncovered].sort(),
      outOfScope: [...outOfScope].sort(),
    },
    repos: sortKeys(repos),
    days: sortKeys(days),
    weeks: sortKeys(Object.fromEntries(Object.entries(weeks).map(([w, byRepo]) => [w, sortKeys(byRepo)]))),
  };
}

// The folding members with NO captured activity on the day the file was generated —
// its day window carries no row for `generatedAt`. DERIVED from the file, not stored
// in it: the verdict moves when the date alone moves, and the worker's
// unchanged-compare deliberately ignores the day stamp so an unmoved fleet opens no
// PR — a stored copy would reopen that PR every midnight. The worker names them in
// the run report instead, where a daily fact belongs.
export function inactiveToday(file) {
  return file.coverage.folding.filter((repo) => !file.days[repo]?.[file.generatedAt]);
}

// --- the fleet read -----------------------------------------------------------

// One member's usage file at its default branch, or null when it has none. A
// non-200 that is not a 404, or an unparsable body, THROWS — the caller records it
// as an absence with a reason rather than treating "I could not read it" as "it has
// nothing".
async function readUsage(gh, fullName, path = MEMBER_USAGE_PATH) {
  const res = await gh(`/repos/${fullName}/contents/${path}`);
  if (res.status === 404) return null;
  if (res.status !== 200 || !res.json?.content) {
    throw new Error(`reading ${path} returned ${res.status}`);
  }
  try {
    return JSON.parse(Buffer.from(res.json.content, 'base64').toString('utf8'));
  } catch (e) {
    throw new Error(`unparsable ${path}: ${e.message}`);
  }
}

// Exported so the fleet-usage task's worker can invoke the sweep in-process; the CLI
// guard below keeps the standalone run. Returns the built file — the worker owns
// delivering it, so this stays a pure "read the fleet, build the object" pass.
export async function main({ now = new Date() } = {}) {
  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) {
    throw new Error('FLEET_GITHUB_TOKEN is not set. Add a repo secret with a fine-grained PAT '
      + '(this account, ALL repositories, Metadata read, Contents read) — the default GITHUB_TOKEN '
      + 'sees only this repo and cannot read the fleet.');
  }
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);

  const cfgRes = await gh(`/repos/${home}/contents/${DECLARATION}`);
  if (cfgRes.status !== 200 || !cfgRes.json?.content) {
    throw new Error(`the sheepdog repo ${home} has no readable ${DECLARATION} (status ${cfgRes.status})`);
  }
  let cfg;
  try { cfg = JSON.parse(Buffer.from(cfgRes.json.content, 'base64').toString('utf8')); } catch (e) {
    throw new Error(`unparsable ${DECLARATION} on ${home}: ${e.message}`);
  }
  const { owner, exclude } = parseSheepdogConfig(cfg, home);

  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  if (mine.length === 0) {
    throw new Error(`enumeration returned no repos owned by ${owner} — wrong token user or scope; `
      + 'refusing to publish a fleet aggregate that would report the whole fleet as absent');
  }

  const members = [];
  const absent = [];
  const dormant = [];
  const uncovered = [];
  const outOfScope = [];
  for (const r of mine.sort((a, b) => a.full_name.localeCompare(b.full_name))) {
    const fullName = r.full_name;
    const key = fullName.toLowerCase();
    // Not members, but not dropped either: the coverage section accounts for every
    // repo under the owner, and these land there with their reason.
    if (r.archived || r.fork) { outOfScope.push(`${fullName} (${r.archived ? 'archived' : 'fork'})`); continue; }
    if (exclude.has(key)) { outOfScope.push(`${fullName} (excluded)`); continue; }
    // Only COVERED repos are members. An uncovered repo is the census's subject, not
    // this sweep's — it is NAMED under coverage.uncovered, never counted as an absent
    // member, because "should be folding and isn't" is a different fact from "not a
    // member at all". The declaration is read rather than merely counted because
    // dormancy is inside it, and the same read answers both questions.
    let decl;
    try { decl = await readDeclaration(gh, fullName); } catch (e) {
      absent.push(`${fullName} (coverage check failed: ${e.message})`);
      continue;
    }
    if (decl === null) { uncovered.push(fullName); continue; }
    // A dormant member is out of the DENOMINATOR, not an absence: nobody is working
    // there, so "this skill never loaded" is a fact about the silence, not about the
    // skill, and averaging it in would drag every fleet-wide number toward zero as
    // the fleet accumulates finished projects.
    if (isDormant(decl)) { dormant.push(fullName); continue; }
    try {
      const usage = await readUsage(gh, fullName);
      if (usage === null) absent.push(`${fullName} (no ${MEMBER_USAGE_PATH} — not folding yet)`);
      else members.push({ repo: fullName, usage });
    } catch (e) {
      absent.push(`${fullName} (${e.message})`);
    }
  }

  return aggregate({ members, absent, dormant, uncovered, outOfScope, generatedAt: now.toISOString().slice(0, 10) });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then((file) => console.log(JSON.stringify(file, null, 2)))
    .catch((e) => { console.error(`fleet-usage aggregation failed: ${e.message}`); process.exit(1); });
}
