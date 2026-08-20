// The 2026-08-11 fleet-baseline conversion (#749): the sheepdog pack's manual lever
// over the fleet stopped being a standalone WORKFLOW (a managed copy in the enforcer's
// own .github/, the one file the nightly converge could never push — #649) and became
// an ordinary `manual`-frequency TASK (packs/sheepdog/tasks/fleet-baseline/) riding
// the vendored scheduler: Actions → Claudinite scheduler → Run workflow →
// `overrides: FORCE_TASKS=fleet-baseline`.
//
// Canon-side the conversion is complete — the stub the old record materialized
// (packs/sheepdog/stubs/workflows/fleet-baseline.yml) is deleted, which makes the
// 2026-08-05 sheepdog-fleet-baseline record's materialization a permanent no-op (a
// missing template is a skip, never a clobber; see applyMaterializations). What
// remains member-side is the COPY that record installed: an enforcer's own
// .github/workflows/fleet-baseline.yml, now orphaned — its `run:` step points at a
// mount path the vendor refresh no longer carries, so left in place it is a button
// that fails when pressed. Removing a workflow file needs the `workflows` permission
// the Action token does not hold, so the removal rode an agent stage over MCP — the
// same lane that landed the file (#649), run in reverse.
//
// THAT WORK IS DONE. The enforcer's orphaned copy is gone, and this record's
// `agentic:` note went with the field itself when #768 Phase 5 retired it. The record
// stays as the dated account of the conversion, and `legacyPresent` still answers the
// tolerance question for any repo that somehow still carries the file.
import { canonicalPackId } from '../../../../engine/pack_loader/renamed-packs.mjs';

const DECLARATION = '.claudinite-checks.json';
// Matched through the rename map: the pack was called `sheepdog` when this record
// landed, and an enforcer's declaration converges onto the current id on its own
// schedule.
const PACK = 'claudinite-fleet-sheepdog';

export default {
  id: 'fleet-baseline-task',
  landed: '2026-08-11',
  version: 1,
  summary: 'fleet-baseline converted from a standalone workflow to a manual-frequency sheepdog task; the enforcer\'s .github/workflows/fleet-baseline.yml copy is retired',

  // Same gate as the record that installed the file: does this repo declare the
  // sheepdog pack. An unreadable declaration means "not an enforcer as far as this
  // record can tell" — skip, never guess.
  appliesTo: async (read) => {
    const text = await read(DECLARATION);
    if (!text) return false;
    let cfg;
    try { cfg = JSON.parse(text); } catch { return false; }
    return (Array.isArray(cfg?.packs) ? cfg.packs : [])
      .some((e) => canonicalPackId(typeof e === 'string' ? e : e?.id) === PACK);
  },

  legacyPresent: async (exists) => exists('.github/workflows/fleet-baseline.yml'),
};
