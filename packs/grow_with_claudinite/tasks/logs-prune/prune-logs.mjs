// What the retention prune would delete from the `conversation-logs` branch, as a
// pure function of the branch's file listing — no git, no clock of its own.
// worker.mjs is the I/O shell around this.
//
// TWO conditions, never one. A capture is deletable when it is BOTH past
// `retention_days` AND marked processed by an extract run. Age alone is what this
// task must never act on: the extract run is the only thing that ever reads a log,
// so pruning on the calendar would delete conversations nobody mined. Age is
// arithmetic this task owns; consumption is a fact only the extract run knows, and
// it says so by writing the marker.
//
// THE MARKER IS A SIDECAR FILE, `<log>.processed` beside the log it is about.
// The alternatives were a `processed/` prefix and a manifest: the prefix moves the
// captures into a subdirectory, where the two existing readers of this branch (the
// `conversationLogs` signal collector and the usage fold, both of which list the
// tree non-recursively and match the capture filename) stop seeing them and start
// under-reporting; a manifest is one file every extract run rewrites, which is the
// one shape an agent can clobber. A sidecar is additive, flat, one write per log,
// and invisible to both existing parsers — their patterns anchor on `.jsonl`.

import { parseLogFilename } from '../../capture-log.mjs';

// The parse comes from the pack's own capture step — its sibling two directories
// up, always vendored with this task — rather than a fourth copy of the filename
// format guarded against drift.

export const MARKER_SUFFIX = '.processed';
export const markerFor = (log) => `${log}${MARKER_SUFFIX}`;

export const ageDays = (capturedAt, now) => (Date.parse(now) - Date.parse(capturedAt)) / 86400000;

// Plan one prune over `names` (the branch's flat file listing) at `now`.
//
//   delete  — paths to remove: each deletable capture with its marker, plus any
//             marker whose capture is already gone (otherwise it outlives what it
//             was about, and nothing else would ever remove it).
//   holding — captures past retention that carry NO marker: the count this task
//             is deliberately not acting on. Reported rather than silent, because
//             a repo whose extract stopped running looks identical to a quiet one
//             from inside this worker.
//
// A retention that is not a positive number means the prune is off for this repo
// (unset = capture-only adoption, the fail-safe default) — nothing is deletable.
export function planPrune({ names, retentionDays, now }) {
  const present = new Set(names);
  const logs = names
    .map((name) => ({ name, parsed: parseLogFilename(name) }))
    .filter((f) => f.parsed !== null);

  const off = !(typeof retentionDays === 'number' && retentionDays > 0);
  const aged = off ? [] : logs.filter((f) => ageDays(f.parsed.capturedAt, now) > retentionDays);

  const del = [];
  const holding = [];
  for (const f of aged) {
    if (present.has(markerFor(f.name))) del.push(f.name, markerFor(f.name));
    else holding.push(f.name);
  }

  // An orphan marker: its capture was pruned (or never existed). Independent of
  // retention — the marker carries no stamp of its own to age, and there is
  // nothing left for it to mark.
  const orphans = names.filter((n) => n.endsWith(MARKER_SUFFIX)
    && !present.has(n.slice(0, -MARKER_SUFFIX.length))
    && parseLogFilename(n.slice(0, -MARKER_SUFFIX.length)) !== null);

  return { delete: [...del, ...orphans], holding, logCount: logs.length, off };
}
