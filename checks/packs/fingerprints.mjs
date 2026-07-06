// Technology-pack fingerprints — the structural detection that drift-guards the
// declaration in .claudinite-checks.json (see DESIGN.md, "Pack selection").
// `available` flips to true when the pack's rules land (Phase 2); until then the
// pack-declaration rule only validates declared names.
export const TECH_PACKS = {
  'github-actions': {
    available: false,
    marker: '.github/workflows/*.ya?ml',
    detect: (ctx) => ctx.tracked.some((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f)),
  },
  node: {
    available: false,
    marker: 'package.json at the repo root',
    detect: (ctx) => ctx.tracked.includes('package.json'),
  },
  'chrome-extension-release': {
    available: false,
    marker: 'a manifest.json declaring manifest_version',
    detect: (ctx) =>
      ctx.tracked.some((f) => {
        if (!f.endsWith('manifest.json')) return false;
        const text = ctx.read(f);
        return text !== null && /"manifest_version"/.test(text);
      }),
  },
};
