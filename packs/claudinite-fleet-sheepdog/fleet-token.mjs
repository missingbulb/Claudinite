// The one statement of what `FLEET_GITHUB_TOKEN` must be granted. Every message a
// sweep prints about the token, the adoption handover step a human actually acts on,
// and the hint a 403 carries are all rendered from the table below — nothing spells a
// permission anywhere else.
//
// It is a table rather than a string because the requirement is genuinely per-sweep:
// each sweep needs a subset, and the SUBSETS ARE NOT THE ANSWER. A person grants the
// token once, for the whole pack, so what any one sweep says when the secret is
// missing has to be the union — defensible per-sweep messages are exactly how
// `Pull requests: read` went ungranted on a fleet for two days (#1030). The per-sweep
// column stays for the SECOND half of the same message — "this sweep uses…" — which
// is what makes a failure legible without ever being what someone grants.
//
// It covers THIS pack's sweeps. The digest that needed `Pull requests: read` now lives
// in the claudinite-dashboard pack and states its own grant beside itself, because the
// two packs are adopted independently and neither may import the other; a repo
// declaring both grants the union of the two tables, which each says.

export const FLEET_TOKEN = 'FLEET_GITHUB_TOKEN';

// One row per fine-grained-PAT permission. `access` is what the GRANT must be — the
// widest any sweep needs — and `sweeps` maps a sweep id to what that sweep alone
// uses. `endpoints` is how a 403 is attributed back to a permission.
export const FLEET_TOKEN_PERMISSIONS = [
  {
    permission: 'Metadata',
    access: 'read',
    why: 'every sweep enumerates the owner\'s repositories before it does anything else',
    sweeps: {
      'fleet-roster': 'read',
      'fleet-add-missing-packs': 'read',
      'fleet-pack-seeds': 'read',
      'fleet-baseline': 'read',
    },
    endpoints: [/^\/user\/repos/, /^\/repos\/[^/]+\/[^/]+(\?|$)/],
  },
  {
    permission: 'Contents',
    access: 'read and write',
    why: 'every sweep reads each member\'s declaration; the pack-seed sweep writes one back, so read alone is not enough',
    sweeps: {
      'fleet-roster': 'read',
      'fleet-add-missing-packs': 'read',
      'fleet-pack-seeds': 'read and write',
      'fleet-baseline': 'read',
    },
    endpoints: [/\/contents\//],
  },
  {
    permission: 'Issues',
    access: 'read and write',
    why: 'the roster and seed sweeps converge labelled issues in this repo, and the missing-packs sweep files a work-list issue in each member',
    sweeps: {
      'fleet-roster': 'read and write',
      'fleet-add-missing-packs': 'read and write',
      'fleet-pack-seeds': 'read and write',
    },
    endpoints: [/\/issues(\/|\?|$)/, /\/labels(\/|\?|$)/],
  },
  {
    permission: 'Actions',
    access: 'read and write',
    why: 'the two fan-out sweeps dispatch another member\'s scheduler workflow, which is an Actions write',
    sweeps: { 'fleet-add-missing-packs': 'read and write', 'fleet-baseline': 'read and write' },
    endpoints: [/\/actions\//, /\/dispatches(\?|$)/],
  },
];

// "Metadata read, Contents read and write, …" — the whole grant, in one line.
export function fleetTokenGrant() {
  return FLEET_TOKEN_PERMISSIONS.map((p) => `${p.permission} ${p.access}`).join(', ');
}

// What ONE sweep uses, for the explanatory half of a message. Never what to grant.
export function fleetTokenGrantFor(sweep) {
  return FLEET_TOKEN_PERMISSIONS
    .filter((p) => p.sweeps[sweep])
    .map((p) => `${p.permission} ${p.sweeps[sweep]}`)
    .join(', ');
}

// The message every sweep throws when the secret is absent. `detail` is the sweep's
// own note about what it cannot do without it — never a permission list.
export function missingFleetTokenError(sweep, detail) {
  const uses = fleetTokenGrantFor(sweep);
  return new Error(
    `${FLEET_TOKEN} is not set. Add a repo secret holding a fine-grained PAT on this account, `
    + `ALL repositories, granted: ${fleetTokenGrant()}. `
    + `Grant the whole set — it is one token for the whole pack, and a subset breaks a different `
    + `sweep later${uses ? ` (this one, ${sweep}, uses ${uses})` : ''}. ${detail}`,
  );
}

// Which permission a 403 on this path is most likely missing, so a grant short one
// permission reports itself as that rather than as a bare status deep in a run.
export function permissionForEndpoint(path) {
  for (const p of FLEET_TOKEN_PERMISSIONS) {
    if (p.endpoints.some((re) => re.test(path))) return p;
  }
  return null;
}

// The tail a 403 carries. Empty for a path no row claims — a wrong guess about which
// permission is missing is worse than none.
export function forbiddenHint(path) {
  const p = permissionForEndpoint(path);
  if (!p) return '';
  return ` — the ${FLEET_TOKEN} PAT is most likely missing ${p.permission}: ${p.access} (${p.why})`;
}

// The handover step the adopting session files as a checkbox. Built from the table so
// the human granting the token is given the COMPLETE list, which is the one thing no
// per-sweep message can be trusted to state.
export function fleetTokenHandoverStep() {
  return {
    step: `Create a fine-grained PAT on this account covering ALL repositories, granted ${fleetTokenGrant()}, `
      + `and add it to this repo as the Actions secret ${FLEET_TOKEN}. Grant every permission listed, not the `
      + `subset the first sweep you run needs.`,
    breaks: 'every claudinite-fleet-sheepdog sweep fails — and a token short one permission fails only on the sweep that needs it, '
      + 'which can be a week later, on the one sweep that writes or dispatches',
    done: `the secret exists and each claudinite-fleet-sheepdog task's next run is green`,
  };
}
