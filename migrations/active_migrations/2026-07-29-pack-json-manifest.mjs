// A pack manifest is JSON (#564): `packs/<name>/pack.json`, validated against
// `engine/pack_loader/pack.schema.json`, with the code a pack genuinely needs in
// sibling modules the JSON names by filename (`detect.mjs`, `env.mjs`,
// `contributed-rules`, and the rule modules themselves).
//
// Canon-side the conversion is complete — all 27 canon packs and the home's two
// local packs. Member-side there is nothing MECHANICAL to do: no consumer path is
// renamed, no consumer config is rewritten, and the whole vendored corpus arrives
// converted through the ordinary nightly refresh.
//
// What the fleet still holds is the shape itself. Every member repo authors its
// own local packs under `.claudinite/local/packs/<name>/`, and those are
// consumer-owned files nothing here can rewrite — the `pack.mjs` case in
// `engine/pack_loader/pack-registry.mjs` reads them, and this record's telemetry
// is what says when the last one is gone. That tolerance is INLINE in the loader
// (there is no `resolvePath` seam to route it through), so:
//
//   retire: 'manual' — drop this record in the same change that deletes the
//   `pack.mjs` branch from the registry, once `legacyPresent` reports nobody.
export default {
  id: 'pack-json-manifest',
  landed: '2026-07-29',
  summary: 'a pack manifest is pack.json validated against pack.schema.json, with code in sibling modules named by filename; the engine reads the legacy pack.mjs module while consumer-held local packs convert',
  // A member is a holdout while any of its own packs still declares itself as a
  // module. Both local-pack roots are probed (the .claudinite/local/packs rename
  // is its own in-flight migration), and a directory carrying BOTH counts as a
  // holdout: the loader resolves it to the JSON, but the leftover module is still
  // there to delete.
  legacyPresent: async (exists, read) => {
    const raw = await read('.claudinite-checks.json');
    if (raw == null) return false;
    let packs;
    try { ({ packs } = JSON.parse(raw)); } catch { return false; }
    if (!Array.isArray(packs)) return false;
    for (const entry of packs) {
      const declared = typeof entry === 'string' ? entry : entry?.id;
      if (typeof declared !== 'string') continue;
      const id = declared.replace(/^local(_packs)?\//, '');
      for (const root of ['.claudinite/local/packs', '.claudinite/local_packs']) {
        if (await exists(`${root}/${id}/pack.mjs`)) return true;
      }
    }
    return false;
  },
  retire: 'manual',
  // The one-time conversion of a member's OWN packs. Deterministic preprocessing
  // cannot do it — a local pack's manifest is arbitrary JavaScript, and what a
  // `detect` closure or an `env` fragment must become depends on what it does —
  // so this escalates to the agent stage (agent-preprocessing DESIGN §7).
  agentic: {
    model: 'sonnet',
    instructions: [
      'For each of this repo\'s own local packs (.claudinite/local/packs/<name>/, or the pre-rename .claudinite/local_packs/<name>/) that still has a pack.mjs, convert it to pack.json and delete the module. A repo with no local packs, or whose local packs already carry pack.json, needs nothing — say so and stop.',
      'The schema is .claudinite/shared/engine/pack_loader/pack.schema.json; point the new file\'s "$schema" at it by relative path and follow the schema\'s own property order.',
      'Pure data fields (id, ruleRoutingGuidance, badge, marker, prose, seededByDefault, requires, questions, skills) copy across unchanged.',
      'worldRules and workRules become arrays of FILENAMES ("my-rule.mjs") instead of imported bindings — the same modules, named rather than imported. Keep each rule in the same list it was in: the list is the rule\'s scope.',
      'contributes becomes { "<pack-id>": ["<module>.mjs"] }, each named module default-exporting the contribution data. If the old manifest carried the contribution inline as an object literal, move that object into its own module with an `export default`.',
      'EVERY .mjs at the pack root must be accounted for or the loader reports it: rules go in a scope list, and anything that is not a rule (a shared library, a hook entry point) goes in "helpers". Test files (*.test.mjs) are excluded.',
      'A `detect` function becomes DATA where it can: { "trackedPath": { ... } } with is / endsWith / basename / matches / maxDepth (all the declared matchers must hold of the same path; { "basename": ..., "maxDepth": 2 } is the near-root idiom). Only when the fingerprint reads file CONTENT or parses another file, move the function into a detect.mjs sibling with an `export default` and name it: "detect": "detect.mjs". A null detect stays null.',
      'An `env` block whose setup and probe are fixed strings stays inline (a multi-line install may be written as an array of lines, which the loader joins). If either is a FUNCTION of the pack\'s config, move the whole block into env.mjs with an `export default` and set "env": "env.mjs".',
      'Then verify: run the repo\'s Stop-hook checks (or engine/checks/check_the_world.mjs) and confirm the loader reports no manifest faults for the converted packs before finishing.',
    ].join('\n'),
  },
};
