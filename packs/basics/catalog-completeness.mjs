import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';

export default patternRule({
  id: 'catalog-completeness',
  severity: 'blocking',
  description: 'packs/README.md lists every packs/<name>/',
  doc: 'packs/README.md',
  why: 'a hand-maintained catalog that omits a real pack misroutes readers and hides capability; the check keeps the index honest against the tree',
  relevantWhen: { trackedFileMatches: /^engine\/pack_loader\/pack-registry\.mjs$/ },
  listedInFile: [{
    eachTrackedPathMatching: /^packs\/(?<name>[^/]+)\/pack\.mjs$/,
    listFile: 'packs/README.md',
    asText: '({name}/',
    what: 'the pack "{name}" exists on disk but is not listed in packs/README.md',
    fix: 'add a "{name}" entry to packs/README.md (or delete the pack if it is dead)',
  }],
});
