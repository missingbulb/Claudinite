import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

const captureWithoutFontWait = declaredCheck(
  'packs/headless-browser', 'headless-browser/capture-without-font-wait',
);

// A tracked reference image is what makes the rule relevant: without one there is
// nothing for a capture to be compared against, and the check stays silent.
const GOLDEN = { '__screenshots__/home.png': '\u0089PNG\r\n\u001a\n' };

ruleTester(captureWithoutFontWait, {
  flagged: {
    'a capture harness that never asks whether the fonts have landed': {
      files: {
        ...GOLDEN,
        'capture/shoot.mjs':
          "await page.waitForSelector('[data-loaded]');\n"
          + "await page.screenshot({ path: '__screenshots__/home.png' });\n",
      },
      at: [{ file: 'capture/shoot.mjs', line: 2 }],
    },
    'each harness file capturing without the wait': {
      files: {
        ...GOLDEN,
        'capture/home.mjs': "await page.screenshot({ path: 'home.png' });\n",
        'capture/about.ts': "await page.screenshot({ path: 'about.png' });\n",
      },
      at: [
        { file: 'capture/about.ts', line: 1 },
        { file: 'capture/home.mjs', line: 1 },
      ],
    },
  },
  clean: {
    'the harness awaits font readiness before the shot (FP guard)': {
      files: {
        ...GOLDEN,
        'capture/shoot.mjs':
          'await page.evaluate(() => document.fonts.ready);\n'
          + "await page.screenshot({ path: '__screenshots__/home.png' });\n",
      },
    },
    'the wait lives in a helper the capture file imports (FP guard)': {
      files: {
        ...GOLDEN,
        'capture/settle.mjs':
          "export const settle = (page) => page.waitForFunction(() => document.fonts.status === 'loaded');\n",
        'capture/shoot.mjs':
          "import { settle } from './settle.mjs';\n"
          + 'await settle(page);\n'
          + "await page.screenshot({ path: '__screenshots__/home.png' });\n",
      },
    },
    'a repo that compares nothing against a reference image (FP guard)': {
      files: {
        'capture/shoot.mjs': "await page.screenshot({ path: '/tmp/debug.png' });\n",
      },
    },
    "the check's own fixtures, whose job is to spell a capture (FP guard)": {
      files: {
        ...GOLDEN,
        'packs/headless-browser/test/capture-without-font-wait.test.mjs':
          "'capture/shoot.mjs': \"await page.screenshot({ path: 'home.png' });\\n\",\n",
      },
    },
    'a harness that drives the page without capturing it (FP guard)': {
      files: {
        ...GOLDEN,
        'capture/drive.mjs': "await page.click('[data-open]');\n",
      },
    },
  },
});
