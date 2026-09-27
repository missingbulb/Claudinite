// The headless-browser pack: driving a real browser from your own process —
// resolving and pinning the build, replacing everything about the page's world
// that would otherwise vary, and the capture mechanics. Prose only, and
// fingerprinted by a driver reference in JS/TS source: the module specifier of a
// browser-automation package, or a `.launch(` call site.

const DRIVER_MODULE = /['"](playwright(?:-core)?|puppeteer(?:-core)?)['"]/;
const LAUNCH_CALL = /\b(?:chromium|firefox|webkit|puppeteer)\.launch\s*\(/;
const SOURCE = /\.(mjs|cjs|js|jsx|ts|tsx)$/;

export default {
  version: '60927.2',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs:
      'driving a real browser from code — resolving and pinning the build, faking the page world, capture mechanics',
    excludes:
      'which engine a UI golden needs and its review gate — basics writing-tests; workflow wiring — git-github',
  },
  pitch: 'Browser automation in a repo tends to fail in ways that look like product bugs: a driver downloading its own browser, screenshots that differ between machines, waits that guess when the page is ready. This pack gives Claude Code sessions some twenty rules for resolving the browser from the environment, serving pages from a fake origin with the network aborted by default, pinning fonts and rasterisation for stable goldens, and capturing reliably. A few checks catch network-idle waits, captures taken before fonts load, and insecure fake origins.',
  marker: 'a browser-automation driver (playwright / puppeteer, or a .launch( call) referenced in JS/TS source',
  detect: (ctx) =>
    ctx.tracked.some((f) => {
      if (!SOURCE.test(f)) return false;
      const text = ctx.read(f);
      return text !== null && (DRIVER_MODULE.test(text) || LAUNCH_CALL.test(text));
    }),
};
