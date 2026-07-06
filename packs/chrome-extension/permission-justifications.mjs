import { finding } from '../../checks/lib/findings.mjs';
import { findExtensionManifest } from '../../checks/lib/manifest.mjs';

const LISTING = 'dev/build/release/store_artifacts/STORE-LISTING.md';

const rule = {
  id: 'cer/permission-justifications',
  severity: 'blocking',
  description: 'Every manifest permission needs a justification in STORE-LISTING.md, in the same change',
  doc: 'technologies/chrome-extension-release.md',
  why: 'the store requires a written justification per permission; the kit must never lag the manifest',

  run(ctx) {
    const manifestPath = findExtensionManifest(ctx);
    if (!manifestPath) return [];
    let manifest;
    try { manifest = JSON.parse(ctx.read(manifestPath)); } catch { return []; }
    const listing = ctx.read(LISTING);
    if (listing === null) return []; // cer/release-layout already flags the missing kit
    const requested = ['permissions', 'host_permissions', 'optional_permissions', 'optional_host_permissions']
      .flatMap((k) => (Array.isArray(manifest[k]) ? manifest[k] : []));
    return requested.filter((p) => !listing.includes(p)).map((p) =>
      finding(rule, {
        file: LISTING,
        what: `manifest requests "${p}" but the submission kit has no justification mentioning it`,
        fix: 'add the justification row for it — and open the tracking issue for the manual dashboard update the store requires',
      })
    );
  },
};

export default rule;
