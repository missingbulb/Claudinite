// A PACK'S CONTENT IS DELIVERED ON ITS VERSION NUMBER, and on nothing else. The
// engine tree vendors wholesale on every converge; a pack's directory ships only
// where `planPackUpdates` sees `installed.packVersions[id] < pack.version`. So a
// canon commit that edits `packs/<id>/` without moving that number reaches no member —
// the fleet keeps the old bytes while the canon believes the change shipped (#939
// froze seven repos for five days that way), and two changes landing under ONE
// number strand whichever members converged between them (#1482).
//
// So the number is not the pull request's to move. It is read off `main` after the
// fact: this module walks a pack's history on the base branch, finds the commit that
// last moved its version, and asks whether any SHIPPING byte under `packs/<id>/` has
// changed since. Every such pack takes the next version cut today, in one commit,
// from one writer — which is what makes a collision impossible rather than merely
// checked for. The same walk, read the other way round, says which pull requests each
// version carried, which is what the version-history rows are made of.
//
// Both readers are here so the two tasks that need them — the bump on every push to
// main, and the weekly history — cannot disagree about what a bump or a shipping file
// is. Pure over a `git` runner the caller hands in, so the tests drive them against a
// scratch repository and the workers against the real one.

import { LOCAL_PACKS_SUBDIR } from '../../engine/pack_loader/pack-registry.mjs';
import {
  VERSION_SOURCE, versionFromLiteral, compareVersions, versionsEqual, nextVersion, versionAbove,
} from '../../engine/version.mjs';

// The pack-shelf root the engine reads a canon's packs from, and the one tree this
// module ever looks at. A repo's OWN packs are neither versioned nor vendored, so
// nothing about them is a delivery question.
export const SHELF = 'packs';
const LOCAL_ROOT = `${LOCAL_PACKS_SUBDIR}/`;

// Each pack's version-history record, next to its manifest.
export const VERSIONS_FILENAME = 'VERSIONS.md';

// The task that writes bump commits, named where the commit is stamped and where the
// history reads the stamp back: a bump commit moves only version numbers, so it is
// never something a version "shipped".
export const BUMP_TASK = 'claudinite-canon-curation/pack-version-bump';

// Does this path ride a pack's directory copy to a member? A pack's tests sit beside
// the files they cover and are the one thing in that directory no vendor set carries
// (compute-vendor-set drops `*.test.mjs`), so nobody is waiting on them. `VERSIONS.md`
// is the record OF versions, not content a version ships, so a row landing must never
// itself demand another version.
export function isShippingFile(path) {
  if (path.startsWith(LOCAL_ROOT)) return false;
  if (path.endsWith('.test.mjs') || path.endsWith(`/${VERSIONS_FILENAME}`)) return false;
  return /^packs\/[^/]+\//.test(path);
}

// The pack id a shipping path belongs to, or null.
export function packOf(path) {
  const m = /^packs\/([^/]+)\//.exec(path);
  return m ? m[1] : null;
}

// The `version:` a pack manifest declares, or null when it declares none (a manifest
// absent on one side of the history, or one the schema check owns). The preceding
// character class is what keeps `minEngineVersion:` out of it.
const PACK_VERSION_RE = new RegExp(String.raw`(?:^|[\s{,])version:\s*'?(${VERSION_SOURCE})'?`, 'm');
export function declaredPackVersion(text) {
  const m = PACK_VERSION_RE.exec(text ?? '');
  return m ? versionFromLiteral(m[1]) : null;
}

// The manifest text with its `version:` literal replaced — and nothing else moved,
// so the commit that bumps a pack is a one-line diff on a file people edit by hand.
export function withPackVersion(text, version) {
  return text.replace(PACK_VERSION_RE, (whole, old) => whole.replace(old, String(version)));
}

// --- reading the shelf --------------------------------------------------------

// The pack ids whose manifest exists at `ref`, from the tree rather than the
// working directory: the checkout may be sitting on another task's branch.
export function shelfPacks(git, ref) {
  const paths = git(['ls-tree', '--name-only', '-r', ref, `${SHELF}/`]).split('\n');
  return paths.map((p) => /^packs\/([^/]+)\/pack\.mjs$/.exec(p)?.[1]).filter(Boolean).sort();
}

export function fileAt(git, ref, path) {
  try { return git(['show', `${ref}:${path}`]); } catch { return null; }
}

// Every commit on the base branch's first-parent line that MOVED this pack's version
// — the commit's own manifest declares a version its first parent did not — newest
// first, each as `{ sha, version, date }` (`date` the committer date, `YYYY-MM-DD`).
// A pack's first commit counts: its first version shipped to everyone. Every squash
// merge is a first-parent commit, so `--first-parent` reads the branch as it was
// landed and never wanders into a merged branch's own history.
export function bumpCommits(git, ref, id) {
  const manifest = `${SHELF}/${id}/pack.mjs`;
  const lines = git(['log', '--first-parent', '--format=%H %cs', ref, '--', manifest]).split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    const [sha, date] = line.split(' ');
    const here = declaredPackVersion(fileAt(git, sha, manifest));
    if (here === null) continue;
    const before = declaredPackVersion(fileAt(git, `${sha}^`, manifest));
    if (before === null || !versionsEqual(here, before)) out.push({ sha, version: here, date });
  }
  return out;
}

// The shipping paths under `packs/<id>/` that differ between two commits.
export function shippingChanges(git, from, to, id) {
  return git(['diff', '--name-only', from, to, '--', `${SHELF}/${id}/`])
    .split('\n').filter((p) => p && isShippingFile(p));
}

// --- the bump -----------------------------------------------------------------

