import { finding } from '../../../engine/checks/helpers/findings.mjs';

// The Pages release pipeline is VENDORED into each consumer's own .github/: the
// orchestrator (STUB_FILE, named STUB_NAME) owns the triggers and calls the two
// local reusable workflows this pack materializes alongside it. GitHub resolves
// a reusable workflow or a composite action only from the repo's own .github/,
// never from the shared mount, so "the logic lives in the pack" means the pack
// holds the templates and each repo hosts a managed copy: edit the pack, not the
// copy.
//
// The composite actions those workflows run are the static-website pack's, not
// this one's — this pack requires it, so a repo serving from Pages carries both
// vendored sets. What is checked here is that the actions this pipeline CALLS
// have arrived; whether they are well-formed is that pack's own check.
//
// RELEVANCE FIRST: everything here is gated on the orchestrator existing, which
// is also the pack's fingerprint. A repo whose site deploys somewhere other than
// Pages does not declare this pack at all, and would carry no orchestrator if it
// did.
export const STUB_FILE = 'github-pages-release.yml';
export const STUB_NAME = 'Release to GitHub Pages';

// The reusable workflows the pipeline runs on: the orchestrator calls the publish
// one and, on a bump dispatch, the bump one; the publish one calls the deploy one.
export const PUBLISH_CALL = 'github-pages-publish.yml';
export const BUMP_CALL = 'github-pages-bump-version.yml';
export const DEPLOY_CALL = 'github-pages-deploy.yml';
export const VENDORED_WORKFLOWS = [PUBLISH_CALL, BUMP_CALL, DEPLOY_CALL];

// The composite actions the vendored workflows call, at .github/actions/<name>/.
// They ship with static-website, which this pack requires.
export const CALLED_ACTIONS = ['read-site-config', 'bump-site-version', 'assemble-site'];

export const stubPath = (file) => `.github/workflows/${file}`;

// Does this repo serve from Pages through the standard? The orchestrator's
// presence, under its own name, is the marker.
export function servesPages(ctx) {
  const text = ctx.read(stubPath(STUB_FILE));
  if (text === null) return false;
  const name = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
  return name === STUB_NAME;
}

const rule = {
  id: 'gp/pages-workflows',
  severity: 'blocking',
  description: 'The Pages orchestrator and the reusable workflows + composite actions it calls must all be vendored into .github/',
  doc: 'packs/github-pages/skills/releasing-to-github-pages/SKILL.md',
  why: 'the pipeline runs entirely from the repo own .github/ — a missing leg is a release that half-runs: a bumped version with no deploy, or a deploy of an untested tree',

  run(ctx) {
    if (!servesPages(ctx)) return [];
    const out = [];
    const path = stubPath(STUB_FILE);
    const text = ctx.read(path);

    if (!text.includes(`./.github/workflows/${PUBLISH_CALL}`)) {
      out.push(finding(rule, {
        file: path,
        what: `does not call the local ./.github/workflows/${PUBLISH_CALL} — the orchestrator owns only the triggers, the logic is the reusable workflow`,
        fix: `re-copy the orchestrator from the pack's stubs/workflows/${STUB_FILE}`,
      }));
    }
    // Release ON PUSH is the standard, not a per-repo choice: a site whose
    // deploy waits for a human to remember it drifts from its own main.
    if (!/^\s*push:/m.test(text)) {
      out.push(finding(rule, {
        file: path,
        what: 'has no push: trigger — the standard releases on push to main',
        fix: `re-copy the orchestrator from the pack's stubs/workflows/${STUB_FILE}`,
      }));
    }

    for (const wf of VENDORED_WORKFLOWS) {
      if (ctx.read(stubPath(wf)) === null) {
        out.push(finding(rule, {
          file: stubPath(wf),
          what: 'missing — the orchestrator calls this local reusable workflow',
          fix: `copy it from the pack's stubs/workflows/${wf}`,
        }));
      }
    }
    // build_vars is opt-in, and so is this. A repo that never declares one is
    // untouched by the exporter's arrival and stays on its older vendored copy
    // quite happily. Declaring one is the moment the older copy becomes WRONG —
    // it reads the key, ignores it, and builds with the variable unset — and that
    // failure is silent all the way to the live page, so it is caught here.
    //
    // Read with a line match rather than static-website's own config parser: a
    // pack imports only its own files, and the whole question here is "did the
    // repo ask for any", which one dotenv line answers. That pack's checks are
    // what judge whether the value is well-formed.
    if (/^build_vars=\S/m.test(ctx.read('.github/site.config') ?? '')) {
      const deploy = stubPath(DEPLOY_CALL);
      const deployText = ctx.read(deploy);
      if (deployText !== null && !deployText.includes('export-build-vars.mjs')) {
        out.push(finding(rule, {
          file: deploy,
          what: 'runs build_command without exporting the build_vars the config declares — the published build sees none of them',
          fix: `re-copy it from the pack's stubs/workflows/${DEPLOY_CALL}`,
        }));
      }
    }

    for (const action of CALLED_ACTIONS) {
      const file = `.github/actions/${action}/action.yml`;
      if (ctx.read(file) === null) {
        out.push(finding(rule, {
          file,
          what: 'missing — the vendored Pages workflows run this local composite action',
          fix: `declare the static-website pack, which owns and materializes .github/actions/${action}/`,
        }));
      }
    }
    return out;
  },
};

export default rule;
