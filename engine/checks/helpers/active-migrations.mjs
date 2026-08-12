import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// The synchronous migration-registry surface for the CHECK layer. It lives in
// the engine lib because pack checks consult it (`migrationActive` gates an
// in-flight transition's legacy tolerance) and a pack imports only its own files
// and the engine surface (pack-independence). Self-locating relative to the
// engine root, so in a vendored consumer — where a mount carries only the recent
// vendored records, or none — every query answers from what the mount actually
// holds. The full registry (engine/migrations/registry.mjs) builds on this same
// surface canon-side.
//
// TWO HOMES, ONE SHAPE. A record belongs to the flow that owns it: an engine
// migration lives at `engine/migrations/<landed-date>-<slug>/`, a pack's at
// `packs/<pack>/migrations/<landed-date>-<slug>/`, each with its spec at
// migration.mjs (docs/versioned-updates/DESIGN.md §3.7). Discovery walks both,
// so a caller never has to know which flow raised a record — and the split is
// what lets each flow fetch, and later version-range, only its own.
//
// All records are equal — there is no active/archived split and no cleanup pass;
// FETCHING decides relevance. Vendoring ships only the records landed within
// RECENT_WINDOW_DAYS, so an up-to-date consumer carries few-to-none, while a
// dormant project baselining out of a fresh canon clone sees them all and
// applies what it needs.
export const MIGRATION_FILE = 'migration.mjs';
export const RECENT_WINDOW_DAYS = 7;
export const MIGRATIONS_SUBDIR = 'migrations';

// <corpus>/engine/checks/helpers/ — the corpus root is this file's fourth parent:
// the canon repo root canon-side, the mount root (.claudinite/shared/) in a member.
const corpusRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

const isRecordDir = (name) => /^\d{4}-\d{2}-\d{2}-/.test(name);
const subdirs = (dir) => {
  try { return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); }
  catch { return []; }
};

// Every directory that may hold records, corpus-relative: the engine's own, and
// one per pack present. Derived from the tree rather than a list, so a pack that
// grows its first record needs no registration anywhere.
export function migrationRoots() {
  return [
    `engine/${MIGRATIONS_SUBDIR}`,
    ...subdirs(join(corpusRoot, 'packs')).sort().map((p) => `packs/${p}/${MIGRATIONS_SUBDIR}`),
  ];
}

// Every migration record present, as CORPUS-RELATIVE paths
// (`engine/migrations/2026-08-06-prework-rename`), sorted by landed date so the
// set reads chronologically across both homes. Tolerant of absent roots — a
// vendored consumer with no recent records, or a pack that has never needed one.
export function migrationDirs() {
  const found = [];
  for (const root of migrationRoots()) {
    for (const name of subdirs(join(corpusRoot, root))) {
      if (isRecordDir(name) && existsSync(join(corpusRoot, root, name, MIGRATION_FILE))) found.push(`${root}/${name}`);
    }
  }
  // By record name first — the landed-date prefix — so ordering is the canon's
  // history, not the alphabet of the directories the records happen to live in.
  return found.sort((a, b) => basename(a).localeCompare(basename(b)) || a.localeCompare(b));
}

// The record folder NAME of a discovered path — what the date prefix and the slug
// live on. Callers hold paths; every predicate below judges the name.
export const recordName = (dirOrPath) => basename(dirOrPath);

const todayIso = () => new Date().toISOString().slice(0, 10);

// True while a record folder's landed-date prefix is within the recency window —
// the same predicate vendoring uses to decide what ships in a consumer mount,
// so "recent enough to tolerate" and "recent enough to vendor" can never drift.
// Pure over the folder name (a bare name or a path ending in one), so vendoring
// can apply it against its own tree walk.
export function recordDirIsRecent(name, today = todayIso()) {
  const cutoff = new Date(`${today}T00:00:00Z`).getTime() - RECENT_WINDOW_DAYS * 86400000;
  const landedMs = new Date(`${recordName(name).slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(landedMs) && landedMs > cutoff;
}

// True while a migration whose folder name carries `slug` is present AND recent —
// a check consults it to know whether an in-flight transition's legacy shape is
// still tolerated. Recency bounds the tolerance on the canon (where every record
// stays forever) and in a stale mount alike: every up-to-date repo converges
// within the window, and a dormant one is converged by baselining's apply step
// BEFORE its checks run, so an aged record needs no tolerance anywhere.
export function migrationActive(slug, today = todayIso()) {
  return migrationDirs().some((d) => recordName(d).includes(slug) && recordDirIsRecent(d, today));
}
