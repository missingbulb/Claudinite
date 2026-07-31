// Declare where this fleet's users' personal preferences live.
//
// Personal preferences left the canon (they belong to one fleet's *users*, and the
// canon is mounted by every fleet), so a project now names their home in its own
// settings and the session-start step reads the pointer:
//
//   "preferences": { "repo": "missingbulb/Sheepdog" }
//
// Every existing member needs that key, and no member can derive it: the value is a
// fact about the FLEET. This record is the one-time backfill — the `settings` op sets
// the key on a member's next baselining, in the SAME transactional commit that vendors
// the engine which accepts it, so there is never a night where a member declares a
// setting its own engine would reject.
//
// WHY A CANON RECORD MAY NAME ONE FLEET'S REPO. It is the same exemption the barriers
// rule already grants migrations: a migration record is a dated one-off that exists to
// move the fleet off a specific old shape, so naming that specific thing is its
// purpose, not a coupling. The record retires; nothing standing is left pointing at
// `missingbulb/Sheepdog` from shared code. The STANDING mechanism is fleet-owned — the
// sheepdog pack's `fleet-preferences` sweep, which reads the home from the enforcer
// repo's own config and so serves any fleet, including new members adopted after this
// record is gone.
//
// SET-IF-ABSENT (the op's contract): a member that already declares a preferences home
// keeps it. That is the same rule the sweep follows — a pointer someone set
// deliberately is a decision — and it is what makes the backfill and the sweep safe to
// run over each other.
//
// legacyPresent: a member carries a declaration with no `preferences` key at all. A
// repo with no declaration is not a member and is not this record's business.
// retire: 'auto' — self-retires once the fleet has converged and stayed quiet a cycle.
export default {
  id: 'preferences-home',
  landed: '2026-07-29',
  summary: 'members declare where their users\' personal preferences live ("preferences": { repo }); the canon no longer hosts them',
  settings: [{ key: 'preferences', value: { repo: 'missingbulb/Sheepdog' } }],
  legacyPresent: async (exists, read) => {
    const raw = await read('.claudinite-checks.json');
    if (raw == null) return false;
    try {
      const cfg = JSON.parse(raw);
      if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) return false;
      return !('preferences' in cfg);
    } catch {
      return false; // unparsable settings are the world runner's finding, not this record's
    }
  },
  retire: 'auto',
};
