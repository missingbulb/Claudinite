import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

const notarizeThenStaple = declaredCheck('packs/macos', 'notarize-then-staple');

const SUBMIT = 'xcrun notarytool submit build/Fixture.dmg --keychain-profile ci --wait\n';
const STAPLE = 'xcrun stapler staple build/Fixture.dmg\nxcrun stapler validate build/Fixture.dmg\n';

ruleTester(notarizeThenStaple, {
  flagged: {
    'a release script that submits and never staples': {
      files: { 'scripts/release.sh': `#!/bin/bash\nset -euo pipefail\n${SUBMIT}` },
      at: [{
        file: 'scripts/release.sh', line: 3, on_fail: 'block',
        what: /submits the artifact to the notary service/,
        fix: /stapler staple/,
      }],
    },
    'the submit inside a workflow step, with no staple anywhere in the repo': {
      files: {
        '.github/workflows/release.yml':
          'jobs:\n  release:\n    steps:\n'
          + `      - run: ${SUBMIT}`,
        'scripts/build.sh': '#!/bin/bash\nswift build -c release\n',
      },
      at: [{ file: '.github/workflows/release.yml', line: 4 }],
    },
  },
  clean: {
    'submit and staple in the same script (FP guard)': {
      files: { 'scripts/release.sh': `#!/bin/bash\n${SUBMIT}${STAPLE}` },
    },
    'the staple in a later step of the pipeline, not the submitting file (FP guard)': {
      files: {
        'scripts/notarize.sh': `#!/bin/bash\n${SUBMIT}`,
        'scripts/package.sh': `#!/bin/bash\n${STAPLE}`,
      },
    },
    'a repo that never notarizes at all (FP guard)': {
      files: { 'scripts/release.sh': '#!/bin/bash\ncodesign -s - build/Fixture.app\n' },
    },
    'a commented-out submit line is not a submit (FP guard)': {
      files: {
        'scripts/release.sh': `#!/bin/bash\n# ${SUBMIT}swift build -c release\n`,
      },
    },
    'a runbook naming the command is outside the scan, so it neither flags nor excuses (FP guard)': {
      files: {
        'docs/release.md': `Run \`${SUBMIT.trim()}\` from the release job.\n`,
        'scripts/build.sh': '#!/bin/bash\nswift build -c release\n',
      },
    },
  },
});
