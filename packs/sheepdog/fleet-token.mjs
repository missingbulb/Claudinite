// The one statement of what `FLEET_GITHUB_TOKEN` must be able to do.
//
// The sweeps share a credential but not their needs: the census reads declarations,
// the seed sweep writes one, the fan-out tasks dispatch a member's workflow, the
// digest walks closed pull requests. Each used to spell its own subset into its own
// "token is not set" message — six lists, no two alike, and no single place holding
// the union. Nothing in the machinery held it either: `required_secrets` carries a
// NAME, so those strings were the only machine-readable statement of the requirement,
// and a session assembling an adopting repo's handover from them landed the union of
// the subsets it happened to read.
//
// That is how a fleet ends up one permission short. Pull requests is the row only the
// digest needs, and a fine-grained PAT reads a PUBLIC repo's pull requests without it —
// so an enforcer over public members runs green for months and breaks on the day
// somebody adds a private repo, as a bare 403 a hundred requests into a sweep.
//
// GRANTING IS ONE ACT, so every audience here is told the WHOLE list: the not-set
// error a sweep throws, the handover step the install flow prints at adoption
// (pack.mjs), and RULES.md, which points here rather than restating it. A caller's own
// subset is never the answer — the person at the token settings page is granting once,
// for the pack.
export const FLEET_TOKEN = 'FLEET_GITHUB_TOKEN';

// One row per repository permission the PAT must carry. `why` names the sweep that
// forces it, because a row nobody can attribute is a row the next reader trims.
export const FLEET_TOKEN_PERMISSIONS = [
  {
    permission: 'Metadata',
    level: 'read',
    why: 'every sweep enumerates the owner\'s repositories',
  },
  {
    permission: 'Contents',
    level: 'read and write',
    why: 'read: every sweep reads each member\'s declaration; write: the pack-seed sweep lands one declaration in each member',
  },
  {
    permission: 'Issues',
    level: 'read and write',
    why: 'the roster sweep converges an issue per finding, and the fan-out tasks file a work list in each member',
  },
  {
    permission: 'Pull requests',
    level: 'read',
    why: 'the digest walks every member\'s closed pull requests, and a private member\'s are unreadable without it',
  },
  {
    permission: 'Actions',
    level: 'read and write',
    why: 'the two fan-out tasks dispatch another member\'s workflow',
  },
];

// The grant as one line — "Metadata read, Contents read and write, …". What a person
// ticks boxes against.
export const fleetTokenGrant = () => FLEET_TOKEN_PERMISSIONS
  .map(({ permission, level }) => `${permission} ${level}`)
  .join(', ');

// The same grant with each row's reason, for the places that have room for it.
export const fleetTokenGrantDetail = () => FLEET_TOKEN_PERMISSIONS
  .map(({ permission, level, why }) => `${permission} ${level} — ${why}`);

// The token, or a throw that says exactly what to grant. Every sweep's entry point
// calls this instead of testing the variable itself, which is what keeps the six
// messages from drifting apart again.
export function requireFleetToken(env = process.env) {
  const token = env[FLEET_TOKEN];
  if (token) return token;
  throw new Error(`${FLEET_TOKEN} is not set. Add a repo secret holding a fine-grained PAT `
    + `over this account's repositories, granting ALL of: ${fleetTokenGrant()} — `
    + 'the default GITHUB_TOKEN sees only this repo and cannot reach the fleet.');
}
