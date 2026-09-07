// The FRESHNESS half of the fleet-roster sweep: the root-cause classification of a
// member's mount against canon, and the freshness section of the run report.
//
// It holds no enumeration and no membership classification — the roster is built once,
// for both halves, by its sibling check-fleet-roster.mjs, which hands this module only
// the members it has already established are covered, in scope and this sweep's to
// measure. What lives here is everything specific to the freshness QUESTION. Its
// counterpart is adoption-issues.mjs, which owns the coverage question; the two never
// import each other.
//
// WHY THE QUESTION EXISTS. Under per-project scheduling every member maintains ITSELF:
// its own vendored `claudinite-scheduler.yml` fires hourly, and its `baselining` task
// re-vendors the mount from canon. That is the right architecture — and it removed the
// last thing that ever looked at a member from the outside. A member whose scheduler
// was never vendored, whose workflow was deleted, or whose baselining has been failing
// for a fortnight is otherwise invisible: it still carries a declaration, so the
// coverage half calls it covered, and it files no failure issue because nothing runs
// there to fail. Self-maintenance cannot detect its own absence.
//
// WHERE THE ANSWER GOES: the run report, and nowhere else. This half filed a
// `fleet-drift` issue per unhealthy member until #1854. The dashboard's Drift tile
// measures the same fact from the same source — each member's declaration against
// canon — and recomputes on load, so the issues were a second surface for one
// question and the staler of the two: only ever as current as the last daily sweep,
// which is how a member that fell behind hours after a sweep sat unreported while
// three issues named members that had already caught up. The coverage half still
// files, because no other surface answers coverage.
//
// WHAT `behind` MEASURES: the VERSION GAP, and nothing else. The versioned update
// flows stamp `engineVersion` and `packVersions` and deliberately never rewrite `ref`
// or `updated`, so on a well-maintained member the stamped ref is frozen at whatever
// commit first vendored it and its AGE measures nothing at all. A date measure over
// that stamp does not decay gracefully either: every member's ref ages at the same
// rate, so one arbitrary day the whole fleet crosses the window at once and the sweep
// calls every repo behind for a fleet that is, by versions, current (#1025).
//
// So a member is behind when its stamped engine version is below canon's, or any pack
// it stamps is below that pack's manifest version in canon — read out of CANON over
// the API, never out of the enforcer's own mount, which is itself a member and can be
// behind. The stamped ref is still read for what it honestly is, provenance: whether
// it is a commit on canon's trunk at all, which is the #328 wedge.
//
// Read-only toward every repo it touches, the enforcer included: this half now writes
// nothing at all.
import { DECLARATION } from '../../fleet-api.mjs';
import { VERSION_SOURCE, versionFromLiteral, isVersion, versionAbove } from '../../../../engine/version.mjs';
import { installedVersions } from '../../../../engine/installed-versions.mjs';

const SCHEDULER = '.github/workflows/claudinite-scheduler.yml';

export { SCHEDULER };
export const FRESH = 'fresh';


// --- classification (pure) ----------------------------------------------------

