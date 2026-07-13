import { isFullSweepDay } from './schedule.mjs';

// The signal bundle each gate reads. Built per covered member from a small, bounded
// set of cheap GitHub reads; `gh(path) -> { status, json }` is the same client the
// census uses. See routines/fleet/DESIGN.md ("The signal bundle").

// --- canonChanged (global, computed once) -----------------------------------

// A canon change should re-baseline / dedup members only when it touches what a
// member actually mounts or is checked against. Exclude the orchestration layer and
// the planner's own artifacts, or canonChanged self-triggers every night.
const CANON_MEMBER_PATHS = [/^packs\//, /^checks\//, /^skills\//, /^migrations\//, /^bootstrap\.md$/, /^sync-claudinite\.sh$/];
const CANON_EXCLUDE = [/^routines\//, /(^|\/)plan\.json$/];

export function pathAffectsMembers(path) {
  if (CANON_EXCLUDE.some((re) => re.test(path))) return false;
  return CANON_MEMBER_PATHS.some((re) => re.test(path));
}

// Did the home repo advance in the window with a change members care about? Windowed
// and stateless like everything else. A commit whose files can't be read counts as
// not-canon (it only delays a dedup, never forces a spurious one).
export async function computeCanonChanged(gh, home, sinceIso) {
  const { status, json } = await gh(`/repos/${home}/commits?since=${sinceIso}&per_page=100`);
  if (status !== 200 || !Array.isArray(json)) return false;
  for (const c of json) {
    const detail = await gh(`/repos/${home}/commits/${c.sha}`);
    const files = detail.status === 200 ? (detail.json?.files ?? []) : [];
    if (files.some((f) => pathAffectsMembers(f.filename))) return true;
  }
  return false;
}

// --- per-repo probes --------------------------------------------------------

// Open items sorted by `updated` desc: all of them when widening (mainMoved/fullSweep,
// so the landed/implemented tests re-examine everything), else only those updated
// within the window — and since the list is sorted, stop at the first older one.
async function touchedNumbers(gh, path, sinceIso, widen, keep = () => true) {
  const since = new Date(sinceIso);
  const out = [];
  for (let page = 1; ; page += 1) {
    const { status, json } = await gh(`${path}&per_page=100&page=${page}`);
    if (status !== 200 || !Array.isArray(json) || json.length === 0) break;
    for (const item of json) {
      if (!widen && new Date(item.updated_at) < since) return out; // sorted → done
      if (keep(item)) out.push(item.number);
    }
    if (json.length < 100) break;
  }
  return out;
}

async function allBranchNames(gh, fullName) {
  const out = [];
  for (let page = 1; ; page += 1) {
    const { status, json } = await gh(`/repos/${fullName}/branches?per_page=100&page=${page}`);
    if (status !== 200 || !Array.isArray(json) || json.length === 0) break;
    out.push(...json.map((b) => b.name));
    if (json.length < 100) break;
  }
  return out;
}

async function readActivePacks(gh, fullName) {
  const { status, json } = await gh(`/repos/${fullName}/contents/.claudinite-checks.json`);
  if (status !== 200 || !json?.content) return [];
  try {
    const parsed = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
    // A packs entry is an id string or an entry object { id, ... } — this reads
    // the member's file raw (over the API, no engine on hand), so it normalizes
    // to ids itself, same as packEntryId in packs/registry.mjs.
    return (Array.isArray(parsed.packs) ? parsed.packs : [])
      .map((e) => (typeof e === 'string' ? e : e?.id))
      .filter((id) => typeof id === 'string');
  } catch { return []; }
}

// Build the bundle. `pushed_at` (already in hand from enumeration) short-circuits the
// code-side probes when nothing was pushed and it isn't a full sweep; PR/issue probes
// always run (a comment/label moves `updated_at` without a push). canonChanged is the
// global signal, computed once by the caller and threaded in.
//
// Two signals exist only on the HOME repo's bundle and are stamped by the planner,
// not built here: `isHome: true`, and `fleetMembers` — every successfully-probed
// member's { repo, activePacks, projectChanged }, complete because home is planned
// last. They're what home-only packs' gates decide fleet-facing work from.
export async function buildSignals(gh, repo, { sinceIso, weekdayUtc, canonChanged }) {
  const fullName = repo.full_name;
  const defaultBranch = repo.default_branch;
  const fullSweep = isFullSweepDay(fullName, weekdayUtc);
  const pushedInWindow = repo.pushed_at ? new Date(repo.pushed_at) >= new Date(sinceIso) : false;

  let mainMoved = false;
  if (pushedInWindow || fullSweep) {
    const { status, json } = await gh(
      `/repos/${fullName}/commits?sha=${encodeURIComponent(defaultBranch)}&since=${sinceIso}&per_page=1`,
    );
    mainMoved = status === 200 && Array.isArray(json) && json.length > 0;
  }
  // The default branch advancing (merges land there too) is "the project changed".
  const projectChanged = mainMoved;
  const widen = mainMoved || fullSweep;

  const prsTouched = await touchedNumbers(gh, `/repos/${fullName}/pulls?state=open&sort=updated&direction=desc`, sinceIso, widen);
  const issuesTouched = await touchedNumbers(gh, `/repos/${fullName}/issues?state=open&sort=updated&direction=desc`, sinceIso, widen, (i) => !i.pull_request);
  const branchesTouched = (widen || pushedInWindow) ? await allBranchNames(gh, fullName) : [];
  const activePacks = await readActivePacks(gh, fullName);

  return {
    fullSweep,
    pushedAt: repo.pushed_at ?? null,
    mainMoved,
    projectChanged,
    prsTouched,
    issuesTouched,
    branchesTouched,
    activePacks,
    canonChanged: !!canonChanged,
  };
}
