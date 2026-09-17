import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { parseConfig } from '../stubs/actions/read-site-config/read-config.mjs';

// The pack's own vendored surface: the PR gate and the three composite actions
// that read `.github/site.config`, build the publish set and compute the version.
// They are materialized into each site repo's own .github/ because GitHub resolves
// a composite action only from a repo's own .github/, never from the shared mount
// — so "the logic lives in the pack" means the pack holds the templates and each
// repo hosts a managed copy: edit the pack, not the copy.
//
// Whatever SERVES the site is another pack's business (github-pages for Pages,
// cloudflare-site for Cloudflare); everything named here is true of a static site
// whichever one it is.
export const CI_STUB_FILE = 'static-site-ci.yml';
export const VENDORED_ACTIONS = ['read-site-config', 'bump-site-version', 'assemble-site'];
export const CONFIG_PATH = '.github/site.config';

export const stubPath = (file) => `.github/workflows/${file}`;

// TWO INDEPENDENT SIGNALS, either sufficient — because the artifact this pack's
// checks most need to catch missing IS one of them. Gating on `site.config` alone
// would let a repo that vendored the pipeline and never wrote its config pass
// silently, which is the one case `sw/site-config` exists to report.
export function adoptedStandard(ctx) {
  return ctx.read(CONFIG_PATH) !== null || ctx.read(stubPath(CI_STUB_FILE)) !== null;
}

const rule = {
  id: 'sw/vendored-pipeline',
  severity: 'blocking',
  description: 'The PR gate and the composite actions that read the site config must be vendored into .github/',
  doc: 'packs/static-website/skills/shipping-a-static-site/SKILL.md',
  why: 'the config, the version and the publish set are read by local composite actions — a missing one is a build that cannot resolve what the repo declared, and a missing gate is a publish set nothing checks before it merges',

  run(ctx) {
    if (!adoptedStandard(ctx)) return [];
    const out = [];

    for (const action of VENDORED_ACTIONS) {
      const file = `.github/actions/${action}/action.yml`;
      if (ctx.read(file) === null) {
        out.push(finding(rule, {
          file,
          what: 'missing — the vendored workflows read the site config through this local composite action',
          fix: `copy it (and the files beside it) from the pack's stubs/actions/${action}/`,
        }));
      }
    }

    // The gate. A repo whose site deploys on merge with nothing checking the pull
    // request publishes whatever merged. Any CI workflow satisfies it: a repo that
    // already runs its own suite need not take this one. `tracked` is git's own
    // file list, so an as-yet-unadded workflow does not count as present.
    if (ctx.read(stubPath(CI_STUB_FILE)) === null
      && !ctx.tracked.some((f) => /^\.github\/workflows\/.*ci.*\.ya?ml$/i.test(f))) {
      out.push(finding(rule, {
        file: stubPath(CI_STUB_FILE),
        what: 'missing — a repo that deploys what reaches its default branch has no gate unless its pull requests run one',
        fix: `copy the pack's stubs/workflows/${CI_STUB_FILE} (conformance sweep + the repo's gate + the publish-set assembly dry run)`,
      }));
    }

    // build_vars is opt-in, and so is this: a repo that never declares one is
    // untouched by the exporter's arrival and stays on its older vendored copy
    // quite happily. Declaring one is the moment the older copy becomes WRONG —
    // it reads the key, ignores it, and builds with the variable unset — and
    // that failure is silent all the way to the live page, so it is caught here
    // instead. This is the shape to reuse when a stub gains a capability: gate
    // the conformance on the repo having asked for it.
    const cfg = ctx.read(CONFIG_PATH);
    if (cfg !== null && parseConfig(cfg).values.get('build_vars')?.trim()) {
      const exporter = `.github/actions/${VENDORED_ACTIONS[0]}/export-build-vars.mjs`;
      if (ctx.read(exporter) === null) {
        out.push(finding(rule, {
          file: exporter,
          what: `missing, but ${CONFIG_PATH} declares build_vars — the vendored action predates the exporter, so the declared variables reach the build as nothing at all`,
          fix: `copy it from the pack's stubs/actions/${VENDORED_ACTIONS[0]}/ (re-copy the whole directory, the action.yml gained an output too)`,
        }));
      }
      const ci = ctx.read(stubPath(CI_STUB_FILE));
      if (ci !== null && !ci.includes('export-build-vars.mjs')) {
        out.push(finding(rule, {
          file: stubPath(CI_STUB_FILE),
          what: 'runs build_command without exporting the build_vars the config declares — the build sees none of them',
          fix: `re-copy it from the pack's stubs/workflows/${CI_STUB_FILE}`,
        }));
      }
    }
    return out;
  },
};

export default rule;
