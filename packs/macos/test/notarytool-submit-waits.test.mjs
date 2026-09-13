// Red-first coverage for notarytool-submit-waits.
//
// The assertion is file-scoped rather than line-scoped on purpose: a real
// notarize command is several lines long, its flags carried on backslash
// continuations, so judging the `submit` line alone would flag the correct
// spelling. The cases below pin both — the continuation form quiet, and a file
// that submits with nothing anywhere waiting for the verdict flagged.
import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

const submitWaits = declaredCheck('packs/macos', 'notarytool-submit-waits');

ruleTester(submitWaits, {
  flagged: {
    'a release script that staples a verdict it never waited for': {
      files: {
        'scripts/release.sh': `#!/bin/bash
ditto -c -k --keepParent App.app App.zip
xcrun notarytool submit App.zip --keychain-profile AC
xcrun stapler staple App.app
`,
      },
      at: [{ file: 'scripts/release.sh', line: 3, what: /notarytool submit/, fix: /--wait/ }],
    },
    'the same in a workflow step': {
      files: {
        '.github/workflows/release.yml': `on: workflow_dispatch
jobs:
  ship:
    steps:
      - run: xcrun notarytool submit App.zip --apple-id "\${{ secrets.AC_ID }}"
`,
      },
      at: [{ file: '.github/workflows/release.yml', line: 5 }],
    },
  },
  clean: {
    'the flag on the submit line': {
      files: {
        'scripts/release.sh': `#!/bin/bash
xcrun notarytool submit App.zip --keychain-profile AC --wait
xcrun stapler staple App.app
`,
      },
    },
    'the flag on a backslash continuation of the same command': {
      files: {
        'scripts/release.sh': `#!/bin/bash
xcrun notarytool submit App.zip \\
  --keychain-profile AC \\
  --wait
xcrun stapler staple App.app
`,
      },
    },
    'an explicit wait on the submission id instead': {
      files: {
        'scripts/release.sh': `#!/bin/bash
ID=$(xcrun notarytool submit App.zip --keychain-profile AC --output-format json | jq -r .id)
xcrun notarytool wait "$ID" --keychain-profile AC
xcrun stapler staple App.app
`,
      },
    },
    'a shell comment that documents the trap': {
      files: {
        'scripts/release.sh': `#!/bin/bash
# xcrun notarytool submit returns the moment the upload lands — never staple off that
exec ./scripts/ship.sh
`,
      },
    },
    'prose naming the command, which notarizes nothing': {
      files: { 'RELEASE.md': 'Run `xcrun notarytool submit App.zip`, then staple.\n' },
    },
  },
});
