// The executor's secret bag (tasks-dispatch DESIGN §14, #1301). Actions has no way
// to export the secrets context as environment variables, so a workflow that passes
// secrets by name is a function of the task set — and `.github/workflows/` is the one
// path a converge cannot write, because Actions refuses the Action's GITHUB_TOKEN
// there and the refusal rejects the whole ref. That combination is what wedged a
// member permanently in #1296: the workflow that would have passed the endpoint token
// could only be delivered by the agent the token was needed to start.
//
// So the executor step carries ONE static line — `CLAUDINITE_SECRETS:
// ${{ toJSON(secrets) }}` — and this module is the only reader of it. The workflow
// stops tracking declarations, `required_secrets` goes back to being purely a
// declaration (what a task needs, and what to name when it is missing), and nothing
// about a new secret can wedge workflow delivery again.
//
// WHAT THIS BUYS BESIDES: the bag makes DESIGN §14.4's claim true. A task's code-work
// gets exactly the names that task declared, selected here, where before every task's
// work step inherited the executor's whole environment and saw every stamped secret.

export const SECRETS_BAG_ENV = 'CLAUDINITE_SECRETS';

// The parsed bag, or null when this job carries none. A malformed bag is null too:
// the caller's own "declared but not configured" posture then names the secret, which
// is a better answer than a crash inside a JSON parse.
export function secretsBag(env = process.env) {
  const raw = env[SECRETS_BAG_ENV];
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

// One secret's value, or undefined.
//
// LEGACY EXECUTOR WORKFLOWS ARE READ AT THE DOOR. A member's live
// `claudinite-executor.yml` moves only through a human-merged PR, so every member
// spends a window running this engine against a workflow that still stamps names
// directly and sets no bag. Reading `env[name]` when the bag does not carry it is
// what makes that window uneventful. Retiring the fallback is gated on no member
// still running a stamping executor workflow — a converge-confirmable condition,
// never a date.
export function secretValue(name, env = process.env, bag = secretsBag(env)) {
  // The bag holds every secret the repository has, so its own variable is not a
  // secret anyone may ask for by name — otherwise one declaration re-exports all of
  // them and the selection below means nothing.
  if (name === SECRETS_BAG_ENV) return undefined;
  const fromBag = bag?.[name];
  return fromBag === undefined ? env[name] : fromBag;
}

// The declared subset, as an environment fragment: only the names asked for, only the
// ones this job actually carries. A name with no value is left out rather than set to
// an empty string, so a consumer can still tell unset from set-but-empty.
export function secretsFor(names = [], env = process.env) {
  const bag = secretsBag(env);
  const out = {};
  for (const name of names) {
    const value = secretValue(name, env, bag);
    if (value !== undefined) out[name] = value;
  }
  return out;
}