// Which packs at `ref` need a new version, and which: every pack with a shipping
// change since the commit that last moved its number takes the next version cut
// `today`. A pack that has never declared a version is not this module's to start.
export function planBumps(git, ref, { today = new Date() } = {}) {
  const bumps = [];
  for (const id of shelfPacks(git, ref)) {
    const manifest = `${SHELF}/${id}/pack.mjs`;
    const text = fileAt(git, ref, manifest);
    const current = declaredPackVersion(text);
    if (current === null) continue;
    const [last] = bumpCommits(git, ref, id);
    if (!last) continue;
    const changed = shippingChanges(git, last.sha, ref, id);
    if (!changed.length) continue;
    const next = nextVersion(current, today);
    // The clock is the one input the walk cannot verify: a manifest already carrying
    // a version above today's would be LOWERED, and every member would read that as
    // "already up to date" (engine/version.mjs). Refuse rather than write it.
    if (!versionAbove(next, current)) {
      throw new Error(`${manifest} declares ${current}, above the next version today would cut (${next}) — the version or the clock is wrong`);
    }
    bumps.push({ id, from: current, to: next, changed, manifest, text: withPackVersion(text, next) });
  }
  return bumps;
}

// The one-line subject of the bump commit — the whole message is the subject plus the
// task trailer the caller appends.
export const bumpSubject = (bumps) => `Bump pack versions: ${bumps.map((b) => `${b.id} ${b.to}`).join(', ')}`;

// --- the history --------------------------------------------------------------

// A row of a pack's VERSIONS.md is a table row whose first cell is the bare version,
// the same shape `engine/RELEASES.md` rows use, so the record reads as a table a
// human can also write into.
const ROW_RE = new RegExp(String.raw`^\|\s*(${VERSION_SOURCE})\s*\|(.*)$`);

// Every row a record's text carries, as `{ version, line }` with the row's full text.
export function rowVersions(text) {
  const rows = [];
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim();
    const m = ROW_RE.exec(line);
    if (m) rows.push({ version: versionFromLiteral(m[1]), line });
  }
  return rows;
}

// A squash-merged pull request's number, read off its subject (`Title (#123)`).
export function pullNumber(subject) {
  const m = /\(#(\d+)\)\s*$/.exec(subject ?? '');
  return m ? Number(m[1]) : null;
}

// The commits that shipped under each version: for every bump commit, the first-parent
// commits after the previous bump up to and including it that touched a shipping file
// of the pack, minus the bump task's own commits (they move numbers, not content).
// Oldest version first, each `{ version, date, commits: [{ sha, subject, pr }] }`.
export function versionHistory(git, ref, id) {
  const bumps = bumpCommits(git, ref, id).reverse();
  const out = [];
  for (let i = 0; i < bumps.length; i += 1) {
    const range = i === 0 ? bumps[i].sha : `${bumps[i - 1].sha}..${bumps[i].sha}`;
    // Per commit: sha, subject, the task trailer's value, then `--name-only`'s paths.
    const raw = git(['log', '--first-parent', '--name-only',
      '--format=%x01%H%x00%s%x00%(trailers:key=Claudinite-Task,valueonly)%x00', range, '--', `${SHELF}/${id}/`]);
    const commits = [];
    for (const block of raw.split('\u0001').filter(Boolean)) {
      const [sha, subject, task, rest] = block.split('\u0000');
      if ((task ?? '').trim() === BUMP_TASK) continue;
      if (!(rest ?? '').split('\n').some((p) => isShippingFile(p.trim()))) continue;
      commits.push({ sha, subject, pr: pullNumber(subject) });
    }
    out.push({ version: bumps[i].version, date: bumps[i].date, commits: commits.reverse() });
  }
  return out;
}

// One generated row: the pull requests the version shipped, oldest first, each as its
// subject — which on a squash merge is the pull request's title — so the number
// links wherever the file is read. A version whose only commit is its own bump
// (a member re-delivery, or a bump for a change git no longer attributes) says so.
export function renderRow({ version, date, commits }) {
  const what = commits.length
    ? commits.map((c) => c.subject.replace(/\|/g, '\\|')).join('; ')
    : '_no pull request is attributed to this version_';
  return `| ${version} | ${date} | ${what} |`;
}

const HEADER = (id) => [
  '# Version history',
  '',
  `Records for \`packs/${id}/pack.mjs\`'s \`version\` field, one row per version, newest first.`,
  'A version is cut on `main` after its changes land, so a row names the pull requests that',
  'landed between the previous version and this one; the weekly history task writes the rows',
  'a version is missing and leaves every row that already stands.',
  '',
  '| Version | Date | What changed |',
  '|---|---|---|',
];

// The record's text with a row for every version the history knows and the file
// does not. Existing rows stand as written — a hand-written row is a better record
// than a generated one — and the header is the module's, so every pack's record
// reads the same way.
export function renderHistory(id, existingText, history) {
  const existing = rowVersions(existingText);
  const rows = existing.map((r) => ({ version: r.version, line: r.line }));
  for (const entry of history) {
    if (existing.some((r) => versionsEqual(r.version, entry.version))) continue;
    rows.push({ version: entry.version, line: renderRow(entry) });
  }
  rows.sort((a, b) => compareVersions(b.version, a.version));
  return `${[...HEADER(id), ...rows.map((r) => r.line)].join('\n')}\n`;
}

// Which packs' records would change at `ref`, as `{ path: text }` — the caller
// delivers exactly these and opens nothing when the map is empty.
export function planHistory(git, ref) {
  const files = {};
  for (const id of shelfPacks(git, ref)) {
    const path = `${SHELF}/${id}/${VERSIONS_FILENAME}`;
    const before = fileAt(git, ref, path);
    const after = renderHistory(id, before, versionHistory(git, ref, id));
    if (after !== before) files[path] = after;
  }
  return files;
}
