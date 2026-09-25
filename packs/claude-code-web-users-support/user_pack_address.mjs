// WHERE A PERSON'S PACK LIVES, and whether this session may go and get it. Two questions,
// one module, because several readers have to answer them identically: the step that copies
// the pack in, the step that explains what was copied, and the conformance rules that judge a
// store this repo holds.
//
// THE ADDRESS, from this pack's own entry in `.claudinite-settings.json`:
//
//   { "id": "claude-code-web-users-support", "config": { "repo": "owner/name", "path": "preferences" } }
//
// `repo` is required, because what a person carries belongs to them rather than to any one
// project, and a repository is the smallest thing that can hold it for a whole fleet without
// living inside any member of it. `path` is where the people sit in that repository and
// defaults to `preferences`. One directory per person, named for their GitHub login in lower
// case: `<path>/<login>/`, an ordinary pack directory.
//
// WHY THE LOGIN. The store's protection - a CODEOWNERS line per directory, required code-owner
// review - is keyed by GitHub identity, so the directory is named by the same key. GitHub
// compares logins case-insensitively and a directory name does not, so the store holds the
// lower-case form and the reader folds the login into it: one spelling per person.
//
// THE PERMISSION is a separate question with the same answer shape. A session with no store,
// or no person watching, has nowhere to copy from or no one to copy for, and every reader
// needs the same list of reasons: one to stop, the other to say why. Who the person is is not
// on that list: it takes a network read (read_github_login.mjs), which only the copy step makes.
//
// Dependency-free and pure. The caller supplies the parsed config, the environment and the
// login, so this module touches neither disk nor network and is testable standalone.

export const DEFAULT_PATH = 'preferences';

// `{ repo, path }` when the config names a usable store, else null. Null covers both
// "nothing declared" and "declared but unusable" deliberately: every caller's next move is
// the same either way, and the difference is reported once, by the rule that exists to
// report it.
export function resolveStore(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return null;
  if (typeof config.repo !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(config.repo)) return null;
  if (config.path !== undefined && (typeof config.path !== 'string' || config.path.includes('..') || config.path.startsWith('/'))) return null;
  const path = (config.path ?? DEFAULT_PATH).replace(/^\.\/+|\/+$/g, '');
  return { repo: config.repo, path: path || DEFAULT_PATH };
}

// Where one person's pack sits inside the store, as a repo-relative directory path. An
// address only: whether it is read from a working tree or cloned is the caller's business.
export function packDirFor(store, name) {
  return `${store.path}/${name}`;
}

// Is this string a GitHub login? Exactly GitHub's own rule - letters, digits and single inner
// hyphens, at most 39 - because it becomes a path segment and an argument to git, and anything
// looser would let an API answer address a directory it does not name.
export const isUsableLogin = (login) => typeof login === 'string'
  && /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(login);

// Is this string usable as an email directory's name? The same caution for the legacy form:
// `../../x` as an "email" would address an arbitrary directory.
export const isUsableIdentity = (email) => typeof email === 'string'
  && /^[^\s/\\]+@[^\s/\\]+$/.test(email)
  && !email.includes('..');

// What a directory name in the store is: `login` (the reader opens it), `miscased-login` (a
// login the reader folds to lower case, so never this spelling), `email` (the legacy form,
// read only through the fallback below), or null (nothing ever opens it).
export function storeDirForm(name) {
  if (isUsableLogin(name)) return name === name.toLowerCase() ? 'login' : 'miscased-login';
  if (isUsableIdentity(name)) return 'email';
  return null;
}

// The directories this person's pack may sit in, in the order the reader tries them. The
// login is the address; the email directory is read only when the login's is missing, so a
// store still holding email-named directories keeps working while they are renamed.
export function candidateDirs(store, { login, email }) {
  const out = [];
  if (isUsableLogin(login)) out.push({ dir: packDirFor(store, login.toLowerCase()), form: 'login', identity: login });
  // The email directory, while stores still hold them; `preferences-store-file-names` advises
  // each one to move, and #2320 removes this branch.
  // @legacy-tolerance advisory:preferences-store-file-names retire:#2320
  if (isUsableIdentity(email)) out.push({ dir: packDirFor(store, email), form: 'email', identity: email });
  return out;
}

// Why this session gets no personal pack whoever it is, in the reader's own words, or null
// when it may go and look. Pure, so the step that says this and the step that acts on it
// cannot disagree, and so the saying costs no second look at the world.
//
// Attendedness is one of the reasons: a routine fired under a person's account carries their
// identity but not their presence, and a pack written for a present person (a popup for every
// decision, a callout closing every turn) misdirects a run nobody is watching. Only an
// explicit "not attended" declines, so an older harness that sets nothing still copies.
export function declineReason(config, env) {
  if (!resolveStore(config)) {
    return 'this project declares no store for personal packs (the pack entry\'s "config": { "repo": … })';
  }
  if (env.CLAUDE_CODE_SESSION_ATTENDED === '0') {
    return 'the session is unattended (CLAUDE_CODE_SESSION_ATTENDED=0) and a personal pack is for a present person';
  }
  return null;
}
