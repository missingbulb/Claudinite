// Red-first coverage for headless-browser/version-stamped-browser-path.
//
// The cases worth pinning in both directions are the near-misses: an unstamped
// browser directory (`chrome-linux64`, `chrome-headless-shell`) is the normal,
// correct shape and must stay silent, while the build number one segment along
// it (`chromium-1148`, `linux-131.0.6778.85`) is the whole hazard. A harness
// that gets this right also tends to document the trap in a comment right above
// the resolution it uses, so both comment syntaxes are pinned quiet too.
//
// The download-URL case is a .mjs on purpose: the comment-blind view the rule
// reads is JS-aware, so an unquoted `//` in a shell or YAML line takes the rest
// of that line with it. Spelled there, the case would pass on the stripper
// rather than on the pattern, and prove nothing about the pattern.
import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

const stampedPath = declaredCheck('packs/headless-browser', 'headless-browser/version-stamped-browser-path');

ruleTester(stampedPath, {
  flagged: {
    'a Playwright cache path pinned to a build number': {
      files: {
        'test/harness.mjs': `import { chromium } from 'playwright-core';
export const browser = () => chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
});
`,
      },
      at: [{ file: 'test/harness.mjs', line: 3, what: /chromium-1148/ }],
    },
    'the same shape in a firefox install root': {
      files: {
        'scripts/capture.sh': `#!/bin/bash
export FIREFOX_BIN=/ms-playwright/firefox-1482/firefox/firefox
`,
      },
      at: [{ file: 'scripts/capture.sh', line: 2, what: /firefox-1482/ }],
    },
    "a Chrome-for-Testing cache directory, whose stamp is the platform's": {
      files: {
        '.github/workflows/shots.yml': `on: push
jobs:
  shoot:
    steps:
      - run: CHROME=/root/.cache/puppeteer/chrome/linux-131.0.6778.85/chrome-linux64/chrome node shoot.mjs
`,
      },
      at: [{ file: '.github/workflows/shots.yml', line: 5, what: /linux-131\.0\.6778\.85/ }],
    },
  },
  clean: {
    'an unstamped browser root resolved out of the environment': {
      files: {
        'test/harness.mjs': `import { chromium } from 'playwright-core';
const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
export const browser = () => chromium.launch({ executablePath: \`\${root}/chromium/chrome\` });
`,
      },
    },
    'the unstamped directory names a real install carries': {
      files: {
        'test/harness.mjs': `export const candidates = [
  '/opt/pw-browsers/chrome-linux64/chrome',
  '/opt/pw-browsers/chrome-headless-shell/chrome-headless-shell',
];
`,
      },
    },
    'a JS comment that documents the trap': {
      files: {
        'test/harness.mjs': `// never hardcode /ms-playwright/chromium-1148/chrome-linux/chrome — it moves
export const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
`,
      },
    },
    'a shell comment that documents the trap': {
      files: {
        'scripts/capture.sh': `#!/bin/bash
# not /ms-playwright/chromium-1148/chrome-linux/chrome — that moves with the image
exec node capture.mjs
`,
      },
    },
    'a pinned download URL, which names a release rather than an install root': {
      files: {
        'scripts/fetch.mjs': `export const ARCHIVE =
  'https://storage.googleapis.com/chrome-for-testing/131.0.6778.85/linux64/chrome-linux64.zip';
`,
      },
    },
    'prose naming the hazard, which is not a path the code resolves': {
      files: { 'README.md': 'Never hardcode `/ms-playwright/chromium-1148/chrome-linux/chrome`.\n' },
    },
  },
});
