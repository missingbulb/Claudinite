// The github-pages pack's release pipeline lives in the pack (packs/github-pages/stubs/)
// and RUNS from each site repo's own .github/ — GitHub resolves a reusable workflow only
// from the repo's own .github/, never from the shared mount. So every Pages repo hosts a
// MANAGED copy: the pack owns the content, the repo owns the file.
//
// This record is what makes "edit the pack, not the copy" true after adoption. Each member's
// baselining re-materializes the whole set on every cycle (applying from the fresh canon clone,
// where every record loads regardless of age), so a hand-edited or stale copy self-heals and a
// canon fix reaches every Pages repo the night it lands.
//
// STANDING, NOT TRANSITIONAL. It has no old shape to leave behind (`legacyPresent` is false
// everywhere by construction) — it exists to keep the copies current, forever. Records are
// never deleted, so it just stays.
//
// The composite actions these workflows run are materialized by static-website's own record,
// which this pack requires; nothing here duplicates them.
//
// The gate is the orchestrator's `name:`, so this only touches a repo that has actually adopted
// the standard (adoption vendors the set once; this keeps it current). Claudinite itself carries
// no such workflow, so the canon never self-applies.
const STUB = '.github/workflows/github-pages-release.yml';
const S = 'packs/github-pages/stubs';

export default {
  id: 'github-pages-vendoring',
  landed: '2026-09-17',
  version: 1,
  summary: 'github-pages release pipeline kept byte-current in each Pages repo own .github/',

  appliesTo: async (read) => {
    const text = await read(STUB);
    if (!text) return false;
    return /^name:\s*['"]?Release to GitHub Pages['"]?\s*$/m.test(text);
  },

  materialize: [
    { template: `${S}/workflows/github-pages-release.yml`, dest: STUB },
    { template: `${S}/workflows/github-pages-publish.yml`, dest: '.github/workflows/github-pages-publish.yml' },
    { template: `${S}/workflows/github-pages-bump-version.yml`, dest: '.github/workflows/github-pages-bump-version.yml' },
    { template: `${S}/workflows/github-pages-deploy.yml`, dest: '.github/workflows/github-pages-deploy.yml' },
  ],

  // Nothing to leave behind: this record exists to keep copies current, not to move a repo off
  // an older shape.
  legacyPresent: async () => false,
};
