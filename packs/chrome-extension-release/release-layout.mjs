import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';

export default patternRule({
  id: 'cer/release-layout',
  severity: 'blocking',
  description: 'The privacy policy source lives at the standard store_artifacts path',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'the privacy page deploys from PRIVACY.md, and the store listing points at that live URL',
  requirePaths: [{
    path: 'dev/build/release/store_artifacts/PRIVACY.md',
    what: 'required release artifact {path} is missing',
    fix: 'create it per the layout in the release standard (adapt from the reference repo)',
  }],
});