// `installed` is what the member's own settings say it holds ({ engineVersion,
// packVersions }) and `canon` the same two numbers read out of canon for exactly the
// packs that member names. Kept free of I/O so every branch is testable directly.
//
// THE REF IS GONE (#1252), and with it `ref-not-on-trunk`. That state asked whether
// the member's stamped ref was an ancestor of canon's default branch, because the
// anti-rewind guard used to refuse a converge over a ref it could not place — the
// guard now compares versions and needs no ref, so the wedge it reported cannot
// happen and the per-member compare call that detected it is a read nobody needs.
//
// The precedence is about ROOT CAUSE, not the order the facts arrive in: a member with
// no scheduler is ALSO behind, and reporting "behind" would send the reader chasing a
// symptom of the missing cron.
export function classifyFreshness({ hasScheduler, installed, canon, dormant = false }) {
  // Neither number means the mount has never been written by an engine that stamps —
  // which is every engine there has been since the versioned flows landed. A repo
  // whose declaration names packs whose versions it cannot state has not been
  // vendored, whatever else is true of it.
  const packIds = Object.keys(installed.packVersions);
  if (installed.engineVersion === null && packIds.length === 0) {
    return { state: 'no-stamp', detail: `${DECLARATION} carries no engineVersion and no pack versions — the repo declares packs but has never been vendored` };
  }
  // A DORMANT member's scheduler is stopped by its own declaration, so its absence is
  // obedience rather than drift, and this is the ONE state dormancy suppresses. The
  // version comparison below still runs: what the declaration bought was quiet about
  // the scheduler, not exemption from being measured.
  if (!hasScheduler && !dormant) {
    return { state: 'no-scheduler', detail: `no ${SCHEDULER} — the repo has no cron, so nothing there will ever converge it` };
  }
  // An absent canon number is not a zero: a pack retired from canon has no manifest
  // to be behind, and comparing against a missing entry would report every member
  // that still stamps it.
  const gaps = [];
  if (installed.engineVersion !== null && canon.engineVersion !== null && versionAbove(canon.engineVersion, installed.engineVersion)) {
    gaps.push(`engine v${installed.engineVersion} → v${canon.engineVersion}`);
  }
  for (const id of packIds.sort()) {
    const here = installed.packVersions[id];
    const there = canon.packVersions[id];
    if (isVersion(here) && isVersion(there) && versionAbove(there, here)) {
      gaps.push(`${id} v${here} → v${there}`);
    }
  }
  if (gaps.length) return { state: 'behind', detail: `behind canon by ${gaps.join(', ')}` };
  return {
    state: FRESH,
    detail: `engine v${installed.engineVersion ?? '—'}, ${packIds.length} declared pack(s) at canon versions`,
  };
}

// --- canon's own version numbers ----------------------------------------------

// What a member is measured AGAINST, read out of canon over the API. Not out of this
// repo's checkout: the enforcer runs a vendored mount like any other member, so its
// own engine/version.mjs says what the ENFORCER received, which is a different
// question and can be older.
//
// Both numbers are extracted from source with an anchored line match rather than by
// importing the modules, because the sweep has no canon checkout to import from and
// the two literals are the whole payload. A file whose number cannot be read THROWS —
// the caller turns that into UNKNOWN for the member, which fails the run, and a
// guessed version would silently reclassify the fleet.
//
// Memoized per reader, promise and all: one reader is built per sweep and every
// member consults it, so canon is read once per distinct pack rather than once per
// member per pack.
const ENGINE_VERSION_RE = new RegExp(String.raw`^export const ENGINE_VERSION = '?(${VERSION_SOURCE})'?;$`, 'm');
const PACK_VERSION_RE = new RegExp(String.raw`^ {2}version: '?(${VERSION_SOURCE})'?,$`, 'm');

export function canonVersions(gh, canonRepo) {
  const packs = new Map();
  let engine = null;
  const source = async (path) => {
    const res = await gh(`/repos/${canonRepo}/contents/${encodeURI(path)}`);
    if (res.status === 404) return null;
    if (res.status !== 200 || typeof res.json?.content !== 'string') throw new Error(`${canonRepo}:${path} returned ${res.status}`);
    return Buffer.from(res.json.content, 'base64').toString('utf8');
  };
  return {
    engine() {
      engine ??= (async () => {
        const text = await source('engine/version.mjs');
        const m = text && ENGINE_VERSION_RE.exec(text);
        if (!m) throw new Error(`canon ${canonRepo} has no readable ENGINE_VERSION in engine/version.mjs`);
        return versionFromLiteral(m[1]);
      })();
      return engine;
    },
    // null when canon carries no such pack — a pack the member still stamps but canon
    // has retired. Distinct from a manifest that is there and unreadable, which throws.
    pack(id) {
      if (!packs.has(id)) {
        packs.set(id, (async () => {
          const text = await source(`packs/${id}/pack.mjs`);
          if (text === null) return null;
          const m = PACK_VERSION_RE.exec(text);
          if (!m) throw new Error(`canon ${canonRepo} has no readable version in packs/${id}/pack.mjs`);
          return versionFromLiteral(m[1]);
        })());
      }
      return packs.get(id);
    },
  };
}

// --- the per-member mount probe -----------------------------------------------

