// The github-pages pack's deploy workflow lives in the pack (packs/github-pages/stubs/)
// and RUNS from each Pages repo's own .github/ — GitHub runs a Pages deploy only from a
// workflow job in the repo's own tree, never from the mount. So every Pages repo hosts a
// MANAGED copy: the pack owns the content, the repo owns the file.
//
// This record is what makes "edit the pack, not the copy" true after adoption. Each
// member's baselining re-materializes the file on every cycle (applying from the fresh
// canon clone, where every record loads regardless of age), so a hand-edited or stale
// copy self-heals and a canon fix reaches every Pages repo the night it lands.
//
// STANDING, NOT TRANSITIONAL. It has no old shape to leave behind (`legacyPresent` is
// false everywhere by construction) — it exists to keep the copy current, forever.
// Records are never deleted, so it just stays.
//
// The gate is the site config, the pack's own central artifact, so this only touches a
// repo that has actually adopted the standard (adoption vendors the file once; this
// keeps it current). Claudinite itself carries no site config, so the canon never
// self-applies.
const CONFIG = '.github/site.config';
const S = 'packs/github-pages/stubs';

export default {
  id: 'github-pages-vendoring',
  landed: '2026-09-17',
  version: 2,
  summary: 'github-pages deploy workflow kept byte-current in each Pages repo own .github/',

  appliesTo: async (read) => await read(CONFIG) !== null,

  materialize: [
    { template: `${S}/workflows/github-pages-deploy.yml`, dest: '.github/workflows/github-pages-deploy.yml' },
  ],

  // Nothing to leave behind: this record exists to keep the copy current, not to move a
  // repo off an older shape.
  legacyPresent: async () => false,
};
