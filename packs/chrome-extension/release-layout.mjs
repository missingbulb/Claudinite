import { finding } from '../../checks/lib/findings.mjs';

const REQUIRED = [
  'dev/build/release/releasing.md',
  'dev/build/release/store_artifacts/PRIVACY.md',
  'dev/build/release/store_artifacts/STORE-LISTING.md',
];

const rule = {
  id: 'cer/release-layout',
  severity: 'blocking',
  description: 'Release machinery lives in dev/build/release/ with the repo release doc and store artifacts',
  doc: 'packs/chrome-extension/RELEASE.md',
  why: 'the dashboard is filled from the submission kit; the privacy page deploys from PRIVACY.md',

  run(ctx) {
    return REQUIRED.filter((p) => !ctx.exists(p)).map((p) =>
      finding(rule, {
        file: p,
        what: `required release-machinery file ${p} is missing`,
        fix: 'create it per the layout in the release standard (adapt from the reference repo)',
      })
    );
  },
};

export default rule;
