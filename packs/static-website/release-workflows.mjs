import { finding } from '../../engine/checks/helpers/findings.mjs';

// The static-site release pipeline is VENDORED into each consumer's own
// .github/: the orchestrator (STUB_FILE, named STUB_NAME) owns the triggers and
// calls the two local reusable workflows, which — with the three composite
// actions — the pack materializes alongside it. GitHub resolves a reusable
// workflow or a composite action only from the repo's own .github/, never from
// the shared mount, so "the logic lives in the pack" means the pack holds the
// templates and each repo hosts a managed copy: edit the pack, not the copy.
//
// RELEVANCE FIRST: everything here is gated on the orchestrator existing. A repo
// that declares this pack for the versioning and CI half while its site deploys
// somewhere other than Pages carries no orchestrator, and none of this fires.
export const STUB_FILE = 'static-site-release.yml';
export const STUB_NAME = 'Release static site';
export const CI_STUB_FILE = 'static-site-ci.yml';

// The reusable workflows the pipeline runs on (the orchestrator calls the
// publish one; the publish one calls the deploy one).
export const ORCHESTRATOR_CALL = 'static-site-publish.yml';
export const VENDORED_WORKFLOWS = [ORCHESTRATOR_CALL, 'static-site-deploy-pages.yml'];
// The composite actions those workflows use, at .github/actions/<name>/.
export const VENDORED_ACTIONS = ['read-site-config', 'bump-site-version', 'assemble-site'];

export const stubPath = (file) => `.github/workflows/${file}`;

// Does this repo ship the pipeline? The orchestrator's presence is the marker.
export function shipsPipeline(ctx) {
  const text = ctx.read(stubPath(STUB_FILE));
  if (text === null) return false;
  const name = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
  return name === STUB_NAME;
}

const rule = {
  id: 'sw/release-workflows',
  severity: 'blocking',
  description: 'The static-site orchestrator and the reusable workflows + composite actions it calls must all be vendored into .github/',
  doc: 'packs/static-website/RELEASE.md',
  why: 'the pipeline runs entirely from the repo own .github/ — a missing leg is a release that half-runs: a bumped version with no deploy, or a deploy of an untested tree',

  run(ctx) {
    if (!shipsPipeline(ctx)) return [];
    const out = [];
    const path = stubPath(STUB_FILE);
    const text = ctx.read(path);

    if (!text.includes(`./.github/workflows/${ORCHESTRATOR_CALL}`)) {
      out.push(finding(rule, {
        file: path,
        what: `does not call the local ./.github/workflows/${ORCHESTRATOR_CALL} — the orchestrator owns only the triggers, the logic is the reusable workflow`,
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
    for (const action of VENDORED_ACTIONS) {
      const file = `.github/actions/${action}/action.yml`;
      if (ctx.read(file) === null) {
        out.push(finding(rule, {
          file,
          what: 'missing — the vendored workflows use this local composite action',
          fix: `copy it (and the files beside it) from the pack's stubs/actions/${action}/`,
        }));
      }
    }
    // The gate. A pipeline that releases on push with nothing checking the pull
    // request publishes whatever merged.
    if (ctx.read(stubPath(CI_STUB_FILE)) === null && !ctx.tracked.some((f) => /^\.github\/workflows\/.*ci.*\.ya?ml$/i.test(f))) {
      out.push(finding(rule, {
        file: stubPath(CI_STUB_FILE),
        what: 'missing — a repo that releases on push has no gate unless its pull requests run one',
        fix: `copy the pack's stubs/workflows/${CI_STUB_FILE} (conformance sweep + the repo's gate + the publish-set assembly dry run)`,
      }));
    }
    return out;
  },
};

export default rule;
