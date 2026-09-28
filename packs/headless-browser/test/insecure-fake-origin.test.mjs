import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

const insecureFakeOrigin = declaredCheck(
  'packs/headless-browser', 'headless-browser/insecure-fake-origin',
);

// Route interception is what makes a file a fake origin's harness: a URL it
// navigates to is served from disk rather than fetched, so the scheme is a free
// choice and `http` is the one that costs the page its secure-origin capabilities.
const ROUTE = "await page.route('**/*', (r) => r.fulfill({ body: '<html></html>' }));\n";

ruleTester(insecureFakeOrigin, {
  flagged: {
    'the navigation names an http origin': {
      files: {
        'capture/shoot.mjs': ROUTE + "await page.goto('http://fake.test/home');\n",
      },
      at: [{ file: 'capture/shoot.mjs', line: 2, what: /http:\/\/fake\.test/ }],
    },
    'the origin reaches the navigation through a constant': {
      files: {
        'capture/shoot.mjs':
          "const BASE = 'http://acme.test';\n" + ROUTE + 'await page.goto(`${BASE}/home`);\n',
      },
      at: [{ file: 'capture/shoot.mjs', line: 1, what: /http:\/\/acme\.test/ }],
    },
    'a context configured with an http baseURL': {
      files: {
        'capture/shoot.ts':
          ROUTE + "const ctx = await browser.newContext({ baseURL: 'http://acme.test' });\n",
      },
      at: [{ file: 'capture/shoot.ts', line: 2 }],
    },
  },
  clean: {
    'an https fake origin (FP guard)': {
      files: {
        'capture/shoot.mjs': ROUTE + "await page.goto('https://fake.test/home');\n",
      },
    },
    'loopback, which browsers already treat as a secure origin (FP guard)': {
      files: {
        'capture/shoot.mjs':
          ROUTE
          + "await page.goto('http://localhost:4173/');\n"
          + "await page.goto('http://127.0.0.1:4173/');\n"
          + "await page.goto('http://[::1]:4173/');\n",
      },
    },
    'an http host named as a route pattern to intercept (FP guard)': {
      files: {
        'capture/shoot.mjs':
          "await page.route('http://cdn.acme.test/**', (r) => r.fulfill({ path: 'vendor/map.js' }));\n"
          + "await page.goto('https://fake.test/home');\n",
      },
    },
    'an http URL inside the markup a route fulfils with (FP guard)': {
      files: {
        'capture/shoot.mjs':
          ROUTE
          + "const body = '<a href=\"http://acme.test/legal\">terms</a>';\n"
          + "await page.goto('https://fake.test/home');\n",
      },
    },
    'a file that intercepts nothing, so it names no fake origin (FP guard)': {
      files: {
        'scrape/read.mjs': "await page.goto('http://acme.test/prices');\n",
      },
    },
    "the check's own fixtures, whose job is to spell the insecure origin (FP guard)": {
      files: {
        'packs/headless-browser/test/insecure-fake-origin.test.mjs':
          "const ROUTE = \"await page.route('**/*', (r) => r.fulfill({ body: '' }));\\n\";\n"
          + "'capture/shoot.mjs': ROUTE + \"await page.goto('http://fake.test/home');\\n\",\n",
      },
    },
    'a comment quoting the scheme it warns against (FP guard)': {
      files: {
        'capture/shoot.mjs':
          ROUTE
          + "// Never 'http://fake.test' — geolocation takes the denied path there.\n"
          + "await page.goto('https://fake.test/home');\n",
      },
    },
  },
});
