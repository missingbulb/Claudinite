// Namespace local-pack declarations: a repo's own pack (.claudinite/local/packs/<name>/)
// is declared in .claudinite-settings.json by its namespaced token `local/<name>`,
// not a bare id — self-documenting, and a canon id can never be claimed by accident
// (the bare form shared the canon namespace; a collision was only CAUGHT by the
// discoverPacks shadow guard, never prevented).
//
// The write is this record's own, as `normalizeLocalDeclarations` (#768 Phase 1). It
// was written as convergence telemetry for a rewrite step that lived in prose in a
// worker since retired, so for a year nothing rewrote anything and the probe below
// could never reach zero. The op needs the repo's disk — a BARE id is a local pack
// only where that repo has one, and a bare id naming a canon pack must not be
// touched — so it is the named codemod in the registry rather than a `rewrite`
// (DESIGN §2.3's "rarely code").
//
// VERSION 2, not 1: the record's version is the engine version at which its change
// takes effect, and its change takes effect now. A member stamped at 1 fetches it
// again for exactly that reason. The engine keeps accepting a bare id — `packEntryId`'s
// strip is the permanent parser — so nothing here can be stranded, and a repo that
// never runs it stays correct. The pre-rename `local_packs/<name>` token this codemod
// also rewrote stopped resolving at the loader on #1640, and came out with it.
//
// legacyPresent: a member still declares a bare id (string entry or entry-object id,
// no `local/` prefix) whose pack lives in its own .claudinite/local/packs/ tree.
// A bare id with no such local pack is a canon declaration — not this record's business.
export default {
  id: 'local-pack-namespace',
  landed: '2026-07-19',
  version: 2,
  summary: 'local-pack declarations normalized to local/<name> (the record rewrites a bare token; the engine keeps accepting one)',
  normalizeLocalDeclarations: true,
  legacyPresent: async (exists, read) => {
    const raw = await read('.claudinite-settings.json');
    if (raw == null) return false;
    let packs;
    try { ({ packs } = JSON.parse(raw)); } catch { return false; }
    if (!Array.isArray(packs)) return false;
    for (const e of packs) {
      const id = typeof e === 'string' ? e : e?.id;
      if (typeof id !== 'string' || id.startsWith('local/')) continue;
      if (await exists(`.claudinite/local/packs/${id}/pack.mjs`)) return true;
    }
    return false;
  },
};
