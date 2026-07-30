import { workflowFiles } from '../../engine/checks/helpers/github-workflows.mjs';
import { STUB_NAME, LEGACY_STUB_NAMES, LEGACY_CREATE_PACKAGE, VENDORED_CREATE_PACKAGE } from './release-workflows.mjs';

// One of the four fingerprints that stays code — it reads workflow CONTENT and
// asks two things of it at once, which no declarative path matcher can express
// (engine/pack_loader/detect-spec.mjs).
//
// A repo "ships the release pipeline" once it carries the ORCHESTRATOR — a
// workflow named "Release to Chrome Store" that wires the create-package reusable
// — the fingerprint DESIGN.md pins the conformance suite to. A manifest alone
// never trips this, so coding an extension doesn't drag in the release checks;
// opting in — declaring the pack, then vendoring the release set (orchestrator +
// reusable workflows + composite actions), PRIVACY.md and the first-publication
// issue — does.
//
// BOTH halves matter. The orchestrator NAME is the consumer marker (Claudinite's
// own core workflows are named "Chrome extension: … (reusable)", so the name check
// keeps the canon repo from self-matching), and the create-package WIRING proves
// it is a live pipeline. Either wiring form counts — the pre-vendoring canon call
// @main, or the vendored local file — so a consumer mid-migration and a fully
// vendored one both fingerprint. Legacy stub names still fingerprint, so a repo
// whose orchestrator predates a rename keeps its declaration honest while
// cer/release-workflows flags the stale name.
const STUB_NAMES = new Set([STUB_NAME, ...LEGACY_STUB_NAMES]);

export default function shipsReleasePipeline(ctx) {
  return workflowFiles(ctx).some((wf) => {
    const text = ctx.read(wf);
    if (text === null) return false;
    const name = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
    if (!STUB_NAMES.has(name)) return false;
    return text.includes(`/.github/workflows/${LEGACY_CREATE_PACKAGE}@`) ||
      text.includes(`/Claudinite/.github/workflows/${LEGACY_CREATE_PACKAGE}`) ||
      text.includes(`./.github/workflows/${VENDORED_CREATE_PACKAGE}`);
  });
}
