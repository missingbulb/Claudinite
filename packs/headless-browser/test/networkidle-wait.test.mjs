import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

const networkidleWait = declaredCheck('packs/headless-browser', 'headless-browser/networkidle-wait');

ruleTester(networkidleWait, {
  flagged: {
    'a navigation waiting for the network to go quiet': {
      files: {
        'capture/shoot.mjs':
          "import { chromium } from 'playwright-core';\n"
          + 'const page = await (await chromium.launch()).newPage();\n'
          + "await page.goto('https://fake.test/', { waitUntil: 'networkidle' });\n",
      },
      at: [{ file: 'capture/shoot.mjs', line: 3, what: /networkidle\b/ }],
    },
    "puppeteer's numbered spelling of the same wait": {
      files: {
        'test/visual.spec.ts': "await page.goto(url, { waitUntil: 'networkidle2' });\n",
      },
      at: [{ file: 'test/visual.spec.ts', line: 1, what: /networkidle2/ }],
    },
    'a standalone load-state wait': {
      files: {
        'capture/shoot.mjs': "await page.waitForLoadState('networkidle');\n",
      },
      at: [{ file: 'capture/shoot.mjs', line: 1 }],
    },
  },
  clean: {
    'waiting on a selector the page only renders with its data (FP guard)': {
      files: {
        'capture/shoot.mjs':
          "await page.goto('https://fake.test/', { waitUntil: 'domcontentloaded' });\n"
          + "await page.waitForSelector('[data-loaded]');\n",
      },
    },
    'a comment naming the wait it warns against (FP guard)': {
      files: {
        'capture/shoot.mjs':
          "// Never waitUntil: 'networkidle' here — it returns before the slow read lands.\n"
          + "await page.waitForSelector('[data-loaded]');\n",
      },
    },
    'a vendored driver carrying the option name (FP guard)': {
      files: {
        'node_modules/playwright-core/lib/waits.js': "const STATES = ['load', 'networkidle'];\n",
      },
    },
    'prose about the wait, outside the scanned sources (FP guard)': {
      files: { 'docs/capture.md': 'Never wait on `networkidle`.\n' },
    },
    "the check's own fixtures, whose job is to spell the banned wait (FP guard)": {
      files: {
        'packs/headless-browser/test/networkidle-wait.test.mjs':
          "at: [{ file: 'capture/shoot.mjs', line: 1 }],\n"
          + "'capture/shoot.mjs': \"await page.waitForLoadState('networkidle');\\n\",\n",
      },
    },
  },
});