// The reads this half adds on top of the declaration the roster walk already made:
// the scheduler workflow's presence, canon's view of the stamped ref, and canon's
// version numbers for the packs this member stamps. It is handed the declaration
// rather than re-reading it, which is the whole point of the merge — the coverage half
// needed the same file, and a member was being read twice.
//
// `canon` is the shared reader built once per sweep, so the per-member cost of the
// version half is bounded by how many packs this member declares that no earlier
// member did — usually none.
//
// Throws on anything indeterminate; the caller turns that into UNKNOWN for this half
// alone. A member whose mount cannot be probed is still one whose declaration was read,
// so the coverage half keeps its verdict.
export async function probeMount(gh, fullName, declaration, { canon }) {
  const wf = await gh(`/repos/${fullName}/contents/${SCHEDULER}`);
  if (wf.status !== 200 && wf.status !== 404) throw new Error(`${SCHEDULER} check returned ${wf.status}`);
  const hasScheduler = wf.status === 200;

  // Wherever this member spells them: the current shape, with the retired block read
  // underneath for one that has not run the #1252 record yet.
  const installed = installedVersions(declaration);
  const canonAt = { engineVersion: null, packVersions: {} };
  if (installed.engineVersion !== null || Object.keys(installed.packVersions).length > 0) {
    canonAt.engineVersion = await canon.engine();
    for (const id of Object.keys(installed.packVersions)) {
      const there = await canon.pack(id);
      if (there !== null) canonAt.packVersions[id] = there;
    }
  }
  return { hasScheduler, installed, canon: canonAt };
}

// --- the freshness section of the report (pure) -------------------------------

// Enumerates the FULL fleet: every repo lands in exactly one list — fresh (with how
// fresh), unhealthy (with its root cause), dormant, out of scope (with why), unknown —
// plus the two repos this half never measures, named rather than silently absent. A
// report that names only the failures leaves the reader unable to tell "fresh" from
// "fell out of the report". Kept free of I/O so the full-roster property is testable
// directly. `fresh` is `[{ fullName, detail }]`; `outOfScope` entries carry their
// reason inline.
export function renderFreshnessSummary({
  owner, home, canonRepo, canonBranch, fresh, unhealthy, dormant, outOfScope, unknown,
}) {
  const notMeasured = [`\`${home}\` — the enforcer, swept by its own scheduler`];
  if (canonRepo.toLowerCase() !== home.toLowerCase()) notMeasured.push(`\`${canonRepo}\` — canon, with no vendored mount to be stale`);
  return [
    `# Fleet freshness sweep — ${owner} (measured by stamped versions against canon: ${canonRepo}@${canonBranch})`,
    '',
    '| fresh | behind | no scheduler | no stamp | dormant | out of scope | unknown |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${fresh.length} | ${unhealthy.filter((u) => u.state === 'behind').length} | `
      + `${unhealthy.filter((u) => u.state === 'no-scheduler').length} | `
      + `${unhealthy.filter((u) => u.state === 'no-stamp').length} | `
      + `${dormant.length} | ${outOfScope.length} | ${unknown.length} |`,
    '',
    unhealthy.length
      ? `**Behind:**\n${unhealthy.map((u) => `- \`${u.fullName}\` — **${u.state}**: ${u.detail}`
        + `${u.dormant ? ' — dormant, so nothing there will converge this on its own' : ''}`).join('\n')}`
      : '**Every covered member is up to date 🎉**',
    fresh.length
      ? `**Fresh:**\n${fresh.map((f) => `- \`${f.fullName}\` — ${f.detail}`).join('\n')}`
      : '**Fresh:** none',
    dormant.length ? `**Dormant (scheduler stopped by declaration — measured like any other member, but will not self-heal):** ${dormant.join(', ')}` : '',
    outOfScope.length ? `**Out of scope (not covered members):** ${outOfScope.join(', ')}` : '',
    unknown.length ? `**UNKNOWN (probe errored — fix the token/scope):** ${unknown.join('; ')}` : '',
    `**Not measured:** ${notMeasured.join('; ')}`,
  ].filter(Boolean).join('\n');
}
