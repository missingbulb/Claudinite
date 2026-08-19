// The 2026-08-19 pack renames (#1022): `core` → `claudinite-lifecycle`, and
// `grow_with_claudinite` → `claudinite-growth`.
//
// This is an ENGINE record and not a pack one, for a structural reason: a pack
// record lives under `packs/<id>/migrations/`, which is precisely the directory
// this change renames — a record placed there would be addressed by an id that no
// longer exists in the canon and would ship to nobody. The engine flow also runs
// BEFORE the pack flow in one converge (the update worker orders them so a pack's
// `minEngineVersion` is judged against the engine the member has just received),
// which is exactly the order this change needs: the declaration is converged onto
// today's spelling first, and the pack flow then reads it and vendors the renamed
// trees under their new names in the same run.
//
// WHAT THIS RECORD IS NOT is the thing that makes the rename safe. Activation
// matches a declared id literally, so any window in which a member's declaration
// and its mount disagree is a window with NO pack — and for the pack carrying the
// `update` task that is unrecoverable, because the machinery that would deliver the
// repair is the machinery that went missing. The tolerance that closes every such
// window is `engine/pack_loader/renamed-packs.mjs`, which resolves both spellings
// at the loader. This record only converges the file so the tolerance can one day
// be retired; nothing depends on it having run.
//
// The mount directory is moved rather than left behind. The pack flow replaces a
// declared pack's tree wholesale but never removes a tree that has stopped being
// declared, so without the alias each member would keep a stale
// `.claudinite/shared/packs/core/` forever — a complete, loadable copy of the old
// pack sitting beside the new one. The move runs in the engine flow, before the
// pack flow vendors the new path, so the canonical side does not exist yet and the
// rename applies; the pack flow then overwrites the moved tree with current content.
export default {
  id: 'pack-renames',
  landed: '2026-08-19',
  version: 5,
  summary: 'packs renamed: core → claudinite-lifecycle, grow_with_claudinite → claudinite-growth (both legacy spellings still resolve at the loader)',

  aliases: [
    { canonical: '.claudinite/shared/packs/claudinite-lifecycle', legacy: ['.claudinite/shared/packs/core'] },
    { canonical: '.claudinite/shared/packs/claudinite-growth', legacy: ['.claudinite/shared/packs/grow_with_claudinite'] },
  ],

  // Anchored text edits, never a re-serialization: a round-trip through JSON.parse
  // would rewrite indentation, key order and escapes the member never asked to change.
  //
  // PRECISION OVER COMPLETENESS, deliberately. `core` is an ordinary word and an
  // ordinary directory name, so a pattern loose enough to catch every spelling would
  // also rewrite a member's own `{ "from": "core", "to": "ui/*" }` barrier rule and
  // silently unhook it. Each pattern below can only match the declaration's own
  // vocabulary: a `packVersions` key, an entry object's `id`, or an element of the
  // `packs` array itself. Anything this misses stays readable anyway — the loader
  // tolerance resolves both spellings — which is the trade this record is free to
  // make and a record without that tolerance behind it would not be.
  rewrite: [
    {
      file: '.claudinite-checks.json',
      replace: [
        // A stamped version's key.
        { pattern: /"core"(\s*:)/g, to: '"claudinite-lifecycle"$1' },
        { pattern: /"grow_with_claudinite"(\s*:)/g, to: '"claudinite-growth"$1' },
        // An entry object's id.
        { pattern: /("id"\s*:\s*)"core"/g, to: '$1"claudinite-lifecycle"' },
        { pattern: /("id"\s*:\s*)"grow_with_claudinite"/g, to: '$1"claudinite-growth"' },
        // A bare string element of `packs`, anchored on the array that holds it — a
        // pack is declared once, so one match per file is the whole real case.
        { pattern: /("packs"\s*:\s*\[(?:[^\]]*?,)?\s*)"core"(\s*[,\]])/g, to: '$1"claudinite-lifecycle"$2' },
        { pattern: /("packs"\s*:\s*\[(?:[^\]]*?,)?\s*)"grow_with_claudinite"(\s*[,\]])/g, to: '$1"claudinite-growth"$2' },
      ],
    },
  ],
};
