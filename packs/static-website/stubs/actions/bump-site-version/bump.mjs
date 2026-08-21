#!/usr/bin/env node
// The DATE-ANCHORED version bump: `<major>.<ymmdd>.<n>` (released as tag
// `v<major>.<ymmdd>.<n>`). Vendored into each static-site repo's own
// .github/actions/, run by the release pipeline; dependency-free (node:
// built-ins only) so it runs on a bare runner with no npm ci.
//
// THE SCHEME
//   major  the wrap counter — see below. Raised by hand only for a deliberate
//          "this is a new generation of the site" statement, and by this script
//          only on the decade wrap.
//   ymmdd  the last digit of the UTC year, then MM then DD: 2026-12-31 -> 61231,
//          2027-01-01 -> 70101. The bare MMDD form this replaces is NOT
//          monotonic across a year boundary — 1.1231.3 sorts ABOVE the next
//          day's 1.0101.1 — and every consumer of a version (a store, a
//          changelog, a human) reads it as "later means bigger". The year digit
//          restores that: 1.61231.3 -> 1.70101.1.
//   n      the day's release counter: 1 for the day's first release, the
//          previous release's n + 1 for every further release the SAME day.
//          It resets with the day rather than growing forever, so the number
//          answers "how many times did we ship today", which is the only
//          question it is asked.
//
// THE DECADE WRAP. ymmdd carries one year digit, so 2029-12-31 (91231) is
// followed by 2030-01-01 (00101) — the one legitimate DECREASE. The major
// absorbs it: the wrap bumps major, so 1.91231.4 -> 2.00101.1 and the ordering
// holds forever. Any other decrease (a version dated in the future — a hand
// edit, a broken clock) is an error, not a wrap: bumping the major there would
// paper over a real problem and burn a major on it.
//
// WRITING. Each version file is rewritten in place. A `.json` file has its
// `"version": "<old>"` token replaced (which must appear exactly once), so the
// formatting survives and the diff is one line; any other file is treated as a
// bare version file whose whole content is the version. Every file is read and
// validated BEFORE any is written, so a failure never leaves a half-bumped tree.
//
// WHO RUNS IT. The routine bump belongs to the CHANGE, not to the pipeline: a
// PR that touches the published site raises the version in the same PR (the
// pack's `sw/version-bumped` check holds that line), and the release flow ships
// whatever version it finds on main. The pipeline runs this only for the
// deliberate `--major` generation bump, dispatched by hand.
//
// Args: [--major] [--print] <version_file> [<version_file> ...] (repo-relative;
// the repo's `version_files` config). Prints the version and writes it to
// GITHUB_OUTPUT as `version`; `--print` reads the current one instead of
// raising it.

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// `<major>.<ymmdd>.<n>` — major and n unbounded, ymmdd exactly five digits.
export const VERSION_RE = /^(\d+)\.(\d{5})\.(\d+)$/;

