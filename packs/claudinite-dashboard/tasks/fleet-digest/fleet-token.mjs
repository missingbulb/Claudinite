// The one statement of what `FLEET_GITHUB_TOKEN` must be granted for THIS pack's
// digest. The missing-secret message, the adoption handover step a human acts on and
// the hint a 403 carries all render from the table below — nothing spells a permission
// anywhere else in this pack.
//
// WHY A TABLE AND NOT A SENTENCE. The requirement is per-read, and the per-read
// subsets are not the answer: a person grants the token once. Writing each read's own
// needs where that read lives is how the claudinite-fleet-sheepdog pack ended up stating five different
// subsets, none of them the grant, and how a fleet ran two days without
// `Pull requests: read` — the permission only this digest needs, and only once a
// member is PRIVATE, because a fine-grained PAT reads a public repo's pull requests
// without it (#1030).
//
// WHY A SECOND COPY. The claudinite-fleet-sheepdog pack states its own sweeps' grant in
// `packs/claudinite-fleet-sheepdog/fleet-token.mjs`, for the same reason `fleet-reads.mjs` beside this
// file duplicates that pack's REST primitives: the two packs are adopted
// independently, and a pack that imports another pack's module is a dependency between
// them. The two tables are NOT the same requirement — this pack reads, that one also
// writes and dispatches — so there is nothing here for them to drift on. A repo
// declaring both grants the union, which is what the shared-secret note below says.

export const FLEET_TOKEN = 'FLEET_GITHUB_TOKEN';

// One row per fine-grained-PAT permission the collector's reads need. `endpoints` is
// how a 403 is attributed back to a permission.
export const FLEET_TOKEN_PERMISSIONS = [
  {
    permission: 'Metadata',
    access: 'read',
    why: 'the collector enumerates every repository under the owner before it reads anything',
    endpoints: [/^\/user\/repos/, /^\/repos\/[^/]+\/[^/]+(\?|$)/],
  },
  {
    permission: 'Contents',
    access: 'read',
    why: "each member's declaration says whether it is a member at all, and whether it is dormant",
    endpoints: [/\/contents\//],
  },
  {
    permission: 'Issues',
    access: 'read',
    why: "the day's closed issues are half of what a member accomplished",
    endpoints: [/\/issues(\/|\?|$)/],
  },
  {
    permission: 'Pull requests',
    access: 'read',
    why: 'the collector walks each member\'s closed pull requests — and a fine-grained PAT reads a PUBLIC repo\'s pull requests without this permission but a PRIVATE one\'s not at all, so a fleet without it runs green until the day someone adds a private member',
    endpoints: [/\/pulls(\/|\?|$)/],
  },
];

// "Metadata read, Contents read, …" — the whole grant, in one line.
export function fleetTokenGrant() {
  return FLEET_TOKEN_PERMISSIONS.map((p) => `${p.permission} ${p.access}`).join(', ');
}

// One secret name, possibly two packs wanting different things of it.
const SHARED = `A repo that also runs the claudinite-fleet-sheepdog pack shares this one secret with its sweeps, `
  + `which additionally write and dispatch — grant the union of both packs' tables.`;

// The message the digest throws when the secret is absent.
export function missingFleetTokenError(detail) {
  const e = new Error(
    `${FLEET_TOKEN} is not set. Add a repo secret holding a fine-grained PAT on this account, `
    + `ALL repositories, granted: ${fleetTokenGrant()}. ${SHARED} ${detail}`,
  );
  // The same triage tag `fleet-reads.mjs` puts on a refused read: an absent secret is a
  // person adding one, so the item parks at `task:needs-human-action` rather than at a
  // failure nobody can act on.
  e.triage = 'action';
  return e;
}

// Which permission a 403 on this path is most likely missing, so a grant short one
// permission reports itself as that rather than as a bare status deep in a run. Empty
// for a path no row claims — a wrong guess about which permission is missing is worse
// than none.
export function forbiddenHint(path) {
  const p = FLEET_TOKEN_PERMISSIONS.find((row) => row.endpoints.some((re) => re.test(path)));
  return p ? ` — the ${FLEET_TOKEN} PAT is most likely missing ${p.permission}: ${p.access} (${p.why})` : '';
}

// The handover step the adopting session files as a checkbox. Built from the table so
// the human granting the token is given the complete list.
export function fleetTokenHandoverStep() {
  return {
    step: `Create a fine-grained PAT on this account covering ALL repositories, granted ${fleetTokenGrant()}, `
      + `and add it to this repo as the Actions secret ${FLEET_TOKEN}. ${SHARED}`,
    breaks: 'the daily fleet-digest task parks asking for the secret, so no brief is written and the '
      + "dashboard's brief series has a hole for every day it is missing; the page itself still builds",
    done: `the secret exists and the next fleet-digest run writes a brief`,
  };
}
