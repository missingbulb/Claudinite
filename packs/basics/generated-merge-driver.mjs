import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';

export default patternRule({
  id: 'generated-merge-driver',
  severity: 'advisory',
  description: 'A GENERATED file needs a .gitattributes merge=ours entry',
  doc: 'skills/engineering-practices/SKILL.md',
  why: 'without merge=ours a conflicting merge on a generated file gets hand-resolved and desyncs from its source',
  coveredByGlobLine: [{
    eachPathMatching: /(?<base>[^/]*GENERATED[^/]*)$/,
    includeVendored: true,
    globFile: '.gitattributes',
    globLineMatching: /\bmerge=ours\b/,
    what: 'a GENERATED file with no merge=ours .gitattributes entry',
    fix: 'add `{base} merge=ours` to .gitattributes (plus a one-time `git config merge.ours.driver true`) so a conflicting merge auto-resolves',
  }],
});
