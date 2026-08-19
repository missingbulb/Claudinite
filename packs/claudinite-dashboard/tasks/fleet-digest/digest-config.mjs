// The fleet-digest knobs — the reader for this task's slice of the member's
// `claudinite-dashboard` pack entry config.
//
//   { "id": "claudinite-dashboard", "config": {
//       "owner":   "an-owner",              // whose repos the brief covers
//       "exclude": ["an-owner/scratch"],    // repos deliberately kept out
//       "digest":  { "pick": 4, "nudge": { "enabled": true, "quietDays": 7 } }
//   } }
//
// EVERY KEY DEFAULTS, and `owner` defaults STRUCTURALLY — to the owner of the repo the
// task is running in, which is the only fleet a repo can be sure it belongs to. So a
// deployment that configures nothing still gets its dated file, covering its own
// owner's repos.
//
// THE SHEEPDOG FALLBACK IS DELIBERATE AND NAMED. This task lived in the `claudinite-fleet-sheepdog`
// pack until it moved here, and read `owner`/`exclude`/`digest` off THAT entry — an
// enforcer's declaration still carries them there. Rather than have a moved task
// silently start covering a different set of repos (an `exclude` list that stops being
// read is exactly the parameter that fails quietly), the reader falls back to the
// claudinite-fleet-sheepdog entry when this pack's entry does not carry the key, and SAYS which one it
// used. It is a read of a JSON key that may not exist, never an import: the two packs
// stay independent and either can be adopted without the other.
//
// TWO KNOBS, AND NOTHING ABOUT DELIVERY. The task finishes at a written report; an
// ad-hoc session reads that file out later in the day and its own notification
// mechanism carries it. So there is no recipient, no sender and no transport to
// configure here — a knob for any of them would describe machinery this repo does not
// own.

// How many accomplishments the brief names. Four is the number the hand-run routine
// this task replaced settled on: enough that a busy day is represented, few enough
// that the brief stays skimmable.
export const DEFAULT_PICK = 4;

// How much MORE than `pick` the shortlist carries. The agent's judgment is the point
// of the task — handing it exactly `pick` candidates would leave it nothing to judge,
// since the deterministic size ranking would have made every choice already. Half
// again gives it a real choice (6 for the default 4) while keeping the read bounded.
export const OVERFETCH = 1.5;

// How long a project must have gone without a MEANINGFUL change before the brief
// prods about it. A week is the framing the routine used ("no meaningful changes in
// the last week"); a fleet whose projects legitimately idle longer raises it rather
// than living with a nudge that fires on everything.
export const DEFAULT_QUIET_DAYS = 7;

// Bound `pick` at both ends. The brief is a brief: a `pick` of 40 is not a
// configuration, it is a mistake that would dispatch an agent to read forty PRs.
const MAX_PICK = 10;

const positiveInt = (v, fallback, max) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
};

// The nudge — "prod me about a project I have not touched" — is a whole FEATURE of
// the brief, not a formatting detail, so it is switchable as one:
//
//   absent            → on, at the default window (the useful default)
//   false             → off entirely; the brief carries accomplishments only
//   true              → on, at the default window
//   { quietDays: 14 } → on, at that window
//   { enabled: false } → off (the long form of `false`)
//
// Both spellings of off exist because both get written: `"nudge": false` is what
// someone reaches for when switching it off, and `{ "enabled": false }` is what they
// reach for when they already have a `quietDays` they want to keep.
export function parseNudge(raw) {
  if (raw === false) return { enabled: false, quietDays: DEFAULT_QUIET_DAYS };
  if (raw === true || raw === undefined || raw === null) {
    return { enabled: true, quietDays: DEFAULT_QUIET_DAYS };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    // A number, a string, anything else: unreadable, so fall back to the default
    // rather than guessing which half of it was meant.
    return { enabled: true, quietDays: DEFAULT_QUIET_DAYS };
  }
  return {
    enabled: raw.enabled !== false,
    quietDays: positiveInt(raw.quietDays, DEFAULT_QUIET_DAYS, 365),
  };
}

import { canonicalPackId } from '../../../../engine/pack_loader/renamed-packs.mjs';

// The entry a pack id names on an already-parsed `.claudinite-checks.json`. Matched
// through the engine's rename map, so an enforcer whose declaration still spells a
// pack the way it was written keeps the config it wrote.
const entryConfig = (cfg, id) => (Array.isArray(cfg?.packs) ? cfg.packs : [])
  .find((e) => typeof e?.id === 'string' && canonicalPackId(e.id) === id)?.config ?? null;

// Parse this task's whole configuration off an already-parsed `.claudinite-checks.json`.
// Pure — no I/O, no environment — so the task and its tests see exactly the same
// resolution. `home` is the repo the task runs in, which is where a `owner` nobody
// configured comes from.
//
// `source` reports where each fleet key was actually read from, so a run's log can say
// "covering an-owner, excluding 2 repos (from the claudinite-fleet-sheepdog entry)" rather than leaving
// a reader to guess which declaration won.
export function parseDigestConfig(cfg, home = '') {
  const mine = entryConfig(cfg, 'claudinite-dashboard');
  const legacy = entryConfig(cfg, 'claudinite-fleet-sheepdog');

  const raw = [mine?.digest, legacy?.digest].find((d) => d && typeof d === 'object' && !Array.isArray(d));
  const d = raw ?? {};

  const pick = positiveInt(d.pick, DEFAULT_PICK, MAX_PICK);

  const ownerFrom = typeof mine?.owner === 'string' ? 'entry'
    : typeof legacy?.owner === 'string' ? 'claudinite-fleet-sheepdog' : 'repo';
  const owner = String(
    ownerFrom === 'entry' ? mine.owner
      : ownerFrom === 'claudinite-fleet-sheepdog' ? legacy.owner
        : String(home).split('/')[0],
  ).toLowerCase();

  const excludeFrom = Array.isArray(mine?.exclude) ? 'entry'
    : Array.isArray(legacy?.exclude) ? 'claudinite-fleet-sheepdog' : 'none';
  const excludeList = excludeFrom === 'entry' ? mine.exclude : excludeFrom === 'claudinite-fleet-sheepdog' ? legacy.exclude : [];
  const exclude = new Set(excludeList.map((x) => String(x).toLowerCase()));

  return {
    owner,
    exclude,
    pick,
    // Derived, never configured directly: the overfetch is a property of how the task
    // works (give the agent a real choice), not a knob a fleet has an opinion about.
    shortlist: Math.ceil(pick * OVERFETCH),
    nudge: parseNudge(d.nudge),
    source: { owner: ownerFrom, exclude: excludeFrom, digest: mine?.digest ? 'entry' : (legacy?.digest ? 'claudinite-fleet-sheepdog' : 'default') },
  };
}
