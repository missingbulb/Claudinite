#!/usr/bin/env node
// The sheepdog pack's fleet-USAGE sweep — the third cross-repo reach the pack adds,
// alongside the coverage census and the freshness sweep. Run by this pack's
// `fleet-usage` scheduled task (tasks/fleet-usage/), whose worker calls `main()`
// below as the task's `agent_preprocessing`, Action-side inside the enforcer repo's
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
// COVERAGE IS EXPLICIT. A member with no usage file (not folding yet) or an
// unreadable one is LISTED as absent, census-style, never silently skipped. A
// denominator with an invisible hole in it is worse than no denominator.
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
import { makeGh, paged, isCovered } from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';

const DECLARATION = '.claudinite-checks.json';
export const MEMBER_USAGE_PATH = '.claudinite/local/usage.GENERATED.json';
export const FLEET_USAGE_PATH = 'usage-fleet.GENERATED.json';
export const FLEET_VERSION = 1;

// The sampling population, stated in the file itself. This must not read as a
// census: a session whose container was reclaimed, or that crashed, never captured
// and is invisible to every number here.
export const SAMPLING_NOTE = 'Captured sessions only — sessions that merged, plus sessions that ended '
  + 'cleanly enough for the SessionEnd capture to fire. Reclaimed containers and crashes are invisible '
  + 'here, so these are SAMPLE counts, not a census of all work. The check counts are narrower still: '
  + 'they are what a session SAW, so a world sweep that ran in CI rather than in a session is not in '
  + 'them. Every check number is a floor on activations, never an over-count.';

// --- the pure aggregation -----------------------------------------------------

const sortKeys = (obj) => Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));

// Build the fleet file from `members` — `[{ repo, usage }]`, `usage` being that
// member's parsed aggregate — plus `absent`, the members that had none.
//
// GRAIN: full (week × repo × skill) for history, plus each member's current day
// window verbatim for the fast view. Nothing is pre-summed: every coarser view
// (a skill fleet-wide, a repo over time, this week across the fleet) stays derivable
// from this file, and a summary that threw away the grain would not.
export function aggregate({ members, absent = [], generatedAt }) {
  const weeks = {};
  const days = {};
  const repos = {};

  for (const { repo, usage } of members) {
    days[repo] = sortKeys(usage?.days ?? {});
    repos[repo] = {
      foldedThrough: usage?.foldedThrough ?? null,
      weeks: Object.keys(usage?.weeks ?? {}).length,
    };
    for (const [week, row] of Object.entries(usage?.weeks ?? {})) {
      ((weeks[week] ??= {})[repo] = {
        days: row.days ?? 0,
        captures: row.captures ?? 0,
        merges: row.merges ?? 0,
        sessionDays: row.sessionDays ?? 0,
        userMessages: row.userMessages ?? 0,
        userCommands: row.userCommands ?? 0,
        skillLoads: sortKeys(row.skillLoads ?? {}),
        // The conformance checks, at the same grain and for the same reason as the
        // skill loads: whether a rule earns its place is a FLEET question. A rule
        // that never fires in one repo may just not be that repo's subject; a rule
        // that never fires in ANY of them is mis-described or worthless — and a rule
        // that keeps firing everywhere is the corpus's best-performing guard, which
        // only a view across every member can tell apart. Defaulted, not required:
        // a member still on an older fold carries no `checks` key, and it must land
        // in the file as an empty row rather than an exception.
        checks: sortKeys(row.checks ?? {}),
        checkFindings: sortKeys(row.checkFindings ?? {}),
      });
    }
  }

  return {
    version: FLEET_VERSION,
    generatedAt,
    _note: SAMPLING_NOTE,
    coverage: {
      folding: Object.keys(repos).sort(),
      absent: [...absent].sort(),
    },
    repos: sortKeys(repos),
    days: sortKeys(days),
    weeks: sortKeys(Object.fromEntries(Object.entries(weeks).map(([w, byRepo]) => [w, sortKeys(byRepo)]))),
  };
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
  for (const r of mine.sort((a, b) => a.full_name.localeCompare(b.full_name))) {
    const fullName = r.full_name;
    const key = fullName.toLowerCase();
    if (r.archived || r.fork || exclude.has(key)) continue;
    // Only COVERED repos are members. An uncovered repo is the census's subject, not
    // this sweep's — reporting it as an absent member would file the same fact twice.
    let covered;
    try { covered = await isCovered(gh, fullName); } catch (e) {
      absent.push(`${fullName} (coverage check failed: ${e.message})`);
      continue;
    }
    if (!covered) continue;
    try {
      const usage = await readUsage(gh, fullName);
      if (usage === null) absent.push(`${fullName} (no ${MEMBER_USAGE_PATH} — not folding yet)`);
      else members.push({ repo: fullName, usage });
    } catch (e) {
      absent.push(`${fullName} (${e.message})`);
    }
  }

  return aggregate({ members, absent, generatedAt: now.toISOString().slice(0, 10) });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then((file) => console.log(JSON.stringify(file, null, 2)))
    .catch((e) => { console.error(`fleet-usage aggregation failed: ${e.message}`); process.exit(1); });
}
