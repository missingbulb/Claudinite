import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { resolveStore, storeDirForm } from '../user_pack_address.mjs';

// A person's pack is addressed by their IDENTITY and nothing else: user_pack_address.mjs builds
// `<path>/<login>` from the GitHub login, lower-cased, and `<path>/<email>` as the legacy
// fallback, and session-prepare.mjs copies the first that exists (locally when this tree is the
// store, over the network otherwise). There is no index and no registry - a directory whose
// name is not a usable identity is simply never opened by anyone.
//
// And nothing says so. Every miss on the reading side is fail-soft on purpose: no identity,
// no store, no pack, a failed fetch - each is one note in the session context and the
// session carries on with default behavior. So a directory named `a b`, or `Acme-User` for a
// login the reader folds to lower case, or a person's files parked loose in the store root,
// look perfectly fine in the tree and are dead. The person notices only by the absence of
// behavior they were expecting.
//
// It also carries the email form's advisory: an email directory is still read, through the
// fallback, and each one is told here to move before that fallback is removed.
//
// THIS IS A PROPERTY OF BEING A STORE, not of any one fleet's store repo, which is why it
// sits here beside user_pack_address.mjs rather than in the store repo's own local pack: it imports the
// reader's `resolveStore`/`storeDirForm` as siblings, so the check can never be stricter
// or looser than the code that does the opening.
//
// ADVISORY, matching its sibling store-configured.mjs for the same reason: the loss is a
// nicety, no other check or task depends on it, and the fix is a rename.
//
// RELEVANCE-FIRST. It is inert unless this repo actually carries the store directory its own
// declaration names - which is every member of a fleet: they declare the pack to READ a store
// that lives somewhere else. Only the one repo that IS the store has anything to judge.
const PACK = 'claude-code-web-users-support';

const rule = {
  id: 'preferences-store-file-names',
  severity: 'advisory',
  description: 'Every entry in a personal-pack store this repo holds is README.md or an <identity>/ pack directory',
  doc: 'packs/claude-code-web-users-support/RULES.md',
  why: 'the reader copies a person\'s pack from <path>/<login>/ (or, while the fallback stands, <path>/<email>/) and fails soft on a miss, so a differently-named directory is never opened and nothing ever reports it',

  // `ctx.files` is the tracked, non-vendored set - the store is committed content, and an
  // uncommitted file is not published to the fleet yet anyway.
  run(ctx) {
    const store = resolveStore(ctx.config.packConfig?.[PACK] ?? null);
    if (!store) return []; // no usable store declared — store-configured reports that

    const prefix = `${store.path}/`;
    const held = (ctx.files ?? []).filter((f) => f.startsWith(prefix));
    if (!held.length) return []; // this repo is not the store, whatever it points at

    // One finding per top-level entry, not per file: a misnamed directory holding a whole
    // pack is one mistake with one fix, and a finding per file inside it would bury it.
    const seen = new Set();
    return held.flatMap((f) => {
      const rest = f.slice(prefix.length);
      const top = rest.includes('/') ? rest.slice(0, rest.indexOf('/')) : rest;
      if (seen.has(top)) return [];
      seen.add(top);
      if (!rest.includes('/')) {
        if (top === 'README.md') return []; // the store's own doc, deliberately not an identity
        return [finding(rule, {
          file: f,
          what: `sits loose in ${store.path}/ - a person's pack is only ever addressed as ${store.path}/<login>/`,
          fix: `move it into ${store.path}/<login>/, as that pack's RULES.md or one of its files, or out of the store entirely if it is not one person's pack`,
        })];
      }
      const form = storeDirForm(top);
      if (form === 'login') return [];
      if (form === 'miscased-login') {
        return [finding(rule, {
          file: `${prefix}${top}`,
          what: `is a GitHub login in mixed case - the reader lower-cases the login and opens ${prefix}${top.toLowerCase()}/`,
          fix: `rename it to ${prefix}${top.toLowerCase()}/`,
        })];
      }
      if (form === 'email') {
        return [finding(rule, {
          file: `${prefix}${top}`,
          what: `is named by email, the legacy form the reader opens only through a fallback that is being removed`,
          fix: `rename it to ${prefix}<login>/, that person's GitHub login in lower case, and regenerate the store's CODEOWNERS block in the same change`,
        })];
      }
      return [finding(rule, {
        file: `${prefix}${top}`,
        what: `is not an identity the reader can address - it copies ${store.path}/<login>/ for the GitHub login the session's token reads back`,
        fix: `rename it to that person's GitHub login in lower case, or move it out of ${store.path}/`,
      })];
    });
  },
};

export default rule;
