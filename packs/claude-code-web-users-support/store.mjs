// The STORE this pack points at: where a repo's users keep the pack that travels with
// them, and how one person's is addressed inside it.
//
// One resolver, because three readers need the same answer and must never disagree:
// the session-prepare step that pours a person's pack into the session, the session-start
// step that reports what it found, and the conformance rules that say whether this pack is
// configured and whether a store this repo holds is addressable at all.
//
// THE SHAPE, on this pack's own entry in `.claudinite-settings.json`:
//
//   { "id": "claude-code-web-users-support", "config": { "repo": "owner/name", "path": "preferences" } }
//
// `repo` is required - the store is a repository, because what a person carries belongs
// to them rather than to any one project, and a repo is the smallest thing that can hold
// it for a whole fleet without living inside any member of it. `path` is where the people
// sit in that repo and defaults to `preferences`.
//
// ONE DIRECTORY PER PERSON, AND IT IS A PACK. `<path>/<email>/` is an ordinary pack
// directory - `RULES.md`, `pack.mjs`, `skills/`, `worldRules/`, `declared-checks.json`,
// `provenance/` - poured into the session's own pack root and loaded by the same engine
// that loads the canon and the repo's own packs. A person who wants a rule enforced, a
// skill mounted or a requirement installed writes it the way every other pack is written,
// rather than in whatever a bespoke preferences format happened to support.
//
// ONE PACK PER PERSON, not a shelf: the rules index addresses the poured prose by a fixed
// literal path (engine/pack_loader/pack-registry.mjs states why), and a person is a person
// rather than a corpus.
//
// Dependency-free and pure: the caller supplies the parsed config, so this module
// touches neither disk nor network and is testable standalone.

export const DEFAULT_PATH = 'preferences';

// `{ repo, path }` when the config names a usable store, else null. Null covers both
// "nothing declared" and "declared but unusable" deliberately: every caller's next
// move is the same either way, and the difference is reported once, by the rule that
// exists to report it.
export function resolveStore(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return null;
  if (typeof config.repo !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(config.repo)) return null;
  if (config.path !== undefined && (typeof config.path !== 'string' || config.path.includes('..') || config.path.startsWith('/'))) return null;
  const path = (config.path ?? DEFAULT_PATH).replace(/^\.\/+|\/+$/g, '');
  return { repo: config.repo, path: path || DEFAULT_PATH };
}

// Where one person's pack sits inside the store, as a repo-relative directory path. An
// address only - whether it is read from a working tree or fetched over the network is
// the caller's business.
export function folderFor(store, email) {
  return `${store.path}/${email}`;
}

// The pre-folder address: one Markdown file per person, holding prose and nothing else.
// Read for one convergence window so a person whose file has not been converted yet is
// not silently left without their rules; the advisory the prepare step raises is what
// gets it converted, and #2188 takes both back out.
// @legacy-tolerance advisory:person-asking-record retire:#2188
export function legacyFileFor(store, email) {
  return `${store.path}/${email}.md`;
}

// @deprecated The name this address went by while it was the only one. A member's own local
// pack may import it, and the two lanes deliver on separate cadences, so it stays as a
// re-export until the tolerance above goes.
// @legacy-tolerance advisory:person-asking-record retire:#2188
export const fileFor = legacyFileFor;

// Is this string usable as the name of a person's pack? It becomes both a path
// segment and a URL component, so an implausible one is refused rather than
// traversed with: `../../x` as an "email" would address an arbitrary directory.
export const isUsableIdentity = (email) => typeof email === 'string'
  && /^[^\s/\\]+@[^\s/\\]+$/.test(email)
  && !email.includes('..');
