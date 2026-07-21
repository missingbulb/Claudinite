import { isFullSweepDay } from './schedule.mjs';
import { packEntryId } from '../../engine/packs/registry.mjs';

// The signal bundle each gate reads. Built per covered member from a small, bounded
// set of cheap GitHub reads; `gh(path) -> { status, json }` is the orchestrator's
// injected MCP-backed reader (no REST client here). See routines/fleet/DESIGN.md
// ("The signal bundle").

// --- canonChanged (global, computed once) -----------------------------------

// A canon change should re-baseline / dedup members only when it touches what a
// member actually mounts or is checked against — the packs/engine/skills/migrations
// it runs, the bootstrap it re-applies, and the mount plumbing it vendors (the
// tracked sync hook, session-start, env-setup; `checks/` and `mount/` are the
// pre-engine-tree paths — now transitional shims — and `sync-claudinite.sh` the
// retired pre-mount path, all kept tolerant). Exclude the orchestration layer and
// the planner's own artifacts, or canonChanged self-triggers every night.
const CANON_MEMBER_PATHS = [/^packs\//, /^engine\//, /^checks\//, /^skills\//, /^migrations\//, /^bootstrap\.md$/, /^mount\//, /^sync-claudinite\.sh$/];
const CANON_EXCLUDE = [/^routines\//, /(^|\/)plan\.json$/];

export function pathAffectsMembers(path) {
  if (CANON_EXCLUDE.some((re) => re.test(path))) return false;
  return CANON_MEMBER_PATHS.some((re) => re.test(path));
}

// Classify a changed canon path: the pack it belongs to (`packs/<id>/…`), or a
// cross-cutting area every member mounts regardless of its pack set (checks/, skills/,
// migrations/, bootstrap wiring). Returns null for a path that doesn't affect members
// (the planner's own artifacts, orchestration docs).
const PACK_FILE = /^packs\/([^/]+)\//;
export function canonChangeForPath(path) {
  if (!pathAffectsMembers(path)) return null;
  const m = PACK_FILE.exec(path);
  return m ? { pack: m[1] } : { crossCutting: true };
}

// Did the home repo advance in the window with a change members care about, and *what*
// changed? Windowed and stateless. Returns the coarse `changed` boolean (baselining's
// trigger — the canon shipped new checks/wiring, propagate them) alongside the per-pack
// detail: the set of pack ids whose files moved, and whether any cross-cutting area
// moved. The detail lets a member gate on "a pack *I* declare changed" rather than any
// canon movement (growth-dedup). A commit whose files can't be read simply contributes
// nothing (it only delays a dedup, never forces a spurious one).
export async function computeCanonChange(gh, home, sinceIso) {
  const packs = new Set();
  let crossCutting = false;
  const { status, json } = await gh(`/repos/${home}/commits?since=${sinceIso}&per_page=100`);
  if (status !== 200 || !Array.isArray(json)) return { changed: false, packs, crossCutting };
  for (const c of json) {
    const detail = await gh(`/repos/${home}/commits/${c.sha}`);
    const files = detail.status === 200 ? (detail.json?.files ?? []) : [];
    for (const f of files) {
      const cls = canonChangeForPath(f.filename);
      if (!cls) continue;
      if (cls.pack) packs.add(cls.pack);
      if (cls.crossCutting) crossCutting = true;
    }
  }
  return { changed: crossCutting || packs.size > 0, packs, crossCutting };
}

// Back-compat boolean wrapper (the coarse "did anything a member cares about move").
export async function computeCanonChanged(gh, home, sinceIso) {
  return (await computeCanonChange(gh, home, sinceIso)).changed;
}

// --- per-repo probes --------------------------------------------------------

// Open items sorted by `updated` desc: all of them when widening (substantiveChange/
// fullSweep, so the landed/implemented tests re-examine everything), else only those
// updated within the window — and since the list is sorted, stop at the first older one.
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

// The routine's own standing trackers are its artifacts, not project activity: each
// repo-tidy run rewrites its `Claudinite tracker: Repo Tidy` (and the growth routines
// touch theirs) every night, so a ~24h-old tracker update sits inside the 25h window on
// every run. Counting it as issue activity would re-fire repo-tidy nightly on an
// otherwise-quiet repo — the same self-trigger `canonChanged` avoids by excluding
// plan.json/trackers. Match the canonical + legacy tracker titles and drop them.
const ROUTINE_TRACKER_TITLE = /^(claudinite tracker:|auto-improvements tracker\b|repo tidy tracker$)/i;
export function isRoutineTracker(title) {
  return typeof title === 'string' && ROUTINE_TRACKER_TITLE.test(title.trim());
}

async function readPacksDeclaration(gh, fullName) {
  const none = { activePacks: [], packConfigs: {} };
  const { status, json } = await gh(`/repos/${fullName}/contents/.claudinite-checks.json`);
  if (status !== 200 || !json?.content) return none;
  try {
    const parsed = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
    // A packs entry is an id string or an entry object { id, config?, ... },
    // in either declaration form (bare id, or a local pack's namespaced
    // local_packs/<name> token) — packEntryId is the one shared extractor, so
    // `activePacks` stays BARE ids and the gates that compare against canon
    // pack ids (the promote gate, relevantCanonChanged) keep matching. Entry
    // configs ride along (id → config) so home-only gates can honor a member's
    // per-pack settings — e.g. the growth entry's promote opt-out — without a
    // second read.
    const entries = Array.isArray(parsed.packs) ? parsed.packs : [];
    const activePacks = entries
      .map((e) => packEntryId(e))
      .filter((id) => typeof id === 'string');
    const packConfigs = {};
    for (const e of entries) {
      if (e && typeof e === 'object' && typeof e.id === 'string' && e.config !== undefined) {
        packConfigs[packEntryId(e)] = e.config;
      }
    }
    return { activePacks, packConfigs };
  } catch { return none; }
}

// Commits that are fleet/CI housekeeping rather than genuine project work: a
// bot-authored commit (a `[bot]` login — CI/automation data refreshes or
// auto-release version bumps), an explicit `[skip ci]` marker, or one of the fleet's
// own automated writes (baselining/seed, plus the maintenance and growth PRs the fleet
// now auto-merges — their squash subjects land on the default branch too). Excluding
// these from `substantiveChange` stops the growth tasks (and repo-tidy) from
// self-triggering on the fleet's own writes — the feedback loop where last night's
// maintenance/growth merge fires tonight's growth-extract/dedup/tidy on a repo that has
// no new lesson or landed work. The subjects to match: a subject-initial `Baseline:` /
// `Baselining:` (mount + wiring refresh), `Claudinite baseline…`, a `seed default-on`
// commit, and the auto-merged `Claudinite maintenance` / `Claudinite growth: …` PR
// titles (their squash-merge subjects) — subject-anchored so a real "baseline
// benchmark" feature commit still counts. Keep these in sync with the PR titles the
// fleet-apply pass and the growth workers open.
const HOUSEKEEPING_MESSAGE = /\[skip ci\]|(^|\n)\s*baselin(e|ing)\b|claudinite (baselin|maintenance|growth)|seed default-on/i;
function isSubstantiveCommit(c) {
  const login = c.author && c.author.login ? c.author.login : '';
  if (login.endsWith('[bot]')) return false;
  const message = (c.commit && c.commit.message) || '';
  if (HOUSEKEEPING_MESSAGE.test(message)) return false;
  return true;
}

// Does the member track any local packs of its own (`.claudinite/local_packs/<pack>/`)?
// growth-dedup (prune local packs the canon now covers) and growth-promote (lift local
// lessons up) have nothing to do without one, so the planner skips those units entirely
// for a repo that carries none — a single cheap read that avoids booting a whole
// subagent only to discover "no local packs."
async function readHasLocalPacks(gh, fullName) {
  const { status, json } = await gh(`/repos/${fullName}/contents/.claudinite/local_packs`);
  if (status !== 200 || !Array.isArray(json)) return false;
  return json.some((e) => e && e.type === 'dir');
}

// Did the member's local packs actually change in the window — i.e. did a default-branch
// commit touch `.claudinite/local_packs/`? This is promote's real trigger: promote lifts
// *new* local lessons up, so a member that changed its product code but not its local
// packs has nothing to promote. Cheaper than the whole-tree diff — scan only the window's
// commits (a handful) and stop at the first hit — and run only for a repo that has local
// packs at all (a non-local-packs repo is already excluded upstream).
async function readLocalPacksChanged(gh, fullName, commits) {
  for (const c of commits) {
    if (!c?.sha) continue;
    const detail = await gh(`/repos/${fullName}/commits/${c.sha}`);
    const files = detail.status === 200 ? (detail.json?.files ?? []) : [];
    if (files.some((f) => typeof f.filename === 'string' && f.filename.startsWith('.claudinite/local_packs/'))) return true;
  }
  return false;
}

// Build the bundle. `pushed_at` (already in hand from enumeration) short-circuits the
// code-side probes when nothing was pushed and it isn't a full sweep; PR/issue probes
// always run (a comment/label moves `updated_at` without a push). `canonChange` is the
// global object ({ changed, packs, crossCutting }), computed once by the caller and
// threaded in; the per-repo `relevantCanonChanged` is derived from it against this
// member's declared packs.
//
// Two signals exist only on the HOME repo's bundle and are stamped by the planner,
// not built here: `isHome: true`, and `fleetMembers` — every successfully-probed
// member's { repo, activePacks, packConfigs, projectChanged, substantiveChange,
// hasLocalPacks, localPacksChanged }, complete because home is planned last.
// They're what home-only packs' gates decide fleet-facing work from.
export async function buildSignals(gh, repo, { sinceIso, weekdayUtc, canonChange }) {
  const fullName = repo.full_name;
  const defaultBranch = repo.default_branch;
  const fullSweep = isFullSweepDay(fullName, weekdayUtc);
  const pushedInWindow = repo.pushed_at ? new Date(repo.pushed_at) >= new Date(sinceIso) : false;

  let mainMoved = false;
  let substantiveChange = false;
  let commits = [];
  if (pushedInWindow || fullSweep) {
    const { status, json } = await gh(
      `/repos/${fullName}/commits?sha=${encodeURIComponent(defaultBranch)}&since=${sinceIso}&per_page=100`,
    );
    commits = status === 200 && Array.isArray(json) ? json : [];
    mainMoved = commits.length > 0;
    // Real project work in the window (not fleet/CI housekeeping) — the trigger the
    // growth tasks AND repo-tidy key on, so a bot bump or the fleet's own auto-merged
    // maintenance/growth PR doesn't spawn a subagent that finds nothing. Those PRs land
    // on the default branch as squash commits, so the exclusion is subject-based
    // (HOUSEKEEPING_MESSAGE), not merge-shape-based — a genuine project PR merge still
    // trips substantiveChange because its subject isn't one of the fleet's.
    substantiveChange = commits.some(isSubstantiveCommit);
  }
  // The default branch advancing (merges land there too) is "the project changed".
  const projectChanged = mainMoved;
  // Widen the tidy candidate set (re-examine ALL open branches/PRs/issues for landed /
  // implemented status) only on a *substantive* move or the weekly full sweep — not on
  // a housekeeping-only main move, which lands nothing and implements nothing.
  const widen = substantiveChange || fullSweep;

  const prsTouched = await touchedNumbers(gh, `/repos/${fullName}/pulls?state=open&sort=updated&direction=desc`, sinceIso, widen);
  const issuesTouched = await touchedNumbers(gh, `/repos/${fullName}/issues?state=open&sort=updated&direction=desc`, sinceIso, widen, (i) => !i.pull_request && !isRoutineTracker(i.title));
  const branchesTouched = widen ? await allBranchNames(gh, fullName) : [];
  const { activePacks, packConfigs } = await readPacksDeclaration(gh, fullName);
  const hasLocalPacks = await readHasLocalPacks(gh, fullName);
  // Only meaningful (and only worth the per-commit reads) when the repo has local packs.
  const localPacksChanged = hasLocalPacks && commits.length ? await readLocalPacksChanged(gh, fullName, commits) : false;

  const canon = canonChange ?? { changed: false, packs: new Set(), crossCutting: false };
  // This member cares about a canon change iff a pack it declares moved, or a
  // cross-cutting area (mounted by everyone) moved.
  const relevantCanonChanged = canon.crossCutting || activePacks.some((p) => canon.packs.has(p));

  return {
    fullSweep,
    pushedAt: repo.pushed_at ?? null,
    mainMoved,
    projectChanged,
    substantiveChange,
    prsTouched,
    issuesTouched,
    branchesTouched,
    activePacks,
    packConfigs,
    hasLocalPacks,
    localPacksChanged,
    canonChanged: !!canon.changed,
    relevantCanonChanged,
  };
}
