// The fleet-digest knobs — the reader for the `digest` block on the enforcer's
// `sheepdog` pack entry config.
//
// It deliberately does NOT re-parse what fleet-config.mjs already owns (owner,
// exclude, canonRepo, packSeeds). The digest reads those through that
// module; this one covers only the block that is the digest's alone, which is why it
// lives in the task folder rather than beside fleet-config.mjs:
//
//   { "id": "sheepdog", "config": { "digest": {
//       "pick":  4,                       // how many accomplishments the brief names
//       "nudge": { "enabled": true, "quietDays": 7 }
//   } } }
//
// TWO KEYS, AND NOTHING ABOUT DELIVERY. The task finishes at a written report; an
// ad-hoc session reads that file out later in the day and its own notification
// mechanism carries it. So there is no recipient, no sender and no transport to
// configure here — a knob for any of them would describe machinery this repo does
// not own.
//
// Both keys default, and an absent `digest` block is a valid one — a fleet that
// configures nothing still gets its dated file. That is the same stance fleet-config
// takes on its own optional knobs, and it is what lets this pack keep being adopted
// without an interview, and every existing enforcer config keep working untouched.

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

// Parse the `digest` block off an already-parsed `.claudinite-checks.json`. Pure —
// no I/O, no defaults read from the environment — so the task and its tests see
// exactly the same resolution.
export function parseDigestConfig(cfg) {
  const entry = (Array.isArray(cfg?.packs) ? cfg.packs : []).find((e) => e?.id === 'sheepdog');
  const raw = entry?.config?.digest;
  const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  const pick = positiveInt(d.pick, DEFAULT_PICK, MAX_PICK);

  return {
    pick,
    // Derived, never configured directly: the overfetch is a property of how the task
    // works (give the agent a real choice), not a knob a fleet has an opinion about.
    shortlist: Math.ceil(pick * OVERFETCH),
    nudge: parseNudge(d.nudge),
  };
}
