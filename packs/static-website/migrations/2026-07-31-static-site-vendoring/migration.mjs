// The static-website pack's PR gate and config-reading actions live in the pack
// (packs/static-website/stubs/) and RUN from each site repo's own .github/ — GitHub resolves a
// composite action only from the repo's own .github/, never from the shared mount. So every
// site repo hosts a MANAGED copy: the pack owns the content, the repo owns the file.
//
// This record is what makes "edit the pack, not the copy" true after adoption. Each member's
// baselining re-materializes the whole set on every cycle (applying from the fresh canon clone,
// where every record loads regardless of age), so a hand-edited or stale copy self-heals and a
// canon fix reaches every site repo the night it lands (#609).
//
// STANDING, NOT TRANSITIONAL. Every other record here moves the fleet OFF an old shape; this
// one has no old shape to leave behind (`legacyPresent` is false everywhere by construction) —
// it exists to keep the copies current, forever. Records are never deleted, so it just stays.
// If a general "keep a pack's vendored set current" mechanism is ever built, this record is
// what it replaces.
//
// The gate is the site config, the pack's own central artifact, so this only touches a repo that
// has actually adopted the standard (adoption vendors the set once; this keeps it current).
// Claudinite itself carries no site config, so the canon never self-applies. The workflows that
// SERVE the site are materialized by the serving pack's own record, never here.
const CONFIG = '.github/site.config';
const S = 'packs/static-website/stubs';

export default {
  id: 'static-site-vendoring',
  landed: '2026-07-31',
  version: 1,
  summary: 'static-website PR gate and composite actions kept byte-current in each site repo own .github/ (#609)',

  appliesTo: async (read) => await read(CONFIG) !== null,

  materialize: [
    { template: `${S}/workflows/static-site-ci.yml`, dest: '.github/workflows/static-site-ci.yml' },
    { template: `${S}/actions/read-site-config/action.yml`, dest: '.github/actions/read-site-config/action.yml' },
    { template: `${S}/actions/read-site-config/read-config.mjs`, dest: '.github/actions/read-site-config/read-config.mjs' },
    { template: `${S}/actions/read-site-config/export-build-vars.mjs`, dest: '.github/actions/read-site-config/export-build-vars.mjs' },
    { template: `${S}/actions/bump-site-version/action.yml`, dest: '.github/actions/bump-site-version/action.yml' },
    { template: `${S}/actions/bump-site-version/bump.mjs`, dest: '.github/actions/bump-site-version/bump.mjs' },
    { template: `${S}/actions/assemble-site/action.yml`, dest: '.github/actions/assemble-site/action.yml' },
  ],

  // Nothing to leave behind: this record exists to keep copies current, not to move a repo off
  // an older shape.
  legacyPresent: async () => false,
};
