// The headless-browser pack: driving a real browser from your own process —
// resolving and pinning the build, replacing everything about the page's world
// that would otherwise vary, and the capture mechanics. Prose only, and
// deliberately so: every rule here is a RUNTIME browser behaviour (a secure
// origin gating geolocation, font fallback deciding layout, a scroll dismissing
// a hover state) or an authoring judgment about a harness's shape. Neither has a
// repo-state signature a check could read without asserting that some particular
// call still exists, which pins a point in time rather than a rule.
//
// Fingerprinted by an actual driver reference in JS/TS source — the module
// specifier of a browser-automation package, or a `.launch(` call site — so a
// repo that drives a browser from a globally-installed driver (no dependency
// entry anywhere) is still recognised. The marker only *suspects* the pack;
// declaring it is the project's call, like every pack.

const DRIVER_MODULE = /['"](playwright(?:-core)?|puppeteer(?:-core)?)['"]/;
const LAUNCH_CALL = /\b(?:chromium|firefox|webkit|puppeteer)\.launch\s*\(/;
const SOURCE = /\.(mjs|cjs|js|jsx|ts|tsx)$/;

export default {
  id: 'headless-browser',
  version: '60820.1',
  minEngineVersion: 1,
  ruleRoutingGuidance: {
    belongs:
      'driving a real browser from code — resolving and pinning the build, faking the page world, capture mechanics',
    excludes:
      'which engine a UI golden needs and its review gate — basics writing-tests; workflow wiring — git-github',
  },
  badge: 'badge.svg',
  marker: 'a browser-automation driver (playwright / puppeteer, or a .launch( call) referenced in JS/TS source',
  detect: (ctx) =>
    ctx.tracked.some((f) => {
      if (!SOURCE.test(f)) return false;
      const text = ctx.read(f);
      return text !== null && (DRIVER_MODULE.test(text) || LAUNCH_CALL.test(text));
    }),
  prose: 'RULES.md',
  worldRules: [],
};