// The UTC ymmdd for a date: last digit of the year, then MMDD. UTC because a
// runner's local zone is not the repo's, and a version must not depend on which
// region the job landed in.
export function ymmdd(date) {
  const y = date.getUTCFullYear() % 10;
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export class BumpError extends Error {}

// The scheme's ORDERING, which is the whole point of the year digit: -1/0/1 for
// a < b / a == b / a > b, comparing major, then ymmdd, then the day counter,
// each numerically. Lives here beside the scheme rather than beside either of
// its callers — the pack's `sw/version-bumped` check asks whether a change
// raised the version, and the release flow asks whether main is ahead of the
// latest release. An off-scheme version has no place in the ordering at all.
export function compare(a, b) {
  const parse = (v) => {
    const m = VERSION_RE.exec(v ?? '');
    if (!m) throw new BumpError(`version '${v}' is not <major>.<ymmdd>.<n> (e.g. 1.61231.3)`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

// The next version after `current`, released `now`. Pure — the caller supplies
// the clock, so this is testable without one.
//
// `major: true` is the DELIBERATE generation bump — "this is a new site" — and is
// the one thing about the scheme a human chooses rather than computes. It raises
// the major and restarts the day counter at today, so it is strictly greater than
// what it replaces no matter which of the branches below would otherwise apply.
export function nextVersion(current, now, { major: raiseMajor = false } = {}) {
  const m = VERSION_RE.exec(current ?? '');
  if (!m) {
    throw new BumpError(`current version '${current}' is not <major>.<ymmdd>.<n> (e.g. 1.61231.3)`);
  }
  const [, major, curDay, n] = m;
  const today = ymmdd(now);

  if (raiseMajor) return `${Number(major) + 1}.${today}.1`;
  if (today === curDay) return `${major}.${today}.${Number(n) + 1}`;
  if (Number(today) > Number(curDay)) return `${major}.${today}.1`;

  // A decrease. The decade wrap (…9xxxx -> …0xxxx) is the one legitimate one,
  // and the major exists to absorb it.
  if (curDay[0] === '9' && today[0] === '0') return `${Number(major) + 1}.${today}.1`;

  throw new BumpError(
    `current version '${current}' is dated ${curDay}, ahead of today (${today}) — refusing to bump. ` +
    'A version from the future means a hand edit or a wrong clock, not a decade wrap.'
  );
}

// Rewrite one version file's content. Returns the new text.
export function rewrite(path, text, current, next) {
  if (path.endsWith('.json')) {
    const oldToken = `"version": "${current}"`;
    const occurrences = text.split(oldToken).length - 1;
    if (occurrences !== 1) {
      throw new BumpError(
        `expected exactly one ${oldToken} in ${path}, found ${occurrences} — every version record must carry the same version before a bump`
      );
    }
    return text.replace(oldToken, `"version": "${next}"`);
  }
  if (text.trim() !== current) {
    throw new BumpError(`${path} holds '${text.trim()}', not the current version '${current}' — the version records disagree`);
  }
  return `${next}\n`;
}

// Read the current version out of a version file (the first file listed is the
// source of truth; the rest must agree, which `rewrite` enforces).
export function readVersion(path, text) {
  if (!path.endsWith('.json')) return text.trim();
  const m = /"version":\s*"([^"]+)"/.exec(text);
  if (!m) throw new BumpError(`${path} carries no "version" field`);
  return m[1];
}

export function bump(files, now, { read = (f) => readFileSync(f, 'utf8'), write = writeFileSync, major = false } = {}) {
  if (!files.length) throw new BumpError('usage: bump.mjs [--major] [--print] <version_file> [<version_file> ...]');
  const texts = files.map((f) => [f, read(f)]);
  const current = readVersion(texts[0][0], texts[0][1]);
  const next = nextVersion(current, now, { major });
  // Validate every file first; only then write, so a mid-run failure can't leave
  // the version records disagreeing.
  const writes = texts.map(([f, text]) => [f, rewrite(f, text, current, next)]);
  for (const [f, text] of writes) write(f, text);
  return next;
}

// `--print` reads the version instead of raising it, and exists so nothing else
// has to know how a version record is shaped: the release pipeline needs the
// version currently on `main` to decide whether it has been released yet, and
// asking the script that writes the version is what keeps that knowledge in one
// place. `--major` is the deliberate generation bump.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const argv = process.argv.slice(2);
    const major = argv.includes('--major');
    const print = argv.includes('--print');
    const files = argv.filter((a) => !a.startsWith('--'));
    if (!files.length) throw new BumpError('usage: bump.mjs [--major] [--print] <version_file> [<version_file> ...]');
    const version = print
      ? readVersion(files[0], readFileSync(files[0], 'utf8'))
      : bump(files, new Date(), { major });
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
    console.log(version);
  } catch (err) {
    console.error(`bump-site-version: ${err.message}`);
    process.exit(1);
  }
}
