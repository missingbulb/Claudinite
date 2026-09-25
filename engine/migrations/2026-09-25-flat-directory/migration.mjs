// The rules and skills indexes move into `.claudinite/flat/` beside the flat task and
// dashboard files (#2322). The move itself is the converge's: both indexes are
// regenerated wholesale from the declaration, `convergeWiring` removes an old one
// once its replacement is written, and it rewrites the CLAUDE.md import where it
// stands. This record declares the two old paths as the legacy shape, so a reader
// resolving an index finds it at either, and moves a stray old index when the
// converge has not yet written the new one.
//
// THE VERSION IS PAST THE LAST RELEASE on purpose: the engine release that carries
// this change is cut after it lands, at a date-anchored version no earlier than the
// landing day, so this value keeps the record in range for a member's first converge
// onto that release and out of range after it.
export default {
  id: 'flat-directory',
  landed: '2026-09-25',
  version: '60925.1',
  summary: 'the rules and skills indexes move into .claudinite/flat/, beside the flat task and dashboard files',

  aliases: [
    { canonical: '.claudinite/flat/claudinite-rules.GENERATED.md', legacy: ['.claudinite/claudinite-rules.GENERATED.md'] },
    { canonical: '.claudinite/flat/claudinite-skills.GENERATED.md', legacy: ['.claudinite/claudinite-skills.GENERATED.md'] },
  ],
  legacyPresent: async (exists) => (await exists('.claudinite/claudinite-rules.GENERATED.md'))
    || exists('.claudinite/claudinite-skills.GENERATED.md'),
};
